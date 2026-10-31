// GET /api/level?level=<id or gdladder.com / gdbrowser.com link> - look a level
// up before sending an edit, the way tools/add-records.py will:
//   {id, name, creator, difficulty, tier, rating, stars, platformer, onList, position}
// difficulty is the in-game one ("Extreme Demon"), tier the demon tier
// ("Extreme") or null for a non-demon, rating gdladder's (2 dp) or null,
// stars the in-game star count (0 = unrated in game; null when gdbrowser and
// what stands in for it can't say), platformer as add-records.py decides it,
// onList/position from the live data/demons.js (onList null if that couldn't
// be read). When gdbrowser doesn't answer, RobTop's own servers stand in for
// it (_lib/robtop.js), then GDHistory's copy (_lib/gdhistory.js), as in the
// tools.
// 400 for a bad level; 404 only when gdbrowser or RobTop's servers (or
// GDHistory, for a deleted level) say it isn't in the game - gdladder doesn't
// know unrated levels, so its "no" alone proves nothing; 502 when that couldn't
// be found out.
//
// Logged-in editors only, so this isn't an open proxy to gdladder, gdbrowser or
// RobTop's servers.

import { json, jsonError, missingEnv, notSetUp } from "../_lib/http.js";
import { currentEditor } from "../_lib/session.js";
import { Refuse, checkLevel } from "../_lib/contract.js";
import { HISTORY, fromHistory } from "../_lib/gdhistory.js";
import * as robtop from "../_lib/robtop.js";
import SITE from "../site.json";

const UA = `${SITE.name.replace(/[^A-Za-z0-9]/g, "")}/1.0 (+${SITE.url})`;

// [answered, parsed JSON object or null]
async function getJson(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (r.status === 404) return [true, null];
    if (!r.ok) return [false, null];
    const v = JSON.parse(await r.text()); // gdbrowser answers a missing level with -1
    return [true, v && typeof v === "object" && !Array.isArray(v) ? v : null];
  } catch {
    return [false, null];
  }
}

// The list as the site serves it right now: {levelId: position}, or null.
async function listedPositions(request, env) {
  if (!env.ASSETS) return null;
  try {
    const r = await env.ASSETS.fetch(new URL("/data/demons.js", request.url));
    if (!r.ok) return null;
    const src = await r.text();
    const i = src.indexOf("window.DEMONS =");
    if (i < 0) return null;
    const demons = JSON.parse(src.slice(i + "window.DEMONS =".length).trim().replace(/;\s*$/, ""));
    return new Map(demons.map((d) => [Number(d.levelId), d.position]));
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  const missing = missingEnv(env, ["SESSION_SECRET"]);
  if (missing) return notSetUp(missing);
  if (!(await currentEditor(request, env))) return jsonError(401, "not logged in");
  let id;
  try {
    id = checkLevel(new URL(request.url).searchParams.get("level") ?? "");
  } catch (e) {
    if (e instanceof Refuse) return jsonError(400, e.message);
    throw e;
  }

  const [[glOk, glRaw], [gbOk, gbRaw], listed] = await Promise.all([
    getJson(`https://gdladder.com/api/levels/${id}`),
    getJson(`https://gdbrowser.com/api/level/${id}`),
    listedPositions(request, env),
  ]);
  const gl = glRaw && glRaw.ID ? glRaw : {};
  let gb = gbRaw && gbRaw.name ? gbRaw : {};
  // whether "no name" means the level isn't in the game, and who said so
  let known = gbOk, deleted = false, said = "gdbrowser";
  if (!gbOk) { // RobTop's servers, then GDHistory
    const rt = robtop.parse(id, await robtop.ask(id));
    if (rt === -1) {
      known = true;
      said = "the Geometry Dash servers";
    } else if (rt) {
      gb = rt;
      known = true;
    } else {
      const [hOk, hRaw] = await getJson(`${HISTORY}${id}/`);
      const h = hOk ? fromHistory(id, hRaw) : null;
      if (h === -1) known = deleted = true;
      else if (h) {
        gb = h;
        known = true;
      }
    }
  }
  const meta = gl.Meta || {};
  const name = gb.name || meta.Name;
  if (!name) {
    if (deleted) return jsonError(404, `level ${id} was deleted from Geometry Dash`);
    if (known) return jsonError(404, `level ${id} isn't on gdladder or ${said}`);
    return jsonError(502, glOk
      ? `gdladder doesn't know level ${id} and gdbrowser didn't answer, nor did the Geometry Dash servers or GDHistory - check the id, or try again in a minute`
      : "gdladder and gdbrowser didn't answer, nor did the Geometry Dash servers or GDHistory - try again in a minute");
  }
  // same rules as fetch_level() in tools/add-records.py
  const difficulty = gb.difficulty || `${meta.Difficulty || "?"} Demon`;
  const tier = difficulty.endsWith(" Demon") ? difficulty.slice(0, -" Demon".length) : null;
  const platformer = meta.Length === 6 || String(gb.length || "").toLowerCase().startsWith("plat");
  const rating = typeof gl.Rating === "number" ? Math.round(gl.Rating * 100) / 100 : null;
  const position = listed ? listed.get(id) ?? null : null;
  return json({
    id,
    name: String(name).trim(),
    creator: gb.author || (meta.Publisher && meta.Publisher.name) || "Unknown",
    difficulty,
    tier,
    rating,
    stars: typeof gb.stars === "number" ? gb.stars : null, // Rated+: an unrated level has 0
    platformer,
    onList: listed ? position !== null : null,
    position,
  });
}

// Offline tests for the mod page's Cloudflare Pages Functions (functions/).
//
//     node tools/test-functions.mjs
//
// Needs Node 22.15+ (Web Crypto, fetch, module.registerHooks). Runs the real
// handler files with a fake Pages context and a stubbed fetch, so nothing
// reaches Discord or GitHub. When python is on PATH it also feeds the same edit
// cases to validate() in tools/apply-edit.py and checks both sides agree.

import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Cloudflare's bundler imports a .json file as its parsed value; Node wants an
// import attribute for that, so load JSON as a module exporting the value.
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fn = (p) => import(new URL("../functions/" + p, import.meta.url));
const EDITORS = (await fn("editors.json")).default;
const session = await fn("_lib/session.js");
const contract = await fn("_lib/contract.js");
const http = await fn("_lib/http.js");
const api = {
  login: await fn("api/login.js"),
  callback: await fn("api/callback.js"),
  me: await fn("api/me.js"),
  logout: await fn("api/logout.js"),
  edit: await fn("api/edit.js"),
  status: await fn("api/status.js"),
  level: await fn("api/level.js"),
  mods: await fn("api/mods.js"),
};

let passed = 0, failed = 0;
function check(what, ok, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}${detail ? "  -- " + detail : ""}`);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- fakes ----------------------------------------------------------------------

const SITE = (await fn("site.json")).default;
const ORIGIN = SITE.url;
const SECRET = "x".repeat(40);
const ENV = {
  DISCORD_CLIENT_ID: "1234567890",
  DISCORD_CLIENT_SECRET: "discord-secret",
  SESSION_SECRET: SECRET,
  GITHUB_TOKEN: "github_pat_test",
  ASSETS: {
    async fetch(u) {
      const p = new URL(u).pathname;
      try {
        return new Response(readFileSync(path.join(ROOT, p)), { status: 200 });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  },
};

function req(pathAndQuery, { method = "GET", headers = {}, body } = {}) {
  return new Request(ORIGIN + pathAndQuery, { method, headers, body });
}
const ctx = (request, env = ENV) => ({ request, env, params: {}, data: {}, waitUntil() {}, next() {} });

// fetch stub: routes[i] = [method, url prefix, handler(url, init) -> Response]
let calls = [];
function stubFetch(routes) {
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input), method = (init.method || "GET").toUpperCase();
    calls.push({ url, method, init });
    for (const [m, prefix, h] of routes) if (m === method && url.startsWith(prefix)) return h(url, init);
    throw new TypeError(`fetch failed (no stub for ${method} ${url})`);
  };
}
const jsonResp = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

const setCookies = (r) => r.headers.getSetCookie();
const cookieValue = (r, name) => {
  for (const c of setCookies(r)) if (c.startsWith(name + "=")) return c.slice(name.length + 1).split(";")[0];
  return null;
};

EDITORS["111111111111111111"] = "Nigel";
EDITORS["222222222222222222"] = "Dihmaster500";
EDITORS["333333333333333333"] = "bad<name>";
EDITORS["444444444444444444"] = { name: "ace", role: "mod" };
EDITORS["666666666666666666"] = { name: "Odd", role: "admin" };
const aceCookie = `${session.SESSION_COOKIE}=${await session.makeSession(SECRET, "444444444444444444", "ace")}`;
const nigelCookie = `${session.SESSION_COOKIE}=${await session.makeSession(SECRET, "111111111111111111", "Nigel")}`;
// the real owner (contract.js OWNER_ID, in the real editors.json); "Nigel" above is a head mod who isn't
const ownerCookie = `${session.SESSION_COOKIE}=${await session.makeSession(SECRET, contract.OWNER_ID, "Nigel")}`;

// --- sessions -------------------------------------------------------------------

{
  const v = await session.makeSession(SECRET, "111111111111111111", "Nigel");
  const s = await session.readSession(SECRET, v);
  check("session round-trips", s && s.id === "111111111111111111" && s.name === "Nigel" && s.exp > Date.now() / 1000 + 6.9 * 86400);
  check("session: wrong secret", (await session.readSession("y".repeat(40), v)) === null);
  const [body, sig] = v.split(".");
  const forged = Buffer.from(JSON.stringify({ id: "999", name: "Evil", exp: 9999999999 })).toString("base64url");
  check("session: swapped body", (await session.readSession(SECRET, forged + "." + sig)) === null);
  const flip = sig[0] === "A" ? "B" : "A";
  check("session: flipped signature", (await session.readSession(SECRET, body + "." + flip + sig.slice(1))) === null);
  check("session: no signature", (await session.readSession(SECRET, body)) === null);
  check("session: garbage", (await session.readSession(SECRET, "..")) === null && (await session.readSession(SECRET, null)) === null);
  const old = await session.makeSession(SECRET, "111111111111111111", "Nigel", -5);
  check("session: expired", (await session.readSession(SECRET, old)) === null);
  const st = await session.makeState(SECRET, "a".repeat(32));
  check("state round-trips", (await session.readState(SECRET, st)) === "a".repeat(32));
  check("state can't pass as a session", (await session.readSession(SECRET, st)) === null);
  check("session can't pass as a state", (await session.readState(SECRET, v)) === null);
  check("state: expired", (await session.readState(SECRET, await session.makeState(SECRET, "a".repeat(32), -1))) === null);
  check("editorFor: ok (a bare name is a head mod)", eq(session.editorFor("111111111111111111"), { name: "Nigel", role: "head" }));
  check("editorFor: {name, role} mod", eq(session.editorFor("444444444444444444"), { name: "ace", role: "mod" }));
  check("editorFor: unknown role is broken", !!(session.editorFor("666666666666666666") || {}).bad);
  check("editorFor: absent", session.editorFor("444") === null && session.editorFor("constructor") === null && session.editorFor("__proto__") === null);
  check("editorFor: broken entry", !!(session.editorFor("333333333333333333") || {}).bad);
}

// --- the edit contract ------------------------------------------------------------

// [label, ops, expected: "ok" | substring of the refusal | {js, py} when the two differ on purpose]
const CASES = [
  ["valid batch", [
    { op: "add_member", name: "Tëster", nationality: "DE" },
    { op: "add_record", player: "Newbie", level: "https://gdladder.com/level/86084399", progress: 100, nationality: "FR" },
    { op: "add_record", player: "ace", level: "86084399", progress: 60 },
    { op: "remove_record", player: "ace", level: 86084399 },
    { op: "set_grind", player: "Nigel", level: "https://gdbrowser.com/level/12345", best: null, segments: [[10, 50], [40, 100]], note: "  close!  " },
  ], "ok"],
  ["valid batch 2", [
    { op: "remove_grind", player: "Jesus", level: "https://www.gdbrowser.com/12345/" },
    { op: "set_record_video", player: "ace", level: 1, url: "https://youtu.be/abcdefghijk" },
    { op: "set_record_video", player: "ace", level: 1, url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view" },
    { op: "set_record_video", player: "ace", level: 1, url: "HTTPS://WWW.YouTube.com/watch?v=xmchFBTzwds" },
    { op: "remove_record_video", player: "ace", level: 2147483647 },
    { op: "refresh_order" },
    { op: "set_grind", player: "ace", level: 5, best: 0, segments: [[0, 1]], note: "" },
    { op: "add_member", name: "Ab.c_d-e 9", nationality: "GB" },
    { op: "add_member", name: "Ангел", nationality: "RU" },
    { op: "add_member", name: "éx", nationality: "US" },
  ], "ok"],
  ["bad name <>", [{ op: "add_member", name: "<>", nationality: "US" }], "can only use letters"],
  ["country XX", [{ op: "add_member", name: "A", nationality: "XX" }], "isn't a country code"],
  ["country lowercase", [{ op: "add_member", name: "A", nationality: "us" }], "isn't a country code"],
  ["country XK", [{ op: "add_member", name: "A", nationality: "XK" }], "isn't a country code"],
  ["unknown op", [{ op: "delete_everything" }], "unknown edit"],
  ["op not an object", ["refresh_order"], "unknown edit"],
  ["unknown field", [{ op: "refresh_order", force: true }], "unknown field"],
  ["missing field", [{ op: "add_record", player: "A", level: 1 }], "missing progress"],
  ["11 ops", Array(11).fill({ op: "refresh_order" }), "1 to 10"],
  ["0 ops", [], "1 to 10"],
  ["run 50-40", [{ op: "set_grind", player: "A", level: 1, best: null, segments: [[50, 40]] }], "must be [from, to]"],
  ["run 3 numbers", [{ op: "set_grind", player: "A", level: 1, best: null, segments: [[1, 2, 3]] }], "must be [from, to]"],
  ["run 101", [{ op: "set_grind", player: "A", level: 1, best: null, segments: [[0, 101]] }], "must be [from, to]"],
  ["21 runs", [{ op: "set_grind", player: "A", level: 1, best: null, segments: Array(21).fill([1, 2]) }], "at most 20"],
  ["best 101", [{ op: "set_grind", player: "A", level: 1, best: 101, segments: [] }], "whole number from 0 to 100"],
  ["look-alike host", [{ op: "set_record_video", player: "A", level: 1, url: "https://evil.com/youtube.com" }], "must be an https link"],
  ["subdomain host", [{ op: "set_record_video", player: "A", level: 1, url: "https://youtube.com.evil.com/x" }], "must be an https link"],
  ["http link", [{ op: "set_record_video", player: "A", level: 1, url: "http://youtube.com/watch?v=x" }], "must be an https link"],
  ["m.youtube.com", [{ op: "set_record_video", player: "A", level: 1, url: "https://m.youtube.com/watch?v=x" }], "must be an https link"],
  ["userinfo", [{ op: "set_record_video", player: "A", level: 1, url: "https://me@youtube.com/x" }], "must be an https link"],
  ["port", [{ op: "set_record_video", player: "A", level: 1, url: "https://youtube.com:8443/x" }], "must be an https link"],
  ["one slash", [{ op: "set_record_video", player: "A", level: 1, url: "https:/youtube.com/x" }], "must be an https link"],
  ["space in link", [{ op: "set_record_video", player: "A", level: 1, url: "https://youtube.com/a b" }], "isn't a link"],
  ["empty userinfo", [{ op: "set_record_video", player: "A", level: 1, url: "https://@youtube.com/x" }], { js: "must be an https link", py: "must be an https link" }],
  ["example.com level", [{ op: "remove_record", player: "A", level: "https://example.com/level/5" }], "isn't a level id"],
  ["level 0", [{ op: "remove_record", player: "A", level: 0 }], "isn't a real level id"],
  ["level 2^31", [{ op: "remove_record", player: "A", level: "2147483648" }], "isn't a real level id"],
  ["level float", [{ op: "remove_record", player: "A", level: 1.5 }], "isn't a level id"],
  ["level bool", [{ op: "remove_record", player: "A", level: true }], "isn't a level id"],
  ["progress true", [{ op: "add_record", player: "A", level: 1, progress: true }], "whole number from 1 to 100"],
  ["progress 0", [{ op: "add_record", player: "A", level: 1, progress: 0 }], "whole number from 1 to 100"],
  ["progress 50.5", [{ op: "add_record", player: "A", level: 1, progress: 50.5 }], "whole number from 1 to 100"],
  ["progress '50'", [{ op: "add_record", player: "A", level: 1, progress: "50" }], "whole number from 1 to 100"],
  ["141-char note", [{ op: "set_grind", player: "A", level: 1, best: null, segments: [], note: "n".repeat(141) }], "at most 140"],
  ["140 emoji note", [{ op: "set_grind", player: "A", level: 1, best: null, segments: [], note: "\u{1F600}".repeat(140) }], "ok"],
  ["newline in note", [{ op: "set_grind", player: "A", level: 1, best: null, segments: [], note: "a\nb" }], "plain text on one line"],
  ["zero-width in note", [{ op: "set_grind", player: "A", level: 1, best: null, segments: [], note: "a​b" }], "plain text on one line"],
  ["name too long", [{ op: "add_member", name: "a".repeat(33), nationality: "US" }], "1-32 characters"],
  ["name empty", [{ op: "add_member", name: "", nationality: "US" }], "1-32 characters"],
  ["name spaces", [{ op: "add_member", name: " a", nationality: "US" }], "extra spaces"],
  ["name double space", [{ op: "add_member", name: "a  b", nationality: "US" }], "extra spaces"],
  ["name number", [{ op: "add_member", name: 5, nationality: "US" }], "must be text"],
  ["shell in name", [{ op: "add_member", name: "$(rm -rf /)", nationality: "US" }], "can only use letters"],
  ["state", [{ op: "add_member", name: "Statey", nationality: "US", subdivision: "IL" }, { op: "set_member_country", name: "Statey", nationality: "CA", subdivision: "ON" }, { op: "add_record", player: "Statey2", level: 1, progress: 100, nationality: "US", subdivision: "TX" }], "ok"],
  ["state: lower case", [{ op: "add_member", name: "Statey", nationality: "US", subdivision: "il" }], "isn't a subdivision code"],
  ["state: full code", [{ op: "add_member", name: "Statey", nationality: "US", subdivision: "US-IL" }], "isn't a subdivision code"],
  ["state: on a remove", [{ op: "remove_member", name: "Statey", subdivision: "IL" }], "unknown field"],
  ["mod team", [{ op: "set_mod", discordId: "166314559630475264", name: "ace", role: "head" }, { op: "remove_mod", discordId: "12345678901234567" }], "ok"],
  ["mod: id as a number", [{ op: "set_mod", discordId: 166314559630475264, name: "ace", role: "mod" }], "must be the 17-20 digit number"],
  ["mod: short id", [{ op: "set_mod", discordId: "1234", name: "ace", role: "mod" }], "must be the 17-20 digit number"],
  ["mod: id with letters", [{ op: "remove_mod", discordId: "16631455963047abc" }], "must be the 17-20 digit number"],
  ["mod: unknown rank", [{ op: "set_mod", discordId: "166314559630475264", name: "ace", role: "owner" }], 'must be "head" or "mod"'],
  ["mod: bad name", [{ op: "set_mod", discordId: "166314559630475264", name: "<x>", role: "mod" }], "can only use letters"],
  ["mod: no id", [{ op: "remove_mod" }], "missing discordId"],
  ["role on another edit", [{ op: "refresh_order", role: "head" }], "unknown field"],
  // Rated+: the unrated levels (head mods)
  ["unrated: valid batch", [
    { op: "add_unrated", level: "https://gdbrowser.com/level/99999999", rating: 31.25, difficulty: "Extreme", placeBelow: 79997992, showcase: "https://youtu.be/abcdefghijk" },
    { op: "add_unrated", level: 5, rating: 20 },
    { op: "set_unrated", level: 5, placeBelow: null },
    { op: "set_unrated", level: 5, rating: 18, difficulty: "Insane", placeBelow: 0, showcase: null },
    { op: "remove_unrated", level: "5" },
  ], "ok"],
  ["unrated: rating 0", [{ op: "add_unrated", level: 5, rating: 0 }], "GDDL estimate must be"],
  ["unrated: rating 51", [{ op: "add_unrated", level: 5, rating: 51 }], "GDDL estimate must be"],
  ["unrated: rating 31.125", [{ op: "add_unrated", level: 5, rating: 31.125 }], "GDDL estimate must be"],
  ["unrated: rating '31'", [{ op: "add_unrated", level: 5, rating: "31" }], "GDDL estimate must be"],
  ["unrated: rating true", [{ op: "set_unrated", level: 5, rating: true }], "GDDL estimate must be"],
  ["unrated: rating 31.1 (float noise)", [{ op: "set_unrated", level: 5, rating: 31.1 }], "ok"],
  ["unrated: tier Hard", [{ op: "add_unrated", level: 5, rating: 20, difficulty: "Hard" }], 'must be "Extreme" or "Insane"'],
  ["unrated: placeBelow -1", [{ op: "add_unrated", level: 5, rating: 20, placeBelow: -1 }], "placeBelow must be"],
  ["unrated: placeBelow 1.5", [{ op: "set_unrated", level: 5, placeBelow: 1.5 }], "placeBelow must be"],
  ["unrated: placeBelow '5'", [{ op: "set_unrated", level: 5, placeBelow: "5" }], "placeBelow must be"],
  ["unrated: placeBelow true", [{ op: "set_unrated", level: 5, placeBelow: true }], "placeBelow must be"],
  ["unrated: showcase on Drive", [{ op: "set_unrated", level: 5, showcase: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view" }], "must be a link to one YouTube video"],
  ["unrated: showcase a channel", [{ op: "set_unrated", level: 5, showcase: "https://www.youtube.com/@nigelx1" }], "must be a link to one YouTube video"],
  ["unrated: showcase look-alike", [{ op: "set_unrated", level: 5, showcase: "https://youtube.com.evil.com/watch?v=abcdefghijk" }], "must be a link to one YouTube video"],
  ["unrated: showcase http", [{ op: "set_unrated", level: 5, showcase: "http://youtu.be/abcdefghijk" }], "must be a link to one YouTube video"],
  ["unrated: nothing to change", [{ op: "set_unrated", level: 5 }], "nothing to change"],
  ["unrated: no rating", [{ op: "add_unrated", level: 5 }], "missing rating"],
  ["unrated: rating on a remove", [{ op: "remove_unrated", level: 5, rating: 20 }], "unknown field"],
  ["unrated: tier on a clear", [{ op: "add_record", player: "A", level: 5, progress: 100, difficulty: "Extreme" }], "unknown field"],
  // the mod page's batches for a level that's unrated in game: on Rated+ with its first clear or Grind goal
  ["unrated: on Rated+ with its first clear", [
    { op: "add_unrated", level: 99999999, rating: 31.25, difficulty: "Extreme", showcase: "https://youtu.be/abcdefghijk" },
    { op: "add_record", player: "Nigel", level: 99999999, progress: 76 },
  ], "ok"],
  ["unrated: on Rated+ with a Grind goal", [
    { op: "add_unrated", level: 99999999, rating: 15, difficulty: "Insane", placeBelow: 0 },
    { op: "set_grind", player: "Nigel", level: 99999999, best: 40, segments: [[50, 100]] },
  ], "ok"],
];

{
  const js = CASES.map(([, ops]) => {
    try {
      return { ok: contract.validateOps(ops) };
    } catch (e) {
      if (!(e instanceof contract.Refuse)) throw e;
      return { err: e.message };
    }
  });
  CASES.forEach(([label, , want], i) => {
    const w = typeof want === "object" ? want.js : want;
    const r = js[i];
    check(`contract (js): ${label}`, w === "ok" ? !!r.ok : !!r.err && r.err.includes(w), JSON.stringify(r).slice(0, 200));
  });
  const ok0 = js[0].ok;
  check("contract: normalises", ok0 && ok0[0].name === "Tëster".normalize("NFC") && ok0[1].level === 86084399
    && ok0[2].level === 86084399 && ok0[4].level === 12345 && ok0[4].note === "close!", JSON.stringify(ok0));
  check("contract: NFC names", js[1].ok && js[1].ok[9].name === "éx");
  const un = js[CASES.findIndex(([label]) => label === "unrated: valid batch")].ok;
  check("contract: unrated ops normalised, fields in order", un && eq(un, [
    { op: "add_unrated", level: 99999999, rating: 31.25, difficulty: "Extreme", placeBelow: 79997992, showcase: "https://youtu.be/abcdefghijk" },
    { op: "add_unrated", level: 5, rating: 20 },
    { op: "set_unrated", level: 5, placeBelow: null },
    { op: "set_unrated", level: 5, rating: 18, difficulty: "Insane", placeBelow: 0, showcase: null },
    { op: "remove_unrated", level: 5 },
  ]), JSON.stringify(un));
  const noise = js[CASES.findIndex(([label]) => label === "unrated: rating 31.1 (float noise)")].ok;
  check("contract: an estimate is rounded to 2 decimals", noise && noise[0].rating === 31.1, JSON.stringify(noise));

  // the same cases through apply-edit.py's validate()
  const PY = `
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("apply_edit", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = []
for ops in json.load(sys.stdin):
    try:
        out.append({"ok": m.validate({"requestId": "0" * 16, "editor": "Nigel", "role": "head", "owner": True, "ops": ops})["ops"]})
    except m.Refuse as e:
        out.append({"err": str(e)})
print(json.dumps(out))
`;
  const py = spawnSync("python", ["-c", PY, path.join(ROOT, "tools", "apply-edit.py")], {
    input: JSON.stringify(CASES.map(([, ops]) => ops)), encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1" },
  });
  if (py.status !== 0) {
    console.log("(python not available or apply-edit.py failed - skipping the cross-check)\n" + (py.stderr || "").slice(0, 500));
  } else {
    const pyr = JSON.parse(py.stdout);
    CASES.forEach(([label, , want], i) => {
      const w = typeof want === "object" ? want.py : want;
      const r = pyr[i];
      check(`contract (py): ${label}`, w === "ok" ? !!r.ok : !!r.err && r.err.includes(w), JSON.stringify(r).slice(0, 200));
      if (r.ok && js[i].ok) check(`contract: same normalised ops: ${label}`, eq(r.ok, js[i].ok), JSON.stringify([r.ok, js[i].ok]).slice(0, 300));
    });
  }
  let e = null;
  try { contract.validateEditBody({ ops: [{ op: "refresh_order" }], editor: "ace" }); } catch (x) { e = x.message; }
  check("contract: extra body field (editor can't be sent)", e && e.includes("unknown field"), e);
  e = null;
  try { contract.validateEditBody([{ op: "refresh_order" }]); } catch (x) { e = x.message; }
  check("contract: body must be an object", e && e.includes("isn't a JSON object"), e);
}

// --- helpers ----------------------------------------------------------------------

{
  for (const bad of ["//evil.com/x", "https://evil.com/", "/\\evil.com", "\\\\evil.com"]) {
    const r = http.redirect(req("/api/callback"), bad);
    check(`redirect stays on site: ${bad}`, r.status === 303 && r.headers.get("Location") === "/admin/", r.headers.get("Location"));
  }
  check("redirect: keeps query", http.redirect(req("/x"), "/admin/?denied=1&user=a%20b").headers.get("Location") === "/admin/?denied=1&user=a%20b");
  check("missingEnv: short secret", (http.missingEnv({ SESSION_SECRET: "short" }, ["SESSION_SECRET"]) || "").startsWith("SESSION_SECRET"));
  check("missingEnv: ok", http.missingEnv(ENV, ["SESSION_SECRET", "GITHUB_TOKEN"]) === null);
}

// --- GET /api/login ------------------------------------------------------------------

let stateValue, stateCookieValue;
{
  const r0 = await api.login.onRequestGet(ctx(req("/api/login"), { ...ENV, DISCORD_CLIENT_ID: "" }));
  check("login: 503 when DISCORD_CLIENT_ID is missing", r0.status === 503 && (await r0.text()).includes("DISCORD_CLIENT_ID is missing"));
  const r = await api.login.onRequestGet(ctx(req("/api/login")));
  const loc = new URL(r.headers.get("Location"));
  stateValue = loc.searchParams.get("state");
  stateCookieValue = cookieValue(r, session.STATE_COOKIE);
  check("login: redirects to Discord", r.status === 303 && loc.origin + loc.pathname === "https://discord.com/oauth2/authorize");
  check("login: query", loc.searchParams.get("client_id") === ENV.DISCORD_CLIENT_ID && loc.searchParams.get("response_type") === "code"
    && loc.searchParams.get("scope") === "identify" && loc.searchParams.get("redirect_uri") === ORIGIN + "/api/callback"
    && /^[0-9a-f]{32}$/.test(stateValue), loc.search);
  const sc = setCookies(r)[0] || "";
  check("login: state cookie", (await session.readState(SECRET, stateCookieValue)) === stateValue
    && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\//.test(sc) && /Max-Age=600/.test(sc), sc);
}

// --- GET /api/callback ---------------------------------------------------------------

async function callback(query, { cookie = `${session.STATE_COOKIE}=${stateCookieValue}`, user = { id: "111111111111111111", username: "nigelx1" }, tokenStatus = 200 } = {}) {
  stubFetch([
    ["POST", "https://discord.com/api/oauth2/token", () => jsonResp(tokenStatus === 200 ? { access_token: "tok", token_type: "Bearer" } : { error: "invalid_grant" }, tokenStatus)],
    ["GET", "https://discord.com/api/users/@me", () => jsonResp(user)],
  ]);
  return api.callback.onRequestGet(ctx(req("/api/callback" + query, { headers: { Cookie: cookie } })));
}
{
  let r = await callback(`?code=abc&state=${stateValue}`);
  const sess = cookieValue(r, session.SESSION_COOKIE);
  const s = await session.readSession(SECRET, sess);
  check("callback: editor gets a session", r.status === 303 && r.headers.get("Location") === "/admin/" && s && s.id === "111111111111111111" && s.name === "Nigel");
  const sc = setCookies(r).find((c) => c.startsWith(session.SESSION_COOKIE)) || "";
  check("callback: session cookie attributes", /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\//.test(sc) && /Max-Age=604800/.test(sc), sc);
  check("callback: state cookie cleared", setCookies(r).some((c) => c.startsWith(session.STATE_COOKIE + "=;") && /Max-Age=0/.test(c)));
  const tok = calls.find((c) => c.url === "https://discord.com/api/oauth2/token");
  const form = new URLSearchParams(String(tok.init.body));
  check("callback: token exchange", tok.init.headers["Content-Type"] === "application/x-www-form-urlencoded"
    && form.get("client_id") === ENV.DISCORD_CLIENT_ID && form.get("client_secret") === "discord-secret"
    && form.get("grant_type") === "authorization_code" && form.get("code") === "abc"
    && form.get("redirect_uri") === ORIGIN + "/api/callback", String(tok.init.body));
  const me = calls.find((c) => c.url === "https://discord.com/api/users/@me");
  check("callback: @me with the token", me && me.init.headers.Authorization === "Bearer tok");

  r = await callback(`?code=abc&state=${stateValue}`, { user: { id: "555555555555555555", username: "some one&x" } });
  const loc = new URL(r.headers.get("Location"), ORIGIN);
  check("callback: stranger is denied with id + username", loc.pathname === "/admin/" && loc.searchParams.get("denied") === "555555555555555555"
    && loc.searchParams.get("user") === "some one&x" && !cookieValue(r, session.SESSION_COOKIE), r.headers.get("Location"));
  r = await callback(`?code=abc&state=${"b".repeat(32)}`);
  check("callback: wrong state", r.headers.get("Location") === "/admin/?error=expired" && calls.length === 0);
  r = await callback(`?code=abc&state=${stateValue}`, { cookie: "" });
  check("callback: no state cookie", r.headers.get("Location") === "/admin/?error=expired");
  r = await callback(`?code=abc&state=${stateValue}`, { cookie: `${session.STATE_COOKIE}=${await session.makeState(SECRET, stateValue, -1)}` });
  check("callback: stale state", r.headers.get("Location") === "/admin/?error=expired");
  r = await callback(`?error=access_denied&state=${stateValue}`);
  check("callback: cancelled", r.headers.get("Location") === "/admin/?error=cancelled");
  r = await callback(`?code=abc&state=${stateValue}`, { tokenStatus: 400 });
  check("callback: bad code", r.headers.get("Location") === "/admin/?error=discord");
  r = await callback(`?code=abc&state=${stateValue}`, { user: { id: "333333333333333333", username: "x" } });
  check("callback: broken editors.json entry", r.headers.get("Location") === "/admin/?error=editor_name");
  stubFetch([]); // Discord down
  r = await api.callback.onRequestGet(ctx(req(`/api/callback?code=abc&state=${stateValue}`, { headers: { Cookie: `${session.STATE_COOKIE}=${stateCookieValue}` } })));
  check("callback: Discord unreachable", r.headers.get("Location") === "/admin/?error=discord");
  r = await api.callback.onRequestGet(ctx(req("/api/callback"), { ...ENV, DISCORD_CLIENT_SECRET: undefined }));
  check("callback: 503 when not set up", r.status === 503 && (await r.text()).includes("DISCORD_CLIENT_SECRET"));
}

// --- GET /api/me, /api/logout ------------------------------------------------------------

{
  let r = await api.me.onRequestGet(ctx(req("/api/me")));
  check("me: 401 without a session", r.status === 401 && (await r.json()).error === "not logged in");
  r = await api.me.onRequestGet(ctx(req("/api/me", { headers: { Cookie: `theme=dark; ${nigelCookie}` } })));
  check("me: {id, name, role, owner}", r.status === 200 && eq(await r.json(), { id: "111111111111111111", name: "Nigel", role: "head", owner: false }) && r.headers.get("Cache-Control") === "no-store");
  const mid = nigelCookie.length - 10, swap = nigelCookie[mid] === "A" ? "B" : "A";
  r = await api.me.onRequestGet(ctx(req("/api/me", { headers: { Cookie: nigelCookie.slice(0, mid) + swap + nigelCookie.slice(mid + 1) } })));
  check("me: tampered cookie", r.status === 401);
  // the last character carries 2 spare bits; a respelled signature is refused too
  const last = nigelCookie.at(-1), alt = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const respelled = nigelCookie.slice(0, -1) + alt[alt.indexOf(last) ^ 1];
  r = await api.me.onRequestGet(ctx(req("/api/me", { headers: { Cookie: respelled } })));
  check("me: respelled signature", r.status === 401);
  EDITORS["111111111111111111"] = "Nigelx1";
  r = await api.me.onRequestGet(ctx(req("/api/me", { headers: { Cookie: nigelCookie } })));
  check("me: name comes from editors.json now", (await r.json()).name === "Nigelx1");
  delete EDITORS["111111111111111111"];
  r = await api.me.onRequestGet(ctx(req("/api/me", { headers: { Cookie: nigelCookie } })));
  check("me: removed editor is logged out", r.status === 401);
  EDITORS["111111111111111111"] = "Nigel";
  r = api.logout.onRequest(ctx(req("/api/logout", { method: "POST" })));
  check("logout: clears the cookie", r.status === 303 && r.headers.get("Location") === "/admin/"
    && setCookies(r).some((c) => c.startsWith(session.SESSION_COOKIE + "=;") && /Max-Age=0/.test(c)));
}

// --- POST /api/edit -------------------------------------------------------------------------

function editReq(body, { cookie = nigelCookie, origin = ORIGIN, type = "application/json" } = {}) {
  const headers = { Cookie: cookie };
  if (origin !== null) headers.Origin = origin;
  if (type !== null) headers["Content-Type"] = type;
  return req("/api/edit", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}
const GH_DISPATCH = `https://api.github.com/repos/${SITE.repo}/dispatches`;

// --- head mods and mods ---------------------------------------------------------------------
{
  for (const op of [{ op: "add_member", name: "New", nationality: "US" }, { op: "remove_record", player: "ace", level: 1 }, { op: "refresh_order" }]) {
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const r = await api.edit.onRequestPost(ctx(editReq({ ops: [op] }, { cookie: aceCookie })));
    const out = await r.json();
    check(`roles: a mod can't ${op.op}`, r.status === 403 && /only head mods can/.test(out.error) && calls.length === 0, JSON.stringify(out));
  }
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  const r = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "set_grind", player: "ace", level: 1, best: 5, segments: [] }] }, { cookie: aceCookie })));
  const sent = calls[0] && JSON.parse(calls[0].init.body);
  check("roles: a mod can update the Grind, sent as role mod", r.status === 200 && sent && sent.client_payload.role === "mod" && sent.client_payload.editor === "ace");
  let threw = "";
  try { contract.checkRole([{ op: "refresh_order" }], "head"); } catch (e) { threw = e.message; }
  check("roles: a head mod can do anything", threw === "");

  // undo: head mods only, with a 16-hex request id
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  let ru = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "undo", requestId: "0123456789abcdef" }] })));
  const su = calls[0] && JSON.parse(calls[0].init.body);
  check("undo: a head mod can undo", ru.status === 200 && su && su.client_payload.ops[0].requestId === "0123456789abcdef");
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  ru = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "undo", requestId: "0123456789abcdef" }] }, { cookie: aceCookie })));
  check("undo: a mod can't", ru.status === 403);
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  ru = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "undo", requestId: "XYZ" }] })));
  check("undo: a bad request id is refused", ru.status === 400);

  // members: rename / country / remove are head mods' only
  const memberOps = [{ op: "rename_member", name: "ace", newName: "acee" }, { op: "set_member_country", name: "ace", nationality: "CA" },
    { op: "remove_member", name: "ace" }];
  for (const op of memberOps) {
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rh = await api.edit.onRequestPost(ctx(editReq({ ops: [op] })));
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rm = await api.edit.onRequestPost(ctx(editReq({ ops: [op] }, { cookie: aceCookie })));
    check(`members: ${op.op} - head mod yes, mod no`, rh.status === 200 && rm.status === 403);
  }
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  ru = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "rename_member", name: "ace", newName: "<x>" }] })));
  check("members: a bad new name is refused", ru.status === 400);
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  const rs = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "refresh_showcases" }] })));
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  const rsm = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "refresh_showcases" }] }, { cookie: aceCookie })));
  check("showcases: a head mod can check Nigel's channel, a mod can't", rs.status === 200 && rsm.status === 403);

  // apply-edit.py: the same rule, and a missing or unknown role counts as a mod / is refused
  const PYROLE = `
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("apply_edit", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = []
for extra in ({"role": "mod"}, {}, {"role": "head"}, {"role": "admin"}):
    try:
        m.validate(dict({"requestId": "0" * 16, "editor": "ace", "ops": [{"op": "refresh_order"}]}, **extra))
        out.append("ok")
    except m.Refuse as e:
        out.append(str(e))
print(json.dumps(out))
`;
  const res = spawnSync("python", ["-c", PYROLE, path.join(ROOT, "tools", "apply-edit.py")], { encoding: "utf8" });
  let got = [];
  try { got = JSON.parse(res.stdout); } catch { /* reported below */ }
  check("roles (py): mod refused, no role = mod, head ok, unknown role refused",
    got.length === 4 && /only head mods/.test(got[0]) && /only head mods/.test(got[1]) && got[2] === "ok" && /role must be/.test(got[3]),
    res.stdout + res.stderr);

  // Rated+: adding, editing and removing unrated levels is head mods' only; a clear
  // on one is an add_record, which mods can still send
  const unratedOps = [{ op: "add_unrated", level: 5, rating: 20 }, { op: "set_unrated", level: 5, rating: 21 }, { op: "remove_unrated", level: 5 }];
  for (const op of unratedOps) {
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rm = await api.edit.onRequestPost(ctx(editReq({ ops: [op] }, { cookie: aceCookie })));
    const em = (await rm.json()).error, sentByMod = calls.length;
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rh = await api.edit.onRequestPost(ctx(editReq({ ops: [op] })));
    const sh = calls[0] && JSON.parse(calls[0].init.body);
    check(`unrated: ${op.op} - head mod yes, mod no`, rm.status === 403 && /only head mods can/.test(em) && sentByMod === 0
      && rh.status === 200 && sh && sh.client_payload.ops[0].op === op.op, em);
  }
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  const rc = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "add_record", player: "ace", level: 99999999, progress: 60 }] }, { cookie: aceCookie })));
  check("unrated: a mod can still add a clear on any level", rc.status === 200);
  // a level that's unrated in game goes on Rated+ with its first clear or Grind goal:
  // one batch, add_unrated first - head mods only, sent as it came
  for (const second of [{ op: "add_record", player: "ace", level: 99999999, progress: 76 },
    { op: "set_grind", player: "ace", level: 99999999, best: 40, segments: [[50, 100]] }]) {
    const pair = [{ op: "add_unrated", level: 99999999, rating: 26, difficulty: "Extreme" }, second];
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rm = await api.edit.onRequestPost(ctx(editReq({ ops: pair }, { cookie: aceCookie })));
    const em = (await rm.json()).error, sentByMod = calls.length;
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rh = await api.edit.onRequestPost(ctx(editReq({ ops: pair })));
    const sh = calls[0] && JSON.parse(calls[0].init.body);
    check(`unrated: [add_unrated, ${second.op}] - a head mod's goes out in order, a mod's is refused`,
      rm.status === 403 && /edit 1 \(add_unrated\): only head mods can add unrated levels/.test(em) && sentByMod === 0
      && rh.status === 200 && sh && eq(sh.client_payload.ops, pair), em);
  }
  const PYUNRATED = `
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("apply_edit", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = []
for op in json.load(sys.stdin):
    for role in ("mod", "head"):
        try:
            m.validate({"requestId": "0" * 16, "editor": "ace", "role": role, "ops": [op]})
            out.append("ok")
        except m.Refuse as e:
            out.append(str(e))
print(json.dumps(out))
`;
  const ru2 = spawnSync("python", ["-c", PYUNRATED, path.join(ROOT, "tools", "apply-edit.py")], { input: JSON.stringify(unratedOps), encoding: "utf8" });
  let gotU = [];
  try { gotU = JSON.parse(ru2.stdout); } catch { /* reported below */ }
  if (ru2.status !== 0 && !gotU.length) console.log("(python not available - skipping the Rated+ role check in apply-edit.py)");
  else check("unrated (py): a mod is refused all three, a head mod isn't",
    gotU.length === 6 && [0, 2, 4].every((i) => /only head mods can/.test(gotU[i])) && [1, 3, 5].every((i) => gotU[i] === "ok"),
    ru2.stdout + ru2.stderr);
}
// --- the mod team: Nigel's account only (contract.js OWNER_ID) ------------------------------
{
  const team = [{ op: "set_mod", discordId: "777777777777777777", name: "Newmod", role: "mod" }, { op: "remove_mod", discordId: "444444444444444444" }];
  for (const op of team) {
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rh = await api.edit.onRequestPost(ctx(editReq({ ops: [op] })));
    const eh = (await rh.json()).error;
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const rm = await api.edit.onRequestPost(ctx(editReq({ ops: [op] }, { cookie: aceCookie })));
    stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
    const ro = await api.edit.onRequestPost(ctx(editReq({ ops: [op] }, { cookie: ownerCookie })));
    const so = calls[0] && JSON.parse(calls[0].init.body);
    check(`mod team: ${op.op} - Nigel yes, other head mods and mods no`, rh.status === 403 && /only Nigel can/.test(eh) && rm.status === 403
      && ro.status === 200 && so && so.client_payload.owner === true && so.client_payload.editor === "Nigel" && so.client_payload.role === "head", eh);
  }
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  let r = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "set_mod", discordId: "7777", name: "Newmod", role: "mod" }] }, { cookie: ownerCookie })));
  check("mod team: a bad Discord ID is refused", r.status === 400 && calls.length === 0);
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  r = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "set_mod", discordId: "777777777777777777", name: "Newmod", role: "owner" }] }, { cookie: ownerCookie })));
  check("mod team: only the head and mod ranks", r.status === 400 && calls.length === 0);
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  r = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "refresh_order" }] }, { cookie: ownerCookie })));
  const s2 = calls[0] && JSON.parse(calls[0].init.body);
  check("mod team: Nigel's other edits go through as before", r.status === 200 && s2 && s2.client_payload.owner === true);

  r = await api.me.onRequestGet(ctx(req("/api/me", { headers: { Cookie: ownerCookie } })));
  check("me: owner is true for Nigel's account", r.status === 200 && eq(await r.json(), { id: contract.OWNER_ID, name: "Nigel", role: "head", owner: true }));
  r = await api.mods.onRequestGet(ctx(req("/api/mods")));
  check("mods: 401 without a session", r.status === 401);
  r = await api.mods.onRequestGet(ctx(req("/api/mods", { headers: { Cookie: nigelCookie } })));
  check("mods: 403 for a head mod who isn't Nigel", r.status === 403);
  r = await api.mods.onRequestGet(ctx(req("/api/mods", { headers: { Cookie: ownerCookie } })));
  const out = await r.json();
  check("mods: Nigel gets the team, broken entries left out", r.status === 200 && r.headers.get("Cache-Control") === "no-store"
    && out.mods.some((m) => eq(m, { id: contract.OWNER_ID, name: "Nigel", role: "head" }))
    && out.mods.some((m) => eq(m, { id: "444444444444444444", name: "ace", role: "mod" }))
    && !out.mods.some((m) => m.id === "333333333333333333" || m.id === "666666666666666666"), JSON.stringify(out).slice(0, 300));

  // apply-edit.py: the same rule, and the same owner id
  const PYOWNER = `
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("apply_edit", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = []
for extra in ({}, {"owner": False}, {"owner": True}, {"owner": 1}):
    try:
        m.validate(dict({"requestId": "0" * 16, "editor": "Nigel", "role": "head", "ops": [{"op": "remove_mod", "discordId": "444444444444444444"}]}, **extra))
        out.append("ok")
    except m.Refuse as e:
        out.append(str(e))
print(json.dumps(out + [m.OWNER_ID]))
`;
  const res = spawnSync("python", ["-c", PYOWNER, path.join(ROOT, "tools", "apply-edit.py")], { encoding: "utf8" });
  let got = [];
  try { got = JSON.parse(res.stdout); } catch { /* reported below */ }
  check("mod team (py): head mods refused, Nigel ok, a non-boolean owner refused, same OWNER_ID as contract.js",
    got.length === 5 && /only Nigel can/.test(got[0]) && /only Nigel can/.test(got[1]) && got[2] === "ok" && /owner must be/.test(got[3])
    && got[4] === contract.OWNER_ID, res.stdout + res.stderr);
}
{
  const good = { ops: [{ op: "add_record", player: "ace", level: "https://gdladder.com/level/86084399", progress: 100 }, { op: "refresh_order" }] };
  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  let r = await api.edit.onRequestPost(ctx(editReq(good)));
  const out = await r.json();
  const d = calls[0];
  const sent = d && JSON.parse(d.init.body);
  check("edit: 200 {requestId}", r.status === 200 && /^[0-9a-f]{16}$/.test(out.requestId), JSON.stringify(out));
  check("edit: dispatch request", d && d.url === GH_DISPATCH && d.method === "POST" && d.init.headers.Authorization === "Bearer github_pat_test"
    && d.init.headers.Accept === "application/vnd.github+json" && d.init.headers["X-GitHub-Api-Version"] === "2022-11-28" && !!d.init.headers["User-Agent"]);
  check("edit: dispatch payload", sent && sent.event_type === "edit" && eq(Object.keys(sent.client_payload), ["requestId", "editor", "role", "ops"])
    && sent.client_payload.requestId === out.requestId && sent.client_payload.editor === "Nigel"
    && sent.client_payload.role === "head"
    && eq(sent.client_payload.ops, [{ op: "add_record", player: "ace", level: 86084399, progress: 100 }, { op: "refresh_order" }]), d && d.init.body);

  stubFetch([["POST", GH_DISPATCH, () => new Response(null, { status: 204 })]]);
  r = await api.edit.onRequestPost(ctx(editReq(good, { cookie: "" })));
  check("edit: 401 without a session", r.status === 401 && calls.length === 0);
  r = await api.edit.onRequestPost(ctx(editReq(good, { origin: "https://evil.example" })));
  check("edit: 403 from another origin", r.status === 403 && calls.length === 0);
  r = await api.edit.onRequestPost(ctx(editReq(good, { origin: null })));
  check("edit: 403 without an Origin", r.status === 403 && calls.length === 0);
  r = await api.edit.onRequestPost(ctx(editReq(good, { type: "text/plain" })));
  check("edit: 415 for a form-style post", r.status === 415 && calls.length === 0);
  r = await api.edit.onRequestPost(ctx(editReq(good, { type: "application/json; charset=utf-8" })));
  check("edit: charset is fine", r.status === 200);
  calls = [];
  r = await api.edit.onRequestPost(ctx(editReq("{nope")));
  check("edit: 400 bad JSON", r.status === 400 && calls.length === 0);
  r = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "add_member", name: "<>", nationality: "US" }] })));
  const bad = await r.json();
  check("edit: 400 with the reason", r.status === 400 && bad.error.startsWith("edit 1 (add_member): name") && calls.length === 0, bad.error);
  r = await api.edit.onRequestPost(ctx(editReq({ ...good, editor: "ace" })));
  check("edit: can't choose the editor", r.status === 400 && calls.length === 0);
  r = await api.edit.onRequestPost(ctx(editReq({ ops: [{ op: "set_grind", player: "a", level: 1, best: null, segments: [], note: "x".repeat(70000) }] })));
  check("edit: 413 when huge", r.status === 413);

  stubFetch([["POST", GH_DISPATCH, () => jsonResp({ message: "Bad credentials" }, 401)]]);
  r = await api.edit.onRequestPost(ctx(editReq(good)));
  let e = await r.json();
  check("edit: GitHub 401 -> 502", r.status === 502 && e.error.includes("GITHUB_TOKEN") && e.error.includes("401"), e.error);
  stubFetch([["POST", GH_DISPATCH, () => jsonResp({ message: "Resource not accessible" }, 403)]]);
  r = await api.edit.onRequestPost(ctx(editReq(good)));
  e = await r.json();
  check("edit: GitHub 403 -> 502", r.status === 502 && e.error.includes("Contents read/write"), e.error);
  stubFetch([]);
  r = await api.edit.onRequestPost(ctx(editReq(good)));
  check("edit: GitHub unreachable -> 502", r.status === 502 && (await r.json()).error.includes("couldn't reach GitHub"));
  r = await api.edit.onRequestPost(ctx(editReq(good), { ...ENV, GITHUB_TOKEN: "" }));
  check("edit: 503 without GITHUB_TOKEN", r.status === 503 && (await r.json()).error.includes("GITHUB_TOKEN is missing"));
}

// --- GET /api/status -------------------------------------------------------------------------

{
  const RUNS = `https://api.github.com/repos/${SITE.repo}/actions/workflows/apply-edit.yml/runs?per_page=`;
  const run = (id, rid, editor, status, conclusion) => ({
    id, display_title: rid ? `Edit ${rid} by ${editor}` : "Apply edit", status, conclusion,
    created_at: "2026-10-06T12:00:00Z", html_url: `https://github.com/${SITE.repo}/actions/runs/${id}`,
  });
  const runs = {
    total_count: 3, workflow_runs: [
      run(3, "cccccccccccccccc", "Poatan", "in_progress", null),
      run(2, "bbbbbbbbbbbbbbbb", "Dihmaster500", "completed", "failure"),
      run(1, null, null, "completed", "success"), // not from the mod page
      run(0, "aaaaaaaaaaaaaaaa", "Nigel", "completed", "success"),
    ],
  };
  const routes = [
    ["GET", RUNS, () => jsonResp(runs)],
    ["GET", `https://api.github.com/repos/${SITE.repo}/actions/runs/2/jobs`, () => jsonResp({ total_count: 1, jobs: [{ id: 77 }] })],
    ["GET", `https://api.github.com/repos/${SITE.repo}/check-runs/77/annotations`, () => jsonResp([
      { annotation_level: "warning", title: "", message: "Node.js 20 is deprecated" },
      { annotation_level: "failure", title: "Edit refused", message: "edit 1 (remove_record): LIMBO has no record by ace" },
      { annotation_level: "failure", title: "", message: "Process completed with exit code 1." },
    ])],
  ];
  const cookie = { headers: { Cookie: nigelCookie } };
  stubFetch(routes);
  let r = await api.status.onRequestGet(ctx(req("/api/status", cookie)));
  let body = await r.json();
  check("status: list", r.status === 200 && Array.isArray(body) && body.length === 3 && eq(body[0], {
    requestId: "cccccccccccccccc", editor: "Poatan", status: "in_progress", conclusion: null,
    createdAt: "2026-10-06T12:00:00Z", url: `https://github.com/${SITE.repo}/actions/runs/3`,
  }) && body[2].requestId === "aaaaaaaaaaaaaaaa", JSON.stringify(body));
  check("status: asks GitHub for 15", calls[0].url === RUNS + "15" && calls[0].init.headers.Authorization === "Bearer github_pat_test");
  stubFetch(routes);
  r = await api.status.onRequestGet(ctx(req("/api/status?requestId=bbbbbbbbbbbbbbbb", cookie)));
  body = await r.json();
  check("status: one failed run, with the reason", r.status === 200 && body.run.conclusion === "failure"
    && body.run.reason === "edit 1 (remove_record): LIMBO has no record by ace", JSON.stringify(body));
  stubFetch(routes);
  r = await api.status.onRequestGet(ctx(req("/api/status?requestId=aaaaaaaaaaaaaaaa", cookie)));
  body = await r.json();
  check("status: one good run", body.run.conclusion === "success" && body.run.reason === null && calls.length === 1);
  stubFetch(routes);
  r = await api.status.onRequestGet(ctx(req("/api/status?requestId=dddddddddddddddd", cookie)));
  check("status: not started yet", eq(await r.json(), { run: null }));
  r = await api.status.onRequestGet(ctx(req("/api/status?requestId=nope", cookie)));
  check("status: bad requestId", r.status === 400);
  r = await api.status.onRequestGet(ctx(req("/api/status")));
  check("status: 401", r.status === 401);
  stubFetch([["GET", RUNS, () => jsonResp({ message: "Bad credentials" }, 401)]]);
  r = await api.status.onRequestGet(ctx(req("/api/status", cookie)));
  check("status: GitHub 401 -> 502", r.status === 502 && (await r.json()).error.includes("GITHUB_TOKEN"));
}

// --- GET /api/level -----------------------------------------------------------------------------

{
  const cookie = { headers: { Cookie: nigelCookie } };
  const GL = "https://gdladder.com/api/levels/", GB = "https://gdbrowser.com/api/level/";
  const limboGl = { ID: 86084399, Rating: 36.888888888888886, Meta: { Name: "LIMBO", Length: 5, Difficulty: "Extreme", Publisher: { name: "MindCap" } } };
  const limboGb = { name: "LIMBO", id: "86084399", author: "MindCap", difficulty: "Extreme Demon", stars: 10, length: "XL", platformer: false };
  stubFetch([["GET", GL + "86084399", () => jsonResp(limboGl)], ["GET", GB + "86084399", () => jsonResp(limboGb)]]);
  let r = await api.level.onRequestGet(ctx(req("/api/level?level=" + encodeURIComponent("https://gdladder.com/level/86084399"), cookie)));
  let body = await r.json();
  // where this list has LIMBO (the endpoint reads the site's own data/demons.js), so
  // the test holds on every list that shares these files
  const demonsSrc = readFileSync(path.join(ROOT, "data", "demons.js"), "utf8");
  const limbo = JSON.parse(demonsSrc.slice(demonsSrc.indexOf("window.DEMONS =") + "window.DEMONS =".length).trim().replace(/;\s*$/, ""))
    .find((d) => Number(d.levelId) === 86084399);
  check("level: LIMBO", r.status === 200 && eq(body, {
    id: 86084399, name: "LIMBO", creator: "MindCap", difficulty: "Extreme Demon", tier: "Extreme", rating: 36.89, stars: 10, platformer: false,
    onList: !!limbo, position: limbo ? limbo.position : null,
  }), JSON.stringify(body));
  check("level: sends a User-Agent", calls.every((c) => c.init.headers["User-Agent"]));
  stubFetch([["GET", GL + "777", () => jsonResp({ ID: 777, Rating: 20, Meta: { Name: "Plat", Length: 6, Difficulty: "Insane" } })], ["GET", GB + "777", () => new Response("-1")]]);
  body = await (await api.level.onRequestGet(ctx(req("/api/level?level=777", cookie)))).json();
  check("level: gdladder only, platformer, off the list", body.name === "Plat" && body.platformer === true && body.difficulty === "Insane Demon"
    && body.tier === "Insane" && body.onList === false && body.position === null && body.creator === "Unknown" && body.stars === null, JSON.stringify(body));
  // Rated+: an unrated level (gdbrowser only; gdladder doesn't know it)
  stubFetch([["GET", GL + "99999999", () => jsonResp({ error: "not found" }, 404)],
    ["GET", GB + "99999999", () => jsonResp({ name: "Unrated Thing", author: "Someone", difficulty: "Unrated", stars: 0, length: "Long" })]]);
  body = await (await api.level.onRequestGet(ctx(req("/api/level?level=99999999", cookie)))).json();
  check("level: unrated (stars 0, no tier)", eq(body, {
    id: 99999999, name: "Unrated Thing", creator: "Someone", difficulty: "Unrated", tier: null, rating: null, stars: 0, platformer: false,
    onList: false, position: null,
  }), JSON.stringify(body));
  stubFetch([["GET", GL + "13519", () => jsonResp({ error: "not found" }, 404)], ["GET", GB + "13519", () => jsonResp({ name: "The Nightmare", author: "Jax", difficulty: "Easy Demon", length: "Long" })]]);
  body = await (await api.level.onRequestGet(ctx(req("/api/level?level=13519", cookie)))).json();
  check("level: gdbrowser only", body.name === "The Nightmare" && body.tier === "Easy" && body.rating === null, JSON.stringify(body));
  stubFetch([["GET", GB + "128", () => jsonResp({ name: "1st level", author: "x", difficulty: "Hard" })], ["GET", GL, () => jsonResp({}, 404)]]);
  body = await (await api.level.onRequestGet(ctx(req("/api/level?level=128", cookie)))).json();
  check("level: not a demon", body.tier === null && body.difficulty === "Hard", JSON.stringify(body));
  stubFetch([["GET", GL, () => jsonResp({ error: "x" }, 404)], ["GET", GB, () => new Response("-1")]]);
  r = await api.level.onRequestGet(ctx(req("/api/level?level=999999999", cookie)));
  check("level: 404 when nobody knows it", r.status === 404 && (await r.json()).error.includes("999999999"));
  stubFetch([]);
  r = await api.level.onRequestGet(ctx(req("/api/level?level=5", cookie)));
  check("level: 502 when both are down", r.status === 502);
  r = await api.level.onRequestGet(ctx(req("/api/level?level=https%3A%2F%2Fexample.com%2F5", cookie)));
  check("level: 400 for a bad level", r.status === 400 && (await r.json()).error.includes("isn't a level id"));
  r = await api.level.onRequestGet(ctx(req("/api/level?level=5")));
  check("level: 401", r.status === 401);
  stubFetch([["GET", GL + "86084399", () => jsonResp(limboGl)], ["GET", GB + "86084399", () => jsonResp(limboGb)]]);
  body = await (await api.level.onRequestGet(ctx(req("/api/level?level=86084399", cookie), { ...ENV, ASSETS: undefined }))).json();
  check("level: onList null without the list", body.onList === null && body.position === null);

  // gdbrowser shows scripts a Cloudflare challenge (since late October 2026), and
  // gdladder answers {} for a level it doesn't know: GDHistory stands in, and
  // only a real "not in the game" is a 404
  const HIST = "https://history.geometrydash.eu/api/v1/level/";
  const challenge = () => new Response("<!DOCTYPE html><title>Just a moment...</title>", { status: 403 });
  const copy = (o) => Object.assign({ record_type: "get", real_date: "2026-10-30T00:00:00Z", level_name: "Unrated Thing",
    username: "Someone", stars: 0, rating_sum: 0, demon: null, demon_type: 0, auto: null, length: 3 }, o);
  stubFetch([["GET", GL + "99999999", () => jsonResp({})], ["GET", GB + "99999999", challenge],
    ["GET", HIST + "99999999/", () => jsonResp({ online_id: 99999999, is_deleted: false, cache_username: "Someone", records: [
      copy({}), copy({ record_type: "glm_03", real_date: "2026-10-31T00:00:00Z", level_name: "Old Name", username: "Old", stars: null })] })]]);
  body = await (await api.level.onRequestGet(ctx(req("/api/level?level=99999999", cookie)))).json();
  check("level: gdbrowser challenged - GDHistory's newest server copy stands in", eq(body, {
    id: 99999999, name: "Unrated Thing", creator: "Someone", difficulty: "Unrated", tier: null, rating: null, stars: 0, platformer: false,
    onList: false, position: null,
  }), JSON.stringify(body));
  stubFetch([["GET", GL + "99999999", () => jsonResp({})], ["GET", GB, challenge], ["GET", HIST, () => jsonResp({ success: false }, 404)]]);
  r = await api.level.onRequestGet(ctx(req("/api/level?level=99999999", cookie)));
  body = await r.json();
  check("level: nobody can say whether it exists - 502, not \"isn't on gdbrowser\"", r.status === 502
    && body.error.includes("gdladder doesn't know level 99999999") && body.error.includes("gdbrowser didn't answer"), JSON.stringify(body));
  stubFetch([["GET", GL, () => jsonResp({})], ["GET", GB, challenge],
    ["GET", HIST, () => jsonResp({ online_id: 24346905, is_deleted: true, records: [copy({})] })]]);
  r = await api.level.onRequestGet(ctx(req("/api/level?level=24346905", cookie)));
  check("level: GDHistory says it was deleted - 404", r.status === 404 && (await r.json()).error.includes("was deleted"));
  stubFetch([["GET", GL + "86084399", () => jsonResp(limboGl)], ["GET", GB, challenge], ["GET", HIST, () => jsonResp({
    online_id: 86084399, records: [copy({ level_name: "LIMBO", username: "MindCap", stars: 10, demon: true, demon_type: 6, rating_sum: 50, length: 4 })] })]]);
  body = await (await api.level.onRequestGet(ctx(req("/api/level?level=86084399", cookie)))).json();
  check("level: a rated level with gdbrowser challenged - gdladder's rating, GDHistory's stars", body.name === "LIMBO"
    && body.stars === 10 && body.difficulty === "Extreme Demon" && body.rating === 36.89 && body.creator === "MindCap", JSON.stringify(body));
}

// --- the Function's GDHistory reading agrees with tools/gdlevel.py's ----------------------------

{
  const gdh = await fn("_lib/gdhistory.js");
  const rec = (o) => Object.assign({ record_type: "get", real_date: "2026-10-30T00:00:00Z", level_name: "L", username: "U", stars: 0,
    rating_sum: 0, demon: null, demon_type: 0, auto: null, length: 3, game_version: 22, objects_count: 100 }, o);
  const CASES = [
    [1, { online_id: 1, cache_username: "C", records: [rec({}), rec({ record_type: "glm_03", real_date: "2026-10-31", username: "Old", stars: null })] }],
    [2, { online_id: 2, cache_username: "C", records: [rec({ record_type: "download", username: null })] }],
    [3, { online_id: 3, is_deleted: true, records: [rec({})] }],
    [4, { online_id: 4, records: [rec({ record_type: "glm_10" }), rec({ record_type: "manual" })] }],
    [5, { online_id: 5, records: [rec({ demon: true, demon_type: 6, stars: 10, rating_sum: 50 })] }],
    [6, { online_id: 6, records: [rec({ demon: true, demon_type: 1, stars: 10 })] }],
    [7, { online_id: 7, records: [rec({ auto: true, stars: 1 })] }],
    [8, { online_id: 8, records: [rec({ length: 5 }), rec({ is_invalid: true, real_date: "2026-11-01", length: 1 })] }],
    [9, { online_id: 9, records: [rec({ stars: null, length: null, rating_sum: 40 })] }],
    [10, { online_id: 99, records: [rec({})] }],
    [11, { success: false }],
  ];
  const js = CASES.map(([id, data]) => gdh.fromHistory(id, data));
  const PYH = `
import importlib.util, json, os, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("gdlevel", os.path.join(sys.argv[1], "tools", "gdlevel.py"))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
print(json.dumps([g.from_history(i, d) for i, d in json.load(sys.stdin)]))
`;
  const ps = spawnSync("python", ["-c", PYH, ROOT], { input: JSON.stringify(CASES), encoding: "utf8" });
  let py = null;
  try { py = JSON.parse(ps.stdout); } catch { /* below */ }
  if (!py) console.log("(python not available - skipping the GDHistory cross-check)\n" + (ps.stderr || "").slice(0, 300));
  else {
    const KEYS = ["name", "author", "stars", "difficulty", "length", "platformer"];
    const pick = (x) => (x && typeof x === "object" ? Object.fromEntries(KEYS.filter((k) => k in x).map((k) => [k, x[k]])) : x);
    const differ = js.map((x, i) => (eq(pick(x), pick(py[i])) ? null : { case: i + 1, js: x, py: py[i] })).filter(Boolean);
    check(`gdhistory: the Function and gdlevel.py read ${CASES.length} GDHistory answers the same way`, !differ.length,
      JSON.stringify(differ[0] || ""));
  }
  check("gdhistory: what the Function reads", js[0].author === "U" && js[0].stars === 0 && js[1].author === "C" && js[2] === -1
    && js[3] === null && js[4].difficulty === "Extreme Demon" && js[5].difficulty === "Hard Demon" && js[6].difficulty === "Auto"
    && js[7].platformer === true && js[7].length === "Plat." && !("stars" in js[8]) && !("length" in js[8])
    && js[8].difficulty === "Harder" && js[9] === null && js[10] === null, JSON.stringify(js));
}

// --- the list views (static/js/views.js) --------------------------------------------------------
// Current + Rated is today's list, bit for bit; every combination keeps today's
// order for the listed demons and works its points out again; unrated levels sit
// where their spot or estimate puts them; and the manual-placement window agrees
// with tools/apply-edit.py. The flags are turned on here, in the vm: on Nigel's
// Demonlist they're off and data/unrated.js doesn't exist.

if (!existsSync(path.join(ROOT, "static", "js", "views.js"))) {
  console.log("skipping the view checks - static/js/views.js isn't there yet");
} else {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const f of ["data/config.js", "data/demons.js", "data/goals.js", "data/goal-levels.js",
    "static/js/list-utils.js", "static/js/goals.js", "static/js/views.js"]) {
    vm.runInContext(readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  }
  const W = sandbox.window, DL = W.DL, SITE = W.SITE;
  SITE.futureList = SITE.futurePlus = SITE.ratedPlus = true;
  const L = DL.sortedDemons();
  const r2 = (x) => Math.round(x * 100) / 100;
  const tiers = (SITE.allowedDifficulties || ["Extreme", "Insane"]).filter((t) => t === "Extreme" || t === "Insane");
  const tierOf = (d) => (d.difficulty === "Insane" ? "Insane" : "Extreme");

  // three unrated levels, each with one 100% by a roster member: one in a spot of
  // its window that isn't the automatic one, one above everything (so it's worth
  // topScore), one with a spot below a level that isn't listed (123)
  const holder = ((SITE.members || [])[0] || {}).name || L[0].records[0].player;
  const member = (SITE.members || []).find((m) => m.name === holder) || {};
  const unrated = (id, tier, rating, placeBelow) => {
    const u = {
      id, name: `Fixture ${id}`, difficulty: tier, rating, publisher: "Someone", creators: ["Someone"], verifier: holder,
      videoUrl: null, thumbnailUrl: null, levelId: id, description: null, requirementPercent: 100,
      records: [{ player: holder, progress: 100, nationality: member.nationality || null, subdivision: null }],
      gd: { inGameDifficulty: "Unrated" }, added: "2026-10-30",
    };
    if (placeBelow !== undefined) u.placeBelow = placeBelow;
    return u;
  };
  let spot = null;
  for (const d of L) {
    const s = DL.unratedSlots({ levelId: 980000001, difficulty: tierOf(d), rating: r2(DL.demonRating(d)) }, L).find((x) => !x.auto);
    if (s) {
      spot = unrated(980000001, tierOf(d), r2(DL.demonRating(d)), s.anchor);
      break;
    }
  }
  const values = L.map((d) => DL.demonRating(d));
  const top = Math.max(...values), bottom = Math.min(...values);
  const lowest = L[L.length - 1];
  const fixture = [
    spot,
    unrated(980000002, tiers[0], Math.min(50, r2(top + 1))),
    unrated(980000003, tierOf(lowest), Math.max(1, r2(DL.demonRating(lowest) + 0.5)), 123),
  ].filter(Boolean);
  check("views: found an unrated fixture with a hand-picked spot", !!spot);
  W.UNRATED = fixture;
  const ids = new Set(fixture.map((u) => u.levelId));

  // Current + Rated: today's list and today's ranking, nothing worked out again
  const dv = DL.listView("current", "rated", true);
  check("views: Current + Rated is today's list", dv.isDefault === true && dv.unrated.length === 0 && dv.joining.length === 0
    && eq(dv.rows.map((r) => [r.id, r.position]), L.map((d) => [d.levelId, d.position])));
  check("views: Current + Rated has today's points (===)", dv.rows.every((r) => r.points === DL.scoreAt100(r.level)));
  check("views: Current + Rated has today's ranking", eq(dv.players.map((p) => [p.name, p.score, p.rank]),
    DL.aggregatePlayers().map((p) => [p.name, p.score, p.rank])));

  for (const time of ["current", "future", "plus"]) {
    for (const rating of ["rated", "plus"]) {
      const v = DL.listView(time, rating, true), what = `views: ${time} + ${rating}:`;
      const rows = v.rows, maxValue = Math.max(...rows.map((r) => DL.demonRating(r.level)));
      check(`${what} positions run 1..n, each level once`, rows.every((r, i) => r.position === i + 1)
        && new Set(rows.map((r) => r.id)).size === rows.length);
      check(`${what} the listed demons keep today's order`, eq(rows.filter((r) => r.kind === "listed").map((r) => r.id), L.map((d) => d.levelId)));
      if (SITE.mainListSize === "extremes") {
        const t = rows.map((r) => DL.tierRank(r.level));
        check(`${what} every extreme above every insane`, t.every((x, i) => !i || t[i - 1] <= x));
      }
      check(`${what} the hardest level is worth topScore`, rows.some((r) => r.points === SITE.scoring.topScore && DL.demonRating(r.level) === maxValue));
      check(`${what} unrated levels only in Rated+`, rating === "plus"
        ? v.unrated.length === fixture.length && v.unrated.every((r) => ids.has(r.id)) : v.unrated.length === 0);
      check(`${what} Grind levels only in Future / Future+`, (time === "current" ? v.joining.length === 0 : true)
        && v.joining.every((r) => !ids.has(r.id)));
    }
  }

  // placement: right below its anchor (only other extras between them); a spot
  // below a level that isn't listed is ignored
  const cv = DL.listView("current", "plus", true);
  if (spot) {
    const i = cv.rows.findIndex((r) => r.id === spot.levelId);
    let k = i - 1;
    while (k >= 0 && cv.rows[k].kind !== "listed") k--;
    check("views: a hand-picked spot sits right below its anchor", i >= 0 && cv.rows[i].manual === true
      && (spot.placeBelow === 0 ? k === -1 : k >= 0 && cv.rows[k].id === spot.placeBelow), JSON.stringify({ i, k, anchor: spot.placeBelow }));
  }
  const stray = fixture[fixture.length - 1];
  const strayAt = cv.pos(stray.levelId);
  W.UNRATED = fixture.map((u) => (u === stray ? Object.fromEntries(Object.entries(u).filter(([key]) => key !== "placeBelow")) : u));
  check("views: a spot below a level that isn't listed is ignored", strayAt !== null && strayAt === DL.listView("current", "plus", true).pos(stray.levelId)
    && cv.row(stray.levelId).manual === false);
  W.UNRATED = fixture;

  // scoring: the holder's Rated+ score is the sum of the view's recordScore over
  // their records, in recordLevels order
  let sum = 0;
  cv.recordLevels.forEach((lv) => (lv.records || []).forEach((r) => {
    if (r.player === holder) sum += cv.recordScore(lv, r.progress);
  }));
  const hp = cv.players.find((p) => p.name === holder);
  check("views: Rated+ scores count the unrated clears", hp && hp.score === sum && fixture.every((u) => cv.recordLevels.includes(u)),
    JSON.stringify({ score: hp && hp.score, sum }));

  // the manual-placement window: views.js and apply-edit.py agree
  const cands = [];
  for (const tier of tiers) {
    for (let k = 0; k < 20; k++) {
      cands.push({ levelId: 970000000 + cands.length, difficulty: tier,
        rating: Math.min(50, Math.max(1, r2(top + 2 - (k * (top - bottom + 4)) / 19))) });
    }
  }
  // the worked examples, while the list is as it was on 2026-10-30 (Aceabase only)
  const EXAMPLES = [
    [{ difficulty: "Extreme", rating: 32 }, [58161496, 55624478, 42584142, 79997992, 68668045], 55624478],
    [{ difficulty: "Insane", rating: 21 }, [114933189, 72211008], 114933189],
    [{ difficulty: "Extreme", rating: 15 }, [114933189], 114933189],
  ];
  // [index in the list, level id, value to 2 dp]: every demon those examples depend on
  const AS_OF = [[0, 86084399, 36.19], [1, 58161496, 33.21], [2, 55624478, 32.23], [3, 42584142, 31.77], [4, 79997992, 31.72],
    [5, 68668045, 31.46], [6, 68688849, 29.77], [28, 61079355, 19.62], [29, 114933189, 19.61], [30, 72211008, 20.12],
    [31, 80575901, 19.55]];
  const asOf = SITE.mainListSize === "extremes" && DL.unratedWindow() === 1
    && AS_OF.every(([i, id, v]) => L[i] && L[i].levelId === id && r2(DL.demonRating(L[i])) === v);
  const examples = asOf ? EXAMPLES.map(([u], n) => Object.assign({ levelId: 960000000 + n }, u)) : [];
  if (!asOf) console.log("(skipping the worked slot examples - this isn't Aceabase's list as of 2026-10-30)");

  const all = cands.concat(examples);
  const anchors = [0].concat(L.map((d) => d.levelId));
  const js = all.map((u) => [DL.unratedSlots(u, L).map((s) => s.anchor), anchors.filter((a) => DL.unratedSlotOk(u, a, L))]);
  check("views: every candidate's spots are contiguous and include its automatic one", all.every((u) => {
    const s = DL.unratedSlots(u, L), at = s.map((x) => anchors.indexOf(x.anchor));
    return s.filter((x) => x.auto).length === 1 && at.every((x, i) => !i || x === at[i - 1] + 1);
  }));
  examples.forEach((u, n) => {
    const s = DL.unratedSlots(u, L);
    check(`views: worked example ${n + 1} (${u.difficulty} ${u.rating.toFixed(2)})`, eq(s.map((x) => x.anchor), EXAMPLES[n][1])
      && s.find((x) => x.auto).anchor === EXAMPLES[n][2], JSON.stringify(s.map((x) => [x.anchor, x.auto])));
  });
  const PYSLOTS = `
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("apply_edit", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
d = json.load(sys.stdin)
ids = [0] + [x["levelId"] for x in sorted(d["demons"], key=lambda x: x["position"])]
print(json.dumps([[m.unrated_slots(u, d["demons"], d["site"]), [a for a in ids if m.slot_ok(u, a, d["demons"], d["site"])]]
                  for u in d["cands"]]))
`;
  const ps = spawnSync("python", ["-c", PYSLOTS, path.join(ROOT, "tools", "apply-edit.py")], {
    input: JSON.stringify({ site: SITE, demons: W.DEMONS, cands: all }), encoding: "utf8", maxBuffer: 16 << 20,
  });
  let py = null;
  try { py = JSON.parse(ps.stdout); } catch { /* below */ }
  if (!py) console.log("(python not available - skipping the slot cross-check)\n" + (ps.stderr || "").slice(0, 300));
  else {
    const differ = all.map((u, i) => (eq(py[i], js[i]) ? null : { u, js: js[i], py: py[i] })).filter(Boolean);
    check(`views: ${all.length} candidates get the same spots from views.js and apply-edit.py`, !differ.length,
      differ.length ? JSON.stringify(differ[0]).slice(0, 300) : "");
  }
}

// --- in-progress points (SITE.inProgressPoints, DL.inProgressScores) ---------------------------
// A made-up list, so the checks don't move when the real Grind does: a quarter of
// the level's points (capped at topScore) times the longest run over 50%, from the
// Grind or a record; never on a beaten level or over a record that scores more; a
// level off the list counts where it isn't shown, on that view's curve. The Current
// views only: the Future views count those runs as clears (the next section).

if (existsSync(path.join(ROOT, "static", "js", "views.js"))) {
  const sb = { window: {}, console };
  vm.createContext(sb);
  const W = sb.window;
  const lvl = (id, difficulty, rating, position, records, extra) => Object.assign({
    id, levelId: id, name: `L${id}`, difficulty, rating, position, publisher: "x", creators: ["x"], verifier: null,
    requirementPercent: 100, records: records.map(([player, progress]) => ({ player, progress, nationality: "US", subdivision: null })),
    gd: { inGameDifficulty: difficulty + " Demon", length: "XL" },
  }, extra || {});
  W.SITE = {
    name: "Test", mainListSize: "extremes", extendedListSize: null, allowedDifficulties: ["Extreme", "Insane"],
    grindInProgress: 50, inProgressPoints: 0.25, futureList: true, futurePlus: true, ratedPlus: true,
    scoring: { topScore: 500, base: 1.176, legacyScore: 2, requirementScoreFraction: 0.25 },
    members: ["P1", "P2", "P3", "P4", "P5", "P6"].map((name) => ({ name, nationality: "US" })),
  };
  W.DEMONS = [
    lvl(1001, "Extreme", 30, 1, [["P1", 100], ["P2", 60]]),
    lvl(1002, "Extreme", 25, 2, [["P3", 100]]),
    lvl(1003, "Insane", 18, 3, [["P4", 80]], { requirementPercent: 50 }),
  ];
  W.GOAL_LEVELS = {
    2001: { name: "Hard Off", difficulty: "Extreme", rating: 35, gd: { inGameDifficulty: "Extreme Demon", length: "XL" } },
    2002: { name: "Short Run", difficulty: "Extreme", rating: 28, gd: { inGameDifficulty: "Extreme Demon", length: "XL" } },
    2003: { name: "Plat", difficulty: "Extreme", rating: 26, gd: { inGameDifficulty: "Extreme Demon", length: "Plat." } },
  };
  W.GOALS = [
    { player: "P2", levelId: 1001, best: 55, segments: [[30, 95]] }, // longest run 65, over her 60% record
    { player: "P1", levelId: 1002, best: 90, segments: [] },          // listed, not beaten
    { player: "P3", levelId: 1002, best: 70, segments: [] },          // already beaten: nothing
    { player: "P5", levelId: 2001, best: 76, segments: [] },          // off the list, harder than #1: capped
    { player: "P5", levelId: 2002, best: 40, segments: [[10, 55]] },  // 45 at most: under the line
    { player: "P6", levelId: 2003, best: 80, segments: [] },          // a platformer can't be on the list
    { player: "P1", levelId: 3001, best: 90, segments: [] },          // unrated: only in Rated+
  ];
  W.UNRATED = [{ id: 3001, levelId: 3001, name: "U", difficulty: "Extreme", rating: 27, records: [], requirementPercent: 100,
    publisher: "x", creators: ["x"], verifier: null, gd: { inGameDifficulty: "Unrated" } }];
  for (const f of ["static/js/list-utils.js", "static/js/goals.js", "static/js/views.js"]) {
    vm.runInContext(readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  }
  const DL = W.DL, S = W.SITE.scoring;
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const full = (rating, top) => Math.min(S.topScore * Math.pow(S.base, rating - top), S.topScore);
  const find = (xs, player, id) => xs.filter((x) => x.player === player && x.id === id);
  const key = (xs) => xs.map((x) => x.player + "@" + x.id).sort().join(" ");

  let ip = DL.inProgressScores(null);
  check("in-progress: today's list - exactly the runs that count", key(ip) === "P1@1002 P2@1001 P5@2001", key(ip));
  const p2 = find(ip, "P2", 1001)[0], p1 = find(ip, "P1", 1002)[0], p5 = find(ip, "P5", 2001)[0];
  check("in-progress: the longest run, once, over a record that scores 0", p2 && p2.run[0] === 30 && p2.run[1] === 95
    && near(p2.points, 0.25 * 500 * 0.65) && near(p2.extra, p2.points) && p2.shown, JSON.stringify(p2));
  check("in-progress: a listed level, a quarter of its points times the run", p1 && near(p1.points, 0.25 * full(25, 30) * 0.9), JSON.stringify(p1));
  check("in-progress: off the list and harder than #1 - hidden, capped at topScore", p5 && !p5.shown && near(p5.points, 0.25 * 500 * 0.76),
    JSON.stringify(p5));
  const today = {};
  DL.aggregatePlayers().forEach((p) => { today[p.name] = p; });
  check("in-progress: in the ranking, nothing twice", near(today.P2.score, 0.25 * 500 * 0.65) && near(today.P5.score, 95)
    && near(today.P1.score, 500 + 0.25 * full(25, 30) * 0.9) && today.P5.inProgress.length === 1 && near(today.P3.score, full(25, 30)),
    JSON.stringify(Object.values(today).map((p) => [p.name, p.score])));
  check("in-progress: a record that scores more keeps its points", near(today.P4.score, DL.recordScore(W.DEMONS[2], 80)) && !today.P4.inProgress.length);

  // (nobody has beaten 3001, so Current · Rated+ doesn't show it: the run counts on
  // that view's curve from its estimate, like a hidden rated level)
  const plus = DL.listView("current", "plus", true);
  const pu = find(DL.inProgressScores(plus), "P1", 3001)[0];
  check("in-progress: an unrated level counts in Rated+ only - not beaten yet, hidden, from its estimate",
    !find(ip, "P1", 3001).length && pu && !pu.shown && plus.pos(3001) === null
    && near(pu.points, 0.25 * full(27, plus.top) * 0.9), JSON.stringify(pu));
  // The Future views are "what if everyone finishes" (Nigel, 2026-10-30): no
  // quarter points there - a level someone has In Progress (Future), or anything
  // in their Grind or a record under 100% (Future+), counts as beaten for them,
  // with its full points in that view, in place of what a record of theirs scores.
  const fut = DL.listView("future", "rated", true), fplus = DL.listView("plus", "rated", true);
  const futU = DL.listView("future", "plus", true);
  const score = (v, name) => (v.players.find((p) => p.name === name) || { score: NaN }).score;
  check("in-progress: Future views add no quarter points; the off-list level is a row, on its curve",
    DL.inProgressScores(fut).length === 0 && DL.inProgressScores(fplus).length === 0 && DL.inProgressScores(futU).length === 0
    && fut.top === 35 && fut.pos(2001) === 1 && near(fut.points(2001), 500) && near(fut.points(1001), full(30, 35)),
    JSON.stringify(DL.inProgressScores(fut)));
  check("in-progress: Future - an In Progress level scores its full points, in place of a record's",
    near(score(fut, "P5"), fut.points(2001)) && near(score(fut, "P2"), fut.points(1001)) && near(score(fut, "P4"), fut.points(1003))
    && near(score(fut, "P1"), fut.points(1001) + fut.points(1002)) && near(score(fut, "P3"), fut.points(1002)),
    JSON.stringify(fut.players.map((p) => [p.name, p.score])));
  check("in-progress: an unrated level nobody has beaten joins Rated+'s Future views only (P1's 90% run), never a Rated view",
    futU.pos(3001) !== null && DL.listView("plus", "plus", true).pos(3001) !== null && plus.pos(3001) === null
    && fut.pos(3001) === null && fplus.pos(3001) === null, JSON.stringify([futU.pos(3001), plus.pos(3001), fut.pos(3001)]));
  check("in-progress: Future+ - every Grind level counts (a 40% too); Rated+ - the unrated one too",
    near(score(fplus, "P5"), fplus.points(2001) + fplus.points(2002))
    && near(score(futU, "P1"), futU.points(1001) + futU.points(1002) + futU.points(3001)) && near(score(fut, "P1"), score(fplus, "P1")),
    JSON.stringify([fplus.players.map((p) => [p.name, p.score]), futU.players.map((p) => [p.name, p.score])]));
  W.SITE.inProgressPoints = null;
  check("in-progress: off - nothing, and today's scores without them",
    DL.inProgressScores(null).length === 0 && DL.aggregatePlayers().every((p) => !p.inProgress.length)
    && near(DL.aggregatePlayers().find((p) => p.name === "P2").score, 0));
}

// --- the Future views and Rated+'s unrated levels (DL.projectedClears, DL.unratedBeaten) -------
// The Future views are "what if everyone finishes" (Nigel, 2026-10-30): a level
// someone has In Progress (Future), or anything in their Grind or a record under
// 100% (Future+), counts as beaten for them, with its full points in that view, in
// place of what their records on it score, labeled with the run they have now
// ("Slaughterhouse (76%)"). The Current views keep the quarter points. Rated+ puts
// an unrated level (data/unrated.js) on its list once someone beats it; until then
// it's a Grind level of Rated+ (it joins the Future views, its runs count), and the
// Rated views have no unrated level at all. A made-up list with every case, in all
// 6 views; the mod page's build (no goals.js); the real data as invariants; and
// Nigel's examples while the Grind is as it was on 2026-10-30. On Nigel's
// Demonlist the flags are off: they're turned on here, in the vm.

if (existsSync(path.join(ROOT, "static", "js", "views.js"))) {
  const VIEWS = [["current", "rated"], ["current", "plus"], ["future", "rated"], ["future", "plus"], ["plus", "rated"], ["plus", "plus"]];
  const quiet = { log() {}, warn() {}, error: console.error };
  const load = (W, files) => {
    const sb = { window: W, console: quiet };
    vm.createContext(sb);
    for (const f of files) vm.runInContext(readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
    return W;
  };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const lvl = (id, difficulty, rating, position, records, extra) => Object.assign({
    id, levelId: id, name: `L${id}`, difficulty, rating, position, publisher: "x", creators: ["x"], verifier: null,
    requirementPercent: 100,
    records: records.map(([player, progress, nationality]) => ({ player, progress, nationality: nationality || "US", subdivision: null })),
    gd: { inGameDifficulty: difficulty + " Demon", length: "XL" },
  }, extra || {});
  const unr = (id, difficulty, rating, records) => Object.assign(lvl(id, difficulty, rating, undefined, records), {
    name: `U${id}`, gd: { inGameDifficulty: "Unrated" }, added: "2026-10-30",
  });
  const world = () => {
    const W = {};
    W.SITE = {
      name: "Test", mainListSize: "extremes", extendedListSize: null, allowedDifficulties: ["Extreme", "Insane"],
      grindInProgress: 50, inProgressPoints: 0.25, futureList: true, futurePlus: true, ratedPlus: true, unratedWindow: 1,
      scoring: { topScore: 500, base: 1.176, legacyScore: 2, requirementScoreFraction: 0.25 },
      members: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].map((name) => ({ name, nationality: name === "P6" || name === "P7" ? "CA" : "US" })),
    };
    W.DEMONS = [
      lvl(1001, "Extreme", 30, 1, [["P1", 100], ["P2", 60]]),
      lvl(1002, "Extreme", 25, 2, [["P3", 100]]),
      lvl(1003, "Insane", 18, 3, [["P4", 80]], { requirementPercent: 50 }),
      lvl(1004, "Insane", 16, 4, [["P6", 30, "CA"]]),
    ];
    W.GOAL_LEVELS = {
      2001: { name: "Hard Off", difficulty: "Extreme", rating: 35, gd: { inGameDifficulty: "Extreme Demon", length: "XL" } },
      2002: { name: "Short Run", difficulty: "Extreme", rating: 28, gd: { inGameDifficulty: "Extreme Demon", length: "XL" } },
      2003: { name: "Plat", difficulty: "Extreme", rating: 26, gd: { inGameDifficulty: "Extreme Demon", length: "Plat." } },
      2004: { name: "Unrated In Game", difficulty: "Extreme", rating: 20, gd: { inGameDifficulty: "Unrated", length: "XL" } },
      3002: { name: "U3002 theme", palette: { accent: "#123456" }, writeup: { text: "w" } },
    };
    W.GOALS = [
      { player: "P2", levelId: 1001, best: 55, segments: [[30, 95]] }, // longest 30-95, over her 60% record
      { player: "P1", levelId: 1002, best: 90, segments: [] },          // listed, not beaten
      { player: "P3", levelId: 1002, best: 70, segments: [] },          // beaten already: nothing
      { player: "P5", levelId: 2001, best: 76, segments: [] },          // off the list, harder than #1
      { player: "P5", levelId: 2002, best: 40, segments: [[10, 55]] },  // 45 at most: Future+ only, labeled 40% (from the start)
      { player: "P3", levelId: 2002, best: null, segments: [[60, 80], [20, 45]] }, // practice runs only: 20-45%
      { player: "P6", levelId: 2003, best: 80, segments: [] },          // a platformer: never a row
      { player: "P7", levelId: 2004, best: 60, segments: [] },          // unrated in game, not on Rated+: never a row
      { player: "P1", levelId: 3002, best: 90, segments: [] },          // unrated, not beaten, a run over 50%
      { player: "P8", levelId: 3004, best: null, segments: [] },        // unrated, not beaten, no run yet
      { player: "P2", levelId: 3001, best: 70, segments: [] },          // unrated, beaten by P1
    ];
    W.UNRATED = [
      unr(3001, "Extreme", 27, [["P1", 100], ["P4", 52]]),               // beaten
      unr(3002, "Extreme", 31, []),                                       // not beaten: a Grind run over 50%
      unr(3003, "Insane", 17, [["P6", 76, "CA"], ["P7", 20, "CA"]]),      // not beaten: partial records
      unr(3004, "Insane", 15.5, []),                                      // not beaten: a goal with no run
      unr(3005, "Insane", 15, []),                                        // not beaten: nothing
    ];
    return load(W, ["static/js/list-utils.js", "static/js/goals.js", "static/js/views.js"]);
  };

  {
    const W = world(), DL = W.DL, S = W.SITE.scoring;
    const curve = (rating, top) => S.topScore * Math.pow(S.base, rating - top);
    const ids = (rows) => rows.map((r) => r.id);
    const proj = (v) => DL.projectedClears(v).map((x) => `${x.player}@${x.id}:${DL.runLabel(x.run)}`).sort();

    check("future views: DL.unratedBeaten", DL.unratedBeaten(W.UNRATED[0]) && !DL.unratedBeaten(W.UNRATED[1])
      && !DL.unratedBeaten(W.UNRATED[2]) && !DL.unratedBeaten(null));
    check("future views: DL.runLabel", DL.runLabel([0, 76]) === "76%" && DL.runLabel([42, 100]) === "42–100%" && DL.runLabel([0, 0]) === "0%");
    check("future views: DL.grindRun is the longest run, the first on a tie, null with none",
      eq(DL.grindRun({ best: 10, segments: [[3, 13], [5, 26], [79, 100]] }), [5, 26]) && DL.grindRun({ best: null, segments: [] }) === null
      && eq(DL.grindRun({ best: 39, segments: [[11, 53], [42, 100]] }), [42, 100]));
    const g3002 = DL.goalLevel(3002), g1001 = DL.goalLevel(1001), g2001 = DL.goalLevel(2001);
    check("future views: DL.goalLevel - listed first, then the unrated entry (tier, estimate) with goal-levels.js' palette, then goal-levels.js",
      g1001 === W.DEMONS[0] && g3002.rating === 31 && g3002.difficulty === "Extreme" && g3002.name === "U3002"
      && g3002.palette.accent === "#123456" && g3002.writeup.text === "w" && g2001 === W.GOAL_LEVELS[2001]
      && DL.goalLevel(3001) === W.UNRATED[0] && DL.goalLevel(9999) === null);

    const V = {};
    for (const [t, r] of VIEWS) V[t + "|" + r] = DL.listView(t, r, true);
    const want = {
      "current|rated": [1001, 1002, 1003, 1004],
      "current|plus": [1001, 3001, 1002, 1003, 1004],
      "future|rated": [2001, 1001, 1002, 1003, 1004],
      "future|plus": [2001, 3002, 1001, 3001, 1002, 1003, 3003, 1004],
      "plus|rated": [2001, 1001, 2002, 1002, 1003, 1004],
      "plus|plus": [2001, 3002, 1001, 2002, 3001, 1002, 1003, 3003, 1004, 3004],
    };
    const unrIds = new Set(W.UNRATED.map((u) => u.levelId));
    for (const [t, r] of VIEWS) {
      const v = V[t + "|" + r], what = `future views (fixture) ${t} + ${r}:`;
      check(`${what} the rows`, eq(ids(v.rows), want[t + "|" + r]), JSON.stringify(ids(v.rows)));
      check(`${what} positions 1..n`, v.rows.every((row, i) => row.position === i + 1));
      check(`${what} the listed demons keep today's order`, eq(v.rows.filter((x) => x.kind === "listed").map((x) => x.id), [1001, 1002, 1003, 1004]));
      const tr = v.rows.map((x) => DL.tierRank(x.level));
      check(`${what} extremes above insanes, main = the extremes`, tr.every((x, i) => !i || tr[i - 1] <= x)
        && v.rows.every((x) => (x.tier === "main") === (x.level.difficulty === "Extreme")));
      const top = Math.max(...v.rows.map((x) => DL.demonRating(x.level)));
      check(`${what} the hardest row is worth topScore, every row on the view's curve`,
        v.rows.every((x) => near(x.points, curve(DL.demonRating(x.level), top))) && v.rows.some((x) => x.points === S.topScore));
      // unrated levels: nowhere in Rated; in Rated+ a beaten one is an "unrated" row, the rest Grind-like (unrated: true)
      if (r === "rated") {
        check(`${what} no unrated level anywhere`, v.rows.every((x) => !unrIds.has(x.id)) && v.unrated.length === 0
          && !v.recordLevels.some((lv) => unrIds.has(lv.levelId)));
      } else {
        check(`${what} the beaten unrated level is an unrated row`, eq(ids(v.unrated), [3001]) && v.row(3001).kind === "unrated");
        check(`${what} a not-beaten unrated row is kind grind + unrated`, v.rows.filter((x) => unrIds.has(x.id) && x.id !== 3001)
          .every((x) => x.kind === "grind" && x.unrated === true && v.joining.includes(x)));
        check(`${what} every unrated level's records score (recordLevels)`, W.UNRATED.every((u) => v.recordLevels.includes(u)));
        check(`${what} only the beaten one is credited`, v.creditLevels.includes(W.UNRATED[0]) && !v.creditLevels.includes(W.UNRATED[1]));
      }
      check(`${what} 2003 (a platformer) and 2004 (unrated in game, not on Rated+) are never rows`, !v.row(2003) && !v.row(2004));
    }

    // the projected clears, with their labels
    check("future views: the Current views project nothing", proj(V["current|rated"]).length === 0 && proj(V["current|plus"]).length === 0);
    check("future views: Future + Rated - the In Progress levels", eq(proj(V["future|rated"]),
      ["P1@1002:90%", "P2@1001:30–95%", "P4@1003:80%", "P5@2001:76%"]), JSON.stringify(proj(V["future|rated"])));
    check("future views: Future + Rated+ - and the unrated ones, beaten or not", eq(proj(V["future|plus"]),
      ["P1@1002:90%", "P1@3002:90%", "P2@1001:30–95%", "P2@3001:70%", "P4@1003:80%", "P4@3001:52%", "P5@2001:76%", "P6@3003:76%"]),
      JSON.stringify(proj(V["future|plus"])));
    check("future views: Future+ + Rated - every Grind level and record under 100%", eq(proj(V["plus|rated"]),
      ["P1@1002:90%", "P2@1001:30–95%", "P3@2002:20–45%", "P4@1003:80%", "P5@2001:76%", "P5@2002:40%", "P6@1004:30%"]),
      JSON.stringify(proj(V["plus|rated"])));
    check("future views: Future+ + Rated+ - a goal with no run yet is 0%", eq(proj(V["plus|plus"]),
      ["P1@1002:90%", "P1@3002:90%", "P2@1001:30–95%", "P2@3001:70%", "P3@2002:20–45%", "P4@1003:80%", "P4@3001:52%", "P5@2001:76%",
        "P5@2002:40%", "P6@1004:30%", "P6@3003:76%", "P7@3003:20%", "P8@3004:0%"]), JSON.stringify(proj(V["plus|plus"])));
    check("future views: an In Progress level has the same label in Future and Future+", DL.projectedClears(V["future|plus"]).every((x) =>
      DL.projectedClears(V["plus|plus"]).some((y) => y.player === x.player && y.id === x.id && eq(y.run, x.run))));
    check("future views: DL.inProgressScores adds nothing in the Future views", ["future|rated", "future|plus", "plus|rated", "plus|plus"]
      .every((k) => DL.inProgressScores(V[k]).length === 0 && V[k].players.every((p) => p.inProgress.length === 0)));

    // every player's score from scratch: real clears + the records a projected clear doesn't
    // replace + projected clears at full points (Future), or + in-progress extras (Current)
    for (const [t, r] of VIEWS) {
      const v = V[t + "|" + r], what = `future views (fixture) ${t} + ${r}:`;
      const pj = DL.projectedClears(v), byKey = {};
      pj.forEach((x) => { byKey[x.player + "|" + x.id] = x; });
      const sums = {};
      v.recordLevels.forEach((lv) => (lv.records || []).forEach((rec) => {
        if (rec.progress < 100 && byKey[rec.player + "|" + lv.levelId]) return;
        sums[rec.player] = (sums[rec.player] || 0) + v.recordScore(lv, rec.progress);
      }));
      pj.forEach((x) => { sums[x.player] = (sums[x.player] || 0) + v.row(x.id).points; });
      DL.inProgressScores(v).forEach((x) => { sums[x.player] = (sums[x.player] || 0) + x.extra; });
      check(`${what} every score = clears + projected clears (full points) + in-progress extras`,
        v.players.every((p) => near(p.score, sums[p.name] || 0)), JSON.stringify(v.players.map((p) => [p.name, p.score, sums[p.name]])));
      check(`${what} ranked by score`, v.players.every((p, i) => p.rank === i + 1 && (!i || v.players[i - 1].score >= p.score - 1e-9)));
      check(`${what} projected clears are in completed, marked, with the run - never in progressed`, pj.every((x) => {
        const p = v.players.find((q) => q.name === x.player);
        const c = p && p.completed.find((y) => y.demon.id === x.id);
        return c && c.projected === true && eq(c.run, x.run) && c.progress === 100 && !p.progressed.some((y) => y.demon.id === x.id);
      }));
      check(`${what} the real clears aren't marked`, v.players.every((p) => p.completed.filter((c) => !c.projected)
        .every((c) => (c.demon.records || []).some((rec) => rec.player === p.name && rec.progress >= 100))));
      check(`${what} the hardest is the top row among completed, real or projected`, v.players.every((p) => {
        if (!p.completed.length) return p.hardest === null;
        return p.hardest === p.completed.reduce((b, c) => (!b || v.pos(c.demon) < v.pos(b) ? c.demon : b), null);
      }));
      check(`${what} today's score and rank beside it (Current + Rated's)`, v.isDefault || v.players.every((p) => {
        const today = DL.aggregatePlayers().find((q) => q.name === p.name);
        return today ? p.scoreNow === today.score && p.rankNow === today.rank : p.scoreNow === 0 && p.rankNow === null;
      }));
    }

    // the worked numbers
    const fr = V["future|rated"], fu = V["future|plus"], ff = V["plus|plus"], cp = V["current|plus"];
    const P = (v, name) => v.players.find((p) => p.name === name);
    check("future views: Future - P5's 76% on Hard Off (the hardest) counts as a clear: topScore", near(P(fr, "P5").score, S.topScore)
      && (P(fr, "P5").hardest || {}).levelId === 2001 && P(fr, "P5").completed.length === 1, JSON.stringify(P(fr, "P5").score));
    check("future views: Future - P2's 60% record on L1001 is replaced, not added to", near(P(fr, "P2").score, fr.row(1001).points));
    check("future views: Future - P4's 80% (which scored on its own) is replaced by the full points", near(P(fr, "P4").score, fr.row(1003).points)
      && !P(fr, "P4").progressed.length);
    check("future views: Future - P6's 30% isn't In Progress: it stays there, scoring what it scores", P(fr, "P6").progressed.length === 1
      && P(fr, "P6").completed.length === 0 && near(P(fr, "P6").score, 0));
    check("future views: Future - P1: a clear + a projected clear; the hardest is the real L1001",
      near(P(fr, "P1").score, fr.row(1001).points + fr.row(1002).points) && (P(fr, "P1").hardest || {}).levelId === 1001);
    check("future views: Future+ + Rated+ - P8's goal with no run counts (0%)", near(P(ff, "P8").score, ff.row(3004).points)
      && (P(ff, "P8").completed[0] || {}).projected === true && eq((P(ff, "P8").completed[0] || {}).run, [0, 0]));
    check("future views: Future+ + Rated+ - P7's 20% record on U3003 counts in full", near(P(ff, "P7").score, ff.row(3003).points));
    check("future views: Future + Rated+ - P7's 20% isn't In Progress: it stays there", P(fu, "P7").progressed.length === 1
      && P(fu, "P7").progressed[0].demon.levelId === 3003 && P(fu, "P7").completed.length === 0);

    // Rated+ in the Current views: in-progress points
    const ipc = DL.inProgressScores(cp), ipr = DL.inProgressScores(null);
    const key = (xs) => xs.map((x) => x.player + "@" + x.id).sort().join(" ");
    // (P4's 80% on L1003 already scores more than a quarter would: nothing on top)
    check("rated+: Current + Rated - no unrated level counts", key(ipr) === "P1@1002 P2@1001 P5@2001", key(ipr));
    check("rated+: Current + Rated+ - runs on unrated levels count, beaten or not", key(ipc) ===
      "P1@1002 P1@3002 P2@1001 P2@3001 P4@3001 P5@2001 P6@3003", key(ipc));
    const u3002 = ipc.find((x) => x.id === 3002), u3003 = ipc.find((x) => x.id === 3003), u3001 = ipc.find((x) => x.player === "P4" && x.id === 3001);
    check("rated+: Current + Rated+ - one nobody has beaten isn't shown: from its estimate, capped at topScore",
      !!u3002 && !u3002.shown && near(u3002.points, 0.25 * S.topScore * 0.9) && !!u3003 && !u3003.shown && near(u3003.points, 0.25 * curve(17, cp.top) * 0.76),
      JSON.stringify([u3002, u3003]));
    check("rated+: Current + Rated+ - a beaten one (a row) counts from its row", !!u3001 && u3001.shown && near(u3001.points, 0.25 * cp.row(3001).points * 0.52));
    check("rated+: Current + Rated+ - the ones nobody has beaten aren't rows", [3002, 3003, 3004, 3005].every((id) => cp.row(id) === null));

    // links
    const U = (id) => W.UNRATED.find((u) => u.levelId === id);
    check("rated+: links - beaten -> its demon page; not beaten, with Grind goals -> its Grind page; else its demon page",
      /^demon\.html\?id=3001&/.test(cp.url(U(3001))) && /^goal\.html\?level=3002&/.test(cp.url(U(3002)))
      && /^demon\.html\?id=3003&/.test(cp.url(U(3003))) && /^goal\.html\?level=3004&/.test(ff.url(U(3004)))
      && /^demon\.html\?id=3005&/.test(ff.url(U(3005))), JSON.stringify([cp.url(U(3001)), cp.url(U(3002)), cp.url(U(3003)), ff.url(U(3004)), ff.url(U(3005))]));
    check("rated+: links carry the view", /time=plus/.test(ff.url(U(3004))) && /rating=plus/.test(ff.url(U(3004))));

    // the stats viewer's Grind rows and chips (DL.grindLevelShown)
    const dv = V["current|rated"];
    check("rated+: Grind goals on an unrated level show in the Rated+ views only", !DL.grindLevelShown(3002, dv)
      && !DL.grindLevelShown(3002, V["plus|rated"]) && !DL.grindLevelShown(3002, null) && DL.grindLevelShown(3002, cp) && DL.grindLevelShown(3002, ff));
    check("rated+: ...and on a level that's unrated in game but not on Rated+", [dv, fr, null].every((v) => !DL.grindLevelShown(2004, v))
      && [cp, ff].every((v) => DL.grindLevelShown(2004, v)));
    check("rated+: every other goal shows everywhere", [dv, cp, fr, ff, null].every((v) => DL.grindLevelShown(1001, v) && DL.grindLevelShown(2001, v)));
    W.SITE.ratedPlus = false;
    check("rated+: without Rated+ every goal shows (Nigel's Demonlist)", [3002, 2004, 1001].every((id) => DL.grindLevelShown(id, null)));
    W.SITE.ratedPlus = true;

    // nations: their players' projected clears, once each
    for (const [t, r] of VIEWS) {
      const v = V[t + "|" + r], what = `future views (fixture) ${t} + ${r}: nations -`;
      const ns = v.nations();
      check(`${what} each scores its players`, ns.every((n) => near(n.score, n.players.reduce((s, name) => s + v.players.find((p) => p.name === name).score, 0))));
      for (const n of ns) {
        const members = n.players.map((name) => v.players.find((p) => p.name === name));
        const realIds = new Set(n.completed.filter((c) => !c.projected).map((c) => c.demon.id));
        const pjIds = new Set();
        members.forEach((p) => p.completed.forEach((c) => { if (c.projected && !realIds.has(c.demon.id)) pjIds.add(c.demon.id); }));
        const rows = n.completed.filter((c) => c.projected);
        check(`${what} ${n.code}: each projected level once, unless a member beat it`, eq(rows.map((c) => c.demon.id).sort(), [...pjIds].sort())
          && rows.length === new Set(rows.map((c) => c.demon.id)).size, JSON.stringify(rows.map((c) => c.demon.id)));
        check(`${what} ${n.code}: labeled with the longest run among them, and who has which`, rows.every((c) => {
          const runs = members.flatMap((p) => p.completed.filter((y) => y.projected && y.demon.id === c.demon.id).map((y) => ({ player: p.name, run: y.run })));
          const longest = Math.max(...runs.map((x) => x.run[1] - x.run[0]));
          return eq(c.runs, runs) && c.run[1] - c.run[0] === longest && eq(c.players, runs.map((x) => x.player));
        }));
        check(`${what} ${n.code}: they leave In Progress and Unbeaten`, n.progressed.every((x) => !pjIds.has(x.demon.id) && !realIds.has(x.demon.id))
          && n.unbeaten.every((d) => !pjIds.has(d.id)));
        const hardest = n.completed.concat(n.verified).reduce((b, c) => (!b || v.pos(c.demon) < v.pos(b) ? c.demon : b), null);
        check(`${what} ${n.code}: the hardest follows`, n.hardest === hardest);
        if (t === "current") check(`${what} ${n.code}: nothing projected in the Current views`, rows.length === 0);
      }
    }
    const us = ff.nations().find((n) => n.code === "US"), ca = ff.nations().find((n) => n.code === "CA");
    const c3001 = (us || { completed: [] }).completed.filter((c) => c.demon.id === 3001);
    check("future views: nations - a level a member really beat stays a real clear (US, U3001: P1's 100%)", c3001.length === 1 && !c3001[0].projected
      && eq(c3001[0].players, ["P1"]));
    const c3003 = (ca || { completed: [] }).completed.find((c) => c.demon.id === 3003);
    check("future views: nations - CA's U3003: P6's 76% beats P7's 20%, and the title says who has which", c3003 && c3003.projected
      && eq(c3003.run, [0, 76]) && eq(c3003.runs.map((x) => x.player + ":" + DL.runLabel(x.run)).sort(), ["P6:76%", "P7:20%"]));

    // the default view is today's list, bit for bit
    check("future views: Current + Rated's players are today's (===)", eq(dv.players.map((p) => [p.name, p.score, p.rank]),
      DL.aggregatePlayers().map((p) => [p.name, p.score, p.rank])));
    check("future views: Current + Rated - nothing projected, no marks", dv.players.every((p) => p.completed.every((c) => !c.projected)));

    // the list page's words (DL.renderListPage; the default view is demonlist.js' overview)
    DL.escapeHtml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const [t, r] of VIEWS.slice(1)) {
      const v = V[t + "|" + r], main = { innerHTML: "" };
      DL.renderListPage(main, v);
      const html = main.innerHTML, what = `future views (fixture) ${t} + ${r}: the list page -`;
      if (t === "future") {
        check(`${what} says In Progress counts as beaten`, html.includes("In this view, every level in someone's In Progress counts as beaten for them, with its full points (shown with the % they have now)."));
      } else if (t === "plus") {
        check(`${what} says the Grind counts as beaten`, html.includes("In this view, every level in someone's Grind counts as beaten for them, with its full points (shown with the % they have now)."));
      }
      if (t !== "current") check(`${what} no quarter-points sentence`, !/a quarter/.test(html), html);
      const same = v.players.every((p) => p.rank === p.rankNow);
      check(`${what} the ranking line is true`, same ? !html.includes("ranking changes") : html.includes("The player ranking changes"));
      if (r === "plus") check(`${what} says Rated+ adds the unrated levels someone has beaten`, html.includes("someone has beaten"));
    }
  }

  // the mod page: list-utils.js and views.js, no static/js/goals.js
  {
    const base = world(), W = {};
    ["SITE", "DEMONS", "GOAL_LEVELS", "GOALS", "UNRATED"].forEach((k) => { W[k] = JSON.parse(JSON.stringify(base[k])); });
    load(W, ["static/js/list-utils.js", "static/js/views.js"]);
    let ok = false, why = "";
    try {
      const v = W.DL.listView("current", "plus", true), u1 = W.UNRATED[0], u2 = W.UNRATED[1];
      ok = v.pos(u1) === 2 && v.pos(u2) === null && W.DL.unratedBeaten(u1) && !W.DL.unratedBeaten(u2)
        && v.players.length > 0 && W.DL.projectedClears(v).length === 0;
      why = JSON.stringify([v.pos(u1), v.pos(u2)]);
    } catch (e) {
      why = String(e && e.stack);
    }
    check("future views: the mod page's Current + Rated+ builds without goals.js; a beaten unrated level has its spot", ok, why);
  }

  // the real data, the flags on: the same rules, as invariants
  {
    const W = {};
    load(W, ["data/config.js", "data/demons.js", "data/goals.js", "data/goal-levels.js"]);
    if (existsSync(path.join(ROOT, "data", "unrated.js"))) load(W, ["data/unrated.js"]);
    load(W, ["static/js/list-utils.js", "static/js/goals.js", "static/js/views.js"]);
    const DL = W.DL, SITE = W.SITE;
    SITE.futureList = SITE.futurePlus = SITE.ratedPlus = true;
    if (typeof SITE.grindInProgress !== "number") SITE.grindInProgress = 50;
    const hasClear = (lv, name) => (lv.records || []).some((rec) => rec.player === name && rec.progress >= 100);
    for (const [t, r] of VIEWS) {
      const v = DL.listView(t, r, true), what = `future views (real) ${t} + ${r}:`;
      const pj = DL.projectedClears(v);
      check(`${what} projections only in the Future views, each on a row the player hasn't beaten`, t === "current" ? pj.length === 0
        : pj.every((x) => v.row(x.id) && !hasClear(v.row(x.id).level, x.player)));
      if (t === "future") {
        const missed = (W.GOALS || []).filter((g) => {
          const row = v.row(Number(g.levelId));
          return DL.grindInProgressRun(g) && row && !hasClear(row.level, g.player)
            && !pj.some((x) => x.player === g.player && x.id === Number(g.levelId));
        });
        check(`${what} every In Progress Grind goal on a row they haven't beaten is projected`, !missed.length, JSON.stringify(missed));
      }
      if (t === "plus") {
        const missed = (W.GOALS || []).filter((g) => {
          const row = v.row(Number(g.levelId));
          return row && !hasClear(row.level, g.player) && !pj.some((x) => x.player === g.player && x.id === Number(g.levelId));
        });
        check(`${what} every Grind goal on a row they haven't beaten is projected`, !missed.length, JSON.stringify(missed));
      }
      const byKey = {}, sums = {};
      pj.forEach((x) => { byKey[x.player + "|" + x.id] = x; });
      v.recordLevels.forEach((lv) => (lv.records || []).forEach((rec) => {
        if (rec.progress < 100 && byKey[rec.player + "|" + lv.levelId]) return;
        sums[rec.player] = (sums[rec.player] || 0) + v.recordScore(lv, rec.progress);
      }));
      pj.forEach((x) => { sums[x.player] = (sums[x.player] || 0) + v.row(x.id).points; });
      DL.inProgressScores(v).forEach((x) => { sums[x.player] = (sums[x.player] || 0) + x.extra; });
      check(`${what} every score = clears + projected clears + in-progress extras`, v.players.every((p) => near(p.score, sums[p.name] || 0)));
      check(`${what} positions 1..n, the listed demons in today's order`, v.rows.every((x, i) => x.position === i + 1)
        && eq(v.rows.filter((x) => x.kind === "listed").map((x) => x.id), DL.sortedDemons().map((d) => d.levelId)));
    }
    const dv = DL.listView("current", "rated", true);
    check("future views (real): Current + Rated is today's ranking (===), nothing projected", eq(dv.players.map((p) => [p.name, p.score, p.rank]),
      DL.aggregatePlayers().map((p) => [p.name, p.score, p.rank])) && dv.players.every((p) => p.completed.every((c) => !c.projected)));

    // Nigel's examples, while the Grind is as it was on 2026-10-30 (Aceabase only):
    // Dihmaster500's Slaughterhouse - off the list, harder than the #1, 76% from the
    // start in his Grind - counts for him in Future as beaten, worth topScore there;
    // Nigel's Congregation (on the list) by its 42-100 run; Dihmaster500's Tartarus,
    // 10% at best from the start, in Future+.
    const goal = (player, id) => (W.GOALS || []).find((g) => g.player === player && Number(g.levelId) === id);
    const SH = 27690100, CONG = 68668045, TART = 59075347, dih = "Dihmaster500";
    const gSH = goal(dih, SH), gCong = goal("Nigel", CONG), gTart = goal(dih, TART);
    const shLevel = DL.goalLevel(SH), cong = DL.demonById(CONG);
    const asOf = !!(gSH && gCong && gTart && shLevel && cong) && SITE.inProgressPoints > 0
      && gSH.best === 76 && eq(DL.grindInProgressRun(gSH), [0, 76])
      && !DL.demonById(SH) && !DL.unratedById(SH) && DL.demonRating(shLevel) > DL.topRating()
      && eq(DL.grindInProgressRun(gCong), [42, 100]) && !hasClear(cong, "Nigel")
      && gTart.best === 10 && !DL.grindInProgressRun(gTart) && !DL.demonById(TART);
    if (!asOf) console.log("(skipping Nigel's Future examples - this isn't Aceabase's Grind as of 2026-10-30)");
    else {
      const today = DL.listView("current", "rated", true), fut = DL.listView("future", "rated", true), fplus = DL.listView("plus", "rated", true);
      const P = (v, name) => v.players.find((p) => p.name === name);
      const p = P(fut, dih), t = P(today, dih);
      const c = p.completed.find((x) => x.demon.id === SH);
      const mine = DL.projectedClears(fut).filter((x) => x.player === dih);
      check("future views (real): Future - Slaughterhouse joins at #1, worth topScore", fut.pos(SH) === 1 && fut.points(SH) === SITE.scoring.topScore,
        JSON.stringify([fut.pos(SH), fut.points(SH)]));
      check("future views (real): Future - Dihmaster500's Slaughterhouse counts as beaten, with its full points, labeled (76%)",
        c && c.projected === true && eq(c.run, [0, 76]) && DL.runLabel(c.run) === "76%"
        && mine.some((x) => x.id === SH && x.points === SITE.scoring.topScore), JSON.stringify(c && c.run));
      let sum = 0;
      fut.recordLevels.forEach((lv) => (lv.records || []).forEach((rec) => {
        if (rec.player === dih && !(rec.progress < 100 && mine.some((x) => x.id === lv.levelId))) sum += fut.recordScore(lv, rec.progress);
      }));
      mine.forEach((x) => { sum += x.points; });
      check("future views (real): Future - his score has its full points, in place of the quarter points", near(p.score, sum)
        && !p.inProgress.length, JSON.stringify([p.score, sum]));
      check("future views (real): Future - Demons beaten and Hardest include it, In Progress doesn't",
        p.completed.length === t.completed.length + mine.length && (p.hardest || {}).levelId === SH
        && !p.progressed.some((x) => x.demon.levelId === SH), JSON.stringify([p.completed.length, t.completed.length, mine.length]));
      check("future views (real): Current + Rated is unchanged - Slaughterhouse in his In Progress for a quarter of topScore x 76%",
        today.isDefault && !t.completed.some((x) => x.projected || x.demon.levelId === SH) && (t.hardest || {}).levelId !== SH
        && t.inProgress.some((x) => x.id === SH && near(x.points, SITE.inProgressPoints * SITE.scoring.topScore * 0.76))
        && eq(today.players.map((x) => [x.name, x.score, x.rank]), DL.aggregatePlayers().map((x) => [x.name, x.score, x.rank])));
      const nig = P(fut, "Nigel").completed.find((x) => x.demon.id === CONG);
      const tart = P(fplus, dih).completed.find((x) => x.demon.id === TART);
      check("future views (real): the labels - Congregation (42–100%) in Future, Tartarus (10%) in Future+",
        nig && nig.projected && DL.runLabel(nig.run) === "42–100%" && tart && tart.projected && DL.runLabel(tart.run) === "10%"
        && !P(fut, dih).completed.some((x) => x.demon.id === TART), JSON.stringify([nig && nig.run, tart && tart.run]));
    }
  }
}

// --- Rated+ in the engine, offline: tools/apply-edit.py on a copy of the site ----------------
// A temp copy (no .git, videos or __pycache__) with Rated+ turned on and a fixture
// data/unrated.js; apply-edit.py is imported FROM the copy. gdbrowser answers from
// FAKE (Engine.unrated_facts runs the real parsing on it), nothing else answers at
// all (curl), and running another tool (add-records.py, ...) fails the step.

{
  const PYENGINE = String.raw`
import importlib.util, io, json, os, shutil, sys, tempfile
sys.dont_write_bytecode = True
results = []
def ok(label, cond, detail=""):
    results.append({"label": label, "ok": bool(cond), "detail": "" if cond else str(detail)[:400]})

out, sys.stdout = sys.stdout, sys.stderr  # the engine's own output goes to stderr; stdout is the results
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
tmp = tempfile.mkdtemp(prefix="unrated-test-")
root = os.path.join(tmp, "site")
try:
    shutil.copytree(sys.argv[1], root, ignore=shutil.ignore_patterns(".git", "videos", "__pycache__"))
    with io.open(os.path.join(root, "data", "config.js"), "a", encoding="utf-8", newline="") as f:
        f.write("\nwindow.SITE.ratedPlus = true;\n")
    spec = importlib.util.spec_from_file_location("apply_edit_copy", os.path.join(root, "tools", "apply-edit.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    sys.stdout = sys.stderr

    # FAKE: gdbrowser's answers for add_unrated; GB: its stand-in's (gd_servers), which
    # the Rated+ checks on clears and Grind goals see (Engine.in_game)
    FAKE, GB, ran = {}, {}, []
    m.curl = lambda url, timeout=30: (0, "")
    m.gd_servers = lambda lid: GB.get(lid)
    m.Engine.unrated_facts = lambda self, lid: m.unrated_facts_from(lid, 200, json.dumps(FAKE[lid]))
    m.Engine.showcase_thumb = lambda self, vid: "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg"

    class Ran:  # what run_tool returns
        def __init__(self, code):
            self.returncode, self.stdout, self.stderr = code, "", ""

    def build_goal_levels(r):
        """build-goal-levels.py without the network: a new Grind level gets its name
        from FAKE / GB, the rest keep what they have"""
        st = m.load_state(r)
        gl = st["GOAL_LEVELS"]
        for g in st["GOALS"]:
            k = str(g["levelId"])
            if k not in gl:
                f = FAKE.get(g["levelId"]) or GB.get(g["levelId"]) or {}
                gl[k] = {"name": f.get("name") or "Level " + k, "publisher": f.get("author"),
                         "difficulty": (f.get("difficulty") or "").replace(" Demon", "") or "Extreme", "rating": None,
                         "levelId": g["levelId"], "description": None, "requirementPercent": 100,
                         "gd": {"inGameDifficulty": f.get("difficulty") or "Unrated"}}
        src = m.read(r, "data/goal-levels.js")
        i = src.index("window.GOAL_LEVELS =")
        m.write(r, "data/goal-levels.js", src[:i] + "window.GOAL_LEVELS = " + json.dumps(gl, indent=2, ensure_ascii=False) + ";\n")

    def no_tools(_root, args, timeout=900):
        ran.append(args[0])
        if args[0] == "build-goal-levels.py":  # a Grind edit
            build_goal_levels(_root)
            return Ran(0)
        if args[0] == "apply-showcases.py":  # a level new to the site: "couldn't read the channel"
            return Ran(1)
        raise m.Refuse("(test) " + args[0] + " was run")
    m.run_tool = no_tools

    s = m.load_state(root)
    site, L = s["SITE"], sorted(s["DEMONS"], key=lambda d: d["position"])
    taken = {d["levelId"] for d in L} | {g["levelId"] for g in s["GOALS"]} | {int(k) for k in s["GOAL_LEVELS"]}
    taken |= {int(k) for k in m.Engine(root).showcase_overrides()}
    free = [i for i in range(990000001, 990000200) if i not in taken]
    F, U1, U2, U3, U4, U5 = free[:6]
    for lid in (F, U1, U2, U3, U4, U5):
        FAKE[lid] = {"name": "Fixture " + str(lid), "author": "Someone", "difficulty": "Unrated", "stars": 0,
                     "length": "Long", "objects": 1234, "gameVersion": "2.2"}
    FAKE[U3]["stars"] = 10
    roster = s["SITE"].get("members") or []
    A, B, T = roster[0]["name"], roster[1]["name"], "Unrated Tester"
    cfg, _ = m.tool(root, "add-records").roster_add(m.read(root, "data/config.js"), [(T, "US", None)])
    m.write(root, "data/config.js", cfg)
    m.write_unrated(root, [{"id": F, "name": "Fixture " + str(F), "difficulty": "Extreme", "rating": 25,
                            "publisher": "Someone", "creators": ["Someone"], "verifier": None, "videoUrl": None,
                            "thumbnailUrl": None, "levelId": F, "description": None, "requirementPercent": 100,
                            "records": [{"player": T, "progress": 40, "nationality": "US", "subdivision": None}],
                            "gd": {"length": "Long", "inGameDifficulty": "Unrated"}, "added": "2026-10-30"}])

    def state():
        return m.load_state(root)
    def entry(lid):
        return next((u for u in state()["UNRATED"] if u["levelId"] == lid), None)
    def top_note():
        return state()["CHANGELOG"][0]["items"][0]
    def run(ops, role="head"):
        """(None, say lines) when it went through and check() passed, else (why, lines).
        A refused run leaves data/ as it found it, like the real one (restore())."""
        data = os.path.join(root, "data")
        kept = {f: m.read(root, "data/" + f) for f in os.listdir(data)}
        e = m.Engine(root, role)
        try:
            p = m.validate({"requestId": "0" * 16, "editor": "Nigel", "role": role, "ops": ops})
            e.apply(p["ops"])
            m.check(root)
            return None, e.lines
        except m.Refuse as x:
            for f, text in kept.items():
                m.write(root, "data/" + f, text)
            return str(x), e.lines

    try:
        m.check(root)
        ok("engine: the fixture data/unrated.js checks out", True)
    except m.Refuse as x:
        ok("engine: the fixture data/unrated.js checks out", False, x)
    head = m.read(root, "data/unrated.js")
    ok("engine: data/unrated.js keeps its header", head.startswith(m.UNRATED_HEADER.split("window.UNRATED")[0]), head[:200])

    err, _ = run([{"op": "add_unrated", "level": U1, "rating": 19.99}])
    u = entry(U1)
    ok("engine: add_unrated with no tier - 19.99 counts as an Insane", err is None and u and u["difficulty"] == "Insane"
       and u["rating"] == 19.99 and "placeBelow" not in u, err or u)
    ok("engine: an unrated entry has its keys in order", u and list(u) == [k for k in m.UNRATED_KEYS if k != "placeBelow"], u and list(u))
    ok("engine: add_unrated keeps gdbrowser's facts", u and u["publisher"] == "Someone" and u["creators"] == ["Someone"]
       and u["verifier"] is None and u["records"] == [] and u["videoUrl"] is None and u["requirementPercent"] == 100
       and u["gd"] == {"length": "Long", "objects": 1234, "gameVersion": "2.2", "inGameDifficulty": "Unrated"}, u)
    ok("engine: add_unrated logs a note", top_note() == {"kind": "note", "text": "Rated+: Fixture " + str(U1)
       + " is on as an unrated Insane, GDDL estimate 19.99."}, top_note())

    err, _ = run([{"op": "add_unrated", "level": U2, "rating": 20}])
    u = entry(U2)
    ok("engine: add_unrated with no tier - 20 counts as an Extreme", err is None and u and u["difficulty"] == "Extreme"
       and u["rating"] == 20, err or u)

    err, _ = run([{"op": "add_unrated", "level": U3, "rating": 25}])
    ok("engine: a rated level (10 stars) is refused", err and "is rated (10 stars)" in err and entry(U3) is None, err)
    err, _ = run([{"op": "add_unrated", "level": U2, "rating": 25}])
    ok("engine: an unrated level can't be added twice", err and "already an unrated level" in err, err)
    err, _ = run([{"op": "add_unrated", "level": L[0]["levelId"], "rating": 25}])
    ok("engine: a level on the list can't be added", err and "on the list already" in err, err)

    mid = L[len(L) // 2]
    t4 = mid["difficulty"] if mid["difficulty"] in ("Extreme", "Insane") else "Extreme"
    r4 = round(m.rating_value(mid, site) * 100) / 100
    u4 = {"levelId": U4, "difficulty": t4, "rating": r4}
    slots = m.unrated_slots(u4, s["DEMONS"], site)
    bad = next(a for a in [0] + [d["levelId"] for d in L] if a not in slots)
    good = slots[-1]
    err, _ = run([{"op": "add_unrated", "level": U4, "rating": r4, "difficulty": t4, "placeBelow": bad}])
    ok("engine: a spot outside the window is refused", err and "outside" in err and "window" in err and entry(U4) is None, err)
    err, _ = run([{"op": "add_unrated", "level": U4, "rating": r4, "difficulty": t4, "placeBelow": good}])
    u = entry(U4)
    ok("engine: a spot inside the window is saved", err is None and u and u.get("placeBelow") == good
       and list(u)[:6] == ["id", "name", "difficulty", "rating", "placeBelow", "publisher"], err or u)
    ok("engine: ...and logged", "placed by hand" in top_note()["text"], top_note())

    far = next(c for c in (49.5, 1.5, 40, 10, 45, 5) if not m.slot_ok(dict(u4, rating=c), good, state()["DEMONS"], site))
    err, lines = run([{"op": "set_unrated", "level": U4, "rating": far}])
    u = entry(U4)
    ok("engine: a new estimate drops a spot that no longer fits", err is None and u and u["rating"] == far
       and "placeBelow" not in u and any("no longer fits" in x for x in lines), err or (u, lines))
    err, lines = run([{"op": "set_unrated", "level": U4, "rating": far}])
    ok("engine: set_unrated with nothing new is no change", err is None and any("no change" in x for x in lines), err or lines)

    ran.clear()
    err, _ = run([{"op": "add_record", "player": A, "level": F, "progress": 100}], role="mod")
    u = entry(F)
    rec = next((r for r in (u or {}).get("records", []) if r["player"] == A), None)
    nat = next((x.get("nationality") for x in roster if x["name"] == A), None)
    ok("engine: a mod's 100% on an unrated level - record, verifier, note; add-records.py isn't run",
       err is None and rec and rec["progress"] == 100 and rec["nationality"] == nat and u["verifier"] == A and not ran
       and top_note() == {"kind": "note", "text": A + " beat " + u["name"] + " (unrated - counts in Rated+)."}, err or (u, ran))
    err, _ = run([{"op": "add_record", "player": B, "level": F, "progress": 60}])
    rec = next((r for r in entry(F)["records"] if r["player"] == B), None)
    ok("engine: 60% on an unrated level is fine", err is None and rec and rec["progress"] == 60 and entry(F)["verifier"] == A and not ran, err or rec)
    err, _ = run([{"op": "add_record", "player": B, "level": F, "progress": 100}])
    rec = next((r for r in entry(F)["records"] if r["player"] == B), None)
    ok("engine: ...and goes up to 100%", err is None and rec and rec["progress"] == 100 and len(entry(F)["records"]) == 3, err or entry(F))

    err, _ = run([{"op": "set_record_video", "player": A, "level": F, "url": "https://youtu.be/abcdefghijk"}])
    ok("engine: no videos on unrated levels' clears yet", err and "is an unrated level - videos on its clears aren't supported yet" in err, err)

    err, _ = run([{"op": "remove_record", "player": A, "level": F}])
    u = entry(F)
    ok("engine: remove_record on an unrated level - the record goes, the verifier moves, the level stays",
       err is None and u and u["verifier"] == B and not any(r["player"] == A for r in u["records"])
       and top_note() == {"kind": "note", "text": A + "'s record on " + u["name"] + " (unrated) was removed."}, err or u)

    err, _ = run([{"op": "remove_unrated", "level": U1}])
    ok("engine: remove_unrated - gone, and logged", err is None and entry(U1) is None
       and top_note() == {"kind": "note", "text": "Rated+: Fixture " + str(U1) + " is off."}, err or top_note())

    err, _ = run([{"op": "remove_member", "name": T}])
    ok("engine: remove_member is refused while they hold an unrated record", err and "(unrated)" in err, err)
    err, _ = run([{"op": "rename_member", "name": T, "newName": "Unrated Tester2"}])
    ok("engine: rename_member renames their unrated records", err is None
       and any(r["player"] == "Unrated Tester2" for r in entry(F)["records"]), err or entry(F))
    # (a country whose flag is already there: a missing one would be downloaded)
    cc = next((c for c in ("MX", "CA", "GB") if os.path.exists(os.path.join(root, "static", "images", "flags", c.lower() + ".svg"))), None)
    if cc:
        err, _ = run([{"op": "set_member_country", "name": "Unrated Tester2", "nationality": cc}])
        ok("engine: set_member_country moves their unrated records too", err is None
           and next(r for r in entry(F)["records"] if r["player"] == "Unrated Tester2")["nationality"] == cc, err or entry(F))

    # a demon with one clear (and no Grind goal) leaves the list: the unrated level
    # placed right below it is reported
    grind = {g["levelId"] for g in s["GOALS"]}
    lone = next((d for d in L if len(d.get("records", [])) == 1 and d["difficulty"] in ("Extreme", "Insane")
                 and d["levelId"] not in grind), None)
    if lone:
        u5 = {"levelId": U5, "difficulty": lone["difficulty"], "rating": round(m.rating_value(lone, site) * 100) / 100}
        err, _ = run([{"op": "add_unrated", "level": U5, "rating": u5["rating"], "difficulty": u5["difficulty"], "placeBelow": lone["levelId"]}])
        ok("engine: a spot right below a demon with one clear", err is None and entry(U5)["placeBelow"] == lone["levelId"], err)
        err, lines = run([{"op": "remove_record", "player": lone["records"][0]["player"], "level": lone["levelId"]}])
        ok("engine: the demon leaves, and the stale spot is reported (not rewritten)", err is None
           and any("hand-picked spot no longer fits after this" in x for x in lines)
           and entry(U5)["placeBelow"] == lone["levelId"], err or lines)

    # A level that's unrated in game goes on Rated+ with its first clear or Grind
    # goal: the mod page sends add_unrated first, in the same batch. A clear, or a
    # goal on a new Grind level, that skips it is refused - by head mods and mods.
    U6, U7, U8, U9, U10, U11, U12, U13 = free[6:14]
    for lid in (U6, U7, U12, U13):
        FAKE[lid] = GB[lid] = {"name": "Fixture " + str(lid), "author": "Someone", "difficulty": "Unrated", "stars": 0,
                               "length": "Long", "objects": 1234, "gameVersion": "2.2"}
    GB[U8] = {"name": "Fixture " + str(U8), "author": "Someone", "difficulty": "Unrated", "stars": 0, "length": "Long"}
    GB[U9] = {"name": "Fixture " + str(U9), "author": "Someone", "difficulty": "Hard", "length": "Long"}  # no stars
    GB[U10] = {"name": "Fixture " + str(U10), "author": "Someone", "difficulty": "Unrated", "stars": 0, "length": "Plat.",
               "platformer": True}
    GB[U11] = {"name": "Fixture " + str(U11), "author": "Someone", "difficulty": "Extreme Demon", "stars": 10, "length": "XL"}
    def has_goal(player, lid):
        return any(g["player"] == player and g["levelId"] == lid for g in state()["GOALS"])

    ran.clear()
    err, _ = run([{"op": "add_unrated", "level": U6, "rating": 22.5},
                  {"op": "add_record", "player": A, "level": U6, "progress": 100}])
    u = entry(U6)
    rec = next((r for r in (u or {}).get("records", []) if r["player"] == A), None)
    ok("engine: [add_unrated, add_record] - on Rated+ with its first clear, in one run (add-records.py isn't run)",
       err is None and u and u["difficulty"] == "Extreme" and u["rating"] == 22.5 and rec and rec["progress"] == 100
       and u["verifier"] == A and "add-records.py" not in ran, err or (u, ran))
    items = state()["CHANGELOG"][0]["items"]
    ok("engine: ...the clear's note on top of the new level's", items[0] == {"kind": "note", "text": A + " beat Fixture "
       + str(U6) + " (unrated - counts in Rated+)."} and items[1]["text"].startswith("Rated+: Fixture " + str(U6)
       + " is on as an unrated Extreme, GDDL estimate 22.50"), items[:2])
    err, _ = run([{"op": "add_unrated", "level": U12, "rating": 18},
                  {"op": "add_record", "player": B, "level": U12, "progress": 76}])
    u = entry(U12)
    ok("engine: [add_unrated, add_record] with a run under 100% - on Rated+, not beaten yet", err is None and u
       and u["difficulty"] == "Insane" and [(r["player"], r["progress"]) for r in u["records"]] == [(B, 76)]
       and u["verifier"] is None, err or u)

    ran.clear()
    err, lines = run([{"op": "add_unrated", "level": U7, "rating": 26, "difficulty": "Extreme"},
                      {"op": "set_grind", "player": B, "level": U7, "best": 40, "segments": [[50, 100]]}])
    st = state()
    goal = next((g for g in st["GOALS"] if g["player"] == B and g["levelId"] == U7), None)
    ok("engine: [add_unrated, set_grind] - on Rated+ with a Grind goal, in one run", err is None and entry(U7)
       and entry(U7)["records"] == [] and goal == {"player": B, "levelId": U7, "best": 40, "segments": [[50, 100]]}
       and (st["GOAL_LEVELS"].get(str(U7)) or {}).get("name") == "Fixture " + str(U7) and "add-records.py" not in ran,
       err or (goal, lines))
    row = next((ln for ln in m.read(root, "data/goals.js").split("\n") if "levelId: " + str(U7) + "," in ln), "")
    ok("engine: ...its row in data/goals.js", row.strip() == "{ player: " + json.dumps(B, ensure_ascii=False) + ", levelId: "
       + str(U7) + ", best: 40, segments: [[50, 100]] }, // Fixture " + str(U7), row)
    ok("engine: ...and the new level's note on top of the changelog", top_note()["text"].startswith("Rated+: Fixture " + str(U7)
       + " is on as an unrated Extreme, GDDL estimate 26.00"), top_note())
    err, _ = run([{"op": "add_record", "player": B, "level": U7, "progress": 100}], role="mod")
    u = entry(U7)
    ok("engine: then beaten (a mod's clear) - on the Rated+ list for real, and off that player's Grind", err is None and u
       and u["verifier"] == B and [(r["player"], r["progress"]) for r in u["records"]] == [(B, 100)] and not any(
           g["player"] == B and g["levelId"] == U7 for g in state()["GOALS"]), err or u)

    U14 = free[14]
    FAKE[U14] = GB[U14] = {"name": "Fixture " + str(U14), "author": "Someone", "difficulty": "Unrated", "stars": 0,
                           "length": "Long", "objects": 1234, "gameVersion": "2.2"}
    spot14 = m.unrated_slots({"levelId": U14, "difficulty": t4, "rating": r4}, state()["DEMONS"], site)[0]
    err, _ = run([{"op": "add_unrated", "level": U14, "rating": r4, "difficulty": t4, "placeBelow": spot14,
                   "showcase": "https://youtu.be/abcdefghijk"},
                  {"op": "add_record", "player": B, "level": U14, "progress": 55}])
    u = entry(U14)
    ok("engine: [add_unrated with a spot and a showcase, add_record] - all of it kept", err is None and u
       and u.get("placeBelow") == spot14 and u["videoUrl"] == "https://www.youtube.com/watch?v=abcdefghijk"
       and [(r["player"], r["progress"]) for r in u["records"]] == [(B, 55)], err or u)

    why = "Fixture " + str(U8) + " is unrated: a head mod puts it on Rated+ first, with its GDDL estimate (check the level on the mod page)"
    for role in ("head", "mod"):
        ran.clear()
        err, _ = run([{"op": "set_grind", "player": A, "level": U8, "best": 30, "segments": []}], role=role)
        ok("engine: set_grind on a level that's unrated in game but not on Rated+ is refused (" + role + ")",
           err and why in err and not has_goal(A, U8), err)
        err, _ = run([{"op": "add_record", "player": A, "level": U8, "progress": 100}], role=role)
        ok("engine: ...and so is a clear on it, before add-records.py runs (" + role + ")", err and why in err and not ran, err or ran)
        err, _ = run([{"op": "add_record", "player": A, "level": U8, "progress": 60}], role=role)
        ok("engine: ...and a run under 100% on it (" + role + ")", err and why in err, err)
    err, _ = run([{"op": "add_unrated", "level": U8, "rating": 20},
                  {"op": "set_grind", "player": A, "level": U8, "best": 30, "segments": []}], role="mod")
    ok("engine: a mod can't send the pair - add_unrated stays head mods'", err and "only head mods can add unrated levels" in err
       and entry(U8) is None, err)
    err, _ = run([{"op": "add_record", "player": A, "level": U13, "progress": 100},
                  {"op": "add_unrated", "level": U13, "rating": 20}])
    ok("engine: the batch applies in order - a clear before its add_unrated is refused, nothing kept",
       err and ("Fixture " + str(U13) + " is unrated") in err and entry(U13) is None, err)
    err, _ = run([{"op": "remove_unrated", "level": U6}, {"op": "add_record", "player": A, "level": U6, "progress": 100}])
    ok("engine: Move to the list while it's still unrated in game - refused, saying so, nothing kept",
       err and "is still unrated in game, so it can't move to the list yet" in err and entry(U6) is not None, err)
    err, _ = run([{"op": "set_grind", "player": A, "level": U10, "best": 30, "segments": []}])
    ok("engine: an unrated platformer is refused, and it says why", err and "unrated platformer level" in err
       and not has_goal(A, U10), err)
    err, _ = run([{"op": "set_grind", "player": A, "level": U9, "best": 10, "segments": []}])
    ok("engine: stars that can't be told - the Grind goal goes through", err is None and has_goal(A, U9), err)
    ran.clear()
    err, _ = run([{"op": "add_record", "player": A, "level": U9, "progress": 100}])
    ok("engine: ...and a 100% on it gets past the Rated+ check to add-records.py (which decides)",
       err and "(test) add-records.py was run" in err and ran == ["add-records.py"], err or ran)
    err, _ = run([{"op": "set_grind", "player": A, "level": U11, "best": 10, "segments": []}])
    ok("engine: a rated level - the Grind goal goes through", err is None and has_goal(A, U11), err)
    st = state()
    skip = {d["levelId"] for d in st["DEMONS"]} | {u["levelId"] for u in st["UNRATED"]} | {U9, U11}
    old = next((g["levelId"] for g in st["GOALS"] if g["levelId"] not in skip), None)
    who = old and next((x["name"] for x in roster if not has_goal(x["name"], old)), None)
    if who:
        GB[old] = {"name": "Grind Level", "author": "Someone", "difficulty": "Unrated", "stars": 0, "length": "Long"}
        err, _ = run([{"op": "set_grind", "player": who, "level": old, "best": 5, "segments": []}])
        ok("engine: a level already in someone's Grind takes more goals, even if it's unrated in game",
           err is None and has_goal(who, old), err)
    cfg = m.read(root, "data/config.js")
    m.write(root, "data/config.js", cfg + "\nwindow.SITE.ratedPlus = false;\n")
    err, _ = run([{"op": "set_grind", "player": A, "level": U8, "best": 30, "segments": []}])
    ok("engine: Rated+ off (Nigel's Demonlist) - a Grind goal on an unrated level goes through as before",
       err is None and has_goal(A, U8), err)
    m.write(root, "data/config.js", cfg)
except Exception as x:
    import traceback
    ok("engine: the harness ran", False, traceback.format_exc()[-400:])
finally:
    shutil.rmtree(tmp, ignore_errors=True)
out.write(json.dumps(results))
`;
  const r = spawnSync("python", ["-c", PYENGINE, ROOT], { encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1" }, maxBuffer: 64 << 20, timeout: 600000 });
  let got = null;
  try { got = JSON.parse(r.stdout); } catch { /* below */ }
  if (!got) {
    if (r.error || /not found|not recognized/i.test(r.stderr || "")) console.log("(python not available - skipping the Rated+ engine checks)");
    else check("engine (py): the Rated+ harness ran", false, (r.stdout + r.stderr).slice(-600));
  } else {
    got.forEach((x) => check(x.label, x.ok, x.detail));
  }
}

// --- RobTop's servers when gdbrowser doesn't answer (tools/gdlevel.py) --------------------------
// Real getGJLevels21.php and GDHistory answers (2026-10-30), read as gdbrowser's
// level JSON; then apply-edit.py's look-ups falling back on them, with nothing on
// the network.

{
  const PYGD = String.raw`
import importlib.util, json, os, sys
sys.dont_write_bytecode = True
results = []
def ok(label, cond, detail=""):
    results.append({"label": label, "ok": bool(cond), "detail": "" if cond else str(detail)[:400]})
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(sys.argv[1], "tools", file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
out, sys.stdout = sys.stdout, sys.stderr
try:
    g = load("gdlevel", "gdlevel.py")
    LIMBO = ("1:86084399:2:LIMBO:5:4:6:7460784:8:10:9:50:10:21332691:12:0:13:22:14:518175:17:1:43:6:25::18:10:19:28972:42:1"
             ":45:65535:3:Rk9DVVM=:15:4:30:0:31:0:37:0:38:0:39:0:46:1:47:2:35:76743#7460784:MindCap:2156992#1~|~76743~|~2~|~"
             "NH22 - Isolation~|~3~|~60~|~4~|~NightHawk22~|~5~|~3.04~|~6~|~~|~10~|~-~|~16~|~~|~7~|~~|~8~|~1#9999:0:10#f301")
    FIRST = ("1:128:2:1st level:5:1:6:30144023:8:10:9:30:10:4641908:12:4:13:21:14:309029:17::43:0:25::18:0:19:0:42:0:45:208"
             ":3::15:2:30:128:31:0:37:0:38:0:39:2:46:1:47:2:35:0#30144023:real storm:6338004##9999:0:10#afbd")
    STORY = ("1:151488126:2:other:6:1|1:151488121:2:story:5:1:6:348607560:8:0:9:0:10:0:12:0:13:22:14:0:17::43:0:25::18:0"
             ":19:0:42:0:45:149:3:OmZlYXR1cmVkOjpteXRoaWM6OnRoaW5rOmZpcmU=:15:0:30:0:31:0:37:0:38:0:39:9:46:1:47:2:35:233860"
             "#348607560:c34tir:43519254#1~|~233860~|~2~|~-Ricochet Love-~|~3~|~30~|~4~|~Waterflame~|~5~|~7.02~|~6~|~~|~10~|~"
             "http%3A%2F%2Faudio.ngfiles.com%2F233000%2F233860_Dawn.mp3~|~16~|~~|~7~|~UCVuv5iaVR55QXIc_BHQLakA~|~8~|~1#0:0:10#ab")
    lb = g.parse(86084399, LIMBO)
    ok("gdlevel: a rated extreme, as gdbrowser shows it", isinstance(lb, dict) and lb["name"] == "LIMBO" and lb["author"] == "MindCap"
       and lb["difficulty"] == "Extreme Demon" and lb["stars"] == 10 and lb["length"] == "XL" and lb["objects"] == 65535
       and lb["gameVersion"] == "2.2" and lb["description"] == "FOCUS" and lb["songID"] == "76743"
       and lb["songName"] == "NH22 - Isolation" and lb["songAuthor"] == "NightHawk22" and lb["songLink"] == "-", lb)
    fl = g.parse(128, FIRST)
    ok("gdlevel: an unrated level with an official song and no description", isinstance(fl, dict) and fl["stars"] == 0
       and fl["difficulty"] == "Hard" and fl["length"] == "Medium" and fl["gameVersion"] == "2.1" and fl["author"] == "real storm"
       and fl["songID"] == "Level 5" and "songName" not in fl and "description" not in fl and fl["platformer"] is False, fl)
    st = g.parse(151488121, STORY)
    ok("gdlevel: the right level out of several, its creator and custom song", isinstance(st, dict) and st["name"] == "story"
       and st["author"] == "c34tir" and st["difficulty"] == "Unrated" and st["length"] == "Tiny"
       and st["description"] == ":featured::mythic::think:fire" and st["songName"] == "-Ricochet Love-"
       and st["songLink"] == "http://audio.ngfiles.com/233000/233860_Dawn.mp3", st)
    ok("gdlevel: -1, a level that isn't in the answer, an error page, nothing",
       g.parse(5, "-1") == -1 and g.parse(5, FIRST) == -1 and g.parse(5, "<!DOCTYPE html><title>Just a moment...</title>") is None
       and g.parse(5, "") is None and g.parse(5, None) is None)

    # GDHistory (real answers, 2026-10-30, cut down): its newest copy, whatever the order
    H_LIMBO = {"online_id": 86084399, "cache_stars": 10, "cache_username": "MindCap", "records": [
        {"record_type": "get", "level_name": "LIMBO", "username": "MindCap", "stars": 10, "demon": True, "demon_type": 6,
         "rating_sum": 50, "auto": None, "length": 4, "game_version": 22, "objects_count": 65535, "official_song": 0,
         "description": "FOCUS", "song": {"online_id": 76743, "song_name": "NH22 - Isolation", "artist_name": "NightHawk22"},
         "real_date": "2026-10-30T03:01:24.933Z"},
        {"record_type": "get", "level_name": "LIMBO", "username": "MindCap", "stars": 0, "demon": None, "demon_type": 6,
         "rating_sum": 0, "auto": None, "length": 4, "game_version": 21, "objects_count": 65535, "official_song": 0,
         "description": "FOCUS   ", "song": {"online_id": 76743, "song_name": "NH22 - Isolation", "artist_name": "NightHawk22"},
         "real_date": "2022-11-26T23:00:49.533Z"}]}
    H_STORY = {"online_id": 151488121, "cache_stars": 0, "cache_username": "c34tir", "records": [
        {"record_type": "get", "level_name": "story", "username": "c34tir", "stars": 0, "demon": None, "demon_type": 0,
         "rating_sum": 0, "auto": None, "length": 0, "game_version": 22, "objects_count": None, "official_song": 0,
         "description": ":featured::mythic::think:fire", "real_date": "2026-10-30T08:28:02.639Z",
         "song": {"online_id": 233860, "song_name": "-Ricochet Love-", "artist_name": "Waterflame"}}]}
    hl = g.from_history(86084399, H_LIMBO)
    ok("gdlevel: GDHistory's newest copy of a rated extreme", isinstance(hl, dict) and hl["_from"] == "GDHistory"
       and hl["difficulty"] == "Extreme Demon" and hl["stars"] == 10 and hl["objects"] == 65535 and hl["gameVersion"] == "2.2"
       and hl["description"] == "FOCUS" and hl["author"] == "MindCap" and hl["songName"] == "NH22 - Isolation", hl)
    hs = g.from_history(151488121, H_STORY)
    ok("gdlevel: GDHistory's copy of an unrated level", isinstance(hs, dict) and hs["name"] == "story" and hs["stars"] == 0
       and hs["difficulty"] == "Unrated" and hs["length"] == "Tiny" and hs["author"] == "c34tir" and "objects" not in hs
       and hs["songID"] == "233860" and hs["songAuthor"] == "Waterflame" and "songLink" not in hs, hs)
    ok("gdlevel: GDHistory not having the level is no answer",
       g.from_history(5, {"success": False}) is None and g.from_history(5, H_STORY) is None
       and g.from_history(5, {"online_id": 5, "records": []}) is None and g.from_history(5, None) is None)
    # Only the servers' own copies count: GDHistory's save-file and hand-entered
    # copies are mostly empty or stale (real shape, from level 10792915)
    H_AUTO = {"online_id": 10792915, "is_deleted": False, "cache_username": "dAlt9", "records": [
        {"record_type": "glm_03", "real_date": "2026-08-08T00:00:00Z", "level_name": "Bloodbath Auto",
         "username": "DeAutoMaker1305", "stars": None, "game_version": None, "objects_count": None, "length": 3,
         "rating_sum": 30, "description": None},
        {"record_type": "download", "real_date": "2025-11-10T00:36:11.132Z", "level_name": "Bloodbath Auto", "username": None,
         "stars": 0, "game_version": 21, "objects_count": 25102, "length": 3, "rating_sum": 30, "demon_type": 0,
         "description": "Original by Riot and more. V14 Final update.", "official_song": 0,
         "song": {"online_id": 467339, "song_name": "At the Speed of Light", "artist_name": "Dimrain47"}},
        {"record_type": "manual", "real_date": "2026-09-01T00:00:00Z", "level_name": "Bloodbath Auto", "stars": None}]}
    ha = g.from_history(10792915, H_AUTO)
    ok("gdlevel: GDHistory - the newest SERVER copy, not a newer save-file or hand-entered one", isinstance(ha, dict)
       and ha["author"] == "dAlt9" and ha["gameVersion"] == "2.1" and ha["objects"] == 25102 and ha["stars"] == 0
       and ha["description"].startswith("Original by Riot") and ha["difficulty"] == "Hard" and ha["songID"] == "467339", ha)
    ok("gdlevel: GDHistory - a deleted level is 'no such level', save-file copies alone are no answer",
       g.from_history(24346905, {"online_id": 24346905, "is_deleted": True, "records": H_AUTO["records"]}) == -1
       and g.from_history(10792915, dict(H_AUTO, records=[H_AUTO["records"][0], H_AUTO["records"][2]])) is None)
    H_GAPS = {"online_id": 128, "cache_username": "real storm", "records": [
        {"record_type": "get", "real_date": "2026-10-28T18:46:04Z", "level_name": "1st level", "username": "real storm",
         "stars": None, "game_version": None, "objects_count": None, "length": 2, "rating_sum": 30, "official_song": 4,
         "song": {"online_id": 0, "song_name": None, "artist_name": None}},
        {"record_type": "get", "real_date": "2026-10-29T00:00:00Z", "level_name": "1st level", "is_invalid": True, "stars": 5}]}
    hg = g.from_history(128, H_GAPS)
    ok("gdlevel: GDHistory - a missing field is left out, an invalid copy skipped, an official song named like gdbrowser",
       isinstance(hg, dict) and "stars" not in hg and "gameVersion" not in hg and "objects" not in hg
       and hg["songID"] == "Level 5" and "songName" not in hg, hg)
    calls = []
    g.history = lambda lid, timeout=25: calls.append(lid) or hs
    g.ask = lambda lid, timeout=25: None
    ok("gdlevel: RobTop's servers silent - GDHistory's copy", g.level(151488121) is hs and calls == [151488121])
    del calls[:]
    g.ask = lambda lid, timeout=25: "-1"
    ok("gdlevel: RobTop's servers say there's no such level - believed, GDHistory not asked", g.level(5) == -1 and not calls)
    g.ask = lambda lid, timeout=25: STORY
    ok("gdlevel: RobTop's servers answer - GDHistory not asked",
       g.level(151488121)["_from"] == "the Geometry Dash servers" and not calls)

    m = load("apply_edit_gd", "apply-edit.py")
    sys.stdout = sys.stderr
    asked = []
    def servers(answer):
        def f(lid):
            asked.append(lid)
            return answer
        return f
    CHALLENGE = (403, "<!DOCTYPE html><title>Just a moment...</title>")
    def facts(curl, answer):
        del asked[:]
        m.curl, m.gd_servers = (lambda url, timeout=30: curl), servers(answer)
        try:
            return m.Engine(sys.argv[1]).unrated_facts(151488121)
        except m.Refuse as e:
            return "Refuse: " + str(e)
    f = facts(CHALLENGE, st)
    ok("add_unrated: gdbrowser challenged, RobTop's servers answer", isinstance(f, dict) and asked == [151488121]
       and f["name"] == "story" and f["publisher"] == "c34tir" and f["gd"]["inGameDifficulty"] == "Unrated"
       and f["gd"]["length"] == "Tiny" and f["gd"]["song"]["link"] == "http://audio.ngfiles.com/233000/233860_Dawn.mp3", f)
    f = facts(CHALLENGE, lb)
    ok("add_unrated: ...and a rated level is still refused", isinstance(f, str) and "is rated (10 stars)" in f, f)
    f = facts(CHALLENGE, -1)
    ok("add_unrated: ...and a level that doesn't exist", isinstance(f, str) and "isn't on the Geometry Dash servers" in f, f)
    f = facts(CHALLENGE, None)
    ok("add_unrated: nobody answers - nothing saved", isinstance(f, str)
       and "gdbrowser, the Geometry Dash servers and GDHistory didn't answer" in f and "nothing saved" in f, f)
    f = facts(CHALLENGE, hg)
    ok("add_unrated: a stand-in that can't say whether it's rated - refused, nothing saved",
       isinstance(f, str) and "couldn't tell whether 1st level is rated" in f, f)
    f = facts((200, json.dumps({"name": "From gdbrowser", "stars": 0, "difficulty": "Unrated"})), lb)
    ok("add_unrated: gdbrowser answers - RobTop's servers aren't asked", isinstance(f, dict) and f["name"] == "From gdbrowser" and not asked, f)
    f = facts((200, "-1"), lb)
    ok("add_unrated: gdbrowser says there's no such level - believed", isinstance(f, str) and "isn't on the Geometry Dash servers" in f
       and not asked, f)
    m.curl, m.gd_servers = (lambda url, timeout=30: (0, "")), servers(lb)
    ok("level_facts: gdladder and gdbrowser silent, RobTop's servers answer", m.level_facts(86084399) == ("LIMBO", "Extreme Demon"))
except Exception:
    import traceback
    ok("gdlevel: the harness ran", False, traceback.format_exc()[-400:])
out.write(json.dumps(results))
`;
  const r = spawnSync("python", ["-c", PYGD, ROOT], { encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1" }, maxBuffer: 16 << 20, timeout: 120000 });
  let got = null;
  try { got = JSON.parse(r.stdout); } catch { /* below */ }
  if (!got) {
    if (r.error || /not found|not recognized/i.test(r.stderr || "")) console.log("(python not available - skipping the gdlevel checks)");
    else check("gdlevel (py): the harness ran", false, (r.stdout + r.stderr).slice(-600));
  } else {
    got.forEach((x) => check(x.label, x.ok, x.detail));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

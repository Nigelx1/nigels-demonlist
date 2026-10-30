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

    FAKE, ran = {}, []
    m.curl = lambda url, timeout=30: (0, "")
    m.Engine.unrated_facts = lambda self, lid: m.unrated_facts_from(lid, 200, json.dumps(FAKE[lid]))
    m.Engine.showcase_thumb = lambda self, vid: "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg"
    def no_tools(_root, args, timeout=900):
        ran.append(args[0])
        raise m.Refuse("(test) " + args[0] + " was run")
    m.run_tool = no_tools

    s = m.load_state(root)
    site, L = s["SITE"], sorted(s["DEMONS"], key=lambda d: d["position"])
    taken = {d["levelId"] for d in L} | {g["levelId"] for g in s["GOALS"]} | {int(k) for k in s["GOAL_LEVELS"]}
    taken |= {int(k) for k in m.Engine(root).showcase_overrides()}
    F, U1, U2, U3, U4, U5 = [i for i in range(990000001, 990000200) if i not in taken][:6]
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
        """(None, say lines) when it went through and check() passed, else (why, lines)."""
        p = m.validate({"requestId": "0" * 16, "editor": "Nigel", "role": role, "ops": ops})
        e = m.Engine(root, role)
        try:
            e.apply(p["ops"])
            m.check(root)
            return None, e.lines
        except m.Refuse as x:
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

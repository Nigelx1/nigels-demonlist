// The edit contract: what POST /api/edit accepts and forwards to GitHub.
//
// This mirrors validate() in tools/apply-edit.py, which checks the payload
// again on the Actions runner - that check is the one that counts. This copy
// exists so an editor hears about a typo straight away instead of a minute
// later from a failed run. The limits, the field names and the wording of the
// messages are the same as the Python ones; change both together.
//
// Where JavaScript and Python parse things differently this side is the
// stricter one, so nothing passes here that the runner then refuses for being
// malformed: level ids and links take ASCII digits only, and a video link may
// not carry an "@" or a ":port" at all (Python only refuses non-empty ones).
//
// Lengths are counted in code points, like Python's len().

export class Refuse extends Error {}

export const OPS = {
  // op -> [required fields, optional fields], besides "op"
  add_member: [["name", "nationality"], ["subdivision"]],
  add_record: [["player", "level", "progress"], ["nationality", "subdivision"]],
  remove_record: [["player", "level"], []],
  set_grind: [["player", "level", "best", "segments"], ["note"]],
  remove_grind: [["player", "level"], []],
  set_record_video: [["player", "level", "url"], []],
  remove_record_video: [["player", "level"], []],
  refresh_order: [[], []],
  refresh_showcases: [[], []], // Nigel's channel -> his showcases on the site
  undo: [["requestId"], []], // head mods: reverse one earlier edit
  rename_member: [["name", "newName"], []],
  set_member_country: [["name", "nationality"], ["subdivision"]],
  remove_member: [["name"], []], // only someone with no records left
  set_mod: [["discordId", "name", "role"], []], // Nigel only: add a mod, or rename / re-rank one
  remove_mod: [["discordId"], []], // Nigel only
  // Rated+ (SITE.ratedPlus, data/unrated.js): head mods only. Clears on an
  // unrated level are add_record / remove_record with its level id.
  add_unrated: [["level", "rating"], ["difficulty", "placeBelow", "showcase"]],
  set_unrated: [["level"], ["rating", "difficulty", "placeBelow", "showcase"]], // at least one of them
  remove_unrated: [["level"], []],
  // Insane swaps (SITE.insaneSwaps): head mods who have beaten both put `up`
  // above `down`. Not "level": that name makes a field eligible for RobTop's answers.
  swap_insanes: [["up", "down"], []],
};

// What set_unrated can change (it needs at least one).
const UNRATED_FIELDS = ["rating", "difficulty", "placeBelow", "showcase"];

// ISO 3166-1 alpha-2, the officially assigned codes (the same 249 as apply-edit.py)
export const ISO = new Set(`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO
BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO
DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW
GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX
MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO
RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL
TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/));

export const VIDEO_HOSTS = new Set(["youtube.com", "www.youtube.com", "youtu.be", "drive.google.com"]);
// An unrated level's showcase: YouTube only (the site makes its thumbnail from the id).
export const SHOWCASE_HOSTS = new Set(["youtube.com", "www.youtube.com", "youtu.be"]);
// add-video.py's own patterns: a link has to point at ONE video.
export const VIDEO_ID = [
  /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)[A-Za-z0-9_-]{11}/,
  /drive\.google\.com\/(?:file\/d\/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=)[A-Za-z0-9_-]{10,}/,
];
const LEVEL_LINK = /^https?:\/\/(?:www\.)?(?:gdladder\.com\/level\/|gdbrowser\.com\/(?:level\/)?)([0-9]+)\/?(?:[?#]\S*)?$/i;
const MAX_LEVEL_ID = 2 ** 31 - 1;

const len = (s) => [...s].length;

// A raw value, quoted and cut short for a message (Python's show()).
export function show(x) {
  let s;
  try {
    s = x === undefined ? "undefined" : JSON.stringify(x);
  } catch {
    s = String(x);
  }
  if (s === undefined) s = String(x);
  return len(s) <= 60 ? s : [...s].slice(0, 57).join("") + "...";
}

const isInt = (v) => typeof v === "number" && Number.isInteger(v);
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

export function checkName(v, what) {
  if (typeof v !== "string") throw new Refuse(`${what} must be text, got ${show(v)}`);
  v = v.normalize("NFC");
  if (len(v) < 1 || len(v) > 32) throw new Refuse(`${what} ${show(v)} must be 1-32 characters`);
  if (v !== v.trim() || v.includes("  ")) throw new Refuse(`${what} ${show(v)} has extra spaces`);
  const bad = [...new Set([...v].filter((c) => !/^[\p{L}0-9 ._-]$/u.test(c)))];
  if (bad.length) {
    throw new Refuse(`${what} ${show(v)} can only use letters, digits, spaces and . _ - (not ${show(bad.join(""))})`);
  }
  return v;
}

export function checkCountry(v, what) {
  if (typeof v !== "string" || !/^[A-Z]{2}$/.test(v) || !ISO.has(v)) {
    throw new Refuse(`${what} ${show(v)} isn't a country code - use the two capital letters, e.g. US, CA, MX`);
  }
  return v;
}

// A Discord user id ("snowflake"): 17-20 digits, as text (too big for a JS number).
export function checkDiscordId(v) {
  if (typeof v !== "string" || !/^[0-9]{17,20}$/.test(v)) {
    throw new Refuse(`Discord ID ${show(v)} must be the 17-20 digit number from Copy User ID`);
  }
  return v;
}

// A mod's rank in functions/editors.json.
export function checkModRole(v) {
  if (v !== "head" && v !== "mod") throw new Refuse(`role ${show(v)} must be "head" or "mod"`);
  return v;
}

// A state or province, as the list stores it: the part of its ISO 3166-2 code
// after the country ("IL" for US-IL). Whether this list shows them, and whether
// the country has that one, is checked by tools/apply-edit.py, which has the list.
export function checkSubdivision(v) {
  if (typeof v !== "string" || !/^[A-Z0-9]{1,3}$/.test(v)) {
    throw new Refuse(`state/province ${show(v)} isn't a subdivision code - use its short code, e.g. IL, ON`);
  }
  return v;
}

export function checkInt(v, what, lo, hi) {
  if (!isInt(v) || v < lo || v > hi) throw new Refuse(`${what} must be a whole number from ${lo} to ${hi}, got ${show(v)}`);
  return v;
}

// A level id or a gdladder.com / gdbrowser.com level link -> the id (a number).
// what: the field's name for the message (swap_insanes' up and down are level ids too).
export function checkLevel(v, what = "level") {
  let lid;
  if (isInt(v)) {
    lid = v;
  } else if (typeof v === "string" && /^[0-9]+$/.test(v.trim())) {
    lid = Number(v.trim());
  } else if (typeof v === "string" && LEVEL_LINK.test(v.trim())) {
    lid = Number(LEVEL_LINK.exec(v.trim())[1]);
  } else {
    throw new Refuse(`${what} ${show(v)} isn't a level id or a gdladder.com / gdbrowser.com level link`);
  }
  if (!(lid >= 1 && lid <= MAX_LEVEL_ID)) throw new Refuse(`${what} ${show(v)} isn't a real level id`);
  return lid;
}

export function checkUrl(v) {
  if (typeof v !== "string" || len(v) > 300 || /\s/u.test(v)) throw new Refuse(`video link ${show(v)} isn't a link`);
  // the scheme and the host exactly as written (not as the URL parser would
  // repair them: it turns "https:/youtube.com" into a real link, Python doesn't)
  const m = /^https:\/\/([^/?#]*)/i.exec(v);
  const host = m ? m[1].toLowerCase() : "";
  if (!m || host.includes("@") || host.includes(":") || !VIDEO_HOSTS.has(host)) {
    throw new Refuse(`video link ${show(v)} must be an https link on youtube.com, youtu.be or drive.google.com`);
  }
  if (!VIDEO_ID.some((re) => re.test(v))) throw new Refuse(`video link ${show(v)} isn't a link to one video - use the Share button's link`);
  return v;
}

export function checkNote(v) {
  if (typeof v !== "string" || len(v) > 140) throw new Refuse(`note must be text of at most 140 characters, got ${show(v)}`);
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v)) throw new Refuse(`note ${show(v)} must be plain text on one line`);
  return v.trim();
}

// A head mod's GD Demon Ladder rating estimate for an unrated level: a number
// from 1 to 50 with at most 2 decimals (the float noise of 31.1 * 100 is fine).
export function checkRating(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 50 || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) {
    throw new Refuse(`GDDL estimate must be a number from 1 to 50 with at most 2 decimals, got ${show(v)}`);
  }
  return Math.round(v * 100) / 100;
}

// The tier an unrated level counts as (it has no demon face in game).
export function checkTier(v) {
  if (v !== "Extreme" && v !== "Insane") throw new Refuse(`tier ${show(v)} must be "Extreme" or "Insane"`);
  return v;
}

// An unrated level's hand-picked spot: null (by its estimate), 0 (the very top)
// or the level id of the listed demon it sits right below. Whether the spot is
// inside its window is checked by tools/apply-edit.py, which has the list.
export function checkPlaceBelow(v) {
  if (v === null) return null;
  if (!isInt(v) || v < 0 || v > MAX_LEVEL_ID) throw new Refuse(`placeBelow must be null, 0 (the top) or a level id, got ${show(v)}`);
  return v;
}

// An unrated level's showcase: null (none), or a link to one YouTube video.
export function checkShowcase(v) {
  if (v === null) return null;
  const m = typeof v === "string" && len(v) <= 300 && !/\s/u.test(v) ? /^https:\/\/([^/?#]*)/i.exec(v) : null;
  const host = m ? m[1].toLowerCase() : "";
  if (!m || host.includes("@") || host.includes(":") || !SHOWCASE_HOSTS.has(host) || !VIDEO_ID[0].test(v)) {
    throw new Refuse(`showcase ${show(v)} must be a link to one YouTube video`);
  }
  return v;
}

function checkSegments(segs) {
  if (!Array.isArray(segs) || segs.length > 20) throw new Refuse("runs must be a list of at most 20 [from, to] pairs");
  return segs.map((s) => {
    if (!Array.isArray(s) || s.length !== 2 || !s.every(isInt) || !(0 <= s[0] && s[0] < s[1] && s[1] <= 100)) {
      throw new Refuse(`run ${show(s)} must be [from, to] with 0 <= from < to <= 100`);
    }
    return [s[0], s[1]];
  });
}

// The ops list, checked and normalised (names NFC, levels as numeric ids,
// notes trimmed, only the contract's fields). Throws Refuse with a message
// for the editor.
export function validateOps(ops) {
  if (!Array.isArray(ops) || ops.length < 1 || ops.length > 10) throw new Refuse("ops must be a list of 1 to 10 edits");
  return ops.map((op, n) => {
    const where = `edit ${n + 1}`;
    if (!isObject(op) || typeof op.op !== "string" || !Object.hasOwn(OPS, op.op)) {
      throw new Refuse(`${where}: unknown edit ${show(isObject(op) ? op.op : op)}`);
    }
    const [need, maybe] = OPS[op.op];
    const missing = need.filter((f) => !Object.hasOwn(op, f));
    const unknown = Object.keys(op).filter((f) => f !== "op" && !need.includes(f) && !maybe.includes(f));
    if (missing.length) throw new Refuse(`${where} (${op.op}): missing ${missing.sort().join(", ")}`);
    if (unknown.length) throw new Refuse(`${where} (${op.op}): unknown field(s) ${unknown.map(show).sort().join(", ")}`);
    const o = { op: op.op };
    try {
      if (Object.hasOwn(op, "name")) o.name = checkName(op.name, "name");
      if (Object.hasOwn(op, "newName")) o.newName = checkName(op.newName, "new name");
      if (Object.hasOwn(op, "player")) o.player = checkName(op.player, "player");
      if (Object.hasOwn(op, "nationality")) o.nationality = checkCountry(op.nationality, "country");
      if (Object.hasOwn(op, "subdivision")) o.subdivision = checkSubdivision(op.subdivision);
      if (Object.hasOwn(op, "level")) o.level = checkLevel(op.level);
      if (Object.hasOwn(op, "up")) o.up = checkLevel(op.up, "up");
      if (Object.hasOwn(op, "down")) o.down = checkLevel(op.down, "down");
      if (Object.hasOwn(op, "progress")) o.progress = checkInt(op.progress, "progress", 1, 100);
      if (Object.hasOwn(op, "best")) o.best = op.best === null ? null : checkInt(op.best, "best", 0, 100);
      if (Object.hasOwn(op, "segments")) o.segments = checkSegments(op.segments);
      if (Object.hasOwn(op, "note")) o.note = checkNote(op.note);
      if (Object.hasOwn(op, "url")) o.url = checkUrl(op.url);
      if (Object.hasOwn(op, "requestId")) {
        if (typeof op.requestId !== "string" || !/^[0-9a-f]{16}$/.test(op.requestId)) {
          throw new Refuse(`requestId must be 16 lowercase hex characters, got ${show(op.requestId)}`);
        }
        o.requestId = op.requestId;
      }
      if (Object.hasOwn(op, "discordId")) o.discordId = checkDiscordId(op.discordId);
      if (Object.hasOwn(op, "role")) o.role = checkModRole(op.role);
      if (Object.hasOwn(op, "rating")) o.rating = checkRating(op.rating);
      if (Object.hasOwn(op, "difficulty")) o.difficulty = checkTier(op.difficulty);
      if (Object.hasOwn(op, "placeBelow")) o.placeBelow = checkPlaceBelow(op.placeBelow);
      if (Object.hasOwn(op, "showcase")) o.showcase = checkShowcase(op.showcase);
      if (op.op === "set_unrated" && !UNRATED_FIELDS.some((f) => Object.hasOwn(op, f))) {
        throw new Refuse("nothing to change - give rating, difficulty, placeBelow or showcase");
      }
      if (op.op === "swap_insanes" && o.up === o.down) {
        throw new Refuse("up and down are the same level - pick two different ones");
      }
    } catch (e) {
      if (e instanceof Refuse) throw new Refuse(`${where} (${op.op}): ${e.message}`);
      throw e;
    }
    return o;
  });
}

// The body of POST /api/edit: {"ops": [...]} and nothing else.
export function validateEditBody(body) {
  if (!isObject(body)) throw new Refuse("the request isn't a JSON object");
  const extra = Object.keys(body).filter((k) => k !== "ops");
  if (extra.length) throw new Refuse(`unknown field(s): ${extra.map(show).sort().join(", ")}`);
  return validateOps(body.ops);
}

// What only head mods may do (Nigel, 2026-10-07): anything that changes who's on
// the list, rewrites its order or deletes a clear. Mods do the day-to-day: clears
// for players already on the list, Grind, videos. tools/apply-edit.py keeps the
// same list, and also refuses a mod's add_record for a player not on the list.
// The unrated levels (Rated+, 2026-10-30) are head mods' too; a clear on one is
// an add_record like any other, so mods can still add those. So are Insane swaps
// (2026-10-31); tools/apply-edit.py also checks the head mod has beaten both.
export const HEAD_ONLY = new Map([
  ["add_member", "add members"],
  ["remove_record", "remove clears"],
  ["refresh_order", "re-sort the list"],
  ["refresh_showcases", "check Nigel's channel for showcases"],
  ["undo", "undo edits"],
  ["rename_member", "rename members"],
  ["set_member_country", "change a member's country"],
  ["remove_member", "remove members"],
  ["add_unrated", "add unrated levels"],
  ["set_unrated", "edit unrated levels"],
  ["remove_unrated", "remove unrated levels"],
  ["swap_insanes", "swap insanes"],
]);

// Nigel's Discord account: the only one that can change the mod team (Nigel,
// 2026-10-07). It's fixed here rather than marked in editors.json, so no change
// to that file can hand it to someone else; tools/apply-edit.py has the same id.
export const OWNER_ID = "828708919492608050";

// What only Nigel may do: change who the mods are (functions/editors.json, the
// logins, and the List Mods panel in data/config.js, which is rebuilt from it).
export const OWNER_ONLY = new Map([
  ["set_mod", "change the mod team"],
  ["remove_mod", "change the mod team"],
]);

// Throws Refuse when an edit is above the sender's rank: a head-only edit from a
// mod (role "mod"), a Nigel-only one from anyone else (owner not true).
export function checkRole(ops, role, owner = false) {
  ops.forEach((op, i) => {
    if (OWNER_ONLY.has(op.op) && owner !== true) throw new Refuse(`edit ${i + 1} (${op.op}): only Nigel can ${OWNER_ONLY.get(op.op)}`);
    if (HEAD_ONLY.has(op.op) && role !== "head") throw new Refuse(`edit ${i + 1} (${op.op}): only head mods can ${HEAD_ONLY.get(op.op)}`);
  });
}

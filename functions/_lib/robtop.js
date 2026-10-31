// RobTop's own servers (the game's level search, getGJLevels21.php) for when
// gdbrowser doesn't answer: gdbrowser has shown scripts a Cloudflare challenge
// since late October 2026, and it only reads these servers anyway. Asked the
// way tools/gdlevel.py's ask() asks them and read the way its parse() reads the
// answer, for the fields the Functions use; change both together
// (tools/test-functions.mjs checks they agree).
//
// These servers answer Cloudflare's network but turn GitHub's runners away, so
// /api/edit also sends their answers along with an edit (forEdit, payload "gd")
// and tools/apply-edit.py hands those to gdlevel.py.

export const SEARCH = "https://www.boomlings.com/database/getGJLevels21.php";
const SECRET = "Wmfd2893gb7"; // the game's public request secret: every GD client sends it
// The longest answer sent along with an edit (tools/apply-edit.py MAX_ANSWER
// refuses a longer one). One level's answer is well under 1,000 characters.
export const MAX_ANSWER = 4000;

const DIFFICULTY = { 0: "Unrated", 10: "Easy", 20: "Normal", 30: "Hard", 40: "Harder", 50: "Insane" };
const DEMONS = { 3: "Easy", 4: "Medium", 5: "Insane", 6: "Extreme" }; // anything else: Hard
const LENGTHS = ["Tiny", "Short", "Medium", "Long", "XL", "Plat."];

// Python's str.strip(): its whitespace, not JavaScript's trim()'s
const SPACE = "[\\t-\\r\\x1c-\\x20\\x85\\xa0\\u{1680}\\u{2000}-\\u{200a}\\u{2028}\\u{2029}\\u{202f}\\u{205f}\\u{3000}]";
const EDGES = new RegExp(`^${SPACE}+|${SPACE}+$`, "gu");
const strip = (s) => s.replace(EDGES, "");

// RobTop's raw answer for level id, or null when it didn't answer. No
// User-Agent at all, as in the tools (the servers turn curl's default one away).
// Never throws.
export async function ask(id, timeout = 8000) {
  try {
    const r = await fetch(SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `str=${id}&type=0&secret=${SECRET}`,
      signal: AbortSignal.timeout(timeout),
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// "k:v:k:v..." the way Python's dict(zip(parts[0::2], parts[1::2])) reads it
function pairs(record, sep) {
  const parts = record.split(sep), out = new Map();
  for (let i = 0; i + 1 < parts.length; i += 2) out.set(parts[i], parts[i + 1]);
  return out;
}

const ODD = new Error("odd number");

// A field as a whole number, as gdlevel.py's num() reads one: plain digits with
// an optional "-", else 0. A number Python's int() would read another way or
// choke on ("--1", other scripts' digits; the servers send neither) throws ODD.
function num(v) {
  v = v || "";
  const digits = v.replace(/^-+/, "");
  if (/^[0-9]+$/.test(digits) && v.length - digits.length <= 1) return Number(v) || 0;
  if (/^[\p{Nd}\p{No}]+$/u.test(digits)) throw ODD;
  return 0;
}

// The search answer (levels#creators#songs#page#hash) for level id as
// gdbrowser's {name, author, difficulty, stars, length, platformer}: -1 when the
// game says there's no such level, null when it's not an answer at all (an
// error page, a cut-off reply, a number gdlevel.py would read differently).
export function parse(id, answer) {
  if (typeof answer !== "string") return null;
  answer = strip(answer);
  if (answer === "-1") return -1;
  const sections = answer.split("#");
  if (sections.length < 3 || !sections[0].startsWith("1:")) return null;
  const level = sections[0].split("|").map((r) => pairs(r, ":")).find((d) => d.get("1") === String(id));
  if (!level) return -1; // the search found other levels, not this id
  const g = (k) => level.get(k);
  const n = {};
  try {
    // every field gdlevel.py reads as a number, the ones not used here too
    for (const k of ["15", "17", "18", "25", "35", "45", "13"]) n[k] = num(g(k));
    if (n["35"] <= 0) num(g("12"));
  } catch (e) {
    if (e === ODD) return null;
    throw e;
  }
  const out = { name: g("2") || "-" };
  const creator = sections[1].split("|").map((c) => c.split(":")).find((c) => c[0] === g("6"));
  if (creator && creator.length > 1 && creator[1]) out.author = creator[1];
  const pick = (table, key, other) => (Object.hasOwn(table, key) ? table[key] : other);
  out.difficulty = pick(DIFFICULTY, g("9") || "0", "Unrated");
  if (n["17"] > 0) out.difficulty = `${pick(DEMONS, g("43") || "", "Hard")} Demon`;
  if (n["25"] > 0) out.difficulty = "Auto";
  out.stars = n["18"];
  if (n["15"] >= 0 && n["15"] < LENGTHS.length && (g("15") || "") !== "") {
    out.length = LENGTHS[n["15"]];
    out.platformer = n["15"] === 5;
  }
  return out;
}

// The answer to send along with an edit for level id, or null: only a real
// answer for that level, or "-1" (no such level), and at most MAX_ANSWER long.
// (A search that found other levels, an error page or nothing isn't sent: the
// runner then asks as before.)
export function forEdit(id, answer) {
  if (typeof answer !== "string" || answer.length > MAX_ANSWER) return null;
  const got = parse(id, answer);
  return (got !== null && typeof got === "object") || strip(answer) === "-1" ? answer : null;
}

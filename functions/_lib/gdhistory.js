// GDHistory (history.geometrydash.eu, an archive of Geometry Dash's own answers)
// for /api/level when gdbrowser doesn't answer: gdbrowser has shown scripts a
// Cloudflare challenge since late October 2026. The same reading as
// tools/gdlevel.py's from_history, for the fields the endpoint uses; change both
// together (tools/test-functions.mjs checks they agree).

export const HISTORY = "https://history.geometrydash.eu/api/v1/level/";

const DIFFICULTY = { 0: "Unrated", 10: "Easy", 20: "Normal", 30: "Hard", 40: "Harder", 50: "Insane" };
const DEMONS = { 3: "Easy", 4: "Medium", 5: "Insane", 6: "Extreme" }; // anything else: Hard
const LENGTHS = ["Tiny", "Short", "Medium", "Long", "XL", "Plat."];

const int = (v) => (Number.isInteger(v) ? v : null);

// GDHistory's JSON for level id, read from its newest copy of the servers' own
// answer ("get" or "download"; its save-file and hand-entered copies are mostly
// empty or out of date) as gdbrowser's {name, author, stars, difficulty, length,
// platformer}. -1 when GDHistory says the level was deleted, null when it has no
// server copy of it. A field the copy doesn't have is left out.
export function fromHistory(id, data) {
  if (!data || typeof data !== "object" || data.online_id !== id) return null;
  if (data.is_deleted === true) return -1;
  const copies = (Array.isArray(data.records) ? data.records : []).filter(
    (r) => r && typeof r === "object" && r.level_name && (r.record_type === "get" || r.record_type === "download") && !r.is_invalid,
  );
  if (!copies.length) return null;
  const r = copies.reduce((a, b) => ((b.real_date || "") > (a.real_date || "") ? b : a));
  const out = { name: r.level_name };
  const author = r.username || data.cache_username; // "download" copies carry no username
  if (author) out.author = author;
  if (int(r.stars) !== null) out.stars = r.stars;
  out.difficulty = DIFFICULTY[int(r.rating_sum) || 0] || "Unrated";
  if (r.demon) out.difficulty = `${DEMONS[int(r.demon_type)] || "Hard"} Demon`;
  if (r.auto) out.difficulty = "Auto";
  if (int(r.length) !== null && r.length >= 0 && r.length < LENGTHS.length) {
    out.length = LENGTHS[r.length];
    out.platformer = r.length === 5;
  }
  return out;
}

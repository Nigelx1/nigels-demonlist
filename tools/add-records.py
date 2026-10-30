#!/usr/bin/env python3
"""Add clears (and any new demons) to the list from a JSON spec.

    python tools/add-records.py spec.json             # apply
    python tools/add-records.py spec.json --dry-run   # show the plan, write nothing
    python tools/add-records.py spec.json --initial   # FIRST import only: becomes the
                                                      # baseline (no "add" log items)
    python tools/add-records.py [spec.json] --refresh-ratings
                         # also re-pull every listed demon's gdladder rating first
                         # (one request at a time - gdladder rate-limits); drifts
                         # get a changelog note and any move they cause is logged
                         # with the old -> new ratings as its reason. The spec is
                         # optional with this flag.
spec.json:
{
  "date": "2026-10-03",                     # changelog date (default: today)
  "players": {                              # per-player info (needed for new players)
    "ace": {"nationality": "US", "subdivision": "TX", "gdladder": 12345}
  },
  "records": [                              # level = id or gdladder/gdbrowser link
    {"player": "ace", "level": "https://gdladder.com/level/86084399"},
    {"player": "ace", "level": 12345, "progress": 100}
  ],
  "tiebreak": ["ace"],                      # who gets `verifier` on a new demon several cleared
  "verifiers": {"10565740": "ace"},         # or set it per level (wins over tiebreak)
  "notes": ["New member: ..."]              # extra changelog notes
}
A player's "gdladder" (user id or profile link) also imports every 100% on
their gdladder profile. Every player in "players" or with a new record who
isn't in config.js `members` yet joins that roster (name + nationality).

Order (the whole list, every run): difficulty tier first, in config.js
`allowedDifficulties` order (e.g. every Extreme above every Insane), then
gdladder rating (2 dp), and a rating tie goes to whichever level the AREDL
places higher. If that re-sorts demons already on the list, the moves are
logged too so every demon's position history stays exact. Anything outside
`allowedDifficulties` is refused; platformers are always refused.
Needs python3, curl and node on PATH.
"""
import importlib.util, io, json, os, re, subprocess, sys, time, urllib.request
from datetime import date as _date

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SITE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(SITE, "data")
FLAGS = os.path.join(SITE, "static", "images", "flags")
FLAG_SRC = "https://raw.githubusercontent.com/stadust/pointercrate/master/pointercrate-demonlist-pages/static/images/flags/"
AREDL = "https://api.aredl.net/v2/api/aredl/levels"
FALLBACK = {"Extreme": 24, "Insane": 16.5, "Hard": 11, "Medium": 7, "Easy": 2.5, "Official": 3}
LENGTHS = {1: "Tiny", 2: "Short", 3: "Medium", 4: "Long", 5: "XL"}
_OV = os.path.join(SITE, "tools", "showcase-overrides.json")  # Nigel's own videos (apply-showcases.py)
SHOWCASES = json.load(io.open(_OV, encoding="utf-8")) if os.path.exists(_OV) else {}


def curl_json(url):
    try:
        out = subprocess.run(["curl", "-sS", "--max-time", "60", url], capture_output=True,
                             text=True, encoding="utf-8", timeout=90).stdout
        return json.loads(out)
    except Exception:
        return None


def load_js(name, var):
    code = "global.window={};require(process.argv[1]);process.stdout.write(JSON.stringify(window[process.argv[2]]))"
    r = subprocess.run(["node", "-e", code, os.path.join(DATA, name), var],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit(f"could not load {name}: {r.stderr[:400]}")
    return json.loads(r.stdout)


def write_js(name, var, value):
    path = os.path.join(DATA, name)
    src = io.open(path, encoding="utf-8").read()
    i = src.find(f"window.{var} =")
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        (src[:i] if i >= 0 else '"use strict";\n\n') + f"window.{var} = "
        + json.dumps(value, indent=2, ensure_ascii=False) + ";\n")


def trailing_id(x):
    s = str(x).strip()
    if s.isdigit():
        return int(s)
    m = re.search(r"(\d+)/?(?:[?#].*)?$", s)
    if not m:
        sys.exit(f"can't read an id from {x!r}")
    return int(m.group(1))


def thumb(vid):
    # YouTube only makes /maxresdefault for HD uploads (Bad Trip taught us that)
    for q in ("maxresdefault", "sddefault", "hqdefault"):
        url = f"https://i.ytimg.com/vi/{vid}/{q}.jpg"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=25) as r:
                if len(r.read()) > 2000:
                    return url
        except Exception:
            pass
    return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"


def gd_servers(lid):
    """gdbrowser's level JSON for lid straight from RobTop's servers, for when
    gdbrowser doesn't answer (tools/gdlevel.py): a dict, -1 (no such level) or None."""
    spec = importlib.util.spec_from_file_location("gdlevel", os.path.join(SITE, "tools", "gdlevel.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.level(lid)


def fetch_level(lid, allowed):
    gl = curl_json(f"https://gdladder.com/api/levels/{lid}")
    gl = gl if isinstance(gl, dict) and gl.get("ID") else {}
    gb = curl_json(f"https://gdbrowser.com/api/level/{lid}")
    if not isinstance(gb, dict) and gb != -1:  # gdbrowser didn't answer: RobTop's servers
        gb = gd_servers(lid)
    gb = gb if isinstance(gb, dict) else {}
    if not gl and not gb:
        return None, "not found on gdladder or gdbrowser"
    meta = gl.get("Meta") or {}
    ingame = gb.get("difficulty") or ((meta.get("Difficulty") or "?") + " Demon")
    if not ingame.endswith(" Demon"):
        return None, f"not a demon ({ingame})"
    tier = ingame[: -len(" Demon")]
    if meta.get("Length") == 6 or str(gb.get("length", "")).lower().startswith("plat"):
        return None, "platformer"
    if allowed and tier not in allowed:
        return None, f"{ingame} - only {'/'.join(allowed)} demons allowed"
    gd = {}
    ln = gb.get("length") or LENGTHS.get(meta.get("Length"))
    if ln:
        gd["length"] = ln
    objs = gb.get("objects") or meta.get("objects") or 0
    if isinstance(objs, int) and objs > 0:
        gd["objects"] = objs
    if gb.get("gameVersion") and gb["gameVersion"] != "0.0":
        gd["gameVersion"] = gb["gameVersion"]
    gd["inGameDifficulty"] = ingame
    song = meta.get("Song") or {}
    sid, sname = str(gb.get("songID") or song.get("ID") or ""), gb.get("songName") or song.get("Name")
    if sid.isdigit() and sname:
        gd["song"] = {"id": sid, "name": sname, "artist": gb.get("songAuthor") or ""}
        if gb.get("songLink") and gb["songLink"] != "-":
            gd["song"]["link"] = gb["songLink"]
        gd["songOfficial"] = False
    vid, rating = SHOWCASES.get(str(lid)) or gl.get("Showcase"), gl.get("Rating")
    pub = gb.get("author") or (meta.get("Publisher") or {}).get("name") or "Unknown"
    return {
        "id": lid, "position": 0, "name": (gb.get("name") or meta.get("Name") or f"Level {lid}").strip(),
        "difficulty": tier,
        "rating": round(rating, 2) if isinstance(rating, (int, float)) else None,
        "publisher": pub, "creators": [pub], "verifier": None,
        "videoUrl": f"https://www.youtube.com/watch?v={vid}" if vid else None,
        "thumbnailUrl": thumb(vid) if vid else None,
        "levelId": lid, "description": gb.get("description") or meta.get("Description") or None,
        "requirementPercent": 100, "records": [], "gd": gd,
    }, None


VERIFY = r"""
global.window = {};
const P = require('path'), site = process.argv[1], p = (f) => require(P.join(site, f));
p('data/config.js'); p('data/demons.js'); p('data/changelog.js'); p('static/js/list-utils.js');
const DL = window.DL, D = window.DEMONS, S = window.SITE, bad = [];
const allowed = S.allowedDifficulties || (S.extremesOnly ? ['Extreme'] : null);
const rank = (d) => (allowed ? allowed.indexOf(d.difficulty) : 0);
const r2 = (d) => Math.round(DL.demonRating(d) * 100);
D.forEach((d, i) => { if (d.position !== i + 1 || d.id !== d.levelId) bad.push('position/id ' + d.name); });
for (let i = 1; i < D.length; i++) {
  if (rank(D[i - 1]) > rank(D[i])) bad.push('tier order ' + D[i].name);
  else if (rank(D[i - 1]) === rank(D[i]) && r2(D[i - 1]) < r2(D[i])) bad.push('rating order ' + D[i].name);
}
D.forEach((d) => { const h = DL.positionHistoryFor(d); if (!h.length || h[h.length - 1].position !== d.position) bad.push('history ' + d.name); });
if (allowed) D.forEach((d) => { if (allowed.indexOf(d.difficulty) < 0) bad.push('not allowed ' + d.name); });
if (S.mainListSize === 'extremes') D.forEach((d) => { if ((DL.tierOf(d.position) === 'main') !== (d.difficulty === 'Extreme')) bad.push('tier ' + d.name); });
console.log(bad.length ? 'VERIFY FAILED: ' + bad.join('; ') : 'verify ok: ' + D.length + ' demons, ' + DL.aggregatePlayers().length + ' players');
process.exit(bad.length ? 1 : 0);
"""


def fmt_rating(x):
    return f"{x:.2f}" if isinstance(x, (int, float)) else "?"


def roster_add(cfg_text, people):
    """Append [(name, nationality, subdivision)] to config.js `members` (skips names
    already there). Returns (new text, names added)."""
    m = re.search(r"members:\s*\[([^\[\]]*?)(\s*)\]", cfg_text)
    if not m:
        return cfg_text, []
    have = set(re.findall(r'name:\s*"([^"]*)"', m.group(1)))
    ind = re.search(r"\n([ \t]*)\{", m.group(1))
    ind = ind.group(1) if ind else "    "
    lines, added = "", []
    for name, cc, sub in people:
        if name in have:
            continue
        have.add(name)
        added.append(name)
        fields = [f"name: {json.dumps(name, ensure_ascii=False)}"]
        if cc:
            fields.append(f'nationality: "{cc}"')
        if sub:
            fields.append(f'subdivision: "{sub}"')
        lines += f"\n{ind}{{ {', '.join(fields)} }},"
    return cfg_text[:m.end(1)] + lines + cfg_text[m.end(1):], added


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = {a for a in sys.argv[1:] if a.startswith("--")}
    refresh = "--refresh-ratings" in opts
    if not args and not refresh:
        sys.exit(__doc__)
    dry, initial = "--dry-run" in opts, "--initial" in opts
    spec = json.load(io.open(args[0], encoding="utf-8")) if args else {}
    day = spec.get("date") or _date.today().isoformat()
    cfg_path = os.path.join(DATA, "config.js")
    cfg = io.open(cfg_path, encoding="utf-8").read()
    m = re.search(r"allowedDifficulties:\s*\[([^\]]*)\]", cfg)
    allowed = re.findall(r'"([A-Za-z]+)"', m.group(1)) if m else (
        ["Extreme"] if re.search(r"extremesOnly:\s*true", cfg) else [])
    # Tier order only where config.js sets allowedDifficulties (Aceabase: every
    # Extreme above every Insane). Without it the whole list is one tier, ordered by
    # value, as tools/refresh-order.py and VERIFY have it (Nigel's Demonlist; the
    # old Extreme..Easy fallback re-sorted 32 of its demons and failed VERIFY).
    rank = {t: i for i, t in enumerate(allowed)}

    def tier(d):
        return rank.get(d.get("difficulty"), 99) if allowed else 0
    demons = sorted(load_js("demons.js", "DEMONS"), key=lambda d: d["position"])
    log = load_js("changelog.js", "CHANGELOG")
    if initial and demons:
        sys.exit("--initial is only for the first import (the list already has demons)")
    by_lid = {d["levelId"]: d for d in demons}
    players = spec.get("players") or {}
    known = {}
    for d in demons:
        for r in d.get("records", []):
            known.setdefault(r["player"], (r.get("nationality"), r.get("subdivision")))
    # A roster member with no records yet (added in Members first, clear later)
    # gets their country from the roster, not null.
    for m in re.finditer(r'name:\s*"([^"]+)"\s*,\s*nationality:\s*"([A-Z]{2})"(?:\s*,\s*subdivision:\s*"([A-Z0-9]+)")?', cfg):
        known.setdefault(m.group(1), (m.group(2), m.group(3)))

    aredl_raw = curl_json(AREDL)
    aredl = {x["level_id"]: x["position"] for x in aredl_raw if x.get("level_id")} if isinstance(aredl_raw, list) else {}
    if not aredl:
        print("  WARNING couldn't load the AREDL - rating ties keep their current order")

    def rating_of(d):
        return d["rating"] if isinstance(d.get("rating"), (int, float)) else FALLBACK.get(d.get("difficulty"), 3)

    # The list follows the AREDL (Nigel, 2026-10-06): an extreme on the AREDL sorts and
    # scores by its placement, turned into a GDDL-style rating by the curve
    # tools/refresh-order.py fits to the whole AREDL (config.js aredlFit, read by
    # DL.demonRating too); everything else by its gdladder rating.
    fm = re.search(r"aredlFit:\s*\{\s*a:\s*([-\d.]+),\s*b:\s*([-\d.]+),\s*exponent:\s*([-\d.]+)", cfg)
    fit = tuple(float(x) for x in fm.groups()) if fm else None

    def value(d):
        pos = aredl.get(d["levelId"])
        return fit[0] + fit[1] * pos ** fit[2] if fit and pos else rating_of(d)

    def key(d):  # tier, then value (2 dp), then AREDL placement; sort is stable for full ties
        return (tier(d), -round(value(d), 2), aredl.get(d["levelId"], 10 ** 9))

    # --refresh-ratings: re-pull every listed demon's gdladder rating, one request at a time
    old_rating, drifted = {}, []
    if refresh:
        for d in demons:
            gl = None
            for attempt in range(3):
                gl = curl_json(f"https://gdladder.com/api/levels/{d['levelId']}")
                if isinstance(gl, dict) and gl.get("ID"):
                    break
                time.sleep(5)
            r = gl.get("Rating") if isinstance(gl, dict) else None
            if not isinstance(r, (int, float)):
                print(f"  WARNING no gdladder rating for {d['name']} - kept r{d.get('rating')}")
                continue
            tier = (gl.get("Meta") or {}).get("Difficulty")
            if tier and tier != d.get("difficulty"):
                print(f"  NOTE gdladder now has {d['name']} as {tier} (the list says {d.get('difficulty')}) - not changed")
            if round(r, 2) != d.get("rating"):
                old_rating[d["levelId"]] = d.get("rating")
                drifted.append(d)
                print(f"  RATING {d['name']}: {d.get('rating')} -> {round(r, 2)}")
                d["rating"] = round(r, 2)
            time.sleep(0.5)
        print(f"ratings refreshed: {len(drifted)} of {len(demons)} drifted")

    def rated(x):  # "Sonic Wave 29.84 → 29.85" if it drifted this run, else "Sonic Wave Rebirth 29.84"
        if x["levelId"] in old_rating:
            return f"{x['name']} {fmt_rating(old_rating[x['levelId']])} → {fmt_rating(rating_of(x))}"
        return f"{x['name']} {fmt_rating(rating_of(x))}"

    # re-sorting what's already on the list (new rules / tie-breaks / rating drift) gets logged as moves
    moves, cur = [], [d["levelId"] for d in demons]
    for i, d in enumerate(sorted(demons, key=key)):
        if cur[i] != d["levelId"]:
            j, passed = cur.index(d["levelId"]), by_lid[cur[i]]
            if fit and aredl.get(d["levelId"]):
                why = f"AREDL placement - #{aredl[d['levelId']]}"
            elif round(rating_of(d), 2) == round(rating_of(passed), 2):
                why = f"Tied with {passed['name']} on GD Demon Ladder - the AREDL places it higher"
            elif d["levelId"] in old_rating or passed["levelId"] in old_rating:
                why = f"GD Demon Ladder rating refresh - {rated(d)}, {rated(passed)}"
            else:
                why = "Re-sorted"
            cur.insert(i, cur.pop(j))
            moves.append({"kind": "move", "demon": d["name"], "demonId": d["levelId"],
                          "from": j + 1, "to": i + 1, "text": why})
            print(f"  MOVE {d['name']}: #{j + 1} -> #{i + 1} ({why})")

    wanted = [(r["player"], trailing_id(r["level"]), int(r.get("progress", 100))) for r in spec.get("records", [])]
    for name, info in players.items():
        if not info.get("gdladder"):
            continue
        uid = trailing_id(info["gdladder"])
        prof = curl_json(f"https://gdladder.com/api/user/{uid}") or {}
        if not info.get("nationality") and prof.get("CountryCode"):
            info["nationality"] = prof["CountryCode"]
        base = f"https://gdladder.com/api/user/{uid}/submissions"
        ok = next(((n, p) for n in (100, 50, 25, 10) for p in (0, 1)
                   if isinstance((curl_json(f"{base}?limit={n}&page={p}") or {}).get("submissions"), list)), None)
        if not ok:
            print(f"  WARNING gdladder {uid}: couldn't read submissions")
            continue
        limit, page = ok
        seen, total, misses = {}, None, 0
        while page < 1000 and misses < 2 and (total is None or len(seen) < total):
            res = curl_json(f"{base}?limit={limit}&page={page}") or {}
            total = res.get("total", total or 0)
            new = [s for s in res.get("submissions") or [] if s.get("ID") not in seen]
            misses = 0 if new else misses + 1
            seen.update({s["ID"]: s for s in new})
            page += 1
        took = 0
        for s in seen.values():
            sm = (s.get("Level") or {}).get("Meta") or {}
            if (s.get("Progress") or 0) < 100 or sm.get("Length") == 6:
                continue
            if allowed and sm.get("Difficulty") not in allowed:
                continue
            wanted.append((name, int(s["Level"]["ID"]), 100))
            took += 1
        print(f"gdladder {uid} ({prof.get('Name')}, {info.get('nationality')}): {len(seen)}/{total} submissions read, {took} imported")

    def nat(player):
        info = players.get(player) or {}
        if info.get("nationality"):
            sub = info.get("subdivision")
            return info["nationality"].upper(), sub.upper() if sub else None
        return known.get(player, (None, None))

    fresh, rejected = {}, {}
    for _, lid, _ in wanted:
        if lid in by_lid or lid in fresh or lid in rejected:
            continue
        d, why = fetch_level(lid, allowed)
        if why:
            rejected[lid] = why
            print(f"  REFUSED {lid}: {why}")
        else:
            fresh[lid] = d

    order = list(dict.fromkeys(list(spec.get("tiebreak", [])) + [p for p, _, _ in wanted]))
    also, added, no_nat, got = {}, 0, set(), list(players)
    for player, lid, prog in wanted:
        d = by_lid.get(lid) or fresh.get(lid)
        if not d:
            continue
        rec = next((r for r in d["records"] if r["player"] == player), None)
        if rec:
            if lid in by_lid and rec["progress"] < 100 <= prog:  # an in-progress record became a clear
                also.setdefault(player, []).append(d["name"])
            rec["progress"] = max(rec["progress"], prog)
            continue
        cc, sub = nat(player)
        if not cc:
            no_nat.add(player)
        d["records"].append({"player": player, "progress": prog, "nationality": cc, "subdivision": sub})
        got.append(player)
        added += 1
        if lid in by_lid and prog >= 100:  # "also cleared" - not for a sub-100% record
            also.setdefault(player, []).append(d["name"])
    for d in fresh.values():
        clears = [r["player"] for r in d["records"] if r["progress"] >= 100]
        d["verifier"] = sorted(clears, key=order.index)[0] if clears else None
    for lid, who in (spec.get("verifiers") or {}).items():  # {"levelId": "player"}
        if int(lid) in fresh:
            fresh[int(lid)]["verifier"] = who

    everything = sorted(demons + list(fresh.values()), key=key)
    for i, d in enumerate(everything, 1):
        d["position"], d["id"] = i, d["levelId"]

    items = []
    if initial:
        n = len({r["player"] for d in everything for r in d["records"]})
        items.append({"kind": "note", "text": f"List created - {len(everything)} demons from {n} players."})
    else:
        for d in sorted(fresh.values(), key=lambda d: -d["position"]):  # high -> low: the replay reverses items
            it = {"kind": "add", "demon": d["name"], "demonId": d["levelId"], "at": d["position"]}
            if d["verifier"]:
                it["text"] = f"{d['verifier']}'s clear"
            items.append(it)
        for p, names in also.items():
            items.append({"kind": "note", "text": f"{p} also cleared {', '.join(names)}."})
    items += [{"kind": "note", "text": t} for t in spec.get("notes", [])]
    if drifted:
        n = len(drifted)
        what = ", ".join(rated(x) for x in drifted)
        items.append({"kind": "note", "text": f"GD Demon Ladder ratings refreshed - {n} level{'s' if n != 1 else ''} had drifted"
                      + (f" ({what}), so points shift a little." if n <= 6 else " since they were added, so points shift a little.")})
    items += list(reversed(moves))  # replayed first: re-sort what was there, then insert the new ones
    if items:
        if log and log[0].get("date") == day:
            log[0]["items"] = items + log[0]["items"]
        else:
            log.insert(0, {"date": day, "items": items})

    for d in sorted(fresh.values(), key=lambda d: d["position"]):
        print(f"  + #{d['position']} {d['name']} ({d['levelId']}) {d['difficulty']} r{d['rating']} - {d['verifier']}")
    print(f"{len(fresh)} new demons, {added} records added, {len(moves)} moves, {len(rejected)} refused, list -> {len(everything)} demons")
    if no_nat:
        print("  WARNING no nationality for:", ", ".join(sorted(no_nat)))
    for d in everything:
        if d.get("rating") is None:
            print(f"  WARNING {d['name']} has no gdladder rating - sorted as a typical {d['difficulty']}")
    lowest = {}
    for d in everything:
        t = d["difficulty"]
        lowest[t] = min(lowest.get(t, 1e9), rating_of(d))
    for d in everything:  # a lower tier rated above some higher-tier demon
        for t, lo in lowest.items():
            if rank.get(t, 99) < rank.get(d["difficulty"], 99) and rating_of(d) > lo:
                print(f"  NOTE {d['name']} ({d['difficulty']}, r{rating_of(d)}) is rated above the easiest {t} (r{lo})")
                break

    # new players join the config.js `members` roster (the stats viewer lists members even at 0 points)
    people = [(p, *nat(p)) for p in dict.fromkeys(got)]
    if initial:
        cfg = re.sub(r'listCreated:\s*"[^"]*"', f'listCreated: "{day}"', cfg)
    cfg, joined = roster_add(cfg, people)
    for p, cc, sub in people:
        if p in joined:
            print(f"  roster {'would get' if dry else '+'} {p} ({cc or 'no nationality'}{'/' + sub if sub else ''})")

    need = {(r["nationality"], r.get("subdivision")) for d in everything for r in d["records"] if r.get("nationality")}
    need |= {(cc, sub) for p, cc, sub in people if p in joined and cc}
    for cc, sub in sorted(need, key=str):
        for rel in [f"{cc.lower()}.svg"] + ([f"{cc.lower()}/{sub.lower()}.svg"] if sub else []):
            dest = os.path.join(FLAGS, *rel.split("/"))
            if os.path.exists(dest):
                continue
            if dry:
                print(f"  would fetch flag {rel}")
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            r = subprocess.run(["curl", "-sS", "-f", "-o", dest, FLAG_SRC + rel], capture_output=True)
            print(f"  flag {rel}: {'ok' if r.returncode == 0 else 'NOT on pointercrate'}")

    if dry:
        print("dry run - nothing written")
        return
    for d in everything:  # DL.demonRating reads it (see value() above)
        d["aredlPosition"] = aredl.get(d["levelId"])
    write_js("demons.js", "DEMONS", everything)
    write_js("changelog.js", "CHANGELOG", log)
    if initial or joined:
        io.open(cfg_path, "w", encoding="utf-8", newline="\n").write(cfg)
    v = subprocess.run(["node", "-e", VERIFY, SITE], capture_output=True, text=True, encoding="utf-8")
    print((v.stdout or v.stderr).strip())


if __name__ == "__main__":
    main()

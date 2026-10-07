#!/usr/bin/env python3
"""Re-order the list by the AREDL and GD Demon Ladder, and log every move.

The rule (Nigel, 2026-10-06): extremes follow their AREDL placement, and
everything else is placed by its GD Demon Ladder (GDDL) rating on the same
scale. A curve fitted to the whole AREDL turns a placement into a GDDL-style
rating,

    rating = a + b * position ^ exponent

so the AREDL's order and the GDDL ratings below it line up. The list is sorted
by that value (Aceabase keeps extremes above insanes first) and scored by it:
DL.demonRating in static/js/list-utils.js reads the same fit from
data/config.js (aredlFit) and each demon's aredlPosition.

Every run re-pulls the AREDL (refitting the curve) and every listed demon's
GDDL rating, re-sorts, renumbers, and logs each position change in
data/changelog.js as a move with its reason, so Position History follows it.

    python tools/refresh-order.py            refresh, re-sort, log, write
    python tools/refresh-order.py --dry-run  print what would change
    python tools/refresh-order.py --no-drift-note
        no changelog note for GD Demon Ladder rating drift (the scheduled upkeep:
        tiny drifts every few days would bury the changelog; moves are still logged)

This file is the same on both sites (Nigel's Demonlist and Aceabase).
"""
import io, json, os, re, subprocess, sys, time
from datetime import date as _date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
AREDL = "https://api.aredl.net/v2/api/aredl/levels"
GDDL = "https://gdladder.com/api/levels/{}"
# Same fallbacks as DL.RATING_BY_DIFFICULTY, for a demon with no rating at all.
FALLBACK = {"Extreme": 24, "Insane": 16.5, "Hard": 11, "Medium": 7, "Easy": 2.5, "Official": 3}


def curl_json(url):
    r = subprocess.run(["curl", "-s", "--max-time", "30", url], capture_output=True, text=True, encoding="utf-8")
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def read(name):
    with io.open(os.path.join(DATA, name), encoding="utf-8", newline="") as f:
        return f.read()


def write(name, text):
    with io.open(os.path.join(DATA, name), "w", encoding="utf-8", newline="") as f:
        f.write(text)


def split_array(text, var):
    """(head, array, tail) around the JSON array assigned to window.<var>."""
    i = text.index("[", text.index("window." + var))
    j = text.rindex("]") + 1
    return text[:i], json.loads(text[i:j]), text[j:]


def load_var(name, var):
    """window.<var> from a data file, through node (the hand-formatted changelog isn't JSON)."""
    js = ("const fs=require('fs'),vm=require('vm');const w={};"
          f"vm.runInNewContext(fs.readFileSync({json.dumps(os.path.join(DATA, name))},'utf8'),{{window:w}});"
          f"process.stdout.write(JSON.stringify(w.{var}))")
    r = subprocess.run(["node", "-e", js], capture_output=True, text=True, encoding="utf-8")
    return json.loads(r.stdout)


def old_fit(cfg):
    m = re.search(r"aredlFit:\s*\{\s*a:\s*([-\d.]+),\s*b:\s*([-\d.]+),\s*exponent:\s*([-\d.]+)", cfg)
    return {"a": float(m.group(1)), "b": float(m.group(2)), "exponent": float(m.group(3))} if m else None


def fit_curve(levels):
    """Least-squares rating = a + b * position^e over the AREDL, best e by R^2."""
    pts = [(x["position"], x["gddl_tier"]) for x in levels
           if isinstance(x.get("gddl_tier"), (int, float)) and x.get("position")]
    ys = [y for _, y in pts]
    my = sum(ys) / len(ys)
    st = sum((y - my) ** 2 for y in ys)
    best = None
    for k in range(10, 81):
        e = k / 100
        xs = [p ** e for p, _ in pts]
        mx = sum(xs) / len(xs)
        b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
        a = my - b * mx
        r2 = 1 - sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys)) / st
        if b < 0 and (best is None or r2 > best["r2"]):
            best = {"a": round(a, 4), "b": round(b, 6), "exponent": e, "points": len(pts), "r2": round(r2, 4)}
    return best


def value(d, fit):
    """The number the list is sorted and scored by (mirrors DL.demonRating)."""
    pos = d.get("aredlPosition")
    if fit and isinstance(pos, int):
        return fit["a"] + fit["b"] * pos ** fit["exponent"]
    if isinstance(d.get("rating"), (int, float)):
        return d["rating"]
    return FALLBACK.get(d.get("difficulty"), 3)


def replay_check(demons, log):
    """Mirror of DL.positionHistoryFor's reconstruction: undo every logged change
    from today's order, replay forward, and insist every move/add/remove starts
    where it says it does. Returns a list of problems."""
    order = [d["id"] for d in sorted(demons, key=lambda d: d["position"])]
    events = []
    for entry in reversed(log):
        for it in reversed(entry.get("items") or []):
            if it.get("kind") in ("add", "move", "remove"):
                events.append(it)
    for ev in reversed(events):
        k, i = ev["kind"], order.index(ev["demonId"]) if ev.get("demonId") in order else -1
        if k == "add" and i != -1:
            order.pop(i)
        elif k == "move" and i != -1:
            order.insert(min(ev["from"] - 1, len(order) - 1), order.pop(i))
        elif k == "remove":
            order.insert(min(ev["from"] - 1, len(order)), ev.get("demonId"))
    problems = []
    for ev in events:
        k, did = ev["kind"], ev.get("demonId")
        if k == "add":
            order.insert(max(0, min(ev["at"] - 1, len(order))), did)
        elif k == "move":
            if did not in order:
                continue
            if order.index(did) + 1 != ev["from"]:
                problems.append(f"move of {ev.get('demon')} says from {ev['from']} but it was at {order.index(did) + 1}")
            order.insert(max(0, min(ev["to"] - 1, len(order) - 1)), order.pop(order.index(did)))
        elif k == "remove" and did in order:
            order.remove(did)
    final = [d["id"] for d in sorted(demons, key=lambda d: d["position"])]
    if order != final:
        problems.append("replaying the changelog doesn't end at today's order")
    return problems


def entry_text(day, items, hand):
    if not hand:
        body = json.dumps({"date": day, "items": items}, indent=2, ensure_ascii=False)
        return "\n".join("  " + line for line in body.split("\n")) + ","
    out = ["  {", f'    date: "{day}",', "    items: ["]
    for it in items:
        fields = []
        for k in ("kind", "demon", "demonId", "at", "from", "to", "text"):
            if k in it:
                fields.append(f"{k}: {json.dumps(it[k], ensure_ascii=False)}")
        out.append("      { " + ", ".join(fields) + " },")
    out += ["    ],", "  },"]
    return "\n".join(out)


def main():
    dry = "--dry-run" in sys.argv
    day = _date.today().isoformat()
    cfg = read("config.js")
    extremes_first = bool(re.search(r'mainListSize:\s*"extremes"', cfg))
    had_fit = "aredlFit:" in cfg

    levels = curl_json(AREDL)
    if not isinstance(levels, list) or not levels:
        sys.exit("couldn't load the AREDL - nothing changed")
    fit = fit_curve(levels)
    aredl = {x["level_id"]: x["position"] for x in levels if x.get("level_id")}
    print(f"AREDL: {len(levels)} levels; fit rating = {fit['a']} + {fit['b']} * position^{fit['exponent']}"
          f" (R2 {fit['r2']}, {fit['points']} levels)")

    dhead, demons, dtail = split_array(read("demons.js"), "DEMONS")
    demons.sort(key=lambda d: d["position"])
    log = load_var("changelog.js", "CHANGELOG")
    old_val = {d["id"]: value(d, old_fit(cfg)) for d in demons}
    old_pos = {d["id"]: d.get("aredlPosition") for d in demons}

    drift = []
    for d in demons:  # one request at a time: gdladder rate-limits
        gl = curl_json(GDDL.format(d["levelId"]))
        r = gl.get("Rating") if isinstance(gl, dict) else None
        if isinstance(r, (int, float)):
            r = round(r, 2)
            if r != d.get("rating"):
                drift.append((d, d.get("rating"), r))
                d["rating"] = r
        else:
            print(f"  WARNING no GDDL rating for {d['name']} - kept {d.get('rating')}")
        d["aredlPosition"] = aredl.get(d["levelId"])
        time.sleep(0.35)

    rank = {"Extreme": 0, "Insane": 1}
    def key(d):
        return ((rank.get(d.get("difficulty"), 2) if extremes_first else 0),
                -round(value(d, fit), 2), d.get("aredlPosition") or 10 ** 9, d["position"])
    target = sorted(demons, key=key)

    order = list(demons)
    moves = []
    for i, d in enumerate(target):
        j = order.index(d)
        if j == i:
            continue
        passed = order[i]
        pos = d.get("aredlPosition")
        if pos and (not had_fit or old_pos[d["id"]] != pos):
            why = (f"The list follows the AREDL now - AREDL #{pos}" if not had_fit
                   else f"AREDL placement shift - now #{pos}")
        else:
            changed = {x["id"]: (o, n) for x, o, n in drift}
            who = d if d["id"] in changed else passed if passed["id"] in changed else None
            if who:
                o, n = changed[who["id"]]
                why = f"GD Demon Ladder rating refresh - {who['name']} {o} → {n}"
            else:
                why = "Re-sorted with the list"
        moves.append({"kind": "move", "demon": d["name"], "demonId": d["id"], "from": j + 1, "to": i + 1, "text": why})
        order.insert(i, order.pop(j))
    for n, d in enumerate(order, 1):
        d["position"] = n

    notes = []
    if not had_fit:
        notes.append({"kind": "note", "text": "The list follows the AREDL now: extremes are ordered and scored by their AREDL "
                      "placement, and everything else by its GD Demon Ladder rating on the same scale (a curve fit to the "
                      "whole AREDL turns a placement into a rating). Points shift for everyone."})
    if drift and "--no-drift-note" not in sys.argv:
        notes.append({"kind": "note", "text": f"GD Demon Ladder ratings refreshed - {len(drift)} level"
                      f"{'s' if len(drift) != 1 else ''} drifted ({', '.join(f'{d['name']} {o} → {n}' for d, o, n in drift)})."})
    items = notes + list(reversed(moves))  # newest first: the replay applies them bottom-up

    print(f"rating drift: {len(drift)}; moves: {len(moves)}")
    for m in moves:
        print(f"  {m['demon']}: {m['from']} -> {m['to']} ({m['text']})")
    for d in demons:
        before, after = old_val[d["id"]], value(d, fit)
        if had_fit and abs(after - before) > 0.005:
            print(f"  value {d['name']}: {before:.2f} -> {after:.2f}")
    if dry:
        print("dry run - nothing written")
        return

    fit_line = (f'  aredlFit: {{ a: {fit["a"]}, b: {fit["b"]}, exponent: {fit["exponent"]}, points: {fit["points"]}, '
                f'r2: {fit["r2"]}, fitted: "{day}" }},')
    if had_fit:
        cfg = re.sub(r"  aredlFit: \{[^\n]*\},", lambda _: fit_line, cfg, count=1)
    else:
        nl = "\r\n" if "\r\n" in cfg else "\n"
        block = ["  // AREDL FIT - tools/refresh-order.py fits a GD Demon Ladder-style rating to",
                 "  // an AREDL placement over the whole AREDL: rating = a + b * position^exponent.",
                 "  // Extremes on the AREDL are ordered and scored by it (DL.demonRating), so the",
                 "  // list follows AREDL placement; everything else uses its own GDDL rating.",
                 fit_line]
        m = re.search(r"\n([ \t]*//[^\n]*\n)*[ \t]*scoring:\s*\{", cfg)
        if not m:
            sys.exit("couldn't find scoring: in config.js - nothing written")
        cfg = cfg[:m.start()] + nl + nl.join(block) + cfg[m.start():]
    write("config.js", cfg)

    nl = "\r\n" if "\r\n" in read("demons.js") else "\n"
    write("demons.js", dhead + json.dumps(sorted(demons, key=lambda d: d["position"]), indent=2,
                                          ensure_ascii=False).replace("\n", nl) + dtail)

    if items:
        text = read("changelog.js")
        hand = '"date":' not in text
        anchor = text.index("window.CHANGELOG = [") + len("window.CHANGELOG = [")
        lnl = "\r\n" if "\r\n" in text else "\n"
        top = log[0] if log else None
        if top and top.get("date") == day:
            m = re.compile(r"items\"?:\s*\[").search(text, anchor)
            ins = entry_text(day, items, hand)
            ins = ins[ins.index("[") + 1: ins.rindex("]")].rstrip()  # just the item lines
            if not hand:
                ins = ins.rstrip() + ","
            text = text[:m.end()] + lnl + ins.strip("\n").replace("\n", lnl) + text[m.end():]
        else:
            text = text[:anchor] + lnl + entry_text(day, items, hand).replace("\n", lnl) + text[anchor:]
        write("changelog.js", text)

    problems = replay_check(load_var("demons.js", "DEMONS"), load_var("changelog.js", "CHANGELOG"))
    print("replay check:", "OK" if not problems else problems)


if __name__ == "__main__":
    main()

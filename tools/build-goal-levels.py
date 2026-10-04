#!/usr/bin/env python3
"""Regenerate data/goal-levels.js from data/goals.js.

For every distinct levelId referenced in data/goals.js that ISN'T already on the
Demonlist (data/demons.js), fetch the level's facts from gdladder + gdbrowser and
extract a colour palette from its showcase-video thumbnail, so goal.html can
theme itself off the image.

Run it whenever you add/change a goal in data/goals.js:

    python site/tools/build-goal-levels.py

Needs: Python 3, Pillow (`pip install pillow`), and `curl` on PATH.
"""
import json, subprocess, colorsys, io, os, re, urllib.request
from collections import Counter
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, ".."))
DATA = os.path.join(SITE, "data")

LEN_CODE = {1: "Tiny", 2: "Short", 3: "Medium", 4: "Long", 5: "XL", 6: "Plat"}


def curl_json(url):
    try:
        out = subprocess.run(
            ["curl", "-sS", "--max-time", "25", url], capture_output=True, text=True, timeout=45
        ).stdout
        return json.loads(out)
    except Exception as e:
        print("  curl fail", url, e)
        return None


def fetch_thumb(video_id):
    """Return (best-available thumbnail URL, its bytes). YouTube only makes a
    /maxresdefault for HD uploads; fall back to /sddefault then /hqdefault."""
    for q in ("maxresdefault", "sddefault", "hqdefault"):
        try:
            url = f"https://i.ytimg.com/vi/{video_id}/{q}.jpg"
            data = urllib.request.urlopen(
                urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=25
            ).read()
            if len(data) > 2000:
                return url, data
        except Exception:
            continue
    return None, None


def _hex(r, g, b):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in (r, g, b))


def hls_hex(h, l, s):
    return _hex(*[c * 255 for c in colorsys.hls_to_rgb(h % 1.0, max(0, min(1, l)), max(0, min(1, s)))])


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def wcag_lum(rgb):
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def palette(img_bytes):
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB").resize((128, 72))
    px = list(im.getdata())
    total = len(px)
    hist = Counter((p[0] // 20 * 20, p[1] // 20 * 20, p[2] // 20 * 20) for p in px)

    def hls(rgb):
        return colorsys.rgb_to_hls(*[c / 255 for c in rgb])

    best, best_score = None, -1.0
    for rgb, cnt in hist.items():
        h, l, s = hls(rgb)
        if l < 0.10 or l > 0.92:
            continue
        score = (s ** 1.4) * ((cnt / total) ** 0.45) * (1 - abs(l - 0.52) * 1.1)
        if score > best_score:
            best_score, best = score, rgb
    if best is None:
        best = max(hist, key=hist.get)

    ah, _, as_ = hls(best)
    sat = min(0.95, max(0.55, as_))

    # accent lightness -> perceptual luminance in a band usable as a UI colour on
    # the pale page (darkens yellows/limes hard, barely touches blues/reds)
    lo, hi = 0.30, 0.62
    for _ in range(24):
        mid = (lo + hi) / 2
        if wcag_lum(hex_rgb(hls_hex(ah, mid, sat))) > 0.24:
            hi = mid
        else:
            lo = mid
    accent = hls_hex(ah, max(0.34, min(0.55, (lo + hi) / 2)), sat)
    return {
        "accent": accent,
        "deep": hls_hex(ah, 0.15, min(0.62, sat)),
        "wash": hls_hex(ah, 0.966, 0.5),
        "mist": hls_hex(ah, 0.92, 0.42),
        "onAccent": "#111111" if wcag_lum(hex_rgb(accent)) > 0.32 else "#ffffff",
        "ink": hls_hex(ah, 0.2, 0.4),
    }


goals_src = io.open(os.path.join(DATA, "goals.js"), encoding="utf-8").read()
level_ids = []
video_override = {}  # levelId -> YouTube URL from a goal's `video:` field
_cur = None
for _line in goals_src.splitlines():
    m = re.search(r"levelId:\s*(\d+)", _line)
    if m:
        _cur = int(m.group(1))
        if _cur not in level_ids:
            level_ids.append(_cur)
    m = re.search(r'video:\s*"([^"]+)"', _line)
    if m and _cur and _cur not in video_override:
        video_override[_cur] = m.group(1)


def yt_id(url):
    m = re.search(r"(?:youtu\.be/|[?&]v=|/embed/)([\w-]{6,})", url or "")
    return m.group(1) if m else None

demons_src = io.open(os.path.join(DATA, "demons.js"), encoding="utf-8").read()
listed = {int(m.group(1)) for m in re.finditer(r'"levelId":\s*(\d+)', demons_src)}
# showcase priority: a goal's own `video:` > tools/showcase-overrides.json (Nigel's
# channel, see apply-showcases.py) > the list's own video > gdladder's Showcase
_ov = os.path.join(HERE, "showcase-overrides.json")
SHOWCASES = json.load(io.open(_ov, encoding="utf-8")) if os.path.exists(_ov) else {}
listed_video = {int(m.group(2)): m.group(1) for m in re.finditer(
    r'"videoUrl":\s*"([^"]*)",\s*"thumbnailUrl":\s*(?:"[^"]*"|null),\s*"levelId":\s*(\d+)', demons_src)}

# carry hand-written editorial fields over from the existing file
KEEP = ("writeup",)
prev = {}
try:
    ps = io.open(os.path.join(DATA, "goal-levels.js"), encoding="utf-8").read()
    prev = json.loads(re.search(r"window\.GOAL_LEVELS\s*=\s*(\{.*\});\s*$", ps, re.S).group(1))
except Exception:
    pass

out = {}
for lid in level_ids:
    if lid in listed:
        print(f"  {lid}  (on the Demonlist - skipped, demons.js wins)")
        continue

    gl = curl_json(f"https://gdladder.com/api/levels/{lid}") or {}
    gb = curl_json(f"https://gdbrowser.com/api/level/{lid}")
    gb = {} if gb in (-1, "-1", None) else gb
    meta = gl.get("Meta", {}) or {}
    song = meta.get("Song", {}) or {}

    showcase = (yt_id(video_override.get(lid)) or SHOWCASES.get(str(lid))
                or yt_id(listed_video.get(lid)) or gl.get("Showcase") or None)
    rating = round(gl.get("Rating", 0) or 0, 2) or None
    difficulty = meta.get("Difficulty") or (gb.get("difficulty") or "").replace(" Demon", "") or "Extreme"

    entry = {
        "name": gb.get("name") or meta.get("Name") or f"Level {lid}",
        "publisher": gb.get("author") or None,
        "difficulty": difficulty,
        "rating": rating,
        "levelId": lid,
        "description": gb.get("description") or meta.get("Description") or None,
        "requirementPercent": 100,
    }
    if showcase:
        entry["videoUrl"] = f"https://www.youtube.com/watch?v={showcase}"

    gd = {}
    ln = gb.get("length") or LEN_CODE.get(meta.get("Length"))
    if ln:
        gd["length"] = ln
    objs = gb.get("objects") or meta.get("objects") or 0
    if objs and objs > 0:
        gd["objects"] = objs
    gv = gb.get("gameVersion")
    if gv and gv != "0.0":
        gd["gameVersion"] = gv
    gd["inGameDifficulty"] = gb.get("difficulty") or (difficulty + " Demon")
    sid = gb.get("songID") or song.get("ID")
    sname = gb.get("songName") or song.get("Name")
    if sid and sname and re.match(r"^\d+$", str(sid)):
        gd["song"] = {"id": str(sid), "name": sname, "artist": gb.get("songAuthor") or song.get("ArtistName") or ""}
        sl = gb.get("songLink")
        if sl and sl != "-":
            gd["song"]["link"] = sl
    entry["gd"] = gd

    if showcase:
        turl, tb = fetch_thumb(showcase)
        entry["thumbnailUrl"] = turl or f"https://i.ytimg.com/vi/{showcase}/maxresdefault.jpg"
        if tb:
            try:
                entry["palette"] = palette(tb)
            except Exception as e:
                print("  palette fail", lid, e)

    for k in KEEP:
        if k in prev.get(str(lid), {}):
            entry[k] = prev[str(lid)][k]

    out[str(lid)] = entry
    print(f"  {lid}  {entry['name']:<26} r{rating}  {difficulty:<8} accent={entry.get('palette', {}).get('accent', '?')}")

header = (
    '"use strict";\n'
    "// -----------------------------------------------------------------------------\n"
    '// Level metadata for the off-list levels referenced by data/goals.js ("The\n'
    "// Grind\"). Generated by tools/build-goal-levels.py from gdladder + gdbrowser;\n"
    "// `palette` is pulled from the showcase video's thumbnail so goal.html themes\n"
    "// itself off the image. A goal level that IS on the Demonlist uses that demon's\n"
    "// data/demons.js entry instead and is not listed here. Regenerate after editing\n"
    "// data/goals.js:  python site/tools/build-goal-levels.py\n"
    "//\n"
    "// A hand-written `writeup: { text, source, url }` on any level is EDITORIAL and\n"
    "// is carried across regenerations - edit it here directly.\n"
    "// -----------------------------------------------------------------------------\n\n"
)
io.open(os.path.join(DATA, "goal-levels.js"), "w", encoding="utf-8", newline="\n").write(
    header + "window.GOAL_LEVELS = " + json.dumps(out, indent=2, ensure_ascii=False) + ";\n"
)
print(f"\nwrote {len(out)} levels to data/goal-levels.js")

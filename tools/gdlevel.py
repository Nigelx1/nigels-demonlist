"""
A Geometry Dash level's facts in gdbrowser's shape, from RobTop's own servers.

gdbrowser.com/api/level/<id> is where the tools get a level's name, creator,
stars, length, objects, version and song. Since late October 2026 gdbrowser
shows scripts (GitHub's runners, Nigel's PC) Cloudflare's "Just a moment..."
page instead. gdbrowser only reads RobTop's servers, so when it doesn't answer
the tools ask them directly with the game's own level search
(getGJLevels21.php) and read the answer the way gdbrowser does. The keys come
out the same, so the rest of each tool doesn't change.

Used by add-records.py (fetch_level), build-goal-levels.py and apply-edit.py
(add_unrated). No third-party modules, so it runs anywhere the tools run.
"""

import base64, subprocess, urllib.parse

SEARCH = "https://www.boomlings.com/database/getGJLevels21.php"
SECRET = "Wmfd2893gb7"  # the game's public request secret: every GD client sends it
DIFFICULTY = {"0": "Unrated", "10": "Easy", "20": "Normal", "30": "Hard", "40": "Harder", "50": "Insane"}
DEMONS = {"3": "Easy", "4": "Medium", "5": "Insane", "6": "Extreme"}  # anything else: Hard
LENGTHS = ["Tiny", "Short", "Medium", "Long", "XL", "Plat."]


def ask(lid, timeout=25):
    """RobTop's raw answer for level lid, or None when it didn't answer. No
    User-Agent at all: the servers turn curl's default one away."""
    try:
        r = subprocess.run(["curl", "-sS", "-A", "", "--max-time", str(timeout), "-X", "POST",
                            "--data", f"str={int(lid)}&type=0&secret={SECRET}", SEARCH],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout + 20)
    except Exception:
        return None
    return r.stdout if r.returncode == 0 else None


def _pairs(record, sep):
    parts = record.split(sep)
    return dict(zip(parts[0::2], parts[1::2]))


def parse(lid, answer):
    """The search answer (levels#creators#songs#page#hash) as gdbrowser's level
    JSON: a dict, -1 when the game says there's no such level, or None when it's
    not an answer at all (an error page, a cut-off reply)."""
    if answer is None:
        return None
    answer = answer.strip()
    if answer == "-1":
        return -1
    sections = answer.split("#")
    if len(sections) < 3 or not sections[0].startswith("1:"):
        return None
    level = next((d for d in (_pairs(r, ":") for r in sections[0].split("|")) if d.get("1") == str(lid)), None)
    if level is None:
        return -1  # the search found other levels, not this id
    g = level.get

    def num(key):
        v = g(key) or ""
        return int(v) if v.lstrip("-").isdigit() else 0

    out = {"id": int(lid), "name": g("2") or "-"}
    try:
        desc = base64.urlsafe_b64decode((g("3") or "") + "=" * (-len(g("3") or "") % 4)).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        desc = ""
    if desc:
        out["description"] = desc
    creator = next((c.split(":") for c in sections[1].split("|") if c.split(":")[0] == g("6")), None)
    if creator and len(creator) > 1 and creator[1]:
        out["author"] = creator[1]
    out["difficulty"] = DIFFICULTY.get(g("9") or "0", "Unrated")
    if num("17") > 0:
        out["difficulty"] = DEMONS.get(g("43") or "", "Hard") + " Demon"
    if num("25") > 0:
        out["difficulty"] = "Auto"
    out["stars"] = num("18")
    if 0 <= num("15") < len(LENGTHS) and (g("15") or "") != "":
        out["length"] = LENGTHS[num("15")]
        out["platformer"] = num("15") == 5
    out["objects"] = num("45")
    v = num("13")
    out["gameVersion"] = f"{v / 10:.1f}" if v > 17 else "1.8" if v == 11 else "1.7" if v == 10 else "Pre-1.7"
    song = num("35")
    if song > 0:
        info = next((d for d in (_pairs(s, "~|~") for s in sections[2].split("~:~")) if d.get("1") == str(song)), {})
        out["songID"] = str(song)
        out["songName"] = info.get("2") or "Unknown"
        out["songAuthor"] = info.get("4") or "Unknown"
        if info.get("10"):
            out["songLink"] = urllib.parse.unquote(info["10"])
    return out


def level(lid, timeout=25):
    """parse(lid, ask(lid)): gdbrowser's level JSON for lid from RobTop's servers."""
    return parse(lid, ask(lid, timeout))

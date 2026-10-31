"""
A Geometry Dash level's facts in gdbrowser's shape, when gdbrowser won't say.

gdbrowser.com/api/level/<id> is where the tools get a level's name, creator,
stars, length, objects, version and song. Since late October 2026 gdbrowser
shows scripts (GitHub's runners, Nigel's PC) Cloudflare's "Just a moment..."
page instead. gdbrowser only reads RobTop's servers, so the tools ask them
directly with the game's own level search (getGJLevels21.php) and read the
answer the way gdbrowser does. RobTop's servers turn GitHub's runners away
too, so after them comes GDHistory (history.geometrydash.eu), an archive of
the game's answers, read the same way from its newest copy of the servers'
own answer. Either way the keys come out as gdbrowser's, so the rest of each
tool doesn't change.

GDHistory only has levels it has archived, so on a runner a brand-new level
couldn't be looked up at all. The mod page's Function does reach RobTop's
servers (functions/api/edit.js): it asks them about the levels an edit looks
up and sends their answers with the edit (payload "gd"). apply-edit.py writes
those to a JSON file ({level id: answer}) named by the GDLEVEL_ANSWERS
environment variable, which the tools it runs inherit, and ask() returns the
answer there for that level instead of asking (any other level it asks as
before).

Used by add-records.py (fetch_level), build-goal-levels.py and apply-edit.py
(gd_servers). No third-party modules, so it runs anywhere the tools run.
"""

import base64, io, json, os, subprocess, urllib.parse

SEARCH = "https://www.boomlings.com/database/getGJLevels21.php"
HISTORY = "https://history.geometrydash.eu/api/v1/level/{}/"
SECRET = "Wmfd2893gb7"  # the game's public request secret: every GD client sends it
ANSWERS = "GDLEVEL_ANSWERS"  # names a JSON file of RobTop's answers that came with the edit
DIFFICULTY = {"0": "Unrated", "10": "Easy", "20": "Normal", "30": "Hard", "40": "Harder", "50": "Insane"}
DEMONS = {"3": "Easy", "4": "Medium", "5": "Insane", "6": "Extreme"}  # anything else: Hard
LENGTHS = ["Tiny", "Short", "Medium", "Long", "XL", "Plat."]


def attached(lid):
    """RobTop's answer for level lid that came with the edit (the file GDLEVEL_ANSWERS
    names, {level id: answer}), or None: no such file, or nothing in it for lid."""
    path = os.environ.get(ANSWERS)
    if not path:
        return None
    try:
        with io.open(path, encoding="utf-8") as f:
            got = json.load(f)
    except (OSError, ValueError):
        return None
    answer = got.get(str(int(lid))) if isinstance(got, dict) else None
    return answer if isinstance(answer, str) else None


def ask(lid, timeout=25):
    """RobTop's raw answer for level lid, or None when it didn't answer: the one that
    came with the edit when there is one (attached), else asked. No User-Agent at
    all: the servers turn curl's default one away."""
    got = attached(lid)
    if got is not None:
        return got
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

    out = {"id": int(lid), "name": g("2") or "-", "_from": "the Geometry Dash servers"}
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
    out["gameVersion"] = _version(num("13"))
    song = num("35")
    if song > 0:
        info = next((d for d in (_pairs(s, "~|~") for s in sections[2].split("~:~")) if d.get("1") == str(song)), {})
        out["songID"] = str(song)
        out["songName"] = info.get("2") or "Unknown"
        out["songAuthor"] = info.get("4") or "Unknown"
        if info.get("10"):
            out["songLink"] = urllib.parse.unquote(info["10"])
    else:
        out["songID"] = f"Level {num('12') + 1}"  # an official song, named the way gdbrowser names it
    return out


def _version(v):
    return f"{v / 10:.1f}" if v > 17 else "1.8" if v == 11 else "1.7" if v == 10 else "Pre-1.7"


SERVER_COPIES = ("get", "download")  # GDHistory's copies of the servers' own answers


def from_history(lid, data):
    """GDHistory's level JSON as gdbrowser's level JSON, read from its newest copy
    of the servers' own answer ("get" or "download"). Its save-file ("glm_...")
    and hand-entered copies have most fields empty or out of date, so they're
    never used. -1 when GDHistory says the level was deleted (the servers' "no
    such level"); None when it has no server copy of level lid ("not seen" isn't
    "doesn't exist"). A field the copy doesn't have is left out, not guessed."""
    if not isinstance(data, dict) or data.get("online_id") != int(lid):
        return None
    if data.get("is_deleted") is True:
        return -1
    copies = [r for r in data.get("records") or [] if isinstance(r, dict) and r.get("level_name")
              and r.get("record_type") in SERVER_COPIES and not r.get("is_invalid")]
    if not copies:
        return None
    r = max(copies, key=lambda c: c.get("real_date") or "")

    def num(v):
        return v if isinstance(v, int) and not isinstance(v, bool) else None

    out = {"id": int(lid), "name": r["level_name"], "_from": "GDHistory"}
    if num(r.get("stars")) is not None:
        out["stars"] = r["stars"]
    if r.get("description"):
        out["description"] = r["description"]
    author = r.get("username") or data.get("cache_username")  # "download" copies carry no username
    if author:
        out["author"] = author
    out["difficulty"] = DIFFICULTY.get(str(num(r.get("rating_sum")) or 0), "Unrated")
    if r.get("demon"):
        out["difficulty"] = DEMONS.get(str(num(r.get("demon_type"))), "Hard") + " Demon"
    if r.get("auto"):
        out["difficulty"] = "Auto"
    if num(r.get("length")) is not None and 0 <= r["length"] < len(LENGTHS):
        out["length"] = LENGTHS[r["length"]]
        out["platformer"] = r["length"] == 5
    if num(r.get("objects_count")) is not None:
        out["objects"] = r["objects_count"]
    if (num(r.get("game_version")) or 0) > 0:
        out["gameVersion"] = _version(r["game_version"])
    song = r.get("song") if isinstance(r.get("song"), dict) else {}
    if (num(song.get("online_id")) or 0) > 0:
        out["songID"] = str(song["online_id"])
        out["songName"] = song.get("song_name") or "Unknown"
        out["songAuthor"] = song.get("artist_name") or "Unknown"
    elif num(r.get("official_song")) is not None:
        out["songID"] = f"Level {r['official_song'] + 1}"  # an official song, named the way gdbrowser names it
    return out


def history(lid, timeout=25):
    """from_history for level lid, fetched; None when GDHistory doesn't answer."""
    try:
        r = subprocess.run(["curl", "-sS", "--max-time", str(timeout), HISTORY.format(int(lid))],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout + 20)
        return from_history(lid, json.loads(r.stdout))
    except Exception:
        return None


def level(lid, timeout=25):
    """gdbrowser's level JSON for lid: from RobTop's servers (or their answer that
    came with the edit), else GDHistory's newest server copy. -1 when the game
    says there's no such level (or GDHistory says it was deleted), None when
    nobody answered. "_from" says which one did."""
    got = parse(lid, ask(lid, timeout))
    return got if got is not None else history(lid, timeout)

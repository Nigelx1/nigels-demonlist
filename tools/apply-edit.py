#!/usr/bin/env python3
"""Apply one batch of edits from the mod page (/admin/) to the list.

    python tools/apply-edit.py payload.json              apply, commit, push
    python tools/apply-edit.py payload.json --no-push    apply + commit, don't push
    python tools/apply-edit.py payload.json --dry-run    apply to a throwaway copy,
                                                         show what would change

The mod page's Cloudflare Function sends a GitHub repository_dispatch (event
"edit"); .github/workflows/apply-edit.yml writes its client_payload to a file
and runs this. The payload:

  {"requestId": "<16 lowercase hex>", "editor": "<list name>", "role": "head"|"mod",
   "owner": true, "ops": [1-10 ops], "upkeep": true, "dryRun": true}
      role: from functions/editors.json (missing = mod); owner: Nigel's account only
      (OWNER_ID); upkeep: the scheduled run; dryRun: testing only. Only requestId,
      editor and ops are required.

  {"op":"add_member","name":S,"nationality":CC}
  {"op":"add_record","player":S,"level":L,"progress":P,"nationality":CC}  nationality: new players only
  {"op":"remove_record","player":S,"level":L}
  {"op":"set_grind","player":S,"level":L,"best":B,"segments":[[a,b],...],"note":T}  note optional
  {"op":"remove_grind","player":S,"level":L}
  {"op":"set_record_video","player":S,"level":L,"url":U}
  {"op":"remove_record_video","player":S,"level":L}
  {"op":"refresh_order"}
  {"op":"refresh_showcases"}
  {"op":"undo","requestId":R}
  {"op":"rename_member","name":S,"newName":S}
  {"op":"set_member_country","name":S,"nationality":CC}
  {"op":"remove_member","name":S}
  {"op":"set_mod","discordId":D,"name":S,"role":"head"|"mod"}   Nigel only
  {"op":"remove_mod","discordId":D}                             Nigel only

  S  1-32 letters (any alphabet), digits, spaces and . _ -
  CC an ISO 3166-1 alpha-2 country code, capitals
  L  a level id, or a gdladder.com / gdbrowser.com level link
  P  1-100   B 0-100 or null   segments: up to 20 [a, b] with 0 <= a < b <= 100
  T  up to 140 characters of plain text
  U  https on youtube.com, www.youtube.com, youtu.be or drive.google.com
  R  an earlier edit's requestId (16 lowercase hex)
  D  a Discord user id: 17-20 digits, as a string

Every edit goes through the same tools Claude uses by hand (add-records.py,
add-video.py, refresh-order.py, build-goal-levels.py), so ordering, the AREDL
curve, the changelog and Position History come out exactly the same. The whole
payload is checked before anything is touched, the result is checked again
before it is committed (every data file loads, the list's order/tier/history
verify, the changelog replays to today's order), and a run is one commit. A
push that loses a race starts over from the new master (up to 5 tries).
Needs python3 (+ Pillow for build-goal-levels.py), git, curl and node.
"""
import html, importlib.util, io, json, os, re, shutil, subprocess, sys, tempfile, unicodedata, urllib.parse
from datetime import date as _date

sys.dont_write_bytecode = True  # importing the other tools must not leave __pycache__ in the repo
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BOT_NAME, BOT_EMAIL = "github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com"
TRIES = 5
WIKI = "https://geometrydash.wiki.gg/wiki/"
# wiki.gg blocks browser-looking user agents that aren't browsers; a plain named one gets through
# This site's name and address: functions/site.json, shared with the mod page's Functions.
SITE_INFO = json.load(io.open(os.path.join(REPO, "functions", "site.json"), encoding="utf-8"))
UA = f"{re.sub(r'[^A-Za-z0-9]', '', SITE_INFO['name'])}/1.0 (+{SITE_INFO['url']})"

# ISO 3166-1 alpha-2, the officially assigned codes
ISO = set("""AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO
BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO
DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW
GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX
MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO
RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL
TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW""".split())
# "New member: X, from the US." - the house style for country names in notes
SHORT = {"US": "the US", "GB": "the UK"}
WITH_THE = {"AE", "BS", "CF", "CK", "DO", "FK", "FO", "GM", "KM", "KY", "MH", "MV", "NL", "PH",
            "SB", "SC", "TC", "UM", "VG", "VI"}

OPS = {  # op -> (required fields, optional fields), besides "op"
    "add_member": ({"name", "nationality"}, {"subdivision"}),
    "add_record": ({"player", "level", "progress"}, {"nationality", "subdivision"}),  # both: new players only
    "remove_record": ({"player", "level"}, set()),
    "set_grind": ({"player", "level", "best", "segments"}, {"note"}),
    "remove_grind": ({"player", "level"}, set()),
    "set_record_video": ({"player", "level", "url"}, set()),
    "remove_record_video": ({"player", "level"}, set()),
    "refresh_order": (set(), set()),
    "refresh_showcases": (set(), set()),  # Nigel's channel: the scheduled checks and a head-mod button
    "undo": ({"requestId"}, set()),  # head mods: reverse one earlier edit
    "rename_member": ({"name", "newName"}, set()),
    "set_member_country": ({"name", "nationality"}, {"subdivision"}),
    "remove_member": ({"name"}, set()),  # only someone with no records left
    "set_mod": ({"discordId", "name", "role"}, set()),  # Nigel only: add a mod, or rename / re-rank one
    "remove_mod": ({"discordId"}, set()),  # Nigel only
}
# What only head mods may do; functions/_lib/contract.js HEAD_ONLY is the same list.
# A mod also can't bring in a new player through add_record (Engine.adds).
HEAD_ONLY = {"add_member": "add members", "remove_record": "remove clears", "refresh_order": "re-sort the list",
             "refresh_showcases": "check Nigel's channel for showcases", "undo": "undo edits",
             "rename_member": "rename members", "set_member_country": "change a member's country",
             "remove_member": "remove members"}
# Nigel's Discord account, the only one that can change the mod team (Nigel, 2026-10-07);
# functions/_lib/contract.js OWNER_ID is the same, and the Function marks his edits
# "owner": true. The mod team is functions/editors.json (the logins); the List Mods
# panel (config.js editors) is rebuilt from it.
OWNER_ID = "828708919492608050"
OWNER_ONLY = {"set_mod": "change the mod team", "remove_mod": "change the mod team"}
EDITORS_FILE = "functions/editors.json"
FLAG_SRC = "https://raw.githubusercontent.com/stadust/pointercrate/master/pointercrate-demonlist-pages/static/images/flags/"
# Nigel's YouTube: tools/apply-showcases.py uses its "<level> by <creator>" uploads.
CHANNEL = "@nigelx1"
VIDEO_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "drive.google.com"}
# add-video.py's own patterns: a link has to point at ONE video (not a channel,
# a playlist or a Drive folder), or add-video refuses it at run time.
VIDEO_ID = (re.compile(r"(?:youtu\.be/|[?&]v=|/shorts/|/embed/|/live/)[A-Za-z0-9_-]{11}"),
            re.compile(r"drive\.google\.com/(?:file/d/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=)[A-Za-z0-9_-]{10,}"))
LEVEL_LINK = re.compile(r"^https?://(?:www\.)?(?:gdladder\.com/level/|gdbrowser\.com/(?:level/)?)(\d+)/?(?:[?#]\S*)?$", re.I)


class Refuse(Exception):
    """An edit that can't be applied; the message is shown to the editor as-is."""


def show(x):
    """A raw payload value, quoted and cut short, safe to print (no newlines)."""
    s = repr(x)
    return s if len(s) <= 60 else s[:57] + "..."


# --- validation (the contract) ------------------------------------------------

def check_name(v, what):
    if not isinstance(v, str):
        raise Refuse(f"{what} must be text, got {show(v)}")
    v = unicodedata.normalize("NFC", v)
    if not 1 <= len(v) <= 32:
        raise Refuse(f"{what} {show(v)} must be 1-32 characters")
    if v != v.strip() or "  " in v:
        raise Refuse(f"{what} {show(v)} has extra spaces")
    bad = [c for c in v if not (c.isalpha() or c in "0123456789 ._-")]
    if bad:
        raise Refuse(f"{what} {show(v)} can only use letters, digits, spaces and . _ - (not {show(''.join(dict.fromkeys(bad)))})")
    return v


def check_country(v, what):
    if not isinstance(v, str) or not re.fullmatch(r"[A-Z]{2}", v) or v not in ISO:
        raise Refuse(f"{what} {show(v)} isn't a country code - use the two capital letters, e.g. US, CA, MX")
    return v


def check_subdivision(v):
    # the list's form: the ISO 3166-2 code after the country ("IL" for US-IL);
    # Engine.place checks the list shows them and the country has this one
    if not isinstance(v, str) or not re.fullmatch(r"[A-Z0-9]{1,3}", v):
        raise Refuse(f"state/province {show(v)} isn't a subdivision code - use its short code, e.g. IL, ON")
    return v


def check_discord_id(v):
    if not isinstance(v, str) or not re.fullmatch(r"[0-9]{17,20}", v):
        raise Refuse(f"Discord ID {show(v)} must be the 17-20 digit number from Copy User ID")
    return v


def check_mod_role(v):
    if not isinstance(v, str) or v not in ("head", "mod"):
        raise Refuse(f"role {show(v)} must be \"head\" or \"mod\"")
    return v


def check_int(v, what, lo, hi):
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise Refuse(f"{what} must be a whole number from {lo} to {hi}, got {show(v)}")
    return v


def check_level(v):
    if isinstance(v, int) and not isinstance(v, bool):
        lid = v
    elif isinstance(v, str) and v.strip().isdigit():
        lid = int(v.strip())
    elif isinstance(v, str) and LEVEL_LINK.match(v.strip()):
        lid = int(LEVEL_LINK.match(v.strip()).group(1))
    else:
        raise Refuse(f"level {show(v)} isn't a level id or a gdladder.com / gdbrowser.com level link")
    if not 1 <= lid <= 2 ** 31 - 1:
        raise Refuse(f"level {show(v)} isn't a real level id")
    return lid


def check_url(v):
    if not isinstance(v, str) or len(v) > 300 or re.search(r"\s", v):
        raise Refuse(f"video link {show(v)} isn't a link")
    u = urllib.parse.urlsplit(v)
    if u.scheme != "https" or (u.hostname or "").lower() not in VIDEO_HOSTS or "@" in u.netloc or u.port:
        raise Refuse(f"video link {show(v)} must be an https link on youtube.com, youtu.be or drive.google.com")
    if not any(p.search(v) for p in VIDEO_ID):
        raise Refuse(f"video link {show(v)} isn't a link to one video - use the Share button's link")
    return v


def check_note(v):
    if not isinstance(v, str) or len(v) > 140:
        raise Refuse(f"note must be text of at most 140 characters, got {show(v)}")
    if any(unicodedata.category(c) in ("Cc", "Cf", "Zl", "Zp") for c in v):
        raise Refuse(f"note {show(v)} must be plain text on one line")
    return v.strip()


def validate(p):
    """The payload, checked against the contract and normalised (level -> int id)."""
    if not isinstance(p, dict):
        raise Refuse("the payload isn't a JSON object")
    extra = set(p) - {"requestId", "editor", "role", "owner", "ops", "dryRun", "upkeep"}
    if extra:
        raise Refuse(f"unknown payload field(s): {', '.join(sorted(map(show, extra)))}")
    if not isinstance(p.get("requestId"), str) or not re.fullmatch(r"[0-9a-f]{16}", p["requestId"]):
        raise Refuse(f"requestId must be 16 lowercase hex characters, got {show(p.get('requestId'))}")
    editor = check_name(p.get("editor"), "editor")
    # "head" = head mod, "mod" = mod; set by the Function from functions/editors.json.
    # Missing = mod: the smaller set of rights.
    role = p.get("role", "mod")
    if role not in ("head", "mod"):
        raise Refuse(f"role must be \"head\" or \"mod\", got {show(role)}")
    # Nigel's account (OWNER_ID): the Function adds "owner": true to his edits only.
    if "owner" in p and not isinstance(p["owner"], bool):
        raise Refuse("owner must be true or false")
    owner = p.get("owner") is True
    # The scheduled upkeep (.github/workflows/upkeep.yml): the AREDL or YouTube not
    # answering skips that part instead of failing the run.
    if "upkeep" in p and not isinstance(p["upkeep"], bool):
        raise Refuse("upkeep must be true or false")
    if "dryRun" in p and not isinstance(p["dryRun"], bool):
        raise Refuse("dryRun must be true or false")
    ops = p.get("ops")
    if not isinstance(ops, list) or not 1 <= len(ops) <= 10:
        raise Refuse("ops must be a list of 1 to 10 edits")
    out = []
    for n, op in enumerate(ops, 1):
        where = f"edit {n}"
        if not isinstance(op, dict) or op.get("op") not in OPS:
            raise Refuse(f"{where}: unknown edit {show(op.get('op') if isinstance(op, dict) else op)}")
        need, maybe = OPS[op["op"]]
        missing, unknown = need - set(op), set(op) - need - maybe - {"op"}
        if missing:
            raise Refuse(f"{where} ({op['op']}): missing {', '.join(sorted(missing))}")
        if unknown:
            raise Refuse(f"{where} ({op['op']}): unknown field(s) {', '.join(sorted(map(show, unknown)))}")
        o = {"op": op["op"]}
        try:
            if "name" in op:
                o["name"] = check_name(op["name"], "name")
            if "newName" in op:
                o["newName"] = check_name(op["newName"], "new name")
            if "player" in op:
                o["player"] = check_name(op["player"], "player")
            if "nationality" in op:
                o["nationality"] = check_country(op["nationality"], "country")
            if "subdivision" in op:
                o["subdivision"] = check_subdivision(op["subdivision"])
            if "level" in op:
                o["level"] = check_level(op["level"])
            if "progress" in op:
                o["progress"] = check_int(op["progress"], "progress", 1, 100)
            if "best" in op:
                o["best"] = None if op["best"] is None else check_int(op["best"], "best", 0, 100)
            if "segments" in op:
                segs = op["segments"]
                if not isinstance(segs, list) or len(segs) > 20:
                    raise Refuse("runs must be a list of at most 20 [from, to] pairs")
                o["segments"] = []
                for s in segs:
                    if (not isinstance(s, list) or len(s) != 2
                            or any(isinstance(x, bool) or not isinstance(x, int) for x in s)
                            or not 0 <= s[0] < s[1] <= 100):
                        raise Refuse(f"run {show(s)} must be [from, to] with 0 <= from < to <= 100")
                    o["segments"].append([s[0], s[1]])
            if "note" in op:
                o["note"] = check_note(op["note"])
            if "url" in op:
                o["url"] = check_url(op["url"])
            if "requestId" in op:
                if not isinstance(op["requestId"], str) or not re.fullmatch(r"[0-9a-f]{16}", op["requestId"]):
                    raise Refuse(f"requestId must be 16 lowercase hex characters, got {show(op['requestId'])}")
                o["requestId"] = op["requestId"]
            if "discordId" in op:
                o["discordId"] = check_discord_id(op["discordId"])
            if "role" in op:
                o["role"] = check_mod_role(op["role"])
        except Refuse as e:
            raise Refuse(f"{where} ({op['op']}): {e}")
        out.append(o)
    for i, o in enumerate(out, 1):
        if o["op"] in OWNER_ONLY and not owner:
            raise Refuse(f"edit {i} ({o['op']}): only Nigel can {OWNER_ONLY[o['op']]}")
        if o["op"] in HEAD_ONLY and role != "head":
            raise Refuse(f"edit {i} ({o['op']}): only head mods can {HEAD_ONLY[o['op']]}")
    return {"requestId": p["requestId"], "editor": editor, "role": role, "owner": owner, "ops": out,
            "dryRun": bool(p.get("dryRun")), "upkeep": bool(p.get("upkeep"))}


# --- reading and writing the data files ---------------------------------------

LOADER = r"""
const fs = require('fs'), vm = require('vm'), path = require('path'), root = process.argv[1], out = {};
const files = [['config.js', 'SITE'], ['demons.js', 'DEMONS'], ['changelog.js', 'CHANGELOG'],
               ['goals.js', 'GOALS'], ['goal-levels.js', 'GOAL_LEVELS']];
for (const [file, v] of files) {
  const w = {};
  try { vm.runInNewContext(fs.readFileSync(path.join(root, 'data', file), 'utf8'), { window: w }, { filename: file }); }
  catch (e) { console.error('data/' + file + ' does not load: ' + e.message); process.exit(1); }
  if (w[v] === undefined) { console.error('data/' + file + ' does not set window.' + v); process.exit(1); }
  out[v] = w[v];
}
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'static/js/list-utils.js'), 'utf8'), ctx);
out.COUNTRY_NAMES = ctx.window.DL.COUNTRY_NAMES;
out.SUBDIVISION_NAMES = ctx.window.DL.SUBDIVISION_NAMES || {};
process.stdout.write(JSON.stringify(out));
"""


def load_state(root):
    r = subprocess.run(["node", "-e", LOADER, root], capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise Refuse((r.stderr or "the data files don't load").strip()[:500])
    s = json.loads(r.stdout)
    s["DEMONS"].sort(key=lambda d: d["position"])
    return s


def read(root, rel):
    with io.open(os.path.join(root, *rel.split("/")), encoding="utf-8", newline="") as f:
        return f.read()


def write(root, rel, text):
    with io.open(os.path.join(root, *rel.split("/")), "w", encoding="utf-8", newline="") as f:
        f.write(text)


def write_json_var(root, rel, var, value):
    """Rewrite window.<var> in a JSON-formatted data file, keeping the header
    comment above it (same output as add-records.py / add-video.py write_js)."""
    src = read(root, rel)
    i = src.find(f"window.{var} =")
    if i < 0:
        raise Refuse(f"{rel} has no window.{var}")
    write(root, rel, src[:i] + f"window.{var} = " + json.dumps(value, indent=2, ensure_ascii=False) + ";\n")


def tool(root, name):
    """Import one of the other tools (their names have dashes) for its helpers."""
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(root, "tools", name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_tool(root, args, timeout=900):
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1", PYTHONDONTWRITEBYTECODE="1")
    r = subprocess.run([sys.executable, os.path.join(root, "tools", args[0])] + args[1:], cwd=root, env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    for line in (r.stdout + r.stderr).splitlines():
        print("    | " + line)
    return r


def curl(url, timeout=30):
    """(http status, body) - (0, "") when it didn't answer."""
    r = subprocess.run(["curl", "-sS", "-L", "-A", UA, "--max-time", str(timeout), "-w", "\n%{http_code}", url],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    body, _, code = r.stdout.rpartition("\n")
    return (int(code) if code.isdigit() else 0), body


def curl_json(url):
    code, body = curl(url)
    try:
        return json.loads(body) if code == 200 else None
    except ValueError:
        return None


def level_facts(lid):
    """(name, difficulty) from gdladder / gdbrowser, or None if neither knows the level."""
    gl = curl_json(f"https://gdladder.com/api/levels/{lid}")
    gl = gl if isinstance(gl, dict) and gl.get("ID") else {}
    gb = curl_json(f"https://gdbrowser.com/api/level/{lid}")
    gb = gb if isinstance(gb, dict) and gb.get("name") else {}
    meta = gl.get("Meta") or {}
    name = gb.get("name") or meta.get("Name")
    if not name:
        return None
    return name.strip(), gb.get("difficulty") or ((meta.get("Difficulty") or "?") + " Demon")


def today():
    return _date.today().isoformat()  # same as the other tools (UTC on the Actions runner)


def country_phrase(cc, names):
    if cc in SHORT:
        return SHORT[cc]
    name = names.get(cc) or cc
    return ("the " + name) if cc in WITH_THE else name


# --- The Grind (data/goals.js keeps its hand formatting, so edit it as text) --

def js_value(v):
    """The goals.js house style: { key: value } with bare keys, [a, b] lists."""
    if isinstance(v, dict):
        return "{ " + ", ".join(f"{k if re.fullmatch(r'[A-Za-z_$][\w$]*', k) else json.dumps(k)}: {js_value(x)}"
                                for k, x in v.items()) + " }"
    if isinstance(v, list):
        return "[" + ", ".join(js_value(x) for x in v) + "]"
    return json.dumps(v, ensure_ascii=False)


def goal_row_re(player, lid=None):
    return re.compile(r"^(\s*)\{\s*player:\s*" + re.escape(json.dumps(player, ensure_ascii=False))
                      + (r",\s*levelId:\s*" + str(lid) + r"\s*," if lid is not None else ","))


def prune_runs(best, segments):
    """Nigel's grind rule: only keep a run that isn't completely inside another
    one, or inside the from-0 run (0 - best). Returns (kept, dropped)."""
    runs = sorted({(a, b) for a, b in segments})
    dupes = len(segments) - len(runs)
    kept, dropped = [], []
    for a, b in runs:
        inside_best = best is not None and b <= best
        inside_other = any((c, d) != (a, b) and c <= a and b <= d for c, d in runs)
        (dropped if inside_best or inside_other else kept).append([a, b])
    return kept, dropped, dupes


def wiki_writeup(name, lid):
    """A writeup from the GD Wiki's article on the level: its first 2-3 sentences
    as plain text, at most 450 characters. (None, why) when there isn't one."""
    title = name.strip().replace(" ", "_")
    text = ""
    for _ in range(3):  # follow a redirect or two
        code, text = curl(WIKI + urllib.parse.quote(title, safe="_()!,'-.") + "?action=raw")
        if code == 404:
            return None, "the GD Wiki has no page for it"
        if code != 200 or text.lstrip().startswith("<"):
            return None, "couldn't reach the GD Wiki"
        m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", text, re.I)
        if not m:
            break
        title = m.group(1).strip().replace(" ", "_")
    if not re.search(r"\{\{\s*IB[-_ ]Level", text, re.I):
        return None, "the GD Wiki page by that name isn't about a level"
    m = re.search(r"^\s*\|\s*id\s*=(.*)$", text, re.M)  # can hold several ids: "23262780 (new)<br>81380"
    ids = [int(x) for x in re.findall(r"\d+", m.group(1))] if m else []
    if ids and lid not in ids:
        return None, f"the GD Wiki's {title.replace('_', ' ')} page is a different level (id {ids[0]})"
    t = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    t = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", t, flags=re.S | re.I)
    for pat in (r"\{\{[^{}]*\}\}", r"\{\|.*?\|\}"):  # templates (nested ones from the inside out), tables
        while True:
            t2 = re.sub(pat, "", t, flags=re.S)
            if t2 == t:
                break
            t = t2
    t = re.split(r"^=+[^=\n].*?=+\s*$", t, maxsplit=1, flags=re.M)[0]  # just the lead, before the first heading
    while True:  # links, inside out: [[File:..]] go, [[a|b]] -> b, [[a]] -> a
        t2 = re.sub(r"\[\[(?:File|Image|Category):[^\[\]]*\]\]", "", t, flags=re.I)
        t2 = re.sub(r"\[\[[^\[\]|]*\|([^\[\]]*)\]\]", r"\1", t2)
        t2 = re.sub(r"\[\[([^\[\]|]*)\]\]", r"\1", t2)
        if t2 == t:
            break
        t = t2
    t = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\]", "", t)
    t = t.replace("'''", "").replace("''", "")
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t).replace(" ", " ")
    lines = [ln.strip() for ln in t.split("\n")]
    t = " ".join(ln for ln in lines if ln and ln[0] not in "*#:;|{}!_")
    t = re.sub(r"\(\s*[,;]?\s*\)", "", t)
    t = re.sub(r"\s+([,.;:!?])", r"\1", re.sub(r"\s+", " ", t)).strip()
    if len(t) < 40:
        return None, "the GD Wiki page has no usable intro"
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(“])", t)
    picked = []
    for s in sentences[:3]:
        if len(" ".join(picked + [s])) > 450:
            break
        picked.append(s)
    text = " ".join(picked)
    if not picked:
        text = sentences[0][:449].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return {"text": text, "source": "Geometry Dash Wiki", "url": WIKI + urllib.parse.quote(title, safe="_()!,'-.")}, None


# --- applying the edits -------------------------------------------------------

class Engine:
    def __init__(self, root, role="mod", upkeep=False, owner=False):
        self.root = root
        self.upkeep = upkeep     # the scheduled upkeep: network trouble skips, never fails
        self.role = role         # "head" or "mod"
        self.owner = owner       # Nigel's account (OWNER_ID): the mod team is his alone
        self.lines = []          # plain-English summary, one line per change
        self.subjects = []       # short phrases for the commit subject
        self.goals_touched = False
        self.new_goal_levels = set()

    def say(self, line):
        self.lines.append(line)
        print("  " + line)

    def players(self, s):
        """Every name the list knows: the roster plus anyone holding a record."""
        names = [m["name"] for m in s["SITE"].get("members") or []]
        names += [r["player"] for d in s["DEMONS"] for r in d.get("records", [])]
        return list(dict.fromkeys(names))

    @staticmethod
    def resolve(name, names):
        if name in names:
            return name
        hits = [n for n in names if n.casefold() == name.casefold()]
        return hits[0] if len(hits) == 1 else None

    def member(self, s, name):
        who = self.resolve(name, self.players(s))
        if not who:
            raise Refuse(f"{name} isn't a member of the list - add them first")
        return who

    def demon(self, s, lid):
        d = next((x for x in s["DEMONS"] if x["levelId"] == lid), None)
        if not d:
            raise Refuse(f"level {lid} isn't on the list")
        return d

    def record(self, s, lid, player):
        d = self.demon(s, lid)
        names = [r["player"] for r in d.get("records", [])]
        who = self.resolve(player, names)
        if not who:
            raise Refuse(f"{d['name']} has no record by {player}"
                         + (f" - its records: {', '.join(names)}" if names else ""))
        return d, next(r for r in d["records"] if r["player"] == who)

    def apply(self, ops):
        start = load_state(self.root)
        listed_before = {d["levelId"] for d in start["DEMONS"]}
        levels_before = listed_before | {int(k) for k in start["GOAL_LEVELS"]}
        i = 0
        while i < len(ops):
            if ops[i]["op"] in ("add_member", "add_record"):  # consecutive adds share one add-records.py run
                j = i
                while j < len(ops) and ops[j]["op"] in ("add_member", "add_record"):
                    j += 1
                self.adds(ops[i:j])
                i = j
                continue
            getattr(self, ops[i]["op"])(ops[i])
            i += 1
        self.sync_goal_comments(listed_before)
        if self.goals_touched:
            self.rebuild_goal_levels()
        # A level new to the site gets Nigel's showcase right away when his channel
        # has one (the scheduled upkeep would only catch it a few days later).
        if not any(o["op"] == "refresh_showcases" for o in ops):
            end = load_state(self.root)
            if ({d["levelId"] for d in end["DEMONS"]} | {int(k) for k in end["GOAL_LEVELS"]}) - levels_before:
                self.refresh_showcases(None)

    # add_member / add_record -> tools/add-records.py
    def adds(self, ops):
        s = load_state(self.root)
        names = self.players(s)
        listed = {d["levelId"]: d for d in s["DEMONS"]}
        spec = {"date": today(), "players": {}, "records": [], "notes": []}
        plan = []
        for o in ops:
            if o["op"] == "add_member":
                if self.resolve(o["name"], names):
                    raise Refuse(f"{self.resolve(o['name'], names)} is already a member")
                names.append(o["name"])
                where = self.place(s, o["nationality"], o.get("subdivision"))
                spec["players"][o["name"]] = self.player_spec(o)
                spec["notes"].append(f"New member: {o['name']}, from {where}.")
                self.subjects.append(f"Add member {o['name']}")
                plan.append(o)
                continue
            who, joined = self.resolve(o["player"], names), False
            if not who:
                if self.role != "head":
                    raise Refuse(f"{o['player']} isn't on the list yet - only head mods can add new players "
                                 "(ask one to add them in Members first)")
                if not o.get("nationality"):
                    raise Refuse(f"{o['player']} isn't a member yet - give their country, or add them as a member first")
                who, joined = o["player"], True
                names.append(who)
                where = self.place(s, o["nationality"], o.get("subdivision"))
                spec["players"][who] = self.player_spec(o)
                spec["notes"].append(f"New member: {who}, from {where}.")
            lid, d = o["level"], listed.get(o["level"])
            if o["progress"] < 100 and not d:
                raise Refuse(f"level {lid} isn't on the list, and only a 100% can put a level on it "
                             f"({who} has {o['progress']}%)")
            spec["records"].append({"player": who, "level": lid, "progress": o["progress"]})
            plan.append(dict(o, player=who, new_player=joined))
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        try:
            json.dump(spec, tmp, ensure_ascii=False)
            tmp.close()
            print(f"  add-records.py: {len(spec['records'])} record(s), {len(spec['players'])} new player(s)")
            r = run_tool(self.root, ["add-records.py", tmp.name])
        finally:
            os.unlink(tmp.name)
        out = r.stdout + r.stderr
        if r.returncode:
            raise Refuse("add-records.py failed: " + (out.strip().splitlines() or ["?"])[-1])
        if "couldn't load the AREDL" in out:
            raise Refuse("the AREDL didn't answer, so the list can't be ordered - nothing saved, try again in a few minutes")
        for m in re.finditer(r"REFUSED (\d+): (.*)", out):
            raise Refuse(f"level {m.group(1)} can't go on the list: {m.group(2).strip()}")
        if "VERIFY FAILED" in out:
            raise Refuse("the list didn't verify after adding: " + out.split("VERIFY FAILED:", 1)[1].strip().splitlines()[0])
        for m in re.finditer(r"flag (\S+): NOT on pointercrate", out):
            self.say(f"(No flag picture exists for {m.group(1)[:-4].upper()} - the name shows without one.)")

        after = load_state(self.root)
        now = {d["levelId"]: d for d in after["DEMONS"]}
        # gdladder rate-limits (and may refuse a runner's address): add-records
        # then adds a new level with no rating, sorted as a typical demon of its
        # tier. Better to save nothing and say so.
        for lid, d in now.items():
            if lid not in listed and not isinstance(d.get("rating"), (int, float)):
                raise Refuse(f"GD Demon Ladder didn't answer for {d['name']} - nothing saved, try again in a few minutes")
        for o in plan:
            if o["op"] == "add_member":
                self.say(f"New member: {o['name']} ({after['COUNTRY_NAMES'].get(o['nationality'], o['nationality'])}).")
                continue
            if o.get("new_player"):
                cc = spec["players"][o["player"]]["nationality"]
                self.say(f"New member: {o['player']} ({after['COUNTRY_NAMES'].get(cc, cc)}).")
            d = now[o["level"]]
            rec = next(r for r in d["records"] if r["player"] == o["player"])
            old = listed.get(o["level"])
            prev = next((r for r in (old or {}).get("records", []) if r["player"] == o["player"]), None)
            self.subjects.append(f"{o['player']} {o['progress']}% on {d['name']}")
            if not old:
                self.say(f"{o['player']} beat {d['name']} - new to the list at #{d['position']}.")
            elif prev and prev["progress"] >= o["progress"]:
                self.say(f"{o['player']} already had {prev['progress']}% on {d['name']} - no change.")
            elif prev:
                self.say(f"{o['player']}: {d['name']} {prev['progress']}% -> {rec['progress']}%.")
            else:
                self.say(f"{o['player']}: {rec['progress']}% on {d['name']} (#{d['position']}).")
            if rec["progress"] >= 100 and any(g["player"] == o["player"] and g["levelId"] == o["level"] for g in after["GOALS"]):
                self.drop_beaten_goal(o["player"], o["level"], d["name"])
        moves = [it for it in new_log_items(s["CHANGELOG"], after["CHANGELOG"]) if it.get("kind") == "move"]
        if moves:
            self.say(f"{len(moves)} demon{'s' if len(moves) != 1 else ''} re-sorted along the way (the AREDL shifted): "
                     + ", ".join(f"{m['demon']} #{m['from']} -> #{m['to']}" for m in moves[:6])
                     + (" ..." if len(moves) > 6 else "") + ".")

    def remove_record(self, o):
        s = load_state(self.root)
        d, rec = self.record(s, o["level"], o["player"])
        who, name, pos = rec["player"], d["name"], d["position"]
        demons = s["DEMONS"]
        d = next(x for x in demons if x["levelId"] == o["level"])
        tool(self.root, "add-video").drop_hosted(rec)  # a hosted video's files go with the record
        d["records"] = [r for r in d["records"] if r["player"] != who]
        items = []
        if not d["records"]:
            demons.remove(d)
            for n, x in enumerate(demons, 1):
                x["position"] = n
            items.append({"kind": "remove", "demon": name, "demonId": d["levelId"], "from": pos,
                          "text": f"its only record ({who}'s) was removed"})
            vdir = os.path.join(self.root, "videos", str(d["levelId"]))
            if os.path.isdir(vdir):
                shutil.rmtree(vdir)
            self.say(f"Removed {who}'s record on {name}. It was the only one, so {name} left the list (was #{pos}).")
        else:
            if d.get("verifier") == who:
                d["verifier"] = next((r["player"] for r in d["records"] if r["progress"] >= 100), None)
                self.say(f"{name}'s first-clear credit moves from {who} to {d['verifier'] or 'nobody'}.")
            items.append({"kind": "note", "text": f"{who}'s record on {name} was removed."})
            self.say(f"Removed {who}'s {rec['progress']}% record on {name}.")
        write_json_var(self.root, "data/demons.js", "DEMONS", demons)
        self.log(s["CHANGELOG"], items)
        self.subjects.append(f"Remove {who}'s record on {name}")

    def log(self, log, items):
        """Prepend items to today's changelog entry (newest first, like add-records.py)."""
        if '"date":' not in read(self.root, "data/changelog.js"):
            raise Refuse("data/changelog.js isn't in the JSON layout this tool writes")
        if log and log[0].get("date") == today():
            log[0]["items"] = items + log[0]["items"]
        else:
            log.insert(0, {"date": today(), "items": items})
        write_json_var(self.root, "data/changelog.js", "CHANGELOG", log)

    def level_name(self, s, lid):
        d = next((x for x in s["DEMONS"] if x["levelId"] == lid), None)
        if d:
            return d["name"]
        g = s["GOAL_LEVELS"].get(str(lid))
        if g and g.get("name") and g["name"] != f"Level {lid}":
            return g["name"]
        facts = level_facts(lid)
        if not facts:
            raise Refuse(f"level {lid} wasn't found on gdladder or gdbrowser (or they didn't answer) - check the id")
        return facts[0]

    def set_grind(self, o):
        s = load_state(self.root)
        who = self.member(s, o["player"])
        lid = o["level"]
        name = self.level_name(s, lid)
        d = next((x for x in s["DEMONS"] if x["levelId"] == lid), None)
        if d and any(r["player"] == who and r["progress"] >= 100 for r in d["records"]):
            raise Refuse(f"{who} has already beaten {name}")
        kept, dropped, dupes = prune_runs(o["best"], o["segments"])
        old = next((g for g in s["GOALS"] if g["player"] == who and g["levelId"] == lid), None)
        row = {"player": who, "levelId": lid, "best": o["best"]}
        if kept:
            row["segments"] = kept
        if o.get("note"):
            row["note"] = o["note"]
        for k, v in (old or {}).items():  # video / blurb / attempts / milestones aren't on the form: keep them
            if k not in ("player", "levelId", "best", "segments", "note"):
                row[k] = v

        text = read(self.root, "data/goals.js")
        lines = text.split("\n")
        hits = [n for n, ln in enumerate(lines) if goal_row_re(who, lid).match(ln)]
        if len(hits) > 1:
            raise Refuse(f"data/goals.js has {len(hits)} rows for {who} on {name} - fix it by hand first")
        if hits:
            n = hits[0]
            indent = goal_row_re(who, lid).match(lines[n]).group(1)
            cm = re.search(r"\}\s*,\s*(//[^\"]*)$", lines[n])
            comment = cm.group(1).rstrip() if cm else f"// {name}" + (" (on the list)" if d else "")
            lines[n] = f"{indent}{js_value(row)}, {comment}"
        else:
            mine = [n for n, ln in enumerate(lines) if goal_row_re(who).match(ln)]
            close = max((n for n, ln in enumerate(lines) if re.match(r"^\s*\];\s*$", ln)), default=None)
            if close is None:
                raise Refuse("can't find the end of window.GOALS in data/goals.js")
            any_row = next((ln for ln in lines if re.match(r"^\s*\{\s*player:", ln)), "  {")
            indent = re.match(r"^(\s*)", any_row).group(1)
            at = mine[-1] + 1 if mine else close
            lines.insert(at, f"{indent}{js_value(row)}, // {name}" + (" (on the list)" if d else ""))
            if not any(g["levelId"] == lid for g in s["GOALS"]):
                self.new_goal_levels.add(lid)
        new_text = "\n".join(lines)
        if new_text == text:
            self.say(f"{who}'s Grind on {name} was already exactly that - no change.")
            return
        write(self.root, "data/goals.js", new_text)
        self.goals_touched = True
        runs = ", ".join(f"{a}-{b}" for a, b in kept)
        self.say(f"Grind: {who} on {name} - best {'not set' if o['best'] is None else str(o['best']) + '%'}"
                 + (f", runs {runs}" if runs else "") + (f", note \"{o['note']}\"" if o.get("note") else "")
                 + (" (updated)." if old else " (new goal)."))
        if dropped:
            self.say("  Left out " + ", ".join(f"{a}-{b}" for a, b in dropped)
                     + ": a run completely inside another one (or inside 0-best) isn't listed.")
        if dupes:
            self.say(f"  Left out {dupes} repeated run{'s' if dupes != 1 else ''} - repeats go in the note (e.g. \"75-93 twice.\").")
        self.subjects.append(f"Grind: {who} on {name}")

    def drop_beaten_goal(self, who, lid, name):
        """A clear ends that level's grind: its goal row goes in the same run."""
        lines = read(self.root, "data/goals.js").split("\n")
        hits = [n for n, ln in enumerate(lines) if goal_row_re(who, lid).match(ln)]
        if not hits:
            return
        for n in reversed(hits):
            del lines[n]
        write(self.root, "data/goals.js", "\n".join(lines))
        self.goals_touched = True
        self.say(f"Grind: {who} beat {name}, so it's off their Grind.")

    def remove_grind(self, o):
        s = load_state(self.root)
        who = self.member(s, o["player"])
        lid = o["level"]
        text = read(self.root, "data/goals.js")
        lines = text.split("\n")
        hits = [n for n, ln in enumerate(lines) if goal_row_re(who, lid).match(ln)]
        if not hits:
            raise Refuse(f"{who} has no Grind goal on level {lid}")
        g = s["GOAL_LEVELS"].get(str(lid)) or {}
        d = next((x for x in s["DEMONS"] if x["levelId"] == lid), None)
        name = (d or {}).get("name") or g.get("name") or f"level {lid}"
        for n in reversed(hits):
            del lines[n]
        write(self.root, "data/goals.js", "\n".join(lines))
        self.goals_touched = True
        self.say(f"Grind: {who} dropped {name}.")
        self.subjects.append(f"{who} drops {name} (Grind)")

    def set_record_video(self, o):
        s = load_state(self.root)
        d, rec = self.record(s, o["level"], o["player"])
        if rec.get("video") == o["url"]:
            self.say(f"{rec['player']}'s {d['name']} record already has that video - no change.")
            return
        r = run_tool(self.root, ["add-video.py", o["url"], str(d["levelId"]), rec["player"]])
        if r.returncode:
            raise Refuse("the video link was refused: " + ((r.stderr or r.stdout).strip().splitlines() or ["?"])[-1].strip())
        self.say(f"Video for {rec['player']}'s {d['name']} record: {o['url']}")
        self.subjects.append(f"Video for {rec['player']} on {d['name']}")

    def remove_record_video(self, o):
        s = load_state(self.root)
        d, rec = self.record(s, o["level"], o["player"])
        if not rec.get("video"):
            raise Refuse(f"{rec['player']}'s {d['name']} record has no video")
        r = run_tool(self.root, ["add-video.py", "--remove", str(d["levelId"]), rec["player"]])
        if r.returncode:
            raise Refuse("removing the video failed: " + ((r.stderr or r.stdout).strip().splitlines() or ["?"])[-1].strip())
        self.say(f"Removed the video from {rec['player']}'s {d['name']} record.")
        self.subjects.append(f"Remove video of {rec['player']} on {d['name']}")

    def refresh_order(self, o):
        before = load_state(self.root)
        print("  refresh-order.py (one gdladder request per demon - takes a minute)")
        r = run_tool(self.root, ["refresh-order.py"] + (["--no-drift-note"] if self.upkeep else []))
        if r.returncode and self.upkeep and "AREDL" in (r.stdout or "") + (r.stderr or ""):
            self.say("The AREDL didn't answer, so the order wasn't refreshed this time.")
            return
        if r.returncode:
            raise Refuse("refreshing the order failed: " + ((r.stderr or r.stdout).strip().splitlines() or ["?"])[-1].strip())
        if "replay check: OK" not in r.stdout:
            raise Refuse("the order refresh didn't replay cleanly - nothing saved")
        after = load_state(self.root)
        moves = [it for it in new_log_items(before["CHANGELOG"], after["CHANGELOG"]) if it.get("kind") == "move"]
        m = re.search(r"rating drift: (\d+)", r.stdout)
        drift = int(m.group(1)) if m else 0
        self.say(f"Refreshed the order from the AREDL and GD Demon Ladder: {drift} rating{'s' if drift != 1 else ''} drifted, "
                 f"{len(moves)} demon{'s' if len(moves) != 1 else ''} moved"
                 + (" (" + ", ".join(f"{x['demon']} #{x['from']} -> #{x['to']}" for x in moves[:6])
                    + (" ..." if len(moves) > 6 else "") + ")" if moves else "") + ".")
        self.subjects.append("Refresh the list order")

    # refresh_showcases -> tools/apply-showcases.py: Nigel's own showcase on every
    # level his channel has one for. The scheduled upkeep sends it, and apply()
    # runs it after an edit that brings a new level onto the site. YouTube not
    # answering is never a failure: the next upkeep catches up.
    def refresh_showcases(self, o):
        def videos():  # level name -> its video, on demon pages and Grind pages
            st = load_state(self.root)
            v = {g.get("name"): g.get("videoUrl") for g in st["GOAL_LEVELS"].values()}
            v.update({d["name"]: d.get("videoUrl") for d in st["DEMONS"]})
            return v
        before = videos()
        print("  apply-showcases.py " + CHANNEL)
        r = run_tool(self.root, ["apply-showcases.py", CHANNEL])
        out = (r.stdout or "") + (r.stderr or "")
        self.say_kept(out)
        if r.returncode or " uploads" not in out:
            self.say("Couldn't read Nigel's YouTube channel this time, so showcases weren't checked.")
            return
        after = videos()
        titles = dict(re.findall(r"^\s+(.+?) \([^)]*\): -> [\w-]{11}\s+\[(.+)\]\s*$", out, re.M))
        changed = sorted(n for n, v in after.items() if n and v and before.get(n) != v)
        if not changed:
            if o is not None:
                self.say("No new showcases on Nigel's channel.")
            return
        for n in changed:
            self.say(f"{n} now uses Nigel's showcase" + (f' "{titles[n]}".' if n in titles else "."))
        self.subjects.append("Nigel's showcase on " + ", ".join(changed))

    # undo -> reverse one earlier edit: the commit it made (found by its "Request:
    # <id>" line; only the mod page's and the upkeep's commits) is applied
    # backwards. If a later edit changed the same lines the reverse patch doesn't
    # apply and nothing changes: the newer edit has to be undone first. check()
    # then proves the list is consistent, as after any edit. The patch is read
    # from the real repo and applied to self.root, so a dry run works on its copy.
    def undo(self, o):
        rid = o["requestId"]
        log = git("log", "-n", "500", "--format=%H%x1f%an%x1f%B%x1e").stdout
        target, undone = None, False
        for rec in log.split("\x1e"):
            parts = rec.strip("\n").split("\x1f")
            if len(parts) < 3:
                continue
            sha, author, body = parts[0].strip(), parts[1], parts[2]
            if f"Undoes request {rid}" in body:
                undone = True
            if target is None and f"Request: {rid}" in body and author == "github-actions[bot]":
                target = (sha, body.strip().splitlines()[0])
        if undone:
            raise Refuse("that edit has already been undone")
        if not target:
            raise Refuse("couldn't find what that edit changed - it may not have changed anything, or it's too old to undo here")
        sha, subj = target
        # The mod team (editors.json, and List Mods built from it) is Nigel's alone:
        # undoing a change to it would be a way around that.
        if not self.owner and self.mod_team_at(sha) != self.mod_team_at(f"{sha}^"):
            raise Refuse("that edit changed the mod team - only Nigel can undo it")
        # git works out the undone files itself (a three-way merge of HEAD with the
        # edit reversed, written to no working tree), so line endings and nearby
        # changes don't matter; a real conflict (a newer edit changed the same
        # lines) exits 1.
        r = git("merge-tree", "--write-tree", "--no-messages", "--name-only", f"--merge-base={sha}", "HEAD",
                f"{sha}^", check=False)
        got = [x.strip() for x in r.stdout.split("\n") if x.strip()]
        # data/goal-levels.js is derived (rebuilt from goals.js by every Grind edit,
        # showcase check and upkeep), so it is never reversed: it is rebuilt below,
        # and a conflict in it alone doesn't stop the undo.
        derived = "data/goal-levels.js"
        if r.returncode == 1 and set(got[1:]) - {derived}:
            raise Refuse("a later edit changed the same part of the list, so this one can't be undone on its own - "
                         "undo the newer edits first")
        if r.returncode not in (0, 1) or not got:
            raise Refuse("couldn't work out how to undo that edit: " + (r.stderr or r.stdout).strip()[:200])
        tree = got[0]
        paths = [x for x in git("diff", "--name-only", "-z", "HEAD", tree).stdout.split("\0") if x]
        if derived in paths:
            paths.remove(derived)
            self.goals_touched = True
        if not paths:
            raise Refuse("that edit didn't change anything that's still there to undo")
        for rel in paths:
            dest = os.path.join(self.root, *rel.split("/"))
            blob = subprocess.run(["git", "-C", REPO, "show", f"{tree}:{rel}"], capture_output=True)
            if blob.returncode:  # the edit created this file: undoing it removes it
                if os.path.exists(dest):
                    os.remove(dest)
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(blob.stdout)
        what = re.sub(r" \((?:by .+ via the mod page|scheduled upkeep)\)$", "", subj)
        self.say(f"Undid: {what}.")
        self.say(f"Undoes request {rid} ({sha[:7]}).")
        self.subjects.append(f"Undo: {what}")

    # --- members: rename, country, remove (head mods) ----------------------------------
    # A member's name and country live in the roster (config.js members) and on each
    # of their records (demons.js: player, nationality, the first-clear verifier
    # credit, hosted video files named after them); their Grind rows name them too
    # (goals.js). The changelog is history and keeps what it said.
    def place(self, s, cc, sub):
        """Where someone is from, for a note ("Indiana in the US"). A state or province
        only on a list that shows them (SITE.subdivisions is false on Aceabase), and
        only one the stats viewer's map knows (list-utils.js SUBDIVISION_NAMES)."""
        country = country_phrase(cc, s["COUNTRY_NAMES"])
        if not sub:
            return country
        if s["SITE"].get("subdivisions") is False:
            raise Refuse("this list doesn't show states or provinces - leave it out")
        name = (s.get("SUBDIVISION_NAMES") or {}).get(f"{cc}-{sub}")
        if not name:
            raise Refuse(f"{sub} isn't a state or province of {country} that the list knows")
        return f"{name} in {country}"

    @staticmethod
    def player_spec(o):
        """A new player for add-records.py: their country, and state or province if given."""
        spec = {"nationality": o["nationality"]}
        if o.get("subdivision"):
            spec["subdivision"] = o["subdivision"]
        return spec

    def roster_line(self, cfg, who):
        # Only inside config.js's members array: the same name can also be in the
        # editors array (the List Mods sidebar), which isn't the roster. Searching the
        # whole file once took three mods off that panel instead (2026-10-07).
        a = re.search(r"\bmembers:\s*\[", cfg)
        if not a:
            raise Refuse("data/config.js has no members list")
        end = cfg.find("]", a.end())  # member entries hold no brackets
        m = re.compile(r'\{\s*name:\s*"' + re.escape(who) + r'"[^}\n]*\}').search(cfg, a.end(), end)
        if not m:
            raise Refuse(f"{who} isn't in the roster (data/config.js members)")
        return m

    def rename_member(self, o):
        s = load_state(self.root)
        who = self.member(s, o["name"])
        new = o["newName"]
        if new == who:
            self.say(f"{who} already has that name - no change.")
            return
        clash = self.resolve(new, self.players(s))
        if clash and clash != who:
            raise Refuse(f"{clash} is already on the list")
        cfg = read(self.root, "data/config.js")
        m = self.roster_line(cfg, who)
        line = m.group(0).replace(json.dumps(who, ensure_ascii=False), json.dumps(new, ensure_ascii=False), 1)
        write(self.root, "data/config.js", cfg[:m.start()] + line + cfg[m.end():])
        moved = 0
        for d in s["DEMONS"]:
            if d.get("verifier") == who:
                d["verifier"] = new
            for r in d.get("records", []):
                if r["player"] != who:
                    continue
                r["player"] = new
                moved += 1
                for key in ("video", "videoPoster"):  # a hosted file is named after the player
                    v = r.get(key)
                    if isinstance(v, str) and v.startswith("videos/") and f"/{who}." in v:
                        nv = v.replace(f"/{who}.", f"/{new}.", 1)
                        src = os.path.join(self.root, *v.split("/"))
                        if os.path.exists(src):
                            os.replace(src, os.path.join(self.root, *nv.split("/")))
                        r[key] = nv
        if moved:
            write_json_var(self.root, "data/demons.js", "DEMONS", s["DEMONS"])
        goals, n = re.subn(r'(\{\s*player:\s*)"' + re.escape(who) + r'"',
                           lambda mm: mm.group(1) + json.dumps(new, ensure_ascii=False), read(self.root, "data/goals.js"))
        if n:
            write(self.root, "data/goals.js", goals)
            self.goals_touched = True
        self.say(f"Renamed {who} to {new} ({moved} record{'s' if moved != 1 else ''}, {n} Grind row{'s' if n != 1 else ''}).")
        self.subjects.append(f"Rename {who} to {new}")

    def set_member_country(self, o):
        s = load_state(self.root)
        who = self.member(s, o["name"])
        cc, sub = o["nationality"], o.get("subdivision")
        where = self.place(s, cc, sub)
        cfg = read(self.root, "data/config.js")
        m = self.roster_line(cfg, who)
        recs = [r for d in s["DEMONS"] for r in d.get("records", []) if r["player"] == who]
        had = re.search(r'subdivision:\s*"([^"]*)"', m.group(0))
        if f'nationality: "{cc}"' in m.group(0) and (had.group(1) if had else None) == sub \
                and all(r.get("nationality") == cc and (r.get("subdivision") or None) == sub for r in recs):
            self.say(f"{who} is already from {where} - no change.")
            return
        line = re.sub(r'\s*,\s*subdivision:\s*"[^"]*"', "", m.group(0))
        if re.search(r'nationality:\s*"[A-Z]{2}"', line):
            line = re.sub(r'nationality:\s*"[A-Z]{2}"', f'nationality: "{cc}"', line, count=1)
        else:
            line = line[:-1].rstrip() + f', nationality: "{cc}" }}'
        if sub:
            line = re.sub(r'(nationality:\s*"[A-Z]{2}")', rf'\1, subdivision: "{sub}"', line, count=1)
        write(self.root, "data/config.js", cfg[:m.start()] + line + cfg[m.end():])
        for r in recs:
            r["nationality"], r["subdivision"] = cc, sub
        if recs:
            write_json_var(self.root, "data/demons.js", "DEMONS", s["DEMONS"])
        flag = os.path.join(self.root, "static", "images", "flags", f"{cc.lower()}.svg")
        if not os.path.exists(flag):
            got = subprocess.run(["curl", "-sS", "-f", "-o", flag, FLAG_SRC + f"{cc.lower()}.svg"], capture_output=True)
            if got.returncode:
                self.say(f"(No flag picture exists for {cc} - the name shows without one.)")
        if sub:  # the state's flag, where add-records.py puts it (flags/us/il.svg)
            sflag = os.path.join(self.root, "static", "images", "flags", cc.lower(), f"{sub.lower()}.svg")
            if not os.path.exists(sflag):
                os.makedirs(os.path.dirname(sflag), exist_ok=True)
                got = subprocess.run(["curl", "-sS", "-f", "-o", sflag, FLAG_SRC + f"{cc.lower()}/{sub.lower()}.svg"],
                                     capture_output=True)
                if got.returncode:
                    if os.path.exists(sflag) and not os.path.getsize(sflag):
                        os.remove(sflag)
                    self.say(f"(No flag picture exists for {cc}-{sub} - it shows without one.)")
        self.say(f"{who} is now from {where} ({len(recs)} record{'s' if len(recs) != 1 else ''}).")
        self.subjects.append(f"{who} is from {cc}" + (f"-{sub}" if sub else ""))

    def remove_member(self, o):
        s = load_state(self.root)
        who = self.member(s, o["name"])
        held = [d["name"] for d in s["DEMONS"] for r in d.get("records", []) if r["player"] == who]
        if held:
            raise Refuse(f"{who} still has records ({', '.join(held[:5])}{' ...' if len(held) > 5 else ''}) - "
                         "remove those clears first")
        cfg = read(self.root, "data/config.js")
        m = self.roster_line(cfg, who)
        start = cfg.rfind("\n", 0, m.start()) + 1
        end = cfg.find("\n", m.end())
        end = len(cfg) if end < 0 else end + 1
        if cfg[start:end].strip().rstrip(",").strip() != m.group(0):
            raise Refuse("the roster in data/config.js isn't one member per line - remove them by hand")
        write(self.root, "data/config.js", cfg[:start] + cfg[end:])
        lines = read(self.root, "data/goals.js").split("\n")
        keep = [ln for ln in lines if not goal_row_re(who).match(ln)]
        dropped = len(lines) - len(keep)
        if dropped:
            write(self.root, "data/goals.js", "\n".join(keep))
            self.goals_touched = True
        self.say(f"Removed {who} from the list" + (f" and their {dropped} Grind row{'s' if dropped != 1 else ''}." if dropped else "."))
        self.subjects.append(f"Remove member {who}")

    # --- the mod team (Nigel only) ------------------------------------------------------
    # functions/editors.json says who can log in to the mod page and as what (Discord id
    # -> {name, role}); the List Mods panel (config.js editors) is rebuilt from it on
    # every change, head mods first, so the two can't disagree. Nigel's own entry is
    # never changed here: removing or demoting it would lock him out.

    def mod_team(self):
        try:
            eds = json.loads(read(self.root, EDITORS_FILE))
        except ValueError as e:
            raise Refuse(f"{EDITORS_FILE} doesn't load: {e}")
        if not isinstance(eds, dict):
            raise Refuse(f"{EDITORS_FILE} isn't a list of mods")
        out = {}
        for k, v in eds.items():
            e = {"name": v, "role": "head"} if isinstance(v, str) else v  # a bare name is a head mod
            if not isinstance(e, dict) or not isinstance(e.get("name"), str) or e.get("role") not in ("head", "mod"):
                raise Refuse(f"{EDITORS_FILE}: the entry for {k} is broken - fix it by hand first")
            out[k] = e
        return out

    def save_mod_team(self, eds):
        write(self.root, EDITORS_FILE, json.dumps(eds, indent=2, ensure_ascii=False) + "\n")
        cfg = read(self.root, "data/config.js")
        a = re.search(r"\beditors:\s*\[", cfg)
        if not a:
            raise Refuse("data/config.js has no editors list (the List Mods panel)")
        end = cfg.find("]", a.end())  # names hold no brackets
        nl = "\r\n" if "\r\n" in cfg else "\n"
        team = [e for e in eds.values() if e["role"] == "head"] + [e for e in eds.values() if e["role"] != "head"]
        rows = "".join(f"    {{ name: {json.dumps(e['name'], ensure_ascii=False)}{', head: true' if e['role'] == 'head' else ''} }},{nl}"
                       for e in team)
        write(self.root, "data/config.js", cfg[:a.end()] + nl + rows + "  " + cfg[end:])

    @staticmethod
    def mod_team_at(rev):
        """The mod team as of a commit: editors.json and the List Mods rows, as text."""
        eds = git("show", f"{rev}:{EDITORS_FILE}", check=False).stdout
        m = re.search(r"\beditors:\s*\[([^\]]*)\]", git("show", f"{rev}:data/config.js", check=False).stdout)
        return eds, m.group(1) if m else None

    def set_mod(self, o):
        mid, name, role = o["discordId"], o["name"], o["role"]
        if mid == OWNER_ID:
            raise Refuse("that's your own account - it can't be changed from the mod page")
        eds = self.mod_team()
        for k, e in eds.items():
            if k != mid and e["name"].casefold() == name.casefold():
                raise Refuse(f"{e['name']} is already a mod (on a different Discord account)")
        rank = "head mod" if role == "head" else "mod"
        old = eds.get(mid)
        if old is None:
            eds[mid] = {"name": name, "role": role}
            self.say(f"New {rank}: {name} (Discord ID {mid}).")
            self.subjects.append(f"Add {rank} {name}")
        elif old["name"] == name and old["role"] == role:
            self.say(f"{name} is already a {rank} - no change.")
            return
        else:
            if old["name"] != name:
                self.say(f"Renamed mod {old['name']} to {name}.")
                self.subjects.append(f"Rename mod {old['name']} to {name}")
            if old["role"] != role:
                self.say(f"{name} is now a {rank}.")
                self.subjects.append(f"Make {name} a {rank}")
            old["name"], old["role"] = name, role
        self.save_mod_team(eds)

    def remove_mod(self, o):
        mid = o["discordId"]
        if mid == OWNER_ID:
            raise Refuse("that's your own account - removing it would lock you out")
        eds = self.mod_team()
        if mid not in eds:
            raise Refuse(f"no mod has the Discord ID {mid}")
        gone = eds.pop(mid)
        self.save_mod_team(eds)
        self.say(f"Removed {gone['name']} from the mod team; their mod page login stops working once this is live.")
        self.subjects.append(f"Remove mod {gone['name']}")

    def sync_goal_comments(self, listed_before):
        """A goal row's comment says "(on the list)" when its level is on the list;
        keep that true for levels that joined or left the list in this run (only
        those: older rows are left as they were written)."""
        listed = {d["levelId"] for d in load_state(self.root)["DEMONS"]}
        changed = listed ^ listed_before
        text = read(self.root, "data/goals.js")
        lines = text.split("\n")
        for n, ln in enumerate(lines):
            m = re.match(r"^\s*\{\s*player:.*?levelId:\s*(\d+)\s*,", ln)
            c = re.search(r"\}\s*,\s*(//[^\"]*)$", ln)
            if not m or not c or int(m.group(1)) not in changed:
                continue
            comment = c.group(1).rstrip()
            on = comment.endswith(" (on the list)")
            if on and int(m.group(1)) not in listed:
                lines[n] = ln[:c.start(1)] + comment[: -len(" (on the list)")]
            elif not on and int(m.group(1)) in listed:
                lines[n] = ln[:c.start(1)] + comment + " (on the list)"
        if "\n".join(lines) != text:
            write(self.root, "data/goals.js", "\n".join(lines))

    def say_kept(self, out):
        """build-goal-levels.py's KEPT lines: facts a level kept because gdladder or
        gdbrowser didn't answer (it keeps the saved ones rather than blanking them)."""
        for m in re.finditer(r"^\s*KEPT \d+ (.+?): (.+)$", out or "", re.M):
            self.say(f"  gdladder/gdbrowser didn't answer for {m.group(1)} - kept its saved {m.group(2)}.")

    def rebuild_goal_levels(self):
        before = load_state(self.root)["GOAL_LEVELS"]
        print("  build-goal-levels.py")
        r = run_tool(self.root, ["build-goal-levels.py"])
        self.say_kept(r.stdout)
        if r.returncode:
            raise Refuse("rebuilding the Grind pages failed: " + ((r.stderr or r.stdout).strip().splitlines() or ["?"])[-1].strip())
        after_state = load_state(self.root)
        after = after_state["GOAL_LEVELS"]
        # build-goal-levels.py writes whatever gdladder/gdbrowser said, even when they
        # didn't answer. A level already on the Grind pages keeps the facts it had
        # instead: an edit shouldn't fail because gdbrowser hiccupped on some other
        # level (Poatan's Congregation clear was refused over Bloodlust's publisher,
        # 2026-10-11). Only a new level below has to get its facts now.
        kept = []
        for lid, old in before.items():
            new = after.get(lid)
            if not new:
                continue
            lost = [k for k in ("name", "rating", "publisher", "videoUrl", "thumbnailUrl", "palette")
                    if old.get(k) and not new.get(k)]
            if new.get("name") == f"Level {lid}" and old.get("name") != new.get("name"):
                lost.append("name")
            lost = list(dict.fromkeys(lost))
            for k in lost:
                new[k] = old[k]
            if lost:
                kept.append(f"{old.get('name')}'s {', '.join(lost)}")
        if kept:
            self.say("  gdladder/gdbrowser didn't answer properly for " + "; ".join(kept)
                     + " - kept what the Grind pages already had.")
        for lid in self.new_goal_levels:
            e = after.get(str(lid))
            if not e:
                raise Refuse(f"level {lid} didn't make it into data/goal-levels.js")
            if e.get("name") == f"Level {lid}":
                raise Refuse(f"gdladder/gdbrowser didn't answer for level {lid} - nothing saved, try again in a few minutes")
            if e.get("writeup"):
                continue
            w, why = wiki_writeup(e["name"], lid)
            if w:
                # Marked as the automatic copy (never shown on the site) so
                # tools/writeup-todo.py lists it until a real one is written.
                w["auto"] = True
                e["writeup"] = w
                self.say(f"  {e['name']}'s Grind page gets a writeup from the GD Wiki ({w['url']}).")
            else:
                self.say(f"  {e['name']} has no writeup: {why}.")
        src = read(self.root, "data/goal-levels.js")
        i = src.index("window.GOAL_LEVELS =")
        write(self.root, "data/goal-levels.js",
              src[:i] + "window.GOAL_LEVELS = " + json.dumps(after, indent=2, ensure_ascii=False) + ";\n")


def new_log_items(before, after):
    """Changelog items this run added (they go on top of the newest entry)."""
    if not after:
        return []
    old_top = before[0] if before else None
    if old_top and old_top.get("date") == after[0].get("date"):
        return after[0]["items"][: len(after[0]["items"]) - len(old_top["items"])]
    return after[0]["items"] if len(after) > len(before) else []


def check(root):
    """Everything must still load, verify and replay before anything is committed."""
    s = load_state(root)  # every data file loads in node
    ar = tool(root, "add-records")
    v = subprocess.run(["node", "-e", ar.VERIFY, root], capture_output=True, text=True, encoding="utf-8")
    if v.returncode:
        raise Refuse("the list doesn't verify: " + (v.stdout or v.stderr).strip()[:400])
    problems = tool(root, "refresh-order").replay_check(s["DEMONS"], s["CHANGELOG"])
    if problems:
        raise Refuse("the changelog doesn't replay to today's order: " + "; ".join(problems)[:400])
    missing = sorted({str(g["levelId"]) for g in s["GOALS"]} - set(s["GOAL_LEVELS"]))
    if missing:
        raise Refuse("Grind levels missing from data/goal-levels.js: " + ", ".join(missing))
    print(f"  check ok: {(v.stdout or '').strip()}; changelog replays; {len(s['GOALS'])} Grind goals")


def changed_files(a, b):
    """Files that differ between two copies of the site (dry runs; .git and videos/ aside)."""
    def walk(root):
        out = {}
        for dp, dns, fns in os.walk(root):
            dns[:] = [d for d in dns if d not in (".git", "videos")]
            for f in fns:
                p = os.path.join(dp, f)
                out[os.path.relpath(p, root).replace(os.sep, "/")] = p
        return out
    x, y = walk(a), walk(b)
    return sorted(k for k in set(x) | set(y) if k not in x or k not in y or open(x[k], "rb").read() != open(y[k], "rb").read())


# --- git ----------------------------------------------------------------------

def git(*args, check=True):
    r = subprocess.run(["git", "-C", REPO] + list(args), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and r.returncode:
        raise Refuse(f"git {args[0]} failed: {(r.stderr or r.stdout).strip()[:300]}")
    return r


def restore():
    git("reset", "-q", "--hard", "HEAD")
    git("clean", "-q", "-fd")


def subject(phrases, editor):
    s = "; ".join(phrases) if len("; ".join(phrases)) <= 90 else f"{phrases[0]} and {len(phrases) - 1} more edits"
    if editor == "Upkeep":
        return f"{s} (scheduled upkeep)"
    return f"{s} (by {editor} via the mod page)"


def report(title, lines, ok):
    """The run's summary: stdout, plus the Actions job summary page when there is one."""
    print("\n" + title)
    for ln in lines:
        print("  " + ln)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with io.open(path, "a", encoding="utf-8") as f:
            f.write(f"### {title}\n\n" + "".join(f"- {ln.strip()}\n" for ln in lines) + "\n")
    if not ok and os.environ.get("GITHUB_ACTIONS"):
        msg = (lines[0] if lines else title).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error title=Edit refused::{msg}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) != 1 or opts - {"--dry-run", "--no-push"}:
        sys.exit(__doc__)
    try:
        payload = json.load(io.open(args[0], encoding="utf-8"))
    except (OSError, ValueError) as e:
        report("Edit refused", [f"couldn't read the payload: {e}"], False)
        sys.exit(1)
    try:
        p = validate(payload)
    except Refuse as e:
        report("Edit refused", [str(e)], False)
        sys.exit(1)
    dry = "--dry-run" in opts or p["dryRun"]
    print(f"Edit {p['requestId']} by {p['editor']}: {len(p['ops'])} op(s){' (dry run)' if dry else ''}")

    if dry:  # a throwaway copy of the working tree: the real one is never touched
        tmp = tempfile.mkdtemp(prefix="apply-edit-")
        root = os.path.join(tmp, "site")
        shutil.copytree(REPO, root, ignore=shutil.ignore_patterns(".git", "videos"))
        try:
            e = Engine(root, p["role"], p["upkeep"], p["owner"])
            e.apply(p["ops"])
            check(root)
            for rel in changed_files(REPO, root):
                print("  would change " + rel)
            report(f"Dry run - {subject(e.subjects, p['editor']) if e.subjects else 'nothing to change'}",
                   e.lines or ["Nothing to change."], True)
        except Refuse as err:
            report("Edit refused", [str(err)], False)
            sys.exit(1)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        return

    if git("status", "--porcelain").stdout.strip():
        report("Edit refused", ["the working tree has uncommitted changes - run this on a clean checkout"], False)
        sys.exit(1)
    for attempt in range(1, TRIES + 1):
        if attempt > 1:
            print(f"\nmaster moved on while this ran - starting over on top of it (try {attempt} of {TRIES})")
            try:
                git("fetch", "-q", "origin", "+refs/heads/master:refs/remotes/origin/master")
                git("reset", "-q", "--hard", "origin/master")
                git("clean", "-q", "-fd")
            except Refuse as err:
                report("Edit failed", [str(err)], False)
                sys.exit(1)
        e = Engine(REPO, p["role"], p["upkeep"], p["owner"])
        try:
            e.apply(p["ops"])
            check(REPO)
        except Refuse as err:
            restore()
            report("Edit refused", [str(err)], False)
            sys.exit(1)
        except Exception:
            restore()
            raise
        if not git("status", "--porcelain").stdout.strip():
            report(f"Edit {p['requestId']} by {p['editor']}: nothing to change", e.lines or ["Nothing to change."], True)
            return
        if not e.subjects:  # only the Grind pages' downloaded facts changed
            e.subjects.append("Refresh the Grind pages")
        msg = subject(e.subjects, p["editor"]) + "\n\n" + "\n".join(e.lines) + f"\n\nRequest: {p['requestId']}\n"
        env = dict(os.environ, GIT_AUTHOR_NAME=BOT_NAME, GIT_AUTHOR_EMAIL=BOT_EMAIL,
                   GIT_COMMITTER_NAME=BOT_NAME, GIT_COMMITTER_EMAIL=BOT_EMAIL)
        git("add", "-A")
        c = subprocess.run(["git", "-C", REPO, "commit", "-q", "-F", "-"], input=msg, env=env,
                           capture_output=True, text=True, encoding="utf-8")
        if c.returncode:
            restore()
            report("Edit failed", [f"git commit failed: {(c.stderr or c.stdout).strip()[:300]}"], False)
            sys.exit(1)
        sha = git("rev-parse", "--short", "HEAD").stdout.strip()
        if "--no-push" in opts:
            report(f"Committed {sha} (not pushed): {subject(e.subjects, p['editor'])}", e.lines, True)
            return
        if git("push", "-q", "origin", "HEAD:master", check=False).returncode == 0:
            report(f"Saved {sha}: {subject(e.subjects, p['editor'])}", e.lines, True)
            return
    report("Edit failed", [f"couldn't push after {TRIES} tries - master kept moving; send it again"], False)
    sys.exit(1)


if __name__ == "__main__":
    main()

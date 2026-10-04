#!/usr/bin/env python3
"""Use a YouTube channel's own showcase videos for every level on this list that
the channel has one for (demon pages + Grind goal pages).

    python tools/apply-showcases.py @nigelx1            # apply
    python tools/apply-showcases.py @nigelx1 --dry-run  # show the plan only

Lists every upload on the channel (via the page's ytInitialData + innertube
continuations), matches titles shaped "<level name> by <creator>" (a leading
"(REMASTERED)" / "[RTX]" tag is ignored; a remastered upload wins over the
original) to this site's levels by exact name, then:
  - records each match in tools/showcase-overrides.json ({levelId: videoId}),
    which build-goal-levels.py and add-records.py also read, so future imports
    and rebuilds keep using the channel's videos;
  - points data/demons.js videoUrl/thumbnailUrl at the channel's video;
  - reruns tools/build-goal-levels.py so goal pages (video + colour theme) follow.
Needs python3 and node on PATH.
"""
import io, json, os, re, subprocess, sys, urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
TOOLS = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(TOOLS, ".."))
DATA = os.path.join(SITE, "data")
OVERRIDES = os.path.join(TOOLS, "showcase-overrides.json")

SCRAPER = r"""
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const walk = (o, f) => { if (o && typeof o === "object") { f(o); for (const k in o) walk(o[k], f); } };
function collect(data, vids, conts) {
  walk(data, (o) => {
    const lv = o.lockupViewModel;
    if (lv && lv.contentId && lv.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      const md = lv.metadata && lv.metadata.lockupMetadataViewModel;
      vids.set(lv.contentId, (md && md.title && md.title.content) || "");
    }
    const r = o.videoRenderer;
    if (r && r.videoId) vids.set(r.videoId, r.title && r.title.runs ? r.title.runs.map((x) => x.text).join("") : "");
    if (o.continuationCommand && o.continuationCommand.token) conts.push(o.continuationCommand.token);
  });
}
(async () => {
  const vids = new Map();
  const html = await (await fetch("https://www.youtube.com/" + process.argv[1] + "/videos", { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } })).text();
  const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) { console.error("no ytInitialData"); process.exit(1); }
  const conts = [];
  collect(JSON.parse(m[1]), vids, conts);
  for (let guard = 0; conts.length && guard < 100; guard++) {
    const res = await fetch("https://www.youtube.com/youtubei/v1/browse?key=" + key, {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: ver, hl: "en" } }, continuation: conts.shift() }),
    });
    collect(await res.json(), vids, conts);
  }
  process.stdout.write(JSON.stringify([...vids].map(([id, title]) => ({ id, title }))));
})();
"""


def load_js(name, var):
    code = "global.window={};require(process.argv[1]);process.stdout.write(JSON.stringify(window[process.argv[2]]))"
    r = subprocess.run(["node", "-e", code, os.path.join(DATA, name), var],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit(f"could not load {name}: {r.stderr[:300]}")
    return json.loads(r.stdout)


def write_js(name, var, value):
    path = os.path.join(DATA, name)
    src = io.open(path, encoding="utf-8").read()
    i = src.find(f"window.{var} =")
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        src[:i] + f"window.{var} = " + json.dumps(value, indent=2, ensure_ascii=False) + ";\n")


def thumb(vid):
    for q in ("maxresdefault", "sddefault", "hqdefault"):  # maxres only exists for HD uploads
        url = f"https://i.ytimg.com/vi/{vid}/{q}.jpg"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=25) as r:
                if len(r.read()) > 2000:
                    return url
        except Exception:
            pass
    return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


def yt_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/vi/)([\w-]{11})", url or "")
    return m.group(1) if m else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    dry = "--dry-run" in sys.argv
    r = subprocess.run(["node", "-e", SCRAPER, args[0]], capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit("couldn't list the channel: " + r.stderr[:300])
    videos = json.loads(r.stdout)
    print(f"{args[0]}: {len(videos)} uploads")

    parsed = []
    for v in videos:
        t = re.sub(r"^\s*(\([^)]*\)|\[[^\]]*\])\s*", "", v["title"])
        m = re.match(r"^(.*\S)\s+by\s+(.+)$", t, re.I)
        if m:
            parsed.append({"id": v["id"], "title": v["title"], "level": norm(m.group(1)),
                           "remastered": "remaster" in v["title"].lower()})

    demons = load_js("demons.js", "DEMONS")
    goal_levels = load_js("goal-levels.js", "GOAL_LEVELS")
    names = {d["levelId"]: d["name"] for d in demons}
    for k, g in goal_levels.items():
        names.setdefault(int(k), g["name"])

    overrides = json.load(io.open(OVERRIDES, encoding="utf-8")) if os.path.exists(OVERRIDES) else {}
    changed = 0
    for lid, name in sorted(names.items(), key=lambda kv: kv[1].lower()):
        hits = sorted((p for p in parsed if p["level"] == norm(name)), key=lambda p: not p["remastered"])
        if not hits:
            continue
        vid = hits[0]["id"]
        if overrides.get(str(lid)) != vid:
            overrides[str(lid)] = vid
            changed += 1
        d = next((x for x in demons if x["levelId"] == lid), None)
        if d and yt_id(d.get("videoUrl")) != vid:
            print(f"  {name}: {yt_id(d.get('videoUrl'))} -> {vid}  [{hits[0]['title']}]")
            if not dry:
                d["videoUrl"] = f"https://www.youtube.com/watch?v={vid}"
                d["thumbnailUrl"] = thumb(vid)
        elif not d:
            print(f"  {name} (goal page): -> {vid}  [{hits[0]['title']}]")
    print(f"{len(overrides)} levels use the channel's video ({changed} new/changed overrides)")
    if dry:
        print("dry run - nothing written")
        return
    io.open(OVERRIDES, "w", encoding="utf-8", newline="\n").write(json.dumps(overrides, indent=1, sort_keys=True) + "\n")
    write_js("demons.js", "DEMONS", demons)
    subprocess.run([sys.executable, os.path.join(TOOLS, "build-goal-levels.py")])


if __name__ == "__main__":
    main()

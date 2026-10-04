#!/usr/bin/env python3
"""Give a record its video (the demon page's "Video Proof" column + record.html).

    python tools/add-video.py <video file> <level id or link> <player>
    python tools/add-video.py <YouTube or Google Drive link> <level id or link> <player>
    python tools/add-video.py --remove <level id or link> <player>
options:  --start 0:12 --end 2:48   trim a file to the run (seconds, m:ss, h:mm:ss)
          --compress                squeeze a file over 25 MB down to fit (lower quality)
          --dry-run                 show the plan, write nothing

Cloudflare Pages serves files up to 25 MB, so:
  - a file under 25 MB is hosted on the site: videos/<levelId>/<player>.mp4
    (+ a .jpg still). An H.264/AAC video is copied as-is - no quality loss;
    anything a browser can't play (HEVC, VP9 in MKV, ...) is converted.
  - a file over 25 MB isn't hosted: upload it to YouTube (unlisted is fine) or
    Google Drive (Share -> "Anyone with the link") and run this again with the
    link. The record page embeds it, so it still plays on the site.
    --compress re-encodes it under 25 MB here instead (keeps 60 fps over
    resolution: ~1080p60 for a short clip, 720p for ~1-2 min, less after).
The record must already be in data/demons.js.
Needs node, plus ffmpeg + ffprobe for files: on PATH, in $FFMPEG_DIR, or
C:/Users/goofy/tools/ffmpeg/bin.
"""
import io, json, os, re, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SITE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(SITE, "data")
HOST_LIMIT = 25 * 1024 * 1024        # Cloudflare Pages' per-file cap
TARGET = 24 * 1024 * 1024            # what re-encodes aim for (a little headroom)
# (height, fps, minimum kbps it looks fine at, kbps cap - more is wasted)
LADDER = [(1080, 60, 6000, 10000), (720, 60, 2800, 6000), (720, 30, 1800, 4000),
          (540, 30, 1000, 2500), (480, 30, 500, 1600)]
YOUTUBE = re.compile(r"(?:youtu\.be/|[?&]v=|/shorts/|/embed/|/live/)([\w-]{11})")
DRIVE = re.compile(r"drive\.google\.com/(?:file/d/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})")


def find_bin(name):
    exe = name + (".exe" if os.name == "nt" else "")
    for d in (os.environ.get("FFMPEG_DIR"), r"C:\Users\goofy\tools\ffmpeg\bin"):
        if d and os.path.exists(os.path.join(d, exe)):
            return os.path.join(d, exe)
    found = shutil.which(name)
    if found:
        return found
    sys.exit(f"can't find {name} - put ffmpeg on PATH or set FFMPEG_DIR")


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
        sys.exit(f"can't read a level id from {x!r}")
    return int(m.group(1))


def seconds(t):
    if t is None:
        return None
    return sum(float(p) * 60 ** i for i, p in enumerate(reversed(str(t).split(":"))))


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit("ffmpeg failed:\n" + r.stderr[-1500:])
    return r


def probe(path):
    r = run([FFPROBE, "-v", "error", "-of", "json", "-show_entries",
             "format=duration,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate,pix_fmt", path])
    info = json.loads(r.stdout)
    streams = info.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not v:
        sys.exit(f"{path}: no video stream")
    num, _, den = (v.get("avg_frame_rate") or "30/1").partition("/")
    fps = float(num) / float(den) if den and float(den) else 30.0
    return {"duration": float(info["format"].get("duration") or 0), "format": info["format"].get("format_name", ""),
            "v": v, "a": a, "fps": fps or 30.0, "w": int(v.get("width") or 0), "h": int(v.get("height") or 0)}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "player"


def find_record(demons, level, player):
    lid = trailing_id(level)
    d = next((x for x in demons if x["levelId"] == lid), None)
    if not d:
        sys.exit(f"level {lid} isn't on this list")
    recs = d.get("records", [])
    r = next((x for x in recs if x["player"] == player), None) or \
        next((x for x in recs if x["player"].lower() == player.lower()), None)
    if not r:
        sys.exit(f"{d['name']} has no record by {player!r} - its records: {', '.join(x['player'] for x in recs)}")
    return d, r


def drop_hosted(r):
    """Delete a record's hosted video files (switching to a link / removing)."""
    for key in ("video", "videoPoster"):
        val = r.get(key) or ""
        if val and not re.match(r"^[a-z]+:|^//", val, re.I):
            p = os.path.join(SITE, *val.split("/"))
            if os.path.exists(p):
                os.remove(p)
        r.pop(key, None)


def encode_to_fit(src, info, start, dur, budget, label, quality_first):
    """H.264/AAC that fits `budget` bytes; returns the ffmpeg runner.
    quality_first (converting / trimming something small): encode at a fixed
    quality first, so a small video stays small, and only squeeze it to the
    budget if that came out too big. Otherwise (--compress): two passes sized
    straight to the budget."""
    a = info["a"]
    audio_k = 128 if a else 0
    total_k = budget * 8 / 1000 * 0.95 / dur
    if a and total_k - audio_k < 1800:
        audio_k = 96
    video_k = total_k - audio_k
    rung = next((x for x in LADDER if video_k >= x[2]), None)
    if not rung:
        sys.exit(f"  {dur:.0f}s is too long to fit even at 480p - trim it (--start / --end) "
                 "or put it on YouTube / Google Drive and pass the link")
    height, fps = min(rung[0], info["h"]), min(rung[1], info["fps"])
    cap = next((x[3] for x in LADDER if x[0] <= height), LADDER[-1][3])  # past this, bits are wasted
    video_k = int(min(video_k, cap))
    vf = [f"scale=-2:{height}" if height < info["h"] else "scale=trunc(iw/2)*2:trunc(ih/2)*2"]
    if info["fps"] > fps + 0.5:
        vf.append(f"fps={fps:g}")
    trim = (["-ss", f"{start:.3f}"] if start else []) + ["-t", f"{dur:.3f}"]
    print(f"  plan: {label} -> {height}p{fps:.0f}, H.264 "
          + (f"at full quality (CRF 21, under {cap} kbps)" if quality_first else f"{video_k} kbps")
          + (f" + AAC {audio_k} kbps" if a else ", no audio")
          + (f", {start:.1f}s-{start + dur:.1f}s" if start or dur < info["duration"] - 0.5 else ""))
    audio = ["-map", "0:a:0", "-c:a", "aac", "-b:a", f"{audio_k}k", "-ac", "2"] if a else ["-an"]

    def go(out):
        nonlocal video_k
        common = [FFMPEG, "-y"] + trim + ["-i", src, "-map", "0:v:0", "-vf", ",".join(vf), "-c:v", "libx264",
                                          "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
                                          "-g", str(int(fps * 2))]
        if quality_first:
            run(common + ["-crf", "21", "-maxrate", f"{cap}k", "-bufsize", f"{cap * 2}k"]
                + audio + ["-movflags", "+faststart", out])
            if os.path.getsize(out) <= budget:
                return
            print("  too big at full quality - fitting it under 25 MB")
        tmp = tempfile.mkdtemp(prefix="addvideo-")
        log, null = os.path.join(tmp, "x264"), ("NUL" if os.name == "nt" else "/dev/null")
        try:
            for _ in range(3):
                base = common + ["-b:v", f"{video_k}k", "-passlogfile", log]
                run(base + ["-pass", "1", "-an", "-f", "null", null])
                run(base + ["-maxrate", f"{int(video_k * 1.5)}k", "-bufsize", f"{video_k * 2}k", "-pass", "2"]
                    + audio + ["-movflags", "+faststart", out])
                if os.path.getsize(out) <= budget:
                    return
                video_k = int(video_k * 0.88)
                print(f"  a little over - retrying at {video_k} kbps")
            os.remove(out)
            sys.exit("  couldn't get it under 25 MB - trim it or use a YouTube / Google Drive link")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return go


def main():
    global FFMPEG, FFPROBE
    args, opts, argv = [], {}, sys.argv[1:]
    while argv:
        a = argv.pop(0)
        if a in ("--start", "--end"):
            opts[a] = argv.pop(0)
        elif a.startswith("--"):
            opts[a] = True
        else:
            args.append(a)
    dry = "--dry-run" in opts
    demons = load_js("demons.js", "DEMONS")

    if "--remove" in opts:
        if len(args) != 2:
            sys.exit(__doc__)
        d, r = find_record(demons, *args)
        if not dry:
            drop_hosted(r)
            write_js("demons.js", "DEMONS", demons)
        print(f"{'would remove' if dry else 'removed'} the video from {r['player']}'s {d['name']} record")
        return
    if len(args) != 3:
        sys.exit(__doc__)
    source, level, player = args
    d, r = find_record(demons, level, player)
    print(f"{d['name']} - {r['player']} ({r['progress']}%)")

    # --- a YouTube / Google Drive link: embedded on the record page ---------
    if re.match(r"^https?://", source, re.I):
        kind = "YouTube" if re.search(r"youtu\.?be", source) and YOUTUBE.search(source) else \
               "Google Drive" if DRIVE.search(source) else None
        if not kind:
            sys.exit("  only YouTube or Google Drive links can be embedded")
        print(f"  plan: embed the {kind} video ({source})")
        if kind == "Google Drive":
            print("  (its sharing has to be 'Anyone with the link' or the embed shows a sign-in box)")
        if not dry:
            drop_hosted(r)
            r["video"] = source
            write_js("demons.js", "DEMONS", demons)
            print("  done")
        return

    # --- a file: hosted here if it fits under 25 MB ---------------------------
    if not os.path.isfile(source):
        sys.exit(f"  no such file: {source}")
    FFMPEG, FFPROBE = find_bin("ffmpeg"), find_bin("ffprobe")
    info = probe(source)
    v, a, size = info["v"], info["a"], os.path.getsize(source)
    start, end = seconds(opts.get("--start")), seconds(opts.get("--end"))
    t0 = start or 0.0
    dur = (end if end is not None else info["duration"]) - t0
    if dur <= 0:
        sys.exit("  nothing left after trimming")
    print(f"  file: {info['w']}x{info['h']} {info['fps']:.0f}fps, {info['duration']:.1f}s, "
          f"{v.get('codec_name')}/{a.get('codec_name') if a else 'no audio'}, {size / 1048576:.1f} MB")
    trimmed = start is not None or end is not None
    playable = v.get("codec_name") == "h264" and v.get("pix_fmt") == "yuv420p" and (a is None or a.get("codec_name") == "aac")
    if size >= HOST_LIMIT and not trimmed and "--compress" not in opts:
        sys.exit(f"  {size / 1048576:.0f} MB is over the 25 MB a file can be on the site. Upload it to YouTube\n"
                 f"  (unlisted is fine) or Google Drive (Share -> Anyone with the link), then run:\n"
                 f"    python tools/add-video.py <the link> {d['levelId']} \"{r['player']}\"\n"
                 f"  (or add --compress to squeeze it under 25 MB here, at lower quality)")
    rel = f"videos/{d['levelId']}/{slug(r['player'])}"
    out_mp4 = os.path.join(SITE, *(rel + ".mp4").split("/"))
    out_jpg = os.path.join(SITE, *(rel + ".jpg").split("/"))
    if playable and size < HOST_LIMIT and not trimmed:
        print("  plan: host it as-is (H.264/AAC under 25 MB - no re-encode)")
        go = lambda out: run([FFMPEG, "-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy",
                              "-movflags", "+faststart", out])
    else:
        squeeze = size >= HOST_LIMIT and "--compress" in opts and not trimmed
        why = "trim" if trimmed else ("compress" if squeeze else "convert for browsers")
        go = encode_to_fit(source, info, t0, dur, TARGET, why, quality_first=not squeeze)
    if dry:
        print("dry run - nothing written")
        return
    drop_hosted(r)
    os.makedirs(os.path.dirname(out_mp4), exist_ok=True)
    go(out_mp4)
    if os.path.getsize(out_mp4) >= HOST_LIMIT:  # a remux can grow a hair
        os.remove(out_mp4)
        sys.exit("  ended up over 25 MB - use a YouTube / Google Drive link (or --compress)")
    o = probe(out_mp4)
    run([FFMPEG, "-y", "-ss", f"{min(20.0, o['duration'] * 0.15):.2f}", "-i", out_mp4, "-frames:v", "1",
         "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", out_jpg])
    r["video"], r["videoPoster"] = rel + ".mp4", rel + ".jpg"
    write_js("demons.js", "DEMONS", demons)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(SITE, "videos")) for f in fs)
    print(f"  hosted {rel}.mp4: {o['w']}x{o['h']} {o['fps']:.0f}fps, {o['duration']:.1f}s, "
          f"{os.path.getsize(out_mp4) / 1048576:.1f} MB (+ .jpg still); videos/ holds {total / 1048576:.0f} MB")


if __name__ == "__main__":
    main()

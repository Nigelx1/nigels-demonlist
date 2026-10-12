#!/usr/bin/env python3
"""Grind levels whose write-up still needs writing by hand: no write-up at all, or
the mod page's automatic copy of the GD Wiki intro (writeup.auto = true, set by
tools/apply-edit.py and never shown on the site). For Claude, when Nigel asks for
the write-ups to be done; how to research them is in the project memory
(feedback_writeups_and_showcases). A hand-written write-up replaces the whole
writeup object, so the flag goes with it.

    python tools/writeup-todo.py
"""
import io, json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

s = io.open(os.path.join(DATA, "goal-levels.js"), encoding="utf-8").read()
levels = json.loads(s[s.index("{", s.index("window.GOAL_LEVELS")):s.rindex("}") + 1])
todo = []
for lid, g in levels.items():
    w = g.get("writeup")
    if not w:
        todo.append((lid, g.get("name"), "no write-up"))
    elif w.get("auto"):
        todo.append((lid, g.get("name"), f"automatic copy of {w.get('url')}"))
if not todo:
    print("Every Grind level has a hand-written write-up.")
for lid, name, why in todo:
    print(f"{lid:>10}  {name:<28} {why}")

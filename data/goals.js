"use strict";
// -----------------------------------------------------------------------------
// "THE GRIND" - the levels each player is trying to beat.
//
// This is NOT the same as a player's "In Progress" row in the stats viewer:
// that row is real sub-100% records on demons already ON the list. A grind
// goal can be any Geometry Dash level, listed or not, and its progress is
// tracked here by hand.
//
// One row per (player, level). Fields:
//   player    - exact player name, as it appears in data/demons.js records
//   levelId   - the Geometry Dash level id (also the key into data/goal-levels.js,
//               unless the level is on the Demonlist, in which case demons.js wins)
//   best      - best run % from the start (number). null = unknown / not tracked
//   segments  - [[from, to], ...] practice-mode runs the player can do. optional
//               Only add a run that isn't completely inside another one (5-25
//               is left out when there's a 5-26). Repeats go in `note`.
//   note      - freeform status line shown under the progress bar. optional
//   blurb     - "why this one" - a sentence from the player. optional
//   attempts  - attempt count. optional
//   video     - a YouTube URL to use as THIS LEVEL's showcase instead of the
//               gdladder one (e.g. the player's own recording). If several goals
//               on one level set it, the first in this file wins. optional
//   milestones- [{ date: "YYYY-MM-DD", percent: N, note?: "" }] dated log. optional
//
// Rendered as a "The Grind" section in the stats-viewer player panel (buttons)
// and, per level, on demonlist/goal.html?level=<levelId> - a page themed off
// the level's thumbnail colours (data/goal-levels.js `palette`).
// -----------------------------------------------------------------------------

window.GOALS = [
  // --- Nigel ---
  {
    player: "Nigel",
    levelId: 68668045, // Congregation
    best: 39,
    segments: [[11, 53], [42, 100]],
    video: "https://youtu.be/Fuxe0O10s-E",
  },
  {
    player: "Nigel",
    levelId: 92466083, // Jupiter My Favourite
    best: 0,
    note: "Haven't started ✌️",
    video: "https://youtu.be/wxyYAuMYq5o",
  },

  // --- Jack ---
  {
    player: "Jack",
    levelId: 118697760, // Wavetrip
    best: null,
    segments: [[74, 100]],
    note: "Can run the back half - 74% to end.",
  },

  // --- jd ---
  {
    player: "jd",
    levelId: 20761188, // Allegiance
    best: 42,
    segments: [[17, 78]],
  },
  {
    player: "jd",
    levelId: 8147005, // Down Bass
    best: 20,
    segments: [[20, 42], [72, 100]],
  },
  {
    player: "jd",
    levelId: 146399247, // rauchkammer
    best: 56,
    segments: [[13, 67]],
  },

  // --- Juice ---
  {
    player: "Juice",
    levelId: 113220284, // The Plunge
    best: null,
    segments: [[31, 57], [58, 100]],
    note: "Has it in two halves - 31–57% and 58–100%.",
  },

  // --- ufplayer ---
  {
    player: "ufplayer",
    levelId: 86084399, // LIMBO
    best: null,
    segments: [[51, 78], [68, 100]],
  },
];

"use strict";
// -----------------------------------------------------------------------------
// LIST CHANGELOG - newest entry first.
//
// Add an entry whenever the list changes: a demon added / moved / removed, a
// scoring or tier tweak, anything worth a note. Rendered on /changelog/ and
// teased in the demonlist sidebar.
//
//   { date: "YYYY-MM-DD", items: [ ...one or more of the below... ] }
//
//   { kind: "add",    demon: "Name", demonId: 12345, at: 4,   text?: "why" }
//   { kind: "move",   demon: "Name", demonId: 12345, from: 6, to: 3 }
//   { kind: "remove", demon: "Name",                 from: 40, text?: "why" }
//   { kind: "note",   text: "free-form note" }
//
// demonId is optional (links to the demon page when it's present and the demon
// is still on the list). text is an optional extra clause on any kind.
//
// This file also drives each demon page's "Position History" table
// (DL.positionHistoryFor): the initial order is reconstructed by undoing every
// add/move/remove logged here, so ALWAYS log a position change as an `add`
// (with `at`), `move` (with `from` + `to`) or `remove` (with `from`) - an
// unlogged reorder would desync the history. `text` on a `move` becomes that
// row's reason verbatim.
// -----------------------------------------------------------------------------

window.CHANGELOG = [
  {
    date: "2026-10-04",
    items: [
      // newest first: the rating refresh came after Zafari went in
      { kind: "note", text: "GDDL ratings refreshed - 29 levels had drifted since they were added, so everyone's points shift a little." },
      { kind: "move", demon: "Theory of Everything 2", demonId: 2, from: 49, to: 48, text: "GDDL rating refresh - Theory of Everything 2 3.04 → 3.05, Change of Scene 3.04" },
      { kind: "move", demon: "Space Invaders", demonId: 102343052, from: 27, to: 26, text: "GDDL rating refresh - Space Invaders 10.21 → 10.18, Tidal Line 10.23 → 10.15" },
      { kind: "add", demon: "Zafari", demonId: 29619645, at: 40, text: "Nigel's clear - Rustam's first 2.1 level, an Easy Demon" },
    ],
  },
  {
    date: "2026-09-06",
    items: [
      // high position -> low so the position-history replay inserts low -> high
      { kind: "add", demon: "Lit Fuse", demonId: 15122517, at: 16, text: "ufplayer's clear - KrmaL's first solo, an Insane Demon" },
      { kind: "add", demon: "Bad Trip", demonId: 59948178, at: 10, text: "ufplayer's clear - Loltad's one-man megacollab" },
      { kind: "add", demon: "HyperSonic", demonId: 30219145, at: 7, text: "ufplayer's clear - the ViPriN Sonic megacollab" },
      { kind: "add", demon: "Steel Terrors", demonId: 119653522, at: 6, text: "ufplayer's clear - a DreamZoneGD Extreme Demon" },
      {
        kind: "note",
        text: "ufplayer also cleared Supersonic (already #14). They move to #2 on the leaderboard, past Juice.",
      },
    ],
  },
  {
    date: "2026-09-04",
    items: [
      // ordered high position number -> low so the position-history replay
      // (which reverses items within an entry) inserts them low -> high
      { kind: "add", demon: "tower descent", demonId: 92742742, at: 24, text: "ufplayer's clear - a pocke Hard Demon" },
      { kind: "add", demon: "CraZy II", demonId: 47620786, at: 16, text: "ufplayer's clear - DavJT's Insane Demon" },
      { kind: "add", demon: "Fool Moon Paranoid", demonId: 87932531, at: 13, text: "ufplayer's clear - an unne Insane Demon" },
      { kind: "add", demon: "Worse Trip", demonId: 78248443, at: 2, text: "ufplayer's clear - Loltad's Extreme Demon, straight in at #2" },
      {
        kind: "note",
        text: "New member: ufplayer, from Mexico. Trying to beat LIMBO.",
      },
    ],
  },
  {
    date: "2026-09-01",
    items: [
      {
        kind: "add",
        demon: "HeLL",
        demonId: 25706351,
        at: 23,
        text: "jd's clear - a Serponge Medium Demon",
      },
      {
        kind: "note",
        text: "Jack (now listed from California) logged clears on Future Funk, Nine Circles, Skeletal Shenanigans, DeCode, Deadlocked, ToE2 and Clubstep.",
      },
      {
        kind: "note",
        text: "List created - 65 demons imported from our gdladder.com profiles (every non-platformer completion), ranked hardest-first by GD Demon Ladder's difficulty rating.",
      },
      {
        kind: "note",
        text: "Tiers set: the top 20 are the Main List and everything after that is the Extended List. No Legacy tier.",
      },
      {
        kind: "note",
        text: "Every demon now has its GD Demon Ladder showcase video and thumbnail.",
      },
    ],
  },
];

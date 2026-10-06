"use strict";
// -----------------------------------------------------------------------------
// SITE CONFIGURATION
// Edit this file to configure your community's Demonlist. Nothing in here is
// fetched from a server - it's just a plain JS object the pages read directly,
// so you can edit it by hand and refresh the page.
// -----------------------------------------------------------------------------

window.SITE = {
  name: "Nigel's Demonlist",
  tagline: "A private Geometry Dash Demonlist for our community",
  description:
    "Nigel's Demonlist ranks the hardest Geometry Dash levels beaten by members of our community.",

  // The day the list went live. Used as the "Added to list" date in each
  // demon's Position History for the demons that were part of the first batch
  // (everything added since is dated from its data/changelog.js entry).
  listCreated: "2026-09-01",

  // List tier cutoffs:
  //   position <= mainListSize                     -> Main List
  //   mainListSize < position <= extendedListSize   -> Extended List
  //   position > extendedListSize                   -> Legacy List
  // Every Main + Extended demon gets a full panel on the overview page; Legacy
  // demons are only listed by name in the Legacy dropdown.
  //
  // Set extendedListSize to `null` for NO Legacy tier: the top mainListSize
  // demons are the Main List and *every* demon after that is the Extended List,
  // however long the list grows. (Scoring is by difficulty rating, not
  // position - see the SCORING block below - so this is purely a display split.)
  mainListSize: 20,
  extendedListSize: null,

  // Set to a Discord invite URL to show the Discord panel on the overview page,
  // or leave as null to hide it.
  discordInvite: null,

  // List staff shown in the sidebar "List Editors" / "List Helpers" panel.
  // Leave empty and the panel is skipped. Do NOT fill these in with guesses -
  // only add real names you provide.
  editors: [
    { name: "Nigel" },
  ],
  helpers: [
    // { name: "SomeHelper" },
  ],

  // Short blurbs shown as columns on the home page under the stats bar. Keep
  // them to a sentence or two each; edit freely.
  about: [
    {
      title: "The list",
      text: "Every non-platformer Geometry Dash demon anyone in our community has beaten, ranked hardest-first: extremes in AREDL order, everything else by GD Demon Ladder's difficulty rating on the same scale. The top 20 are the Main List and everything after that is the Extended List.",
    },
    {
      title: "Scoring",
      text: "Each demon is worth points based on how hard it is - for an extreme, its AREDL placement, turned into a GD Demon Ladder-style rating by a curve fit to the whole AREDL; for everything else, its GD Demon Ladder rating - on a steep curve fit to the AREDL. The hardest demons are worth far more than the rest. Your score is the sum of every demon you've completed.",
    },
    {
      title: "The community",
      text: "A private list for our group of about five core players. Records come straight from our gdladder profiles, so there's no public submission form - talk to a list editor if something's off.",
    },
  ],

  // Placeholder record-submission guidelines shown on the /guidelines/ page.
  // Replace with your community's actual rules.
  guidelines: [
    "Records must be submitted with a video showing the full run.",
    "Progress on Extended List demons requires a 100% completion to be recorded.",
    "Progress on Main List demons requires at least the demon's listed requirement percentage.",
    "Mods/hacks that trivialize gameplay are not allowed unless explicitly permitted for that level.",
  ],

  // AREDL FIT - tools/refresh-order.py fits a GD Demon Ladder-style rating to
  // an AREDL placement over the whole AREDL: rating = a + b * position^exponent.
  // Extremes on the AREDL are ordered and scored by it (DL.demonRating), so the
  // list follows AREDL placement; everything else uses its own GDDL rating.
  aredlFit: { a: 43.8741, b: -1.473263, exponent: 0.38, points: 1575, r2: 0.9724, fitted: "2026-10-06" },
  // ---------------------------------------------------------------------------
  // SCORING
  // A 100% completion of the #1 (highest-rated) demon is worth `topScore`.
  // Everything else falls off exponentially by DL.demonRating: an extreme's
  // AREDL placement through aredlFit, otherwise its gdladder difficulty `rating`
  // (in data/demons.js):
  //
  //     points(rating) = topScore * base ^ (rating - topRating)
  //
  // The curve shape is fit to the AREDL (aredl.net) so the list is as
  // top-heavy as GD demons really are: `base` 1.176 means each -1.0 of rating
  // divides points by ~1.18, and a ~6.5-point rating gap is worth ~2.9x. So
  // Ghoul (rating 30.45) = 500 and Bloodbath (23.98) ~= 175 - the same
  // proportions as their real AREDL points. There's no floor: every demon
  // scores what its rating earns, so a harder easy-demon still beats a softer
  // one (End Line 1.99 -> ~5.0 vs The Nightmare 1.04 -> ~4.2). Raise `base`
  // for a steeper list, lower it for a flatter one. Scoring function:
  // DL.scoreAt100 in static/js/list-utils.js.
  // ---------------------------------------------------------------------------
  scoring: {
    // Points for a 100% of the #1 demon.
    topScore: 500,
    // Points multiplier per +1.0 of gdladder difficulty rating.
    base: 1.176,
    // Flat points for a (100%) completion of any Legacy demon (no Legacy tier
    // right now - see extendedListSize above).
    legacyScore: 2,
    // A completion at exactly a demon's requirement% is worth this fraction of
    // its 100%-score; completions between requirement% and 100% are
    // interpolated linearly between that floor and the full score.
    requirementScoreFraction: 0.25,
  },
};

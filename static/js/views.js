"use strict";
// -----------------------------------------------------------------------------
// LIST VIEWS (Nigel and Dihmaster500, 2026-10-30): the list and the stats
// viewer show one option from each set, in any combination.
//   Time:   Current - today's list
//           Future  - plus every off-list level in someone's In Progress (a
//                     Grind run longer than SITE.grindInProgress; SITE.futureList)
//           Future+ - plus every off-list level in anyone's Grind, at any
//                     progress (SITE.futurePlus)
//           The Future views are "what if everyone finishes" (Nigel,
//           2026-10-30): every level in someone's In Progress (Future) or
//           Grind (Future+) counts as beaten for them, with its full points
//           (DL.projectedClears), in place of today's in-progress points.
//   Rating: Rated   - today's list: rated Extremes and Insanes. No unrated
//                     level is anywhere in these views.
//           Rated+  - plus the unrated levels the head mods put on it
//                     (data/unrated.js, SITE.ratedPlus) that someone has beaten
//                     (DL.unratedBeaten). One nobody has beaten yet is a Grind
//                     level of Rated+: it joins Future / Future+ like one (from
//                     a Grind goal or a record), and in Current + Rated+ a run
//                     on it scores in-progress points, though it isn't shown.
// Every level goes where tools/refresh-order.py would put it (extremes above
// insanes when the Main List is "extremes", then DL.demonRating, then AREDL
// placement), and every level's points and every player's score are worked
// out again for the view: the hardest level present is the one worth topScore.
// Insanes a head mod swapped (SITE.insaneSwaps) trade values inside
// DL.demonRating, and a tie between them goes by position, so they keep the
// head mods' order here too.
// An unrated level is placed and scored by the head mods' GD Demon Ladder
// estimate, or sits in a spot a head mod picked close to it (placeBelow,
// inside DL.unratedSlots' window); its points come from the estimate either way.
// The listed demons never move relative to each other: the extras are only
// spliced in between them. Current + Rated is today's list and runs today's
// code (DL.sortedDemons, DL.scoreAt100, DL.aggregatePlayers) - nothing below
// builds it.
//
// DL.listView(time, rating) builds a view, DL.currentListView() the one this
// page shows (DL.currentView in list-utils.js). The slot rule (DL.unratedSlots
// / DL.unratedSlotOk) is the same as tools/apply-edit.py's unrated_slots /
// slot_ok - change both together.
//
// Load order: data/config.js, demons.js, [changelog.js], goal-levels.js,
// goals.js, unrated.js, static/js/list-utils.js, [demonlist.js, goals.js],
// views.js. Time "current" needs only config, demons, unrated and list-utils
// (the mod page). Safe in node's vm: nothing runs at load time but definitions.
// -----------------------------------------------------------------------------

(function (DL) {
  DL.VIEW_LABELS = {
    time: { current: "Current", future: "Future", plus: "Future+" },
    rating: { rated: "Rated", plus: "Rated+" },
  };
  var VIEW_TIPS = {
    time: {
      current: "Today's list",
      future: "Plus every level in someone's In Progress",
      plus: "Plus every level in anyone's Grind",
    },
    rating: {
      rated: "Rated levels only",
      plus: "Plus the unrated levels someone has beaten",
    },
  };

  // "Future", "Future+", "Rated+", "Future · Rated+", "Future+ · Rated+";
  // "Today's list" for Current + Rated.
  DL.viewTitle = function (v) {
    if (DL.isDefaultView(v)) return "Today's list";
    var parts = [];
    if (v.time !== "current") parts.push(DL.VIEW_LABELS.time[v.time]);
    if (v.rating !== "rated") parts.push(DL.VIEW_LABELS.rating[v.rating]);
    return parts.join(" · ");
  };

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // a level's numeric level id (listed demons, unrated levels and Grind rows
  // all carry one; a demon's id is the same number)
  function levelIdOf(lv) {
    return Number(lv.levelId != null ? lv.levelId : lv.id);
  }

  // an id from a level object or the id itself; null when it isn't a number
  function idOf(x) {
    var id = x !== null && typeof x === "object" ? levelIdOf(x) : Number(x);
    return isFinite(id) ? id : null;
  }

  function findIndex(list, test) {
    for (var i = 0; i < list.length; i++) if (test(list[i])) return i;
    return -1;
  }

  // Which tier a level counts in, for ordering: with a Main List of
  // "extremes", every Extreme (unrated or not) sorts above every Insane.
  var TIER_RANK = { Extreme: 0, Insane: 1 };
  DL.tierRank = function (level) {
    if (!window.SITE || window.SITE.mainListSize !== "extremes") return 0;
    var d = level && level.difficulty;
    return typeof d === "string" && has(TIER_RANK, d) ? TIER_RANK[d] : 2;
  };

  // How far a head mod can move an unrated level by hand, in rating points
  // either side of its estimate (SITE.unratedWindow, default 1).
  DL.unratedWindow = function () {
    var w = window.SITE && window.SITE.unratedWindow;
    return typeof w === "number" && w >= 0.05 ? w : 1;
  };

  // tools/refresh-order.py's sort key, field for field, then two tie-breaks
  // for levels that aren't listed: unrated before Grind, then level id. A
  // demon an Insane swap holds never uses its own AREDL placement as a
  // tie-break (DL.swapGroupOf): its position keeps the head mods' order.
  var KIND_RANK = { listed: 0, unrated: 1, grind: 2 };
  function sortKey(row) {
    var lv = row.level;
    return [
      DL.tierRank(lv),
      -Math.round(DL.demonRating(lv) * 100) / 100,
      typeof lv.aredlPosition === "number" && lv.aredlPosition && !DL.swapGroupOf(lv) ? lv.aredlPosition : 1e9,
      row.kind === "listed" ? lv.position : Infinity, // an incoming level goes below a listed tie
      KIND_RANK[row.kind],
      levelIdOf(lv),
    ];
  }
  function compare(a, b) {
    var x = sortKey(a), y = sortKey(b);
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }

  // --- the manual placement window ------------------------------------------
  // A spot is named by its anchor: 0 = the very top, otherwise the level id of
  // the listed demon the unrated level sits right below. Inside today's list L
  // (never other unrated or Grind levels), with e = its estimate, t = its tier
  // rank and W = DL.unratedWindow(), the spot between X (above) and Y (below)
  // is valid when
  //   (no X, or X in a higher tier, or X in its tier with value >= e - W) and
  //   (no Y, or Y in a lower tier, or Y in its tier with value <= e + W).
  // So it moves past same-tier neighbors within W of its estimate, never
  // across a tier boundary. The valid spots are contiguous and always include
  // the one the estimate gives it. tools/apply-edit.py slot_ok mirrors this.

  // the anchor as a number, or null when it can't name a spot
  function anchorOf(anchor) {
    if (typeof anchor === "string" && /^\d+$/.test(anchor)) anchor = Number(anchor);
    return typeof anchor === "number" && isFinite(anchor) && anchor >= 0 && Math.floor(anchor) === anchor
      ? anchor
      : null;
  }

  // { above, below } for a valid spot, else null
  function slotAt(u, anchor, L) {
    var X = null, Y = null;
    if (anchor === 0) {
      Y = L[0] || null;
    } else {
      var i = findIndex(L, function (d) { return levelIdOf(d) === anchor; });
      if (i < 0) return null;
      X = L[i];
      Y = L[i + 1] || null;
    }
    var e = DL.demonRating(u), t = DL.tierRank(u), W = DL.unratedWindow();
    var okX = !X || DL.tierRank(X) < t || (DL.tierRank(X) === t && DL.demonRating(X) >= e - W);
    var okY = !Y || DL.tierRank(Y) > t || (DL.tierRank(Y) === t && DL.demonRating(Y) <= e + W);
    return okX && okY ? { above: X, below: Y } : null;
  }

  // Is the spot below `anchor` inside u's window? u needs only levelId,
  // difficulty and rating; listed defaults to DL.sortedDemons().
  DL.unratedSlotOk = function (u, anchor, listed) {
    var a = anchorOf(anchor);
    return a !== null && !!slotAt(u, a, listed || DL.sortedDemons());
  };

  // Every valid spot for u, top to bottom: [{ anchor, above, below, auto }].
  // auto marks the spot its estimate gives it.
  DL.unratedSlots = function (u, listed) {
    var L = listed || DL.sortedDemons();
    var mine = { kind: "unrated", level: u };
    var j = findIndex(L, function (d) { return compare(mine, { kind: "listed", level: d }) < 0; });
    if (j < 0) j = L.length;
    var auto = j === 0 ? 0 : levelIdOf(L[j - 1]);
    var out = [];
    [0].concat(L.map(levelIdOf)).forEach(function (anchor) {
      var s = slotAt(u, anchor, L);
      if (s) out.push({ anchor: anchor, above: s.above, below: s.below, auto: anchor === auto });
    });
    return out;
  };

  // --- building a view ---------------------------------------------------------

  // Does an extra row (an unrated level, beaten or not) sit in a hand-picked
  // spot that's valid now? listed: today's list, in order.
  function handPicked(row, listed) {
    var lv = row.level;
    return (row.kind === "unrated" || !!row.unrated) && lv.placeBelow != null && DL.unratedSlotOk(lv, lv.placeBelow, listed);
  }

  // Where an extra goes among rows (the index it takes): in a hand-picked spot
  // (row.manual), right below its anchor, where only another extra in that same
  // gap can come between them; otherwise above the first row it outranks.
  function placeAt(rows, row) {
    var k;
    if (row.manual) {
      var anchor = anchorOf(row.level.placeBelow);
      var ix = anchor === 0 ? -1 : findIndex(rows, function (r) { return r.kind === "listed" && r.id === anchor; });
      var iy = rows.length;
      for (k = ix + 1; k < rows.length; k++) {
        if (rows[k].kind === "listed") {
          iy = k;
          break;
        }
      }
      for (k = ix + 1; k < iy; k++) {
        if (compare(row, rows[k]) < 0) return k;
      }
      return iy;
    }
    var at = findIndex(rows, function (r) { return compare(row, r) < 0; });
    return at < 0 ? rows.length : at;
  }

  // Could the level be on the list at all? (tools/add-records.py's guard: an
  // allowed difficulty, a demon in game, never a platformer)
  function eligible(lv) {
    var cfg = window.SITE;
    var allowed = cfg.allowedDifficulties || (cfg.extremesOnly ? ["Extreme"] : null);
    if (allowed && allowed.indexOf(lv.difficulty) < 0) return false;
    var gd = lv.gd || {};
    if (gd.inGameDifficulty && !/ Demon$/.test(gd.inGameDifficulty)) return false; // a 9-star "Insane" isn't a demon
    return !/^plat/i.test(gd.length || "");
  }

  // Is someone grinding this level (any goal in data/goals.js)?
  function inGrind(id) {
    return Array.isArray(window.GOALS) && window.GOALS.some(function (g) {
      return Number(g.levelId) === id;
    });
  }

  // Rated+ in Future / Future+: the unrated levels nobody has beaten yet that
  // join like Grind levels - someone's longest run on it longer than
  // SITE.grindInProgress, in the Grind or a record under 100% (Future), or
  // anyone with a Grind goal or a record on it (Future+) - each with who has
  // them (Grind goals first, then records). kind "grind" with unrated: true;
  // placed like an unrated level (its estimate, or a valid hand-picked spot).
  function openRows(levels, everyGoal) {
    var min = window.SITE.grindInProgress;
    var goals = Array.isArray(window.GOALS) ? window.GOALS : [];
    var hasRun = typeof DL.grindInProgressRun === "function" ? DL.grindInProgressRun : function () { return null; };
    return levels
      .map(function (u) {
        var players = [];
        function add(name) {
          if (players.indexOf(name) < 0) players.push(name);
        }
        goals.forEach(function (g) {
          if (Number(g.levelId) === u.levelId && (everyGoal || hasRun(g))) add(g.player);
        });
        (u.records || []).forEach(function (rec) {
          if (everyGoal || (typeof min === "number" && rec.progress > min)) add(rec.player);
        });
        return players.length
          ? { kind: "grind", unrated: true, level: u, id: u.levelId, listed: false, was: null, players: players, manual: false }
          : null;
      })
      .filter(Boolean);
  }

  // The off-list Grind levels that join: every Grind level (Future+) or the
  // ones someone has In Progress (Future), each once, with who has it.
  function grindRows(everyGoal, skip) {
    if (
      typeof DL.goalLevel !== "function" ||
      !Array.isArray(window.GOALS) ||
      (!everyGoal && typeof DL.grindInProgressRun !== "function")
    ) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("List views: The Grind isn't loaded on this page, so no level joins from it.");
      }
      return [];
    }
    var byId = {}, ids = [];
    window.GOALS.forEach(function (g) {
      var id = Number(g.levelId);
      if (skip[id] || !(everyGoal || DL.grindInProgressRun(g))) return;
      var lv = DL.goalLevel(id);
      if (!lv || !eligible(lv)) return;
      if (!byId[id]) {
        byId[id] = {
          kind: "grind",
          // goal-levels.js entries have no id; never write onto the data itself
          level: Object.assign({}, lv, { id: id, levelId: id }),
          id: id, listed: false, was: null, players: [], manual: false,
        };
        ids.push(id);
      }
      if (byId[id].players.indexOf(g.player) < 0) byId[id].players.push(g.player);
    });
    return ids.map(function (id) { return byId[id]; });
  }

  // In-progress points (SITE.inProgressPoints - Nigel and Dihmaster500,
  // 2026-10-30, like pointercrate's progress records). A level someone hasn't
  // beaten, with a run on it longer than SITE.grindInProgress (from 0 or a
  // practice run, in the Grind or as a record under 100%), scores that share of
  // the level's points times their longest run. The level's points are capped at
  // topScore. A clear gives full points instead, and a record that already
  // scores more keeps its own points: nothing counts twice. A level from someone's
  // In Progress that the view doesn't show (in Current, one that isn't on the
  // list) still counts, valued on the view's curve as if it were listed. Unrated
  // levels count only in the Rated+ views: from their row where they're shown,
  // and one nobody has beaten yet that isn't shown (Rated+ Current) from its
  // estimate, the same way. Current views only: the Future views count those
  // runs as clears instead (DL.projectedClears), so there it adds nothing.
  // view: a list view, or nothing for today's list. [] when the setting is off.
  //   -> [{ player, id, level, run: [from, to], points, extra, shown }], where
  //      extra is what it adds to the player's score on top of their record
  DL.inProgressScores = function (view) {
    var cfg = window.SITE || {}, s = cfg.scoring;
    var share = cfg.inProgressPoints, min = cfg.grindInProgress;
    if (typeof share !== "number" || !(share > 0) || typeof min !== "number") return [];
    var v = view && !view.isDefault ? view : null;
    if (v && v.time !== "current") return [];
    var shown = {}, top, levels, recordScore;
    if (v) {
      v.rows.forEach(function (r) {
        shown[r.id] = { level: r.level, full: r.tier === "legacy" ? 0 : r.points };
      });
      top = v.top;
      levels = v.recordLevels;
      recordScore = v.recordScore;
    } else {
      DL.sortedDemons().forEach(function (d) {
        shown[levelIdOf(d)] = { level: d, full: DL.tierOf(d.position) === "legacy" ? 0 : DL.scoreAt100(d) };
      });
      top = DL.topRating();
      levels = window.DEMONS;
      recordScore = DL.recordScore;
    }

    // each player's longest run on each level, and what their records there score
    var best = {}, order = [], beaten = {}, kept = {};
    function offer(player, id, run) {
      var k = player + "|" + id;
      if (!best[k]) order.push(k);
      if (!best[k] || run[1] - run[0] > best[k].run[1] - best[k].run[0]) best[k] = { player: player, id: id, run: run };
    }
    levels.forEach(function (lv) {
      var id = levelIdOf(lv);
      (lv.records || []).forEach(function (rec) {
        var k = rec.player + "|" + id;
        if (rec.progress >= 100) beaten[k] = true;
        else if (rec.progress > min) offer(rec.player, id, [0, rec.progress]);
        var pts = recordScore(lv, rec.progress);
        if (!(kept[k] >= pts)) kept[k] = pts;
      });
    });
    if (Array.isArray(window.GOALS) && typeof DL.grindInProgressRun === "function") {
      window.GOALS.forEach(function (g) {
        var run = DL.grindInProgressRun(g);
        if (run) offer(g.player, Number(g.levelId), run);
      });
    }

    var out = [];
    order.forEach(function (k) {
      var b = best[k];
      if (beaten[k]) return;
      var at = has(shown, b.id) ? shown[b.id] : null, level, full;
      if (at) {
        level = at.level;
        full = at.full;
      } else {
        var u = DL.unratedById(b.id);
        if (u) {
          // not in this view: an unrated level counts only in Rated+, and only
          // while nobody has beaten it (one someone has is on the list there)
          if (!v || v.rating !== "plus" || DL.unratedBeaten(u)) return;
          level = u;
        } else {
          // not in this view: only an off-list level that could be on the list
          if (DL.demonById(b.id) || typeof DL.goalLevel !== "function") return;
          level = DL.goalLevel(b.id);
          if (!level || !eligible(level)) return;
        }
        full = s.topScore * Math.pow(s.base, DL.demonRating(level) - top);
      }
      var points = share * Math.min(full, s.topScore) * (b.run[1] - b.run[0]) / 100;
      var extra = points - (kept[k] || 0);
      if (extra > 0) {
        out.push({ player: b.player, id: b.id, level: level, run: b.run, points: points, extra: extra, shown: !!at });
      }
    });
    return out;
  };

  // Projected clears: the Future views are "what if everyone finishes" (Nigel,
  // 2026-10-30). A level someone hasn't beaten counts for them as if they had,
  // with its full points in the view (a 100% there), when
  //   Future:  it's In Progress for them - a run longer than
  //            SITE.grindInProgress, in their Grind (DL.grindInProgressRun) or
  //            a record under 100%;
  //   Future+: it's in their Grind at all (even a goal with no run yet), or
  //            they have a record under 100% on it, at any %.
  // Only the view's own rows count: Future's rows hold every In Progress level
  // and Future+'s every Grind level that could be on the list, and an unrated
  // level is one only in Rated+. The player's records on it score nothing on
  // top (DL.aggregatePlayers): the clear replaces them. [] in the Current views.
  //   -> [{ player, id, level, run: [from, to], points }], one per player and
  //      level, in the order they come up (records in the view's record order,
  //      then data/goals.js): level is the view's row level, points what a 100%
  //      there scores, and run the one the stats viewer labels it with - the
  //      run that makes it In Progress, their longest ("Congregation
  //      (42–100%)"); in Future+, for a level that isn't, their best % from
  //      the start, as on their Grind chip ("Tartarus (10%)"), else their
  //      longest practice run, else [0, 0] for a goal with no run yet ("0%")
  DL.projectedClears = function (view) {
    var v = view && !view.isDefault ? view : null;
    if (!v || (v.time !== "future" && v.time !== "plus")) return [];
    var every = v.time === "plus", min = (window.SITE || {}).grindInProgress;
    if (!every && typeof min !== "number") return [];

    // each player's runs on each level - the longest that's In Progress
    // (longer than SITE.grindInProgress: DL.grindInProgressRun's rule), the
    // best from the start, the longest at all; the first one on a tie - and
    // the levels they've beaten
    var at = {}, order = [], beaten = {};
    function runsOf(player, id) {
      var k = player + "|" + id;
      if (!at[k]) {
        at[k] = { player: player, id: id, inProgress: null, fromStart: null, longest: null };
        order.push(k);
      }
      return at[k];
    }
    function offer(b, run) {
      var n = run[1] - run[0];
      function longer(r) {
        return !r || n > r[1] - r[0];
      }
      if (typeof min === "number" && n > min && longer(b.inProgress)) b.inProgress = run;
      if (run[0] === 0 && longer(b.fromStart)) b.fromStart = run;
      if (longer(b.longest)) b.longest = run;
    }
    v.recordLevels.forEach(function (lv) {
      var id = levelIdOf(lv);
      (lv.records || []).forEach(function (rec) {
        if (rec.progress >= 100) beaten[rec.player + "|" + id] = true;
        else offer(runsOf(rec.player, id), [0, rec.progress]);
      });
    });
    (Array.isArray(window.GOALS) ? window.GOALS : []).forEach(function (g) {
      var b = runsOf(g.player, Number(g.levelId));
      if (g.best != null) offer(b, [0, g.best]);
      (g.segments || []).forEach(function (s) {
        offer(b, s);
      });
    });

    var out = [];
    order.forEach(function (k) {
      var b = at[k], r = v.row(b.id);
      var run = b.inProgress || (every ? b.fromStart || b.longest || [0, 0] : null);
      if (beaten[k] || !r || !run) return;
      out.push({ player: b.player, id: b.id, level: r.level, run: run, points: v.recordScore(r.level, 100) });
    });
    return out;
  };

  // The parts every view shares, around its rows (already numbered and scored).
  // recordLevels: the levels whose records score; creditLevels: the ones on the
  // list for good, whose creators etc. get credit (recordLevels by default).
  function finishView(time, rating, rows, top, recordLevels, recordScore, creditLevels) {
    var byId = {};
    rows.forEach(function (r) {
      byId[r.id] = r;
    });
    var view = {
      time: time,
      rating: rating,
      isDefault: time === "current" && rating === "rated",
      rows: rows,
      // joining from the Grind (and in Rated+ the unrated levels nobody has
      // beaten yet: unrated: true), and Rated+'s unrated levels someone has beaten
      joining: rows.filter(function (r) { return r.kind === "grind"; }),
      unrated: rows.filter(function (r) { return r.kind === "unrated"; }),
      top: top,
      topNow: DL.topRating(),
      recordLevels: recordLevels,
      creditLevels: creditLevels || recordLevels,
    };
    view.title = DL.viewTitle(view);
    view.row = function (x) {
      var id = idOf(x);
      return id !== null && has(byId, id) ? byId[id] : null;
    };
    view.pos = function (x) {
      var r = view.row(x);
      return r ? r.position : null;
    };
    view.tier = function (x) {
      var r = view.row(x);
      return r ? r.tier : null;
    };
    view.points = function (x) {
      var r = view.row(x);
      return r ? r.points : null;
    };
    view.recordScore = recordScore || function (level, progress) {
      var s = window.SITE.scoring;
      var r = view.row(level);
      if (!r) return 0;
      if (r.tier === "legacy") return progress >= 100 ? s.legacyScore : 0;
      var req = level.requirementPercent || 100;
      if (progress < req) return 0;
      if (progress >= 100) return r.points;
      var floor = r.points * s.requirementScoreFraction;
      return floor + ((progress - req) / (100 - req || 1)) * (r.points - floor);
    };
    // the level's page in this view: a demon page (listed or unrated), or the
    // Grind page of a level that joins from the Grind. An unrated level nobody
    // has beaten yet has its Grind page while someone has it in their Grind,
    // else its demon page.
    view.url = function (x) {
      var r = view.row(x), id = r ? r.id : idOf(x);
      var u = DL.unratedById(id);
      var grind = u ? !DL.unratedBeaten(u) && inGrind(id) : r ? r.kind === "grind" : !DL.demonById(id);
      return DL.withView(
        (grind ? "goal.html?level=" : "demon.html?id=") + encodeURIComponent(id),
        { time: time, rating: rating }
      );
    };
    // Where a level would go in this view: { position, tier }. A row gives its
    // own; a level the view doesn't show gets the tier it would be in and a
    // position half a step above the row it would go in front of (#3.5 sits
    // between #3 and #4), placed like an extra (DL.unratedSlots' rule for an
    // unrated level). The stats viewer sorts with it.
    view.spot = function (level) {
      var r = view.row(level);
      if (r) return { position: r.position, tier: r.tier };
      var cfg = window.SITE, id = levelIdOf(level), u = DL.unratedById(id);
      var row = { kind: u && DL.unratedBeaten(u) ? "unrated" : "grind", unrated: !!u, level: u || level, id: id };
      row.manual = handPicked(row, DL.sortedDemons());
      var at = placeAt(rows, row), p = at + 1;
      var mainSize = cfg.mainListSize;
      if (mainSize === "extremes") {
        mainSize = rows.filter(function (x) { return x.level.difficulty === "Extreme"; }).length +
          (row.level.difficulty === "Extreme" ? 1 : 0);
      }
      return {
        position: at + 0.5,
        tier: p <= mainSize ? "main" : cfg.extendedListSize == null || p <= cfg.extendedListSize ? "extended" : "legacy",
      };
    };
    // DL.formatDemonLink's markup with this view's tier (where it would be, for
    // a level the view doesn't show) and page; an unrated level gets its mark
    view.linkHtml = function (level) {
      var tier = view.spot(level).tier;
      var u = DL.unratedById(levelIdOf(level));
      var inner =
        "<a" + (u ? ' class="unrated-link" title="' + DL.escapeAttr(DL.unratedTip(u)) + '"' : "") +
        ' href="' + view.url(level) + '">' + DL.escapeHtml(level.name) + "</a>";
      if (tier === "main") return "<b>" + inner + "</b>";
      if (tier === "extended") return "<span>" + inner + "</span>";
      return '<i style="opacity:.5">' + inner + "</i>";
    };
    return view;
  }

  // Current + Rated: today's list as it is, nothing worked out again.
  function defaultView() {
    var rows = DL.sortedDemons().map(function (d) {
      var points = DL.scoreAt100(d);
      return {
        kind: "listed", level: d, id: levelIdOf(d), listed: true, was: d.position,
        position: d.position, tier: DL.tierOf(d.position), points: points, pointsNow: points,
        players: [], manual: false,
      };
    });
    var view = finishView("current", "rated", rows, DL.topRating(), window.DEMONS, DL.recordScore);
    view.players = DL.aggregatePlayers();
    view.players.forEach(function (p) {
      p.scoreNow = p.score;
      p.rankNow = p.rank;
    });
    var nations = null;
    view.nations = function () {
      if (!nations) {
        nations = DL.aggregateNations();
        nations.forEach(function (n) {
          n.scoreNow = n.score;
          n.rankNow = n.rank;
        });
      }
      return nations;
    };
    return view;
  }

  function buildView(time, rating) {
    var cfg = window.SITE, s = cfg.scoring;
    var listed = DL.sortedDemons();
    var onList = {};
    listed.forEach(function (d) {
      onList[levelIdOf(d)] = onList[d.id] = true;
    });
    var unratedAll = DL.unratedLevels();
    // Rated+'s unrated levels (one that's on the list now is just a listed demon)
    var unratedOff = rating !== "plus" ? [] : unratedAll.filter(function (u) { return !onList[u.levelId]; });

    // 1. today's list is the skeleton: its rows never move relative to each other
    var rows = listed.map(function (d) {
      return { kind: "listed", level: d, id: levelIdOf(d), listed: true, was: d.position, players: [], manual: false };
    });

    // 2. the extras: Rated+'s unrated levels someone has beaten; Future's /
    // Future+'s Grind levels, and in Rated+ the unrated levels nobody has
    // beaten yet, which join the same way (from a Grind goal or a record)
    var unratedRows = unratedOff
      .filter(function (u) { return DL.unratedBeaten(u); })
      .map(function (u) {
        return { kind: "unrated", level: u, id: u.levelId, listed: false, was: null, players: [], manual: false };
      });
    var skip = {};
    Object.keys(onList).forEach(function (id) {
      skip[id] = true;
    });
    unratedAll.forEach(function (u) {
      skip[u.levelId] = true;
    });
    var joining = time === "current" ? [] : grindRows(time === "plus", skip).concat(
      openRows(unratedOff.filter(function (u) { return !DL.unratedBeaten(u); }), time === "plus")
    );

    // 3. each extra goes in above the first row it outranks; an unrated level
    // with a hand-picked spot that's valid now goes right below its anchor,
    // where only another extra in that same gap can come between them
    var keyed = [], manual = [];
    unratedRows.concat(joining).forEach(function (r) {
      if (handPicked(r, listed)) {
        r.manual = true;
        manual.push(r);
      } else {
        keyed.push(r);
      }
    });
    keyed.sort(compare).forEach(function (row) {
      rows.splice(placeAt(rows, row), 0, row);
    });
    manual.sort(compare).forEach(function (row) {
      rows.splice(placeAt(rows, row), 0, row);
    });

    // 4. DL.tierOf / DL.topRating / DL.scoreAt100, on this view's order
    var mainSize = cfg.mainListSize;
    if (mainSize === "extremes") {
      mainSize = rows.filter(function (r) { return r.level.difficulty === "Extreme"; }).length;
    }
    var top =
      rows.reduce(function (m, r) {
        var v = DL.demonRating(r.level);
        return v > m ? v : m;
      }, 0) || 1;
    rows.forEach(function (r, i) {
      r.position = i + 1;
      r.tier =
        r.position <= mainSize ? "main"
        : cfg.extendedListSize == null || r.position <= cfg.extendedListSize ? "extended"
        : "legacy";
      r.points = r.tier === "legacy" ? s.legacyScore : s.topScore * Math.pow(s.base, DL.demonRating(r.level) - top);
      r.pointsNow = r.listed ? DL.scoreAt100(r.level) : null;
    });

    // 5. the records that count: the listed demons always, then (Rated+) every
    // unrated level, in data order - so a view without unrated clears sums
    // every score in today's order. A clear counts in full; a run on one nobody
    // has beaten yet counts like a Grind run (DL.inProgressScores in Current,
    // DL.projectedClears in the Future views). Created / published / verified
    // only from the levels on the list for good.
    var recordLevels = window.DEMONS.concat(unratedOff);
    var creditLevels = window.DEMONS.concat(unratedRows.map(function (r) { return r.level; }));
    var view = finishView(time, rating, rows, top, recordLevels, null, creditLevels);
    view.players = DL.aggregatePlayers(view);
    var nations = null;
    view.nations = function () {
      return nations || (nations = DL.aggregateNations(view));
    };
    return view;
  }

  var views = {};
  // The view for this time and rating; anything invalid or switched off falls
  // back to Current / Rated. fresh = build it again (the tests).
  DL.listView = function (time, rating, fresh) {
    var v = DL.normalizeView({ time: time, rating: rating });
    var key = v.time + "|" + v.rating;
    if (fresh === true || !views[key]) {
      views[key] = DL.isDefaultView(v) ? defaultView() : buildView(v.time, v.rating);
    }
    return views[key];
  };

  DL.currentListView = function () {
    var v = DL.currentView();
    return DL.listView(v.time, v.rating);
  };

  // --- the option bar -----------------------------------------------------------

  // #view-options: one group of buttons per option set with a choice in it
  // (Time, Rating). A click remembers the pick and loads the same page with it
  // (player=, nation= and id= stay); a ctrl / shift / middle click just follows
  // the link, which names its view even when that's today's list
  // (time=current), so a new tab never falls back on the last pick. Hidden
  // when the list offers no other view.
  DL.renderViewOptions = function (root) {
    if (!root) return;
    var opts = DL.viewOptions();
    var cur = DL.currentView();
    function target(kind, value) {
      return kind === "time" ? { time: value, rating: cur.rating } : { time: cur.time, rating: value };
    }
    function group(kind, label, values) {
      if (values.length < 2) return "";
      return (
        '<div class="view-group" role="group" aria-label="' + label + '">' +
        values
          .map(function (value) {
            var active = cur[kind] === value;
            return (
              '<a class="button white hover no-shadow' + (active ? " active" : "") + '" data-view-set' +
              ' href="' + DL.escapeAttr(DL.withView(location.href, target(kind, value), true)) + '"' +
              " data-view-" + kind + '="' + value + '"' +
              ' title="' + DL.escapeAttr(VIEW_TIPS[kind][value]) + '"' +
              (active ? ' aria-current="true"' : "") + ">" +
              DL.VIEW_LABELS[kind][value] +
              "</a>"
            );
          })
          .join("") +
        "</div>"
      );
    }
    var html = group("time", "Time", opts.times) + group("rating", "Rating", opts.ratings);
    if (!html) {
      root.innerHTML = "";
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.innerHTML = html;

    var links = Array.prototype.slice.call(root.querySelectorAll("a[data-view-set]"));
    function linkTarget(a) {
      return a.hasAttribute("data-view-time")
        ? target("time", a.getAttribute("data-view-time"))
        : target("rating", a.getAttribute("data-view-rating"));
    }
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        DL.setView(linkTarget(a));
      });
    });
    // the stats viewer changes the address as players are picked: keep the
    // links (for a new tab) pointing at what's on screen
    function refresh() {
      links.forEach(function (a) {
        a.setAttribute("href", DL.withView(location.href, linkTarget(a), true));
      });
    }
    root.addEventListener("mouseover", refresh);
    root.addEventListener("focusin", refresh);
    root.addEventListener("touchstart", refresh, { passive: true });
  };

  // --- the list page ------------------------------------------------------------

  function levelName(r) {
    return DL.escapeHtml(String(r.level.name).trim());
  }

  // "a", "a and b", "a, b and c"
  function listJoin(parts) {
    return parts.length < 2 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  }

  // DL.demonPanelHtml's layout, with the view's position and points, and a
  // note on what's new or moved
  DL.viewPanelHtml = function (r, view) {
    var lv = r.level;
    var points = r.points.toFixed(2) + " points";
    if (r.listed && r.pointsNow.toFixed(2) !== r.points.toFixed(2)) points += " (" + r.pointsNow.toFixed(2) + " now)";
    var recs = r.kind === "grind" ? 0 : (lv.records || []).length;

    var note = "";
    if (r.kind === "grind") {
      // an unrated level nobody has beaten yet also joins from records: those
      // players link to its demon page, where the records are
      var goalOf = function (name) {
        return (window.GOALS || []).some(function (g) { return g.player === name && Number(g.levelId) === r.id; });
      };
      var vw = { time: view.time, rating: view.rating };
      note =
        '<span class="future-badge">New</span>' +
        (r.unrated ? '<span class="future-badge unrated-badge">Unrated</span>' : "") +
        (view.time === "plus" && r.players.every(goalOf) ? "In the Grind: " : "In progress: ") +
        r.players
          .map(function (name) {
            return (
              '<a class="underdotted" href="' +
              (goalOf(name) || !r.unrated
                ? DL.withView("goal.html?level=" + encodeURIComponent(r.id), vw) + "#" + DL.goalAnchor(name)
                : DL.withView("demon.html?id=" + encodeURIComponent(r.id), vw)) +
              '">' + DL.escapeHtml(name) + "</a>"
            );
          })
          .join(", ") +
        (r.unrated
          ? " · not beaten yet, GDDL estimate " + lv.rating.toFixed(2) + (r.manual ? " · placed by the head mods" : "")
          : "");
    } else if (r.kind === "unrated") {
      note =
        '<span class="future-badge unrated-badge">Unrated</span>GDDL estimate ' + lv.rating.toFixed(2) +
        (r.manual ? " · placed by the head mods" : "");
    } else if (r.was !== r.position) {
      note =
        '<i class="fas fa-arrow-' + (r.position > r.was ? "down" : "up") + '"></i> ' +
        Math.abs(r.position - r.was) + " (#" + r.was + " now)";
    }

    var cls = r.kind === "grind" ? " future-joining" + (r.unrated ? " view-unrated" : "") : r.kind === "unrated" ? " view-unrated" : "";
    return (
      '<section class="panel fade flex mobile-col js-scroll-anim' + cls + '" data-anim="fade" style="overflow:hidden">' +
        DL.demonThumbHtml(lv, "demon-panel-thumb") +
        '<div class="flex demon-info" style="align-items:center">' +
          '<div class="demon-byline">' +
            '<h2 style="text-align:left;margin-bottom:0px"><a href="' + view.url(lv) + '">#' + r.position + " – " + levelName(r) + "</a></h2>" +
            '<h3 style="text-align:left">published by ' + (lv.publisher ? DL.creditLink(lv.publisher) : "Unknown") + "</h3>" +
            '<div style="text-align:left;font-size:0.8em">' + points + "</div>" +
            (recs > 1 ? '<div class="demon-panel-records">' + recs + " completions on the list</div>" : "") +
            (note ? '<div class="future-note">' + note + "</div>" : "") +
          "</div>" +
        "</div>" +
      "</section>"
    );
  };

  // The list page's panels. Current + Rated (or no view) is today's overview.
  DL.renderListPage = function (main, view) {
    if (!view || view.isDefault) {
      DL.renderOverviewPanels(main);
      return;
    }
    var cfg = window.SITE, s = cfg.scoring;
    var intro = "";

    // "<b>Name</b> at #n (estimate e)" for an unrated level
    function unratedAt(r) {
      return "<b>" + levelName(r) + "</b> at #" + r.position + " (estimate " + r.level.rating.toFixed(2) + ")";
    }
    if (view.time !== "current") {
      var plus = view.time === "plus";
      var grind = view.joining.filter(function (r) { return !r.unrated; });
      var open = view.joining.filter(function (r) { return r.unrated; });
      if (!view.joining.length) {
        intro += plus
          ? "<p>Nobody has a level in their Grind that isn't on the list yet.</p>"
          : "<p>Nobody has a level In Progress that isn't on the list yet.</p>";
      }
      if (grind.length) {
        intro +=
          "<p>" + (grind.length === 1 ? "One level" : grind.length + " levels") +
          (plus ? " in someone's Grind" : " in someone's In Progress") + " would join the list: " +
          listJoin(grind.map(function (r) { return "<b>" + levelName(r) + "</b> at #" + r.position; })) +
          ".</p>";
      }
      if (open.length) {
        intro +=
          "<p>" + (open.length === 1 ? "One unrated level" : open.length + " unrated levels") +
          " nobody has beaten yet would join" + (grind.length ? " too" : " the list") + ": " +
          listJoin(open.map(unratedAt)) + ".</p>";
      }
    }
    if (view.rating === "plus") {
      if (!view.unrated.length) {
        intro += DL.unratedLevels().some(function (u) { return !DL.demonById(u.levelId); })
          ? "<p>Nobody has beaten an unrated level yet.</p>"
          : "<p>No unrated levels yet: the head mods add them on the mod page.</p>";
      } else {
        intro +=
          "<p>" + (view.unrated.length === 1 ? "One unrated level" : view.unrated.length + " unrated levels") +
          " someone has beaten " + (view.unrated.length === 1 ? "counts" : "count") + " here: " +
          listJoin(view.unrated.map(unratedAt)) + ".</p>";
      }
    }

    var hardest = view.rows.reduce(function (b, r) {
      return !b || DL.demonRating(r.level) > DL.demonRating(b.level) ? r : b;
    }, null);
    var hardestNow = view.rows.reduce(function (b, r) {
      return r.listed && (!b || r.pointsNow > b.pointsNow) ? r : b;
    }, null);
    var rescaled = hardest && !hardest.listed && view.top > view.topNow;
    var sameRanking = view.players.every(function (p) { return p.rank === p.rankNow; });
    var ranking = sameRanking
      ? "The player ranking stays the same."
      : 'The player ranking changes: see it in the <a href="' + DL.withView("statsviewer.html") + '">stats viewer</a>.';
    var rankingSaid = false;
    if (rescaled) {
      intro +=
        "<p><b>" + levelName(hardest) + "</b> is the hardest level in this view, so it's the one worth " +
        s.topScore + " points, and every other level drops to " +
        Math.round(Math.pow(s.base, view.topNow - view.top) * 100) + "% of what it's worth now" +
        (hardestNow
          ? " (" + levelName(hardestNow) + ": " + hardestNow.pointsNow.toFixed(2) + " &rarr; " + hardestNow.points.toFixed(2) + ")"
          : "") +
        ". " + ranking + "</p>";
      rankingSaid = true;
    } else if ((view.joining.length || view.unrated.length) && hardestNow) {
      intro +=
        "<p>None of them is harder than <b>" + levelName(hardestNow) +
        "</b>, so every level on today's list keeps its points." + (sameRanking ? "" : " " + ranking) + "</p>";
      rankingSaid = !sameRanking;
    }
    var share = cfg.inProgressPoints, min = cfg.grindInProgress;
    var runsCount = typeof share === "number" && share > 0 && typeof min === "number";
    // the Future views: what people are working on counts as beaten
    // (DL.projectedClears), in place of today's in-progress points
    if (view.time !== "current" && (view.time === "plus" || typeof min === "number")) {
      intro +=
        "<p>In this view, every level in " + (view.time === "plus" ? "someone's Grind" : "someone's In Progress") +
        " counts as beaten for them, with its full points (shown with the % they have now)." +
        (rankingSaid || sameRanking ? "" : " " + ranking) + "</p>";
      rankingSaid = true;
    } else if (view.time !== "current") {
      intro += "<p>Nothing from the Grind counts until it's beaten.</p>";
    }
    if (view.rating === "plus") {
      intro +=
        view.time === "future"
          ? "<p>Unrated levels count only in the Rated+ views. One goes on the list once someone beats it, and until " +
            "then it joins here when someone has it In Progress.</p>"
          : view.time === "plus"
          ? "<p>Unrated levels count only in the Rated+ views. One goes on the list once someone beats it, and until " +
            "then it joins here when someone has it in their Grind or a record on it.</p>"
          : runsCount
          ? "<p>Unrated levels count only in the Rated+ views. One goes on the list once someone beats it, and until " +
            "then a run on it longer than " + min + "% still counts.</p>"
          : "<p>Unrated levels count only in the Rated+ views, and one goes on the list once someone beats it.</p>";
    }
    // (a run on an unrated level nobody has beaten can move the ranking in
    // Current + Rated+ with nothing new on the list)
    if (!rankingSaid && !sameRanking) intro += "<p>" + ranking + "</p>";

    var cutoff = cfg.extendedListSize || Infinity; // no Legacy tier -> every level gets a panel
    var rows = view.rows.filter(function (r) { return r.position <= cutoff; });
    main.innerHTML =
      '<section class="panel fade js-scroll-anim" data-anim="fade" id="view-intro">' +
        '<div class="underlined"><h2>' + DL.escapeHtml(view.title) + "</h2></div>" + intro +
      "</section>" +
      (rows.length
        ? rows.map(function (r) { return DL.viewPanelHtml(r, view); }).join("")
        : '<section class="panel fade"><p>No demons on the list yet.</p></section>');
  };
})(window.DL || (window.DL = {}));

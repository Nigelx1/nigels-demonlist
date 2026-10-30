"use strict";
// -----------------------------------------------------------------------------
// The Future List (SITE.futureList - Dihmaster500's idea): the list as it would
// be with every level in someone's In Progress on it. A Grind goal with a run
// longer than SITE.grindInProgress (DL.grindInProgressRun) brings its level
// here when it isn't on the list yet. It goes where tools/refresh-order.py
// would put it - extremes above insanes when the Main List is "extremes", then
// DL.demonRating (an extreme's AREDL placement), then AREDL placement - and
// every level's points are worked out again, since the hardest level on the
// list is the one worth topScore. Display only: nothing here counts for anyone.
//
// Depends on data/config.js, data/demons.js, data/goals.js, data/goal-levels.js
// (aredlPosition comes from tools/build-goal-levels.py / refresh-order.py),
// static/js/list-utils.js, static/js/demonlist.js and static/js/goals.js.
// Rendered by demonlist/future.html.
// -----------------------------------------------------------------------------

(function (DL) {
  // tools/refresh-order.py's sort key, field for field
  function sortKey(d) {
    var rank = { Extreme: 0, Insane: 1 };
    return [
      window.SITE.mainListSize === "extremes" ? (d.difficulty in rank ? rank[d.difficulty] : 2) : 0,
      -Math.round(DL.demonRating(d) * 100) / 100,
      typeof d.aredlPosition === "number" && d.aredlPosition ? d.aredlPosition : 1e9,
      typeof d.position === "number" ? d.position : Infinity, // a joining level goes below a listed tie
    ];
  }
  function compare(a, b) {
    var x = sortKey(a), y = sortKey(b);
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }

  // could the level be on the list at all? (tools/add-records.py's guard: an
  // allowed difficulty, a demon in game, never a platformer)
  function eligible(lv) {
    var cfg = window.SITE;
    var allowed = cfg.allowedDifficulties || (cfg.extremesOnly ? ["Extreme"] : null);
    if (allowed && allowed.indexOf(lv.difficulty) < 0) return false;
    var gd = lv.gd || {};
    if (gd.inGameDifficulty && !/ Demon$/.test(gd.inGameDifficulty)) return false; // a 9-star "Insane" isn't a demon
    return !/^plat/i.test(gd.length || "");
  }

  // { rows, joining, top, topNow, players }. rows: the Future List in order,
  // each { level, id, listed, was (position now, null if joining), position,
  // tier, points (100% on the Future List), pointsNow, players (joining: who
  // has it In Progress) }. players: the ranking with the Future List's points.
  // everyGoal = Future+ (SITE.futurePlus, Nigel and Dihmaster500, 2026-10-30):
  // every level in anyone's Grind joins, at any progress, not just In Progress.
  DL.futureList = function (everyGoal) {
    var cfg = window.SITE;
    var s = cfg.scoring;
    var current = DL.sortedDemons();
    var onList = {};
    current.forEach(function (d) {
      onList[d.levelId] = onList[d.id] = true;
    });

    var joining = {}, ids = [];
    (window.GOALS || []).forEach(function (g) {
      var id = Number(g.levelId);
      if (onList[id] || !(everyGoal || DL.grindInProgressRun(g))) return;
      var lv = DL.goalLevel(id);
      if (!lv || !eligible(lv)) return;
      if (!joining[id]) {
        joining[id] = { level: lv, id: id, listed: false, was: null, players: [] };
        ids.push(id);
      }
      if (joining[id].players.indexOf(g.player) < 0) joining[id].players.push(g.player);
    });

    var rows = current.map(function (d) {
      return { level: d, id: d.id, listed: true, was: d.position, players: [] };
    });
    // slot each one in above the first level it outranks; the listed order
    // itself never changes
    ids
      .map(function (id) { return joining[id]; })
      .sort(function (a, b) { return compare(a.level, b.level); })
      .forEach(function (row) {
        var at = rows.findIndex(function (r) { return compare(row.level, r.level) < 0; });
        rows.splice(at < 0 ? rows.length : at, 0, row);
      });

    // DL.tierOf / DL.topRating / DL.scoreAt100, on the Future List's order
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

    // DL.recordScore with the Future List's points: the same records, re-valued
    var byId = {};
    rows.forEach(function (r) {
      if (r.listed) byId[r.id] = r;
    });
    function recordScore(demon, progress) {
      var r = byId[demon.id];
      if (r.tier === "legacy") return progress >= 100 ? s.legacyScore : 0;
      var req = demon.requirementPercent || 100;
      if (progress < req) return 0;
      if (progress >= 100) return r.points;
      var floor = r.points * s.requirementScoreFraction;
      return floor + ((progress - req) / (100 - req || 1)) * (r.points - floor);
    }
    var players = DL.aggregatePlayers().map(function (p) {
      var score = p.completed.concat(p.progressed).reduce(function (n, x) {
        return n + recordScore(x.demon, x.progress);
      }, 0);
      return { name: p.name, nationality: p.nationality, score: score, scoreNow: p.score, rankNow: p.rank };
    });
    // a float-sized difference is a tie, so a tie keeps today's order
    players.sort(function (a, b) {
      return Math.abs(b.score - a.score) < 1e-9 ? 0 : b.score - a.score;
    });
    players.forEach(function (p, i) {
      p.rank = i + 1;
    });

    return {
      rows: rows,
      joining: rows.filter(function (r) { return !r.listed; }),
      top: top,
      topNow: DL.topRating(),
      players: players,
    };
  };

  function levelHref(r) {
    return r.listed ? DL.demonUrl(r.id) : "goal.html?level=" + encodeURIComponent(r.id);
  }

  function levelName(r) {
    return DL.escapeHtml(String(r.level.name).trim());
  }

  // "a", "a and b", "a, b and c"
  function listJoin(parts) {
    return parts.length < 2 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  }

  // DL.demonPanelHtml's layout, with the Future List's position and points
  function panelHtml(r, everyGoal) {
    var lv = r.level;
    var points = r.points.toFixed(2) + " points";
    if (r.listed && r.pointsNow.toFixed(2) !== r.points.toFixed(2)) points += " (" + r.pointsNow.toFixed(2) + " now)";

    var note = "";
    if (!r.listed) {
      note =
        '<span class="future-badge">New</span>' + (everyGoal ? "In the Grind: " : "In progress: ") +
        r.players
          .map(function (name) {
            return (
              '<a class="underdotted" href="goal.html?level=' + encodeURIComponent(r.id) + "#" + DL.goalAnchor(name) + '">' +
              DL.escapeHtml(name) + "</a>"
            );
          })
          .join(", ");
    } else if (r.was !== r.position) {
      note =
        '<i class="fas fa-arrow-' + (r.position > r.was ? "down" : "up") + '"></i> ' +
        Math.abs(r.position - r.was) + " (#" + r.was + " now)";
    }

    return (
      '<section class="panel fade flex mobile-col js-scroll-anim' + (r.listed ? "" : " future-joining") +
        '" data-anim="fade" style="overflow:hidden">' +
        DL.demonThumbHtml(lv, "demon-panel-thumb") +
        '<div class="flex demon-info" style="align-items:center">' +
          '<div class="demon-byline">' +
            '<h2 style="text-align:left;margin-bottom:0px"><a href="' + levelHref(r) + '">#' + r.position + " – " + levelName(r) + "</a></h2>" +
            '<h3 style="text-align:left">published by ' + (lv.publisher ? DL.creditLink(lv.publisher) : "Unknown") + "</h3>" +
            '<div style="text-align:left;font-size:0.8em">' + points + "</div>" +
            (note ? '<div class="future-note">' + note + "</div>" : "") +
          "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function sidebarPanel(id, heading, body) {
    return (
      '<section class="panel fade js-scroll-anim" data-anim="fade" id="' + id + '">' +
        '<div class="underlined"><h2>' + heading + "</h2></div>" +
        body +
      "</section>"
    );
  }

  // everyGoal: render Future+ instead of the Future List (future.html?plus).
  DL.renderFuturePage = function (main, aside, everyGoal) {
    var cfg = window.SITE;
    var f = DL.futureList(everyGoal);
    var title = everyGoal ? "Future+" : "Future List";
    var where = everyGoal ? "in someone's Grind" : "in someone's In Progress";
    var hardest = f.rows.reduce(function (b, r) {
      return !b || DL.demonRating(r.level) > DL.demonRating(b.level) ? r : b;
    }, null);
    var hardestNow = f.rows.reduce(function (b, r) {
      return r.listed && (!b || r.pointsNow > b.pointsNow) ? r : b;
    }, null);
    var rescaled = hardest && !hardest.listed && f.top > f.topNow;

    var intro;
    if (!f.joining.length) {
      intro = everyGoal
        ? "<p>Nobody has a level in their Grind that isn't on the list yet, so for now this is the list as it is.</p>"
        : "<p>Nobody has a level In Progress that isn't on the list yet, so for now this is the list as it is.</p>";
    } else {
      intro =
        "<p>" + (f.joining.length === 1 ? "One level" : f.joining.length + " levels") +
        " " + where + " would join the list: " +
        listJoin(f.joining.map(function (r) { return "<b>" + levelName(r) + "</b> at #" + r.position; })) + ".</p>";
      if (rescaled) {
        var share = Math.pow(cfg.scoring.base, f.topNow - f.top);
        var sameRanking = f.players.every(function (p) { return p.rank === p.rankNow; });
        intro +=
          "<p><b>" + levelName(hardest) + "</b> would be the hardest level on the list, so it would be the one worth " +
          cfg.scoring.topScore + " points, and every other level drops to " + Math.round(share * 100) +
          "% of what it's worth now" +
          (hardestNow
            ? " (" + levelName(hardestNow) + ": " + hardestNow.pointsNow.toFixed(2) + " &rarr; " + hardestNow.points.toFixed(2) + ")"
            : "") +
          ". Everyone's score drops by the same share" + (sameRanking ? ", so the player ranking stays the same." : ".") +
          "</p>";
      } else if (hardestNow) {
        intro +=
          "<p>None of them is harder than <b>" + levelName(hardestNow) +
          "</b>, so every level already on the list keeps its points.</p>";
      }
    }
    intro += "<p>Nothing here counts until it's beaten.</p>";

    main.innerHTML =
      '<section class="panel fade js-scroll-anim" data-anim="fade" id="future-intro">' +
        '<div class="underlined"><h2>' + title + "</h2></div>" + intro +
      "</section>" +
      (f.rows.length
        ? f.rows.map(function (r) { return panelHtml(r, everyGoal); }).join("")
        : '<section class="panel fade"><p>No demons on the list yet.</p></section>');

    var html = "";
    if (rescaled) {
      var ranked = f.players.filter(function (p) { return p.score > 0 || p.scoreNow > 0; });
      html += sidebarPanel(
        "future-players",
        "Future Points",
        "<p>Everyone's score with the " + title + "'s points (today's in parentheses).</p>" +
          '<ol class="mini-ranking">' +
          ranked
            .map(function (p) {
              return (
                "<li>" + (p.nationality ? DL.flagSpan(p.nationality) : "") +
                '<a class="underdotted" href="' + DL.playerUrl(p.name) + '">' + DL.escapeHtml(p.name) + "</a>" +
                "<span>" + p.score.toFixed(0) + " (" + p.scoreNow.toFixed(0) + ")</span></li>"
              );
            })
            .join("") +
          "</ol>"
      );
    }
    html += sidebarPanel(
      "future-rules",
      "How it works",
      (everyGoal
        ? "<p>Every level in anyone's Grind is here, whatever their progress. The Future List keeps just the ones In Progress.</p>"
        : "<p>A level is In Progress when someone's Grind has a run of it longer than " + cfg.grindInProgress +
          "% (from the start, or a practice run like 42&ndash;100)." +
          (cfg.futurePlus ? " Future+ has every Grind level." : "") + "</p>") +
        "<p>Each one goes where the list would put it, ranked the same way as everything else, and every " +
        "level's points are worked out again from the new order.</p>" +
        '<a class="blue hover button" href="index.html">Back to the Demonlist</a>'
    );
    aside.innerHTML = html;
  };
})(window.DL);

"use strict";
// -----------------------------------------------------------------------------
// "The Grind" - levels players are trying to beat. Depends on data/config.js,
// data/demons.js, data/goals.js, data/goal-levels.js and static/js/list-utils.js
// (and, for the video poster helper, static/js/demonlist.js). Classic script.
//
//  - DL.goalLevel(levelId)      -> level record: the listed demon if it's on the
//                                  list, else the data/goal-levels.js entry.
//  - DL.goalsForPlayer(name)    -> that player's goals (data/goals.js order).
//  - DL.goalsForLevel(levelId)  -> every goal on one level, best-progress first.
//  - DL.renderGrindChips(name)  -> HTML for the stats-viewer "The Grind" row.
//  - DL.renderGoalPage(root, levelId) -> the themed goal.html body.
// -----------------------------------------------------------------------------

(function (DL) {
  var FALLBACK_PALETTE = {
    accent: "#0881c6",
    deep: "#0c2c3d",
    wash: "#f2f8fb",
    mist: "#e4eef4",
    onAccent: "#ffffff",
    ink: "#123243",
  };

  DL.goalLevel = function (levelId) {
    levelId = Number(levelId);
    var listed = (window.DEMONS || []).find(function (d) {
      return d.levelId === levelId || d.id === levelId;
    });
    if (listed) return listed;
    var g = (window.GOAL_LEVELS || {})[String(levelId)];
    return g || null;
  };

  DL.goalPalette = function (levelId) {
    var lv = DL.goalLevel(levelId);
    return (lv && lv.palette) || FALLBACK_PALETTE;
  };

  DL.goalsForPlayer = function (name) {
    return (window.GOALS || []).filter(function (g) {
      return g.player === name;
    });
  };

  DL.goalsForLevel = function (levelId) {
    levelId = Number(levelId);
    return (window.GOALS || [])
      .filter(function (g) {
        return Number(g.levelId) === levelId;
      })
      .sort(function (a, b) {
        return (b.best == null ? -1 : b.best) - (a.best == null ? -1 : a.best);
      });
  };

  // rough "how close" 0-100 for ordering / the chip label
  function reach(goal) {
    var best = goal.best == null ? 0 : goal.best;
    var seg = 0;
    (goal.segments || []).forEach(function (s) {
      seg = Math.max(seg, s[1]);
    });
    return Math.max(best, seg >= 100 ? 90 : seg * 0.6);
  }

  // chip label for a goal tracked only as practice runs: the fewest runs that
  // chain to the end ("in 3 parts" - overlapping runs chain, you just switch
  // start pos inside the overlap), or the longest run if they never reach 100%
  function runsLabel(segments) {
    var s = segments.slice().sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var reach = s[0][1], parts = 1, i = 1;
    while (reach < 100) {
      var next = reach;
      while (i < s.length && s[i][0] <= reach + 1) next = Math.max(next, s[i++][1]);
      if (next === reach) break; // a gap - they don't chain to the end
      reach = next;
      parts++;
    }
    if (reach >= 100) return "in " + parts + " part" + (parts === 1 ? "" : "s");
    var longest = s.reduce(function (b, x) { return x[1] - x[0] > b[1] - b[0] ? x : b; });
    return longest[0] + "–" + longest[1] + "%";
  }

  DL.goalAnchor = function (name) {
    return "grind-" + encodeURIComponent(name).replace(/%/g, "");
  };

  // "The Grind" chips for the stats-viewer player panel.
  DL.renderGrindChips = function (name) {
    var goals = DL.goalsForPlayer(name);
    if (!goals.length) return "";
    return goals
      .map(function (g) {
        var lv = DL.goalLevel(g.levelId);
        var label = DL.escapeHtml(lv ? lv.name : "Level " + g.levelId);
        var pct =
          g.best != null
            ? g.best + "%"
            : g.segments && g.segments.length
            ? runsLabel(g.segments)
            : "not started";
        return (
          '<a class="grind-chip" href="goal.html?level=' +
          encodeURIComponent(g.levelId) +
          "#" +
          DL.goalAnchor(name) +
          '">' +
          '<span class="grind-chip-name">' + label + "</span>" +
          '<span class="grind-chip-pct">' + pct + "</span>" +
          "</a>"
        );
      })
      .join("");
  };

  // 0-100 track: solid fill to `best`, translucent bands for each segment.
  function progressTrackHtml(goal) {
    var bands = (goal.segments || [])
      .map(function (s) {
        var from = Math.max(0, Math.min(100, s[0]));
        var to = Math.max(from, Math.min(100, s[1]));
        return (
          '<span class="grind-band" style="left:' + from + "%;width:" + (to - from) + '%" ' +
          'title="' + from + "–" + to + '%"></span>'
        );
      })
      .join("");
    var fill = goal.best != null ? Math.max(0, Math.min(100, goal.best)) : 0;
    var marker =
      goal.best != null
        ? '<span class="grind-fill" style="width:' + fill + '%"></span>' +
          '<span class="grind-tick" style="left:' + fill + '%"><b>' + goal.best + "%</b></span>"
        : "";
    return (
      '<div class="grind-track" role="img" aria-label="Progress: ' +
      (goal.best != null ? goal.best + "%" : "segments only") +
      '">' + bands + marker + "</div>"
    );
  }

  function milestonesHtml(goal) {
    if (!goal.milestones || !goal.milestones.length) return "";
    var rows = goal.milestones
      .slice()
      .sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date));
      })
      .map(function (m) {
        return (
          "<li><span>" + DL.escapeHtml(DL.formatDate ? DL.formatDate(m.date) : m.date) + "</span>" +
          "<b>" + m.percent + "%</b>" +
          (m.note ? "<i>" + DL.escapeHtml(m.note) + "</i>" : "") +
          "</li>"
        );
      })
      .join("");
    return '<ol class="grind-log">' + rows + "</ol>";
  }

  function playerCardHtml(goal) {
    var name = goal.player;
    var flag = "";
    var rec = null;
    (window.DEMONS || []).some(function (d) {
      return (d.records || []).some(function (r) {
        if (r.player === name && r.nationality) {
          rec = r;
          return true;
        }
        return false;
      });
    });
    if (rec) flag = DL.flagSpan(rec.nationality);

    var stat =
      goal.best != null
        ? '<span class="grind-big">' + goal.best + '<i>%</i></span>'
        : '<span class="grind-big grind-big-sm">segments<i></i></span>';

    var facts = [];
    if (goal.attempts != null) facts.push("<span><b>" + goal.attempts.toLocaleString() + "</b> attempts</span>");
    if (goal.segments && goal.segments.length) {
      facts.push(
        "<span>can run " +
          goal.segments
            .map(function (s) {
              return s[0] + "–" + s[1] + "%";
            })
            .join(", ") +
          "</span>"
      );
    }

    return (
      '<article class="grind-card" id="' + DL.goalAnchor(name) + '">' +
        '<header class="grind-card-head">' +
          "<h3>" + flag + '<a href="' + DL.playerUrl(name) + '">' + DL.escapeHtml(name) + "</a></h3>" +
          stat +
        "</header>" +
        progressTrackHtml(goal) +
        (goal.note ? '<p class="grind-note">' + DL.escapeHtml(goal.note) + "</p>" : "") +
        (goal.blurb ? '<p class="grind-blurb">“' + DL.escapeHtml(goal.blurb) + "”</p>" : "") +
        (facts.length ? '<p class="grind-facts">' + facts.join("") + "</p>" : "") +
        milestonesHtml(goal) +
      "</article>"
    );
  }

  DL.renderGoalPage = function (root, levelId) {
    var lv = DL.goalLevel(levelId);
    var goals = DL.goalsForLevel(levelId);

    if (!lv) {
      root.innerHTML =
        '<section class="panel fade"><h2>Unknown level</h2>' +
        "<p>No level <code>" + DL.escapeHtml(String(levelId)) + "</code> in data/goal-levels.js or data/demons.js.</p>" +
        '<a class="blue hover button" href="statsviewer.html">Back to the stats viewer</a></section>';
      return;
    }

    var pal = lv.palette || FALLBACK_PALETTE;
    var onList = (window.DEMONS || []).some(function (d) {
      return d.levelId === Number(levelId) || d.id === Number(levelId);
    });
    document.title = "The Grind: " + lv.name + " · " + window.SITE.name;

    // theme vars on the page wrapper, and fill the whole page with the wash
    // tint so there's no untinted gap below the content
    ["--accent", "--deep", "--wash", "--mist", "--on-accent", "--ink"].forEach(function (v, i) {
      root.style.setProperty(v, [pal.accent, pal.deep, pal.wash, pal.mist, pal.onAccent, pal.ink][i]);
    });
    document.body.style.background = pal.wash;

    var diffLabel = DL.difficultyLabel(lv.difficulty || "Extreme");
    var ratingBadge =
      typeof lv.rating === "number"
        ? '<span class="goal-badge">GDDL ' + lv.rating.toFixed(2) + "</span>"
        : "";

    var hero =
      '<header class="goal-hero"' +
      (lv.thumbnailUrl ? ' style="background-image:url(' + DL.escapeHtml(lv.thumbnailUrl) + ')"' : "") +
      ">" +
        '<div class="goal-hero-inner">' +
          '<p class="goal-kicker">The Grind</p>' +
          "<h1>" + DL.escapeHtml(lv.name) + "</h1>" +
          '<p class="goal-sub">' +
            '<span class="goal-badge">' + DL.escapeHtml(diffLabel) + "</span>" +
            ratingBadge +
            (lv.publisher ? "<span>by " + DL.escapeHtml(lv.publisher) + "</span>" : "") +
            (onList
              ? ' <a class="goal-listed" href="' + DL.demonUrl(lv.id) + '">on the list &#8594;</a>'
              : "") +
          "</p>" +
        "</div>" +
      "</header>";

    // video: embed on a hosted page (like the demon page), poster on file://
    var video = "";
    if (lv.videoUrl) {
      var embed = DL.embedVideo(lv.videoUrl);
      if (embed && embed.url && location.protocol !== "file:") {
        video =
          '<iframe class="ratio-16-9 goal-video" allowfullscreen style="width:100%"' +
          ' src="' + DL.escapeHtml(embed.url) + '" title="Showcase video">Showcase video</iframe>';
      } else if (embed && embed.url) {
        video =
          '<div class="goal-video js-demon-video"' +
          (lv.thumbnailUrl ? ' style="background-image:url(' + DL.escapeHtml(lv.thumbnailUrl) + ')"' : "") +
          ' role="button" tabindex="0" aria-label="Play showcase video"' +
          ' data-embed="' + DL.escapeHtml(embed.url) + '" data-watch="' + DL.escapeHtml(lv.videoUrl) + '">' +
          '<span class="demon-video-play"></span></div>' +
          '<p class="demon-video-link"><a class="link" href="' + DL.escapeHtml(lv.videoUrl) +
          '" target="_blank" rel="noopener">Watch on YouTube</a></p>';
      }
    }

    var gd = lv.gd || {};
    var info = [];
    if (lv.levelId) info.push("<span><b>Level ID</b><br>" + DL.escapeHtml(lv.levelId) + "</span>");
    if (gd.length) info.push("<span><b>Level Length</b><br>" + DL.escapeHtml(gd.length) + "</span>");
    if (gd.objects) info.push("<span><b>Object Count</b><br>" + (gd.objects >= 65535 ? "65535+" : gd.objects) + "</span>");
    info.push("<span><b>In-Game Difficulty</b><br>" + DL.escapeHtml(gd.inGameDifficulty || diffLabel) + "</span>");
    if (gd.gameVersion) info.push("<span><b>Created In</b><br>" + DL.escapeHtml(gd.gameVersion) + "</span>");
    if (gd.song && /^\d+$/.test(String(gd.song.id))) {
      var s = gd.song;
      var href = s.link && s.link !== "-" ? s.link : "https://www.newgrounds.com/audio/listen/" + encodeURIComponent(s.id);
      info.push(
        '<span style="width:100%"><b>Newgrounds Song</b><br><a class="link" href="' +
          DL.escapeHtml(href) + '" target="_blank" rel="noopener">' +
          DL.escapeHtml(s.name + (s.artist ? " by " + s.artist : "") + " (ID " + s.id + ")") +
          "</a></span>"
      );
    }

    var about =
      '<section class="panel fade goal-about">' +
        video +
        (lv.writeup && lv.writeup.text
          ? '<div class="goal-writeup"><p>' + DL.escapeHtml(lv.writeup.text) + "</p>" +
            (lv.writeup.source
              ? '<p class="goal-writeup-cite">via ' +
                (lv.writeup.url
                  ? '<a class="link" href="' + DL.escapeHtml(lv.writeup.url) + '" target="_blank" rel="noopener">' +
                    DL.escapeHtml(lv.writeup.source) + "</a>"
                  : DL.escapeHtml(lv.writeup.source)) +
                "</p>"
              : "") +
            "</div>"
          : "") +
        (lv.description
          ? '<p class="goal-ingame"><span>In-game description</span><q>' + DL.escapeHtml(lv.description) + "</q></p>"
          : "") +
        '<div class="underlined pad flex wrap" id="level-info">' + info.join("") + "</div>" +
      "</section>";

    var grind =
      '<section class="panel fade goal-grind">' +
        '<div class="underlined pad"><h2>Who’s grinding it</h2>' +
          "<h3>" +
          (goals.length === 1
            ? "1 player has this as a goal"
            : goals.length + " players have this as a goal") +
          "</h3>" +
        "</div>" +
        (goals.length
          ? '<div class="grind-cards">' + goals.map(playerCardHtml).join("") + "</div>"
          : "<p>Nobody has this set as a goal right now.</p>") +
      "</section>";

    var backLink =
      '<p class="goal-back"><a class="link" href="statsviewer.html">&#8592; Stats Viewer</a></p>';

    root.innerHTML = hero + '<div class="goal-body">' + about + grind + backLink + "</div>";

    // wire the file:// video poster (same behaviour as the demon page)
    var videoEl = root.querySelector(".js-demon-video");
    if (videoEl) {
      var play = function () {
        if (location.protocol === "file:") {
          window.open(videoEl.dataset.watch, "_blank", "noopener");
          return;
        }
        var f = document.createElement("iframe");
        f.className = "ratio-16-9 goal-video";
        f.setAttribute("allowfullscreen", "");
        f.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
        f.src = videoEl.dataset.embed + (videoEl.dataset.embed.indexOf("?") === -1 ? "?" : "&") + "autoplay=1";
        videoEl.replaceWith(f);
      };
      videoEl.addEventListener("click", play);
      videoEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          play();
        }
      });
    }

    // deep-link scroll to a player's card
    if (location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView();
        target.classList.add("grind-card-focus");
      }
    }
  };
})(window.DL || (window.DL = {}));

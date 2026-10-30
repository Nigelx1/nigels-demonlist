"use strict";
// -----------------------------------------------------------------------------
// Rendering for the Demonlist overview page and the individual demon page.
// Depends on data/config.js, data/demons.js and static/js/list-utils.js being
// loaded first. Classic script, no bundler - call the render functions inline
// from the page's own <script> block once the target elements exist in the
// DOM (see demonlist/index.html and demonlist/demon.html).
// -----------------------------------------------------------------------------

(function (DL) {
  // "2026-09-01" -> "September 1, 2026" (falls back to the raw string).
  DL.formatDate = function (iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  // One <li> for a data/changelog.js item. `demonBase` is prepended to demon
  // links (e.g. "../demonlist/" from the /changelog/ page).
  function changelogItemHtml(item, demonBase) {
    var name = item.demon
      ? item.demonId && DL.demonById(item.demonId)
        ? '<a href="' + demonBase + DL.demonUrl(item.demonId) + '">' + DL.escapeHtml(item.demon) + "</a>"
        : "<b>" + DL.escapeHtml(item.demon) + "</b>"
      : "";
    var kind = item.kind || "note";
    var body;
    // the badge already says Added / Moved / Removed, so the body doesn't repeat it
    if (kind === "add") body = name + (item.at != null ? " at #" + item.at : "");
    else if (kind === "move") body = name + " from #" + item.from + " to #" + item.to;
    else if (kind === "remove") body = name + (item.from != null ? " (was #" + item.from + ")" : "");
    else body = "";
    if (item.text) body += (body ? " &mdash; " : "") + DL.escapeHtml(item.text);
    var labels = { add: "Added", move: "Moved", remove: "Removed", note: "Note" };
    return (
      '<li class="changelog-item changelog-' + kind + '">' +
        '<span class="changelog-badge">' + labels[kind] + "</span>" +
        "<span>" + body + "</span>" +
      "</li>"
    );
  }

  // Full changelog, one panel per dated entry. `demonBase` as above.
  DL.renderChangelog = function (root, demonBase) {
    demonBase = demonBase || "";
    var log = window.CHANGELOG || [];
    if (!log.length) {
      root.innerHTML = '<section class="panel fade"><p>Nothing logged yet.</p></section>';
      return;
    }
    root.innerHTML = log
      .map(function (entry) {
        return (
          '<section class="panel fade js-scroll-anim" data-anim="fade">' +
            '<div class="underlined"><h2>' + DL.escapeHtml(DL.formatDate(entry.date)) + "</h2></div>" +
            '<ul class="changelog-list">' +
              (entry.items || []).map(function (it) { return changelogItemHtml(it, demonBase); }).join("") +
            "</ul>" +
          "</section>"
        );
      })
      .join("");
  };

  DL._changelogItemHtml = changelogItemHtml;

  // A list view (static/js/views.js) other than Current + Rated, else null:
  // every renderer below runs today's code when it gets null.
  function otherView(view) {
    return view && typeof view === "object" && !view.isDefault ? view : null;
  }

  // The Main/Extended/Legacy dropdown tab bar (nav#lists), reused on both the
  // overview page and the demon detail page. `currentDemon` (optional) gets
  // the `.active` class in whichever dropdown it belongs to. `view` (optional,
  // static/js/views.js): list that view's levels instead, in its order - an
  // unrated level or one joining from the Grind gets a marker on its item.
  DL.renderListNav = function (root, currentDemon, view) {
    var V = otherView(view);
    var all = DL.sortedDemons();
    var main = all.filter(function (d) { return DL.tierOf(d.position) === "main"; });
    var extended = all.filter(function (d) { return DL.tierOf(d.position) === "extended"; });
    var legacy = all.filter(function (d) { return DL.tierOf(d.position) === "legacy"; });
    if (V) {
      main = V.rows.filter(function (r) { return r.tier === "main"; });
      extended = V.rows.filter(function (r) { return r.tier === "extended"; });
      legacy = V.rows.filter(function (r) { return r.tier === "legacy"; });
    }
    var currentId = currentDemon ? Number(currentDemon.levelId || currentDemon.id) : null;

    // one view row's item: the same markup as a demon's below
    function rowItem(r, numbered) {
      var lv = r.level;
      var extra = r.kind === "grind" ? " view-new-item" : r.kind === "unrated" ? " view-unrated-item" : "";
      var active = currentDemon && r.id === currentId ? " active" : "";
      var display = numbered ? "#" + r.position + " - " + DL.escapeHtml(lv.name) : DL.escapeHtml(lv.name);
      return (
        '<li class="hover white' + extra + active + '" title="#' + r.position + " - " + DL.escapeAttr(lv.name) + '">' +
          '<a href="' + V.url(lv) + '">' + display + "<br><i>" + DL.escapeHtml(lv.publisher) + "</i></a>" +
        "</li>"
      );
    }

    function group(id, label, demons, numbered, description) {
      var items = demons.map(function (d) {
        if (V) return rowItem(d, numbered);
        var active = currentDemon && currentDemon.id === d.id ? " active" : "";
        var display = numbered
          ? "#" + d.position + " - " + DL.escapeHtml(d.name)
          : DL.escapeHtml(d.name);
        return (
          '<li class="hover white' + active + '" title="#' + d.position + " - " + DL.escapeHtml(d.name) + '">' +
            '<a href="' + DL.demonUrl(d.id) + '">' + display + "<br><i>" + DL.escapeHtml(d.publisher) + "</i></a>" +
          "</li>"
        );
      });
      if (!items.length) items.push('<li class="hover white" style="cursor:default"><i>Nothing here yet</i></li>');

      return (
        "<div>" +
          '<div class="button white hover no-shadow js-toggle" data-toggle-group="0" onclick="DropDown.toggleDropDown(\'' + id + "')\">" + label + "</div>" +
          '<div class="see-through fade dropdown" id="' + id + '">' +
            '<div class="search js-search" style="margin:10px"><input placeholder="Filter..." type="text"></div>' +
            '<p style="margin:10px">' + description + "</p>" +
            '<ul class="flex wrap space">' + items.join("") + "</ul>" +
          "</div>" +
        "</div>"
      );
    }

    // Each list says what its sections are in config.js (listBlurbs).
    var blurbs = (window.SITE && window.SITE.listBlurbs) || {};
    root.innerHTML =
      group("mainlist", "Main List", main, true, blurbs.main || "The main section of the Demonlist.") +
      group("extended", "Extended List", extended, true,
        blurbs.extended || "Official extensions of the Main List. Only 100% completions count.") +
      (legacy.length ? group("legacy", "Legacy List", legacy, false, "Demons that have fallen off the list.") : "");
  };

  DL.demonPanelHtml = function (demon) {
    var req = demon.requirementPercent || 100;
    var fullScore = DL.scoreAt100(demon);
    var scoreText =
      req >= 100
        ? fullScore.toFixed(2) + " points"
        : DL.recordScore(demon, req).toFixed(2) +
          " (" + req + "%) &mdash; " + fullScore.toFixed(2) + " (100%) points";

    var recs = (demon.records || []).length;
    var recLine =
      recs > 1 ? '<div class="demon-panel-records">' + recs + " completions on the list</div>" : "";

    return (
      '<section class="panel fade flex mobile-col js-scroll-anim" data-anim="fade" style="overflow:hidden">' +
        DL.demonThumbHtml(demon, "demon-panel-thumb") +
        '<div class="flex demon-info" style="align-items:center">' +
          '<div class="demon-byline">' +
            '<h2 style="text-align:left;margin-bottom:0px"><a href="' + DL.demonUrl(demon.id) + '">#' + demon.position + " – " + DL.escapeHtml(demon.name) + "</a></h2>" +
            '<h3 style="text-align:left">published by ' + DL.creditLink(demon.publisher) + "</h3>" +
            '<div style="text-align:left;font-size:0.8em">' + scoreText + "</div>" +
            recLine +
          "</div>" +
        "</div>" +
      "</section>"
    );
  };

  DL.renderOverviewPanels = function (root) {
    var cutoff = window.SITE.extendedListSize || Infinity; // no Legacy tier -> every demon gets a panel
    var demons = DL.sortedDemons().filter(function (d) { return d.position <= cutoff; });
    if (!demons.length) {
      root.innerHTML = '<section class="panel fade"><p>No demons on the list yet.</p></section>';
      return;
    }
    root.innerHTML = demons.map(DL.demonPanelHtml).join("");
  };

  function sidebarPanel(id, heading, body) {
    return (
      '<section class="panel fade js-scroll-anim" data-anim="fade" id="' + id + '">' +
        '<div class="underlined"><h2>' + heading + "</h2></div>" +
        body +
      "</section>"
    );
  }

  // `view` (optional, static/js/views.js): Statistics and Top Players come
  // from that view, and its rules replace the List Views panel.
  DL.renderSidebar = function (root, view) {
    var cfg = window.SITE;
    var V = otherView(view);
    var inDemonlist = location.pathname.indexOf("/demonlist/") !== -1;
    var onListPage = /\/demonlist\/(?:index\.html)?$/.test(location.pathname);
    var guidelinesHref = inDemonlist ? "../guidelines/index.html" : "guidelines/index.html";
    var statsHref = inDemonlist ? "statsviewer.html" : "demonlist/statsviewer.html";
    var changelogHref = inDemonlist ? "../changelog/index.html" : "changelog/index.html";
    var listHref = inDemonlist ? "index.html" : "demonlist/index.html";

    var demons = DL.sortedDemons();
    var players = DL.aggregatePlayers();
    var html = "";

    function statRow(label, value) {
      return '<div class="stat-row"><span>' + label + "</span><b>" + value + "</b></div>";
    }

    // --- List Mods / Helpers --- in the site's own font (not pointercrate's small
    // caps): head mods in bold on the first line, the rest on the next, each in
    // config.js's order.
    var mods = cfg.editors || [];
    // One centred, wrapping row per tier (#editors ul in demonlist.css, minus its
    // small caps); separate items, so a wrap never leaves a dangling separator.
    function modLine(list, bold) {
      if (!list.length) return "";
      return '<ul style="font-variant: normal; line-height: 1.9">' +
        list.map(function (e) {
          var name = DL.escapeHtml(e.name);
          return '<li style="margin: 0 7px">' + (bold ? "<b>" + name + "</b>" : name) + "</li>";
        }).join("") + "</ul>";
    }
    var heads = mods.filter(function (e) { return e.head; });
    var rest = mods.filter(function (e) { return !e.head; });
    html += sidebarPanel(
      "editors",
      "List Mods",
      "<p>Contact any of these people to get your clears or grind progress added, or if something on the list looks wrong.</p>" +
        (mods.length
          ? modLine(heads, true) + modLine(rest, false)
          : "<p><i>Not listed.</i></p>") +
        (cfg.helpers.length
          ? '<div class="underlined"><h2>List Helpers</h2></div>' +
            "<p>They help check records and progress submissions.</p>" +
            '<p class="staff-names">' +
              cfg.helpers.map(function (h) { return DL.escapeHtml(h.name); }).join(" &middot; ") +
            "</p>"
          : "")
    );

    // --- Statistics ---
    if (V) {
      if (V.rows.length) {
        var tierCount = function (tier) {
          return V.rows.filter(function (r) { return r.tier === tier; }).length;
        };
        var viewLegacy = tierCount("legacy");
        var viewTop = V.players
          .slice()
          .sort(function (a, b) { return b.completed.length - a.completed.length; })[0];
        var first = V.rows[0].level;
        html += sidebarPanel(
          "list-stats",
          "Statistics",
          statRow("Levels in this view", V.rows.length) +
            statRow(
              viewLegacy ? "Main / Extended / Legacy" : "Main / Extended",
              tierCount("main") + " / " + tierCount("extended") + (viewLegacy ? " / " + viewLegacy : "")
            ) +
            statRow(
              "Completions logged",
              V.recordLevels.reduce(function (n, d) { return n + (d.records || []).length; }, 0)
            ) +
            statRow("Players ranked", V.players.length) +
            statRow("Hardest level", '<a href="' + V.url(first) + '">' + DL.escapeHtml(first.name) + "</a>") +
            (viewTop
              ? statRow("Most completions", DL.escapeHtml(viewTop.name) + " (" + viewTop.completed.length + ")")
              : "") +
            statRow("Points on the board", V.players.reduce(function (n, p) { return n + p.score; }, 0).toFixed(0))
        );
      }
    } else if (demons.length) {
      var mainCount = demons.filter(function (d) { return DL.tierOf(d.position) === "main"; }).length;
      var extendedCount = demons.filter(function (d) { return DL.tierOf(d.position) === "extended"; }).length;
      var legacyCount = demons.filter(function (d) { return DL.tierOf(d.position) === "legacy"; }).length;
      var recordCount = demons.reduce(function (n, d) { return n + (d.records || []).length; }, 0);
      var hardest = demons[0];
      var topBeater = players
        .slice()
        .sort(function (a, b) { return b.completed.length - a.completed.length; })[0];
      var totalScore = players.reduce(function (n, p) { return n + p.score; }, 0);

      html += sidebarPanel(
        "list-stats",
        "Statistics",
        statRow("Demons on the list", demons.length) +
          statRow(
            legacyCount ? "Main / Extended / Legacy" : "Main / Extended",
            mainCount + " / " + extendedCount + (legacyCount ? " / " + legacyCount : "")
          ) +
          statRow("Completions logged", recordCount) +
          statRow("Players ranked", players.length) +
          statRow(
            "Hardest demon",
            '<a href="' + DL.demonUrl(hardest.id) + '">' + DL.escapeHtml(hardest.name) + "</a>"
          ) +
          (topBeater
            ? statRow("Most completions", DL.escapeHtml(topBeater.name) + " (" + topBeater.completed.length + ")")
            : "") +
          statRow("Points on the board", totalScore.toFixed(0))
      );
    }

    // --- Top of the leaderboard --- (the view's, with today's score beside it)
    var ranked = V ? V.players : players;
    if (ranked.length) {
      html += sidebarPanel(
        "top-players",
        "Top Players",
        '<ol class="mini-ranking">' +
          ranked
            .slice(0, 3)
            .map(function (p) {
              var today =
                V && p.scoreNow.toFixed(0) !== p.score.toFixed(0) ? " (" + p.scoreNow.toFixed(0) + "&nbsp;today)" : "";
              return (
                "<li>" +
                (p.nationality ? DL.flagSpan(p.nationality) : "") +
                '<a class="underdotted" href="' +
                DL.withView(statsHref + "?player=" + encodeURIComponent(p.name)) +
                '">' +
                DL.escapeHtml(p.name) +
                "</a><span>" +
                p.score.toFixed(0) +
                today +
                "</span></li>"
              );
            })
            .join("") +
          "</ol>" +
          '<a class="blue hover button" href="' + DL.withView(statsHref) + '">Full ranking &amp; map</a>'
      );
    }

    // --- Latest changes ---
    var log = window.CHANGELOG || [];
    if (log.length) {
      var latest = log[0];
      html += sidebarPanel(
        "changelog-teaser",
        "Latest changes",
        '<p class="changelog-teaser-date">' + DL.escapeHtml(DL.formatDate(latest.date)) + "</p>" +
          '<ul class="changelog-list">' +
            (latest.items || [])
              .slice(0, 2)
              .map(function (it) { return DL._changelogItemHtml(it, ""); })
              .join("") +
          "</ul>" +
          ((latest.items || []).length > 2
            ? '<p class="changelog-teaser-more">+' + ((latest.items || []).length - 2) + " more</p>"
            : "") +
          '<a class="blue hover button" href="' + changelogHref + '">Full changelog</a>'
      );
    }

    // --- Guidelines ---
    html += sidebarPanel(
      "rules",
      "Guidelines",
      "<p>How completions get recorded, what counts, and what isn't allowed. Worth a read before you submit a run.</p>" +
        '<a class="blue hover button" href="' + guidelinesHref + '">Read the guidelines</a>'
    );

    // --- Stats Viewer ---
    html += sidebarPanel(
      "stats",
      "Stats Viewer",
      "<p>Every player and country ranked by points, with an interactive world map. See who's on top and what everyone still has left to beat.</p>" +
        '<a class="blue hover button" href="' + DL.withView(statsHref) + '">Open the stats viewer</a>'
    );

    // --- List Views --- (static/js/views.js): what the other views are, or in
    // one of them, how it works and the way back
    var opts = DL.viewOptions();
    if (V) {
      var rules = "";
      if (V.time === "future") {
        rules +=
          "<p>Future adds every level in someone's In Progress." +
          (cfg.grindInProgress != null
            ? " In Progress means a Grind run longer than " + cfg.grindInProgress +
              "% (from the start, or a practice run like 42&ndash;100)."
            : "") +
          "</p>";
      } else if (V.time === "plus") {
        rules += "<p>Future+ adds every level in anyone's Grind, whatever their progress.</p>";
      }
      if (V.rating === "plus") {
        rules +=
          "<p>Rated+ adds the unrated levels the head mods count as accomplishments. Each one goes where its GD " +
          "Demon Ladder estimate puts it (or a spot a head mod picked close to it), and its clears count for points here.</p>";
      }
      html += sidebarPanel(
        "view-rules",
        "How this view works",
        rules +
          "<p>Every level goes where the list would put it, ranked the same way as everything else, and every " +
          "level's points and everyone's score are worked out again for this view.</p>" +
          '<a class="blue hover button" data-view-set href="' +
          DL.withView(listHref, { time: "current", rating: "rated" }, true) +
          '">' + "Back to today's list</a>"
      );
    } else if (opts.times.length > 1 || opts.ratings.length > 1) {
      var others = [];
      if (opts.times.indexOf("future") >= 0) others.push("Future adds every level in someone's In Progress");
      if (opts.times.indexOf("plus") >= 0) {
        others.push(others.length ? "Future+ every level in anyone's Grind" : "Future+ adds every level in anyone's Grind");
      }
      if (opts.ratings.indexOf("plus") >= 0) {
        others.push(
          others.length ? "Rated+ the unrated levels the head mods count" : "Rated+ adds the unrated levels the head mods count"
        );
      }
      html += sidebarPanel(
        "views",
        "List Views",
        "<p>The list and the stats viewer can also show other views: " +
          (others.length < 2 ? others.join("") : others.slice(0, -1).join(", ") + ", and " + others[others.length - 1]) +
          ". Every level's points and everyone's score are worked out again for the view. Pick one at the top of the list.</p>" +
          (onListPage ? "" : '<a class="blue hover button" href="' + DL.withView(listHref) + '">Open the list</a>')
      );
    }

    // --- Discord ---
    if (cfg.discordInvite) {
      html += sidebarPanel(
        "discord",
        "Discord",
        "<p>Chat, submit records, and argue about placements with the rest of us.</p>" +
          '<a class="blue hover button" href="' +
          DL.escapeHtml(cfg.discordInvite) +
          '" target="_blank" rel="noopener">Join the Discord</a>'
      );
    }

    root.innerHTML = html;

    // "Back to today's list": forget the pick, then open the list
    var back = V && root.querySelector("#view-rules a[data-view-set]");
    if (back) {
      back.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        DL.setView({ time: "current", rating: "rated" }, listHref);
      });
    }
  };

  // The demon-panel headline (`h3`), phrased exactly like pointercrate's
  // demon-headline.* templates: "by {creator}, verified and published by {x}"
  // etc., collapsing whenever a creator is also the publisher / verifier.
  function bylineHtml(demon) {
    var creators = demon.creators && demon.creators.length ? demon.creators : [];
    var publisher = demon.publisher;
    var verifier = demon.verifier || publisher;
    var P = DL.creditLink;

    var vap =
      publisher === verifier
        ? "verified and published by " + P(publisher)
        : "published by " + P(publisher) + ", verified by " + P(verifier);

    if (!creators.length) return "by Unknown, " + vap;

    if (creators.length === 1) {
      var c = creators[0];
      if (c === publisher && c === verifier) return "by " + P(c);
      if (c !== publisher && c !== verifier) return "by " + P(c) + ", " + vap;
      if (c === publisher) return "by " + P(c) + ", verified by " + P(verifier);
      return "by " + P(c) + ", published by " + P(publisher);
    }

    if (creators.length === 2) {
      return "by " + P(creators[0]) + " and " + P(creators[1]) + ", " + vap;
    }

    var rest = creators.slice(1).map(DL.escapeHtml).join(", ");
    return (
      "by " + P(creators[0]) +
      ' and <span class="tooltip underdotted">more<span class="tooltiptext fade">' + rest + "</span></span>, " +
      vap
    );
  }

  // Position History panel - pointercrate's demon-page "movements" panel,
  // markup for markup: a js-collapse panel (collapsed by default) holding the
  // hidden position chart placeholder + #history-table. Rows come from
  // DL.positionHistoryFor (derived from data/changelog.js). Hidden if empty.
  function positionHistoryHtml(demon) {
    var rows = DL.positionHistoryFor(demon);
    if (!rows.length) return "";

    var body = rows
      .map(function (r) {
        var cls = r.delta === 0 ? "" : r.delta < 0 ? " class=\"moved-up\"" : " class=\"moved-down\"";
        var change =
          r.delta === 0
            ? "-"
            : r.delta < 0
            ? '<i class="fas fa-arrow-up"></i> ' + Math.abs(r.delta)
            : '<i class="fas fa-arrow-down"></i> ' + r.delta;
        return (
          "<tr" + cls + ">" +
            "<td>" + DL.escapeHtml(r.date) + "</td>" +
            "<td>" + change + "</td>" +
            "<td>" + r.position + "</td>" +
            "<td>" + DL.escapeHtml(r.reason) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<div class="panel fade js-scroll-anim js-collapse" data-anim="fade">' +
        '<h2 class="underlined pad">Position History<span class="arrow hover" id="history-trigger"></span></h2>' +
        '<div class="js-collapse-content" style="display:none">' +
          '<div class="ct-chart ct-perfect-fourth" id="position-chart" style="display:none"></div>' +
          '<table id="history-table"><tbody id="history-table-body">' +
            '<tr><th class="blue">Date</th><th class="blue">Change</th>' +
            '<th class="blue">New Position</th><th class="blue">Reason</th></tr>' +
            body +
          "</tbody></table>" +
        "</div>" +
      "</div>"
    );
  }

  // `tier` (optional): the demon's tier in a list view; today's by default
  function recordsTableHtml(demon, tier) {
    var records = (demon.records || []).slice().sort(function (a, b) {
      return b.progress - a.progress || a.player.localeCompare(b.player);
    });
    var oneHundred = records.filter(function (r) { return r.progress >= 100; }).length;
    if (tier === undefined) tier = DL.tierOf(demon.position);
    var req = demon.requirementPercent || 100;
    var reqText = tier === "extended" ? "100% required to qualify" : req + "% or better required to qualify";

    var body;
    if (!records.length) {
      body = "<h3>No records yet! Be the first to achieve one!</h3>";
    } else {
      // pointercrate's "Video Proof" column, only when someone here has a video.
      // The videos are hosted on this site, so the link opens record.html
      // instead of going out to YouTube; a record without one leaves it blank.
      var anyVideo = records.some(function (r) { return r.video; });
      body =
        "<table><tbody>" +
        '<tr><th class="blue"></th><th class="blue">Record Holder</th><th class="blue">Progress</th>' +
        (anyVideo ? '<th class="blue">Video Proof</th>' : "") + "</tr>" +
        records.map(function (r) {
          var weight = r.progress >= 100 ? ' style="font-weight:bold"' : "";
          var video = !anyVideo
            ? ""
            : "<td>" +
              (r.video
                ? '<a class="video-link" href="' + DL.recordUrl(demon.id, r.player) + '">Watch<i class="fas fa-play-circle"></i></a>'
                : "") +
              "</td>";
          return (
            "<tr" + weight + "><td>" + DL.flagSpan(r.nationality) + "</td><td>" + DL.playerLink(r.player) +
            "</td><td>" + r.progress + "%</td>" + video + "</tr>"
          );
        }).join("") +
        "</tbody></table>";
    }

    return (
      '<section class="records panel fade js-scroll-anim" data-anim="fade">' +
        '<div class="underlined pad">' +
          "<h2>Records</h2>" +
          "<h3>" + reqText + "</h3>" +
          "<h4>" + records.length + " record" + (records.length === 1 ? "" : "s") + " registered, out of which " + oneHundred + " " + (oneHundred === 1 ? "is" : "are") + " 100%</h4>" +
        "</div>" +
        body +
      "</section>"
    );
  }

  // --- record videos (demonlist/record.html) -------------------------------
  // data/demons.js record.video (set by tools/add-video.py): a path from the
  // site root ("videos/<levelId>/<player>.mp4" - files up to 25 MB are hosted
  // here) or, for a bigger video, its YouTube / Google Drive link.
  // record.videoPoster: an optional still for hosted files.
  DL.recordUrl = function (demonId, player) {
    return DL.withView("record.html?demon=" + encodeURIComponent(demonId) + "&player=" + encodeURIComponent(player));
  };

  function siteAsset(path) {
    return /^(https?:)?\/\//.test(path) ? path : "../" + String(path).replace(/^\/+/, "");
  }

  // Where a record's video lives. A file hosted here (or any direct video URL)
  // plays in <video>; a video over Cloudflare Pages' 25 MB per-file limit is a
  // YouTube or Google Drive link instead, embedded on the same page.
  DL.recordVideoSource = function (video) {
    var s = String(video || "");
    var yt = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
    if (/youtu\.?be/.test(s) && yt) {
      return { kind: "youtube", id: yt[1], embed: "https://www.youtube.com/embed/" + yt[1],
               open: "https://www.youtube.com/watch?v=" + yt[1] };
    }
    var gd = s.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/);
    if (gd) {
      return { kind: "drive", id: gd[1], embed: "https://drive.google.com/file/d/" + gd[1] + "/preview",
               open: "https://drive.google.com/file/d/" + gd[1] + "/view" };
    }
    return { kind: "file", src: siteAsset(s) };
  };

  function recordPlayerHtml(record) {
    var vs = DL.recordVideoSource(record.video);
    if (vs.kind === "file") {
      var poster = record.videoPoster ? ' poster="' + DL.escapeHtml(siteAsset(record.videoPoster)) + '"' : "";
      return (
        '<video class="record-video" controls playsinline preload="metadata"' + poster +
          ' src="' + DL.escapeHtml(vs.src) + '">' +
          'This browser can\'t play the video - <a href="' + DL.escapeHtml(vs.src) + '">download it</a> instead.' +
        "</video>"
      );
    }
    var player =
      vs.kind === "youtube" && location.protocol === "file:"
        ? // a YouTube embed won't play on a file:// page (error 153) - thumbnail that opens YouTube instead
          '<a class="demon-video" href="' + vs.open + '" target="_blank" rel="noopener" aria-label="Watch on YouTube"' +
          ' style="background-image:url(https://i.ytimg.com/vi/' + vs.id + '/hqdefault.jpg)"><span class="demon-video-play"></span></a>'
        : '<iframe class="record-video" src="' + vs.embed + '" title="Record video" allowfullscreen' +
          ' allow="autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe>';
    return (
      player +
      '<p class="demon-video-link"><a class="link" href="' + vs.open + '" target="_blank" rel="noopener">' +
      (vs.kind === "youtube" ? "Watch on YouTube" : "Open in Google Drive") + "</a></p>"
    );
  }

  // same layout as the demon page's top panel: heading, byline, the video
  // where the showcase sits, then the facts row. `view` (optional): the
  // demon's position and list in that list view.
  DL.renderRecordPage = function (root, demon, record, view) {
    var V = otherView(view);
    var tier = V ? V.tier(demon) : DL.tierOf(demon.position);
    var position = V ? V.pos(demon) : demon.position;
    var demonHref = V ? V.url(demon) : DL.demonUrl(demon.id);
    var demonLink = '<a href="' + demonHref + '">' + DL.escapeHtml(demon.name) + "</a>";
    function bit(label, value) {
      return "<span><b>" + label + "</b><br>" + value + "</span>";
    }

    root.innerHTML =
      '<section class="panel fade">' +
        '<div class="underlined">' +
          '<h1 id="record-heading">' + (tier !== "legacy" ? "#" + position + " – " : "") + demonLink + "</h1>" +
          "<h3>" + DL.flagSpan(record.nationality) + DL.playerLink(record.player) + " &middot; " + record.progress + "%</h3>" +
        "</div>" +
        recordPlayerHtml(record) +
        '<div class="underlined pad flex wrap" id="level-info">' +
          bit("Record Holder", DL.playerLink(record.player)) +
          bit("Progress", record.progress + "%") +
          bit("Demon", demonLink) +
          bit("List", tier === "main" ? "Main List" : tier === "extended" ? "Extended List" : "Legacy List") +
        "</div>" +
        '<a class="blue hover button" href="' + demonHref + '">All ' + DL.escapeHtml(demon.name) + " records</a>" +
      "</section>";
  };

  // `view` (optional, static/js/views.js): the demon's neighbors, position,
  // list and points in that view. An unrated level (data/unrated.js) comes
  // with a Rated+ view and gets a note on what it is; it has no Position
  // History (that's for listed demons).
  DL.renderDemonDetail = function (root, demon, view) {
    var V = otherView(view);
    var listed = !!DL.demonById(demon.id);
    var row = V ? V.row(demon) : null;
    var prev, next, tier;
    if (V) {
      var at = row ? V.rows.indexOf(row) : -1;
      prev = at > 0 ? V.rows[at - 1].level : null;
      next = at >= 0 && at < V.rows.length - 1 ? V.rows[at + 1].level : null;
      tier = V.tier(demon);
    } else {
      var all = DL.sortedDemons();
      var idx = all.findIndex(function (d) { return d.id === demon.id; });
      prev = idx > 0 ? all[idx - 1] : null;
      next = idx < all.length - 1 ? all[idx + 1] : null;
      tier = DL.tierOf(demon.position);
    }
    function pageUrl(d) {
      return V ? V.url(d) : DL.demonUrl(d.id);
    }
    var req = demon.requirementPercent || 100;

    // phones size the name by its longest word (see #demon-heading in demonlist.css)
    var longestWord = Math.max.apply(null, demon.name.split(/\s+/).map(function (w) { return w.length; }));
    var heading =
      '<h1 id="demon-heading" style="overflow:hidden; --longest-word:' + longestWord + '">' +
      (prev ? '<a href="' + pageUrl(prev) + '"><i class="fa fa-chevron-left" style="padding-right:5%"></i></a>' : "") +
      DL.escapeHtml(demon.name) +
      (next ? '<a href="' + pageUrl(next) + '"><i class="fa fa-chevron-right" style="padding-left:5%"></i></a>' : "") +
      "</h1>";

    // an unrated level: what it is and where it counts
    var unratedNote = "";
    if (!listed && typeof demon.rating === "number") {
      var spot = "";
      if (row && row.manual) {
        var anchor = Number(demon.placeBelow);
        var below = anchor ? DL.demonById(anchor) : null;
        spot = anchor === 0
          ? ", placed by hand at the very top"
          : below
          ? ', placed by hand right below <a href="' + pageUrl(below) + '">' + DL.escapeHtml(below.name) + "</a>"
          : "";
      }
      unratedNote =
        '<div class="underlined pad"><p class="unrated-note"><span class="future-badge unrated-badge">Unrated</span> ' +
        "Not rated in game yet. It counts as an accomplishment in the Rated+ views, as an " +
        DL.escapeHtml(demon.difficulty) + " at the head mods' GD Demon Ladder estimate of " + demon.rating.toFixed(2) +
        spot + ".</p></div>";
    }

    // Hosted: embed the player directly, exactly like pointercrate
    // (iframe.ratio-16-9, width:90% margin:15px 5%). On file:// a YouTube embed
    // throws "configuration error 153" (no origin/referer) and the site has to
    // work double-clicked, so there it's a click-to-play poster -> opens YouTube.
    var videoHtml = "";
    if (demon.videoUrl) {
      var embed = DL.embedVideo(demon.videoUrl);
      var onFile = location.protocol === "file:";
      if (embed && embed.url && !onFile) {
        videoHtml =
          '<iframe class="ratio-16-9" allowfullscreen style="width:90%; margin:15px 5%"' +
          ' src="' + DL.escapeHtml(embed.url) + '" title="Showcase video">Showcase video</iframe>';
      } else if (embed && embed.url) {
        var poster = demon.thumbnailUrl
          ? ' style="background-image:url(' + DL.escapeHtml(demon.thumbnailUrl) + ')"'
          : "";
        var cardCls = demon.thumbnailUrl ? "" : " demon-card " + DL.difficultyClass(demon.difficulty);
        var cardText = demon.thumbnailUrl
          ? ""
          : '<span class="demon-card-name">' + DL.escapeHtml(demon.name) + "</span>" +
            '<span class="demon-card-diff">' + DL.escapeHtml(DL.difficultyLabel(demon.difficulty)) + "</span>";
        videoHtml =
          '<div class="demon-video js-demon-video' + cardCls + '"' + poster +
            ' role="button" tabindex="0" aria-label="Play showcase video"' +
            ' data-embed="' + DL.escapeHtml(embed.url) + '"' +
            ' data-watch="' + DL.escapeHtml(demon.videoUrl) + '">' +
            cardText +
            '<span class="demon-video-play"></span>' +
          "</div>" +
          '<p class="demon-video-link"><a class="link" href="' + DL.escapeHtml(demon.videoUrl) +
            '" target="_blank" rel="noopener">Watch on YouTube</a></p>';
      } else {
        videoHtml =
          '<p class="underlined pad"><a class="link" href="' + DL.escapeHtml(demon.videoUrl) + '" target="_blank" rel="noopener">Watch the showcase video</a></p>';
      }
    }

    // #level-info: the same fields pointercrate's demon page shows, in its order
    // (GD data from data/demons.js `gd`, scraped from gdbrowser; missing for the
    // 3 official RobTop levels, which aren't on the level servers).
    var gd = demon.gd || {};
    var infoBits = [];
    function bit(label, value) {
      return "<span><b>" + label + "</b><br>" + value + "</span>";
    }
    if (demon.levelId) infoBits.push(bit("Level ID", DL.escapeHtml(demon.levelId)));
    if (gd.length) infoBits.push(bit("Level Length", DL.escapeHtml(gd.length)));
    if (gd.objects) infoBits.push(bit("Object Count", gd.objects >= 65535 ? "65535+" : String(gd.objects)));
    infoBits.push(bit("In-Game Difficulty", DL.escapeHtml(gd.inGameDifficulty || DL.difficultyLabel(demon.difficulty))));
    if (unratedNote) {
      infoBits.push(bit("GDDL estimate", demon.rating.toFixed(2)));
      infoBits.push(bit("Counts as", DL.escapeHtml(DL.difficultyLabel(demon.difficulty))));
    }
    if (gd.gameVersion) infoBits.push(bit("Created In", DL.escapeHtml(gd.gameVersion)));
    if (gd.song && /^\d+$/.test(String(gd.song.id))) {
      var s = gd.song;
      var songText = DL.escapeHtml(s.name + (s.artist ? " by " + s.artist : "") + " (ID " + s.id + ")");
      var songHref =
        s.link && s.link !== "-" ? s.link : "https://www.newgrounds.com/audio/listen/" + encodeURIComponent(s.id);
      infoBits.push(
        '<span style="width:100%"><b>Newgrounds Song</b><br>' +
          '<a class="link" href="' + DL.escapeHtml(songHref) + '" target="_blank" rel="noopener">' + songText + "</a></span>"
      );
    }
    if (V) {
      // the view's position and points, with today's beside them when they differ
      if (row) {
        infoBits.push(
          bit(
            "Position (" + DL.escapeHtml(V.title) + ")",
            "#" + row.position + (listed && row.was !== row.position ? " (#" + row.was + " today)" : "")
          )
        );
        if (tier !== "legacy") {
          var now = listed ? DL.scoreAt100(demon).toFixed(2) : null;
          infoBits.push(
            bit(
              "Demonlist score (100%)",
              row.points.toFixed(2) + (now !== null && now !== row.points.toFixed(2) ? " (" + now + " today)" : "")
            )
          );
          if (req < 100) {
            infoBits.push(bit("Demonlist score (" + req + "%)", V.recordScore(demon, req).toFixed(2)));
          }
        }
      }
    } else if (tier !== "legacy") {
      infoBits.push(bit("Demonlist score (100%)", DL.scoreAt100(demon).toFixed(2)));
      if (req < 100) {
        infoBits.push(bit("Demonlist score (" + req + "%)", DL.recordScore(demon, req).toFixed(2)));
      }
    }

    root.innerHTML =
      '<section class="panel fade js-scroll-anim" data-anim="fade">' +
        '<div class="underlined">' + heading + "<h3>" + bylineHtml(demon) + "</h3></div>" +
        unratedNote +
        (demon.description ? '<div class="underlined pad"><q>' + DL.escapeHtml(demon.description) + "</q></div>" : "") +
        videoHtml +
        '<div class="underlined pad flex wrap" id="level-info">' + infoBits.join("") + "</div>" +
      "</section>" +
      (listed ? positionHistoryHtml(demon) : "") +
      recordsTableHtml(demon, V ? tier : undefined);

    var videoEl = root.querySelector(".js-demon-video");
    if (videoEl) {
      var playVideo = function () {
        if (location.protocol === "file:") {
          window.open(videoEl.dataset.watch, "_blank", "noopener");
          return;
        }
        var frame = document.createElement("iframe");
        frame.className = "demon-video";
        frame.title = "Showcase video";
        frame.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
        frame.setAttribute("allowfullscreen", "");
        frame.src =
          videoEl.dataset.embed + (videoEl.dataset.embed.indexOf("?") === -1 ? "?" : "&") + "autoplay=1";
        videoEl.replaceWith(frame);
      };
      videoEl.addEventListener("click", playVideo);
      videoEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playVideo();
        }
      });
    }
  };
})(window.DL);

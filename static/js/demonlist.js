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

  // The Main/Extended/Legacy dropdown tab bar (nav#lists), reused on both the
  // overview page and the demon detail page. `currentDemon` (optional) gets
  // the `.active` class in whichever dropdown it belongs to.
  DL.renderListNav = function (root, currentDemon) {
    var all = DL.sortedDemons();
    var main = all.filter(function (d) { return DL.tierOf(d.position) === "main"; });
    var extended = all.filter(function (d) { return DL.tierOf(d.position) === "extended"; });
    var legacy = all.filter(function (d) { return DL.tierOf(d.position) === "legacy"; });

    function group(id, label, demons, numbered, description) {
      var items = demons.map(function (d) {
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

    root.innerHTML =
      group("mainlist", "Main List", main, true, "The main section of the Demonlist.") +
      group("extended", "Extended List", extended, true, "Official extensions of the Main List. Only 100% completions count.") +
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

  DL.renderSidebar = function (root) {
    var cfg = window.SITE;
    var inDemonlist = location.pathname.indexOf("/demonlist/") !== -1;
    var guidelinesHref = inDemonlist ? "../guidelines/index.html" : "guidelines/index.html";
    var statsHref = inDemonlist ? "statsviewer.html" : "demonlist/statsviewer.html";
    var changelogHref = inDemonlist ? "../changelog/index.html" : "changelog/index.html";

    var demons = DL.sortedDemons();
    var players = DL.aggregatePlayers();
    var html = "";

    // --- List Editors / Helpers ---
    html += sidebarPanel(
      "editors",
      "List Editors",
      "<p>The people who keep the list in order. Poke one of them if a placement looks off or a record needs fixing.</p>" +
        (cfg.editors.length
          ? '<p class="staff-names">' +
              cfg.editors
                .map(function (e) {
                  return DL.escapeHtml(e.name) + (e.role ? " <i>(" + DL.escapeHtml(e.role) + ")</i>" : "");
                })
                .join(" &middot; ") +
              "</p>"
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
    if (demons.length) {
      var mainCount = demons.filter(function (d) { return DL.tierOf(d.position) === "main"; }).length;
      var extendedCount = demons.filter(function (d) { return DL.tierOf(d.position) === "extended"; }).length;
      var legacyCount = demons.filter(function (d) { return DL.tierOf(d.position) === "legacy"; }).length;
      var recordCount = demons.reduce(function (n, d) { return n + (d.records || []).length; }, 0);
      var hardest = demons[0];
      var topBeater = players
        .slice()
        .sort(function (a, b) { return b.completed.length - a.completed.length; })[0];
      var totalScore = players.reduce(function (n, p) { return n + p.score; }, 0);

      function statRow(label, value) {
        return '<div class="stat-row"><span>' + label + "</span><b>" + value + "</b></div>";
      }

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

    // --- Top of the leaderboard ---
    if (players.length) {
      html += sidebarPanel(
        "top-players",
        "Top Players",
        '<ol class="mini-ranking">' +
          players
            .slice(0, 3)
            .map(function (p) {
              return (
                "<li>" +
                (p.nationality ? DL.flagSpan(p.nationality) : "") +
                '<a class="underdotted" href="' +
                statsHref +
                "?player=" +
                encodeURIComponent(p.name) +
                '">' +
                DL.escapeHtml(p.name) +
                "</a><span>" +
                p.score.toFixed(0) +
                "</span></li>"
              );
            })
            .join("") +
          "</ol>" +
          '<a class="blue hover button" href="' + statsHref + '">Full ranking &amp; map</a>'
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
        '<a class="blue hover button" href="' + statsHref + '">Open the stats viewer</a>'
    );

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

  function recordsTableHtml(demon) {
    var records = (demon.records || []).slice().sort(function (a, b) {
      return b.progress - a.progress || a.player.localeCompare(b.player);
    });
    var oneHundred = records.filter(function (r) { return r.progress >= 100; }).length;
    var tier = DL.tierOf(demon.position);
    var req = demon.requirementPercent || 100;
    var reqText = tier === "extended" ? "100% required to qualify" : req + "% or better required to qualify";

    var body;
    if (!records.length) {
      body = "<h3>No records yet! Be the first to achieve one!</h3>";
    } else {
      body =
        "<table><tbody>" +
        '<tr><th class="blue"></th><th class="blue">Record Holder</th><th class="blue">Progress</th></tr>' +
        records.map(function (r) {
          var weight = r.progress >= 100 ? ' style="font-weight:bold"' : "";
          return (
            "<tr" + weight + "><td>" + DL.flagSpan(r.nationality) + "</td><td>" + DL.playerLink(r.player) +
            "</td><td>" + r.progress + "%</td></tr>"
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

  DL.renderDemonDetail = function (root, demon) {
    var all = DL.sortedDemons();
    var idx = all.findIndex(function (d) { return d.id === demon.id; });
    var prev = idx > 0 ? all[idx - 1] : null;
    var next = idx < all.length - 1 ? all[idx + 1] : null;
    var tier = DL.tierOf(demon.position);
    var req = demon.requirementPercent || 100;

    // phones size the name by its longest word (see #demon-heading in demonlist.css)
    var longestWord = Math.max.apply(null, demon.name.split(/\s+/).map(function (w) { return w.length; }));
    var heading =
      '<h1 id="demon-heading" style="overflow:hidden; --longest-word:' + longestWord + '">' +
      (prev ? '<a href="' + DL.demonUrl(prev.id) + '"><i class="fa fa-chevron-left" style="padding-right:5%"></i></a>' : "") +
      DL.escapeHtml(demon.name) +
      (next ? '<a href="' + DL.demonUrl(next.id) + '"><i class="fa fa-chevron-right" style="padding-left:5%"></i></a>' : "") +
      "</h1>";

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
    if (tier !== "legacy") {
      infoBits.push(bit("Demonlist score (100%)", DL.scoreAt100(demon).toFixed(2)));
      if (req < 100) {
        infoBits.push(bit("Demonlist score (" + req + "%)", DL.recordScore(demon, req).toFixed(2)));
      }
    }

    root.innerHTML =
      '<section class="panel fade js-scroll-anim" data-anim="fade">' +
        '<div class="underlined">' + heading + "<h3>" + bylineHtml(demon) + "</h3></div>" +
        (demon.description ? '<div class="underlined pad"><q>' + DL.escapeHtml(demon.description) + "</q></div>" : "") +
        videoHtml +
        '<div class="underlined pad flex wrap" id="level-info">' + infoBits.join("") + "</div>" +
      "</section>" +
      positionHistoryHtml(demon) +
      recordsTableHtml(demon);

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

"use strict";
// -----------------------------------------------------------------------------
// Stats Viewer: the player ranking, the interactive world map, and the
// "Nations" roll-up. Depends on data/config.js, data/demons.js,
// static/js/list-utils.js, and (for the map) static/js/worldmap.data.js +
// static/js/worldmap.js. jQuery powers the shared .js-search filter box only.
//
// Two modes, toggled by the buttons in #sv-modes:
//   - individual: one row per player. The map + continent / subdivision
//     controls just FILTER this list (click the USA -> only US players; tick
//     "show subdivisions" and click Illinois -> only Illinois players).
//   - nations: one row per country, scored by the sum of its players' scores,
//     with the union of everything anyone from that country has done. Clicking
//     the map or the list opens that country's panel.
//
// Adapted from pointercrate's statsviewer/individual.js + nation.js (MIT), but
// everything is computed here from window.DEMONS - there's no ranking API.
// -----------------------------------------------------------------------------

(function (DL) {
  function el(id) {
    return document.getElementById(id);
  }
  function show(id) {
    var e = el(id);
    if (e) e.style.display = "";
  }
  function hide(id) {
    var e = el(id);
    if (e) e.style.display = "none";
  }

  function sortedList(list, byPosition) {
    list = list.slice();
    if (byPosition) list.sort(function (a, b) { return a.position - b.position; });
    else list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }
  function demonLinks(list) {
    return list.length ? list.map(DL.formatDemonLink).join(" - ") : "None";
  }
  // a demon link with a native tooltip naming which players it belongs to
  function demonLinkWithPlayers(demon, players) {
    var link = DL.formatDemonLink(demon);
    return players && players.length
      ? '<span title="' + DL.escapeHtml(players.join(", ")) + '">' + link + "</span>"
      : link;
  }
  function creditRows(rows, byPosition) {
    if (!rows.length) return "None";
    return rows
      .slice()
      .sort(function (a, b) {
        return byPosition ? a.demon.position - b.demon.position : a.demon.name.localeCompare(b.demon.name);
      })
      .map(function (r) { return demonLinkWithPlayers(r.demon, r.players); })
      .join(" - ");
  }

  // SITE.grindInProgress (Aceabase - Poatan's compromise for The Grind keeping
  // tiny runs): a goal in data/goals.js where the player has a run LONGER than
  // that % - from 0, or a practice run like 42-100 - also shows in their
  // "In Progress" row. Display only, never points. Off when the setting is
  // missing. Returns [{ goal, run: [from, to] }] with the player's longest run.
  function grindProgress(name) {
    var min = window.SITE && window.SITE.grindInProgress;
    if (min == null || !DL.goalsForPlayer) return [];
    return DL.goalsForPlayer(name)
      .map(function (g) {
        var runs = (g.best != null ? [[0, g.best]] : []).concat(g.segments || []);
        var run = runs.reduce(function (b, r) { return !b || r[1] - r[0] > b[1] - b[0] ? r : b; }, null);
        return run && run[1] - run[0] > min ? { goal: g, run: run } : null;
      })
      .filter(Boolean);
  }
  // which list an OFF-list goal level would be in if it were on the list, so it
  // gets the same styling as a listed demon - Congregation is an Extreme, so
  // it's Main List on Aceabase even though nobody there has beaten it.
  // null = it couldn't be on the list at all (not an allowed difficulty).
  function wouldBeTier(lv) {
    if (!lv) return null;
    var cfg = window.SITE || {};
    if (cfg.allowedDifficulties && cfg.allowedDifficulties.indexOf(lv.difficulty) < 0) return null;
    if (cfg.mainListSize === "extremes") return lv.difficulty === "Extreme" ? "main" : "extended";
    var rating = DL.demonRating(lv);
    var above = (window.DEMONS || []).filter(function (d) { return DL.demonRating(d) > rating; }).length;
    return DL.tierOf(above + 1);
  }
  // the level's Grind page (at one player's card), styled like any demon link:
  // bold = Main List, plain = Extended, faded = Legacy
  function grindLink(levelId, playerName) {
    var lv = DL.goalLevel(levelId);
    var a =
      '<a href="goal.html?level=' + encodeURIComponent(levelId) +
      (playerName ? "#" + DL.goalAnchor(playerName) : "") + '">' +
      DL.escapeHtml(lv ? lv.name : "Level " + levelId) + "</a>";
    var listed = DL.demonById(levelId);
    var tier = listed ? DL.tierOf(listed.position) : wouldBeTier(lv);
    if (tier === "main") return "<b>" + a + "</b>";
    if (tier === "extended") return "<span>" + a + "</span>";
    if (tier === "legacy") return '<i style="opacity:.5">' + a + "</i>";
    return a;
  }
  // grind rows for everyone in `names`, skipping levels in `skip` (already beaten
  // / already a real progress record); several players on one level -> one
  // entry. Just the level name, no run (the Grind page has the runs).
  function grindProgressRows(names, skip) {
    var rows = {}, order = [];
    names.forEach(function (name) {
      grindProgress(name).forEach(function (x) {
        var id = x.goal.levelId;
        if (skip[id]) return;
        if (!rows[id]) {
          rows[id] = { levelId: id, players: [] };
          order.push(id);
        }
        rows[id].players.push(name);
      });
    });
    return order.map(function (id) {
      var r = rows[id];
      var link = grindLink(r.levelId, r.players.length === 1 ? r.players[0] : null);
      return names.length > 1 ? '<span title="' + DL.escapeHtml(r.players.join(", ")) + '">' + link + "</span>" : link;
    });
  }
  function demonIds(rows) {
    var ids = {};
    rows.forEach(function (r) { ids[r.demon.id] = true; });
    return ids;
  }

  DL.initStatsViewer = function (root, initialPlayerName, initialNation) {
    var players = DL.aggregatePlayers();
    var nations = DL.aggregateNations();

    var listEl = root.querySelector(".selection-list");
    var contentEl = root.querySelector(".viewer-content");
    var welcomeEl = root.querySelector(".viewer-welcome");

    var sortMode = localStorage.getItem("demon_sorting_mode") || "Alphabetical";
    var alphaBtn = root.querySelector('[data-sort="Alphabetical"]');
    var posBtn = root.querySelector('[data-sort="Position"]');

    var continentSelect = el("continent-select");
    var subdivisionSelect = el("subdivision-select");
    var subdivisionCheckbox = el("show-subdivisions-checkbox");
    var scopeEl = el("sv-scope");

    // A country-only list (SITE.subdivisions === false - Aceabase): no state
    // borders on the map, no state picker or state rows. Countries are the
    // smallest place a player is from.
    var useSubdivisions = !(window.SITE && window.SITE.subdivisions === false);

    var mode = "individual";
    var filter = { continent: "", nation: "", subdivision: "" };
    var selected = null; // { kind: "player"|"nation", id }

    // --- interactive map (optional; needs the SVG data script) ---------------
    var map = null;
    var mapWrapper = el("world-map-wrapper");
    if (mapWrapper && DL.WORLD_MAP_SVG && DL.InteractiveWorldMap) {
      try {
        map = new DL.InteractiveWorldMap(el("world-map"));
      } catch (e) {
        map = null;
      }
    }
    if (map) {
      if (useSubdivisions) map.showSubdivisions();

      map.addSelectionListener(function (country, sub) {
        if (mode === "nations" || !useSubdivisions) sub = undefined; // states aren't ranked
        filter.nation = country;
        filter.subdivision = sub || "";
        if ((mode === "nations" || !useSubdivisions) && sub === undefined) map.select(country); // move highlight off the state
        populateSubdivisions(country);
        if (subdivisionSelect) subdivisionSelect.value = sub || "";
        onFilterChanged();
      });
      map.addDeselectionListener(function () {
        filter.nation = "";
        filter.subdivision = "";
        clearSubdivisions();
        onFilterChanged();
      });

      Array.prototype.forEach.call(root.querySelectorAll(".map-controls [data-map]"), function (btn) {
        btn.addEventListener("click", function () {
          if (btn.dataset.map === "in") map.zoomBy(1.4);
          else if (btn.dataset.map === "out") map.zoomBy(1 / 1.4);
          else map.resetView();
        });
      });

      refreshPresence();
    } else {
      if (mapWrapper) mapWrapper.style.display = "none";
      // continent needs the map's grouping; the subdivision toggle is map-only
      hidePanel("continent-panel");
      hidePanel("subdivision-toggle-panel");
    }
    if (!useSubdivisions) {
      hidePanel("subdivision-toggle-panel");
      hidePanel("subdivision-panel");
    }

    // --- continent dropdown -------------------------------------------------
    if (continentSelect) {
      continentSelect.innerHTML =
        '<option value="">All continents</option>' +
        DL.CONTINENTS.map(function (c) {
          return '<option value="' + c[1] + '">' + DL.escapeHtml(c[0]) + "</option>";
        }).join("");
      continentSelect.addEventListener("change", function () {
        filter.continent = continentSelect.value;
        if (map) {
          if (filter.continent) map.highlightContinent(filter.continent);
          else map.resetContinentHighlight();
        }
        onFilterChanged();
      });
    }

    // --- subdivision dropdown + checkbox -----------------------------------
    if (subdivisionSelect) {
      clearSubdivisions();
      subdivisionSelect.addEventListener("change", function () {
        filter.subdivision = subdivisionSelect.value;
        if (map) {
          if (filter.subdivision) map.select(filter.nation, filter.subdivision);
          else map.deselectSubdivision();
        }
        onFilterChanged();
      });
    }
    if (subdivisionCheckbox) {
      subdivisionCheckbox.addEventListener("change", function () {
        if (!map) return;
        if (subdivisionCheckbox.checked) map.showSubdivisions();
        else map.hideSubdivisions();
        refreshPresence();
      });
    }

    // --- mode toggle ------------------------------------------------------
    Array.prototype.forEach.call(root.querySelectorAll("#sv-modes [data-mode]"), function (btn) {
      btn.addEventListener("click", function () {
        setMode(btn.dataset.mode);
      });
    });

    // --- demon sorting ---------------------------------------------------
    function updateSortButtons() {
      if (alphaBtn) alphaBtn.classList.toggle("active", sortMode === "Alphabetical");
      if (posBtn) posBtn.classList.toggle("active", sortMode === "Position");
    }
    function setSort(next) {
      sortMode = next;
      localStorage.setItem("demon_sorting_mode", sortMode);
      updateSortButtons();
      reRenderSelected();
    }
    if (alphaBtn) alphaBtn.addEventListener("click", function () { setSort("Alphabetical"); });
    if (posBtn) posBtn.addEventListener("click", function () { setSort("Position"); });

    // --- helpers -------------------------------------------------------------

    function hidePanel(id) {
      var e = el(id);
      if (e) e.style.display = "none";
    }
    function togglePanel(id, visible) {
      var e = el(id);
      if (e) e.style.display = visible ? "" : "none";
    }

    function nationContinent(code) {
      return map ? map.continentOf[code.toUpperCase()] : undefined;
    }

    function passesContinent(code) {
      if (!filter.continent) return true;
      return nationContinent(code) === filter.continent;
    }
    function passesPlayerFilter(p) {
      if (!p.nationality) return !filter.continent && !filter.nation;
      var cc = p.nationality.toUpperCase();
      if (!passesContinent(cc)) return false;
      if (filter.nation && cc !== filter.nation) return false;
      if (filter.subdivision && (p.subdivision || "").toUpperCase() !== filter.subdivision) return false;
      return true;
    }

    function populateSubdivisions(country) {
      if (!subdivisionSelect) return;
      var seen = {};
      var subs = [];
      players.forEach(function (p) {
        if (!p.nationality || p.nationality.toUpperCase() !== country || !p.subdivision) return;
        var sc = p.subdivision.toUpperCase();
        if (seen[sc]) return;
        seen[sc] = true;
        subs.push({
          code: sc,
          name: map ? map.subdivisionName(country, sc) : DL.SUBDIVISION_NAMES[country + "-" + sc] || sc,
        });
      });
      subs.sort(function (a, b) { return a.name.localeCompare(b.name); });
      subdivisionSelect.innerHTML =
        '<option value="">None</option>' +
        subs.map(function (s) {
          return '<option value="' + s.code + '">' + DL.escapeHtml(s.name) + "</option>";
        }).join("");
      subdivisionSelect.disabled = !subs.length;
    }
    function clearSubdivisions() {
      if (!subdivisionSelect) return;
      subdivisionSelect.innerHTML = '<option value="">None</option>';
      subdivisionSelect.disabled = true;
    }

    function refreshPresence() {
      if (!map) return;
      var scores = {};
      nations.forEach(function (n) {
        scores[n.code] = n.score;
        n.subdivisionList.forEach(function (s) {
          scores[n.code + "-" + s.code] = s.score;
        });
      });
      map.markPresence(scores);
    }

    function updateScope() {
      if (!scopeEl) return;
      var bits = [];
      if (filter.nation && filter.subdivision) {
        bits.push(
          map
            ? map.subdivisionName(filter.nation, filter.subdivision)
            : DL.SUBDIVISION_NAMES[filter.nation + "-" + filter.subdivision] || filter.subdivision
        );
      }
      if (filter.nation) bits.push(DL.COUNTRY_NAMES[filter.nation] || filter.nation);
      else if (filter.continent) {
        var c = DL.CONTINENTS.filter(function (x) { return x[1] === filter.continent; })[0];
        bits.push(c ? c[0] : filter.continent);
      }
      scopeEl.textContent = bits.length ? " — " + bits.join(", ") : "";
    }

    // --- list rendering ---------------------------------------------------

    function rowHtml(id, inner, score) {
      return (
        '<li class="white hover" data-id="' + DL.escapeHtml(id) + '">' +
        inner +
        '<i>' + score.toFixed(2) + "</i>" +
        "</li>"
      );
    }

    function renderList() {
      var rows;
      if (mode === "nations") {
        rows = nations.filter(function (n) { return passesContinent(n.code); });
        listEl.innerHTML = rows.length
          ? rows
              .map(function (n) {
                return rowHtml(
                  n.code,
                  DL.flagSpan(n.code) + "<b>#" + n.rank + " </b>" + DL.escapeHtml(n.name),
                  n.score
                );
              })
              .join("")
          : '<li style="cursor:default"><i>No nations yet.</i></li>';
      } else {
        rows = players.filter(passesPlayerFilter);
        listEl.innerHTML = rows.length
          ? rows
              .map(function (p) {
                return rowHtml(
                  p.name,
                  (p.nationality ? DL.flagSpan(p.nationality) : "") +
                    "<b>#" + p.rank + " </b>" +
                    DL.escapeHtml(p.name),
                  p.score
                );
              })
              .join("")
          : '<li style="cursor:default"><i>Nobody matches this filter.</i></li>';
      }

      Array.prototype.forEach.call(listEl.querySelectorAll("li[data-id]"), function (li) {
        li.addEventListener("click", function () {
          if (mode === "nations") selectNation(li.dataset.id);
          else selectPlayer(li.dataset.id);
          // phones: the profile sits below the list, so bring it into view
          // (minus the fixed 70px header)
          if (window.matchMedia("(max-width: 767px)").matches) {
            window.scrollTo({
              top: contentEl.getBoundingClientRect().top + window.pageYOffset - 80,
              behavior: "smooth"
            });
          }
        });
      });
      markActive();
    }

    function markActive() {
      Array.prototype.forEach.call(listEl.querySelectorAll("li[data-id]"), function (li) {
        li.classList.toggle("active", !!selected && li.dataset.id === selected.id);
      });
    }

    // --- individual (player) panel --------------------------------------

    function renderPlayerBeaten(p) {
      var demons = p.completed.map(function (c) { return c.demon; });
      if (sortMode === "Alphabetical") {
        show("beaten-row");
        hide("tiered-beaten-row");
        el("beaten").innerHTML = demonLinks(sortedList(demons, false));
      } else {
        hide("beaten-row");
        show("tiered-beaten-row");
        ["main", "extended", "legacy"].forEach(function (tier) {
          var subset = demons.filter(function (d) { return DL.tierOf(d.position) === tier; });
          el(tier + "-beaten").innerHTML = demonLinks(sortedList(subset, true));
        });
      }
    }

    function selectPlayer(name, push) {
      var p = players.filter(function (x) { return x.name === name; })[0];
      if (!p) return;
      selected = { kind: "player", id: name };

      welcomeEl.style.display = "none";
      contentEl.style.display = "block";
      if (push !== false) {
        history.replaceState(null, "", "statsviewer.html?player=" + encodeURIComponent(name));
      }
      markActive();

      // player detail header is the one place we show the state flag too,
      // to the right of the name (country flag | name | state flag)
      el("player-name").innerHTML =
        DL.flagSpan(p.nationality) +
        '<span style="padding:0 8px">' + DL.escapeHtml(p.name) + "</span>" +
        (p.nationality && p.subdivision
          ? DL.subdivisionFlagSpan(p.nationality, p.subdivision)
          : "<span></span>");

      el("rank").innerText = "#" + p.rank;
      el("score").innerText = p.score.toFixed(2);
      el("stats").innerText = p.completed.length;
      el("hardest").innerHTML = p.hardest ? DL.formatDemonLink(p.hardest) : "None";

      renderPlayerBeaten(p);

      el("created").innerHTML = demonLinks(sortedList(p.created, sortMode === "Position"));
      el("published").innerHTML = demonLinks(sortedList(p.published, sortMode === "Position"));
      el("verified").innerHTML = demonLinks(sortedList(p.verified, sortMode === "Position"));
      var progressed = p.progressed
        .map(function (r) { return DL.formatDemonLink(r.demon) + " (" + r.progress + "%)"; })
        .concat(grindProgressRows([p.name], demonIds(p.progressed.concat(p.completed))));
      el("progress").innerHTML = progressed.length ? progressed.join(" - ") : "None";

      // "The Grind" - levels this player is trying to beat (data/goals.js)
      var grindHtml = DL.renderGrindChips ? DL.renderGrindChips(p.name) : "";
      if (grindHtml) {
        show("grind-row");
        el("grind").innerHTML = grindHtml;
      } else {
        hide("grind-row");
      }
    }

    // --- nation panel --------------------------------------------------

    function renderNationBeaten(n) {
      var byId = {};
      n.completed.forEach(function (r) { byId[r.demon.id] = r.players; });
      var demons = n.completed.map(function (r) { return r.demon; });

      if (sortMode === "Alphabetical") {
        show("beaten-row");
        hide("tiered-beaten-row");
        el("beaten").innerHTML = demons.length
          ? sortedList(demons, false).map(function (d) { return demonLinkWithPlayers(d, byId[d.id]); }).join(" - ")
          : "None";
      } else {
        hide("beaten-row");
        show("tiered-beaten-row");
        ["main", "extended", "legacy"].forEach(function (tier) {
          var subset = demons.filter(function (d) { return DL.tierOf(d.position) === tier; });
          el(tier + "-beaten").innerHTML = subset.length
            ? sortedList(subset, true).map(function (d) { return demonLinkWithPlayers(d, byId[d.id]); }).join(" - ")
            : "None";
        });
      }
    }

    function selectNation(code, push) {
      var n = nations.filter(function (x) { return x.code === code; })[0];
      if (!n) return;
      selected = { kind: "nation", id: code };

      welcomeEl.style.display = "none";
      contentEl.style.display = "block";
      hide("grind-row"); // "The Grind" is per-player only
      if (push !== false) {
        history.replaceState(null, "", "statsviewer.html?nation=" + encodeURIComponent(code));
      }
      if (map) map.select(code);
      filter.nation = code;
      filter.subdivision = "";
      updateScope();
      renderList();

      el("player-name").innerHTML =
        DL.flagSpan(code) + '<span style="padding:0 8px">' + DL.escapeHtml(n.name) + "</span><span></span>";
      el("rank").innerText = "#" + n.rank;
      el("score").innerText = n.score.toFixed(2);
      el("players").innerText = n.players.length;
      el("stats").innerText = n.completed.length;
      el("hardest").innerHTML = n.hardest ? DL.formatDemonLink(n.hardest) : "None";

      // subdivision leaderboard (e.g. Illinois vs Indiana)
      if (el("subdivisions")) {
        el("subdivisions").innerHTML = n.subdivisionList.length
          ? n.subdivisionList
              .map(function (s, i) {
                return (
                  '<span title="' + DL.escapeHtml(s.players.join(", ")) + '">' +
                  DL.subdivisionFlagSpan(code, s.code) +
                  " <b>#" + (i + 1) + "</b> " + DL.escapeHtml(s.name) +
                  " <i>" + s.score.toFixed(2) + "</i></span>"
                );
              })
              .join(" &nbsp; ")
          : "None";
      }

      renderNationBeaten(n);

      el("created").innerHTML = creditRows(n.created, sortMode === "Position");
      el("published").innerHTML = creditRows(n.published, sortMode === "Position");
      el("verified").innerHTML = creditRows(n.verified, sortMode === "Position");
      var nationProgressed = sortedList(
        n.progressed.map(function (r) { return r.demon; }),
        sortMode === "Position"
      )
        .map(function (d) {
          var row = n.progressed.filter(function (r) { return r.demon.id === d.id; })[0];
          return demonLinkWithPlayers(d, row.players) + " (" + row.progress + "%)";
        })
        .concat(grindProgressRows(n.players, demonIds(n.progressed.concat(n.completed))));
      el("progress").innerHTML = nationProgressed.length ? nationProgressed.join(" - ") : "None";
      el("unbeaten").innerHTML = demonLinks(sortedList(n.unbeaten, sortMode === "Position"));
    }

    // --- glue -------------------------------------------------------------

    function reRenderSelected() {
      if (!selected) return;
      if (selected.kind === "player") selectPlayer(selected.id, false);
      else selectNation(selected.id, false);
    }

    function onFilterChanged() {
      updateScope();
      renderList();
      if (mode === "nations") {
        if (filter.nation) selectNation(filter.nation, false);
      }
    }

    function setMode(next) {
      if (next === mode) return;
      mode = next;

      Array.prototype.forEach.call(root.querySelectorAll("#sv-modes [data-mode]"), function (b) {
        b.classList.toggle("active", b.dataset.mode === mode);
      });

      togglePanel("subdivision-toggle-panel", mode === "individual" && !!map);
      togglePanel("subdivision-panel", mode === "individual");
      el("players-row").style.display = mode === "nations" ? "" : "none";
      el("unbeaten-row").style.display = mode === "nations" ? "" : "none";
      if (el("subdivisions-row")) el("subdivisions-row").style.display = mode === "nations" && useSubdivisions ? "" : "none";
      hide("grind-row"); // repopulated when a player is picked

      // start the new mode from a clean slate (keep only the continent view)
      filter.nation = "";
      filter.subdivision = "";
      if (subdivisionSelect) clearSubdivisions();
      if (map) {
        map.deselect();
        // nations mode ranks whole countries, so drop the state borders (and
        // let a selected country fill solid); individual mode follows the box
        if (mode === "nations") map.hideSubdivisions();
        else if (subdivisionCheckbox && subdivisionCheckbox.checked) map.showSubdivisions();
        refreshPresence();
      }

      selected = null;
      contentEl.style.display = "none";
      welcomeEl.style.display = "";
      welcomeEl.textContent =
        mode === "nations"
          ? "Pick a country on the left, or click one on the map."
          : "Click on a player's name on the left to get started!";

      updateScope();
      renderList();
    }

    // --- boot ------------------------------------------------------------

    el("players-row").style.display = "none";
    el("unbeaten-row").style.display = "none";
    if (el("subdivisions-row")) el("subdivisions-row").style.display = "none";
    hide("grind-row");
    // no Legacy demons on the list -> drop the empty "Legacy List" tier row
    if (el("legacy-beaten-row") && !DL.sortedDemons().some(function (d) { return DL.tierOf(d.position) === "legacy"; })) {
      el("legacy-beaten-row").style.display = "none";
    }
    updateSortButtons();
    renderList();

    if (initialNation) {
      var n = nations.filter(function (x) { return x.code === initialNation.toUpperCase(); })[0];
      if (n) {
        setMode("nations");
        selectNation(n.code, false);
      }
    } else if (initialPlayerName) {
      var p = players.filter(function (x) { return x.name === initialPlayerName; })[0];
      if (p) selectPlayer(p.name, false);
    }
  };
})(window.DL || (window.DL = {}));

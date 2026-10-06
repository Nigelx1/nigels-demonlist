"use strict";
// -----------------------------------------------------------------------------
// Shared helpers used by both the overview/demon pages (demonlist.js) and the
// stats viewer (statsviewer.js). Plain classic script (no bundler, no ES
// modules) so the site works by just opening the HTML files directly.
//
// Players are identified purely by their exact `player` name string as it
// appears in a demon's `records` array (there's no separate players table) -
// keep spelling/casing consistent for the same person across every demon.
// -----------------------------------------------------------------------------

var DL = window.DL || {};

DL.escapeHtml = function (str) {
  var div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
};

DL.sortedDemons = function () {
  return window.DEMONS.slice().sort(function (a, b) {
    return a.position - b.position;
  });
};

DL.demonById = function (id) {
  id = Number(id);
  return window.DEMONS.find(function (d) {
    return d.id === id;
  });
};

DL.tierOf = function (position) {
  var cfg = window.SITE;
  if (position <= cfg.mainListSize) return "main";
  if (cfg.extendedListSize == null || position <= cfg.extendedListSize) return "extended";
  return "legacy";
};

// -----------------------------------------------------------------------------
// Per-demon Position History (pointercrate's demon-page table). Derived purely
// from window.CHANGELOG (data/changelog.js) so there's a single source of
// truth: log an add / move / remove there and every affected demon's history
// updates itself, including "X was added above" style rows for demons that
// didn't move themselves but got shifted.
//
// Contract: every position change must be logged in data/changelog.js as an
// `add` (with `at`), `move` (with `from` + `to`) or `remove` (with `from`)
// item. The initial ordering is reconstructed by undoing every logged event
// from the current list, so an unlogged reorder would desync it.
//
// Returns [{ date, position, delta, reason }] oldest-first; `delta` is the
// signed change from the previous row (0 on the first row).
// -----------------------------------------------------------------------------
DL.positionHistoryFor = function (demon) {
  var log = window.CHANGELOG || [];

  // CHANGELOG is newest-first (entries, and items within an entry) - flip both
  // to get position-affecting events oldest-first.
  var events = [];
  log.slice().reverse().forEach(function (entry) {
    (entry.items || []).slice().reverse().forEach(function (it) {
      if (it.kind === "add" && it.at != null) {
        events.push({ date: entry.date, kind: "add", id: it.demonId, name: it.demon, at: it.at, text: it.text });
      } else if (it.kind === "move" && it.from != null && it.to != null) {
        events.push({ date: entry.date, kind: "move", id: it.demonId, name: it.demon, from: it.from, to: it.to, text: it.text });
      } else if (it.kind === "remove" && it.from != null) {
        events.push({ date: entry.date, kind: "remove", id: it.demonId, name: it.demon, from: it.from, text: it.text });
      }
    });
  });

  var created = (window.SITE && window.SITE.listCreated) || (events[0] && events[0].date) || null;

  // Start from the current ordering and rewind it to the list's first day by
  // undoing every event, newest first.
  var order = DL.sortedDemons().map(function (d) { return { id: d.id, name: d.name }; });
  function indexOfId(id) {
    for (var i = 0; i < order.length; i++) if (order[i].id === id) return i;
    return -1;
  }
  events.slice().reverse().forEach(function (ev) {
    var i;
    if (ev.kind === "add") {
      i = indexOfId(ev.id);
      if (i !== -1) order.splice(i, 1);
    } else if (ev.kind === "move") {
      i = indexOfId(ev.id);
      if (i !== -1) order.splice(Math.min(ev.from - 1, order.length - 1), 0, order.splice(i, 1)[0]);
    } else if (ev.kind === "remove") {
      order.splice(Math.min(ev.from - 1, order.length), 0, { id: ev.id, name: ev.name });
    }
  });

  function posOf(id) {
    var i = indexOfId(id);
    return i === -1 ? null : i + 1;
  }

  var rows = [];
  var selfAdded = events.some(function (ev) { return ev.kind === "add" && ev.id === demon.id; });
  if (!selfAdded) {
    var p0 = posOf(demon.id);
    if (p0 != null) rows.push({ date: created, position: p0, reason: "Added to list" });
  }

  events.forEach(function (ev) {
    var before = posOf(demon.id);

    if (ev.kind === "add") {
      order.splice(Math.max(0, Math.min(ev.at - 1, order.length)), 0, { id: ev.id, name: ev.name });
    } else if (ev.kind === "move") {
      var mi = indexOfId(ev.id);
      if (mi !== -1) order.splice(Math.max(0, Math.min(ev.to - 1, order.length - 1)), 0, order.splice(mi, 1)[0]);
    } else if (ev.kind === "remove") {
      var ri = indexOfId(ev.id);
      if (ri !== -1) order.splice(ri, 1);
    }

    var after = posOf(demon.id);
    if (after == null) return;

    if (ev.kind === "add" && ev.id === demon.id) {
      rows.push({ date: ev.date, position: after, reason: "Added to list" });
      return;
    }
    if (before == null || after === before) return;

    // reason strings mirror pointercrate's movements-reason.* exactly
    var who = ev.name || "A demon";
    var reason;
    if (ev.kind === "move" && ev.id === demon.id) {
      reason = ev.text || "Moved";
    } else if (ev.kind === "add") {
      reason = who + " was added above";
    } else if (ev.kind === "remove") {
      reason = who + " was removed";
    } else {
      reason = who + (after > before ? " was moved up past this demon" : " was moved down past this demon");
    }
    rows.push({ date: ev.date, position: after, reason: reason });
  });

  rows.forEach(function (r, i) {
    r.delta = i === 0 ? 0 : r.position - rows[i - 1].position;
  });
  return rows;
};

// gdladder difficulty tier ("Easy".."Extreme"|"Official") -> css modifier + label
DL.difficultyClass = function (difficulty) {
  return "diff-" + String(difficulty || "extreme").toLowerCase();
};
DL.difficultyLabel = function (difficulty) {
  var d = String(difficulty || "");
  if (!d) return "Demon";
  if (d === "Official") return "Official";
  return d + " Demon";
};

// The 16:9 preview block for a demon: its `thumbnailUrl` screenshot when one is
// set, otherwise a difficulty-coloured card showing the level name. `body` is
// appended inside (e.g. a video play button). Used on the overview panels, the
// home page and the demon-page video poster.
DL.demonThumbHtml = function (demon, extraClass, body) {
  var cls = "thumb ratio-16-9" + (extraClass ? " " + extraClass : "");
  if (demon.thumbnailUrl) {
    return (
      '<div class="' + cls + '" style="background-image:url(' +
      DL.escapeHtml(demon.thumbnailUrl) + ')">' + (body || "") + "</div>"
    );
  }
  return (
    '<div class="' + cls + " demon-card " + DL.difficultyClass(demon.difficulty) + '">' +
      '<span class="demon-card-name">' + DL.escapeHtml(demon.name) + "</span>" +
      '<span class="demon-card-diff">' + DL.escapeHtml(DL.difficultyLabel(demon.difficulty)) + "</span>" +
      (body || "") +
    "</div>"
  );
};

DL.tierLabel = function (tier) {
  return { main: "Main List", extended: "Extended List", legacy: "Legacy List" }[tier];
};

// YouTube only generates /maxresdefault.jpg for videos uploaded in HD - for the
// rest it 404s (or serves a 120x90 grey placeholder), leaving a blank thumbnail
// (e.g. Bad Trip's showcase). This walks every element whose inline style points
// a background at a ytimg maxresdefault and, if that image doesn't really load,
// silently swaps in /sddefault.jpg (always present, 4:3 - `background-size:cover`
// crops the letterboxing). Runs once on DOM ready; safe to call again.
DL.fixYouTubeThumbs = function (root) {
  var scope = root || document;
  var els = scope.querySelectorAll('[style*="ytimg.com/vi/"][style*="maxresdefault"]');
  Array.prototype.forEach.call(els, function (el) {
    var m = /url\((["']?)(https:\/\/i\.ytimg\.com\/vi\/[\w-]+)\/maxresdefault\.jpg\1\)/.exec(
      el.getAttribute("style") || ""
    );
    if (!m) return;
    var base = m[2];
    var probe = new Image();
    probe.onerror = function () {
      el.style.backgroundImage = "url(" + base + "/sddefault.jpg)";
    };
    probe.onload = function () {
      // the "no maxres" grey placeholder is 120x90
      if (probe.naturalWidth && probe.naturalWidth <= 121) {
        el.style.backgroundImage = "url(" + base + "/sddefault.jpg)";
      }
    };
    probe.src = base + "/maxresdefault.jpg";
  });
};

if (typeof document !== "undefined") {
  var _fix = function () {
    DL.fixYouTubeThumbs();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _fix);
  } else {
    _fix();
  }
}

// Rough gdladder-rating estimate per difficulty tier (from this list's medians)
// - only a fallback for a demon added without a numeric `rating`.
DL.RATING_BY_DIFFICULTY = {
  Extreme: 24,
  Insane: 16.5,
  Hard: 11,
  Medium: 7,
  Easy: 2.5,
  Official: 3,
};

// The number a demon is ordered and scored by. An extreme on the AREDL follows
// its AREDL placement, turned into a GD Demon Ladder-style rating by a curve
// fit to the whole AREDL (SITE.aredlFit - tools/refresh-order.py fits it and
// keeps each demon's aredlPosition); everything else uses its own GDDL rating.
DL.demonRating = function (demon) {
  var fit = window.SITE && window.SITE.aredlFit;
  if (fit && typeof demon.aredlPosition === "number")
    return fit.a + fit.b * Math.pow(demon.aredlPosition, fit.exponent);
  if (typeof demon.rating === "number") return demon.rating;
  return DL.RATING_BY_DIFFICULTY[demon.difficulty] || 3;
};

// Highest rating on the list - anchors the top of the scoring curve.
DL.topRating = function () {
  if (DL._topRating == null) {
    DL._topRating =
      window.DEMONS.reduce(function (m, d) {
        var r = DL.demonRating(d);
        return r > m ? r : m;
      }, 0) || 1;
  }
  return DL._topRating;
};

// Points for a 100% completion: topScore for the #1 demon, then an exponential
// fall-off by DL.demonRating (curve fit to the AREDL, no floor). See
// data/config.js.
DL.scoreAt100 = function (demon) {
  var s = window.SITE.scoring;
  if (DL.tierOf(demon.position) === "legacy") return s.legacyScore;
  return s.topScore * Math.pow(s.base, DL.demonRating(demon) - DL.topRating());
};

DL.recordScore = function (demon, progress) {
  var tier = DL.tierOf(demon.position);
  var s = window.SITE.scoring;

  if (tier === "legacy") {
    return progress >= 100 ? s.legacyScore : 0;
  }

  var requirement = demon.requirementPercent || 100;
  if (progress < requirement) return 0;

  var full = DL.scoreAt100(demon);
  if (progress >= 100) return full;

  var floor = full * s.requirementScoreFraction;
  var frac = (progress - requirement) / (100 - requirement || 1);
  return floor + frac * (full - floor);
};

// Wraps a demon's name for inline display, following the same Main/Extended/
// Legacy visual convention pointercrate's stats viewer uses for demon links
// (bold / plain / dimmed italic).
DL.formatDemonLink = function (demon) {
  var tier = DL.tierOf(demon.position);
  var href = DL.demonUrl(demon.id);
  var name = DL.escapeHtml(demon.name);
  var inner = '<a href="' + href + '">' + name + "</a>";
  if (tier === "main") return "<b>" + inner + "</b>";
  if (tier === "extended") return "<span>" + inner + "</span>";
  return '<i style="opacity:.5">' + inner + "</i>";
};

DL.demonUrl = function (id) {
  return "demon.html?id=" + encodeURIComponent(id);
};

DL.playerUrl = function (name) {
  return "statsviewer.html?player=" + encodeURIComponent(name);
};

DL.playerLink = function (name) {
  return '<a class="underdotted" href="' + DL.playerUrl(name) + '">' + DL.escapeHtml(name) + "</a>";
};

// Whether `name` holds at least one record on the list, i.e. has an entry in
// the stats viewer. Real level publishers/creators are actual Geometry Dash
// players and often aren't anyone in your community, so a demon's credited
// publisher/creator isn't necessarily linkable - use creditLink for those.
DL.isCommunityMember = function (name) {
  if (!DL._memberSet) {
    DL._memberSet = {};
    window.DEMONS.forEach(function (demon) {
      (demon.records || []).forEach(function (r) {
        DL._memberSet[r.player] = true;
      });
    });
  }
  return !!DL._memberSet[name];
};

DL.creditLink = function (name) {
  return DL.isCommunityMember(name) ? DL.playerLink(name) : DL.escapeHtml(name);
};

// Best-effort YouTube/Twitch embed URL + host label, mirroring pointercrate's
// (intentionally simple/fragile) video-URL parsing.
DL.embedVideo = function (video) {
  if (!video) return null;
  try {
    var url = new URL(video);
    if (url.hostname.indexOf("youtube.com") !== -1) {
      var v = url.searchParams.get("v");
      if (v) return { url: "https://www.youtube.com/embed/" + v, host: "YouTube" };
    }
    if (url.hostname === "youtu.be") {
      return { url: "https://www.youtube.com/embed/" + url.pathname.slice(1), host: "YouTube" };
    }
    if (url.hostname.indexOf("twitch.tv") !== -1) {
      var parts = url.pathname.split("/videos/");
      if (parts[1]) {
        return {
          url: "https://player.twitch.tv/?video=" + parts[1] + "&autoplay=false&parent=" + location.hostname,
          host: "Twitch",
        };
      }
    }
    if (url.hostname.indexOf("vimeo.com") !== -1) {
      return { url: null, host: "Vimeo" };
    }
  } catch (e) {
    /* not a valid URL - fall through */
  }
  return { url: null, host: null };
};

// Country / subdivision display names. Only covers what's actually in
// data/demons.js - add entries as you add more nationalities. Flag SVGs come
// from pointercrate's set (github.com/stadust/pointercrate,
// pointercrate-demonlist-pages/static/images/flags) - grab more from there and
// drop them in static/images/flags/<cc>.svg (country) or
// static/images/flags/<cc>/<sub>.svg (subdivision) as needed.
//
// Next to a player we only ever show the COUNTRY flag (a per-record
// `subdivision` also lives in data/demons.js). The state matters in two other
// places: the Stats Viewer's interactive world map (click a state to rank it)
// and the "Nations" view, where subdivisions are listed by name. Subdivision
// names for the map come from the SVG's own <title>s; this table is the
// fallback the map isn't needed for.
DL.COUNTRY_NAMES = {
  US: "United States",
  MX: "Mexico",
};
DL.SUBDIVISION_NAMES = {
  "US-IL": "Illinois",
  "US-IN": "Indiana",
  "US-CA": "California",
};

// Continents the map/continent filter knows about, in the order the SVG groups
// them. Value = the <g class="continent"> id in static/js/worldmap.data.js.
DL.CONTINENTS = [
  ["Africa", "africa"],
  ["Asia", "asia"],
  ["Australia", "australia"],
  ["Europe", "europe"],
  ["North America", "north-america"],
  ["Central America", "central-america"],
  ["South America", "south-america"],
];

// Callers of this are always pages under /demonlist/, hence the relative "../".
DL.flagSpan = function (countryCode) {
  if (!countryCode) return "";
  var cc = countryCode.toUpperCase();
  var countryName = DL.COUNTRY_NAMES[cc] || countryCode;
  var src = "../static/images/flags/" + countryCode.toLowerCase() + ".svg";

  return (
    '<span class="flag-icon" style="background-image:url(' + src + ')" title="' + DL.escapeHtml(countryName) + '"></span>'
  );
};

// Country flag + subdivision flag side by side, for the Nations view header.
DL.subdivisionFlagSpan = function (countryCode, subdivisionCode) {
  if (!countryCode || !subdivisionCode) return "";
  var cc = countryCode.toUpperCase();
  var key = cc + "-" + subdivisionCode.toUpperCase();
  var name = DL.SUBDIVISION_NAMES[key] || subdivisionCode.toUpperCase();
  var src =
    "../static/images/flags/" + countryCode.toLowerCase() + "/" + subdivisionCode.toLowerCase() + ".svg";
  return (
    '<span class="flag-icon" style="background-image:url(' + src + ')" title="' +
    DL.escapeHtml(name + ", " + (DL.COUNTRY_NAMES[cc] || cc)) + '"></span>'
  );
};

// Aggregates every record across every demon into one row per unique player
// name: total score, rank, hardest demon beaten (100%), beaten/in-progress
// demon lists. Used by the stats viewer.
//
// Only players who actually hold a record are included here - a demon's
// publisher/creators/verifier are real Geometry Dash players (whoever
// actually made the level), not necessarily anyone in your community, so
// they don't get a ranking entry just for being credited on a level. If one
// of your own record holders also happens to be a demon's publisher/creator/
// verifier, that still shows up via their created/published/verified lists
// (computed separately below), it just doesn't fabricate a ranking entry for
// people who never actually beat anything on your list.
DL.aggregatePlayers = function () {
  var byName = {};

  function ensure(name) {
    var entry = byName[name];
    if (!entry) {
      entry = byName[name] = {
        name: name,
        nationality: null,
        subdivision: null, // state; used by the map + Nations view, not shown as a flag next to the player
        score: 0,
        completed: [], // records with progress === 100
        progressed: [], // records with progress < 100
        hardest: null,
        created: [],
        published: [],
        verified: [],
      };
    }
    return entry;
  }

  window.DEMONS.forEach(function (demon) {
    (demon.records || []).forEach(function (record) {
      var entry = ensure(record.player);
      if (!entry.nationality && record.nationality) {
        entry.nationality = record.nationality;
        entry.subdivision = record.subdivision || null;
      }

      entry.score += DL.recordScore(demon, record.progress);

      var withDemon = { demon: demon, progress: record.progress };
      if (record.progress >= 100) {
        entry.completed.push(withDemon);
        if (!entry.hardest || demon.position < entry.hardest.position) entry.hardest = demon;
      } else {
        entry.progressed.push(withDemon);
      }
    });
  });

  // Credit created/published/verified only to players who already have a
  // ranking entry (see comment above) - this never creates new entries.
  window.DEMONS.forEach(function (demon) {
    (demon.creators && demon.creators.length ? demon.creators : [demon.publisher]).forEach(function (name) {
      if (byName[name]) byName[name].created.push(demon);
    });
    if (byName[demon.publisher]) byName[demon.publisher].published.push(demon);
    var verifier = demon.verifier || demon.publisher;
    if (byName[verifier]) byName[verifier].verified.push(demon);
  });

  var players = Object.keys(byName).map(function (name) {
    return byName[name];
  });
  players.sort(function (a, b) {
    return b.score - a.score;
  });
  players.forEach(function (p, i) {
    p.rank = i + 1;
  });

  return players;
};

DL.playerByName = function (name) {
  return DL.aggregatePlayers().find(function (p) {
    return p.name === name;
  });
};

// Rolls the player ranking up by country: one row per nationality, scored by
// the sum of that country's players' scores, plus the union of every demon
// anyone from the country has beaten / is working on / made / published /
// verified (each carrying the list of which countrymen it was), the country's
// hardest demon, and the demons nobody from the country has touched. Also
// buckets the country's players by `subdivision` (state) so the individual
// stats viewer can rank e.g. Illinois vs Indiana. Used by the Nations view.
DL.aggregateNations = function () {
  var players = DL.aggregatePlayers();
  var byCode = {};

  players.forEach(function (p) {
    if (!p.nationality) return;
    var cc = p.nationality.toUpperCase();
    var nation =
      byCode[cc] ||
      (byCode[cc] = {
        code: cc,
        name: DL.COUNTRY_NAMES[cc] || cc,
        score: 0,
        players: [], // names
        subdivisions: {},
        completed: [], // { demon, players: [names], progress: 100 }
        progressed: [], // { demon, players, progress }
        created: [], // { demon, players }
        published: [],
        verified: [],
        hardest: null,
        unbeaten: [],
      });

    nation.score += p.score;
    nation.players.push(p.name);

    if (p.subdivision) {
      var sc = p.subdivision.toUpperCase();
      var sub =
        nation.subdivisions[sc] ||
        (nation.subdivisions[sc] = {
          code: sc,
          name: DL.SUBDIVISION_NAMES[cc + "-" + sc] || sc,
          score: 0,
          players: [],
        });
      sub.score += p.score;
      sub.players.push(p.name);
    }
  });

  var nations = Object.keys(byCode).map(function (cc) {
    return byCode[cc];
  });

  nations.forEach(function (nation) {
    var isMember = {};
    nation.players.forEach(function (name) {
      isMember[name] = true;
    });

    var beaten = {};
    var progress = {};

    window.DEMONS.forEach(function (demon) {
      (demon.records || []).forEach(function (record) {
        if (!isMember[record.player]) return;
        if (record.progress >= 100) {
          (beaten[demon.id] || (beaten[demon.id] = { demon: demon, players: [], progress: 100 })).players.push(record.player);
        } else {
          var row = progress[demon.id] || (progress[demon.id] = { demon: demon, players: [], progress: 0 });
          row.players.push(record.player);
          row.progress = Math.max(row.progress, record.progress);
        }
      });
    });

    window.DEMONS.forEach(function (demon) {
      var creators = (demon.creators && demon.creators.length ? demon.creators : [demon.publisher]).filter(function (n) {
        return isMember[n];
      });
      if (creators.length) nation.created.push({ demon: demon, players: creators });
      if (isMember[demon.publisher]) nation.published.push({ demon: demon, players: [demon.publisher] });
      var verifier = demon.verifier || demon.publisher;
      if (isMember[verifier]) nation.verified.push({ demon: demon, players: [verifier] });
    });

    nation.completed = Object.keys(beaten).map(function (id) {
      return beaten[id];
    });
    nation.progressed = Object.keys(progress)
      .map(function (id) {
        return progress[id];
      })
      .filter(function (row) {
        return !beaten[row.demon.id];
      });

    var clearedIds = {};
    nation.completed.forEach(function (row) {
      clearedIds[row.demon.id] = true;
      if (!nation.hardest || row.demon.position < nation.hardest.position) nation.hardest = row.demon;
    });
    nation.verified.forEach(function (row) {
      clearedIds[row.demon.id] = true;
      if (!nation.hardest || row.demon.position < nation.hardest.position) nation.hardest = row.demon;
    });

    nation.unbeaten = DL.sortedDemons().filter(function (demon) {
      return !clearedIds[demon.id];
    });

    nation.subdivisionList = Object.keys(nation.subdivisions)
      .map(function (sc) {
        return nation.subdivisions[sc];
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
  });

  nations.sort(function (a, b) {
    return b.score - a.score;
  });
  nations.forEach(function (nation, i) {
    nation.rank = i + 1;
  });

  return nations;
};

window.DL = DL;

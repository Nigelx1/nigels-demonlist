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
  var mainSize = cfg.mainListSize;
  // "extremes": the Main List is exactly the Extreme Demons (always sorted first)
  if (mainSize === "extremes") {
    if (DL._extremeCount == null) {
      DL._extremeCount = (window.DEMONS || []).filter(function (d) { return d.difficulty === "Extreme"; }).length;
    }
    mainSize = DL._extremeCount;
  }
  if (position <= mainSize) return "main";
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
// Generated from the world map's <title>s - every country / subdivision it knows.
DL.COUNTRY_NAMES = {"CU":"Cuba","BQ":"Caribbean Netherlands","JM":"Jamaica","PR":"Puerto Rico","DO":"Dominican Republic","HT":"Haiti","SV":"El Salvador","GT":"Guatemala","HN":"Honduras","NI":"Nicaragua","PA":"Panama","CR":"Costa Rica","MX":"Mexico","MS":"Montserrat","VG":"British Virgin Islands","VI":"U.S. Virgin Islands","KN":"St. Kitts & Nevis","KY":"Cayman Islands","AI":"Anguilla","GD":"Grenada","LC":"St. Lucia","VC":"St. Vincent & Grenadines","TC":"Turks & Caicos Islands","BB":"Barbados","AG":"Antigua & Barbuda","SX":"Sint Maarten","DM":"Dominica","TT":"Trinidad & Tobago","BS":"Bahamas","BZ":"Belize","BM":"Bermuda","BR":"Brazil","SR":"Suriname","GY":"Guyana","VE":"Venezuela","UY":"Uruguay","PY":"Paraguay","EC":"Ecuador","CO":"Colombia","PE":"Peru","BO":"Bolivia","AW":"Aruba","GS":"South Georgia & South Sandwich Islands","FK":"Falkland Islands","CW":"Curaçao","TN":"Tunisia","ER":"Eritrea","GW":"Guinea-Bissau","GN":"Guinea","SL":"Sierra Leone","SO":"Somalia","GA":"Gabon","SZ":"Eswatini","LS":"Lesotho","MG":"Madagascar","ZA":"South Africa","SH":"St. Helena","SC":"Seychelles","CV":"Cape Verde","ST":"São Tomé & Príncipe","MU":"Mauritius","KM":"Comoros","RS":"Serbia","GR":"Greece","VA":"Vatican City","SM":"San Marino","MD":"Moldova","EE":"Estonia","NL":"Netherlands","IE":"Ireland","ES":"Spain","CY":"Cyprus","TR":"Türkiye","UA":"Ukraine","IM":"Isle of Man","MC":"Monaco","GI":"Gibraltar","GG":"Guernsey","JE":"Jersey","LI":"Liechtenstein","MT":"Malta","FO":"Faroe Islands","LK":"Sri Lanka","LA":"Laos","PH":"Philippines","MY":"Malaysia","OM":"Oman","AE":"United Arab Emirates","YE":"Yemen","IL":"Israel","SY":"Syria","JO":"Jordan","IQ":"Iraq","RU":"Russia","AZ":"Azerbaijan","AM":"Armenia","GE":"Georgia","KP":"North Korea","KR":"South Korea","JP":"Japan","BD":"Bangladesh","BT":"Bhutan","NP":"Nepal","MN":"Mongolia","AF":"Afghanistan","PK":"Pakistan","KG":"Kyrgyzstan","IR":"Iran","TM":"Turkmenistan","TJ":"Tajikistan","UZ":"Uzbekistan","IN":"India","KZ":"Kazakhstan","CN":"China","HK":"Hong Kong SAR China","SG":"Singapore","MV":"Maldives","BH":"Bahrain","PS":"Palestinian Territories","KI":"Kiribati","NZ":"New Zealand","ID":"Indonesia","TK":"Tokelau","NF":"Norfolk Island","GU":"Guam","PN":"Pitcairn Islands","NR":"Nauru","TV":"Tuvalu","MH":"Marshall Islands","AS":"American Samoa","CK":"Cook Islands","NU":"Niue","TO":"Tonga","PW":"Palau","MP":"Northern Mariana Islands","FM":"Micronesia","WS":"Samoa","VU":"Vanuatu","FJ":"Fiji","SB":"Solomon Islands","AC":"Ascension Island","AD":"Andorra","AL":"Albania","AN":"Curaçao","AO":"Angola","AQ":"Antarctica","AR":"Argentina","AT":"Austria","AU":"Australia","AX":"Åland Islands","BA":"Bosnia & Herzegovina","BE":"Belgium","BF":"Burkina Faso","BG":"Bulgaria","BI":"Burundi","BJ":"Benin","BL":"St. Barthélemy","BN":"Brunei","BU":"Myanmar (Burma)","BV":"Bouvet Island","BW":"Botswana","BY":"Belarus","CA":"Canada","CC":"Cocos (Keeling) Islands","CD":"Congo - Kinshasa","CF":"Central African Republic","CG":"Congo - Brazzaville","CH":"Switzerland","CI":"Côte d’Ivoire","CL":"Chile","CM":"Cameroon","CP":"Clipperton Island","CQ":"Sark","CS":"Serbia","CX":"Christmas Island","CZ":"Czechia","DD":"Germany","DE":"Germany","DG":"Diego Garcia","DJ":"Djibouti","DK":"Denmark","DY":"Benin","DZ":"Algeria","EA":"Ceuta & Melilla","EG":"Egypt","EH":"Western Sahara","ET":"Ethiopia","EU":"European Union","EZ":"Eurozone","FI":"Finland","FR":"France","FX":"France","GB":"United Kingdom","GF":"French Guiana","GH":"Ghana","GL":"Greenland","GM":"Gambia","GP":"Guadeloupe","GQ":"Equatorial Guinea","HM":"Heard & McDonald Islands","HR":"Croatia","HU":"Hungary","HV":"Burkina Faso","IC":"Canary Islands","IO":"British Indian Ocean Territory","IS":"Iceland","IT":"Italy","KE":"Kenya","KH":"Cambodia","KW":"Kuwait","LB":"Lebanon","LR":"Liberia","LT":"Lithuania","LU":"Luxembourg","LV":"Latvia","LY":"Libya","MA":"Morocco","ME":"Montenegro","MF":"St. Martin","MK":"North Macedonia","ML":"Mali","MM":"Myanmar (Burma)","MO":"Macao SAR China","MQ":"Martinique","MR":"Mauritania","MW":"Malawi","MZ":"Mozambique","NA":"Namibia","NC":"New Caledonia","NE":"Niger","NG":"Nigeria","NH":"Vanuatu","NO":"Norway","PF":"French Polynesia","PG":"Papua New Guinea","PL":"Poland","PM":"St. Pierre & Miquelon","PT":"Portugal","QA":"Qatar","QO":"Outlying Oceania","RE":"Réunion","RH":"Zimbabwe","RO":"Romania","RW":"Rwanda","SA":"Saudi Arabia","SD":"Sudan","SE":"Sweden","SI":"Slovenia","SJ":"Svalbard & Jan Mayen","SK":"Slovakia","SN":"Senegal","SS":"South Sudan","SU":"Russia","TA":"Tristan da Cunha","TD":"Chad","TF":"French Southern Territories","TG":"Togo","TH":"Thailand","TL":"Timor-Leste","TP":"Timor-Leste","TW":"Taiwan","TZ":"Tanzania","UG":"Uganda","UK":"United Kingdom","UM":"U.S. Outlying Islands","UN":"United Nations","US":"United States","VD":"Vietnam","VN":"Vietnam","WF":"Wallis & Futuna","XA":"Pseudo-Accents","XB":"Pseudo-Bidi","XK":"Kosovo","YD":"Yemen","YT":"Mayotte","YU":"Serbia","ZM":"Zambia","ZR":"Congo - Kinshasa","ZW":"Zimbabwe"};
DL.SUBDIVISION_NAMES = {"MX-JAL":"Jalisco","MX-AGU":"Aguascalientes","MX-SLP":"San Luis Potosí","MX-NLE":"Nuevo León","MX-TAM":"Tamaulipas","MX-COA":"Coahuila","MX-ROO":"Quintana Roo","MX-YUC":"Yucatán","MX-GRO":"Guerrero","MX-CAM":"Campeche","MX-CHP":"Chiapas","MX-OAX":"Oaxaca","MX-CMX":"Ciudad de México","MX-MOR":"Morelos","MX-PUE":"Puebla","MX-HID":"Hidalgo","MX-MEX":"México","MX-QUE":"Queretaro","MX-MIC":"Michoacan","MX-GUA":"Guanajuato","MX-TAB":"Tabasco","MX-VER":"Veracruz","MX-COL":"Colima","MX-ZAC":"Zacatecas","MX-DUR":"Durango","MX-CHH":"Chihuahua","MX-SIN":"Sinaloa","MX-BCN":"Baja California","MX-SON":"Sonora","MX-BCS":"Baja California Sur","MX-NAY":"Nayarit","US-WA":"Washington","US-DE":"Delaware","US-MD":"Maryland","US-WV":"West Virginia","US-NY":"New York","US-NJ":"New Jersey","US-PA":"Pennsylvania","US-VA":"Virginia","US-KY":"Kentucky","US-OH":"Ohio","US-IN":"Indiana","US-IL":"Illinois","US-MI":"Michigan","US-WI":"Wisconsin","US-CT":"Connecticut","US-RI":"Rhode Island","US-VT":"Vermont","US-NH":"New Hampshire","US-MA":"Massachusetts","US-ME":"Maine","US-AL":"Alabama","US-GA":"Georgia","US-SC":"South Carolina","US-FL":"Florida","US-MS":"Mississippi","US-TN":"Tennessee","US-NC":"North Carolina","US-TX":"Texas","US-OK":"Oklahoma","US-NM":"New Mexico","US-NE":"Nebraska","US-SD":"South Dakota","US-KS":"Kansas","US-CO":"Colorado","US-ND":"North Dakota","US-AR":"Arkansas","US-MO":"Missouri","US-LA":"Louisiana","US-IA":"Iowa","US-MN":"Minnesota","US-AZ":"Arizona","US-NV":"Nevada","US-CA":"California","US-UT":"Utah","US-OR":"Oregon","US-MT":"Montana","US-ID":"Idaho","US-WY":"Wyoming","US-HI":"Hawaii","US-AK":"Alaska","US-DC":"Washington, District of Columbia","CA-MB":"Manitoba","CA-NT":"Northwest Territories","CA-NL":"Newfoundland and Labrador","CA-NU":"Nunavut","CA-QC":"Quebec","CA-BC":"British Columbia","CA-SK":"Saskatchewan","CA-AB":"Alberta","CA-ON":"Ontario","CA-NB":"New Brunswick","CA-NS":"Nova Scotia","CA-PE":"Prince Edward Island","CA-YT":"Yukon","BR-SP":"São Paulo","BR-RJ":"Rio de Janeiro","BR-ES":"Espírito Santo","BR-RS":"Rio Grande do Sul","BR-SC":"Santa Catarina","BR-PR":"Paraná","BR-MG":"Minas Gerais","BR-SE":"Sergipe","BR-AL":"Alagoas","BR-PE":"Pernambuco","BR-PB":"Paraíba","BR-RN":"Rio Grande do Norte","BR-BA":"Bahia","BR-CE":"Ceará","BR-PI":"Piauí","BR-MA":"Maranhão","BR-MS":"Mato Grosso do Sul","BR-MT":"Mato Grosso","BR-PA":"Pará","BR-AP":"Amapá","BR-TO":"Tocantins","BR-AC":"Acre","BR-RO":"Rondônia","BR-AM":"Amazonas","BR-RR":"Roraima","BR-GO":"Goiás","BR-DF":"Distrito Federal","CL-AP":"Arica y Parinacota","CL-AN":"Antofagasta","CL-TA":"Tarapacá","CL-CO":"Coquimbo","CL-LI":"O'Higgins","CL-BI":"Biobío","CL-LR":"Los Ríos","CL-AT":"Atacama","CL-RM":"Región Metropolitana de Santiago","CL-VS":"Valparaíso","CL-ML":"Maule","CL-NB":"Ñuble","CL-AR":"Araucanía","CL-AI":"Aysén","CL-LL":"Los Lagos","CL-MA":"Magallanes","AR-Z":"Provincia de Santa Cruz","AR-U":"Provincia del Chubut","AR-C":"Ciudad Autónoma de Buenos Aires","AR-B":"Provincia de Buenos Aires","AR-Q":"Provincia de Neuquén","AR-R":"Provincia de Río Negro","AR-L":"Provincia de La Pampa","AR-M":"Provincia de Mendoza","AR-D":"Provincia de San Luis","AR-X":"Provincia de Córdoba","AR-S":"Provincia de Santa Fe","AR-H":"Provincia del Chaco","AR-P":"Provincia de Formosa","AR-F":"Provincia de La Rioja","AR-J":"Provincia de San Juan","AR-K":"Provincia de Catamarca","AR-G":"Provincia de Santiago del Estero","AR-T":"Provincia de Tucumán","AR-A":"Provincia de Salta","AR-Y":"Provincia de Jujuy","AR-E":"Provincia de Entre Ríos","AR-W":"Provincia de Corrientes","AR-N":"Provincia de Misiones","AR-V":"Provincia de Tierra del Fuego","CO-AMA":"Departamento del Amazonas","CO-PUT":"Departamento del Putumayo","CO-NAR":"Departamento de Nariño","CO-CAQ":"Departamento del Caquetá","CO-GUA":"Departamento de Guainía","CO-VAU":"Departamento del Vaupés","CO-GUV":"Departamento del Guaviare","CO-MET":"Departamento del Meta","CO-VID":"Departamento del Vichada","CO-CAS":"Departamento de Casanare","CO-ARA":"Departamento de Arauca","CO-CAU":"Departamento del Cauca","CO-HUI":"Departamento del Huila","CO-DC":"Bogotá","CO-TOL":"Departamento del Tolima","CO-SAN":"Departamento de Santander","CO-COR":"Departamento de Córdoba","CO-SUC":"Departamento de Sucre","CO-VAC":"Departamento del Valle del Cauca","CO-QUI":"Departamento del Quindío","CO-RIS":"Departamento del Risaralda","CO-CAL":"Departamento de Caldas","CO-ANT":"Departamento de Antioquia","CO-CHO":"Departamento del Chocó","CO-BOL":"Departamento de Bolívar","CO-MAG":"Departamento del Magdalena","CO-ATL":"Departamento del Atlántico","CO-CUN":"Departamento de Cundinamarca","CO-BOY":"Departamento de Boyacá","CO-NSA":"Norte de Santander","CO-CES":"Departamento del Cesar","CO-LAG":"Departamento de La Guajira","CO-SAP":"San Andrés y Providencia","PE-MDD":"Madre de Dios","PE-UCA":"Ucayali","PE-TAC":"Tacna","PE-MOQ":"Moquegua","PE-APU":"Apurímac","PE-AYA":"Ayacucho","PE-ARE":"Arequipa","PE-ICA":"Ica","PE-HUV":"Huancavelica","PE-PUN":"Puno","PE-CUS":"Cuzco","PE-CAJ":"Cajamarca","PE-SAM":"San Martín","PE-PIU":"Piura","PE-TUM":"Tumbes","PE-LAM":"Lambayeque","PE-JUN":"Junín","PE-PAS":"Pasco","PE-HUC":"Huánuco","PE-ANC":"Áncash","PE-LIM":"Department of Lima","PE-LAL":"La Libertad","PE-AMA":"Amazonas","PE-LOR":"Loreto","FR-PF":"Polynésie Française","FR-WF":"Wallis-et-Futuna","FR-NC":"Nouvelle-Calédonie","FR-MF":"Saint-Martin","FR-BL":"Saint-Barthélemy","FR-PM":"Saint-Pierre-et-Miquelon","FR-20R":"Corse","FR-NAQ":"Nouvelle-Aquitaine","FR-ARA":"Auvergne-Rhône-Alpes","FR-CVL":"Centre-Val de Loire","FR-BFC":"Bourgogne-Franche-Comté","FR-BRE":"Bretagne","FR-PDL":"Pays de la Loire","FR-GES":"Grand Est","FR-NOR":"Normandie","FR-IDF":"Île-de-France","FR-HDF":"Hauts-de-France","FR-PAC":"Provence-Alpes-Côte d'Azur","FR-OCC":"Occitanie","FR-RE":"La Réunion","FR-YT":"Mayotte","FR-MQ":"Martinique","FR-GP":"Guadeloupe","FR-TF":"Terres Australes et Antarctiques Françaises","FR-GF":"Guyane","IT-75":"Puglia","IT-67":"Molise","IT-65":"Abruzzo","IT-57":"Marche","IT-45":"Emilia-Romagna","IT-25":"Lombardia","IT-62":"Lazio","IT-55":"Umbria","IT-34":"Veneto","IT-32":"Trentino-Alto Adige","IT-77":"Basilicata","IT-72":"Campania","IT-52":"Toscana","IT-42":"Liguria","IT-21":"Piemonte","IT-78":"Calabria","IT-36":"Friuli-Venezia Giulia","IT-23":"Valle d'Aosta","IT-82":"Sicilia","IT-88":"Sardegna","PL-28":"Województwo warmińsko-mazurskie","PL-20":"Województwo podlaskie","PL-12":"Województwo małopolskie","PL-24":"Województwo śląskie","PL-16":"Województwo opolskie","PL-02":"Województwo dolnośląskie","PL-08":"Województwo lubuskie","PL-18":"Województwo podkarpackie","PL-26":"Województwo świętokrzyskie","PL-10":"Województwo łódzkie","PL-30":"Województwo wielkopolskie","PL-32":"Województwo zachodniopomorskie","PL-06":"Województwo lubelskie","PL-14":"Województwo mazowieckie","PL-04":"Województwo kujawsko-pomorskie","PL-22":"Województwo pomorskie","DE-BB":"Brandenburg","DE-TH":"Thüringen","DE-SN":"Sachsen","DE-SH":"Schleswig-Holstein","DE-ST":"Sachsen-Anhalt","DE-HH":"Hamburg","DE-MV":"Mecklenburg-Vorpommern","DE-BY":"Bayern","DE-HE":"Hessen","DE-NI":"Niedersachsen","DE-BW":"Baden-Württemberg","DE-RP":"Rheinland-Pfalz","DE-NW":"Nordrhein-Westfalen","DE-SL":"Saarland","DE-HB":"Bremen","DE-BE":"Berlin","NO-46":"Vestland","NO-50":"Trøndelag","NO-11":"Rogaland","NO-42":"Agder","NO-08":"Telemark","NO-06":"Buskerud","NO-34":"Innlandet","NO-02":"Akershus","NO-03":"Oslo","NO-01":"Østfold","NO-07":"Vestfold","NO-15":"Møre og Romsdal","NO-SJM":"Svalbard og Jan Mayen","NO-18":"Nordland","NO-19":"Troms","NO-20":"Finnmark","FI-19":"Varsinais-Suomi","FI-01":"Ahvenanmaa","FI-18":"Uusimaa","FI-17":"Satakunta","FI-06":"Kanta-Häme","FI-11":"Pirkanmaa","FI-08":"Keski-Suomi","FI-09":"Kymenlaakso","FI-16":"Päijät-Häme","FI-12":"Pohjanmaa","FI-07":"Keski-Pohjanmaa","FI-03":"Etelä-Pohjanmaa","FI-04":"Etelä-Savo","FI-13":"Pohjois-Karjala","FI-05":"Kainuu","FI-02":"Etelä-Karjala","FI-15":"Pohjois-Savo","FI-14":"Pohjois-Pohjanmaa","FI-10":"Lappi","NL-ZH":"Zuid-Holland","NL-DR":"Drenthe","NL-GE":"Gelderland","NL-LI":"Limburg","NL-ZE":"Zeeland","NL-NB":"Noord-Brabant","NL-UT":"Utrecht","NL-NH":"Noord-Holland","NL-FL":"Flevoland","NL-FR":"Friesland","NL-GR":"Groningen","NL-OV":"Overijssel","GB-SCT":"Scotland","GB-WLS":"Wales","GB-ENG":"England","GB-NIR":"Northern Ireland","ES-CB":"Cantabria","ES-AS":"Asturias","ES-GA":"Galicia","ES-RI":"La Rioja","ES-NA":"Navarra","ES-MD":"Comunidad de Madrid","ES-AR":"Aragón","ES-EX":"Extremadura","ES-CM":"Castilla-La Mancha","ES-AN":"Andalucía","ES-MC":"Región de Murcia","ES-VC":"Comunidad Valenciana","ES-CT":"Cataluña","ES-CN":"Canarias","ES-IB":"Islas Baleares","ES-PV":"País Vasco","ES-CL":"Castilla y León","ES-CE":"Ceuta","ES-ML":"Melilla","UA-21":"Zakarpattia Oblast","UA-61":"Ternopil Oblast","UA-77":"Chernivtsi Oblast","UA-26":"Ivano-Frankivsk Oblast","UA-46":"Lviv Oblast","UA-07":"Volyn Oblast","UA-48":"Mykolaiv Oblast","UA-23":"Zaporizhzhia Oblast","UA-71":"Cherkasy Oblast","UA-30":"Kyiv","UA-32":"Kyiv Oblast","UA-05":"Vinnytsia Oblast","UA-68":"Khmelnytskyi Oblast","UA-56":"Rivne Oblast","UA-18":"Zhytomyr Oblast","UA-35":"Kirovohrad Oblast","UA-14":"Donetsk Oblast","UA-12":"Dnipropetrovsk Oblast","UA-63":"Kharkiv Oblast","UA-53":"Poltava Oblast","UA-09":"Luhansk Oblast","UA-74":"Chernihiv Oblast","UA-59":"Sumy Oblast","UA-40":"Sevastopol","UA-43":"Autonomous Republic of Crimea","UA-51":"Odesa Oblast","UA-65":"Kherson Oblast","RU-KDA":"Krasnodar Krai","RU-KB":"Kabardino-Balkaria, Republic of","RU-IN":"Ingushetia, Republic of","RU-CE":"Chechnya, Republic of","RU-ULY":"Ulyanovsk Oblast","RU-NIZ":"Nizhny Novgorod Oblast","RU-RYA":"Ryazan Oblast","RU-MOS":"Moscow Oblast","RU-KGD":"Kaliningrad Oblast","RU-KC":"Karachay-Cherkessia, Republic of","RU-SE":"North Ossetia-Alania, Republic of","RU-DA":"Dagestan, Republic of","RU-AST":"Astrakhan Oblast","RU-VGG":"Volgograd Oblast","RU-PNZ":"Penza Oblast","RU-TA":"Tatarstan, Republic of","RU-ME":"Mari El, Republic of","RU-UD":"Udmurtia, Republic of","RU-KOS":"Kostroma Oblast","RU-VLA":"Vladimir Oblast","RU-TVE":"Tver Oblast","RU-PSK":"Pskov Oblast","RU-SPE":"Saint Petersburg","RU-VLG":"Vologda Oblast","RU-BEL":"Belgorod Oblast","RU-TAM":"Tambov Oblast","RU-AD":"Adygea, Republic of","RU-ORL":"Oryol Oblast","RU-BRY":"Bryansk Oblast","RU-KLU":"Kaluga Oblast","RU-STA":"Stavropol Krai","RU-KL":"Kalmykia, Republic of","RU-ROS":"Rostov Oblast","RU-SAR":"Saratov Oblast","RU-SAM":"Samara Oblast","RU-MO":"Mordovia, Republic of","RU-CU":"Chuvashia, Republic of","RU-KIR":"Kirov Oblast","RU-ORE":"Orenburg Oblast","RU-BA":"Bashkortostan, Republic of","RU-PER":"Perm Krai","RU-KO":"Komi, Republic of","RU-IVA":"Ivanovo Oblast","RU-YAR":"Yaroslavl Oblast","RU-NGR":"Novgorod Oblast","RU-LEN":"Leningrad Oblast","RU-KR":"Karelia, Republic of","RU-KGN":"Kurgan Oblast","RU-CHE":"Chelyabinsk Oblast","RU-SVE":"Sverdlovsk Oblast","RU-KHA":"Khabarovsk Krai","RU-SA":"Sakha, Republic of","RU-AMU":"Amur Oblast","RU-PRI":"Primorsky Krai","RU-MAG":"Magadan Oblast","RU-YEV":"Jewish Autonomous Oblast","RU-CHU":"Chukotka Autonomous Okrug","RU-KAM":"Kamchatka Krai","RU-SAK":"Sakhalin Oblast","RU-KYA":"Krasnoyarsk Krai","RU-BU":"Buryatia, Republic of","RU-ZAB":"Zabaykalsky Krai","RU-KK":"Khakassia, Republic of","RU-TY":"Tuva, Republic of","RU-IRK":"Irkutsk Oblast","RU-KEM":"Kemerovo Oblast","RU-AL":"Altai, Republic of","RU-ALT":"Altai Krai","RU-NVS":"Novosibirsk Oblast","RU-OMS":"Omsk Oblast","RU-TOM":"Tomsk Oblast","RU-TYU":"Tyumen Oblast","RU-KHM":"Khanty-Mansi Autonomous Okrug","RU-YAN":"Yamalo-Nenets Autonomous Okrug","RU-ARK":"Arkhangelsk Oblast","RU-NEN":"Nenets Autonomous Okrug","RU-MUR":"Murmansk Oblast","RU-VOR":"Voronezh Oblast","RU-KRS":"Kursk Oblast","RU-LIP":"Lipetsk Oblast","RU-TUL":"Tula Oblast","RU-SMO":"Smolensk Oblast","RU-MOW":"Moscow","KR-49":"Jejudo","KR-28":"Incheon","KR-27":"Daegu","KR-26":"Busan","KR-31":"Ulsan","KR-47":"Gyeongsangbuk-do","KR-29":"Gwangju","KR-46":"Jeonnam","KR-48":"Gyeongsangnam-do","KR-45":"Jeonbuk","KR-30":"Daejeon","KR-50":"Sejong","KR-43":"Chungcheongbuk-do","KR-44":"Chungcheongnam-do","KR-11":"Seoul","KR-41":"Gyeonggi","KR-42":"Gangwon","AU-ACT":"Australian Capital Territory","AU-TAS":"Tasmania","AU-NT":"Northern Territory","AU-WA":"Western Australia","AU-QLD":"Queensland","AU-NSW":"New South Wales","AU-VIC":"Victoria","AU-SA":"South Australia"};

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

  // Members with no clears yet (SITE.members) still get a 0-point entry.
  ((window.SITE && window.SITE.members) || []).forEach(function (m) {
    var entry = ensure(m.name);
    if (!entry.nationality && m.nationality) {
      entry.nationality = m.nationality;
      entry.subdivision = m.subdivision || null;
    }
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

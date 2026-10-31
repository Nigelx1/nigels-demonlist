"use strict";
// -----------------------------------------------------------------------------
// The mod page (admin/index.html): where the list editors make the edits that
// used to be done by hand.
//
// How an edit travels: the forms here build "ops" (the edit contract, in
// functions/_lib/contract.js and tools/apply-edit.py), POST them to /api/edit,
// the Function sends them to GitHub, and .github/workflows/apply-edit.yml runs
// the same tools Claude ran by hand, commits and pushes; Cloudflare deploys.
// This page never writes anything itself.
//
// The checks below mirror the contract so a typo shows up at once instead of
// a minute later from a failed run. The server checks everything again (that
// check is the one that counts), and its messages are shown as they come.
//
// The current list comes from the site's own data files (loaded by the page),
// so it's the deployed list: an edit shows up here after it goes live and the
// page is reloaded.
//
// Everything rendered goes through textContent / DOM properties, never
// innerHTML with data in it: names, notes, Discord usernames and server
// messages are all text.
// -----------------------------------------------------------------------------

(function () {
  // --- the contract's rules (same limits as functions/_lib/contract.js) -------

  // ISO 3166-1 alpha-2: the 249 officially assigned codes the server accepts,
  // with English names. XK (Kosovo) isn't officially assigned, so it's not here.
  var COUNTRIES = {"AD":"Andorra","AE":"United Arab Emirates","AF":"Afghanistan","AG":"Antigua & Barbuda","AI":"Anguilla","AL":"Albania","AM":"Armenia","AO":"Angola","AQ":"Antarctica","AR":"Argentina","AS":"American Samoa","AT":"Austria","AU":"Australia","AW":"Aruba","AX":"Åland Islands","AZ":"Azerbaijan","BA":"Bosnia & Herzegovina","BB":"Barbados","BD":"Bangladesh","BE":"Belgium","BF":"Burkina Faso","BG":"Bulgaria","BH":"Bahrain","BI":"Burundi","BJ":"Benin","BL":"St. Barthélemy","BM":"Bermuda","BN":"Brunei","BO":"Bolivia","BQ":"Caribbean Netherlands","BR":"Brazil","BS":"Bahamas","BT":"Bhutan","BV":"Bouvet Island","BW":"Botswana","BY":"Belarus","BZ":"Belize","CA":"Canada","CC":"Cocos (Keeling) Islands","CD":"Congo (DRC)","CF":"Central African Republic","CG":"Congo","CH":"Switzerland","CI":"Côte d’Ivoire","CK":"Cook Islands","CL":"Chile","CM":"Cameroon","CN":"China","CO":"Colombia","CR":"Costa Rica","CU":"Cuba","CV":"Cape Verde","CW":"Curaçao","CX":"Christmas Island","CY":"Cyprus","CZ":"Czechia","DE":"Germany","DJ":"Djibouti","DK":"Denmark","DM":"Dominica","DO":"Dominican Republic","DZ":"Algeria","EC":"Ecuador","EE":"Estonia","EG":"Egypt","EH":"Western Sahara","ER":"Eritrea","ES":"Spain","ET":"Ethiopia","FI":"Finland","FJ":"Fiji","FK":"Falkland Islands","FM":"Micronesia","FO":"Faroe Islands","FR":"France","GA":"Gabon","GB":"United Kingdom","GD":"Grenada","GE":"Georgia","GF":"French Guiana","GG":"Guernsey","GH":"Ghana","GI":"Gibraltar","GL":"Greenland","GM":"Gambia","GN":"Guinea","GP":"Guadeloupe","GQ":"Equatorial Guinea","GR":"Greece","GS":"South Georgia & South Sandwich Islands","GT":"Guatemala","GU":"Guam","GW":"Guinea-Bissau","GY":"Guyana","HK":"Hong Kong","HM":"Heard & McDonald Islands","HN":"Honduras","HR":"Croatia","HT":"Haiti","HU":"Hungary","ID":"Indonesia","IE":"Ireland","IL":"Israel","IM":"Isle of Man","IN":"India","IO":"British Indian Ocean Territory","IQ":"Iraq","IR":"Iran","IS":"Iceland","IT":"Italy","JE":"Jersey","JM":"Jamaica","JO":"Jordan","JP":"Japan","KE":"Kenya","KG":"Kyrgyzstan","KH":"Cambodia","KI":"Kiribati","KM":"Comoros","KN":"St. Kitts & Nevis","KP":"North Korea","KR":"South Korea","KW":"Kuwait","KY":"Cayman Islands","KZ":"Kazakhstan","LA":"Laos","LB":"Lebanon","LC":"St. Lucia","LI":"Liechtenstein","LK":"Sri Lanka","LR":"Liberia","LS":"Lesotho","LT":"Lithuania","LU":"Luxembourg","LV":"Latvia","LY":"Libya","MA":"Morocco","MC":"Monaco","MD":"Moldova","ME":"Montenegro","MF":"St. Martin","MG":"Madagascar","MH":"Marshall Islands","MK":"North Macedonia","ML":"Mali","MM":"Myanmar (Burma)","MN":"Mongolia","MO":"Macao","MP":"Northern Mariana Islands","MQ":"Martinique","MR":"Mauritania","MS":"Montserrat","MT":"Malta","MU":"Mauritius","MV":"Maldives","MW":"Malawi","MX":"Mexico","MY":"Malaysia","MZ":"Mozambique","NA":"Namibia","NC":"New Caledonia","NE":"Niger","NF":"Norfolk Island","NG":"Nigeria","NI":"Nicaragua","NL":"Netherlands","NO":"Norway","NP":"Nepal","NR":"Nauru","NU":"Niue","NZ":"New Zealand","OM":"Oman","PA":"Panama","PE":"Peru","PF":"French Polynesia","PG":"Papua New Guinea","PH":"Philippines","PK":"Pakistan","PL":"Poland","PM":"St. Pierre & Miquelon","PN":"Pitcairn Islands","PR":"Puerto Rico","PS":"Palestinian Territories","PT":"Portugal","PW":"Palau","PY":"Paraguay","QA":"Qatar","RE":"Réunion","RO":"Romania","RS":"Serbia","RU":"Russia","RW":"Rwanda","SA":"Saudi Arabia","SB":"Solomon Islands","SC":"Seychelles","SD":"Sudan","SE":"Sweden","SG":"Singapore","SH":"St. Helena","SI":"Slovenia","SJ":"Svalbard & Jan Mayen","SK":"Slovakia","SL":"Sierra Leone","SM":"San Marino","SN":"Senegal","SO":"Somalia","SR":"Suriname","SS":"South Sudan","ST":"São Tomé & Príncipe","SV":"El Salvador","SX":"Sint Maarten","SY":"Syria","SZ":"Eswatini","TC":"Turks & Caicos Islands","TD":"Chad","TF":"French Southern Territories","TG":"Togo","TH":"Thailand","TJ":"Tajikistan","TK":"Tokelau","TL":"Timor-Leste","TM":"Turkmenistan","TN":"Tunisia","TO":"Tonga","TR":"Türkiye","TT":"Trinidad & Tobago","TV":"Tuvalu","TW":"Taiwan","TZ":"Tanzania","UA":"Ukraine","UG":"Uganda","UM":"U.S. Outlying Islands","US":"United States","UY":"Uruguay","UZ":"Uzbekistan","VA":"Vatican City","VC":"St. Vincent & Grenadines","VE":"Venezuela","VG":"British Virgin Islands","VI":"U.S. Virgin Islands","VN":"Vietnam","VU":"Vanuatu","WF":"Wallis & Futuna","WS":"Samoa","YE":"Yemen","YT":"Mayotte","ZA":"South Africa","ZM":"Zambia","ZW":"Zimbabwe"};

  var VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be", "drive.google.com"];
  var LEVEL_LINK = /^https?:\/\/(?:www\.)?(?:gdladder\.com\/level\/|gdbrowser\.com\/(?:level\/)?)([0-9]+)\/?(?:[?#]\S*)?$/i;
  var MAX_LEVEL_ID = 2147483647;
  var MAX_RUNS = 20;
  var MAX_NOTE = 140;
  var DISCORD_ID = /^[0-9]{17,20}$/; // a Discord user id (contract.js checkDiscordId)

  // A mistake the editor can fix: shown in the panel, nothing is sent.
  function Problem(message) {
    this.message = message;
  }

  // Lengths in code points (an emoji counts once), like the server.
  function len(s) {
    return Array.from(s).length;
  }

  function checkName(v, what) {
    v = v.normalize("NFC");
    if (!v.trim()) throw new Problem("Type a " + what + " name.");
    if (v !== v.trim()) throw new Problem("The " + what + " name has a space at the start or end.");
    if (v.indexOf("  ") >= 0) throw new Problem("The " + what + " name has two spaces in a row.");
    if (len(v) > 32) throw new Problem("The " + what + " name is too long (32 characters at most).");
    var bad = Array.from(v).filter(function (c) { return !/^[\p{L}0-9 ._-]$/u.test(c); });
    if (bad.length) {
      throw new Problem("Names can only use letters, numbers, spaces and . _ - (not " + Array.from(new Set(bad)).join(" ") + ").");
    }
    return v;
  }

  // A level id or a gdladder.com / gdbrowser.com level link -> the id (a number).
  function parseLevel(v) {
    v = v.trim();
    if (!v) throw new Problem("Type the level's ID, or paste its gdladder or gdbrowser link.");
    var id = null;
    if (/^[0-9]+$/.test(v)) id = Number(v);
    else if (LEVEL_LINK.test(v)) id = Number(LEVEL_LINK.exec(v)[1]);
    if (id === null) throw new Problem("That level isn't a level ID or a gdladder.com / gdbrowser.com level link.");
    if (!(id >= 1 && id <= MAX_LEVEL_ID)) throw new Problem("That isn't a real level ID.");
    return id;
  }

  function parseWhole(v, what, lo, hi) {
    v = String(v).trim();
    if (!/^[0-9]+$/.test(v) || Number(v) < lo || Number(v) > hi) {
      throw new Problem(what + " must be a whole number from " + lo + " to " + hi + ".");
    }
    return Number(v);
  }

  function checkVideo(v) {
    v = v.trim();
    var m = /^https:\/\/([^/?#]*)/i.exec(v);
    var host = m ? m[1].toLowerCase() : "";
    if (len(v) > 300 || /\s/u.test(v) || !m || host.indexOf("@") >= 0 || host.indexOf(":") >= 0 || VIDEO_HOSTS.indexOf(host) < 0) {
      throw new Problem("The video link must be a YouTube or Google Drive link starting with https://");
    }
    // the same patterns the site's video tool uses: one video, not a channel or folder
    if (!/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)[A-Za-z0-9_-]{11}/.test(v) &&
        !/drive\.google\.com\/(?:file\/d\/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=)[A-Za-z0-9_-]{10,}/.test(v)) {
      throw new Problem("That link doesn't point at one video. On YouTube use the Share button's link; on Google Drive, the file's share link.");
    }
    return v;
  }

  function checkNote(v) {
    if (len(v) > MAX_NOTE) throw new Problem("The note is too long (" + MAX_NOTE + " characters at most).");
    if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v)) throw new Problem("The note has to be plain text on one line.");
    return v.trim();
  }

  // --- the list as deployed -------------------------------------------------

  var DEMONS = window.DEMONS || [];
  var GOALS = window.GOALS || [];
  var GOAL_LEVELS = window.GOAL_LEVELS || {};
  var SITE = window.SITE || {};
  // The unrated levels (Rated+: data/unrated.js, Aceabase only). A list without
  // the file has none, and the Rated+ levels panel stays hidden there.
  var UNRATED = Array.isArray(window.UNRATED) ? window.UNRATED : [];

  // Every name the list knows: the roster plus anyone holding a record, on an
  // unrated level too (the same set apply-edit.py checks against).
  function knownPlayers() {
    var names = (SITE.members || []).map(function (m) { return m.name; });
    DEMONS.forEach(function (d) {
      (d.records || []).forEach(function (r) { names.push(r.player); });
    });
    UNRATED.forEach(function (u) {
      (u.records || []).forEach(function (r) { names.push(r.player); });
    });
    return Array.from(new Set(names));
  }

  // The stored spelling for a typed name: exact, or the one case-insensitive
  // match (the server resolves names the same way). null = a new name.
  function resolvePlayer(name) {
    var names = knownPlayers();
    if (names.indexOf(name) >= 0) return name;
    var hits = names.filter(function (n) { return n.toLowerCase() === name.toLowerCase(); });
    return hits.length === 1 ? hits[0] : null;
  }

  // A list that shows states and provinces (SITE.subdivisions, off on Aceabase):
  // the ones the stats viewer's map knows for a country (DL.SUBDIVISION_NAMES, keyed
  // "US-IL"), by name, with "none" first. row: what to hide when there are none.
  function usesSubdivisions() {
    return !(window.SITE && SITE.subdivisions === false);
  }

  function fillSubdivisionSelect(select, cc, current, row) {
    clear(select);
    var names = (window.DL && DL.SUBDIVISION_NAMES) || {};
    var subs = Object.keys(names)
      .filter(function (k) { return cc && k.indexOf(cc + "-") === 0; })
      .map(function (k) { return [k.slice(cc.length + 1), names[k]]; })
      .sort(function (a, b) { return a[1].localeCompare(b[1]); });
    (row || select).hidden = !usesSubdivisions() || !subs.length;
    select.appendChild(el("option", { value: "" }, "No state or province"));
    subs.forEach(function (p) { select.appendChild(el("option", { value: p[0] }, p[1])); });
    select.value = current && subs.some(function (p) { return p[0] === current; }) ? current : "";
  }

  // The picked state or province, or "" when the picker is hidden.
  function pickedSubdivision(select, row) {
    return (row || select).hidden ? "" : select.value;
  }

  function subdivisionOf(name) {
    var m = (SITE.members || []).find(function (x) { return x.name === name; });
    if (m) return m.subdivision || "";
    for (var i = 0; i < DEMONS.length; i++) {
      var r = (DEMONS[i].records || []).find(function (x) { return x.player === name && x.nationality; });
      if (r) return r.subdivision || "";
    }
    return "";
  }

  function nationalityOf(name) {
    var m = (SITE.members || []).find(function (x) { return x.name === name; });
    if (m && m.nationality) return m.nationality;
    for (var i = 0; i < DEMONS.length; i++) {
      var r = (DEMONS[i].records || []).find(function (x) { return x.player === name && x.nationality; });
      if (r) return r.nationality;
    }
    return null;
  }

  function demonByLevel(id) {
    return DEMONS.find(function (d) { return d.levelId === id || d.id === id; }) || null;
  }

  // An unrated level (Rated+) by level id; null for a level on the list (the
  // list always wins, like DL.unratedById).
  function unratedByLevel(id) {
    if (demonByLevel(id)) return null;
    return UNRATED.find(function (u) { return u && u.levelId === id; }) || null;
  }

  // Has someone beaten this unrated level (a record at 100%)? Only then is it on
  // the Rated+ list; until then it's a Grind level of Rated+. (DL.unratedBeaten.)
  function unratedBeaten(u) {
    if (window.DL && typeof DL.unratedBeaten === "function") return DL.unratedBeaten(u);
    return (u.records || []).some(function (r) { return r.progress >= 100; });
  }

  // Today's Rated+ list (static/js/views.js, which a list with Rated+ loads here):
  // where a beaten unrated level sits. null when it can't be built.
  var plusView;
  function ratedPlusView() {
    if (plusView === undefined) {
      try {
        plusView = window.DL && typeof DL.listView === "function" ? DL.listView("current", "plus") : null;
      } catch (e) {
        plusView = null; // the page still works without positions
      }
    }
    return plusView;
  }

  // "on Rated+ at #6" / "on Rated+, beaten" / "on Rated+, not beaten yet", for the
  // level hints
  function ratedPlusState(u) {
    if (!unratedBeaten(u)) return "on Rated+, not beaten yet";
    var v = ratedPlusView(), pos = v ? v.pos(u) : null;
    return typeof pos === "number" ? "on Rated+ at #" + pos : "on Rated+, beaten";
  }

  function levelName(id) {
    // (trimmed: a few names come from gdbrowser with a trailing space)
    var d = demonByLevel(id) || unratedByLevel(id);
    if (d) return String(d.name).trim();
    var g = GOAL_LEVELS[String(id)];
    return g && g.name ? String(g.name).trim() : "level " + id;
  }

  // [{demon, record, unrated}] for one player: list order, then their clears
  // on unrated levels (demon is then the data/unrated.js entry)
  function recordsOf(name) {
    var out = [];
    DL.sortedDemons().forEach(function (d) {
      (d.records || []).forEach(function (r) {
        if (r.player === name) out.push({ demon: d, record: r });
      });
    });
    UNRATED.forEach(function (u) {
      (u.records || []).forEach(function (r) {
        if (r.player === name) out.push({ demon: u, record: r, unrated: true });
      });
    });
    return out;
  }

  function goalsOf(name) {
    return GOALS.filter(function (g) { return g.player === name; });
  }

  // --- DOM helpers ------------------------------------------------------------

  function $(id) {
    return document.getElementById(id);
  }

  // el("li", {className: "x"}, "text", child, ...) - strings become text nodes
  function el(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "dataset") Object.assign(node.dataset, props[k]);
      else node[k] = props[k];
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  // A flag picture for a country code (only codes; the file may not exist for
  // every country, in which case it just shows nothing).
  function flag(cc) {
    if (!cc || !/^[A-Z]{2}$/.test(cc)) return null;
    var span = el("span", { className: "flag-icon", title: COUNTRIES[cc] || cc });
    span.style.backgroundImage = "url(../static/images/flags/" + cc.toLowerCase() + ".svg)";
    return span;
  }

  // kind: "ok" | "err" | "warn" | "info"
  function say(box, kind, text, extra) {
    clear(box);
    box.className = "msg " + { ok: "info-green", err: "info-red", warn: "info-yellow", info: "info-plain" }[kind];
    box.appendChild(document.createTextNode(text));
    if (extra) box.appendChild(extra);
    box.hidden = false;
  }

  function hush(box) {
    clear(box);
    box.hidden = true;
  }

  // Buttons that undo something ask twice: the first tap arms it for a few
  // seconds. (No confirm() popup: they're clumsy on phones.)
  function armed(button, prompt) {
    if (button.dataset.armed === "1") {
      clearTimeout(Number(button.dataset.timer));
      button.dataset.armed = "";
      button.textContent = button.dataset.label;
      return true;
    }
    button.dataset.label = button.textContent;
    button.dataset.armed = "1";
    button.textContent = prompt || "Tap again to confirm";
    button.dataset.timer = String(
      setTimeout(function () {
        button.dataset.armed = "";
        button.textContent = button.dataset.label;
      }, 4000)
    );
    return false;
  }

  function fillCountrySelect(select) {
    clear(select);
    select.appendChild(el("option", { value: "" }, "Pick a country"));
    // the countries already on the list first, then everyone A-Z
    var used = Array.from(new Set((SITE.members || []).map(function (m) { return m.nationality; }).filter(function (c) { return COUNTRIES[c]; })));
    used.sort(function (a, b) { return COUNTRIES[a].localeCompare(COUNTRIES[b]); });
    if (used.length) {
      var top = el("optgroup", { label: "On the list" });
      used.forEach(function (c) { top.appendChild(el("option", { value: c }, COUNTRIES[c])); });
      select.appendChild(top);
    }
    var all = el("optgroup", { label: "All countries" });
    Object.keys(COUNTRIES)
      .sort(function (a, b) { return COUNTRIES[a].localeCompare(COUNTRIES[b]); })
      .forEach(function (c) { all.appendChild(el("option", { value: c }, COUNTRIES[c])); });
    select.appendChild(all);
  }

  // --- talking to the server ----------------------------------------------------

  // {status, data}: data is the parsed JSON, or {error: text} for anything else.
  function api(path, options) {
    return fetch(path, Object.assign({ credentials: "same-origin", cache: "no-store" }, options || {})).then(
      function (r) {
        return r.text().then(function (text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = { error: text.trim() || "the server answered " + r.status };
          }
          return { status: r.status, data: data };
        });
      },
      function () {
        return { status: 0, data: { error: "couldn't reach the server - check your connection and try again" } };
      }
    );
  }

  function errorText(res) {
    var e = res.data && typeof res.data.error === "string" ? res.data.error : "something went wrong (" + res.status + ")";
    return e.charAt(0).toUpperCase() + e.slice(1);
  }

  // Follow one save in its own form's message box until GitHub has applied it
  // or refused it. The form keeps what was typed until then, so a refused edit
  // can be fixed and sent again instead of typed from scratch.
  function watch(id, box, done, tries) {
    setTimeout(function () {
      api("/api/status?requestId=" + id).then(function (res) {
        var run = res.status === 200 && res.data ? res.data.run : null;
        if (!run || run.status !== "completed") {
          if (tries < 75) watch(id, box, done, tries + 1); // about 10 minutes
          return;
        }
        if (run.conclusion === "success") {
          say(box, "ok", "Done - it'll show on the site in about a minute.");
          if (done) done();
        } else {
          say(box, "err", "Not saved: " + (typeof run.reason === "string" && run.reason ? run.reason : "see Recent edits below for what happened."));
        }
      });
    }, 8000);
  }

  // Send one batch of ops. what = a short description for Recent edits.
  // done() runs after a good save (to reset the form).
  function save(ops, what, button, box, done) {
    button.disabled = true;
    say(box, "info", "Saving...");
    return api("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops: ops }),
    }).then(function (res) {
      button.disabled = false;
      if (res.status === 200 && res.data && /^[0-9a-f]{16}$/.test(res.data.requestId || "")) {
        say(box, "info", "Sent - checking it now (about a minute). ");
        box.appendChild(el("a", { href: "#panel-edits" }, "Follow it in Recent edits"));
        track(res.data.requestId, what);
        watch(res.data.requestId, box, done, 0);
        return;
      }
      if (res.status === 401) {
        say(box, "err", "You've been logged out. ");
        box.appendChild(el("a", { href: "/api/login" }, "Log in again"));
        return;
      }
      say(box, "err", errorText(res));
    });
  }

  // --- level look-up (the Check buttons) -------------------------------------

  // The level id typed in a field, or null.
  function levelIn(input) {
    try {
      return parseLevel(input.value);
    } catch (e) {
      if (!(e instanceof Problem)) throw e;
      return null;
    }
  }

  // As the editor types: what the list already knows about that level, no
  // network needed. The Check button asks gdladder/gdbrowser through the server.
  // forClear: Add a clear's box (any progress counts on an unrated level).
  function localLevelHint(input, box, forClear) {
    var id = levelIn(input);
    if (id === null) {
      hush(box);
      return;
    }
    var d = demonByLevel(id);
    var u = unratedByLevel(id);
    var g = GOAL_LEVELS[String(id)];
    if (d) say(box, "info", d.name + " - #" + d.position + " on the list.");
    else if (u) say(box, "info", String(u.name).trim() + " - unrated, " + ratedPlusState(u) + (forClear ? "; any progress counts." : "."));
    else if (g && g.name) say(box, "info", String(g.name).trim() + " - not on the list (someone's grinding it).");
    else hush(box);
  }

  // forClear: warn about what the list refuses (wrong difficulty, platformer,
  // progress under 100 on a level that isn't on it yet). rated: the panel's
  // Rated+ box (ratedPlusBox), or null.
  function checkLevel(input, box, button, forClear, rated) {
    var id;
    try {
      id = parseLevel(input.value);
    } catch (e) {
      say(box, "err", e.message);
      return;
    }
    button.disabled = true;
    say(box, "info", "Looking it up...");
    api("/api/level?level=" + encodeURIComponent(String(id))).then(function (res) {
      button.disabled = false;
      showLevel(box, id, res, forClear, rated);
    });
  }

  // What the look-up found, in a panel's level box (and, on a list with Rated+,
  // the panel's Rated+ box). Returns the level's Rated+ case (ratedPlusCase).
  function showLevel(box, id, res, forClear, rated) {
    if (res.status !== 200) {
      var failed = rated ? rated.found(id, null, res.status) : "";
      say(box, "err", errorText(res));
      return failed;
    }
    var lv = res.data;
    var facts = [lv.difficulty];
    if (lv.rating !== null && lv.rating !== undefined) facts.push("rating " + lv.rating);
    if (lv.platformer) facts.push("platformer");
    // an unrated level (Rated+) takes any progress: none of the list's refusals apply
    var unrated = lv.onList !== true ? unratedByLevel(lv.id) : null;
    // Rated+: "unrated" = unrated in game and on neither list yet (ratedPlusCase).
    // (An unrated level can show a face from players' votes, like "Hard".)
    var rp = rated ? rated.found(id, lv, 200) : "";
    if (rp === "unrated" && lv.difficulty !== "Unrated") facts.push("unrated in game");
    var where = unrated ? "Unrated, " + ratedPlusState(unrated) + (forClear ? ": any progress counts." : ".")
      : rp === "added" ? "Unrated, just put on Rated+" + (forClear ? ": any progress counts." : ".")
      : lv.onList === true ? "On the list at #" + lv.position + "."
      : rp === "unrated" ? "Not on the list or Rated+ yet."
      : lv.onList === false ? "Not on the list yet." : "";
    var warn = [];
    if (rp === "unrated" && !isHead()) warn.push(ONLY_HEAD);
    else if (forClear && !unrated && rp !== "unrated" && rp !== "added") {
      // Only a list that limits difficulties (SITE.allowedDifficulties) refuses the rest.
      var allowed = SITE.allowedDifficulties;
      if (lv.platformer) warn.push("It's a platformer level - the list doesn't take those, so this would be refused.");
      else if (!lv.tier) warn.push("It's not a demon - the list only takes demons, so this would be refused.");
      else if (allowed && allowed.indexOf(lv.tier) < 0) warn.push("It's " + (lv.difficulty || "not a demon") + " - the list only takes " + allowed.join(" and ") + " Demons, so this would be refused.");
      else if (lv.onList === false) warn.push("Only a 100% can put it on the list.");
      // couldn't tell whether it's rated: these hold only if it is (the Rated+ box
      // under the level asks a head mod)
      if (rp === "maybe" && isHead()) {
        warn = warn.map(function (w) { return "If it's rated: " + w.charAt(0).toLowerCase() + w.slice(1); });
      }
    } else if (rp === "platformer") {
      warn.push("It's an unrated platformer level - the list doesn't take those, not even in Rated+, so this would be refused.");
    }
    clear(box);
    box.className = "msg " + (warn.length ? "info-yellow" : "info-plain");
    box.appendChild(el("b", null, lv.name));
    box.appendChild(document.createTextNode(" by " + lv.creator + " (ID " + lv.id + ")"));
    box.appendChild(el("br"));
    box.appendChild(document.createTextNode(facts.join(" · ") + (where ? " · " + where : "")));
    warn.forEach(function (w) {
      box.appendChild(el("br"));
      box.appendChild(el("b", null, w));
    });
    box.hidden = false;
    return rp;
  }

  // Save on a level nobody pressed Check for (Rated+ needs to know whether it's
  // rated): look it up first, show what was found as Check does, then try the save
  // again. A look-up that fails doesn't stop it: the server checks anyway. Only a
  // head mod is stopped when it can't tell, to answer the "It's unrated" box first.
  function lookUpFirst(input, box, forClear, rated, button, msg, again) {
    var id = levelIn(input);
    button.disabled = true;
    say(msg, "info", "Checking the level first...");
    api("/api/level?level=" + encodeURIComponent(String(id))).then(function (res) {
      button.disabled = false;
      if (levelIn(input) !== id) {
        hush(msg); // the level was changed meanwhile: Save again for the new one
        return;
      }
      if (showLevel(box, id, res, forClear, rated) === "maybe" && isHead()) {
        say(msg, "warn", "Couldn't tell whether it's rated in game. If it isn't, tick \"It's unrated\" under the level and give its GDDL estimate. Then Save again.");
        return;
      }
      again();
    });
  }

  // A level's name for Recent edits: the list's, else what its look-up said (on a
  // list with Rated+, whose panels look levels up before saving), else "level N".
  function nameOf(id, rated) {
    var name = levelName(id);
    return name === "level " + id && rated ? rated.name(id) : name;
  }

  // --- 1. Add a clear ---------------------------------------------------------

  function setupClear() {
    var player = $("clear-player");
    var level = $("clear-level");
    var info = $("clear-level-info");
    var msg = $("clear-msg");

    function onPlayer() {
      var v = player.value.normalize("NFC");
      var isNew = v.trim() !== "" && resolvePlayer(v) === null;
      $("clear-new").hidden = !isNew;
      $("clear-country").hidden = !isHead();
      if (isHead()) fillSubdivisionSelect($("clear-subdivision"), $("clear-country").value, $("clear-subdivision").value);
      else $("clear-subdivision").hidden = true;
      if (isNew) {
        $("clear-new-text").textContent = isHead()
          ? "New player - " + v + " will be added to the list too. Pick their country:"
          : v + " isn't on the list yet. Only head mods can add new players - ask one to add them first.";
      }
    }
    player.addEventListener("input", onPlayer);
    $("clear-country").addEventListener("change", function () {
      fillSubdivisionSelect($("clear-subdivision"), $("clear-country").value);
    });
    // Rated+ (a list with unrated levels): the box for a level that's unrated in game
    var rated = ratedPlusBox("clear", level, info, false);
    level.addEventListener("input", function () {
      localLevelHint(level, info, true);
      if (rated) rated.typed();
    });
    $("clear-check").addEventListener("click", function () {
      checkLevel(level, info, $("clear-check"), true, rated);
    });

    function saveClear() {
      var ops, op, add = null, video;
      try {
        var name = checkName(player.value, "player");
        var who = resolvePlayer(name);
        var id = parseLevel(level.value);
        var progress = parseWhole($("clear-progress").value, "Progress", 1, 100);
        op = { op: "add_record", player: who || name, level: id, progress: progress };
        if (!who) {
          if (!isHead()) throw new Problem(name + " isn't on the list yet. Only head mods can add new players - ask one to add them first.");
          var cc = $("clear-country").value;
          if (!COUNTRIES[cc]) throw new Problem(name + " is new to the list - pick their country.");
          op.nationality = cc;
          var csub = pickedSubdivision($("clear-subdivision"));
          if (csub) op.subdivision = csub;
        }
        var d = demonByLevel(id);
        // Rated+: any progress counts there (on a level this page just put on it too)
        var unrated = unratedByLevel(id) || (rated !== null && rated.onPlus(id));
        // Rated+: a level that's unrated in game goes on it with this clear (head mods)
        var need = rated && !d && !unrated ? rated.need(id) : "";
        if (need === "ask") {
          lookUpFirst(level, info, true, rated, $("clear-save"), msg, saveClear);
          return;
        }
        if (need === "mod") throw new Problem(ONLY_HEAD);
        if (need === "add") add = rated.op(id);
        if (!d && !unrated && !add && progress < 100) {
          throw new Problem("That level isn't on the list, and only a 100% can put it on. (Progress counts only on levels already on the list.)");
        }
        ops = add ? [add, op] : [op];
        video = $("clear-video").value.trim();
        if (video && (unrated || add)) throw new Problem("Videos on unrated levels' clears aren't supported yet - leave the video link empty.");
        if (video) ops.push({ op: "set_record_video", player: op.player, level: id, url: checkVideo(video) });
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(msg, "err", e.message);
        return;
      }
      var what = op.player + " " + op.progress + "% on " + nameOf(op.level, rated) +
        (add ? " (unrated, new on Rated+)" : unrated ? " (unrated)" : "") + (video ? " (with video)" : "");
      save(ops, what, $("clear-save"), msg, function () {
        if (add) rated.added(op.level);
        player.value = "";
        level.value = "";
        $("clear-progress").value = "100";
        $("clear-video").value = "";
        $("clear-country").value = "";
        fillSubdivisionSelect($("clear-subdivision"), "");
        hush(info);
        if (rated) rated.reset();
        onPlayer();
      });
    }
    $("clear-save").addEventListener("click", saveClear);
  }

  // --- 2. Grind ---------------------------------------------------------------

  function setupGrind() {
    var player = $("grind-player");
    var level = $("grind-level");
    var info = $("grind-level-info");
    var msg = $("grind-msg");
    var runs = $("grind-runs");
    var note = $("grind-note");

    function bestMode() {
      var r = document.querySelector('input[name="grind-best"]:checked');
      return r ? r.value : "num";
    }
    function setBestMode(mode) {
      document.querySelector('input[name="grind-best"][value="' + mode + '"]').checked = true;
      $("grind-best-num-row").hidden = mode !== "num";
    }
    Array.prototype.forEach.call(document.querySelectorAll('input[name="grind-best"]'), function (r) {
      r.addEventListener("change", function () { setBestMode(bestMode()); });
    });

    function addRun(a, b) {
      if (runs.children.length >= MAX_RUNS) {
        say(msg, "err", "That's the most runs a goal can have (" + MAX_RUNS + ").");
        return;
      }
      var from = el("input", { type: "number", min: 0, max: 100, step: 1, inputMode: "numeric", className: "run-from", placeholder: "from" });
      var to = el("input", { type: "number", min: 0, max: 100, step: 1, inputMode: "numeric", className: "run-to", placeholder: "to" });
      from.setAttribute("aria-label", "Run starts at %");
      to.setAttribute("aria-label", "Run ends at %");
      if (a !== undefined) from.value = String(a);
      if (b !== undefined) to.value = String(b);
      var drop = el("button", { type: "button", className: "button white hover run-drop", title: "Remove this run" }, "✕");
      drop.setAttribute("aria-label", "Remove this run");
      var row = el("div", { className: "run" }, from, el("span", { className: "dash" }, "to"), to, el("span", { className: "pct" }, "%"), drop);
      drop.addEventListener("click", function () { row.remove(); });
      runs.appendChild(row);
    }
    $("grind-add-run").addEventListener("click", function () { addRun(); });

    function countNote() {
      var n = len(note.value);
      $("grind-note-count").textContent = n ? n + " / " + MAX_NOTE : "";
      $("grind-note-count").className = "counter" + (n > MAX_NOTE ? " over" : "");
    }
    note.addEventListener("input", countNote);

    var editing = null; // {player, levelId} while the form holds an existing goal
    // Rated+ (a list with unrated levels): the box for a level that's unrated in game
    var rated = ratedPlusBox("grind", level, info, true);

    function resetForm() {
      level.value = "";
      hush(info);
      if (rated) rated.reset();
      $("grind-best-num").value = "";
      setBestMode("num");
      clear(runs);
      note.value = "";
      countNote();
      editing = null;
      $("grind-editing").hidden = true;
    }

    function fillFrom(g) {
      resetForm();
      level.value = String(g.levelId);
      if (g.best === null || g.best === undefined) setBestMode("null");
      else if (g.best === 0) setBestMode("zero");
      else {
        setBestMode("num");
        $("grind-best-num").value = String(g.best);
      }
      (g.segments || []).forEach(function (s) { addRun(s[0], s[1]); });
      note.value = g.note || "";
      countNote();
      editing = { player: g.player, levelId: g.levelId };
      var box = $("grind-editing");
      clear(box).appendChild(document.createTextNode("Editing " + g.player + "'s " + levelName(g.levelId) + ". Saving replaces it."));
      box.hidden = false;
      localLevelHint(level, info);
      level.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function goalSummary(g) {
      var bits = [];
      if (g.best === null || g.best === undefined) bits.push("best unknown");
      else if (g.best === 0) bits.push("not started");
      else bits.push("best " + g.best + "%");
      if (g.segments && g.segments.length) {
        bits.push("runs " + g.segments.map(function (s) { return s[0] + "–" + s[1]; }).join(", "));
      }
      return bits.join(" · ");
    }

    function showCurrent() {
      var box = $("grind-current");
      clear(box);
      var v = player.value.normalize("NFC");
      if (!v.trim()) {
        box.hidden = true;
        return;
      }
      var who = resolvePlayer(v);
      if (!who) {
        box.appendChild(el("p", { className: "hint" }, v + " isn't on the list yet - add them in Members first."));
        box.hidden = false;
        return;
      }
      var mine = goalsOf(who);
      box.appendChild(el("p", { className: "label" }, mine.length ? who + " is grinding:" : who + " isn't grinding anything yet."));
      var list = el("ul", { className: "goal-list" });
      mine.forEach(function (g) {
        var edit = el("button", { type: "button", className: "button white hover small" }, "Edit");
        var drop = el("button", { type: "button", className: "button white hover small" }, "Dropped it");
        var line = el("li", null,
          el("div", { className: "goal-text" },
            el("b", null, levelName(g.levelId)), " ", el("span", { className: "muted" }, goalSummary(g)),
            g.note ? el("div", { className: "muted" }, "“" + g.note + "”") : null),
          el("div", { className: "goal-buttons" }, edit, drop));
        edit.addEventListener("click", function () { fillFrom(g); });
        drop.addEventListener("click", function () {
          if (!armed(drop, "Tap again: dropped")) return;
          save([{ op: "remove_grind", player: g.player, level: g.levelId }], g.player + " dropped " + levelName(g.levelId) + " (Grind)", drop, msg);
        });
        list.appendChild(line);
      });
      box.appendChild(list);
      box.hidden = false;
    }
    player.addEventListener("input", showCurrent);
    level.addEventListener("input", function () {
      localLevelHint(level, info);
      if (rated) rated.typed();
    });
    $("grind-check").addEventListener("click", function () {
      checkLevel(level, info, $("grind-check"), false, rated);
    });
    $("grind-clear").addEventListener("click", function () {
      resetForm();
      hush(msg);
    });

    function saveGrind() {
      var op, add = null;
      try {
        var name = checkName(player.value, "player");
        var who = resolvePlayer(name);
        if (!who) throw new Problem(name + " isn't on the list yet - add them in Members first.");
        var id = parseLevel(level.value);
        var d = demonByLevel(id) || unratedByLevel(id); // a clear on an unrated level ends its Grind too
        if (d && (d.records || []).some(function (r) { return r.player === who && r.progress >= 100; })) {
          throw new Problem(who + " has already beaten " + String(d.name).trim() + ". To take it off their Grind, use Dropped it.");
        }
        var mode = bestMode();
        var best = mode === "null" ? null : mode === "zero" ? 0 : parseWhole($("grind-best-num").value, "Best run", 0, 100);
        var segs = [];
        Array.prototype.forEach.call(runs.children, function (row, i) {
          var a = row.querySelector(".run-from").value.trim();
          var b = row.querySelector(".run-to").value.trim();
          if (!a && !b) return; // an empty row is just left out
          var from = parseWhole(a, "Run " + (i + 1) + "'s start", 0, 100);
          var to = parseWhole(b, "Run " + (i + 1) + "'s end", 0, 100);
          if (from >= to) throw new Problem("Run " + from + "–" + to + " has to end after it starts.");
          segs.push([from, to]);
        });
        if (segs.length > MAX_RUNS) throw new Problem("A goal can have " + MAX_RUNS + " runs at most.");
        // The grind rule (the server would quietly leave these out; better
        // to say so here, so what's saved is what the form shows).
        segs.forEach(function (s, i) {
          var same = segs.findIndex(function (t) { return t[0] === s[0] && t[1] === s[1]; });
          if (same !== i) throw new Problem("Run " + s[0] + "–" + s[1] + " is in there twice. Repeats go in the note (e.g. \"" + s[0] + "–" + s[1] + " twice.\").");
          if (best !== null && s[1] <= best) {
            throw new Problem("Leave out " + s[0] + "–" + s[1] + ": it's inside their 0–" + best + " run from the start.");
          }
          var outer = segs.find(function (t) { return (t[0] !== s[0] || t[1] !== s[1]) && t[0] <= s[0] && s[1] <= t[1]; });
          if (outer) throw new Problem("Leave out " + s[0] + "–" + s[1] + ": it's completely inside " + outer[0] + "–" + outer[1] + ".");
        });
        var text = checkNote(note.value);
        op = { op: "set_grind", player: who, level: id, best: best, segments: segs };
        if (text) op.note = text;
        // Rated+: a level that's unrated in game goes on it with this goal (head mods)
        var need = rated && !d ? rated.need(id) : "";
        if (need === "ask") {
          lookUpFirst(level, info, false, rated, $("grind-save"), msg, saveGrind);
          return;
        }
        if (need === "mod") throw new Problem(ONLY_HEAD);
        if (need === "add") add = rated.op(id);
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(msg, "err", e.message);
        return;
      }
      var what = "Grind: " + op.player + " on " + nameOf(op.level, rated) + (add ? " (unrated, new on Rated+)" : "");
      save(add ? [add, op] : [op], what, $("grind-save"), msg, function () {
        if (add) rated.added(op.level);
        resetForm();
      });
    }
    $("grind-save").addEventListener("click", saveGrind);

    resetForm();
  }

  // --- 3. Members ---------------------------------------------------------------

  function setupMembers() {
    var msg = $("member-msg");
    $("member-country").addEventListener("change", function () {
      fillSubdivisionSelect($("member-subdivision"), $("member-country").value, "", $("member-subdivision-row"));
    });
    $("member-save").addEventListener("click", function () {
      var op;
      try {
        var name = checkName($("member-name").value, "member");
        var already = resolvePlayer(name);
        if (already) throw new Problem(already + " is already on the list.");
        var cc = $("member-country").value;
        if (!COUNTRIES[cc]) throw new Problem("Pick " + name + "'s country.");
        op = { op: "add_member", name: name, nationality: cc };
        var msub = pickedSubdivision($("member-subdivision"), $("member-subdivision-row"));
        if (msub) op.subdivision = msub;
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(msg, "err", e.message);
        return;
      }
      save([op], "New member: " + op.name + " (" + COUNTRIES[op.nationality] + ")", $("member-save"), msg, function () {
        $("member-name").value = "";
        $("member-country").value = "";
        fillSubdivisionSelect($("member-subdivision"), "", "", $("member-subdivision-row"));
      });
    });

    var roster = $("roster");
    knownPlayers()
      .sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); })
      .forEach(function (name) {
        var clears = recordsOf(name).filter(function (x) { return x.record.progress >= 100; }).length;
        var cc = nationalityOf(name);
        var li = el("li", null, flag(cc), " ", el("span", { className: "name" }, name),
          el("span", { className: "muted" }, clears ? clears + (clears === 1 ? " clear" : " clears") : "no clears yet"));
        if (isHead()) {
          var edit = el("button", { type: "button", className: "button white hover small" }, "Edit");
          edit.addEventListener("click", function () { memberEditor(li, name, cc); });
          li.appendChild(edit);
        }
        roster.appendChild(li);
      });
  }

  // A member's editor under their roster row (head mods): name, country, remove.
  // Changing both sends the country first (under the old name), then the rename.
  function memberEditor(li, name, cc) {
    var open = li.querySelector(".member-edit");
    if (open) {
      open.remove();
      return;
    }
    var input = el("input", { type: "text", value: name, autocomplete: "off", spellcheck: false });
    var country = el("select", { className: "country-select" });
    fillCountrySelect(country);
    country.value = cc || "";
    var sub0 = subdivisionOf(name);
    var subdivision = el("select", { className: "country-select" });
    var subRow = el("label", { className: "field" }, el("span", null, "State / province"), subdivision);
    fillSubdivisionSelect(subdivision, cc || "", sub0, subRow);
    country.addEventListener("change", function () { fillSubdivisionSelect(subdivision, country.value, "", subRow); });
    var save1 = el("button", { type: "button", className: "button blue hover small" }, "Save");
    var remove = el("button", { type: "button", className: "button red hover small" }, "Remove from the list");
    var box = el("div", { className: "msg" });
    box.hidden = true;
    var records = recordsOf(name).length;
    var wrap = el("div", { className: "member-edit" },
      el("label", { className: "field" }, el("span", null, "Name"), input),
      el("label", { className: "field" }, el("span", null, "Country"), country),
      subRow,
      save1, " ", remove,
      records ? el("p", { className: "hint" }, "To remove " + name + ", remove their clears first (Clears & videos).") : null,
      box);
    if (records) remove.disabled = true;
    save1.addEventListener("click", function () {
      var ops = [];
      try {
        var newName = checkName(input.value, "name");
        var sub = pickedSubdivision(subdivision, subRow);
        if (country.value !== (cc || "") || sub !== sub0) {
          if (!COUNTRIES[country.value]) throw new Problem("Pick a country.");
          var cop = { op: "set_member_country", name: name, nationality: country.value };
          if (sub) cop.subdivision = sub;
          ops.push(cop);
        }
        if (newName !== name) {
          var other = resolvePlayer(newName);
          if (other && other !== name) throw new Problem(other + " is already on the list.");
          ops.push({ op: "rename_member", name: name, newName: newName });
        }
        if (!ops.length) throw new Problem("Nothing changed.");
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(box, "err", e.message);
        return;
      }
      save(ops, "Edit member: " + name, save1, box);
    });
    remove.addEventListener("click", function () {
      if (!window.confirm("Remove " + name + " from the list?")) return;
      save([{ op: "remove_member", name: name }], "Remove member: " + name, remove, box);
    });
    li.appendChild(wrap);
  }

  // --- 4. Clears & videos -------------------------------------------------------

  function setupVideos() {
    var player = $("video-player");
    var select = $("video-record");
    var msg = $("video-msg");
    var rows = [];

    function current() {
      return rows[Number(select.value)] || null;
    }

    function showRecord() {
      var row = current();
      $("video-tools").hidden = !row;
      if (!row) return;
      var box = clear($("video-current"));
      // add-video.py only knows the list: a clear on an unrated level can be
      // removed, but takes no video yet
      $("video-url").disabled = $("video-save").disabled = !!row.unrated;
      if (row.unrated) {
        box.appendChild(document.createTextNode("Videos on unrated levels' clears aren't supported yet."));
        $("video-remove").disabled = true;
        $("video-url").value = "";
        return;
      }
      var v = row.record.video;
      if (!v) box.appendChild(document.createTextNode("No video on this clear yet."));
      else if (/^https:\/\//i.test(v)) {
        box.appendChild(document.createTextNode("Video now: "));
        box.appendChild(el("a", { href: v, target: "_blank", rel: "noopener noreferrer" }, v));
      } else {
        box.appendChild(document.createTextNode("Video now: a video file on the site. Saving a link replaces it."));
      }
      $("video-remove").disabled = !v;
      $("video-url").value = "";
    }

    function onPlayer() {
      hush(msg);
      clear(select);
      var v = player.value.normalize("NFC");
      var who = v.trim() ? resolvePlayer(v) : null;
      rows = who ? recordsOf(who) : [];
      $("video-record-row").hidden = !rows.length;
      var none = $("video-none");
      none.hidden = !v.trim() || rows.length > 0;
      none.textContent = !who ? v + " isn't on the list." : who + " has no clears on the list yet.";
      rows.forEach(function (x, i) {
        var label = x.unrated
          ? "Unrated: " + String(x.demon.name).trim() + " - " + x.record.progress + "%"
          : "#" + x.demon.position + " " + x.demon.name + " - " + x.record.progress + "%" + (x.record.video ? " · has a video" : "");
        select.appendChild(el("option", { value: String(i) }, label));
      });
      showRecord();
    }
    player.addEventListener("input", onPlayer);
    select.addEventListener("change", function () {
      hush(msg);
      showRecord();
    });

    $("video-save").addEventListener("click", function () {
      var row = current();
      if (!row || row.unrated) return;
      var op;
      try {
        if (!$("video-url").value.trim()) throw new Problem("Paste the video link first.");
        op = { op: "set_record_video", player: row.record.player, level: row.demon.levelId, url: checkVideo($("video-url").value) };
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(msg, "err", e.message);
        return;
      }
      save([op], "Video for " + op.player + " on " + row.demon.name, $("video-save"), msg, function () {
        $("video-url").value = "";
      });
    });

    $("video-remove").addEventListener("click", function () {
      var row = current();
      if (!row || row.unrated || !row.record.video) return;
      if (!armed($("video-remove"))) return;
      save([{ op: "remove_record_video", player: row.record.player, level: row.demon.levelId }],
        "Remove the video from " + row.record.player + "'s " + row.demon.name, $("video-remove"), msg);
    });

    $("record-remove").addEventListener("click", function () {
      var row = current();
      if (!row) return;
      if (!armed($("record-remove"), "Tap again to remove " + row.demon.name)) return;
      save([{ op: "remove_record", player: row.record.player, level: row.demon.levelId }],
        "Remove " + row.record.player + "'s " + row.record.progress + "% on " + row.demon.name, $("record-remove"), msg);
    });
  }

  // --- 5. List order ------------------------------------------------------------

  function setupOrder() {
    $("order-save").addEventListener("click", function () {
      save([{ op: "refresh_order" }], "Refresh the list order", $("order-save"), $("order-msg"));
    });
    $("showcase-save").addEventListener("click", function () {
      save([{ op: "refresh_showcases" }], "Check Nigel's channel for showcases", $("showcase-save"), $("showcase-msg"));
    });
  }

  // --- 5b. Rated+: the unrated levels (head mods) -------------------------------------
  //
  // data/unrated.js: levels that aren't rated in game but count in the list's
  // Rated+ views (Nigel and Dihmaster500, 2026-10-30). A head mod's GD Demon
  // Ladder estimate places and scores each one; a spot picked by hand has to be
  // inside the window static/js/views.js gives (DL.unratedSlots), and the server
  // checks it again (tools/apply-edit.py slot_ok). One goes on with its first
  // clear or Grind goal (the Rated+ box in Add a clear and Grind, below); the
  // Rated+ levels panel edits and removes them. Only on a list with
  // SITE.ratedPlus, and only for head mods: the server refuses mods anyway.

  var TIERS = ["Extreme", "Insane"];
  var SHOWCASE_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be"];

  // the tier an estimate counts as until the mod picks one (apply-edit.py's default)
  function tierFor(rating) {
    return rating >= 20 ? "Extreme" : "Insane";
  }

  // "31.25" -> 31.25: a GD Demon Ladder estimate, 1-50 with at most 2 decimals
  function parseEstimate(v) {
    v = String(v).trim();
    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(v) || !(Number(v) >= 1 && Number(v) <= 50)) {
      throw new Problem("The GDDL estimate must be a number from 1 to 50, with at most 2 decimals.");
    }
    return Math.round(Number(v) * 100) / 100;
  }

  // a link to one YouTube video (contract.js checkShowcase)
  function checkShowcase(v) {
    v = v.trim();
    var m = /^https:\/\/([^/?#]*)/i.exec(v);
    var host = m ? m[1].toLowerCase() : "";
    if (len(v) > 300 || /\s/u.test(v) || !m || host.indexOf("@") >= 0 || host.indexOf(":") >= 0 || SHOWCASE_HOSTS.indexOf(host) < 0 ||
        !/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)[A-Za-z0-9_-]{11}/.test(v)) {
      throw new Problem("The showcase has to be a link to one YouTube video, starting with https:// (the Share button's link works).");
    }
    return v;
  }

  // A neighbour in a spot's label: "#5 Shardscapes (31.72, GDDL 32.75)" - the
  // value the list orders by (an extreme's AREDL placement), and its GD Demon
  // Ladder rating when that's different: the AREDL conflict a spot is picked around.
  function neighbour(d) {
    var v = DL.demonRating(d);
    var s = "#" + d.position + " " + String(d.name).trim() + " (" + v.toFixed(2);
    if (typeof d.rating === "number" && Math.abs(d.rating - v) >= 0.01) s += ", GDDL " + d.rating.toFixed(2);
    return s + ")";
  }

  function spotLabel(slot, tier) {
    if (slot.anchor === 0) return "At the very top" + (slot.below ? ", above " + neighbour(slot.below) : "");
    var tiered = SITE.mainListSize === "extremes" && typeof DL.tierRank === "function";
    if (!slot.below || (tiered && DL.tierRank(slot.below) !== DL.tierRank({ difficulty: tier }))) {
      return "At the very bottom of the " + (tiered ? tier + "s" : "list") + ", below " + neighbour(slot.above);
    }
    return "Between " + neighbour(slot.above) + " and " + neighbour(slot.below);
  }

  // The spot picker in `box`: Automatic, then every spot in u's window (once u -
  // {levelId, difficulty, rating} - is complete and views.js is there). selected:
  // "auto" or an anchor; one that isn't offered falls back to Automatic. keep
  // (optional): a hand-picked anchor the list has moved out of the window,
  // offered as itself so that keeping it sends nothing.
  function spotPicker(box, group, u, selected, keep) {
    clear(box);
    box.className = "choices";
    box.style.flexDirection = "column";
    var slots = u && typeof DL.unratedSlots === "function" ? DL.unratedSlots(u, DL.sortedDemons()) : [];
    var options = [{ value: "auto", text: "Automatic - where the estimate puts it" }].concat(slots.map(function (s) {
      return { value: String(s.anchor), text: spotLabel(s, u.difficulty) + (s.auto ? " (the estimate's spot)" : "") };
    }));
    if (keep !== undefined && keep !== null && !options.some(function (o) { return o.value === String(keep); })) {
      options.splice(1, 0, {
        value: String(keep),
        text: "Keep the hand-picked spot - it doesn't fit right now, so the estimate places it until it fits again",
      });
    }
    if (!options.some(function (o) { return o.value === String(selected); })) selected = "auto";
    options.forEach(function (o) {
      var label = el("label", null, el("input", { type: "radio", name: group, value: o.value, checked: o.value === String(selected) }),
        el("span", null, o.text));
      label.style.whiteSpace = "normal";
      label.style.justifyContent = "flex-start";
      label.style.textAlign = "left";
      box.appendChild(label);
    });
  }

  // "auto", or the picked spot's anchor (0 = the very top)
  function pickedSpot(box) {
    var r = box.querySelector('input[type="radio"]:checked');
    return !r || r.value === "auto" ? "auto" : Number(r.value);
  }

  function inGrind(id) {
    return GOALS.some(function (g) { return Number(g.levelId) === id; });
  }

  // "a", "a and b", "a, b and c"
  function andList(names) {
    return names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  // --- the Rated+ box in Add a clear and Grind ---
  //
  // A level that's unrated in game goes on Rated+ with its first clear or Grind
  // goal (Nigel, 2026-10-30). When Check finds one - 0 stars, not on the list, not
  // on Rated+ yet - or Save does (it looks the level up itself when nobody pressed
  // Check), a head mod gets this box under the level: the GDDL estimate that places
  // and scores it, the tier it counts as, a showcase and a hand-picked spot. Save
  // then sends add_unrated first and the clear or the goal after it, as one batch.
  // A mod is told only a head mod can. When the look-up can't tell whether it's
  // rated, head mods get an "It's unrated" box to tick for the same fields. The
  // server checks it all again (tools/apply-edit.py refuse_unrated_in_game).

  var ONLY_HEAD = "It's unrated: only a head mod can put it on Rated+ (with a GDDL estimate).";

  // What a look-up's answer for level id means for Rated+: "unrated" (0 stars, on
  // neither list), "platformer" (the same, but the list never takes those), "maybe"
  // (it couldn't tell: no star count and gdladder, which only has rated levels,
  // doesn't know it, or the look-up failed on the server's side), or "".
  // lv: /api/level's answer, null when it failed with HTTP status `status`.
  function ratedPlusCase(id, lv, status) {
    if (!SITE.ratedPlus || demonByLevel(id) || unratedByLevel(id)) return "";
    if (!lv) return status === 0 || status >= 500 ? "maybe" : "";
    if (lv.onList === true) return "";
    if (lv.stars === 0) return lv.platformer ? "platformer" : "unrated";
    return typeof lv.stars !== "number" && (lv.rating === null || lv.rating === undefined) && !lv.platformer ? "maybe" : "";
  }

  // Level ids a save from this page put on Rated+ (with its add_unrated), in either
  // panel: the list here only shows them after a reload.
  var addedToPlus = {};

  // One panel's box ("clear" or "grind"), right under its level field; null on a
  // list without Rated+. forGrind: a level already in someone's Grind needs none
  // (the server takes more goals on it as it is).
  function ratedPlusBox(prefix, level, info, forGrind) {
    if (!SITE.ratedPlus) return null;
    var found = {}; // level id -> [its look-up's answer or null, HTTP status]
    var shownFor = null; // the level id the box is open for
    var typedFor = null; // the level id its fields were filled in for
    var tierPicked = false; // the tier follows the estimate until the mod picks one

    var tick = el("input", { type: "checkbox", id: prefix + "-unrated-is" });
    var maybe = el("div", { id: prefix + "-unrated-maybe" },
      el("label", null, tick, " ", el("b", null, "It's unrated")),
      el("p", { className: "hint" }, "Couldn't tell whether it's rated in game. Tick this if it isn't; the list checks again when you save."));
    var est = el("input", { type: "number", id: prefix + "-unrated-rating", min: 1, max: 50, step: 0.01, inputMode: "decimal", placeholder: "e.g. 31.25" });
    var tier = el("select", { id: prefix + "-unrated-tier" }, el("option", { value: "Extreme" }, "Extreme"), el("option", { value: "Insane" }, "Insane"));
    var link = el("input", { type: "url", id: prefix + "-unrated-showcase", autocomplete: "off", spellcheck: false, placeholder: "A YouTube link" });
    var spots = el("div", { id: prefix + "-unrated-place" });
    var summary = el("summary", null, "Spot on the list ", el("i", null, "(optional)"));
    summary.style.fontWeight = "bold";
    summary.style.cursor = "pointer";
    var fold = el("details", { className: "field", id: prefix + "-unrated-spot" }, summary,
      el("p", { className: "hint" }, "Where the estimate puts it, or a spot close by when the AREDL order makes it a close call. Its points come from the estimate either way."),
      spots);
    var body = el("div", { id: prefix + "-unrated-body" },
      el("p", null, el("b", null, "Unrated - it counts in Rated+ only.")),
      el("p", { className: "hint" }, "Saving puts it on Rated+ with this " + (forGrind ? "goal" : "clear") +
        ". Your GDDL estimate places and scores it. It shows on the Rated+ list once someone beats it."),
      el("div", { className: "two" },
        el("label", { className: "field" }, el("span", null, "GDDL estimate"), est),
        el("label", { className: "field" }, el("span", null, "Counts as"), tier)),
      el("label", { className: "field" }, el("span", null, "Showcase ", el("i", null, "(optional)")), link),
      fold);
    var box = el("div", { className: "info-yellow", id: prefix + "-unrated" }, maybe, body);
    box.hidden = true;
    var field = info.parentNode; // the level's field: the box goes right under it
    field.parentNode.insertBefore(box, field.nextSibling);

    // {levelId, difficulty, rating} for the spot picker, or null until the estimate is valid
    function picked() {
      try {
        return shownFor === null ? null : { levelId: shownFor, difficulty: tier.value, rating: parseEstimate(est.value) };
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        return null;
      }
    }
    function drawSpots() {
      spotPicker(spots, prefix + "-unrated-spot", picked(), pickedSpot(spots));
    }
    est.addEventListener("input", function () {
      var n = Number(est.value);
      if (!tierPicked && est.value.trim() && isFinite(n)) tier.value = tierFor(n);
      drawSpots();
    });
    tier.addEventListener("change", function () {
      tierPicked = true;
      drawSpots();
    });
    tick.addEventListener("change", function () {
      body.hidden = !tick.checked;
    });

    function clearFields() {
      est.value = "";
      link.value = "";
      tier.value = "Extreme";
      tierPicked = false;
      tick.checked = false;
      fold.open = false;
      clear(spots);
    }
    function close() {
      box.hidden = true;
      shownFor = null;
    }

    // the Rated+ case of level id, from its last look-up ("" before there is one);
    // "added" for one this page just put on Rated+
    function caseOf(id) {
      if (addedToPlus[id]) return "added";
      if (!found[id] || (forGrind && inGrind(id))) return "";
      return ratedPlusCase(id, found[id][0], found[id][1]);
    }

    // Open the box for level id when it needs it (head mods only), else close it.
    // Its fields stay as typed while it's the same level.
    function draw(id) {
      var c = isHead() ? caseOf(id) : "";
      if (c !== "unrated" && c !== "maybe") return close();
      if (typedFor !== id) {
        clearFields();
        typedFor = id;
      }
      shownFor = id;
      maybe.hidden = c !== "maybe";
      body.hidden = c === "maybe" && !tick.checked;
      box.hidden = false;
      drawSpots();
    }

    return {
      // A look-up's answer for level id (lv null when it failed, with its HTTP
      // status): opens or closes the box, and says the Rated+ case.
      found: function (id, lv, status) {
        found[id] = [lv, status];
        draw(id);
        return caseOf(id);
      },
      // the level field changed: the box closes until that level is looked up
      typed: function () {
        if (levelIn(level) !== shownFor) close();
      },
      // Save, for a level that's neither listed nor on Rated+: "ask" (look it up
      // first), "add" (send add_unrated first), "mod" (only a head mod can put it
      // on Rated+), or "" (save as usual; the server checks).
      need: function (id) {
        if (addedToPlus[id] || (forGrind && inGrind(id))) return "";
        if (!found[id]) return "ask";
        draw(id);
        var c = caseOf(id);
        if (c === "unrated") return isHead() ? "add" : "mod";
        return c === "maybe" && shownFor === id && tick.checked ? "add" : "";
      },
      // the box's add_unrated for level id; a Problem when it isn't filled in right
      op: function (id) {
        if (!est.value.trim()) throw new Problem("It's unrated: give its GDDL estimate (in the box under the level) to put it on Rated+.");
        var e = parseEstimate(est.value);
        var op = { op: "add_unrated", level: id, rating: e, difficulty: TIERS.indexOf(tier.value) >= 0 ? tier.value : tierFor(e) };
        var spot = pickedSpot(spots);
        if (spot !== "auto") op.placeBelow = spot;
        if (link.value.trim()) op.showcase = checkShowcase(link.value);
        return op;
      },
      // its name as the look-up gave it (for Recent edits)
      name: function (id) {
        var lv = found[id] ? found[id][0] : null;
        return lv && lv.name ? String(lv.name).trim() : "level " + id;
      },
      // a save with its add_unrated went through: it's on Rated+ now
      added: function (id) {
        addedToPlus[id] = true;
      },
      // did this page put level id on Rated+? (the list here shows it after a reload)
      onPlus: function (id) {
        return addedToPlus[id] === true;
      },
      reset: function () {
        close();
        typedFor = null;
        clearFields();
      },
    };
  }

  // --- the Rated+ levels panel: every unrated level, beaten or not yet ---

  function setupUnrated() {
    var panel = $("panel-unrated");
    if (!panel || !SITE.ratedPlus || !isHead()) return;
    panel.hidden = false;
    var jump = document.querySelector('a[href="#panel-unrated"]');
    if (jump) jump.hidden = false;

    // the beaten ones first, in Rated+ order; then the rest, hardest first
    var view = ratedPlusView();
    function pos(u) {
      var p = view && unratedBeaten(u) ? view.pos(u) : null;
      return typeof p === "number" ? p : null;
    }
    var list = $("unrated-list");
    var entries = UNRATED.filter(function (u) { return u && !demonByLevel(u.levelId); }).sort(function (a, b) {
      var ba = unratedBeaten(a), bb = unratedBeaten(b), pa = pos(a), pb = pos(b);
      if (ba !== bb) return ba ? -1 : 1;
      if (pa !== null && pb !== null) return pa - pb;
      return TIERS.indexOf(a.difficulty) - TIERS.indexOf(b.difficulty) || b.rating - a.rating || a.levelId - b.levelId;
    });
    if (!entries.length) list.appendChild(el("li", { className: "hint" }, "None yet."));
    entries.forEach(function (u) { list.appendChild(unratedRow(u, pos(u))); });
  }

  // One row of the Rated+ levels panel - beaten (and where it sits on Rated+) or
  // not yet (and who's grinding it) - with Edit, Move to the list and Remove.
  function unratedRow(u, pos) {
    var name = String(u.name).trim();
    var records = u.records || [];
    var full = records.filter(function (r) { return r.progress >= 100; });
    var part = records.length - full.length;
    var beaten = unratedBeaten(u);
    var grinders = Array.from(new Set(GOALS.filter(function (g) { return Number(g.levelId) === u.levelId; })
      .map(function (g) { return g.player; })));
    var bits = [];
    if (beaten) {
      bits.push("Beaten");
      if (pos !== null) bits.push("#" + pos + " in Rated+");
      bits.push(full.length + (full.length === 1 ? " clear" : " clears"));
    } else {
      bits.push("Not beaten yet");
      bits.push(grinders.length ? andList(grinders) + (grinders.length === 1 ? " is" : " are") + " grinding it" : "nobody's grinding it");
    }
    if (part) bits.push(part + (part === 1 ? " record" : " records") + " under 100%");
    else if (!records.length) bits.push("no records yet");
    if (u.placeBelow !== undefined && u.placeBelow !== null) {
      var fits = typeof DL.unratedSlotOk !== "function" || DL.unratedSlotOk(u, u.placeBelow);
      bits.push(fits ? "hand-picked spot" : "hand-picked spot no longer fits - placed by its estimate");
    }
    // until someone beats it, it's a Grind level of Rated+: its Grind page, when it has one
    var href = !beaten && grinders.length
      ? "../demonlist/goal.html?level=" + encodeURIComponent(u.levelId) + "&rating=plus"
      : "../demonlist/demon.html?id=" + encodeURIComponent(u.levelId) + "&rating=plus";
    var page = el("a", { href: href, target: "_blank", rel: "noopener" }, name);
    var edit = el("button", { type: "button", className: "button white hover small" }, "Edit");
    var move = el("button", { type: "button", className: "button white hover small" }, "Move to the list");
    var drop = el("button", { type: "button", className: "button red hover small" }, "Remove");
    var box = el("div", { className: "msg" });
    box.hidden = true;
    box.style.flexBasis = "100%";
    // one remove_unrated plus an add_record per 100%, in one batch of at most 10
    move.disabled = !full.length || full.length > 9;
    move.title = !full.length ? "Only 100% clears carry over to the list, and it has none yet."
      : full.length > 9 ? "It has more than 9 clears - too many to move in one edit."
      : "Once it's rated in game. Partial clears don't carry over.";
    var li = el("li", null,
      el("div", { className: "goal-text" },
        el("b", null, page), " ", el("span", { className: "muted" }, u.difficulty + " · estimate " + Number(u.rating).toFixed(2)),
        el("div", { className: "muted" }, bits.join(" · "))),
      el("div", { className: "goal-buttons" }, edit, move, drop),
      box);
    edit.addEventListener("click", function () { unratedEditor(li, u); });
    move.addEventListener("click", function () {
      if (!armed(move, "Tap again to move it")) {
        say(box, "warn", "Once it's rated in game. Partial clears don't carry over.");
        return;
      }
      var ops = [{ op: "remove_unrated", level: u.levelId }].concat(full.map(function (r) {
        return { op: "add_record", player: r.player, level: u.levelId, progress: 100 };
      }));
      save(ops, "Move " + name + " to the list", move, box);
    });
    drop.addEventListener("click", function () {
      var n = records.length;
      if (!armed(drop, n ? "Tap again: its " + n + (n === 1 ? " clear goes" : " clears go") + " too" : "Tap again to remove it")) return;
      save([{ op: "remove_unrated", level: u.levelId }], "Unrated: " + name + " off Rated+", drop, box);
    });
    return li;
  }

  // The editor under a Rated+ levels row: estimate, tier, showcase and spot.
  // It sends set_unrated with only what changed.
  function unratedEditor(li, u) {
    var open = li.querySelector(".unrated-edit");
    if (open) {
      open.remove();
      return;
    }
    var name = String(u.name).trim();
    var est = el("input", { type: "number", min: 1, max: 50, step: 0.01, inputMode: "decimal", value: String(u.rating) });
    var tier = el("select", null, el("option", { value: "Extreme" }, "Extreme"), el("option", { value: "Insane" }, "Insane"));
    tier.value = u.difficulty;
    var link = el("input", { type: "url", autocomplete: "off", spellcheck: false, placeholder: u.videoUrl ? "A new YouTube link" : "A YouTube link" });
    var noShowcase = el("input", { type: "checkbox" });
    var spots = el("div");
    var saveButton = el("button", { type: "button", className: "button blue hover small" }, "Save");
    var box = el("div", { className: "msg" });
    box.hidden = true;
    var stored = u.placeBelow !== undefined && u.placeBelow !== null ? u.placeBelow : null;
    var group = "unrated-spot-" + u.levelId;

    function edited() {
      try {
        return { levelId: u.levelId, difficulty: tier.value, rating: parseEstimate(est.value) };
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        return null;
      }
    }
    // Until the head mod picks a spot themselves, the picker shows the stored
    // one. A stored spot the list has moved out from under stays on offer (and
    // picked) while the estimate and tier are unchanged, so saving only a new
    // showcase doesn't drop it. With a new estimate or tier the server drops a
    // spot that doesn't fit, so then it isn't offered.
    var choice;
    function drawSpots() {
      var e = edited();
      var keep = stored !== null && e && e.rating === u.rating && e.difficulty === u.difficulty ? stored : null;
      spotPicker(spots, group, e, choice !== undefined ? choice : stored === null ? "auto" : stored, keep);
    }
    est.addEventListener("input", drawSpots);
    tier.addEventListener("change", drawSpots);
    spots.addEventListener("change", function () { choice = pickedSpot(spots); });
    noShowcase.addEventListener("change", function () { link.disabled = noShowcase.checked; });

    var now = u.videoUrl
      ? el("p", { className: "hint" }, "Showcase now: ", el("a", { href: u.videoUrl, target: "_blank", rel: "noopener noreferrer" }, u.videoUrl))
      : el("p", { className: "hint" }, "No showcase yet.");
    var wrap = el("div", { className: "unrated-edit" },
      el("div", { className: "two" },
        el("label", { className: "field" }, el("span", null, "GDDL estimate"), est),
        el("label", { className: "field" }, el("span", null, "Counts as"), tier)),
      el("label", { className: "field" }, el("span", null, "Showcase"), link),
      now,
      u.videoUrl ? el("label", null, noShowcase, " Remove the showcase") : null,
      el("fieldset", { className: "field" }, el("legend", null, "Spot on the list"), spots),
      saveButton, box);
    wrap.style.flexBasis = "100%";
    li.appendChild(wrap);
    drawSpots();

    saveButton.addEventListener("click", function () {
      var op = { op: "set_unrated", level: u.levelId };
      var what = [];
      try {
        var r = parseEstimate(est.value);
        if (r !== u.rating) {
          op.rating = r;
          what.push("estimate " + r.toFixed(2));
        }
        if (tier.value !== u.difficulty && TIERS.indexOf(tier.value) >= 0) {
          op.difficulty = tier.value;
          what.push("counts as an " + tier.value);
        }
        var picked = pickedSpot(spots);
        if (picked === "auto" ? stored !== null : picked !== stored) {
          op.placeBelow = picked === "auto" ? null : picked;
          what.push(picked === "auto" ? "placed by its estimate" : "a new spot");
        }
        if (noShowcase.checked && u.videoUrl) {
          op.showcase = null;
          what.push("no showcase");
        } else if (link.value.trim()) {
          op.showcase = checkShowcase(link.value);
          what.push("new showcase");
        }
        if (!what.length) throw new Problem("Nothing changed.");
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(box, "err", e.message);
        return;
      }
      save([op], "Unrated: " + name + " - " + what.join(", "), saveButton, box);
    });
  }

  // --- 6. Recent edits ----------------------------------------------------------

  // What each edit sent from this browser was, by requestId: the server only
  // knows the id and who sent it. Kept in localStorage so a reload keeps the
  // descriptions; it's a convenience, so any storage failure is ignored.
  var STORE = "mod-page-edits";
  var DAY = 24 * 3600 * 1000;

  function loadTracked() {
    try {
      var v = JSON.parse(localStorage.getItem(STORE) || "[]");
      return Array.isArray(v) ? v.filter(function (t) { return t && /^[0-9a-f]{16}$/.test(t.id) && Date.now() - t.at < DAY; }) : [];
    } catch (e) {
      return [];
    }
  }
  var tracked = loadTracked();

  function track(id, what) {
    tracked.unshift({ id: id, what: what, at: Date.now() });
    tracked = tracked.slice(0, 40);
    try {
      localStorage.setItem(STORE, JSON.stringify(tracked));
    } catch (e) {
      /* private window etc. - descriptions just won't survive a reload */
    }
    refreshEdits();
  }

  var reasons = {}; // requestId -> why it failed (asked for once)
  var pollTimer = null;

  function ago(iso) {
    var t = Date.parse(iso);
    if (!t) return "";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < DAY / 1000) return Math.floor(s / 3600) + " h ago";
    return new Date(t).toLocaleDateString();
  }

  // [label, css class, finished?]
  function statusOf(run) {
    if (run.status !== "completed") {
      return run.status === "in_progress" ? ["Working", "working", false] : ["Queued", "queued", false];
    }
    if (run.conclusion === "success") {
      var fresh = Date.now() - Date.parse(run.createdAt) < 15 * 60 * 1000;
      return [fresh ? "Live in about a minute" : "Done", "done", true];
    }
    if (run.conclusion === "cancelled") return ["Failed (cancelled)", "failed", true];
    if (run.conclusion === "timed_out") return ["Failed (took too long)", "failed", true];
    return ["Failed", "failed", true];
  }

  function renderEdits(runs) {
    var list = clear($("edits"));
    // edits sent from here that GitHub hasn't started yet
    var seen = {};
    runs.forEach(function (r) { seen[r.requestId] = true; });
    var waiting = tracked
      .filter(function (t) { return !seen[t.id] && Date.now() - t.at < 15 * 60 * 1000; })
      .map(function (t) {
        return { requestId: t.id, editor: me ? me.name : "", status: "queued", conclusion: null, createdAt: new Date(t.at).toISOString(), url: null };
      });
    var all = waiting.concat(runs).sort(function (a, b) {
      return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    });
    if (!all.length) {
      list.appendChild(el("li", { className: "hint" }, "No edits yet."));
      return false;
    }
    var busy = false;
    all.forEach(function (run) {
      var t = tracked.find(function (x) { return x.id === run.requestId; });
      var st = statusOf(run);
      if (!st[2]) busy = true;
      var li = el("li", { className: "edit " + st[1], dataset: { request: run.requestId } },
        el("div", { className: "what" }, t ? t.what : "An edit"),
        el("div", { className: "meta" }, (run.editor ? "by " + run.editor : "") + (run.createdAt ? " · " + ago(run.createdAt) : "")),
        el("div", { className: "state" }, el("span", { className: "badge" }, st[0])));
      if (st[1] === "failed") {
        var why = reasons[run.requestId];
        if (why) li.appendChild(el("div", { className: "why" }, why));
        if (run.url && /^https:\/\/github\.com\//.test(run.url)) {
          li.appendChild(el("a", { className: "details", href: run.url, target: "_blank", rel: "noopener noreferrer" }, "See what happened on GitHub"));
        }
        if (why === undefined) fetchReason(run.requestId);
      }
      // Head mods can undo a finished edit (an "undo" edit of its own; the GitHub
      // job refuses if a newer edit changed the same part of the list).
      if (st[1] === "done" && isHead() && /^[0-9a-f]{16}$/.test(run.requestId || "")) {
        var undoBox = el("div", { className: "msg" });
        undoBox.hidden = true;
        var undoBtn = el("button", { type: "button", className: "button white hover small" }, "Undo");
        undoBtn.addEventListener("click", function () {
          if (!window.confirm("Undo this edit? The list goes back to how it was before it.")) return;
          save([{ op: "undo", requestId: run.requestId }], "Undo: " + (t ? t.what : "an edit"), undoBtn, undoBox);
        });
        li.appendChild(undoBtn);
        li.appendChild(undoBox);
      }
      list.appendChild(li);
    });
    return busy;
  }

  function fetchReason(id) {
    reasons[id] = null; // asked; null until it answers
    api("/api/status?requestId=" + id).then(function (res) {
      if (res.status === 200 && res.data && res.data.run && typeof res.data.run.reason === "string") {
        reasons[id] = res.data.run.reason;
        renderEdits(lastRuns);
      }
    });
  }

  var lastRuns = [];

  function refreshEdits() {
    clearTimeout(pollTimer);
    return api("/api/status").then(function (res) {
      if (res.status === 401) {
        showLogin();
        return;
      }
      if (res.status !== 200 || !Array.isArray(res.data)) {
        clear($("edits")).appendChild(el("li", { className: "info-red" }, "Couldn't load recent edits: " + errorText(res)));
        pollTimer = setTimeout(refreshEdits, 30000);
        return;
      }
      lastRuns = res.data;
      // check again every 10 s while anything is still queued or working
      if (renderEdits(lastRuns)) pollTimer = setTimeout(refreshEdits, 10000);
    });
  }

  // --- 7. Mods (Nigel only) ---------------------------------------------------------

  // Who can log in to this page and as what: functions/editors.json, read through
  // GET /api/mods (Nigel only). A change counts once its edit is live and the site
  // has redeployed, and the List Mods panel on the list follows it.
  function setupMods() {
    var msg = $("mod-msg");
    var team = [];
    function rank(role) {
      return role === "head" ? "head mod" : "mod";
    }

    $("mod-save").addEventListener("click", function () {
      var op;
      try {
        var id = $("mod-id").value.trim();
        if (!DISCORD_ID.test(id)) throw new Problem("Paste their Discord ID: the 17-20 digit number from Copy User ID.");
        if (id === me.id) throw new Problem("That's your own account - it can't be changed here.");
        var name = checkName($("mod-name").value, "mod");
        var clash = team.find(function (m) { return m.id !== id && m.name.toLowerCase() === name.toLowerCase(); });
        if (clash) throw new Problem(clash.name + " is already a mod (on a different Discord account).");
        var role = $("mod-role").value === "head" ? "head" : "mod";
        var old = team.find(function (m) { return m.id === id; });
        if (old && old.name === name && old.role === role) throw new Problem(name + " is already a " + rank(role) + ".");
        op = { op: "set_mod", discordId: id, name: name, role: role };
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(msg, "err", e.message);
        return;
      }
      var known = team.some(function (m) { return m.id === op.discordId; });
      save([op], (known ? "Change mod: " : "New " + rank(op.role) + ": ") + op.name, $("mod-save"), msg, function () {
        $("mod-id").value = "";
        $("mod-name").value = "";
      });
    });

    function row(m) {
      var you = m.id === me.id;
      var li = el("li", null, el("span", { className: "name" }, m.role === "head" ? el("b", null, m.name) : m.name),
        el("span", { className: "muted" }, rank(m.role) + (you ? " (you)" : "")));
      if (you) return li;
      var other = m.role === "head" ? "mod" : "head";
      var flip = el("button", { type: "button", className: "button white hover small" }, "Make " + rank(other));
      var drop = el("button", { type: "button", className: "button red hover small" }, "Remove");
      var box = el("div", { className: "msg" });
      box.hidden = true;
      flip.addEventListener("click", function () {
        save([{ op: "set_mod", discordId: m.id, name: m.name, role: other }], "Make " + m.name + " a " + rank(other), flip, box);
      });
      drop.addEventListener("click", function () {
        if (!window.confirm("Take " + m.name + " off the mod team? They won't be able to log in here any more.")) return;
        save([{ op: "remove_mod", discordId: m.id }], "Remove mod: " + m.name, drop, box);
      });
      li.appendChild(el("span", { className: "mod-buttons" }, flip, drop));
      li.appendChild(box);
      return li;
    }

    api("/api/mods").then(function (res) {
      var list = clear($("mod-team"));
      if (res.status !== 200 || !res.data || !Array.isArray(res.data.mods)) {
        list.appendChild(el("li", { className: "hint" }, "Couldn't load the mod team: " + errorText(res)));
        return;
      }
      team = res.data.mods;
      team.filter(function (m) { return m.role === "head"; })
        .concat(team.filter(function (m) { return m.role !== "head"; }))
        .forEach(function (m) { list.appendChild(row(m)); });
    });
  }

  // --- logging in -----------------------------------------------------------------

  var me = null;

  var LOGIN_ERRORS = {
    cancelled: "The Discord login was cancelled.",
    expired: "That login took too long or was opened twice. Try again.",
    discord: "Discord didn't answer. Try again in a minute.",
    editor_name: "Your name on the editor list isn't valid. Ask Nigel to fix it.",
  };

  function showLogin() {
    clearTimeout(pollTimer);
    $("tools").hidden = true;
    $("login-panel").hidden = false;
    clear($("who")).appendChild(document.createTextNode("You're not logged in."));
    var q = new URLSearchParams(location.search);
    var denied = q.get("denied");
    if (denied && /^[0-9]{1,25}$/.test(denied)) {
      $("denied-user").textContent = q.get("user") || "you used";
      $("denied-id").textContent = denied;
      $("denied").hidden = false;
      $("login-button").textContent = "Log in with a different Discord account";
    } else if (q.get("error")) {
      var box = $("login-problem");
      box.textContent = LOGIN_ERRORS[q.get("error")] || "The login didn't work. Try again.";
      box.hidden = false;
    }
  }

  $("denied-copy").addEventListener("click", function () {
    var id = $("denied-id").textContent;
    var done = function () { $("denied-copy").textContent = "Copied"; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(done, function () { selectText($("denied-id")); });
    } else {
      selectText($("denied-id"));
    }
  });

  // fallback when the clipboard isn't allowed: select it for a manual copy
  function selectText(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    $("denied-copy").textContent = "Selected - copy it";
  }

  function showDown(text) {
    $("who").hidden = true;
    $("down-msg").textContent = text;
    $("down-panel").hidden = false;
  }

  // Head mod or mod (functions/editors.json). Head mods add members, remove clears,
  // re-sort the list and look after the unrated levels; mods do the rest. The
  // server and the GitHub job refuse those edits from a mod anyway: hiding them
  // here just keeps the page honest.
  function isHead() {
    return !!(me && me.role === "head");
  }

  // Nigel's account (contract.js OWNER_ID): the only one that changes the mod team.
  // Same deal: the server and the GitHub job check it again.
  function isOwner() {
    return !!(me && me.owner === true);
  }

  function showTools() {
    var who = clear($("who"));
    who.appendChild(document.createTextNode("Logged in as "));
    who.appendChild(el("b", null, me.name));
    who.appendChild(document.createTextNode(isHead() ? " (head mod)" : " (mod)"));
    if (!isHead()) {
      // (panel-unrated: a list without Rated+ has no such panel)
      ["panel-members", "panel-order", "panel-unrated"].forEach(function (id) {
        if ($(id)) $(id).hidden = true;
        var link = document.querySelector('a[href="#' + id + '"]');
        if (link) link.hidden = true;
      });
      var danger = $("record-remove").closest(".danger");
      if (danger) danger.hidden = true;
    }
    who.appendChild(document.createTextNode(" · "));
    who.appendChild(el("a", { href: "/api/logout", className: "logout" }, "Log out"));

    var names = $("player-names");
    knownPlayers().forEach(function (n) { names.appendChild(el("option", { value: n })); });
    fillCountrySelect($("clear-country"));
    fillCountrySelect($("member-country"));
    setupClear();
    setupGrind();
    setupMembers();
    setupVideos();
    setupOrder();
    setupUnrated();
    if (isOwner()) {
      $("panel-mods").hidden = false;
      document.querySelector('a[href="#panel-mods"]').hidden = false;
      setupMods();
    }
    $("edits-refresh").addEventListener("click", refreshEdits);
    $("tools").hidden = false;
    refreshEdits();
  }

  api("/api/me").then(function (res) {
    if (res.status === 200 && res.data && typeof res.data.name === "string") {
      me = res.data;
      showTools();
    } else if (res.status === 401) {
      showLogin();
    } else if (res.status === 503) {
      showDown(errorText(res));
    } else {
      showDown("Couldn't check your login: " + errorText(res));
    }
  });
})();

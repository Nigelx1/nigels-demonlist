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

  // Every name the list knows: the roster plus anyone holding a record (the
  // same set apply-edit.py checks against).
  function knownPlayers() {
    var names = (SITE.members || []).map(function (m) { return m.name; });
    DEMONS.forEach(function (d) {
      (d.records || []).forEach(function (r) { names.push(r.player); });
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

  function levelName(id) {
    // (trimmed: a few names come from gdbrowser with a trailing space)
    var d = demonByLevel(id);
    if (d) return String(d.name).trim();
    var g = GOAL_LEVELS[String(id)];
    return g && g.name ? String(g.name).trim() : "level " + id;
  }

  // [{demon, record}] for one player, list order
  function recordsOf(name) {
    var out = [];
    DL.sortedDemons().forEach(function (d) {
      (d.records || []).forEach(function (r) {
        if (r.player === name) out.push({ demon: d, record: r });
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

  // As the editor types: what the list already knows about that level, no
  // network needed. The Check button asks gdladder/gdbrowser through the server.
  function localLevelHint(input, box) {
    var id;
    try {
      id = parseLevel(input.value);
    } catch (e) {
      hush(box);
      return;
    }
    var d = demonByLevel(id);
    var g = GOAL_LEVELS[String(id)];
    if (d) say(box, "info", d.name + " - #" + d.position + " on the list.");
    else if (g && g.name) say(box, "info", String(g.name).trim() + " - not on the list (someone's grinding it).");
    else hush(box);
  }

  // forClear: warn about what the list refuses (wrong difficulty, platformer,
  // progress under 100 on a level that isn't on it yet).
  function checkLevel(input, box, button, forClear) {
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
      if (res.status !== 200) {
        say(box, "err", errorText(res));
        return;
      }
      var lv = res.data;
      var facts = [lv.difficulty];
      if (lv.rating !== null && lv.rating !== undefined) facts.push("rating " + lv.rating);
      if (lv.platformer) facts.push("platformer");
      var where = lv.onList === true ? "On the list at #" + lv.position + "." : lv.onList === false ? "Not on the list yet." : "";
      var warn = [];
      if (forClear) {
        var allowed = SITE.allowedDifficulties || ["Extreme", "Insane"];
        if (lv.platformer) warn.push("It's a platformer level - the list doesn't take those, so this would be refused.");
        else if (allowed.indexOf(lv.tier) < 0) warn.push("It's " + (lv.difficulty || "not a demon") + " - the list only takes " + allowed.join(" and ") + " Demons, so this would be refused.");
        else if (lv.onList === false) warn.push("Only a 100% can put it on the list.");
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
    });
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
    level.addEventListener("input", function () { localLevelHint(level, info); });
    $("clear-check").addEventListener("click", function () {
      checkLevel(level, info, $("clear-check"), true);
    });

    $("clear-save").addEventListener("click", function () {
      var ops;
      try {
        var name = checkName(player.value, "player");
        var who = resolvePlayer(name);
        var id = parseLevel(level.value);
        var progress = parseWhole($("clear-progress").value, "Progress", 1, 100);
        var op = { op: "add_record", player: who || name, level: id, progress: progress };
        if (!who) {
          if (!isHead()) throw new Problem(name + " isn't on the list yet. Only head mods can add new players - ask one to add them first.");
          var cc = $("clear-country").value;
          if (!COUNTRIES[cc]) throw new Problem(name + " is new to the list - pick their country.");
          op.nationality = cc;
          var csub = pickedSubdivision($("clear-subdivision"));
          if (csub) op.subdivision = csub;
        }
        var d = demonByLevel(id);
        if (!d && progress < 100) {
          throw new Problem("That level isn't on the list, and only a 100% can put it on. (Progress counts only on levels already on the list.)");
        }
        ops = [op];
        var video = $("clear-video").value.trim();
        if (video) ops.push({ op: "set_record_video", player: op.player, level: id, url: checkVideo(video) });
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(msg, "err", e.message);
        return;
      }
      var what = ops[0].player + " " + ops[0].progress + "% on " + levelName(ops[0].level) + (ops.length > 1 ? " (with video)" : "");
      save(ops, what, $("clear-save"), msg, function () {
        player.value = "";
        level.value = "";
        $("clear-progress").value = "100";
        $("clear-video").value = "";
        $("clear-country").value = "";
        fillSubdivisionSelect($("clear-subdivision"), "");
        hush(info);
        onPlayer();
      });
    });
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

    function resetForm() {
      level.value = "";
      hush(info);
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
    level.addEventListener("input", function () { localLevelHint(level, info); });
    $("grind-check").addEventListener("click", function () {
      checkLevel(level, info, $("grind-check"), false);
    });
    $("grind-clear").addEventListener("click", function () {
      resetForm();
      hush(msg);
    });

    $("grind-save").addEventListener("click", function () {
      var op;
      try {
        var name = checkName(player.value, "player");
        var who = resolvePlayer(name);
        if (!who) throw new Problem(name + " isn't on the list yet - add them in Members first.");
        var id = parseLevel(level.value);
        var d = demonByLevel(id);
        if (d && (d.records || []).some(function (r) { return r.player === who && r.progress >= 100; })) {
          throw new Problem(who + " has already beaten " + d.name + ". To take it off their Grind, use Dropped it.");
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
      } catch (e) {
        if (!(e instanceof Problem)) throw e;
        say(msg, "err", e.message);
        return;
      }
      save([op], "Grind: " + op.player + " on " + levelName(op.level), $("grind-save"), msg, function () {
        resetForm();
      });
    });

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
        var label = "#" + x.demon.position + " " + x.demon.name + " - " + x.record.progress + "%" + (x.record.video ? " · has a video" : "");
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
      if (!row || !row.record.video) return;
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

  // Head mod or mod (functions/editors.json). Head mods add members, remove clears
  // and re-sort the list; mods do the rest. The server and the GitHub job refuse
  // those edits from a mod anyway: hiding them here just keeps the page honest.
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
      ["panel-members", "panel-order"].forEach(function (id) {
        $(id).hidden = true;
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

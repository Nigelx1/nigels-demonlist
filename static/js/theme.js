"use strict";
// -----------------------------------------------------------------------------
// The theme switch (Nigel, 2026-10-31): the moon button in the top bar swaps
// pointercrate's look for the site's own theme - data/config.js `theme`, e.g.
// "cabin" = static/css/theme-cabin.css - and the sun button swaps it back.
// Each viewer's pick is kept in their browser (localStorage), so it follows
// them to every page and the next visit; a first visit gets pointercrate's look.
//
// Loaded in <head> right after data/config.js, so <html data-theme="cabin"> is
// set before the first paint and a page never flashes the other look. The
// theme's stylesheet is linked on every page and does nothing until that
// attribute is set; its font (Google Fonts) is only fetched for a viewer who
// picked it. A site with no theme gets no button: static/core/css/nav.css
// shows it only under <html class="theme-switchable">, which is set here.
// -----------------------------------------------------------------------------

(function () {
  var KEY = "theme";
  var POINTERCRATE = "pointercrate";
  // Every theme the shared code has; a site offers one of them in its config.
  var THEMES = {
    cabin: {
      name: "Night Cabin",
      font: "https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,300..900;1,300..900&display=swap",
    },
  };

  var root = document.documentElement;
  var offered = window.SITE && THEMES.hasOwnProperty(window.SITE.theme) ? window.SITE.theme : null;
  if (!offered) return;
  root.classList.add("theme-switchable");

  function saved() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function save(key) {
    try { window.localStorage.setItem(KEY, key); } catch (e) { /* storage blocked: this page only */ }
  }

  function addFont(key) {
    var id = "theme-font-" + key;
    if (document.getElementById(id)) return;
    var link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = THEMES[key].font;
    document.head.appendChild(link);
  }

  // The button says what it does next: "Switch to Night Cabin" under
  // pointercrate's look, "Switch to Pointercrate" under the theme. (Which icon
  // shows, moon or sun, is nav.css's job, off data-theme.)
  function label() {
    var button = document.getElementById("theme-switch");
    if (!button) return;
    var to = root.getAttribute("data-theme") === offered ? "Pointercrate" : THEMES[offered].name;
    button.title = "Switch to " + to;
    button.setAttribute("aria-label", "Switch to the " + to + " theme");
  }

  function apply(key) {
    if (key === offered) {
      root.setAttribute("data-theme", key);
      addFont(key);
    } else {
      root.removeAttribute("data-theme");
    }
    label();
  }

  // Switching on a page that's already up: without the site's own 0.3-0.8s
  // color transitions, which would fade every panel across one by one.
  function switchTo(key) {
    var still = document.createElement("style");
    still.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(still);
    apply(key);
    void window.getComputedStyle(document.body || root).color; // restyle now, while transitions are off
    var undo = function () { if (still.parentNode) still.parentNode.removeChild(still); };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(undo); });
    } else {
      setTimeout(undo, 50);
    }
  }

  apply(saved() === offered ? offered : POINTERCRATE); // before the first paint

  // (on document, so a click lands even before the page has finished loading)
  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest || !target.closest("#theme-switch")) return;
    var next = root.getAttribute("data-theme") === offered ? POINTERCRATE : offered;
    save(next);
    switchTo(next);
  });

  // a pick made in another tab of the site
  window.addEventListener("storage", function (e) {
    if (e.key === KEY || e.key === null) switchTo(saved() === offered ? offered : POINTERCRATE);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", label);
  else label();
})();

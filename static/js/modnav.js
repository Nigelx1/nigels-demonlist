"use strict";
// -----------------------------------------------------------------------------
// The menu's mod entry, on every page: "Mod login" for everyone, and for a
// logged-in mod "Mod panel (<name>)" + "Log out" - the name comes from the
// Discord-id -> name list (functions/editors.json) through /api/me.
//
// Only a browser that has logged in as a mod asks the server who it is: the
// login sets a small gb_mod cookie (the session itself is HttpOnly, so pages
// can't see it). Everyone else never calls the server, so for them the site
// stays plain static pages. The mod panel always checks, which also sets the
// hint for a mod who logged in before there was one.
// -----------------------------------------------------------------------------

(function () {
  var HINT = "gb_mod";
  var WEEK = 7 * 24 * 60 * 60;

  function entries() {
    return Array.prototype.slice.call(document.querySelectorAll("li.mod-nav"));
  }

  // Opened from disk (file://) there's no server to log in to.
  if (location.protocol === "file:") {
    entries().forEach(function (li) { li.remove(); });
    return;
  }

  var hinted = new RegExp("(?:^|;\\s*)" + HINT + "=1(?:;|$)").test(document.cookie);
  var onPanel = /^\/admin(?:\/|$)/.test(location.pathname);
  if (!hinted && !onPanel) return;

  fetch("/api/me", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (me) {
      if (!me || typeof me.name !== "string") {
        if (hinted) document.cookie = HINT + "=; Path=/; Max-Age=0; Secure; SameSite=Lax";
        return;
      }
      if (!hinted) document.cookie = HINT + "=1; Path=/; Max-Age=" + WEEK + "; Secure; SameSite=Lax";
      entries().forEach(function (li) {
        var a = li.querySelector("a");
        if (!a) return;
        a.href = "/admin/";
        a.textContent = "Mod panel (" + me.name + ")";
        var out = document.createElement("li");
        out.className = "mod-nav";
        var link = document.createElement("a");
        link.className = "white hover";
        link.href = "/api/logout";
        link.textContent = "Log out";
        out.appendChild(link);
        li.parentNode.insertBefore(out, li.nextSibling);
      });
    })
    .catch(function () {
      /* offline or the server's down: the menu just keeps "Mod login" */
    });
})();

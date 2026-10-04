"use strict";
// -----------------------------------------------------------------------------
// Interactive world map for the Stats Viewer. Adapted from pointercrate's
// InteractiveWorldMap (pointercrate-demonlist-pages/static/js/modules/
// statsviewer.js, MIT) but driven by an INLINE <svg> injected from
// static/js/worldmap.data.js instead of an <object> element - Chrome won't let
// a file:// page read an <object>'s contentDocument, and this site has to keep
// working from a double-clicked index.html.
//
// The SVG's clickable pieces: <g class="land|island|land-with-states"> with a
// lowercase ISO id ("us", "mx"), and inside a .land-with-states a set of
// <path class="state" id="US-IL"> subdivisions (each with a <title>). Continents
// are <g class="continent" id="north-america">; only ".continent.selectable"
// ones react to clicks. Toggling ".subdivided" on a .land-with-states swaps
// between "click selects the whole country" and "click selects a state".
// -----------------------------------------------------------------------------

(function (DL) {
  function findParentWithClass(el, cls) {
    while (el && !(el.classList && el.classList.contains(cls))) el = el.parentNode;
    return el;
  }
  function forEach(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  // wrapper: the element to fill with the map. Throws nothing if the SVG string
  // isn't loaded - callers check DL.WORLD_MAP_SVG first.
  DL.InteractiveWorldMap = function (wrapper) {
    var self = this;

    this.wrapper = wrapper;
    wrapper.innerHTML = DL.WORLD_MAP_SVG;
    this.svg = wrapper.querySelector("svg");
    // let CSS size it; keep the viewBox for the internal coordinate system
    this.svg.removeAttribute("width");
    this.svg.removeAttribute("height");

    this.selectionListeners = [];
    this.deselectionListeners = [];
    this.currentlySelected = undefined;

    this.zoom = 1;
    this.translate = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragDistance = 0;
    this.relativeMousePosition = { x: 0, y: 0 };

    // country code -> continent id, read straight out of the SVG's grouping so
    // we never have to maintain a table.
    this.continentOf = {};
    forEach(this.svg.querySelectorAll(".continent"), function (continent) {
      forEach(continent.querySelectorAll(".land, .island, .land-with-states"), function (c) {
        self.continentOf[c.id.toUpperCase()] = continent.id;
      });
    });

    forEach(this.svg.querySelectorAll(".land-with-states .state"), function (state) {
      state.addEventListener("click", function (event) {
        // states sit on top of the .land-with-states; without this the country
        // handler below would also fire and select the whole country.
        event.stopPropagation();
        if (!self._selectable(state)) return;
        if (self.currentlySelected === state) self._deselect();
        else self._select(state);
      });
    });

    forEach(this.svg.querySelectorAll(".land, .island, .land-with-states"), function (clickable) {
      clickable.addEventListener("click", function () {
        if (!self._selectable(clickable)) return;
        if (self.currentlySelected === clickable) self._deselect();
        else self._select(clickable);
      });
    });

    this._setupPanZoom();
  };

  var proto = DL.InteractiveWorldMap.prototype;

  proto.addSelectionListener = function (l) { this.selectionListeners.push(l); };
  proto.addDeselectionListener = function (l) { this.deselectionListeners.push(l); };

  proto._selectable = function (el) {
    var continent = findParentWithClass(el, "continent");
    return !continent || continent.classList.contains("selectable");
  };

  // "US-IL" -> {country:"US", sub:"IL"}; "us" -> {country:"US"}
  function splitId(id) {
    var dash = id.indexOf("-");
    if (dash === -1) return { country: id.toUpperCase(), sub: undefined };
    return { country: id.substring(0, dash).toUpperCase(), sub: id.substring(dash + 1).toUpperCase() };
  }

  proto._select = function (clicked, fireEvents) {
    if (fireEvents === undefined) fireEvents = true;
    if (this.isDragging) return;

    if (this.currentlySelected) this.currentlySelected.classList.remove("selected");
    this.currentlySelected = clicked;
    clicked.classList.add("selected");

    if (fireEvents) {
      var parts = splitId(clicked.id);
      this.selectionListeners.forEach(function (l) { l(parts.country, parts.sub); });
    }
  };

  proto._deselect = function (fireEvents) {
    if (fireEvents === undefined) fireEvents = true;
    if (this.isDragging || !this.currentlySelected) return;

    this.currentlySelected.classList.remove("selected");
    this.currentlySelected = undefined;

    if (fireEvents) this.deselectionListeners.forEach(function (l) { l(); });
  };

  proto._find = function (id) {
    return this.svg.querySelector('[id="' + id + '"]');
  };

  // programmatic selection (from the list / dropdowns). country groups carry a
  // lowercase id, states an uppercase one, so try both.
  proto.select = function (nation, subdivision) {
    var id = nation.toUpperCase();
    if (subdivision) id += "-" + subdivision.toUpperCase();
    var el = this._find(id) || this._find(id.toLowerCase());
    if (el) this._select(el, false);
  };

  proto.deselect = function () { this._deselect(false); };

  proto.deselectSubdivision = function () {
    if (!this.currentlySelected || this.currentlySelected.id.indexOf("-") === -1) return;
    this.select(splitId(this.currentlySelected.id).country);
  };

  proto.showSubdivisions = function () {
    forEach(this.svg.querySelectorAll(".land-with-states"), function (d) { d.classList.add("subdivided"); });
  };
  proto.hideSubdivisions = function () {
    forEach(this.svg.querySelectorAll(".land-with-states.subdivided"), function (d) { d.classList.remove("subdivided"); });
  };

  proto.highlightContinent = function (name) {
    var wanted = name === undefined ? undefined : name.toLowerCase().replace(/ /g, "-");
    forEach(this.svg.getElementsByClassName("continent"), function (c) {
      if (wanted === undefined || c.id === wanted) c.classList.add("selectable");
      else c.classList.remove("selectable");
    });
  };
  proto.resetContinentHighlight = function () { this.highlightContinent(undefined); };

  // subdivision names straight from the SVG's <title> elements
  proto.subdivisionName = function (country, sub) {
    var el = this._find(country.toUpperCase() + "-" + sub.toUpperCase());
    var title = el && el.querySelector("title");
    return title ? title.textContent : sub.toUpperCase();
  };
  proto.subdivisionsFor = function (country) {
    var group = this._find(country.toLowerCase());
    if (!group) return [];
    return Array.prototype.map.call(group.querySelectorAll(".state"), function (s) {
      var title = s.querySelector("title");
      return { code: splitId(s.id).sub, name: title ? title.textContent : splitId(s.id).sub };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  };

  // heat tint for places that have players. `scores` maps "US" / "US-IL" -> a
  // number; the biggest gets full accent, the rest fade toward it.
  proto.clearPresence = function () {
    forEach(this.svg.querySelectorAll(".dl-present"), function (e) {
      e.classList.remove("dl-present");
      e.style.removeProperty("--dl-heat");
    });
  };
  proto.markPresence = function (scores) {
    this.clearPresence();
    var self = this, max = 0;
    Object.keys(scores).forEach(function (k) { if (scores[k] > max) max = scores[k]; });
    Object.keys(scores).forEach(function (code) {
      var el = self._find(code.toUpperCase()) || self._find(code.toLowerCase());
      if (!el) return;
      el.classList.add("dl-present");
      el.style.setProperty("--dl-heat", (max > 0 ? 0.4 + 0.6 * (scores[code] / max) : 1).toFixed(3));
    });
  };

  // --- pan & zoom -----------------------------------------------------------

  proto._applyTransform = function () {
    this.svg.style.transform =
      "scale(" + this.zoom + ") translate(" + this.translate.x + "px, " + this.translate.y + "px)";
  };

  proto.resetView = function () {
    this.zoom = 1;
    this.translate = { x: 0, y: 0 };
    this._applyTransform();
  };

  proto.zoomBy = function (factor) {
    this.zoom = Math.max(0.5, Math.min(12, this.zoom * factor));
    this._applyTransform();
  };

  proto._setupPanZoom = function () {
    var self = this;

    this.svg.addEventListener("mousedown", function () { self.isDragging = true; });
    this.svg.addEventListener("mouseleave", function () { self.isDragging = false; });
    this.svg.addEventListener("mouseup", function () {
      self.isDragging = false;
      // swallow the click that ends a real drag so it doesn't select a country
      if (self.dragDistance >= 5) {
        var capture = function (e) {
          e.stopPropagation();
          self.svg.removeEventListener("click", capture, true);
        };
        self.svg.addEventListener("click", capture, true);
      }
      self.dragDistance = 0;
    });

    this.svg.addEventListener("mousemove", function (event) {
      if (self.isDragging) {
        self.translate.x += event.movementX / self.zoom;
        self.translate.y += event.movementY / self.zoom;
        self.dragDistance += Math.abs(event.movementX) + Math.abs(event.movementY);
        self._applyTransform();
      }
      var rect = self.svg.getBoundingClientRect();
      self.relativeMousePosition.x = event.clientX - rect.left + self.translate.x * self.zoom;
      self.relativeMousePosition.y = event.clientY - rect.top + self.translate.y * self.zoom;
    });

    this.svg.addEventListener("wheel", function (event) {
      // only hijack the wheel with Shift held, so plain scrolling still moves
      // the page when the cursor is over the map (the +/- buttons zoom without it)
      if (!event.shiftKey) return;
      event.preventDefault();
      var step = event.deltaY < 0 ? 0.15 : -0.15;
      if (self.zoom + step < 0.5) return;

      var mx = self.relativeMousePosition.x, my = self.relativeMousePosition.y;
      var beforeX = mx / self.zoom, beforeY = my / self.zoom;
      self.zoom = Math.min(12, self.zoom + step);
      self.translate.x += mx / self.zoom - beforeX;
      self.translate.y += my / self.zoom - beforeY;
      self._applyTransform();
    }, { passive: false });

    // touch: one finger pans, two fingers pinch-zoom (and pan) around their
    // midpoint - same maths as the shift-wheel zoom above
    var lastTouch = { x: 0, y: 0 }, pinch = null;
    function pinchState(t) {
      var origin = self.wrapper.getBoundingClientRect();
      return {
        dist: Math.max(1, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)),
        x: (t[0].clientX + t[1].clientX) / 2 - origin.left,
        y: (t[0].clientY + t[1].clientY) / 2 - origin.top
      };
    }
    function startPan(t) {
      self.isDragging = true;
      lastTouch.x = t.pageX;
      lastTouch.y = t.pageY;
    }
    this.svg.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) {
        pinch = null;
        startPan(e.touches[0]);
      } else if (e.touches.length === 2) {
        self.isDragging = false;
        pinch = pinchState(e.touches);
      }
    });
    this.svg.addEventListener("touchend", function (e) {
      // lifting one finger of a pinch carries on as a one-finger pan
      if (e.touches.length === 1) {
        pinch = null;
        startPan(e.touches[0]);
        return;
      }
      self.isDragging = false;
      self.dragDistance = 0;
      pinch = null;
    });
    this.svg.addEventListener("touchmove", function (e) {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        var now = pinchState(e.touches);
        var zoom = Math.max(0.5, Math.min(12, self.zoom * now.dist / pinch.dist));
        // keep the map point that was under the old midpoint under the new one
        self.translate.x += now.x / zoom - pinch.x / self.zoom;
        self.translate.y += now.y / zoom - pinch.y / self.zoom;
        self.zoom = zoom;
        pinch = now;
        self._applyTransform();
        return;
      }
      if (!self.isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      var dx = e.touches[0].pageX - lastTouch.x, dy = e.touches[0].pageY - lastTouch.y;
      self.translate.x += dx / self.zoom;
      self.translate.y += dy / self.zoom;
      self.dragDistance += Math.abs(dx) + Math.abs(dy);
      lastTouch.x = e.touches[0].pageX;
      lastTouch.y = e.touches[0].pageY;
      self._applyTransform();
    }, { passive: false });
  };
})(window.DL || (window.DL = {}));

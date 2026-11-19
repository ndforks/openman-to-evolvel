// Click-to-edit inspector. Injected into the PREVIEW only (never a published site). It talks only to the window that
// framed it, and only after that window said hello (its origin is then the only target of every message).
(function () {
  if (window.top === window || window.__omInspector) return;
  window.__omInspector = true;
  var parentOrigin = null;
  var on = false;
  var box = null;
  var hovered = null;
  var selected = null;

  function send(msg) {
    if (parentOrigin) window.parent.postMessage(Object.assign({ om: true }, msg), parentOrigin);
  }

  function overlay() {
    if (box) return box;
    box = document.createElement("div");
    box.setAttribute("data-om-inspector", "");
    box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #2f80ff;background:rgba(47,128,255,.08);border-radius:3px;transition:all .05s;display:none";
    document.documentElement.appendChild(box);
    return box;
  }

  function place(el) {
    var b = overlay();
    if (!el) return (b.style.display = "none");
    var r = el.getBoundingClientRect();
    b.style.display = "block";
    b.style.left = r.left + "px";
    b.style.top = r.top + "px";
    b.style.width = r.width + "px";
    b.style.height = r.height + "px";
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  // A selector that finds this element again: an id when unique, else tag:nth-of-type steps from the nearest id or body.
  function selectorFor(el) {
    if (el.id && document.querySelectorAll("#" + cssEscape(el.id)).length === 1) return "#" + cssEscape(el.id);
    var steps = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement) {
      if (cur.id && document.querySelectorAll("#" + cssEscape(cur.id)).length === 1) {
        steps.unshift("#" + cssEscape(cur.id));
        break;
      }
      var tag = cur.tagName.toLowerCase();
      var i = 1;
      var sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) i++;
      steps.unshift(tag + ":nth-of-type(" + i + ")");
      cur = cur.parentElement;
    }
    if (!steps.length || steps[0].charAt(0) !== "#") steps.unshift("body");
    return steps.join(" > ");
  }

  function describe(el) {
    var cs = getComputedStyle(el);
    var html = el.outerHTML.replace(/\s+/g, " ");
    return {
      type: "selected",
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: (el.getAttribute("class") || "").trim().slice(0, 200),
      text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
      html: html.length > 400 ? html.slice(0, 400) + "…" : html,
      path: location.pathname,
      styles: {
        color: cs.color, backgroundColor: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily, textAlign: cs.textAlign, padding: cs.padding, margin: cs.margin,
        borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle, borderColor: cs.borderTopColor, borderRadius: cs.borderTopLeftRadius,
      },
    };
  }

  function onMove(e) {
    if (!on) return;
    var el = e.target;
    if (el === hovered || (el && el.hasAttribute && el.hasAttribute("data-om-inspector"))) return;
    hovered = el;
    place(el);
  }

  function onClick(e) {
    if (!on) return;
    e.preventDefault();
    e.stopPropagation();
    selected = e.target;
    place(selected);
    send(describe(selected));
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.om !== true || e.source !== window.parent) return;
    if (d.type === "hello") {
      if (parentOrigin && parentOrigin !== e.origin) return;
      parentOrigin = e.origin;
      send({ type: "ready", path: location.pathname });
      return;
    }
    if (e.origin !== parentOrigin) return;
    if (d.type === "inspect") {
      on = !!d.on;
      document.documentElement.style.cursor = on ? "crosshair" : "";
      if (!on) {
        hovered = null;
        place(selected);
      }
    } else if (d.type === "style" && typeof d.selector === "string" && d.styles && typeof d.styles === "object") {
      var el = null;
      try {
        el = document.querySelector(d.selector);
      } catch {
        el = null;
      }
      if (!el) return;
      Object.keys(d.styles).forEach(function (k) {
        if (/^[a-zA-Z]+$/.test(k)) el.style[k] = String(d.styles[k]);
      });
      place(el);
    } else if (d.type === "clear") {
      selected = null;
      place(null);
    }
  });

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", function () { place(on ? hovered : selected); }, true);
})();

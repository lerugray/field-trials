/* ALKAHEST -- debuglog: loud failures (CLAUDE.md hard rule 6).
 *
 * "Nothing happens" is a banned failure mode. Every runtime error must surface
 * VISIBLY in-game AND land in an exportable log. This module:
 *   - keeps a ring buffer of entries (level, message, time);
 *   - installs window error / unhandledrejection traps (browser);
 *   - draws an in-frame red banner when errors exist (overlay());
 *   - exports the log as a downloadable text file (export()).
 *
 * Pure-data parts (log/ring/format) run under Node so they are testable; the
 * DOM traps and download install only when a window exists.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var MAX = 200;
  var entries = [];
  var errorCount = 0;

  function now() {
    // wall clock if available; monotonic fallback keeps tests deterministic-ish
    try { return new Date().toISOString().slice(11, 23); } catch (e) { return "" + entries.length; }
  }

  var D = {
    log: function (msg, level) {
      level = level || "info";
      if (level === "error") errorCount++;
      entries.push({ t: now(), level: level, msg: String(msg) });
      if (entries.length > MAX) entries.shift();
      if (typeof console !== "undefined" && console.log) {
        (level === "error" && console.error ? console.error : console.log)("[AL] " + msg);
      }
      return D;
    },
    error: function (msg) { return D.log(msg, "error"); },
    entries: function () { return entries.slice(); },
    errorCount: function () { return errorCount; },
    clear: function () { entries.length = 0; errorCount = 0; return D; },

    /* format the whole log as text for export */
    text: function () {
      return entries.map(function (e) { return "[" + e.t + "] " + e.level.toUpperCase() + ": " + e.msg; }).join("\n");
    },

    /* draw an in-frame banner when errors exist (loud, unmissable) */
    overlay: function (fb) {
      if (errorCount === 0) return;
      var recent = entries.filter(function (e) { return e.level === "error"; }).slice(-4);
      var h = 10 + recent.length * 8;
      fb.rect(0, 0, fb.w, h, 120, 12, 12, 0.82);
      fb.hline(0, h, fb.w, 255, 60, 40, 1);
      AL.drawText(fb, errorCount + " ERROR" + (errorCount === 1 ? "" : "S") + " - PRESS L TO EXPORT LOG", 3, 2, [255, 220, 200], { scale: 1 });
      for (var i = 0; i < recent.length; i++) {
        var m = recent[i].msg;
        if (m.length > 60) m = m.slice(0, 60);
        AL.drawText(fb, m, 3, 10 + i * 8, [255, 190, 170], { scale: 1 });
      }
    },

    /* browser: install global traps + return true if wired */
    install: function (win) {
      if (!win) return false;
      win.addEventListener("error", function (ev) {
        D.error((ev.message || "error") + (ev.filename ? " @" + ev.filename + ":" + ev.lineno : ""));
      });
      win.addEventListener("unhandledrejection", function (ev) {
        D.error("unhandled promise: " + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason));
      });
      return true;
    },

    /* browser: download the log as a text file */
    export: function (doc) {
      doc = doc || (typeof document !== "undefined" ? document : null);
      if (!doc) return false;
      var blob = new Blob([D.text() || "(no entries)"], { type: "text/plain" });
      var a = doc.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "alkahest-debug.log";
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      return true;
    }
  };

  AL.debug = D;
});

/* ALKAHEST -- M4 visual safety controls (docs/STUDY-art.md).
 * One global flash setting scales bounded transient light. Critical information
 * is always also carried by shape, motion, geometry, or text. */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  AL.VISUAL_LIMITS = Object.freeze({
    defaultFlashIntensity: 0.65,
    maxChainBlooms: 2,
    maxPulseHz: 3
  });

  AL.VISUALS = AL.VISUALS || { flashIntensity: AL.VISUAL_LIMITS.defaultFlashIntensity };

  AL.setFlashIntensity = function (value) {
    value = Number(value);
    if (!Number.isFinite(value)) value = AL.VISUAL_LIMITS.defaultFlashIntensity;
    AL.VISUALS.flashIntensity = AL.clamp(value, 0, 1);
    return AL.VISUALS.flashIntensity;
  };

  AL.flashScale = function (opts) {
    var value = opts && opts.flashIntensity !== undefined ? opts.flashIntensity : AL.VISUALS.flashIntensity;
    value = Number(value);
    if (!Number.isFinite(value)) value = AL.VISUAL_LIMITS.defaultFlashIntensity;
    return AL.clamp(value, 0, 1);
  };

  /* Return the indices allowed to draw a chain-fire bloom this frame. Highest
   * chain/combo severity wins if a future scene ever contains more than two
   * machines; text and geometry still render for every event. */
  AL.chainBloomIndices = function (machines, time) {
    var live = [];
    for (var i = 0; i < machines.length; i++) {
      var e = machines[i] && machines[i].lastEvent;
      if (!e || time - e.t < 0 || time - e.t >= 0.5) continue;
      live.push({ index: i, severity: (e.chain || 0) * 16 + (e.combo || 0) });
    }
    live.sort(function (a, b) { return b.severity - a.severity || a.index - b.index; });
    return live.slice(0, AL.VISUAL_LIMITS.maxChainBlooms).map(function (x) { return x.index; });
  };
});

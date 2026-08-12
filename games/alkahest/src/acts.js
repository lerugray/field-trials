/* ALKAHEST -- acts: the Weiss per-act physics profiles (STUDY-run §2).
 *
 * The founding law: register is PHYSICS, not paint. Each of the four opus acts
 * changes exactly ONE rule of the machine, felt in the hands, taught by that
 * act's first bout. An act PROFILE is a frozen plain-config object the Machine
 * consumes; the Machine reads it, never mutates it. Values are TUNE; the SHAPE
 * (which rule each act bends) is what the seed fixes.
 *
 *  - NIGREDO   heavier, denser: panels fall SLOWER (longer fallInterval).
 *  - ALBEDO    volatile clears: a clear also sublimates ONE adjacent live panel.
 *  - CITRINITAS tighter dross exchange: sending AND receiving both amplified.
 *  - RUBEDO    all-or-nothing: chain<2 yields nothing; chain>=2 burns brighter.
 *
 * These compose with formulae and the athanor without breaking determinism or
 * the softlock law -- a profile only ever adjusts config the machine already
 * honours plus the single sublimate hook.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  // Each profile lists ONLY the fields it bends away from MACHINE_DEFAULTS.
  var ACTS = {
    nigredo: {
      name: "nigredo",
      title: "NIGREDO",
      rule: "The dense stage. Reagents fall slow and heavy.",
      fallInterval: 0.075   // slower than the 0.045 default (the dark, dense open)
    },
    albedo: {
      name: "albedo",
      title: "ALBEDO",
      rule: "Volatile clears. Each dissolution sublimates one neighbour.",
      sublimateAdjacent: true
    },
    citrinitas: {
      name: "citrinitas",
      title: "CITRINITAS",
      rule: "Tighter exchange. Dross sent and received both run heavier.",
      drossSendBonus: 1,
      drossRecvBonus: 1
    },
    rubedo: {
      name: "rubedo",
      title: "RUBEDO",
      rule: "All or nothing. A lone clear yields nothing; chains burn bright.",
      allOrNothing: true,
      chainBrightMul: 1.5
    }
  };

  var ORDER = ["nigredo", "albedo", "citrinitas", "rubedo"];

  /* return a FROZEN profile for the named act (throws on unknown). The frozen
   * object is safe to hand straight to a Machine -- it can never be mutated. */
  function actProfile(name) {
    var a = ACTS[name];
    if (!a) throw new Error("ALKAHEST: unknown act '" + name + "'");
    return Object.freeze(Object.assign({}, a));
  }

  AL.ACT_PROFILES = ACTS;
  AL.ACT_ORDER = ORDER;
  AL.actProfile = actProfile;
});

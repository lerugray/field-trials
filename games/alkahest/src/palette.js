/* ALKAHEST -- palette: the register as data (aesthetic law, DESIGN-SEED).
 *
 * The candlelit alchemist's bench at night. Two color systems live here:
 *
 *  1. ENVIRONMENT palettes, one per opus act. The four acts shift the palette
 *     with the work: Nigredo (char-blacks, cold blues), Albedo (bone, silver),
 *     Citrinitas (candle-golds), Rubedo (deep reds). These color the stone,
 *     brass chrome, flame, glass -- the bench itself.
 *
 *  2. REAGENT identity. Six reagents, each coded by SHAPE + GLYPH + COLOR --
 *     never color alone (colorblind-safe by construction; this is a floor, not
 *     a tradeoff). Reagent base colors are act-invariant so identity is stable;
 *     M6's legibility gate verifies each survives every act palette (Rubedo's
 *     reds are the named risk). Shapes/glyphs are drawn by code in M1.
 *
 * Colors are [r,g,b] 0..255.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  /* ---- per-act environment palettes ---- */
  AL.ACTS = ["nigredo", "albedo", "citrinitas", "rubedo"];

  AL.PALETTES = {
    // NIGREDO -- the blackening: char-blacks and cold blues, dense dark.
    nigredo: {
      name: "Nigredo",
      stoneDark: [9, 11, 18],
      stoneMid: [20, 24, 36],
      stoneLight: [38, 46, 64],
      brass: [92, 74, 40],
      brassLight: [150, 122, 66],
      flame: [214, 132, 54],
      flameCore: [252, 226, 150],
      glass: [70, 96, 120],
      ink: [180, 190, 205],
      accent: [64, 108, 150]
    },
    // ALBEDO -- the whitening: bone and silver, cold clean light.
    albedo: {
      name: "Albedo",
      stoneDark: [26, 28, 34],
      stoneMid: [58, 62, 72],
      stoneLight: [120, 126, 138],
      brass: [120, 104, 66],
      brassLight: [186, 166, 108],
      flame: [230, 178, 96],
      flameCore: [255, 244, 214],
      glass: [156, 176, 190],
      ink: [40, 44, 54],
      accent: [176, 190, 206]
    },
    // CITRINITAS -- the yellowing: candle-golds, warm amber room.
    citrinitas: {
      name: "Citrinitas",
      stoneDark: [24, 18, 10],
      stoneMid: [52, 40, 20],
      stoneLight: [96, 74, 36],
      brass: [150, 112, 42],
      brassLight: [214, 168, 74],
      flame: [246, 190, 78],
      flameCore: [255, 240, 176],
      glass: [200, 168, 96],
      ink: [40, 30, 14],
      accent: [230, 176, 70]
    },
    // RUBEDO -- the reddening: deep reds, banked coals. Reds are the named
    // colorblind risk; reagent CINNABAR stays distinguishable by shape+glyph.
    rubedo: {
      name: "Rubedo",
      stoneDark: [22, 8, 8],
      stoneMid: [48, 16, 16],
      stoneLight: [86, 30, 26],
      brass: [128, 74, 40],
      brassLight: [198, 128, 64],
      flame: [236, 120, 56],
      flameCore: [255, 220, 150],
      glass: [150, 80, 70],
      ink: [230, 200, 190],
      accent: [190, 70, 54]
    }
  };

  AL.palette = function (act) {
    return AL.PALETTES[act] || AL.PALETTES.nigredo;
  };

  /* ---- reagent identity: shape + glyph + color (colorblind-safe) ----
   * `shape` and `glyph` are stable identifiers the M1 renderer draws; no two
   * reagents share either, so identity never rests on color alone. */
  AL.REAGENTS = [
    { id: 0, key: "salt",     name: "Salt",     shape: "square",   glyph: "bar",     color: [222, 226, 232] },
    { id: 1, key: "sulfur",   name: "Sulfur",   shape: "triangle", glyph: "cross",   color: [232, 176, 58]  },
    { id: 2, key: "mercury",  name: "Mercury",  shape: "circle",   glyph: "horns",   color: [96, 200, 214]  },
    { id: 3, key: "vitriol",  name: "Vitriol",  shape: "diamond",  glyph: "vee",     color: [120, 196, 96]  },
    { id: 4, key: "azoth",    name: "Azoth",    shape: "hexagon",  glyph: "eye",     color: [150, 128, 224] },
    { id: 5, key: "cinnabar", name: "Cinnabar", shape: "teardrop", glyph: "dot",     color: [226, 74, 62]   }
  ];

  AL.REAGENT_COUNT = AL.REAGENTS.length;
});

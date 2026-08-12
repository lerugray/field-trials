// THE JACQUARD INDEX — the register palette (dye-house range, shop-floor authentic).
//
// Seed REGISTER law: the working pattern-room of an 1890s mill. Functional, not
// boutique. These are the base chrome tones — manila pattern paper, graphite ink,
// brass indexing tabs, sizing-oil shadow, and two starter dye-house thread colors.
// Per-card-set palettes rotate WITHIN this range and stay subordinate to legibility;
// this file is the neutral spine they hang off of.
//
// Every color is [r, g, b] or [r, g, b, a]. Code-defined only (art law).

export const PALETTE = {
  // The shop floor behind everything: dark sizing-oil tone, working-light lit.
  oil:        [26, 23, 18],
  oilDeep:    [16, 14, 11],

  // Manila punched-card / pattern-paper stock, warm and matte.
  manila:     [201, 183, 143],
  manilaLit:  [216, 199, 160],
  manilaShade:[171, 153, 116],

  // Warp/weft ruling on the pattern paper.
  gridLine:   [176, 158, 121],
  gridMajor:  [150, 131, 96],

  // Graphite / drafting ink for clue numbers and labels.
  ink:        [40, 35, 29],
  inkSoft:    [74, 66, 55],

  // Brass indexing tabs and machined fittings.
  brass:      [178, 143, 71],
  brassLit:   [208, 176, 104],
  brassDark:  [120, 93, 42],

  // Linen / bleached card highlight.
  linen:      [224, 214, 189],

  // Two starter dye-house threads (thread identity is by SHAPE not hue — hard-rule 6 —
  // these are only the base hues those shapes are dyed in).
  indigo:     [52, 66, 96],
  madder:     [146, 62, 49],
};

// Pack an [r,g,b(,a)] tuple for terse call sites: fb.fillRect(x,y,w,h,...rgb(PALETTE.manila)).
export function rgb(c) {
  return c.length >= 4 ? c : [c[0], c[1], c[2], 255];
}

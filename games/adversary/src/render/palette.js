// palette.js — the global art palette (DESIGN-SEED art law + M12-ART register). ONE disciplined
// palette, code-drawn only. The register is "dark, somewhat-medieval 8-bit, gothic/DS1-feeling":
// dark desaturated bases (cool stone greys, moss greens, dried-blood umbers) plus a few deliberate
// warm accents (torch amber, sickly green, pale bone). Every hue is authored as a 3-4 shade RAMP so
// art can cluster-shade from one light direction instead of flat-filling. All art indexes into this
// one table by single-char key ('.' = transparent); the ramp structure below is the discipline.
//
// Key layout keeps every historically-used key ('0'-'9','a'-'i') live so older art still parses;
// M12 adds the extra ramp shades on 'j'-'v'. ~26 drawable colors, organized as 8 ramps.

/** Named palette entries. Keys are single chars usable directly in pixel-grid strings. */
export const PALETTE = Object.freeze({
  '.': null,          // transparent
  '0': '#000000',     // ink black — 1px outlines, deepest shadow

  // Stone ramp (cool desaturated blue-grey) — walls, armor, UI chrome, bone-cold shadow.
  '1': '#14151e',     //  stone[0] shadow / near-black
  '8': '#23242f',     //  stone[1] dark
  '7': '#3c3f4d',     //  stone[2] mid
  '6': '#5c6070',     //  stone[3] light
  '4': '#8b90a6',     //  stone[4] highlight
  '5': '#ffffff',     //  specular white (rim light, eyes)

  // Bone ramp (warm off-white) — skulls, parchment UI, pale flesh, exposed bone.
  j: '#e6dcbf',       //  bone[3] parchment light
  k: '#b8ab86',       //  bone[2] mid
  l: '#7f7357',       //  bone[1] shadow

  // Umber / dried-blood ramp — wood, dirt, leather, rusted iron.
  '9': '#2c1a17',     //  umber[0] shadow (near-black brown)
  m: '#4a2c22',       //  umber[1] dark wood
  a: '#7a4a2e',       //  umber[2] mid
  n: '#a9683a',       //  umber[3] light
  b: '#d59a4a',       //  umber[4] / torch amber highlight

  // Blood ramp (desaturated red accent) — gore, boss tells, danger.
  f: '#4a1c1c',       //  blood[0] dark clot
  g: '#a83232',       //  blood[1] red
  o: '#d8524a',       //  blood[2] bright arterial

  // Torch / gold ramp (warm accent light) — flame, brazier glow, gold, gleam.
  c: '#f0c84a',       //  torch[2] bright gold
  p: '#fff0b0',       //  torch[3] pale flare

  // Moss / sickly green ramp — greenery, vines, ghoul flesh, poison.
  d: '#27341f',       //  moss[0] shadow
  e: '#3f5a2c',       //  moss[1] mid
  q: '#6a8f3e',       //  moss[2] light
  r: '#9cc45e',       //  moss[3] sickly highlight

  // Night / cold-blue ramp — sky, spectral glow, crypt air, marker.
  '2': '#181a30',     //  night[0] deep
  '3': '#2c335c',     //  night[1] mid
  t: '#4a5488',       //  night[2] light
  u: '#8fa0d8',       //  night[3] spectral pale

  // Arcane purple ramp — runes, unique glints, corrupt flesh.
  i: '#3a2854',       //  arcane[0] dark
  v: '#6a4a8f',       //  arcane[1] mid
  h: '#c98fb0',       //  arcane[2] / pale flesh-pink
});

/**
 * The register as ordered ramps, dark→light. Art and the environment layer pick shades from these
 * so shading stays consistent (one light direction) and stages can retune by referencing a ramp
 * rather than a raw hex. Each value is a palette key resolvable through PALETTE.
 */
export const RAMPS = Object.freeze({
  stone: ['1', '8', '7', '6', '4'],
  bone: ['l', 'k', 'j'],
  umber: ['9', 'm', 'a', 'n', 'b'],
  blood: ['f', 'g', 'o'],
  torch: ['b', 'c', 'p'],
  moss: ['d', 'e', 'q', 'r'],
  night: ['2', '3', 't', 'u'],
  arcane: ['i', 'v', 'h'],
});

/**
 * Pick a shade from a named ramp by level. Level clamps into range; fractional levels (0..1) are
 * supported when |level| <= 1 and the ramp has >2 entries, mapping across the whole ramp. Pure.
 * @param {keyof typeof RAMPS} name
 * @param {number} level - integer index, or a 0..1 fraction across the ramp
 * @returns {string} palette key
 */
export function shade(name, level) {
  const ramp = RAMPS[name];
  if (!ramp) throw new Error(`shade: unknown ramp '${name}'`);
  let idx;
  if (level > 0 && level < 1) idx = Math.round(level * (ramp.length - 1));
  else idx = Math.round(level);
  idx = Math.max(0, Math.min(ramp.length - 1, idx));
  return ramp[idx];
}

/**
 * Per-stage sub-palettes (DIRECTIONS M12: "each stage gets a named sub-palette while sharing the
 * global ramp discipline"). A theme retunes only the environmental dressing/backdrop accent picks —
 * it never introduces off-palette colors, it just chooses which shared keys the stage leans on.
 * `backdrop` is a clean far→horizon three-tone field; `far`/`near` separate the two architectural
 * silhouette depths. `ground`/`groundHi` shade fallback tiles while `tileAsset` selects the curated
 * Willibab face and `tileWash`/`edge` keep each stage distinct. `dressing` lists legal props.
 */
export const THEMES = Object.freeze({
  cemetery: {
    name: 'cemetery green-grey',
    sky: ['2', '1'], ground: '7', groundDark: '8', groundHi: '6',
    backdrop: ['1', '2', '3'], gap: '1', far: '2', near: '1',
    tileAsset: 'env_tile_cemetery', tileWash: 'd', edge: 'q',
    moss: 'e', accent: 'q', torch: 'c',
    dressing: ['grass', 'gravestone', 'moss', 'brokenArch'],
    enemySkins: { walker: 'zombie', hopper: 'slime_spiked' },
    lightRig: {
      hero: { ambient: 'd', tint: 'u', shade: 0.11, grain: 0.10, tintStrength: 0.035, seed: 83 },
      key: { color: 'u', x: 0.78, y: 0.18, radiusX: 250, radiusY: 210, strength: 0.11 },
      vignette: { color: '2', amount: 0.56 },
    },
  },
  crypt: {
    name: 'crypt blue-black',
    sky: ['1', '0'], ground: '8', groundDark: '1', groundHi: '7',
    backdrop: ['0', '1', '2'], gap: '0', far: '8', near: '1',
    tileAsset: 'env_tile_crypt', tileWash: '2', edge: 't',
    moss: 'd', accent: 't', torch: 'c',
    dressing: ['moss', 'gargoyle', 'brokenArch', 'skull'],
    enemySkins: { walker: 'zombslime', hopper: 'bat' },
    lightRig: {
      hero: { ambient: '2', tint: 'u', shade: 0.16, grain: 0.12, tintStrength: 0.035, seed: 97 },
      shaft: { color: 'u', x0: 0.43, x1: 0.49, w0: 10, w1: 30, strength: 0.065, seed: 9 },
      vignette: { color: '2', amount: 0.68 },
    },
  },
  keep: {
    name: 'keep umber',
    sky: ['9', '1'], ground: 'm', groundDark: '9', groundHi: 'a',
    backdrop: ['1', '9', 'm'], gap: '1', far: '9', near: '1',
    tileAsset: 'env_tile_keep', tileWash: '9', edge: 'b',
    moss: 'd', accent: 'b', torch: 'c',
    dressing: ['grass', 'vine', 'banner', 'brokenArch', 'torch'],
    enemySkins: { walker: 'bones_gladiator', hopper: 'rat' },
    lightRig: {
      hero: { ambient: '9', tint: 'b', shade: 0.10, grain: 0.09, tintStrength: 0.028, seed: 109 },
      key: { color: 't', x: 0.50, y: 0.28, radiusX: 176, radiusY: 156, strength: 0.035 },
      vignette: { color: '9', amount: 0.62 },
    },
  },
});

/** Resolve a stage node id or explicit theme name to a THEMES entry (default cemetery). */
export function themeFor(name) {
  return THEMES[name] || THEMES.cemetery;
}

/** Ordered list of drawable (non-transparent) palette keys, for tooling. */
export const PALETTE_KEYS = Object.freeze(Object.keys(PALETTE).filter((k) => PALETTE[k] !== null));

/** Parse a "#rrggbb" hex string into [r,g,b]. */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Resolve a palette key to [r,g,b,a]; transparent → alpha 0. */
export function rgbaOf(key) {
  const hex = PALETTE[key];
  if (hex == null) return [0, 0, 0, 0];
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, 255];
}

/** WCAG relative luminance of a palette key (0..1). */
export function relativeLuminance(key) {
  const hex = PALETTE[key];
  if (hex == null) return 0;
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255).map((v) => (
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of two palette keys (1..21). */
export function contrastRatio(fgKey, bgKey) {
  const fg = relativeLuminance(fgKey) + 0.05;
  const bg = relativeLuminance(bgKey) + 0.05;
  return Math.max(fg, bg) / Math.min(fg, bg);
}

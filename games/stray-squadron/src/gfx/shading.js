// The substrate's lighting + fog model, stated once in JS.
//
// shaders.js holds the GLSL the GPU runs; this file holds the SAME model as pure
// functions, plus the constants main.js feeds the uniforms. Two reasons it exists:
// main.js used to carry the light direction and ambient floor as loose literals, and
// nothing could check what an object actually LOOKS like at a given distance — which
// is how enemies ended up legal to shoot at a range where they were two-thirds erased
// by haze (operator, 2026-08-07: "think I may be seeing some enemies now but still
// hard to tell").
//
// Keep the three formulas below in step with FRAG_SRC/VERT_SRC in shaders.js. They are
// short on purpose. test/enemy-visibility.test.js measures against these, and the
// numbers were checked against real headless pixel captures of the built game before
// being trusted (the model runs slightly DARKER than the GPU, so it errs toward the
// safe side of any floor).
//
// Pure, headless-testable: no GL, no DOM.

// World-space direction TO the light, normalized — the uniform main.js uploads.
export const LIGHT_DIR = (() => {
  const d = [-0.4, 0.82, 0.5];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
})();

// Ambient floor, so back-faces are never pure black (uAmbient).
export const AMBIENT = 0.3;

// ---- The r4 facet-painter uplift (art migration 2026-08-10) ------------------------
// The approved art direction (docs/art-poc/approval-record/) reads its form from three
// things the old single-diffuse model did not have: a PER-CLASS ambient floor (a hero
// craft sits off the terrain because its shadow side is lighter, not because it is a
// different hue), a cool SKY-BOUNCE fill off the opposite shoulder (so a face turned
// away from the key is cool-dark rather than flat-dark), and a QUANTIZED fog ramp (the
// period-honest banded haze, instead of a smooth gradient).
//
// The diffuse GAIN is deliberately left at 1.0. The PoC used 1.22, but its brightness
// came as much from its lighter palettes as from the gain, and raising the gain here
// would silently re-brighten every historical measurement this file underwrites —
// including test/enemy-visibility.test.js's regression guard, whose whole job is to
// prove the OLD palette failed the contrast floor. Palette carries the lift; the model
// stays honest.

// Per-class ambient floor. Gameplay-critical craft float above the scenery: their
// shadow sides stay readable while terrain and relief masses sink toward silhouette,
// which is what produces the approved frames' depth layering.
export const TAG_AMBIENT = {
  craft: 0.44,      // the hero — never allowed to go flat-dark
  enemy: 0.42,      // hostiles read at range
  boss: 0.40,       // capital mass: broad faces, gentle steps
  structure: 0.34,  // towers/batteries on the canyon rim
  scenery: 0.30,    // debris + obstacles (the old default)
  terrain: 0.32,    // the canyon floor
  relief: 0.24,     // the framing masses — closest to pure silhouette
};

// Cool sky bounce off the shoulder opposite the key. Additive and small: it separates
// planes without lifting overall exposure (see the hot-pixel cap in gfx/instrument.js).
export const FILL_DIR = (() => {
  const d = [0.55, 0.28, 0.79];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
})();
export const FILL_COLOR = [0.172, 0.227, 0.290]; // rgb(44,58,74) — cool, low value
export const FILL_STRENGTH = 0.30;

// The fog ramp is quantized into this many steps before the mix. The shader dithers
// across each step boundary (Bayer), so the bands read as period-honest haze rather
// than as posterization.
export const FOG_BANDS = 9;

// The sky gets its own, finer band count. It is one smooth gradient across the whole
// frame rather than a per-face ramp, so at nine steps the bands are wide enough to read
// as stripes instead of as atmosphere — which is what the first migration captures
// showed. The PoC used fourteen for the same reason.
export const SKY_BANDS = 15;

// VERT_SRC: light = ambient + (1 - ambient) * max(dot(n, lightDir), 0).
// `normal` is world-space and assumed normalized.
export function lightFactor(normal, lightDir = LIGHT_DIR, ambient = AMBIENT) {
  const d = normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2];
  return ambient + (1 - ambient) * Math.max(d, 0);
}

// VERT_SRC: the additive cool fill term for a face normal.
export function fillTerm(normal, fillDir = FILL_DIR) {
  const d = normal[0] * fillDir[0] + normal[1] * fillDir[1] + normal[2] * fillDir[2];
  const k = Math.max(d, 0) * FILL_STRENGTH;
  return [FILL_COLOR[0] * k, FILL_COLOR[1] * k, FILL_COLOR[2] * k];
}

// FRAG_SRC: f = clamp((viewDist - near) / (far - near), 0, 1).
export function fogFraction(viewDist, near, far) {
  if (!(far > near)) return 1;
  const f = (viewDist - near) / (far - near);
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// FRAG_SRC: the fog fraction stepped into FOG_BANDS discrete levels.
export function quantizeFog(f, bands = FOG_BANDS) {
  const q = Math.floor(f * bands) / bands;
  return q < 0 ? 0 : q > 1 ? 1 : q;
}

// FRAG_SRC: col = mix(vLit, fogColor, f). Colors are [r,g,b] in 0..1.
export function fogMix(lit, fogColor, f) {
  return [
    lit[0] + (fogColor[0] - lit[0]) * f,
    lit[1] + (fogColor[1] - lit[1]) * f,
    lit[2] + (fogColor[2] - lit[2]) * f,
  ];
}

// The full path for one flat-shaded face: base color -> key-lit -> + cool fill ->
// banded-fogged, as 0..1 rgb. `ambient` takes a TAG_AMBIENT entry when the caller knows
// which class the face belongs to; omitted, it is the old global floor, so every
// historical measurement against this function still means what it meant.
export function shadeFace(color, normal, fogColor, viewDist, near, far, ambient = AMBIENT) {
  const L = lightFactor(normal, LIGHT_DIR, ambient);
  const f = fillTerm(normal);
  const lit = [
    color[0] * L + f[0],
    color[1] * L + f[1],
    color[2] * L + f[2],
  ];
  return fogMix(lit, fogColor, quantizeFog(fogFraction(viewDist, near, far)));
}

// How far in FRONT OF THE CAMERA a thing sitting `rangeS` rail units ahead of the ship
// is — which is what the fog actually measures, not the range the combat rules quote.
// The camera trails the ship: eye = rail(flight.s) - forward*CAM.back, ship sits at
// flight.s + CAM.shipLead, so a target `rangeS` ahead of the SHIP is rangeS + shipLead
// + back ahead of the EYE. (The camera also rides CAM.up above the rail and looks at a
// lead point, tilting it about 4 degrees off the rail axis; that shortens the
// projection by ~0.3%, which is under the fog dither's own noise and is ignored.)
// This gap is the whole reason enemies read as invisible at "close" ranges: an enemy
// 30 units ahead is 43 units into the haze.
export function viewDistForRange(rangeS, shipLead, camBack) {
  return rangeS + shipLead + camBack;
}

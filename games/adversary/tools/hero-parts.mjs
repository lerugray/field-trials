// hero-parts.mjs — the hero's drawn parts: what each body part is MADE of, and the
// feature work that gives the character a face.
//
// This is the art-authorship half of the pipeline. The rig supplies silhouette, timing and
// shading rank; everything here is authored: which ramp a limb is cut from, where the boots
// end, where the belt sits, and — the part that actually decides who this is — what happens
// inside the eight-by-eight pixels of the head.
//
// THREE VARIANTS, ONE SILHOUETTE. All three share the rig's silhouette, the Vania palette
// spine, the same steel blade and the same boots. They differ in head treatment, torso
// material and accent hue. That is deliberate: the operator is picking a READ, not a body.
// Nothing here locks the hero's visual identity — that is the operator's call.
//
// Register, from DESIGN-SEED: Famicom palette sensibility with modern polish; a
// side-scrolling action-RPG hunter; Souls-adjacent melancholy where it earns its place, never
// as an outright reference; original IP. Per the naming law the variants carry NEUTRAL
// DESCRIPTIVE labels — "hooded", "bare-headed", "helmed" — not flavour names.

import { RAMPS, PALETTE } from './hero-palette.mjs';

// ---------------------------------------------------------------- local frames
//
// Feature placement has to survive the air-spin, where the character tumbles through a full
// rotation. A head drawn with an upright assumption puts the visor slit across the chin at
// frame 3. The fix costs nothing: the head's "up" is the direction from the torso centroid to
// the head centroid, so the face rotates with the body for free, and "forward" is that vector
// turned a quarter turn — which resolves to canonical-left for an upright frame.

export function headBasis(headGeo, torsoGeo) {
  let ux = 0;
  let uy = -1;
  if (torsoGeo && headGeo) {
    const dx = headGeo.centroid.x - torsoGeo.centroid.x;
    const dy = headGeo.centroid.y - torsoGeo.centroid.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.5) { ux = dx / len; uy = dy / len; }
  }
  // Quarter turn: (x,y) -> (y,-x). For up=(0,-1) this gives (-1,0) = canonical left facing.
  return { up: { x: ux, y: uy }, fwd: { x: uy, y: -ux } };
}

/** Normalised local coords of a pixel in a part's own frame: a = forward, b = up, in radii. */
function localCoords(x, y, geo, basis) {
  const r = Math.max(2, Math.max(geo.bbox.w, geo.bbox.h) / 2);
  const dx = x - geo.centroid.x;
  const dy = y - geo.centroid.y;
  return {
    a: (dx * basis.fwd.x + dy * basis.fwd.y) / r,
    b: (dx * basis.up.x + dy * basis.up.y) / r,
  };
}

/**
 * Proximal-to-distal position (0..1) of a pixel along a limb, oriented away from the body.
 * Boots land at the far end of a leg whichever way the leg is pointing.
 */
export function limbSpan(x, y, geo, bodyCentroid) {
  const ax = geo.axis.x;
  const ay = geo.axis.y;
  // Orient the axis away from the body centre.
  const towards = (geo.centroid.x - bodyCentroid.x) * ax + (geo.centroid.y - bodyCentroid.y) * ay;
  const sx = towards >= 0 ? ax : -ax;
  const sy = towards >= 0 ? ay : -ay;
  const half = Math.max(1.5, geo.major / 2);
  const p = ((x - geo.centroid.x) * sx + (y - geo.centroid.y) * sy) / half;
  return Math.min(1, Math.max(0, (p + 1) / 2));
}

// ---------------------------------------------------------------- variants

/**
 * A material is { ramp, shift } — a named ramp plus a whole-step offset. Far-side limbs carry
 * shift -1 so the rig's own near/far layer split reads as depth without any extra data.
 */
const FAR = -1;

// The brow line: where a head treatment splits between lit upper mass and shadowed face.
const BROW = -0.1;

// Boots are their own short DARK ramp per variant, never the material ramp. The first pass
// used the 4-step ink ramp and let the leg's tone rank index into it — the front leg's tone is
// the brightest in the rig, so every character walked around in pure white #feffff boots.
// A boot ramp is two dark steps and cannot reach a highlight however bright the source tone.
const BOOTS_BLACK = [PALETTE.ink, PALETTE.slate];
const BOOTS_BROWN = [PALETTE.bark, PALETTE.earth];

// Cloth ramps that deliberately stop short of their family's brightest step: at 30px a tunic
// that can reach #c8913e reads as bare skin, which is how variant B first came out shirtless.
const CLOTH_EARTH = [PALETTE.bark, PALETTE.earth, PALETTE.hide];
const CLOTH_OLIVE = [PALETTE.moss, PALETTE.olive, PALETTE.brass];
const CLOTH_TEAL = [PALETTE.abyss, PALETTE.teal, PALETTE.cyan];
// Two steps, not three: the wine family's top step (#e070b2) is a hot pink that turns a
// surcoat into a party shirt, and the steel family's (#b5dfe4) turns a helm into a bike lid.
// The rim-light pass supplies the third value where the light actually falls.
const SURCOAT = [PALETTE.plum, PALETTE.wine];
const ARMOUR = [PALETTE.slate, PALETTE.ash];
// Skin stops at the mid tone; letting it reach #f1c7c2 made the face read as pale putty.
const SKIN = [PALETTE.earth, PALETTE.hide, PALETTE.flesh];

/**
 * Each variant supplies:
 *   materials  — ramp + shift per body part
 *   boot/belt  — feature colours
 *   head(ctx)  — ZONE pass, per head pixel, in the rotation-aware local frame {a,b}: a is
 *                forward (toward the face), b is up (toward the crown), both in head radii.
 *                Returns a hex, or null to fall through to the head material.
 *   headPoints — POINT pass: features placed analytically at (forward, up) offsets in radii
 *                and rounded to a single pixel. An eye has to be exactly one pixel in an
 *                eight-pixel head; a zone test cannot promise that, and the version that
 *                tried produced a pink blob where a face should be.
 */
export const VARIANTS = [
  {
    id: 'hooded',
    label: 'VARIANT A - HOODED',
    blurb: 'Deep hood, face lost to shadow but for one lit eye. Dark teal cloth over brown '
      + 'legs, wine sash. The melancholy read, closest to the death-loop register.',
    materials: {
      head: { ramp: CLOTH_TEAL, shift: -1 },
      torso: { ramp: CLOTH_TEAL, shift: -1 },
      frontArm: { ramp: CLOTH_TEAL, shift: -1 },
      backArm: { ramp: CLOTH_TEAL, shift: FAR - 1 },
      frontLeg: { ramp: CLOTH_EARTH, shift: 0 },
      backLeg: { ramp: CLOTH_EARTH, shift: FAR },
    },
    boot: BOOTS_BLACK,
    belt: PALETTE.wine,
    head({ a, b }) {
      // Split the head on a single horizontal brow line rather than by quadrant. A hood at
      // eight pixels needs ONE clean edge to read: lit dome above, dark below. Diagonal or
      // ragged socket boundaries just make the head look like an egg with a bite out of it,
      // which is what two earlier attempts produced.
      if (b > BROW) return null; // dome — hood cloth, rim-lit along its top edge
      if (a > 0.1) return PALETTE.ink; // the face, in shadow
      return PALETTE.abyss; // the mantle behind the jaw
    },
    headPoints: () => [
      { fwd: 0.45, up: -0.35, color: PALETTE.rose }, // the one lit eye, inside the shadow
    ],
  },
  {
    id: 'bareheaded',
    label: 'VARIANT B - BARE-HEADED',
    blurb: 'Face and hair under a wine headband, olive tunic, brown trousers. The classic '
      + 'Famicom action-hero read, and the one carrying the Zombie Hunter lineage most plainly.',
    materials: {
      head: { ramp: SKIN, shift: 0 },
      torso: { ramp: CLOTH_OLIVE, shift: 0 },
      frontArm: { ramp: CLOTH_OLIVE, shift: 0 },
      backArm: { ramp: CLOTH_OLIVE, shift: FAR },
      frontLeg: { ramp: CLOTH_EARTH, shift: 0 },
      backLeg: { ramp: CLOTH_EARTH, shift: FAR },
    },
    boot: BOOTS_BLACK, // brown boots on brown trousers vanished; all three share black boots
    belt: PALETTE.bark,
    head({ a, b }) {
      // Hair: over the crown, and down the back of the skull behind the band.
      if (b > 0.45) return PALETTE.bark;
      if (a < -0.25 && b > -0.4) return PALETTE.bark;
      // Headband across the brow.
      if (b > 0.1 && b <= 0.45) return PALETTE.wine;
      return null;
    },
    headPoints: () => [
      { fwd: 0.5, up: -0.2, color: PALETTE.ink }, // eye
    ],
  },
  {
    id: 'helmed',
    label: 'VARIANT C - HELMED',
    blurb: 'Closed helm with a visor slit and brass crest, plate over the near shoulder, '
      + 'wine surcoat. The armoured read — most weight, least face.',
    materials: {
      head: { ramp: ARMOUR, shift: 0 },
      torso: { ramp: SURCOAT, shift: 0 },
      frontArm: { ramp: ARMOUR, shift: -1 },
      backArm: { ramp: ARMOUR, shift: FAR - 1 },
      frontLeg: { ramp: [PALETTE.ink, PALETTE.slate, PALETTE.ash], shift: 0 },
      backLeg: { ramp: [PALETTE.ink, PALETTE.slate], shift: 0 },
    },
    boot: BOOTS_BLACK,
    belt: PALETTE.olive,
    pauldron: true,
    head({ a, b }) {
      // Crest ridge, one row along the very top of the dome.
      if (b > 0.72) return PALETTE.brass;
      // Visor slit — the only opening. Held to the FRONT of the head: allowed to run back
      // past the midline it wraps around the circular mask and reads as a spiral.
      if (b > -0.35 && b < 0.05 && a > -0.2) return PALETTE.ink;
      // Cheek plate under the slit sits a step down from the dome.
      if (b <= -0.35) return PALETTE.slate;
      return null;
    },
    headPoints: () => [],
  },
];

export function variantById(id) {
  const v = VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`no variant '${id}' (have: ${VARIANTS.map((x) => x.id).join(', ')})`);
  return v;
}

// ---------------------------------------------------------------- part painting

/**
 * The head's ZONE pass, evaluated in the rotation-aware local frame.
 * Returns a hex or null (fall through to base material).
 */
export function headFeature(variant, x, y, headGeo, basis, tone) {
  const { a, b } = localCoords(x, y, headGeo, basis);
  return variant.head({ a, b, t: tone });
}

/**
 * The head's POINT pass: resolve each analytic feature offset to a single integer pixel.
 * Returns [{x, y, color}]. The caller clips to the head mask, so a tumble frame that only
 * shows a sliver of skull simply drops the eye rather than painting it onto a shoulder.
 */
export function headPointFeatures(variant, headGeo, basis) {
  if (!variant.headPoints) return [];
  const r = Math.max(2, Math.max(headGeo.bbox.w, headGeo.bbox.h) / 2);
  return variant.headPoints().map(({ fwd, up, color }) => ({
    x: Math.round(headGeo.centroid.x + basis.fwd.x * fwd * r + basis.up.x * up * r),
    y: Math.round(headGeo.centroid.y + basis.fwd.y * fwd * r + basis.up.y * up * r),
    color,
  }));
}

/** Blade + slash arc materials are shared across variants — the weapon is not the identity. */
// Steel, stopping short of #feffff: with white on the end the katana's mid tone — which is
// most of the blade — resolved to pure white and the sword read as a light source.
export const BLADE_RAMP = [PALETTE.slate, PALETTE.ash, PALETTE.mist];
// Slash arcs read as light, so they take the cool ramp and STOP at #b5dfe4. With #feffff on
// the end the sweep came out as a solid white wing that outweighed the character holding it.
export const ARC_RAMP = [PALETTE.teal, PALETTE.cyan, PALETTE.mist];

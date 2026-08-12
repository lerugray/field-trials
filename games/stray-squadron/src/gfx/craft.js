// Code-generated hero craft — the M1 flat-shaded test object, built from the
// STUDY.md §1.3 parts vocabulary (fuselage / wings / canopy / engine / tailfin)
// rather than a bare debug cube, so nothing placeholder survives the milestone
// close (hard rule 6). Silhouette-first, bilateral symmetry, a small ramp of
// flat colors. It faces -Z (forward / into the screen).
//
// Pure geometry, headless-testable. The palette here is a first pass at the
// "slate hull + cool canopy + warm engine" register; it is not the final hero
// ship (that is M2+), it is an honest, in-register demonstration of the substrate.

import { createMesh } from './mesh.js';
import { sub, cross, normalize, dot } from '../math/vec3.js';

// Hull palette — one base hull hue in a few brightness steps, plus two accents.
//
// ART MIGRATION 2026-08-10 — refuter residual #1, "hero pale/flat". The old ramp ran
// 0.24 -> 0.40 in value, about a third of a stop, so against a lit canyon floor the hero
// read as one pale shape with no internal form. It also had no true underside: the belly
// borrowed the fuselage's shadow step.
//
// The fix is RANGE, not brightness. Top planes go up to the PoC's brightest hull step,
// the belly and the new keel go genuinely dark, and the canopy deepens into a contrast
// anchor — roughly 0.07 -> 0.82 in value, which is what lets a flat-shaded facet ship
// read its own form. The renderer's per-class INK facet rim (gfx/renderer.js EDGE.craft)
// is the outline half of the same fix: a LIGHT rim was costing the hero its silhouette
// against lit ground, which is exactly what the PoC found and noted.
export const CRAFT_PALETTE = {
  hull: [0.42, 0.55, 0.62], // slate blue-grey — the base
  hullDark: [0.11, 0.15, 0.21], // true shadow step (belly)
  keel: [0.07, 0.10, 0.15], // the underside anchor — the darkest thing on the ship
  wing: [0.65, 0.79, 0.82], // bright top plane, catching the key
  canopy: [0.09, 0.19, 0.29], // cool dark accent — "there is a pilot in there"
  stripe: [0.87, 0.33, 0.21], // warm insignia accent
  engine: [1.0, 0.62, 0.24], // bright warm thruster color
};

// Add a convex polygon (fan) whose normal is forced to point away from `center`,
// so I never have to hand-check ring winding. `poly` is an array of [x,y,z].
function facetOut(mesh, poly, color, center) {
  const a = poly[0];
  const n = normalize(cross(sub(poly[1], a), sub(poly[2], a)));
  // Outward if the normal agrees with the direction from the craft center to
  // this facet; otherwise reverse the winding.
  const outward = dot(n, sub(a, center)) >= 0;
  for (let i = 1; i < poly.length - 1; i++) {
    if (outward) mesh.tri(poly[0], poly[i], poly[i + 1], color);
    else mesh.tri(poly[0], poly[i + 1], poly[i], color);
  }
}

// A hexagonal cross-section ring at depth z, wider than tall (ship-like).
function ring(z, rx, ry) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6; // flat top/bottom
    pts.push([Math.cos(ang) * rx, Math.sin(ang) * ry, z]);
  }
  return pts;
}

export function createCraftMesh() {
  const mesh = createMesh();
  const C = [0, 0, 0]; // craft center for outward-normal orientation

  // --- Fuselage: tail ring -> mid (widest) ring -> nose apex point. -----------
  const tail = ring(0.9, 0.34, 0.26);
  const mid = ring(-0.1, 0.40, 0.30);
  const nose = [0, 0, -1.15]; // pointed nose

  // tail -> mid tube (side facets)
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    // belly facets (lower half) get the shadow step for a readable underside.
    const isBelly = tail[i][1] < 0 && tail[j][1] < 0;
    const col = isBelly ? CRAFT_PALETTE.hullDark : CRAFT_PALETTE.hull;
    facetOut(mesh, [tail[i], tail[j], mid[j], mid[i]], col, C);
  }
  // mid -> nose cone
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    facetOut(mesh, [mid[i], mid[j], nose], CRAFT_PALETTE.hull, C);
  }
  // tail cap (flat back of the fuselage)
  facetOut(mesh, tail.slice().reverse(), CRAFT_PALETTE.hullDark, C);

  // --- Wings: two swept flat wedges in +-X, slight dihedral (tips up). --------
  // Built as thin boxes then it reads as a plane; the dihedral re-lights the two
  // faces into two tones (STUDY.md §1.3).
  const wing = (dir) => {
    const root = 0.26 * dir;
    const tip = 1.16 * dir;
    const zBack = 0.72, zFore = -0.12; // swept back
    const yUp = 0.10, tipUp = 0.24; // dihedral
    const th = 0.06; // thickness
    const top = [
      [root, yUp + th, zFore],
      [root, yUp + th, zBack],
      [tip, tipUp + th, zBack],
      [tip, tipUp + th, zFore],
    ];
    const bot = [
      [root, yUp - th, zFore],
      [root, yUp - th, zBack],
      [tip, tipUp - th, zBack],
      [tip, tipUp - th, zFore],
    ];
    const wingCenter = [root * 0.5, yUp, (zBack + zFore) / 2];
    facetOut(mesh, top, CRAFT_PALETTE.wing, wingCenter);
    facetOut(mesh, bot, CRAFT_PALETTE.keel, wingCenter);
    // leading + trailing + tip edges
    facetOut(mesh, [top[0], top[3], bot[3], bot[0]], CRAFT_PALETTE.stripe, wingCenter); // leading edge (fore)
    facetOut(mesh, [top[1], bot[1], bot[2], top[2]], CRAFT_PALETTE.hull, wingCenter); // trailing
    facetOut(mesh, [top[2], bot[2], bot[3], top[3]], CRAFT_PALETTE.wing, wingCenter); // tip
    facetOut(mesh, [top[0], bot[0], bot[1], top[1]], CRAFT_PALETTE.hull, wingCenter); // root
  };
  wing(1);
  wing(-1);

  // --- Canopy: small faceted bump on top near the nose, cool accent. ---------
  mesh.box([0, 0.28, -0.35], [0.26, 0.18, 0.5], CRAFT_PALETTE.canopy);

  // --- Engine: bright warm block at the tail (stands in for the thruster). ---
  mesh.box([0, 0, 1.0], [0.34, 0.24, 0.18], CRAFT_PALETTE.engine);

  // --- Tailfin: a SOLID thin wedge on top at the tail (silhouette spice). -----
  // S13 canted it ~7 degrees to starboard so it presents a lit face to the chase cam
  // rather than an edge-on line.
  //
  // ART MIGRATION 2026-08-10 — refuter residual #2, "edge-on shard read". The cant made
  // the fin visible from behind but it was still TWO COPLANAR QUADS with no thickness,
  // so from any angle near its own plane it collapsed to a lit sliver that reads as an
  // explosion shard rather than as part of the ship. A cant cannot fix that; only volume
  // can. The fin is now a real wedge with two faces and a rim, so there is no viewing
  // angle at which it has zero area, and its faces take different light.
  const finCenter = [0.03, 0.5, 0.75];
  const TH = 0.045;                          // half-thickness — thin, but never zero
  const finProfile = [
    [0.28, 0.50], [0.28, 0.95], [0.72, 0.85], [0.72, 0.65], // [y, z] going round
  ];
  const cant = 0.16;                         // how far the top edge leans to +x
  const finPt = (i, side) => {
    const [y, z] = finProfile[i];
    const lean = ((y - 0.28) / 0.44) * cant;  // 0 at the root, `cant` at the tip
    return [lean + side * TH, y, z];
  };
  const right = [0, 1, 2, 3].map((i) => finPt(i, 1));
  const left = [0, 1, 2, 3].map((i) => finPt(i, -1));
  facetOut(mesh, right, CRAFT_PALETTE.stripe, finCenter);
  facetOut(mesh, left, CRAFT_PALETTE.hullDark, finCenter);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    facetOut(mesh, [right[i], right[j], left[j], left[i]], CRAFT_PALETTE.hull, finCenter);
  }

  return mesh.build();
}

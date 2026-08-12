// Rail-following debris — a loose tunnel of flat-shaded chunks scattered along
// the flight path with a clear center, so the ship flies THROUGH scenery and the
// motion reads (parallax + fog). Baked once in world space for a single draw
// call. This is M2's scenery-for-feel; proper seeded obstacles the ship must
// avoid arrive in M2.4. Pure + headless-testable.

import { createMesh } from './mesh.js';
import { makeRng } from '../core/rng.js';
import { railFrame } from '../flight/rail.js';

const DEBRIS_COLORS = [
  [0.30, 0.33, 0.38],
  [0.26, 0.29, 0.34],
  [0.38, 0.34, 0.30],
  [0.22, 0.26, 0.30],
  [0.34, 0.30, 0.28],
];

// Clear radius around the rail center kept debris-free (the ship's tunnel).
export const TUNNEL_CLEAR = 3.4;

// palette defaults to the neutral slate debris; a sector theme passes its own
// accent palette (and a density hint) so the tunnel reads as that sector.
export function createRailField(seed, sMax = 1200, palette = DEBRIS_COLORS, density = 1) {
  const rng = makeRng(String(seed) + ':railfield');
  const mesh = createMesh();
  let s = 6;
  while (s < sMax) {
    const f = railFrame(s);
    // ART MIGRATION 2026-08-10 — thinned, and lifted off the deck.
    // This field was authored when there was NOTHING under the ship: it carried the
    // entire sense of motion by itself, so it was dense and centred on the flight line.
    // With a canyon under the ship its job inverts. At the old density it read as litter
    // strewn over the ground, and in the set-piece frame it broke the capital's
    // silhouette into a clump of boxes — the "unreadable cluster" residual, reappearing
    // in a new place. So: fewer chunks (many stations now emit none), biased ABOVE the
    // flight line so they read as high drift rather than rubbish on the deck, and
    // narrower so they stay clear of the canyon shoulders. Parallax was never the
    // problem; volume was.
    const n = Math.round(rng.int(0, 2) * density);
    for (let k = 0; k < n; k++) {
      const lat = rng.range(-13, 13);
      const vert = rng.range(-4, 10);
      if (Math.hypot(lat, vert) < TUNNEL_CLEAR + 1.0) continue; // keep the tunnel clear
      const p = [
        f.pos[0] + f.right[0] * lat + f.up[0] * vert,
        f.pos[1] + f.right[1] * lat + f.up[1] * vert,
        f.pos[2] + f.right[2] * lat + f.up[2] * vert,
      ];
      const sz = rng.range(0.4, 1.4);
      // S13: tumble each debris chunk so the background stops reading as a field of
      // world-axis cubes. Angles derived from position + size (no new rng draw, so the
      // field layout is unchanged).
      const rot = [lat * 0.3 + sz, vert * 0.4 + s * 0.1, sz * 3.1 + lat * 0.2];
      mesh.boxRot(p, [sz, sz, sz], rng.pick(palette), rot);
    }
    s += rng.range(3.6, 7.2);
  }
  return mesh.build();
}

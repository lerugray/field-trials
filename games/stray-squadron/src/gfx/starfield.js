// Seeded debris/asteroid scatter — a field of small flat-shaded cubes receding
// into the fog. In M1 this exists to prove three substrate properties at once in
// one frame: the depth buffer (overlapping boxes sort correctly), distance fog
// (far boxes dissolve into the sky color, STUDY.md §2.3), and the seeded-world
// contract (the same seed always lays out the same field — the foundation the
// M4 encounter grammar will build on). In-register as a belt of distant debris.
//
// Pure geometry: baked into one mesh in world space for a single draw call.
// Headless-testable.

import { createMesh } from './mesh.js';
import { makeRng } from '../core/rng.js';

// A few muted debris hues — slate/rust, so the field reads as cold background,
// never competing with the hero craft's palette.
const DEBRIS_COLORS = [
  [0.30, 0.33, 0.38],
  [0.26, 0.29, 0.34],
  [0.38, 0.34, 0.30],
  [0.22, 0.26, 0.30],
  [0.34, 0.30, 0.28],
];

// count boxes scattered in a slab that recedes down -Z (into the screen),
// spread across X/Y and pushed out from the craft so the hero stays clear.
export function createStarfield(seed, count = 90) {
  const rng = makeRng(seed);
  const mesh = createMesh();
  for (let i = 0; i < count; i++) {
    const x = rng.range(-16, 16);
    const y = rng.range(-9, 9);
    const z = rng.range(-42, -6); // in front of the camera, into the fog
    // keep a clear bubble around the hero craft at the origin
    if (Math.hypot(x, y, z + 4) < 4.5) continue;
    const s = rng.range(0.3, 1.1);
    mesh.box([x, y, z], [s, s, s], rng.pick(DEBRIS_COLORS));
  }
  return mesh.build();
}

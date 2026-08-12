// Obstacle mesh — bakes the seeded obstacle course (flight/obstacles.js) into one
// flat-shaded mesh in world space. Rocks are warmer and chunkier than the cool
// background debris so they read as foreground hazards; their position (in the
// ship's tunnel, in your way) is the real signal — not color alone. Pure +
// derived-from-tested-course, so no separate placement test needed here.

import { createMesh } from './mesh.js';
import { railFrame } from '../flight/rail.js';

const ROCK = [
  [0.44, 0.35, 0.28],
  [0.37, 0.31, 0.27],
  [0.31, 0.27, 0.25],
];

// palette defaults to the neutral warm rock; a sector theme passes its own rock
// accent palette so hazards read as that sector's stone.
export function createObstacleMesh(course, palette = ROCK) {
  const mesh = createMesh();
  for (const o of course) {
    const f = railFrame(o.s);
    const base = [
      f.pos[0] + f.right[0] * o.lat + f.up[0] * o.vert,
      f.pos[1] + f.right[1] * o.lat + f.up[1] * o.vert,
      f.pos[2] + f.right[2] * o.lat + f.up[2] * o.vert,
    ];
    const r = o.radius;
    // S13: tumble each rock per-instance so the most-repeated shape stops reading as a
    // bare world-axis cube. The angles come from the obstacle's own seeded spin +
    // variant (deterministic, no new rng draw), so the course data is unchanged.
    const tumble = (m) => [o.spin * 0.7 + m, o.spin + m * 1.7, o.spin * 1.3 + o.variant + m];
    mesh.boxRot(base, [r * 1.7, r * 1.5, r * 1.7], palette[o.variant % palette.length], tumble(0));
    // two satellite chunks in the frame plane for a lumpy, less-boxy read
    for (let k = 0; k < 2; k++) {
      const ang = o.spin + k * 2.3;
      const off = r * 0.75;
      const c = Math.cos(ang) * off, sN = Math.sin(ang) * off;
      const p = [
        base[0] + f.right[0] * c + f.up[0] * sN,
        base[1] + f.right[1] * c + f.up[1] * sN,
        base[2] + f.right[2] * c + f.up[2] * sN,
      ];
      const sr = r * (0.85 - 0.25 * k);
      mesh.boxRot(p, [sr, sr, sr], palette[(o.variant + k + 1) % palette.length], tumble(k + 1));
    }
  }
  return mesh.build();
}

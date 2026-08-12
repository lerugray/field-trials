// Blaster bolt mesh — a small elongated diamond (octahedron stretched along local
// Z) drawn per live projectile. Flat-shaded like everything else, but painted in a
// near-white-hot color so ambient + key light keep it reading as an energy bolt,
// not a pebble. Shape (a sharp lozenge) plus color separates it from the blocky
// enemies and rocks — never color alone (accessibility law). Player bolts are hot
// cyan-white; enemy bolts hot amber-red. Unit mesh; main.js orients it on the rail.

import { createMesh } from './mesh.js';

// length is along local +Z (the rail-forward axis once oriented); r is the ring
// half-width. Two color bands (core, then a slightly cooler tail face) give the
// flat shading a little form to catch.
export function createBoltMesh(core, tail, length = 1.4, r = 0.18) {
  const mesh = createMesh();
  const hz = length / 2;
  const tip = [0, 0, hz];
  const back = [0, 0, -hz];
  const ring = [
    [r, 0, 0],
    [0, r, 0],
    [-r, 0, 0],
    [0, -r, 0],
  ];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    mesh.tri(tip, a, b, core);   // nose cone
    mesh.tri(back, b, a, tail);  // tail cone (reversed winding to face out)
  }
  return mesh.build();
}

// Named palettes so main + tests agree on team colors.
export const BOLT_PLAYER = { core: [0.75, 1.0, 0.95], tail: [0.35, 0.85, 0.9] };
export const BOLT_ENEMY = { core: [1.0, 0.72, 0.4], tail: [0.9, 0.4, 0.32] };

// Explosion shard — a tiny hot cube flung outward by the explosion VFX. One unit
// mesh, drawn many times per burst at shrinking scale. Painted white-hot on the
// lit faces fading to ember on the shadowed ones so the flat shading still reads
// as fire, not confetti.

import { createMesh } from './mesh.js';

export function createShardMesh() {
  const mesh = createMesh();
  mesh.box([0, 0, 0], [1, 1, 1], {
    px: [1.0, 0.86, 0.5], nx: [0.9, 0.45, 0.2],
    py: [1.0, 0.92, 0.66], ny: [0.7, 0.28, 0.16],
    pz: [1.0, 0.7, 0.34], nz: [0.85, 0.4, 0.2],
  });
  return mesh.build();
}

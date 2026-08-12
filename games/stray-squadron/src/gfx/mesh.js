// Flat-shaded mesh builder. Non-indexed: every triangle carries its own three
// vertices, each stamped with the FACE normal and a flat face color. That is the
// whole point of the register (STUDY.md §1.1) — one flat color per face, the
// per-face brightness step computed from a single directional light does the
// form-reading. Shared/smoothed vertex normals would defeat it.
//
// Pure geometry only — no WebGL here, so it runs headless under node --test.
// The renderer uploads build() output into GL buffers.

import { sub, cross, normalize } from '../math/vec3.js';

export function createMesh() {
  const positions = [];
  const normals = [];
  const colors = [];

  // One triangle, flat-shaded: normal from the winding (CCW = front face).
  function tri(a, b, c, color) {
    const n = normalize(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      colors.push(color[0], color[1], color[2]);
    }
  }

  // Convex quad a->b->c->d (CCW from the outside) as two triangles.
  function quad(a, b, c, d, color) {
    tri(a, b, c, color);
    tri(a, c, d, color);
  }

  // Axis-aligned box. center + full-extent size. color is either a single
  // [r,g,b] used for all six faces, or an object { px, nx, py, ny, pz, nz }
  // giving per-face colors (missing faces fall back to `color.all`).
  function box(center, size, color) {
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const x0 = center[0] - hx, x1 = center[0] + hx;
    const y0 = center[1] - hy, y1 = center[1] + hy;
    const z0 = center[2] - hz, z1 = center[2] + hz;
    const c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], // back  z0: 0..3
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], // front z1: 4..7
    ];
    const face = (k) => (Array.isArray(color) ? color : (color[k] || color.all));
    quad(c[4], c[5], c[6], c[7], face('pz')); // +Z front
    quad(c[1], c[0], c[3], c[2], face('nz')); // -Z back
    quad(c[5], c[1], c[2], c[6], face('px')); // +X right
    quad(c[0], c[4], c[7], c[3], face('nx')); // -X left
    quad(c[3], c[7], c[6], c[2], face('py')); // +Y top
    quad(c[0], c[1], c[5], c[4], face('ny')); // -Y bottom
  }

  // A box tumbled by Euler angles rot=[rx,ry,rz] (radians), then centered. Same six
  // faces as box(), but the corners are rotated first, so the shape reads as a tumbled
  // chunk rather than a world-axis cube (M13 S13 — asteroid/debris variety). Rotation
  // preserves winding, so the flat per-face normals still come out right.
  function boxRot(center, size, color, rot) {
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const rx = rot ? rot[0] : 0, ry = rot ? rot[1] : 0, rz = rot ? rot[2] : 0;
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const put = (x, y, z) => {
      const y1 = y * cx - z * sx, z1 = y * sx + z * cx;   // rot X
      const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy; // rot Y
      const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz; // rot Z
      return [x3 + center[0], y3 + center[1], z2 + center[2]];
    };
    const c = [
      put(-hx, -hy, -hz), put(hx, -hy, -hz), put(hx, hy, -hz), put(-hx, hy, -hz),
      put(-hx, -hy, hz), put(hx, -hy, hz), put(hx, hy, hz), put(-hx, hy, hz),
    ];
    const face = (k) => (Array.isArray(color) ? color : (color[k] || color.all));
    quad(c[4], c[5], c[6], c[7], face('pz'));
    quad(c[1], c[0], c[3], c[2], face('nz'));
    quad(c[5], c[1], c[2], c[6], face('px'));
    quad(c[0], c[4], c[7], c[3], face('nx'));
    quad(c[3], c[7], c[6], c[2], face('py'));
    quad(c[0], c[1], c[5], c[4], face('ny'));
  }

  function build() {
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      triCount: positions.length / 9,
    };
  }

  return { tri, quad, box, boxRot, build };
}

// Pickup meshes — the rescue-beat rewards + the M7 distress beacon, built code-only
// at the art bar. Each kind is told apart by SILHOUETTE, never by color alone
// (accessibility law):
//   repair -> a plus/cross (the heal read)
//   score  -> a faceted diamond gem (the loot read)
//   rescue -> a beacon pod: a core with an angular SOS ring around it (a downed
//             wingmate to reach — a clearly different, urgent shape)
// All are lit by the sector's pickup accent so they glow warm and safe against any
// hazard palette, and all spin idly in the render so they read as "reach me".
//
// Pure geometry (headless-buildable). Rail-relative placement + collection live in
// combat/pickups.js; main.js draws these with the shared flat-shaded renderer.

import { createMesh } from './mesh.js';
import { cross, sub, normalize } from '../math/vec3.js';

// A brighter tint of the accent for the lit top faces, so the form still reads
// under the single directional light without needing a second color channel.
function lift(c, k) {
  return [Math.min(1, c[0] + k), Math.min(1, c[1] + k), Math.min(1, c[2] + k)];
}

// Push a triangle wound so its face normal points AWAY from the origin (outward),
// regardless of the argument order — lets us list faces without tracking winding.
function faceOut(mesh, a, b, c, color) {
  const n = normalize(cross(sub(b, a), sub(c, a)));
  const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  if (n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2] >= 0) mesh.tri(a, b, c, color);
  else mesh.tri(a, c, b, color);
}

// repair: two crossed bars in the frame plane forming a plus. The top faces catch
// a lifted tint so the cross reads in three dimensions.
function crossMesh(color) {
  const mesh = createMesh();
  const top = lift(color, 0.18);
  const a = 1.5, b = 0.5, d = 0.4; // long extent, short extent, depth
  const bar = (sx, sy) => mesh.box([0, 0, 0], [sx, sy, d], { all: color, py: top });
  bar(a, b);   // horizontal
  bar(b, a);   // vertical
  return mesh.build();
}

// score: a diamond gem (elongated octahedron). Six vertices, eight faces, outward
// winding auto-fixed; the upper faces lifted so the facets step in the light.
function gemMesh(color) {
  const mesh = createMesh();
  const top = lift(color, 0.2);
  const H = 1.35, W = 0.9;
  const T = [0, H, 0], B = [0, -H, 0];
  const R = [W, 0, 0], L = [-W, 0, 0], F = [0, 0, W], K = [0, 0, -W];
  faceOut(mesh, T, R, F, top); faceOut(mesh, T, F, L, top);
  faceOut(mesh, T, L, K, top); faceOut(mesh, T, K, R, top);
  faceOut(mesh, B, F, R, color); faceOut(mesh, B, L, F, color);
  faceOut(mesh, B, K, L, color); faceOut(mesh, B, R, K, color);
  return mesh.build();
}

// rescue: a distress beacon. A small bright core box ringed by four angular struts
// (a beacon cage) so the silhouette reads as "a pod in trouble, come get it" — a
// different, more urgent shape than the calm heal/score pickups. The struts catch the
// lifted tint so the cage steps in the light.
function beaconMesh(color) {
  const mesh = createMesh();
  const top = lift(color, 0.22);
  // bright core
  mesh.box([0, 0, 0], [0.55, 0.55, 0.55], { all: top });
  // four struts swept out around the core in the frame plane (the SOS cage)
  const R = 1.25, t = 0.16;
  const strut = (ax, ay) => mesh.box([ax * R * 0.6, ay * R * 0.6, 0], [t, t, t], { all: color, py: top });
  strut(1, 1); strut(-1, 1); strut(1, -1); strut(-1, -1);
  // and four outer tips (the ring corners) so it reads bigger than a pickup
  const tip = (ax, ay) => mesh.box([ax * R, ay * R, 0], [t * 1.4, t * 1.4, t * 1.4], { all: top });
  tip(1, 0); tip(-1, 0); tip(0, 1); tip(0, -1);
  return mesh.build();
}

// Build the mesh for a pickup kind, tinted to the sector's pickup accent.
export function createPickupMesh(kind, color) {
  if (kind === 'repair') return crossMesh(color);
  if (kind === 'rescue') return beaconMesh(color);
  return gemMesh(color);
}

// The landscape: a canyon floor that follows the rail, sparse framing relief masses
// beyond its rim, and the occasional rim structure.
//
// ART MIGRATION 2026-08-10. Before this, the world under the ship was nothing — the
// clear colour and a scatter of debris cubes. The approved r4 frames
// (docs/art-poc/approval-record/) are more than half landscape: a faceted floor running
// to a horizon, dark masses cropping the corners, and pale towers giving the middle
// distance a scale reference. That depth layering is what makes a ship read as being
// SOMEWHERE, and it is the single largest gap this migration closes.
//
// Three rules govern everything here, and the third is the operator's:
//
//  1. VISUAL ONLY. Nothing in this file has a hitbox, and nothing reads any gameplay
//     state. The floor sits GROUND_DROP below the rail and the walls begin well outside
//     the debris field, so the flyable tunnel is untouched by construction.
//  2. Seeded and baked. One mesh per level, built once from the level seed, drawn in one
//     call. Same seed, same landscape (the seeded-world contract).
//  3. THIN. Ray passed the frames with "SS may be a little busy / hard to see what's
//     going on" — key-art density is not gameplay density. So the relief and structure
//     placers are deliberately sparse and rhythmic rather than scattered: a mass every
//     ninety-odd units, a tower every hundred and sixty-odd, alternating sides. The job
//     of the landscape is to frame the read, never to compete with it.
//
// Pure geometry, headless-testable. No WebGL, no DOM.

import { createMesh } from './mesh.js';
import { railPos } from '../flight/rail.js';

// How far below the rail centreline the canyon floor sits. The debris field reaches 8.5
// below and obstacles ride inside that, so this has to clear 8.5 plus the floor's own
// relief with margin. test/terrain.test.js sweeps the whole course and holds it to at
// least two units of daylight — the first draft used 13 and left 0.84, which the test
// caught and which would have put the ground inside the debris field on bad stations.
export const GROUND_DROP = 15;

// The canyon: the floor is flat-ish out to a winding half-width, then climbs.
export const CANYON = {
  hwBase: 24,        // mean half-width of the gorge floor
  hwSway: 7,         // how much it winds along the course
  hwFreq: 0.0075,
  wallCap: 30,       // walls stop climbing here (they break the skyline first)
  strata: 0.55,      // terracing step: heights snap to 1/strata units
  halfWidth: 80,     // how far out the mesh is built
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Deterministic value noise. Self-contained so the landscape needs no RNG stream and
// can be evaluated at any (u, s) without order dependence.
function hash2(x, y) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smoothstep01 = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smoothstep01(x - xi), v = smoothstep01(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}
export function fbm2(x, y) {
  return noise2(x, y) * 0.55
    + noise2(x * 2.03 + 7, y * 2.03 - 3) * 0.30
    + noise2(x * 4.01 - 2, y * 4.01 + 9) * 0.15;
}

// Height of the ground at lateral offset `u` and rail station `s`, RELATIVE to the
// canyon floor datum (which itself sits GROUND_DROP below the rail). Pure.
//
// The terms, in the order they matter to the eye: a terraced wall that starts outside
// the gorge half-width, low-frequency floor relief, a shallow channel directly under
// the flight path (so the rail reads as following a watercourse), a dune ripple, and a
// one-sided bench so the mid-ground is not a single unbroken shelf.
export function terrainHeight(u, s) {
  const hw = CANYON.hwBase + CANYON.hwSway * Math.sin(s * CANYON.hwFreq + 1.7);
  const asym = u < 0 ? 0.86 : 1.12;               // an asymmetric gorge reads deeper
  const d = Math.max(0, Math.abs(u) - hw * asym);

  let wall = Math.min(CANYON.wallCap, Math.pow(d * 0.62, 1.18));
  wall = Math.round(wall * CANYON.strata) / CANYON.strata;  // strata terracing

  const inFloor = 1 - clamp01(d * 0.12);          // detail fades as the wall takes over
  const floorN = (fbm2(u * 0.026, s * 0.019) - 0.5) * 4.2 * inFloor;
  const wash = -Math.exp(-(u * u) / 140) * 1.7;
  const dune = Math.sin(s * 0.016 + u * 0.05) * 0.95 * inFloor;
  // The bench starts OUTSIDE the flyable corridor (which reaches 15 out). Drafted at
  // u=9 it climbed 5 units inside the corridor and ate the clearance margin.
  const bench = clamp01((u - 22) / 14)
    * clamp01((fbm2(u * 0.016 + 3, s * 0.010) - 0.34) * 3) * 5.2;

  return wall + floorN + wash + dune + bench;
}

// Colour for a patch of ground at height `h`. A four-step ramp by height, then a
// large-wavelength albedo that is INDEPENDENT of height — without it a near-flat floor
// paints one continuous mid-brown quilt over half the frame (the PoC's round-3 note).
function groundColor(h, u, s, g) {
  const t = clamp01((h + 3.5) / 14);
  const lerp = (a, b, k) => [
    a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k,
  ];
  let col = lerp(lerp(g[0], g[1], clamp01(t * 2.2)), g[2], clamp01((t - 0.36) / 0.64));
  if (t > 0.72) col = lerp(col, g[3], ((t - 0.72) / 0.28) * 0.55);
  const alb = fbm2(u * 0.010 + 11, s * 0.008 - 5);
  col = lerp(col, g[0], clamp01((alb - 0.42) * 2.0) * 0.50);   // ash washes
  col = lerp(col, g[3], clamp01((0.38 - alb) * 2.4) * 0.28);   // pale salt flats
  return col;
}

// Lateral sample columns: fine near the flight path (where the near-field facets are
// large on screen), coarse toward the rim (where perspective compresses them anyway).
const COLS = (() => {
  const half = [0, 3, 7, 12, 18, 25, 33, 42, 53, 66, 80];
  const out = [];
  for (let i = half.length - 1; i >= 1; i--) out.push(-half[i]);
  for (const v of half) out.push(v);
  return out;
})();

const STEP_S = 6;   // station spacing between terrain rows

// The canyon floor + walls as one baked world-space mesh along the rail.
export function createTerrainMesh(sStart, sEnd, ground) {
  const mesh = createMesh();
  const g = ground;
  // Sample the rail once per row: the terrain rides the course laterally and
  // vertically, which is what guarantees the tunnel stays clear at any sway.
  const rowAt = (s) => {
    const p = railPos(s);
    return { cx: p[0], cy: p[1] - GROUND_DROP, z: p[2] };
  };

  let prev = rowAt(sStart);
  let prevS = sStart;
  for (let s = sStart + STEP_S; s <= sEnd; s += STEP_S) {
    const cur = rowAt(s);
    for (let i = 0; i < COLS.length - 1; i++) {
      const u0 = COLS[i], u1 = COLS[i + 1];
      const h00 = terrainHeight(u0, prevS), h10 = terrainHeight(u1, prevS);
      const h01 = terrainHeight(u0, s), h11 = terrainHeight(u1, s);
      const a = [prev.cx + u0, prev.cy + h00, prev.z];
      const b = [prev.cx + u1, prev.cy + h10, prev.z];
      const c = [cur.cx + u1, cur.cy + h11, cur.z];
      const d = [cur.cx + u0, cur.cy + h01, cur.z];
      const hm = (h00 + h10 + h01 + h11) / 4;
      const base = groundColor(hm, u0, prevS, g);
      // A per-quad value jitter, then a step between the two triangles OF that quad.
      // Both matter and the second one is the important one: at 0.11 (the first draft)
      // the two halves of a quad were near-identical, so the mesh read as a smooth
      // surface with a wireframe drawn over it rather than as facets. 0.22 with a
      // per-quad offset gives adjacent triangles a real value break, which is the
      // entire point of a flat-shaded register.
      const jit = (hash2(Math.round(u0), Math.round(prevS)) - 0.5) * 0.16;
      const col = [
        Math.max(0, Math.min(1, base[0] * (1 + jit))),
        Math.max(0, Math.min(1, base[1] * (1 + jit))),
        Math.max(0, Math.min(1, base[2] * (1 + jit))),
      ];
      const col2 = [col[0] * 0.78 + g[0][0] * 0.22, col[1] * 0.78 + g[0][1] * 0.22,
        col[2] * 0.78 + g[0][2] * 0.22];
      // Wound so the surface normal points UP (+Y). This matters more than it looks:
      // back-face culling is on, so a floor wound the other way is not a dark floor,
      // it is no floor at all. (It was wound the other way in the first draft.)
      mesh.tri(a, c, d, col);
      mesh.tri(a, b, c, col2);
    }
    prev = cur; prevS = s;
  }
  return mesh.build();
}

// A tapered prism from a seeded footprint polygon, lofted in tiers. This is the shape
// language of the framing masses in the approved frames: broad dark bases, terraced
// shoulders, a small flat top.
function mass(mesh, cx, cy, cz, radius, height, tint, seedN) {
  const sides = 7;
  const foot = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + hash2(seedN, i) * 0.5;
    const r = radius * (0.62 + hash2(seedN + 31, i) * 0.55);
    foot.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const tiers = 3;
  const shade = (k, face) => {
    // Value step per tier plus a per-face break, so each facet reads separately.
    const v = 0.66 + k * 0.15 + (face % 2 ? 0.06 : 0);
    return [tint[0] * v, tint[1] * v, tint[2] * v];
  };
  for (let k = 0; k < tiers; k++) {
    const y0 = cy + (height * k) / tiers;
    const y1 = cy + (height * (k + 1)) / tiers;
    const t0 = 1 - k / (tiers + 0.7);
    const t1 = 1 - (k + 1) / (tiers + 0.7);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = [cx + foot[i][0] * t0, y0, cz + foot[i][1] * t0];
      const b = [cx + foot[j][0] * t0, y0, cz + foot[j][1] * t0];
      const c = [cx + foot[j][0] * t1, y1, cz + foot[j][1] * t1];
      const d = [cx + foot[i][0] * t1, y1, cz + foot[i][1] * t1];
      // a -> d -> c -> b, so the face normal points AWAY from the mass's axis. The
      // footprint runs counter-clockwise in (x, z), which makes the naive a-b-c-d
      // ordering face inward, and inward faces are culled.
      mesh.quad(a, d, c, b, shade(k, i));
    }
  }
  // Flat cap, wound to face up.
  const tTop = 1 - tiers / (tiers + 0.7);
  const yTop = cy + height;
  const capCol = shade(tiers, 0);
  for (let i = 1; i < sides - 1; i++) {
    mesh.tri(
      [cx + foot[0][0] * tTop, yTop, cz + foot[0][1] * tTop],
      [cx + foot[i + 1][0] * tTop, yTop, cz + foot[i + 1][1] * tTop],
      [cx + foot[i][0] * tTop, yTop, cz + foot[i][1] * tTop],
      capCol,
    );
  }
}

// Sparse framing masses beyond the canyon rim. These are the dark shapes that crop the
// corners of the approved frames and give the middle distance its depth layering.
// Rhythmic and alternating rather than scattered — see rule 3 at the top of the file.
export function createReliefMesh(seed, sStart, sEnd, ground) {
  const mesh = createMesh();
  const tint = ground[1];
  let n = 0;
  for (let s = sStart + 40; s < sEnd; s += 90) {
    const j = hash2(Math.round(s), 17);
    const side = n % 2 === 0 ? -1 : 1;
    const u = side * (54 + j * 34);
    const p = railPos(s + (hash2(Math.round(s), 5) - 0.5) * 40);
    const baseH = terrainHeight(u, s);
    mass(
      mesh,
      p[0] + u,
      p[1] - GROUND_DROP + baseH - 3,
      p[2],
      14 + j * 12,
      18 + hash2(Math.round(s), 23) * 22,
      tint,
      Math.round(s),
    );
    n++;
  }
  return mesh.build();
}

// Rim structures — a lattice pylon with a boxed head. Pale and cool against the warm
// rock, they are the scale reference in the approved frames: you read the canyon's size
// off them. Rarer still than the relief masses.
const STRUCT = {
  leg: [0.42, 0.52, 0.58],
  legDark: [0.24, 0.31, 0.36],
  head: [0.56, 0.66, 0.70],
  headDark: [0.30, 0.38, 0.44],
  lamp: [1.0, 0.68, 0.28],
};

export function createStructureMesh(seed, sStart, sEnd) {
  const mesh = createMesh();
  let n = 0;
  for (let s = sStart + 110; s < sEnd; s += 165) {
    const j = hash2(Math.round(s), 41);
    const side = n % 2 === 0 ? 1 : -1;
    const u = side * (33 + j * 12);
    const p = railPos(s);
    const baseY = p[1] - GROUND_DROP + terrainHeight(u, s);
    const x = p[0] + u, z = p[2];
    const h = 20 + j * 12;

    // Four splayed legs, drawn as thin tapered boxes.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const spread = 3.4;
      mesh.box(
        [x + Math.cos(a) * spread * 0.5, baseY + h * 0.35, z + Math.sin(a) * spread * 0.5],
        [1.0, h * 0.7, 1.0],
        { all: STRUCT.legDark, py: STRUCT.leg, px: STRUCT.leg, pz: STRUCT.leg },
      );
    }
    // Cross-braces: two flat bands that read as a lattice at distance.
    for (const f of [0.3, 0.58]) {
      mesh.box([x, baseY + h * f, z], [7.2, 0.7, 7.2], { all: STRUCT.legDark, py: STRUCT.leg });
    }
    // Head block + a canted cap, so the silhouette is not a plain post.
    mesh.box([x, baseY + h * 0.82, z], [6.4, h * 0.26, 5.6], {
      all: STRUCT.headDark, py: STRUCT.head, px: STRUCT.head, pz: STRUCT.head,
    });
    mesh.boxRot([x, baseY + h * 0.99, z], [4.6, 2.2, 4.0], {
      all: STRUCT.headDark, py: STRUCT.head, pz: STRUCT.head,
    }, [0, 0.5, 0.12]);
    // A single warm lamp — the one hot point, so the tower reads as tended.
    mesh.box([x, baseY + h * 1.08, z], [1.1, 1.1, 1.1], STRUCT.lamp);
    n++;
  }
  return mesh.build();
}

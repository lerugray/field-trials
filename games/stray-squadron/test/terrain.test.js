// The landscape (src/gfx/terrain.js). Two things are worth holding to a test here, and
// only one of them is geometry.
//
// The load-bearing one is CLEARANCE. The canyon is decoration with no hitbox, so the
// only way it can hurt the game is by intersecting the flyable volume — a wall the ship
// visibly passes through, or a floor that swallows the debris field. That is a pure
// arithmetic property of terrainHeight + GROUND_DROP, so it is checkable without a GPU,
// and it is checked here over the whole course rather than at a spot.
//
// The other is determinism, because the seeded-world contract says the same seed is the
// same world, and a landscape built from noise is exactly where that quietly breaks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTerrainMesh, createReliefMesh, createStructureMesh,
  terrainHeight, fbm2, GROUND_DROP, CANYON,
} from '../src/gfx/terrain.js';
import { TUNNEL_CLEAR } from '../src/gfx/railfield.js';
import { SECTORS } from '../src/world/sectors.js';

const ground = SECTORS[0].ground;

// The flyable volume, in rail-relative units: the debris field reaches 15 out and 8.5
// down (gfx/railfield.js), and obstacles ride inside that.
const FLYABLE_LAT = 15;
const FLYABLE_DOWN = 8.5;

test('the canyon floor never rises into the flyable volume, anywhere on a course', () => {
  let worst = -Infinity, worstAt = null;
  for (let s = 0; s <= 1600; s += 7) {
    for (let u = -FLYABLE_LAT; u <= FLYABLE_LAT; u += 1) {
      // Height of the ground relative to the rail centreline (negative = below it).
      const rel = terrainHeight(u, s) - GROUND_DROP;
      if (rel > worst) { worst = rel; worstAt = { u, s }; }
    }
  }
  assert.ok(worst < -FLYABLE_DOWN,
    `ground reaches ${worst.toFixed(2)} below the rail at u=${worstAt.u} s=${worstAt.s}, `
    + `which is inside the ${FLYABLE_DOWN}-unit debris floor`);
});

test('there is real clearance, not a hairline — the margin is stated, not incidental', () => {
  let worst = -Infinity;
  for (let s = 0; s <= 1600; s += 7) {
    for (let u = -FLYABLE_LAT; u <= FLYABLE_LAT; u += 1) {
      worst = Math.max(worst, terrainHeight(u, s) - GROUND_DROP);
    }
  }
  assert.ok(worst < -FLYABLE_DOWN - 2,
    `only ${(-worst - FLYABLE_DOWN).toFixed(2)} units of margin under the debris floor`);
});

test('the tunnel around the rail centre is deeply clear', () => {
  for (let s = 0; s <= 1600; s += 11) {
    for (let u = -TUNNEL_CLEAR; u <= TUNNEL_CLEAR; u += 0.5) {
      assert.ok(terrainHeight(u, s) - GROUND_DROP < -FLYABLE_DOWN,
        `ground intrudes on the tunnel at u=${u} s=${s}`);
    }
  }
});

test('the walls actually climb — this is a canyon, not a plain', () => {
  // At the outer edge of the built mesh the ground must be well ABOVE the rail, or
  // there is no rim to break the skyline and the framing masses have nothing to sit on.
  let sawHighWall = false;
  for (let s = 0; s <= 1600; s += 23) {
    const rel = terrainHeight(CANYON.halfWidth, s) - GROUND_DROP;
    if (rel > 4) sawHighWall = true;
  }
  assert.ok(sawHighWall, 'the outer wall never rises above the flight line');
});

test('wall height is capped, so no spike can eat the sky', () => {
  for (let s = 0; s <= 1600; s += 13) {
    for (let u = -200; u <= 200; u += 5) {
      const h = terrainHeight(u, s);
      assert.ok(Number.isFinite(h), `non-finite height at u=${u} s=${s}`);
      assert.ok(h <= CANYON.wallCap + 12,
        `height ${h.toFixed(1)} at u=${u} s=${s} runs past the wall cap`);
    }
  }
});

test('the gorge is asymmetric — the two walls do not mirror each other', () => {
  let differing = 0;
  for (let s = 0; s <= 1200; s += 17) {
    if (Math.abs(terrainHeight(30, s) - terrainHeight(-30, s)) > 0.5) differing++;
  }
  assert.ok(differing > 20, `only ${differing} stations had asymmetric walls`);
});

test('terrainHeight and fbm2 are pure — same input, same output, no hidden state', () => {
  const a = terrainHeight(7.5, 311);
  const b = terrainHeight(7.5, 311);
  assert.equal(a, b);
  assert.equal(fbm2(1.25, -3.5), fbm2(1.25, -3.5));
  for (let i = 0; i < 200; i++) {
    const v = fbm2(i * 0.37, i * -0.11);
    assert.ok(v >= 0 && v <= 1, `fbm2 out of range: ${v}`);
  }
});

const wellFormed = (m, label) => {
  assert.ok(m.triCount > 0, `${label} built nothing`);
  assert.equal(m.positions.length, m.triCount * 9, `${label} positions`);
  assert.equal(m.normals.length, m.triCount * 9, `${label} normals`);
  assert.equal(m.colors.length, m.triCount * 9, `${label} colors`);
  for (const v of m.positions) assert.ok(Number.isFinite(v), `${label} non-finite position`);
  for (const v of m.normals) assert.ok(Number.isFinite(v), `${label} non-finite normal`);
  for (const c of m.colors) assert.ok(c >= 0 && c <= 1, `${label} colour out of [0,1]: ${c}`);
};

test('all three landscape meshes are well-formed', () => {
  wellFormed(createTerrainMesh(0, 400, ground), 'terrain');
  wellFormed(createReliefMesh('seed-a', 0, 400, ground), 'relief');
  wellFormed(createStructureMesh('seed-a', 0, 400), 'structures');
});

test('every landscape normal is unit length (no degenerate facets)', () => {
  for (const m of [
    createTerrainMesh(0, 200, ground),
    createReliefMesh('seed-a', 0, 400, ground),
    createStructureMesh('seed-a', 0, 400),
  ]) {
    for (let i = 0; i < m.normals.length; i += 3) {
      const len = Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
      assert.ok(Math.abs(len - 1) < 1e-3, `non-unit normal ${len} at ${i}`);
    }
  }
});

test('the landscape is deterministic — same seed, same bytes', () => {
  const a = createTerrainMesh(0, 300, ground);
  const b = createTerrainMesh(0, 300, ground);
  assert.deepEqual([...a.positions], [...b.positions]);
  const r1 = createReliefMesh('seed-a', 0, 600, ground);
  const r2 = createReliefMesh('seed-a', 0, 600, ground);
  assert.deepEqual([...r1.positions], [...r2.positions]);
  const s1 = createStructureMesh('seed-a', 0, 900);
  const s2 = createStructureMesh('seed-a', 0, 900);
  assert.deepEqual([...s1.positions], [...s2.positions]);
});

test('the floor faces up — the key light is overhead, so a floor lit from below is a bug', () => {
  const m = createTerrainMesh(0, 300, ground);
  let up = 0, down = 0;
  for (let i = 0; i < m.normals.length; i += 3) {
    if (m.normals[i + 1] > 0) up++; else if (m.normals[i + 1] < 0) down++;
  }
  assert.ok(up > down * 20, `${down} downward-facing terrain normals against ${up} upward`);
});

test('relief masses face OUTWARD — an inward-wound mass is culled into nothing', () => {
  // Same bug class as the terrain winding: back-face culling is on, so a prism wound
  // the wrong way does not look dark, it disappears. Checked by comparing each face's
  // normal against the direction from the mass's own centroid to that face.
  const m = createReliefMesh('seed-a', 0, 400, ground);
  let outward = 0, inward = 0;
  const triCentroid = (t) => {
    const i = t * 9;
    return [
      (m.positions[i] + m.positions[i + 3] + m.positions[i + 6]) / 3,
      (m.positions[i + 1] + m.positions[i + 4] + m.positions[i + 7]) / 3,
      (m.positions[i + 2] + m.positions[i + 5] + m.positions[i + 8]) / 3,
    ];
  };
  // One mass per contiguous run of faces; use the whole mesh's per-mass grouping by
  // taking each triangle against the centroid of the 23 faces around it.
  const per = 7 * 2 * 3 + (7 - 2);
  for (let t = 0; t < m.triCount; t++) {
    const group = Math.floor(t / per);
    let gx = 0, gy = 0, gz = 0, n = 0;
    for (let k = group * per; k < Math.min(m.triCount, (group + 1) * per); k++) {
      const c = triCentroid(k); gx += c[0]; gy += c[1]; gz += c[2]; n++;
    }
    gx /= n; gy /= n; gz /= n;
    const c = triCentroid(t);
    const i = t * 9;
    // Horizontal only: caps legitimately point straight up.
    const dx = c[0] - gx, dz = c[2] - gz;
    const dot = m.normals[i] * dx + m.normals[i + 2] * dz;
    if (Math.hypot(dx, dz) < 0.5) continue;
    if (dot > 0) outward++; else if (dot < 0) inward++;
  }
  assert.ok(outward > inward * 6,
    `${inward} inward-facing relief faces against ${outward} outward — check the winding`);
});

test('relief and structures stay OUT of the flight corridor', () => {
  // They are placed beyond the canyon rim on purpose; a mass that wandered inward would
  // read as an obstacle the player is allowed to fly through.
  for (const m of [createReliefMesh('seed-a', 0, 900, ground), createStructureMesh('seed-a', 0, 900)]) {
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i], z = m.positions[i + 2];
      // Rail x sways +-6 (flight/rail.js AMP_X), so anything within 6+FLYABLE_LAT of
      // the world axis could plausibly sit in the corridor.
      if (Math.abs(x) < 6 + FLYABLE_LAT) {
        assert.fail(`landscape geometry at x=${x.toFixed(1)} z=${z.toFixed(1)} is inside the corridor`);
      }
    }
  }
});

test('the landscape is SPARSE — the operator readability note applies to scenery too', () => {
  // Roughly one framing mass per 90 units and one tower per 165. If a future change
  // makes these dense, the frames get busy again and this fails first.
  const span = 1800;
  const relief = createReliefMesh('seed-a', 0, span, ground);
  const structs = createStructureMesh('seed-a', 0, span);
  // Count distinct masses by their triangle budget rather than re-deriving placement.
  const reliefTrisEach = 7 * 2 * 3 + (7 - 2); // sides * 2 tris * tiers + cap fan
  const masses = relief.triCount / reliefTrisEach;
  assert.ok(masses >= 15 && masses <= 24, `${masses} framing masses over ${span} units`);
  const towerTrisEach = 4 * 12 + 2 * 12 + 12 + 12 + 12;
  const towers = structs.triCount / towerTrisEach;
  assert.ok(towers >= 8 && towers <= 13, `${towers} towers over ${span} units`);
});

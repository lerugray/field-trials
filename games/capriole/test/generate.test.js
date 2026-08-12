// node --test — the sky generator's STRUCTURAL properties (M2). Reachability (the
// real-tick guarantee) is proven in reachability.test.js / the N-seed suite; here we
// check determinism, no-overlap, bounded extents, pod count/spacing, and the sphere-1
// teaching escalation. Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSphere, layoutSeed } from '../src/sim/generate.js';
import { tuning } from '../src/sim/tuning.js';

const SEEDS = [1, 2, 7, 42, 1337, 99999];

test('generation is a pure function of (seed, sphereIndex)', () => {
  const a = generateSphere(42, 3);
  const b = generateSphere(42, 3);
  assert.deepEqual(a, b, 'same inputs → byte-identical layout (recompute-on-resume law)');
  const c = generateSphere(42, 4);
  assert.notDeepEqual(a.islands, c.islands, 'different sphere index → different layout');
  assert.notEqual(layoutSeed(42, 3), layoutSeed(42, 4), 'per-sphere seeds differ');
});

test('every sphere has a roomy spawn pad at origin, top y=0', () => {
  for (const s of SEEDS) {
    const sph = generateSphere(s, 0);
    const a = sph.islands[0];
    assert.equal(a.cx, 0); assert.equal(a.cz, 0); assert.equal(a.topY, 0);
    assert.ok(a.radius >= 6, 'spawn pad roomy');
    assert.ok(Math.abs(sph.spawn.x) < 1e-9 && sph.spawn.y > a.topY, 'spawn above the pad');
  }
});

test('no two islands overlap (rim clearance held), all seeds/spheres', () => {
  for (const s of SEEDS) {
    for (let idx = 0; idx < 9; idx++) {
      const { islands } = generateSphere(s, idx);
      for (let i = 0; i < islands.length; i++) {
        for (let j = i + 1; j < islands.length; j++) {
          const d = Math.hypot(islands[i].cx - islands[j].cx, islands[i].cz - islands[j].cz);
          assert.ok(d >= islands[i].radius + islands[j].radius,
            `seed ${s} sph ${idx}: islands ${i},${j} overlap (d=${d.toFixed(2)})`);
        }
      }
    }
  }
});

test('archipelago stays within the bounded extent, all seeds/spheres', () => {
  for (const s of SEEDS) {
    for (let idx = 0; idx < 9; idx++) {
      const { islands } = generateSphere(s, idx);
      for (const o of islands) {
        assert.ok(Math.hypot(o.cx, o.cz) <= tuning.gen.maxExtent,
          `seed ${s} sph ${idx}: island beyond maxExtent`);
      }
    }
  }
});

test('exactly perSphere pods, each on a distinct island, spaced ≥ podSpacingMin', () => {
  for (const s of SEEDS) {
    for (let idx = 0; idx < 9; idx++) {
      const { pods, islands, exit } = generateSphere(s, idx);
      assert.equal(pods.length, tuning.pods.perSphere, `seed ${s} sph ${idx}: pod count`);
      const podIslands = pods.map((p) => p.island);
      assert.equal(new Set(podIslands).size, pods.length, 'distinct pod islands');
      for (const p of pods) {
        assert.ok(p.island > 0, 'no pod on the spawn pad');
        assert.ok(Math.abs(p.y - (islands[p.island].topY + tuning.pods.heightAboveTop)) < 1e-9, 'pod floats above its top');
      }
      for (let i = 0; i < pods.length; i++) {
        for (let j = i + 1; j < pods.length; j++) {
          const d = Math.hypot(pods[i].x - pods[j].x, pods[i].z - pods[j].z);
          assert.ok(d >= tuning.gen.podSpacingMin - 1e-6, `pods ${i},${j} too close (d=${d.toFixed(2)})`);
        }
      }
      assert.equal(exit.island, islands.length - 1, 'exit on the farthest island');
    }
  }
});

test('sphere 1 is a teaching sphere: VOID gaps escalate jump 1→2→3', () => {
  // The void the player must clear (center dist − both rims) is the authored teaching
  // signal. teachTiers = [1,1,2,2,3,3,...] → tier-1 hop < tier-2 hop < tier-3 hop.
  for (const s of [1, 7, 42]) {
    const { islands } = generateSphere(s, 0);
    const voidGap = (i) =>
      Math.hypot(islands[i + 1].cx - islands[i].cx, islands[i + 1].cz - islands[i].cz)
      - islands[i].radius - islands[i + 1].radius;
    const v0 = voidGap(0), v2 = voidGap(2), v4 = voidGap(4);
    assert.ok(v2 > v0, `seed ${s}: tier-2 void ${v2.toFixed(1)} > tier-1 void ${v0.toFixed(1)}`);
    assert.ok(v4 > v2, `seed ${s}: tier-3 void ${v4.toFixed(1)} > tier-2 void ${v2.toFixed(1)}`);
    assert.equal(islands.length - 1, tuning.gen.teachTiers.length, 'teaching chain length authored');
  }
});

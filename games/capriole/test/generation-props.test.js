// node --test — the M2 generation PROPERTY SUITE over N seeds (fold: "generation
// property tests over N seeds — reachable, no island overlap, bounded extents, pod
// spacing" + "kill-plane property test: plane sits below min island Y minus margin, all
// seeds"). Drives makeValidatedSphere (generate + real-tick reachability + reroll) and
// asserts the invariants hold for every sphere of every seed. Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValidatedSphere, validateSphere, runCollectBot } from '../src/sim/reachability.js';
import { computeKillPlaneY } from '../src/sim/world.js';
import { tuning } from '../src/sim/tuning.js';

// A spread of seeds (N=30) × 9 spheres = 270 validated spheres.
const N = 30;
const SEEDS = Array.from({ length: N }, (_, i) => 1 + i * 104729); // step by a prime for spread

test(`every sphere of ${N} seeds is reachable, non-overlapping, bounded, spaced (real-tick validated)`, () => {
  for (const seed of SEEDS) {
    for (let idx = 0; idx < 9; idx++) {
      const sph = makeValidatedSphere(seed, idx);

      // Reachable: pods + exit provably reachable from spawn (the whole point).
      assert.ok(sph.valid, `seed ${seed} sph ${idx} unreachable after reroll: ${JSON.stringify(sph.missing)}`);

      // No island overlap.
      const isl = sph.islands;
      for (let i = 0; i < isl.length; i++) {
        for (let j = i + 1; j < isl.length; j++) {
          const d = Math.hypot(isl[i].cx - isl[j].cx, isl[i].cz - isl[j].cz);
          assert.ok(d >= isl[i].radius + isl[j].radius, `seed ${seed} sph ${idx}: islands ${i},${j} overlap`);
        }
      }

      // Bounded extents.
      for (const o of isl) assert.ok(Math.hypot(o.cx, o.cz) <= tuning.gen.maxExtent, `seed ${seed} sph ${idx}: unbounded island`);

      // Pod count + spacing.
      assert.equal(sph.pods.length, tuning.pods.perSphere);
      for (let i = 0; i < sph.pods.length; i++) {
        for (let j = i + 1; j < sph.pods.length; j++) {
          const d = Math.hypot(sph.pods[i].x - sph.pods[j].x, sph.pods[i].z - sph.pods[j].z);
          assert.ok(d >= tuning.gen.podSpacingMin - 1e-6, `seed ${seed} sph ${idx}: pods too close`);
        }
      }

      // Kill-plane sits below the lowest island by exactly the margin (all seeds).
      const minTop = isl.reduce((m, o) => Math.min(m, o.topY), Infinity);
      const kp = computeKillPlaneY(isl);
      assert.equal(kp, minTop - tuning.fall.killPlaneMargin, `seed ${seed} sph ${idx}: kill-plane`);
      assert.ok(kp < minTop, 'kill-plane strictly below every island');
    }
  }
});

test('makeValidatedSphere is deterministic (resume recomputes the same valid sphere)', () => {
  const a = makeValidatedSphere(1337, 5);
  const b = makeValidatedSphere(1337, 5);
  assert.deepEqual(a.islands, b.islands);
  assert.deepEqual(a.pods, b.pods);
  assert.equal(a.attempt, b.attempt);
});

test('the pod-collecting bot clears one sphere per seed (deep per-N proof)', () => {
  // One sphere per seed (the teaching sphere) fully bot-cleared — every pod collected,
  // exit reached — via chained real hops.
  for (const seed of SEEDS) {
    const sph = makeValidatedSphere(seed, 0);
    const bot = runCollectBot(sph);
    assert.ok(bot.ok, `seed ${seed}: bot collected ${bot.collected}/${bot.total}, exit=${bot.reachedExit}`);
  }
});

test('validateSphere agrees with makeValidatedSphere on the served layout', () => {
  const sph = makeValidatedSphere(42, 4);
  assert.ok(validateSphere(sph).ok, 'the served sphere re-validates ok');
});

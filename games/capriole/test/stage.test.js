// node --test — the M2 SPHERE STAGE LOOP: pod collection → exit opens → step through to
// advance the sphere; the soft-par hazard ramp; and save round-trip of run progress.
// Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce, advanceSphere, resolveDraft } from '../src/sim/world.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { tuning } from '../src/sim/tuning.js';

// Teleport the player onto a pod (as if walked there) and tick once to collect it.
function walkToPod(world, pod) {
  const p = world.player;
  p.pos.x = pod.x; p.pos.z = pod.z; p.pos.y = pod.y - tuning.pods.heightAboveTop; // stand on the island top
  p.vel.x = p.vel.y = p.vel.z = 0; p.grounded = true;
  stepOnce(world);
}

test('collecting all pods opens the exit portal (with a legibility event)', () => {
  const w = createWorld(1);
  assert.equal(w.pods.length, tuning.pods.perSphere);
  assert.equal(w.exit.open, false, 'exit starts closed');
  for (let i = 0; i < w.pods.length; i++) {
    walkToPod(w, w.pods[i]);
    assert.ok(w.pods[i].collected, `pod ${i} collected on contact`);
    if (i < w.pods.length - 1) assert.equal(w.exit.open, false, 'exit stays closed until the last pod');
  }
  assert.equal(w.podsCollected, tuning.pods.perSphere);
  assert.equal(w.exit.open, true, 'the last pod opens the exit');
});

test('stepping through the open exit opens the draft, then a skip advances the sphere', () => {
  const w = createWorld(7);
  for (const pod of w.pods) walkToPod(w, pod);
  assert.ok(w.exit.open);
  const before = w.sphereIndex;
  const exit = w.exit;
  const p = w.player;
  p.pos.x = exit.x; p.pos.z = exit.z; p.pos.y = exit.y; p.vel.x = p.vel.y = p.vel.z = 0; p.grounded = true;
  stepOnce(w);
  assert.ok(w.sphereClearedThisTick, 'clearing event fired this tick');
  assert.equal(w.phase, 'draft', 'the between-sphere caprice draft opened (M4)');
  assert.equal(w.sphereIndex, before, 'sphere does not advance until the draft resolves');
  // The sim is frozen during the draft (untimed by law): further ticks do nothing.
  const parBefore = w.par.elapsed;
  stepOnce(w);
  assert.equal(w.par.elapsed, parBefore, 'sim frozen while drafting');
  // Skip the draft → advance.
  resolveDraft(w, -1);
  assert.equal(w.phase, 'play', 'play resumes after the draft resolves');
  assert.equal(w.sphereIndex, before + 1, 'advanced one sphere');
  assert.equal(w.podsCollected, 0, 'the new sphere starts with no pods collected');
  assert.equal(w.exit.open, false, 'the new exit is closed');
  assert.equal(w.skipTickets, 1, 'skip banked one ticket');
});

test('clearing the final sphere flags runComplete (victory flow is M4)', () => {
  const w = createWorld(3, tuning.run.spheres - 1); // start on the last sphere
  assert.equal(w.runComplete, false);
  advanceSphere(w);
  assert.equal(w.runComplete, true, 'no sphere past the last — run complete');
  assert.equal(w.sphereIndex, tuning.run.spheres - 1, 'sphere index stays at the last');
});

test('the soft-par hazard ramp climbs past par (the fair starts closing)', () => {
  const w = createWorld(1);
  // Before par: no warning, no ramp.
  w.par.elapsed = tuning.par.baseSpherePar * (tuning.par.warnFrac - 0.1);
  stepOnce(w);
  assert.equal(w.par.warn, false);
  assert.equal(w.par.hazardLevel, 0);
  // Into the warn band but before par: dial pulses, ramp still 0.
  w.par.elapsed = tuning.par.baseSpherePar * 0.9;
  stepOnce(w);
  assert.equal(w.par.warn, true);
  assert.equal(w.par.closing, false);
  assert.equal(w.par.hazardLevel, 0);
  // Halfway through the ramp past par: closing, hazardLevel ≈ 0.5.
  w.par.elapsed = tuning.par.baseSpherePar + tuning.par.rampSec / 2;
  stepOnce(w);
  assert.equal(w.par.closing, true);
  assert.ok(Math.abs(w.par.hazardLevel - 0.5) < 0.05, `hazardLevel ${w.par.hazardLevel} ~ 0.5`);
});

test('save round-trips sphere index, collected pods, and par progress', () => {
  const w = createWorld(1234);
  walkToPod(w, w.pods[0]);
  walkToPod(w, w.pods[2]);
  w.par.elapsed = 33.5;
  const r = deserializeWorld(serializeWorld(w));
  assert.equal(r.sphereIndex, w.sphereIndex);
  assert.equal(r.podsCollected, 2);
  assert.deepEqual(r.pods.map((p) => p.collected), w.pods.map((p) => p.collected));
  assert.ok(Math.abs(r.par.elapsed - 33.5) < 1e-9, 'par elapsed restored');
  assert.equal(r.exit.open, w.exit.open);
});

test('resuming on a later sphere recomputes that sphere deterministically', () => {
  const a = createWorld(42, 5);
  const r = deserializeWorld(serializeWorld(a));
  assert.equal(r.sphereIndex, 5);
  assert.deepEqual(r.islands, a.islands, 'same seed+index → identical archipelago on resume');
});

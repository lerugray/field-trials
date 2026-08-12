// node --test — sim tick determinism + fixed-timestep behavior. No WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, stepOnce, runTicks, FixedStepper, TIMESTEP,
} from '../src/sim/world.js';
import { GRAVITY, MAX_SUBSTEPS } from '../src/sim/tuning.js';

test('a sim tick advances the deterministic clock', () => {
  const w = createWorld(42);
  assert.equal(w.tick, 0);
  stepOnce(w);
  assert.equal(w.tick, 1);
  assert.ok(Math.abs(w.time - TIMESTEP) < 1e-12);
});

test('gravity pulls the player down and the ground catches it', () => {
  const w = createWorld(1);
  const startY = w.player.pos.y;
  stepOnce(w);
  assert.ok(w.player.pos.y < startY, 'player should fall on the first tick');
  // Simulate long enough to certainly hit the ground.
  for (let i = 0; i < 600; i++) stepOnce(w);
  assert.equal(w.player.pos.y, w.groundY, 'player rests on the ground plane');
  assert.equal(w.player.vel.y, 0);
  assert.ok(w.player.grounded);
});

test('the tick is deterministic — same seed + count = identical state', () => {
  const a = runTicks(7, 250);
  const b = runTicks(7, 250);
  assert.deepEqual(a.player, b.player, 'identical player state');
  assert.equal(a.tick, b.tick);
  // A different seed is allowed to differ later, but M0 has no RNG in the tick,
  // so state is seed-independent here — assert the clock at least matches shape.
  const c = runTicks(999, 250);
  assert.equal(a.tick, c.tick);
});

test('FixedStepper clamps catch-up: a huge dt never runs more than MAX_SUBSTEPS ticks', () => {
  const w = createWorld(1);
  const stepper = new FixedStepper();
  const before = w.tick;
  // Pretend 10 seconds elapsed in one frame (tab was hidden).
  stepper.advance(w, 10.0);
  assert.ok(w.tick - before <= MAX_SUBSTEPS, `ran ${w.tick - before} ticks, max ${MAX_SUBSTEPS}`);
});

test('FixedStepper accumulates fractional dt into whole ticks', () => {
  const w = createWorld(1);
  const stepper = new FixedStepper();
  // Feed half a timestep twice → one tick.
  stepper.advance(w, TIMESTEP * 0.5);
  assert.equal(w.tick, 0, 'half a step is not enough to tick');
  stepper.advance(w, TIMESTEP * 0.5);
  assert.equal(w.tick, 1, 'two halves make a whole tick');
});

test('GRAVITY is negative (down) as the sim expects', () => {
  assert.ok(GRAVITY < 0);
});

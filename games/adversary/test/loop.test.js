import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixedStepper, secondsToTicks, ticksToSeconds } from '../src/core/loop.js';

test('loop: exactly one tick per dt', () => {
  const s = createFixedStepper({ hz: 60 });
  let ticks = 0;
  const r = s.advance(1 / 60, () => ticks++);
  assert.equal(r.steps, 1);
  assert.equal(ticks, 1);
  assert.equal(s.tick, 1);
});

test('loop: fractional time accumulates across advances (deterministic)', () => {
  const s = createFixedStepper({ hz: 60 });
  let ticks = 0;
  const step = () => ticks++;
  // Feed 90 sub-frame slices of 1/90s each = 1.0s total → exactly 60 ticks.
  for (let i = 0; i < 90; i++) s.advance(1 / 90, step);
  assert.equal(ticks, 60);
  assert.equal(s.tick, 60);
});

test('loop: a big elapsed runs multiple ticks up to the clamp', () => {
  const s = createFixedStepper({ hz: 60, maxStepsPerAdvance: 8 });
  let ticks = 0;
  const r = s.advance(5 / 60, () => ticks++); // 5 ticks worth, under the clamp
  assert.equal(r.steps, 5);
  assert.equal(ticks, 5);
  assert.equal(r.dropped, false);
});

test('loop: spiral-of-death clamp drops the backlog', () => {
  const s = createFixedStepper({ hz: 60, maxStepsPerAdvance: 4 });
  let ticks = 0;
  const r = s.advance(100 / 60, () => ticks++); // 100 ticks worth, clamp at 4
  assert.equal(r.steps, 4);
  assert.equal(ticks, 4);
  assert.equal(r.dropped, true);
});

test('loop: alpha reflects leftover accumulator', () => {
  const s = createFixedStepper({ hz: 60 });
  const r = s.advance(1.5 / 60, () => {}); // 1 tick + half a tick left over
  assert.equal(r.steps, 1);
  assert.ok(Math.abs(r.alpha - 0.5) < 1e-9);
});

test('loop: stepFn receives dt and tick index', () => {
  const s = createFixedStepper({ hz: 60 });
  const seen = [];
  s.advance(3 / 60, (dt, tick) => seen.push([dt, tick]));
  assert.deepEqual(seen, [[1 / 60, 0], [1 / 60, 1], [1 / 60, 2]]);
});

test('loop: reset returns to a clean deterministic state', () => {
  const s = createFixedStepper({ hz: 60 });
  s.advance(10 / 60, () => {});
  s.reset();
  assert.equal(s.tick, 0);
  let ticks = 0;
  s.advance(1 / 60, () => ticks++);
  assert.equal(ticks, 1);
});

test('loop: seconds<->ticks helpers', () => {
  assert.equal(secondsToTicks(1), 60);
  assert.equal(secondsToTicks(0.5), 30);
  assert.equal(ticksToSeconds(30), 0.5);
});

test('loop: non-positive elapsed runs no ticks', () => {
  const s = createFixedStepper();
  let ticks = 0;
  assert.equal(s.advance(0, () => ticks++).steps, 0);
  assert.equal(s.advance(-1, () => ticks++).steps, 0);
  assert.equal(ticks, 0);
});

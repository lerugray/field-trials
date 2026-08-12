import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHoldAxis } from '../src/input/holdaxis.js';
import { FLIGHT, createFlightState, updateFlight } from '../src/flight/flight.js';

const DT = 1 / 60;

// Drive an axis for `secs` at command `raw`, returning the last value it reported.
function drive(ax, raw, secs) {
  let out = 0;
  for (let i = 0; i < Math.round(secs / DT); i++) out = ax.read(raw, DT);
  return out;
}

test('a fresh axis is centered', () => {
  const ax = createHoldAxis();
  assert.equal(ax.value(), 0);
  assert.equal(ax.read(0, DT), 0);
});

test('while a key is held the raw command passes straight through (no added lag)', () => {
  const ax = createHoldAxis();
  // Every frame of a held key reports full deflection immediately, exactly as the
  // unwrapped keyboard did — the fix must not make steering mushier.
  for (let i = 0; i < 30; i++) assert.equal(ax.read(1, DT), 1);
  for (let i = 0; i < 30; i++) assert.equal(ax.read(-1, DT), -1);
});

test('releasing HOLDS the position instead of commanding a return to center', () => {
  const ax = createHoldAxis();
  drive(ax, 1, 0.5);
  const held = ax.read(0, DT);
  assert.ok(held > 0.9, `expected a held right-of-center command, got ${held}`);
  // and it stays put for as long as nothing is pressed
  assert.equal(drive(ax, 0, 3), held);
});

test('a short tap holds part-way, not all the way (fine positioning survives)', () => {
  const ax = createHoldAxis();
  drive(ax, 1, 0.12);
  const held = ax.read(0, DT);
  assert.ok(held > 0.1 && held < 0.95,
    `a 0.12s tap should hold a partial offset, got ${held}`);
});

test('the opposite direction flips immediately from a held offset', () => {
  const ax = createHoldAxis();
  drive(ax, 1, 0.5);
  ax.read(0, DT);
  assert.equal(ax.read(-1, DT), -1); // first frame of the new press, no ramp-down
});

test('reset() recenters (a new level or retry never inherits the last direction)', () => {
  const ax = createHoldAxis();
  drive(ax, -1, 0.5);
  assert.ok(ax.read(0, DT) < -0.9);
  ax.reset();
  assert.equal(ax.value(), 0);
  assert.equal(ax.read(0, DT), 0);
});

test('raw commands are clamped and a missing dt is survivable (never NaN)', () => {
  const ax = createHoldAxis();
  assert.equal(ax.read(5, DT), 1);
  assert.equal(ax.read(-5, DT), -1);
  ax.read(1, undefined);
  ax.read(1, -1);
  ax.read(1, 99);
  assert.ok(Number.isFinite(ax.read(0, DT)));
});

// The load-bearing property: the value the axis holds on release is the ship's OWN
// normalized offset, so flight.js's easing target lands exactly where the ship already
// is and it simply stops. If these two ever drift apart the ship would visibly creep
// after the keys come up, which is the defect this module exists to remove.
test('the held value tracks the ship\'s real offset, so release freezes it in place', () => {
  for (const holdSecs of [0.08, 0.25, 0.6, 1.5]) {
    const ax = createHoldAxis();
    const st = createFlightState();
    const steps = Math.round(holdSecs / DT);
    for (let i = 0; i < steps; i++) {
      const steerX = ax.read(1, DT);
      updateFlight(st, { steerX, steerY: 0 }, DT);
    }
    const held = ax.read(0, DT);
    const shipNorm = st.offX / FLIGHT.steerRangeX;
    assert.ok(Math.abs(held - shipNorm) < 0.02,
      `held ${held.toFixed(4)} vs ship ${shipNorm.toFixed(4)} after ${holdSecs}s`);

    // ...and with the keys up the ship now drifts a negligible distance, where an
    // un-held axis would have slid all the way home.
    const parked = st.offX;
    for (let i = 0; i < 120; i++) updateFlight(st, { steerX: ax.read(0, DT), steerY: 0 }, DT);
    assert.ok(Math.abs(st.offX - parked) < 0.08,
      `ship drifted ${Math.abs(st.offX - parked).toFixed(4)} after release (hold ${holdSecs}s)`);
  }
});

test('without the hold axis the same input DOES slide the ship home (the old defect)', () => {
  const st = createFlightState();
  for (let i = 0; i < 30; i++) updateFlight(st, { steerX: 1, steerY: 0 }, DT);
  assert.ok(st.offX > 3.0);
  for (let i = 0; i < 120; i++) updateFlight(st, { steerX: 0, steerY: 0 }, DT);
  assert.ok(Math.abs(st.offX) < 0.01, 'raw steer recenters — the reported bug');
});

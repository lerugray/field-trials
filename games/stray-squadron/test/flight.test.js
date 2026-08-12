import { test } from 'node:test';
import assert from 'node:assert/strict';
import { railFrame, railPos } from '../src/flight/rail.js';
import { createFlightState, updateFlight, FLIGHT } from '../src/flight/flight.js';
import { makeRng } from '../src/core/rng.js';

const close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// --- rail --------------------------------------------------------------------

test('rail moves forward down -Z as s grows', () => {
  assert.ok(railPos(100)[2] < railPos(0)[2]);
  assert.ok(close(railPos(0)[2], 0)); // -0 at s=0; Object.is(-0,0) is false, so use tolerance
});

test('rail frame is orthonormal everywhere sampled', () => {
  for (let s = 0; s < 500; s += 7.3) {
    const { forward, right, up } = railFrame(s);
    const len = (v) => Math.hypot(v[0], v[1], v[2]);
    assert.ok(close(len(forward), 1), `forward not unit @${s}`);
    assert.ok(close(len(right), 1), `right not unit @${s}`);
    assert.ok(close(len(up), 1), `up not unit @${s}`);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    assert.ok(close(dot(forward, right), 0), `f·r @${s}`);
    assert.ok(close(dot(forward, up), 0), `f·u @${s}`);
    assert.ok(close(dot(right, up), 0), `r·u @${s}`);
  }
});

// --- flight update -----------------------------------------------------------

const neutral = { steerX: 0, steerY: 0, boost: false, brake: false };

test('distance along the rail is strictly increasing while moving', () => {
  const st = createFlightState();
  let prev = st.s;
  for (let i = 0; i < 300; i++) {
    updateFlight(st, neutral, 1 / 60);
    assert.ok(st.s > prev, 'rail distance went backward');
    prev = st.s;
  }
});

test('cruise speed converges to baseSpeed from rest', () => {
  const st = createFlightState();
  st.speed = 0;
  for (let i = 0; i < 600; i++) updateFlight(st, neutral, 1 / 60);
  assert.ok(close(st.speed, FLIGHT.baseSpeed, 0.05), `speed=${st.speed}`);
});

test('speed stays within the brake..boost envelope under any input', () => {
  const rng = makeRng('flight-fuzz');
  const st = createFlightState();
  for (let i = 0; i < 5000; i++) {
    const input = {
      steerX: rng.range(-1, 1),
      steerY: rng.range(-1, 1),
      boost: rng.chance(0.3),
      brake: rng.chance(0.3),
    };
    updateFlight(st, input, rng.range(0.001, 0.05));
    assert.ok(st.speed >= FLIGHT.brakeSpeed - 0.5 && st.speed <= FLIGHT.boostSpeed + 0.5,
      `speed out of envelope: ${st.speed}`);
  }
});

test('meter is always clamped to [0,1] and boost eventually empties it', () => {
  const st = createFlightState();
  // Hold boost hard: meter must drain to 0 and never go negative.
  for (let i = 0; i < 1000; i++) {
    updateFlight(st, { ...neutral, boost: true }, 1 / 60);
    assert.ok(st.meter >= 0 && st.meter <= 1, `meter=${st.meter}`);
  }
  assert.ok(close(st.meter, 0, 1e-9), `boost did not empty meter: ${st.meter}`);
});

test('meter recharges toward full when neither boosting nor braking', () => {
  const st = createFlightState();
  st.meter = 0;
  for (let i = 0; i < 600; i++) updateFlight(st, neutral, 1 / 60);
  assert.ok(close(st.meter, 1, 1e-6), `meter=${st.meter}`);
});

test('ship offset stays inside the steer frame under extreme + random input', () => {
  const rng = makeRng('offset-fuzz');
  const st = createFlightState();
  for (let i = 0; i < 5000; i++) {
    updateFlight(st, {
      steerX: rng.range(-2, 2), // deliberately over-range to test the clamp
      steerY: rng.range(-2, 2),
      boost: false, brake: false,
    }, rng.range(0.001, 0.05));
    assert.ok(Math.abs(st.offX) <= FLIGHT.steerRangeX + 1e-9, `offX=${st.offX}`);
    assert.ok(Math.abs(st.offY) <= FLIGHT.steerRangeY + 1e-9, `offY=${st.offY}`);
    assert.ok(Math.abs(st.roll) <= FLIGHT.maxRoll + 1e-9, `roll=${st.roll}`);
    assert.ok(Math.abs(st.pitch) <= FLIGHT.maxPitch + 1e-9, `pitch=${st.pitch}`);
  }
});

test('full-right steer banks left-negative roll and slides ship right (+offX)', () => {
  const st = createFlightState();
  for (let i = 0; i < 120; i++) updateFlight(st, { steerX: 1, steerY: 0, boost: false, brake: false }, 1 / 60);
  assert.ok(st.offX > 3.0, `offX=${st.offX}`);
  assert.ok(st.roll < -0.5, `roll=${st.roll}`); // banks into the turn
});

test('variable-dt: one big step and many small steps reach a close distance', () => {
  // Exponential easing makes speed dt-stable; integrated distance should match
  // closely between coarse and fine stepping over the same wall-clock.
  const total = 2.0; // seconds
  const coarse = createFlightState();
  updateFlight(coarse, neutral, total); // single clamped step (dt clamps to 0.1)
  // The clamp means one call only advances 0.1s; do the honest comparison with
  // matched wall-clock instead:
  const fine = createFlightState();
  let tacc = 0;
  while (tacc < total - 1e-9) { updateFlight(fine, neutral, 1 / 240); tacc += 1 / 240; }
  const medium = createFlightState();
  tacc = 0;
  while (tacc < total - 1e-9) { updateFlight(medium, neutral, 1 / 30); tacc += 1 / 30; }
  // fine vs medium stepping of the same neutral cruise: distances within 1%.
  assert.ok(Math.abs(fine.s - medium.s) / fine.s < 0.01, `fine=${fine.s} medium=${medium.s}`);
});

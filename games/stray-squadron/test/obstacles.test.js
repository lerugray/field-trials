import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObstacleCourse, obstacleHit, OBSTACLE } from '../src/flight/obstacles.js';
import { FLIGHT } from '../src/flight/flight.js';

test('same seed builds the identical course', () => {
  const a = createObstacleCourse('run-9', 34, 400);
  const b = createObstacleCourse('run-9', 34, 400);
  assert.deepEqual(a, b);
});

test('different seeds differ', () => {
  const a = createObstacleCourse('run-9', 34, 400);
  const b = createObstacleCourse('run-10', 34, 400);
  assert.notDeepEqual(a, b);
});

test('obstacles respect the minimum along-rail gap (never a wall)', () => {
  const c = createObstacleCourse('spacing', 34, 2000);
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i].s - c[i - 1].s >= OBSTACLE.minGapS - 1e-9,
      `gap too small at ${i}: ${c[i].s - c[i - 1].s}`);
  }
});

test('every obstacle is dodgeable: a reachable steer offset clears it', () => {
  const c = createObstacleCourse('fair', 34, 2000);
  for (const o of c) {
    // Search the reachable steer box for at least one clear offset.
    let clear = false;
    for (let ox = -FLIGHT.steerRangeX; ox <= FLIGHT.steerRangeX && !clear; ox += 0.2) {
      for (let oy = -FLIGHT.steerRangeY; oy <= FLIGHT.steerRangeY; oy += 0.2) {
        if (!obstacleHit([o], o.s, ox, oy)) { clear = true; break; }
      }
    }
    assert.ok(clear, `obstacle at s=${o.s} lat=${o.lat} not dodgeable`);
  }
});

test('collision query hits dead-center and misses when steered away', () => {
  const o = { s: 100, lat: 0, vert: 0, radius: 1.2 };
  // ship at the same station, centered -> hit
  assert.ok(obstacleHit([o], 100, 0, 0));
  // steered to the edge of the frame -> clear
  assert.equal(obstacleHit([o], 100, FLIGHT.steerRangeX, 0), null);
  // far along the rail -> clear regardless of offset
  assert.equal(obstacleHit([o], 130, 0, 0), null);
});

test('lateral/vertical placement stays inside the steer frame', () => {
  const c = createObstacleCourse('bounds', 34, 2000);
  for (const o of c) {
    assert.ok(Math.abs(o.lat) <= OBSTACLE.latRange + 1e-9);
    assert.ok(Math.abs(o.vert) <= OBSTACLE.vertRange + 1e-9);
    assert.ok(o.radius >= OBSTACLE.radiusMin && o.radius <= OBSTACLE.radiusMax);
  }
});

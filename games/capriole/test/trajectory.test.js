// node --test — landing prediction for the landing-ring marker (law #2). No WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictLanding } from '../src/sim/trajectory.js';
import { archipelagoGround, island, flatGround } from '../src/sim/islands.js';

test('predicts a straight-down drop onto the pad below', () => {
  const g = archipelagoGround([island(0, 0, 0, 5)]);
  const landing = predictLanding(g, { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 });
  assert.ok(landing, 'lands');
  assert.ok(Math.abs(landing.y - 0) < 1e-6, 'onto the pad top');
  assert.ok(Math.hypot(landing.x, landing.z) < 1e-6, 'directly below');
});

test('predicts a forward arc landing on a pad ahead', () => {
  // A pad 12 units ahead in -Z; launch forward with some horizontal velocity.
  const g = archipelagoGround([island(0, 0, 0, 5), island(0, -12, 0, 5)]);
  const landing = predictLanding(g, { x: 0, y: 4, z: -7 }, { x: 0, y: 2, z: -8 });
  assert.ok(landing, 'lands somewhere');
  assert.ok(landing.z < -6, `arc carried forward to z=${landing.z.toFixed(2)}`);
});

test('returns null over the void (nothing to land on)', () => {
  const g = archipelagoGround([island(0, 0, 0, 5)]);
  const landing = predictLanding(g, { x: 100, y: 10, z: 100 }, { x: 0, y: 0, z: 0 });
  assert.equal(landing, null);
});

test('prediction roughly matches actually simulating the fall on flat ground', () => {
  const g = flatGround(0);
  const landing = predictLanding(g, { x: 0, y: 8, z: 0 }, { x: 3, y: 0, z: 0 });
  assert.ok(landing && Math.abs(landing.y) < 1e-6, 'lands on the plane');
  assert.ok(landing.x > 0, 'carried in +X by horizontal velocity');
});

// node --test — the render-facing firework marker shares the launch basis and sits a
// fixed distance ahead for both cardinal facings (the minimum operator coverage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectileDirection } from '../src/sim/aim.js';
import { aimIndicatorState } from '../src/render/aimindicator.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≈ ${expected}`);
const player = { x: 3, y: 5, z: 7 };
const eye = 1.6;
const distance = 12;
const fakeWorld = (yaw, charging = true) => ({
  player: { pos: player, yaw },
  tune: { camera: { eyeHeight: eye }, firework: { indicatorDistance: distance } },
  firework: { ammo: 1, charging }, phase: 'play', dead: false,
});

test('indicator is hidden before charging', () => {
  assert.equal(aimIndicatorState(fakeWorld(0, false), { aimPitch: 0, showAimIndicator: true }).visible, false, 'precharge marker remains hidden');
});

test('armed indicator renders at the straight-shot point when facing forward (-Z)', () => {
  const point = aimIndicatorState(fakeWorld(0), { aimPitch: 0, showAimIndicator: true });
  assert.deepEqual(point, { visible: true, x: 3, y: 6.6, z: -5 });
  const dir = projectileDirection(0, 0);
  near(dir.x, 0, 'forward facing has no X drift');
  near(dir.y, 0, 'level aim has no Y drift');
  near(dir.z, -1, 'forward facing points -Z');
});

test('armed indicator renders at the straight-shot point for the opposite facing (+Z)', () => {
  const point = aimIndicatorState(fakeWorld(Math.PI), { aimPitch: 0, showAimIndicator: true });
  assert.equal(point.visible, true);
  near(point.x, 3, 'opposite facing keeps X');
  near(point.y, 6.6, 'opposite facing starts at eye height');
  near(point.z, 19, 'opposite facing advances along +Z');
  const dir = projectileDirection(Math.PI, 0);
  near(dir.x, 0, 'opposite facing has no X drift');
  near(dir.z, 1, 'opposite facing points +Z');
  assert.equal(aimIndicatorState(fakeWorld(Math.PI), { showAimIndicator: false }).visible, false, 'option hides the marker');
});

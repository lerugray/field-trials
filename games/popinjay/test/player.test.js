// player.test.js — the walker's verbs (DESIGN-SEED §The player; law #4: NO JUMP).
// Pure sim, no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Player, STAND, CLIMB } from '../src/sim/player.js';
import { authoredStageM1 } from '../src/sim/stage.js';
import { PLAYER, TICK_HZ } from '../src/tuning.js';

function groundTop(stage) { return stage.solids.find((s) => s.id === 'ground').top; }

test('a spawned player settles onto the surface below (feet on the ground)', () => {
  const stage = authoredStageM1();
  const p = new Player({ x: 760, feetY: 100, stage }); // open column (gap to the ground)
  assert.equal(p.feetY, groundTop(stage));
  assert.equal(p.state, STAND);
  assert.equal(p.vy, 0);
});

test('walking moves at walkSpeed and clamps to the side walls', () => {
  const stage = authoredStageM1();
  const p = new Player({ x: 640, feetY: 100, stage });
  const x0 = p.x;
  p.step({ right: true }, stage);
  assert.ok(Math.abs((p.x - x0) - PLAYER.walkSpeed / TICK_HZ) < 1e-9, 'one tick = walkSpeed*DT');
  assert.equal(p.facing, 1);
  // Walk hard into the right wall — clamps to right - halfW.
  for (let t = 0; t < TICK_HZ * 20; t++) p.step({ right: true }, stage);
  assert.ok(Math.abs(p.x - (stage.bounds.right - p.halfW)) < 1e-6);
});

test('NO JUMP: pressing up on open ground never lifts the player (law #4)', () => {
  const stage = authoredStageM1();
  const p = new Player({ x: 760, feetY: 100, stage }); // open column, NOT under a ladder
  const y0 = p.feetY;
  for (let t = 0; t < TICK_HZ; t++) p.step({ up: true }, stage);
  assert.equal(p.feetY, y0, 'up must do nothing without a ladder');
  assert.equal(p.state, STAND);
});

test('walking off a ledge falls and lands on the surface below', () => {
  const stage = authoredStageM1();
  const lo = stage.solids.find((s) => s.id === 'plat-lo');
  // Start standing on the low platform, near its right edge.
  const p = new Player({ x: lo.x1 - 10, feetY: lo.top, stage });
  assert.equal(p.feetY, lo.top);
  // Walk right off the edge; gravity takes over; land on the ground below.
  for (let t = 0; t < TICK_HZ * 3; t++) p.step({ right: true }, stage);
  assert.equal(p.feetY, groundTop(stage), 'should have fallen to the ground');
  assert.equal(p.vy, 0);
});

test('climbing a ladder up dismounts onto the top surface; down returns to ground', () => {
  const stage = authoredStageM1();
  const lad = stage.ladders[0];
  const gTop = groundTop(stage);
  // Stand at the ladder base, press up to mount and climb.
  const p = new Player({ x: (lad.x0 + lad.x1) / 2, feetY: gTop, stage });
  p.step({ up: true }, stage);
  assert.equal(p.state, CLIMB, 'pressing up at a ladder mounts it');
  // Keep climbing until we reach and dismount at the top.
  for (let t = 0; t < TICK_HZ * 5 && p.state === CLIMB; t++) p.step({ up: true }, stage);
  assert.equal(p.state, STAND);
  assert.equal(p.feetY, lad.top, 'dismounts standing on the ladder-top surface');
  // Now climb back down.
  p.step({ down: true }, stage);
  assert.equal(p.state, CLIMB);
  for (let t = 0; t < TICK_HZ * 5 && p.state === CLIMB; t++) p.step({ down: true }, stage);
  assert.equal(p.state, STAND);
  assert.equal(p.feetY, lad.bottom, 'reaches the ground at the ladder base');
});

test('the muzzle rides at the head line (feetY - height) for the wire to fire from', () => {
  const stage = authoredStageM1();
  const p = new Player({ x: 640, feetY: 100, stage });
  assert.equal(p.muzzleY, p.feetY - PLAYER.height);
});

test('player state serializes and restores against the stage', () => {
  const stage = authoredStageM1();
  const lad = stage.ladders[0];
  const p = new Player({ x: (lad.x0 + lad.x1) / 2, feetY: groundTop(stage), stage });
  p.step({ up: true }, stage);
  for (let t = 0; t < 10; t++) p.step({ up: true }, stage);
  const snap = JSON.parse(JSON.stringify(p.serialize()));
  const p2 = new Player({ x: 0, feetY: 0, stage }).restore(snap, stage);
  assert.deepEqual(p2.serialize(), snap);
  assert.equal(p2.state, CLIMB);
  assert.equal(p2.ladder.id, lad.id);
});

// stage.test.js — the shared geometry queries the player, balloons, and wire depend
// on (STUDY §2.2 under-platform stop is LAW). Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Stage, authoredStageM1 } from '../src/sim/stage.js';

test('floorBelow returns the nearest surface top at or below a point', () => {
  const s = authoredStageM1();
  const groundTop = s.solids.find((z) => z.id === 'ground').top;
  // Over open ground the nearest floor is the ground.
  assert.equal(s.floorBelow(60, 100).solid.id, 'ground');
  // Standing just above the low platform, that platform is the nearest floor.
  const lo = s.solids.find((z) => z.id === 'plat-lo');
  assert.equal(s.floorBelow(300, lo.top - 5).solid.id, 'plat-lo');
  // Below the low platform's top, the platform no longer counts — ground does.
  assert.equal(s.floorBelow(300, lo.top + 5).solid.id, 'ground');
  assert.equal(s.floorBelow(300, lo.top + 5).y, groundTop);
});

test('ceilingAbove returns the nearest underside above a point (the wire-stop LAW)', () => {
  const s = authoredStageM1();
  const lo = s.solids.find((z) => z.id === 'plat-lo');
  // A muzzle under the low platform stops at that platform's underside (its bottom).
  const c = s.ceilingAbove(300, 700);
  assert.equal(c.solid.id, 'plat-lo');
  assert.equal(c.y, lo.bottom);
  // In an open column, the wire runs to the stage ceiling (no solid).
  const open = s.ceilingAbove(60, 700);
  assert.equal(open.solid, null);
  assert.equal(open.y, s.bounds.top);
});

test('breaking a breakable removes it from geometry (gone for the stage)', () => {
  const s = authoredStageM1();
  const brk = s.solids.find((z) => z.id === 'brk-1');
  // Before: a muzzle under the breakable stops at its underside.
  assert.equal(s.ceilingAbove(640, 700).solid.id, 'brk-1');
  assert.equal(s.break(brk), true);
  assert.equal(s.break(brk), false, 'breaking again is a no-op');
  // After: that column is open to the ceiling.
  assert.equal(s.ceilingAbove(640, 700).solid, null);
});

test('stage break state serializes and restores', () => {
  const s = authoredStageM1();
  s.break('brk-1');
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = authoredStageM1().restore(snap);
  assert.equal(s2.solids.find((z) => z.id === 'brk-1').intact, false);
  assert.equal(s2.ceilingAbove(640, 700).solid, null);
});

test('ladderAt detects the authored ladder column', () => {
  const s = authoredStageM1();
  const lad = s.ladders[0];
  assert.ok(s.ladderAt(216, (lad.top + lad.bottom) / 2));
  assert.equal(s.ladderAt(600, 600), null);
});

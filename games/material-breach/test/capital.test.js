// Capital and consequences (M5): damage and repair, the detention -> conversion pipeline, and the
// closing score (tenure + solvency, Ray-ratified).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CONFIG, activeStaff, scoreOf } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueRepair } from '../src/actions.js';

test('a repair works order restores Cornerstone condition after its lead time', () => {
  const f = createFacility({ seed: 'repair' });
  f.lossObject.condition = 40;
  const gold0 = f.treasury.gold;
  const res = queueRepair(f);
  assert.equal(res.ok, true);
  assert.equal(f.treasury.gold, gold0 - CONFIG.orders.repair.cost);
  const g = commitCycle(f); // cycle 1 is the scripted survivable raid: no new damage
  assert.equal(g.lossObject.condition, 40 + CONFIG.orders.repair.restore);
});

test('repair is refused when the Cornerstone is already at full condition', () => {
  const f = createFacility({ seed: 'repair-full' });
  assert.equal(f.lossObject.condition, 100);
  assert.equal(queueRepair(f).ok, false);
});

test('a held captive converts into working staff over cycles (KEEP #9)', () => {
  const f = createFacility({ seed: 'convert' });
  f.staff = f.staff.slice(0, 2); // free up beds under the base housing
  f.captives = [{ id: 'cap-1', cyclesToConvert: 1 }];
  const crew0 = activeStaff(f).length;
  const g = commitCycle(f);
  assert.equal(g.captives.length, 0, 'the captive did not convert');
  assert.equal(activeStaff(g).length, crew0 + 1, 'the converted captive did not join the crew');
  assert.ok(g.lastReport.lines.some((l) => l.kind === 'conversion'));
});

test('the closing score is recorded at termination: tenure plus solvency', () => {
  let f = createFacility({ seed: 'score' });
  let guard = 0;
  while (f.status === 'active' && guard++ < 30) f = commitCycle(f);
  assert.notEqual(f.status, 'active');
  assert.equal(typeof f.score, 'number');
  assert.equal(f.score, scoreOf(f));
  assert.ok(f.lastReport.lines.some((l) => l.kind === 'score'), 'no closing score line filed');
});

// The dungeon grid (M2), in the game's vocabulary: cells are CARVED out of rock next to claimed
// ground, claimed territory spreads a ring at a time, and a worked gold seam pays receipts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CONFIG, CELL, countClaimed } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueExcavate } from '../src/actions.js';
import { canExcavate, spreadClaim, countClaimedGold, countExcavated } from '../src/grid.js';

// A cell orthogonally adjacent to the founding footprint (which is claimed at founding).
function edgeCell(f) {
  const { x, y } = f.lossObject.cell;
  return { x: x + 2, y }; // one step beyond the claimed footprint's right edge
}

test('a cell can only be excavated if it touches claimed ground (carved, not placed)', () => {
  const f = createFacility({ seed: 'carve' });
  const { x, y } = f.lossObject.cell;
  // Immediately right of the footprint edge is adjacent to a claimed cell.
  assert.equal(canExcavate(f, x + 2, y), true);
  // A far corner touches no claimed ground.
  assert.equal(canExcavate(f, 0, 0), false);
  // The Cornerstone cell itself is already excavated.
  assert.equal(canExcavate(f, x, y), false);
});

test('an excavate order spends its cost, completes after lead, and carves the cell', () => {
  let f = createFacility({ seed: 'carve2' });
  const target = edgeCell(f);
  const gold0 = f.treasury.gold;
  const res = queueExcavate(f, target.x, target.y);
  assert.equal(res.ok, true);
  assert.equal(f.treasury.gold, gold0 - CONFIG.orders.excavate.cost);
  const excavatedBefore = countExcavated(f);
  f = commitCycle(f); // lead 1: completes
  assert.equal(countExcavated(f), excavatedBefore + 1);
  const c = f.grid[target.y][target.x];
  assert.equal(c.excavated, true);
  assert.equal(c.surveyed, true);
});

test('excavation is refused off claimed ground, when duplicated, and when unaffordable', () => {
  const f = createFacility({ seed: 'carve3' });
  assert.equal(queueExcavate(f, 0, 0).ok, false); // not adjacent to claimed
  const target = edgeCell(f);
  assert.equal(queueExcavate(f, target.x, target.y).ok, true);
  assert.equal(queueExcavate(f, target.x, target.y).ok, false); // duplicate
  f.treasury.gold = 0;
  const far = { x: f.lossObject.cell.x, y: f.lossObject.cell.y + 2 };
  assert.equal(queueExcavate(f, far.x, far.y).ok, false); // unaffordable
});

test('claimed territory spreads one ring per cycle into carved floor (KEEP #7)', () => {
  let f = createFacility({ seed: 'spread' });
  const claimed0 = countClaimed(f);
  const t = edgeCell(f);
  queueExcavate(f, t.x, t.y);
  f = commitCycle(f); // carve it; claim spreads into it the same commit (it touches claimed)
  assert.ok(countClaimed(f) > claimed0, 'claim did not spread into the carved cell');
});

test('a worked gold seam pays receipts and lapses the founding stipend (fold 11)', () => {
  const f = createFacility({ seed: 'gold' });
  // Plant a gold seam just off the footprint edge and carve it.
  const { x, y } = f.lossObject.cell;
  const gx = x + 2;
  f.grid[y][gx].kind = CELL.GOLD;
  queueExcavate(f, gx, y);
  const f1 = commitCycle(f); // carve + claim the seam
  assert.equal(countClaimedGold(f1) >= 1, true);
  const goldBefore = f1.treasury.gold;
  const f2 = commitCycle(f1); // now income comes from the seam, not the stipend
  const incomeLine = f2.lastReport.lines.find((l) => l.kind === 'income');
  assert.match(incomeLine.numeric, /gold receipts/);
  assert.ok(f2.treasury.gold > goldBefore - 60, 'seam income did not register');
});

test('spreadClaim claims nothing when there is no carved-but-unclaimed floor', () => {
  const f = createFacility({ seed: 'noop' });
  assert.equal(spreadClaim(f), 0);
});

// The raid resolver (M4): a party with an objective approaches the Cornerstone along a path, the
// engagement auto-resolves deterministically, and a step-log makes it watchable. The intel memo
// previews the coming raid vaguely (fold 2), and the preview matches what actually resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { intelMemo, planRaid } from '../src/raid.js';
import { createRng } from '../src/rng.js';

test('a resolved raid attaches a party, an approach path, and a step-log', () => {
  const f = commitCycle(createFacility({ seed: 'raid-m4' }));
  const raid = f.lastRaid;
  assert.ok(raid, 'no lastRaid attached');
  assert.equal(typeof raid.party.size, 'number');
  assert.equal(raid.party.objective, 'loot');
  assert.equal(raid.party.credentials, false); // credentialed officers arrive at M5
  assert.ok(raid.path.length > 1, 'the approach path is empty');
  assert.ok(raid.steps.length === raid.path.length, 'the step-log does not cover the path');
});

test('the approach path starts at an edge and ends at the Cornerstone', () => {
  const f = commitCycle(createFacility({ seed: 'path', cols: 20, rows: 14 }));
  const raid = f.lastRaid;
  const start = raid.path[0];
  const end = raid.path[raid.path.length - 1];
  const onEdge = start.x === 0 || start.y === 0 || start.x === 19 || start.y === 13;
  assert.ok(onEdge, `entry ${JSON.stringify(start)} is not on the section edge`);
  assert.deepEqual(end, f.lossObject.cell);
});

test('when the party breaks through, the step-log shows it attriting toward the core', () => {
  // Undefended facility late enough that the party reaches the core.
  let f = createFacility({ seed: 'attrit' });
  for (let i = 0; i < 4 && f.status === 'active'; i++) f = commitCycle(f);
  const raid = f.lastRaid;
  if (raid.reachedCore) {
    assert.equal(raid.steps[raid.steps.length - 1].event, 'reached');
    assert.ok(raid.steps[0].strength >= raid.steps[raid.steps.length - 1].strength, 'party did not attrit');
  }
});

test('raid outcome varies with the seed (raid-variance, fold 16)', () => {
  const sizes = new Set();
  const entries = new Set();
  for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
    const rng = createRng(`${seed}:cycle:3`);
    const f = createFacility({ seed });
    const plan = planRaid(f, rng, 3);
    sizes.add(plan.size);
    entries.add(`${plan.entry.x},${plan.entry.y}`);
  }
  assert.ok(sizes.size > 1 || entries.size > 1, 'the party was identical across every seed');
});

test('the intel memo previews the coming raid vaguely, and its range brackets the real party', () => {
  const f = createFacility({ seed: 'intel' });
  const memo = intelMemo(f);
  assert.match(memo.line, /size estimated \d+ to \d+/i);
  assert.ok(memo.estimateHigh > memo.estimateLow, 'the estimate is not a range');
  // The memo previews the SAME raid the sign-over resolves.
  const after = commitCycle(f);
  const actual = after.lastRaid.party.size;
  assert.ok(actual >= memo.estimateLow && actual <= memo.estimateHigh, `actual ${actual} outside memo range`);
});

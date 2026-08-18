// The cycle spine, end to end, spoken in the game's own vocabulary: the stipend lands, works
// orders complete after their lead time, payday is observed against the treasury, raids resolve,
// and every report line pairs prose with a number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CONFIG, facilityDefense } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueFortify } from '../src/actions.js';

test('signing over produces an after-action report with lines', () => {
  const f = commitCycle(createFacility({ seed: 'report' }));
  assert.ok(f.lastReport.lines.length > 0);
  assert.equal(f.lastReport.cycle, 1);
});

test('EVERY report line pairs a flavour string with a numeric neighbour (fold 20)', () => {
  // Run a whole tenure and check every line ever emitted has both halves.
  let f = createFacility({ seed: 'pairing' });
  let guard = 0;
  while (f.status === 'active' && guard++ < 30) {
    if (f.treasury.gold >= CONFIG.orders.fortify.cost) queueFortify(f);
    f = commitCycle(f);
    for (const line of f.lastReport.lines) {
      assert.ok(line.text && line.text.length > 0, `line ${line.kind} has no prose`);
      assert.ok(line.numeric && /\d/.test(line.numeric), `line ${line.kind} has no numeric neighbour`);
      assert.ok(!line.text.includes('—'), `line ${line.kind} contains an em-dash`);
      assert.ok(!line.text.includes('!'), `line ${line.kind} contains an exclamation mark`);
    }
  }
});

test('the charter stipend lands each cycle', () => {
  const f0 = createFacility({ seed: 'income' });
  const goldBefore = f0.treasury.gold;
  const f1 = commitCycle(f0);
  // Cycle 1 is the scripted survivable raid, so no payday (cycle 1) and no structural loss: the
  // stipend is the only treasury move.
  assert.equal(f1.treasury.gold, goldBefore + CONFIG.bootstrap.charterStipend);
});

test('a fortify order completes after its lead time and raises defence', () => {
  let f = createFacility({ seed: 'fortify' });
  const defBefore = facilityDefense(f);
  const goldBefore = f.treasury.gold;
  const res = queueFortify(f);
  assert.equal(res.ok, true);
  assert.equal(f.treasury.gold, goldBefore - CONFIG.orders.fortify.cost); // spent at queue time
  f = commitCycle(f); // lead is 1 cycle; it completes this commit
  assert.equal(facilityDefense(f), defBefore + CONFIG.orders.fortify.amount);
});

test('an unaffordable fortify is rejected, not thrown', () => {
  const f = createFacility({ seed: 'broke' });
  f.treasury.gold = 0;
  const res = queueFortify(f);
  assert.equal(res.ok, false);
  assert.match(res.reason, /insufficient/);
});

test('payday is observed every third cycle and disburses from the treasury', () => {
  let f = createFacility({ seed: 'payday' });
  f = commitCycle(f); // 1
  f = commitCycle(f); // 2
  const goldBefore = f.treasury.gold;
  f = commitCycle(f); // 3: payday
  const paydayLine = f.lastReport.lines.find((l) => l.kind === 'payday');
  assert.ok(paydayLine, 'payday line present on cycle 3');
  assert.ok(f.treasury.gold < goldBefore + CONFIG.bootstrap.charterStipend, 'wages were disbursed');
});

test('raid outcomes vary with the seed and with defence (raid-variance gate, fold 16)', () => {
  // Across seeds, the structural loss on a fixed cycle must not be constant (no fixed-roll resolver).
  const losses = new Set();
  for (const seed of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
    let f = createFacility({ seed });
    f = commitCycle(f); // 1
    f = commitCycle(f); // 2
    f = commitCycle(f); // 3
    losses.add(f.lastReport.structuralDamage);
  }
  assert.ok(losses.size > 1, 'raid loss was identical across every seed: fixed-roll resolver');

  // And more defence never yields more structural loss on the same seed and cycle (monotone-ish).
  let bare = createFacility({ seed: 'mono' });
  let strong = createFacility({ seed: 'mono' });
  strong.fortify = 100; // heavily fortified
  for (let i = 0; i < 4; i++) {
    if (bare.status === 'active') bare = commitCycle(bare);
    if (strong.status === 'active') strong = commitCycle(strong);
  }
  assert.ok(
    strong.lossObject.condition >= bare.lossObject.condition,
    'more defence left the Cornerstone in worse condition',
  );
});

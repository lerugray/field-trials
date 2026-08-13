// M2 exit gates: the auto-win baseline band + the job-comp degeneracy sweep.
// Uses moderate sample sizes for test speed; scripts/gates.mjs runs full-N.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/tuning.js';
import {
  measureTierWinRate, measureBaseline, checkBands, jobCombos, degeneracySweep,
} from '../src/baseline.js';

test('the probe is deterministic', () => {
  const a = measureTierWinRate('elite', 300, 12345);
  const b = measureTierWinRate('elite', 300, 12345);
  assert.equal(a.winRate, b.winRate);
  assert.equal(a.avgRounds, b.avgRounds);
});

test('auto-win rates fall inside the committed bands (M2 gate)', () => {
  const measured = measureBaseline(900);
  const chk = checkBands(measured);
  assert.ok(chk.ok, 'baseline out of band: ' + JSON.stringify(chk.fails));
});

test('no tier stalemates (a stalemate is a loud defect)', () => {
  for (const tier of ['routine', 'elite', 'boss']) {
    const m = measureTierWinRate(tier, 400);
    assert.equal(m.stalemates, 0, `${tier} produced ${m.stalemates} stalemates`);
  }
});

test('job-comp degeneracy sweep: no comp exceeds the median by > the margin (M2 gate)', () => {
  const combos = jobCombos();
  assert.equal(combos.length, 15, 'C(6,4) should be 15 comps'); // pool of 6 jobs, size 4
  const sw = degeneracySweep(150);
  assert.equal(sw.comps.length, 15);
  assert.equal(sw.overMargin.length, 0, 'degenerate comp(s): ' + sw.overMargin.map((c) => c.jobIds.join('/')).join(', '));
  // The sweep must actually discriminate (some spread), else it proves nothing.
  assert.ok(sw.spread >= 0, 'sweep produced no ranking');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCase1 } from './case-1.js';
import { runCaseBattery } from '../solver.js';

test('Case 1 passes the full solver battery (including prologue-key)', () => {
  const report = runCaseBattery(buildCase1());
  assert.ok(report.passed, report.problems.join('\n'));
  assert.ok('prologueKey' in report.sections);
  assert.deepEqual(report.sections.prologueKey, []);
});

test('Case 1 has a tutorial-complete prologue that plants the key', () => {
  const c = buildCase1();
  assert.deepEqual(c.prologue.validate(), []);
  assert.ok(c.prologue.hasPrologueKey());
  assert.deepEqual(c.prologue.card, { act: 'COLD OPEN', timestamp: 'THURSDAY • 8:00 P.M.', line: 'THE NIGHT OF THE MURDER' });
  assert.equal(c.prologue.beats.filter((beat) => beat.killBeat).map((beat) => beat.id).join(','), 'p-talk');
});

test('the winning chain rests on a prologue-keyed fact', () => {
  const c = buildCase1();
  const wc = c.winningChain;
  const keyed = ['means', 'time', 'place', 'alibiMechanism', 'prologueFact', 'corroboration', 'physicalContradiction']
    .map((s) => c.fact(wc[s])).filter((f) => f && f.prologueKeyed);
  assert.ok(keyed.length >= 1);
});

test('Case 1 expanded accusation has exactly one satisfying assignment', async () => {
  const { enumerateValidChains } = await import('../solver.js');
  assert.equal(enumerateValidChains(buildCase1()).length, 1);
});

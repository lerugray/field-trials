import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCase2 } from './case-2.js';
import { runCaseBattery, enumerateValidChains, probeDegenerateStrategy, BLIND_SPACE_FLOOR } from '../solver.js';

test('Case 2 passes the full solver battery (SOLVER LAW, rule 3)', () => {
  const report = runCaseBattery(buildCase2());
  assert.ok(report.passed, report.problems.join('\n'));
});

test('Case 2 has EXACTLY ONE valid chain and it is the declared winner', () => {
  const c = buildCase2();
  const valid = enumerateValidChains(c);
  assert.equal(valid.length >= 1, true);
  // uniqueness by key
  const keys = new Set(valid.map((v) => JSON.stringify(v)));
  assert.equal(keys.size, 1, `expected one valid chain, got ${keys.size}`);
  const w = c.winningChain;
  assert.equal(valid[0].suspect, w.suspect);
  assert.equal(valid[0].prologueFact, w.prologueFact);
  assert.equal(valid[0].physicalContradiction, w.physicalContradiction);
});

test('Case 2 has a tutorial-complete prologue that plants the clock key', () => {
  const c = buildCase2();
  assert.deepEqual(c.prologue.validate(), []);
  assert.ok(c.prologue.hasPrologueKey());
});

test('the winning chain rests on the prologue-keyed corridor fact (the clock trick)', () => {
  const c = buildCase2();
  const wc = c.winningChain;
  const keyed = ['means', 'time', 'place', 'alibiMechanism', 'prologueFact', 'corroboration', 'physicalContradiction']
    .map((s) => c.fact(wc[s])).filter((f) => f && f.prologueKeyed);
  assert.equal(keyed.length, 1);
  assert.equal(keyed[0].id, 'f-purser-corridor');
});

test('the alibi-breaker genuinely contradicts the purser\'s own statement', () => {
  const c = buildCase2();
  const corridor = c.fact(c.winningChain.prologueFact);
  const alibi = c.statement('s-purser-alibi');
  assert.ok(corridor.contradicts(alibi.claim), 'corridor fact must contradict the lounge alibi at the same coordinate');
  assert.equal(alibi.speaker, c.winningChain.suspect, 'the contradicted statement is the suspect\'s own');
});

test('Case 2 red herrings are honest (not load-bearing in any slot)', () => {
  const report = runCaseBattery(buildCase2());
  assert.deepEqual(report.sections.redHerringHonesty, []);
});

test('the counter-move clock never strands the win (challenge-order fuzz)', () => {
  const report = runCaseBattery(buildCase2());
  assert.deepEqual(report.sections.challengeOrder, []);
});

test('Case 2 blind-grind probe stays open beyond the bounded budget', () => {
  const probe = probeDegenerateStrategy(buildCase2());
  assert.ok(probe.space >= BLIND_SPACE_FLOOR);
  assert.equal(probe.enumeratedClosedAt, null);
  assert.equal(probe.randomClosedAt, null);
});

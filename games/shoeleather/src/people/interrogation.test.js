import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interrogation } from './interrogation.js';
import { CaseClock } from './case-clock.js';
import { SuspectState } from './suspect-state.js';
import { Notebook } from '../case/notebook.js';
import { buildToyCase } from '../case/fixtures/toy-case.js';

function setup({ maxTolerance = 3, counterMoves = [] } = {}) {
  const caseData = buildToyCase();
  const nb = new Notebook();
  const state = new SuspectState({ maxTolerance });
  const clock = new CaseClock({ counterMoves });
  const interro = new Interrogation({
    suspectId: 'chef',
    statements: caseData.statements,
    suspectState: state, notebook: nb, clock, caseData,
  });
  return { caseData, nb, state, clock, interro };
}

test('a correct challenge lands and breaks the statement', () => {
  const { caseData, nb, state, interro } = setup();
  nb.logStatement(caseData.statement('s-chef-alibi'));
  nb.logFact(caseData.fact('f-chef-at-restaurant'));
  const res = interro.challenge('s-chef-alibi', 'f-chef-at-restaurant');
  assert.equal(res.type, 'landed');
  assert.ok(state.isRefuted('s-chef-alibi'));
  assert.equal(state.tolerance, 3); // landing does not harden
});

test('a wrong challenge hardens the suspect and advances the clock', () => {
  const { caseData, nb, state, clock, interro } = setup({
    counterMoves: [{ id: 'cm1', closesPath: 'doorman', describe: 'The valet is told to lose the ticket.' }],
  });
  nb.logStatement(caseData.statement('s-chef-alibi'));
  nb.logFact(caseData.fact('f-means')); // does NOT contradict the alibi
  const res = interro.challenge('s-chef-alibi', 'f-means');
  assert.equal(res.type, 'failed');
  assert.equal(state.tolerance, 2);      // hardened
  assert.equal(clock.count, 1);          // counter-move fired
  assert.ok(clock.isPathClosed('doorman'));
  assert.equal(res.counterMove.id, 'cm1');
});

test('challenging with a statement you have not heard is refused (no leak)', () => {
  const { caseData, nb, interro } = setup();
  nb.logFact(caseData.fact('f-chef-at-restaurant')); // fact known, statement not heard
  const res = interro.challenge('s-chef-alibi', 'f-chef-at-restaurant');
  assert.equal(res.type, 'invalid');
});

test('challenging with evidence you do not have is refused', () => {
  const { caseData, nb, interro } = setup();
  nb.logStatement(caseData.statement('s-chef-alibi'));
  const res = interro.challenge('s-chef-alibi', 'f-chef-at-restaurant'); // fact not logged
  assert.equal(res.type, 'invalid');
});

test('a hardened suspect refuses to engage until relaxed', () => {
  const { caseData, nb, state, interro } = setup({ maxTolerance: 1 });
  nb.logStatement(caseData.statement('s-chef-alibi'));
  nb.logFact(caseData.fact('f-means'));
  interro.challenge('s-chef-alibi', 'f-means'); // wrong -> tolerance 0, hostile
  assert.ok(state.hardened);
  nb.logFact(caseData.fact('f-chef-at-restaurant'));
  const res = interro.challenge('s-chef-alibi', 'f-chef-at-restaurant'); // correct, but shut down
  assert.equal(res.type, 'refused');
  assert.ok(!state.isRefuted('s-chef-alibi')); // could not land while hostile
});

test('challengeable lists heard, unrefuted, own statements only', () => {
  const { caseData, nb, state, interro } = setup();
  nb.logStatement(caseData.statement('s-chef-alibi'));
  nb.logStatement(caseData.statement('s-waiter-home')); // not the chef's
  assert.deepEqual(interro.challengeable().map((s) => s.id), ['s-chef-alibi']);
  state.markRefuted('s-chef-alibi');
  assert.deepEqual(interro.challengeable().map((s) => s.id), []);
});

test('an already-refuted statement cannot be re-challenged', () => {
  const { caseData, nb, state, interro } = setup();
  nb.logStatement(caseData.statement('s-chef-alibi'));
  nb.logFact(caseData.fact('f-chef-at-restaurant'));
  state.markRefuted('s-chef-alibi');
  const res = interro.challenge('s-chef-alibi', 'f-chef-at-restaurant');
  assert.equal(res.type, 'invalid');
});

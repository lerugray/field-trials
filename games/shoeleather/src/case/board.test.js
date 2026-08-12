import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccusationBoard, DEFLECTION, BOARD_SLOTS } from './board.js';
import { buildToyCase } from './fixtures/toy-case.js';
import { Notebook } from './notebook.js';
import { CaseClock } from '../people/case-clock.js';

function setup() {
  const caseData = buildToyCase();
  const nb = new Notebook();
  // Log + PIN everything the winning chain needs (board draws from pinned entries).
  for (const id of Object.values(caseData.winningChain)) {
    if (!caseData.fact(id)) continue;
    nb.logFact(caseData.fact(id)); nb.pin(id);
  }
  nb.logStatement(caseData.statement('s-chef-alibi')); nb.pin('s-chef-alibi');
  const clock = new CaseClock({ counterMoves: caseData.counterMoves });
  const board = new AccusationBoard({ caseData, notebook: nb, clock });
  return { caseData, nb, clock, board };
}

function fillWinning(board) {
  for (const [slot, id] of Object.entries(board.caseData.winningChain)) {
    if (slot !== 'victim') board.set(slot, id);
  }
}

test('candidates draw from pinned notebook entries and the suspect list', () => {
  const { board } = setup();
  assert.deepEqual(board.candidatesFor('suspect').map((c) => c.id).sort(), ['chef', 'waiter']);
  const factIds = board.candidatesFor('means').map((c) => c.id);
  assert.ok(factIds.includes('f-means'));
  const stmtIds = board.candidatesFor('contradictedStatement').map((c) => c.id);
  assert.deepEqual(stmtIds, ['s-chef-alibi']);
});

test('victim display name resolves and never leaks the raw fixture id', () => {
  const { board } = setup();
  assert.equal(board.victimName(), 'Martin Vale');
  assert.notEqual(board.victimName(), board.caseData.victim);
});

test('an unpinned fact is not offered to the board', () => {
  const { board, nb, caseData } = setup();
  nb.logFact(caseData.fact('f-partner-debt')); // logged but NOT pinned
  assert.ok(!board.candidatesFor('means').some((c) => c.id === 'f-partner-debt'));
});

test('incomplete submission reports missing slots, no clock advance', () => {
  const { board, clock } = setup();
  board.set('suspect', 'chef');
  const res = board.submit();
  assert.equal(res.type, 'incomplete');
  assert.ok(res.missing.length > 0);
  assert.equal(clock.count, 0);
});

test('the exact winning chain solves the case', () => {
  const { board } = setup();
  fillWinning(board);
  assert.ok(board.isComplete());
  const res = board.submit();
  assert.equal(res.type, 'solved');
  assert.ok(board.solved);
});

test('a wrong complete chain deflects uniformly and advances the clock', () => {
  const { board, clock } = setup();
  fillWinning(board);
  board.set('physicalContradiction', 'f-means'); // wrong slot + duplicate fact
  const res = board.submit();
  assert.equal(res.type, 'deflected');
  assert.equal(res.line, DEFLECTION);
  assert.equal(clock.count, 1);        // murderer counter-moved
  assert.ok(!board.solved);
});

test('deflection line is identical regardless of how wrong (no gradient)', () => {
  const { board } = setup();
  fillWinning(board);
  board.set('suspect', 'waiter'); // very wrong suspect
  const r1 = board.submit();
  board.set('suspect', 'chef');
  board.set('prologueFact', 'f-chef-knife'); // subtly wrong (no contradiction)
  const r2 = board.submit();
  assert.equal(r1.line, r2.line); // same uniform line
});

test('no attempt cap: solving after several deflections still works', () => {
  const { board } = setup();
  fillWinning(board);
  board.set('physicalContradiction', 'f-means'); board.submit(); // wrong
  board.set('physicalContradiction', 'f-time'); board.submit(); // wrong
  board.set('physicalContradiction', 'f-chef-knife'); // correct now
  assert.equal(board.submit().type, 'solved');
});

test('the TRAP variant fires only when requested and the case defines a trap', () => {
  const { board } = setup(); // toy case: no trap defined
  fillWinning(board);
  assert.equal(board.submit(true).variant, 'staged'); // no trap on the toy case
});

test('BOARD_SLOTS covers every expanded load-bearing deduction', () => {
  assert.deepEqual([...BOARD_SLOTS], ['suspect', 'means', 'time', 'place', 'alibiMechanism', 'prologueFact', 'contradictedStatement', 'corroboration', 'physicalContradiction']);
});

test('near-miss expanded chains all receive the one uniform deflection line', () => {
  const { board, nb } = setup();
  for (const fact of board.caseData.facts) if (!nb.has(fact.id)) { nb.logFact(fact); nb.pin(fact.id); }
  for (const statement of board.caseData.statements) if (!nb.has(statement.id)) { nb.logStatement(statement); nb.pin(statement.id); }
  for (const miss of board.caseData.nearMisses) {
    for (const [slot, id] of Object.entries(miss)) if (slot !== 'victim') board.set(slot, id);
    const result = board.submit();
    assert.equal(result.type, 'deflected');
    assert.equal(result.line, DEFLECTION);
  }
});

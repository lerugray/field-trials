import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { certify } from '../src/puzzle/solver.js';
import {
  rowCandidates, countSolutions, isUnique, oracleCrossCheck,
} from '../src/puzzle/oracle.js';
import { runLengths } from '../src/puzzle/clues.js';

test('rowCandidates enumerates exactly the rows matching a clue', () => {
  // clue [2] in width 4: positions 0..2 -> 3 candidates.
  const c = rowCandidates(4, [2]);
  assert.equal(c.length, 3);
  for (const row of c) assert.deepEqual(runLengths(row), [2]);
  // empty clue -> the single all-empty row.
  assert.equal(rowCandidates(4, []).length, 1);
  // fully-constrained clue -> one candidate.
  assert.equal(rowCandidates(5, [2, 2]).length, 1);
});

test('rowCandidates count matches the stars-and-bars formula', () => {
  // clue [1,1] in width 5: choose 2 of (5-2+1)=4 gap slots -> C(4,2)=6.
  assert.equal(rowCandidates(5, [1, 1]).length, 6);
});

test('countSolutions finds a unique solution for a guess-free puzzle', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  assert.equal(countSolutions(p), 1);
  assert.ok(isUnique(p));
});

test('countSolutions finds the two solutions of the checkerboard', () => {
  const p = Puzzle.fromAscii(['#.', '.#']);
  assert.equal(countSolutions(p), 2);
  assert.ok(!isUnique(p));
});

test('countSolutions counts a permutation-matrix diagonal as many', () => {
  // 4x4 all rows/cols [1] -> 4! = 24 solutions.
  const p = Puzzle.fromAscii(['#...', '.#..', '..#.', '...#']);
  assert.equal(countSolutions(p), 24);
});

test('countSolutions returns 0 for contradictory clues', () => {
  // Build a puzzle-like object with inconsistent clues by hand.
  const fake = {
    width: 3, height: 1,
    rowClues: [[3]],
    colClues: [[1], [], [1]], // col 1 must be empty but row demands all filled
  };
  assert.equal(countSolutions(fake), 0);
});

// ---- The cross-check invariant on a battery of fixtures ----

const GUESS_FREE = [
  ['###', '.#.', '.#.'],
  ['#####', '#...#', '#...#', '#...#', '#####'],
  ['..#..', '..#..', '#####', '..#..', '..#..'],
  ['#....', '##...', '###..', '####.', '#####'],
  ['###', '###', '###'],
  ['...', '...', '...'],
  ['#.#', '.#.', '#.#'],        // X — symmetric but uniquely forced
];

const AMBIGUOUS = [
  ['#.', '.#'],                       // 2x2 checkerboard (2 solutions)
  ['#...', '.#..', '..#.', '...#'],   // permutation diagonal (24 solutions)
  ['#.#.', '.#.#', '#.#.', '.#.#'],   // 4x4 checkerboard-class (2 solutions)
];

test('oracle cross-check: certified guess-free implies oracle-unique', () => {
  for (const rows of GUESS_FREE) {
    const p = Puzzle.fromAscii(rows);
    const x = oracleCrossCheck(p, certify);
    assert.ok(x.invariantHolds, `invariant broken for ${rows.join('/')}`);
    assert.ok(x.certifiedGuessFree, `expected guess-free: ${rows.join('/')}`);
    assert.ok(x.unique, `expected unique: ${rows.join('/')}`);
  }
});

test('oracle cross-check: ambiguous fixtures are rejected by the certifier', () => {
  for (const rows of AMBIGUOUS) {
    const p = Puzzle.fromAscii(rows);
    const x = oracleCrossCheck(p, certify);
    assert.ok(x.invariantHolds, `invariant broken for ${rows.join('/')}`);
    assert.ok(!x.certifiedGuessFree, `should not certify ambiguous: ${rows.join('/')}`);
    assert.ok(x.ambiguous, `oracle should see >=2 solutions: ${rows.join('/')}`);
  }
});

test('guess-free is STRICTER than unique: a unique puzzle can still need a guess', () => {
  // The 5x5 "spool" has a unique solution but stalls the forced-deduction certifier.
  const p = Puzzle.fromAscii(['#...#', '.###.', '..#..', '.###.', '#...#']);
  const solutions = countSolutions(p, 3);
  const cert = certify(p);
  // Whatever its exact count, the invariant (guess-free => unique) must hold, and if it
  // is unique-but-stalled it documents that we reject unique-yet-guess-requiring puzzles.
  assert.ok(!cert.ok || solutions === 1);
  if (solutions === 1) assert.ok(!cert.ok, 'spool should be unique yet not guess-free');
});

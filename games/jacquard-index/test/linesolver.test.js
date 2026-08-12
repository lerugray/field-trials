import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineSolve, madeProgress, UNKNOWN, EMPTY, FILLED } from '../src/puzzle/linesolver.js';

const U = UNKNOWN;
const line = (n) => new Int8Array(n).fill(U);

test('T1: a clue that fills the whole line is fully forced', () => {
  const r = lineSolve(line(5), [5]);
  assert.deepEqual(Array.from(r), [1, 1, 1, 1, 1]);
});

test('T1: clue [0]/[] forces all empty', () => {
  const r = lineSolve(line(4), []);
  assert.deepEqual(Array.from(r), [0, 0, 0, 0]);
});

test('T1: [2,2] in length 5 is fully forced', () => {
  const r = lineSolve(line(5), [2, 2]);
  assert.deepEqual(Array.from(r), [1, 1, 0, 1, 1]);
});

test('T2: overlap fills the guaranteed middle of a long run', () => {
  // clue [4] in length 6: cells 2 and 3 are filled in every placement.
  const r = lineSolve(line(6), [4]);
  assert.deepEqual(Array.from(r), [U, U, 1, 1, U, U]);
});

test('T2: bounds elimination marks unreachable cells empty', () => {
  // clue [3] in length 5, cell 0 known empty -> run sits in [1..4].
  const known = line(5); known[0] = EMPTY;
  const r = lineSolve(known, [3]);
  // Every placement covers cells 2 and 3; cell 0 stays empty.
  assert.equal(r[0], EMPTY);
  assert.equal(r[2], FILLED);
  assert.equal(r[3], FILLED);
});

test('T3: edge-anchoring off a known-filled cell', () => {
  // clue [2] in length 5 with cell 0 known filled -> run must be cells 0,1.
  const known = line(5); known[0] = FILLED;
  const r = lineSolve(known, [2]);
  assert.deepEqual(Array.from(r), [1, 1, 0, 0, 0]);
});

test('T4: bounded-split — a known cell constrains the placement set', () => {
  // clue [2] in length 5, cell 1 known filled -> placements {0,1} or {1,2}.
  // Forced: cell 1 filled (both), cells 3,4 empty (both).
  const known = line(5); known[1] = FILLED;
  const r = lineSolve(known, [2]);
  assert.equal(r[1], FILLED);
  assert.equal(r[3], EMPTY);
  assert.equal(r[4], EMPTY);
  assert.equal(r[0], UNKNOWN); // genuinely undecided
  assert.equal(r[2], UNKNOWN);
});

test('contradiction: unsatisfiable clue returns null', () => {
  // clue [3] in length 2 cannot fit.
  assert.equal(lineSolve(line(2), [3]), null);
  // A known-filled cell that cannot be part of any run of an empty clue.
  const known = line(3); known[1] = FILLED;
  assert.equal(lineSolve(known, []), null);
});

test('contradiction: known-filled outside the only legal placement', () => {
  // clue [1] length 3 but cells 0 AND 2 known filled -> needs two runs, impossible.
  const known = line(3); known[0] = FILLED; known[2] = FILLED;
  assert.equal(lineSolve(known, [1]), null);
});

test('respects already-known cells (never overturns them)', () => {
  const known = line(5); known[4] = FILLED;
  const r = lineSolve(known, [1, 1]);
  // Last run pinned at 4; first single is somewhere in 0..2 -> undecided there,
  // but cell 3 must be empty (gap before the pinned run), cell 4 filled.
  assert.equal(r[4], FILLED);
  assert.equal(r[3], EMPTY);
});

test('madeProgress detects newly-decided cells', () => {
  const known = line(6);
  const solved = lineSolve(known, [4]);
  assert.ok(madeProgress(known, solved));
  // Solving again from the result yields no further progress.
  assert.ok(!madeProgress(solved, lineSolve(solved, [4])));
});

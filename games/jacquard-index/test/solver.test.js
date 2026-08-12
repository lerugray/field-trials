import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { solveFromClues, certify, isGuessFree } from '../src/puzzle/solver.js';
import { FILLED, EMPTY } from '../src/puzzle/linesolver.js';

// Turn a solver board back into ASCII for readable assertions.
function boardAscii(board, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += board[y * w + x] === FILLED ? '#' : '.';
    rows.push(s);
  }
  return rows;
}

test('solves a simple guess-free puzzle from clues alone', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']); // a T
  const r = solveFromClues(p.width, p.height, p.rowClues, p.colClues);
  assert.equal(r.status, 'solved');
  assert.deepEqual(boardAscii(r.board, p.width, p.height), p.toAscii());
});

test('certify accepts a guess-free puzzle and reaches its exact solution', () => {
  const p = Puzzle.fromAscii([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####',
  ]); // a frame
  const c = certify(p);
  assert.ok(c.ok, `expected guess-free, got ${c.reason}`);
  assert.equal(c.reason, 'guess-free');
});

test('cross-line propagation (T3) completes a staircase no single pass could', () => {
  // A staircase: rows [1],[2],[3],[4],[5]; the interplay of row and column growth pins
  // every cell by pure deduction. (A diagonal, by contrast, is a permutation matrix with
  // many solutions — correctly rejected elsewhere.)
  const p = Puzzle.fromAscii([
    '#....',
    '##...',
    '###..',
    '####.',
    '#####',
  ]);
  const c = certify(p);
  assert.ok(c.ok, `staircase should be guess-free, got ${c.reason}`);
  assert.ok(c.passes >= 2, 'a cross-line puzzle needs more than one sweep');
});

test('rejects an ambiguous puzzle: the 2x2 checkerboard stalls (needs a guess)', () => {
  // The classic ambiguous case: two valid solutions, no forced deduction.
  //  #.      .#
  //  .#  and #.
  const p = Puzzle.fromAscii(['#.', '.#']);
  const r = solveFromClues(p.width, p.height, p.rowClues, p.colClues);
  assert.equal(r.status, 'stalled');
  assert.ok(r.decided < r.total, 'a guess-requiring puzzle must not fully decide');
  assert.ok(!isGuessFree(p));
});

test('detects contradictory clues', () => {
  // 1x3 row clue [3] but col clues insist on gaps -> inconsistent.
  const r = solveFromClues(3, 1, [[3]], [[1], [], [1]]);
  assert.equal(r.status, 'contradiction');
});

test('larger guess-free fixture (a plus sign) certifies', () => {
  const p = Puzzle.fromAscii([
    '..#..',
    '..#..',
    '#####',
    '..#..',
    '..#..',
  ]);
  assert.ok(isGuessFree(p));
});

test('a fully blank puzzle is trivially guess-free', () => {
  const p = Puzzle.fromAscii(['...', '...', '...']);
  const c = certify(p);
  assert.ok(c.ok);
});

test('a fully filled puzzle is trivially guess-free', () => {
  const p = Puzzle.fromAscii(['###', '###', '###']);
  const c = certify(p);
  assert.ok(c.ok);
});

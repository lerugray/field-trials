import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';

test('Puzzle derives row and column clues from the solution', () => {
  // A small 'T' shape:
  //  ###
  //  .#.
  //  .#.
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  assert.equal(p.width, 3);
  assert.equal(p.height, 3);
  assert.deepEqual(p.rowClues, [[3], [1], [1]]);
  assert.deepEqual(p.colClues, [[1], [3], [1]]);
});

test('fromAscii accepts #, X, 1 as filled', () => {
  const p = Puzzle.fromAscii(['#X1', '...']);
  assert.deepEqual(p.rowClues, [[3], []]);
});

test('empty lines derive to empty clue (displayed later as 0)', () => {
  const p = Puzzle.fromAscii(['...', '...']);
  assert.deepEqual(p.rowClues, [[], []]);
  assert.deepEqual(p.colClues, [[], [], []]);
});

test('at / rowCells / colCells read the solution', () => {
  const p = Puzzle.fromAscii(['#.', '.#']);
  assert.equal(p.at(0, 0), 1);
  assert.equal(p.at(1, 0), 0);
  assert.deepEqual(Array.from(p.rowCells(0)), [1, 0]);
  assert.deepEqual(Array.from(p.colCells(1)), [0, 1]);
});

test('toAscii round-trips fromAscii', () => {
  const rows = ['#.#', '.#.', '##.'];
  const p = Puzzle.fromAscii(rows);
  assert.deepEqual(p.toAscii(), rows);
});

test('solutionKey is stable and distinguishes different grids', () => {
  const a = Puzzle.fromAscii(['#.', '.#']);
  const b = Puzzle.fromAscii(['#.', '.#']);
  const c = Puzzle.fromAscii(['.#', '#.']);
  assert.equal(a.solutionKey(), b.solutionKey());
  assert.notEqual(a.solutionKey(), c.solutionKey());
});

test('Puzzle rejects malformed input', () => {
  assert.throws(() => Puzzle.fromAscii(['##', '#'])); // ragged rows
  assert.throws(() => new Puzzle(2, 2, new Uint8Array(3))); // wrong length
  assert.throws(() => new Puzzle(0, 2, new Uint8Array(0))); // bad dims
});

test('clues on a wider fixture with gaps', () => {
  //  #.##.
  //  .###.
  const p = Puzzle.fromAscii(['#.##.', '.###.']);
  assert.deepEqual(p.rowClues, [[1, 2], [3]]);
  assert.deepEqual(p.colClues, [[1], [1], [2], [2], []]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { Board } from '../src/puzzle/board.js';
import { nextHint } from '../src/puzzle/hints.js';

test('nextHint points at a line and names the technique on a fresh board', () => {
  const p = Puzzle.fromAscii(['#####', '#...#', '#...#', '#...#', '#####']);
  const b = new Board(p, { autoX: false });
  const h = nextHint(b);
  assert.equal(h.kind, 'deduction');
  assert.ok(h.tier >= 1 && h.tier <= 4);
  assert.match(h.point, /Look at (row|column) \d+/);
  assert.match(h.name, /Technique:/);
  assert.ok(h.cells.length >= 1);
  for (const c of h.cells) assert.ok(c.state === 'fill' || c.state === 'cross');
});

test('hints are pure — nextHint never mutates the board', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  const b = new Board(p, { autoX: false });
  const before = Array.from(b.primary);
  nextHint(b);
  assert.deepEqual(Array.from(b.primary), before);
});

test('following hints step by step solves the puzzle (replays the deduction path)', () => {
  const p = Puzzle.fromAscii([
    '..####..', '.#....#.', '######.#', '#....#.#',
    '#....#.#', '######.#', '.#....#.', '..####..',
  ]); // the shuttle (T3)
  const b = new Board(p, { autoX: false });
  let guard = 0;
  for (;;) {
    const h = nextHint(b);
    if (h.kind === 'solved') break;
    assert.equal(h.kind, 'deduction', `unexpected hint: ${JSON.stringify(h)}`);
    // Apply just the first suggested cell, the way a player following a hint would.
    const c = h.cells[0];
    if (c.state === 'fill') b.toggleFill(c.x, c.y);
    else b.toggleCross(c.x, c.y);
    if (++guard > 1000) throw new Error('hint loop did not converge');
  }
  assert.ok(b.isSolved(), 'hints should be able to drive the board to a solve');
});

test('easiest-first: a T1 move is offered before any harder move', () => {
  // A puzzle with an obvious fully-forced row should surface as tier 1 first.
  const p = Puzzle.fromAscii(['#####', '#...#', '#...#', '#...#', '#####']);
  const b = new Board(p, { autoX: false });
  const h = nextHint(b);
  assert.equal(h.tier, 1);
});

test('nextHint flags a mistake instead of deducing from a bad mark', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  const b = new Board(p, { autoX: false });
  b.toggleFill(0, 1); // (0,1) is empty in the solution -> a mistake
  const h = nextHint(b);
  assert.equal(h.kind, 'mistake');
  assert.match(h.message, /conflicts with the proof/);
});

test('a solved board reports nothing left to deduce', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  const b = new Board(p, { autoX: false });
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.at(x, y)) b.toggleFill(x, y);
  assert.equal(nextHint(b).kind, 'solved');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { Board, FILLED, CROSSED } from '../src/puzzle/board.js';
import {
  complementPuzzle, negativeDisplayClues, certifyNegative, negativeHint,
} from '../src/puzzle/negative.js';
import { NEGATIVE_MOTIFS, NEGATIVE_TEACHING } from '../src/content/negativeMotifs.js';
import { twistFor } from '../src/puzzle/twists.js';

test('every NEGATIVE CLOTH card is proved guess-free + unique under the gap clues', () => {
  const failures = [];
  for (const m of NEGATIVE_MOTIFS) {
    const r = certifyNegative(m);
    if (!r.ok) failures.push(`${m.id}:${r.reason}`);
    assert.ok(r.tier, `${m.id} has a tier`);
  }
  assert.deepEqual(failures, [], `unproved negative-cloth content: ${failures.join(', ')}`);
});

test('the teaching card exists and leads the shelf content', () => {
  assert.equal(NEGATIVE_MOTIFS[0].id, NEGATIVE_TEACHING);
});

test('gap clues are the run-lengths of the bare warp (complement), edges + zero included', () => {
  // Full cloth row -> zero gaps [0]; empty row -> one gap spanning it.
  const p = Puzzle.fromAscii(['#####', '.....', '##.##', '.###.']);
  const { rowClues } = negativeDisplayClues(p);
  assert.deepEqual(rowClues[0], [], 'full cloth: no gaps (shown as [0])');
  assert.deepEqual(rowClues[1], [5], 'empty row: one gap of 5');
  assert.deepEqual(rowClues[2], [1], 'one gap of 1 between two cloth blocks');
  assert.deepEqual(rowClues[3], [1, 1], 'two edge gaps around a centred thread block');
});

test('the prover REJECTS a card whose gap clues admit two solutions (adversarial)', () => {
  // G is a 2x2 checkerboard; its complement is the other checkerboard, the classic
  // ambiguous fixture. Under gap clues the card is not uniquely solvable -> not content.
  const ambiguous = { id: 'checker-neg', name: 'X', rows: ['.#', '#.'] };
  const r = certifyNegative(ambiguous);
  assert.equal(r.ok, false);
  assert.ok(r.reason === 'not-unique' || r.reason === 'stalled', `rejected, got ${r.reason}`);
});

test('complementPuzzle is an involution (its own inverse)', () => {
  const p = Puzzle.fromAscii(['#.#', '.#.', '##.']);
  const back = complementPuzzle(complementPuzzle(p));
  assert.equal(back.solutionKey(), p.solutionKey());
});

test('negativeHint points at a forced move that agrees with the solution, in the thread frame', () => {
  const motif = NEGATIVE_MOTIFS[0]; // THE BANDING
  const puzzle = Puzzle.fromAscii(motif.rows);
  const board = new Board(puzzle);
  const h = negativeHint(board);
  assert.equal(h.kind, 'deduction', 'a fresh board has a forced move');
  for (const c of h.cells) {
    const shouldFill = !!puzzle.at(c.x, c.y);
    if (c.state === 'fill') assert.ok(shouldFill, `hinted fill at ${c.x},${c.y} must be a thread`);
    else assert.ok(!shouldFill, `hinted cross at ${c.x},${c.y} must be bare warp`);
  }
});

test('negativeHint flags a mark that conflicts with the proof', () => {
  const motif = NEGATIVE_MOTIFS[1];
  const puzzle = Puzzle.fromAscii(motif.rows);
  const board = new Board(puzzle);
  // Lay a thread where the solution is bare warp -> a mistake.
  let placed = false;
  for (let y = 0; y < puzzle.height && !placed; y++)
    for (let x = 0; x < puzzle.width && !placed; x++)
      if (!puzzle.at(x, y)) { board.toggleFill(x, y); placed = true; }
  assert.ok(placed);
  const h = negativeHint(board);
  assert.equal(h.kind, 'mistake');
});

test('the twist registry routes negative-cloth to its prover, clues, and hint', () => {
  const t = twistFor('negative-cloth');
  assert.equal(t.id, 'negative-cloth');
  assert.ok(t.marginLabel && /GAP/i.test(t.marginLabel));
  assert.equal(t.certify, certifyNegative);
  assert.equal(t.hint, negativeHint);
  // The base machine is the default.
  assert.equal(twistFor(null).id, 'loom');
  assert.equal(twistFor('nope').id, 'loom');
});

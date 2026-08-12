// PROTOTYPE test for the ratification-gated invented twist (THE BIAS). Proves the prover
// extension works with the existing no-guess machinery and strictly adds deductive power.
// Not shipped: imports from prototypes/, not src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { certify } from '../src/puzzle/solver.js';
import { certifyBias, biasDiagonals, solveLines, buildBiasLines } from '../prototypes/bias.js';

test('biasDiagonals covers every cell exactly once across all "\\" diagonals', () => {
  const seen = new Set();
  let count = 0;
  for (const line of biasDiagonals(4, 3)) for (const i of line) { seen.add(i); count++; }
  assert.equal(count, 12);      // 4x3 = 12 cells
  assert.equal(seen.size, 12);  // each once
});

test('bias strictly adds deductive power: rows+cols-ambiguous grids become guess-free', () => {
  for (const rows of [['#.', '.#'], ['#...', '.#..', '..#.', '...#'], ['#.#.', '.#.#', '#.#.', '.#.#']]) {
    const p = Puzzle.fromAscii(rows);
    assert.ok(!certify(p).ok, `base should stall: ${rows.join('/')}`);
    assert.ok(certifyBias(p).ok, `bias should certify: ${rows.join('/')}`);
  }
});

test('bias certification reaches exactly the intended solution', () => {
  const p = Puzzle.fromAscii(['#.', '.#']);
  const c = certifyBias(p);
  assert.ok(c.ok);
  assert.equal(c.reason, 'guess-free-bias');
  for (let i = 0; i < c.board.length; i++) assert.equal(c.board[i], p.solution[i]);
});

test('the prover extension is just the base machine with more lines', () => {
  // A plain guess-free grid stays guess-free when bias lines are (redundantly) added.
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  assert.ok(certify(p).ok);
  const r = solveLines(p.width * p.height, buildBiasLines(p));
  assert.equal(r.status, 'solved');
});

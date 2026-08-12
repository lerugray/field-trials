// THE JACQUARD INDEX — the grid solver + no-guess certifier (this game's soul).
//
// Iterates the line solver over every row and column to a fixpoint. Each pass forces
// whatever the current marks allow; a decided cell in a row becomes a known constraint
// for its column and vice-versa, so cross-line propagation (T3) emerges here without any
// special code. The solver ONLY ever applies forced deductions — it never assumes a cell
// and backtracks. Therefore:
//   - status 'solved'   => every cell decided by pure logic: GUESS-FREE solvable.
//   - status 'stalled'  => forced deduction ran out with cells still unknown: the puzzle
//                          would require a guess => a build failure (hard-rule 4).
//   - status 'contradiction' => the clues are inconsistent (no solution).
//
// Uniqueness is cross-checked separately against a brute-force ORACLE (studio amendment);
// this module is the certifier the oracle checks, so the two never share one code path.

import { lineSolve, UNKNOWN, FILLED, EMPTY } from './linesolver.js';

function getRow(board, w, y) {
  return board.subarray(y * w, y * w + w);
}
function getCol(board, w, h, x) {
  const col = new Int8Array(h);
  for (let y = 0; y < h; y++) col[y] = board[y * w + x];
  return col;
}

// Merge a line-solver result back into `line`. Returns 'changed' | 'same' | 'conflict'.
function applyLine(line, solved) {
  let changed = false;
  for (let i = 0; i < line.length; i++) {
    const v = solved[i];
    if (v === UNKNOWN) continue;
    if (line[i] === UNKNOWN) { line[i] = v; changed = true; }
    else if (line[i] !== v) return 'conflict';
  }
  return changed ? 'changed' : 'same';
}

// Solve purely from clues (no access to any solution grid). This is the certifier's
// engine and the generator's oracle-checked path.
export function solveFromClues(width, height, rowClues, colClues) {
  const board = new Int8Array(width * height).fill(UNKNOWN);
  let passes = 0;

  for (;;) {
    let changed = false;
    passes++;

    // Rows: contiguous, solved in place.
    for (let y = 0; y < height; y++) {
      const row = getRow(board, width, y);
      const solved = lineSolve(row, rowClues[y]);
      if (solved === null) return { status: 'contradiction', board, passes };
      const res = applyLine(row, solved);
      if (res === 'conflict') return { status: 'contradiction', board, passes };
      if (res === 'changed') changed = true;
    }

    // Columns: strided, solved into a copy then written back.
    for (let x = 0; x < width; x++) {
      const col = getCol(board, width, height, x);
      const solved = lineSolve(col, colClues[x]);
      if (solved === null) return { status: 'contradiction', board, passes };
      const res = applyLine(col, solved);
      if (res === 'conflict') return { status: 'contradiction', board, passes };
      if (res === 'changed') {
        for (let y = 0; y < height; y++) board[y * width + x] = col[y];
        changed = true;
      }
    }

    if (!changed) break; // fixpoint
  }

  let decided = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== UNKNOWN) decided++;
  const solved = decided === board.length;
  return {
    status: solved ? 'solved' : 'stalled',
    board,
    passes,
    decided,
    total: board.length,
  };
}

// Certify a fully-specified Puzzle: guess-free line-solvable AND the deduction reaches
// exactly its solution. (Uniqueness across ALL solutions is the oracle's job; a 'solved'
// certificate already implies the deduced grid is the unique forced one.)
export function certify(puzzle) {
  const r = solveFromClues(puzzle.width, puzzle.height, puzzle.rowClues, puzzle.colClues);
  if (r.status !== 'solved') {
    return { ok: false, reason: r.status, ...r };
  }
  // The forced grid must match the intended solution.
  for (let i = 0; i < r.board.length; i++) {
    const want = puzzle.solution[i] ? FILLED : EMPTY;
    if (r.board[i] !== want) {
      return { ok: false, reason: 'solution-mismatch', index: i, ...r };
    }
  }
  return { ok: true, reason: 'guess-free', ...r };
}

// Convenience: is this puzzle solvable with no guessing?
export function isGuessFree(puzzle) {
  return certify(puzzle).ok;
}

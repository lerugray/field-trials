// THE JACQUARD INDEX — PROTOTYPE of the invented eighth twist: THE BIAS.
//
// RATIFICATION-GATED (CLAUDE.md rule 10). This is the studio-amendment "prover extension
// prototyped during M1", NOT the shipping shelf (that is M3b, only after the operator
// ratifies). It lives OUTSIDE src/ so it never enters the game bundle.
//
// The twist: in addition to row and column counts, a BIAS card carries counts along the
// cloth's diagonal grain (the "\" diagonals). The player deduces using rows, columns, and
// bias lines together. The key claim — that the twist PRESERVES provable no-guess
// deduction — is demonstrated structurally: a diagonal is just another 1D line, so the
// existing line solver and fixpoint apply unchanged. The prover extension is nothing more
// than adding the diagonal lines to the certifier's line set. This prototype proves that
// (a) the same guess-free machinery certifies bias puzzles, and (b) bias strictly adds
// deductive power (grids ambiguous under rows+cols alone become uniquely guess-free).

import { lineSolve, UNKNOWN } from '../src/puzzle/linesolver.js';
import { clueOfLine } from '../src/puzzle/clues.js';

// The "\" diagonals (cells sharing x - y), each as an ordered list of cell indices.
export function biasDiagonals(width, height) {
  const lines = [];
  for (let d = -(height - 1); d <= width - 1; d++) {
    const idx = [];
    for (let y = 0; y < height; y++) {
      const x = y + d;
      if (x >= 0 && x < width) idx.push(y * width + x);
    }
    if (idx.length > 0) lines.push(idx);
  }
  return lines;
}

function clueOfIndices(solution, indices) {
  return clueOfLine(indices.map((i) => solution[i]));
}

// The full line set for a BIAS puzzle: rows + columns + bias diagonals, each as
// { indices, clue } with the clue derived from the solution.
export function buildBiasLines(puzzle) {
  const { width, height, solution } = puzzle;
  const lines = [];
  for (let y = 0; y < height; y++) {
    const idx = [];
    for (let x = 0; x < width; x++) idx.push(y * width + x);
    lines.push({ indices: idx, clue: clueOfIndices(solution, idx) });
  }
  for (let x = 0; x < width; x++) {
    const idx = [];
    for (let y = 0; y < height; y++) idx.push(y * width + x);
    lines.push({ indices: idx, clue: clueOfIndices(solution, idx) });
  }
  for (const idx of biasDiagonals(width, height)) {
    lines.push({ indices: idx, clue: clueOfIndices(solution, idx) });
  }
  return lines;
}

// Generalized guess-free solver over an arbitrary set of lines (the whole prover
// extension: the base machine with more lines). Iterates the SAME line solver to a
// fixpoint. Returns solved / stalled / contradiction, exactly like the base certifier.
export function solveLines(cellCount, lines) {
  const board = new Int8Array(cellCount).fill(UNKNOWN);
  for (;;) {
    let changed = false;
    for (const { indices, clue } of lines) {
      const known = new Int8Array(indices.length);
      for (let k = 0; k < indices.length; k++) known[k] = board[indices[k]];
      const solved = lineSolve(known, clue);
      if (solved === null) return { status: 'contradiction', board };
      for (let k = 0; k < indices.length; k++) {
        if (solved[k] === UNKNOWN) continue;
        const at = indices[k];
        if (board[at] === UNKNOWN) { board[at] = solved[k]; changed = true; }
        else if (board[at] !== solved[k]) return { status: 'contradiction', board };
      }
    }
    if (!changed) break;
  }
  let decided = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== UNKNOWN) decided++;
  return { status: decided === board.length ? 'solved' : 'stalled', board, decided, total: board.length };
}

// Certify a BIAS puzzle: guess-free under rows+cols+bias, reaching exactly the solution.
export function certifyBias(puzzle) {
  const lines = buildBiasLines(puzzle);
  const r = solveLines(puzzle.width * puzzle.height, lines);
  if (r.status !== 'solved') return { ok: false, reason: r.status, ...r };
  for (let i = 0; i < r.board.length; i++) {
    const want = puzzle.solution[i] ? 1 : 0;
    if (r.board[i] !== want) return { ok: false, reason: 'solution-mismatch', ...r };
  }
  return { ok: true, reason: 'guess-free-bias', ...r };
}

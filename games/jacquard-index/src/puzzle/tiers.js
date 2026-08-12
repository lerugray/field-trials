// THE JACQUARD INDEX — technique-tier classification (the house's guarantee band).
//
// Studio amendment: the solver reports each puzzle's DEEPEST technique tier, and
// difficulty / unlock pacing / the hint ladder all derive from it. The no-guess law caps
// the ceiling at T4 by design. We classify by the minimal solver CAPABILITY that solves
// a puzzle to completion, using four strictly-nesting techniques:
//
//   T1 trivial      — empty-clue, fully-forced-by-length, line-complete.
//   T2 overlap      — leftmost/rightmost packing WITHOUT known-filled anchors
//                     (single-line overlap + edge forcing).
//   T3 anchoring    — packing WITH known-filled anchors + cross-line iteration.
//   T4 bounded-split— full placement enumeration (catches forced cells packing misses).
//
// Each level includes the cheaper ones, so the minimal completing level is well-defined.
// If even T4 stalls, the puzzle needs a guess and has no tier (a build failure).

import {
  lineSolve, firstPlacement, lastPlacement, UNKNOWN, EMPTY, FILLED,
} from './linesolver.js';
import { minLineLength, lineSatisfied } from './clues.js';

export const TIER_NAMES = {
  1: 'T1 trivial fill',
  2: 'T2 overlap',
  3: 'T3 edge-anchoring',
  4: 'T4 bounded split',
};

function placementToTrits(starts, clue, L) {
  const out = new Int8Array(L).fill(EMPTY);
  for (let i = 0; i < clue.length; i++) {
    for (let c = starts[i]; c < starts[i] + clue[i]; c++) out[c] = FILLED;
  }
  return out;
}

// T1: only the deductions a solver makes without any overlap reasoning.
function trivialLine(known, clue) {
  const L = known.length;
  const out = Int8Array.from(known);
  if (clue.length === 0) {
    for (let i = 0; i < L; i++) if (out[i] === UNKNOWN) out[i] = EMPTY;
    return out;
  }
  if (minLineLength(clue) === L) {
    const p = firstPlacement(known, clue);
    if (p) return placementToTrits(p, clue, L);
  }
  const filled = Array.from(known, (v) => (v === FILLED ? 1 : 0));
  if (lineSatisfied(filled, clue)) {
    for (let i = 0; i < L; i++) if (out[i] === UNKNOWN) out[i] = EMPTY;
    return out;
  }
  return out;
}

function maskFilled(known) {
  const out = Int8Array.from(known);
  for (let i = 0; i < out.length; i++) if (out[i] === FILLED) out[i] = UNKNOWN;
  return out;
}

// Leftmost/rightmost packing intersection respecting whatever `known` is passed.
function packingLine(known, clue) {
  const L = known.length;
  const left = firstPlacement(known, clue);
  const right = lastPlacement(known, clue);
  if (!left || !right) return null; // contradiction
  const out = new Int8Array(L).fill(UNKNOWN);
  const reach = new Uint8Array(L);
  for (let i = 0; i < clue.length; i++) {
    const len = clue[i];
    for (let c = right[i]; c < left[i] + len; c++) out[c] = FILLED; // overlap
    for (let c = left[i]; c < right[i] + len; c++) reach[c] = 1;    // reachable
  }
  for (let c = 0; c < L; c++) if (!reach[c]) out[c] = EMPTY;
  for (let c = 0; c < L; c++) if (known[c] !== UNKNOWN) out[c] = known[c];
  return out;
}

function unionTrits(known, a, b) {
  if (a === null || b === null) return null;
  const L = known.length;
  const out = new Int8Array(L);
  for (let i = 0; i < L; i++) {
    out[i] = a[i] !== UNKNOWN ? a[i] : b[i];
  }
  return out;
}

// The four capability line-solvers, strictly nesting. Exported so the hint engine can
// find the easiest available deduction using the same techniques the tier ladder uses.
export const TIER_LEVELS = [
  (known, clue) => trivialLine(known, clue),
  (known, clue) => unionTrits(known, trivialLine(known, clue), packingLine(maskFilled(known), clue)),
  (known, clue) => unionTrits(known, trivialLine(known, clue), packingLine(known, clue)),
  (known, clue) => lineSolve(known, clue),
];

function getRow(board, w, y) { return board.subarray(y * w, y * w + w); }
function getCol(board, w, h, x) {
  const col = new Int8Array(h);
  for (let y = 0; y < h; y++) col[y] = board[y * w + x];
  return col;
}
function applyLine(line, solved) {
  if (solved === null) return 'conflict';
  let changed = false;
  for (let i = 0; i < line.length; i++) {
    const v = solved[i];
    if (v === UNKNOWN) continue;
    if (line[i] === UNKNOWN) { line[i] = v; changed = true; }
    else if (line[i] !== v) return 'conflict';
  }
  return changed ? 'changed' : 'same';
}

// Generic fixpoint driver parameterized by a line technique.
function gridSolveWith(width, height, rowClues, colClues, lineFn) {
  const board = new Int8Array(width * height).fill(UNKNOWN);
  for (;;) {
    let changed = false;
    for (let y = 0; y < height; y++) {
      const row = getRow(board, width, y);
      const res = applyLine(row, lineFn(row, rowClues[y]));
      if (res === 'conflict') return { status: 'contradiction', board };
      if (res === 'changed') changed = true;
    }
    for (let x = 0; x < width; x++) {
      const col = getCol(board, width, height, x);
      const res = applyLine(col, lineFn(col, colClues[x]));
      if (res === 'conflict') return { status: 'contradiction', board };
      if (res === 'changed') { for (let y = 0; y < height; y++) board[y * width + x] = col[y]; changed = true; }
    }
    if (!changed) break;
  }
  let decided = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== UNKNOWN) decided++;
  return { status: decided === board.length ? 'solved' : 'stalled', board, decided, total: board.length };
}

// Deepest tier needed to solve `puzzle` guess-free, or null if it needs a guess.
export function deepestTier(puzzle) {
  for (let i = 0; i < TIER_LEVELS.length; i++) {
    const r = gridSolveWith(puzzle.width, puzzle.height, puzzle.rowClues, puzzle.colClues, TIER_LEVELS[i]);
    if (r.status === 'solved') return { tier: i + 1, name: TIER_NAMES[i + 1] };
    if (r.status === 'contradiction') return null;
  }
  return null;
}

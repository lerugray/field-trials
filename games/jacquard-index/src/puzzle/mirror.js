// THE JACQUARD INDEX — MIRROR-WEAVE (shelf 4): declared symmetry, and its prover.
//
// The twist (seed studio amendment): the card declares a SYMMETRY AXIS and the pattern is
// folded true about it. "What one half holds, the other answers."
//
// DESIGN NOTE (rigorous): symmetry as EXTRA DEDUCTION is vacuous. A symmetric grid has
// symmetric row/column clues, so the line-solver's fixpoint is itself symmetric — a cell is
// line-forced exactly when its mirror is, and fold-propagation never forces a new cell.
// (Verified empirically: base-stalled symmetric grids stay stalled under fold-propagation.)
// So MIRROR-WEAVE is realised as the FELT mechanic it names: the loom weaves both sides at
// once. The player deduces from the ordinary (full, guess-free) clues, and every mark is
// mirrored across the fold — you weave half and the pattern completes. No new proof risk
// (content is ordinary guess-free base cards that are additionally symmetric); the fold only
// ever copies a correct mark to its correct mirror.

import { Puzzle } from './puzzle.js';
import { buildPuzzle } from './generator.js';

export const AXES = ['v', 'h', 'rot180'];

// The mirror image of a cell under an axis: 'v' folds left<->right, 'h' folds top<->bottom,
// 'rot180' is a half-turn.
export function mirrorImage(x, y, axis, width, height) {
  switch (axis) {
    case 'v': return { x: width - 1 - x, y };
    case 'h': return { x, y: height - 1 - y };
    case 'rot180': return { x: width - 1 - x, y: height - 1 - y };
    default: throw new Error(`unknown mirror axis '${axis}'`);
  }
}

// True when a grid (atFn(x,y)->0/1) is invariant under the axis.
export function isSymmetric(atFn, width, height, axis) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = mirrorImage(x, y, axis, width, height);
      if (!!atFn(x, y) !== !!atFn(m.x, m.y)) return false;
    }
  }
  return true;
}

// Prove a MIRROR-WEAVE card: it must actually carry the declared symmetry AND be an ordinary
// guess-free, unique base card (so the full clues alone never require a guess, and the fold
// only ever weaves a correct mark to its correct mirror).
export function certifyMirror(motif) {
  const puzzle = motif.puzzle || Puzzle.fromAscii(motif.rows);
  const axis = motif.axis || 'v';
  if (!isSymmetric((x, y) => puzzle.at(x, y), puzzle.width, puzzle.height, axis)) {
    return { id: motif.id, name: motif.name, puzzle, axis, ok: false, reason: 'not-symmetric', twist: 'mirror-weave' };
  }
  const base = buildPuzzle({ id: motif.id, name: motif.name, blurb: motif.blurb, puzzle });
  return { ...base, axis, twist: 'mirror-weave' };
}

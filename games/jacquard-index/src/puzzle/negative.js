// THE JACQUARD INDEX — NEGATIVE CLOTH (shelf 3): the gap-clue twist, and its prover.
//
// The twist (seed studio amendment, convention FIXED): the margin counts describe the BARE
// WARP — the empty runs — in order, grid-edge gaps included explicitly, zero allowed. The
// player still weaves the CLOTH (fills the thread cells) to make the picture; only the
// clues are read inside-out.
//
// The whole twist reduces to the BASE MACHINE on the COMPLEMENT grid: the empty runs of a
// line are exactly the filled runs of that line complemented, and the base run-length clue
// of the complement already encodes the seed's gap convention (a maximal run at the edge is
// a normal run, so edge gaps are included; an all-thread line complements to nothing, whose
// clue displays as [0]). Therefore:
//   - gap clue of a line      = clueOfLine(complement(line))
//   - guess-free under gaps   <=> the complement grid is guess-free under ordinary clues
//   - unique under gaps        <=> the complement grid is uniquely solvable
// So the prover extension is: certify the complement with the SAME certifier + oracle. No
// new proof risk (hard-rule 4 preserved), and the reported tier is the difficulty the
// player actually experiences solving the gaps.

import { Puzzle } from './puzzle.js';
import { clueOfLine } from './clues.js';
import { buildPuzzle } from './generator.js';
import { nextHint } from './hints.js';
import { FILLED as CELL_FILLED, CROSSED as CELL_CROSSED, BLANK as CELL_BLANK } from './board.js';

// The bit-complement of a solution grid (thread <-> bare warp).
export function complementPuzzle(puzzle) {
  const sol = new Uint8Array(puzzle.solution.length);
  for (let i = 0; i < sol.length; i++) sol[i] = puzzle.solution[i] ? 0 : 1;
  return new Puzzle(puzzle.width, puzzle.height, sol);
}

// The gap (bare-warp) clues shown on the margin: run-lengths of the EMPTY cells, in order,
// with edge gaps and the zero case handled by the base clue math on the complement.
export function negativeDisplayClues(puzzle) {
  const rowClues = [];
  for (let y = 0; y < puzzle.height; y++) {
    rowClues.push(clueOfLine(Array.from(puzzle.rowCells(y), (c) => (c ? 0 : 1))));
  }
  const colClues = [];
  for (let x = 0; x < puzzle.width; x++) {
    colClues.push(clueOfLine(Array.from(puzzle.colCells(x), (c) => (c ? 0 : 1))));
  }
  return { rowClues, colClues };
}

// Prove a NEGATIVE CLOTH card: certify its COMPLEMENT with the base pipeline. The record's
// tier/guess-free/unique all transfer to the gap-clue puzzle by the equivalence above.
export function certifyNegative(motif) {
  const puzzle = motif.puzzle || Puzzle.fromAscii(motif.rows);
  const complement = complementPuzzle(puzzle);
  const rec = buildPuzzle({ id: motif.id, name: motif.name, blurb: motif.blurb, puzzle: complement });
  // Report against the real (thread) puzzle the player sees, but with the complement proof.
  return { ...rec, puzzle, complement, twist: 'negative-cloth' };
}

// A complement VIEW of a live board: filled<->crossed swapped, gap clues as its clues, and
// the complement grid as its solution. The base hint engine reads only these fields, so
// running it on the view yields the forced move in bare-warp terms; the caller inverts the
// move's state back into the thread frame the player is working in.
function complementView(board) {
  const { width, height } = board;
  const primary = new Int8Array(width * height);
  for (let i = 0; i < board.primary.length; i++) {
    const p = board.primary[i];
    // In the bare-warp frame: a laid thread is a KNOWN gap-empty (cross); a cross (the
    // player marking bare warp) is a KNOWN gap-fill; blank/pencil stay unknown.
    primary[i] = p === CELL_FILLED ? CELL_CROSSED : p === CELL_CROSSED ? CELL_FILLED : CELL_BLANK;
  }
  const complement = complementPuzzle(board.puzzle);
  return {
    width, height, primary, puzzle: complement,
    isSolved: () => board.isSolved(), // complement solved <=> thread grid solved
  };
}

// Twist-aware hint for a NEGATIVE CLOTH card: deduce in the bare-warp (complement) frame,
// then translate the forced state back to the thread frame (fill<->cross) so the player is
// told, in their own terms, where a thread must go or where the warp must stay bare.
export function negativeHint(board) {
  const h = nextHint(complementView(board));
  if (h.kind !== 'deduction') return h;
  const cells = h.cells.map((c) => ({ x: c.x, y: c.y, state: c.state === 'fill' ? 'cross' : 'fill' }));
  const human = h.lineKind === 'row' ? `row ${h.lineIndex + 1}` : `column ${h.lineIndex + 1}`;
  const verb = cells[0].state === 'fill' ? 'a thread must be laid' : 'the warp stays bare';
  return {
    ...h,
    cells,
    point: `Look at the bare warp of ${human}.`,
    name: h.name,
    message: `In ${human}, ${verb} by ${h.technique} (reading the gaps).`,
  };
}

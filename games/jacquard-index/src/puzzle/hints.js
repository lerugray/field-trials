// THE JACQUARD INDEX — the hint engine (a real hint SYSTEM, not reveal-a-cell slop).
//
// A hint is progressive (seed streamline #3): first it POINTS at a line where a move is
// available, then it NAMES the technique, then it SHOWS the exact deduction. It replays
// the certified deduction path: it finds the EASIEST (lowest-tier) forced move the player
// has not yet made, using the same technique ladder the tier classifier uses. Hints are
// pure queries — they never mutate the board — so they are uncapped and zero-penalty by
// construction (accessibility law). If the player has marked a cell against the proof, the
// hint flags that mistake instead, because deductions from a wrong mark are unsound.

import { TIER_LEVELS, TIER_NAMES } from './tiers.js';
import { FILLED as CELL_FILLED, CROSSED as CELL_CROSSED } from './board.js';
import { UNKNOWN, FILLED as T_FILLED, EMPTY as T_EMPTY } from './linesolver.js';

// Player marks -> solver trits: filled=FILLED, crossed=EMPTY, blank/pencil=UNKNOWN.
function knownFromBoard(board) {
  const k = new Int8Array(board.width * board.height).fill(UNKNOWN);
  for (let i = 0; i < board.primary.length; i++) {
    const p = board.primary[i];
    k[i] = p === CELL_FILLED ? T_FILLED : p === CELL_CROSSED ? T_EMPTY : UNKNOWN;
  }
  return k;
}

// First cell whose mark contradicts the solution, or null.
function findMistake(board) {
  const p = board.puzzle;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const i = y * board.width + x;
      const mark = board.primary[i];
      const shouldFill = !!p.solution[i];
      if (mark === CELL_FILLED && !shouldFill) return { x, y, kind: 'stitch-off-pattern' };
      if (mark === CELL_CROSSED && shouldFill) return { x, y, kind: 'crossed-a-thread' };
    }
  }
  return null;
}

function getRow(known, w, y) { return known.subarray(y * w, y * w + w); }
function getCol(known, w, h, x) {
  const c = new Int8Array(h);
  for (let y = 0; y < h; y++) c[y] = known[y * w + x];
  return c;
}

// The next hint for the current board state:
//   { kind:'solved' }                                   -> nothing left to deduce
//   { kind:'mistake', cell, message }                   -> a mark conflicts with the proof
//   { kind:'deduction', lineKind, lineIndex, tier,
//     technique, cells:[{x,y,state}], message }         -> the easiest forced move
export function nextHint(board) {
  // Once the pattern is woven, no hint is useful (missing crosses are just bookkeeping).
  if (board.isSolved()) return { kind: 'solved' };

  const mistake = findMistake(board);
  if (mistake) {
    return {
      kind: 'mistake',
      cell: mistake,
      message: `A mark conflicts with the proof near row ${mistake.y + 1}, column ${mistake.x + 1}. Undo to continue.`,
    };
  }

  const known = knownFromBoard(board);
  const { width, height } = board;
  const p = board.puzzle;

  for (let level = 0; level < TIER_LEVELS.length; level++) {
    const lineFn = TIER_LEVELS[level];
    // Rows first, then columns; lowest line index first (easiest to point at).
    for (let y = 0; y < height; y++) {
      const hit = lineHint(lineFn, getRow(known, width, y), p.rowClues[y], (i) => ({ x: i, y }));
      if (hit) return makeDeduction('row', y, level, hit);
    }
    for (let x = 0; x < width; x++) {
      const hit = lineHint(lineFn, getCol(known, width, height, x), p.colClues[x], (i) => ({ x, y: i }));
      if (hit) return makeDeduction('col', x, level, hit);
    }
  }
  return { kind: 'solved' };
}

function lineHint(lineFn, known, clue, toXY) {
  const solved = lineFn(known, clue);
  if (!solved) return null;
  const cells = [];
  for (let i = 0; i < known.length; i++) {
    if (known[i] === UNKNOWN && solved[i] !== UNKNOWN) {
      const { x, y } = toXY(i);
      cells.push({ x, y, state: solved[i] === T_FILLED ? 'fill' : 'cross' });
    }
  }
  return cells.length ? cells : null;
}

function makeDeduction(lineKind, lineIndex, level, cells) {
  const tier = level + 1;
  const human = lineKind === 'row' ? `row ${lineIndex + 1}` : `column ${lineIndex + 1}`;
  const verb = cells[0].state === 'fill' ? 'a stitch can be laid' : 'a cell can be crossed';
  return {
    kind: 'deduction',
    lineKind,
    lineIndex,
    tier,
    technique: TIER_NAMES[tier],
    cells,
    // Progressive disclosure text; the UI reveals these in stages.
    point: `Look at ${human}.`,
    name: `Technique: ${TIER_NAMES[tier]}.`,
    message: `In ${human}, ${verb} by ${TIER_NAMES[tier]}.`,
  };
}

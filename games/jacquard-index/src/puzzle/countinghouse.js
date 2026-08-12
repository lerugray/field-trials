// THE JACQUARD INDEX — COUNTING-HOUSE (shelf 2): paired-row ledger clues, and its prover.
//
// The twist (seed: Mega-Picross class, "totals two rows at once"; the out-of-order-sums
// variant is DROPPED). Our clean-room expression: the counting-house keeps ONE ledger line
// per PAIR of adjacent rows instead of a clue for each row. The clerk tallies the pair COLUMN
// BY COLUMN, top thread then bottom thread, as one running strip: T0, B0, T1, B1, ... The
// ledger clue is the run-lengths of that interleaved strip, so each column's two cells sit
// adjacent in the tally and the two rows are tightly coupled. Columns keep their ordinary
// clues. The ledger is load-bearing (it is the only row-axis information) yet directly line-
// solvable. Content ships even-height grids (rows pair up 0-1, 2-3, ...).
//
// Prover: a fixpoint over ordinary column line-solving AND ledger propagation (a ledger cell
// forced empty empties both rows; forced filled with one row already empty forces the other).
// Uniqueness is cross-checked by an INDEPENDENT oracle that enumerates COLUMN candidates and
// verifies the ledgers at the leaf (no shared path with the certifier). Hard-rule 4 upheld.

import { Puzzle } from './puzzle.js';
import { runLengths } from './clues.js';
import { lineSolve, UNKNOWN, FILLED, EMPTY } from './linesolver.js';
import { rowCandidates } from './oracle.js';

// The ledger clue of a row pair: run-lengths of the interleaved strip T0,B0,T1,B1,...
export function pairLedger(rowT, rowB) {
  const w = rowT.length;
  const strip = new Uint8Array(w * 2);
  for (let x = 0; x < w; x++) { strip[2 * x] = rowT[x] ? 1 : 0; strip[2 * x + 1] = rowB[x] ? 1 : 0; }
  return runLengths(strip);
}

// Derive a counting-house puzzle's clues: ordinary column clues + one ledger per row pair.
export function countingHouseClues(puzzle) {
  const { width, height } = puzzle;
  if (height % 2 !== 0) throw new Error('counting-house needs an even height (rows pair up)');
  const colClues = puzzle.colClues;
  const pairClues = [];
  for (let y = 0; y < height; y += 2) pairClues.push(pairLedger(puzzle.rowCells(y), puzzle.rowCells(y + 1)));
  return { colClues, pairClues };
}

function getCol(board, w, h, x) { const c = new Int8Array(h); for (let y = 0; y < h; y++) c[y] = board[y * w + x]; return c; }

// Guess-free fixpoint over columns + ledgers. Returns { status, board } like the base solver.
export function solveCountingHouse(width, height, colClues, pairClues) {
  const board = new Int8Array(width * height).fill(UNKNOWN);
  for (;;) {
    let changed = false;

    // Columns: ordinary line solving.
    for (let x = 0; x < width; x++) {
      const col = getCol(board, width, height, x);
      const solved = lineSolve(col, colClues[x]);
      if (solved === null) return { status: 'contradiction', board };
      for (let y = 0; y < height; y++) {
        const i = y * width + x;
        if (solved[y] === UNKNOWN) continue;
        if (board[i] === UNKNOWN) { board[i] = solved[y]; changed = true; }
        else if (board[i] !== solved[y]) return { status: 'contradiction', board };
      }
    }

    // Ledgers: solve each pair as one interleaved strip, then split back to the two rows.
    for (let p = 0; p < pairClues.length; p++) {
      const yT = p * 2, yB = yT + 1;
      const strip = new Int8Array(width * 2);
      for (let x = 0; x < width; x++) { strip[2 * x] = board[yT * width + x]; strip[2 * x + 1] = board[yB * width + x]; }
      const solved = lineSolve(strip, pairClues[p]);
      if (solved === null) return { status: 'contradiction', board };
      for (let x = 0; x < width; x++) {
        const iT = yT * width + x, iB = yB * width + x;
        if (solved[2 * x] !== UNKNOWN) {
          if (board[iT] === UNKNOWN) { board[iT] = solved[2 * x]; changed = true; }
          else if (board[iT] !== solved[2 * x]) return { status: 'contradiction', board };
        }
        if (solved[2 * x + 1] !== UNKNOWN) {
          if (board[iB] === UNKNOWN) { board[iB] = solved[2 * x + 1]; changed = true; }
          else if (board[iB] !== solved[2 * x + 1]) return { status: 'contradiction', board };
        }
      }
    }

    if (!changed) break;
  }
  let decided = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== UNKNOWN) decided++;
  return { status: decided === board.length ? 'solved' : 'stalled', board, decided, total: board.length };
}

function cluesEqual(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

// Independent oracle: enumerate COLUMN candidates and verify every ledger at the leaf.
export function countColHouseSolutions(width, height, colClues, pairClues, limit = Infinity) {
  const colCands = colClues.map((c) => rowCandidates(height, c)); // height-tall column fills
  for (const list of colCands) if (list.length === 0) return 0;
  const cols = new Array(width);
  let count = 0;
  function dfs(x) {
    if (count >= limit) return;
    if (x === width) {
      // Assemble rows and check each pair's interleaved ledger.
      for (let p = 0; p < pairClues.length; p++) {
        const yT = p * 2, yB = yT + 1;
        const strip = new Uint8Array(width * 2);
        for (let xx = 0; xx < width; xx++) { strip[2 * xx] = cols[xx][yT] ? 1 : 0; strip[2 * xx + 1] = cols[xx][yB] ? 1 : 0; }
        if (!cluesEqual(runLengths(strip), pairClues[p])) return;
      }
      count++;
      return;
    }
    for (const cand of colCands[x]) { cols[x] = cand; dfs(x + 1); if (count >= limit) return; }
  }
  dfs(0);
  return count;
}

// Prove a COUNTING-HOUSE card: guess-free under columns + ledgers AND unique (independent
// oracle up to 10x10). The reported difficulty is left as the twist band.
export function certifyCountingHouse(motif) {
  const puzzle = motif.puzzle || Puzzle.fromAscii(motif.rows);
  if (puzzle.height % 2 !== 0) return { id: motif.id, name: motif.name, puzzle, ok: false, reason: 'odd-height', twist: 'counting-house' };
  const { colClues, pairClues } = countingHouseClues(puzzle);
  const r = solveCountingHouse(puzzle.width, puzzle.height, colClues, pairClues);

  let guessFree = r.status === 'solved';
  if (guessFree) for (let i = 0; i < r.board.length; i++) { const want = puzzle.solution[i] ? FILLED : EMPTY; if (r.board[i] !== want) { guessFree = false; break; } }

  const oracleEligible = puzzle.width <= 10 && puzzle.height <= 10;
  let unique = null;
  if (oracleEligible) unique = countColHouseSolutions(puzzle.width, puzzle.height, colClues, pairClues, 2) === 1;

  const ok = guessFree && unique !== false;
  let reason = 'proved-counting-house';
  if (!guessFree) reason = r.status === 'contradiction' ? 'contradiction' : 'stalled';
  else if (unique === false) reason = 'not-unique';

  return {
    id: motif.id, name: motif.name, blurb: motif.blurb, puzzle,
    colClues, pairClues, ok, reason, guessFree, unique, oracleChecked: oracleEligible,
    tier: null, tierName: 'counting-house', twist: 'counting-house',
  };
}

// The next hint for a live counting-house board (binary marks). Returns a mistake, the
// easiest forced move (column or ledger), or solved. `marks` is the base Board primary
// (0 blank, 1 filled, 2 crossed).
export function nextCountingHouseHint(puzzle, colClues, pairClues, marks) {
  const { width, height } = puzzle;
  const known = new Int8Array(width * height).fill(UNKNOWN);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m === 1) { if (!puzzle.solution[i]) return mistakeAt(i, width, 'a thread'); known[i] = FILLED; }
    else if (m === 2) { if (puzzle.solution[i]) return mistakeAt(i, width, 'a crossed thread'); known[i] = EMPTY; }
  }
  // Columns first.
  for (let x = 0; x < width; x++) {
    const col = new Int8Array(height); for (let y = 0; y < height; y++) col[y] = known[y * width + x];
    const solved = lineSolve(col, colClues[x]);
    if (!solved) continue;
    for (let y = 0; y < height; y++) if (col[y] === UNKNOWN && solved[y] !== UNKNOWN) {
      return deduction('column', x, { x, y, state: solved[y] === FILLED ? 'fill' : 'cross' }, `column ${x + 1}`);
    }
  }
  // Ledgers (interleaved strip).
  for (let p = 0; p < pairClues.length; p++) {
    const yT = p * 2, yB = yT + 1;
    const strip = new Int8Array(width * 2);
    for (let x = 0; x < width; x++) { strip[2 * x] = known[yT * width + x]; strip[2 * x + 1] = known[yB * width + x]; }
    const solved = lineSolve(strip, pairClues[p]);
    if (!solved) continue;
    for (let k = 0; k < strip.length; k++) {
      if (strip[k] === UNKNOWN && solved[k] !== UNKNOWN) {
        const x = k >> 1; const y = (k & 1) === 0 ? yT : yB;
        return deduction('ledger', p, { x, y, state: solved[k] === FILLED ? 'fill' : 'cross' }, `the ledger of rows ${yT + 1}-${yB + 1}`);
      }
    }
  }
  return { kind: 'solved' };
}

function mistakeAt(i, width, what) {
  return { kind: 'mistake', cell: { x: i % width, y: Math.floor(i / width) },
    message: `${what} conflicts with the proof near row ${Math.floor(i / width) + 1}, column ${i % width + 1}. Undo to continue.` };
}
function deduction(kind, index, cell, human) {
  const verb = cell.state === 'fill' ? 'a thread can be laid' : 'a cell can be crossed';
  return { kind: 'deduction', lineKind: kind, lineIndex: index, cells: [cell],
    point: `Look at ${human}.`, name: `Technique: ${kind === 'ledger' ? 'the paired ledger' : 'column count'}.`,
    message: `In ${human}, ${verb}.` };
}

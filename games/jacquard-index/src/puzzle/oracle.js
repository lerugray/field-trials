// THE JACQUARD INDEX — the brute-force ORACLE (independent uniqueness cross-check).
//
// Studio amendment: "the solver is verified against an ORACLE, not itself." This module
// counts ALL solutions consistent with a puzzle's clues by a DIFFERENT algorithm than
// the certifier — it enumerates each row's candidate fills combinatorially and searches
// their product, pruning by column filled-count bounds and verifying columns exactly at
// the leaf. It shares NONE of the certifier's placement-intersection deduction. It is the
// suite's ground truth for uniqueness (count == 1) and solution agreement on small grids.
// Intended for grids up to ~10x10 (per the amendment); larger grids blow up by design.

import { runLengths, cluesEqual, minLineLength } from './clues.js';

// Every row of `width` whose filled-run lengths equal `clue`. Independent generator:
// it places runs with mandatory gaps, not by intersecting placements.
export function rowCandidates(width, clue) {
  const out = [];
  const cells = new Uint8Array(width);
  function rec(runIdx, pos) {
    if (runIdx === clue.length) {
      out.push(Uint8Array.from(cells));
      return;
    }
    const run = clue[runIdx];
    const restAfter = clue.length > runIdx + 1
      ? 1 + minLineLength(clue.slice(runIdx + 1))
      : 0;
    const maxS = width - run - restAfter;
    for (let s = pos; s <= maxS; s++) {
      for (let i = s; i < s + run; i++) cells[i] = 1;
      rec(runIdx + 1, s + run + 1);
      for (let i = s; i < s + run; i++) cells[i] = 0;
    }
  }
  rec(0, 0);
  return out;
}

// Count solutions consistent with all clues, stopping once `limit` is reached (use
// limit=2 for a uniqueness test). Returns the exact count when it is below `limit`.
// `accept(atFn)` (optional) is an INDEPENDENT extra constraint checked on the assembled
// grid at the leaf (atFn(x, y) -> 0/1) — used by twist oracles (e.g. MIRROR-WEAVE counts
// only solutions that also satisfy the declared symmetry), keeping the uniqueness check
// independent of the twist certifier.
export function countSolutions(puzzle, limit = Infinity, accept = null) {
  const { width, height, rowClues, colClues } = puzzle;
  const cands = rowClues.map((c) => rowCandidates(width, c));
  for (const list of cands) if (list.length === 0) return 0;

  const colTotal = colClues.map((c) => c.reduce((a, b) => a + b, 0));
  const colFilled = new Int32Array(width);
  const grid = new Array(height);
  let count = 0;

  function dfs(y) {
    if (count >= limit) return;
    if (y === height) {
      for (let x = 0; x < width; x++) {
        const col = new Uint8Array(height);
        for (let yy = 0; yy < height; yy++) col[yy] = grid[yy][x];
        if (!cluesEqual(runLengths(col), colClues[x])) return;
      }
      // Independent twist constraint (e.g. declared symmetry), checked on the full grid.
      if (accept && !accept((x, y) => grid[y][x])) return;
      count++;
      return;
    }
    const rowsLeftAfter = height - y - 1;
    for (const cand of cands[y]) {
      let ok = true;
      for (let x = 0; x < width; x++) {
        const next = colFilled[x] + cand[x];
        if (next > colTotal[x]) { ok = false; break; }            // overshoot
        if (next + rowsLeftAfter < colTotal[x]) { ok = false; break; } // unreachable
      }
      if (!ok) continue;
      for (let x = 0; x < width; x++) colFilled[x] += cand[x];
      grid[y] = cand;
      dfs(y + 1);
      for (let x = 0; x < width; x++) colFilled[x] -= cand[x];
      if (count >= limit) return;
    }
  }

  dfs(0);
  return count;
}

export function isUnique(puzzle) {
  return countSolutions(puzzle, 2) === 1;
}

// The cross-check the suite runs on every small puzzle: the oracle's verdict alongside
// the certifier's, plus the invariant that certified-guess-free implies unique.
export function oracleCrossCheck(puzzle, certify) {
  const solutions = countSolutions(puzzle, 2);
  const unique = solutions === 1;
  const cert = certify(puzzle);
  return {
    unique,
    ambiguous: solutions >= 2,
    noSolution: solutions === 0,
    certifiedGuessFree: cert.ok,
    // Core invariant: a guess-free certificate must never be issued for a non-unique grid.
    invariantHolds: !cert.ok || unique,
    cert,
  };
}

// THE JACQUARD INDEX — the line solver (forced-deduction workhorse, the solver's core).
//
// Given one line's clue and the cells currently known (filled / empty / unknown), this
// derives every cell that is FORCED: a cell is forced filled if it is filled in EVERY
// legal placement of the clue consistent with what is known, and forced empty if it is
// empty in every such placement. This single operation is the complete line-level
// deduction — it subsumes the whole technique ladder at the line scale (T2 overlap, T3
// edge-anchoring via known cells, T4 bounded-split elimination). It never guesses: it
// only reports what is true in all remaining possibilities. Cross-line propagation (T3)
// is the grid solver iterating this to a fixpoint. Contradictions (no legal placement)
// return null, which the grid solver reads as "this branch is impossible".

export const UNKNOWN = -1;
export const EMPTY = 0;
export const FILLED = 1;

// known: Int8Array/Array of trits (UNKNOWN/-1, EMPTY/0, FILLED/1). clue: run-length array
// ([] for an all-empty line). Returns a NEW trit array with any newly-forced cells set,
// or null if the clue cannot be satisfied given `known`.
export function lineSolve(known, clue) {
  const L = known.length;
  const cur = new Uint8Array(L);   // filled-map of the placement being built
  let forcedFilled = null;         // AND of every valid placement's filled-map
  let forcedEmpty = null;          // AND of every valid placement's empty-map
  let count = 0;

  function commit() {
    if (count === 0) {
      forcedFilled = Uint8Array.from(cur);
      forcedEmpty = new Uint8Array(L);
      for (let i = 0; i < L; i++) forcedEmpty[i] = cur[i] ? 0 : 1;
    } else {
      for (let i = 0; i < L; i++) {
        forcedFilled[i] &= cur[i];
        forcedEmpty[i] &= cur[i] ? 0 : 1;
      }
    }
    count++;
  }

  function recurse(runIdx, pos) {
    if (runIdx === clue.length) {
      // Tail: cells [pos, L) stay empty. A known-filled cell left uncovered is invalid.
      for (let i = pos; i < L; i++) if (known[i] === FILLED) return;
      commit();
      return;
    }
    const run = clue[runIdx];
    for (let s = pos; s + run <= L; s++) {
      // Cells skipped before this run ([pos, s)) will be empty: none may be known-filled.
      // Since s only grows, a known-filled cell below s can never be covered -> stop.
      let gapOk = true;
      for (let i = pos; i < s; i++) if (known[i] === FILLED) { gapOk = false; break; }
      if (!gapOk) break;
      // The run's own cells ([s, s+run)) must not be known-empty.
      let runOk = true;
      for (let i = s; i < s + run; i++) if (known[i] === EMPTY) { runOk = false; break; }
      if (!runOk) continue;
      // The mandatory gap cell right after the run must not be known-filled.
      if (s + run < L && known[s + run] === FILLED) continue;

      for (let i = s; i < s + run; i++) cur[i] = 1;
      recurse(runIdx + 1, s + run + 1);
      for (let i = s; i < s + run; i++) cur[i] = 0;
    }
  }

  recurse(0, 0);
  if (count === 0) return null; // contradiction: clue unsatisfiable given `known`

  const out = new Int8Array(L);
  for (let i = 0; i < L; i++) {
    if (forcedFilled[i]) out[i] = FILLED;
    else if (forcedEmpty[i]) out[i] = EMPTY;
    else out[i] = UNKNOWN;
  }
  return out;
}

// The leftmost valid placement of `clue` consistent with `known`: an array of run start
// indices, or null if none exists. Uses the same validity rules as lineSolve, returning
// the first (leftmost) placement its ascending enumeration finds.
export function firstPlacement(known, clue) {
  const L = known.length;
  const starts = new Array(clue.length);
  let found = null;
  function rec(runIdx, pos) {
    if (found) return;
    if (runIdx === clue.length) {
      for (let i = pos; i < L; i++) if (known[i] === FILLED) return;
      found = starts.slice();
      return;
    }
    const run = clue[runIdx];
    for (let s = pos; s + run <= L; s++) {
      let gapOk = true;
      for (let i = pos; i < s; i++) if (known[i] === FILLED) { gapOk = false; break; }
      if (!gapOk) break;
      let runOk = true;
      for (let i = s; i < s + run; i++) if (known[i] === EMPTY) { runOk = false; break; }
      if (!runOk) continue;
      if (s + run < L && known[s + run] === FILLED) continue;
      starts[runIdx] = s;
      rec(runIdx + 1, s + run + 1);
      if (found) return;
    }
  }
  rec(0, 0);
  return found;
}

// The rightmost valid placement: mirror the line and clue, take the leftmost, map back.
export function lastPlacement(known, clue) {
  const L = known.length;
  const rk = new Int8Array(L);
  for (let i = 0; i < L; i++) rk[i] = known[L - 1 - i];
  const rc = clue.slice().reverse();
  const ls = firstPlacement(rk, rc);
  if (!ls) return null;
  // Reversed run j corresponds to original run (clue.length-1-j).
  const starts = new Array(clue.length);
  for (let j = 0; j < rc.length; j++) {
    const origRun = clue.length - 1 - j;
    starts[origRun] = L - (ls[j] + rc[j]);
  }
  return starts;
}

// True if `solved` decided at least one cell that was UNKNOWN in `known`.
export function madeProgress(known, solved) {
  for (let i = 0; i < known.length; i++) {
    if (known[i] === UNKNOWN && solved[i] !== UNKNOWN) return true;
  }
  return false;
}

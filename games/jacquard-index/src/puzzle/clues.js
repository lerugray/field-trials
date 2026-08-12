// THE JACQUARD INDEX — clue math (the machine's ground truth).
//
// A "line" here is an array of cells that are truthy when FILLED. Clues are the ordered
// run-lengths of maximal filled runs (STUDY section 1). An all-empty line has the
// canonical internal clue `[]` (displayed as `[0]`). These functions are the ground
// truth for clue derivation, line satisfaction, auto-X, and the win check.

// Run-length encoding of maximal filled runs, in order. [0,1,1,0,1] -> [2, 1].
export function runLengths(line) {
  const out = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]) {
      run++;
    } else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out;
}

// The canonical internal clue for a line = its run-lengths ([] for an all-empty line).
export const clueOfLine = runLengths;

// Display form: an empty clue shows as a single 0 on the selvedge margin.
export function displayClue(clue) {
  return clue.length === 0 ? [0] : clue.slice();
}

// Minimum length a line must have to hold this clue: the run cells plus one gap between
// adjacent runs. [] -> 0, [5] -> 5, [3,2] -> 6, [1,1,1] -> 5.
export function minLineLength(clue) {
  if (clue.length === 0) return 0;
  let sum = clue.length - 1; // mandatory gaps
  for (const c of clue) sum += c;
  return sum;
}

// Total filled cells a clue demands.
export function clueFilledTotal(clue) {
  let s = 0;
  for (const c of clue) s += c;
  return s;
}

// Satisfaction predicate: does this concrete (fully-decided) line match the clue exactly?
export function lineSatisfied(line, clue) {
  const r = runLengths(line);
  if (r.length !== clue.length) return false;
  for (let i = 0; i < r.length; i++) if (r[i] !== clue[i]) return false;
  return true;
}

export function cluesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

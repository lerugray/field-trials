# The invented eighth twist — PROPOSAL (ratification-gated)

Status: **PROPOSED, awaiting operator ratification.** Per the studio amendment, the
invented twist is builder-proposed DURING M1 (while the solver architecture is live), its
prover extension prototyped now, and its shelf ships only at M3b AFTER the operator
ratifies. CLAUDE.md rule 10 makes this explicit. Nothing here ships until ratified.

## The twist: THE BIAS

In addition to the row and column counts, a BIAS card carries counts along the cloth's
diagonal grain — the "\" diagonals (cells sharing `x - y`). The house frames it as reading
the fabric "on the bias": a bolt cut on the bias has its own count along the diagonal
thread. The player deduces using rows, columns, AND bias counts together.

Convention (fixed, the way NEGATIVE CLOTH's convention is fixed in the seed):
- Only the "\" family (top-left to bottom-right). One diagonal family, not both — two would
  over-constrain and muddy the read.
- Each bias line's clue is the ordered run-lengths of filled cells along that diagonal,
  identical run/gap semantics to a row or column. An empty diagonal shows `0`.
- Bias counts sit on a third selvedge margin (the lower-left corner), visually distinct
  from row/column counts so the read stays legible (accessibility: distinct placement, not
  hue alone).

## Why it preserves the no-guess law (the core requirement)

A bias diagonal is just another 1D line. The certifier already solves ANY line with the
same forced-deduction line solver and iterates all lines to a fixpoint. The prover
extension is therefore nothing more than **adding the diagonal lines to the certifier's
line set** — no new deduction mode, no new proof obligation, no bifurcation. A BIAS puzzle
is certified guess-free by the exact same machinery; if it stalls, it is rejected exactly
as a base puzzle would be.

## Prototype (built now, `prototypes/bias.js`, NOT in the shipped bundle)

`certifyBias(puzzle)` builds rows + columns + bias diagonals and runs the generalized
`solveLines` fixpoint over the existing `lineSolve`. Demonstrated in
`test/bias-prototype.test.js`:
- The prover extension certifies BIAS puzzles with the same guess-free guarantee.
- Bias STRICTLY adds deductive power: the 2x2 checkerboard, the 4x4 permutation diagonal,
  and the 4x4 checkerboard-class grid all STALL under rows+columns alone (they need a
  guess) but become fully GUESS-FREE once the bias counts are added. This is exactly the
  property a good twist wants: it opens puzzles the base machine cannot express while
  keeping the guarantee intact.

## What ratification would authorize (M3b, not now)

- A BIAS shelf: teaching puzzle + 12 puzzles, each proved guess-free under rows+cols+bias.
- The third selvedge margin in the board view; a bias-count renderer; a hint entry that
  can point at a bias line and name the technique (the hint engine already generalizes to
  arbitrary lines — same as the certifier).
- A generator that authors bias puzzles from motifs and proves each.

## The operator's decision

- Ratify THE BIAS as the invented eighth twist? (Builder's lean: YES — it fits the loom
  fiction, reuses the entire solver/hint/certifier architecture with zero new proof risk,
  and demonstrably expands the guess-free puzzle space.)
- Or direct a different invented twist, in which case this prototype is discarded.

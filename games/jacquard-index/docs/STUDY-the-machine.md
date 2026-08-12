# STUDY — the nonogram machine (clean-room characterization)

Empirical characterization of the reference's MECHANICS only (hard-rule 1). The studied
reference is Nintendo's nonogram line. This dev doc records the rules and the quality-of-
life set in our own words; it is the specification the engine, solver, and generator are
built and tested against. No reference puzzle content, pictures, characters, or trade
dress is taken. The word for the reference never appears in-game or in any player-facing
string; in-game we use the house's own vocabulary (see the terminology map below).

---

## 1. The core rules (the machine)

A puzzle is a rectangular grid of W columns by H rows. Every cell has one true state in
the solution: **filled** or **empty**.

Each row and each column carries an ordered list of **clue numbers**. A line's clue list
names, in order, the lengths of the maximal consecutive runs of filled cells in that line.
Between two adjacent runs there is at least one empty cell. A line with no filled cells
has the clue list `[0]` (rendered as a single 0). The clues do NOT state where the runs
sit, only their lengths and order.

The player deduces, for every cell, whether it is filled or empty, such that every row and
every column simultaneously satisfies its clue list. A puzzle is **solved** when the grid
of filled cells exactly matches the (unique) solution.

Worked example — a line of length 10 with clues `[3, 2]`:
- exactly one run of 3 filled, then one or more empty, then exactly one run of 2 filled;
- any empty cells may pad the front, the middle gap (>= 1), and the back.

### Formal line-satisfaction predicate (what the engine checks)

Given a line's cell states and its clue list `C = [c1..ck]`:
1. Compute the run-length encoding of maximal filled runs, in order: `R`.
2. The line is satisfied iff `R == C` (with the convention that an all-empty line has
   `R == []` and matches `C == [0]` or `C == []`).
This predicate is the ground truth for line completion, auto-X, and the win check.

### Uniqueness and the no-guess law (this game's soul, hard-rule 4)

A shipping puzzle must have (a) exactly ONE solution grid consistent with all clues, and
(b) a solution reachable by pure logical deduction from the empty grid — never requiring
the player to assume a cell, follow the consequences, and backtrack (bifurcation). Both
are machine-proved before a puzzle ships. See the technique ladder (section 4): the solver
only ever applies forced deductions; if it stalls before completing, the puzzle is
rejected as guess-requiring.

---

## 2. The verbs

Three player actions on a cell:

- **Fill** — assert this cell is filled (lay a stitch). Toggling a filled cell clears it.
- **Mark-empty (X)** — assert this cell is empty (mark it crossed / bare warp). This is a
  player annotation, not required to win, but essential for tracking deductions. Toggling
  an X clears it.
- **Pencil** — a tentative mark of lower visual weight, for "maybe filled / maybe empty"
  reasoning. Pencil is never required and never counts toward the solution. Auto-X must
  never overwrite a pencil mark (studio amendment, M1 feel spec).

A cell therefore has an INPUT state (what the player has marked: empty/filled/crossed,
plus an optional pencil overlay) distinct from its SOLUTION state (filled/empty truth).

---

## 3. The quality-of-life set (QoL as law, seed streamline #2)

Named in the seed; each is binding:

- **Drag-painting** — press and drag applies one action across many cells. Drag semantics
  (studio amendment): a stroke applies only the action of its FIRST cell, and only to
  cells currently in the SAME prior state as that first cell; crossing a cell in a
  conflicting state ENDS the stroke; the whole stroke undoes atomically; revisiting a
  cell within the stroke corrects it back. A click-vs-drag threshold keeps a shaky click
  from smearing.
- **Auto-X on satisfied lines** (toggle, default ON after the primer's one manual-X
  teaching moment) — when a line's filled runs fully satisfy its clues, the remaining
  cells of that line are auto-marked X. Auto-X never overwrites a pencil mark.
- **Clue dimming** — as a line's clue runs are provably satisfied, the corresponding clue
  numbers dim, so the player sees at a glance which clues are "spent."
- **Unlimited undo / redo** — every state change is undoable; drag strokes are one unit.
  Save/resume preserves pencil marks AND full undo history (studio amendment).
- **Pencil marks** — see verbs. Distinct visual weight.
- **No lives, no forced timer** — the classic mistake-penalty (a wrong fill costs
  something) exists ONLY as an opt-in cartridge rule (the HOUSE RULES shelf). The default
  experience never punishes.

Accessibility laws that touch the machine (named at M1, land per their milestone):
- Hints are always-visible, uncapped, zero-penalty, never flagged in stats.
- Two-thread sets distinguish threads by SHAPE/stitch, never hue alone (hard-rule 6).
- Per-puzzle difficulty (deepest technique tier) is shown on the card.

---

## 4. The technique ladder (enumerated now; the solver reports the deepest tier used)

The certifying solver applies ONLY forced deductions, in rising cost order, until the grid
completes or it stalls. A stall before completion => the puzzle requires a guess => reject.
Each puzzle's difficulty, unlock pacing, and hint ladder derive from the deepest tier the
solver needed. The no-guess law caps the ceiling at T4 by design.

- **T1 — trivial fill / line-complete.** A line whose clue sum + minimum gaps equals its
  length is fully forced (e.g. clue `[5]` in a length-5 line; clue `[2,2]` in length-5).
  A line already satisfied forces X on its remaining cells. A line with clue `[0]` forces
  all X.
- **T2 — overlap / simple forcing.** The classic overlap: pack every run as far left as
  possible, then as far right; cells filled in BOTH packings are forced filled. Also:
  when a run cannot reach a cell (bounds/edge forcing), that cell is forced by
  elimination. Operates one line at a time from that line's clues + current marks.
- **T3 — edge-anchoring + cross-line propagation.** Using an already-known cell (from the
  crossing line) as an anchor to place or bound a run; iterating deductions BETWEEN rows
  and columns until fixpoint. This is where most "medium" puzzles live.
- **T4 — bounded-split elimination (still guess-free).** A forced deduction that requires
  reasoning over the small, bounded set of placements of a single line's runs: a cell is
  forced filled/empty because it holds that way in EVERY still-legal placement of that
  line's clues (given current marks). This is exhaustive over one line's placement set,
  not a guess-and-backtrack over the whole grid, so it preserves the no-guess guarantee.

The generator is verified against an ORACLE, not itself (studio amendment): a brute-force
enumerator cross-checks uniqueness and solution agreement on every puzzle <= 10x10 in the
suite; constructed ambiguous fixtures (checkerboard-class) are must-reject negatives;
known technique-demanding fixtures are positive tests. The generator/certifier and the
hint system must not silently share one solver: the oracle covers the certifier; hints
replay the certified deduction path.

---

## 5. What we deliberately do NOT take

- No reference puzzle grids, pictures, or solution art. All motifs are our own code-drawn
  textile-house imagery (seed PUZZLE CONTENT).
- No characters, mascots, UI chrome, fonts, sounds, or trade dress from the reference.
- The reference's name never appears in-game or in player-facing text.
- No cross-puzzle resource meta-game (thread-economy is cut from v1): a shared-budget
  reasoning mode is a different machine and threatens the no-guess law.

---

## 6. Terminology map (reference mechanic -> the house's own vocabulary)

The engine uses neutral internal names; the UI uses the house register.

| mechanic                | internal        | in-game (register)                 |
|-------------------------|-----------------|------------------------------------|
| grid                    | grid            | pattern paper / the draft          |
| filled cell             | FILLED          | a stitch (thread laid)             |
| empty cell (marked)     | CROSSED (X)     | bare warp / crossed                |
| tentative mark          | PENCIL          | pencil                             |
| clue number             | clue            | count (on the selvedge margin)     |
| a run of filled cells   | run             | a thread run                       |
| solved reveal           | solution grid   | the woven cloth / the pattern      |
| a cartridge / card-set  | set             | a shelf of the index               |
| difficulty tier         | tier (T1..T4)   | the house's guarantee band         |

This vocabulary is the source of truth for player-facing strings.

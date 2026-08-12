# STUDY — the panel-dissolving machine (clean-room characterization)

This document characterizes the MECHANICS of the reference machine
(Tetris Attack / Panel de Pon, SNES) from documented behavior, so ALKAHEST can
rebuild them precisely and independently. It is a specification, not a copy:
measure-and-specify, never lift expression. Nothing here names or reproduces any
character, theme, title, art, or sound of the reference. Values marked TUNE are
ALKAHEST's own targets; the shape of each rule is what the reference fixes.

The ALKAHEST engine is written against THIS document and its test fixtures.

The deterministic cascade performance fixtures run in the normal
`node --test` suite. The single-tick 16.6ms wall-clock measurement is isolated
from parallel-suite CPU contention and keeps the actual 60fps threshold. Run it
separately and serially with:

`ALKAHEST_RUN_PERF=1 node --test --test-concurrency=1 test/perf.test.js`

---

## 0. Coordinate + timing conventions

- The well is a grid of cells, **6 columns wide** (`COLS = 6`), variable visible
  height. Internally we keep a few hidden rows above the visible top for
  spawn/top-out bookkeeping (`VISIBLE_ROWS = 12` visible, `+ buffer`).
- Row 0 is the **bottom**. Rows increase upward. The stack RISES: new material
  enters from the BOTTOM and pushes everything up.
- A **cell** holds either empty, one live panel of a reagent type, or part of a
  dross slab (garbage). Panels also carry transient states: falling, matched
  (flashing), clearing (dissolving), landed-this-tick.
- Time is simulated in fixed ticks; the sim is authored **frame-rate
  independent** and deterministic given (seed, input log). Rendering never feeds
  back into the sim (a studio requirement: swap-during-fall etc. resolve in SIM
  tests independent of rendering).

## 1. The rise

- The whole stack scrolls upward continuously at a **rise rate** (cells/second),
  expressed as sub-cell offset accumulating until it crosses a cell boundary,
  at which point a **new bottom row** of random panels is committed and every
  panel's row index shifts up by one.
- Rise rate **accelerates** over a bout by level/act (TUNE: base ≈ 0.10
  cells/s early, ramping; Nigredo runs denser/slower per the Weiss amendment —
  see §11). Manual raise (§4) and stop-time (§8) modulate it.
- The next bottom row is **previewed** (partially visible below the play line)
  so the player can plan; the preview row is not yet matchable/swappable.
- **New-row generation must not spawn an immediate match**: the committed bottom
  row is generated so no three-in-a-row exists on arrival (reroll offending
  cells). This is a named correctness rule and a test fixture.

## 2. The cursor and the only verb: swap

- The cursor spans **two horizontally-adjacent cells** (`1×2`). It moves up,
  down, left, right within the well. It **CLAMPS at edges — no wraparound**
  (studio decision).
- The single action is **SWAP**: exchange the contents of the cursor's two
  cells. This is the ENTIRE input vocabulary for material manipulation. No
  rotation, no lifting, no dropping.
- Swap legality:
  - Swapping two panels exchanges them.
  - Swapping a panel with empty **moves** the panel sideways into the empty
    (this is how you slide a panel over a gap).
  - Swapping two empties is a no-op.
  - **Dross/garbage slabs cannot be swapped** and cannot be moved by a swap.
  - A cell currently **clearing** (mid-dissolve) cannot be swapped. A **falling**
    panel CAN be swapped at the instant it is in a cell (this enables advanced
    play and must be resolved deterministically — a named SIM test).
- Swap is **instantaneous** in the sim (a short cosmetic animation may play in
  render, but the sim state changes on the tick the swap commits).
- **Swap input buffering** (streamlining mandate + studio number): a swap
  pressed while the target is momentarily illegal (e.g. a cell finishing a
  fall) is **buffered and executed when it becomes legal**, within a window of
  **≈150 ms** (TUNE). Acceptance is a measured number, not an adjective.

## 3. Gravity (falls)

- After any swap or clear, panels with empty space beneath them **fall** to rest
  on the first support below (panel or floor). Dross slabs fall as rigid blocks.
- Falls are resolved as a settling process; panels in a column fall together
  maintaining order. Falling has a short travel time (TUNE) but the **landing
  order and resting positions are a pure function of the pre-fall state** and
  are unit-tested independent of animation.
- A panel that lands may create a new match (see chain, §6).

## 4. Manual raise

- The player can **force the stack upward faster** by holding RAISE (studio
  decision: manual raise is IN — the reference's skill verb for dross timing
  and stack cycling). While held, the rise offset advances rapidly until the
  next row commits, then normal rise resumes.
- Manual raise cannot be used to force a top-out shove during an active clear in
  a way that violates the clear-vs-rise ordering (§7); it modulates rise, it
  does not bypass resolution order.

## 5. Matching

- A **match** is **3 or more** panels of the **same reagent type** contiguous in
  a **row** (horizontal) or **column** (vertical). Diagonals never match.
- All cells that are part of any qualifying line clear **simultaneously** on the
  same resolution step. Overlapping horizontal+vertical lines sharing a cell
  form a single combined clear group (an **L / T shape**): the shared cell
  clears once; all involved cells clear together.
- Only **settled** panels match. Falling and clearing panels do not participate
  in match detection until they settle.
- Matches are detected **after** the triggering event resolves (post-swap,
  post-fall), never mid-motion.

## 6. Chains and combos (the heart)

Two distinct multipliers; each gets a DISTINCT visual + audio vocabulary and an
on-screen readout (studio requirement, taught in the tutorialette):

- **COMBO** = **4 or more panels cleared in a single clear group / single
  resolution step** (a wide simultaneous clear). Combo size = number of panels
  cleared at once. Combo is about BREADTH in one step.
- **CHAIN** = a clear caused by panels that **fell because of a previous clear**
  in the same cascade. The chain counter starts at 1 for the initiating clear;
  each subsequent clear that is enabled by the settling from the prior clear
  increments it (×2, ×3, …). Chain is about DEPTH across steps.
  - Chain continuation is tied to **causality**, not a global timer: when a
    clear empties cells, panels above fall; if those fallen panels form a new
    match when they settle, the chain continues. Panels NOT involved in the
    cascade do not extend the chain.
  - A cell is "chain-eligible" if it fell as a consequence of the ongoing
    cascade; the engine tags fallen panels with the current chain id so a match
    among them increments the chain. Tag clears when the cascade fully settles
    with no new match.
- **Active chaining** (the skill ceiling): the player may swap **during** the
  cascade to route falling panels into new matches, extending the chain. Swaps
  during freeze/cascade are legal (§8) and are the depth mechanic.
- Chains/combos are the offense currency: they charge the ATHANOR gauge (M3) and
  send DROSS to the opponent (M2). Bigger chain/combo = more/heavier dross.

## 7. Clear-vs-rise resolution ordering (pinned)

On each simulation tick, resolve in this fixed order (a studio requirement:
the ordering is pinned by explicit rule and by test):

1. **Apply buffered/instant input** (legal swaps).
2. **Resolve gravity** one settling step (advance falls; land what rests).
3. **Detect matches** among newly-settled panels; if any, begin their clear and
   update chain/combo tags. A clear in progress **freezes the rise** (§8).
4. **Advance clear animations**; when a clear group finishes dissolving, empty
   its cells (enabling the next gravity step → possible chain).
5. **Advance rise** (auto + manual) ONLY if no clear is currently active
   (rise is frozen during clears/cascades). Committing a new bottom row happens
   here when the offset crosses a cell.
6. **Check top-out / near-death** state (§9).

Consequences fixed by this order:
- A cascade runs to completion (all chained clears) before the rise resumes.
- **Dross lands only BETWEEN cascade steps, never mid-step** (M2 rule; chain
  continuity is sacred).

## 8. Stop-time (rise freeze)

- Any active clear **freezes the rise timer** for its duration; chains extend
  the freeze because each new clear re-freezes. This is the rescue mechanic at
  near-death: clearing buys time.
- **Diminishing freeze** (studio decision): within one sustained freeze
  sequence, **consecutive freezes grant diminishing duration** so an infinite
  stall is impossible. (TUNE: freeze grant decays, e.g. ×0.8 per consecutive
  link, floored.)
- **Swapping during freeze is legal** (and is how active chaining is performed);
  a named test asserts it.

## 9. Top-out and near-death

- **Top-out (loss)**: if a settled panel occupies a cell above the top play line
  and the rise attempts to commit another row (i.e. the stack is jammed to the
  ceiling) with no active clear to save it, the bout is lost.
- **Near-death** is COMMUNICATED before loss (studio requirement): when the
  stack crosses a warning height, enter a warning state — escalating audio
  sting, a **dying-column flag**, and a **grace window** (a short period where
  the rise pauses at the brink to give the player a last action). The warning
  state and grace window are testable sim states, not just VFX.

## 10. Determinism and performance (tested from M1)

- **Determinism / seed-replay**: given a seed and an input log (per-tick action
  list), the entire bout is reproducible bit-for-bit. A replay test asserts two
  runs from the same (seed, inputs) reach identical grid states each tick. This
  underwrites AI parity (M2) and replay-a-seed (M6).
- **Worst-case cascade perf fixture** (studio requirement, from M1): a
  near-full board contrived to cascade many chain links resolves within the
  60fps tick budget. The 60fps mandate is tested early, not deferred to M7.

## 11. The Weiss amendment — act rules are PHYSICS (per-act machine changes)

Each opus act changes ONE rule of the machine (felt in the hands), taught by
that act's first bout. The engine exposes these as per-act machine parameters;
the shape is fixed, values are TUNE:

- **Nigredo** — heavier gravity, slower falls (dark, dense): longer fall travel
  time, slower base rise.
- **Albedo** — volatile clears: a dissolution may **sublimate one adjacent
  panel** (an extra adjacent cell is consumed by the clear), changing cascade
  geometry.
- **Citrinitas** — tighter dross exchange: both sending and receiving dross are
  amplified (M2 hook).
- **Rubedo** — all-or-nothing: chains below ×2 yield nothing; chains at/above ×2
  burn brighter (bigger reward).

No genre escape valves: no undo, no infinite-time mode outside the accessibility
floor, no safe banking.

---

## Named test fixtures (studio-mandated; authored in M1)

Each becomes an explicit, adversarial test in the engine suite:

1. **Two independent match groups clearing on the same tick chain SEPARATELY** —
   two disjoint clears occurring the same step must maintain independent chain
   ids; one's cascade must not falsely extend the other's counter.
2. **L / T overlapping matches** — a horizontal and vertical line sharing a
   cell form one combined clear group; the shared cell clears once; combo size
   counts each cell once.
3. **Simultaneous row + column matches** (non-overlapping) resolve together and
   are attributed correctly to combo/chain.
4. **Clear-vs-rise ordering** — a contrived state where a rise boundary and a
   clear coincide; the pinned order (§7) is asserted deterministically.
5. **Swap-during-fall** — a swap issued while a panel is mid-fall resolves per a
   fixed rule, verified in SIM independent of rendering.
6. **Determinism / seed-replay** — identical (seed, input log) ⇒ identical
   per-tick grid states.
7. **Worst-case full-board cascade perf** — deep-chain contrived board resolves
   within the 60fps tick budget.
8. **New-row-no-instant-match** — committed bottom rows never arrive pre-matched.
9. **Swap-buffering window** — a swap pressed up to ≈150 ms early executes when
   it becomes legal.
10. **Diminishing freeze** — consecutive stop-time links grant decreasing
    duration; no infinite stall.
11. **Near-death grace** — crossing the warning height enters the warning state
    with a grace window; top-out only fires per §9.

These fixtures ARE the acceptance surface for M1's engine. Chain detection is
the heart and is tested adversarially.

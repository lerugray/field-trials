# THE JACQUARD INDEX — skeptical pre-release audit (2026-08-11, opus examiner)

Verdict: **FIX-FIRST**. Artifact audited: dist/jacquard-index.html 249,008 bytes,
sha256 753b84e8…0157d. Suite re-run 235/235. Evidence (probe scripts, outputs, 40 frames,
in-game log exports): orchestrator scratchpad `audit-jacquard/` — probe scripts are
reusable; the fix round re-runs them as its acceptance.

## Findings, most severe first

1. **CONFIRMED — HOUSE RULES: pressing UNDO after a mistake destroys the board.** One wrong
   stitch = strike 1. Each `Z` restores the struck fill and `applyPenalty` immediately
   re-strikes the same cell; three presses tear the cloth, `board.reset()` wipes every mark
   and the undo history. The hint engine's own text says "Undo to continue."
   (`playScene.js applyPenalty()` vs `board.undo()`.)
2. **CONFIRMED — MIRROR-WEAVE: undo is completely inert.** `applyFold()` re-mirrors the mark
   next update and pushes a new undo entry, so the stack never drains (pinned at 2 across 6
   undos). Frame after 12 undos byte-identical to frame after the stitch. "Unlimited undo"
   is a seed law.
3. **CONFIRMED — `COLS is not defined`: ArrowUp/ArrowDown dead in every card drawer + a
   persistent in-game FAULT banner.** `indexScene.js:91-92` references an undeclared
   identifier. Footer reads "ARROWS SELECT"; the natural keypress paints a red fault banner
   within a minute of boot.
4. **CONFIRMED — the 5x7 font lacks `;` `'` `*`; all fall back to `?`.** First-boot blurb
   reads "FILL THE COUNTS**?**…"; all 26 TWO-THREAD and COUNTING-HOUSE cards render their
   proof guarantee as "T?" — the game's central claim surface reads as unproved.
5. **CONFIRMED — every shelf's house-voice blurb is authored, unit-tested for existence,
   and never rendered.** `shelf.blurb` has zero consumers. THE LOOM's blurb is the only
   statement of the base rules; no other tutorial surface exists.
6. **CONFIRMED — a new drawer inherits the previous drawer's card index** (`indexScene.js:48`
   clamps instead of resetting): TWO-THREAD opens on its hardest 6x6 card, not its teaching
   card.
7. **CONFIRMED (minor)** — Escape dead on the shelf list; title unreachable after opening
   the index.
8. **CONFIRMED (minor)** — no save/resume (zero storage APIs).

## What survived attack

- **The no-guess law holds:** 91/91 shipped cards proved guess-free by an INDEPENDENT
  complete line solver (exhaustive line enumeration + intersection to fixpoint, sharing no
  code with the repo's solver/oracle/certifier), each twist checked under the convention the
  player actually reads.
- **No degenerate strategy works:** null input, key spam, 400 random keys + 60 random drags,
  fill-everything, cross-everything, 180 interleaved undo/redo — no completion, no
  corruption, no illegitimate progression. Hint spam uncapped but non-mutating (an
  accessibility law, not an exploit).
- **THE BIAS gate holds** under every input path tried; drawer 6 / PENDING; prover outside
  the bundle.
- **Clean posture:** 78 cards solved with real keyboard input across six shelves — 0 console
  messages, 0 page errors, 0 non-file requests.

## Release path

Fix findings 1–6 (7–8 at fixer's discretion; 8 acceptable for a Field Trials playtest if
disclosed in the card copy), re-run the audit's probe scripts + the degenerate battery,
then release per the standard Field Trials mechanics.

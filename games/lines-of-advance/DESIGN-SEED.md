# LINES OF ADVANCE — design seed

A faithful-but-streamlined digitization of the *mechanics* of Guy Debord's A Game
of War (25×20 board, symmetric armies, the lines-of-communication system,
deterministic summed combat), presented as a classy, sleek, modern chess program.
Not a wargame-hobby artifact. Not a situationist museum piece. The board is a
calculation surface, not a gallery.

## Operator locks (Ray, 2026-08-07 — binding)

- **Mechanics only.** Original rules prose and board art; neutral product name
  (LINES OF ADVANCE); "inspired by Debord" attribution in docs only.
- **v1 = the base game, faithful.** Streamlining means setup presets and UX
  affordances (visible comms audit, legal-move surfacing), never rules
  simplification.
- **Variant queue, post-v1, operator-gated, in order:** (1) Combat Results Table
  dice-odds combat variant; (2) 1981 CRT-display skin (phosphor monochrome,
  command-line orders, visible engine ticks); (3) fog-of-war referee hybrid
  (hidden boards, engine as neutral referee).
- **Engine:** real minimax/alpha-beta with comms-aware evaluation, lichess-style
  presentation (eval bar, hints, analysis). Stockfish is chess-only and ruled out;
  nothing fake stands in for search.
- **Canonical Hammerstein is wired in twice:** the seed passed an adversarial
  audit before M1 fired, and the no-overclaim prose gate (CLAUDE.md rule 4) covers
  every player-facing sentence.

## The register (from docs/REGISTER-NOTES.md)

Clinical, operational clarity with the responsiveness of a modern chess GUI.
Austere palette, minimal chrome, every interaction auditable and reproducible.
The Ray-shaped angle: mechanical autopsy and engine verification — strip the
mythos, keep the chassis, use the engine to stress-test the design rather than
to decorate it. Build the machine, verify it, ship it, let the play do the
talking.

## The contract (docs/SCOPING-MEMO.md)

**Build order per the 2026-08-07 seed audit: M2 FIRST** (board/state/visual
chassis has zero rules dependency), M1 (rules ledger — gated on a real source
document at docs/source/) in parallel or after, then M3 legal movement +
communications audit → M4 combat/victory/complete hotseat → M5 MVP engine +
analysis → M6 polish/register gate/v1 RC. Each milestone's acceptance check is
performable by the operator without reading code. The signature UI element is the
communications-line visualization.

## Non-negotiables inherited from the memo

Rules ledger discipline (VERIFIED vs VERIFY-AT-BUILD, no invented details);
hotseat before engine; single-file deliverable; anti-goals as listed in the memo
§7; kill criteria in memo §8.

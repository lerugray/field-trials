# Operator directions — 2026-08-08 (second field look, post-UI-round)

## Field verdict (Ray, on the M4-ui-round build)

"Looks much better now — tutorial walkthrough is nice too and makes sense... otherwise
works/looks good for now, can continue to be pushed." The UI round's fixes are accepted;
the corrected opening + walkthrough passed operator eyes.

## New directive: piece-style variants (player-selectable)

Two additional rendering variants for the pieces, alongside the current default:

1. **NATO counter variant** — pieces drawn as wargame counters with NATO-style unit
   symbology (infantry/cavalry/artillery/relay/arsenal mapped to appropriate symbol
   conventions), in the game's existing restrained palette.
2. **Chess-like variant** — pieces drawn as chess-register glyphs (staunton-silhouette
   spirit adapted to this game's unit types).

Player-selectable in settings/session menu; default stays the current style; choice
persists. Both variants must keep the communication/isolation overlays fully readable.
These are RENDER-ONLY variants — zero engine or rules impact. Proof sheet per variant
(all piece types, both sides) for operator certification.

## M5 go (the priority — Ray: "particularly interested to see how the AI turns out")

Proceed to M5 per SCOPING-MEMO: legal move generator, material/comms-aware evaluator,
minimax/negamax + alpha-beta, optional iterative deepening, eval bar, optional hints.
Acceptance check as written: human-vs-engine game, legal moves within browser budget,
evaluation visibly responds when a communication route is cut. Honesty constraint binds:
never represent as Stockfish-class; original restrained prose for any hint text.

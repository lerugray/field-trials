# Operator field notes — 2026-08-08 (first look at M3.1/M4 board)

Ray's first-pass verdict: "looks good/decent." Three directives from the same look, all
binding for the next UI round. These outrank DESIGN-SEED where they touch the same ground.

## 1. Whole board visible without scrolling; zoom is opt-in

The full board must fit the viewport at default zoom — no scrolling required to see the
whole battlefield. Zooming IN is a player choice (wheel/pinch/buttons), never a
requirement. Fit-to-viewport at load, letterboxed as needed; preserve readability of
unit glyphs at the fitted scale (if glyphs become unreadable at fit scale on common
laptop viewports, that is a real design problem to surface in the lane report, not
silently accept).

## 2. "All units started out of supply" — DIAGNOSE BEFORE FIXING

At game start every unit appeared to be out of supply/communication, and Ray could not
tell what was going on. Two hypotheses with different fixes — settle which is true FIRST
against the printed rules (the rules-truth law applies; the Nicholson-Smith designer
text + RSG rules in the repo's rules ledger are the authority):

- (a) **Engine/scenario bug**: the official starting deployment should have units in
  communication with their arsenals, and our comms propagation or arsenal placement is
  wrong. Then fix the engine/scenario and pin it with a test asserting the rules-correct
  initial comms state.
- (b) **Correct per rules but illegible**: if the rules genuinely start units
  unconnected, the state is fine and the UI is the defect — the indicator reads as an
  alarming error state instead of a normal starting condition.

Either way the LEGIBILITY half is mandatory: a first-time player must be able to tell
what the supply/comms indicator means and what to do about it (see #3).

## 3. First-time-player walkthrough

A first-launch walkthrough/tutorial, in the lichess register: quiet, minimal, skippable,
never modal-heavy. It should teach the core loop (what the pieces are, what communication
lines mean, how a turn works, how you win) in a handful of steps anchored to the real
board — not a manual dump. Propose the exact shape in the lane report; implement the
minimal version. Never shown again after completion/skip unless re-invoked from a menu.

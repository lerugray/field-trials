# OOR Skeptical Playthrough Audit — 2026-08-11

Date: 2026-08-11

authority: skeptical operator playthrough stand-in

evidence bundle: [docs/proofs/playthrough-20260811/playthrough-20260811-raw.json](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/playthrough-20260811-raw.json)

Build context: Built game at repo HEAD per README/CLAUDE.md flow, executed against Chromium in sandboxed headless mode with launch args `--single-process --no-zygote --disable-gpu --disable-software-rasterizer`, Playwright imported from `/Users/rayweiss/Desktop/Dev Work/bloody-april-digital/node_modules`.

## Run summary

Seed used for final full run: [4](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/playthrough-20260811-raw.json).

Full-session path: [intake](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/full-intake-20260811-150558.png), [combat](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/full-combat-20260811-150559.png), [march](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/full-march-20260811-150559.png), [camp](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/full-camp-20260811-150602.png), [route](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/full-route-20260811-150603.png), [defeat](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/full-defeat-20260811-150604.png).

Null-input probe path: [march](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/null-input-march-20260811-145629.png), [combat](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/null-input-combat-20260811-145629.png).

## Per-item verdicts

1. Text crispness + truncation check — PASS with caveat.
Evidence in JSON: all visited screens in full run report `outOfBounds = 0` and `antialias = 0`; full path captured one screenshot per screen state above. `textCollisions` had isolated non-fatal hits in combat and march samples, but no truncation/out-of-bounds failure signal was emitted. Route/during-defeat state were clean on seam metrics.

2. Score variation (audio event stream) — PASS.
Evidence: score probe ran 3 consecutive passes with non-identical streams (`score.distinct = true`), different `signature`, `head`, and `n` values (`193`, `148`, `148`). Screenshots: [score-pass-1-combat-20260811-145625.png](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/score-pass-1-combat-20260811-145625.png), [score-pass-2-combat-20260811-145625.png](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/score-pass-2-combat-20260811-145625.png), [score-pass-3-combat-20260811-145626.png](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/score-pass-3-combat-20260811-145626.png).

3. Collision band / seam fix — PASS on sampled path.
Evidence: `routeCollisionSamples` for leg `1` has empty arrays for `collisions`, `textCollisions`, and `outOfBounds`. Route entry screenshot for visual review: [full-route-20260811-150603.png](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/full-route-20260811-150603.png).

4. Shop/route tinting — PARTIAL.
Route tinting is present in the route-state capture and was visually stable. No shop-state was reached (`shopVisits = 0` in full run), so shop tinting cannot be directly verified in this full branch.

5. Credits clean — PARTIAL.
Credits images exist in proof folder (`full-credits.png`, `score-1-credits.png`, `score-2-credits.png`, `score-3-credits.png`) and were inspected, but the final full run JSON did not include a credits-state visit, so this remains a secondary verification path.

6. Null-trivial-input probe — PASS for deadlock detection behavior.
Null-input probe ended with `reached = stagnant`, `screen = combat`, `tick = 14`, `leg = 0`, and `reason = no state change without further input`; screenshot trail confirms no forward progress despite repeated sampling. Evidence: [playthrough-20260811-raw.json](/Users/rayweiss/Desktop/Dev Work/office-of-the-road/docs/proofs/playthrough-20260811/playthrough-20260811-raw.json).

7. Full breadth requirement (failure + success + several legs/shops) — FAIL.
Failure was reached (`full.defeat: true`, `end.reached = "defeat"`, `cause = reduced`) with screenshots and summary present. However `routeVisits = 1`, `shopVisits = 0`, `reachedDocket = false` in final full run; requested multi-leg / shop-docked / success-path breadth was not fully observed under the audited deterministic control flow.

## Opinionated player-read (skeptical, demanding): 5-10 bullets

1. The visual refresh reads clean and sharper; the broad font change no longer looks soft at capture scale.
2. The game is playable but can become deterministic quickly; one seed collapses into repetitive march/combat pacing before meaningful branching.
3. The route crossing feels physically stable and visually intentional when reached.
4. Audio no longer smells static in repeated replay tests; stream variation is observable and reproducible.
5. Null-input still leaves the loop trapped in combat, so the game clearly has a dead-end state that should probably be either recoverable or made unmistakable as intentional hard-fail.
6. Missing shop/docket coverage in verified full path is the biggest confidence gap, because content and economy pacing cannot be confirmed.
7. I would not sign off until we can reproduce at least one successful docket path in the same strict playthrough lane.

## Decision

FIX-FIRST.

Blocking rationale: full-session breadth is incomplete in reproducible runs (only one route leg, no shop visits, no docket success), and credits/shop tint verification is not conclusively tied to the authoritative full run. The audio and text crispness checks pass, and the seam collision fix is holding on sampled geometry.

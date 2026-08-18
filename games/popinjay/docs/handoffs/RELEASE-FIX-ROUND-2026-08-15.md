# Release fix round — 2026-08-15 (gate findings, steps 2/3/7)

Source verdicts: docs/verification/release-gate-2026-08-15/ (step2-coldboot, step3-endstates,
step7-qa). Every fix lands with a test that FAILS without it (prove by mutation where the
item names one). Suite green before every commit (baseline 218/218). NEVER push.

## Blockers

1. **Viewport fill — integer-only scaling strands the game in a void.** Measured: 900x600
   → 1x = 480x300 (27% of screen area); 1440x812 (maximized Mac Chrome) → 49%; 1512x860 →
   44%; only exact 1440x900 hits 100%. Replace integer-only with best-fit scaling
   (fractional allowed, `image-rendering: pixelated` kept; quarter-integer snapping is an
   acceptable crispness compromise — implementer's call). ACCEPTANCE (measured, not
   asserted): presented playfield fills ≥90% of the limiting dimension at ALL of 900x600,
   1280x800, 1440x812, 1440x900, 1512x860, 1920x1080, 2560x1440.
2. **The fill gate that let this ship is CIRCULAR.** scripts/capture.mjs measures the
   canvas ELEMENT (always 100%), not the presented playfield. Rewrite it to measure the
   actual presented box from pixels vs the viewport (the step7 worker's method), threshold
   per item 1. Mutation proof: the rewritten gate must FAIL against the old scaler.
3. **ENTER on the title with a saved tour silently destroys it** (step7 MAJOR). Add a
   confirmation seam in register (the card idiom, e.g. "ABANDON THE SAVED TOUR?") before a
   new run overwrites a resumable save. R remains direct resume. Test: ENTER with live
   save never destroys without the confirm.
4. **Quit/close during CLEARED ribbon (or tour map / rehearsal / draft) voids the run
   silently** (step3 BLOCKER). Autosave stamps `world.cleared:true`, `classifySave`
   returns null, title boots byte-identical to fresh install — R dead, no notice. Fix the
   save lifecycle: those untimed between-beats states must classify RESUMABLE and resume
   at the between-stage beat (quit inside the draft must not rewind past the clear —
   step3 measured a lost clear + ticket). Any genuinely unresumable state must be LOUD
   (seed: failures are LOUD), never fresh-install-identical. Tests: quit/close at cleared
   ribbon, tour map, rehearsal, draft → relaunch shows resume → R restores; the
   draft-rewind case pins the kept clear + ticket.

## Minors

5. Post-victory boot dead-ends on the victory card — E/Escape inert (step3). Smallest
   correct fix (boot to title, or make the card's keys live per seed).
6. Pause is inert during the REHEARSAL burst; seed says pause works everywhere (step7).
7. Title banner collisions: resume ribbon overlaps the subtitle; SAVE UNREADABLE overlaps
   PRESS ENTER (step7). Layout offsets.
8. HUD label row flush to the viewport top edge — give it the framed-surface inset
   (step7 cosmetic).
9. Denied-fire is missing its third channel — the seed's "HUD slot flash" (step4 note;
   ring + click exist, slot shows FIRING unchanged). Implement the flash.
10. Victory card truncates the souvenir list mid-word (12 held, 4 shown; step3). Legible
    summary form in register (e.g. "+N MORE").

## Explicitly NOT in this round

- Draft-card icons (generic arrows) — art/taste; surfaced to Ray with the gate packet.
- Credits content + scorecard key listing — seed-silent, Ray's ruling class.
- Score B-strains — separate score lane, running in parallel on an isolated tree.

## Rails

Checkpoint-commit at every green state. After all items: rebuild, re-run the (rewritten)
fill gate at the seven viewports, re-run the full suite, and refresh the capture set with
NEW dated filenames. Deliverable: LANE-REPORT-RELEASE-FIXROUND-20260815.md at repo root —
per item: change, test name, mutation proof where named, evidence filenames. Checkable
claims only.

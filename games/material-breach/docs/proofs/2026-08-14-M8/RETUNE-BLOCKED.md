# ESCALATION RETUNE BLOCKED — 2026-08-14

The operator unpaused the M8 escalation-ladder retune and directed the dossier's proposal to be
implemented as the starting point. That starting point is committed locally at `457e043`:

- answer costs: 60/120/200g -> **30/60/100g**;
- pressure from a breaching incident: +1 -> **+2**;
- Cornerstone loss per uncovered threat point: 6 -> **3**;
- Cornerstone loss from a lapsed schedule: 20 -> **10**.

The standing battery remained **171 pass / 0 fail**. Nothing was pushed.

## Five-seed result

The dossier's five seeds and 120-cycle ceiling were rerun with its stated competent policy: answer
an affordable instrument, repair damage, designate every eligible claimed cell, continue carving
outward, fortify, and manufacture. The deterministic probe bounded each cycle's outward works sheet
at five excavation orders so expansion could not consume an unbounded number of actions before the
other named duties.

| seed | before: cycles / highest rung / answered | starting retune: cycles / highest rung / answered |
|---|---|---|
| a | 20 / Surveyor / 0 | 21 / Surveyor / 0 |
| b | 26 / Surveyor / 0 | 24 / Surveyor / 0 |
| c | 22 / Surveyor / 0 | 23 / Surveyor / 0 |
| d | 22 / Surveyor / 0 | 24 / Surveyor / 0 |
| e | 22 / Surveyor / 0 | 24 / Surveyor / 0 |

**The Guild Auditor and Licensing Inspector remain unreachable in all five runs.** No instrument
was answered. The proposed numeric retune therefore does not close the dossier defect.

## Why the shape conflicts with the target

This is not only a matter of selecting larger multipliers. `runLadder()` increments
`ladder.onTimeStreak` on every cycle at an active rung that does not expire a notice. At three such
cycles it lowers the current rung by one. This happens whether or not three notices were answered.

The proposal also asks for the next officer roughly every five to six cycles. Those two rules cannot
both advance the ladder as written:

1. A Surveyor is served and answered.
2. Three non-expiry cycles pass before the requested five-to-six-cycle next dispatch.
3. The automatic clean streak lowers Surveyor to no active officer.
4. The next dispatch is another Surveyor, not an Auditor.

Making pressure fast enough to beat the three-cycle softening does make later rungs appear, but it
bunches Surveyor, Auditor, and Inspector into consecutive or near-consecutive cycles. That removes
the binding local-dominance plateau and is therefore the wrong shape, even though a reachability
assertion could be made green. An experimental damage cap that lengthened the run also regressed the
standing zero-input and cheapest-spam deadlines, so it was not retained.

## Decision required

A successful retune needs authority to change the comeback lever's semantics, not only its numbers.
The smallest coherent option is to count timely **answered instruments** toward softening, instead
of counting any three non-expiry cycles. That would permit five-to-six-cycle plateaus while
preserving rung progress. The alternative is to withdraw either the three-cycle softening rule or
the five-to-six-cycle cadence target.

Per the operator's instruction, no such rewrite was improvised. The dossier was not amended with a
false successful after measurement, and no standing tier-reachability test was added for a condition
the retained simulation does not satisfy.

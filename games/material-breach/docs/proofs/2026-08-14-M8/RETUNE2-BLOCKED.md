# ESCALATION RETUNE ROUND 2 BLOCKED — 2026-08-14

The operator ratified the semantic correction proposed by `RETUNE-BLOCKED.md`: the comeback lever
now counts only timely answered instruments. Quiet cycles never advance `ladder.onTimeStreak`, and
the third timely answered instrument lowers the rung by one. The isolated semantic increment is
committed locally at `04435d8` with **172 pass / 0 fail**. Nothing was pushed.

The round-1 numbers were retained exactly:

- answer costs: **30/60/100g**;
- pressure from a breaching incident: **+2**;
- Cornerstone loss per uncovered threat point: **3**;
- Cornerstone loss from a lapsed schedule: **10**.

## Five-seed result

The dossier's exact competent policy was rerun unchanged for seeds a-e with a 120-cycle ceiling:
answer an affordable instrument, repair damage, designate every eligible claimed cell, continue
carving outward with at most five excavation orders per cycle, fortify, and manufacture.

| seed | cycles / close | highest rung | answered | first Surveyor / Auditor / Inspector | rung gaps |
|---|---|---|---:|---|---|
| a | 21 / condemned | Surveyor | 0 | 18 / absent / absent | n/a |
| b | 24 / condemned | Auditor | 0 | 20 / 24 / absent | 4 / n/a |
| c | 23 / condemned | Surveyor | 0 | 21 / absent / absent | n/a |
| d | 24 / condemned | Auditor | 0 | 20 / 24 / absent | 4 / n/a |
| e | 24 / condemned | Auditor | 0 | 20 / 24 / absent | 4 / n/a |

The Guild Auditor appears in three of five seeds, but only because the Surveyor's instrument lapses.
The Licensing Inspector appears in zero of five. No instrument is answered. The only observed
between-rung spacing is four cycles, below the required five-to-six-cycle plateau. The acceptance
target therefore remains unmet.

## Why the semantic correction is insufficient

The correction removes the automatic quiet-cycle rollback exactly as intended, which is why an
expired Surveyor can now advance to an Auditor. It does not make the first instrument affordable or
lengthen the tenure enough for a third rung.

Every answer attempt failed. Across the five runs, the competent policy held **2g to 26g** while a
Surveyor notice stood, below the retained **30g** cost. Three seeds then served the Auditor exactly
four cycles after the Surveyor because the Surveyor deadline elapsed; the facilities closed that
same cycle before another pressure plateau could form. The other two facilities closed with the
Surveyor still open.

This is an undershoot, not an overshoot, so the operator's instruction to retain the round-1 numbers
unless the semantic change overshot leaves those values unchanged. A further economy, damage, or
cadence retune would require another operator direction.

Per the stop condition, no tier-reachability regression was added for a condition the simulation
still fails, and the acceptance dossier was not marked closed.

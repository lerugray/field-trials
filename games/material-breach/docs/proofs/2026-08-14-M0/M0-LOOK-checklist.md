# M0 proof checklist — 2026-08-14

M0 is **architecture + reference study**. It has **no rendering surface**, so there is no LOOK
image to score (the visual LOOK checklists begin at M2 when the cutaway is drawn). M0's proof is
**structural**: the green battery (`battery.txt` in this folder) plus the checks below, each tied
to an M0 deliverable and the KEEP mechanic or law it stands up.

Battery at close: **26 pass / 0 fail** (see `battery.txt`).

| # | M0 deliverable / law | Where | Verified by |
|---|---|---|---|
| 1 | Pacing law enforced structurally (Gate 1, from M1, required green on a stub at M0) | `src/cycle.js`, `test/pacing.test.js` | greps logic source for wall-clock/timer tokens; asserts the sim advances only inside `commitCycle()`, that it is pure, and that out-of-order signing fails loudly |
| 2 | Determinism contract, `Math.random` banned (hard rule 4) | `src/rng.js`, `test/determinism.test.js`, `test/rng.test.js` | seeded named streams replay identically; independence across streams; a grep gate over logic source |
| 3 | The data model as pure data (facility, cells, rooms, posts, staff, treasury, orders, notices, ladder, loss object) | `src/model.js`, `test/model.test.js` | founding is deterministic in the seed; room-quality curve diminishes past the soft cap; treasury capacity mechanical; the single Cornerstone loss object at centre; unsurveyed rock stays concealed |
| 4 | Reference study, clean-room documentary | `docs/REFERENCE-STUDY.md` | room set / needs model / payday cadence / conversion chain characterised and mapped to our register; CUT list restated; states plainly it is documentary, not a teardown |
| 5 | REGISTER-SEED authored from §4.1 with cited exemplars | `docs/REGISTER-SEED.md` | the four exemplar lines cited; the two laws; anti-patterns incl. the em-dash ban; the report-line pattern; naming register |
| 6 | Asset manifest + ATTRIBUTION scaffold | `docs/ASSET-MANIFEST.md`, `ATTRIBUTION.md` | pack roles assigned; copy-in discipline fixed; generated-art ban restated; no assets copied yet (correct at M0) |

**Not in scope at M0 (deferred to the named milestone):** Gate 2 real-event input (M2), Gate 4
action-legibility (M2), Gate 5 legibility floor (M6), Gate 6 screen-fill (M2), Gate 8 soak (pre-
staging), the single-file build (M1). This is recorded so the absence reads as scope, not as a gap.

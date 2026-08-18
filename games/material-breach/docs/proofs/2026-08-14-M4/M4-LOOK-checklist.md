# M4 proof checklist — 2026-08-14

M4 is **the raid resolver and the after-action report as a designed artifact**. The proof is the
green battery plus the three dated screenshots in this folder, captured from the built
`dist/index.html` at `file://` with real input (`scripts/capture-proof-m4.mjs`).

Battery at close: **78 pass / 0 fail** (Gate 2 real-mouse-event test included). Build:
`dist/index.html`, zero external fetches.

## LOOK checklist (fold 21: "M4: raid read as movement, not a tick")

| # | M4 mechanic / law | Expected | Shot | Verdict |
|---|---|---|---|---|
| 1 | The raid reads as MOVEMENT, not a tick (fold 4) | A party crosses the section toward the Cornerstone; the head advances along a path with a strength readout, watchable and skippable. | 02 | PASS: "INCIDENT REPLAY, cycle 1. Party of 2, objective loot"; the red head crosses the section with a fading trail and a Skip button. |
| 2 | Planning is never fully blind (intel memo, fold 2) | Before signing, an in-voice sighting previews the coming raid with a size range, not the exact number. | 01 | PASS: "Party size estimated 1 to 3. Objective not yet determined." and it brackets the real party (tested). |
| 3 | The after-action report is a designed artifact (fold 8/9) | The report renders ledger-first: exact numbers with in-voice prose beneath, and consequential lines cite their cause. | 03 | PASS: "Incident 1: party of 2 (objective loot) observed, threat 7 vs defence 9" with the prose and cause beneath. |
| 4 | Every report line drives a consequence (fold 17a) | No line is pure flavour; each corresponds to a real state change the same cycle. | (battery) | PASS: `consequences.test.js` ties income/excavation/hiring/raid/separation/terminal lines to their deltas. |
| 5 | The LEGIBILITY LAW holds (operator addendum) | Every number is labelled at the point of reading; the cutaway grammar has a legend and a hover read. | 01 | PASS: legend line + "The Cornerstone, the loss object (condition 100/100)" hover label. |

## Shots

- `01-admin-intel-memo.png` — the pre-commit intel memo, the cutaway legend, and a hover label.
- `02-raid-replay.png` — the watchable raid: the party crossing the section toward the Cornerstone.
- `03-after-action-report.png` — the designed after-action report, ledger-first with prose and cause.

## Gates standing green at M4

Gates 1, 2 (real mouse events), 3 (degenerate probe), 4 (action-legibility), 6 (screen-fill), 7
(loud failures), plus raid-variance, flavour-pairing, the legibility-law lint, and the
report-consequence law (fold 17a). Gate 5 (legibility floor, measured) is M6.

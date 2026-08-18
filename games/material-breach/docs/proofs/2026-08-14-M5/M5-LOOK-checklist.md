# M5 proof checklist — 2026-08-14

M5 is **capital, consequences, and the bureaucratic ladder** — the game's defining mechanic. The
proof is the green battery plus the two dated screenshots in this folder, captured from the built
`dist/index.html` at `file://` with real input (`scripts/capture-proof-m5.mjs`).

Battery at close: **91 pass / 0 fail** (Gate 2 real-mouse-event test included). Build:
`dist/index.html`, zero external fetches.

## LOOK checklist (fold 21: "M5: annotations legible on the cutaway")

| # | M5 mechanic / law | Expected | Shot | Verdict |
|---|---|---|---|---|
| 1 | The escalation ladder is paperwork | An officer serves a named instrument with a deadline in cycles, answerable administratively for gold. | 01 | PASS: "Standing: Royal Surveyor / schedule of dilapidations: 4 cycle(s) left. Answer for 60g [A]". |
| 2 | Answering discharges the instrument | Paying the remediation removes the notice and debits the treasury. | 02 | PASS: treasury 392 -> 332, the instrument line and the Answer button gone, "answered administratively. 60g committed." |
| 3 | The loss object's condition is legible, with repair | The Cornerstone reads its condition and rising alarm as it falls; a repair order restores it. | 01 | PASS: "Cornerstone 10/100" in alarm colour with the enlarged pulse ring; Repair 40g button present. |
| 4 | Killing the officer never withdraws the notice (fold 17b) | A served instrument stands regardless of raider casualties. | (battery) | PASS: `ladder.test.js` scripts raiders reduced to zero and asserts the notice still stands. |
| 5 | Insolvency and the closing score exist (Ray-ratified) | A lapsed tax lien can drive the treasury negative to insolvency; the tenure closes with a score (cycles + solvency). | (battery) | PASS: `saveload.test.js` reaches insolvency via a lapsed lien; `capital.test.js` asserts the closing score. |

## Shots

- `01-instrument-served.png` — a Royal Surveyor has served a schedule of dilapidations; the ledger
  shows the deadline stamp and the Answer button; the Cornerstone is at 10/100 with the rising ring.
- `02-instrument-answered.png` — the instrument answered administratively (60g), the notice
  discharged, the after-action report showing the incident that drove the escalation.

## Gates standing green at M5

Gates 1, 2 (real mouse events), 3 (degenerate probe), 4 (action-legibility), 6 (screen-fill), 7
(loud failures), plus raid-variance, flavour-pairing, the legibility-law lint, the report-consequence
law (fold 17a), the officer/notice law (fold 17b), and the cross-state save/load property test
(fold 19). Gate 5 (legibility floor, measured) is M6.

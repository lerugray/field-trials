# M6 proof checklist — 2026-08-14

M6 is **the register + interface pass**: every player-facing string checked against the voice laws,
the desk/ledger surface, Gate 4 for every outcome-altering change, and Gate 5 measured. The proof is
the green battery, the measured legibility report (`GATE5-legibility-measured.md`), and the dated
screenshots in this folder.

Battery at close: **98 pass / 0 fail** (Gate 2 real-mouse-event test included). Build:
`dist/index.html`, zero external fetches.

## LOOK checklist (fold 21)

| # | M6 law | Expected | Where | Verdict |
|---|---|---|---|---|
| 1 | Every player-facing string obeys the voice laws (§4.1-§4.3) | No em-dash, no exclamation, no curly quote; every flavour string ships a numeric neighbour; institutional-defensive throughout. | `register.test.js` + shots | PASS: lint over all report lines / orientation / officer & instrument names / tool & button labels; two curly quotes and one debug-log em-dash fixed. |
| 2 | Every number is labelled at the point of reading (LEGIBILITY LAW) | Ledger figures carry labels; the cutaway grammar has a legend and a hover read. | 03 | PASS: labelled ledger, legend line, hover label; `legibility-law.test.js`. |
| 3 | Gate 4: every outcome-altering change is visible | Raids, deaths, payday, morale, notices, claims all surface the moment they happen. | (battery) + 03 | PASS: `consequences.test.js` + the ledger/report surfaces (standing officer, detention, morale, backlog). |
| 4 | Gate 5: legibility floor measured | Minimum text size, contrast, dwell measured as numbers on the built artifact at 1x. | `GATE5-legibility-measured.md` | PASS: 8px floor; readable text >= 4.87:1; dwell unbounded (untimed admin). |

## Shots

- `02-departments-records-quarters.png` / `03-applicant-hired.png` — the desk at a rich state:
  departments (tinted + lettered + listed with quality), the ladder standing line, detention held,
  amenities and morale, the intel memo, the legend, and a plain-language hover label. All readable
  text clears the measured contrast floor.

## Gates standing green at M6

Gates 1, 2, 3, 4, 5 (measured), 6, 7, plus raid-variance, flavour-pairing, the legibility-law lint,
the register lint, the report-consequence law, the officer/notice law, and the save/load property
test.

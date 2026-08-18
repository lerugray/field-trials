# M3 proof checklist — 2026-08-14

M3 is **staff**: rooms attract applicants, needs and morale, grievances, resignation and defection.
The proof is the green battery plus the three dated screenshots in this folder, captured from the
built `dist/index.html` at `file://` with a real mouse (`scripts/capture-proof-m3.mjs`).

Battery at close: **70 pass / 0 fail** (Gate 2 real-mouse-event test included). Build:
`dist/index.html`, zero external fetches.

## LOOK checklist (fold 21), scored against the shots

| # | M3 mechanic / law | Expected | Shot | Verdict |
|---|---|---|---|---|
| 1 | Rooms ATTRACT applicants, never a roster pick (KEEP #3) | Designating a Records department opens clerk posts; applicants report on their own and fill them; the crew count rises without any hire button. | 02, 03 | PASS: crew rose 4 -> 6 standing, open posts 0, after two clerks reported to the two Records tiles. |
| 2 | Amenities house and feed the crew, and neglect is legible | The ledger shows housed X/H and fed Y/F; exceeding a capacity is flagged. | 03 | PASS: "housed 6/10, fed 4/4" with the over-food state in warning colour. |
| 3 | Morale and separations are tracked | The ledger shows average morale, defectors, and grievances; grievances and separations surface in the report. | 03 | PASS: "Morale 81/100. Open posts 0. Defectors 0." with the grieving count on the Posts line. |
| 4 | The non-combat worker caste is differentiated (fold 3) | Archetypes carry distinct temperaments (clerks wage-sensitive and hazard-averse; drudges inured), asserted in the battery. | (battery) | PASS: `needs.test.js` asserts a clerk loses more morale than a drudge on the same deferred pay. |

## Shots

- `01-carved-and-claimed.png` — a spread of cells carved and claimed to build departments on.
- `02-departments-records-quarters.png` — Records (clerk posts) and Quarters (beds) designated.
- `03-applicant-hired.png` — applicants reported and filled the posts; the staff ledger reads out
  amenities, morale and defectors.

## Gates standing green at M3

Gates 1, 2 (real mouse events), 3 (degenerate probe), 4 (action-legibility), 6 (screen-fill), 7
(loud failures), plus raid-variance and flavour-pairing. Gate 5 (legibility floor, measured) is M6.

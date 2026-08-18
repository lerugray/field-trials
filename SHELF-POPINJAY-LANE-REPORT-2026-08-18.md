# SHELF-POPINJAY lane report — 2026-08-18

Vendored POPINJAY onto the field-trials shelf from
`/Users/rayweiss/Desktop/Dev Work/popinjay` HEAD `4788f4b`. Source repo was
read-only. No push from this lane.

Wall clock at close: Tue Aug 18 12:07 EDT 2026; suite re-run after copy.

## What was vendored

`games/popinjay/` from the source tree's git-tracked files:

- Shipped source: `src/`, `scripts/`, `vendor/fonts/` (Rye + Old Standard TT, OFL 1.1)
- Suite: `test/`, `package.json`, `package-lock.json`
- `DESIGN-SEED.md`, `README.md` (verbatim), `ATTRIBUTION.md`
- `docs/` wholesale — release-gate-2026-08-18 (CHECKLIST + climb-pose correction +
  probes), release-gate-2026-08-15 RECORD, followups, proofs, collateral OG card,
  listen set, STUDY-M0 / AUDIT-M6
- `AUDIT-SKEPTICAL-2026-08-12.md` + `RE-EXAM-2026-08-12.md` (pre-gate audit trail)
- `CLAUDE.md` so the verbatim README links resolve (source has no `AGENTS.md`)
- `LANE-REPORT-GATEFIX.md` — the in-gate close-out of the fused title-footer and the
  false climb certification (the shelf-row audit cell)

Root README: new table row, shelf count 3,725 across twelve, seed count eleven-of-twelve,
licensing line for Rye / Old Standard TT. CI: both matrices + innsmouth-style browser
probe note.

## Suite count in place

From `games/popinjay/`, `npm test`, nothing but Node, no Playwright install:

```
tests 287 / pass 278 / fail 0 / skipped 9 / todo 0
```

The nine skips are the Playwright artifact cases (title-footer viewport gap, gamepad
app wiring, scorecard/rehearsal UI, title-confirm). They skip cleanly when `playwright`
is not importable (same path as the push-job `npm ci --omit=dev`). 287 is the source
suite size the shelf row cites; 278/278 of the Node-only battery is green. Duration 5.1s.

## Sibling-convention deviations

Studied `games/material-breach/` (vendor just before this lane) plus
`games/office-of-the-road/` and the LoA/Capriole vendor (`working docs stripped`).

1. **Working docs stripped, with one exception.** Did not copy `PROGRESS.md`,
   `BRIEF-FU2-20260816.md`, `lane.log` / `lane.done`, or the other `LANE-REPORT-*.md`
   files. That matches the root README ("hard-rules / progress log / lane reports are
   not published") and the MB vendor. OOTR *did* publish those; this lane followed
   the published policy. **Kept** `LANE-REPORT-GATEFIX.md` because it is the document
   that records the fused-footer close-out and the climb-pose retraction the shelf
   row names.
2. **`dist/` not committed.** Source tracks `dist/popinjay.html`. Field-trials root
   gitignores `dist/`; CI rebuilds. Same as every other game.
3. **Top-level `proofs/` (1,089 capture dumps) and `listen/` not copied.** Those are
   milestone working captures; the published proof/listen surfaces already live under
   `docs/proofs/` and `docs/listen/`. MB had no equivalent root dump.
4. **Playwright skip-guards on four test files.** Source imported `playwright` at
   module top, which would fail the Node-only CI job. Guarded with the MB
   try/catch + `{ skip: chromium ? false : 'playwright unavailable' }` pattern so
   `npm test` needs nothing but Node. The three Node-only tests in
   `release-gate-2026-08-18.test.mjs` still run. No other game files rewritten.
5. **CI matrix updated** (brief did not list it; MB and OOTR vendors did). Browser
   probe is an echo, Innsmouth-style: the nine Playwright tests unskip in the weekly
   job once Chromium is present and `npm run build` has written `dist/popinjay.html`.
6. **`CLAUDE.md` included.** LoA/Capriole stripped builder-rules files; MB kept
   `AGENTS.md`/`CLAUDE.md` so verbatim README links are not dead. Source has only
   `CLAUDE.md`.

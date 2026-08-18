# SHELF-MB lane report — 2026-08-18

Vendored MATERIAL BREACH onto the field-trials shelf from
`/Users/rayweiss/Desktop/Dev Work/material-breach` HEAD `8df89ef`. Source repo was
read-only. No push from this lane.

Wall clock at close: Tue Aug 18 11:54 EDT 2026 (session start); suite re-run after copy.

## What was vendored

`games/material-breach/` from the source tree's git-tracked files:

- Shipped source: `src/`, `scripts/`, `assets/` (Willibab NPC Pack sheets + Not Jam fonts)
- Suite: `test/`, `package.json`, `package-lock.json`
- `DESIGN-SEED.md`, `README.md` (verbatim), `ATTRIBUTION.md`
- `docs/` wholesale — release-gate-2026-08-18 (CHECKLIST + frames + harnesses),
  release-gate-2026-08-15 RECORD, proofs, collateral OG card, listen sets, studies
- `AGENTS.md` + `CLAUDE.md` so the verbatim README links resolve
- `LANE-REPORT-GATEFIX.md` — the in-gate close-out of the save-brick blocker and the
  phantom corrupt-save notice (the shelf-row audit cell)

Root README: new table row, shelf count 3,438 across eleven, seed count ten-of-eleven,
licensing line for the NPC Pack + Not Jam. CI: both matrices + innsmouth-style browser
probe note.

## Suite count in place

From `games/material-breach/`, `npm test`, nothing but Node, no Playwright install:

```
tests 205 / pass 197 / fail 0 / skipped 8 / todo 0
```

The eight skips are the Playwright boot/fill/click/masthead cases; they skip cleanly
when `playwright` is not importable (same path as the push-job `npm ci --omit=dev`).
205 is the source suite size the shelf row cites; 197/197 of the Node-only battery is
green. Duration 2.2s.

## Sibling-convention deviations

Studied `games/office-of-the-road/` (most recent release-gated sibling) plus the
LoA/Capriole vendor (`working docs stripped`).

1. **Working docs stripped, with one exception.** Did not copy `PROGRESS.md`, `GOAL.md`,
   `LANE-REPORT-RELEASE-FIXROUND-20260815.md`, or `runs/`. That matches the root README
   ("hard-rules / progress log / lane reports are not published") and the LoA/Capriole
   vendor. OOTR *did* publish those; this lane followed the published policy and the
   brief's explicit list. **Kept** `LANE-REPORT-GATEFIX.md` because it is the only
   document that records the in-gate B1/Q1 close-out the shelf row names.
2. **`dist/` not committed.** Source tracks `dist/index.html`. Field-trials root
   gitignores `dist/`; CI rebuilds. Same as every other game.
3. **No closing `RECORD.md` for 2026-08-18.** Source banks `CHECKLIST.md` as the as-found
   FAIL (step 7: save-brick + phantom notice) and never wrote a later RECORD. Did not
   invent one. The close-out is `LANE-REPORT-GATEFIX.md` plus the post-checklist source
   commits.
4. **CI matrix updated** (brief did not list it; OOTR vendor did). Browser probe is an
   echo, Innsmouth-style: the eight Playwright tests unskip in the weekly job once
   Chromium is present. Did not wire `scripts/soak-m8.mjs` — it is a 30-cycle soak that
   writes proof dirs, heavier than the weekly probe pattern.
5. **`AGENTS.md` / `CLAUDE.md` included.** LoA/Capriole stripped builder-rules files;
   OOTR kept `CLAUDE.md`. Copied both so the verbatim README's links are not dead.

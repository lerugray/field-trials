# OOR text-readability gate — lane report

Date: 2026-08-12  
Authority: operator-mandated Field Trials release gate (Pickett M10 pattern)  
Scope: objective text catalog + wrap/clip/ink gate; fix real defects found; no commit/push

## Result

**TEXT GATE PASSED** — **435/435** catalog cases, 0 right-edge overflow, 0 dropped words, ink x-height floor held.  
Wired as **GATE 7** in `scripts/gates.mjs`. Full battery green:

| Check | Result |
|---|---|
| `node scripts/text-gate.mjs` | PASS · 435 cases |
| `node scripts/gates.mjs` | ALL GATES (M2 + M4 + M6 + M7 + TEXT): GREEN |
| `node --test` | **171/171** |
| `node scripts/build.js` | rebuilt `dist/office-of-the-road.html` |

## Catalog size

**435** player-visible cases, enumerated (not sampled) from:

- UI chrome / mastheads / control labels
- March + combat status lines (including worst-case resolver phrases)
- Docket, intake, soak, defeat/report lines
- Credits (pre-wrapped the same way `attributionPages` wraps)
- Camp / route / shop / deck surfaces
- All jobs, verbs, notes, blurbs
- All cards (names + effect text + draft labels)
- All items (shop name slices, mods, inventory/slot chips)
- All mandate title combinations (`MANDATE_SUBJECTS` × `MANDATE_OBJECTS`) + clauses
- Certifications, enemy names, terrain labels, route archetypes

Dump: `node scripts/dump-text-catalog.mjs`

## Gate mechanics

OOR ships a **code-drawn 5×7 bitmap face** (`src/pixel-font.js`), not a TTF — so the gate measures the live path, not PIL/font-metrics:

1. `src/text-catalog.js` builds the complete case list with each string’s **actual container width**, **maxLines**, and **shipped fontPx** (6/7/8 → scale 1; ≥9 → scale 2).
2. `scripts/text-gate.mjs` wraps with shared `wrapLinesNoEllipsis` + `pixelTextWidth` (same modules as the renderer).
3. Hard asserts:
   - every wrapped line width ≤ `maxWidth + 0.5`
   - zero dropped/clipped content vs the source string
   - ink x-height from **actual `pixelText` canvas output** (body ≥5px, heading ≥12px; zero antialiased partials)
4. `scripts/gates.mjs` spawns the text gate as GATE 7; failure fails the release battery.

Shared wrap extracted to `src/text-wrap.js` so the gate cannot drift from the game.

## Defects found + fixed

| Defect | Fix |
|---|---|
| Combat status box 108×2 dropped long `cb.line` / `phraseFor` copy | Full-width strip (`VW−24` × 2) at y=110; shortened closed/reduced/draft/stalemate lines; terse card phrase |
| Route notes overflowed 82×2 cards | Shortened ordinary/verge notes in `route.js` |
| Route intro overflowed single full-width line | `maxLines` 2 |
| Camp supplies line overflowed single line | `maxLines` 2 |
| Camp job stats overflowed 162×1 | `maxLines` 2 |
| Deck card names overflowed 40×1 | Card cells widened to 46px; names strip leading “The ”; `maxLines` 2 |
| Deck strike hints overflowed 190×2 | `maxLines` 3, raised start y |
| Deck nav hint overflowed single line | `drawTextLines` × 2 |
| Draft offer names overflowed 34×2 | Measure width = card + gap (42) |
| Docket history / empty-hist overflowed narrow column | Compact history format; empty-hist wraps × 2 |
| Shop slot/inv chips overflowed truncated labels | Slot slice 5 from x+2; inv slice 6; sell button widened to 80 |
| Enemy names overflowed 40×2 battler labels | Shortened to Toll-Clerk / Warden / Writ-Server / Assessor / Sergeant |

## Final counts

- Catalog cases: **435**
- Right-edge overflow: **0**
- Dropped words: **0**
- Ink x-height: body **7px** (≥5) · heading **14px** (≥12) · partials **0**
- Suite: **171/171**
- Gates: **M2 + M4 + M6 + M7 + TEXT GREEN**

## For the operator to ratify

- Enemy display names are shortened for the 34px battler label column (distinct bureaucratic tags retained; longer forms like “Boundary Warden” no longer ship). Lean: keep — legibility over ornamental length at this raster.
- Combat status is now a full-width 2-line strip above the hand; confirm it still reads as the live resolver ticker without colliding with floats at integer scale.
- No commit/push this lane (per instruction).

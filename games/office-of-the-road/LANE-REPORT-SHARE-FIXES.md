# OFFICE OF THE ROAD — Share-Prep Fix Lane Report

Date: 2026-08-11

## 1. Attribution ships in the build — COMPLETE

- `scripts/build.js` now reads `ATTRIBUTION.md`, fails loudly if it is absent, and embeds the full file as `ATTRIBUTION_TEXT` in the single-file build.
- A paginated `CREDITS & LICENSING` panel renders the embedded notice in the existing canvas/UI idiom.
- The panel is reachable by keyboard and pointer from both the intake form and returned docket.
- March/combat controls also expose `CREDITS`; while paused, `C` opens the panel and returns to the prior march/combat screen.
- The complete CC BY URL is printed in the panel and `OPEN CC BY` opens the CC BY 4.0 page.
- The rendered notice includes the full Willibab / Monsteretrope attribution line and licence URL, the GuttyKreum commercial-licence credit, the optional RonnyG note already present in `ATTRIBUTION.md`, and the code-composed WebAudio score notice.

Build/embedding verification:

- `node scripts/build.js` — PASS; rebuilt `dist/office-of-the-road.html` (704.9 KB, 26 modules, licensed art inlined).
- `rg` against the rebuilt distribution found:
  - `Art by **Willibab / Monsteretrope**, used under **CC BY**.`
  - `https://creativecommons.org/licenses/by/4.0/`
  - `Tarot art by **GuttyKreum**`
  - `code-composed WebAudio`

## 2. Systemic text-overflow collisions — COMPLETE IN CODE

- Added shared measured text layout: width-fitting with ellipsis, measured wrapping, and an optional maximum line count.
- Generic control labels now use the width-fitting path as well.
- Combat reserves separate roster, action, fixed status, hand, and card-label rows. The party roster was moved inside its reserved upper region; the paused/resolving banner owns a cleared strip below it.
- Each card-state label is measured and ellipsized inside its 30-pixel card column, eliminating merged labels.
- The march mandate strip now owns enough vertical height, and the route table begins below it. Mandate title/instrument lines are width-fitted.
- Camp job names, statistics, and descriptions are measured inside the job-text column with the cycle arrows reserved.
- Route flavour is capped at two measured lines; the `TAKE THIS ROAD` row remains separately reserved and width-fitted.

Browserless verification:

- `node scripts/render-probe.mjs` — PASS. The real renderer was traced through a minimal canvas context; the probe asserts that the paused banner does not intersect any combatant name/HP row, all three card-state labels remain within their 30-pixel columns, and the paginated credits render the required Willibab, CC URL, GuttyKreum, and score text.
- A jsdom dependency was not added to this zero-dependency repository; the probe uses a small DOM-free canvas trace instead.

## 3. Garbled report glyph — COMPLETE

- The filed-report prose no longer depends on the currency glyph that rendered as `⌐` in the captured environment.
- Both close paths now use the ASCII-safe wording `the ledger stood at N in coin.`
- Currency instruments elsewhere remain unchanged.

## Required verification — PASS

- `node --test` — PASS, exact count: 157 tests; 157 passed, 0 failed.
- `node scripts/gates.mjs` — PASS; all M2, M4, M6, and M7 gates green.
- `node scripts/render-probe.mjs` — PASS.
- `node scripts/build.js` — PASS; distribution rebuilt.
- Attribution grep in rebuilt distribution — PASS, including the Creative Commons URL.
- `node --check src/main.js` — PASS.
- `git diff --check` — PASS.

## Honest gaps / orchestrator browser verification still required

There is no Chromium visual run in this lane. An orchestrator browser pass should verify at the fixed proof viewports:

1. Intake and returned-docket `CREDITS` controls open the panel by click and keyboard; previous/next/back navigation reaches every page; the printed CC URL is legible; `OPEN CC BY` opens the intended licence page.
2. Paused combat shows no collision among combatant name/HP rows, the action line, paused banner, hand heading, card-state labels, and card art at both sparse and full enemy counts.
3. All six camp jobs keep their measured descriptions inside the job column without touching the right cycle arrow.
4. Every generated route branch keeps its flavour above `TAKE THIS ROAD`.
5. March mandate title/numeric line and `ROUTE TABLE` remain visibly separated across long generated mandates.
6. A filed report displays `the ledger stood at N in coin` with no replacement or garbled glyph.

No commit or push was performed. The town cobblestone strip, integer-scale snap/fill behaviour, game balance, and score were not changed.

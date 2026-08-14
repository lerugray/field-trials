# OOR Hand-Card Label Truncation — Lane Report

Date: 2026-08-11

## Outcome

- Fixed the three live hand-card window labels on `FIELD RESOLUTION` without changing gameplay.
- The existing 30×38 tarot art, 30px card columns, 6px UI type, hit rectangles, and control positions remain unchanged.
- Labels now use the renderer's established measured wrapping helper and the two owned rows between the tarot art and the controls. The number and complete state (`playable`, `decisive`, or `wasted`) are rendered without an ellipsis.
- Rebuilt `dist/office-of-the-road.html` from the updated source.

## Reproduction and design choice

The pre-fix source rendered `(i + 1) + ' ' + state` through `drawTextFit` in a single 30px row. At the existing 6px monospace scale, `1 playable`, `2 decisive`, and `3 playable` exceed that width, so `truncateText` correctly replaced their ends with `…`. The deterministic routine-combat deep link used for reproduction was:

`dist/office-of-the-road.html?fresh=1&seed=1044942&ticks=14`

The build was refreshed before the reproduction attempt. Keeping the established narrow tarot geometry and 6px type scale was preferable to distorting the tarot cards or introducing a smaller, off-scale font. The renderer now calls `wrapText(..., cw, 6, 2)` at the bottom edge of the art; the two rows end at y=182, exactly before the controls begin.

## Text-clip regression coverage

Extended the existing canvas trace in `scripts/render-probe.mjs`; no second overflow harness was added. It now:

- puts a party frame in danger to exercise the longest `decisive` state;
- reconstructs all three hand labels from their rendered rows and checks their complete text;
- rejects ellipses;
- checks every row remains within the 30px column;
- checks every row ends before the controls at y=182.

Result:

`node scripts/render-probe.mjs` — PASS: `full hand labels, reserved combat regions, and paginated attribution render`.

## Build and test verification

- Confirmed the package entry point is `npm test`, which runs `node --test`.
- `npm run build` — PASS; rebuilt `dist/office-of-the-road.html` (705.0 KB, 26 modules, licensed art inlined).
- `node --check src/main.js` — PASS.
- `git diff --check` — PASS.
- `npm test` / `node --test` — PASS: 157 tests, 157 passed, 0 failed, 0 skipped, 0 cancelled.

## Visual-proof limitation in this lane

The requested before/after PNG capture could not be produced in this execution environment, so no screenshot filenames are claimed here:

- binding `127.0.0.1` for a local HTTP server was denied by the managed sandbox (`PermissionError: Operation not permitted`);
- the in-app Browser control runtime was not exposed to this session;
- the installed Playwright Firefox runtime was absent, and launching the system Firefox in headless mode aborted before writing a PNG.

The intended dated pre-fix target was `proofs/card-labels-before-20260811-082611.png`, but no file was created. A visual rerun should serve the rebuilt repository, open the deterministic URL above at 1280×800, and capture both pre-fix and post-fix revisions. The renderer-level regression is automated and passing, but it is not represented as a pixel screenshot.

No commit or push was performed.

# M2 Report — Board, State Model, and Visual Chassis

Date: 2026-08-07  
Branch: main  
Commit: a311433  
Status: M2 complete; M1 (rules ledger) remains pending.

## What shipped

- **25×20 board** rendered as code-drawn SVG, no image assets. Algebraic coordinates a1..y20 (x=0..24, y=0..19). Alternating light/dark squares with edge coordinate labels.
- **Two sides**: North (ops-red) and South (black). Distinctive piece silhouettes per class (circle, triangle, square) with class glyph labels.
- **Unit roster placeholders**: Infantry, Cavalry, Artillery, Relay, Arsenal. All stats are marked `TEMP` in the UI and state; no verified rules values are presented as binding.
- **Coordinate system** round-trips across all 500 squares; full test coverage.
- **Selection & sandbox movement**: click/tap to select, click destination or drag to move, arrow-key nudging, Escape to clear. Pieces stack freely; no movement legality, combat, communications, or victory logic is implemented or implied.
- **Test preset**: twelve-piece mirrored setup on the back ranks. Reset button restores it deterministically.
- **Save/load**: JSON file download/upload and `localStorage` store/recall. State serializes version, board, pieces, selection, move count, preset, and the sandbox disclaimer.
- **Visual chassis**: cream/black/ops-red austere palette, minimal chrome, responsive layout (desktop panel + mobile stack), no image assets, no Debord branding, product name "LINES OF ADVANCE" on the surface, sandbox pill reading "SANDBOX — RULES PENDING VERIFICATION".
- **Single-file deliverable**: `dist/index.html` rebuilt by `npm run build` from ES modules; verified playable via `file://`.

## Files added

- `src/state.js` — deterministic state model, coordinates, presets, save/load.
- `src/board.js` — SVG rendering.
- `src/input.js` — pointer and keyboard interaction.
- `src/main.js` — app bootstrap and UI wiring.
- `src/styles.css` — visual chassis.
- `scripts/build.js` — zero-dep module inliner for `dist/index.html`.
- `scripts/screenshot.js`, `scripts/interaction_check.py` — proof capture helpers.
- `test/coord.test.js`, `test/state.test.js`, `test/determinism.test.js` — test suite.
- `dist/index.html` — built deliverable.
- `proofs/m2-{1280x800,1440x900,2560x1440,interaction}-2026-08-07.png`.

## Test results

```
✔ 22 tests pass
  - 9 coordinate-system tests
  - 12 state-model tests (create, select, move, reset, round-trip, parse guards)
  - 1 determinism test (seeded LCG)
```

Run with `npm test`.

## Verification performed

- `npm test` green.
- `npm run build` produces `dist/index.html`.
- Playwright opened `file://dist/index.html` at 1280×800, 1440×900, and 2560×1440; board renders and fills viewport.
- Interaction check: selected a North piece and moved it; move counter incremented and piece relocated.
- Confirmed no image assets in source or build; all visuals are CSS/SVG-in-code.
- Confirmed no player-facing Debord branding or rule overclaim; sandbox disclaimer is present.

## Reviewer notes

- All unit stats are placeholders. M1 must verify and replace `temp` values before any rules-bearing milestone.
- The current preset coordinates are a temporary drill layout, not a verified historical deployment.
- `docs/source/` exists on disk but was left untracked; it belongs to the M1 rules-ledger work and was not used to derive mechanics for M2.
- `.gitignore` no longer ignores `dist/` so the single-file deliverable is tracked and pushed.

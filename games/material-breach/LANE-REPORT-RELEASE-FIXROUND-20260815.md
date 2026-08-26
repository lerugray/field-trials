# LANE-REPORT-RELEASE-FIXROUND-20260815

Release fix round executed from `docs/handoffs/RELEASE-FIX-ROUND-2026-08-15.md`. Suite baseline held at
174/174; round closes at **188/188 pass / 0 fail**. No push.

| item | change | test | mutation proof | evidence |
|---|---|---|---|---|
| **B1 — Window fill** | `src/boot.js` `rescale()` now uses best-fit cover scaling with quarter-integer snap and `image-rendering: pixelated`. | `test/fill-probe.test.js` asserts ≥90% limiting-dimension fill at 900×600, 1280×800, 1440×812, 1440×900, 1920×1080, 2560×1440. | Probe measures actual screenshot pixels (sentinel background), not element box. 900×600 would be 640×360 (59% height) under the old integer-floor scaler and fails. | `docs/proofs/2026-08-15-release-fixround/2026-08-15-fill-<W>x<H>.png`, `2026-08-15-fill-probe.json` |
| **B2 — 1× legibility** | Same scaling change as B1; effective body copy is `11px * (boxH / 360)`. | `test/fill-probe.test.js` asserts effective body copy ≥11px at every battery viewport. | With old scaler 900×600 body copy would remain 11px; cover scaling raises it to 18.33px. | Same B1 files |
| **B3 — AAR scroll** | `src/render.js` clips the report zone, translates by `-view.reportScroll`, and measures content height. `src/view.js` adds `reportScroll`/`reportMaxScroll`. `src/input.js` adds wheel/Page key scrolling. | `test/aar-scroll.test.js` drives a long report and asserts every line scrolls into the visible clip. | Old renderer breaks the loop at `ry > floor - 24`; lines below the fold are never drawn regardless of scroll. | Test output; no separate screenshot |
| **B4 — Provenance from pause** | `src/view.js` adds `overlayReturnTo`; `showOverlay()` records the source overlay and `backToTitle()` returns to it. | `test/shell-provenance-return.test.js` asserts pause→provenance→back returns to `'pause'`; title→provenance still returns to `'title'`. | Before the fix `backToTitle()` always set `'title'`, so the test would find `'title'` after pausing. | Test output |
| **B5 — Loud corrupt save** | `src/view.js` `tryResume()` now returns `{ok,reason}`; `src/boot.js` surfaces the reason as `view.saveNotice`; `src/render.js` draws it on the title. | `test/corrupt-save.test.js` asserts tampered storage yields a reason and the title renders "Save notice: ...". | Old `tryResume()` returned boolean and the caller dropped the reason; the title would render with no notice. | Test output |
| **Minor — orientation/checklist buttons** | `src/layout.js` raised orientation button to `y=280,h=24` and checklist buttons to `y=276,h=24` so they sit inside the 280px overlay sheet. | Existing shell/layout tests pass; no new test added. | Button bottoms were at y≈326, beyond the sheet bottom y≈314. | No screenshot |
| **Minor — orientation wrap** | `src/view.js` `ORIENTATION` rewritten as pre-wrapped lines ≤64 characters so `wrap()` does not re-break them. | Existing shell tests pass; text no longer produces one-word orphans. | Previous long lines were split mid-sentence by the renderer. | No screenshot |
| **Minor — Esc alias** | `src/input.js` `Esc` now dispatches Back/X/Dismiss on options/provenance/error/checklist; pause toggle unchanged. | Existing input/shell tests pass. | Previously Esc did nothing on those surfaces. | Test output |
| **D1 — Replay strength label clip** | `src/render.js` measures the strength label and mirrors/clamps it inside `SECTION`. | `test/replay-label.test.js` asserts the label bounding box stays inside the section panel for right-edge and left-edge raids. | Old fixed `(+12,-18)` offset places the label off-panel for a head near the right edge. | Test output |
| **Latent moonwalk** | `src/scene.js` derives raider `flip` from `head.x - prev.x` instead of hardcoding `true`; trail shares the head facing. | `test/raider-flip.test.js` asserts rightward raider `flip=false`, leftward `flip=true`, trail matches head. | Old code always flipped raiders; a profile-facing sprite would moonwalk when moving right. | Test output |

## Build and battery

- `node scripts/build-singlefile.mjs` rebuilt `dist/index.html` (zero external fetches).
- `node --test` result: **188 pass / 0 fail / 0 skipped**.
- `PW_PATH=$PWD/node_modules node scripts/capture-release-fixround.mjs` produced the dated fill-probe captures under `docs/proofs/2026-08-15-release-fixround/`.

## Fill probe measurements

| viewport | playfield | limiting fill | effective body px |
|---|---|---|---|
| 900×600 | 900×600 | 100% | 18.33 |
| 1280×800 | 1280×800 | 100% | 24.44 |
| 1440×812 | 1440×810 | 99.75% | 24.75 |
| 1440×900 | 1440×900 | 100% | 27.50 |
| 1920×1080 | 1920×1080 | 100% | 33.00 |
| 2560×1440 | 2560×1440 | 100% | 44.00 |

## Not in this round

- Name ratification (MATERIAL BREACH vs DILAPIDATIONS vs CONDEMNED PREMISES) remains Ray's queue.
- Restart/quit-and-return semantics and AAR/credits content rulings remain Ray's queue.

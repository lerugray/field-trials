:# Release fix round — 2026-08-15

Source handoff: `docs/handoffs/RELEASE-FIX-ROUND-2026-08-15.md`
Evidence dirs: `docs/verification/release-gate-2026-08-15/{step2-coldboot,step3-endstates,step4-motion,step7-qa}`

Final verification:

- `npm run build` — clean single-file dist
- `npm test` — **226/226 pass**
- `node scripts/capture.mjs --fillgate` — 7/7 viewports pass ≥90% fill
- `npm run capture` — 108/108 proof frames pass, no debug/page errors

All changes on branch `main`. No push performed.

---

## Per-item ledger

| # | Fix | Test | Mutation proof | Evidence |
|---|-----|------|----------------|----------|
| 1 | **Best-fit fractional scaling** in `src/render/px.js:computeLetterbox` (was integer-only). | `test/px.test.js` — "computeLetterbox uses best-fit fractional scale and never strands the playfield" | Fails on old integer `Math.floor` scaler for 1280×800/1440×812/1512×860. | `proofs/fillgate_*.png` (7 viewports, 2026-08-15-090621); e.g. `fillgate_1280x800@1x_20260815-090621.png` fill=100%, `fillgate_1440x812@1x_20260815-090621.png` fill=90.2%. |
| 2 | **Rewrote `scripts/capture.mjs`** to measure the actual presented playfield box from canvas pixels vs viewport; threshold 90% of limiting dimension. | `test/capture-gate.test.mjs` — "the fill gate rejects the old integer-letterbox scaler at 1280x800" | Test builds an old-integer 960×600 centred box and asserts it fails the new gate. | Same `proofs/fillgate_*.png` set; helper lives in `scripts/fill-measure.mjs`. |
| 3 | **Title confirmation before overwriting a saved tour** (`src/app.js` + `drawConfirmNewRun` in `src/render/overlays.js`). | `test/title-confirm.test.mjs` — "Enter on title with a live save requires confirmation before overwrite" | Fails if the title `Enter` handler calls `startStage(false)` directly while `canResume`. | `M8-titleextras_1280x800@1x_20260815-090750.png`, `M8-titleextras_1440x900@1x_20260815-090750.png` (title layout with live-save ribbon). |
| 4 | **Save lifecycle for between-beat states** (`src/engine/saves.js:classifySave`, `src/app.js:persistResume` + resume branches). Cleared ribbon / tour map / draft / rehearsal now classify as alive and resume at the correct beat. | `test/saves.test.js` — "resumableKind distinguishes alive / dead / absent; seed filter is optional" (cleared stage + tourmap/draft/rehearsal branches) | Fails when `classifySave` returns `null` for `world.cleared` or missing `mode`. | `M8-cleared_1280x800@1x_20260815-090750.png`, `M4-tourmap_1280x800@1x_20260815-090750.png`, `M4-draft_1280x800@1x_20260815-090750.png`, `M8-rehearsal_1280x800@1x_20260815-090750.png`. |
| 5 | **Scorecard Escape/E returns to title** (`src/app.js` SCORECARD input branch). | `test/release-fix-ui.test.mjs` — "scorecard Escape / E returns to title instead of dead-ending" | Fails when the SCORECARD branch ignores `Escape`/`e`. | `M4-scorecard_1280x800@1x_20260815-090750.png`, `M8-downed_1280x800@1x_20260815-090750.png`. |
| 6 | **Pause during rehearsal** (`src/app.js` REHEARSAL input + loop guard + `drawPaused` overlay). | `test/release-fix-ui.test.mjs` — "rehearsal can be paused and unpaused without leaving the mode" | Fails when rehearsal steps regardless of `paused` or mode changes on P/Escape. | `M8-rehearsal_1280x800@1x_20260815-090750.png`, `M8-rehearsal_1440x900@1x_20260815-090750.png`. |
| 7 | **Title banner collision offsets** (`src/render/overlays.js:drawResumeHint/drawSaveNotice`, `src/render/title.js:titleFooter`). | Visual verification via refreshed captures. | N/A (cosmetic layout). | `M8-titleextras_1280x800@1x_20260815-090750.png` (resume ribbon clear of subtitle), `M0-title_1280x800@1x_20260815-090750.png` (SAVE UNREADABLE no longer overlaps PRESS ENTER). |
| 8 | **HUD top inset** (`src/render/hud.js` — `HUD_TOP=3`, all HUD elements offset). | Visual verification via refreshed captures. | N/A (cosmetic layout). | `M2-gen_1280x800@1x_20260815-090750.png`, `M6-pause_1280x800@1x_20260815-090750.png` (HUD band sits inside the poster-frame mat). |
| 9 | **Denied-fire HUD slot flash** (`src/sim/world.js:deniedFlashTicks`, `src/render/hud.js:hudWireSlot` white flash). | `test/world.test.js` — "single-slot: a press while the wire is alive is DENIED..." (asserts `deniedFlashTicks > 0`) | Fails if the denied-press path does not set `deniedFlashTicks`. | `M3-souvenir_1280x800@1x_20260815-090750.png` (wire slot visible), `M2-gen_1280x800@1x_20260815-090750.png`. |
| 10 | **Victory scorecard souvenir overflow summary** (`src/render/overlays.js:formatSouvenirSummary` + `drawScorecard`). | `test/overlays.test.js` — "formatSouvenirSummary fits names on one line and counts the overflow" | Fails when `drawScorecard` uses `wrap3` and silently slices the list. | `M4-scorecard_1280x800@1x_20260815-090750.png` (scorecard surface). |

---

## Fill-gate results

Run: `node scripts/capture.mjs --fillgate`

| Viewport | Presented box | Fill |
|----------|---------------|------|
| 900×600 | 900×562 | 93.8% |
| 1280×800 | 1280×800 | 100.0% |
| 1440×812 | 1299×812 | 90.2% |
| 1440×900 | 1440×900 | 100.0% |
| 1512×860 | 1376×860 | 91.0% |
| 1920×1080 | 1728×1080 | 90.0% |
| 2560×1440 | 2304×1440 | 90.0% |

All meet the ≥90% release threshold. The old integer scaler fails this gate (e.g. 1280×800 would present 960×600 = 56.3% area fill).

---

## Capture set

Refreshed with `npm run capture` at timestamp `20260815-090750`:

- 108 frames across the ratified viewports (1280×800, 1440×900) at DPR 1 and 2.
- 0 failures; no `debuglog.error` or page-error entries.
- Representative frames referenced above; full set in `proofs/`.

---

## Commits (in order)

1. `b7e1802` fix(1,2): best-fit fractional scaling + pixel-measured fill gate
2. `471b6c5` fix(4): save lifecycle for between-beat states
3. `66effbf` fix(3): confirm before Enter overwrites a saved tour
4. `f9867ff` fix(5,6): scorecard back keys + rehearsal pause
5. `2d8e35e` fix(7): title banner collision offsets
6. `abcd5a9` fix(8): HUD band inset to match poster-frame mat
7. `84a2350` fix(9): denied-fire HUD slot flash
8. `6b9d98d` fix(10): victory scorecard souvenir overflow summary
9. `c5cc79e` test(3): title Enter with live save requires confirmation
10. `05c259a` test(5,6): scorecard back keys + rehearsal pause

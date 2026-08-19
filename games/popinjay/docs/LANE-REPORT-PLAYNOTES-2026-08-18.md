# LANE-REPORT — POPINJAY play-notes 2026-08-18

Lane: POPINJAY (single lane, repo `/Users/rayweiss/Desktop/Dev Work/popinjay`).
Operator notes:
1. Menu unreadable when opened over a persisted save.
2. Left/right movement looks like only the hat bobbing; not smooth.

---

## Item 1 — menu overlay collision

### Repro
Booted with a persisted previous game, pressed Enter on the title card to start a new run.
The title's "confirm new run" dialog was drawn on top of the title controls panel, while
the controls text stayed queued in the display-resolution text layer — so body copy printed
over the dialog and made it unreadable.

- Repro PNG: `docs/look-playnotes-20260818/repro-confirm-new-run-20260818-204555.png`
- Fixed PNG: `docs/look-playnotes-20260818/fixed-confirm-new-run-20260818-205236.png`

### Fix
In `src/app.js` TITLE render branch, when `confirmNewRun` is active:
- `takeTextLayer()` to discard the queued title controls type,
- `beginTextLayer({skipNative:true})` to start a clean display layer,
- `scrim(p, 0.66)` to darken the title beneath the dialog,
- `drawConfirmNewRun(p)` for the dialog,
- skip title extras and the resume hint.

The dialog now lifts off a darkened background with no leaked controls text.

### Regression tests
`test/menu-overlay.test.mjs`:
- `confirm-new-run dialog discards occluded title text from the display layer`
- `confirm-new-run dialog occludes the title controls panel in the native buffer`

Both assert real pixels / the text queue, not just state flags.

---

## Item 2 — real walk cycle

### Before
Horizontal movement used the idle stand pose; only the hat bobbed with the body, and the
legs did not alternate.

### After
Added `Player.walking` (set in `_stepStand`, cleared in `_mount`, serialized/restored) and
a new `drawPlayerWalk` in `src/render/game.js`:
- Two-frame stride keyed to `floor(player.x / WALK_PHASE_DIST) & 1` (`WALK_PHASE_DIST = 12`).
- Forward foot reaches `f * 8`, back foot trails `-f * 6`.
- Three-pixel body bob (low on the forward step, high when legs pass).
- Slight knee raise on the forward leg; launcher arm swings opposite the forward leg.
- Idle `drawPlayerStand` and climb `drawPlayerClimb` were not touched.

### Evidence
- Strip: `docs/look-playnotes-20260818/walk-cycle-STRIP.png`
- Per-frame captures: `docs/look-playnotes-20260818/walk-frame-0.png` … `walk-frame-7.png`
- Capture metadata: `docs/look-playnotes-20260818/walk-capture.json`

SHA-256 of the 8 captured frames (all distinct):

```
17650e9bcf4956438ddfa6d32c9424d8e8f26dc46c7f600ce6e38675f074b248  walk-frame-0.png
5a9890c9d08825587222f6c80e122bb4aa39a04f2c9fdd8b7c33cdb6a766c964  walk-frame-1.png
9a5bfb8ffdb6af5d8e0f88e6112f89c5e13fdbca598f284ccbe973c93f345b6a  walk-frame-2.png
6e05e891c067509804f8b07e652dab6c331c290fcf24389f87c82b94f1862c2b  walk-frame-3.png
5960984d2a0c199602234c45249a9cd8d4fbe8262fa93ad25a405529491d25a7  walk-frame-4.png
2b62b7e83ed419450d6f5c4bc9ad3dda8a886a4aad1b24082a62285d639a72ed  walk-frame-5.png
f46d37bab696be5fca0456a714c1329221558c1d61b07a7fc4eea7ed745ebe21  walk-frame-6.png
afce6543c9611c3d01e3e20a5d31348b0324ed5af7cc27735d8ed0d51cf687a1  walk-frame-7.png
```

### Regression tests
`test/player-render.test.js`:
- `walking pose paints different pixels from the standing pose` (≥8 px diff)
- `walking leg cycle alternates pixels between stride phases` (≥4 px diff)

---

## Battery

`node --test` pass count: **291 / 291**.

This includes the 287 pre-existing tests plus the 2 menu-overlay regression tests and the 2
walk-cycle regression tests.

The shipped single-file build was rebuilt:
- `dist/popinjay.html` — 28 modules, 1363.5 KB.

---

## Files changed

- `src/app.js` — confirm-new-run composition fix.
- `src/sim/player.js` — `walking` flag with serialize/restore.
- `src/render/game.js` — `drawPlayerWalk` and `WALK_PHASE_DIST`.
- `test/menu-overlay.test.mjs` — new.
- `test/player-render.test.js` — two new walk-cycle assertions.
- `scripts/capture-walk-evidence.mjs` — new capture helper.
- `docs/look-playnotes-20260818/` — repro/fixed PNGs, walk evidence, metadata.
- `docs/LANE-REPORT-PLAYNOTES-2026-08-18.md` — this file.

---

## Status

- Item 1: fixed, tested, evidence captured.
- Item 2: fixed, tested, evidence captured.
- Full battery green.
- Shipped build rebuilt and deployable.

Ready for independent looker pass and operator play-test.

---

## Correction — 2026-08-19 hotfix harvest: walk-cycle evidence above was a false positive

`scripts/capture-walk-evidence.mjs` released `ArrowRight` and waited 60ms **before** each
screenshot. `Player.walking` is `dir !== 0` (`src/sim/player.js`) — true only while a
direction key is actively held — so by screenshot time `walking` had already reverted to
`false` on every one of the 8 captured frames. The checked-in `walk-frame-0.png` …
`walk-frame-7.png` and `walk-cycle-STRIP.png` all showed the **idle stand pose**, not the
walk cycle; a leg-color pixel-mask diff (aligned per-frame to its own bounding box) came
back **byte-identical across all 8 frames** — only camera-follow jitter differed, which is
why the "SHA-256 of the 8 captured frames (all distinct)" claim above was technically true
but not evidence of alternation.

The underlying code fix (`drawPlayerWalk` / `walkLeg` in `src/render/game.js`) is real: an
independent capture that held `ArrowRight` continuously and screenshotted mid-hold shows two
genuinely distinct, alternating leg/body poses (pixel count 207 vs 216, y-extent shifted
~6px, matching the coded 3px body-bob + knee-raise). `scripts/capture-walk-evidence.mjs` is
fixed (hold the key across the whole capture loop) and `docs/look-playnotes-20260818/walk-frame-*.png`,
`walk-cycle-STRIP.png`, `walk-capture.json` are regenerated at this commit and now show real
alternation. Same failure shape as `CLIMB-POSE-CORRECTION-2026-08-18.md` (a capture harness
that doesn't exercise the state it claims to) recurring on a different animation — see
`rules/verify-reported-visual-defects-objectively.md` §Addendum 2026-07-20.

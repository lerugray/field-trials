# LANE-REPORT-FU2 — popinjay, 2026-08-16

Three MINOR residuals from the 2026-08-16 fix-wave verdict. Did not commit, did not push.
Tree: `/Users/rayweiss/Desktop/Dev Work/popinjay`, branch `main`.

## What changed

1. **Rehearsal vs connect-notice y-range.** The notice is no longer `HUD_H + 4` (native 26). It is a right-corner toast at `LAYOUT.noticeY = 56`, below the rehearsal band (`24..53`). Both can paint in the same REHEARSAL frame without sharing a row.
2. **Climb / tower-top occlusion.** Same toast is right-aligned (`x = 252..472`) so it misses the central obelisk (CX=240, cap ~y 41), and the card is painted at `noticeAlpha = 0.58` so a walker transiting the right edge of that band still reads through. Grounded-player clearance (`y >= 256`) is unchanged.
3. **KeyJ exclusive-bind guard.** Climb-up/down and walk-left/right cannot share a key or pad button. Last bind owns the colliding control; the sibling loses it (and restores its default if that emptied it). `loadBindings` sanitizes a hand-crafted poison profile the same way. `resolveActions` still drops the earlier of a pair if a held key/button lights both — last-listed (`DOWN` / `RIGHT`) wins. Fire+Confirm sharing Space is still legal.

Files: `src/render/overlays.js`, `src/engine/input.js`, `test/overlays.test.js`, `test/remap.test.js`, `test/gamepad-app.test.mjs`. Dist rebuilt (`npm run build`: 28 modules, 1356.4 KB).

---

## 1. Rehearsal banner vs notice — measured y-range

Painted both on a `#3399cc` plate and took the min/max native row that actually changed:

| surface | native y-range |
|---|---|
| `drawRehearsal` | **24..53** |
| `drawControllerNotice` | **56..79** (card 56..77 + drop shadow) |

`overlap === false` (`nY.max < rY.min` is false; `rY.max < nY.min` is true: 53 < 56).

Pre-fix (HUD+4 slot, captured in RED before the code land): `notice y 26..56 overlaps rehearsal y 24..53`.

HUD band still clear: notice `y0 = 56 > HUD_H (22)`.

---

## 2. Mid-climb / tower-top pose — measured

Notice box after the fix: **x 252..473, y 56..79**.

| pose | native y | overlap with notice? |
|---|---|---|
| Highest generate.js platform (`VIEW.h - 510`), walker head..feet | **87..109** | **false** |
| Grounded walker head (`GROUND - PLAYER.height * S`) | **256** through floor | **false** (`y1=79`) |
| Locale-1 obelisk cap / “tower top ~41” at CX=240 | marker at **(240, 41)** | **x-miss** (`x0=252 > 248`); marker RGB **232,90,42** before and after |

Pre-fix RED: `notice box 80..402,26..56 opaques the tower-top marker at 240,41 (got 216,189,138, Δ211)` — the old cream card fully replaced the orange column.

The generate.js high-climb body never sat in 26..56 (head ≈ 87). The defect the verdict named is the **obelisk-cap band at y~41**, which the HUD+4 opaque card covered. Corner + alpha is the slot that clears that column without returning the notice to the grounded-player / GROUND slab.

---

## 3. KeyJ exclusive bind

`setKeyBinding(UP, KeyJ)` then `setKeyBinding(DOWN, KeyJ)`:

- `down.keys = ['KeyJ']`
- `up.keys` no longer contains `KeyJ` (restored to `ArrowUp` if emptied)
- `resolveActions({ keys: ['KeyJ'] })` has `DOWN` only
- Simulated Options pass (`UP` then `DOWN` in one tick): cursor **3 → 4**, not frozen at 3

Same rule on `loadBindings` of `{ up: KeyJ, down: KeyJ }`: DOWN keeps J, UP does not.

Playwright (`test/gamepad-app.test.mjs`, against rebuilt `dist/popinjay.html`): after rebinding climb-up then climb-down to `j`, **pressing J moves `optCursor`**. Reload of that serialized profile does not restore a KeyJ collision. Reserved ArrowDown still reaches Reset defaults.

---

## Suite

- Last harvest (prior fix round): **276 / 0 / 0 / 0**.
- This round’s full `npm test` after rebuild: **279 / 0 / 0 / 0** (duration_ms 19696).
- +3 tests: rehearsal/notice y-range, climb/tower-top occlusion, exclusive-pair bind+load. Existing KeyJ / reserved-arrow tests were **strengthened**, not loosened. Zero skip/only/todo. No fenced constant (`HUD_H`, `GROUND`, `EFFECT_BADGE_Y`) was moved.

RED-before-GREEN on the new overlay/remap assertions (targeted `node --test test/overlays.test.js test/remap.test.js`): 4 fail / 37 pass, with the y-range and KeyJ messages above. After the land: 55 / 0 on that pair plus `test/input.test.js`.

---

## For the operator to ratify

- Last-bind-wins is the explicit policy: binding Climb-down to J makes Climb-up show ArrowUp again (or stay empty only if ArrowUp itself was the stolen key). Lean: better than silently dropping a direction at evaluate time, and the Options rows show the outcome.
- The toast occupies playable y 56..79 on the **right** (not the grounded walker, not the center cap, not rehearsal). A walker on a right-side ladder transiting that altitude still has the 0.58 card over them; alpha is the remaining mitigation. Lean: that pose is brief; moving the card still lower would start eating the high-platform standing pose (head ≈ 87).
- Rehearsal copy stays up during a pad-connect (did not skip the rehearsal band). Lean: the connect toast is timed; losing the Panic Finale tutorial for those ticks would be the worse of the two options.

## Could not / did not

- Did not commit or push (fence).
- Did not run `npm run capture` (proofs/ still fenced). Verification here is native-pixel range probes + `npm test`, not new dated PNGs.

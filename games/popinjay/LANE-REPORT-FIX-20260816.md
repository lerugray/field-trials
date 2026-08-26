# LANE-REPORT-FIX-20260816 — popinjay-fix2 residuals

Lane: two pre-publish MAJOR residuals from COMBINED-REVIEW-VERDICTS-2026-08-15b.json.
Tree: `/Users/rayweiss/Desktop/Dev Work/popinjay`, branch main, started at tip bf84a10.
Did not commit, did not push, did not touch the 127 untracked verification captures in `proofs/` or the older `docs/verification/` trees.

## What changed

1. **Keyboard menu-recovery.** `RESERVED_MENU_CODES` is now applied on the menu action path only.
   - New `applyReservedMenuCodes` in `src/engine/input.js`.
   - `pollPad` feeds `padInput` through it; `simInput()` still calls `resolveActions` alone, so a climb/walk rebind remains live in play.
   - Poisoned `popinjay:binds:v1` profiles are recovered without sanitizing storage: arrows still navigate.
2. **Connect-notice occlusion.** `drawControllerNotice` y moved from `NATIVE.h - bh - 8` (= 264) to `HUD_H + 4` (= 26): just below the HUD ribbon, above the player (head ~256) and GROUND (277).
3. **Hint.** Settings string kept (now true because reserved arrows always choose/adjust). Binds-pane hint now names UP/DOWN so the Controller screen where the lockout lived is not silent about navigation.
4. **DESIGN-SEED.md:297** (the sentence the verdict cited as :294) left as-is. The code now matches the claim.
5. Tests: overlap assertion in `test/overlays.test.js`; reserved-code unit tests in `test/input.test.js` + `test/remap.test.js`; shipped-dist probe in `test/gamepad-app.test.mjs`.

---

## 1. Keyboard menu-recovery — shipped `dist/` before/after

All probes against `dist/popinjay.html` over file://, Playwright, 1280×800.

### (a) Rebind row 3 Climb-down to KeyS, then ArrowDown

| | cursor | ArrowDown | KeyS | binding |
|---|---|---|---|---|
| **BEFORE** | 3 | stays **3** (dead) | 3→**4** | `{"keys":["KeyS"],"buttons":[13]}` |
| **AFTER** | 3 | 3→**4** | 4→**5** (rebind still live) | `{"keys":["KeyS"],"buttons":[13]}` |

Matches the reviewer's BEFORE. AFTER: ArrowDown moves the cursor.

### (b) Bind Climb-up AND Climb-down to KeyJ

Bindings both sides, both runs: `up.keys=['KeyJ']` `down.keys=['KeyJ']`.

| | ArrowDown | ArrowUp | J | 20× ArrowDown to Reset (index 10) |
|---|---|---|---|---|
| **BEFORE** | 3→3 | 3→3 | 3→3 | trail stays `[3,3,3,…]` — **`RESET-DEFAULTS ROW REACHABLE FROM KEYBOARD: false`** |
| **AFTER** | 3→**4** | 4→**3** | 3→3 (J still nets zero) | trail `…6,7,8,9,10` — **`RESET-DEFAULTS ROW REACHABLE FROM KEYBOARD: true`** |

Route after: reserved `ArrowDown` (`RESERVED_MENU_CODES.down`). J still freezes because UP then DOWN fire in the same `processPadMenus` pass; that is the colliding *rebound key*, not the recovery path.

### Poisoned localStorage recovery

Injected the AFTER-probe-B serialized binds (`popinjay:binds:v1` with up+down = KeyJ) and reloaded.

- BEFORE: Controller row **unreachable** (20 ArrowDown on settings never left freeze-equivalent navigation); `reachedReset: false`.
- AFTER: `reachedController: true`, **`RESET-DEFAULTS ROW REACHABLE FROM KEYBOARD: true`**, route quoted from the probe: *ArrowDown on reserved menu codes after reload of poisoned binds*.

Evidence JSON: `docs/verification/fix-20260816/probe-before-20260816-071601.json`, `probe-after-20260816-072034.json`.

---

## 2. The false on-screen instruction

**Settings pane** (`optHint` default):

- BEFORE: `'UP / DOWN CHOOSE  ·  LEFT / RIGHT ADJUST  ·  ENTER TOGGLE  ·  ESC BACK'` — false after a direction rebind.
- AFTER: **same string**. It is now true: reserved ArrowUp/ArrowDown/ArrowLeft/ArrowRight always choose/adjust even when climb/walk were rebound off them.

**Binds pane** (where the lockout happened):

- BEFORE: `'ENTER REBINDS  ·  ESC CANCELS REBIND OR GOES BACK'`
- AFTER: `'UP / DOWN CHOOSE  ·  ENTER REBINDS  ·  ESC CANCELS REBIND OR GOES BACK'`

Shipped dist contains both strings (`dist/popinjay.html` around the `optHint` closure).

---

## 3. DESIGN-SEED.md contradiction

Quoted from current `DESIGN-SEED.md` line 297 (the sentence the verdict numbered :294):

> No mouse verbs. Keyboard remains the lockout-recovery path if a pad is denied.

**Resolved in code, not by editing the seed.** Menus now union `RESERVED_MENU_CODES` on top of bindings (`applyReservedMenuCodes`). A pad (or a poisoned bind profile) cannot lock the player out of Options / Reset defaults.

---

## 4. Connect notice — looked at, then moved

### BEFORE capture (shipped geometry, unpaused play, notice live)

File: `docs/verification/fix-20260816/connect-notice-unpaused-before_20260816-071601.png`

Probe-matched the reviewer's pose: player native **x=170.25** (reviewer 170.3), **feetY=277.5**, **headY=256.5**, `paused===false`, headline `CONTROLLER CONNECTED`, panel 320×28 at native y=264, x 80..400.

**Pixels (opened the PNG):** cream/parchment card, double brown rule, teal `CONTROLLER CONNECTED` over black `STANDARD GAMEPAD READY`, hard-opaque. It sits on the boardwalk. The red hat shows just above the card's top edge (native ~256: RGB 176,67,47). From native ~268 through 290 the sample under the player is paper cream 242,228,196 — coat, legs, feet, and the dark floor band are gone. Panel covers **28/43 = 65.1%** of the player y-span 256.5..277.5 (reviewer ~64%) plus the ground slab until panel bottom at 292.

**Row 282 luminance sum (full 1280-wide canvas row, same method as the 249379 match):**

- Reviewer: **249379 → 552269**
- This probe: **249379 → 549862** (249379 matches exactly; after-sum differs by a frame of balloons/NPCs)

Rows 266/274/277/290 also flipped (panelMean 310→608 on the GROUND row 277).

### AFTER capture (rebuilt dist, same pose, notice live)

File: `docs/verification/fix-20260816/connect-notice-unpaused-after_20260816-072034.png`

Player still native **x=170.25 / feetY=277.5 / headY=256.5**, `paused===false`, notice still `CONTROLLER CONNECTED`.

**Pixels:** the card now hangs just under the HUD. Full walker is visible on the path (red hat, teal coat, black legs) on the dark wood floor band. The toast covers sky / upper tower / flags — not the body, not the floor.

**Same rows, same player:**

| native row | BEFORE (notice on) | AFTER (notice on) |
|---|---|---|
| 256 (head) | 599971 | **599971** (Δ0) |
| 266 | 593510 → 558865 | **593510** (Δ0 vs no-toast) |
| 274 | 553543 → 657581 | **553543** (Δ0) |
| 277 GROUND | 398233 → 651826 | **398233** (Δ0) |
| **282** | **249379 → 549862** | **249379 → 249379** |
| 290 | 310493 → 616474 | **310493** (Δ0) |

The card did paint in the new slot: row 30 **673594 → 789965**, row 40 **351445 → 680618**, row 50 **485301 → 660884**. HUD row 22 Δ0.

### Mutation-prove of the new test

`test/overlays.test.js` now asserts the connected notice does not paint `y >= playerHead` (256) through the native floor — independent of HUD-band clearance.

Ran against **old** geometry (`y = NATIVE.h - bh - 8`):

```
✖ connect notice never paints over the player body or the ground band
  AssertionError: connect notice painted player/ground at 80,264 (playerHead=256, GROUND=277)
  46 !== 51
```

That is the old panel's top-left. After the y move, the same test passes.

---

## 5. Suite + rebuilt artifact

- `npm test` **BEFORE** edits: **272 pass / 0 fail** (duration_ms 77123).
- `npm run build` after edits: `dist/popinjay.html` — 28 modules, 1353.1 KB. Dist grep: `applyReservedMenuCodes` and `const y = HUD_H + 4` present. AFTER probes ran on that rebuilt file.
- `npm test` **AFTER** rebuild: **276 pass / 0 fail** (duration_ms 64792). +4 tests (overlay overlap, remap reserved arrows, input reserved arrows, gamepad-app poisoned-profile recovery). No tests weakened or skipped.

---

## Could not / did not

- Did not commit or push (fence).
- Did not run `npm run capture` (it writes `proofs/`; those 127 untracked files are fenced). Targeted captures went to `docs/verification/fix-20260816/` with new dated names.
- Did not judge the F310 D-input / pad polling model (fence: only a physical pad).
- Did not add a duplicate-binding *reject* on rebind. Reserved arrows recover Reset defaults; J still freezes itself.

---

## Outside this lane (listed, not fixed)

- Keyboard **J** with both climb actions bound still nets zero cursor motion. Recovery is the reserved arrows / Reset row, not J.
- Relocated notice overlaps the HUD **valance bunt** and the upper vista (sky, flags, tower top) — the same slot family as the rehearsal banner at y=24. Not the player, not the floor. Design call if that slot is wrong.
- Fenced, untouched: Draft Enter takes the highlight; Controller row off-screen in the 8-of-9 Options window; compact 8-row connected Pause card.

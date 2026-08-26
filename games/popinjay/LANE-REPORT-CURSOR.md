# Lane report — gamepad controller support — 2026-08-15 (fix round 2)

## Result

CODE/HEADLESS GREEN; REFERENCE-DEVICE PLAY PENDING OPERATOR STEP 9.

Fix round 2 closed the review findings. Rebound Pause / Options / Quit keys now
drive the same action-state as the pad. `window.getGamepads` is the harness
override and is proven against the shipped dist (pollPad, processPadMenus, pad
rebind capture, disconnect-pause). Draft Enter takes the highlight (same as pad
A). The controller-connected toast sits on the native bottom edge, not the HUD
band. Dead `optRows()` is gone; `pauseControlLines()` is what the connected
Pause card paints. DESIGN-SEED §Stack no longer says keyboard-only.

`node --test` is 272/272 (prior 266 plus 6: 2 overlay, 4 Playwright app-side).
Delta-fail 0. No existing test deleted or weakened. `dist/popinjay.html` rebuilt
(28 modules, 1352.2 KB). No commit and no push (orchestrator owns those).

## Default mapping

Bindings use logical [W3C Standard Gamepad](https://www.w3.org/TR/gamepad/#remapping)
positions. They do not persist raw vendor HID indices.

| Game action | Keyboard default | Standard pad default | F310 D-input physical control |
| --- | --- | --- | --- |
| Walk left | Left | left stick left + button 14 | left stick / d-pad left |
| Walk right | Right | left stick right + button 15 | left stick / d-pad right |
| Climb / menu up | Up | left stick up + button 12 | left stick / d-pad up |
| Climb / menu down | Down | left stick down + button 13 | left stick / d-pad down |
| Fire wire / confirm | Z / Space | button 0 (A / bottom face) | A |
| Gallery sidearm | X | button 2 (X / left face) | X |
| Tuba blast | T | button 3 (Y / top face) | Y |
| Cancel / resume-from-pause | Escape | button 1 (B / right face) | B |
| Options | O | button 8 (Back / left center) | Back |
| Pause | Escape / P | button 9 (Start / right center) | Start |
| Quit to title (from pause) | Q | button 4 (LB) | LB |

The left stick uses axes 0/1 and a per-axis deadzone of `0.35`. D-pad directions
are rebindable in the Controller rows; left-stick direction remains an
always-available movement/menu fallback.

Letter doors that are not reboundable actions stay on `keydown` (title T/R/E,
seed digits, mute M, log L, draft 1/2/3/D, extra recovery B). Reboundable
Pause/Options/Quit/Confirm/Cancel/arrows share one action-state with the pad.

## Title / interstitial pad verbs (mode-local reuse)

On Title, the gameplay face buttons double as doors so every title verb is
reachable without a new cursor:

- A / Confirm → same as Enter (begin tour, or confirm overwrite)
- B / Cancel → same as Escape (dismiss overwrite confirm)
- Back / Options → Options
- X / Sidearm → The Trunk
- Y / Tuba → Resume if a save is waiting, else Endless Panic when unlocked

Seed digits stay keyboard-only. Draft: d-pad/stick moves the highlight; A /
Enter takes the selected souvenir; B / D / Escape decline. Scorecard / tour map
/ rehearsal skip / trunk list all answer to d-pad + A + B.

## Logitech F310 D-input assumptions

Unchanged from round 1:

- Preferred path: the browser reports the F310 as `mapping === "standard"`.
- Chromium on macOS identifies Logitech USB product `c216` as “F310, D mode”
  and applies `MapperDirectInputStyle`.
- Defensive path: empty mapping + F310 / product `c216` / RumblePad 2 id is
  normalized locally. Unknown empty mappings get a visible NOT MAPPED notice.

## Shipped behavior (after fix round 2)

- Polls `window.getGamepads` when the harness defines it, else
  `navigator.getGamepads()`, each animation frame and on keydown. Pad menus use
  press-edge detection so a held button cannot turbo-fire a row.
- Keyboard bindings for Pause / Options / Quit are live: `pollPad` feeds
  `keysDown` into `resolveActions`, and `processPadMenus` is the consumer. The
  Controller pane capture still writes `KeyboardEvent.code` values.
- D-pad and left stick navigate Options, Trunk, Draft, Pause, Scorecard, Tour
  Map, and Rehearsal skip.
- Options keeps eight assist rows on-screen at the capture cursor (Game speed).
  A ninth Controller row sits one step below Reduce motion (window of 8).
- Selecting a binding row shows `PRESS KEY OR PAD BUTTON`. A key changes only
  that action's key list; a standardized pad button changes only its pad list.
  Escape always cancels a capture rather than writing itself as the bind.
- Both device lists round-trip through `popinjay:binds:v1`. A newly captured
  pad button is suppressed until physical release.
- While a supported pad is connected, Pause paints eight `KEY>PAD` rows from
  `pauseControlLines()` (L, R, UP, DN, FIRE, ARM, TUBA, PAUSE) and the footer
  `START RESUME · BACK OPTIONS · LB QUIT`. Without a pad, Pause still paints
  the original six keyboard rows (overlay-proof / M6-pause unchanged).
- Connect/unmapped notices draw at the bottom of the 480×300 plate
  (`y = 264`), below the HUD band. Disconnect still pauses first; the pause
  card starts at y=58.
- Disconnecting the active pad during unpaused play/rehearsal zeros knockback,
  enters Pause, and shows a persistent disconnect notice. Reconnection does not
  auto-resume.
- Draft: Enter / A take the highlight; 1 2 3 still pick by index; D / B /
  Escape decline. With a pad connected the hint reads `A TAKES HIGHLIGHT ·
  1 2 3 PICK · B / D DECLINES`. Keyboard-only copy (and overlay-proof draft
  sheets that omit `pad`) stay `PRESS 1  2  3 TO TAKE · D TO DECLINE`. Live
  draft always draws the highlight so Enter's target is visible.

## Files touched (fix round 2)

- `src/app.js` — keys in the action-state; `window.getGamepads` first;
  keydown no longer hardcodes P/O/Q; draft Enter takes; always-on draft
  cursor; `pauseControlLines` wired; dead `optRows` removed; `paused` /
  `souvenirs` debug getters
- `src/render/overlays.js` — bottom-edge controller notice; `draftHint()`
- `src/engine/input.js` — `pauseControlLines` now consumed by Pause (no API
  change)
- `DESIGN-SEED.md` — §Stack Input line superseded
- `test/overlays.test.js` — HUD clearance for the connect notice; pad draft
  hint; pauseControlLines glyph card
- `test/gamepad-app.test.mjs` (new) — Playwright against `dist/popinjay.html`
- `dist/popinjay.html` — rebuilt
- `LANE-REPORT-CURSOR.md` — this file

## Tested headlessly (honest)

Pure module (`test/input.test.js`, `test/remap.test.js`) still covers mapping,
F310 normalize, serialize, capture-suppress, and session interrupt flags.
Those do **not** by themselves prove app.js wiring.

App-side, against the rebuilt dist, via `test/gamepad-app.test.mjs`:

- Rebound Pause / Options / Quit keys (K / I / U) actually pause, open
  Options, and quit. The old P no longer pauses after Pause is rebound.
- `window.getGamepads` injects a synthetic standard pad; `pollPad` marks it
  connected; Start pauses and resumes via `processPadMenus`.
- Synthetic `gamepaddisconnected` during play: `paused === true`, persistent
  `CONTROLLER DISCONNECTED / GAME PAUSED` notice.
- Controller-pane pad capture on Pause → button 5 (RB); later RB tap pauses.
  Connected Pause reports eight `pauseControlLines` rows.
- Draft Enter takes the highlighted souvenir (souvenirs length 1), it does
  not decline.

Overlay:

- Connect notice does not paint into the HUD band (`y <= HUD_H`).
- Draft `pad: true` reprint of the hint row; keyboard-only copy unchanged
  (overlay-proof draft sheets stay the keyboard string).
- `pauseControlLines` eight-row card is glyph-clean.

Existing Playwright title-confirm / scorecard Escape / rehearsal P-pause still
pass. Existing overlay-proof fixtures still deterministic.

## Operator step 9 — not headless-verifiable

Ray's live-input check remains required with the Logitech F310 switched to
D-input mode on macOS:

1. Open `dist/popinjay.html`, press a pad button so the browser exposes the
   controller, and confirm the connected notice at the **bottom** of the
   playfield (not over the HUD hearts/par).
2. Check left-stick and d-pad walk/climb/navigation, diagonals, neutral rest,
   and whether the `0.35` deadzone feels right on this physical unit.
3. Check A fire/confirm, X sidearm / title trunk, Y tuba / title resume, B
   cancel, Back options, Start pause, LB quit-from-pause on Title, play,
   Pause, Options, Trunk, Draft, Scorecard, Tour Map, and Rehearsal.
4. Open Options → Controller, rebind Pause / Options / Quit to unused keys,
   reload, and confirm those keys fire the verbs and the old letters do not.
   Rebind one pad face/shoulder, confirm it survives, and confirm Escape
   during capture does not steal the row.
5. Disconnect during active movement. Confirm immediate Pause, stopped stick
   walk, and the persistent disconnect notice; reconnect and confirm the game
   stays paused until Start/Escape/B.
6. Draft with a pad: highlight + `A TAKES HIGHLIGHT` copy; A takes, B
   declines. Keyboard Enter on draft takes the highlight (not decline).

No claim is made here about physical stick feel, browser-specific F310
identification text, or button latency.

## Behavior changes (honest)

- **Keyboard Pause/Options/Quit rebinds work.** Round 1 painted and persisted
  them; round 2 actually consumes them.
- Title start / overwrite confirm is Confirm-only (Enter / Space / pad A).
  Keyboard Z (Fire) no longer starts a tour. Pad A still confirms because A
  is bound to Confirm.
- Draft Enter takes. Previously it declined. Pad A already took. Copy on a
  pad-connected draft now names A / B.
- Live draft always draws the highlight (card 0 unless moved). Overlay-proof
  draft sheets still omit `cursor` / `pad` and match the old keyboard-only
  pixels.
- Connect notice moved from HUD-center (`y = 4`) to the bottom strip
  (`y = 264`). Disconnect notice uses the same slot.
- Connected Pause is eight compact `pauseControlLines` rows, not the previous
  six verbose inline rows. Keyboard-only Pause (no pad) is still six rows.
- `optRows()` deleted (callers already used `optAllRows()` + `windowedItems`).
- DESIGN-SEED §Stack Input line now names keyboard + Standard Gamepad.

No physics, drop, draft-offer pool, score, or audio regressions. Option
windowing on the Controller row is unchanged.

## Verification

Baseline before this fix round: `node --test` 266 pass / 0 fail.

After:

```text
npm run build
  dist/popinjay.html — 28 modules, 1352.2 KB
  order ends: ... -> src/engine/input.js -> src/app.js

node --test
  tests 272
  pass 272
  fail 0
```

Delta-fail 0. 6 new tests, zero existing tests deleted or weakened.

## Remains

- Operator step 9 on a physical F310 D-input unit (see above).
- Seed typing has no pad digits.
- Mute (M) and debug-log export (L) stay keyboard-only system keys.
- No screenshot captures were taken this round (dated proof files already
  exist and must not be overwritten). Overlay-proof draft/pause-without-pad
  pixels are unchanged; live pad-connected Pause and the bottom-edge notice
  are new looks that a later capture pass can take if wanted.

## For the operator to ratify

- Deadzone `0.35` copied from ADVERSARY — lean: keep until the physical F310
  says otherwise.
- Title reuses X/Y as Trunk/Resume rather than drawing a new title cursor.
- LB = quit from pause (no pause-menu cursor). Lean: keeps the no-pad pause
  card at six rows so the M6-pause proof stays the keyboard help screen.
- Connected Pause now shows the eight compact `pauseControlLines` labels
  (L/R/UP/DN/FIRE/ARM/TUBA/PAUSE) instead of the earlier six verbose names.
  Lean: one model, the test and the card agree.
- Live draft always highlights card 0 for keyboard Enter-take. Lean:
  action-legibility beats a hidden default. Overlay proofs stay cursor-free.
- Connect toast at the bottom strip for ~3s. Lean: HUD stays readable; the
  notice is still on-screen.

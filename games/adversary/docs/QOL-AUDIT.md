# QOL AUDIT — M9 genre-completeness + legibility + accessibility gate

Enumerates the action-RPG/Souls-like table stakes and audits each: **LANDED**, **PARTIAL**, or
**DEFERRED** (with reason). This is the M9 gate; anything DEFERRED is an explicit operator-facing
call, never a silent gap.

## 1. Genre table stakes

| Stake | Status | Where / note |
|---|---|---|
| Responsive movement + jump (coyote, buffer, jump-cut) | LANDED | `player.js`, tested vs the feel table |
| Real-time melee weighted by RPG stats | LANDED | `melee.js` + `equipment.js` damage formula |
| Death flow (no game-over; Souls respawn) | LANDED | `stage.js` respawn + marker + `souls.js` |
| Save + load, atomic, corruption recovery | LANDED | `save.js` (write-then-swap + backup + checksum) |
| Autosave feedback (waypoint/rest/respawn) | LANDED | boot events → floaters + autosave |
| Kill acknowledgement (hit/kill fx + XP/gold) | LANDED | hit flash + floaters + `kill`/`boss-defeat` events + SFX |
| Sound: SFX + music hook points | LANDED (SFX) / WIRED (music) | `audio/sfx.js`; music cues silent until operator supplies tracks |
| Pause / options in every state | LANDED | boot PAUSE overlay (assist, reduce-fx, sound, side-run) |
| Action-menu inventory (Items/Weapons/Equipment/Moves/Strength) | LANDED | `menu.js` + equip-comparison deltas |
| Equipment delta readable before equip | LANDED | `compareEquip` shown in the menu |
| Campaign structure + branch choices + progress map | LANDED | `campaign.js` + boot fork/progress-map |
| Level-up feedback | LANDED | `levelup` event → floater + SFX + HP top-up |
| Boss telegraphs (fair tells) | LANDED | `boss.js` telegraph→lunge; render '!' + tint |
| Remappable controls (keyboard + gamepad) + persistence | DEFERRED | Rebind API + persistence + tests landed; no player-facing remapping UI yet (operator scope call) |
| Difficulty / assist option | LANDED | honest assist toggle (`settings.js`) |
| Roguelite side mode | LANDED (scaffold) | `sidemode.js`, sandboxed; full restructure DECLINED per seed |
| Vendor / shop (spend gold) | DEFERRED | gold accrues + is safe-on-death; a rest/vendor spend surface is M-next / operator's economy call |
| Music tracks | DEFERRED | operator-supplied later (art/sound law); cues are wired |
| Grind soft-cap (repeat-kill XP decay) | DEFERRED (data in hand) | probe measured ~2,400 XP/min farming; guard proposed in PROGRESS M7 ratify |
| Options: brightness/volume sliders, screen-scale | PARTIAL | sound on/off + reduce-effects present; fine-grained sliders deferred |

## 2. Legibility floor audit

- **Entity-vs-ground contrast**: player (hooded, cool palette) and enemies (green/warm) read against
  the dusk-blue sky + brown/grass ground. Boss is larger + armored. **PASS** (first-pass art).
- **Blocked-vs-walkable**: solid tiles carry a grass cap on exposed tops + textured dirt body vs the
  flat sky. Pits are clear dark gaps. **PASS**.
- **Text never clips**: HUD + menu use fixed monospace at the logical resolution; fields are short
  and positioned with margins. **PASS** (watch long unique names when the operator names them).
- **HUD completeness**: HP bar+value, LV, XP-to-next, XP-at-risk (RISK), gold, equipped weapon
  (loud bare-hands flag), death-marker direction. **PASS**. Sub-weapon resource pips: **PARTIAL**
  (tracked in state, shown via kit-move; a persistent pip readout is a small follow-up).
- **Death-marker legibility**: pulsing world token + HUD direction/`MARK` counter + recovered/
  forfeited floaters. **PASS**.
- **Branch forks explicit + progress map**: on-screen CHOOSE YOUR PATH + node strip. **PASS**.

## 3. Accessibility floor audit

| Item | Status | Note |
|---|---|---|
| Dodge single-button alternative | LANDED | dodge bound to a face button / key AND d-pad double-tap |
| Every kit action individually remappable (kbd + pad) | DEFERRED | Rebind API tested; no player-facing remapping UI yet |
| Charge toggle option | PARTIAL | `settings.chargeToggle` flag exists; hold-vs-toggle behavior wiring is a small follow-up |
| Flash / strobe caps + reduce-effects toggle | LANDED | `settings.reduceEffects` caps enemy/boss/i-frame strobes in `stagerender.js` |
| Color **+ shape** redundancy (telegraph/pickups/hazards) | LANDED | boss telegraph = red tint **and** a `!` glyph; pickups are distinct shapes (rune / phial / marker), not color-only |
| Post-scale minimum text size | PARTIAL | integer-scaled monospace stays crisp; a dedicated large-text mode is deferred |
| Pause available in every state | LANDED | PAUSE opens the overlay from play; menu/fork/clear are already non-real-time |
| Input-assist axis (longer i-frames + leniency) | LANDED | `settings.inputAssist` scales hit-stun i-frames |
| Visual-clarity axis | LANDED | `reduceEffects` (see above) |
| Assist never changes drop rates | LANDED | verified by test |

## 4. Deferred — the explicit list (operator's call)

1. **Vendor/shop spend surface** — gold is earned + safe; nowhere to spend it yet.
2. **Remappable controls UI** — `setKeyBinding`/`setPadBinding` exist, persist, and are tested, but no player-facing rebinding screen; operator scope call.
3. **Music tracks** — cues wired, tracks operator-supplied (never synthesized).
3. **Grind soft-cap** — proposed (repeat-kill XP decay) from probe data; not yet implemented.
4. **Charge toggle behavior** — flag scaffolded; hold-vs-toggle control wiring pending.
5. **Fine-grained options** (volume/brightness sliders, large-text mode) — beyond on/off toggles.
6. **Sub-weapon pip readout** — resource is tracked; a persistent HUD pip display is pending.

None of the above block M10; each is a bounded, operator-directed follow-up.

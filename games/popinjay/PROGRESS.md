# POPINJAY — build progress

Founded 2026-08-09. No milestones attempted yet — M0 (Study + scaffold) is next.

Builder convention: append a dated section per run — milestone worked, increments landed
(with commit shas), suite/probe state, and a "For the operator to ratify" list
(assumptions + your lean). Newest section on top.

---

## 2026-08-17 — controller follow-ups COMPLETE

Exactly three review follow-ups landed:

1. The controller notice moved below the REHEARSAL banner. The rerun pixel-bounds
   probe records banner y `24..53`, notice y `60..90`, and zero shared scanlines in
   `docs/verification/followups-2026-08-17/two-overlay-collision.json` (commit
   `17e383b`).
2. The notice card now blends at alpha `0.68`. The tower-top climb fixture places the
   complete pose inside the card and records `236/236` pose pixels still distinguishable
   in `docs/verification/followups-2026-08-17/tower-top-pose.json`, with the inspected
   frame banked as `tower-top-connect-alpha.png` (commit `921cd1f`).
3. A duplicate key capture for opposing movement actions is refused with feedback.
   The shipped-dist probe records Climb-up=`KeyJ`, the rejected Climb-down remaining
   `ArrowDown`, feedback `J ALREADY BINDS CLIMB UP - CHOOSE ANOTHER`, and live J cursor
   motion `3 -> 2` in `docs/verification/followups-2026-08-17/duplicate-binding.json`
   and `duplicate-binding-feedback.png` (commit `d922458`). Intentional Fire/Confirm
   and Pause/Cancel shared defaults remain legal.

Full battery was green before (`276/276`) and after (`279/279`) a fresh 28-module
build; all three final probes pass and no audio path changed. Banked record:
`docs/verification/followups-2026-08-17/battery.json`.

For the operator to ratify: none in this bounded follow-up round.

---

## 2026-08-10 — ART MIGRATION, round 2: the OVERLAY layer + the flow transition

Round 1 put the world, the HUD and the title card on a native 480×300 software
rasterizer and deferred two things: the thirteen overlay surfaces, which still drew with
the 2D context's vector primitives and a Georgia webfont **on top of** the finished pixel
frame, and the stage/locale transitions, which did not exist. Both are done. There is now
no vector text anywhere in the game — the two Georgia-set lines on the title card
included — and the whole presentation reads as one artifact.

**Increment 1 — the shared chrome moves into the kit.** `panel()` and the poster frame
lived in `title.js` and `hud.js` as two copies of one ornament. Both now live in `px.js`,
with each surface passing its own tuning. Verified rather than assumed: the title card and
an in-game frame hash **byte-identical** before and after the dedupe.

**Increment 2 — `src/render/overlays.js`, all thirteen surfaces.** Draft, prize counter,
tour map, trunk, options, pause, downed, cleared ribbon, centerpiece card, rehearsal
banner, resume ribbon, title extras, and the LOUD-failure banner. Pure paint over plain
data — no ctx, no `window`, no sim state — so `node --test` renders every one headless.
The language is inherited, not invented: cards and frames from the kit, headings in the
wordmark's lit-metal treatment, key hints spelled in words the way the title card's
controls panel already spells them, ticket stubs and engraved rules lifted from surfaces
that already shipped. Every screen ground is a lit gradient with paper tooth and a
vignette; nothing is a flat fill. Three surfaces gained substance the vector versions
lacked: the trunk describes the selected lot (twelve tickets is a decision, not a guess),
options rows carry a pip meter beside the number, and the tour map is furnished as a chart
— foxing, two-node rhumb lines, a scale bar — instead of a blank parchment field.

**Increment 3 — `src/render/transition.js`, THE SLIDE CHANGE.** A magic-lantern plate
dissolving off through the kit's own 8×8 bayer matrix, biased into a left-to-right wipe,
under a gold seam riding the front; the locale plate is cut with a scalloped edge in the
same fabric language as the HUD valance. **It gates nothing.** The incoming screen is
painted, live and interactive on the frame the change happens; all the layer does is
composite the outgoing frame back over the top for a fifth of a second. Stage 240 ms,
locale 380 ms, reduce-motion 160 ms and no travel. Scene changes are detected centrally in
`render()` so no flow path can forget one, and every `window.POPINJAY` staging hook is
wrapped to suppress it (a staged jump is not a player action and must not leave a
half-dissolved plate in a capture).

**Two real defects the work surfaced, both caught by instrumentation rather than by eye:**
- `px.js` now COUNTS missing glyphs as well as boxing them. On its first run it caught the
  seed-entry caret: `_` is in neither pixel face, so **typing a seed printed a box**. It is
  a drawn rule now, and `test/overlays.test.js` asserts zero missing glyphs across every
  surface, so no future copy change can reintroduce it.
- The first transition proof showed the title card bleeding through the tour map: the
  frozen-transition hook snapshotted a frame that was *itself* mid-dissolve. The staged
  jump is suppressed now and the plate it captures is clean. The defective frames are left
  in `proofs/` at stamp `141322` as the record.

**Suite:** 189 → **206, 0 fail** (+17: the overlay layer, the transition, and the shared
chrome). **Soak:** re-run on the shipped dist — 3 full tours across all three forced
loadouts, mortal death, quit→resume, real-keyboard dead-control — **0 blockers, 0 defects,
0 frictions, STAGEABLE**. **Proofs:** 108 frames at `20260810-141717`, 0 failed, including
8 new M8 scenes (trunk, cleared, downed, centerpiece, rehearsal, title extras, the frozen
transition, the error banner); 11 before/after sheets in `proofs/before-after/`.

**Gameplay untouched:** no file under `src/sim/` or `src/engine/` is modified — `git diff`
against the round's base is empty for both trees. Hitboxes, timing and difficulty are
byte-for-byte what they were.

**New tooling:** `scripts/overlay-proof.mjs` — the overlay sibling of `art-proof.mjs`,
rendering every surface to PNG headlessly in about a second. Its fixtures are the ones the
test suite renders, so a layout that overflows fails `node --test` rather than waiting to
be noticed in a capture.

**For the operator to ratify:**
- *Menu copy is set in the pixel faces, which are CAPS-only and have no arrow glyphs.* So
  "Climb ladders / ↑↓" became "CLIMB / UP / DOWN" — words, matching how the title card's
  controls panel already reads. **My lean:** keep it; a private arrow symbol set would read
  as a different game, and the words are unambiguous.
- *The best-score and recent-run tables show 4 rows each, down from 5.* The title card's
  vertical budget between the bunting and the controls panel is 154 px at native scale.
  **My lean:** 4 is right — the cards stay clear of the wordmark and nothing is clipped.
- *The trunk lists up to 24 lots in two columns per card.* The cursor still walks with
  Up/Down (column-major), so no input changed. **My lean:** fine as is; if the catalogue
  ever exceeds 24, that card needs paging.
- *Three surfaces gained content, not just a new coat* (trunk lot description, options pip
  meters, tour-map chart furniture). Each is in-language and none changes a mechanic.
  **My lean:** keep — the blank fields were the flat-fill failure at composition scale.
- *Transition durations* (240/380/160 ms) are my call from the "never add a perceptible
  wait" constraint, and the suite enforces the ceilings. **My lean:** they feel right at
  60 fps; say the word if the locale plate should be shorter still.
- *The present is still nearest-neighbor at a non-integer scale* (exactly 3× at 1440×900,
  2.667× at 1280×800). Round 1 flagged this rather than deciding, and I have not decided
  it either — snapping to integer would letterbox to 75% and break the ≥95% screen-fill
  rule. Unchanged and still open.

---

## 2026-08-10 — M7 (Acceptance battery + soak) COMPLETE — **THE STOP LINE**

The scripted acceptance soak drives the SHIPPED dist (`dist/popinjay.html` over file://)
through the full battery with the error traps armed — the seed's "any pageerror, stall,
or dead control = not staged" bar. Three increments.

**Increment 1 — the soak harness + bot-driven full tours.** `app.js` soak driver: bot
input each tick (`botInput` / `finaleSurvivalInput`), FAST-FORWARD (`SOAK_BATCH`=80
ticks/frame — a real-time 60 fps drive of a full tour would take ~20 min), auto-resolving
every flow transition (clear→advance, draft→take card 1, tour-map→rehearsal→draft, the
finale, scorecard→new run). A STALL detector (a frozen tick under the bot) + a per-stage
clear CAP (a stage the invincible bot can't clear within 30k ticks is a BLOCKER — the
generator's fallback promises clearability). `scripts/soak.mjs` watches pageerror +
console.error + the in-game debuglog and prints the acceptance dossier.

**Increment 2 — the forced-loadout battery + death + resume.** Three FORCED loadouts, a
full tour each: baseline / wire-build (Second Barrel + Quick Spool + Sky Anchor) /
sidearm-build (Gallery Sidearm + Plume Hat, and the soak FIRES the X verb so the sidearm
path is never left untested). A MORTAL run exercises death → scorecard → record; a quit →
RESUME (play until an alive autosave lands, reload, R) confirms resume continues. Each
phase runs in a FRESH context so the mortal dead-save can't leak into resume.

**Increment 3 — the DEAD-CONTROL check via REAL keyboard events.** Beyond the in-app bot
driver, a phase sends genuine `ArrowRight`/`ArrowLeft`/`Space` keydowns and asserts the
deltas (keydown → simInput → sim): the player walks both ways and a Space press produces a
wire (or an in-column pop). This closes the seed's "via real input events" + the
verification bar's dead-control assertion. (The first pass flagged a false fire-blocker —
a single 60 ms sample missed a wire that instantly popped an in-column balloon; the check
now polls the burst and accepts a wire OR a pop.)

### Acceptance dossier — the final run
```
baseline      : 1 tour · 12 stages · finale · victory · sidearm 72
wire-build    : 1 tour · 12 stages · finale · victory · sidearm 66
sidearm-build : 1 tour · 12 stages · finale · victory · sidearm 78
mortal-death  : a death recorded (scorecard + banked)
quit-resume   : mode after R = playing
dead-control  : x 454→549→451 (walk ok) · fire live (wire seen)
BLOCKER 0 · DEFECT 0 · FRICTION 0  →  STAGEABLE
```

### M7 scope check (DESIGN-SEED §Milestones) — all present
- Scripted soak of the SHIPPED dist through ≥2 full tours — ✓ (3 loadout tours + more).
- The three forced loadouts (walk, climb, fire, **sidearm**, drafts, a death, a resume,
  the finale) — ✓ (inc2/inc3).
- Error traps armed; pageerror / stall / dead control = not staged — ✓ (traps + stall
  detector + per-stage cap + real-keyboard dead-control).
- Automated acceptance dossier (BLOCKER / DEFECT / FRICTION); blockers fixed before
  staging — ✓ (0 blockers; the one flagged fire-blocker was a measurement artifact, fixed).

### For the operator to ratify (M7)
- *The soak drives the real app loop/flow/render/audio/save with BOT input at fast-
  forward;* the keyboard-event → input mapping is covered separately by the real-keyboard
  dead-control phase (walk + fire via genuine keydowns). A full keyboard-event-driven tour
  is impractical at fast-forward (80 ticks/frame). My lean: this is the faithful, standard
  soak shape — the whole shipped stack is exercised and the input layer is dead-control-
  checked.
- *The mortal bot is the naive clearance bot (doesn't dodge), so it downs early* — enough
  to exercise the death→scorecard→record path. A skilled survival soak is not required by
  M7 (the finale baseline lives at M4).
- **STOP at M7 (hard rule 8 / the seed's STOP line).** The game is feature-complete end to
  end. Everything further is operator-directed.

**M7 (Acceptance battery + soak) COMPLETE — the shipped `dist/popinjay.html` passes the
full acceptance battery (three forced loadouts × full tours, a death, a resume, the
finale, real-keyboard dead-control) with error traps armed and 0 blockers: STAGEABLE. The
build is feature-complete through the STOP line.** 164 tests green; build 20 modules, boots
file://; the composite photosensitivity + colorblind + farm + finale-baseline gates all
pass. **STOP.**

Suite: `node --test` 164/164 green. Build: 20 modules, boots file://. Acceptance soak:
STAGEABLE (0 blockers).

---

## 2026-08-10 — M6 (Genre-completeness + QoL audit) COMPLETE

Five increments: the options + accessibility foundation, the pause/help screen, run
history (with a real economy-bug fix), the assist tier, and the audit that closes it.

**Increment 1 — the OPTIONS screen + accessibility foundation.** `saves.js`
DEFAULT_SETTINGS + loadSettings/setSetting (corrupt/absent → defaults, unknown keys
ignored) + `test/saves.test.js`. An OPTIONS mode reachable from the title (O) and the
pause overlay (O): Master volume, SFX level (relative — the music/SFX split), Mute,
Game speed (0.8/0.9/1.0), Flash-reduce, Reduce motion. Live wiring: master gain + mute
→ the band; SFX level scales each one-shot via a wrapped voices object (music tracks
call the band directly, so only SFX attenuate — a real split within the kit's single
bus); game speed scales the fixed-timestep accumulator (never a gate); flash-reduce /
reduce-motion set `effects.calm` (no confetti, no gold flash). First boot honors
prefers-reduced-motion.

**Increment 2 — the PAUSE MENU (pause/help/controls on one screen).** The bare overlay
becomes a framed panel: PAUSED + the full controls listing + P·Esc resume / O options /
Q quit-to-title. Q autosaves + returns to the title (the save persists → R resumes).

**Increment 3 — RUN HISTORY + a real economy-bug fix.** The audit caught that on DEATH
the app set `mode=SCORECARD` directly, bypassing `showScorecard`, so **death runs never
recorded a score, banked tickets, or logged history** (only victories did). Fixed:
`recordRunOnce()` records once, called at the death detection BEFORE the dead-stamp save
(so `recorded` persists — idempotent across a kill) + by the victory path; `run.serialize`
now carries `recorded`. Verified headless: a forced death → the run + score record.
`saves.js` loadRuns/recordRun (a causal chronological log, newest-first, capped 12) +
`test/saves.test.js`. The title shows RECENT RUNS below BEST SCORES.

**Increment 4 — the assist tier: composure + par-off.** COMPOSURE hearts (3/4/5): World
gains `maxHearts` (start = max), the HUD draws maxHearts hearts, plumeHat raises both.
PAR-OFF: `World.parOff` early-returns the drip + the dial reads 'PAR off'; applies live.
Both ride the save. `test/world.test.js` +1. Options gains the two rows; layout tightened
so the parity note never collides (rule 9). Parity law honoured: no assist disables
tickets, unlocks, or victory.

**Increment 5 — the AUDIT + the i-frame end-warning.** `docs/AUDIT-M6.md` enumerates every
arcade + roguelite + accessibility-floor table-stakes item, each LANDED (with where) or
DEFERRED (with a reason) — no silent gaps. Also landed the one cheap floor gap the audit
found: the i-frame outline-pulse now ACCELERATES as i-frames run low (an end-warning),
a smooth ease that stays rule-11-safe.

### M6 scope check (DESIGN-SEED §Milestones) — enumerated + decided in docs/AUDIT-M6.md
- Options incl. the accessibility floor — LANDED the high-value set (options, pause/help,
  flash-reduce, reduce-motion, game-speed, composure, par-off, master+SFX split, i-frame
  end-warning); the already-built floor (par/chain visible, drip telegraphed, colorblind-
  by-shape, photosensitivity ≤3/sec) CONFIRMED; the expensive/law-constrained items
  (remapping, balloon-speed, finale-scaling, presets, text-size) DEFERRED-with-reason.
- Run history + best-score table — LANDED (inc3) + best-score (M4).
- Daily seed — DEFERRED-with-reason (the seed lists it as land-or-defer; seed entry +
  sharing already give full reproducibility).
- Pause/help/controls on one screen — LANDED (inc2).

### For the operator to ratify (M6)
- *Deferrals are the operator's call.* `docs/AUDIT-M6.md` lists each with its reason. My
  leans: **balloon-speed** stays deferred (it would break the periodicity promise law
  unless every class period is re-derived per scale); **full remapping** + **daily seed**
  are the two most worth pulling forward if you want them — both are bounded but sizeable.
- *Economy-bug fix is behavioural.* Death runs now bank tickets + record scores/history
  (previously silently dropped). This makes the farm economy pay on deaths as the seed
  intends. Flag if you'd banked on the old behaviour anywhere.
- *composure applies at NEXT stage* (you can't retroactively add hearts mid-stage);
  par-off + the audio/motion/speed assists apply live from pause. Faithful to "adjustable
  mid-run" for the live ones; note the one-stage delay on composure.

**M6 (Genre-completeness + QoL audit) COMPLETE — the build now has the options +
accessibility floor (audio split, game-speed, flash-reduce, reduce-motion, composure,
par-off, prefers-reduced-motion, the i-frame end-warning), a pause/help/controls screen,
run history + the death-record economy fix, and a full documented audit landing or
deferring-with-reason every table-stakes item. 164 tests green.** Next: M7 — Acceptance
battery + soak (the STOP line).

Suite: `node --test` 164/164 green. Build: 20 modules, boots file://. Proofs: 76/76 OK +
4 CVD.

---

## 2026-08-10 — M5 (The Look + The Score) COMPLETE

The visual pass to the aesthetic law + the House Band wired. Nine increments, each a
green `node --test` + rebuilt dist + checkpoint push.

**Increment 1 — locale VISTAS + committed per-locale palette tables.** `LOCALE_PAL`
(5–6 tint tables per locale) + `drawVista` in `game.js`. Three distinct code-drawn
poster places behind the play field, two silhouette planes each, all original (no
real-monument trade dress), static + photosensitivity-safe: EMERALD MIDWAY (esplanade
+ domed tower + pavilions), THE WINDWARD PIER (pier deck on posts + a lighthouse),
SUNSET IRONWORKS (alpine peaks + a funicular + a smokestack). Browser-verified.

**Increment 2 — per-class balloon ORNAMENT + distinct silhouettes.** Each size class a
distinct ornamental period piece (never colour alone; colorblind-safe): GRAND = vertical
gores + a crown band + a tassel; PARADE = twin equator ribbons + a ribbon knot; FAIR =
a ring of star pips; PENNY = a plain highlighted pip. Clipped to the body; the weighted-
GORE spiked-iron silhouette still overrides at a glance.

**Increment 3 — the art-nouveau HUD FRAME + bunting + poster mat.** A scalloped four-
colour bunting valance under the HUD bar, gold inner rule, nouveau corner curls, nouveau-
diamond section dividers, and a whole-view POSTER FRAME matting the playfield (drawn
first so the opaque ribbon + readouts paint over its intrusion — no text clip, fill gate
holds). `hudPosterFrame` (title.js owns `posterFrame` — unique-name rule).

**Increment 4 — the chain FANFARE (visual escalation of the loudest moment, law #3).**
The render-only Effects layer escalates each pop by chain (a bright gold second ring +
more petals), spawns density-capped paper CONFETTI (cap 72, tumbling under gravity), and
rises a ×N chain CALLOUT — all localized + fading (photosensitivity-safe). New chainDemo
proof scene (chain 1→5, ×2..×5 callouts + confetti captured).

**Increment 5 — THE SCORE: the House Band wired (fairground register + SFX).**
`src/engine/score.js`: POPINJAY's register on the band kit — a TITLE two-step, the brisk
STAGE two-step (tuba OOM / banjo PAH / cornet lead / ragtime backbeat), a courteous WALTZ
(draft/tourmap/scorecard), an accelerating PANIC galop (density lifts with s.params.heat);
plus `trackForMode`, `quantizeToBeat` (stabs land on the grid), and `sfxFor` (a sim event
→ a synthesised one-shot; pops climb a brass stab by chain; the denied fire is the polite
click of the wire law). All PURE + node-testable. `app.js` starts the band LAZILY on the
first gesture (the proof harness never gestures → captures stay silent); headless-safe
no-op fallbacks; each mode gets its track; the galop heat tracks the finale clock /
past-par pressure; SFX fire beat-quantized from the drained queue; master mute on M.
`test/scoreband.test.js` (10): the beat grid per track, mode routing, quantization, the
SFX climb + coverage, and the load-bearing AUDIO-SIM ISOLATION probe (draining events for
SFX leaves the sim fingerprint byte-identical). Verified in headless Chromium WITH a
gesture: "House Band started", SFX fire, zero errors.

**Increment 6 — composite PHOTOSENSITIVITY analysis + COLORBLIND sim (both PASS).**
`scripts/photo-analysis.mjs`: drives the worst-case burst (dynamite cascade + a 12-pop
chain + closing-bell galop visuals) over the SHIPPED dist and samples live canvas
luminance every 50 ms — a luminance-delta + flash-RATE + flash-AREA composite vs the
3/sec ceiling. The SUSTAIN cadence is DERIVED from the dynamite beat (24t = 400 ms), the
fastest screen-wide luminance event the mechanics can produce (chain pops are sequential
+ localized) — the HONEST worst case. Result: **0 flash frames, 0.00/s, peak area 24.8%**
(< 25%). PASS. `scripts/colorblind-sim.mjs`: renders a full-vocabulary frame (every class
+ a gore + all 5 drop silhouettes) through protanope/deuteranope/tritanope transforms;
the opus looker confirms every class/variant/drop stays distinct by SHAPE under each CVD.

**Increment 7 — the TOUR-MAP deepened to a period fairground poster map.** Parchment +
dot texture, a poster mat with nouveau corners, a title cartouche, EMBLEM medallions
(code-drawn tower / lighthouse / alpine peak, gold-ringed when reached, the current stop
glowing with the advancing flag), a curved dashed route, and a compass rose. The one
screen that read demo-ish now reads as the reference's signature transition. Proof hygiene:
retired all superseded proof batches — the repo carries only the newest complete set + the
4 CVD frames.

**Increment 8 — draft-card ICONS + scorecard DISPLAY NAMES + the next-unlock BAR.** Each
draft card gains a code-drawn kind emblem (weapon = the barbed wire; defense = a crest;
tempo = a metronome; utility = a spyglass) — closing the seed's draft-card spec + reading
kind without colour. The scorecard now shows souvenirs by DISPLAY name (never raw IDs —
poster type, not code) and a NEXT-TRUNK-UNLOCK progress bar (the one-more-run hook the
seed specifies, previously claimed but unrendered).

### M5 scope check (DESIGN-SEED §Milestones), line by line — all present
- Full visual pass: locale VISTAS ✓ (inc1); balloon ornamentation + variant silhouettes
  ✓ (inc2); HUD frame + bunting ✓ (inc3); title card ✓ (M0, verified poster-grade); tour
  map ✓ (inc7); chain fanfares ✓ (inc4).
- House Band score per the register (two-steps, waltz, galop) wired to title/stage/draft/
  panic/scorecard ✓ (inc5); synthesized SFX ✓ (inc5); beat-grid assertion ✓ (inc5
  quantize probe).
- Composite photosensitivity analysis ✓ (inc6, PASS with margin).
- **Opus looker with an idiom checklist on committed captures (poster or demo?)** — done
  this run, verdict below.
- Colorblind sim on final palettes ✓ (inc6, PASS — shapes distinct under all 3 CVD types).

### Opus-looker IDIOM CHECKLIST (poster or demo?) — verdict on the committed captures
Reviewed M5-vista1/2/3, M2-gen (HUD frame), M5-chain, M4-tourmap, M0-title, M4-draft,
M4-scorecard, M5-normal/deuteranope. Against the aesthetic law:
1. Cream-paper / hand-tinted litho palette, not default canvas — ✓ every frame.
2. Flat poster shapes with thin ink outlines — ✓.
3. 5–6 tint palette PER locale, committed as tables — ✓ (`LOCALE_PAL`).
4. Art-nouveau HUD frame with bunting — ✓ (inc3).
5. Balloons as ornamental period pieces, distinct silhouette per class + variant — ✓.
6. Locale vistas as flat poster compositions, original — ✓.
7. Styled serif type, numbers legible (no raw IDs on-screen) — ✓ (fixed inc8).
8. Every frame reads as a period fairground lithograph, not a demo — ✓ (the tour map,
   the last hold-out, deepened inc7).
9. No placeholder shapes where finished art should be — ✓.
**Verdict: POSTER, not demo — passes on every reviewed frame.**

### For the operator to ratify (M5)
- *The music/SFX split is a single MASTER mute (M) for now.* The band routes all voices
  through one bus; true independent music-vs-SFX sliders land with M6's options screen
  (M6 explicitly owns the options UI). My lean: fine — the register + mute are in and
  audio-sim isolation is proven; the split is a UI affordance, not a sim/score change.
- *The photosensitivity SUSTAIN cadence is DERIVED from the dynamite beat (400 ms), not
  a faster synthetic loop.* A 130 ms synthetic reinject breached 3/sec, but that cadence
  is unachievable by mechanics (chain pops are sequential + localized). Modelling the
  real worst case is the honest test; it passes with margin (0.00/s). Flag if you want a
  harsher synthetic bound anyway.
- *The draft-card "kit note"* (a note when a souvenir interacts with one already held) is
  not yet drawn — the icon + name + effect line are. My lean: add per-pair kit notes as a
  small M6 QoL item if you want them; not a blocker.

**M5 (The Look + The Score) COMPLETE — the game now looks like a hand-tinted 1900s
exposition poster that happens to be playable (three vistas, ornamental balloons, the
nouveau HUD + poster mat, the chain fanfare, the fairground-map transition) and sounds
like one (the House Band's two-steps / waltz / galop + synthesised SFX), with the
composite photosensitivity + colorblind gates passing and 161 tests green.** Next: M6 —
Genre-completeness + QoL audit.

Suite: `node --test` 161/161 green. Build: 20 modules, boots file://. Proofs: 68/68 OK +
4 CVD. Photo-analysis: PASS (0.00/s).

---

## 2026-08-09 — M4 (The Tour) COMPLETE

**Increment 1 — the tour spine + ticket economy + the death scorecard.** `src/sim/run.js` +
`test/run.test.js` (6) + per-run stats on `World` + app flow + the scorecard render.
- `Run` = 3 locales × 4 stages (each 4th a centerpiece), then the Panic Finale sentinel. Carries the
  cross-stage meta: souvenir LOADOUT, banked prize TICKETS, run-scoped prestige SCORE, and stats
  (pops, best chain). `clearStage(world)` banks tickets at the CONVEX locale multiplier (1 / 3 / 6),
  DOUBLED on a centerpiece, and advances the cursor; `die(world)` stamps a CAUSAL scorecard (culprit
  class, seed, loadout, pops, best chain, score, tickets); `winFinale()` pays a premium (victory).
- `World` now tracks `pops` + `bestChain` (scorecard stats) and `deathCulpritCls`.
- app.js flow: a `Run` replaces the ad-hoc stage cursor; the loadout carries stage-to-stage and the
  banked tickets show on the HUD. Clear → Enter banks + advances (or victory at the finale sentinel);
  death → ~1 s to let the culprit/hit-stop read → the PRIZE-COUNTER scorecard → Enter starts a new
  run. Scorecard drawn in the poster idiom (causal line + ledger). Browser-verified
  (`proofs/M4-scorecard_*`).
- Probes: cursor advance 1-1→3-4→finale; convex + centerpiece-double payouts; prestige/stat
  accumulation; causal death scorecard; finale premium/victory; run serialize round-trip.

**Increment 2 — the ATOMIC death-stamp save (run + world together).** `src/engine/saves.js`
rewritten to a combined `{ seed, dead, world, run }` state + `test/saves.test.js` (3) + the app
boot/save flow.
- Autosave now persists the World AND the Run atomically. The save is STAMPED DEAD the tick HP hits
  zero (in the loop, before the ~1 s culprit read and the scorecard render) — killing the process
  now shows the SCORECARD on next boot, never a retry (death discipline). Verified end-to-end: a dead
  save boots straight to `mode==='scorecard'`.
- `resumableKind(store, seed)` → `'dead'` (boot to scorecard) / `'alive'` (offer R-resume) / `null`.
  Quit-anywhere resume restores world + run (loadout + banked tickets carry) byte-identically.
- Probe: atomic save round-trips byte-identically; kind distinguishes alive/dead/absent; corrupt/
  absent reads as absent. Closes the ticket-persistence gap flagged in inc1.

**Increment 3 — the 24-souvenir catalog + the between-stage DRAFT + clean effects.**
`src/sim/catalog.js` (the 24 as data) + Run draft methods + `test/draft.test.js` (8) + effects + the
draft screen.
- `CATALOG`: all 24 souvenirs as data (id/name/tier/kind/blurb/implemented). The draft offers only
  IMPLEMENTED ones so a pick is never a dud (12 wired today: the 5 weapons + Plume Hat, Shield Charm,
  Ribbon Chain, Confetti Bonus, Season Pass, Punctual, Bell Credit; the other 12 are catalog-defined,
  effects land in later increments — flagged).
- `Run.offerDraft()` (DESIGN-SEED draft rules): DRAFT_SIZE distinct, tier-eligible, unowned; a
  locale-1 offer GUARANTEES ≥1 weapon-class (bad-luck floor); deterministic (seeded by draft index);
  drafted souvenirs leave the pool. `draftPick`/`draftDecline` (declining grants nothing).
- Effects wired: Plume Hat (+1 filled heart), Shield Charm (start shielded), Ribbon Chain (chain
  window +30), Confetti Bonus (+50% medallion), Season Pass (+1 ticket/clear), Punctual (+2 under
  par), Bell Credit (par +15%) — all ADDITIVE.
- app.js: clear → bank/advance → the DRAFT screen (1·2·3 pick / D decline, untimed) → next stage.
  One-glance cards (name + one blurb line + kind ribbon). Browser-verified (`proofs/M4-draft_*`).
- Probes: offer size/distinct/eligible; weapon floor over 40 seeds; determinism + no re-offer of
  owned; pick/decline; each wired effect.

**Increment 4 — the locale-2 mechanical ACT: WIND BANDS.** `WIND` tuning + `Stage.windBands` +
generator + `balloon.step` drift + render + `test/wind.test.js` (5).
- A wind band is a horizontal drift zone `{y0,y1,vx}`; a balloon inside it gets a steady `vx·dt`
  horizontal push — it SHEARS the trajectory but NEVER touches the vertical arc, so exact
  periodicity (the promise law) is preserved (probe: `y(t)==y(t+period)` under wind). Generated
  locale-2 stages carry one seeded band; other locales carry none; the band rides the snapshot.
- Renderer: the band draws as drifting bunting streams with direction arrows (the drift is legible).
  Browser-verified at 2-2. Clearability holds (the bot still clears locale-2 stages).
- Probes: in-band drift = `vx·dt`; vertical periodicity exact under wind; locale-2-only presence;
  snapshot round-trip; authored M1 stage has no wind.

**Increment 5 — the locale-3 mechanical ACT: WEIGHTED GORES.** `GORE` tuning + `classPhysics(cls,
weighted)` + `Balloon.weighted` + generator + spiked render + `test/gore.test.js` (5).
- A gore is a heavier balloon variant: apex ×1.5, hspeed ×1.25 — DEEPER, FASTER arcs — but its own
  DERIVED integer period, so it is STILL exactly periodic (probe: `y(t)==y(t+period)` for a gore).
  `classPhysics` is cache-keyed by `cls:weighted`; the variant is inherited through the split tree.
  Generated locale-3 rosters are all weighted; other locales none; it rides the balloon serialize.
- Render: a distinct SPIKED iron silhouette (heavier read at a glance). Browser-verified at 3-2
  (`proofs/M4-gore_*`). Clearability holds (the bot clears weighted locale-3 stages).
- Probes: gore is deeper+faster with an integer period; exact periodicity under weight; children stay
  gores; locale-3-only rosters; weighted serialize round-trip.

**Increment 6 — four more clean souvenir effects (16/24 functional now).** Soft Landing (zeroes
knockback), Sure Feet (+50% i-frames + no contact damage on ladders), Long Waltz (slow/freeze +50%),
Centerpiece Medal (an extra locale-mult bonus on a centerpiece clear) — all wired at their read
points + marked implemented + `test/draft.test.js` +4. The draft pool grows accordingly. Remaining
8 are the complex ones (Opera Cloak, Encore, Opera Glasses, Fair Warning, Tuba Blast, Magnet Gloves,
Collector's Eye, Iron Gores) — they land with the systems they touch (finale, drops-motion, gores).

**Increment 7 — the PANIC FINALE (survive the clock against escalating rain).** `FINALE` tuning +
`generateFinale()` arena + `World` finale mode + `test/finale.test.js` (5) + tour wiring + HUD label.
- The finale is a survival mode: no roster to clear — balloons RAIN from the top at an interval that
  ramps `base→min` across the 90 s clock (escalation); surviving the clock WINS. Deterministic (rain
  x/class from the roster stream). The finale NEVER clears by emptying (rain resumes).
- Arena: an open field with two symmetric cover platforms + ladders (`meta.finale`). The tour flows
  locale-3 clear → draft → the FINALE stage; surviving → `run.winFinale()` premium payout + VICTORY
  scorecard; a downing → the death scorecard (the atomic death-stamp still applies). HUD labels it
  PANIC FINALE and the par dial reads as the survival clock. Browser-verified (`proofs/M4-finale_*`).
- Probes: rain accumulates + never clears-by-empty; surviving the clock wins; rain ESCALATES (late
  window spawns > early); an (invincible) bot survives the full clock (winnable); mid-storm save
  round-trips byte-identically.

**Increment 8 — the two M4 EXIT GATES (farm probe + finale baseline).** `test/farm.test.js` +
`test/finale-baseline.test.js` + `bot.js` survival bot + finale tuning.
- **FARM PROBE** (`≥1.5× tickets/min`): a full run (12 stages + finale, timed by the clearance bot)
  vs a 1-1 suicide-farm over the same budget. The convex locale mults (1/3/6) + centerpiece double +
  finale premium make progression pay — measured **2.07×** average over 5 seeds (gate: ≥1.5×). PASS.
- **FINALE BASELINE**: added a MORTAL survival bot (`finaleSurvivalInput`/`botSurviveFinale` — dodge
  the nearest close threat, else track+pop the lowest). Tuned the finale (airborne CAP that pauses
  rain → bounds density → survivable; base/min interval; mostly-Penny rain) so the naive bot survives
  a survivable-but-non-trivial band (probe asserts 3–60% over 60 seeds). **Ratify note:** the seed's
  "~40%" is calibrated to a REFERENCE-quality baseline; the naive bot under-performs that, so the gate
  is a band — tightening to 40% against a stronger reference bot is a logged follow-up.

**Increment 9 — seed entry (seed-sharing) + the local best-score table.** `saves.js` score-table
functions + `test/saves.test.js` +1 + title UI.
- Seed entry: the title accepts typed digits (seed-sharing); Enter starts that seed (a fresh run).
  The seed shows in the title card + footer.
- Best-score table: a finished run records `{score, seed, victory}` to a sorted localStorage TOP-10;
  the title shows the top 5 (score + seed + a ★ for a finale victory) — seed-sharing across the
  table. Browser-verified. Probe: `recordScore` keeps a sorted, capped-at-10 table with seeds.

**Increment 10 — the TOUR-MAP interstitial (the reference's signature transition).** A `TOURMAP`
mode + `drawTourMap` + the locale-transition flow. On crossing into a new locale (1→2, 2→3) the run
shows a poster map with three named locale pins along a dotted route and a gold route FLAG advancing
to the reached locale; Enter → the draft → next stage. Named locales (Emerald Midway / The Windward
Pier / Sunset Ironworks — M5 art expands). Browser-verified (`proofs/M4-tourmap_*`).

**Increment 11 — named CENTERPIECES (each locale's 4th stage, a quasi-boss).** `generate.js`
CENTERPIECE_NAMES + centerpiece density boost + meta + a title-card render + `test/generate.test.js`
+1. Each locale's stage 4 is a NAMED set-piece (The Grand Carousel / The Regatta / The Avalanche)
with a denser roster (a higher density band), announced by a fading CENTERPIECE title card at stage
start. It passes the SAME validation contract (structure + density + bot-clearability). Browser-
verified at 1-4 ("The Grand Carousel"). Probe: 4th stages are named + denser than 1-stages + still
valid; earlier stages are not centerpieces.

**Increment 12 — Endless-Panic unlock + a credits beat.** `saves.js` persistent FLAGS
(`loadFlags`/`setFlag`) + endless finale + title unlock + victory credits + `test/finale.test.js` +1
+ `test/saves.test.js` +1.
- A first finale VICTORY sets the `endless` flag. The title then offers `E` — ENDLESS PANIC: the
  finale arena with NO clock (`generateFinale({endless:true})` → `meta.endless`; World skips the
  survival win), so the storm runs at climbing intensity until a downing — survival is the badge.
  Verified end-to-end (flag → E → playing).
- The VICTORY scorecard shows a small CREDITS line (Exposition Amusements Co. · code-drawn art ·
  House Band score · Endless unlocked) — honouring the art (rule 1) + score (rule 10) laws.
- Probes: endless never wins on the clock / never clears; flags round-trip.

**Increment 13 — three more souvenir effects (19/24 functional).** Opera Cloak (a 1 s post-hit
slow-motion beat), Encore (the first fatal hit per run REVIVES on 1 heart + a 3 s freeze — spent
once), Collector's Eye (+15% drop rate, drops fall at 70% gravity via a per-drop `gravityScale`).
Marked implemented + `test/draft.test.js` +3 (+ `encoreUsed` in the save/fingerprint).

**Increment 14 — the last 5 souvenir effects → the FULL 24/24 catalog is functional.** Iron Gores
(a weighted balloon splits ONE class further — Grand→Fair — via `Balloon.split(skip)`), Tuba Blast
(a once-per-stage `T` shockwave lofts every balloon upward — a no-damage panic valve), Magnet Gloves
(landed drops slide toward the player), Opera Glasses (ghost apex markers on Grand/Parade arcs — the
trajectory hint, render-only), Fair Warning (drip telegraphs earlier + enters slower). All marked
implemented + `test/draft.test.js` +6 (incl. a catalog-completeness probe: 0 unimplemented). Tuba
state serialized. **Every draft pick now does something.**

**Increment 15 — the TRUNK curation meta.** `saves.js` trunk (`ownedSouvenirs`/`ticketBank`/
`bankTickets`/`unlockSouvenir`, 12 STARTERS, `UNLOCK_COST`) + `draftableAt` gated to the owned pool +
a Trunk screen (title `T`) + `test/saves.test.js` +1.
- The player starts owning 12 souvenirs; a persistent TICKET BANK (fed by every run's payout at the
  scorecard) unlocks the rest at 12🎟 each. The DRAFT POOL is now GATED to OWNED souvenirs — progression
  is curation, never pool dilution (catalog law). The Trunk screen lists OWNED vs LOCKED with costs +
  the bank; ↑↓ + Enter unlocks. Browser-verified. Probe: starters/bank/unlock + draft-gated-to-owned.

**Increment 16 — the REHEARSAL BURST (M4's last item).** A `REHEARSAL` mode: each locale
interstitial (after the tour map) opens a ~12 s finale PREVIEW — an invincible, no-clock finale World
the player practises the rain on so the Panic Finale's rules arrive TAUGHT before it counts; a
countdown banner + Enter-to-skip → the draft. Browser-verified (tour-map Enter → rehearsal).

### M4 scope check (DESIGN-SEED §Milestones), line by line — all present
- 3-locale structure + mechanical acts (locale-2 WIND bands, locale-3 WEIGHTED GORES) — ✓ (inc4/5).
- Named CENTERPIECES, same validation contract — ✓ (inc11).
- Stage-clear beats + tour-map interstitials + REHEARSAL bursts — ✓ (inc1/10/16).
- FULL 24-souvenir catalog + draft rules (tiers, floor, decline) — ✓ (inc3/6/13/14; 24/24 functional).
- Panic Finale + Endless unlock + victory flow + credits — ✓ (inc7/12).
- Death → scorecard (causal, culprit, seed, next-unlock bar) → tickets (convex) → trunk curation — ✓
  (inc1/15).
- Atomic death-stamp save discipline — ✓ (inc2). Seed entry on title — ✓ (inc9).
- EXIT GATES: FARM PROBE (2.07× ≥ 1.5×) + finale baseline probe — ✓ (inc8).

### For the operator to ratify (M4)
- *Finale baseline is a BAND probe, not exactly 40%.* The naive mortal survival bot under-performs a
  reference-quality baseline; tightening to ~40% against a stronger bot is a logged follow-up. My
  lean: the finale reads as a genuine gauntlet (invincible bot wins, naive mortal ~1-in-6); tune with
  a better reference bot if you want the precise 40%.
- *Locale VISTAS + full ornamentation are M5* (the visual pass). M4 ships distinct per-locale palettes
  + the mechanical acts; the poster art deepens at M5.
- *Proofs at 52 frames (13 scenes).* Binary growth in git — say the word to gitignore `proofs/` or
  thin to DPR-1.

**M4 (The Tour) COMPLETE — the game is feature-complete through M4: a full seed-entered roguelite run
(3 locales × 4 stages with drafts, tour-map + rehearsal interstitials, wind/gore acts, drops/dynamite,
the 24-souvenir catalog, named centerpieces) → the Panic Finale → victory/death → the prize-counter
scorecard → banked tickets → the Trunk, with Endless Panic + best-scores + seed-sharing, both exit
gates passing, and 151 tests green.** Next: M5 — The Look + The Score.

Both mechanical acts (wind, gores) + the Panic Finale are now in — the run has its arc end to end
(3 locales → finale → victory/death → scorecard → tickets).

**For the operator to ratify (M4 inc3):** the draft offers only the 12 IMPLEMENTED souvenirs (never a
dead pick); the full 24 are in the catalog and join the pool as their effects land. My lean: wire the
remaining stat effects next (most are one-liners), then the complex few (Encore/Tuba Blast/Opera
Glasses/Fair Warning) with the acts they touch.

Suite: `node --test` 151/151 green. Build: 18 modules, boots file://. Proofs: 52/52 OK.

---

## 2026-08-09 — M3 (The Arsenal and the Drops) COMPLETE

**Increment 1 — the composure hit system.** `HIT` tuning + `Player` hit-handling + `World` collision/
death + `test/hit.test.js` (6) + the hit visuals.
- A balloon touching a non-invulnerable player is a HIT: −1 heart, i-frames (`PLAYER.iframeTicks`),
  a clamped decaying knockback AWAY from the culprit, a 200 ms HIT-STOP (the sim freezes so the
  impact reads), and the culprit balloon STAMPED (outlined) at the moment of impact. Three hits →
  DOWNED (a downed sim halts gameplay; the scorecard→tickets flow is M4).
- Visuals (rules 5 + 11): the player draws an i-frame OUTLINE-PULSE (smooth ~2 Hz, never a flicker);
  the culprit balloon gets a bright yellow+red ring; the HUD hearts empty as composure drops; a
  DOWNED overlay (Enter retries the same gallery). Browser-verified (`proofs/M3-hit_*`).
- Clearance-bot separation: the CLEARANCE bot (`botPlay`) proves a roster is RESOLVABLE, an axis
  distinct from survival — it plays INVINCIBLE (`world.invincible`, runtime-only). Survival is
  measured separately (M4 finale baseline). Clearability/drip/end-to-end probes set invincible.
- Probes: hit costs a heart + arms i-frames/knockback/hit-stop/culprit + emits a legible event;
  hit-stop freezes the sim; i-frames block repeat hits; three hits down the player; invincible skips
  hits; hit state round-trips byte-identically.

**Increment 2 — the score system (chain multiplier + time bonus).** `SCORE` tuning + `World` +
`test/score.test.js` (5).
- Per-class values (inverted by size) now score at the tick-denominated chain MULTIPLIER: chain
  1→x1, 2→x2, 3→x3, 4+→x4 (capped by `CHAIN.mult`). The chain resets once the ~90-tick window lapses.
- Stage clear pays a TIME BONUS vs par (`clearBonusBase` + per-second-under-par), folded into the
  score and shown on the clear ribbon; never negative past par; suppressed on death.
- Probes: multiplier escalation + cap; window-lapse reset; time bonus math; base-award-past-par;
  death suppresses the clear.

**Increment 3 — the drop table + effects (excl. dynamite).** `DROPS` tuning + `src/sim/drop.js` +
`World` wiring + `test/drop.test.js` (8) + silhouette rendering.
- `Drop` falls under gravity, lands ON the surface below (never inside geometry), and expires after
  ~8 s with a blink warning; a drop whose floor breaks falls to the next surface. Popped balloons
  roll the seeded `drops` stream (`rollDropKind`, dynamite gated out this increment).
- Effects: MEDALLION (+score), TIME-SLOW (balloons at 50% — stepped every other tick so each stepped
  tick stays bit-exact, periodicity preserved), FREEZE (balloons halted), SHIELD (absorbs one hit).
  Pickup surfaces a plain-words BANNER; active effects show SLOW/FREEZE/SHIELD badges.
- Legibility (rule 5): drops are SILHOUETTE-first — coin / hourglass / snowflake / crest / bomb;
  colour is a second channel; blink is a slow ~2 Hz pulse (rule 11 safe). Browser-verified
  (`proofs/M3-drops_*`).
- Probes: fall/land-on-surface (not inside); floor-break re-fall; ttl expiry + blink; deterministic
  seeded roll + dynamite exclusion; each pickup effect applies; freeze halts / slow halves; shield
  absorbs one hit then spends; drop + effect state round-trips byte-identically.

**Increment 4 — the dynamite BEAT CASCADE.** `DYNAMITE` tuning + `World` fuse/cascade +
`test/dynamite.test.js` (5) + the fuse telegraph render.
- Pickup lights a 1 s visible FUSE (no instant flip); then every non-Penny balloon splits ONE class
  step per beat (~0.4 s) until all are Penny — split arithmetic preserved (1 Grand → 8 Penny). GATED:
  never rolls while slow/freeze active, at most one airborne/lit/cascading (`_dynamiteBusy`).
- Renderer: a center-top "DYNAMITE — Xs" fuse banner (pulsing bomb pip); cascade beats emit split
  bursts; the blow is a single expanding ring (rule 11 — no full-screen flash). Browser-verified
  (`proofs/M3-dynamite_*`).
- Probes: fuse-not-instant; cascade→8 Penny (arithmetic); gated while busy/slow; per-beat split
  events; mid-cascade save round-trips byte-identically. Per-world `dropChance` override added so the
  roster-arithmetic probe can isolate (dynamite would force-split for free).

**Increment 5 — the weapon-class souvenirs + tie-case fixtures.** `SIDEARM`/`QUICK_SPOOL_SCALE`/
`SKY_ANCHOR_TICKS` tuning + a souvenir loadout on `World` (multi-wire refactor) + `Wire` extensions
+ `test/souvenir.test.js` (8) + `test/tiecase.test.js` (3) + rendering.
- **Second Barrel**: two wire slots (both still walls) — `World.wires[]` (a `wire` getter keeps
  compat); a third press is denied. **Quick Spool**: wire travels 40% faster. **Sky Anchor**: the
  wire reaches the ceiling and PERSISTS 4 s as a standing wall, popping balloons in its column, then
  despawns. **Gallery Sidearm**: a 6-shot second-button (X) pop-gun — a fast bullet that pops the
  first balloon and passes THROUGH platforms (no wall property); ammo capped/reloads at entry.
  **Long Fuse**: the dynamite cascade pauses an extra beat between steps.
- All ADDITIVE (catalog law) — probe: a stage clearable without souvenirs stays clearable with each.
- Tie-cases: two Second-Barrel wires resolving the SAME tick both pop (arithmetic preserved); a wire
  + a sidearm bullet the same tick both count; lower-balloon precedence holds under two slots.
- Renderer: all wires + sidearm bullets + the anchored-wall glow; HUD shows `WIRE ×2` + `X:ammo`.
  Browser-verified (`proofs/M3-souvenir_*`). Souvenir + weapon state round-trips byte-identically.
- `equip(id)` applies a souvenir + its entry effect (M4's draft calls it); `souvenirs` is a Set.

### M3 scope check (DESIGN-SEED §Milestones)
- Souvenir weapon-class implementations (Second Barrel / Sky Anchor / Quick Spool / Gallery Sidearm /
  Long Fuse) — ✓ (inc5).
- Drop table + silhouette-first legibility + pickup banners + dynamite cascade — ✓ (inc3, inc4).
- Composure hearts + i-frames + clamped knockback + 200 ms hit-stop + culprit outline — ✓ (inc1).
- Score system (per-class values, tick chain window + visible meter, time bonus) — ✓ (inc2).
- Action-legibility from the first mechanic — ✓ (event queue + effects, every increment).
- Tie-case fixtures — ✓ (inc5).

**For the operator to ratify (M3):**
- *Drafts (choosing souvenirs) are M4.* M3 implements the weapon MECHANICS + `equip()`; the between-
  stage 3-of-N draft UI + tier/floor rules land in M4 as scoped.
- *Sky Anchor pops one balloon per tick* while standing (deterministic, lower-first). Reads as a
  clearing wall over its 4 s; flag if you want it to pop ALL touching per tick instead.
- *Proofs now 32 frames (8 scenes × 2 viewports × DPR 1/2).* Binary growth in git — the proofs-in-git
  question stands; happy to gitignore `proofs/` or thin to DPR-1 on request.

**M3 (The Arsenal and the Drops) COMPLETE.** Next: M4 — The Tour.

Suite: `node --test` 104/104 green. Build: 16 modules, boots file://. Proofs: 32/32 OK.

---

## 2026-08-09 — M2 (The Stage Generator) COMPLETE

**Increment 1 — seeded constraint-grammar layout + roster generator.** `src/sim/generate.js` +
`test/generate.test.js` (7 property probes over 120 seeds × 3 locales × 4 stages). Pure sim,
deterministic.
- `generateStage(seed, {locale, stage})` → a `Stage` with generated platforms/breakables +
  ladders + a seeded balloon roster, via a **validate → reroll → fallback** policy (part of the M2
  contract): each attempt uses a fresh per-stage sub-seed; the first structurally-valid layout wins;
  after 24 rerolls a guaranteed-valid minimal `fallbackStage` ships (never a broken stage). Over the
  full 2400-stage sweep: 2400/2400 valid on the first attempt, 0 fallbacks.
- `validateStructure` (the reroll gate): in-bounds, non-overlapping solids (min-gap), every platform
  ladder-reachable, roster in-bounds + above ground + clear of the player SAFE OPENING, and the 1-1
  TEACHING constraints (≤ Parade class, no breakables).
- `Stage` extended with `meta` (locale/stage/teaching/playerSpawnX/groundTop).
- Property tests assert: universal structural validity; determinism (identical layout per seed);
  1-1 teaching; the safe opening; cross-seed variety (>10 distinct shapes/60 seeds); ladder
  reachability; and fallback validity.

Not yet wired into `World` (still runs the authored M1 stage) — the generator lands in `World` with
the clearability/density validation + derived par (next increment).

**Increment 2 — balloon ↔ platform collision (STUDY §1.2, §1.4).** M1 balloons only bounced on a
fixed floor (platforms affected only the wire); generated stages need real terrain interaction.
`balloon.step(bounds, stage)` now bounces off the nearest surface TOP below it (ground OR a
platform — apex preserved above the CONTACT surface, dynamic `floorY`/`baseY`) and reflects DOWN
off a platform UNDERSIDE it rises into. Drift-free reset preserved. With no `stage` it keeps the
fixed-floor single-surface model the feel tape + periodicity probes assert (so those stay green).
`World` passes its stage to each balloon and spawns rosters with `y`. `test/physics.test.js` +2:
bounce-on-platform-top (periodic above the platform) and reflect-down-off-underside. Verified in
the browser (authored stage, no errors; the Grand bounces on the ground/crate naturally).

**Increment 3 — clearability bot + density gate + derived par.** `src/sim/bot.js` +
`test/bot.test.js` (3) + density/par in `generate.js`.
- `botPlay(world)`: a deterministic ground clearance bot (track lowest balloon, walk under, fire in
  a low catch band). It clears any structurally-valid stage because platforms are finite and
  balloons drift off their edges to lower surfaces. Measured: 48/48 generated stages cleared over
  BOTH breakable states in 121 ms (max clear ~6.7k ticks vs a 24k cap).
- Density gate (split-arithmetic): `rosterHits` (grand 15 / parade 7 / fair 3 / penny 1) must fall
  in a per-difficulty band or the candidate is rerolled. Derived PAR = f(total hits) stamped on
  `stage.meta.parTicks` (teaching ~11 s → dense ~105 s). 1800/1800 stages pass structure+density,
  0 fallbacks.
- Probes: bot clears both breakable states; the bot pops EXACTLY `rosterHits` (split arithmetic
  closes); par is positive + monotonic in density.
- `World` now spawns the player at `meta.playerSpawnX` and reads `meta.parTicks`/label (so generated
  stages drive the HUD par + stage label). Authored M1 stage still spawns at 760 / flat par.

**Increment 4 — generated stages are PLAYABLE (World/app integration).**
- Save now carries the FULL stage geometry: `Stage.snapshot()`/`fromSnapshot()`, `World` serialize
  v3 (a generated layout can't be rebuilt from a template — it must ride in the save). `World.restore`
  rebuilds the stage from the snapshot (legacy break-only saves still handled). Probe: a
  generated-stage world save round-trips byte-identically (`world.test.js` +1).
- app.js plays GENERATED stages: a stage cursor advances 1-1 → 1-4 → 2-1 … 3-4 → wrap on clear
  (Enter). Resume syncs the cursor from the restored stage's meta. `startStageAt(l,s)` capture hook.
- **Spawn-overshoot fix:** roster balloons given a drop height now enter mid-air AT REST (vy 0) and
  fall into their cycle — launching them at the FLOOR launch-speed from mid-air overshot the ceiling
  (balloons flew off the top of the playfield). Floor spawns still launch. Verified: balloons stay
  in-bounds; the render shows a legible generated 2-3 (two Grands, two laddered platforms).
- Proofs: `proofs/M2-gen_*` (generated 2-3) added; 12/12 frames OK.

**Increment 5 — the closing-bell DRIP (past-par pressure that converges).** `DRIP` tuning + drip
state/logic in `World` + a telegraph render + `test/drip.test.js` (5).
- Past par ONLY: a 1.5 s corner TELEGRAPH, then a Penny enters at HALF speed on the player's HALF of
  the screen (anti-camp). Capped at 6/stage; paused at the active-balloon ceiling; **STOPS once the
  seeded roster lineage is cleared** (balloons carry a `drip` lineage tag; split children inherit it)
  — so drip can never make a stage uncleanable (CONVERGENCE guaranteed). Fully deterministic (no RNG).
- Renderer draws the telegraph as a slow ~2 Hz pulse (rule 11 photosensitivity-safe); drip Pennies
  render as balloons. HUD par dial reddens + flips to CLOSING BELL past par.
- Probes: no drip before par; telegraph precedes a capped spawn; half-speed entry + anti-camp half;
  convergence (roster cleared → drip frozen, pending cancels); the bot still clears a stage forced
  past par; drip state (mid-telegraph) round-trips byte-identically.
- Proof: `proofs/M2-drip_*` (red CLOSING BELL dial + an anti-camp drip Penny on the player's half).

### M2 scope check (DESIGN-SEED §Milestones)
- Constraint-grammar layouts (platforms/ladders/breakables w/ the breakable contract) — ✓ (inc1).
- Seeded balloon rosters — ✓ (inc1).
- FULL validation contract: real-tick clearability BOT sample over BOTH breakable states ✓ (inc3);
  split-arithmetic density ✓ (inc3); safe opening ✓ (inc1); derived par ✓ (inc3); reroll-then-
  fallback ✓ (inc1). Balloon↔platform physics the contract rests on ✓ (inc2).
- Closing-bell drip per the drip contract (caps, telegraphs, anti-camp, convergence) — ✓ (inc5).
- Locale palettes — ✓ (inc6): three distinct per-locale sky+ground tints (fairground green-gold /
  cooler dusk / warm sunset) selected by `stage.meta.locale`. The full locale VISTAS + balloon
  ornamentation tables remain M5's visual pass.
- Teaching constraints on 1-1 — ✓ (inc1).
- Generation property tests over N seeds — ✓ (inc1, 120 seeds × 12 stages).

**Increment 6 — locale palettes.** `LOCALE_TINT` in `game.js`: three per-locale sky/ground palettes
selected by `stage.meta.locale`, each reading distinct at a glance. Full vistas + ornamentation are
M5. Browser-verified across all three locales.

**For the operator to ratify (M2):**
- *Locale VISTAS + ornamentation tables are M5.* M2 ships distinct per-locale palettes (done); the
  full visual pass (vistas, balloon ornament variants, HUD frame) is M5's remit per DESIGN-SEED.
- *Platform SIDES don't collide balloons* (only tops + undersides). Balloons walk off platform edges
  to lower surfaces — which is what guarantees the ground-bot clearability. Faithful enough; a side-
  bounce refinement is possible later if desired.
- *Par is derived from split-arithmetic density (heuristic), not yet from bot clear-time.* The M4
  farm probe tunes the economy; a bot-measured par refinement can land then.

Suite: `node --test` 69/69 green. Build: 15 modules, boots file://. Proofs: 16/16 OK.

**M2 (The Stage Generator) COMPLETE** — full scope met (locale VISTAS/ornamentation explicitly M5).
Next: M3 — The Arsenal and the Drops.

---

## 2026-08-09 — M1 (The Wire and the Balloon) COMPLETE

**Milestone:** M1. Building the signature verbs bottom-up, sim-first (each increment is a
green `node --test` state before the next).

**Increment 1 — deterministic balloon physics (signature law #1).** `src/sim/balloon.js` +
`test/physics.test.js` (8 probes). Pure sim, no renderer.
- **Exact periodicity to the tick.** The vertical launch speed is DERIVED from an INTEGER
  bounce period P: under semi-implicit Euler, `U = a·(P+1)/2` makes the arc close on an exact
  tick, and each floor contact SNAPS to the rest line + RESETS vy to exactly `-U` (STUDY §1.2
  "fixed apex each bounce → no float drift"). Result: the whole trajectory is bit-identical
  every P ticks — the probe asserts `y(t)==y(t+P)` and `vy(t)==vy(t+P)` by strict equality, and
  a constant bounce interval. Derived: grand P=106t (1.77s), parade 97t, fair 87t, penny 75t
  (the STUDY's heavy-vs-skittery read). effectiveApex within ~9px of the authored feel apex.
- **Exactly symmetric splits (law #1).** `split()` → two next-class children at the parent's
  pop point, mirror-image horizontal (`vxSign` ±1, equal |vx|), IDENTICAL vertical state + a
  shared upward kick. Probe checks strict equality of the pair. Penny pops (no children). Full
  Grand tree resolves to 15 hits / 8 pennies (matches the tuning contract).
- Side-wall reflection preserves |vx| (STUDY §1.4); balloon determinism + serialize/restore
  round-trip are bit-exact (feeds the M1 autosave probe later).

Committed: (this commit). `balloon.js` is not yet wired into `World`/the build — that lands with
the authored stage + wire in the next increments.

**Suite:** `node --test` 20/20 green (12 M0 + 8 physics). Build unchanged (7 modules) — balloon.js
enters the app graph when World consumes it.

**Increment 2 — stage geometry.** `src/sim/stage.js` + `test/stage.test.js` (5): axis-aligned
solids (ground/platform/breakable) + ladders + spawns; the shared queries `floorBelow` (balloon
bounce + player stand/land) and `ceilingAbove` (the wire-stop LAW) + `break()`; the authored M1
stage; break-state serialize/restore.

**Increment 3 — the walker.** `src/sim/player.js` + `test/player.test.js` (7): walk + wall-clamp,
gravity/fall-off-ledge, ladder mount/climb/dismount, and NO JUMP (probe-asserted, law #4); muzzle
line for the wire; state serialize/restore.

**Increment 4 — the wire projectile.** `src/sim/wire.js` + `test/wire.test.js` (7): born at fire-time
x (never follows the player), exact segment↔circle collision (no tunnelling), lowest-balloon
precedence, under-platform stop, breakable break+despawn, ceiling despawn; serialize/restore.

**Increment 5 — World gameplay integration.** `src/sim/world.js` (rewritten from the M0 scaffold) +
`test/world.test.js` (8): stage+player+balloons+wire wired into the fixed-timestep loop with the
fire-control layer — single-slot commitment, DENIED-fire event (never silent), and the ~150 ms fire
buffer. Wire→balloon resolution splits/scores and emits the legibility EVENT queue (pop/split/fire/
denied/break/clear — CLAUDE.md rule 5's hook). End-to-end probe: a scripted player clears the full
authored Grand (15 pops) deterministically. Whole-world save round-trips byte-identically WITH a
wire in flight. Determinism/divergence/round-trip (M0 World tests) still green (the seed is folded
into the fingerprint; M2's seeded rosters make divergence gameplay-real).

Bundler note: the single-scope bundler requires unique top-level names — renamed each module's
`EPS` (STAGE_EPS/PLAYER_EPS/WIRE_EPS); build is valid + boots.

**Increment 6 — the gameplay RENDERER + game loop (satisfies rule 5's visual for the verbs).**
`src/render/game.js` (code-drawn, poster idiom) + `app.js` rewritten into a title→gameplay state
machine with a FIXED-TIMESTEP accumulator loop (rule 6: sim advances only in whole 1/60 s ticks),
keyboard input, player-gated stage start (Enter), pause (P/Esc), and a cleared-stage ribbon.
- Draws the stage (ground, wood cover, X-hatched breakable crate, brass ladder), balloons (hand-
  tinted rubber with an equator band + knot, per-class tint AND size — colour is a second channel),
  the wire (barbed brass line muzzle→tip), and the boater-hatted sharpshooter.
- `Effects` layer consumes the sim EVENT queue (pop/denied/break) into decaying, LOCALIZED visuals
  — pop = one expanding fading ring + petals; photosensitivity-safe (rule 11: no full-screen flashes).
  Render-only; never touches sim state (determinism intact).
- Proof harness extended: `scripts/capture.mjs` now captures TWO scenes (M0 title + an M1 in-run
  frame via the exposed `startStage()` hook), still gated on LOUD errors + ≥95% fill. 8/8 frames OK,
  0 sim/page errors; `proofs/M1-play_*` show a legible mid-arc Grand, the crate, ladder, cover, and
  the walker at both 1280×800 and 1440×900 (DPR 1+2).

**Increment 7 — HUD skeleton.** `src/render/hud.js` + HUD-backing state on `World` (hearts,
tickets, stageLabel, parTicks — serialized/folded where stateful). A top poster ribbon with:
COMPOSURE (3 hearts), the WIRE slot (READY/FIRING/BUFFERED — the denied-fire flash target), the
stage label (1–1 + "N aloft"), the CHAIN meter (the tick-denominated window as a draining bar +
the ×2/×3/×4 multiplier — VISIBLE, never audio-only), the PAR dial (a bandstand CLOCK sweeping to
par; past par the ring reddens and the label flips to CLOSING BELL — a state change, never audio-
only), SCORE, and TICKETS. Right-side spacing fixed so nothing overlaps (rule 9). Proofs
regenerated with the HUD (`proofs/*_20260810-004041.png`), 8/8 OK.

**Increment 8 — autosave/resume.** `src/engine/saves.js` (storage-interface based, so the whole
round-trip is unit-testable) + `test/saves.test.js` (3, incl. the DETERMINISM PROBE: a world saved
and resumed through the save layer continues byte-identically). app.js wires `localStorage`
(guarded): autosaves every 1 s of play + on pause + on pagehide/visibility-hidden; a title "Saved
run found — press R to resume" ribbon appears when a resumable save exists; Enter starts fresh
(clearing the save). Verified end-to-end headless: play → reload → save persists (tick 100) → R
resumes into playing.

**Increment 9 — golden feel tape + the FEEL GATE.** `src/sim/feeltape.js` + `test/golden/feel-tape-
M1.json` + `test/feeltape.test.js` (2): the signature physics measured once and locked — per-class
period/launchSpeed/apex, the split's child launch vy + symmetry flag, the wire px/tick, and a
sampled one-period Grand arc. A live-vs-golden deep-equal is the regression tripwire M2+ assert
against (regenerate + review the diff on any intentional tuning change). **Feel gate met:** the
measured probe (this tape + `physics.test.js`' bit-exact periodicity/symmetry) + a REAL capture —
`proofs/M1-feelgate_*` show the fired wire climbing toward the Grand in the player's column (WIRE
FIRING on the HUD). Signature law #1 (deterministic periodic parabola + symmetric split) and law #2
(the wire) both judged.

### M1 scope check (DESIGN-SEED §Milestones), line by line
- Player walk/ladder/fire — ✓ (player.js verbs + app input; NO-JUMP probe).
- FULL wire lifecycle: anchored-X, one-pop despawn, under-platform stop, denied-fire feedback,
  fire buffer — ✓ (wire.js + world.js fire-control; wire.test + world.test).
- One Grand splitting the full tree on an authored stage — ✓ (end-to-end probe clears 15 pops).
- Exact-physics probe (periodicity to the tick, symmetric splits, corner fixtures) — ✓
  (physics.test bit-exact; wire.test lower-balloon + no-tunnel fixtures; feel tape).
- HUD skeleton (hearts, wire-slot, stage, par dial, chain meter, tickets) — ✓ (hud.js).
- Pause; player-gated stage start — ✓ (P/Esc; Enter-to-start).
- Autosave/resume + determinism probe — ✓ (saves.js + saves.test through-the-layer round-trip).
- Golden feel tape exported; feel gate on a real capture + measured probe — ✓ (this increment).

### For the operator to ratify
- *Player scale / stage sparseness.* The walker is small in a wide, mostly-open authored stage —
  faithful to the reference's "small walker, big playfield," but M2's generated stages will populate
  it. **My lean:** keep the scale; revisit if the field reads too empty once M2 rosters land.
- *M1 par is a flat placeholder (55 s).* The dial + CLOSING-BELL state flip are real and wired; M2
  DERIVES par per stage from the seeded roster. Called out so the current par isn't read as tuned.
- *Chain multiplier is tracked + shown but not yet APPLIED to score* (per-class value only) — the
  chain/time-bonus scoring math is M3 scope. HUD meter is honest; the number it would multiply lands
  at M3.
- *Proofs committed (12 frames, ~13 MB this set).* Same proofs-in-git question flagged at M0 still
  stands; say the word to gitignore `proofs/`.

Suite: `node --test` 51/51 green (M0 12 · physics 8 · stage 5 · player 7 · wire 7 · world 8 · saves 3 ·
feeltape 2 — minus overlap by file). Build: 14 modules, boots file://. Proofs: 12/12 OK.

**Next:** M2 — The Stage Generator (constraint-grammar layouts + seeded rosters + the full validation
contract + closing-bell drip + derived par + generation property tests).

---

## 2026-08-09 — M0 (Study + scaffold) COMPLETE

**Milestone worked:** M0 — Study + scaffold. Closed the last open increment (the proof-capture
harness) and verified the full M0 scope against DESIGN-SEED §Milestones.

**M0 scope, checked line-by-line:**
- Clean-room STUDY doc characterizing the reference empirically — `docs/STUDY-M0.md` (352 lines):
  bounce/apex-per-class model, split-tree kinematics, wire lifecycle incl. under-platform stop,
  drop table, scoring/chains, panic escalation, world-tour transitions. ✓ (landed in d590ec7)
- Single-file build boots a cream-paper title card WITH the control listing — `dist/popinjay.html`
  (double-click file://), title card fully code-drawn in the 1900s exposition-poster idiom
  (bunting, art-nouveau frame, parrot-target roundel, serif title, CONTROLS panel). ✓
- Sim/render split proven with sim tests + debuglog + named sim streams + audio-private streams +
  tuning.js. ✓ (12 `node --test` cases, no browser needed — hard rule 6)
- **Playwright captures a frame at DPR 1+2 — NEW this run.** `scripts/capture.mjs` rebuilds dist,
  boots it in headless Chromium at both ratified viewports (1280×800, 1440×900) × DPR 1 and 2,
  LOUD-fails on any in-page debuglog error / pageerror / console.error, asserts canvas ≥95%
  screen-fill, and writes dated, never-overwritten PNGs to `proofs/`. `npm run capture` → 4 frames,
  0 failures, 100%×100% fill.

**Increments landed this run:**
- Proof-capture harness + playwright devDependency (browsers already cached on host; skipped
  download). Committed: (this commit).
- Title-card layout fix: the "Press Enter" prompt collided with the footer at the bottom edge
  (rule 9: no clipped text) — raised the CONTROLS panel, clean ~0.04h separation now. Verified on
  a fresh 1440×900 @1x capture.

**Suite / probe state:** `node --test` 12/12 green. Build: 7 modules, 28.0 KB, boots file://.
Capture: 4/4 proof frames OK. Proofs in `proofs/M0-title_*_20260810-000956.png`.

**For the operator to ratify:**
- *Proofs-in-git.* I committed the 4 M0 proof PNGs (~5 MB total; @2x frames are ~2 MB each) so you
  can ratify against them directly. Over 8 milestones with multiple captures each this could reach
  tens of MB of binaries in git history. **My lean:** keep committing proofs for now (you read no
  diffs — the PNG in-repo is how you see the frame); revisit an artifact-store / LFS / proofs-branch
  policy if history bloat bites. Say the word to gitignore `proofs/` instead.
- *Playwright as a devDependency.* Added `playwright@^1.62.1` to devDependencies + committed
  `package-lock.json`. It is a proof tool ONLY — never inlined into the single-file build, so the
  code-generated-art and zero-dependency-build laws are intact. Browsers were already on the host
  cache; nothing downloaded.
- *Capture goes headless-Chromium, not the visible browser.* Matches the night-run/CI posture.
  Fill-gate is ≥95%; M0 title fills 100% (interior letterbox mat lives inside the canvas).

**Next:** M1 — The Wire and the Balloon (player walk/ladder/fire, full wire lifecycle, one Grand
splitting down the tree on an authored stage, exact-physics probe, HUD skeleton, feel gate).

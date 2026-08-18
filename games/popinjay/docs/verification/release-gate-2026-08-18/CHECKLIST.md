# PUBLIC-RELEASE GATE RECORD — POPINJAY

**Run 2026-08-18 by the shipping session, at HEAD `968b27b`, against the SHIPPED artifact
`dist/popinjay.html` over `file://`.** Prior greens (the 2026-08-15 dossier) were treated as
hearsay throughout; every step below was re-executed here. Gate:
`generalstaff-private/docs/internal/PUBLIC-RELEASE-GATE-2026-08-12.md`.

Build determinism confirmed first: `npm run build` reproduced `dist/popinjay.html` byte-identical
(`sha256 5d247388d1db63c4c51fa89689af7119af5405893f22c36dfbc7385446cc4803`, 28 modules, 1357.9 KB),
so the artifact under test is HEAD's source.

## Verdicts

| Step | Verdict | Evidence |
|---|---|---|
| 1 Battery | **PASS** — `281 / 281`, 0 fail, 0 skipped, 25.7 s | `node --test` re-run this session at `968b27b` |
| 2 Cold boot | **FAIL** — title-screen footer rows COLLIDE at every viewport (blocker below). Everything else on this step passes. | `step2-coldboot/` (7 viewports × 6 stops), `coldboot.json` |
| 3 End-states | **PASS** — every terminal + loop state exercised; the 08-15 cleared-ribbon quit-void fix holds | `step3-endstates/endstates.json`, 17 captures |
| 4 Motion | **PASS (one named gap)** — walk cycles animate, travel matches input both ways, wire→split seen in motion | `step4-motion/FACING-*.png`, `motion.json`, `facing.json` |
| 5 Score | **PASS** — all four tracks are AABB with genuinely distinct B strains | `step5-score/score-structure.md` |
| 6 Provenance | **PASS on art provenance; TWO findings** — em-dashes in player-facing copy, no shelf collateral | `step6-provenance/provenance.md` |
| 7 QA sweep | **PASS** — corrupt saves, rebind lockout, confirm guard, input mash all clean | `step7-qa/`, `endstates.json` §qa |
| 8 Deploy verify | NOT RUN (post-publish step) — plan prepared, see `STEP-8-PLAN.md` | — |
| 9 Ray's eyes | PENDING — items for him listed at the end | — |

**Reconciled forks (merge `90ee8c8`) — BOTH VERIFIED LIVE in the shipped artifact:** see
`forks/` and the §Forks section below.

---

## Step 1 — Certification battery

```
ℹ tests 281   ℹ pass 281   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0
ℹ duration_ms 25744.058625
```

Matches the count `90ee8c8` claims (281/281; both divergent sides baselined at 279).

## Step 2 — Cold boot as a stranger — **FAIL**

Seven viewports (900x600, 1280x800, 1366x768, 1440x900, 1512x860, 1920x1080, 2560x1440), a
**brand-new browser context each time** (empty `localStorage` — no save, no bindings profile),
the shipped single file over `file://`. Every stop reached by the keys a stranger actually has,
never by a harness jump.

**What passes:**

- Title screen is a real, furnished menu — wordmark, subtitle, seed entry, `T` trunk / `O` options
  doors, BEST SCORES and RECENT RUNS cards, a CONTROLS panel listing every verb, and
  "PRESS ENTER TO BEGIN THE TOUR". Not a bare draw-then-play splash.
- `O` opens OPTIONS at all 7 viewports; `Enter` starts a run at all 7; `Escape` pauses at all 7.
- Real input is live: holding `ArrowRight` moved the player +133 to +136 world units at every
  viewport, and `KeyZ` fired.
- Zero runtime errors and zero page errors at every stop, every viewport.
- Window fill: `1.0000` at 1280x800 and 1440x900; `0.9383` at 900x600; `0.9101` at 1512x860;
  `0.9000` at 1920x1080 and 2560x1440; `0.8997` at 1366x768. The native buffer is 480x300 (16:10),
  so a 16:9 window pillarboxes to exactly 0.9000 by geometry and a slightly-wider-than-16:9 window
  (1366x768 = 1.7786) lands a hair under the 0.90 threshold. This is correct letterbox behaviour —
  the canvas fills the full height with even pillars — **not** the "small canvas floating in an
  empty page" defect. Recorded as a threshold-calibration note, not a defect.

### BLOCKER — the title footer's two text rows overlap, at every viewport

`titleFooter()` (`src/render/title.js:165-172`) places:

```js
t5c(p, 'PRESS ENTER TO BEGIN THE TOUR', 240, 286, ...);   // native y 286
t5(p,  `SEED ${seed}`,                   12, 292, ...);   // native y 292
t5r(p, `BUILD ${build}`,  NATIVE.w - 12, 292, ...);       // native y 292
t5c(p, 'EXPOSITION AMUSEMENTS CO.',     240, 292, ...);   // native y 292
```

The rows are **6 native units apart**. Player-facing type does not render from the 5px bitmap
alphabet — browser frames run the print-class carve-out, and `paintTextLayer()`
(`src/render/px.js:515-541`) draws body text with `textBaseline='top'` at
`size = 8.8 * box.scale`. **An 8.8-unit text box on a 6-unit row pitch overlaps by 2.8 native
units**, and the lower row's box (292 → 300.8) also runs past the bottom of the 300-tall buffer,
landing on the poster frame's bottom double rule.

Measured on the shipped build — the two rows fuse into ONE unbroken ink band with **zero blank
rows between them** at every viewport:

| viewport | scale | footer ink rows | gap rows between the two lines | overlap |
|---|---|---|---|---|
| 900x600 | 1.875 | 555–577 | 0 | 5.3 px |
| 1280x800 | 2.667 | 763–796 | 0 | 7.5 px |
| 1366x768 | 2.56 | 732–764 | 0 | 7.2 px |
| 1440x900 | 3.0 | 858–895 | 0 | 8.4 px |
| 1920x1080 | 3.6 | 1030–1074 | 0 | 10.1 px |
| 2560x1440 | 4.8 | 1380–1433 | 0 | 13.4 px |

Scale-invariant, because 8.8 > 6 at every scale. Visible as "SEED 1 / EXPOSITION AMUSEMENTS CO. /
BUILD M7" struck through by the frame rule and crowded into the descenders of the line above.

**Provenance — this is NOT from the reconcile delta, and the 08-15 dossier does not depict it.**
`git log -- src/render/title.js` shows the footer sat at y268 / y285 (**17 apart, clear of the
8.8-unit box**) until commit **`2d8e35e` "fix(7): title banner collision offsets" (2026-08-15)**
moved it to y286 / y292. That commit is inside the 08-15 fix round, and it landed *after* the
`step2-coldboot/` captures in the 08-15 dossier were taken — those captures show the old, clean
17-unit spacing (verified by cropping the same device region from both dossiers side by side:
`step2-coldboot/FOOTER-0815-vs-0818.png`). So the 08-15 record's step-2 PASS was certified against
evidence that predates its own fix round, and the collision has been in every build since.

This is the pixel-font-legibility class Ray has named a BLOCKING defect twice (2026-08-12, popinjay
among them), on the first surface a stranger sees. **Step 2 fails.**

Fix shape (not applied — this session does not commit): restore a row pitch of at least the body
text box, e.g. put the prompt at y280 and the credit row at y291, or move the credit row above the
frame rule; then re-run this probe and confirm a non-zero gap band at all seven viewports.

## Step 3 — End-state coverage — PASS

Checked against the DESIGN-SEED's ratified rules (§"The loop", §"Death discipline (scum-proof,
atomically)", §"Stage pressure and completion").

| State | Result |
|---|---|
| Death (fatal hit, real loop) | → `downed` → `scorecard`, hearts 0 |
| Save stamped DEAD before the scorecard renders | Hard relaunch lands on `scorecard`, **not** a live retry |
| Resume door after death | Refused — stays `scorecard`, hearts 0 (no scumming) |
| Restart / fresh run | `playing`, hearts 3, tick advancing |
| Pause → quit to title | `title` |
| Quit → resume | `playing`, balloon roster identical before/after (**no re-roll**) |
| Resume across a full relaunch | `playing`, tick continued 173 → 255 |
| Stage clear → cleared ribbon → ENTER | → `draft` |
| Cleared-ribbon quit-void (the 08-15 BLOCKER) | Relaunch mid-ribbon then resume → `playing`. **Fix holds.** |
| Draft DECLINE | Grants nothing — souvenirs `[]` (seed: "declining grants nothing") |
| Panic Finale | Entered, plays |
| Victory | Reached via the shipped soak driver: 12 stages, 12 drafts, 1 finale, **1 victory, 0 deaths**, `stalled: false`, ends at `scorecard` |

Named gap, unchanged from 08-15 and honest: **real-UI victory was not played by hand** — surviving
the 90-second finale on the keyboard needs human skill. The soak driver exercises the same code
path end-to-end. Ray's play at step 9 is where a hand-played victory lands.

## Step 4 — Motion looker — PASS, one named gap

Frame strips from the shipped build, anchored on the player each frame (world→native is `× 0.375`;
VIEW is 1280x800, NATIVE 480x300), looked at directly.

- **Walk right** (`FACING-A-walk-right.png`): x 454 → 637.7 monotonically. Leg positions alternate
  across all 8 frames — the cycle advances, the sprite is not a static slide.
- **Walk left** (`FACING-B-walk-left.png`): x 663 → 551.4. Same cycle, travel direction correct.
- **Facing**: the player is a **front-facing sprite** (boater hat, teal coat, square to the screen)
  — the reference's own convention, per CLAUDE.md rule 2 and the M0 study. There is no left/right
  facing that could contradict travel, so the moonwalk class is structurally inapplicable here;
  what matters is that the cycle advances with travel, and it does, both directions.
- **Wire + split** (`motion.json` §C): in one tick the wire count went 1 → 0 while balloons went
  1 → 2 — the signature verb fired, popped, and split into two children. Seen in motion, not
  inferred.
- **Whole-scene strip** (`G-wholescene-walk-STRIP.png`): six full frames during a walk — the
  balloon's parabola is continuous and readable across the frames, the vista and HUD are stable.

**Gap:** the climb strip (`FACING-C-climb.png`) staged the player away from a ladder, so `ArrowUp`
produced an idle, not a climb — the climb pose is NOT certified by this run. It is covered by the
suite (`test/overlays.test.js` mid-climb pose assertions) and by the 08-15 step-4 dossier. Named,
not papered over.

## Step 5 — Score check — PASS

`src/engine/score.js` builds every track on `strainAt(n, len, bars)`, which maps the absolute step
count onto an **AABB** plan and returns which strain is playing. All four tracks branch on it and
give the B strain genuinely different material, not a louder A:

| Track | Form | What actually changes in B |
|---|---|---|
| `title` (two-step, 104bpm) | AABB, 2-bar strains | B is the TRIO: F–Bb–C7–F (moves to the subdominant), tuba answers late in the bar instead of on 3, a bell OPENS the strain, longer calmer TRIO figure |
| `stage` (2/4 two-step, 132bpm) | AABB, 4-bar strains | B is the RAG strain: vi–II7–V–V7 circling home the long way, syncopated lead carrying the D7's F# |
| waltz (drafts/scorecards) | AABB, 4-bar strains | B moves to the waltz trio (Dm colour), different beat placement — "where the A strain lilts and pauses" |
| galop (past par / finale) | AABB, 4-bar strains | B walks DOWN (line starts an octave up so the tuba can walk), cornet doubled in rate against A |

Multiple distinct parts per track: **Song-Structure Law satisfied**. Structure is pinned on emitted
events, and audio never touches the sim (the band keeps its own PRNG streams; every gameplay window
is tick-denominated).

Ray's ear ruling on the humanize round is already **LOCKED IN across all four pieces**
(`fd6c250`, `docs/DIRECTIONS-2026-08-16-ear-ruling.md`). Gap unchanged from 08-15: **no offline
listen set** — there is no offline render path, so Ray hears the score in-game at step 9.

## Step 6 — Provenance + collateral — PASS on provenance, TWO findings

**Art provenance: clean, and the title stays paid-eligible.**

- `dist/popinjay.html`: **0** occurrences of `data:image`. No image assets of any kind.
- **0** audio files (the 5 `.wav` substring hits are coincidental byte sequences inside the base64
  font blob, not references — confirmed by context extraction returning nothing).
- The only vendored binary is the operator-mandated 2026-08-14 typography pair, embedded as
  `data:font/ttf`, with `vendor/fonts/OFL-OldStandard.txt` and `OFL-Rye.txt` alongside — exactly the
  sole asset exception CLAUDE.md rule 1 carves out.
- Everything else is canvas-drawn. Per `art-provenance-gates-commercial-release.md`, code-generated
  art keeps POPINJAY paid-eligible.

**FINDING 6a — em-dashes in player-facing copy** (gate step 6 forbids them). Five in ordinary player
copy:

| Location | String |
|---|---|
| `src/app.js:694` | `ONE WIRE — WAIT RETURN` (the denied-fire hint — a banner every player sees) |
| `src/sim/catalog.js:9` | `Two wire slots — both still walls.` (Second Barrel souvenir card) |
| `src/engine/saves.js:74` | `SAVE VERSION MISMATCH — NEW RUN STARTED` |
| `src/engine/saves.js:75` | `SAVE TRUNCATED — NEW RUN STARTED` |
| `src/engine/saves.js:76` | `SAVE UNREADABLE — NEW RUN STARTED` |

All five are present verbatim at `16f22d2` — **pre-existing, so the 08-15 record's "no em-dashes"
PASS was simply wrong**, not a regression. Debug/error strings (`audio: no AudioContext —`,
`resume failed —`, `World.restore: …`, `Streams.restore: …`) are in-code error text and exempt.
The stage label's en-dash (`1 – 1`) is typographically correct between numerals and is not this
finding. Rendering is unaffected — the display-res font has the glyph — so this is a convention
violation, not a visual defect.

**FINDING 6b — no shelf collateral exists.** The field-trials convention (see
`field-trials/games/office-of-the-road/`) carries `og.png`, `ATTRIBUTION.md`, a game `README.md`,
and a served page with OG meta. POPINJAY has none of these, and there is no OG card anywhere in the
repo. Nothing is mis-depicted (there is no card to cast-verify), but the collateral has to exist
before the shelf row can be honest. Note when one is made: it must be drawn from the SHIPPED build,
and the cast is the code-drawn boater-hatted sharpshooter.

## Step 7 — Studio QA sweep — PASS

| Probe | Result |
|---|---|
| Corrupt save: garbage / truncated / empty string / wrong shape / version skew | All 5 boot, `__popinjayReady` reached, **0** errors logged, no wedge |
| Rebind lockout: every action rebound onto a single dead key | `Enter` (RESERVED confirm) still starts a run; `Escape` (RESERVED cancel) still pauses — a pad can never lock the player out |
| ENTER-destroys-save guard (an 08-15 MAJOR) | One `Enter` on a title with a live save arms a confirm prompt and does NOT start; a second `Enter` confirms. **Fix holds.** |
| Rapid input mash (24 alternating pause/fire presses) | Tick advanced 72 → 158, 0 debuglog errors, 0 page errors, no wedge |
| Fresh-eyes "would a stranger call this finished?" | The gameplay screen, options screen and pause screen read finished at the sibling bar — full-window pixel vista, coherent HUD, legible period type. **The title screen does not**, on the footer row alone (step 2). |

## Forks — the 2026-08-17 reconcile (`90ee8c8`), verified live

Both were verified against the shipped artifact by driving the real UI, not by reading source.

**FORK A — right-corner toast (Ray's ruling), not the centred see-through banner. VERIFIED.**
Measured by diffing the presented canvas with the notice up against the same paused frame after it
expires — with the pad already connected in both grabs, so the only difference is the toast itself.
(A first attempt diffed pre- vs post-connect and caught the pause overlay swapping key glyphs for
pad glyphs — a 392x216 box measuring two changes at once; discarded and redone.)

| Property | Expected (Fork A) | Measured | |
|---|---|---|---|
| width | 220 (not the banner's 320) | **220.0** | PASS |
| height | 22 (not 28) | **24** (22 card + 2 shadow rows) | PASS |
| right edge | native x471 (`NATIVE.w − 8 − 1`) | **471.7** | PASS |
| top | native y56 (not y60..90) | **56.0** | PASS |
| clears the player column | x0 > 192 | **x0 = 252** | PASS |
| see-through at alpha 0.58 | interior is a blend | `[113,101,80]` over `[120,112,95]` | PASS |

**FORK B — the HYBRID duplicate-bind guard. All three halves VERIFIED.**

- **B1 keyboard refuse-and-tell** — offered `ArrowUp` (owned by CLIMB UP) onto CLIMB DOWN:
  rebind **rejected**, hint row reads `UP ALREADY BINDS CLIMB UP - CHOOSE ANOTHER`, CLIMB DOWN keeps
  `ArrowDown`, CLIMB UP keeps `ArrowUp`. No silent steal. (The Mac side's steal is gone.)
- **B2 pad coverage** — the row genuinely ARMED first (`rebinding === 'down'`, feedback cleared to
  `null` before the offer, so the assertion cannot read a stale string). Offered `DPAD_UP` (button
  12, owned by CLIMB UP): **refused**, `D-UP ALREADY BINDS CLIMB UP - CHOOSE ANOTHER`, CLIMB DOWN
  keeps `[13]`, CLIMB UP keeps `[12]`. **Discriminating control case:** the same armed row ACCEPTED
  non-colliding button `3` → `down.buttons = [3]`. The guard refuses collisions specifically, not
  everything. (Round 1 of this probe failed to arm and read stale B1 feedback; it proved nothing and
  was re-run — both files are kept.)
- **B3 `loadBindings` sanitize** — wrote a pre-guard profile into `localStorage['popinjay.binds']`
  with `ArrowUp`/button 12 owning BOTH climb verbs, reloaded: healed on the way in. CLIMB UP keeps
  `ArrowUp`/`[12]`, CLIMB DOWN restored to `ArrowDown`/`[13]`. Both the key and the pad collision
  healed.

## Delta since the 08-15 record (`16f22d2..968b27b`, 15 commits)

**Gate-relevant (touch shipped behaviour) — 8:**

| Commit | What | Re-verified here |
|---|---|---|
| `90ee8c8` | The reconcile merge: Fork A toast + Fork B hybrid guard | Forks section — both live |
| `d922458` | refuse opposing duplicate key bindings | B1 |
| `921cd1f` | keep tower-top poses visible through controller toast | suite (overlays), Fork A geometry |
| `17e383b` | separate rehearsal and controller overlays | suite (overlays) |
| `8774db5` | fu2 harvest: rehearsal/notice collision, mid-climb occlusion, KeyJ dup-bind guard | suite + forks |
| `62e2fc7` | keyboard menu recovery via reserved menu codes; notice moved off the player | QA lockout-recovery probe |
| `bf84a10`, `529c66f`, `6fa5935`, `38afdf3` | WIP/as-found lane harvests folded into the above | battery 281/281 |

**Not gate-relevant (docs only) — 5:** `968b27b` (tombstones the superseded centred-banner geometry
rows), `1fc7f08`, `fd6c250` (ear ruling record), `2d76690`, `7a0cc5c` (lane briefs).

Net shipped-code delta: `src/app.js` +375, `src/engine/input.js` +519, `src/engine/band.js` +446,
`src/engine/score.js` +106, `src/render/overlays.js` +74, `src/render/px.js` +17 (the additive
`panel(alpha)` API, default 1 — every other caller unchanged), `src/engine/audio-posture.js` +24,
`src/engine/prng.js` +2. `src/render/title.js` is **unchanged** in this delta — the step-2 blocker
predates it.

## What must reach Ray at step 9

1. **The step-2 blocker.** The title footer collision, and the fact that it entered at `2d8e35e` —
   a commit inside the 08-15 fix round named "title banner collision offsets" — after that round's
   own step-2 captures were taken. Ship is held on this.
2. **The 08-15 record has two rows that did not hold**: its step-2 PASS was certified against
   pre-fix captures, and its step-6 "no em-dashes" PASS missed five player-facing em-dashes.
3. **Seed rulings still owed** (carried from 08-15, unchanged): credits content; scorecard key
   listing. Taste call still open: draft-card generic icons.
4. **His ear on the score in-game** — there is no offline listen set to send ahead.
5. **A hand-played victory** — only the soak driver has reached it.
6. **Collateral decision** — POPINJAY has no OG card / ATTRIBUTION / game README, which the shelf
   convention expects before a row goes up.

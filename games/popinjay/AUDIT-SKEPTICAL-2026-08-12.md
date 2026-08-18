# POPINJAY — skeptical pre-release audit, 2026-08-12

Headless only. Audited artifact: `dist/popinjay.html` at HEAD `3e97ac3`.
**Freshness: CONFIRMED** — `node scripts/build.js` reproduces the committed dist
byte-for-byte (sha256 `f8dcc853…7f34`; full `f8dcc85313c6…8557934`), working tree
clean before and after.

Method: Playwright headless Chromium over `file://`, real keyboard events, nine
viewports; the 207-test suite; the repo's own soak / photo / colourblind harnesses
re-run at HEAD; source reads of `px.js`, `saves.js`, `app.js`, `generate.js`,
`game.js`, `hud.js`, `overlays.js`. Every visual finding below is from a rendered
frame **looked at**, not inferred.

Grounding docs read first: `CLAUDE.md`, `DESIGN-SEED.md`, `PROGRESS.md`,
`docs/AUDIT-M6.md`. Locked decisions are not treated as defects.

---

## Findings

| # | Severity | Finding |
|---|---|---|
| 1 | **FIX-BEFORE-SHIP** | **The small pixel face cannot tell W from H.** In `F3` (3×5, `px.js:382`) the glyphs `H K M W` are mutually **1 pixel apart out of 15**, and `0`/`8`, `0`/`U`, `2`/`Z` likewise. Consequence on the shipped title card, at 5× zoom of a real capture: the controls panel reads **`HALK`**, **`FIRE HIRE`**. The HUD's `WIRE` label reads `HIRE`. `F3` is the game's dominant body face after the art migration (60 uses in `overlays.js`, 9 in `hud.js`), so this touches title controls, pause controls, HUD, draft blurbs, options rows and the scorecard. This is the first text a new player reads and it misspells the game's signature verb. |
| 2 | **FIX-BEFORE-SHIP** | **Locale 2's wind bands are mechanically live and visually undetectable.** Every generated locale-2 stage carries a band (160/160 over 40 seeds), always at world y **240–534** — i.e. always over the seascape — applying **±95 px/s** of horizontal drift (`tuning.js:115`, applied `balloon.js:120`). Class speeds are 60–120 px/s, so a band can halve, double, or **reverse** a Grand's travel. It is drawn (`drawWindBands`, `game.js`) as a 0.07-alpha wash plus pale-blue 9px dashes — over a sea whose own whitecap texture is pale-blue horizontal dashes of the same length and colour family. At 1:1 the band edge is not locatable; only at 4.5× zoom can the streaks be picked out. This breaks signature law #1 ("parabolas are promises… stand in the safe spot with certainty") and CLAUDE.md rule 5 (a mechanic without its visual is not done). The seed specifies "bunting streams"; what ships is sea-coloured dashes on the sea. |
| 3 | **FIX-BEFORE-SHIP** | **The active-effect badge is drawn under the bunting.** `drawEffectBadges` (`game.js:277`) puts the first badge at native `y = HUD_H + 6 = 28`, height 9 → rows 28–37. `hudValance` (`hud.js:66`) draws scallops over rows 24–31, tassels 34–36 and a shadow band 35–41, on top. With one effect active — the ordinary case after any single drop pickup — **`SHIELD` / `SLOW` / `FREEZE` is unreadable** (proof: `dropsDemo` at 7 s, once `SLOW` has expired, leaves `SHIELD` alone in the top slot and it is almost entirely occluded). Rule 9 ("no clipped text") and rule 5. Survived M7 because the proof harness always stages **two** effects, so the readable second badge is the one that got looked at. Fix is one constant. |
| 4 | **FIX-BEFORE-SHIP** | **A run started from an entered seed cannot be resumed, and its death does not stamp.** `resumableKind(storage, seed)` (`saves.js:33`) returns `null` unless the save's seed equals the *boot* seed, and the boot seed is always `1` unless `?seed=` is in the URL (`app.js:42`) — which a double-clicked `file://` build has no way to supply. Measured: default seed → reload → `R` = `playing` ✅; seed **407** → reload → `R` = `title`, tick 0 ❌, with no resume hint shown and no message. The same one line voids the atomic death-stamp: a seeded death writes `{seed:407, dead:true}`, but after a reload the game boots to **title**, not the scorecard, and `Enter` starts a clean run — **the scum-proof guarantee holds only for seed 1** (control: default-seed death after reload → `scorecard` ✅). In-session quit→`R` still works; the loss is across a relaunch, which is exactly when players resume. Silent data loss on an advertised, title-screen-promoted feature. |
| 5 | **FIX-BEFORE-SHIP** | **Corrupt / truncated / version-skew saves degrade SILENTLY.** `loadState` (`saves.js`) swallows the parse error and returns `null` with no log line. Three fuzz cases (`{{{not json`, empty string, `{"v":99,"seed":1}`) each: boots fine, mode `title`, **0 WARN/ERROR lines** in the debug log and nothing on screen. The seed's verification bar requires "save fuzz … → graceful new run, **LOUD notice**"; CLAUDE.md rule 4 bans "nothing happens". Graceful is met; loud is not. The player's run vanishes without explanation. |
| 6 | FIX-BEFORE-SHIP (Field Trials specifically) | **The first-denied-fire teaching line does not exist.** DESIGN-SEED §Sphere-1: "a first-run hint line teaches fire-commitment on the first denied fire," and the wire law calls out "the most common input in the game must teach, not dead-air." Source carries no `hint` / `firstRun` / teaching-line path anywhere; what exists is a 0.22 s denied *effect* plus the HUD slot flash — correct feedback, not the promised instruction. For a build whose purpose is first-session comprehension this is the wrong thing to be missing. |
| 7 | FRICTION | **Draft-card icons carry no per-item information.** `drawDraft` calls `draftIcon(p, c.kind, …)` — one emblem per *kind*, not per souvenir. Locale 1's weapon floor means the very first draft a player ever sees is three cards headed `1. WEAPON / 2. WEAPON / 3. WEAPON` with **three identical emblems** (pixel-diff across the three icon boxes shows only paper-dither offset; the mark is the same wire-arrow). Gallery Sidearm — a pop-gun — gets the wire glyph. The seed's "name + one plain effect line + icon" makes the icon a glance channel; it is currently decorative. The "kit note when it interacts with something held" is also absent (only `HELD: NONE` in the header). Lower half of each card is empty. |
| 8 | FRICTION (operator's eye) | **Balloons have no ink outline and the gold class nearly vanishes in locale 1.** The body is drawn as a shaded orb whose edge is merely darkened (`lit *= 0.6` at `d > r-1.1`, `game.js:335`) rather than given the "thin ink outlines" the art law states. Measured WCAG contrast of the class fills against backgrounds sampled from a real locale-1 frame: `fair` **#c8912f → 1.58:1** over pavement and **1.03:1** over sky; over the lawn every class sits at **1.35–1.59:1**. (WCAG's 3:1 floor is a UI metric, not a games metric, and specular highlight + motion + base-fitting all aid detection — but the gold-on-sky number is a genuine outlier and it matches what the frame looks like: two of the balloons in a routine 1-1 capture read as scenery ornaments.) The busy vistas are the game's best asset and its main legibility cost. |
| 9 | FRICTION | **Nearest-neighbour at non-integer scale (the known-open item) — measured, honestly.** Column-run histograms over the drawn region of real captures: **1440×900 = exactly 3× and perfectly uniform** (all 480 source columns run 3px); **1280×800 = 2.667×** → 320 columns at 3px, 160 at 2px (a third of all columns are 33% narrower); **1920×1080 = 3.6×** → 4px/3px mix; **2560×1440 = 4.8×**; **800×600 = 1.667×** → 1px/2px, a **100%** stem-width variation. Judgement after looking at matched crops: at ≥1440-wide windows the artifact is a subtle unevenness in the paper-tooth dither and letter stems, and text stays legible; below ~1024 wide the 1-vs-2px regime makes the already-marginal `F3` face visibly ragged. **Not a blocker.** The integer-snap fix letterboxes to 75% and collides with the ≥95% fill rule, so it is an operator trade, not a bug fix. |
| 10 | FRICTION | **The ≥95% screen-fill gate is vacuous.** `capture.mjs` asserts the *canvas element* fills ≥95% of the viewport — the canvas is always sized to the window, so the assertion cannot fail. Measuring actual drawn content against the letterbox mat: **100%** at the two ratified 16:10 viewports, **90%** at 1920×1080 / 2560×1440 / 1366×768 (pillarbox bars, and 16:9 is the commonest desktop shape), **83%** at 4:3, **33%** at 480×900 portrait. Fixed-aspect pillarboxing is a legitimate choice; the gate simply never tested the thing it claims to test. |
| 11 | COSMETIC | **`BUILD M5`** is printed on the title card footer and in the exported debug-log filename (`app.js:28`), on a build that is feature-complete through M7 plus two art-migration rounds. Field Trials testers will file reports against the wrong version. |
| 12 | COSMETIC / doc | **`docs/AUDIT-M6.md` line 54's deferral reason is stale.** Text-size floor + plain-type toggle were deferred because "type is legible system-serif at readable sizes and numbers are plain." The art migration removed all system serif; the floor is now a **CAPS-only 3×5 / 5×7 bitmap** with no size control and no plain-type path — i.e. the accessibility position is materially *worse* than the one the deferral was argued against, and the doc still reads authoritative. (Per `supersession-means-deletion`: the reason should be re-argued or the item re-opened, not left standing.) |
| 13 | NOTE | **207/207 tests pass** (PROGRESS.md says 206 — one more than documented, no failures). |
| 14 | NOTE | **The M7 soak reproduces at HEAD**: 3 forced-loadout tours (12 stages + finale + victory each), a mortal death, quit→resume, real-keyboard dead-control — **0 BLOCKER / 0 DEFECT / 0 FRICTION → STAGEABLE**. The STOP-line claim is verified, not taken on trust. Note its blind spots, both of which produced findings above: the quit-resume phase only ever uses the default seed (#4), and no phase looks at a rendered frame (#1, #2, #3). |
| 15 | NOTE | **Naive open is clean.** `file://` double-click equivalent at nine viewports (640×480 → 2560×1440, incl. portrait): readiness fires everywhere, **zero pageerrors, zero console errors, zero in-game debuglog errors, and zero non-`file://` network requests**. `localStorage` over `file://` works in Chromium. Single file, no folder to lose. |
| 16 | NOTE | **Null-strategy verdict: PASSES — the game does not play itself.** Zero input → **dead at 36 s**. Stationary spam-fire camper (never moves, presses `Enter` through every flow screen) → **dead at 56 s**, 1 stage cleared, over a 600 s budget. A crude random-walk-and-fire bot died at 28 s. Positioning is load-bearing; there is no camping win. |
| 17 | NOTE | **Runtime is healthy.** Frame timing over 8 s of real play: median **16.6 ms**, p95 18.7 ms, 8 of 457 frames >20 ms. Sim rate exactly **301 ticks / 5 s**. Accumulator clamped (`MAX_FRAME = 0.25`, `app.js:422`) so a stall cannot spiral. Keys correctly cleared on `blur` (player x unchanged across 1.6 s with a key held down through a blur). Mid-play resize across 900×600 / 1920×1080 / 700×1000 / 1280×800 keeps mode and tick advancing with no error. |
| 18 | NOTE | **Audio is real and code-only.** Instrumented `AudioContext`: 0 nodes before the gesture; after 15 s of play, **1 context, 85 oscillators, 249 gains, 109 node starts, state `running`**. `M` mutes and scheduling stops. No audio files, no CDN, nothing but the House Band. |
| 19 | NOTE | **Clean-room holds.** Zero occurrences of `Pang`, `Mitchell`, `Capcom`, `Buster`, `Bros` in the shipped dist. |
| 20 | NOTE | **Photosensitivity passes at HEAD** — peak transitioning area 11.6% (threshold 25%), flash rate 0.00/s (ceiling 3/s). Caveat on the gate, not the result: the analysis samples **7 frames over 0.3 s**, a window that can structurally contain at most one flash, so it is thin evidence for a *per-second* rate ceiling. Widen the burst window before treating it as a composite proof. |
| 21 | NOTE | **Colourblind sim holds.** Protanope / deuteranope / tritanope frames re-generated at HEAD and looked at: red and gold merge in hue as expected, and class identity survives on **size + silhouette**, which is the stated channel. (These four PNGs were written into `proofs/` by the harness and removed again — the tree is as found.) |
| 22 | NOTE | **All 19 staged surfaces render clean** (draft, prize counter, tour map, trunk, options, pause, cleared, centerpiece, rehearsal, title extras, error banner, finale, drops, dynamite, hit, chain, drip, souvenir, downed): zero page errors, zero log errors. The trunk, options, pause, scorecard and tour-map screens are genuinely good — the trunk's lot description and the options pip meters in particular. |
| 23 | NOTE | Scorecard shows `PRIZE TICKETS 2` alongside `NEXT UNLOCK … 0 / 12` on the same card. In the staged demo this is an artifact (nothing is banked), but the two numbers sitting adjacent and disagreeing is worth one look on a real banked death before Field Trials. |

---

## Null-strategy verdict — **PASSES**

Three probes, real keyboard, real time, 600 s budget each:

- **Zero input.** Dead at **36 s**. The balloons come to you.
- **Camp + spam fire** (never move; `Enter` through every flow screen). Dead at **56 s**
  after clearing exactly one stage. Standing at spawn and mashing the wire is not a
  strategy; the wire fires from your column and the column is where you die.
- **Random walk + spam fire.** Dead at **28 s** — worse than camping, which is the
  right shape: *bad* movement is worse than none, and *good* movement is the game.

No degenerate line found. Contrast with the shoeleather audit's brute-force result:
POPINJAY's skill floor is real and the loop cannot be beaten without playing it.

---

## Opinionated player read

**The art is not a milestone box being ticked. It is the reason to ship this.** The
locale-1 esplanade, the Windward Pier with its lighthouse and surf, the Sunset
Ironworks under a red sky — these are composed pixel paintings with crowds, string
lights, lit lamps and a real sense of place, and they hold up at 4× zoom. The title
card, the tour map, the trunk and the prize counter all read as one artifact in one
register. Nothing in this build looks like a canvas demo. On the one aesthetic law the
seed sets — "would this frame look at home as a period fairground lithograph" — every
frame I captured passes.

The core loop is also intact: parabolas are readable, the wire's commitment is felt
within thirty seconds, the split tree does the Pang thing where one shot becomes your
next problem, and the flow (clear → ribbon → draft → tour map → rehearsal) has real
rhythm rather than menu-clicking.

**Where a skeptical first player bounces, in order:**

1. **The title card tells them the fire key is `HIRE`.** Finding 1. They will parse it,
   because context carries it, but the first impression of a game whose whole pitch is
   craft is a font that cannot spell its own verb. Six pixels.
2. **Locale 2 stops being honest.** Finding 2. Locale 1 teaches "watch one bounce, then
   you know" — and it earns it. Then the pier arrives and balloons start drifting for
   no visible reason inside a zone the player cannot see. That is not difficulty; it is
   the game breaking the promise it just spent four stages making.
3. **Picking up a shield tells them nothing.** Finding 3. The badge is the only
   persistent read on whether the absorb is still held, and it is behind the bunting.
4. **Their seeded run disappears.** Finding 4. The title screen advertises seed entry;
   a player who uses it, closes the tab, and comes back finds a clean title with no
   hint their run ever existed.
5. **The first draft looks like it is broken.** Finding 7. Three cards, the same word at
   the top of each, the same picture on each. It reads as placeholder art in a build
   where nothing else does.

**The lead moment for a Field Trials post** is not a mechanic — it is the frame. Put the
locale-2 pier and the locale-3 ironworks side by side and say "every pixel of this is
code-generated, no image assets, no fonts, no packs." That claim is true, verifiable, and
unusual, and it is what this build has that nothing else in the gauntlet has. Second
choice: the tour-map interstitial, which is the single most in-register thing here.

---

## Verdict — **FIX-FIRST**

The engine is sound, the suite is honest, the soak reproduces, the boot is clean and
offline, and the null strategy fails as it should. This is a finished game, not a demo,
and none of the findings threaten its architecture.

But four of the six top findings land inside a first session — a misspelt control
listing, an invisible mechanic that breaks the signature law, an unreadable pickup
state, and silent loss of a seeded run — and Field Trials is precisely a test of first
sessions. Shipping into that with #1–#5 open spends tester goodwill on defects that are
already known.

**Cheap and mechanical (dispatchable now):**
#1 (redraw four `F3` glyphs and re-run the zero-missing-glyph test with a
minimum-Hamming assertion beside it), #3 (one constant — move the badge stack below the
valance shadow, ~`y = 42`), #5 (log + on-screen notice on a failed save parse), #11
(`BUILD` string), #12 (doc correction).

**Needs the operator's hands:**

- **#2, the wind band.** How a drift zone should *look* in this register is a design-axis
  call — bunting streamers as the seed says, a tinted air mass, drifting confetti, an
  edge rule. Claude should not pick the visual language for the locale's headline
  mechanic.
- **#4, the seeded-resume fix.** Two defensible shapes — persist the last-played seed and
  boot to it, or make the resume check seed-agnostic and adopt the save's seed — and they
  differ in what "one run slot" means. Operator call, then mechanical.
- **#8, the balloon outline.** Whether to add an ink outline (matching the stated art law,
  at some cost to the painterly look the operator ratified) is Ray's eyes on Ray's screen,
  not a lane's.
- **#9, the non-integer scale.** Genuinely a trade against the fill rule; the measurements
  above are the input, the decision is not Claude's.
- **#6**, whether a teaching line is wanted at all now that the title card carries the
  controls, is a design call the seed already made — but re-confirm it before building.

Nothing here was fixed, committed, or pushed. The working tree is as found.

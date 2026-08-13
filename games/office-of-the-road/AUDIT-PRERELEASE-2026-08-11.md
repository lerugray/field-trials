# OOR — ADVERSARIAL PRE-RELEASE AUDIT, 2026-08-11

Headless throughout (Playwright Chromium, `file://`). Artifact audited: `dist/office-of-the-road.html`.
**Freshness confirmed:** a fresh `node scripts/build.js` at HEAD (`f183634`) reproduces the committed
dist byte-for-byte — the shipped file is current.

**VERDICT: FIX-FIRST.** All three operator reports reproduce. No dead controls, no boot errors, no
network, 157/157 tests green — the machine is sound; the defects are in the presentation layer.

---

## PRIORITY 0 — operator field reports

### OR-1 · "Text is extremely blurry" — CONFIRMED, INTRINSIC · FIX-BEFORE-SHIP

Not viewport-dependent. The scaling is correct; the **source raster** is the bug.

The canvas backing store is fixed at **320×200** (`main.js:36`, `canvas.width = VW` at `main.js:129`)
with **no devicePixelRatio compensation**. Every string is `ctx.fillText` at 6/7/8/10 px into that
320-wide raster (104 `fillText` calls; 6px is the dominant body size). Canvas text antialiasing
cannot be disabled — `imageSmoothingEnabled = false` governs `drawImage` only.

Measured, rendering the same string offscreen at each size the game uses:

| font | distinct luminance levels | solid-ink px | antialiased share of glyph |
|---|---|---|---|
| 6px | 124 | **0** | **100 %** |
| 7px | 148 | 11 | 97.2 % |
| 8px | 154 | 29 | 93.1 % |
| 10px | 138 | 139 | 75.6 % |

At 6px **every glyph pixel is a partial value; none is solid ink.** That raster is then magnified
**8× on a Retina Mac** (4× CSS integer scale × DPR 2), nearest-neighbour, turning each fuzzy
sub-pixel into an 8×8 grey block.

**The 2026-08-09 crisp-scaling fix (`e06f67b`) works and is not the problem.** Verified at
1280×800, 1440×900, 1512×982, 1728×1117, 1024×768, 800×600 × DPR {1,2}: integer scale at every
one (4/4/4/5/3/2 → device 8/8/8/10/6/4), `image-rendering: pixelated` applied. It fixed the
upscale; the blur lives one layer below it.

*Fix:* render the canvas at `VW*scale*dpr` and scale draw geometry to match (text then rasterizes at
device resolution), **or** ship a bitmap pixel font blitted as glyphs (2-colour by construction).
Raising the base resolution alone only moves the problem.

### OR-2 · "Some of the cards might be pasted over things" — CONFIRMED, 2 instances · FIX-BEFORE-SHIP

Method: instrumented `fillText`/`drawImage`/`fillRect`/`strokeRect` with paint order, segmented to
exactly one frame (slicing between full-canvas clears), computed bbox intersection of each text
against every **later-painted** opaque draw. Swept 11 states.

- **Draft screen (the card offer).** Card-name labels at `y=178` (6px → 178..184) are overpainted by
  the speed bar at `y=182..196`. Measured: `"The Hanged M" @(58,178)` **30 %** covered by
  `rect(74,182,30×14)`; `"The Emperor" @(100,178)` **29 %** covered by the same. Visually the names
  are sliced through and buried behind the 0.5x/1x/2x boxes — **the player cannot read which card is
  being offered.** Repro: `?fresh=1&ticks=400&beats=200`.
- **March and combat screens.** The score/mute indicator `"score: march (M)" @(234,178)` is
  **31 %** overpainted by `HOLD rect(232,182,34×14)` + `CREDITS rect(270,182,44×14)`. This is the
  only surface naming the current track and the mute key — directly compounding OR-3.

**Root cause, both:** content drawn at `y=178` in a 6px font (extends to 184) while `drawControls`
paints the control bar at `y=182..196` **last**. A 4-pixel, screen-wide collision band.

Clean: in-fight hand labels (170..182 vs controls at 182 — tight but no overlap). No out-of-bounds
text on any screen.

### OR-3 · "One very small line over and over" — CONFIRMED, worse than reported · FIX-BEFORE-SHIP

| track | bpm | len | loop | bars | notes/loop | variation |
|---|---|---|---|---|---|---|
| office | 64 | 32 | 7.50 s | 2 | 4 | identical forever |
| march | 108 | 32 | **4.44 s** | 2 | 25 | identical forever |
| town | 100 | 32 | 4.80 s | 2 | 22 | identical forever |
| combat | 140 | 16 | **1.71 s** | **1** | 40 | identical forever |
| report | 58 | 32 | 8.28 s | 2 | 7 | identical forever |

`march` backs the march + route screens — most of playtime — at **4.4 seconds, repeated ~810×/hour**.
`combat` is **1.71 s, a single bar**, during the most attention-heavy moments.

**The variation machinery exists and is never used.** `band.js` `tick()` passes every step
`{ v, i, n, bar, params, rand(salt) }` — absolute step counter, seeded RNG, live params. **No track
in `score.js` references any of them**; every `step()` is a pure function of `i`. Verified
empirically: loop 1 ≡ loop 2 ≡ loop 8 ≡ loop 41, byte-identical event sequences, all five tracks.

*Fix (cheap — hooks already wired):* section-gate figures on `(s.n / len | 0) % k` for A/B/A/C form,
ornament/fill variation via `s.rand()`, combat intensity via `s.params`. Lengthen `combat` past one bar.

---

## STANDARD AUDIT

### Naive open + integrity — PASS
`file://` boot: zero console errors, zero page errors, **zero external network requests** at boot and
across a full session (single file, art inlined as data URIs). `node --test` → **157/157 pass, 0 fail**
(838 ms). Only network anywhere is the user-initiated CC BY link, which the licence requires.

### Verb matrix — 22/22 live, no dead controls
intake→file · march auto-advance · speed 0.5x/1x/2x/4x by mouse and by arrows · pause/resume by
button and by Space (tick-delta verified frozen then resuming) · HOLD (h) · mute (m) · play card by
key **and** by mouse click on the card · draft take (deck 5→6) · camp job reassignment · deck
open/close · shop requisition (gold 200→180, inv 2→3) · route branch pick · save→reload→docket→resume
(**byte-exact** state restore) · defeat→new expedition · credits open · NEXT paging (clamps at 4/4) ·
**OPEN CC BY genuinely opens a tab** · export log (e), no error.

> First-pass "failures" on speed/pause were my own harness's Tab-navigation assumption, plus a combat
> transition mistaken for a frozen march. Re-verified in isolation: all live.

### Visual
- **FIX-BEFORE-SHIP — shop bottom band is greyscale noise.** `tileFillCell(TOWN_KEY, TOWN_TILE.cobble,
  0, 184, VW, 16)` (`main.js:1380`). Source cell (0,18) of `TOWNS_ALL_1x.png` is white/grey cobble with
  **transparent mortar gaps**, drawn with no base ground fill, so the gaps show near-black background.
  Measured: band **meanSat 0.00 / meanLum 159** vs shop UI **meanSat 0.13 / meanLum 41** — 4× overbright,
  fully desaturated, in a warm-ink palette. *Fix:* base fill beneath it, tint toward palette.
- **FIX-BEFORE-SHIP (register) — route-table terrain tiles are fully saturated.** Measured **meanSat
  0.59–0.94 (p95 = 1.00), meanLum 101–127** vs the rest of the UI at **0.13 / 21**. Raw overworld tiles
  untinted: bright green "Toll Wood" and blue-on-green "The Fen" are the loudest things on screen and
  fight the labels drawn over them.
- **COSMETIC — pervasive truncation.** All four camp job descriptions cut mid-sentence ("Removes
  obstruct…", "billed to the expedition. M…", "files the finding…", "stands in front of it. A…") — the
  player can never read a full trade description. Also route bodies, terrain labels
  (`slice(0, floor(bw/4))`), combatant names (`slice(0,9)`), draft names (`slice(0,12)`).
- **COSMETIC — combat damage floats collide with the masthead subtitle.** Floats spawn at `y-6` above
  enemies at y=34 → ~y=28; the subtitle sits at y=26.
- **NOTE — hand card art illegible at 30×38.** Full tarot faces downsampled into a 30px column read as
  noise; the card is identifiable only by the state word beneath it.
- **NOTE — CLAUDE.md hard rule #9 not met at 1440×900.** Rule: ≥95 % screen fill both dims at 1280×800
  *and* 1440×900. Measured 1280×800 → 100 %/100 % (pass); **1440×900 → 88.9 %/88.9 % (fail)**;
  1512×982 → 84.7 %/81.5 %. The integer-scale snap trades fill for crispness. Amend the rule or
  recover the fill — don't leave them contradicting.
- **SKIPPED (headless constraint):** scrollbar-affordance checks require a headed window. Not run.

### Provenance — PASS
`ATTRIBUTION.md` is complete (Willibab/Monsteretrope CC BY; GuttyKreum Pixel Tarot commercial
purchase; RonnyG credit-only note; score = code-composed WebAudio, no third-party audio) and is
**inlined in dist** and reachable in-game via CREDITS, paginated 1/4 with PREV/NEXT/OPEN CC BY/BACK.
The CC BY attribution obligation is satisfied inside the shipped artifact.

- **COSMETIC — credits render raw internal markdown.** Player-facing text includes "(DESIGN-SEED art
  law; CLAUDE.md hard rule #1)" and "Full technical inventory: `materials/ASSET-MANIFEST.md`" —
  builder documents the player does not have — plus orphan-word wrapping from re-wrapping the file's
  hard line breaks. Ship a player-facing credits string, not the build's internal file.
- **NOTE (pre-existing, flagged in ATTRIBUTION.md itself):** the Pixel Tarot multi-title licence scope
  is to be reconfirmed with the seller before any **paid** release. Art provenance is licensed-pack +
  code-composed, so the title is paid-eligible; that reconfirmation is the open gate.

### Release collateral — GAP
`assets/` is **empty**. No title card, cover/og image, screenshots, tagline asset, or store/itch page
copy. README + MISSION exist. All page-facing material is still to make.

---

## Ranked fixes

1. **Text rasterization (OR-1)** — device-resolution canvas or a bitmap font. Everything else is polish
   next to this; it is the first thing anyone sees.
2. **Score variation (OR-3)** — use the `n` / `rand` / `params` hooks already passed to every step;
   lengthen `combat` past one bar.
3. **The y=178 vs y=182 collision band (OR-2)** — move draft names and the score indicator up, or the
   control bar down.
4. **Shop cobble base fill + route-tile palette tint** — both are pack art shipped untinted.
5. **Credits player-facing text + a truncation pass** on camp/route descriptions.

# Legibility hotfix — 2026-08-26

**Operator defect (Ray, field-trials build):** “some of the red text with shadowing is incredibly hard to read.”

**Baseline at start:** `node --test` **291/291 green** on HEAD (unverified WIP harvest commit).

**Baseline at ship:** `node --test` **296/296 green** (five legibility contrast probes added).

---

## Root cause

Live browser frames paint body/display copy through the registered OFL faces (`paintTextLayer`, `skipNative: true`). Rust **display headings** and the **POPINJAY wordmark** still queued a separate **ink cast shadow** (`#14100c` / `#1c1410` at ~55% alpha) under a **mid rust ramp** (`P.rd2`–`P.rd3`). On the title’s darkened vista scrim and on busy in-game grounds, that stack reads as muddy brown fringe — effective contrast drops well below AA while the face color alone looks acceptable on cream paper.

Flat **`P.rd2` body accents** (menu keys, pad bindings, HUD BELL, trunk prices) had no shadow but sat at **~5.3:1** on cream — legible but weak for small bold body type at DPR 2.

---

## Surfaces audited (red + shadow or red accent text)

| Surface | Treatment before | Fix |
|---|---|---|
| `titleWordmark()` — POPINJAY | Ink cast + rust ramp | `paintWarmDisplayShadow()` + brighter `sampleDisplayRamp(R.rust)` |
| `heading()` — PAUSED, DOWNED, TOUR MAP, PRIZE COUNTER, ABANDON… | Ink cast + rust ramp | Same warm halo path for `R.rust`; gold headings keep ink cast |
| `headingA()` — centerpiece name | Ink cast + flat fill | Warm halo when fill is paper/rust-toned |
| `paintTextLayer()` display rust glyphs | Fill only | Cream stroke when `warmTextCol(col)` |
| Flat `P.rd2` body accents (title keys, pause bindings, HUD BELL/chain, trunk/draft/scorecard CTAs) | `P.rd2` | `ACCENT_RED` (`P.rd1`) on cream/paper panels |
| Decorative pixels (hearts, ticket stubs, chevrons, pennants) | `P.rd2` | Unchanged — not text |

No `t5s`/`t5sc` call sites used rust foreground colors.

---

## Measured contrast (WCAG relative luminance, 1:1)

| Pair | Before | After |
|---|---:|---:|
| Body accent on cream (`pa5`) | rd2 **5.28:1** | ACCENT_RED **10.44:1** |
| Body accent on panel (`pa4`) | rd2 **4.52:1** | ACCENT_RED **8.94:1** |
| Mid rust on title scrim (`#4a4038`) | rd2 **1.77:1** | sample ramp face **4.40:1** |
| Cream halo on title scrim | — | pa5 **9.36:1** |
| Rust ramp mid-tone on scrim (old heading formula) | **2.82:1** | — |

Probe-locked in `test/legibility.test.js`.

---

## Proof frames (devicePixelRatio 2, viewport 1440×900)

All under `proofs/legibility-2026-08-26/` — dated filenames, no overwrites.

### Before (pre-hotfix HEAD)

- `before-title-wordmark_1440x900@2x_20260827-002600.png`
- `before-title-extras_1440x900@2x_20260827-002600.png`
- `before-pause-menu_1440x900@2x_20260827-002600.png`
- `before-downed-beat_1440x900@2x_20260827-002600.png`
- `before-tour-map_1440x900@2x_20260827-002600.png`
- `before-scorecard_1440x900@2x_20260827-002600.png`
- `before-trunk_1440x900@2x_20260827-002600.png`
- `before-draft_1440x900@2x_20260827-002600.png`
- `before-hud-bell_1440x900@2x_20260827-002600.png`

### After (this hotfix)

- `after-title-wordmark_1440x900@2x_20260827-002615.png`
- `after-title-extras_1440x900@2x_20260827-002615.png`
- `after-pause-menu_1440x900@2x_20260827-002615.png`
- `after-downed-beat_1440x900@2x_20260827-002615.png`
- `after-tour-map_1440x900@2x_20260827-002615.png`
- `after-scorecard_1440x900@2x_20260827-002615.png`
- `after-trunk_1440x900@2x_20260827-002615.png`
- `after-draft_1440x900@2x_20260827-002615.png`
- `after-hud-bell_1440x900@2x_20260827-002615.png`

Capture harness: `node scripts/legibility-capture.mjs --tag=before|after`

---

## Code touchpoints

- `src/render/px.js` — `ACCENT_RED`, `paintWarmDisplayShadow`, `paintCoolDisplayShadow`, `sampleDisplayRamp`, `contrastRatio`, display rust stroke in `paintTextLayer`
- `src/render/overlays.js` — `heading` / `headingA`, flat accent swaps
- `src/render/title.js` — wordmark + controls accents
- `src/render/hud.js` — BELL / chain / sidearm accents
- `test/legibility.test.js` — contrast probes
- `scripts/legibility-capture.mjs` — proof capture

Palette law preserved: all colors remain inside the committed rust/paper ramp register (`P.rd*`, `P.pa*`).

---

## Build

```sh
npm run build   # -> dist/popinjay.html (1365.1 KB at ship)
```

---

## Deploy mechanism (NOT executed)

POPINJAY has **no in-repo deploy script**. Ship artifact is `dist/popinjay.html` (single file, `file://` boot). Publishing to the field-trials shelf is a **manual vendoring step** into the sibling `field-trials` repo (`games/popinjay/`, copy built `index.html`, commit `main`, push) — see `docs/verification/release-gate-2026-08-18/STEP-8-PLAN.md`. The exact path from `games/popinjay/` to `lerugray.github.io/field-trials/popinjay/` was **not confirmed in-repo** (no `gh-pages` workflow in popinjay; field-trials Pages mapping unresolved). **This hotfix was not deployed.**

---

## For the operator to ratify

- Visual pass on the nine proof pairs above — especially title wordmark and pause/down/tour headings at DPR 2 on a real display.
- Confirm warm halo on rust headings still reads “period poster” rather than “outline glow.”
- Lean: if any single screen still fails, sample **that screen’s actual background pixel** and tune `sampleDisplayRamp` bias only — do not import foreign colors.

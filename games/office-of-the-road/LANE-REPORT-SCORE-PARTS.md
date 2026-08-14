# LANE-REPORT-SCORE-PARTS.md

Score revision for the Song-Structure Law (Ray, 2026-08-12 — canonical: house-band README §Song-Structure Law).

## Scope

- File touched: `src/score.js` (the OOR code-composed score; the band kit in `src/band.js` is unchanged).
- No game logic changed; musical register stays chiptune/medieval (desk/bureau joke intact).
- Determinism preserved: all variation comes from `s.n` (absolute step count) and `s.rand(...)` via the existing seeded `hash2` path.
- `dist/office-of-the-road.html` rebuilt because the score is inlined.
- Full baseline suite: **174/174 pass**.

## What the law required

> A full song needs more than one part — always. Minimum two distinct sections (A/B at least) with real arrangement variation between them (voicing, density, register movement — not just a fill). Loops either alternate sections or carry internal variation across passes; a single repeated cell is a defect.

## Per-track before / after

### office

- **Before:** one sparse waiting-room cell. Four bars of drone (`D2/A2/Bb2/A2`) plus a single bell on beat 8 and an occasional random desk-bell. No real A/B; the loop was the same every pass.
- **After:**
  - **A (bars 1-2):** `D2/A2` drone, high bell pair (`F4`/`D4`).
  - **B (bars 3-4):** `Bb2/G2` drone, lower bell (`D4`/`A4`), plus a sparse triangle lead tone (`F4`/`C4`) that does not appear in A.
  - **Pass variation:** even/odd loops swap the A-section bell pair so the waiting room does not photocopy itself.
- **Density:** 0.156 notes/step (still the quietest track).

### march

- **Before:** four bars of processional material (different roots/counter/melody per bar), but the same four-bar circuit repeated verbatim every loop.
- **After:**
  - **A (bars 1-2):** bass on the downbeats, a single pluck counter-figure on the & of 1, square lead melody.
  - **B (bars 3-4):** denser pluck figure on every eighth note, a longer melody line, and a high harmony lead (`F5`/`E5` or `A5`/`F5`) on even passes.
  - **Pass variation:** the cadence ornament at the end of bar 4 alternates `C5`/`D5` by loop; even passes add the B-section harmony lead.
- **Density:** 0.984 notes/step.

### town

- **Before:** a skipping pluck figure alternating two melodic phrases (`phraseA`/`phraseB`) with sparse bass and bell. Two phrases, but one repeated cell arrangement.
- **After:**
  - **A (bars 1-2):** pluck melody, bass only on beat 1 of each bar, bell.
  - **B (bars 3-4):** walking bass every four beats, plus a lead counter-melody (`D5/F5/A5/F5` or `G5/F5/D5/C5`) on alternate passes.
  - **Pass variation:** the B-section lead counter-melody only appears on even loops.
- **Density:** 0.891 notes/step.

### combat

- **Before:** four distinct driving bars with full kit, but the same four-bar block repeated every loop.
- **After:**
  - **A (bars 1-2):** full backbeat — kick, snare, hat, pulse bass, square arp.
  - **B (bars 3-4):** breakdown — sparse snare/hat, bass still pulses, different arp register, plus a high lead fill on even passes and the existing build back into bar 4.
  - **Pass variation:** even loops add a high square fill over the B-section; intensity params still work as before.
- **Density:** 2.469 notes/step (still the busiest track; still the only kit track).

### report

- **Before:** shifting drone plus a sparse lead phrase alternating every bar. Register and mood were right, but it was a single repeated two-bar cell.
- **After:**
  - **A (bars 1-2):** drone + sparse triangle lead in the mid register (`D4/C4` and `Bb3/A3/D4`).
  - **B (bars 3-4):** lead drops an octave (`G3/F3/A3` and `D3/F3/A3`), a pluck echo enters, and the bell darkens to `D4`.
  - **Pass variation:** the B-section pluck echo only appears on even loops.
- **Density:** 0.328 notes/step.

## How the law is met

1. **Every track has at least two distinct sections.** The split is bars 1-2 vs 3-4 (`A` vs `B`).
2. **Variation is arrangement-level, not ornamental:** different bass density (town/combat), added/removed voices (lead in office B, lead counter in town B, pluck echo in report B, harmony lead in march B), and register movement (report B drops an octave).
3. **Loops do not settle:** every track uses `pass = (s.n / 64) | 0` to alter material on alternate loops (bell swap, harmony lead, counter-melody, fills, pluck echo).
4. **Determinism is intact:** all variation is derived from `s.n` and the seeded `s.rand(...)` helper; `renderTrackEventBytes` still produces identical bytes for identical seeds and different bytes for loop 1 vs loop 2.

## Verification

- `npm test`: 174/174 pass, including the score-specific regression tests:
  - `four-bar material varies by section`
  - `successive score loops differ`
  - `combat params alter intensity`
  - combat remains the only percussion track and the busiest.
- `node scripts/build.js`: rebuilt `dist/office-of-the-road.html`.

## Audio proofs

Rendered 24s WAVs of each revised track with the actual OOR band kit + score via Playwright/Chromium `OfflineAudioContext`:

- `proof/score-parts-20260812/oor-office-parts.wav`
- `proof/score-parts-20260812/oor-march-parts.wav`
- `proof/score-parts-20260812/oor-town-parts.wav`
- `proof/score-parts-20260812/oor-combat-parts.wav`
- `proof/score-parts-20260812/oor-report-parts.wav`

Render script: `scripts/render-score-proofs.mjs`.

Peak levels (int16 normalized):

| track | peak |
|-------|------|
| office | 0.344 |
| march | 0.718 |
| town | 0.542 |
| combat | 0.840 |
| report | 0.453 |

Ray's ear is the final gate.

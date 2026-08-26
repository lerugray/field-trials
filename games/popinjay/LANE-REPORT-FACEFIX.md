# POPINJAY — F3 face round 3: resemblance + separation (2026-08-12)

Scope: undo round 2's separation-only optimisation (18/36 alphanumerics bent away from
canonical letterforms). Rebuild F3 from **pre-fix canonical 3×5** reference shapes with
minimal one-pixel separations. Two-term objective encoded in `test/px.test.js`. **Not
committed or pushed.**

Verification: `node --test` **216/216 green** (214 baseline + resemblance gate + reworked
separation gate + looker M/X render test). `node scripts/build.js` rebuilt
`dist/popinjay.html`.

---

## The lesson applied

Round 2 (`LANE-REPORT-MFIX.md`) enforced all-pairs Hamming ≥3 and redrew 33 glyphs. That
cleared confusions structurally but bent half the alphabet — `WALK`→`UALK`, `MENUS`→`XENUS`,
`BUILD M7`→`BUILD X7`. The bowtie `M` (`#.#/###/.#./###/#.#`) was nearer canonical M in
Hamming but read as X.

Round 3 starts from the **canonical table** (shipped pre-fix face at `3e97ac3`), adjusts
only where separation requires it, and gates on **both** terms:

| Term | Rule |
|------|------|
| **(a) Resemblance** | Each shipped alphanumeric is strictly nearer its own canonical bitmap than any other letter's canonical (nearest-neighbour on reference table). **36/36 pass.** |
| **(b) Separation** | All pairs Hamming ≥2 (exact collisions forbidden). Alphanumeric pairs Hamming ≥3 except 23 documented degeneracies at 2. E/5 identical-bitmap guard retained. |

---

## Canonical reference table (3×5)

Source: pre-fix body face (`git show 3e97ac3:src/render/px.js`). This is the acceptance
reference — not round 2 shapes.

| | Form | | Form |
|---|------|---|------|
| A | `.#./#.#/###/#.#/#.#` | N | `#.#/##./###/.##/#.#` |
| B | `##./#.#/##./#.#/##.` | O | `.#./#.#/#.#/#.#/.#.` |
| C | `.##/#../#../#../.##` | P | `##./#.#/##./#../#..` |
| D | `##./#.#/#.#/#.#/##.` | Q | `.#./#.#/#.#/##./.##` |
| E | `###/#../##./#../###` | R | `##./#.#/##./#.#/#.#` |
| F | `###/#../##./#../#..` | S | `.##/#../.#./..#/##.` |
| G | `.##/#../#.#/#.#/.##` | T | `###/.#./.#./.#./.#.` |
| H | `#.#/#.#/###/#.#/#.#` | U | `#.#/#.#/#.#/#.#/###` |
| I | `###/.#./.#./.#./###` | V | `#.#/#.#/#.#/.#./.#.` |
| J | `..#/..#/..#/#.#/.#.` | W | `#.#/#.#/###/###/#.#` |
| K | `#.#/#.#/##./#.#/#.#` | X | `#.#/#.#/.#./#.#/#.#` |
| L | `#../#../#../#../###` | Y | `#.#/#.#/.#./.#./.#.` |
| M | `#.#/###/###/#.#/#.#` | Z | `###/..#/.#./#../###` |
| | | | |
| 0 | `###/#.#/#.#/#.#/###` | 6 | `.##/#../###/#.#/###` |
| 1 | `.#./##./.#./.#./###` | 7 | `###/..#/.#./.#./.#.` |
| 2 | `##./..#/.#./#../###` | 8 | `###/#.#/###/#.#/###` |
| 3 | `##./..#/.#./..#/##.` | 9 | `###/#.#/###/..#/##.` |
| 4 | `#.#/#.#/###/..#/..#` | 5 | `###/#../##./..#/##.` |

---

## Per-glyph final forms (shipped F3)

30 glyphs **unchanged** from canonical. **6 one-pixel deviations** (corner/edge flips only):

| Glyph | Final form | Δ from canonical | Why |
|-------|------------|------------------|-----|
| **A** | `.#./..#/###/#.#/#.#` | (2,0) off | Breaks H/K/W stem collisions while keeping A peak |
| **B** | `.#./#.#/##./#.#/##.` | (0,0) off | Separates B/D/P/R cluster |
| **H** | `..#/#.#/###/#.#/#.#` | (0,0) off | H/K/M/W degeneracy — open top-left stem |
| **K** | `#.#/..#/##./#.#/#.#` | (0,1) off | K/X hamming-1; keeps K diagonal leg readable |
| **Z** | `.##/..#/.#./#../###` | (0,0) on | Z/2 hamming-1 — corner tag distinguishes from 2 |
| **0** | `.##/#.#/#.#/#.#/###` | (0,0) on | 0/8/U hamming-1 — open top-left distinguishes ring |

**M restored to canonical** `#.#/###/###/#.#/#.#` (twin-peak, not bowtie). **X restored to
canonical** `#.#/#.#/.#./#.#/#.#`. M–X Hamming **3**.

Punctuation reverted to pre-fix canonical except `.` and `·` (+1 pixel each) so space
pairs meet the global Hamming ≥2 floor.

---

## Both-term scores (all 36 alphanumerics)

Nearest-canonical scoring (`node scripts/facefix-score.mjs`):

| | | | | | | |
|---|---|---|---|---|---|---|
| A d=1→A | B d=1→B | C d=0→C | D d=0→D | E d=0→E | F d=0→F |
| G d=0→G | H d=1→H | I d=0→I | J d=0→J | K d=1→K | L d=0→L |
| M d=0→M | N d=0→N | O d=0→O | P d=0→P | Q d=0→Q | R d=0→R |
| S d=0→S | T d=0→T | U d=0→U | V d=0→V | W d=0→W | X d=0→X |
| Y d=0→Y | Z d=1→Z | 0 d=1→0 | 1 d=0→1 | 2 d=0→2 | 3 d=0→3 |
| 4 d=0→4 | 5 d=0→5 | 6 d=0→6 | 7 d=0→7 | 8 d=0→8 | 9 d=0→9 |

**36/36 resemblance pass.** Pre-fix shipped face scored 18/36; round 2 scored 18/36 the
other direction (separated but illegible).

Separation summary:

| Metric | Pre-fix | Round 2 | Round 3 |
|--------|---------|---------|---------|
| Pairs at Hamming ≤1 | 7 | 0 | **0** |
| Pairs at Hamming 2 (alpha) | 27 | 0 | **23** (documented) |
| Min pair Hamming | 1 | 3 | **2** |
| Resemblance pass | 36/36 | 18/36 | **36/36** |

---

## Documented Hamming-2 exceptions (3×5 degeneracies)

These 23 alphanumeric pairs cannot reach Hamming 3 without violating resemblance (a).
Each stays at 2 with a structurally loud difference (corner flip, open stem, or unlike
silhouette). Encoded in `F3_HAMMING2_EXCEPTIONS` in `test/px.test.js`.

```
0/6  0/8  0/G  0/U  2/Z  5/9  5/S  6/8  6/G  7/T  7/Y  8/9  8/U
C/G  D/O  E/F  F/P  H/M  H/W  I/T  K/X  M/W  P/R
```

**Corner-only outs** (visually loud at a corner, not an interior row): **D/O**, **I/T**,
**2/Z**.

**No surface moved to 5×7** — title card body copy reads correctly at native F3 after
canonical restoration; the larger face was not needed.

---

## Rendered-frame evidence

Captures at 1440×900 @1x beside `docs/proofs/reexam-20260812/` (`node scripts/facefix-capture.mjs`):

| File | Surface | Key strings verified by eye |
|------|---------|----------------------------|
| `facefix-title_1440x900@1x_20260812-093003.png` | Title + CONTROLS panel | **WALK**, **FIRE WIRE**, **CLIMB**, **MENUS**, **CONTROLS**, **BUILD M7**, **EXPOSITION AMUSEMENTS CO.**, **PRESS ENTER TO BEGIN THE TOUR** |
| `facefix-trunk_1440x900@1x_20260812-093003.png` | THE TRUNK | **THE TRUNK**, owned/for-sale lists, **COLLECTOR'S EYE** card |
| `facefix-draft_1440x900@1x_20260812-093003.png` | Draft screen | **DRAFT A SOUVENIR**, **GALLERY SIDEARM**, **SKY ANCHOR**, **QUICK SPOOL** |
| `facefix-hud-composure_1440x900@1x_20260812-093003.png` | In-run HUD | **COMPOSURE**, **WIRE**, **READY**, **ALOFT**, **CHAIN**, **SCORE**, **TICKETS** |
| `facefix-options_1440x900@1x_20260812-093003.png` | OPTIONS panel | **OPTIONS**, **COMPOSURE HEARTS**, **CLOSING BELL (PAR)**, **FLASH-REDUCE** |

Re-exam misreads (`UALK`, `CUNTRULS`, `XENUS`, `BUILD X7`, `FIRE UIRE`, `FHE FRUNK`) are
**cleared** on all five surfaces. **M** reads as M; **W** reads as W; **E** unchanged and
still clean.

---

## Suite + build

| Metric | Value |
|--------|-------|
| Tests | **216/216** ( +1 resemblance gate; separation gate reworked from ≥3-all-pairs ) |
| E/5 guard | pass (Hamming 3, distinct bitmaps) |
| M/X looker render test | pass |
| Build | `dist/popinjay.html` rebuilt |
| Debug errors on capture | 0 |

---

## For the operator to ratify

1. **Hamming-2 floor** — 23 alpha pairs sit at 2 by design; spot-check **H/M**, **K/X**,
   **0/8** on your display if you want extra comfort (they were the pre-fix confusions too,
   but words now read correctly).
2. **Frame crops** — compare `facefix-*` beside `reexam-20260812/01-title-1x.png` and
   `04-controls-crop-1x.png`; the regression should be obvious.
3. **Assumption** — canonical table = pre-fix `3e97ac3` body face (the last face where all
   36 resembled themselves). If you prefer a different reference epoch, resemblance scores
   shift but the method holds.

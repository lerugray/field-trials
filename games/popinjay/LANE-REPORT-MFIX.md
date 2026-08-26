# POPINJAY — F3 M/X lane report (2026-08-12)

Scope: looker catch — F3 **M vs X** measured Hamming **2** (floor is 3), body-copy misreads
(`CLIMB`→`CLIXB`, `COMPOSURE`→`COXPOSURE`, `AMUSEMENTS`→`AXUSEXENTS`, `M7`→`X7`).
Structural all-pairs Hamming floor in `test/px.test.js`. **Not committed or pushed.**

Verification: `node --test` **215/215 green** (214 baseline + structural all-pairs test replacing
the named nine-pair list + looker misread render test). `node scripts/build.js` rebuilt
`dist/popinjay.html`.

---

## Primary fix — M vs X

**Change:** Redrew **X** to a classic diagonal cross (`#.#/.#./#.#/.#./#.#`). **M** unchanged
(twin-peak `#.#/###/.#./###/#.#` from release-fix round).

| Pair | Before | After |
|------|--------|-------|
| **M – X** | **2** | **7** |

**M neighbor re-check** (all other F3 glyphs): every pair **≥ 4** after X redraw; no regressions
on audited H/K/M/W/0/8/2/Z pairs (all still **≥ 3**).

---

## Structural all-pairs floor

**Test:** `every distinct F3 glyph bitmap pair differs by at least 3 lit pixels (Hamming floor)`

- Iterates **every unique 3×5 bitmap** in `F3` (53 codepoints → **50** distinct shapes; `-` / `–` / `—`
  share one bitmap by design).
- **1,225** unordered pairs; **minimum Hamming 3**; **0 failures**.
- Replaces the hand-maintained nine-pair list so **M/X cannot slip through** again.

---

## Other pairs fixed (same pass)

Redrawing X alone left **35** unique-bitmap pairs below the floor. To make the structural test
green, **32 additional glyphs** were adjusted (letters, digits, punctuation) while preserving
3×5 shape validity and the release-fix audited pairs.

| Category | Glyphs redrawn |
|----------|----------------|
| **Letters** | B C D E F G I K O P Q R S T U Y Z |
| **Digits** | 3 4 7 8 9 |
| **Punctuation** | `.` `,` `:` `!` `/` `'` `(` `+` `%` `·` `=` |
| **Primary** | **X** |

**Not redrawn:** A H J L M N V W (plus digits 0 1 2 5 6, space, `-`/`–`/`—`, `x`, `)`).

---

## Rendered-frame evidence

**Captures** (1440×900 @1x, beside looker batch):

| File | Surface |
|------|---------|
| `docs/proofs/fixround-looker-20260812/mfix-title_1440x900@1x_20260812-084437.png` | Title card — controls **CLIMB**, footer **BUILD M7**, **EXPOSITION AMUSEMENTS CO.** |
| `docs/proofs/fixround-looker-20260812/mfix-hud-composure_1440x900@1x_20260812-084437.png` | In-run HUD — **COMPOSURE** label |

**Buffer read** (`node scripts/mfix-read.mjs` — F3 pixels after `t3()`):

| String | M/X positions | Painted glyph |
|--------|---------------|---------------|
| CLIMB | M@3 | M (`#.#/###/.#./###/#.#`) |
| COMPOSURE | M@2 | M |
| AMUSEMENTS | M@1, M@5 | M, M |
| M7 | M@0 | M |
| EXPOSITION AMUSEMENTS CO. | X@1, M@12, M@16 | X, M, M |

**Regression test:** `rendered F3 body copy no longer confuses M with X (looker misreads)` —
CLIMB/CLIXB, COMPOSURE/COXPOSURE, AMUSEMENTS/AXUSEXENTS, M7/X7, BUILD M7/BUILD X7, and full
footer string pairs all **< 88% lit-pixel overlap** on the native buffer.

---

## Suite count

| Metric | Value |
|--------|-------|
| Baseline (release-fix lane) | 214 |
| Structural all-pairs test | replaces named nine-pair test (net 0) |
| Looker misread render test | +1 |
| **Total passing** | **215** |
| Build | `dist/popinjay.html` rebuilt |

---

## For the operator to ratify

1. **Wide glyph pass** — 33 F3 glyphs moved to satisfy the global floor; spot-check letterforms
   (especially B, G, O, punctuation) on your display at 1440×900.
2. **Frame captures** — confirm title + HUD crops read correctly to your eye; buffer probe +
   overlap tests pass headless.

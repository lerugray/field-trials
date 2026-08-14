# M2 EXIT GATES — committed + measured

The three M2 exit gates from DESIGN-SEED, committed as constants (`src/tuning.js`,
`src/palette.js`) and MEASURED by runnable probes (`src/baseline.js`, `src/legibility.js`).
Re-run any time: `node scripts/gates.mjs`. Asserted in the suite:
`test/baseline.test.js`, `test/legibility.test.js`.

Measured 2026-08-09 (`node scripts/gates.mjs`):

## Gate 1 — auto-resolution baseline curve

Committed target bands (`TUNING.winRateBands`) and measured auto-win rates over 2000 seeded
fights per tier with the default comp (Bailiff / Chirurgeon / Surveyor / Sumpter):

| Tier | Target (seed) | Committed band | Measured | Avg rounds |
|---|---|---|---|---|
| routine | 90–95% | 88–97% | **94.7%** | 5.6 |
| elite | 40–60% | 38–62% | **54.4%** | 6.7 |
| boss | <15% | 0–16% | **11.5%** | 7.7 |

All in band. **M3 tunes the tarot deck against THIS baseline** — cards must convert the
elite/boss gap without pushing routine out of band (routine stays card-optional). Enemy tier
strength lives in `TUNING.encounterTiers` (routine ×1.44, elite ×1.62, boss ×3.4).

## Gate 2 — job-comp degeneracy sweep

All 15 comps of 4 (from the 6-job roster) run over one fixed seeded ladder
(routine→routine→elite→routine→elite→boss, no recovery); score = mean fraction of the ladder
cleared before a wipe (500 seeds/comp).

- median **0.236**, best **0.283**, spread **19.7%** — under the committed margin (50%).
- **No degenerate comp** (none exceeds the median by >50%).
- Trap-tier flagged (below 60% of median): the no-Chirurgeon comps
  `bailiff/almoner/notary/sumpter`, `bailiff/surveyor/almoner/sumpter` — i.e. comps without
  the strong single-target healer underperform. A sensible, non-degenerate signal.

The build stays balanced: no comp is a must-pick, and the weak comps are legibly weak (not
silently trap). Margin/floor live in `TUNING.degeneracyMargin` / `degeneracyFloor`.

## Gate 3 — measured legibility

- **Contrast (WCAG, `src/legibility.js`):** every colour used as small body text clears
  4.5:1 on its background; every interactive UI edge + state-bearing bar clears 3:1. ALL
  PAIRS PASS. Decorative container borders (`PALETTE.rule`) are the documented 1.4.11
  exemption. (Palette re-tuned at M2: `stamp` and `faint` brightened, an `edge` colour added
  for interactive borders.)
- **Non-colour channels (`NONCOLOR_CHANNELS`):** every state distinction is carried by a
  second channel, never colour alone — focus = outline ring; status = bracketed word tokens;
  save = "FILED ✓" + tick; HP = exact numerals beside every bar; reduced frame = faded +
  "(reduced)" label; combat = signed numerals (−12 / +8 / ward); terrain = named bands.
- **Colour-vision-deficiency simulation:** the build applies a CVD colour-matrix filter via
  `?cvd=deuteranopia|protanopia|tritanopia`; proof frames captured under all three
  (`proofs/combat-cvd-*.png`). Every distinction survives because it rides a non-colour
  channel.

## Verdict

`node scripts/gates.mjs` → **M2 GATES: ALL GREEN.**

# Gate 5 — legibility floor, re-measured after the art pass (2026-08-14, M7a)

Gate 5 is a standing gate: it is re-run at every milestone after M6, and the art pass changed every
colour on the screen, so it is re-measured here rather than inherited. Measured on the built
`dist/index.html` in its fixed 640x360 native buffer. Enforced by `test/gate5-legibility.test.js`
and `test/art-stack.test.js`; the numbers below are the measured values.

## What changed since M6

The whole palette. M6 measured five colours against three dark panels. M7a replaced that with a
single curated palette in named ramps (`src/palette.js`), and the ledger became a sheet of aged
manila with dark ink on it, so the screen now has a LIGHT half as well as a dark one.

The gate changed shape to match: it measures `TEXT_PAIRS`, the list of foreground/background
pairings the renderer actually draws. **That is stricter than the M6 form, not looser** — the old
matrix could not see ink-on-paper at all, because before this pass there was no paper.

## Minimum text size

- **Smallest font used: 8px** in the 640x360 buffer (`MIN_TEXT_PX = 8`): the two title-block legend
  rows and the raid strength annotation. Ledger body is 9-10px; headers 9px; panel titles 9-11px.
- At the default integer scale (a 1280x720 window scales the buffer 2x) that is 16px effective.
- Asserted, so no text can drop below 8px in the buffer.

## Contrast (WCAG 2.x contrast ratio), measured over what is drawn

AA-normal is 4.5:1. Every pairing clears it. **Worst measured pairing: 5.19:1.**

| Pairing | Foreground | Background | Ratio |
|---|---|---|---|
| section label on the cutaway | `#b1aa97` | `#08090b` | 8.60:1 |
| section text on the cutaway | `#dad2bb` | `#08090b` | 13.20:1 |
| ledger body ink on paper | `#100f0c` | `#bbac90` | 8.59:1 |
| ledger secondary ink on paper | `#2b2820` | `#bbac90` | 6.60:1 |
| ledger body ink on the paper highlight | `#100f0c` | `#e0d0b4` | 12.64:1 |
| ledger secondary ink on the paper highlight | `#2b2820` | `#e0d0b4` | 9.71:1 |
| ledger body ink on the paper shade | `#100f0c` | `#8f846c` | 5.19:1 |
| stamp ink on paper | `#4c1111` | `#bbac90` | 6.75:1 |
| stamp ink on the paper highlight | `#4c1111` | `#e0d0b4` | 9.92:1 |
| brass figures on paper | `#33270f` | `#bbac90` | 6.55:1 |
| button text on the button face | `#ece4cc` | `#202228` | 12.52:1 |
| cornerstone label on the cutaway | `#4f9287` | `#08090b` | 5.50:1 |
| damage label on the cutaway | `#c07c5f` | `#08090b` | 5.97:1 |
| overlay text on the desk | `#dad2bb` | `#100f0c` | 12.70:1 |

The paper is composed per pixel across three ramp steps (`paper[3]` to `paper[6]`), so the ink is
measured against the DARKEST step the sheet can reach, not against its average. That is the
`paper shade` row at 5.19:1, and it is the floor for the whole screen.

One change was forced by the measurement: the damage/rust label moved from `rust[5]` (4.19:1, a
fail) to `rust[6]` (5.97:1). It is noted in `palette.js` at the line that sets it.

## Text can no longer be clipped by its own panel

Three overflow defects were found by looking at the captures and fixed, because a line cut off by a
panel edge is a number the player cannot read:

- the ledger clips to its sheet and `wrap()` takes a hard floor, so no report line is half-drawn at
  the bottom of the paper;
- the section's title-block legend was shortened to fit inside the cutaway panel;
- button labels are clipped to their own button, and the department tool labels were shortened so
  five controls fit the action bar without spilling across each other.

## Dwell time

- **The administration phase is untimed (the pacing law).** Reading dwell is unbounded: nothing
  resolves until the operator signs the cycle over, and the after-action report persists in the
  ledger throughout the next untimed ADMIN. No countdown appears on any readable surface.
- The incident replay advances at 5 frames per step with a 45-frame end dwell (~0.75s at 60fps) and
  is skippable at any time. It is presentation only and never gates reading.

## Verdict

**PASS.** Minimum text 8px (floor held). Every drawn pairing >= 5.19:1 (floor 4.5:1). Dwell
unbounded on every readable surface by construction. No text is clipped by a panel edge.

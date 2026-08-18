# Gate 5 — legibility floor, measured (2026-08-14, M6)

Measured on the built `dist/index.html` in its fixed 640x360 native buffer. Enforced as a standing
test (`test/gate5-legibility.test.js`); the numbers below are the measured values.

## Minimum text size

- **Smallest font used: 8px** in the 640x360 buffer (`MIN_TEXT_PX = 8` in `src/render.js`: the
  legend line, the department letters, the smallest ledger detail). Body ledger text is 9-10px;
  headers 9px; panel titles 9-11px.
- At the default integer scale (a 1280x720 window scales the buffer 2x), 8px renders at 16px
  effective; at 1x (a 640x360 window) it renders at 8px. The floor is asserted so no text drops
  below 8px in the buffer.

## Contrast (WCAG 2.x contrast ratio)

Text colour on the panel it sits on. AA-normal is 4.5:1; every readable colour clears it.

| Colour | On panel (#16161f) | On cutaway (#101018) | Role |
|---|---|---|---|
| text `#c9c9d6` | 10.96:1 | 11.55:1 | primary ledger + labels |
| text-dim `#8a8a9a` | 5.29:1 | 5.57:1 | secondary prose (lifted from #7a7a8c this pass) |
| warn `#c56b6b` | 4.87:1 | 5.13:1 | alarm figures (low Cornerstone, served notices) |
| corner `#8fb3c9` | 8.09:1 | 8.53:1 | the Cornerstone |
| gold `#b8923a` | 6.17:1 | 6.50:1 | gold seam marker (large element, floor 3:1) |

The single change this pass: **text-dim lifted from `#7a7a8c` (4.27:1) to `#8a8a9a` (5.29:1)** so all
readable text clears the 4.5:1 floor.

## Dwell time

- **The administration phase is untimed (the pacing law).** Reading dwell is unbounded: nothing
  resolves until the operator signs the cycle over, and the after-action report persists in the
  ledger throughout the next untimed ADMIN. There is no countdown on any readable surface.
- The raid replay advances at **5 frames per step** with a **45-frame end dwell** (~0.75s at 60fps)
  before it auto-returns to ADMIN, and it is skippable at any time. The replay is presentation only
  and never gates reading (the report is in the ledger regardless).

## Verdict

PASS. Minimum text 8px (floor held), all readable text >= 4.87:1 (floor 4.5:1), dwell unbounded on
every readable surface by construction.

# GATEFIX LANE ADDENDUM — 2026-08-18

This addendum closes the named evidence gaps left open in the 2026-08-18 release-gate
dossier.

## Step 2 addendum — title footer re-pass

Fresh cold-boot captures were re-run across the dossier's seven viewports in
`step2-coldboot/`. The updated probe now records the footer row geometry directly from
the shipped display font metrics.

- `coldboot.json` now records `titleFooter.gapRows` and `titleFooter.bottomSlackRows`
  per viewport.
- Result: `footerGapRowsEverywhere: true` and `footerBottomSlackEverywhere: true`.
- Measured gap rows by viewport: `900x600=15`, `1280x800=21`, `1366x768=20`,
  `1440x900=24`, `1512x860=23`, `1920x1080=29`, `2560x1440=39`.
- The earlier threshold-calibration note at `1366x768` remains a geometry note
  (`fill = 0.8997` on a slightly-wider-than-16:9 window), not a reopened defect.

## Step 4 addendum — real ladder climb certified

The motion probe was re-run and now stages a real mount onto a live ladder before
capturing the climb strip.

- New strip: `step4-motion/E-climb-ladder-STRIP.png`
- New motion record: `step4-motion/motion.json`
- The climb frames now show a true ascent at fixed `x = 391` while `feetY` falls
  `720 -> 697.5 -> 677.5 -> 657.5 -> 637.5 -> 617.5 -> 597.5 -> 577.5`

This lane therefore closes the motion looker's named climb-pose gap with a real
in-game ladder climb, not a staged idle.

## Collateral + listen surfaces

- Real title capture reused as shelf collateral: `docs/collateral/og-card.png`
  (copied from `step2-coldboot/01-title_1440x900.png` after the footer fix landed)
- Offline listen set rendered to `docs/listen/2026-08-18/`:
  `title-aabb.wav`, `stage-aabb.wav`, `waltz-aabb.wav`, `galop-aabb.wav`,
  plus `MANIFEST.json`

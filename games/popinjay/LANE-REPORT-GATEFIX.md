# LANE REPORT — GATEFIX

## Status

1. Step-2 blocker: **implemented-and-exercised**
   The title footer returned to a safe pitch (`y268` / `y285`), the fresh seven-viewport
   cold-boot sweep re-captured the title, and the new permanent regression battery
   proves both real font-line clearance and positive viewport gap rows.

2. Em-dash scrub: **implemented-and-exercised**
   All five player-facing em-dashes named in the dossier were replaced with ASCII
   punctuation, and a permanent regression test now guards the known strings.

3. Collateral: **implemented-and-exercised**
   `docs/collateral/og-card.png` now comes from the fixed shipped title capture;
   `scripts/build.js` now emits shelf-style OG/Twitter meta; `ATTRIBUTION.md` lists the
   embedded OFL fonts and licence texts; `README.md` now carries an honest hero and
   status section.

4. Climb-pose capture gap: **superseded — see CLIMB ROUND below**
   The prior addendum's "certified" claim was false (no climb render branch; byte-identical
   frames). Corrected in the CLIMB ROUND section.

5. Listen set: **implemented-and-exercised**
   The repo's existing offline renderer was reused with an available local
   `node-web-audio-api` install, and the four current working-tree AABB renders now sit
   in `docs/listen/2026-08-18/`.

## Em-Dash Before/After

- `ONE WIRE — WAIT RETURN` -> `ONE WIRE. WAIT RETURN`
- `Two wire slots — both still walls.` -> `Two wire slots, both still walls.`
- `SAVE VERSION MISMATCH — NEW RUN STARTED` -> `SAVE VERSION MISMATCH. NEW RUN STARTED`
- `SAVE TRUNCATED — NEW RUN STARTED` -> `SAVE TRUNCATED. NEW RUN STARTED`
- `SAVE UNREADABLE — NEW RUN STARTED` -> `SAVE UNREADABLE. NEW RUN STARTED`

## OG Description

`A World's Fair sharpshooter tours postcard stages where every balloon keeps its exact parabola.`

## Verification

- Battery: `285 / 285`, `0` fail
- Build: `dist/popinjay.html` rebuilt successfully
- Determinism: two consecutive rebuilds produced identical SHA-256
  `fe3132ed8a84d295aeb4bc6dce53befb50b1a563e71d0a559f49524e0f7593bd`

## CLIMB ROUND — 2026-08-18

1. Climb render branch: **implemented-and-exercised**
   `drawPlayer()` now paints a dedicated ladder pose (rail grip, tucked launcher, two-frame
   leg cycle keyed to vertical travel). Standing/aiming pose no longer floats up ladders.

2. Regression tests: **implemented-and-exercised**
   `test/player-render.test.js` (+2): climb vs stand pixel diff; climb cycle phase diff.
   Prior test count 285 → **287 / 287** green.

3. Evidence correction: **implemented-and-exercised**
   `docs/verification/release-gate-2026-08-18/CLIMB-POSE-CORRECTION-2026-08-18.md` retracts
   the false "certified climb" claim from `GATEFIX-LANE-ADDENDUM-2026-08-18.md`. Real captures
   staged in `climb-pose-correction-2026-08-18/` (strip + eight tiles + `capture.json`).

4. OG card aspect: **implemented-and-exercised**
   `docs/collateral/og-card.png` regenerated at **1200×630** from the fixed title screen.
   `scripts/build.js` now declares `og:image:width` / `og:image:height` (1200 / 630).

## Notes

- Fresh step-2 captures and footer metrics live in
  `docs/verification/release-gate-2026-08-18/step2-coldboot/`.
- The `1366x768` fill reading remains `0.8997` by window geometry, matching the dossier's
  earlier threshold-calibration note rather than opening a new defect.

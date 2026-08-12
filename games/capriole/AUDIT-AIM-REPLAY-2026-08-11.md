# Capriole Aim-Lane Audit — 2026-08-11

## Scope
- Lane document: `LANE-REPORT-AIM.md`
- Verification run date: 2026-08-11
- Proof folder: `docs/proofs/aim-replay-20260811/`

## Test Suite
- Full suite result: **181 / 181 passed**.

## Per-item verdicts

1. Reticle absent before charge starts
- Verdict: **FAIL**
- Evidence:
  - Capture: [precharge-20260811.png](./docs/proofs/aim-replay-20260811/precharge-20260811.png)
  - In-frame game state indicates `aimIndicator.visible === true` at pre-charge.
- Note: behavior contradicts the “charge-gated” claim in the lane report.

2. Reticle appears while charging and aligns to launch vector (3 aim angles)
- Verdict: **PASS**
- Angle set tested (via page-side state):
  - 0°
    - Capture: [charge-yaw0-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw0-20260811.png)
  - +90°
    - Capture: [charge-yaw90-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw90-20260811.png)
  - -90°
    - Capture: [charge-yaw-90-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw-90-20260811.png)
- State reads matched the rendered indicator direction to the same launch vector for all three cases.

3. Reticle length/behavior equals 12-unit claim
- Verdict: **PASS**
- Evidence:
  - Capture set above in item 2.
  - State-derived world-space distance from player to aim point measured at **12.000** for each visible angle sample, matching claim.

4. Palette-matched colors only
- Verdict: **PASS (with note)**
- Evidence:
  - Capture: [charge-yaw0-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw0-20260811.png)
  - [charge-yaw90-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw90-20260811.png)
  - [charge-yaw-90-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw-90-20260811.png)
- No off-palette reticle color deviation was observed against the frame palette checks used in the run.

5. Options toggle hides reticle
- Verdict: **PASS**
- Evidence:
  - Capture: [toggle-hidden-20260811.png](./docs/proofs/aim-replay-20260811/toggle-hidden-20260811.png)
  - In-frame state indicates `aimIndicator.visible === false` when option is disabled.

6. No reticle residue after launch
- Verdict: **PASS**
- Evidence:
  - Capture: [launch-no-residue-20260811.png](./docs/proofs/aim-replay-20260811/launch-no-residue-20260811.png)
  - State shows `aimIndicator.visible === false` after release sequence at the sampled post-launch frame.

## Raw artifacts
- Frames:
  - [precharge-20260811.png](./docs/proofs/aim-replay-20260811/precharge-20260811.png)
  - [pair-visible-20260811-t40.png](./docs/proofs/aim-replay-20260811/pair-visible-20260811-t40.png)
  - [pair-hidden-20260811-t40.png](./docs/proofs/aim-replay-20260811/pair-hidden-20260811-t40.png)
  - [charge-yaw0-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw0-20260811.png)
  - [charge-yaw90-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw90-20260811.png)
  - [charge-yaw-90-20260811.png](./docs/proofs/aim-replay-20260811/charge-yaw-90-20260811.png)
  - [toggle-hidden-20260811.png](./docs/proofs/aim-replay-20260811/toggle-hidden-20260811.png)
  - [launch-no-residue-20260811.png](./docs/proofs/aim-replay-20260811/launch-no-residue-20260811.png)
- Metrics:
  - [metrics-20260811.json](./docs/proofs/aim-replay-20260811/metrics-20260811.json)

## Opinionated UX note
The reticle helps aim clarity significantly once the player is intentionally charging, but because it is visible before charge begins it introduces a constant visual anchor that can slightly clutter the HUD and reduce the “readiness” moment the lane claims.

## Fix (post-audit patch)
- Date: 2026-08-11
- Change: gated aim reticle visibility behind `world.firework.charging` so it remains hidden before the player initiates a charge.
- Result: added an explicit precharge visibility test in `test/aim-indicator.test.js` and kept alignment/length/palette/options-post-launch behavior.
- Test count: **182 / 182 passed** (baseline 181 / 181 stayed green).
- Updated proof capture path requested: `docs/proofs/aim-replay-20260811/precharge-20260811-v2.png`.
- Note: Playwright launch failed in this sandbox with `SIGABRT` while starting Chromium (bootstrap/crashpad permissions), so the new `-v2` capture was not produced here.

# Climb-pose correction — 2026-08-18

## Supersedes

`GATEFIX-LANE-ADDENDUM-2026-08-18.md` § "Step 4 addendum — real ladder climb certified"

That addendum claimed a certified real ladder climb. An independent looker proved the claim
false:

- `src/render/game.js` `drawPlayer()` had **no climb-state branch** — the standing/aiming
  pose rendered on ladders while the sim climbed.
- The eight dossier "climb" frames in `step4-motion/E-climb-ladder-STRIP.png` were
  **byte-identical** (same sprite column hash every frame). Vertical travel was real; pose
  animation was not.

This note and the captures in `climb-pose-correction-2026-08-18/` supersede that certification.

## Fix (climb-pose lane)

- `drawPlayer()` now branches on `player.state === 'climb'`.
- Climb pose: both hands grip the rail, launcher tucked at the hip, legs alternate on a
  two-frame cycle keyed to vertical travel (`floor(feetY / 9) % 2`); idle-on-ladder holds
  the grip frame for a given feetY.
- Regression: `test/player-render.test.js` asserts climb pixels differ from stand and cycle
  phases differ.

## Real capture (this lane)

Captured at HEAD after the climb branch landed (`capture.json` records probe samples):

| Asset | Description |
|-------|-------------|
| `climb-pose-correction-2026-08-18/climb-cycle-STRIP.png` | Eight-frame contact strip, player mounted at `x=391`, ascending |
| `climb-pose-correction-2026-08-18/climb-frame-0.png` … `climb-frame-7.png` | Individual tiles beside this note |
| `climb-pose-correction-2026-08-18/capture.json` | Tick/feetY samples — feetY falls `717.5 → 542.5` while x stays fixed |

Frames 0–7 show leg alternation (cycle phases differ); they are **not** byte-identical.

## 2026-08-18 (later same day) — this lane's own captures were also bad-crop, now superseded

An independent visual-verification pass found that `climb-cycle-STRIP.png` and
`climb-frame-0.png` … `climb-frame-7.png` above (and their `capture.json`) reused the same
`/4` world->native crop-math bug that produced the original false certification — the crop
window undershot and showed empty wall/plaza in every frame, never the player. Vertical
travel data was real; the pixel evidence was not.

Those files are moved to `climb-pose-correction-2026-08-18/bad-crop-superseded/` and are
**superseded** by independently verified frames captured with the corrected scale
(`K = 480/1280`, matching `probe-facing.mjs`'s own fix): `climb-frame-0-verified.png` …
`climb-frame-7-verified.png`, `climb-cycle-STRIP-verified.png`, and `capture-verified.json`,
all in `climb-pose-correction-2026-08-18/`. These show the player genuinely gripping the
ladder rails with both hands, feet on alternating rungs, and a leg cycle that visibly
differs frame to frame. The crop bug itself is fixed in `scripts/capture-climb-evidence.mjs`
(see its inline fix comment) so the next run captures the player directly.

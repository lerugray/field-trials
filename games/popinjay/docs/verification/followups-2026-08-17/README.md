# Follow-ups verification — 2026-08-17

> **PARTLY SUPERSEDED 2026-08-17 by the reconcile (merge `90ee8c8`).** This record was
> written on the home-PC side, before Ray ruled on the two forks the divergence exposed.
> Two of its rows no longer describe the shipped build:
>
> - **Controller-notice geometry — SUPERSEDED.** `two-overlay-collision.json`,
>   `tower-top-pose.json`, `tower-top-connect-alpha.png` and their two probes measure the
>   *centred see-through banner* (320x28 at y `60..90`). Ray ruled for the **right-corner
>   toast** (220x22 pinned right at y `56`, alpha `0.58`), which clears the player column
>   rather than being seen through — so the pose-inside-the-card measurement no longer
>   applies. Live assertions: `test/overlays.test.js`, "controller notice y-range never
>   overlaps the rehearsal banner" and "…does not occlude a mid-climb pose near the tower top".
> - **Duplicate binding — STILL ACCURATE, and now wider.** The refuse-and-tell behaviour
>   `duplicate-binding.json` records is what shipped. It was additionally extended to
>   **gamepad buttons** (`padBindingConflict`), with `loadBindings` sanitizing profiles
>   poisoned before the guard existed.
>
> `battery.json`'s `279/279` was the home-PC-side figure; the reconciled HEAD is `281/281`.

- `two-overlay-collision.json`: REHEARSAL y `24..53`, controller toast y `60..90`, shared y rows `0`.
- `tower-top-pose.json` and `tower-top-connect-alpha.png`: the complete climbing pose is inside the toast; `236/236` pose pixels remain distinguishable.
- `duplicate-binding.json` and `duplicate-binding-feedback.png`: the second `KeyJ` assignment is refused, Climb-down stays `ArrowDown`, feedback is visible, and `J` moves the cursor `3 -> 2`.
- `battery.json`: baseline `276/276`; final rebuilt battery `279/279`; no audio path changed.

The three `probe-*.mjs` files reproduce the targeted results from the repository root.

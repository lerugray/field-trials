# SWEEP-M10 — final defect sweep

DESIGN-SEED M10 requires "a final defect sweep against the standing QA harness
(fairness harness, currency-integrity fuzz, wingmate-death test, F310 manual pass in
both DirectInput and XInput modes including mid-run disconnect/reconnect)."

The automated half of that sweep is green at scale; the F310 manual pass is a hardware
task only the operator can run, and its checklist is below.

## Automated sweep — CLEAN

Run any time with `node scripts/sweep.js [seedCount]` (default 3000). A 300-seed
subset also runs on every `node --test` as `test/sweep.test.js`, so the harness cannot
silently rot.

Latest run (`node scripts/sweep.js`, 3000 seeds):

```
  ok  fairness over 3000 seeds — 0 failures, worst dead gap 83.7 (bound 100)
  ok  route reachability over 3000 seeds — 0 orphan/dead-end nodes
  ok  determinism over 500 seeds — 0 nondeterministic builds
  ok  boss winnable + fair over 40 seeds x 3 threats — 0 bad fights, slowest 6.0s
  ref currency-integrity fuzz: test/ledger.test.js (4000-step shadow-model)
  ref wingmate-death lifecycle: test/wingmate-lifecycle.test.js (every phase boundary)
SWEEP CLEAN
```

What each line guarantees:

- **Fairness** — no seed produces an unavoidable hit (a clear point exists in the steer
  frame at every station) or a dead content-free stretch. The worst dead gap across
  3000 seeds is 83.7, comfortably inside the 100 bound.
- **Route reachability** — every route node is reachable from the start AND can reach
  the final (no orphan, no dead end), the run-flow fairness contract.
- **Determinism** — the same seed builds a byte-identical level and route, the whole
  seeded-world contract every other guarantee rests on.
- **Boss** — a full simulated fight is winnable and terminates (no unkillable phase)
  across all three threat levels, and every live volley leaves a real dodge lane.
- **Currency integrity** and **wingmate-death lifecycle** are exhaustively fuzzed by
  their own standing tests (a 4000-step shadow-model for the ledger; a forced loss at
  every phase boundary for wingmates) and are cited here rather than re-run.

The full `node --test` battery is **340/340 green**.

## F310 manual pass — OPERATOR TASK (hardware; not automatable here)

The builder runs headless software WebGL and has no physical pad, so this pass is
Ray's. Double-click `dist/stray-squadron.html` with the Logitech F310 connected and
walk the checklist in each switch position:

**DirectInput mode (F310 switch = D):**
- [ ] Left stick steers; the radial deadzone feels right (tune in the options menu if not).
- [ ] Boost / brake / fire / barrel-roll all respond (see the CONTROLS page for binds).
- [ ] Start opens the assist menu; d-pad + face buttons navigate it; ranges adjust.
- [ ] Menu → deadzone / FOV / invert-Y / mute all take effect live.

**XInput mode (F310 switch = X):**
- [ ] Re-verify the same list — axis/button indices differ between modes; confirm both.

**Mid-run disconnect / reconnect:**
- [ ] Unplug the pad mid-level: the ship should coast, not lurch (no stuck inputs); the
      keyboard fallback keeps working.
- [ ] Re-plug: control returns without a reload.

**60 fps confirmation:**
- [ ] The overlay fps reads ~60 on real GPU hardware (the committed proofs are software
      rasterizer, ~12–26 fps — not the target).

Anything that fails here is a tuning/wiring note for the operator to feed back; the
constants (deadzone default, bind defaults, flight feel) are all one-place dials.

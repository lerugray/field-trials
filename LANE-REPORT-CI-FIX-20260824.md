# CI browser-gate lane report — 2026-08-24

Branch: `fix/ci-browser-gates`

The local reproduction used Node 22.22.3 (the available workspace runtime); CI is configured for Node 24.x. Chromium was installed and each game was run through the workflow sequence: dependency install, build, `FT_BROWSER=1 npm test`, and its browser/artifact probe.

## capriole

### Root cause

The game camera and aim state are correct at 1280x800. The probe had a time-of-check/time-of-use race: it waited until the three-tick fire pulse made the aim indicator visible, then allowed the simulation to advance while subsequent state reads and screenshot work ran. On the slower viewport/runner timing the pulse could expire before the assertion snapshot, causing the CI-only `aim=-Z/FAIL`.

### Change

`scripts/probe.js` now invokes the existing probe-only freeze hook in the same browser predicate that recognizes the qualifying frame. All later reads therefore inspect that exact frame. No engine, camera, render, or visual code changed.

### Gate output

Before (CI): module suite `fail 0`; probe `1280x800 ... aim=-Z/FAIL`, while `1440x900 ... aim=+Z/OK`. The unchanged local baseline could pass both sizes, which confirmed the failure was timing-dependent rather than a deterministic camera error.

After: 188/188 tests pass; probe reports `1280x800 ... aim=-Z/OK`, `1440x900 ... aim=+Z/OK`, and `PROBE OK — M1 renders a first-person leap headless.`

Checkpoint: `0c5c19a fix(capriole): freeze qualifying aim probe frame`

## jacquard-index

### Root cause

The CLI correctly derives its root from `import.meta.url` and handles whitespace. The test incorrectly required the repository checkout path itself to contain whitespace. GitHub Actions checks out under a path without spaces, so the test failed before it invoked `build.js`.

### Change

`test/build.test.js` now creates a temporary `jacquard index ...` directory, copies the build script and source tree into it, runs the CLI there, compares the generated artifact with `buildHTML()`, and cleans up the fixture. `build.js` is unchanged.

### Gate output

Before: 273/274 tests pass; `build.js runs as a CLI from a path containing spaces and writes dist` fails at `assert.match(ROOT, /\s/)`.

After: 274/274 tests pass; the artifact smoke boots the exact dist bundle, exercises title/drawer/card/keyboard/undo-redo input with 0 in-game errors and 0 console messages, and exports the F2 debug log.

Checkpoint: `5cd8712 test(jacquard-index): create spaced CLI fixture`

## lines-of-advance

### Root cause

The artifact probe used a stale DOM relationship: from square `m1` it walked to the square's parent and searched for a descendant `[data-id]`, but the square and piece layers are siblings. Piece glyphs intentionally have `pointer-events: none`; square elements are the supported interaction surface. The stale coordinates also described a North arsenal while actually targeting a South infantry on North's turn.

### Change

`scripts/interaction-check.js` now clicks the North infantry's interactive square at `m20`, then its legal one-square destination at `m19`. No board, input, engine, or visual code changed.

### Gate output

Before: build succeeds and 156/156 tests pass; the artifact probe times out after 30 seconds waiting for `[data-coord="m1"]` parent/descendant `[data-id]`.

After: build succeeds, 156/156 tests pass, and the probe prints `Interaction check saved to .../proofs/m2-interaction-2026-08-07.png` and exits successfully.

Checkpoint: `4d8ce5a fix(lines-of-advance): use board squares in interaction probe`

## Scope confirmation

Relative to `main`, code/test changes are limited to the three failing gates listed above. No previously passing game's files were changed. Generated proof images and dependency-install artifacts were not committed.

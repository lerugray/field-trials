# Lane report — House Band Performance-Pass backport, fix round (2026-08-15)

## Result

Fixed the undeclared audio regression on top of the Performance-Pass backport. The
portable kit remains byte-synced to House Band commit
`1cf5c59435188fc52dfea83888767bbe590ad756`, while Popinjay now passes its own room,
crossfade, envelope, and timbre posture explicitly from the app. The inharmonic bell
and the deterministic ordered strum are restored. Authored pitches, rhythms,
melodies, arrangements, voices, track volumes, tempos, and AABB structure were not
changed.

The operator's ear remains the final gate. A corrected listen set is in
`listen/2026-08-15-humanize/`; BEFORE uses the actual pre-round engine and score from
commit `7a0cc5c`, and AFTER uses the current working tree.

## Correction to the round-1 report

The previous report's claim that there was “no deliberate Popinjay-local kit
extension” was false. The old vendored `band.js` carried substantial local tuning:
long fades and retirement, a longer/denser reverb with a hotter return, distinct
voice envelopes and sends, and an inharmonic bell stack. Syncing to the neutral kit
without moving those values to the consumer was a scope breach.

There was no Popinjay-only API that needed to remain in the portable kit. The correct
boundary is now explicit: `src/engine/band.js` stays canonical and
`src/engine/audio-posture.js` owns the game-specific tuning. The kit SHA-256 remains
`90293f0ead06b540c94a5370d28aa4d9d73d5497212eea2f7c47c156af0a48c1`.

## Declared app-level band overrides

`src/app.js` spreads `POPINJAY_BAND_OVERRIDES` into the live `createBand` call. Every
passed override is listed below.

Band/bus values:

| Field | Popinjay value | Neutral value |
| --- | ---: | ---: |
| `reverb.seconds` | 3.4 s | 0.7 s |
| `reverb.decay` | 2.6 | 1.4 |
| `reverbReturnGain` | 0.55 | 0.18 |
| `fadeOut` | 1.1 s | 0.08 s |
| `fadeIn` | 2.2 s | 0.08 s |
| `retireTail` | 4.0 s | 0.75 s |

Voice defaults:

| Voice | Explicit Popinjay fields |
| --- | --- |
| `pad` | `verb .5`, `cut 700`, `sweep 1.5`, `q 1.2`, `det 7`, `vol .10`, `wave sawtooth`, `a 1.2`, `d 1`, `s .7`, `r 2` |
| `drone` | `verb .25`, `cut 320`, `q .8`, `vol .11`, `beat 0`, `wave sine`, `a 2.2`, `d .8`, `s .85`, `r 3` |
| `bell` | `verb .8`, `ratios [1,2.01,3.03,4.78]`, `levels [1,.4,.22,.1]`, `vol .07`, `a .006`, `dScale .85`, `s .02`, `r 1.4`, `holdScale .4` |
| `pluck` | `verb .4`, `cut 2400`, `wave triangle`, `a .005`, `dScale .6`, `s .06`, `r .3`, `vol .07`, `holdScale .5` |
| `bass` | `verb .1`, `cut 400`, `q 2.5`, `vol .13`, `wave sawtooth`, `a .02`, `dScale .4`, `s .5`, `r .25`, `holdScale .85` |
| `lead` | `verb .45`, `cut 2000`, `q 1.8`, `wave square`, `vibrato 4.8`, `vibratoDepth .005`, `a .06`, `d .2`, `s .7`, `r .4`, `vol .08` |
| `air` | `verb .5`, `type bandpass`, `bp 500`, `sweep 2.2`, `q 1.4`, `attackScale .4`, `decayScale .3`, `s .7`, `r 1.6`, `vol .05` |
| `snare` | `verb .35` |
| `hat` | `verb .2` |

Gain remains controlled by the player's settings. Lookahead, tick interval, and kick
defaults already match the old values, so they are not overridden.

## Performance-Pass and strum posture

The score-level Performance-Pass remains:

- `humanize.timingMs`: `[0, 6]`
- `humanize.velocity`: `[-0.04, 0.04]`
- `humanize.swing`: `0.04`
- `releaseTail`: `0.25` seconds
- `bass`, `snare`, and `hat`: timing `[0,0]`, swing `0`
- `pluck`: timing `[0,0]`, swing `0`

Pluck timing is neutral in the generic pass because the score again owns the stronger
strum contract: one deterministic seeded hand drag in `[0,5]` ms, followed by a
strictly ascending per-string spread. Title and stage use 3.5 ms, waltz uses 5 ms,
and panic uses 2 ms. Velocity humanization still comes from the canonical kit. The
test now asserts the hand-drag bound, strict ordering, and the 2–5 ms spread for every
emitted chord; it no longer merely checks that timestamps differ.

## Tests and authored-material guard

The required baseline ran before edits:

- Baseline: 30 passing test files, 3 failing test files.
- Final: 30 passing test files, 3 failing test files.
- Failure delta: **0**.
- Focused score/band suite: 22/22 tests pass (up from 21).

The new tests resolve `POPINJAY_BAND_OVERRIDES` over `NEUTRAL_DEFAULTS`, assert the
non-neutral room/tail and bell ratios, require every declared voice override to alter
its resolved voice, verify that live playback spreads the posture at the call site,
and measure the strum property described above. Existing full-cycle structure and
determinism tests continue to pass, so the performance repair did not change the
authored musical skeleton.

The same environment-only failures occurred before and after:

- `test/build.test.js`: its nested `node --check` process is rejected with
  `spawnSync ... EPERM`; the standalone build passes.
- `test/release-fix-ui.test.mjs`: Chromium launch is rejected by the sandbox host.
- `test/title-confirm.test.mjs`: the same Chromium sandbox restriction.

Additional checks:

- `npm run build`: pass; `dist/popinjay.html` built with 27 modules.
- `node test/scoreband.test.js`: 22/22 pass.
- `git diff --check -- . ':!lane.log'`: pass. (`lane.log` was already modified and
  contains pre-existing whitespace errors; it was not edited for this fix.)
- Listen renderer run twice: byte-identical WAV and manifest hashes.

## Corrected listen-set inventory

All WAVs use seed `20260815`, stereo PCM16 at 44.1 kHz, with five seconds retained
after the requested music window so the restored tail can be heard.

- Main theme: `title-before.wav`, `title-after.wav` — 4 passes.
- Main play: `stage-before.wav`, `stage-after.wav` — 8 passes.
- Draft/scorecard: `waltz-before.wav`, `waltz-after.wav` — 8 passes.
- Past-par/finale: `panic-before.wav`, `panic-after.wav` — 8 passes, `heat: 0.75`.
- `MANIFEST.json` records source engine, knobs, durations, sizes, and SHA-256 hashes.
- `render-listen-set.mjs` verifies snapshot provenance before rendering.

The checked-in `before-engine/` snapshot is byte-identical to commit `7a0cc5c`:

- `band.js`: `1d708b80c453df66ef628f8deb08b234d17f09a00a0d222ec525e1b83edf9188`
- `prng.js`: `7944a5137d16c93bae66c093c74cb0a0871a233ff51f559aa29724fe38437161`
- `score.js`: `0fc335798956a67d607a08c89b5aabfedf90bc87c437e3547d85aa782af066c5`

Every BEFORE/AFTER pair has distinct PCM hashes. Unlike the old blind set, BEFORE is
scheduled through the old voice engine with the old score's hand-rolled performance
pass; AFTER is scheduled through the current engine, explicit Popinjay tuning, and
canonical Performance-Pass.

## Checkpoint and limitations

- No push was attempted.
- The coherent fix remains in the dirty working tree, as permitted by the handoff.
- No authored melody or arrangement file was altered beyond restoring performance
  timing behavior in `score.js`.
- The operator listen verdict and Mac/browser verification remain external gates.

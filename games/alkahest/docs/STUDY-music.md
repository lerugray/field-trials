# ALKAHEST M5 audio contract

Date: 2026-08-11

This document pins the M5 score before implementation. The permitted House Band
reference contributes an ARCHITECTURAL PATTERN only: a small code-composed synth
kit, a look-ahead sequencer, a parameter timeline, and named action hooks. No
melody, harmony, rhythm, timbre preset, sample, or other musical expression is
copied. ALKAHEST has no audio assets; every sound is synthesized by WebAudio code
in this repository.

## 1. Register

The room is a candlelit alchemist's bench at night. Its score is struck glass and
glass-harmonica-like partials over a quiet, imperfect clockwork pressure pulse,
with warm filtered room tone underneath. It is not chiptune and it is not ambient
dread. The glass can ring; the clock must keep the player's hands moving.

Each opus act keeps the same authored musical identity while moving its pitch
material and register:

- NIGREDO is low, sparse, and soot-dark.
- ALBEDO opens the intervals and raises the glass voice.
- CITRINITAS adds warm upper partials and a more active escapement.
- RUBEDO compresses the register into urgent red heat without becoming a wall of
  sound.

Title, folio, and end surfaces use the same score at low pressure. A bout is not a
separate canned track: simulation parameters continuously reshape the one score.

## 2. Procedural inputs

The score consumes a small snapshot, never render state:

- `stack`: the highest occupied-row fraction among the live wells.
- `chainDensity`: a decaying memory of recent chain depth and clear breadth.
- `stopTime`: true while a well is frozen by a clear/cascade or top-out grace.
- `danger`: true when the player's well is near death.
- `surface`: title, bout, folio, or end.
- `act`: the current opus act.

The derived parameter contract is monotonic: more stack or chain density never
reduces intensity. Stack is the steady pressure term; chain density adds bright
glass activity. Stop-time mutes the clockwork pulse while extending the ringing
glass sustain, so the bells hang in the silence. It does not merely fire a sting.
Off-bout surfaces cap pressure at a calm level.

Chain density decays continuously over roughly three seconds. A clear gives it a
small lift; a chain link above x1 gives a larger lift proportional to depth; a wide
combo contributes breadth. This makes the score track procedural yield rather
than decorative scene triggers.

## 3. Synth kit and mix

- `glass`: additive inharmonic sine partials with fast contact and long decay.
- `armonica`: close sine partials with a slow swell and slight beating.
- `clock`: a tiny filtered noise tooth plus a low mechanical body, varied by a
  deterministic pattern.
- `slag`: filtered deterministic noise and a short low oscillator.
- `ink`: brief filtered noise for folio actions.
- `room`: a deterministic looping noise buffer through low-pass filtering.

Music, action, room, and reverb buses meet under a conservative compressor and
master gain. The reverb impulse and all noise buffers are deterministically
generated in code. Voice counts and scheduler catch-up are bounded. WebAudio is
created only after a user gesture; an unavailable API fails quietly, while a real
audio runtime error is sent to the visible/exportable debug log.

## 4. Action vocabulary

Every hook is named and independently callable:

- `swap`: two close brass/glass contacts, left then right.
- `clear`: a short descending dissolution of glass droplets.
- `combo`: a simultaneous, broad glass chord. This is distinct from chain.
- `chain`: an ascending ringing bloom whose extent follows link depth.
- `incoming`: a low warning knock when dross enters a receive queue.
- `dross`: a matte falling slag impact when the slab crushes.
- `draft`: page/ink motion followed by one clean glass seal.
- `cast`: a fast rising distillation shimmer.
- `danger`: a bounded two-note warning, rate-limited while danger persists.

`clear` remains present under combo/chain overlays, preserving the base action;
the overlay supplies the distinct learned vocabulary. Player and rival events are
both audible, but simultaneous duplicates are bounded by the director.

## 5. Pinned fixtures

1. `scorePressureMonotone`: stack height and chain density cannot lower intensity.
2. `stopTimeHangsGlass`: stop-time removes clock gain and lengthens glass sustain.
3. `scoreActVoicingsDistinct`: all four acts produce distinct pitch material.
4. `scoreDeterministic`: the same act, step, and params produce identical events.
5. `actionVocabularyComplete`: every required hook plus combo exists.
6. `chainComboDistinct`: chain is sequential/rising; combo is simultaneous/broad.
7. `directorHooksSimulation`: swap, clear, chain/combo, incoming/crush, and draft
   are emitted from changed simulation state, once per event.
8. `audioUnavailableSafe`: boot and score updates remain valid without WebAudio.
9. `singleFileContainsScore`: the built artifact contains the score module and
   boots without external media.


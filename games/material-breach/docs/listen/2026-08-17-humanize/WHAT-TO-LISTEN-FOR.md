# MATERIAL BREACH — the score. Listen set, 2026-08-17 (performance-pass)

**This is a gate, not a delivery.** The builder does not claim the music sounds right. The suite is green and these files rendered. Your ear is the remaining gate.

The authored notes, patterns, form and voicings are the ratified 2026-08-14 score, byte-untouched. What is new is the House Band **performance-pass** grafted onto playback: deterministic micro-timing, velocity shape, a little swing, and longer pad tails. Compare against `docs/listen/2026-08-14-M7b/` if you want the previous render of the same material.

The register is still **LOBBY MUSIC FOR A BUILDING UNDER SIEGE**. Five files, about twelve minutes total, normalised to roughly -16 LUFS.

## Declared knobs (SCORE_PERFORMANCE)

- `humanize.timingMs`: `[0, 8]` (one-sided late; the band does not anticipate the beat)
- `humanize.velocity`: `[-0.05, 0.05]`
- `humanize.swing`: `0.05`
- `releaseTail`: `0.35` s at score level; pad override `0.55` s; drone extra `0` (its authored tail is already three seconds)
- walking bass, kick, snare, hat: timing and swing neutralized so the desk still lands on the beat

All draws are from the band seed plus step/voice/call coordinates. No wall-clock.

## The files, in the order to play them

| # | File | Length | LUFS | What it is |
|---|---|---|---|---|
| 1 | `01-the-lobby-two-full-cycles.mp3` | 3:55 | -16.3 | The main bed, twice through, facility in good order |
| 2 | `02-the-lobby-souring-across-a-tenure.mp3` | 3:55 | -16.3 | The same music curdling from fine to wrong |
| 3 | `03-the-lobby-during-an-incident.mp3` | 1:58 | -16.3 | Pinned fully sour: a raid |
| 4 | `04-tenure-closed.mp3` | 1:49 | -16.3 | The closing cue, after you have lost the building |
| 5 | `05-the-desk-sound-effects.mp3` | 0:13 | -17.9 | The five sounds, one at a time |

The form, the souring, and the desk effects are the same as the 2026-08-14 listen notes. Listen here for whether the humanize layer made the lobby feel played rather than sequenced, and whether the pad chords ring instead of cutting.

## What was measured (not heard)

`node --test`: **197 pass / 0 fail**.

`node scripts/verify-harmony.mjs docs/listen/2026-08-17-humanize`: written chord still sounds in 32/32, 32/32 and 12/12 bars; roots still move. That proves the performance wrap did not rewrite the harmony. It does not prove the performance wrap sounds right.

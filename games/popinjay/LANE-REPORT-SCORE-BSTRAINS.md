# LANE REPORT — POPINJAY second strains (score/b-strains-20260815)

Every track now has a real second strain, alternating across loop passes. `strainAt(n, len, bars)`
is the schedule: `bars` loop-passes of A, then `bars` of B, forever (AABB). Title turns every 2
bars; the others every 4.

## What each B strain does

**TITLE — the trio.** The A strain sits at home (C, I–I–IV–V). B steps down to **F**, the
subdominant, the way a march or a rag trio does, and plays **F – Bb – C7 – F**: a whole strain
away from home, not a transposition. The tuba stops marching on beat 3 and answers itself late in
the bar instead, so the trio lilts; the cornet sings longer, calmer notes; a bell opens the strain
rather than closing it.

**STAGE — the rag strain.** A circles I–IV–V–I. B goes home the long way — **Am – D7 – G – G7** —
a minor turn plus a secondary dominant, and the D7's **F#** is a note the A strain never plays.
The cornet leaves the even upbeats and moves onto the secondary-rag grouping 3+3+3+3+2+2 (steps
0,3,6,9,12,14), and a second snare on 14 lifts the band over the barline.

**WALTZ — its own trio.** A keeps a pedal C2 under all four bars. B walks the root every bar,
**Am – Dm – G – C**, and the melody stops lilting on two beats and flows on all three — twelve
notes developing across the strain, resolving with a chime on the turn back.

**PANIC — the chase.** A stays planted (I–V–IV–V). B walks a descending tetrachord **C3 – Bb2 –
A2 – G2** (an octave up, so a tuba walks it rather than falling off its own bottom) under
**C – Bb – Am – G**, with the cornet doubled to four hits a bar and an extra snare lift. Heat rides
on top of both strains, so structure and pressure stay independent.

**Performance pass.** Chordal parts ring on (`r` 0.42–0.8 vs the abrupt 0.3 default) and are
strummed, not blocked — one drag for the hand plus a small spread across the strings. The cornet
leans late. Drag is one-sided, so nothing can be scheduled into the past; the rhythm section (tuba,
snare, hat) stays dead on the grid. All of it comes from `s.rand` — the band's own seeded PRNG.

## What pins it (test/scoreband.test.js, all on emitted events)

| Claim | Test |
|---|---|
| AABB schedule | `strainAt schedules AABB` |
| B differs, per track — notes **and** bass roots across the whole strain | `SONG STRUCTURE: every track emits a genuinely different second strain` |
| No single-cell repetition (≥3 distinct passes per cycle) | `SONG STRUCTURE: no track is a single repeating cell…` |
| Per-track musical claims above | four named per-track tests |
| Drag one-sided, percussion undragged, velocity varies | `PERFORMANCE: the band drags and lifts…` |
| Longer releases + strum | `PERFORMANCE: chordal parts ring on…` |
| Same seed → identical; new seed moves time/weight only, never the notes | `DETERMINISM: …` |
| No wall clock, no `Math.random` (comment-stripped; stripper self-tested) | `PURITY: …` |

Two of these caught real defects on first run: the panic "descent" was **ascending** in pitch
(Bb2 > C2), and the generic root check was comparing one bar, where both strains legitimately open
on the tonic. Both fixed.

```
ℹ tests 229   ℹ pass 229   ℹ fail 0
```
(baseline 218 + 11 new)

## Honest gaps

- **Nobody has listened to it.** Everything above is verified against emitted note events, not
  against sound. The balance questions — whether the trio sits right against the A strain, whether
  panic's B at high heat (doubled cornet + offbeat bass push, the densest moment in the score) is
  exciting or muddy — are open until someone plays it.
- **No render was produced: this repo has no offline/deterministic audio render path.** No
  `OfflineAudioContext`, no WAV writer; `scripts/capture.mjs` and `photo-analysis.mjs` are visual
  harnesses that only mention audio in passing. Per the brief I did not build one.
- Melody indices are functions of bar and step, so each strain repeats its figure identically every
  cycle. That is correct for the form, but there is no long-form variation above the A/B level.
- Untouched: the SFX map, `trackForMode`, and both A strains' skeletons (deliberately, so the
  existing beat-grid assertions keep their meaning).

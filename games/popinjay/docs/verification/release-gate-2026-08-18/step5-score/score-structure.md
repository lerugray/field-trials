# STEP 5 — Score check (gate run 2026-08-18, HEAD 968b27b)

Song-Structure Law (house-band README): a score needs **multiple distinct parts** — real
arrangement variation; single-cell repetition is a defect. Checked against `src/engine/score.js`
at shipped HEAD, and against the game's own register per DESIGN-SEED §Score
("fairground ragtime/oompah — brisk 2/4 two-steps, tuba-pattern downbeats, bright cornet/clarinet
leads, a courteous waltz for drafts and scorecards, an accelerating galop past par and in the
Panic Finale").

## The structural mechanism

```js
// src/engine/score.js
export function strainAt(n, len, bars = 2) {
  const pass = ...;
  return { pass, strain: ((pass / bars) | 0) & 1, bar: pass % bars };
}
```

`strainAt` maps the absolute step count onto an **AABB** plan and returns which strain is playing
(0 = A, 1 = B) and which bar of it. It is pure — it reads the beat grid, never the audio clock.
Every one of the four tracks branches on `strain` and plays materially different music in B.

## Per track

| Track | Tempo / form | A strain | B strain — what actually differs |
|---|---|---|---|
| **title** (entry two-step) | 104 bpm, len 16, 2-bar strains | I–I–IV–V, tuba alternating tonic/dominant, cornet on the even upbeats, bell CLOSES the strain | **The TRIO**: F–Bb–C7–F — a whole strain away from home (subdominant). Tuba answers itself late in the bar instead of on 3, so the trio LILTS where A marched. A bell OPENS the strain instead of closing it. Separate `TRIO` figure — longer, calmer notes than A's arpeggio. |
| **stage** (the engine of the fairground) | 132 bpm, len 16, 4-bar strains | I–IV–V–I under a cornet lead, tuba OOM on beats, banjo PAH offbeats, snare backbeat | **The RAG strain**: vi–II7–V–V7, circling home the long way round, under a syncopated `RAG` figure carrying the D7's F# as the strain's colour tone. The comment is explicit that the placement changes "are what make it a second strain and not a louder first one". |
| **waltz** (drafts + scorecards) | len 12, 4-bar strains | the courteous waltz, sitting on C throughout, line on all three beats | Moves to the **waltz trio** (Dm colour, `CHORDS` V7/Dm entries), "a completely different placement from the A strain's even upbeats" — B runs where A "lilts and pauses". |
| **galop** (past par + Panic Finale) | len 16, 4-bar strains | the chase, escalating | **B walks DOWN** — so its line starts an octave up to give the tuba room to walk, and the cornet chase figure is **doubled in rate** against A's. |

## Verdicts

- **Multiple distinct parts per track: YES, all four.** Each B strain changes harmony, rhythmic
  placement and melodic figure — not volume. Song-Structure Law satisfied.
- **Register matches the seed**: two-step / rag / courteous waltz / accelerating galop, tuba-and-
  cornet fairground band. Not the House Band kit's origin register.
- **Tooling law held**: `src/engine/band.js` only — code-composed WebAudio, no audio files anywhere
  in the build (0 audio references in `dist/popinjay.html`; confirmed in step 6).
- **Audio never touches the sim**: the band keeps its own PRNG streams, and every gameplay window
  (chain, i-frames, fuse, drip telegraph) is tick-denominated. Structure is pinned on emitted events.
- **Ray's ear ruling is already LOCKED IN** across all four pieces — the humanize round,
  `fd6c250` / `docs/DIRECTIONS-2026-08-16-ear-ruling.md` (2026-08-16).

## Named gap (unchanged from 2026-08-15)

There is **no offline listen set**, because there is no offline render path — the score exists only
as live WebAudio in the running game. Ray hears it in-game at step 9. This is disclosed, not worked
around.

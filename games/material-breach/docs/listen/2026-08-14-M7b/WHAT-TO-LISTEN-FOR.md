# MATERIAL BREACH — the score. Listen set, 2026-08-14 (M7b)

**This is a gate, not a delivery.** The score is closed by your ear, not by the builder. Five files,
about twelve minutes total, all normalised to roughly -16 LUFS so you can play them one after
another without touching the volume.

The register you set is **LOBBY MUSIC FOR A BUILDING UNDER SIEGE**: institutional light music, the
hold music of a facility that is on fire. Everything below is written to that.

**The one thing worth knowing before you press play:** a sibling game failed your ear this morning
for being one chord with texture changes over the top. So this score is written as actual harmony,
and I measured the finished audio to prove it is (`scripts/verify-harmony.mjs`, results at the
bottom). What I could not do is tell you whether it is *pleasant*, whether the joke lands, or
whether it would irritate at minute twenty. That is the whole of what I need from you.

---

## The files, in the order to play them

| # | File | Length | What it is |
|---|---|---|---|
| 1 | `01-the-lobby-two-full-cycles.mp3` | 3:55 | The main bed, twice through, facility in good order |
| 2 | `02-the-lobby-souring-across-a-tenure.mp3` | 3:55 | The same music curdling from fine to wrong |
| 3 | `03-the-lobby-during-an-incident.mp3` | 1:58 | Pinned fully sour: a raid |
| 4 | `04-tenure-closed.mp3` | 1:49 | The closing cue, after you have lost the building |
| 5 | `05-the-desk-sound-effects.mp3` | 0:13 | The five sounds, one at a time |

---

## 1. The lobby — the bed you will hear for the whole game

**Four sections, eight bars each, about 1:58 a cycle. 66 BPM, deliberately slower than instinct.**
The file plays the form twice so you can hear the second pass differ from the first.

**A — THE LOBBY** (0:00) `Fmaj7 | Dm7 | Gm7 | C7` twice.
The pleasant one. Vibraphone on top, electric piano comping off the beat, walking bass, brushes.
This is the music the building is pretending everything is fine to.

**B — THE CORRIDOR** (0:29) `Bbmaj7 | Bbm6 | Fmaj7 | D7 | Gm7 | C7 | Am7 | D7`
Bar 2 is the whole character of this section: the major chord slides to minor underneath itself,
which is the standard lounge sigh. A quiet flute-ish lead joins here and nowhere else.

**C — THE MEZZANINE** (0:59) `Gm7 | Gbdim7 | Fmaj7 | Em7b5 | Ebmaj7 | Dm7 | Db7 | C7`
**The one to listen for.** The bass walks down one semitone a bar for eight bars — G, Gb, F, E, Eb,
D, Db, C — and lands on the dominant. If any section proves the score has somewhere to go, it is
this one. The brushes drop to half time and the comping thins so the descent is exposed.

**D — THE HOLD** (1:28) `Dm7 | Bbmaj7 | Gm7 | C7`, two bars each.
Half the harmonic rhythm of everything else, no brushes at all, bass in half notes. The section
where you can hear **the fluorescent hum** underneath, which is a fixed low F that sits under every
chord in the game and never moves to accommodate any of them. Ends on a straight cadence home to A.

**On the second pass (from 1:58):** the vibraphone plays an octave up and two beats later, the
comping moves to a different part of the bar, the walking bass approaches its next root from above
rather than below, and the date stamp lands on different bars. Nothing repeats identically.

> **Listen for:** does this stay pleasant, or does it get annoying? Is 66 BPM right, or still too
> quick? Is the vibraphone too present, or not present enough? Does THE HOLD feel like a rest or
> like the music running out?

## 2. The lobby, souring

Same file structure, but the sourness ramps from 0 to 1 across the four minutes. This is what
happens across a tenure as the Cornerstone takes damage, instruments go unanswered and the crew
starts grieving. **The band, the tempo, the form and the chord roots never change.** What changes is
the chord *qualities*: `Fmaj7` becomes `Fm(maj7)`, `Dm7` becomes `Dm7b5`, `C7` picks up a flat nine.
The pad drifts out of tune, the vibraphone's overtones go inharmonic, the filter closes, the hum
gets louder, and the typing gets busier.

The intent is that it never sounds like a different piece of music, only like the same piece going
wrong — the lobby insisting everything is fine, slightly less convincingly each cycle.

> **Listen for:** around 2:00–3:00, is the souring *legible* as souring? And is it too much, or not
> enough? It is one number and trivially retunable in either direction.

## 3. During an incident

Sourness pinned at maximum with the desk typing hard. This is roughly what a raid sounds like,
though in game an incident replay is only a couple of seconds, so you will never hear this much of
it at once. It is here so you can judge the extreme.

## 4. Tenure closed

The same lobby in the parallel minor with the lights off. 54 BPM, three sections of four bars, no
brushes and no desk:

- **E** `Fm(maj7) | Dbmaj7 | Bbm7 | Eb7`
- **F** `Abmaj7 | Gm7b5 | C7b9 | Fm7`
- **G** `Bbm7 | Eb7 | Abmaj7 | C7b9`

It still cadences, and it still goes somewhere — the building is lost, not the institution.

## 5. The desk

Five effects, 2.2 seconds apart: **stamp** (signing a cycle over, answering an instrument),
**drawer** (a document laid on the desk or taken off it), **structural** (distant structural
failure, played when a raid damages the Cornerstone, at the end of the replay rather than at the
moment you sign), **pen** (a works order raised), **refused** (an action the facility declines,
deliberately unsatisfying).

> **Listen for:** the structural failure especially. It is meant to read as something collapsing two
> floors away, heard from a desk, not as an explosion.

---

## What I verified, and what I could not

**Measured from the finished audio**, not asserted (`node scripts/verify-harmony.mjs`). Every bar's
pitch-class content was extracted and matched against the chord the score says should be sounding
there, and against all eleven transpositions of it:

| Render | Written chord is the sounding chord | Roots move | Distinct roots |
|---|---|---|---|
| Lobby, sweet | **32/32 bars (100%)** | 26 of 31 bar changes (84%) | 10 |
| Lobby, fully curdled | **32/32 bars (100%)** | 26 of 31 (84%) | 10 |
| Tenure closed | **12/12 bars (100%)** | 11 of 11 (100%) | 7 |

The curdled row is the one that matters for §10's "curdles rather than changes genre": the root
motion is *identical* to the sweet version, so the score sours without abandoning its progression.

**A note on how that check nearly lied to me.** Its first run reported the closing cue failing at
33%. The cue was correct; the checker was comparing a soured render against sweet voicings. The
altered tones *are* the chord at that sour level. Worth recording because a checker that is wrong in
the pessimistic direction is the kind you believe.

**What no measurement can tell you, and why this file exists:** whether it is nice to listen to,
whether the deadpan lands, whether it wears out. Those are your ear.

---

## If you want changes

Nearly everything here is one number. Tempo, how sour it gets and how fast, the balance of any
instrument, how often the typewriter fires, section lengths, and which sections carry which voices
are all single values in `src/score.js`. Re-render with:

```
node scripts/render-listen-set.mjs
node scripts/verify-harmony.mjs
```

Say what is wrong in whatever words you like ("too busy", "the vibraphone is annoying", "slower")
and it is a retune, not a rewrite.

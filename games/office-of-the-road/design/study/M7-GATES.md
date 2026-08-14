# M7 GATES — Score: code-composed tracks + density probe

DESIGN-SEED M7: *Band-kit tracks in the chiptune/medieval register, wired to
march/town/office/combat/report; density metrics + audio probe (CHP pattern).*
The score is **code-composed WebAudio only** — zero audio files, zero fetches
(hard rule #10). The band kit (`src/band.js`) was ported at founding; `src/score.js`
supplies the tracks.

**Register (Ray's direction, seed §Score):** a Famicom consort — square-ish leads,
plucked courtly figures, processional marches; earnest period music on crude
synthesis. All tracks are D-modal (Dorian/Aeolian). **Weiss authors final score
direction at this milestone** — the tracks below are the builder's first pass,
structurally sound and register-correct, for the operator to ratify or redirect.

## Wiring

`STATE_TRACK` maps every screen to a track; `main.js` creates the band on the
FIRST user gesture (audio requires one — proof/headless boots stay silent),
`start()`s it, and crossfades to `trackForScreen(ui.screen)` every paint. `M`
mutes; a visible `score: <track> (M)` indicator satisfies the loudness law.

| Screen(s) | Track |
|---|---|
| march, route | `march` |
| combat | `combat` |
| camp, shop (town), deck | `town` |
| docket, intake (orientation) | `office` |
| defeat (filed report) | `report` |

## GATE 6 — score density (`node scripts/gates.mjs`)

The CHP audio-probe pattern: each track is run for a full loop against a COUNTING
voice stub (no WebAudio), tallying note events per voice. This measures the
COMPOSITION deterministically, so the score is node-testable
(`test/score.test.js`) and the density is gated.

```
office  64bpm · 32 steps ·  4 notes (0.13/step) · drone+bell
march  108bpm · 32 steps · 25 notes (0.78/step) · bass+lead+pluck
town   100bpm · 32 steps · 22 notes (0.69/step) · pluck+bass+bell
combat 140bpm · 16 steps · 40 notes (2.50/step) · bass+kick+lead+hat+snare · KIT
report  58bpm · 32 steps ·  7 notes (0.22/step) · drone+lead+bell
every track voiced + in-band: PASS · kit is combat-only: PASS · office quietest / combat busiest: PASS
-> SCORE VOICED & DISTINCT (register: Weiss to direct)
```

Health signals asserted: every track produces notes and sits in a musical density
band (0.03–4 notes/step — not silent, not a wall); the drum kit is combat-only
(the road's work rendered as a march-to-work); the office is the quietest bed and
combat the busiest; each track uses period voices (pluck/lead/bell/drone), not a
single test tone.

## Ratify notes (for the operator)

- **The tracks are a FIRST PASS composed structurally** (correct mode, register,
  voice separation, density) but NOT auditioned by ear in this build — the seed
  reserves score *direction* for Weiss. *Lean: keep as a working bed; Ray to set
  the melodies / mood / mix at audition.*
- **Five tracks, one per state** (office/march/town/combat/report) as the seed
  enumerates. Sub-states share (route→march, deck→town, intake→office). *Lean:
  fine; a distinct route/office cue can be added if wanted.*
- **`setParams` intensity is unused so far** — the band supports live intensity
  (e.g. thicken combat as HP falls) without a track restart. *Lean: an easy M7+
  expressivity win; flagged.*
- **Mute is `M`, persisted only in the session** (not the save). *Lean: fine; a
  saved audio pref is a QoL item for M8.*

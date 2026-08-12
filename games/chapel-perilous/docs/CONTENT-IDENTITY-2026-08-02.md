# CHP — Content Identity — Founding Design (2026-08-02, brainstorm round 2)

Locked with Ray 2026-08-02 (second sit-down; companion to
CHARACTER-DESIGN-DRAFT-2026-08-02.md). DESTINATION: chapel-perilous repo `docs/` +
DIRECTIONS pointer when session 2's tree frees. All register text implied here is
[SEED] until Ray's voice pass.

## The run's spine — conspiracy ladder → the Chapel (win-as-ambiguity)

A procedural INITIATION ARC gives every run a direction without a fixed plot:
rumors → lodges → deeper cells → the Chapel's location. Template arc with
procedural filling (same pattern as AN's quest spine): fixed dramatic skeleton,
actors/locations/signs generated per world. Reaching and surviving the Chapel
"ends" a run — **but the game refuses to confirm whether what you learned was
real.** No canonical ending text; the closing register material should be
contradictable by a different run's ending. Pure RAW: initiation, not victory.

The organic path stays open (cf. the stronghold lock in AN): a player who finds
the Chapel without climbing the ladder may enter it — earlier, blinder, at their
peril.

## Hidden exposure — the sanity analog that warps PROSE, not stats

No visible meter. No stat damage. A hidden **pattern-exposure** value rises as the
character sees too much (tail encounters, deep dungeon strata, ladder rungs, certain
artifacts). Its ONLY outputs:

1. **Register-mix drift**: exposure shifts the VC-ported register engine's mixing
   weights — description drifts from Clinical/Lyrical toward Conspiratorial/Ominous.
2. **At high exposure the game occasionally lies** — a description that isn't there,
   a wrong count, a door that "wasn't there before." Rare, seeded, deniable.

The world doesn't hurt you; it stops being trustworthy. Interlocks: FNORD (hidden
stat) may modulate exposure gain or lie frequency — tail design owns the coupling.

## Cities — where the conspiracies live

Dungeons hold the WEIRD; cities hold the PARANOIA. Services exist (shop, inn,
rumor, the mundane) but the identity layer is **lodges, cells, front
organizations**: membership verbs, passphrases, the initiation ladder's rungs,
followers' wants getting fed, and saying the wrong thing to the wrong clerk
mattering. Cities are the social dungeon and PULL's home field.

## Artifacts — named uniques, tail-placed

A small authored set (~a dozen) of NAMED artifacts with register-bearing
descriptions — the "amazing shit" payoff made concrete. Placed by unfair-tail
encounters and deep ladder rungs, never guaranteed per run. Since power = items
(character-design lock), these are the run-defining finds. Authored = data-file
content with [SEED] prose, not engine work.

## Audio — generative ambient, register-keyed

WebAudio-synthesized drones/pulses only (no audio files — hard rule 2 holds).
Character keyed to palette + current register mix + hidden exposure: the sound
gets subtly *wronger* as exposure rises. Audio is the mood system, austere like
the monochrome look. No melody subsystem.

## Bestiary + gallery (locked, brainstorm round 3)

The being roster is load-bearing: with the followers spine, every being is also a
potential party member. Directives:

- **Data-driven roster** at `data/bestiary/*.json`: name [SEED], procedural portrait
  recipe, stats-lite, an **interaction profile** (which verbs bite — overawe/bargain/
  bind/impress — and how), a **want** (upkeep), register hooks.
- **Recruitability: most yes, a sacred few NEVER.** Nearly everything can be won by
  the right statline; a small class (the truly Weird, tail beings, things from the
  Chapel's depths) refuses all verbs. The refusals make the rule feel real.
- **Portrait direction: chunky block-shaded busts** — large-pixel portraits built
  from the existing 0..6 shade ramp, heavy shapes, deep shadows, readable small.
  Cyclopean/DOS-crawler feel. All canvas-drawn, no files (hard rule 2).
- **THE GALLERY (build early):** a dev-facing HTML page rendering every being's
  portrait + data on the monochrome palettes — the operator's art-direction review
  surface (render-and-look before fifty sprites exist) and the art-QA harness for
  all procedural graphics. Grows into an in-game codex later.
- **Initial roster: ~12 beings, full data**, spanning city/overworld/dungeon and
  covering every interaction archetype. Content scales by data afterward.

## Priority note

None of this preempts the M-milestone order or the register-port directive; it
defines what the content LAYER is as the core grows. Natural sequencing: exposure
+ register coupling lands with/after the register port; ladder + cities with M3-
class content work; artifacts + audio last.

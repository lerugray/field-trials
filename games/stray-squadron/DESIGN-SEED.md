# STRAY SQUADRON — design seed (founding contract, 2026-08-05)

Ray's concept, verbatim intent: a streamlined SNES Star Fox — anthropomorphic pilots,
randomly generated each run, structured as a roguelite. Themed procedurally generated level
structure with branching levels; runs earn currency for upgrades at a hub between runs.
Graphics code-generated: "a smooth/deluxe version of the old starfox, blocky but charming —
probably can be done better by Opus than the old SNES engineers." Controller-first. The
commander/briefing figure and player-facing command staff are memorials to Ray's deceased
pets: Leon the cat, Kirby the toy poodle, Cuckoo the childhood beagle.

THE REFERENCE (never a genre): **Star Fox (Nintendo/Argonaut, SNES, 1993)**, with **Star Fox
64's (1997)** quality-of-life folded in — charge shots, barrel-roll deflection, brake/boost,
medals. Characterize and transpose the FORMAT clean-room, per the M1 study; never copy
assets, sprites, or palette bytes. No Nintendo character names, ship names, or exact UI ever
appear in this repo or the game.

## The charm register (law)

SNES-era warmth: blocky-but-charming low-poly forms, heroic squadron energy, a faint
undertone of loss underneath the competence — never foregrounded, never explained. This is
the vibe every surface answers to, mechanics and art alike.

Failing-test questions, asked at every art- or writing-bearing commit:
- **Does it look cheap?** (thin, undersized, placeholder-flat, or fighting the palette lock)
- **Does it feel mean?** (a bark that mocks, a death that's played for cruelty, a memorial
  name used as a punchline)

Both answers must be no before the increment closes.

## Considered and declined

Weiss's register take (2026-08-03) proposed a stoic, scarcity-driven working-operator
register: alternate names FLIGHT LOG / DEAD RECKONING, the memorial cast speaking in clipped
vectors/fuel-state/parts-and-tolerances shorthand, no persistent hub-upgrade economy (a
non-resetting flight-log archive standing in its place). **Ray ruled for the charm register
above instead** — that ruling is this seed's law. Weiss's scarcity register is BENCHED, not
adopted; no later session should silently resurrect its tone, its naming, or its "no
hand-holding" framing. One piece of Weiss's proposal survives on its own merits, independent
of the register question: the permanent flight-log archive as a *system* running alongside
(not instead of) the hub-upgrade economy — Ray settled this explicitly (see M6, "both").

## The memorial cast (law)

The permanent command staff are Ray's own dogs and cat — all three deceased — and they are
never generated, never killed off, and never the butt of a joke. Names are renameable in an
options field (the tribute survives a rename; the mechanic doesn't require the literal
name), default to the real names.

- **Commander Cuckoo** (a beagle, Ray's childhood dog, deceased — classic beagle likeness)
  — briefing officer. Opens every run, reads the sector map, sends the pilot off. Warm, a
  little gruff, absolutely in charge.
- **Leon** (a grey cat, deceased — grey-cat likeness) — intel/comms officer. Sly, dry, reads
  enemy dispositions and sector flavor over the radio mid-run. Leon is the brother of Joey,
  Ray's still-living grey cat; the two looked alike, which is why "grey-cat likeness" is the
  standing visual brief.
- **Kirby** (a brown toy poodle, deceased) — hangar mechanic and hub shopkeep. Fussy about
  the ship, proud of every upgrade, the one who hands over new gear.

**Portrait mandate.** Command-staff portraits (code-generated, like all art) must be
recognizable as THESE SPECIFIC animals — a grey cat for Leon, a brown toy poodle for Kirby,
a beagle for Cuckoo — never a generic cartoon pet. Operator reference photos have already
landed in `reference/` (see `reference/README.md`): `leon-grey-cat.jpg` (Leon himself) and
`kirby-brown-toy-poodle.jpg`. Characterize their portraits from these photos when authoring
M6's hub screen. No photo exists for Cuckoo — his portrait runs on beagle breed/likeness
knowledge (classic beagle likeness) instead. Nothing here blocks M1-M5; the photos only
matter once the hub-portrait milestone (M6) is reached.

**Joey is never a game character.** He is alive; Leon's own photo made a Joey stand-in
unnecessary, but even where one is invoked he is reference material only, never playable.
The memorial roster is exactly Leon, Kirby, and Cuckoo — no more, no fewer.

Their barks are written in the charm register (warm SNES-instructional voice), not Weiss's
declined clipped-operator register. They never appear in danger, are never a rescue target,
and are never a design lever (no "lose Cuckoo" event, ever) — the permanence itself is the
tribute. Generated wingmates (below) are the mortal, mechanical layer this cast stands apart
from.

## The accessibility law

**Ray's ruling, 2026-08-04: accessibility trumps no-hand-holding.** The honest-systems,
no-hand-holding experience is the default; a plainly-labeled, easy-to-reach assist menu sits
on top of it; neither degrades the other. This is a law, not an options-menu afterthought:

- Pause, master mute, reduced-motion/screen-shake reduction, and FOV lock are standing
  player options from the **first playable build (M2) onward** — not deferred to a polish
  pass.
- No color-only coding on lock-on/threat/deflectable states — every state gets a shape or
  icon pairing, color is the accent.
- HUD text clears a stated min-size/contrast floor, audited as a test (M9).
- No stick-plus-button simultaneous-hold requirement without a toggle alternative.
- Flash-intensity cap on explosion/hit VFX, in force before any polish milestone touches
  them, not bolted on after.
- Distress/threat callouts get a visual equivalent (screen-edge indicator or subtitle),
  never bark-audio-only.

M9 is the audit gate that proves this held across the whole build and adds the remapping
menu; the floor itself is live from M2.

## The roguelite structure

**The branching sector map IS the roguelite map.** Star Fox's route chart was already a
branching run structure; here it's seeded-procedural: a handful of themed sectors (asteroid
belt, ocean world, fleet battle, fortress approach, core) assembled from a hand-authored
encounter grammar plus a seed — never a freeform generator. Branch choices happen at level
exit; harder branches are gated by in-level performance (the SF64 medal instinct), and the
gate criteria are visible **during** the level, not only at the summary, so a branch choice
reads as informed, not blind.

**Economy — one currency, both memory layers (Ray's settled call, "both"):**
- **Hub upgrades** (permanent): ship frame, weapon tier, hub facilities. A small fixed set
  to start (hull, blaster, boost/charge), with wingmate contracts as the late-game sink —
  keep the sink; a currency with nowhere to go past the third upgrade is a dead system.
- **The flight log** (permanent, separate from currency): a non-resetting archive of every
  run's outcome — sector reached, medals, wingmates lost, cause of death. It is read, not
  spent; the memorial cast references it between runs. It exists so failure accumulates as
  record, not just as a currency drip.
- Per-run only: consumables, wingmate contracts drawn for that run. Death ends the run,
  keeps both the currency earned and the log entry.
- Difficulty holds through branch-gating and enemy-wave tuning, not stat inflation — the
  baseline ship must clear a clean first run with zero upgrades. Harder branches pay out
  more or pay out uniquely; the easy path is never simply dominant. Unlocks are variety
  (new toys, new patterns), not bigger numbers on the same toy.

**Wingmates vs. the memorial cast.** Wingmates are procedurally generated per run (species,
name, trait, bark voice) and mortal — losing one costs the run their coverage and callouts
for its remainder. v1 wingmate involvement is **narrative distress/rescue beats plus a
passive support bonus only**; live AI-controlled wingmate combat participation (drawing
fire, shooting alongside the player, SF64-style) is a **named cut**, not an oversight — it
is a genuine scope cliff (a second combatant AI on top of everything else) and is deferred
past the stop line.

**Mid-run loadout choice.** At each branch point, the player picks one loadout option from
the currently unlocked pool (a small, single-choice version of the genre's boon-pick beat —
scaled down because it must serve the branch map, not become a separate boon economy).
Orchestrator lean, flagged for Ray's ratify at first review.

**SF64 QoL, all in scope:** charge-shot lock-on, barrel-roll deflection (with a readable
color/shape cue — see the accessibility law), brake/boost meter, wingmate rescue events,
score medals per level. All-range flight is **rail-boss-required, all-range-boss
stretch-only** — cut instantly if it destabilizes camera or controls; it never appears in
regular levels. Somersault/U-turn ships only if all-range survives naturally; it is not a
required maneuver otherwise.

## Controls (law)

Gamepad-first (tested against Ray's Logitech F310 — D-mode, axes 2/3 on Mac), full keyboard
fallback from the first playable build. A live input-debug overlay (axes, buttons, deadzone)
ships from M1; deadzone and invert-Y are exposed as constants/options, a full remapping UI
is not required before M9.

## Audio

No voiced dialogue. Barks are SNES-style scrambled-speech gibberish blips paired with
portrait wiggle, code-generated. Music is **not** code-generated: operator-supplied tracks
(Atmoscapia renders, credited to the pseudonym **Abel Aeolian**) arrive in `assets/music/`
and are the one exemption to the code-generated-assets rule (see `assets/music/README.md`
— same convention as the oddseedz project). The builder wires playback (loop, mute-capable,
bed volume) at M9; it never generates or edits the tracks themselves.

## Streamline law (anti-scope)

No multiplayer, no open-world, no story campaign beyond run framing plus hub barks, no
texture art pipeline (flat colors and dithering only), no all-range normal levels, no
alternate vehicle set-pieces (Landmaster/Blue-Marine analogs — named cut, not an omission),
no live wingmate combat participation (named cut, see above), no attempt to match Nintendo
character names, ship names, or exact UI.

## Our stack (decided)

**Hand-rolled WebGL2, zero third-party dependencies, single-file build** (file://
double-click, rebuilt every milestone — the family machinery proven on Chapel Perilous and
Innsmouth 2000, extended to 3D). No Three.js, no bundler.

Why WebGL over a software-rendered canvas rasterizer: the charm register asks for "smooth/
deluxe blocky" — flat-shaded low-poly triangles, depth-sorted, at a poly budget the SNES
Super FX chip never had, running at a clean 60fps. That is a GPU depth-buffer job. A
hand-rolled JS scanline rasterizer could produce the same picture but spends the build's
riskiest hours reinventing what `gl.DEPTH_TEST` already does for free, for a worse framerate
ceiling — exactly the risk the scoping spec flagged as the single largest build hazard.
WebGL2 raw calls plus a small hand-authored matrix/vector helper module (our own code, same
status as CHP's geometry module — not a vendored dependency) keep the zero-dependency law
intact while buying the performance headroom the register needs.

Rendering substrate is a pass/fail gate before any roguelite system is built on top of it
(M1): flat-shaded triangles, one depth buffer, one simple camera, generated meshes only —
no model importer, no lighting beyond directional-plus-ambient color, no shaders beyond flat
color and a distance fog for draw-limit (itself in-register: the SNES never rendered past a
short view distance either).

Test suite: `node --test` over every engine module that can run headless and seeded — flight
model, collision, encounter-grammar assembly, branch/route state, economy and flight-log
persistence, wingmate lifecycle. Rendering correctness verifies by proof screenshots at
fixed viewports, per milestone, committed under `docs/proofs/`.

## Milestones (build order; each ends battery-green + committed + pushed)

- **M1 — Study + substrate.** First increment: `docs/STUDY.md`, a written clean-room study
  of SNES Star Fox (1993) plus SF64's QoL layer, characterized from general knowledge —
  shape language, palette-count conventions, UI anatomy (radar, health/shield, score,
  lives, lock reticle), mission flow (briefing → sector map → level → boss → results).
  Then: WebGL2 boot, a flat-shaded test object with working depth buffer, seeded RNG, debug
  overlay, keyboard input, gamepad probe with a live input-debug overlay (F310 target).
- **M2 — Rail flight feel.** On-rails camera path, screen-space ship steering with roll/
  pitch tilt, reticle, shot convergence, brake/boost meter, basic obstacles. Pause, mute,
  reduced-motion, and FOV lock ship here — the accessibility law's first gate. Variable-dt
  test coverage on flight/camera from this milestone forward.
- **M3 — Combat loop.** Shooting, enemy waves, hit detection, player damage, explosions,
  score, charge-shot lock-on, barrel-roll deflection with its readable cue. Damage-source
  attribution ("what hit me") ships here as a fairness law, not polish.
- **M4 — Encounter chunks + procedural level.** A seeded encounter grammar assembles a
  level from at least three authored chunk types (enemy wave, obstacle field, rescue/
  pickup beat) with theme colors/props per sector. Headless batch-seed fairness harness
  (no unavoidable-hit or dead-stretch across N seeds) lands here and runs as a regression
  from every milestone on.
- **M5 — Route map + branching run flow.** Branching sector map (3-5 levels for the
  prototype's first complete run; the long-term target is 5-7 once the short run is
  proven), start briefing voiced by Cuckoo, level completion, branch choice with a visible
  in-level medal-pace indicator, route-hint icons before commit, performance gate, medal/
  score summary.
- **M6 — Hub, economy, and the flight log.** Hub screen with Cuckoo/Leon/Kirby portraits
  and barks; one currency; hull/blaster/boost-charge as the base upgrades with wingmate
  contracts as the sink past them; the permanent flight-log archive alongside the currency
  (both, per Ray's settled call — not either/or). Currency-integrity fuzz test across
  abnormal run endings (death mid-boss, refresh, quit): the ledger never double-counts or
  drops.
- **M7 — Wingmates + rescue + loadout choice.** Procedurally generated wingmates (species,
  name, trait, bark voice); narrative distress/rescue beats plus a passive support bonus
  (live combat participation stays the named cut from the seed above); the mid-run loadout
  choice at each branch point. Scripted wingmate-death test at every phase boundary
  (branch choice, run end) — no dangling barks or coverage left behind.
- **M8 — Boss + run climax.** A complete run can end in victory or death via a boss
  encounter with readable telegraphs; rail boss is required, all-range boss is stretch-only
  and cut on first sign of camera/control instability. If all-range ships, its boundary and
  rapid-reversal camera behavior gets a live-watched test, not just a headless pass.
- **M9 — Genre-completeness + QoL gate.** Enumerate and audit the rail-shooter table
  stakes against the build: lock-on/charge shots, barrel roll, wingmate chatter and rescue,
  boss telegraphs, score/medals (all built above — this milestone AUDITS them, it doesn't
  build them fresh), plus an options menu covering reduced-motion, remapping/deadzone/
  invert-Y, and everything the accessibility law promised from M2. Land every gap found or
  defer each with a named reason — no silent gaps. Legibility floor as tests: HUD contrast/
  min-size, no color-only coding, flash-intensity cap, no clipped text at any viewport.
- **M10 — Living world + defect sweep.** Ambient life (hangar chatter, starfield parallax,
  hub-screen idle animation) that never touches game state and respects the reduced-motion
  toggle; a final defect sweep against the standing QA harness (fairness harness,
  currency-integrity fuzz, wingmate-death test, F310 manual pass in both DirectInput and
  XInput modes including mid-run disconnect/reconnect); the final single-file build.

**Stop at M10. Everything further is operator-directed.**

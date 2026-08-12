# CAPRIOLE — design seed (founding contract)

Founded 2026-08-09. Operator: Ray Weiss. Named by the orchestrator per Ray's grant
("as much leverage as you want... and name it"). *Capriole*: the dressage high-leap —
a horse springs straight up and kicks at the apex; from Latin *capra*, goat, the same
root as *caprice*. The name is the game: a playful vertical leap taken for its own sake.
Ray may veto the name at any time before public listing.

## The pitch

A streamlined first-person hop-and-bop roguelite. You are a wind-up clockwork GOAT
ascending the vault of heaven — a stack of procedurally generated floating-island
spheres, bright and flat-shaded the way a 1995 PlayStation dreamed. Double- and
triple-jump between islands (the camera pitches down at the apex so you can see your
landing — the reference's signature move, kept as law), stomp enemies from above,
collect the pods that open each sphere's exit, and draft a "caprice" between spheres
to bend the run. Death files a carnival scorecard; a handful of tickets bank toward
the next attempt. Runs are 15-25 minutes. The joy is falling upward.

Register: **toybox cosmic carnival.** Bright, kind, slightly surreal, never explained.
The sky is friendly; the vertigo is the point. No grit, no irony, no lore dumps.

## References (specific works, never genre — match-reference discipline)

1. **Jumping Flash! (Exact/Ultra, SCE, PSX 1995)** — THE load-bearing reference,
   clean-room: we characterize and transpose its conventions, never its assets, names,
   or characters (no Robbit, no MuuMuus, no SCE trade dress). The conventions we keep
   AS LAW:
   - First-person platforming with **double/triple jump**, where the 2nd and 3rd jumps
     **auto-pitch the camera downward** so the landing spot is visible at apex. This is
     the soul of the game. It ships in M1 or nothing else matters.
   - A **blob shadow directly under the player at all times** — the landing marker that
     makes first-person depth readable.
   - **Bounce-stomp** as the primary attack (landing on enemies), with a modest
     firework-class pickup secondary. Not a shooter: no aim-down-sights, no sprint key,
     no reticle-driven combat.
   - **Collect N pods → the exit opens** as the stage loop; generous airtime; huge
     verticality; bright fogless skies over floating archipelagos.
   - Flat-shaded low-poly look with billboarded enemies — the Star Fox-adjacent
     PSX-launch-era idiom.
2. **Star Fox (SNES 1993) — visual idiom reference only**: confident flat-shaded
   polygons in solid saturated colors, readable at speed, zero texture realism.
3. **Roguelite structure (genre sensibility, no single title)**: run-scoped draft
   choices, death-as-restart, light meta-progression. Strictly bounded: no shop
   economy at v1, no prestige math, no unlock treadmill gating the core verbs.

## The loop (design spine)

- **A run = an ASCENT** through 9 spheres (3 acts of 3; each act's third sphere is a
  boss/elite). Each sphere: procedurally generated floating archipelago; collect 4
  pods; the exit portal opens; leap through.
- **Par time, soft pressure**: no hard timer. Past par, "the fair starts closing" —
  the sky shifts and hazard spawns ramp. Hard timers exist only as a chosen modifier.
- **Between spheres: draft one CAPRICE of three** (run-scoped modifiers: an extra
  midair jump, wider stomp, pod magnet, longer par, glass-cannon trades...). The
  draft is the build agency; ~12 caprices at v1.
- **Death** (HP zero, or falling past the kill-plane below a sphere) **files a
  carnival scorecard** — a causal run report: sphere reached, what killed you, the
  caprice line that shaped it. TICKETS bank on death and buy permanent additions to
  the caprice pool + starting loadouts (light meta; the first run's verb set is
  already the whole game).
- **Session shape**: one ascent 15-25 min; a sphere 90 seconds to 3 minutes.

## Signature-feel laws (binding)

1. **The triple jump IS the game.** Jump heights ~1.5x/2.2x/3.2x of base (tunable in
   tuning.js, but the geometric escalation is law); apex hang generous; air control
   real but not full; camera auto-pitch on 2nd/3rd jump smooth in AND out, with its
   curve in tuning.js. If leaping between two islands is not intrinsically pleasant by
   M1 exit, nothing downstream can save the game.
2. **The landing point is always readable.** The blob shadow projects onto whatever
   surface is below, scales with height, and is contrast-checked (measured luminance
   ratio, sampled positions per sphere). Over the void it fades to a ring on the
   distant cloud floor AND the **landing-ring marker** takes over: a projected marker
   on the predicted landing surface, with a screen-edge arrow when the landing point
   is off-view. The marker is what lets the tilt slider reach 0% without voiding
   law #1 — the LAW is "landing point visible at apex", tilt is one way to satisfy it.
3. **Landing kills.** Stomp resolution favors the player when ambiguous (JF's
   generosity, characterized in the M0 study).
4. **Motion comfort is first-class**: camera-tilt intensity slider (**0-100%** — the
   landing-ring marker keeps law #1 satisfied at 0), FOV slider, invert-Y,
   sensitivity, screen-shake toggle (bounded when on), NO dynamic-FOV kick or speed
   vignette by default, and a **first-boot Standard/Comfort preset choice** — present
   from the milestone that adds look control. The reference famously induced motion
   sickness; the transposition must not.
5. **Auto-pitch blends, never fights.** The tilt is an OFFSET blended onto player
   aim; player look input always wins during the blend; control returns smoothly on
   landing. Curves in tuning.js.
6. **A stomp refunds midair jumps.** Chained enemy-hopping is the reference's core
   joy and the skill ceiling; landing on an enemy resets the jump chain.
7. **Falling off is a toll, not an execution.** Below a sphere's islands, an updraft
   net catches the player, costs 1 HP pip + a few par seconds, and returns them to
   the last grounded island. Death is HP-zero only. Knockback is edge-clamped and
   never chains into the net from i-frame hits. (First-person depth misjudgment must
   not execute the player for using the signature verb.)
8. **Landing generosity**: coyote time (~120ms), edge-snap on near-miss landings,
   stomp resolution favors the player — constants in tuning.js.

## Art law (hard rule — code-generated ONLY; paid-eligible)

ALL visuals are code-generated: Three.js geometry, vertex colors, canvas-generated
billboard/particle textures, procedural gradients. NO image generation, NO asset
packs, NO downloads, NO textures from files. Provenance per
art-provenance-gates-commercial-release: code-drawn keeps this title paid-eligible.

The idiom, as LAWS: flat shading everywhere (no smooth normals, no PBR, no shadows
except the blob); solid saturated colors, 5-7 hue palette PER SPHERE (act-themed,
committed as palette tables); gradient sky with slow decorative floaters (balloons,
rings, drifting shapes); island sides show strata bands; subtle vertex-snap wobble
optional and cheap; generous draw distance — the reference's skies are OPEN.

**The one aesthetic law**: every frame must look like a 1995 PSX dream you
half-remember — flat-shaded, bright, floating in a kind sky. Failing test, asked at
every proof: "does this frame look like that dream, or like a Three.js tutorial?"
Tutorial = defect. Bare grey geometry or default-material anything = placeholder =
defect.

## Score (hard rule on tools, register stated per House Band law)

The **House Band kit** (`src/engine/band.js` + `prng.js`, ported at founding) is the
ONLY audio path — code-composed WebAudio, no audio files, no CDNs. This game's
musical register (its OWN, per the register-neutral kit law): **bouncy toybox
synth-funk** — springy bass-led grooves, bright square/FM-ish leads, major-key
carnival energy, light swing; per-act intensity layers; a gentler music-box take for
the title and scorecard; stomps and pod pickups land ON the beat where cheap.
Extend the kit with new voice types as the register demands. Weiss may author
direction at the score milestone (Ray-approved). SFX are synthesized in the same kit.

## Stack (decided)

- **Three.js, version-pinned and VENDORED** into the repo (no CDN); custom kinematic
  physics (no physics library) on a **fixed-timestep deterministic sim** fully
  separated from the renderer — `node --test` targets the sim with zero WebGL.
- Seeded RNG only (named streams: layout / decor / enemies / caprices); no
  Math.random in game logic. tuning.js holds every gameplay constant with a one-line
  shape/feel comment.
- **Single-file build** (`node scripts/build.js` → `dist/capriole.html`, Three
  inlined, boots from file:// double-click). devDependencies (three, esbuild,
  playwright) are allowed for the toolchain; the SHIPPED artifact is one file.
- Playwright + headless Chromium (SwiftShader) for render probes and the soak; probe
  captures at 1280x800 / 1440x900 committed with dated filenames.
- debuglog module with in-game surfacing (LoA pattern): failures are LOUD; "nothing
  happens" is a banned failure mode.
- Continuous autosave of run state (sphere, HP, caprices, pods) + instant resume;
  save-round-trip determinism probe: serialize mid-sphere, reload, next 500 sim ticks
  byte-identical.

## Milestones (each ends: suite green + probes + committed + PUSHED)

Input floor per milestone: the full game is playable KEYBOARD-ONLY (arrow/WASD look
is period-authentic — the reference shipped before dual analog); mouse-look is an
enhancement. No mouse-only verbs. Menus: keyboard traversal + visible focus.

- **M0 — Study + scaffold.** Clean-room STUDY doc characterizing the reference
  empirically (jump feel: heights, hang, tilt curves from footage/documentation; pod
  counts; stage pacing; enemy archetype roles; what made it motion-sick). Stack
  scaffold: vendored Three pinned, single-file build boots showing a lit flat-shaded
  scene, sim/render separation proven (one `node --test` on sim tick), debuglog,
  named RNG streams, tuning.js, Playwright probe captures a frame headless. No
  gameplay yet.
- **M1 — The Leap.** Movement + double/triple jump + auto-pitch + blob shadow +
  island collision on a handcrafted test archipelago. Feel constants all in
  tuning.js. Probe measures apex heights and tilt angles against the seed's ratios;
  LOOK capture committed; pause menu (Esc) from day one; autosave/resume +
  determinism probe. **Feel gate: the seed's signature-feel law #1, judged on a real
  capture + a scripted hop course.**
- **M2 — The Sky Generator.** Procedural archipelago per sphere with a
  **reachability validator** (jump-physics-aware: every pod and the exit provably
  reachable from spawn given current movement constants); pods + exit portal loop;
  par-time hazard ramp; per-sphere palettes; generation property tests over N seeds
  (reachable, no island overlap, bounded extents, pod spacing).
- **M3 — Bounce + Bestiary.** Stomp resolution + damage/knockback/i-frames; 4 enemy
  archetypes (billboarded, code-drawn: a drifter, a turret-flower, a hopper, a
  swooper); firework-pickup secondary; first boss (act-1 gate). **Action-legibility
  law from the first mechanic**: every hit, stomp, death, pickup, and damage taken
  has a visible + audible-hook representation the moment it works.
- **M4 — The Ascent.** 9-sphere run structure with act difficulty ramp; caprice
  draft (12 caprices v1, each one-line legible); death → carnival scorecard (causal:
  sphere, cause, the caprice line) → tickets bank → light meta unlocks; full
  save/resume anywhere in the run.
- **M5 — The Look + The Score.** Full visual pass to the aesthetic law: act
  palettes, sky decor, title screen, HUD in register, PSX flourishes; House Band
  score per the stated register wired to title/sphere/boss/scorecard + synthesized
  SFX pass. **Opus looker with an idiom checklist judges committed captures** (does
  the frame pass the dream test? is any surface default-material grey?); colorblind
  sim over the HUD.
- **M6 — Genre-completeness + QoL audit.** Enumerate FP-platformer + roguelite
  table-stakes (options: sensitivity/FOV/invert-Y/tilt-intensity/volume; run
  history + best-ascent stats; kill/pickup acknowledgement; pause/help/controls
  screen; death recap legibility; a "how to play" that fits on one screen), audit
  the build, land or defer-with-reason each. Accessibility floor: text contrast +
  no clipped text at both viewports; motion-comfort defaults conservative.
- **M7 — Acceptance battery + soak.** Scripted player-path soak driving the SHIPPED
  single-file artifact through ≥2 full ascents via real input events (never engine
  calls): jumps, stomps, pod collection, draft picks, a death, a resume; error traps
  armed; any pageerror/stall/dead control = not staged. Automated acceptance dossier
  (BLOCKER / DEFECT / FRICTION); blockers fixed before staging. **STOP at M7.
  Everything further is operator-directed.**

## Studio edge-sweep fold (2026-08-09 — BINDING; five opus roles attacked this seed pre-launch)

These decisions carry the same force as the sections above and resolve every gap the
sweep confirmed. Where they touch a milestone, that milestone's scope includes them.

### Systems (close the loops the sweep found open)

- **Win condition**: clearing sphere 9 = a VICTORY scorecard (same causal format),
  banks tickets at a premium multiplier, and rolls credits back to title. M4 builds
  the ending with the death flow, not after it.
- **HP economy**: 6 pips. Clearing a sphere restores 1; one generated "breather"
  fountain island per act; boss kill restores 2; caprices may add max/regen. Stated
  as an intent table in tuning.js and tuned against the M7 soak.
- **Enemies are worth fighting**: kills drop SPARKS that feed the par clock
  (+seconds) and pip fragments (3 = 1 HP pip); stomp chains multiply drops. Combat
  serves survival without being mandatory; bosses anchor each act. (The "longer par"
  caprice is CUT — spark drops are the par-relief verb.)
- **Save discipline (no save-scum)**: single run slot; autosave at sphere entry +
  save-on-quit with exact sim state INCLUDING serialized RNG stream positions
  (resume cannot re-roll anything); death deletes the run save after writing the
  scorecard. Suicide-proof, scum-proof.
- **Caprice rules**: pool of 16 at v1; drafted caprices leave the pool (no
  duplicates); act-gated tiers; skip = +1 ticket. Caprices only ever ADD mobility —
  a mobility-reducing caprice is banned by rule (keeps every base-validated sphere
  valid under any build). The pod-magnet idea is CUT; its slot becomes "pods visible
  through terrain" (findability, not traversal-skip).
- **Tickets + the TRUNK**: tickets = spheres cleared (sphere N pays N) + boss
  bonuses + victory multiplier — deep runs strictly beat farming shallow ones.
  Unlocked caprices go into the player's TRUNK; the pre-run pool is a curated
  loadout of up to 16 from the trunk (default auto-fill). Progression = curation
  agency, never pool dilution.

### Wayfinding + HUD (M1-M2, visual pass M5)

- Pods emit thin beacon light-pillars; the opened exit portal emits a taller one;
  HUD edge-arrows point to the nearest uncollected pod. M2's acceptance includes a
  capture showing beacons readable across a full archipelago.
- HUD skeleton lands at M1 (not M5): HP pips, pods x/4, par dial, jump-chain
  indicator (which jump you're on). The par warning is HUD-anchored (dial pulse) —
  the sky shift is atmosphere, never the sole channel.
- Directional damage: screen-rim flash from the threat's direction (M3, with a
  non-flash outline-pulse alternative under the photosensitivity policy).
- **Sphere 1 is a teaching sphere by constrained generation**: authored gap-width
  bands force jump 1 → 2 → 3 escalation before the first enemies; still seeded and
  procedural, never handcrafted.
- Air control decided: camera-relative acceleration at ~40% of ground accel, no
  air-turn penalty, terminal caps — in tuning.js, judged at the M1 feel gate.

### Verification hardening (folds into the stack + milestone batteries)

- The reachability validator **calls the real tick function** (simulated jump
  execution, never closed-form ballistics), enforces an edge-landing margin over
  void, and one seed per N is proven by a bot that actually collects every pod.
  Kill-plane property test: plane sits below min island Y minus margin, all seeds.
- **Determinism**: input-tape replay produces identical sim hashes across 30/60/144
  frame schedules and across machines (home-PC vs Mac at harvest); lint sim/ for
  Math.random / Date.now / performance.now; transcendental use documented.
- **Collision**: swept (continuous) collision for the player; per-tuning-set
  assertion that max per-tick displacement < thinnest collider; fuzzed landings.
- **Pointer-lock reality**: look(dx,dy) is a pure unit-tested function; the M7 soak
  drives the KEYBOARD path end-to-end (Playwright cannot synthesize pointer-locked
  mouse deltas); mouse mode asserts document.pointerLockElement; dead-control
  detection asserts position deltas after every input burst.
- **GPU hygiene**: generated geometry/materials are .dispose()d per sphere; the soak
  asserts renderer.info.memory returns to baseline between spheres; frame-time
  budget stated (60fps at 1280x800 on integrated-class GPU) and measured at LOOK
  milestones; SwiftShader captures are structure-proofs only — idiom judgment and
  the feel gate happen on real-GPU captures (home-PC has the GPU; operator eyes at
  staging).
- **Save fuzz**: resume matrix (mid-air with zero jumps left, mid-i-frames,
  mid-draft) + corrupted/truncated/version-skewed saves fall back gracefully to a
  new run with a LOUD notice.
- **Feel regression**: M1 exports a golden telemetry tape (apex heights, hang times,
  tilt curve); every later milestone asserts the tape within tolerance.
- **Pause/tab-blur**: accumulator clamped (no catch-up death on unpause); pause
  works everywhere including midair, drafts (untimed by law), bosses.
- All proofs run against the SHIPPED dist/capriole.html over file:// (localStorage +
  gesture-gated AudioContext behave differently there).
- Colorblind sim runs over GAMEPLAY frames, not just HUD; enemy identity always
  carries a silhouette channel, never color alone.

### Accessibility floor additions (M3 policy, M6 audit)

- **Photosensitivity policy from M3**: nothing flashes >3/sec; flash-reduce toggle;
  i-frames get an outline-pulse alternative to flicker.
- Full input remapping at M6; text-size floor checked at both viewports with a
  scale option; hold-vs-toggle noted for any sustained input that emerges.
- **"Carnival Rules" assist menu** (M6): stomp-window scale, damage-taken scale,
  par off — player-facing, plainly worded, no shame text.

## Fixed decisions (do not relitigate in-run)

Name (Ray-veto pending), the reference laws, art law, score law + register, stack,
9-sphere ascent structure, soft-par (no baseline hard timer), caprice draft as the
build verb, tickets-not-shops at v1, the STOP line, and every decision in the
studio edge-sweep fold above. Ratify-notes convention: builder
logs assumptions per run under "For the operator to ratify" with leans.

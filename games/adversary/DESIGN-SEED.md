# DESIGN-SEED — ADVERSARY

Founding contract for the gauntlet build. Fired 2026-08-06 from
`state/zombie-hunter-revival/SCOPE-DRAFT-2026-08-04.md` under its 2026-08-05 identity
banner: **the game is ADVERSARY — Ray's own original IP** (lineage: his old NES concept,
materials in `materials/lineage/`). NOT a fan game. The SUNDOWN/Solari/sun-shrine naming
is STRUCK. Zombie Hunter (Famicom 1987) is the PRIVATE mechanical reference only.

Fire-time operator locks (2026-08-06): **art = code-drawn pixel art** (the gpt-image-1
amendment is dead with the homage framing); **commercial posture DEFERRED until first
playable** — build with no monetization assumptions either way.

## THE REFERENCE (match it, never genre defaults)

**Zombie Hunter's shape is the spine**: side-scrolling action-RPG; XP/levels; equipment
drops; six-stage structure with left/right path choices in the middle four stages;
action-menu inventory (Items/Weapons/Equipment/Strength). The reverse-engineering study
is in-repo: `materials/reference/ZOMBIE-HUNTER-STUDY-2026-08-03.md` (memory map, tables,
leveling thresholds, verified RAM map). **Known study gap, bound into M1**: the combat
probe never ran — damage formula, i-frames, knockback, enemy HP, drop/XP rewards are
UNOBSERVED. M1 re-derives combat feel from the study's tables + StrategyWiki-class
documentation, explicitly labeled as re-derivation.

**The modernizing layer (Ray-specified)**: Souls death loop — checkpoint restart, XP
recoverable at a single death marker (dying again forfeits it), equipment ALWAYS retained
(XP at risk, gear never); enemies respawn on death. Plus the combat kit below.

## THE COMBAT KIT (all Ray-named; unlocks are found/earned through the playthrough)

Base melee per equipped weapon (always available) · charged strike (hold) · downward
strike while jumping (downthrust lineage) · full-health projectile · sub-weapon slot on
up+B consuming a resource · d-pad double-tap dodge with SHORT i-frames (a step, not roll
spam). The kit grows Metroid-style across the six stages.

## RAY-LOCKED SPINE ADDITIONS (2026-08-05)

1. **Weapon rarity ladder + rule-bending uniques**: commons/uncommons fill an
   arc/speed/range variety table; ~8-12 NAMED UNIQUES each break one rule of the kit
   (build-changers, never stat sticks). Unique NAMES ship as descriptive placeholders —
   see the naming law.
2. **Campaign + assist toggle + roguelite side mode**: the six-stage campaign is the
   spine; an honest assist toggle (denser checkpoints, XP never drops); an OPTIONAL
   procedural side mode assembled from campaign chunks (scaffold as a late milestone;
   full roguelite restructure is DECLINED).
3. **Equip trap fixed**: starting weapon auto-equipped; bare-hands visually unmistakable
   (empty-hand sprite, feeble thud); unarmed stays a legal challenge-run state, never a
   silent default.

## NAMING LAW (absolute)

Every voice-bearing name — protagonist, checkpoints, stages, uniques, sub-weapons, the
title screen's subtitle — ships as a NEUTRAL DESCRIPTIVE PLACEHOLDER (e.g. "the hunter",
"waypoint", "Stage 3") tagged in one committed `docs/NAMES-PENDING.md` table. **All real
naming is the operator's voice.** The builder never invents flavor names. Dark-Souls-
adjacent THEMES (death-loop melancholy, oblique storytelling) stay where they earn their
place, never as outright references.

## AESTHETIC LAWS

1. **8-bit-plus**: Famicom palette sensibility with modern polish — more animation
   frames, parallax restraint, 240p-ish logical resolution, chunky readable physics.
   NOT a 16-bit reimagining.
2. **Art is CODE-DRAWN pixel art**: sprites/tiles authored programmatically (canvas
   pixel-grid generation) to a true NES-adjacent palette, committed as code + rendered
   sheets. No image-gen, no external assets, no ROM extraction EVER (the ROM is not in
   this repo and never will be; the study characterizes, never copies).
3. **The failing test at every milestone: "does it look cheap?"** Placeholder rects past
   M2 are a defect. Legibility floor: every entity clears readable contrast on every
   ground; text never clips; blocked-vs-walkable readable at a glance.
4. Modern QoL is in-scope: autosave at checkpoints, no lives/continues archaism,
   remappable keys + gamepad.

## STACK (decided)

Vanilla JS + canvas, `src/` modules, build to ONE self-contained `dist/index.html`
(zero-dep, file:// double-click). `node --test` suite; deterministic seeded sim core
testable headless; Playwright smoke for boot + input.

## MILESTONES (each ends battery-green + committed + pushed + PROGRESS.md updated)

- **M1 — STUDY completion + substrate.** Digest the ZH study into `docs/STUDY.md`
  (mechanical inventory with table citations); close the combat gap by labeled
  re-derivation; land the engine substrate: 240p canvas pipeline, fixed-timestep sim,
  input abstraction (keyboard+gamepad, remap scaffold), seeded PRNG.
- **M2 — Player core.** Movement/jump physics tuned to the study's feel notes; melee with
  equip system (auto-equip, bare-hands state); XP/level tables per the study; HUD.
- **M3 — Stage 1 vertical slice.** Tiles/enemies/drops for stage 1; enemy AI patterns;
  the action-menu inventory; a beatable stage with a boss. Code-drawn art at the
  aesthetic bar — this is the "does it look cheap?" gate for the art pipeline.
- **M4 — Souls layer.** Checkpoints, death marker XP recovery (single marker, forfeit on
  second death, never below current level floor), respawn discipline, autosave.
- **M5 — Combat kit + unlock ladder.** Charged strike, downthrust, full-health
  projectile, sub-weapon economy, dodge i-frames; unlock placement across stages.
- **M6 — Stages 2-4 with path choices.** The left/right branch structure per the study.
- **M7 — Stages 5-6 + rarity ladder + uniques.** Full campaign beatable; ~8-12
  rule-bending uniques (descriptive placeholder names).
- **M8 — Assist toggle + side-mode scaffold.** Honest assist options; the procedural
  side mode assembled from campaign chunks (scaffold-grade).
- **M9 — Genre-completeness + QoL gate.** Enumerate the genre's table stakes (death
  flow, save feedback, kill acknowledgement, sound hook points, pause/options); audit;
  land or defer-with-reason. Legibility floor audit.
- **M10 — Defect sweep.** STOP at M10. Everything further is operator-directed.

## HARD LINES

- No monetization assumptions in either direction (posture is the operator's later call).
- ROM/asset extraction: NEVER. The study text is the only reference artifact.
- Ratify notes every run: "For the operator to ratify" — assumptions + builder leans.

## STUDIO SWEEP FOLDS (2026-08-06, pre-fire — BINDING)

Ten-lens pre-fire sweep verdicts, triaged and folded by the orchestrator:

**Economy restored from the reference (the sweep caught an under-transposition):**
- GOLD drops + a VENDOR/REST waypoint between stages (the stage-end ritual; placeholder
  names). Gold is the spend currency and is NEVER at risk on death (Ray's split: XP at
  risk, everything else safe). XP spends on levels only.
- HEALING: consumable items in the Items slot (in-run) + full heal on checkpoint rest.
  VOLUNTARY rest at a checkpoint heals and respawns trash enemies (Souls discipline).
  Bosses NEVER respawn once beaten. "Enemies respawn" = trash only, on death or rest.
- EXPLORATION verbs survive transposition: key/light gating per the study (§1.5, §3.3)
  may gate stage branches; the kit is not combat-only.
- EQUIP-COMPARISON UI (damage/defense delta before equip) per the study's own law §3.4
  — an M2 inventory requirement.
- Boss law: every stage ends in a telegraphed-pattern boss; M3's boss is the exemplar;
  cadence forms the campaign difficulty curve.

**Legibility folds (M2-M5 scope, not deferred):**
- Move discovery: unlock pickup = fanfare + first-use prompt; a MOVE LIST screen exists
  from M5 on.
- Death-marker legibility: HUD indicator toward the marker, XP-at-risk counter visible,
  explicit recovered/forfeited feedback.
- Menu-vs-realtime rule: the action menu PAUSES; sub-weapon is selected in-menu and
  fired with up+B in real time. One rule, stated in the UI.
- Assist toggle lives in the pause menu AND the death prompt, framed neutrally.
- Branch forks are explicit on-screen choices + a simple progress map shows the taken
  path.
- HUD field spec: HP, XP-at-risk, gold, equipped weapon, sub-weapon + resource count,
  charge state. NES-clean, but complete.

**Testing laws (battery-green is defined by these):**
- M1's STUDY lands a NUMERIC FEEL TABLE (jump height/duration, walk speed, i-frame tick
  window, input leniency windows incl. double-tap and charge-hold timings); the sim is
  TESTED against those numbers thereafter.
- "Beatable" = a HEADLESS SEEDED STAGE-CLEAR BOT completes the stage in tests. This is
  the acceptance signal for M3, M6, M7 — not assertion.
- Death-marker edge tests: marker in a pit relocates to last safe ground; markers anchor
  sanely on moving platforms; rapid re-death; marker survives save/reload.
- Saves are ATOMIC (write-then-swap) with a corruption-recovery test.
- Remap persistence test (keyboard + gamepad). Cumulative regression suite: every prior
  milestone's tests keep running.

**Accessibility floor (in the QoL law, not optional):**
- Dodge gets a SINGLE-BUTTON alternative binding; charge gets a toggle option; every
  kit action individually remappable on keyboard AND gamepad face buttons.
- Flash/shake caps + a reduce-effects toggle; color+shape redundancy on pickups/
  telegraphs/hazards; post-scale minimum text size; pause available in EVERY state.
- The assist toggle gains an input-assist axis (longer i-frames, longer leniency) and
  a visual-clarity axis — not just punishment reduction. Assist never changes drop rates.

**Systems guards:**
- The side mode's run state is SANDBOXED — nothing earned there enters the campaign save.
- Uniques carry explicit tradeoffs; M7 includes a scripted weapon-usage probe showing
  commons/uncommons stay situationally competitive.
- M7 includes a grind-rate probe (checkpoint-adjacent farming); the builder proposes
  guards from data (e.g. repeat-kill XP decay) in ratify notes rather than inventing
  policy silently.

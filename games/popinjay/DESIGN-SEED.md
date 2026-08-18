# POPINJAY — design seed (founding contract, v2)

Founded 2026-08-09. Operator: Ray Weiss. Named by the orchestrator per Ray's grant.
A *popinjay* is the parrot-shaped target of the historical shooting-gallery sport
("shooting at the popinjay"), and a vain dandy besides — a fairground word with POP
in its chest. Ray may veto the name at any time before public listing.

v2 same day as v1: five opus studio roles + a Fugu adversarial review attacked the
draft pre-launch; every confirmed gap is integrated below. This file is the whole
contract — there is no amendments appendix.

## The pitch

A streamlined arcade roguelite built on Pang's perfect, never-followed-up core: giant
balloons bounce through a single screen on exact, readable parabolas; your wire climbs
straight up and splits them, big into medium into small into gone, and every split
doubles the pattern you must thread. Transposed: you are the resident SHARPSHOOTER of
a 1900s World's Fair, touring hand-tinted postcard vistas where the ornamental
balloons have gotten loose. Generated stage chains, a souvenir draft between stages,
death prints a scorecard at the prize counter. Runs are 15-20 minutes. The joy is
reading five parabolas at once and standing exactly where you dare.

Register: **hand-tinted exposition poster.** Cream paper, flat lithograph shapes,
bunting and brass, polite period showmanship. Cheerful, never ironic, never grim.

## References (specific works, never genre — match-reference discipline)

1. **Pang / Super Pang (Mitchell Corp., arcade 1989/1990; "Buster Bros." in NA)** —
   THE load-bearing reference, clean-room: characterize and transpose the
   conventions, never the assets or names (no Pang character art, no Capcom/Mitchell
   trade dress, no "Pang" in any string). Conventions kept as law are spelled out in
   the MECHANICAL CONTRACT below; the M0 study characterizes the reference
   empirically before M1 implements.
2. **Roguelite structure (genre sensibility, no single title)**: generated stage
   chains, draft-of-3 between stages, death-restart, light curated meta. Strictly
   bounded: no shops mid-run at v1, no prestige math.

## MECHANICAL CONTRACT (the physics + verbs, pinned — builder ambiguity is a defect)

### Balloons
- **Deterministic elastic physics, exactly periodic**: constant gravity; constant
  horizontal speed per balloon (sign flips only on wall/platform side contact);
  bounce amplitude preserved forever per size class (no energy loss, no air
  resistance, no spin, no randomness in flight). A player who watches one full
  bounce can stand in the safe spot with certainty — **parabolas are promises**.
- **Four size classes**: Grand → Parade → Fair → Penny. A hit splits a balloon into
  TWO of the class below with opposite horizontal velocities and a fixed upward
  kick (exact split kinematics in tuning.js; splits are exactly symmetric). Penny
  balloons pop outright. One Grand = 15 eventual targets.
- **Balloon↔terrain**: balloons bounce elastically off platform tops, sides, and
  undersides (terrain shapes the bounce space); off walls and floor; nothing damps.
  Balloons bounce off INTACT breakable tiles exactly like platforms.
- **Balloon↔player**: any overlap of balloon and player hurtbox costs 1 composure
  heart, triggers i-frames + a small FIXED knockback hop directed away from the
  impact, clamped so it never carries the player off a platform edge or ladder
  (no unchosen displacement into a second hit). During i-frames the player takes
  no contact damage; i-frame time in tuning.js.

### The wire (signature verb — implement EXACTLY this lifecycle)
- Fire → a vertical line grows upward from the player's X **at fire time** (the
  wire does NOT follow the player), at wire-speed px/tick.
- The wire is a line HITBOX, not a surface: balloons touching it POP (split) — they
  never bounce off it.
- On first balloon contact: that ONE balloon splits; the wire despawns the same
  tick. If two balloons touch the wire on the same tick, the LOWER one (closest to
  the muzzle) is the hit — fixture-asserted.
- The wire STOPS at the underside of any platform or intact breakable above the
  player — standing under low cover shortens your wire; this positioning cost is
  the reference's game and is LAW. At the stage ceiling (or blocking underside)
  the default wire despawns immediately on arrival.
- **Single-slot commitment**: while your wire is alive you cannot fire. A denied
  fire is NEVER silent: wire-line shimmer + a polite click + HUD slot flash
  (law: the most common input in the game must teach, not dead-air).
- Breakable tiles: a wire that reaches a breakable's underside BREAKS the tile and
  despawns (the wire is consumed; no balloon pops). Broken tiles are gone for the
  stage. The validator runs terrain checks with breakables in BOTH states (all
  intact AND all broken).
- Fire input is buffered (~150ms): a press during the wire's last moments fires on
  the tick the slot frees.

### The player
- A walker, not an athlete: brisk walk, ladder climbs, no jump. Standing in the
  right place IS the skill. Fire is allowed while standing and while ON a ladder
  (wire fires from current X); walking and firing are simultaneous (one-handed
  play must remain feasible).
- 3 composure hearts baseline; "Deadeye Rules" (one-hit) is a chosen modifier
  only. Restores: +1 on locale clear (overflow converts to 3 prize tickets — no
  wasted heals); souvenir charms per catalog. Centerpieces pay tickets, never
  hearts (no double-counting).

### Drops
- Popped balloons roll on the drops stream: **time-slow** (all balloons at 50%
  for 4s), **freeze** (all balloons halted 2s), **dynamite** (see below),
  **shield** (one absorb, held until hit), **medallions** (score). Weights per
  act in tuning.js; dynamite is rare, never rolls while slow/freeze is active,
  and at most one dynamite is airborne at a time.
- Drops FALL under gravity, land on the surface below, expire after ~8s with a
  blink warning. A drop can never rest inside geometry (probe-asserted); a drop
  whose floor breaks falls to the next surface or despawns.
- Legibility is silhouette-first (distinct shapes readable at arcade speed, color
  never the only channel), with a brief post-pickup banner naming the effect.
- **Dynamite is a telegraphed cascade, not a flood**: on pickup, a 1s visible
  fuse; then all balloons split ONE class step per beat over successive beats
  until everything is Penny. Readable, beat-synced, photosensitivity-bounded —
  both rescue and self-inflicted crisis, never an instant screen flip.

### Stage pressure and completion
- **Stage = clear every balloon** (seeded roster + any drip arrivals).
- **Par + the closing bell**: past par the bandstand tempo rises AND the par dial
  visibly changes state (never audio-only), and drip Pennies enter at telegraphed
  corner markers (1.5s warning, half-speed entry). Drip contract: at most 6 drip
  balloons per stage; spawning pauses while the active-balloon ceiling is
  reached; drip STOPS once the seeded roster is cleared — convergence is
  guaranteed (a stage can never become uncleanable by pressure). Drip targets
  the half of the screen the player occupies (anti-camp).
- The par dial reads as a bandstand clock, not a bomb: its label and the M0-titled
  help line state plainly that par is pressure, not failure.
- Hard timers only as a chosen modifier.

### Score vs tickets (two currencies, never conflated)
- **SCORE** (run-scoped prestige): per-pop values inverted by size (Grand 100 /
  Parade 200 / Fair 400 / Penny 800), chain multipliers x2/x3/x4 inside a
  TICK-DENOMINATED chain window (~90 ticks; the window and its remaining time are
  VISIBLE — a small chain meter, never audio-only), stage-clear time bonus vs
  par. Local best-score table on the title screen (top 10, seed shown).
- **PRIZE TICKETS** (meta currency): earned at the scorecard — see the tour.

## The loop (design spine)

- **A run = a TOUR**: 3 locales × 4 stages, each locale's fourth a CENTERPIECE,
  then the PANIC FINALE. Stage-clear gets its beat: a brief poster stamp
  ("CLEARED — {time} vs par"), and locale transitions play the TOUR MAP
  interstitial (the world-tour map moment is the reference's signature transition
  — a poster map with the route pin advancing).
- **Locales are mechanical acts, not palette swaps**: locale 1 = the pure game
  (teaching constraints, below); locale 2 introduces WIND BANDS (fixed horizontal
  drift zones drawn as bunting streams — deterministic, visible, they shear
  parabolas); locale 3 introduces WEIGHTED GORES (a heavier balloon variant class
  with deeper, faster arcs, distinct silhouette). Both variants obey exact
  periodicity — the promise law never breaks.
- **Centerpieces** are NAMED authored-constraint set-pieces (e.g. "The
  Chandelier", "The Regatta", "The Avalanche" — original names in-register): a
  distinctive seeded configuration + layout grammar with its own poster title
  card. They are the run's quasi-bosses and pass the same validation contract as
  generated stages.
- **Sphere 1 teaching constraints**: stage 1-1 generates with at most Parade-class
  balloons, generous spacing, no breakables, no drip — the wire-as-wall lesson
  must land before density does. Title card prints the controls (file:// has no
  cabinet panel); a first-run hint line teaches fire-commitment on the first
  denied fire.
- **Between stages: draft 1 of 3 SOUVENIRS** (run-scoped, from the pool). Draft
  cards are one glance legible: name + one plain effect line + icon + a small
  "kit" note when it interacts with something held. Drafts are untimed. The
  draft may be DECLINED — declining grants nothing (skip must never be the
  optimal line). Locale-1 drafts always offer at least one weapon-class
  souvenir (bad-luck floor).
- **PANIC FINALE**: survive 90 seconds of escalating balloon rain (Super Pang's
  second invention, kept). Locale interstitials each include a 12-second
  REHEARSAL BURST so the finale's rules arrive taught. Victory = surviving the
  clock → VICTORY scorecard, premium ticket multiplier, credits, unlocks
  Endless Panic from the title screen. The finale's escalation curve is tuned
  so a souvenir-less baseline bot survives at ~40% (probe-measured) — souvenirs
  matter, but a draftless run is never hopeless.
- **Death prints a SCORECARD at the prize counter** — causal: locale/stage,
  what popped you (the culprit balloon is also marked AT the moment of impact:
  ~200ms hit-stop + outline — the lesson lands live, not 15 minutes later),
  souvenirs held, pops, best chain, score, seed (shown + re-enterable on the
  title screen for seed-sharing; a daily seed is a defer-with-reason M6 item).
  The scorecard shows the next trunk unlock as a progress bar (the one-more-run
  hook), in plain type (period type is the frame; the numbers are legible).
- **Tickets bank at the scorecard** (death or victory): stage clears pay their
  locale multiplier (locale 1: 1 each; locale 2: 3 each; locale 3: 6 each),
  centerpieces double their stage, finale survival pays a premium multiplier.
  Payouts are convex by design and the **farm probe is a build gate**: a
  scripted locale-1-suicide loop vs a full-run bot — the full run must earn
  ≥1.5x tickets/minute or the economy constants are wrong (M4 exit gate).
- **Death discipline (scum-proof, atomically)**: single run slot; autosave at
  stage entry with exact sim state INCLUDING serialized RNG stream positions;
  the save is stamped DEAD on the tick HP reaches zero (before the scorecard
  screen renders — killing the process shows the scorecard on next boot, never
  a retry). Quit-anywhere resume; resume can never re-roll anything.
- **The TRUNK (curated meta)**: the player starts owning 12 souvenirs; tickets
  unlock the rest of the 24-souvenir catalog. The pre-run pool is a loadout of
  up to 16 chosen from the trunk — auto-fill offers a curated "recommended
  case" (not all-owned); curation activates as the trunk outgrows the case.
  Progression = curation agency, never pool dilution.

## The souvenir catalog (24 at v1 — ALL strictly additive; a capability-reducing
souvenir is banned by rule, so every validated stage stays valid under any build)

Weapon-class (drafts in locale 1 guarantee one of these): **Second Barrel**
(two wire slots — both still walls), **Sky Anchor** (wire anchors at the ceiling
and persists 4s), **Quick Spool** (wire travels 40% faster), **Gallery Sidearm**
(a 6-shot-per-stage pop-gun on a SECOND button — no wall property, reloads at
stage entry; a sidearm BESIDE the wire, never a replacement: the wire and its
commitment law remain the primary verb), **Long Fuse** (dynamite cascade pauses
1 beat between steps — more room to harvest chains).
Defense: **Shield Charm** (one absorb, recharges each locale), **Plume Hat**
(+1 max heart, filled), **Sure Feet** (+50% i-frame time; no contact damage
while on ladders), **Soft Landing** (no knockback hop), **Opera Cloak**
(post-hit slow-motion beat, 1s at 50%).
Tempo/economy: **Ribbon Chain** (chain window +30 ticks), **Collector's Eye**
(drops fall 30% slower, +15% drop rate), **Season Pass** (+1 ticket per stage
clear), **Centerpiece Medal** (centerpieces pay double), **Long Waltz**
(slow/freeze effects last 50% longer), **Encore** (first death per run: survive
on 1 heart with 3s of freeze — once).
Utility: **Opera Glasses** (ghost apex markers on Grand + Parade arcs — also
the trajectory-hint assist, purchasable as a souvenir), **Fair Warning** (drip
telegraphs 3s early, drips enter at quarter speed), **Tuba Blast** (once per
stage: a shockwave lofts all balloons upward — a panic valve, no damage),
**Bell Credit** (par +15% — paired with the closing-bell upside below),
**Magnet Gloves** (drops drift toward you when below their height),
**Confetti Bonus** (+50% medallion score), **Iron Gores** (weighted balloons
split one class further down — skips Fair), **Punctual** (clearing under par
pays +2 tickets).
(Bell Credit's dead-pick risk is resolved by Punctual + time bonuses: par has
upside, so extending it trades pressure for score. If tuning proves it dead
anyway, cut to 23 — logged as a ratify note, not silently.)

Draft mechanics: drafted souvenirs leave the pool for the rest of the run;
tiers gate by locale (each tier guarantees ≥3 eligible picks at every draft —
act-gating can never produce an invalid draft); duplicates cannot occur.

## Signature-feel laws (binding)

1. **Parabolas are promises** (contract above; feel gate at M1: a capture must
   show a readable 3-balloon interference pattern, and a probe verifies bounce
   periodicity to the tick over 20k ticks WITH terrain present).
2. **The wire is commitment** (contract above; denied-fire feedback is part of
   the law).
3. **Splits are the loudest moment**: pop flash (photosensitivity-bounded),
   paper confetti (density-capped), a brass stab on the beat, the two children
   visibly inheriting opposite arcs. Chain pops escalate the fanfare; chain
   tickets are capped per stage (no printer).
4. **The player is a walker** (contract above).
5. **One screen, always.** No camera, no scrolling. Playfield + HUD frame pass
   the ≥95% screen-fill gate.

## Art law (hard rule — code-generated ONLY; paid-eligible)

ALL artwork is code-generated: canvas shapes, procedural gradients, code-drawn
ornament. NO image generation, NO asset packs, NO downloaded textures. Per the
operator's binding 2026-08-14 register correction, typography uses vendored
OFL-licensed period faces with complete license text beside the font data, baked into
the offline single-file build. Provenance per art-provenance-gates-commercial-release.

The idiom, as LAWS: **hand-tinted lithograph poster** — cream-paper ground, flat
poster shapes with thin ink outlines, 5-6 tint palette PER LOCALE (committed as
palette tables), art-nouveau-leaning HUD frame with bunting, balloons as
ornamental period pieces (stripes, gores, tassels — each size class AND variant
class a distinct silhouette, never color alone). Locale vistas are flat poster
compositions (esplanade + tower, seaside pier, alpine funicular — original, no
real-monument trade dress). Text: a Victorian-Edwardian exposition display face for
the wordmark and headings paired with a highly readable period-compatible text face
for menus, HUD, panels, body, the scorecard, and all numbers; the scorecard and all
numbers also remain readable via the plain-type toggle.

**The one aesthetic law**: every frame must look like a hand-tinted 1900s
exposition poster that happens to be playable. Failing test at every proof:
"would this frame look at home as a period fairground lithograph, or does it
look like a default canvas demo?" Demo = defect. Placeholder shapes standing
where finished art should be = defect.

## Score (hard rule on tools, register stated per House Band law)

The **House Band kit** (`src/engine/band.js` + `prng.js`, ported at founding) is
the ONLY audio path — code-composed WebAudio, no audio files, no CDNs. This
game's OWN register: **fairground ragtime/oompah** — brisk 2/4 two-steps,
tuba-pattern downbeats, bright cornet/clarinet-class synthesized leads, a
courteous waltz for drafts and scorecards, an accelerating galop past par and in
the Panic Finale. Pops and chains land ON the beat where cheap. Extend the kit
with new voice types as the register demands. Weiss may author direction at the
score milestone (Ray-approved). SFX synthesized in the same kit. Split music/SFX
volume controls.

**Audio never touches the sim**: the band keeps its OWN PRNG streams (never the
sim's named streams), and every gameplay window (chain, i-frames, fuse, drip
telegraphs) is TICK-denominated — nothing gameplay-visible reads the audio
clock. Probe: identical input tape with audio enabled vs suppressed produces
identical sim hashes (chain + score included in the hash).

## Stack (decided)

Zero-dependency single-file web build (`node scripts/build.js` →
`dist/popinjay.html`, boots from file:// double-click; evergreen
Chromium/Firefox/Safari), Canvas 2D at 60fps on integrated-class GPUs (frame
budget measured at LOOK milestones; DPR 1 and 2 both captured), `node --test`
suite, fixed-timestep deterministic sim fully separated from the renderer,
seeded named RNG streams (layout / roster / drops / draft — no Math.random in
game logic), tuning.js for every gameplay constant with a one-line shape/feel
comment, debuglog with in-game surfacing (failures are LOUD; "nothing happens"
is banned). Playwright (devDep) for probes + soak against the SHIPPED dist over
file:// — including a localStorage-over-file:// persistence probe with a LOUD
session-only degrade path if the browser denies it. Input: keyboard complete
(walk, climb, fire, sidearm, menus with visible focus) plus W3C Standard Gamepad
(rebindable face/shoulder/d-pad; F310 D-input normalized to the same positions).
No mouse verbs. Keyboard remains the lockout-recovery path if a pad is denied.

## Verification bar (applies across milestones)

- **Generator validation calls the real tick function** — never closed-form:
  spawn-safety (no balloon threatens spawn in the first N ticks AND a safe
  opening fire exists), density ceilings computed by full-split arithmetic on
  the seeded roster PLUS worst-case drip and drops, floor reachability with
  breakables both intact and broken, ladder safety, drip spawns never inside
  geometry. **Clearability is proven by a scripted greedy BOT** (real input
  events) on 1-in-N seeds per act, and par is DERIVED from measured bot clear
  times × a factor — par is feasible by construction. Generation failures
  reroll up to K times then fall back to an authored stage with a LOUD log
  line (never a hang, never a silent dud).
- **Forced-loadout soaks**: the M7 soak runs baseline, wire-build, and
  sidearm-build loadouts (random drafts must not leave the sidearm path
  untested).
- **Collision**: swept-segment tests for wire-vs-balloon at max class speed
  (tunneling is certified absent, not assumed), balloon-vs-thin-breakable
  sweeps, concave-corner fixtures + the 20k-tick amplitude invariant.
- **Tie-case fixture suite** with asserted outcomes: two balloons on one wire
  same tick; a child spawning onto a live wire; dynamite pickup while a wire is
  alive; simultaneous drip entry + ceiling pause.
- **Determinism**: input-tape hashes identical across frame schedules and
  machines; audio-on vs audio-suppressed hash equality; save-round-trip
  (mid-stage, mid-draft, mid-cascade) byte-identical continuation; save fuzz
  (corrupt/truncated/version-skew → graceful new run, LOUD notice); golden feel
  tape from M1 (bounce periods, split velocities, wire travel) asserted within
  tolerance at every later milestone, and tape REGENERATION diffs surface in
  the acceptance dossier (the tape must not self-heal).
- **Beat-sync without audio render**: queued SFX/stab times asserted within
  ±X ms of the band's step grid.
- **Photosensitivity is tested as a COMPOSITE**: worst-case burst sequences
  (dynamite cascade + chains + panic galop + beat-pulsed visuals) pass a
  luminance-delta + flash-rate + flash-AREA analysis over captured frames; the
  3/sec ceiling binds the composite, not per-effect; confetti density capped;
  beat-locked pulses may not track the galop past the ceiling.
- Pause/tab-blur accumulator clamped; pause works everywhere; drafts untimed;
  every stage begins player-gated (press to start — orientation time is the
  player's, not a tick budget).
- Dead-control detection asserts position/fire deltas after input bursts;
  colorblind sim over GAMEPLAY frames (classes/variants by silhouette, drops by
  shape); all proofs against dist over file://.

## Accessibility floor (built per-milestone, audited M6)

Flash-reduce toggle + i-frame outline-pulse (with an accelerating end-warning);
screen-shake bounded + toggleable; first-boot Standard/Comfort preset;
reduce-motion umbrella honoring prefers-reduced-motion at boot; global
game-speed scale (80/90/100%) in the assist tier alongside balloon-speed scale,
composure count, par off, and finale-target scaling — **assists never disable
tickets, unlocks, or victory, and are adjustable from pause mid-run** (parity
declared, not implied); hold-vs-toggle fire and sidearm auto-repeat; ladder
latch option; one-handed preset (walk+fire reachable in one hand); full
remapping at M6; text-size floor + plain-type toggle; par escalation always
visible (dial state), chain window always visible (meter); drip always
telegraphed on-screen before entry.

## Milestones (each ends: suite green + probes + committed + PUSHED)

- **M0 — Study + scaffold.** Clean-room STUDY doc characterizing Pang/Super
  Pang empirically (bounce heights per class, split kinematics, wire behavior
  incl. the under-platform stop, drop tables, scoring/chains, panic escalation,
  world-tour transitions). Stack scaffold: single-file build boots a cream-paper
  title card WITH the control listing, sim/render split proven with one sim
  test, debuglog, named streams (sim) + audio-private streams, tuning.js,
  Playwright captures a frame at DPR 1+2. No gameplay yet.
- **M1 — The Wire and the Balloon.** Player walk/ladder/fire; the FULL wire
  lifecycle law (anchored X, one-pop despawn, under-platform stop, denied-fire
  feedback, fire buffer); one Grand splitting down the full tree on an authored
  stage; exact-physics probe (periodicity to the tick, symmetric splits, corner
  fixtures); HUD skeleton (hearts, wire-slot state, stage, par dial, chain
  meter, tickets); pause; player-gated stage start; autosave/resume +
  determinism probe; golden feel tape exported. **Feel gate: signature laws 1-2
  judged on a real capture + measured probe.**
- **M2 — The Stage Generator.** Constraint-grammar layouts (platforms/ladders/
  breakables with the breakable contract) + seeded balloon rosters; the FULL
  validation contract (real-tick, both breakable states, split-arithmetic
  density incl. drip+drops, safe opening, bot-proven clearability sample,
  derived par, reroll-then-fallback policy); closing-bell drip per the drip
  contract (caps, telegraphs, anti-camp targeting, convergence); locale
  palettes; teaching constraints on 1-1; generation property tests over N
  seeds.
- **M3 — The Arsenal and the Drops.** Souvenir weapon-class implementations
  (Second Barrel, Sky Anchor, Quick Spool, Gallery Sidearm as a second-button
  sidearm, Long Fuse); the drop table with silhouette-first legibility +
  pickup banners + the dynamite cascade; composure hearts + i-frames +
  clamped knockback + 200ms hit-stop with culprit outline; score system
  (per-class values, tick-denominated chain window + visible meter, time
  bonus); action-legibility law from the first mechanic; tie-case fixtures.
- **M4 — The Tour.** 3-locale structure with the mechanical acts (wind bands,
  weighted gores), centerpieces (named set-pieces, same validation contract),
  stage-clear beats + tour-map interstitials + rehearsal bursts; the full
  24-souvenir catalog + draft rules (tiers, floors, decline); Panic Finale +
  Endless unlock + victory flow + credits; death → scorecard (causal, culprit,
  seed, next-unlock bar) → tickets (convex payouts) → trunk curation meta;
  atomic death-stamp save discipline; seed entry on title. **Exit gates: the
  FARM PROBE (full run ≥1.5x tickets/min vs suicide-farm) and the finale
  baseline probe (~40% souvenir-less bot survival).**
- **M5 — The Look + The Score.** Full visual pass to the aesthetic law: locale
  vistas, balloon ornamentation + variant silhouettes, HUD frame + bunting,
  title card, tour map, chain fanfares; House Band score per the stated
  register (two-steps, waltz, galop) wired to title/stage/draft/panic/
  scorecard + synthesized SFX + beat-grid assertion; composite
  photosensitivity analysis; **opus looker with an idiom checklist on
  committed captures** (poster or demo?); colorblind sim on final palettes.
- **M6 — Genre-completeness + QoL audit.** Enumerate arcade + roguelite
  table-stakes (options incl. the full accessibility floor above; run history +
  best-score table; daily seed as land-or-defer-with-reason; pause/help/
  controls on one screen), audit the build, land or defer-with-reason each.
- **M7 — Acceptance battery + soak.** Scripted player-path soak driving the
  SHIPPED dist through ≥2 full tours via real input events across the three
  forced loadouts (walk, climb, fire, sidearm, drafts, a death, a resume, the
  finale); error traps armed; any pageerror, stall, or dead control = not
  staged. Automated acceptance dossier (BLOCKER / DEFECT / FRICTION); blockers
  fixed before staging. **STOP at M7. Everything further is operator-directed.**

## Fixed decisions (do not relitigate in-run)

Name (Ray-veto pending), the reference laws + mechanical contract, art law,
score law + register + audio-sim isolation, stack, 3x4+finale tour with
mechanical acts, composure hearts (one-hit only as a modifier), the drip
contract, score/ticket separation, the 24-souvenir catalog + draft rules
(decline pays nothing), convex payouts + the farm-probe gate, trunk curation,
tickets-not-shops at v1, atomic death-stamp saves, the STOP line. Ratify-notes
convention: builder logs assumptions per run under "For the operator to
ratify" with leans.

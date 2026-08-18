# M0 STUDY — clean-room characterization of the load-bearing reference

**Scope.** This document characterizes the mechanics, physics, and pacing of the
arcade reference (Mitchell Corporation's *Pang* / *Super Pang*, 1989–1990; released
as *Buster Bros.* in North America) **empirically and in the abstract**, so that
POPINJAY's own MECHANICAL CONTRACT (DESIGN-SEED §MECHANICAL CONTRACT) can be
implemented as an *original transposition* rather than a copy.

**Clean-room discipline (CLAUDE.md hard rule 2).** Nothing here is copied: no
sprite data, no level layouts, no audio, no character names, no trade dress. We
characterize *conventions* — the physics model, the verb set, the pacing curve —
which are not themselves copyrightable, then the DESIGN-SEED transposes them under
original names in the exposition-poster register. The reference's proper nouns are
used **only in this study doc** as the named reference; they appear in **no game
string** (no `src/`, no `dist/` artifact). "Pang" is a study-doc word, never a
game-content word.

This study is the empirical grounding; the DESIGN-SEED's MECHANICAL CONTRACT is the
binding law. Where the seed has already pinned a number, the seed wins and this doc
explains *why that shape is faithful to the reference*. Where the reference is
observably one way and the seed is silent, this doc records the observation so M1+
inherits a defensible default rather than an invented one.

---

## 1. The core physics model (balloon flight)

### 1.1 What the eye sees in the reference
A struck sphere in the reference travels a **perfectly periodic parabola**. Watch a
single large sphere for two full arcs and the second arc is indistinguishable from
the first: same apex height, same horizontal reach, same descent. There is no
observable energy loss, no air resistance, no spin, no randomized wobble. A player
who has watched one bounce *knows* where the safe spot is on the next — the reference
is legible precisely because the motion is a promise. This is the single most
important characterization in the document, and it is DESIGN-SEED signature law #1
("**parabolas are promises**").

### 1.2 The model that reproduces it
The motion decomposes into two independent axes:

- **Vertical:** constant downward gravity `g`. On contact with a floor, platform
  top, or (from below) a platform underside, the vertical velocity **reflects with
  its magnitude preserved** — a perfectly elastic bounce. Because energy is
  conserved exactly, the apex height above a given bounce surface is a constant of
  the sphere's *size class*, forever. This is the "amplitude preserved per size
  class" law. The clean way to guarantee bit-exact periodicity is to make each size
  class bounce to a **fixed apex height above its contact surface** and derive the
  launch velocity from that apex + `g` (`v = sqrt(2·g·apex)`), rather than
  accumulating velocity across bounces where float error could drift.
- **Horizontal:** constant speed, magnitude fixed per size class. The **sign flips
  only** on contact with a vertical surface: a side wall, the side face of a
  platform, or the side of an intact breakable tile. Horizontal speed magnitude
  never changes.

**Reference-faithful subtlety (the Fugu §4.16 hole, pinned by the seed):** with
platforms at different heights, "amplitude preserved" must mean *apex height above
the surface it last bounced on*, not a single world-space apex. A sphere bouncing on
a raised platform rises to its class apex **above that platform**; when it walks off
the platform edge it continues its parabola and falls past the platform level to the
next surface below, then bounces to its class apex **above that** surface. The class
constant is (apex-above-contact-surface, horizontal-speed). POPINJAY's tuning.js
encodes exactly these two per-class constants; the sim derives launch velocity from
apex each bounce, so periodicity is exact regardless of terrain height.

### 1.3 Size classes and the split tree
The reference has **four sphere sizes**. A hit on any sphere except the smallest
splits it into **two of the next size down**, launched with **opposite horizontal
velocities** and a **shared upward kick** — the two children visibly inherit mirror
arcs. The smallest size does not split; a hit **pops it outright**.

POPINJAY's four classes (DESIGN-SEED, largest → smallest): **Grand → Parade → Fair →
Penny**. The eventual-target arithmetic that the seed pins as law:

```
Grand  → 2 Parade
Parade → 2 Fair
Fair   → 2 Penny
Penny  → pop (0 children)

One Grand's full descent:
  1 Grand hit + 2 Parade hits + 4 Fair hits + 8 Penny pops = 15 hits ("15 eventual targets")
  Peak simultaneous count from one Grand = 8 Pennies.
```

The split is **exactly symmetric** (the Fugu review flagged asymmetry as a
determinism risk; the seed makes symmetry law). Child A gets `(-vx_child, +kick)`,
child B gets `(+vx_child, +kick)`, spawned at the parent's center. Exact
`vx_child`, `kick`, and per-class apex/speed live in tuning.js (M1 authors the real
numbers; M0 ships the *shape* and the class table).

### 1.4 Collision model, pinned (resolves Fugu §1.15, §4.16)
- **Sphere ↔ floor / platform top / platform underside:** elastic vertical reflect,
  apex preserved above the contact surface. Undersides matter — a sphere can bounce
  down off the underside of an overhang.
- **Sphere ↔ wall / platform side / intact-breakable side:** horizontal sign flip,
  speed preserved.
- **Sphere ↔ intact breakable tile:** bounces **exactly like a platform** (seed:
  "Balloons bounce off INTACT breakable tiles exactly like platforms").
- **Sphere ↔ player:** overlap of sphere and player hurtbox costs 1 composure heart,
  grants i-frames, and applies a **fixed knockback hop away from impact**, clamped so
  it never carries the player off a platform edge or ladder into a second hit
  (seed). During i-frames, contact does no damage.

---

## 2. The wire (the signature verb)

### 2.1 What the reference does
The player fires a vertical line **upward from the player's current x at the instant
of firing**. In the reference the line is a *harpoon/wire* that travels up the
screen; a sphere it touches is **destroyed/split**, and the line then **vanishes**.
Crucially:

- The line **does not track the player** after firing — it grows from the x where
  the shot began. Moving after firing does not move the line.
- The default weapon allows **one line in flight at a time** — you cannot fire again
  until the current line is gone. This single-slot commitment is *the* skill
  expression: you fire, then you are briefly weaponless and must survive on
  positioning. (The reference's other weapon type is a gun that leaves a lingering
  double-height beam; POPINJAY folds "lingering" into the **Sky Anchor** souvenir and
  "two slots" into **Second Barrel** — see §6.)
- The line **stops at the ceiling / underside of cover above the player**. Standing
  under a low platform gives you a **shorter** effective line. Positioning under cover
  to shorten or lengthen your reach is a core spatial decision — the seed makes the
  under-platform stop **LAW**.

### 2.2 The wire lifecycle POPINJAY pins (resolves Fugu §1.16, §1.17, §4.1)
The seed spells the full lifecycle; restating it here as the M1 implementation
target so the study and the contract agree:

1. **Fire** → a vertical line grows upward from the player's x **at fire time**, at
   `wireSpeed` px/tick. The wire is a **line HITBOX, not a surface**: spheres touching
   it POP/split — they **never bounce off it** (Fugu §1.17: the wire is not a
   deflector).
2. **First sphere contact:** that ONE sphere splits; the wire **despawns the same
   tick**. If two spheres touch on the same tick, the **LOWER** one (closest to the
   muzzle) is the hit — fixture-asserted (resolves Fugu §1.18).
3. **Under-platform stop:** the wire stops at the underside of any platform or intact
   breakable above the player. At the stage ceiling / a blocking underside, the
   default wire **despawns immediately on arrival**.
4. **Breakable underside:** a wire reaching a breakable's underside **breaks the
   tile and despawns** (wire consumed, no sphere popped). Broken tiles are gone for
   the stage.
5. **Single-slot commitment:** while your wire is alive you cannot fire. A denied
   fire is **never silent** — wire shimmer + polite click + HUD slot flash (seed law:
   the most common input must teach, not dead-air).
6. **Fire buffer (~150 ms):** a press during the wire's last moments fires on the
   tick the slot frees.

`wireSpeed` is a tuning.js constant; M1 verifies **swept-segment** collision so a
fast wire cannot tunnel past a small fast sphere between ticks (seed verification
bar).

---

## 3. The player (a walker, not an athlete)

The reference protagonist **walks and climbs ladders; it does not jump.** Standing
in the right place is the entire movement game. POPINJAY keeps this as signature law
#4. Characterized verbs:

- **Walk** left/right at a brisk constant speed (`walkSpeed`, tuning.js).
- **Climb** ladders up/down at `climbSpeed`. Fire is allowed **while on a ladder**
  (wire fires from current x).
- **No jump, ever.** No coyote time, no double-tap dash. Vertical movement is
  ladders only.
- Walking and firing are **simultaneous** — one-handed play must remain feasible
  (seed accessibility floor).
- **3 composure hearts** baseline; one-hit ("Deadeye Rules") is a *chosen modifier*
  only. Restores: +1 on locale clear (overflow → 3 prize tickets, no wasted heal);
  souvenir charms per catalog. Centerpieces pay tickets, never hearts.

---

## 4. Drops (power items)

### 4.1 Reference convention
In the reference, destroyed spheres sometimes drop a falling item the player walks
into: time-related effects, screen-clearing dynamite, defensive items, and score
pickups. Items fall, rest on the surface below, and time out if not collected.

### 4.2 POPINJAY drop table (seed-pinned; M3 authors weights)
- **time-slow** — all spheres to 50% for 4 s.
- **freeze** — all spheres halted 2 s.
- **dynamite** — a **telegraphed cascade** (see §4.3), never an instant flood.
- **shield** — one absorb, held until hit.
- **medallions** — score.

Rules the seed pins (resolving Fugu §1.19, §5.3): drops **fall under gravity, land
on the surface below, expire after ~8 s with a blink warning**; a drop can **never
rest inside geometry** (probe-asserted); a drop whose floor breaks falls to the next
surface or despawns. Dynamite is **rare**, **never rolls while slow/freeze is
active**, and **at most one dynamite is airborne at a time**. Legibility is
**silhouette-first** (distinct shapes at arcade speed; color is never the only
channel) with a brief post-pickup banner naming the effect.

### 4.3 Dynamite as a telegraphed beat cascade (resolves Fugu §1.20, §4.5)
The reference's screen-clear is transposed into something readable and
photosensitivity-safe: on pickup, a **1 s visible fuse**, then **all spheres split
ONE class step per beat** over successive beats until everything is Penny. It is a
beat-synced cascade, not an instant screen flip — both a rescue and a self-inflicted
crisis. The **Long Fuse** souvenir adds a 1-beat pause between steps for chain
harvesting. Because it steps class-by-class rather than expanding each sphere to its
full Penny descendant count at once, it **preserves the split arithmetic** (Fugu
§1.3/§4.4: the Penny ceiling is respected because the cascade walks the same tree the
player would, one class at a time).

---

## 5. Stage pressure, completion, and the closing bell

### 5.1 Reference convention
A stage in the reference is cleared by **destroying every sphere on screen**. There
is time pressure — dawdling is punished — but the fail state is contact, not a hard
clock (in the base modes).

### 5.2 POPINJAY's completion + drip contract (resolves Fugu §1.5, §1.6, §4.3)
- **Stage = clear every balloon** (seeded roster + any drip arrivals).
- **Par + the closing bell:** past par, bandstand tempo rises **and the par dial
  visibly changes state** (never audio-only), and **drip Pennies** enter at
  telegraphed corner markers (1.5 s warning, half-speed entry).
- **Drip contract (convergence-guaranteed, anti-farm, anti-camp):**
  - at most **6 drip balloons per stage**;
  - drip **pauses** while the active-balloon ceiling is reached;
  - drip **STOPS** once the seeded roster is cleared → the stage can never become
    uncleanable by pressure (resolves the Fugu "endless debt spiral");
  - drip **counts toward clear** (no "declare clear while hazards remain"), but
    because it stops at roster-clear, clearing the roster drains the board;
  - drip **targets the half of the screen the player occupies** (anti-camp);
  - drip rewards are **capped / excluded from the ticket printer** (resolves Fugu
    §2.3/§4.11: no farming score→tickets by camping past par).
- The **par dial reads as a bandstand clock, not a bomb** — its label and the help
  line state plainly that par is *pressure, not failure*.
- Hard timers exist only as a **chosen modifier**.

---

## 6. Weapons / souvenirs mapped to the reference

The reference's two weapon families (single-shot wire vs lingering double-beam gun)
are **not** competing weapons in POPINJAY; they are decomposed into **strictly
additive** souvenirs so the seed's "capability-reducing souvenir is banned" law holds
and every validated stage stays valid under any build (resolves Fugu §1.1, §1.2,
§4.2 — the "gallery gun contradicts wire-as-wall" blocker):

- **Second Barrel** — two wire slots (both still walls).
- **Sky Anchor** — wire anchors at the ceiling and persists 4 s (the reference's
  lingering beam, made additive).
- **Quick Spool** — wire travels 40% faster.
- **Gallery Sidearm** — a **6-shot-per-stage pop-gun on a SECOND button**; no wall
  property; reloads at stage entry. A sidearm **BESIDE** the wire, never a
  replacement — the wire and its commitment law remain the primary verb. This is the
  key clean-room resolution of the Fugu blocker: the reference's rapid gun becomes a
  *bounded second option*, not a mode that deletes commitment.
- **Long Fuse** — dynamite cascade pauses 1 beat between steps.

Full 24-souvenir catalog + tiers + draft rules are in DESIGN-SEED (M3/M4 implement).

---

## 7. Scoring and chains

### 7.1 Reference convention
The reference scores per destruction and rewards fast, multi-sphere play; larger
(harder-to-corner-later) spheres are worth *less* per hit than the small ones you
must chase, and rapid successive destructions cluster into bonus-worthy runs.

### 7.2 POPINJAY score contract (seed-pinned; resolves Fugu §5.5)
- **SCORE** (run-scoped prestige) — per-pop values **inverted by size**:
  `Grand 100 / Parade 200 / Fair 400 / Penny 800`. **Chain multipliers x2/x3/x4**
  inside a **TICK-DENOMINATED** chain window (~90 ticks); the window **and its
  remaining time are VISIBLE** (a small chain meter, never audio-only). Plus a
  **stage-clear time bonus vs par**. Local best-score table on the title (top 10,
  seed shown).
- **PRIZE TICKETS** (meta currency) — earned at the scorecard, **never conflated**
  with score. Chain *tickets* are capped per stage (no printer).

Determinism note: the chain window is **tick-denominated**, not wall-clock — nothing
gameplay-visible reads the audio clock (seed audio-sim isolation law). The sim hash
includes chain + score.

---

## 8. Panic escalation (the finale)

### 8.1 Reference convention
The reference's later invention is a **continuous escalating rain**: spheres arrive
faster and faster and the player survives on movement and positioning rather than
methodically clearing a fixed roster.

### 8.2 POPINJAY Panic Finale (seed-pinned; resolves Fugu §1.11, §1.12, §4.15)
- **Survive 90 seconds** of escalating balloon rain. Victory = surviving the clock.
- Locale interstitials each include a **12-second REHEARSAL BURST** so the finale's
  rules arrive **taught**, not sprung.
- The escalation curve is tuned so a **souvenir-less baseline bot survives at ~40%**
  (probe-measured, an M4 exit gate) — souvenirs matter, but a draftless run is never
  hopeless. This is the concrete resolution of the Fugu "finale must be winnable at
  baseline" blocker: it is a **build gate**, not a promise.
- Victory → VICTORY scorecard, premium ticket multiplier, credits, unlocks **Endless
  Panic** from the title.

---

## 9. The world-tour transition

### 9.1 Reference convention
The reference frames its stage progression as a **journey across a world map**: a
poster-map interstitial advances a route pin from location to location between
stages. It is the reference's signature *between-stage* moment.

### 9.2 POPINJAY transposition
A run is a **TOUR: 3 locales × 4 stages**, each locale's fourth a **CENTERPIECE**,
then the **PANIC FINALE**. Stage-clear gets a poster stamp ("CLEARED — {time} vs
par"); locale transitions play the **TOUR MAP** interstitial (a hand-tinted poster
map with the route pin advancing). Locales are **mechanical acts**, not palette
swaps: locale 1 = the pure game; locale 2 = **wind bands** (fixed horizontal drift
zones that shear parabolas, still exactly periodic); locale 3 = **weighted gores** (a
heavier variant class with deeper, faster arcs and a distinct silhouette, still
exactly periodic).

---

## 10. What M1 inherits from this study (the empirical defaults)

The binding numbers live in `tuning.js` and are authored at M1 with the golden feel
tape; this study fixes their **shape** so M1 tunes within faithful bounds:

| Quantity | Faithful shape | Where pinned |
|---|---|---|
| Sphere vertical | constant `g`; apex-above-surface fixed per class; derive `v=√(2·g·apex)` each bounce (exact periodicity) | tuning.js (M1) |
| Sphere horizontal | constant speed per class; sign flips only on vertical-surface contact | tuning.js (M1) |
| Split | 2 children, class down, `(±vx_child, +kick)`, symmetric, at parent center | tuning.js (M1) |
| Classes | Grand→Parade→Fair→Penny; 1 Grand = 15 hits, peak 8 Pennies | §1.3 (fixed) |
| Wire | grows from fire-time x; line hitbox not surface; one-pop despawn; under-platform stop; single slot; ~150 ms buffer | §2.2 (fixed) |
| Player | walk + ladder, **no jump**; fire while standing or on ladder | §3 (fixed) |
| Hearts | 3 baseline; one-hit is a modifier; +1 on locale clear (overflow→3 tickets) | §3 (fixed) |
| Chain window | ~90 ticks, tick-denominated, visible meter | §7.2 (fixed) |
| Score/class | Grand 100 / Parade 200 / Fair 400 / Penny 800 | §7.2 (fixed) |
| Finale | 90 s survival; ~40% baseline-bot survival gate | §8.2 (fixed) |

**Determinism envelope (CLAUDE.md hard rule 6, seed stack):** fixed-timestep sim,
seeded **named** RNG streams only (layout / roster / drops / draft — no `Math.random`
in game logic), sim fully separated from the renderer (`node --test` needs no
browser), serialized stream positions ride in every save. The audio band keeps its
**own** private streams and every gameplay window is tick-denominated — the
audio-on/audio-suppressed sim hashes must be identical.

---

*This M0 study is a design artifact, not shippable content. It names the reference
so the transposition is honest and auditable; the shipped game contains none of the
reference's names, art, audio, or layouts.*

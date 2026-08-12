# M0 — Clean-room Study of the load-bearing reference

*CAPRIOLE build doc. Written 2026-08-09. Clean-room discipline (CLAUDE.md hard rule 2,*
*DESIGN-SEED §References): this doc CHARACTERIZES the reference's conventions, feel, and*
*pacing as design targets. It names no characters, no trademarks, no assets, and copies no*
*code, art, level data, or audio. Everything below is an empirical description of observable*
*play behavior, restated as tunable targets for our own transposition. Where a number is*
*given it is a design target for* `tuning.js`*, derived from characterization — not a measured*
*rip. "The reference" throughout = Jumping Flash! (Exact/Ultra, SCE, PSX 1995), the*
*first-person hop-and-bop that this game transposes.*

---

## 0. Why this reference, in one line

It solved the hardest problem in first-person platforming — **making a blind landing
readable** — with two cheap, legible conventions (an apex camera tip-down and a
ground-projected blob shadow) and then built a whole joy loop out of *falling upward*. We
keep those two conventions as law and rebuild the loop around them. Nothing else transfers.

---

## 1. The signature move: double/triple jump with apex auto-pitch

**What the player sees.** From a standing first-person view looking roughly at the horizon,
the first jump is an ordinary hop — the view stays level. The moment the player presses jump
a *second* time in the air, the camera begins to tip its pitch **downward** so that by the
top of the arc the player is looking down past their own feet at the ground below. A third
jump tips it further. The effect is that at the apex of a big jump you are looking straight
at your landing zone. On the way down and on landing, the pitch eases back toward level.

**Why it exists (the design reading).** First-person removes the platformer's most important
information — where am I relative to the platform I'm aiming at. A fixed forward view during a
tall jump shows you *sky*, exactly when you need to see *ground*. The auto-pitch spends the
apex — the moment of least control urgency, when you're just waiting to fall — buying back the
landing information. It is an information trade disguised as a camera flourish.

**Characterized feel targets (→ `tuning.js`):**

| Property | Target | Note |
|---|---|---|
| Jump 1 height | base `H` | ordinary hop, no auto-pitch |
| Jump 2 height | ~1.5× `H` | auto-pitch begins on this press |
| Jump 3 height | ~2.2–3.2× `H` cumulative apex | the "big look" jump; auto-pitch deepest |
| Apex hang | generous — a beat of near-weightless float at the top | readability window; NOT realistic gravity |
| Auto-pitch onset | on the 2nd (and 3rd) jump press, not on jump 1 | jump 1 stays level so short hops don't nauseate |
| Max auto-pitch angle | deep enough to see the landing footprint at apex | tunable; a *curve*, eased in and out |
| Pitch blend | smooth in AND out; returns to neutral on landing | never a hard snap |
| Player look authority | player look input always wins during the blend | the tilt is an OFFSET, not a takeover (law #5) |

The geometric escalation of the three heights (each meaningfully taller than the last) is the
*law*; the exact multipliers are tunable. The reason it must be geometric: the three jumps
have to feel like three *different tools* — a step-across, a reach, and a commit — not three
presses of the same button.

**The critical subtlety we must not lose.** The auto-pitch is a blended *offset* on top of
player aim. If the player is actively looking around, their input dominates and the tilt is
felt as a gentle assist, not a camera seizure. Getting this wrong (a hard scripted camera that
fights the stick) is one of the two things that made the reference motion-sickening (see §6).

---

## 2. The blob shadow: the landing marker

**What the player sees.** A soft dark ellipse is painted on the ground *directly beneath* the
player at all times. As the player rises it shrinks and softens; as they fall toward a surface
it grows and sharpens. It sits on whatever surface is actually below — the top of a platform,
the floor, an enemy's cap.

**Why it exists.** In first-person you cannot see your own feet during a fall. The blob is a
persistent read-out of "your X/Z right now, projected down" and — via its size — a coarse
read-out of your height. Together with the apex tip-down, it closes the loop: the tip-down
tells you *where the platform is*, the blob tells you *where you are relative to it*. Line the
blob up with the platform, fall, land.

**Characterized targets (→ `tuning.js`, and the M1 feel gate):**

- Blob is projected onto the first surface below the player (raycast down in our sim).
- Blob **scales with height** — bigger/softer when high, small/sharp when low.
- Over the **void** (no surface below within range) the blob fades to a faint ring on the
  distant cloud floor, and our **landing-ring marker** takes over (DESIGN-SEED law #2): a
  projected marker on the *predicted* landing surface, plus a screen-edge arrow when that
  point is off-screen. This is what lets the camera-tilt slider reach 0% without breaking the
  "landing visible at apex" law — the marker, not the tilt, is the guarantee.
- Contrast is not decorative: the blob must clear a measured luminance ratio against the
  surface under it, sampled per sphere (law #2, checked at proofs).

---

## 3. Attack model: the bounce-stomp

**What the player does.** The primary attack is *landing on an enemy from above*. There is no
gun-first combat, no aim-down-sights, no reticle. You defeat things by falling on them — which
means combat and traversal are **the same verb**. A modest secondary exists: a short-range
firework-class burst for the occasional enemy you can't get on top of, but it is garnish, not
the spine.

**The generosity rule (characterized).** When a descending player and an enemy overlap
ambiguously, the resolution **favors the player** — you get the stomp rather than the hit. The
reference is forgiving here on purpose: the whole appeal is the confident downward commit, and
punishing near-misses would make players stop committing. We encode this as "landing kills;
ambiguity resolves to the stomp" (law #3) with the stomp window scalable in the assist menu.

**The chain (the skill ceiling).** Landing on an enemy **refunds your midair jumps** — you
bounce off it and can immediately jump again, higher, toward the next one. Skilled play is a
*chain* of enemy-hops strung across a gap, each stomp resetting the jump budget. This is the
reference's core expressive joy and our law #6. It is also why enemies are placed in the air /
on pillars, not just on the ground: they're stepping stones as much as threats.

**Transposition note.** In our systems fold, stomp chains *multiply spark drops* (the par-relief
and pip-fragment currency). So the chain isn't only style — it feeds survival. Combat stays
optional (you can platform past most things) but is *rewarded*, never *mandatory*.

---

## 4. Stage loop and pacing

**The unit of play.** A stage is a compact floating environment — platforms, pillars, and
open air over a bright bottomless sky — with a small set of **pickups you must collect to open
the exit**. Gather the required count; the exit activates; leave. No key-hunting mazes; the
"objective" is an excuse to make you traverse the whole readable space using the jump.

**Characterized pacing beats:**

- A stage is **short** — on the order of 90 seconds to a few minutes of intended play. Long
  enough to establish and vary a couple of jump ideas; short enough that death costs little.
- **Verticality is the theme.** Layouts stack upward and outward over open sky; the draw
  distance is generous and the sky is **fogless and bright** — the openness is the mood, not a
  place to hide geometry in haze.
- **Soft pressure, not a stopwatch.** The reference leans on atmosphere and enemy density
  rather than a punishing hard clock. We transpose this as **par time**: no hard timer by
  default; past par "the fair starts closing" — sky shift + hazard ramp — and the HUD par dial
  pulses so the warning has a first-class UI channel, never only the atmosphere.
- **Escalation across a run** is by *composition*, not by twitch: later stages ask for longer
  chains, tighter gaps, and mixes of enemy roles, not faster reflexes.

**Our transposition of the macro-structure** (DESIGN-SEED spine, not from the reference): a run
is a 9-sphere ascent, 3 acts of 3, each act's third sphere an elite/boss; 4 pods per sphere;
a caprice draft between spheres; death files a carnival scorecard; ~15–25 min per run. The
reference gives us the *feel of one stage*; the roguelite ascent is our own frame around it.

---

## 5. Enemy archetype roles (characterized as behaviors, not creatures)

The reference's bestiary reads, mechanically, as a small set of **roles** whose job is to test
different facets of the jump. We reproduce the *roles*, invent our own creatures (code-drawn,
billboarded, clean-room — no reference designs). The four M3 archetypes map to these roles:

1. **The drifter** — a slow ground/low-air mover on a lazy path. Teaches basic timing: line up
   the blob, drop on it. Harmless if ignored; the tutorial stomp.
2. **The turret-flower** — stationary, lobs a slow telegraphed projectile at intervals. Teaches
   *air-dodging while aiming a landing* — it punishes hovering, rewards committing. Its shot is
   slow and readable (fair by law), and it's stompable from directly above.
3. **The hopper** — a grounded thing that periodically jumps, so its stompable top is a *moving
   timing target*. Teaches the timed commit; the first enemy that can be a chain-link.
4. **The swooper** — an air mover on a diving arc that crosses the player's traversal lanes.
   Teaches reading a moving air target and is the prime **chain stepping-stone** — stomping one
   mid-arc and re-jumping is the signature flourish. Threatens by collision, not by ranged fire.

**Bosses** (act gates) are characterized as *large multi-hit stomp puzzles*: a big target with
a telegraphed vulnerable window/weak spot you reach by using the jump under pressure — a test of
the run's whole vocabulary, not a bullet-sponge. Boss kills restore 2 HP pips (systems fold).

**Silhouette law (our addition, from the fold):** enemy identity must carry in silhouette
alone, never color alone — for colorblind legibility over gameplay frames, not just the HUD.

---

## 6. What made it motion-sick — and the binding countermeasures

The reference is famous for inducing motion sickness in a meaningful fraction of players. The
transposition's explicit mandate (law #4) is to *keep the feel and lose the nausea*. Diagnosed
causes and our bound countermeasures:

| Nausea cause (characterized) | Our countermeasure (binding) |
|---|---|
| **Scripted camera pitch that fights player input** during the auto-tilt | Auto-pitch is a *blended offset*; player look always wins during the blend (law #5). |
| **No comfort options** — one-size camera for everyone | Camera-tilt intensity slider **0–100%** (landing-ring marker keeps law #1 satisfied at 0), FOV slider, invert-Y, sensitivity, screen-shake toggle. |
| **Aggressive vertical camera travel** with no tuning | Tilt is a *curve* in `tuning.js`, eased in and out; hang time gives the eye a stable beat at apex. |
| **Dynamic FOV kicks / speed vignettes** amplifying vection | **NONE by default.** No dynamic-FOV kick, no speed vignette (law #4). |
| **No onboarding for sensitive players** | **First-boot Standard/Comfort preset choice**, present from the milestone that adds look control (M1). |
| Fast-flashing hazards / i-frame flicker | **Photosensitivity policy from M3**: nothing flashes >3/sec; flash-reduce toggle; i-frames get an outline-pulse alternative to flicker. |

The comfort layer is not a settings-menu afterthought; it is a *first-class design constraint*
that shapes the camera code from M1. A camera that can't be turned down to Comfort is a defect.

---

## 7. The look (idiom target, our own art)

Characterized visual idiom (kept as target; all pixels are our own code-generated geometry —
CLAUDE.md hard rule 1):

- **Flat shading**, solid saturated colors, no texture realism, no PBR, no shadows except the
  blob. The Star Fox-adjacent PSX-launch look: confident low-poly polygons readable at speed.
- **Billboarded enemies** (camera-facing sprites, code-drawn to canvas) against polygonal
  terrain — a period-authentic mix that also keeps enemy read-out crisp.
- **Open, fogless, bright skies** with a gradient and slow decorative floaters (balloons,
  rings, drifting shapes); island sides show strata bands; generous draw distance.
- The one aesthetic law (DESIGN-SEED): every frame must look like *a 1995 PSX dream you
  half-remember* — not like a Three.js tutorial. Bare grey / default-material geometry is a
  defect.

Our register is **toybox cosmic carnival** — brighter and kinder than the reference's mood;
we borrow the *technique* (flat-shaded, billboarded, open sky), not the palette or tone.

---

## 8. What we deliberately do NOT take

Clean-room boundary, stated so it can't drift:

- No characters, names, creature designs, trade dress, logos, or story of the reference.
- No level geometry, layouts, or pod placements — ours are procedurally generated.
- No audio — score and SFX are the House Band kit, our own register.
- No code — we reimplement kinematics, camera, and collision from scratch.
- Star Fox is a *visual-idiom* reference only: flat-shaded confidence, nothing else.

The *only* things that transfer are conventions restated as our laws: apex auto-pitch,
blob shadow + landing-ring, bounce-stomp with jump-refund chains, collect-to-open-exit stage
loop, generous airtime, open bright skies — plus the anti-nausea mandate that reframes all of
it for comfort.

---

## 9. M0 targets extracted for `tuning.js` (seed values, all tunable)

These are the initial constants the scaffold's `tuning.js` carries so M1 has feel numbers to
tune *against* (not final; the M1 feel gate tunes them on real captures):

- `jump.baseHeight` — base hop height `H`.
- `jump.heightMul = [1.0, 1.5, 2.2]` — per-jump cumulative apex multipliers (geometric law).
- `jump.count = 3` — max chained jumps (triple).
- `jump.apexHangFrac` — fraction of arc near apex with softened gravity (readability hang).
- `jump.coyoteMs ≈ 120` — coyote time (law #8).
- `camera.tiltMaxDeg` — deepest auto-pitch angle at jump 3 apex.
- `camera.tiltInCurve` / `camera.tiltOutCurve` — eased blend curves in/out.
- `camera.tiltIntensityDefault = 1.0` — slider 0..1; Comfort preset lowers it.
- `air.accelFrac = 0.40` — air acceleration as fraction of ground accel (fold decision).
- `air.turnPenalty = 0` — no air-turn penalty (fold decision).
- `shadow.minScale` / `shadow.maxScale` — blob size range vs height.
- `stomp.favorPlayer = true` — ambiguity resolves to the stomp (law #3).
- `stomp.refundsJumps = true` — stomp resets the jump chain (law #6).
- `hp.pips = 6`, `hp.perSphereRestore = 1`, `hp.bossRestore = 2` — HP economy (fold).
- `fall.netTollHp = 1` — updraft-net toll (law #7); death is HP-zero only.

Exact starting numbers live in `src/sim/tuning.js` with a one-line shape/feel comment each,
per the stack rule. This study is the *why* behind those numbers; `tuning.js` is the *what*.
```

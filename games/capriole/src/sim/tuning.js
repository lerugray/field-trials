// tuning.js — EVERY gameplay constant, one place, each with a one-line shape/feel
// comment (stack rule). The M0 STUDY (docs/M0-STUDY.md) is the WHY behind these
// numbers; this file is the WHAT. Values are M0 seed targets — the M1 feel gate
// tunes them against real captures. Nothing here reads the renderer; the sim owns
// these and the renderer only reads them for presentation.
//
// Units: distance in world-units (wu), time in seconds. The sim runs a fixed
// timestep (see TIMESTEP). "Height H" is the base hop apex above takeoff.

export const TIMESTEP = 1 / 60; // seconds per sim tick — fixed-step deterministic law
export const MAX_SUBSTEPS = 5;  // accumulator clamp: never simulate >5 ticks of catch-up (anti "unpause death")

export const GRAVITY = -38; // wu/s^2 — snappy, arcade fall (NOT realistic 9.8); tuned for hang + commit

export const tuning = {
  // ---- The triple jump (signature law #1). Geometric height escalation is LAW,
  //      the exact multipliers are tunable. Each jump must feel like a different tool.
  jump: {
    baseHeight: 3.2,            // wu — apex of jump 1 above takeoff (base H)
    heightMul: [1.0, 1.5, 2.2], // per-jump CUMULATIVE apex (× H) when chained at apex (hop / reach / commit) — geometric law
    count: 3,                   // max chained jumps before landing (triple)
    hangVelThreshold: 6.0,      // wu/s: below this |vy| near apex, gravity softens (the readability hang)
    hangGravityScale: 0.55,     // gravity multiplier inside the hang window (0..1; lower = floatier apex)
    coyoteMs: 120,              // ms after leaving ground you can still jump (law #8)
    bufferMs: 120,              // ms a jump press is buffered before landing
  },

  // ---- Camera auto-pitch (laws #1/#4/#5). A blended OFFSET on player aim; player
  //      look always wins; eased in and out; returns to neutral on landing.
  camera: {
    tiltStartJump: 2,     // auto-pitch begins on this jump index (1 = first) — jump 1 stays level (anti-nausea)
    tiltMaxDeg: 42,       // deepest downward pitch at the deepest jump's apex
    tiltPerJumpDeg: [0, 26, 42], // target downward pitch by current jump index (see landing at apex)
    tiltInSec: 0.18,      // ease-in time of the tilt offset (smooth blend in)
    tiltOutSec: 0.28,     // ease-out time back to neutral (smooth blend out, on descent/landing)
    tiltIntensityDefault: 1.0, // 0..1 comfort slider; Comfort preset lowers it; 0 relies on landing-ring marker
    fovDefault: 75,       // degrees; slider-adjustable; NO dynamic-FOV kick by default (law #4)
    invertY: false,
    sensitivity: 1.0,     // look sensitivity multiplier (slider)
    lookRate: 0.0026,     // radians of turn per pixel of mouse delta at sensitivity 1
    keyLookRate: 2.4,     // radians/sec of turn from held arrow-key look (keyboard-only floor)
    pitchClampDeg: 85,    // max up/down look pitch (before auto-pitch offset)
    eyeHeight: 1.5,       // wu — camera height above the player's feet
  },

  // ---- Comfort presets offered at first boot (law #4). Standard = full feel;
  //      Comfort = gentler camera for motion-sensitive players.
  presets: {
    standard: { tiltIntensity: 1.0, sensitivity: 1.0, screenShake: true },
    comfort: { tiltIntensity: 0.4, sensitivity: 0.8, screenShake: false },
  },

  // ---- Air control (fold decision): camera-relative accel at a fraction of ground,
  //      no air-turn penalty, terminal caps. Judged at the M1 feel gate.
  move: {
    // Movement integration knobs (kept together for one-line rollback or re-tune).
    groundAccel: 90,     // wu/s^2 ground acceleration toward desired velocity
    airAccelFrac: 0.40, // air accel = 40% of ground (fold)
    airTurnPenalty: 0,  // no penalty for reversing in air (fold)
    maxGroundSpeed: 10.5, // wu/s horizontal cap on ground
    maxAirSpeed: 10.8,    // wu/s horizontal cap in air
    maxFallSpeed: 42,   // wu/s terminal downward speed (bounds per-tick displacement; feel + swept-collision safety)
    groundFriction: 18, // wu/s^2 decel when no input on ground
    airDamping: 4,      // wu/s^2 drift damping in air when no input
  },

  // ---- Landing generosity (law #8): coyote (in jump), edge-snap, near-miss help.
  land: {
    edgeSnap: 1.1,      // wu past a disc rim that still snaps onto the edge on landing
    reachEdgeMargin: 0.5, // wu — the validator only counts a hop as reachable if it lands this far INSIDE the rim (edge-landing margin over void, verification fold)
  },

  // ---- Blob shadow + landing-ring (law #2): projected under player, scales with
  //      height; over void the ring/landing-marker takes over.
  shadow: {
    maxCastDist: 60,   // wu — raycast reach for the surface under the player
    minScale: 0.35,    // blob scale when low/at-surface (sharp, small)
    maxScale: 1.6,     // blob scale when high (soft, large)
    scaleHeightRef: 14, // wu height at which blob reaches maxScale
    minLuminanceRatio: 1.4, // blob must clear this contrast vs the surface (checked at proofs)
  },

  // ---- Stomp (laws #3/#6): ambiguity favors the player; a stomp refunds the jump chain.
  stomp: {
    favorPlayer: true,   // ambiguous overlap resolves to a stomp, not a hit (law #3)
    refundsJumps: true,  // landing on an enemy resets the midair jump chain (law #6)
    bounceVel: 16,       // wu/s upward pop off a stomped enemy (feeds the chain)
    windowScale: 1.0,    // assist-menu scalable stomp window (Carnival Rules, M6)
  },

  // ---- HP economy (fold). Intent table; tuned against the M7 soak.
  hp: {
    pips: 6,             // starting/max HP pips
    perSphereRestore: 1, // clearing a sphere restores 1 pip
    bossRestore: 2,      // boss kill restores 2 pips
    fragmentsPerPip: 3,  // spark pip-fragments needed for 1 pip
    iframeMs: 900,       // invulnerability after taking damage
  },

  // ---- Falling off is a TOLL, not an execution (law #7).
  fall: {
    netTollHp: 1,        // updraft net costs 1 pip + returns to last grounded island
    netTollParSec: 3,    // and a few par seconds
    killPlaneMargin: 20, // wu below the lowest island the kill-plane sits (property-tested)
  },

  // ---- Par / soft pressure. No hard timer by default; spark drops add seconds.
  par: {
    baseSpherePar: 120,  // seconds of par per sphere before "the fair starts closing"
    warnFrac: 0.8,       // fraction of par at which the HUD dial begins to pulse
    sparkParSec: 2,      // seconds added to par per spark collected
    rampSec: 60,         // seconds past par over which the hazard ramp climbs 0→1 (M3 spawns consume it)
  },

  // ---- Pods / exit (stage loop). Collect N → exit opens → step through to advance.
  pods: {
    perSphere: 4,        // pods to collect to open the exit
    collectRadius: 1.4,  // wu pickup radius
    heightAboveTop: 1.2, // wu — pod floats this far above its island top (walk-through pickup + beacon base)
  },
  exit: {
    enterRadius: 2.0,    // wu — horizontal radius around the open exit portal that advances the sphere
  },

  // ---- Run structure (the ascent). Full 9-sphere run + victory/scorecard is M4; M2
  //      wires the within-sphere loop and the step-through-exit advance.
  run: {
    spheres: 9,          // spheres in a full ascent (3 acts of 3) — sim-side count (palettes mirror it)
    actBossSpheres: [2, 5, 8], // sphere indices that gate each act with a boss/elite (M3 builds act-1's, index 2)
  },

  // ---- Caprice draft (M4 — The Ascent). Between spheres, draft one of three run-scoped
  //      modifiers; drafted caprices leave the pool; tiers are act-gated; skip = +1 ticket.
  caprice: {
    poolSize: 16,        // v1 caprice pool (studio fold)
    offerCount: 3,       // caprices offered per between-sphere draft ("one of three")
    skipTicket: 1,       // tickets granted for skipping a draft (skip = +1 ticket)
  },

  // ---- Tickets + meta (M4). Deep runs strictly beat farming shallow ones: sphere N pays
  //      N tickets, plus a boss bonus, plus a victory multiplier on the whole ascent.
  tickets: {
    perSphereClearedBase: 1, // sphere N pays (N+1)*this — clearing sphere index 0 pays 1, index 8 pays 9
    bossBonus: 3,        // extra tickets per act-boss sphere cleared
    victoryMult: 2,      // whole-ascent ticket multiplier on a full clear (premium payout)
    unlockCost: [0, 12, 30], // tickets to unlock a caprice into the trunk, by tier (tier 0 = starter, free)
  },

  // ---- Bestiary (M3 — Bounce + Bestiary). Four billboarded, code-drawn archetypes
  //      (a drifter, a turret-flower, a hopper, a swooper) + the act-1 boss. Counts scale
  //      with sphere index (difficulty ramp); the teaching sphere (index 0) has NONE
  //      (the leap is taught by geometry before the first enemies, wayfinding fold).
  //      Behaviors are pure functions of (local time + a per-enemy phase) plus simple
  //      live-state steering — no Math.random per tick, no wall clock (determinism law).
  enemies: {
    // Enemies are never seeded on islands whose center is within this radius of the spawn
    // pad. This guarantees the spawn drop and the updraft-net respawn point are on solid
    // ground and free of immediate knockback threats (swooper dives, boss slams) so a
    // no-input player is not thrown into a fall->net->fall loop at sphere start.
    spawnSafetyRadius: 28,
    perSphereBase: 3,        // enemies on the first non-teaching sphere (index 1)
    perSpherePerIndex: 1.3,  // additional enemies per sphere index above 1 (difficulty ramp)
    maxPerSphere: 14,        // hard cap on base spawns per sphere
    contactRadius: 1.15,     // wu — horizontal player↔enemy contact radius
    contactYBand: 1.7,       // wu — vertical half-band for a contact to register
    stompFromAbove: 0.35,    // wu — player center must be at least this far ABOVE the enemy center to stomp (else it's a hit)
    contactDamage: 1,        // HP pips lost per non-stomp contact
    knockback: 11,           // wu/s horizontal knockback pushing the player off the threat
    knockbackUp: 7,          // wu/s upward pop on a hit (edge-clamped; never chains into the net, law #7)
    stompHp: 1,              // base HP of a normal enemy (one stomp)
    hazardSpawnStep: 0.34,   // hazardLevel increments of this size each spawn one ramp enemy (par ramp consumes it, M2→M3)
    hazardSpawnMax: 4,       // cap on extra enemies the par ramp can add
    // ---- Act difficulty ramp (M4). Beyond the per-sphere COUNT ramp, each act (3 spheres)
    //      raises the THREAT: the act boss soaks more stomps and moves faster, and swoopers
    //      dive faster. Act index = floor(sphereIndex/3); act 0 (spheres 0-2) is the M3
    //      baseline (scale 1 → byte-identical), acts 1 & 2 escalate.
    act: {
      speedMulPerAct: 0.14,     // swooper dive speed +14% per act above act 1 (air threat sharpens)
      bossHpPerAct: 2,          // boss soaks +2 stomps per act (act1 5 / act2 7 / act3 9)
      bossSpeedMulPerAct: 0.12, // boss chase + slam speed +12% per act (later acts press harder)
    },
    drifter: { alt: 5.5, driftSpeed: 3.2, driftRadius: 6.0, bob: 0.6, bobRate: 1.3, hp: 1, r: 0.9 }, // slow floater, harmless-looking, drifts a ring over its home island
    turret: { bob: 0.3, bobRate: 2.0, hp: 1, r: 0.85, restY: 1.0 }, // rooted flower on an island top; stationary stomp target (projectiles: later)
    hopper: { hopPeriod: 1.6, hopHeight: 2.4, hopRange: 3.2, hp: 1, r: 0.8 }, // sits on an island, hops around it in a seeded arc
    swooper: { patrolY: 9.0, patrolRadius: 7.0, patrolRate: 0.7, diveInterval: 3.4, diveDur: 1.1, diveSpeed: 13, recoverSpeed: 10, hp: 1, r: 0.95 }, // dives toward the player, then visibly flies (never snaps) back to its high patrol
    boss: {
      hp: 5,               // act-1 boss soaks five stomps (stomp-to-damage)
      r: 2.4,              // big contact/collider radius
      restY: 3.0,          // hovers this far above its island top
      bobRate: 1.1, bob: 0.8, // slow menacing bob
      chaseSpeed: 4.5,     // drifts toward the player between slams
      slamInterval: 2.6,   // seconds between telegraphed ground-slam lunges
      slamDur: 0.7,        // dive duration
      slamSpeed: 16,       // lunge speed
      contactDamage: 1,    // pips per body contact
      hitInvulnMs: 600,    // boss i-frames after a stomp (so one bounce = one hit)
    },
  },

  // ---- Sparks + firework secondary (M3). Enemy deaths drop sparks that feed the par
  //      clock and pip-fragments; the firework is the modest ranged secondary.
  spark: {
    perKill: 2,          // sparks dropped per normal enemy killed
    chainBonus: 1,       // extra sparks per link of the current stomp chain (chains multiply drops)
    bossDrop: 8,         // sparks from the boss
    collectRadius: 1.8,  // wu — spark magnet/pickup radius
    lifeSec: 12,         // sparks linger this long before fading (never vanish mid-collect burst)
    riseSpeed: 2.0,      // wu/s gentle upward drift so sparks read as collectible motes
    drift: 1.4,          // wu/s initial outward scatter speed on drop
  },
  firework: {
    cooldownSec: 0.7,    // between shots (modest, not a shooter)
    speed: 34,           // wu/s projectile speed
    lifeSec: 1.4,        // max flight time before it fizzles
    indicatorDistance: 12, // wu — armed reticle sits here along the real straight shot
    hitRadius: 1.2,      // wu — kill radius vs an enemy
    damage: 1,           // damage per hit (kills a normal enemy; chips the boss)
    ammoMax: 6,          // carried charges
    ammoPerSpark: 0.15,  // charges regained per spark collected (sparks refill the secondary)
  },

  // ---- Procedural archipelago generation (M2 — The Sky Generator). Gap BANDS are
  //      center-to-center distances keyed to the intended jump tier, set CONSERVATIVELY
  //      inside the MEASURED real-tick hop reach (tier1≈11 / tier2≈17.6 / tier3≈24.6 wu
  //      flat; height gain shortens them) so generated hops land with margin. The
  //      reachability validator (reachability.js) is the real guarantee via the live
  //      tick; these bands just keep the reject-and-reroll rate low.
  gen: {
    spawnRadius: 7,          // wu — the spawn pad is roomy (teach the leap from safety)
    chainLen: [6, 9],        // island chain length range (excluding the spawn pad)
    radiusBand: [4.0, 6.5],  // wu — per-island top radius
    gapBand: [[1.5, 3.5], [4.5, 7.5], [8.5, 12.0]], // RIM-TO-RIM void width by tier (1,2,3); center dist = rA+rB+void
    riseCap: [0.0, 1.5, 2.5], // wu — max positive top-Y gain by tier (rises stay inside that tier's shortened reach)
    dropMax: 3.0,            // wu — max drop per hop (drops only ever ease the hop)
    turnMaxDeg: 42,          // deg — heading wander per hop (keeps the chain from folding onto itself)
    clearance: 1.5,          // wu — extra rim gap floor when a void band would be tiny (no-overlap guarantee)
    maxExtent: 120,          // wu — bounded archipelago radius from spawn (bounded-extents property)
    podSpacingMin: 10,       // wu — min center distance between two pod islands (findability spread)
    placeTries: 16,          // placement attempts per island before straightening heading
    teachTiers: [1, 1, 2, 2, 3, 3, 2, 3, 3], // sphere-1 authored escalation: teach jump 1→2→3 by gap band
  },
};

export default tuning;

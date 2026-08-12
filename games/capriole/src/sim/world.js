// world.js — the deterministic sim. Fixed-timestep, seeded, ZERO renderer/WebGL
// references (stack law: `node --test` targets this with no WebGL). M2 grows the M1 tick
// into the SPHERE STAGE LOOP: each sphere is a validated procedural archipelago (the sky
// generator), pods are collected within a radius, collecting all of them opens the exit
// portal, and stepping through the open exit advances to the next sphere. A soft par
// timer tracks the hazard ramp (the fair "starts closing" past par; M3 spawns consume the
// ramp level). The full 9-sphere run structure + victory scorecard is M4.

import { TIMESTEP, MAX_SUBSTEPS, GRAVITY, tuning } from './tuning.js';
import { Rng } from './rng.js';
import { createPlayer, updatePlayer } from './player.js';
import { archipelagoGround } from './islands.js';
import { makeValidatedSphere } from './reachability.js';
import { spawnEnemies, updateEnemies } from './enemies.js';
import { dropSparks as dropSparksFx, updateSparks, updateFirework } from './effects.js';
import { deriveTuning, computeMods, CAPRICES, maxTierForSphere } from './caprices.js';
import { buildScorecard } from './scorecard.js';

// Create a fresh world for a run seed, starting on `sphereIndex` (0 = teaching sphere).
// `caprices` is the run's drafted caprice-id list (M4) — it derives the effective tuning
// (world.tune) the whole sim reads, so a build's mobility/economy mods are deterministic
// from the id list. Empty list ⇒ world.tune is byte-identical to base tuning.
export function createWorld(worldSeed = 1, sphereIndex = 0, caprices = [], pool = null) {
  const caps = Array.isArray(caprices) ? caprices.slice() : [];
  const tune = deriveTuning(caps);   // effective tuning (caprices baked in)
  // The run's DRAFT POOL — the curated meta loadout (meta.runPool), or all 16 when unset
  // (a fresh sim / test). Drafts only ever offer from this pool (progression = curation).
  const draftPool = Array.isArray(pool) && pool.length ? pool.slice() : CAPRICES.map((c) => c.id);
  const world = {
    seed: worldSeed >>> 0,
    rng: new Rng(worldSeed),
    tick: 0,                 // integer sim tick count (deterministic clock)
    time: 0,                 // seconds simulated (tick * TIMESTEP)
    runComplete: false,      // cleared sphere 9 (victory scorecard is built by scorecard.js)
    caprices: caps,          // drafted caprice ids (the run's build)
    pool: draftPool,         // the run's curated draft pool (meta loadout); drafts offer only from it
    mods: computeMods(caps), // folded mod deltas (render reads podsThroughTerrain etc.)
    tune,                    // effective tuning the sim reads (caprices baked in)
    phase: 'play',           // run phase: 'play' | 'draft' | 'dead' | 'victory' (M4 state machine)
    draft: null,             // active draft offer { offer:[ids], nextIndex, gate } while phase==='draft'
    spheresCleared: 0,       // spheres cleared this run (ticket payout basis)
    skipTickets: 0,          // tickets banked from skipped drafts (skip = +1)
    deathCause: null,        // raw cause key of the fatal hit ('swooper'|'net'|... ) for the scorecard
    scorecard: null,         // the causal scorecard, built on death/victory (see scorecard.js)
    // Run-scoped survival state (persists across spheres; NOT reset by loadSphere):
    hp: tune.hp.pips,        // current HP pips
    hpMax: tune.hp.pips,     // max pips (caprices raise this)
    fragments: 0,            // spark pip-fragments toward the next pip (fragmentsPerPip = 1 pip)
    iframe: 0,               // seconds of invulnerability remaining after a hit
    dead: false,             // HP hit zero (death → scorecard)
    stompChain: 0,           // current midair stomp chain (multiplies spark drops; ends on landing/hit)
    sparks: [],              // live spark motes (drop on kill; collect for par/pips/ammo)
    projectiles: [],         // live firework projectiles
    firework: { ammo: tune.firework.ammoMax, cooldown: 0, prevHeld: false, charging: false }, // ranged secondary
    _sparkCounter: 0,        // deterministic golden-angle scatter counter
    // Per-tick event flags (action-legibility hooks; renderer/HUD/audio read them):
    podCollectedThisTick: -1,   // index of a pod collected this tick, or -1
    exitOpenedThisTick: false,  // the exit portal opened this tick
    sphereClearedThisTick: false, // stepped through the exit this tick
    stompedThisTick: -1,        // enemy index stomped this tick, or -1
    killedThisTick: -1,         // enemy index killed this tick, or -1
    damagedThisTick: false,     // player took a hit this tick
    hitDir: { x: 0, z: 0 },     // unit horizontal direction the last hit came FROM (rim flash)
    diedThisTick: false,        // HP reached zero this tick
    netTollThisTick: false,     // updraft net charged its toll this tick (law #7)
    bossDefeatedThisTick: false, // the act boss was defeated this tick
    sparkCollectedThisTick: 0,  // sparks collected this tick
    pipGainedThisTick: false,   // a pip-fragment set completed into a pip this tick
    fireworkFiredThisTick: false, // a firework was launched this tick
    fireworkHitThisTick: -1,    // enemy index a firework hit this tick, or -1
  };
  loadSphere(world, sphereIndex);
  return world;
}

// Build (or rebuild, on advance) the sphere at `sphereIndex` into `world`: a validated
// generated archipelago, its pods/exit/spawn, ground adapter, kill-plane, and a fresh par
// timer, and (re)spawns the player above the spawn pad. Deterministic from (seed, index).
export function loadSphere(world, sphereIndex) {
  const sph = makeValidatedSphere(world.seed, sphereIndex);
  world.sphereIndex = sphereIndex;
  world.sphere = sph;                       // kept for the renderer (islands/pods/exit)
  world.islands = sph.islands;
  world.ground = archipelagoGround(sph.islands);
  world.groundY = sph.islands[0].topY;      // spawn pad top (M0/M1-compat reference)
  world.pods = sph.pods.map((p) => ({ x: p.x, y: p.y, z: p.z, island: p.island, collected: false }));
  world.podsCollected = 0;
  world.exit = { x: sph.exit.x, y: sph.exit.y, z: sph.exit.z, island: sph.exit.island, open: false };
  world.spawn = { ...sph.spawn };
  world.killPlaneY = computeKillPlaneY(sph.islands);
  world.lastGrounded = { x: sph.spawn.x, y: sph.islands[0].topY, z: sph.spawn.z };
  world.par = { elapsed: 0, base: world.tune.par.baseSpherePar, warn: false, closing: false, hazardLevel: 0 };
  world.validSphere = sph.valid;            // false only on the near-impossible reroll exhaustion
  world.enemies = spawnEnemies(world.seed, sphereIndex, sph.islands); // deterministic bestiary roster (M3)
  world.hasBoss = world.enemies.some((e) => e.boss);  // act-gate sphere carries a boss
  const player = createPlayer({ x: sph.spawn.x, y: sph.spawn.y, z: sph.spawn.z });
  player.grounded = false;                  // falls onto the pad (visible determinism)
  world.player = player;
  return world;
}

// Kill-plane below the lowest island (fold: plane sits below min island Y - margin).
export function computeKillPlaneY(islands) {
  const lowest = islands.reduce((m, i) => Math.min(m, i.topY), Infinity);
  return lowest - tuning.fall.killPlaneMargin;
}

// Clear the current sphere: heal one pip (HP economy fold), bank the clear for tickets,
// then either finish the run (final sphere → runComplete + the VICTORY phase) or open the
// between-sphere CAPRICE DRAFT (phase 'draft') for the next sphere. The draft is a sim
// phase (not an immediate load) so it can be saved/resumed mid-draft (save-fuzz fold) and
// is untimed by law (the tick loop freezes while phase !== 'play'). Named advanceSphere
// for continuity with the M2 loop + its tests.
export function advanceSphere(world) {
  world.hp = Math.min(world.hpMax, world.hp + world.tune.hp.perSphereRestore);
  world.spheresCleared += 1;
  const next = world.sphereIndex + 1;
  if (next >= tuning.run.spheres) {
    world.runComplete = true;
    world.phase = 'victory';
    world.scorecard = buildScorecard(world, 'victory'); // premium-multiplier victory report
    return;
  }
  beginDraft(world, next);
}

// Open the draft for the sphere at `nextIndex`: offer up to offerCount caprices drawn from
// the pool MINUS already-owned, gated to the act's tier (act-gated tiers), using the seeded
// 'caprices' RNG stream (resume cannot re-roll — save-scum-proof). If nothing is eligible
// the offer is empty and the player can only skip.
export function beginDraft(world, nextIndex) {
  const gate = maxTierForSphere(nextIndex);
  const owned = new Set(world.caprices);
  const inPool = new Set(world.pool || CAPRICES.map((c) => c.id));
  const eligible = CAPRICES.filter((c) => inPool.has(c.id) && !owned.has(c.id) && c.tier <= gate).map((c) => c.id);
  const offer = drawDistinct(world.rng.stream('caprices'), eligible, tuning.caprice.offerCount);
  world.draft = { offer, nextIndex, gate };
  world.phase = 'draft';
  return world;
}

// Resolve the open draft. `choice` in [0, offer.length) drafts that caprice (adds to the
// build, re-derives world.tune/mods, and grants any new max hearts full); anything else
// (e.g. -1) SKIPS for +1 ticket. Either way the next sphere loads and play resumes.
export function resolveDraft(world, choice) {
  if (world.phase !== 'draft' || !world.draft) return world;
  const { offer, nextIndex } = world.draft;
  if (choice >= 0 && choice < offer.length) {
    draftCaprice(world, offer[choice]);
  } else {
    world.skipTickets += tuning.caprice.skipTicket; // skip = +1 ticket (banked at run end)
  }
  world.draft = null;
  world.phase = 'play';
  loadSphere(world, nextIndex);
  return world;
}

// Add a caprice to the run's build (no-op if already owned) and re-derive the effective
// tuning. New max hearts arrive full (a +heart caprice heals to the new cap).
function draftCaprice(world, id) {
  if (world.caprices.includes(id)) return;
  world.caprices.push(id);
  applyCaprices(world);
}

// Re-derive world.tune/mods/hpMax from the current caprice list (call after any change to
// world.caprices). Raising the max grants the delta as current HP (hearts arrive full).
export function applyCaprices(world) {
  world.mods = computeMods(world.caprices);
  const oldMax = world.hpMax;
  world.tune = deriveTuning(world.caprices);
  world.hpMax = world.tune.hp.pips;
  if (world.hpMax > oldMax) world.hp += (world.hpMax - oldMax);
}

// Draw up to `n` distinct elements from `arr` using a seeded stream (partial Fisher-Yates).
function drawDistinct(stream, arr, n) {
  const pool = arr.slice();
  const out = [];
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i++) {
    const j = stream.int(0, pool.length);
    out.push(pool[j]);
    pool.splice(j, 1);
  }
  return out;
}

// Advance the sim by exactly one fixed timestep. Mutates `world` in place (the sim is
// authoritative). `input` = { f, s, jump, yaw } (see player.js).
export function stepOnce(world, input = {}) {
  // Non-play phases (draft / dead / victory) FREEZE the sim: the draft is untimed by law,
  // and death/victory are terminal menus. The renderer drives resolveDraft/restart on input.
  if (world.phase !== 'play') return world;
  const p = world.player;
  world.podCollectedThisTick = -1;
  world.exitOpenedThisTick = false;
  world.sphereClearedThisTick = false;
  world.stompedThisTick = -1;
  world.killedThisTick = -1;
  world.damagedThisTick = false;
  world.diedThisTick = false;
  world.netTollThisTick = false;
  world.sparkCollectedThisTick = 0;
  world.pipGainedThisTick = false;
  world.bossDefeatedThisTick = false;

  updatePlayer(p, input, TIMESTEP, world.ground, GRAVITY, world.tune);
  if (p.grounded) { world.lastGrounded.x = p.pos.x; world.lastGrounded.y = p.pos.y; world.lastGrounded.z = p.pos.z; }
  // Landing on solid ground ends the midair stomp chain.
  if (p.landedThisTick) world.stompChain = 0;
  if (world.iframe > 0) world.iframe = Math.max(0, world.iframe - TIMESTEP);

  // ---- Enemies: advance the roster against the player position, then resolve contacts
  //      (stomp vs hit — law #3 favors the player on ambiguity; law #6 a stomp refunds
  //      the jump chain). Skips when the player is already dead.
  updateEnemies(world.enemies, p, TIMESTEP);
  if (!world.dead) resolveEnemyContacts(world);

  // ---- Firework secondary + sparks: shots fly and resolve enemy hits; sparks drift and,
  //      on pickup, feed the par clock / pip-fragments / firework ammo (kills → sparks →
  //      survival, the fold's combat-serves-survival loop).
  updateFirework(world, input, TIMESTEP);
  updateSparks(world, TIMESTEP);

  // Falling off is a TOLL, not an execution (law #7): below the kill-plane, the updraft
  // net returns the player to the last grounded island for the cost of 1 pip + a few par
  // seconds. The toll CAN bring HP to zero (death is HP-zero only, per the pitch) but is
  // never itself an instant execution — you always get the pip if you have it.
  if (p.pos.y < world.killPlaneY) {
    p.pos.x = world.lastGrounded.x;
    p.pos.y = world.lastGrounded.y;
    p.pos.z = world.lastGrounded.z;
    p.vel.x = p.vel.y = p.vel.z = 0;
    p.grounded = true;
    p.jumpsUsed = 0;
    p.jumpChain = 0;
    p.netCaughtThisTick = true;
    world.stompChain = 0;
    world.netTollThisTick = true;
    world.par.elapsed += world.tune.fall.netTollParSec; // costs par seconds (pushes the ramp)
    if (!world.dead) applyDamage(world, world.tune.fall.netTollHp, { x: 0, z: 0 }, false, 'net');
  } else {
    p.netCaughtThisTick = false;
  }

  // ---- Pods: collect within radius (walk-through or fly-through). Sets a legibility
  //      event flag the moment the mechanic fires (action-legibility law, wired M3).
  const cr = tuning.pods.collectRadius;
  for (let i = 0; i < world.pods.length; i++) {
    const pod = world.pods[i];
    if (pod.collected) continue;
    const hd = Math.hypot(p.pos.x - pod.x, p.pos.z - pod.z);
    if (hd <= cr && Math.abs(p.pos.y - pod.y) <= 2.0) {
      pod.collected = true;
      world.podsCollected++;
      world.podCollectedThisTick = i;
    }
  }

  // ---- Exit: opens when all pods are in AND, on an act-gate sphere, the boss is defeated
  //      (the boss gates the act). Stepping into the open portal advances.
  const bossCleared = !world.hasBoss || !bossAlive(world);
  if (world.podsCollected >= tuning.pods.perSphere && bossCleared && !world.exit.open) {
    world.exit.open = true;
    world.exitOpenedThisTick = true;
  }
  if (world.exit.open && !world.runComplete) {
    const hd = Math.hypot(p.pos.x - world.exit.x, p.pos.z - world.exit.z);
    if (hd <= tuning.exit.enterRadius && Math.abs(p.pos.y - world.exit.y) <= 2.5) {
      world.sphereClearedThisTick = true;
      advanceSphere(world);
    }
  }

  // ---- Par / soft pressure: elapsed time drives the HUD dial + the hazard ramp. Past
  //      par the fair "starts closing" and hazardLevel climbs 0→1 (M3 spawns read it).
  world.par.elapsed += TIMESTEP;
  const frac = world.par.elapsed / world.par.base;
  world.par.warn = frac >= tuning.par.warnFrac;
  world.par.closing = frac >= 1.0;
  world.par.hazardLevel = clamp01((world.par.elapsed - world.par.base) / tuning.par.rampSec);

  world.tick++;
  world.time = world.tick * TIMESTEP;
  return world;
}

// Resolve player↔enemy contacts this tick. A contact where the player is descending onto
// the enemy from above resolves as a STOMP (kill/chip + bounce + jump-chain refund, laws
// #3/#6); any other contact is a HIT (damage + knockback + i-frames) unless the player is
// invulnerable. Ambiguity favors the player (favorPlayer). At most one hit per tick.
export function resolveEnemyContacts(world) {
  const p = world.player;
  const e = world.tune.enemies;
  for (let i = 0; i < world.enemies.length; i++) {
    const en = world.enemies[i];
    if (!en.alive) continue;
    const reach = e.contactRadius + en.r;
    const hd = Math.hypot(p.pos.x - en.pos.x, p.pos.z - en.pos.z);
    if (hd > reach) continue;
    if (Math.abs(p.pos.y - en.pos.y) > e.contactYBand + en.r) continue;

    // Stomp test: player at/above the enemy center (within the favor margin) and not rising.
    // Ambiguity favors the player (law #3): from above still stomps even if slightly rising
    // (e.g. just after a bounce) when favorPlayer is set.
    const fromAbove = (p.pos.y - en.pos.y) > -e.stompFromAbove;
    const descending = p.vel.y <= 0;
    const isStomp = fromAbove && (descending || world.tune.stomp.favorPlayer);
    if (isStomp) {
      stompEnemy(world, en, i);
    } else if (world.iframe <= 0 && world.stompedThisTick < 0) {
      // A stomp anywhere this tick grants hit-immunity for the tick (favor the player, law
      // #3): you never eat a body-hit on the same frame you bopped something.
      const dx = p.pos.x - en.pos.x, dz = p.pos.z - en.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dmg = en.boss ? e.boss.contactDamage : e.contactDamage;
      applyDamage(world, dmg, { x: dx / d, z: dz / d }, true, en.boss ? 'boss' : en.type);
      // Knockback pushes the player off the threat, with a modest upward pop (edge-clamped
      // by the net; never chains into the net from i-frame hits — the i-frame we just set
      // blocks a follow-up hit).
      p.vel.x = (dx / d) * e.knockback;
      p.vel.z = (dz / d) * e.knockback;
      p.vel.y = Math.max(p.vel.y, e.knockbackUp);
      p.grounded = false;
      world.stompChain = 0;
      break; // one hit per tick
    }
  }
}

// A stomp on `en`: bounce the player, refund the jump chain (law #6), extend the stomp
// chain, and damage the enemy (boss soaks multiple stomps, spaced by its i-frames).
function stompEnemy(world, en, i) {
  const p = world.player;
  const st = world.tune.stomp;
  if (en.invuln > 0) {
    // Boss already hit this window — still bounce the player and refund the jump chain
    // (keep them airborne + able to re-attack), but deal no damage and do not credit the
    // spark chain (no damage → no chain multiplier).
    p.vel.y = st.bounceVel;
    p.grounded = false;
    if (st.refundsJumps) { p.jumpsUsed = 0; p.jumpChain = 0; }
    return;
  }
  world.stompedThisTick = i;
  en.hitThisTick = true;
  en.hp -= world.tune.enemies.stompHp;
  if (en.boss) en.invuln = world.tune.enemies.boss.hitInvulnMs / 1000;
  // Bounce + jump-chain refund (chained enemy-hopping is the skill ceiling).
  p.vel.y = st.bounceVel;
  p.grounded = false;
  if (st.refundsJumps) { p.jumpsUsed = 0; p.jumpChain = 0; }
  world.stompChain++;
  if (en.hp <= 0) killEnemy(world, en, i);
}

// Kill an enemy: mark it dead, fire the legibility flag, drop sparks (spark increment),
// and — for the boss — restore pips (boss kill restores 2, HP economy fold).
export function killEnemy(world, en, i) {
  en.alive = false;
  en.killedThisTick = true;
  world.killedThisTick = i;
  if (en.boss) {
    world.hp = Math.min(world.hpMax, world.hp + world.tune.hp.bossRestore); // boss kill restores 2 pips
    world.bossDefeatedThisTick = true;                                  // act gate cleared (opens the exit path)
  }
  dropSparks(world, en);
}

// Is a live boss still on the current sphere? (Gates the exit on an act-boss sphere.)
export function bossAlive(world) {
  return world.enemies.some((e) => e.boss && e.alive);
}

// Apply `dmg` pips of damage from horizontal direction `fromDir` (unit vector pointing from
// the threat TO the player is passed; we store the reverse as "where it came from" for the
// rim flash). `setIframe` grants i-frames (enemy hits do; the net toll does not stack them).
export function applyDamage(world, dmg, fromDir, setIframe, cause = null) {
  if (world.dead) return;
  world.hp -= dmg;
  world.damagedThisTick = true;
  world.hitDir = { x: -fromDir.x, z: -fromDir.z };
  if (cause) world.deathCause = cause; // last damage source (the fatal one on death)
  if (setIframe) world.iframe = world.tune.hp.iframeMs / 1000;
  if (world.hp <= 0) {
    world.hp = 0;
    world.dead = true;
    world.diedThisTick = true;
    // Death files the causal carnival scorecard and freezes the run (phase 'dead'; the
    // tick loop halts next tick). Tickets are banked by the meta layer from the scorecard.
    world.phase = 'dead';
    world.scorecard = buildScorecard(world, 'death');
  }
}

// Drop sparks from a killed enemy — the single choke-point delegates to effects.js.
function dropSparks(world, en) {
  if (world.sparks) dropSparksFx(world, en);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// FixedStepper — decouples wall-clock frames from sim ticks. The renderer feeds real
// elapsed seconds; this drains them in fixed TIMESTEP chunks, clamping the accumulator so
// a long pause / tab-blur can never trigger a catch-up death (anti "unpause death" law).
export class FixedStepper {
  constructor() { this.accumulator = 0; }

  advance(world, dtSeconds, input = {}) {
    const maxDt = TIMESTEP * MAX_SUBSTEPS;
    this.accumulator += Math.min(dtSeconds, maxDt);
    let steps = 0;
    while (this.accumulator >= TIMESTEP && steps < MAX_SUBSTEPS) {
      stepOnce(world, input);
      this.accumulator -= TIMESTEP;
      steps++;
    }
    return this.accumulator / TIMESTEP;
  }
}

// Deterministic run: fresh world, N fixed ticks, no wall clock. Handy for tests.
export function runTicks(worldSeed, n, input = {}) {
  const world = createWorld(worldSeed);
  for (let i = 0; i < n; i++) stepOnce(world, input);
  return world;
}

export { TIMESTEP, tuning };

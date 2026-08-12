// save.js — continuous autosave / instant resume of sim state (stack law). The
// save captures EXACT sim state including serialized RNG stream positions, so a
// reloaded run cannot re-roll anything (save-scum-proof, systems fold). Pure sim;
// the browser layer wraps this with localStorage + a version tag.
//
// Save-round-trip determinism (verified by test + the M1 probe): serialize
// mid-run, reload, and the next N ticks are byte-identical to never reloading.

import { createWorld } from './world.js';
import { buildScorecard } from './scorecard.js';
import { Rng } from './rng.js';

export const SAVE_VERSION = 4;

// Serialize a world to a plain JSON-able object. Islands/pods/exit are DETERMINISTIC from
// (seed, sphereIndex) via the generator, so we store the seed + sphere index and recompute
// the geometry on load — only the runtime progress (which pods are collected, exit open,
// par elapsed, run complete) plus exact player + RNG state need to be persisted.
export function serializeWorld(world) {
  const p = world.player;
  return {
    v: SAVE_VERSION,
    seed: world.seed,
    tick: world.tick,
    time: world.time,
    rng: world.rng.save(),
    lastGrounded: { ...world.lastGrounded },
    sphereIndex: world.sphereIndex,
    pods: world.pods.map((pod) => (pod.collected ? 1 : 0)), // collected bitmask, order = generated order
    podsCollected: world.podsCollected,
    exitOpen: world.exit.open,
    par: world.par.elapsed,
    parBase: world.par.base, // persisted so a future sphere/caprice-dependent par reconstructs its warn/ramp fractions
    runComplete: world.runComplete,
    // ---- M4 run structure: the drafted build, the curated pool, the active draft (so a
    //      mid-draft save resumes on the same offer — save-fuzz fold), the ticket-payout
    //      counters, and the fatal cause. The scorecard is REBUILT on load (deterministic
    //      from this state), not stored.
    phase: world.phase,
    caprices: (world.caprices || []).slice(),
    pool: (world.pool || []).slice(),
    draft: world.draft
      ? { offer: world.draft.offer.slice(), nextIndex: world.draft.nextIndex, gate: world.draft.gate }
      : null,
    spheresCleared: world.spheresCleared,
    skipTickets: world.skipTickets,
    deathCause: world.deathCause,
    // ---- M3 combat/survival state. The enemy ROSTER shape is recomputed by loadSphere
    //      (deterministic from seed+index); only live mutable state is persisted, by index
    //      (spawn order is deterministic). HP is run-scoped; sparks/projectiles/firework are
    //      in-flight state — all restored so the next N ticks are byte-identical (resume law).
    hp: world.hp, hpMax: world.hpMax, fragments: world.fragments, iframe: world.iframe,
    dead: world.dead, stompChain: world.stompChain, sparkCounter: world._sparkCounter,
    firework: { ...world.firework },
    enemies: world.enemies.map((e) => ({
      alive: e.alive, hp: e.hp, pos: { ...e.pos }, vel: { ...e.vel },
      t: e.t, cool: e.cool, invuln: e.invuln, diving: e.diving,
    })),
    sparks: world.sparks.filter((s) => s.alive).map((s) => ({ pos: { ...s.pos }, vel: { ...s.vel }, life: s.life })),
    projectiles: world.projectiles.filter((p2) => p2.alive).map((p2) => ({ pos: { ...p2.pos }, vel: { ...p2.vel }, life: p2.life })),
    player: {
      pos: { ...p.pos },
      vel: { ...p.vel },
      yaw: p.yaw,
      grounded: p.grounded,
      jumpsUsed: p.jumpsUsed,
      jumpChain: p.jumpChain,
      coyote: p.coyote,
      jumpBuffer: p.jumpBuffer,
      prevJumpHeld: p.prevJumpHeld,
    },
  };
}

// Restore a world from a save object. Throws on an unrecognized/corrupt payload —
// the browser layer catches this and falls back to a fresh run with a LOUD notice
// (save-fuzz fold). Returns a fully-reconstructed world.
export function deserializeWorld(data) {
  if (!data || typeof data !== 'object') throw new Error('save: empty payload');
  if (data.v !== SAVE_VERSION) throw new Error(`save: version ${data.v} != ${SAVE_VERSION}`);
  if (typeof data.seed !== 'number' || !data.player) throw new Error('save: missing seed/player');

  // Recompute the sphere from (seed, sphereIndex) — passing the drafted caprices + curated
  // pool so world.tune/mods/pool reconstruct correctly — then re-apply runtime progress.
  const world = createWorld(
    data.seed >>> 0,
    (data.sphereIndex || 0) >>> 0,
    Array.isArray(data.caprices) ? data.caprices : [],
    Array.isArray(data.pool) && data.pool.length ? data.pool : null,
  );
  world.tick = data.tick >>> 0;
  world.time = data.time;
  world.rng = Rng.load(data.rng);
  world.lastGrounded = { ...data.lastGrounded };
  if (Array.isArray(data.pods)) {
    data.pods.forEach((c, i) => { if (c && world.pods[i]) world.pods[i].collected = true; });
  }
  world.podsCollected = data.podsCollected || 0;
  world.exit.open = !!data.exitOpen;
  world.par.elapsed = data.par || 0;
  if (typeof data.parBase === 'number') world.par.base = data.parBase;
  world.runComplete = !!data.runComplete;

  // ---- M4 run structure. Restore the draft phase + offer (mid-draft resume), the ticket
  //      counters, and the fatal cause, then REBUILD the scorecard for a terminal phase
  //      (deterministic from state). caprices/pool were already applied by createWorld.
  world.phase = typeof data.phase === 'string' ? data.phase : 'play';
  world.draft = data.draft
    ? { offer: (data.draft.offer || []).slice(), nextIndex: data.draft.nextIndex, gate: data.draft.gate }
    : null;
  world.spheresCleared = data.spheresCleared || 0;
  world.skipTickets = data.skipTickets || 0;
  world.deathCause = data.deathCause || null;

  // ---- M3 combat/survival state. Overlay live enemy state onto the recomputed roster by
  //      index; restore HP, sparks, projectiles, firework, and the spark scatter counter.
  if (typeof data.hp === 'number') world.hp = data.hp;
  if (typeof data.hpMax === 'number') world.hpMax = data.hpMax;
  world.fragments = data.fragments || 0;
  world.iframe = data.iframe || 0;
  world.dead = !!data.dead;
  world.stompChain = data.stompChain || 0;
  world._sparkCounter = data.sparkCounter || 0;
  if (data.firework) world.firework = { ...world.firework, ...data.firework };
  if (Array.isArray(data.enemies)) {
    data.enemies.forEach((se, i) => {
      const en = world.enemies[i];
      if (!en) return;
      en.alive = se.alive; en.hp = se.hp;
      en.pos = { ...se.pos }; en.vel = { ...se.vel };
      en.t = se.t; en.cool = se.cool; en.invuln = se.invuln; en.diving = se.diving;
    });
    world.hasBoss = world.enemies.some((e) => e.boss);
  }
  world.sparks = Array.isArray(data.sparks) ? data.sparks.map((s) => ({ pos: { ...s.pos }, vel: { ...s.vel }, life: s.life, alive: true })) : [];
  world.projectiles = Array.isArray(data.projectiles) ? data.projectiles.map((p2) => ({ pos: { ...p2.pos }, vel: { ...p2.vel }, life: p2.life, alive: true })) : [];
  const sp = data.player;
  Object.assign(world.player, {
    pos: { ...sp.pos },
    vel: { ...sp.vel },
    yaw: sp.yaw,
    grounded: sp.grounded,
    jumpsUsed: sp.jumpsUsed,
    jumpChain: sp.jumpChain,
    coyote: sp.coyote,
    jumpBuffer: sp.jumpBuffer,
    prevJumpHeld: sp.prevJumpHeld,
  });

  // Rebuild the causal scorecard for a terminal phase (deterministic from restored state).
  if (world.phase === 'dead') world.scorecard = buildScorecard(world, 'death');
  else if (world.phase === 'victory') world.scorecard = buildScorecard(world, 'victory');
  return world;
}

// Try to restore; on ANY failure return null so the caller can start fresh
// loudly. Accepts either a parsed object or a JSON string.
export function tryDeserialize(raw, log) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return deserializeWorld(data);
  } catch (e) {
    if (log) log.error('save', `corrupt/incompatible save, starting fresh: ${e.message}`);
    return null;
  }
}

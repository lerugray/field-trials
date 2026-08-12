// boss.js — the stage boss with a TELEGRAPHED attack pattern (DESIGN-SEED M3 boss law: every stage
// ends in a telegraphed-pattern boss; M3's is the exemplar). Deterministic phase machine:
// idle (pace toward the player) → telegraph (a readable wind-up) → lunge (fast strike, hit window)
// → recover. The telegraph is the fairness tell the player reads to dodge. HP/damage RE-DERIVED.

import { FEEL } from '../config/feel.js';
import { moveAndCollide } from './collision.js';
import { FACING } from './player.js';

export const BOSS_PHASE = Object.freeze({
  IDLE: 'idle', TELEGRAPH: 'telegraph', LUNGE: 'lunge', RECOVER: 'recover',
});

// Phase durations (ticks) and tuning. Telegraph is long + visible on purpose (fair warning).
const IDLE_TICKS = 70;
const TELEGRAPH_TICKS = 34;
const LUNGE_TICKS = 20;
const RECOVER_TICKS = 44;

export const BOSS_STATS = Object.freeze({
  body: { halfW: 12, halfH: 16 }, // 24×32
  // Stage-1 boss: the exemplar, deliberately gentle — a telegraph-reading fight, not a wall.
  hp: 44, contactDamage: 4, lungeContactDamage: 7, xp: 80, gold: 40,
  paceSpeed: 0.5, lungeSpeed: 3.4,
});

// The boss holds its arena — it never wanders off to fight over hazards elsewhere in the stage.
const ARENA_HALF = 56;

export function createBoss(x, y, facing = FACING.LEFT) {
  return {
    x, y, homeX: x, vx: 0, vy: 0, facing,
    onGround: false,
    hp: BOSS_STATS.hp,
    alive: true,
    phase: BOSS_PHASE.IDLE,
    timer: IDLE_TICKS,
    hitFlash: 0,
    lungeDir: facing,
  };
}

/** Reset an un-beaten boss to full for a fresh re-fight after the player dies (Souls convention). */
export function resetBoss(b) {
  if (!b.alive) return b; // a beaten boss stays beaten — never respawns
  b.x = b.homeX; b.vx = 0; b.vy = 0;
  b.onGround = false;
  b.facing = FACING.LEFT; b.lungeDir = FACING.LEFT;
  b.hp = BOSS_STATS.hp;
  b.phase = BOSS_PHASE.IDLE;
  b.timer = IDLE_TICKS;
  b.hitFlash = 0;
  return b;
}

/** Boss collision/hurt AABB (top-left), feet at boss.y. */
export function bossAabb(b) {
  const { halfW, halfH } = BOSS_STATS.body;
  return { x: b.x - halfW, y: b.y - halfH * 2, w: halfW * 2, h: halfH * 2 };
}

/** True while the boss's strike is live (its dangerous window). */
export function bossStriking(b) {
  return b.phase === BOSS_PHASE.LUNGE;
}

/**
 * Advance the boss one tick. Chases/telegraphs/lunges relative to the player's x.
 * @returns {{phaseChanged:boolean}}
 */
export function stepBoss(b, player, tilemap) {
  if (!b.alive) return { phaseChanged: false };
  const { halfW, halfH } = BOSS_STATS.body;
  const h = halfH * 2;

  let phaseChanged = false;
  b.timer--;

  switch (b.phase) {
    case BOSS_PHASE.IDLE:
      b.facing = player.x < b.x ? FACING.LEFT : FACING.RIGHT;
      b.vx = b.facing * BOSS_STATS.paceSpeed;
      if (b.timer <= 0) { b.phase = BOSS_PHASE.TELEGRAPH; b.timer = TELEGRAPH_TICKS; phaseChanged = true; }
      break;
    case BOSS_PHASE.TELEGRAPH:
      b.vx = 0; // plant and wind up (the tell)
      b.lungeDir = player.x < b.x ? FACING.LEFT : FACING.RIGHT;
      b.facing = b.lungeDir;
      if (b.timer <= 0) { b.phase = BOSS_PHASE.LUNGE; b.timer = LUNGE_TICKS; phaseChanged = true; }
      break;
    case BOSS_PHASE.LUNGE:
      b.vx = b.lungeDir * BOSS_STATS.lungeSpeed;
      if (b.timer <= 0) { b.phase = BOSS_PHASE.RECOVER; b.timer = RECOVER_TICKS; phaseChanged = true; }
      break;
    case BOSS_PHASE.RECOVER:
      b.vx = 0; // vulnerable, catching its breath
      if (b.timer <= 0) { b.phase = BOSS_PHASE.IDLE; b.timer = IDLE_TICKS; phaseChanged = true; }
      break;
    default: break;
  }

  b.vy += FEEL.GRAVITY;
  if (b.vy > FEEL.TERMINAL_FALL) b.vy = FEEL.TERMINAL_FALL;
  const box = { x: b.x - halfW, y: b.y - h, w: halfW * 2, h };
  const res = moveAndCollide(box, b.vx, b.vy, tilemap);
  b.x = box.x + halfW;
  b.y = box.y + h;
  b.onGround = res.onGround;
  if (res.onGround) b.vy = 0;
  // Hold the arena: clamp to home ± ARENA_HALF; a lunge into the boundary ends early.
  const lo = b.homeX - ARENA_HALF, hi = b.homeX + ARENA_HALF;
  if (b.x < lo || b.x > hi) {
    b.x = b.x < lo ? lo : hi;
    if (b.phase === BOSS_PHASE.LUNGE) { b.phase = BOSS_PHASE.RECOVER; b.timer = RECOVER_TICKS; }
  }
  if (res.hitX && b.phase === BOSS_PHASE.LUNGE) { b.phase = BOSS_PHASE.RECOVER; b.timer = RECOVER_TICKS; }

  if (b.hitFlash > 0) b.hitFlash--;
  return { phaseChanged };
}

/** Contact damage the boss deals right now (heavier mid-lunge). */
export function bossContactDamage(b) {
  return bossStriking(b) ? BOSS_STATS.lungeContactDamage : BOSS_STATS.contactDamage;
}

/** Apply damage; only vulnerable outside... actually always damageable, but recover is the opening. */
export function damageBoss(b, amount) {
  if (!b.alive) return { killed: false, xp: 0, gold: 0 };
  b.hp -= amount;
  b.hitFlash = 6;
  if (b.hp <= 0) {
    b.alive = false;
    return { killed: true, xp: BOSS_STATS.xp, gold: BOSS_STATS.gold };
  }
  return { killed: false, xp: 0, gold: 0 };
}

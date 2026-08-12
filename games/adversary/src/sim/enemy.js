// enemy.js — stage trash enemies + their AI patterns (DESIGN-SEED M3: enemies, AI patterns).
// Deterministic, tile-aware: a walker patrols and turns at walls and ledges; a hopper does the same
// but periodically hops. Contact damage stays FLAT per enemy type, honoring the source's observed
// behavior (STUDY.md §5.3). Names are placeholder descriptors (NAMES-PENDING.md). All enemy-side
// stats (HP/xp/gold/damage) are RE-DERIVED tuning targets.

import { FEEL } from '../config/feel.js';
import { moveAndCollide, isGrounded } from './collision.js';
import { FACING } from './player.js';

// Enemy type table. body is half-extents. Placeholder ids/names only.
export const ENEMY_TYPES = Object.freeze({
  walker: Object.freeze({
    id: 'walker', name: 'walker', aiKind: 'patrol',
    body: { halfW: 7, halfH: 8 }, speed: 0.6,
    hp: 12, contactDamage: 4, xp: 8, gold: 2,
  }),
  hopper: Object.freeze({
    id: 'hopper', name: 'hopper', aiKind: 'patrol', hop: true, hopEvery: 48, hopVelocity: 4.2,
    body: { halfW: 7, halfH: 7 }, speed: 0.5,
    hp: 10, contactDamage: 5, xp: 10, gold: 3,
  }),
});

/** Spawn an enemy of a type at feet-position (x, y). */
export function createEnemy(typeId, x, y, facing = FACING.LEFT) {
  const type = ENEMY_TYPES[typeId];
  if (!type) throw new Error(`unknown enemy type ${typeId}`);
  return {
    type,
    x, y,
    spawnX: x, spawnY: y, spawnFacing: facing, // for trash respawn (Souls rest/death)
    vx: 0, vy: 0,
    facing,
    onGround: false,
    hp: type.hp,
    alive: true,
    hopTimer: 0,
    hitFlash: 0,
  };
}

/** Reset a trash enemy to its spawn (respawn on death/rest; bosses never call this). */
export function resetEnemy(e) {
  e.x = e.spawnX; e.y = e.spawnY; e.facing = e.spawnFacing;
  e.vx = 0; e.vy = 0; e.onGround = false;
  e.hp = e.type.hp; e.alive = true; e.hopTimer = 0; e.hitFlash = 0;
  return e;
}

/** Enemy collision/hurt AABB (top-left), from feet position. */
export function enemyAabb(e) {
  const { halfW, halfH } = e.type.body;
  return { x: e.x - halfW, y: e.y - halfH * 2, w: halfW * 2, h: halfH * 2 };
}

/**
 * Advance one enemy by a tick against the tilemap. Patrol AI: walk forward, turn at walls and at
 * ledges (no ground ahead). Hoppers add a periodic hop. Mutates e.
 */
export function stepEnemy(e, tilemap) {
  if (!e.alive) return e;
  const type = e.type;
  const { halfW, halfH } = type.body;
  const h = halfH * 2;

  // horizontal patrol
  e.vx = e.facing * type.speed;

  // hop cadence
  if (type.hop && e.onGround) {
    e.hopTimer++;
    if (e.hopTimer >= type.hopEvery) { e.vy = -type.hopVelocity; e.hopTimer = 0; e.onGround = false; }
  }

  // gravity
  e.vy += FEEL.GRAVITY;
  if (e.vy > FEEL.TERMINAL_FALL) e.vy = FEEL.TERMINAL_FALL;

  const box = { x: e.x - halfW, y: e.y - h, w: halfW * 2, h };
  const res = moveAndCollide(box, e.vx, e.vy, tilemap);
  e.x = box.x + halfW;
  e.y = box.y + h;
  e.onGround = res.onGround;
  if (res.onGround) e.vy = 0;

  // turn at a wall
  if (res.hitX) e.facing = -e.facing;

  // turn at a ledge (only while grounded, so hops don't false-trigger a flip mid-air)
  if (e.onGround) {
    const aheadX = e.x + e.facing * (halfW + 2);
    const footY = e.y + 2;
    if (!tilemap.solidAtPx(aheadX, footY)) e.facing = -e.facing;
  }

  if (e.hitFlash > 0) e.hitFlash--;
  return e;
}

/**
 * Apply damage to an enemy. Returns {killed, xp, gold} (rewards only on the killing blow).
 */
export function damageEnemy(e, amount) {
  if (!e.alive) return { killed: false, xp: 0, gold: 0 };
  e.hp -= amount;
  e.hitFlash = 6;
  if (e.hp <= 0) {
    e.alive = false;
    return { killed: true, xp: e.type.xp, gold: e.type.gold };
  }
  return { killed: false, xp: 0, gold: 0 };
}

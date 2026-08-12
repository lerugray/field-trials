// melee.js — base melee attack controller (DESIGN-SEED M2: "base melee per equipped weapon,
// always available"). A deterministic timing state machine: an attack has an active hit window,
// then a cooldown taken from the weapon's speed. The hitbox is placed in front of the attacker by
// facing + weapon reach; a single attack lands on each overlapping target at most once. Pure and
// headless-testable — the seeded stage-clear bot (M3) drives this without a browser.

import { FACING } from './player.js';

export const ATTACK_PHASE = Object.freeze({ IDLE: 'idle', ACTIVE: 'active', RECOVER: 'recover' });

// Ticks the hitbox is live once an attack starts. Short — the "swing connects" window.
const ACTIVE_TICKS = 4;
const VISUAL_FRAMES = 4;
const VISUAL_FRAME_TICKS = 2;
const VISUAL_TICKS = VISUAL_FRAMES * VISUAL_FRAME_TICKS;
const NO_ATTACK_VISUAL = Object.freeze({ active: false, frame: -1 });

/** Create an attack controller state. */
export function createAttack() {
  return { phase: ATTACK_PHASE.IDLE, timer: 0, cooldown: 0, hitIds: null, visualTimer: 0 };
}

/** True if a new attack can start (idle and off cooldown). */
export function canAttack(atk) {
  return atk.phase === ATTACK_PHASE.IDLE && atk.cooldown <= 0;
}

/**
 * Advance the attack controller one tick.
 * @param {object} atk - attack state (mutated).
 * @param {object} intent - {attackPressed:boolean}
 * @param {object} weapon - equipped weapon (uses cooldownTicks).
 * @returns {{started:boolean, hitActive:boolean}}
 */
export function stepMelee(atk, intent, weapon) {
  if (atk.cooldown > 0) atk.cooldown--;
  if (atk.visualTimer > 0) atk.visualTimer--;
  let started = false;

  if (canAttack(atk) && intent?.attackPressed) {
    atk.phase = ATTACK_PHASE.ACTIVE;
    atk.timer = ACTIVE_TICKS;
    atk.hitIds = new Set(); // fresh per-attack hit ledger (one hit per target per swing)
    atk.cooldown = weapon?.cooldownTicks ?? 12;
    atk.visualTimer = VISUAL_TICKS;
    started = true;
  }

  let hitActive = false;
  if (atk.phase === ATTACK_PHASE.ACTIVE) {
    hitActive = true;
    atk.timer--;
    if (atk.timer <= 0) {
      atk.phase = ATTACK_PHASE.IDLE;
    }
  }
  return { started, hitActive };
}

/**
 * Minimal read-only render view of the current swing. Its longer visual window does not alter the
 * mechanical active window or cooldown; four frames held for two ticks keep the attack legible.
 */
export function attackVisualView(atk) {
  if (!atk || atk.visualTimer <= 0) return NO_ATTACK_VISUAL;
  const elapsed = VISUAL_TICKS - atk.visualTimer;
  return Object.freeze({
    active: true,
    frame: Math.min(VISUAL_FRAMES - 1, Math.floor(elapsed / VISUAL_FRAME_TICKS)),
  });
}

/**
 * Axis-aligned hitbox in front of the attacker for the current weapon reach.
 * @param {object} attacker - {x,y,facing} where (x,y) is the body center.
 * @param {object} weapon - uses reach.
 * @param {object} [body] - {halfW,halfH} attacker half-extents (defaults to a 16×24 body).
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function meleeHitbox(attacker, weapon, body = { halfW: 8, halfH: 12 }) {
  const reach = weapon?.reach ?? 8;
  const h = body.halfH * 2;
  const y = attacker.y - body.halfH;
  if (attacker.facing === FACING.LEFT) {
    return { x: attacker.x - body.halfW - reach, y, w: reach, h };
  }
  return { x: attacker.x + body.halfW, y, w: reach, h };
}

/** AABB overlap test. */
export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Resolve an active swing against targets, returning those newly hit this swing (deduped via the
 * attack's hit ledger so one swing never double-hits a target).
 * @param {object} atk - attack state (its hitIds ledger is updated).
 * @param {object} hitbox - from meleeHitbox.
 * @param {Array<{id:*, aabb:{x,y,w,h}}>} targets
 * @returns {Array} the subset of targets newly struck.
 */
export function resolveMeleeHits(atk, hitbox, targets) {
  if (atk.phase !== ATTACK_PHASE.ACTIVE || !atk.hitIds) return [];
  const struck = [];
  for (const t of targets) {
    if (atk.hitIds.has(t.id)) continue;
    if (aabbOverlap(hitbox, t.aabb)) {
      atk.hitIds.add(t.id);
      struck.push(t);
    }
  }
  return struck;
}

// Player survival — hull, invulnerability frames, and the damage-source
// attribution that DESIGN-SEED makes a fairness law, not polish: every hit records
// WHAT hit you ("ASTEROID", "ENEMY FIRE", "COLLISION") so the HUD can tell you and
// a run's cause of death is a real field (the M6 flight log reads it). Pure +
// headless-testable; main.js owns only the render/shake/flash feedback.
//
// The baseline ship must be able to clear a clean first run with zero upgrades
// (DESIGN-SEED economy rule), so hull is forgiving and a hit grants generous
// i-frames — you are never chain-stunned to death by one unlucky cluster.

import { projectileHits } from './projectiles.js';
import { obstacleHit } from '../flight/obstacles.js';

export const PLAYER = {
  maxHull: 6,
  invuln: 1.2,        // seconds of i-frames after any hit
  radius: 0.7,
  shakeDecay: 0.45,   // seconds for a hit's shake impulse to fade to zero
  dmgRock: 1,
  dmgEnemyBolt: 1,
  dmgContact: 2,
};

const clampDt = (dt) => (dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt);

export function createPlayerState() {
  return {
    hull: PLAYER.maxHull,
    maxHull: PLAYER.maxHull,
    invuln: 0,
    alive: true,
    lastHitBy: null,   // attribution string of the most recent hit
    hitAt: -999,       // timestamp (seconds) of the most recent hit
    shake: 0,          // normalized shake impulse [0,1], decays each frame
    hits: 0,
  };
}

// Apply `amount` damage from `source`. i-frames and death gate it. Returns true
// only when damage actually LANDS, so callers trigger shake/flash on a real hit
// (not on a grazing bolt during i-frames). now is seconds (for the HUD callout).
export function damagePlayer(state, amount, source, now) {
  if (!state.alive || state.invuln > 0) return false;
  state.hull -= amount;
  state.invuln = PLAYER.invuln;
  state.lastHitBy = source;
  state.hitAt = now;
  state.hits++;
  state.shake = 1;
  if (state.hull <= 0) { state.hull = 0; state.alive = false; }
  return true;
}

export function updatePlayer(state, dt) {
  dt = clampDt(dt);
  if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt / PLAYER.shakeDecay);
  return state;
}

// --- hazard resolution (all pure; ship = { s, lat, vert, radius }) -----------

// Enemy bolts that touch the ship are consumed; the first to land does the damage
// (subsequent ones this frame are eaten by i-frames but still spent — you can't be
// double-tapped in one instant). While `deflecting` (mid barrel-roll), touching
// bolts are harmlessly knocked out instead of landing. Returns true if a hit landed.
export function resolveEnemyBolts(projectiles, ship, player, now, deflecting = false) {
  let landed = false;
  for (const p of projectiles.list) {
    if (p.dead || p.team !== 'enemy') continue;
    if (!projectileHits(p, ship, ship.radius)) continue;
    p.dead = true;
    if (deflecting) { p.deflected = true; continue; }
    if (damagePlayer(player, PLAYER.dmgEnemyBolt, 'ENEMY FIRE', now)) landed = true;
  }
  return landed;
}

// Flying into an asteroid (the M2 obstacle course collision seam, wired here).
export function resolveObstacle(course, ship, player, now) {
  if (obstacleHit(course, ship.s, ship.lat, ship.vert, ship.radius)) {
    return damagePlayer(player, PLAYER.dmgRock, 'ASTEROID', now);
  }
  return false;
}

// Clipping a living enemy. The enemy is unharmed (a graze, not a free ram-kill);
// i-frames keep it from grinding your hull as you pass through.
export function resolveEnemyContact(enemies, ship, player, now) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const rr = e.radius + ship.radius;
    if (Math.abs(e.s - ship.s) > rr) continue;
    const dl = e.lat - ship.lat, dv = e.vert - ship.vert;
    if (dl * dl + dv * dv < rr * rr) {
      return damagePlayer(player, PLAYER.dmgContact, 'COLLISION', now);
    }
  }
  return false;
}

// Combat resolution — the seam where player bolts meet enemies. Pure + headless:
// no rendering, no timing, just "who hit what and what died". Run state (score,
// kills, accuracy tally) lives here too so a run's outcome is one plain object the
// flight log (M6) can archive.

import { projectileHits } from './projectiles.js';
import { spawnExplosion } from './explosions.js';

export const DAMAGE = { bolt: 1, chargedBolt: 3 };

export function createRunState() {
  return { score: 0, kills: 0, shotsFired: 0, shotsHit: 0 };
}

// Resolve every live player bolt against the given (living) enemies. On a hit the
// bolt is marked dead and subtracts hp; on a kill the enemy is flagged dead, its
// score banked, and an explosion spawned at its position. One bolt hits at most
// one enemy (break). Returns the number of kills this call.
// boltBonus (M6 Blaster Coils upgrade) adds flat damage to every player bolt.
export function resolvePlayerHits(projectiles, enemies, explosions, run, boltBonus = 0) {
  const bonus = boltBonus > 0 ? boltBonus : 0;
  let kills = 0;
  for (const p of projectiles.list) {
    if (p.dead || p.team !== 'player') continue;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (!projectileHits(p, e, e.radius)) continue;
      p.dead = true;
      run.shotsHit++;
      e.hp -= (p.charged ? DAMAGE.chargedBolt : DAMAGE.bolt) + bonus;
      if (e.hp <= 0) {
        e.alive = false;
        run.kills++;
        run.score += e.score;
        spawnExplosion(explosions, { s: e.s, lat: e.lat, vert: e.vert, scale: e.radius * 1.3 });
        kills++;
      }
      break;
    }
  }
  return kills;
}

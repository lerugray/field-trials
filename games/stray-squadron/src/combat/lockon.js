// Charge-shot lock-on acquisition. Pure + headless: given the live enemies and the
// ship's rail-relative aim, pick the nearest enemy inside the forward lock cone.
// The charged shot fired on release curves onto whatever this returns.
//
// The cone follows the shot's own convergence line (bolts ease from the wing offset
// toward center), and widens with distance so a far target is still catchable. The
// lock STATE gets a shape cue in the HUD (brackets), never color alone — the
// accessibility law is explicit that lock-on/threat states are shape + color.

export const LOCK = {
  // How far ahead a target can be locked. 160 let the HUD lock brackets sit on an
  // enemy still deep in fog (shortest sector far is 58) — a "LOCKING" reticle
  // floating over nothing. Kept a touch past GUNNER_FIRE.rangeS (enemies.js) so a
  // lock can start just as the target is fading into view, never before.
  rangeS: 35,
  minAhead: 8,     // never lock something basically on top of you
  coneBase: 1.1,   // cone half-width at the ship (rail units)
  coneSlope: 0.018, // extra half-width per unit of distance
};

// enemies: array of enemy objects; ship: { s, lat, vert }; convergeDist: the
// shot-convergence distance (PROJECTILE.convergeDist). Returns the locked enemy or
// null. Nearest-ahead wins so the lock feels like "the next thing in your sights".
export function acquireLock(enemies, ship, convergeDist) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = e.s - ship.s;
    if (d < LOCK.minAhead || d > LOCK.rangeS) continue;
    const t = Math.min(1, d / convergeDist);
    const aimLat = ship.lat * (1 - t);
    const aimVert = ship.vert * (1 - t);
    const cone = LOCK.coneBase + d * LOCK.coneSlope;
    const dl = e.lat - aimLat;
    const dv = e.vert - aimVert;
    if (dl * dl + dv * dv > cone * cone) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

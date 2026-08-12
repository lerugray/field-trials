// Blaster projectiles — player bolts (and, from M3.4, enemy bolts). Everything is
// tracked in rail-relative coordinates (station s + frame offset lat/vert), the
// same space as obstacles, enemies, and the ship, so collision is a cheap sphere
// test and rendering reuses railFrame(). Pure + headless-testable; main.js steps
// the pool each frame and draws a bolt mesh per live projectile.
//
// Player bolts travel forward (+s) and their lateral/vertical offset eases toward
// zero over convergeDist — that IS the shot convergence the reticle promises
// (STUDY.md §3.2): fire from the wings, cross at the aim point. Enemy bolts travel
// back toward the player (-s) on a straight, telegraphed, dodgeable line.

export const PROJECTILE = {
  playerSpeed: 90,   // rail units/sec, forward (+s)
  enemySpeed: 48,    // rail units/sec, toward the player (-s)
  life: 2.4,         // seconds before despawn
  convergeDist: 30,  // forward distance over which a player bolt eases to its aim
  radius: 0.32,      // normal bolt collision/visual radius
  chargedRadius: 0.9, // a charged lock-on bolt is fat + forgiving
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createProjectiles() {
  return { list: [], nextId: 1 };
}

// Spawn one bolt. team: 'player' | 'enemy'. s/lat/vert are the launch point in
// rail-relative space. A player bolt eases from its launch offset toward its aim
// point (aimLat/aimVert, default center 0,0 — the shot convergence); a charged
// lock-on bolt sets its aim to the locked target so it curves onto it. `charged`
// makes it fat + high-damage.
export function spawnProjectile(pool, { team, s, lat, vert, charged = false, aimLat = 0, aimVert = 0 }) {
  const p = {
    id: pool.nextId++,
    team,
    s,
    lat, vert,
    lat0: lat, vert0: vert, // launch offset, for convergence easing
    aimLat, aimVert,        // where the bolt converges to (center, or a lock)
    spawnS: s,
    age: 0,
    charged,
    radius: charged ? PROJECTILE.chargedRadius : PROJECTILE.radius,
    dead: false,
  };
  pool.list.push(p);
  return p;
}

// Advance every bolt by dt and drop the dead ones. dt is clamped by the caller's
// frame loop; we also guard here so a monster gap cannot warp a bolt across a
// whole level in one step (which would skip collisions — a fairness bug).
export function stepProjectiles(pool, dt) {
  dt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
  for (const p of pool.list) {
    p.age += dt;
    if (p.team === 'player') {
      p.s += PROJECTILE.playerSpeed * dt;
      const traveled = p.s - p.spawnS;
      const t = clamp01(traveled / PROJECTILE.convergeDist);
      p.lat = p.aimLat + (p.lat0 - p.aimLat) * (1 - t);
      p.vert = p.aimVert + (p.vert0 - p.aimVert) * (1 - t);
    } else {
      p.s -= PROJECTILE.enemySpeed * dt;
    }
    if (p.age > PROJECTILE.life) p.dead = true;
  }
  pool.list = pool.list.filter((p) => !p.dead);
  return pool;
}

// Sphere overlap test between a bolt and a rail-relative target {s, lat, vert,
// radius}. Along-rail reject first (cheap), then the frame-plane disk.
export function projectileHits(p, target, targetRadius) {
  const pr = p.radius != null ? p.radius : PROJECTILE.radius;
  const r = pr + (targetRadius != null ? targetRadius : target.radius || 0);
  if (Math.abs(p.s - target.s) > r) return false;
  const dl = p.lat - target.lat;
  const dv = p.vert - target.vert;
  return dl * dl + dv * dv < r * r;
}

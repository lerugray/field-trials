// enemies.js — the BESTIARY (M3). Four code-drawn, billboarded archetypes plus the
// act-1 boss, spawned as a DETERMINISTIC roster from (worldSeed, sphereIndex) — exactly
// like the island layout, so createWorld/loadSphere reproduces the same roster and a
// resume recomputes it without storing it. Live mutable state (pos, vel, alive, hp,
// timers) is what the save persists; the roster shape is recomputed.
//
// Behaviors are PURE sim: driven by (local time + a per-enemy phase) and simple steering
// that reads live player position. No Math.random per tick, no wall clock (determinism
// law). Contact resolution (stomp vs hit) lives in world.js — this module only spawns and
// moves the roster.

import { Stream } from './rng.js';
import { tuning } from './tuning.js';

const TWO_PI = Math.PI * 2;

// True when the player is inside the spawn-pad safety zone. Enemies in targeting
// behaviors (swooper dive, boss chase/slam) ignore the player while they remain in
// this zone, so the spawn drop and the updraft-net respawn are not immediately
// knocked back into a fall->net->fall loop.
function playerInSpawnSafety(player, T) {
  const r = T.enemies.spawnSafetyRadius || 0;
  return r > 0 && Math.hypot(player.pos.x, player.pos.z) < r;
}

// Distinct per-sphere enemy seed (FNV-ish fold, different salt from layoutSeed so the
// enemy roster is independent of the island layout stream).
export function enemySeed(worldSeed, sphereIndex) {
  let h = (0x9e3779b1 ^ (worldSeed >>> 0)) >>> 0;
  h = Math.imul(h ^ (sphereIndex >>> 0), 0x85ebca77);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae3d); h ^= h >>> 16;
  return h >>> 0;
}

// How many base enemies a sphere gets (teaching sphere 0 has none — the leap is taught
// before the first enemies, wayfinding fold).
export function enemyCountFor(sphereIndex, T = tuning) {
  if (sphereIndex <= 0) return 0;
  const e = T.enemies;
  const n = Math.round(e.perSphereBase + (sphereIndex - 1) * e.perSpherePerIndex);
  return Math.max(0, Math.min(e.maxPerSphere, n));
}

// Is this sphere an act-boss gate? (M3 builds act-1's boss, index 2.)
export function isBossSphere(sphereIndex, T = tuning) {
  return T.run.actBossSpheres.includes(sphereIndex);
}

// Build the enemy roster for a sphere. `islands` is the generated archipelago (islands[0]
// is the spawn pad, never seeded an enemy). Returns an array of enemy objects with both
// their fixed shape (type, home, phase, hpMax, r) and initial live state (pos, vel, alive,
// hp, timers). Deterministic from (worldSeed, sphereIndex, islands).
export function actForSphere(sphereIndex) { return Math.max(0, Math.floor(sphereIndex / 3)); }

export function spawnEnemies(worldSeed, sphereIndex, islands, T = tuning) {
  const e = T.enemies;
  const act = actForSphere(sphereIndex); // 0/1/2 → act difficulty ramp
  const rng = new Stream(enemySeed(worldSeed, sphereIndex));
  const chain = [];
  for (let i = 1; i < islands.length; i++) chain.push(i); // eligible island indices (skip spawn pad)
  const out = [];

  // The act boss (each act's third sphere): a single boss on the FAR island (the exit
  // island), scaled by the act (hp + speed), plus a light escort so the arena isn't empty.
  const bossHere = isBossSphere(sphereIndex, T);
  if (bossHere && chain.length) {
    const islIdx = chain[chain.length - 1];
    out.push(makeBoss(islands[islIdx], islIdx, T, act));
  }

  const count = enemyCountFor(sphereIndex, T);
  const TYPES = ['drifter', 'turret', 'hopper', 'swooper'];
  // Spawn-safety zone: no enemy is seeded on islands close enough to the spawn pad that
  // their normal behavior (a swooper dive, a boss lunge) can reach a stationary player on
  // the pad. The spawn pad itself (island 0) is already excluded; this extends the safe
  // margin to nearby chain islands so the no-input spawn drop and net respawn are safe.
  const safety = T.enemies.spawnSafetyRadius || 0;
  const safe = (islIdx) => Math.hypot(islands[islIdx].cx, islands[islIdx].cz) >= safety;
  let safePool = chain.filter(safe);
  // Fallback: if the layout is so compact that every chain island is inside the safety
  // radius, allow the farthest island so the sphere still has enemies (the validator's
  // reachability guarantees are unchanged; this is an extreme edge case).
  if (safePool.length === 0 && chain.length) {
    safePool = [chain[chain.length - 1]];
  }
  for (let k = 0; k < count; k++) {
    // Spread across chain islands; never the exit island when a boss owns it.
    let pool = bossHere ? safePool.slice(0, Math.max(1, safePool.length - 1)) : safePool;
    if (pool.length === 0 && chain.length) pool = [chain[chain.length - 1]];
    const islIdx = pool[rng.int(0, pool.length)];
    const type = TYPES[rng.int(0, TYPES.length)];
    const phase = rng.range(0, TWO_PI);
    out.push(makeEnemy(type, islands[islIdx], islIdx, phase, rng, T, act));
  }
  return out;
}

// A normal enemy of `type` anchored to `isl` (island idx `islIdx`). `act` sets the per-act
// speed scale (only the swooper's air-dive threat sharpens; ambient archetypes keep their
// tuned timing so later acts feel busier without the whole sky speeding up).
function makeEnemy(type, isl, islIdx, phase, rng, T, act = 0) {
  const e = T.enemies;
  const cfg = e[type];
  const speedScale = type === 'swooper' ? (1 + act * e.act.speedMulPerAct) : 1;
  const home = { x: isl.cx, y: isl.topY, z: isl.cz };
  // Grounded types (turret/hopper) start on the top; air types (drifter/swooper) aloft.
  let y = isl.topY;
  if (type === 'drifter') y = isl.topY + cfg.alt;
  else if (type === 'swooper') y = isl.topY + cfg.patrolY;
  else if (type === 'turret') y = isl.topY + cfg.restY;
  const en = {
    type, island: islIdx, hpMax: cfg.hp, r: cfg.r, speedScale,
    home, phase,
    // Live state (saved/restored):
    pos: { x: home.x, y, z: home.z },
    vel: { x: 0, y: 0, z: 0 },
    alive: true, hp: cfg.hp,
    t: 0,             // local time (seconds) — advances with the sim
    cool: 0,          // generic cooldown timer for state-machine behaviors
    invuln: 0,        // i-frames (boss stomp spacing); normal enemies leave 0
    boss: false,
    diving: false,    // swooper/boss lunge flag
    hitThisTick: false, killedThisTick: false,
  };
  return en;
}

function makeBoss(isl, islIdx, T, act = 0) {
  const b = T.enemies.boss;
  const home = { x: isl.cx, y: isl.topY, z: isl.cz };
  const bossHp = b.hp + act * T.enemies.act.bossHpPerAct;
  const speedScale = 1 + act * T.enemies.act.bossSpeedMulPerAct;
  return {
    type: 'boss', island: islIdx, hpMax: bossHp, r: b.r, speedScale,
    home, phase: 0,
    pos: { x: home.x, y: home.y + b.restY, z: home.z },
    vel: { x: 0, y: 0, z: 0 },
    alive: true, hp: bossHp,
    t: 0, cool: b.slamInterval, invuln: 0,
    boss: true, diving: false,
    hitThisTick: false, killedThisTick: false,
  };
}

// Advance every live enemy one fixed step against the current player position. Pure sim.
export function updateEnemies(enemies, player, dt, T = tuning) {
  for (const en of enemies) {
    en.hitThisTick = false;
    en.killedThisTick = false;
    if (!en.alive) continue;
    en.t += dt;
    if (en.invuln > 0) en.invuln = Math.max(0, en.invuln - dt);
    if (en.boss) { updateBoss(en, player, dt, T); continue; }
    switch (en.type) {
      case 'drifter': updateDrifter(en, dt, T); break;
      case 'turret': updateTurret(en, dt, T); break;
      case 'hopper': updateHopper(en, dt, T); break;
      case 'swooper': updateSwooper(en, player, dt, T); break;
    }
  }
}

// Drifter: floats a slow horizontal ring over its home island, with a gentle vertical bob.
function updateDrifter(en, dt, T) {
  const c = T.enemies.drifter;
  const a = en.phase + en.t * (c.driftSpeed / Math.max(0.01, c.driftRadius));
  const nx = en.home.x + Math.cos(a) * c.driftRadius;
  const nz = en.home.z + Math.sin(a) * c.driftRadius;
  const ny = en.home.y + c.alt + Math.sin(en.phase + en.t * c.bobRate) * c.bob;
  setVelTo(en, nx, ny, nz, dt);
}

// Turret-flower: rooted on the island top, only a small breathing bob (stomp target; the
// projectile attack is a later increment — it is already a legible, killable body).
function updateTurret(en, dt, T) {
  const c = T.enemies.turret;
  const nx = en.home.x, nz = en.home.z;
  const ny = en.home.y + c.restY + Math.sin(en.phase + en.t * c.bobRate) * c.bob;
  setVelTo(en, nx, ny, nz, dt);
}

// Hopper: parks on its island and hops around it in a seeded circular arc — each hop a
// parabola so it reads as a bouncing body (chainable stomp target).
function updateHopper(en, dt, T) {
  const c = T.enemies.hopper;
  const period = c.hopPeriod;
  const cyc = ((en.t + en.phase) % period) / period; // 0..1 within a hop
  // Which hop are we on → an angle around the island for the landing spots.
  const hopIdx = Math.floor((en.t + en.phase) / period);
  const ang0 = en.phase + hopIdx * 2.399963; // golden-angle stride so hops spread evenly
  const ang1 = en.phase + (hopIdx + 1) * 2.399963;
  const x0 = en.home.x + Math.cos(ang0) * c.hopRange, z0 = en.home.z + Math.sin(ang0) * c.hopRange;
  const x1 = en.home.x + Math.cos(ang1) * c.hopRange, z1 = en.home.z + Math.sin(ang1) * c.hopRange;
  const nx = x0 + (x1 - x0) * cyc;
  const nz = z0 + (z1 - z0) * cyc;
  const arc = 4 * cyc * (1 - cyc); // 0→1→0 parabola over the hop
  const ny = en.home.y + arc * c.hopHeight;
  setVelTo(en, nx, ny, nz, dt);
}

// Swooper: patrols a high ring; on a periodic interval it DIVES toward the player's current
// position, then climbs back to the patrol ring. Homing reads live player pos (deterministic
// given saved state) — no captured target needed.
function updateSwooper(en, player, dt, T) {
  const c = T.enemies.swooper;
  const cyc = (en.t + en.phase) % c.diveInterval;
  const diving = cyc < c.diveDur;
  const unsafe = playerInSpawnSafety(player, T);
  en.diving = diving && !unsafe;
  if (diving && !unsafe) {
    // Steer toward the player at diveSpeed (scaled per act — later acts dive harder).
    const dv = c.diveSpeed * (en.speedScale || 1);
    moveToward(en, player.pos.x, player.pos.y, player.pos.z, dv, dt);
  } else {
    // Fly back toward the moving high-ring patrol target at a bounded recovery
    // speed. The old absolute assignment teleported a swooper from the end of its
    // dive straight back onto the orbit on the first recovery tick.
    const a = en.phase + en.t * c.patrolRate;
    const nx = en.home.x + Math.cos(a) * c.patrolRadius;
    const nz = en.home.z + Math.sin(a) * c.patrolRadius;
    const ny = en.home.y + c.patrolY;
    moveToward(en, nx, ny, nz, c.recoverSpeed * (en.speedScale || 1), dt);
  }
}

// Boss: hovers/chases the player, and on a slam interval lunges toward them (telegraphed by
// the cooldown timer). Stomp-to-damage; boss i-frames space multi-stomp so one bounce = one hit.
function updateBoss(en, player, dt, T) {
  const b = T.enemies.boss;
  const sc = en.speedScale || 1; // per-act speed scale (later acts press harder)
  en.cool -= dt;
  const restY = en.home.y + b.restY + Math.sin(en.phase + en.t * b.bobRate) * b.bob;
  const unsafe = playerInSpawnSafety(player, T);
  if (unsafe) {
    // The player is in the spawn safety zone; the boss returns to its arena home
    // rather than chasing them onto the spawn pad. This keeps the spawn drop and
    // net respawn on solid ground and prevents fall->net->fall loops at sphere start.
    en.diving = false;
    if (en.cool <= 0) en.cool = b.slamInterval;
    moveToward(en, en.home.x, restY, en.home.z, b.chaseSpeed * sc, dt);
    return;
  }
  if (en.cool <= b.slamDur && en.cool > 0) {
    // Slam window: lunge toward the player.
    en.diving = true;
    const dx = player.pos.x - en.pos.x, dy = player.pos.y - en.pos.y, dz = player.pos.z - en.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    en.pos.x += (dx / d) * b.slamSpeed * sc * dt;
    en.pos.y += (dy / d) * b.slamSpeed * sc * dt;
    en.pos.z += (dz / d) * b.slamSpeed * sc * dt;
  } else {
    if (en.cool <= 0) en.cool = b.slamInterval; // recharge
    en.diving = false;
    // Drift toward the player horizontally, ease Y back to the hover rest height.
    const dx = player.pos.x - en.pos.x, dz = player.pos.z - en.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    en.pos.x += (dx / d) * b.chaseSpeed * sc * dt;
    en.pos.z += (dz / d) * b.chaseSpeed * sc * dt;
    en.pos.y += (restY - en.pos.y) * Math.min(1, 4 * dt);
  }
}

// Move an enemy to a target position this tick and record the implied velocity (for the
// renderer / knockback direction). Used by the periodic (non-homing) behaviors.
function setVelTo(en, nx, ny, nz, dt) {
  en.vel.x = (nx - en.pos.x) / dt;
  en.vel.y = (ny - en.pos.y) / dt;
  en.vel.z = (nz - en.pos.z) / dt;
  en.pos.x = nx; en.pos.y = ny; en.pos.z = nz;
}

// Move toward a target without ever covering more than speed*dt. Used by the
// swooper's attack/recovery state transition so changing targets cannot become a
// position snap, and records the actual velocity for render legibility.
function moveToward(en, nx, ny, nz, speed, dt) {
  const dx = nx - en.pos.x, dy = ny - en.pos.y, dz = nz - en.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= 1e-9) { en.vel.x = en.vel.y = en.vel.z = 0; return; }
  const step = Math.min(d, speed * dt);
  const k = step / d;
  const mx = dx * k, my = dy * k, mz = dz * k;
  en.pos.x += mx; en.pos.y += my; en.pos.z += mz;
  en.vel.x = mx / dt; en.vel.y = my / dt; en.vel.z = mz / dt;
}

export default { spawnEnemies, updateEnemies, enemyCountFor, isBossSphere, enemySeed };

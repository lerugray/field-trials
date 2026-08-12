// Seeded enemy waves. Like the obstacle course, the whole roster is generated up
// front from the run seed (determinism is the seeded-world contract) and lives in
// rail-relative space (station s + frame offset lat/vert). Enemies hold station in
// the corridor and weave within a bounded band; the ship advances toward them and
// shoots them down as it closes (a rail shooter — you don't chase, they arrive).
// Pure + headless-testable. Hit/death is wired in M3.3; enemy fire in M3.4.
//
// Enemies come in WAVES — small clusters at a shared station — not an even drip,
// so combat has a pulse. Every enemy stays inside the reachable steer band so a
// contact is always dodgeable (fairness; the batch harness formalizes this in M4).

import { makeRng } from '../core/rng.js';
import { spawnProjectile } from './projectiles.js';

export const ENEMY_KINDS = {
  drone: { hp: 1, radius: 0.8, ampL: 1.4, ampV: 0.7, freq: 1.1, score: 100 },
  gunner: { hp: 3, radius: 1.05, ampL: 0.9, ampV: 0.5, freq: 0.6, score: 250 },
};

export const WAVE = {
  firstS: 60,        // no combat right at the start line
  gapMinS: 40,       // along-rail spacing between wave centers
  gapMaxS: 58,       // (kept tight enough that a wave chunk never leaves a dead tail)
  sizeMin: 2,        // enemies per wave
  sizeMax: 4,
  bandL: 2.0,        // base-position bound (inside steerRangeX 3.4)
  bandV: 1.2,        // (inside steerRangeY 2.1)
  spreadS: 8,        // along-rail jitter of members within a wave
};

// Construct one enemy at along-rail station `s` for wave `waveId`. Kept as the
// single source of truth for an enemy's shape + draw order so createEnemies (the
// legacy whole-rail roster) and fillWaveChunk (the M4 grammar's per-chunk fill)
// produce identical enemies from identical draws.
// `droneP` (S6): probability a spawn is a light drone vs a heavier gunner. Base 0.65
// keeps the same single rng draw and comparison as before, so baseline output is
// byte-identical; route threat lowers it (more gunners) on harder branches.
export function spawnEnemyAt(rng, s, waveId, id, droneP = 0.65) {
  const kind = rng.range(0, 1) < droneP ? 'drone' : 'gunner';
  const k = ENEMY_KINDS[kind];
  return {
    id,
    waveId,
    kind,
    s: s + rng.range(-WAVE.spreadS, WAVE.spreadS),
    lat0: rng.range(-WAVE.bandL, WAVE.bandL),
    vert0: rng.range(-WAVE.bandV, WAVE.bandV),
    lat: 0, vert: 0,
    ampL: k.ampL, ampV: k.ampV, freq: k.freq,
    phaseL: rng.range(0, Math.PI * 2),
    phaseV: rng.range(0, Math.PI * 2),
    t: rng.range(0, 10), // desync so a wave doesn't move in lockstep
    hp: k.hp, maxHp: k.hp,
    radius: k.radius,
    score: k.score,
    alive: true,
    spin: rng.range(0, Math.PI * 2),
    // gunners fire; stagger the first shot so a wave doesn't volley in lockstep
    fireCd: kind === 'gunner' ? rng.range(0.5, GUNNER_FIRE.interval) : 0,
  };
}

// Fill one 'wave' chunk [s0, s1) with clustered waves, appending to `list`. Used
// by the M4 encounter grammar; guarantees at least one wave (s0 < s1). Returns the
// next free waveId/id so the caller can chain chunks. `rng` should be a per-chunk
// fork so one chunk's draws never desync another's.
// `opts` (S6) — route-threat knobs; both default to the baseline so an omitted opts
// (or threat 2) draws the same rng sequence as before. `sizeMax` caps enemies/wave;
// `droneP` sets the drone/gunner mix.
export function fillWaveChunk(rng, s0, s1, list, startWaveId = 0, startId = 1, opts = {}) {
  const sizeMax = opts.sizeMax != null ? opts.sizeMax : WAVE.sizeMax;
  const droneP = opts.droneP != null ? opts.droneP : 0.65;
  let waveS = s0;
  let waveId = startWaveId;
  let id = startId;
  while (waveS < s1) {
    const size = rng.int(WAVE.sizeMin, sizeMax);
    for (let i = 0; i < size; i++) list.push(spawnEnemyAt(rng, waveS, waveId, id++, droneP));
    waveId++;
    waveS += rng.range(WAVE.gapMinS, WAVE.gapMaxS);
  }
  return { waveId, id };
}

// Build the full seeded roster between sStart and sMax. Each enemy carries its
// weave parameters and a live phase `t`; runtime advances t and reads pose.
export function createEnemies(seed, sStart = WAVE.firstS, sMax = 1400) {
  const rng = makeRng(String(seed) + ':enemies');
  const list = [];
  let waveS = Math.max(sStart, WAVE.firstS);
  let waveId = 0;
  let id = 1;
  while (waveS < sMax) {
    const size = rng.int(WAVE.sizeMin, WAVE.sizeMax);
    for (let i = 0; i < size; i++) list.push(spawnEnemyAt(rng, waveS, waveId, id++));
    waveId++;
    waveS += rng.range(WAVE.gapMinS, WAVE.gapMaxS);
  }
  // seed every enemy's initial pose so a still frame (t already advanced above)
  // reads correctly without a step
  for (const e of list) poseEnemy(e);
  return list;
}

// Weave the enemy's current lat/vert around its base. Kept inside the band so it
// never wanders out of the reachable/dodgeable frame.
export function poseEnemy(e) {
  e.lat = clampBand(e.lat0 + e.ampL * Math.sin(e.freq * e.t + e.phaseL), WAVE.bandL + e.ampL);
  e.vert = clampBand(e.vert0 + e.ampV * Math.sin(e.freq * 0.85 * e.t + e.phaseV), WAVE.bandV + e.ampV);
  return e;
}

function clampBand(v, b) { return v < -b ? -b : v > b ? b : v; }

// Advance all living enemies by dt (weave only — they hold station). Enemies far
// behind the ship are marked dead (culled) so the active set stays small.
export function updateEnemies(enemies, shipS, dt) {
  dt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
  for (const e of enemies) {
    if (!e.alive) continue;
    e.t += dt;
    poseEnemy(e);
    if (e.s < shipS - 14) e.alive = false; // passed well behind -> gone
  }
  return enemies;
}

// The living enemies within an along-rail window ahead of the ship — the set the
// renderer draws and hit detection scans.
export function activeEnemies(enemies, shipS, aheadS = 220) {
  return enemies.filter((e) => e.alive && e.s > shipS - 14 && e.s < shipS + aheadS);
}

// S5: the same window, filtered INTO a caller-owned scratch array (no per-frame array
// allocation in the hot loop). Rebuilt fresh each call from the source list, so reuse is
// safe. Returns `out`.
export function activeEnemiesInto(out, enemies, shipS, aheadS = 220) {
  out.length = 0;
  for (const e of enemies) {
    if (e.alive && e.s > shipS - 14 && e.s < shipS + aheadS) out.push(e);
  }
  return out;
}

export const GUNNER_FIRE = {
  interval: 1.9,   // seconds between a gunner's shots
  // Only fires while close enough to actually be SEEN — "a fair, arriving threat"
  // requires being visible, not just in range. Every sector's fog fully hides
  // anything past its `far` (shortest is 58, Ashfall); 130 let gunners open up from
  // deep inside the fog, so the player took "HIT: ENEMY FIRE" from a threat that
  // was not on screen (operator report, 2026-08-07: "can't see any enemies in the
  // first level" — confirmed via instrumented playthrough, not a spawn/render bug,
  // an engagement-range-vs-visibility mismatch). Kept comfortably under the
  // shortest fog.far so the gunner has faded into view before it can act.
  rangeS: 30,
  minAhead: 6,     // never point-blank at the ship's own station
};

// Gunners in range fire a bolt aimed at the player's CURRENT offset — a straight,
// telegraphed, dodgeable shot (it takes ~2s+ to arrive from max range, so you can
// always move off the line). Drones never shoot. Returns bolts fired this step.
export function updateEnemyFire(enemies, ship, projectiles, dt) {
  dt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
  let fired = 0;
  for (const e of enemies) {
    if (!e.alive || e.kind !== 'gunner') continue;
    const ahead = e.s - ship.s;
    if (ahead < GUNNER_FIRE.minAhead || ahead > GUNNER_FIRE.rangeS) continue;
    e.fireCd -= dt;
    if (e.fireCd <= 0) {
      spawnProjectile(projectiles, { team: 'enemy', s: e.s, lat: ship.lat, vert: ship.vert });
      e.fireCd = GUNNER_FIRE.interval;
      fired++;
    }
  }
  return fired;
}

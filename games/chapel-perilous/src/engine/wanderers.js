// M8 WORLD CHARACTER — visible overworld wanderers (directive §5, Ray lock: BOTH
// layers). The mundane living-world layer: NPCs and common monsters you can SEE
// on the map, dodge, and chase (the Ultima move). The ENCOUNTERS LOCK's invisible,
// rare, genuinely-unfair ambush tail (encounters.js, per-step) stays UNCHANGED
// underneath — this is the visible mundane layer, not a replacement.
//
// Deterministic + seeded like everything in the stack: every spawn and every move
// is a pure function of (wanderer uid, tick, world seed), so a replayed tick
// sequence reproduces the roster exactly (unit-tested). The roster is a small live
// window around the party — wanderers that drift too far are culled and fresh ones
// spawn, so the world always feels populated without tracking the whole map.

import { hash2, hashInt } from './prng.js';

const CARDINALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function createWanderers({
  world, bestiary, names, biomes = null, seed = 0,
  count = 6, radius = 7, minSpawnDist = 3, chaseChance = 0.55,
  densityFor = null,
} = {}) {
  const wseed = seed >>> 0;
  // Mundane overworld monsters only — sacred beings never wander the commons.
  const beastPool = bestiary.all()
    .filter((b) => (b.habitat || []).includes('overworld') && !b.sacred)
    .map((b) => b.id);

  // M9 BIOMES (monster channel): inside a guaranteed area, beasts are drawn from
  // that biome's own pool (its distinct mix) instead of the global overworld
  // pool. Sacred beings never wander even if a biome lists them. Open country
  // falls back to the global pool. Deterministic (pool depends only on tile).
  function beastPoolAt(x, y) {
    if (biomes) {
      const b = biomes.biomeAt(x, y);
      if (b && b.wanderers && b.wanderers.length) {
        const local = b.wanderers.filter((id) => bestiary.has(id) && !bestiary.get(id).sacred);
        if (local.length) return local;
      }
    }
    return beastPool;
  }

  let tick = 0;
  let uidCounter = 0;
  let roster = [];

  const manhattan = (x, y, px, py) => Math.abs(x - px) + Math.abs(y - py);
  const occupiedBy = (x, y, self) => roster.some((w) => w !== self && w.x === x && w.y === y);

  // A tile a wanderer may STAND on (spawn/rest): passable, not a site landmark,
  // not the party tile, not already taken.
  function standable(x, y, px, py, self = null) {
    if (x === px && y === py) return false;
    if (!world.passable(x, y)) return false;
    if (world.siteAt(x, y)) return false;
    if (occupiedBy(x, y, self)) return false;
    return true;
  }

  function makeWanderer(uid, x, y) {
    const pool = beastPoolAt(x, y);
    const isBeast = pool.length > 0 && hash2(uid, 0x9a, wseed ^ 0xbeef) < 0.4;
    if (isBeast) {
      const beingId = pool[Math.floor(hash2(uid, 1, wseed ^ 0xb00) * pool.length) % pool.length];
      return { uid, x, y, kind: 'beast', beingId, name: bestiary.get(beingId).name, hostile: true };
    }
    return { uid, x, y, kind: 'npc', beingId: null, name: names.npcAt(uid, tick, wseed), hostile: false };
  }

  // Spawn one wanderer on a seeded standable tile in the party's ring. Returns
  // true on success (false if the neighbourhood is impassable, e.g. open sea).
  function spawnOne(px, py) {
    const uid = ++uidCounter;
    const cands = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < minSpawnDist || d > radius) continue;
        const x = px + dx, y = py + dy;
        if (standable(x, y, px, py)) cands.push([x, y]);
      }
    }
    if (!cands.length) return false;
    const idx = hashInt(uid, tick, wseed) % cands.length;
    const [x, y] = cands[idx];
    roster.push(makeWanderer(uid, x, y));
    return true;
  }

  // Keep the roster near the region's TARGET density (E5): fewer wanderers in quiet/
  // safe country, more only where it's dangerous or populated — density as a signal,
  // not noise. densityFor(px,py) supplies the cap; absent, the fixed `count` (tests).
  function populate(px, py) {
    const target = densityFor ? Math.max(0, densityFor(px, py) | 0) : count;
    roster = roster.filter((w) => manhattan(w.x, w.y, px, py) <= radius + 2);
    if (roster.length > target) {
      // Over the cap (e.g. walked from a dangerous area into a safe one): drop the
      // farthest wanderers so the nearest `target` remain.
      roster.sort((a, b) => manhattan(b.x, b.y, px, py) - manhattan(a.x, a.y, px, py));
      roster = roster.slice(roster.length - target);
    }
    let guard = 0;
    while (roster.length < target && guard++ < (target + count) * 6) {
      if (!spawnOne(px, py)) break;
    }
  }

  // A wanderer standing on (x,y), if any (peek — does not remove).
  function at(x, y) {
    return roster.find((w) => w.x === x && w.y === y) || null;
  }

  // Remove and return the wanderer on (x,y) — the party walked INTO it (chase).
  function take(x, y) {
    const i = roster.findIndex((w) => w.x === x && w.y === y);
    if (i < 0) return null;
    return roster.splice(i, 1)[0];
  }

  // Advance the world one tick: every wanderer moves one tile. Beasts bias toward
  // the party (a chase you can still outrun); NPCs random-walk (easily dodged).
  // Returns the wanderers that stepped ONTO the party tile (removed from roster —
  // the shell resolves them). Then culls the far ones and repopulates.
  function step(px, py) {
    tick += 1;
    for (const w of roster) {
      let nx = w.x, ny = w.y;
      const chase = w.kind === 'beast' && hash2(w.uid, tick, wseed ^ 0x9) < chaseChance;
      if (chase) {
        const dx = Math.sign(px - w.x), dy = Math.sign(py - w.y);
        // Close the larger gap first; seeded tiebreak when equal.
        const ax = Math.abs(px - w.x), ay = Math.abs(py - w.y);
        if (ax > ay || (ax === ay && hash2(w.uid, tick, wseed ^ 0x7) < 0.5)) nx = w.x + (dx || 0);
        else ny = w.y + (dy || 0);
      } else {
        const d = CARDINALS[Math.floor(hash2(w.uid, tick, wseed ^ 0x55) * 4) % 4];
        nx = w.x + d[0]; ny = w.y + d[1];
      }
      // Stepping onto the party tile is a legal move (that IS the collision);
      // otherwise the tile must be standable.
      if (nx === px && ny === py) { w.x = nx; w.y = ny; }
      else if (world.passable(nx, ny) && !world.siteAt(nx, ny) && !occupiedBy(nx, ny, w)) { w.x = nx; w.y = ny; }
    }
    const collisions = roster.filter((w) => w.x === px && w.y === py);
    if (collisions.length) roster = roster.filter((w) => !(w.x === px && w.y === py));
    populate(px, py);
    return collisions;
  }

  // Build a one-foe overworld encounter from a hostile wanderer (feeds
  // session.startCombat). The mundane visible layer — a single common monster.
  function encounterFor(w) {
    if (!w || w.kind !== 'beast' || !w.beingId) return null;
    return { kind: 'fight', unfair: false, source: 'wanderer', foes: [bestiary.toCombatantSpec(w.beingId, 1)] };
  }

  function serialize() {
    return { tick, uidCounter, roster: roster.map((w) => ({ ...w })) };
  }
  function restore(snap) {
    if (!snap) return;
    tick = snap.tick | 0;
    uidCounter = snap.uidCounter | 0;
    roster = Array.isArray(snap.roster) ? snap.roster.map((w) => ({ ...w })) : [];
  }

  return {
    populate, step, at, take, encounterFor,
    list: () => roster.map((w) => ({ ...w })),
    get count() { return roster.length; },
    get tick() { return tick; },
    serialize, restore,
    beastPool: () => beastPool.slice(),
  };
}

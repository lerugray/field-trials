// M8 WORLD CHARACTER — visible dungeon enemies + sneak (directive §5, Ray
// verbatim: enemies visible in the dungeons, with the option to sneak by "like
// how it works in cyclopean 2"). Enemies occupy specific cells of the assembled
// dungeon; the crawl renders the one ahead so you SEE it, and stepping into its
// cell offers confront-or-slip-past. Sneaking resolves through the existing stat
// system — NERVE, the nerve-to-hold-still stat (STAT_VERB nerve→overawe; here it
// buys the composure to pass unseen). No new stat, per the "verbs from stats" lock.
//
// Deterministic + seeded: placement and every sneak roll are pure functions of
// (cell, dungeon seed, attempt#), so a dungeon always holds the same enemies and a
// replayed attempt sequence reproduces. Unit-tested.

import { hash2, hashInt } from './prng.js';

// The first live enemy in a cell down the corridor ahead of the crawler (A1, M12).
// Scans EVERY forward fine-tile out to a couple of segments so visibility gives
// CONTINUOUS coverage of the forward cells — it must never alias on the crawler's
// offset within its current segment (the old n=[3,4,6] fine-tile sampling missed
// cells at some mod-segmentSize offsets, making a corridor enemy flicker in and out
// depending purely on approach). Pure: (dungeon, crawl-like {ahead,cell}, life-like
// {at}). Returns the enemy or null; skips the crawler's own cell.
export function enemyInCorridor(dungeon, crawl, life) {
  if (!dungeon || !crawl || !life) return null;
  const here = crawl.cell();
  const reach = 2 * dungeon.segmentSize + 1; // clears the current cell from any offset
  for (let n = 1; n <= reach; n++) {
    const a = crawl.ahead(n);
    if (!dungeon.inBounds(a.x, a.y)) break; // straight line — once out, stays out
    const c = dungeon.cellAt(a.x, a.y);
    if (!c || (here && c.cx === here.cx && c.cy === here.cy)) continue;
    const e = life.at(c.cx, c.cy);
    if (e) return e;
  }
  return null;
}

export function createDungeonLife(dungeon, { bestiary, seed = 0, max = 3, cells = null, beingIdFor = null } = {}) {
  const dseed = seed >>> 0;
  const seg = dungeon.segmentSize;
  // Mundane dungeon dwellers only — the sacred (chapel-warden, the thing in the
  // 23rd corridor) are never mere roadblocks you can tiptoe past.
  const pool = bestiary.all()
    .filter((b) => (b.habitat || []).includes('dungeon') && !b.sacred)
    .map((b) => b.id);

  const entrance = dungeon.cellAt(dungeon.start.x, dungeon.start.y);
  const isEntrance = (c) => entrance && c.cx === entrance.cx && c.cy === entrance.cy;
  // Interior cells (never the entrance cell), candidate-ranked. Procedural
  // dungeons (the default) rank every grid cell by a seeded key → stable pick
  // across the whole dungeon. Authored dungeons (Structure Arc slice 1, LOCK 2)
  // pass their own fixed `cells` — the ROOM is authored, only the occupant
  // still randomizes (see `beingIdFor` below).
  const ranked = cells
    ? cells.filter((c) => c && !isEntrance(c))
    : dungeon.grid
      .filter((c) => c && !isEntrance(c))
      .map((c) => ({ c, k: hash2(c.cx, c.cy, dseed ^ 0x1abe1) }))
      .sort((a, b) => a.k - b.k)
      .map((o) => o.c);

  const enemies = [];
  const n = pool.length === 0 ? 0 : Math.min(max, ranked.length);
  for (let i = 0; i < n; i++) {
    const c = ranked[i];
    // beingIdFor lets an authored dungeon draw from its own per-spawn pool
    // (falling back to the dungeon-habitat pool above); omitted, this is the
    // original procedural pick — identical behavior, unchanged.
    const beingId = beingIdFor ? beingIdFor(c, pool) : pool[hashInt(c.cx, c.cy, dseed ^ 0x5a) % pool.length];
    if (!beingId) continue;
    enemies.push({
      cx: c.cx, cy: c.cy, beingId, name: bestiary.get(beingId).name,
      state: 'live', attempts: 0,
      tile: { x: c.cx * seg + (seg >> 1), y: c.cy * seg + (seg >> 1) },
    });
  }

  const live = (e) => e.state === 'live';
  function at(cx, cy) { return enemies.find((e) => e.cx === cx && e.cy === cy && live(e)) || null; }
  // The live enemy in the cell containing tile (x,y), if any.
  function atTile(x, y) { const c = dungeon.cellAt(x, y); return c ? at(c.cx, c.cy) : null; }

  // Sneak past: a NERVE-gated attempt. Success (composure holds) marks the enemy
  // bypassed (it won't block again); failure blows it and forces the fight.
  // p rises with the PC's NERVE rank (0..3): shaky ~0.35 → uncanny ~0.83.
  function sneak(enemy, pc, s = 0) {
    if (!enemy || !live(enemy)) return { success: false, p: 0 };
    enemy.attempts += 1;
    const nerve = pc && typeof pc.rankIndex === 'function' ? pc.rankIndex('nerve') : 1;
    const p = Math.min(0.9, 0.35 + 0.16 * nerve);
    const roll = hash2(enemy.cx, enemy.cy, ((s >>> 0) ^ (enemy.attempts * 0x9e3779b1)) >>> 0);
    const success = roll < p;
    if (success) enemy.state = 'bypassed';
    return { success, p };
  }

  function clear(enemy) { if (enemy) enemy.state = 'cleared'; }

  // A single-foe, non-unfair dungeon fight (the visible mundane layer, distinct
  // from the invisible ambush tail stepEncounter still rolls).
  function encounterFor(enemy) {
    if (!enemy || !enemy.beingId) return null;
    return { kind: 'fight', unfair: false, source: 'dungeon', foes: [bestiary.toCombatantSpec(enemy.beingId, 1)] };
  }

  function serialize() { return { enemies: enemies.map((e) => ({ ...e, tile: { ...e.tile } })) }; }
  function restore(snap) {
    if (!snap || !Array.isArray(snap.enemies)) return;
    enemies.length = 0;
    for (const e of snap.enemies) enemies.push({ ...e, tile: { ...e.tile } });
  }

  return {
    at, atTile, sneak, clear, encounterFor,
    list: () => enemies.map((e) => ({ ...e })),
    liveList: () => enemies.filter(live).map((e) => ({ ...e })),
    get count() { return enemies.filter(live).length; },
    serialize, restore,
    pool: () => pool.slice(),
  };
}

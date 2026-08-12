// authoreddungeon.js — Structure Arc slice 1 (STRUCTURE-ARC-LOCKS-2026-08-05.md
// LOCK 2): the first hand-authored dungeon interior, and the loader format every
// authored dungeon after it reuses.
//
// A hand-authored layout is DATA — an ASCII floor plan ('#' wall, '.' floor) plus
// authored entrance/start/milestone/spawn coordinates — never generated at
// runtime. CONTENTS randomize WITHIN authored budgets: each `spawns[]` entry is a
// fixed ROOM whose OCCUPANT is drawn from a seeded pool (see beingIdFor); each
// `milestones[]` entry is a fixed point granting a guaranteed item once, so a run
// through this dungeon cannot dead-end on loot luck. The LAYOUT itself never
// varies (LOCK 2's "authored dungeon interiors, randomized contents").
//
// The assembled object matches assembleDungeon()'s shape (dungeon.js) field for
// field — seed/segmentSize/width/height/tiles/tileAt/floorAt/passable/cellAt/
// inBounds/entrance/start/floorCount — so every existing consumer (createCrawl,
// renderFP, createDungeonLife, the minimap, describeRoom, styleFor) keeps working
// UNCHANGED; this reuses that machinery rather than duplicating it (the "reuse
// existing generation for anything not explicitly authored" hard constraint).
//
// segmentSize is fixed at 1 and every grid "cell" is exactly one fine tile
// (cx=x, cy=y): dungeon.js's own cellAt() assumes uniform M×M segments, which
// fits the procedural kit's stitched prefabs but not an irregular authored room
// layout. A visible side effect: enemyInCorridor's forward-visibility reach
// (2*segmentSize+1 = 3 tiles) is shorter here than in a typical procedural
// dungeon — an acceptable, close-quarters read for a small hand-authored space;
// worth an eyeball in the browser lane, not a functional gap.

import { hashInt } from './prng.js';

export function assembleAuthoredDungeon(data, opts = {}) {
  if (!data || !Array.isArray(data.rows) || !data.rows.length) {
    throw new Error('assembleAuthoredDungeon: data.rows required');
  }
  const seed = (opts.seed ?? 0) >>> 0;
  const rows = data.rows;
  const height = rows.length;
  const width = rows[0].length;
  for (const r of rows) {
    if (r.length !== width) throw new Error('assembleAuthoredDungeon: every row must be the same width');
  }
  const FLOOR = '.', WALL = '#';
  const tiles = new Array(width * height);
  const cellByKey = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = rows[y][x] === FLOOR ? FLOOR : WALL;
      tiles[y * width + x] = t;
      if (t === FLOOR) cellByKey.set(`${x},${y}`, { cx: x, cy: y, exits: [], prefab: 'authored' });
    }
  }

  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const tileAt = (x, y) => (inBounds(x, y) ? tiles[y * width + x] : WALL);
  const floorAt = (x, y) => tileAt(x, y) === FLOOR;

  const e = data.entrance;
  if (!e || e.x == null || e.y == null || !e.dir) throw new Error('assembleAuthoredDungeon: data.entrance {x,y,dir} required');
  if (!floorAt(e.x, e.y)) throw new Error('assembleAuthoredDungeon: entrance tile is not floor');
  const entrance = { x: e.x | 0, y: e.y | 0, dir: e.dir };

  const st = data.start;
  if (!st || st.x == null || st.y == null || !st.facing) throw new Error('assembleAuthoredDungeon: data.start {x,y,facing} required');
  if (!floorAt(st.x, st.y)) throw new Error('assembleAuthoredDungeon: start tile is not floor');
  const start = { x: st.x | 0, y: st.y | 0, facing: st.facing };

  // Milestones (LOCK 2): fixed authored points, granted once. `seed` is threaded
  // through for parity with loot.js's rollTraversal/rollKill pattern even though
  // an authored milestone's item is fixed data today, not rolled.
  const milestones = (data.milestones || []).map((m, i) => ({
    id: m.id || `milestone-${i}`,
    x: m.x | 0, y: m.y | 0,
    kind: m.kind || 'relic',
    artifact: m.artifact || null,
    description: m.description || '[SEED] a marked find',
    tags: Array.isArray(m.tags) ? m.tags.slice() : [],
    taken: false,
  }));
  for (const m of milestones) {
    if (!floorAt(m.x, m.y)) throw new Error(`assembleAuthoredDungeon: milestone '${m.id}' is not on a floor tile`);
  }
  /** Grant the milestone at (x,y) once, or null if none / already taken. */
  function takeMilestoneAt(x, y) {
    const m = milestones.find((mm) => mm.x === x && mm.y === y && !mm.taken);
    if (!m) return null;
    m.taken = true;
    return { kind: m.kind, artifact: m.artifact, description: m.description, tags: m.tags.slice() };
  }
  function serializeMilestones() { return milestones.map((m) => ({ id: m.id, taken: m.taken })); }
  function restoreMilestones(snap) {
    if (!Array.isArray(snap)) return;
    for (const s of snap) { const m = milestones.find((mm) => mm.id === s.id); if (m) m.taken = !!s.taken; }
  }

  // Interior gates (Operation 3 teach-moment): optional authored door tiles that
  // mirror the overworld gate shape ({id, x, y, requiresTag, label}). The tile stays
  // floor in the ASCII plan so the layout remains one connected region; movement is
  // blocked by the gate state until a carried item matching requiresTag is spent at it.
  const gates = (data.gates || []).map((g, i) => ({
    id: g.id || `gate-${i}`,
    x: g.x | 0, y: g.y | 0,
    requiresTag: g.requiresTag || null,
    label: g.label || g.id || `gate-${i}`,
  }));
  for (const g of gates) {
    if (!floorAt(g.x, g.y)) throw new Error(`assembleAuthoredDungeon: gate '${g.id}' is not on a floor tile`);
  }
  const openedGates = new Set();
  function gateAt(x, y) { return gates.find((g) => g.x === x && g.y === y) || null; }
  function isGateOpen(id) { return openedGates.has(id); }
  function openGate(id) {
    if (!gates.find((g) => g.id === id) || openedGates.has(id)) return false;
    openedGates.add(id);
    return true;
  }
  const passable = (x, y) => floorAt(x, y) && !(gateAt(x, y) && !isGateOpen(gateAt(x, y).id));
  const cellAt = (x, y) => cellByKey.get(`${x | 0},${y | 0}`) || null;

  // Spawns (LOCK 2): fixed authored rooms; the occupant randomizes within the
  // room's own pool (or a caller-supplied fallback pool — see beingIdFor),
  // seeded so a given dungeon seed always draws the same being (deterministic
  // and replayable, matching the ENCOUNTERS LOCK's seeded-not-omniscient spirit
  // applied to a fixed point rather than a fixed roll).
  const spawns = (data.spawns || []).map((s, i) => ({
    id: s.id || `spawn-${i}`,
    x: s.x | 0, y: s.y | 0,
    pool: Array.isArray(s.pool) && s.pool.length ? s.pool.slice() : null,
  }));
  for (const s of spawns) {
    if (!floorAt(s.x, s.y)) throw new Error(`assembleAuthoredDungeon: spawn '${s.id}' is not on a floor tile`);
  }
  function beingIdFor(spawn, fallbackPool) {
    const pool = spawn && spawn.pool && spawn.pool.length ? spawn.pool : fallbackPool;
    if (!pool || !pool.length) return null;
    const r = hashInt(spawn.x, spawn.y, seed ^ 0x0a170e5);
    return pool[r % pool.length];
  }
  function spawnAt(cx, cy) {
    return spawns.find((s) => s.x === cx && s.y === cy) || null;
  }

  return {
    seed, segmentSize: 1, width, height,
    grid: [...cellByKey.values()], tiles, tileAt, floorAt, passable, cellAt, inBounds,
    entrance, start,
    get floorCount() { return tiles.reduce((n, t) => n + (t === FLOOR ? 1 : 0), 0); },
    // Authored-only surface, not part of assembleDungeon()'s contract — consumed
    // by main.js's enterSite() for milestone pickup and fixed-spawn wiring.
    milestones, takeMilestoneAt, serializeMilestones, restoreMilestones,
    // Optional interior gates (Operation 3); absent in earlier layouts, additive only.
    gates, gateAt, isGateOpen, openGate,
    spawns,
    spawnCells: () => spawns.map((s) => ({ cx: s.x, cy: s.y })),
    spawnAt,
    beingIdFor,
  };
}
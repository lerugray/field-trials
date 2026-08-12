// Dungeons: assembled from modular segment prefabs (the tile-kit in
// data/dungeon/kit.json), NOT hand-built monoliths — the Cyclopean format,
// clean-room. A seeded spanning-tree maze over an M×M cell grid decides which
// edges each cell connects; each cell's exit-signature selects a matching
// prefab, and the prefabs stitch into one fine tile map the party crawls in
// first person. Everything is deterministic in the dungeon seed.
import { mulberry32 } from './prng.js';

// Cardinal facings, in a fixed order so signatures canonicalise consistently.
export const FACINGS = ['N', 'E', 'S', 'W'];
export const VEC = { N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 } };
export const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const LEFT = { N: 'W', W: 'S', S: 'E', E: 'N' };
export const RIGHT = { N: 'E', E: 'S', S: 'W', W: 'N' };

// Canonical exit-signature: dirs in FACINGS order, e.g. ['E','N'] -> 'NE'.
export function signature(exits) {
  const set = new Set(exits);
  return FACINGS.filter((d) => set.has(d)).join('');
}

// Index a prefab kit by exit-signature, validating that each prefab's authored
// openings actually match its declared exits (the tile-kit invariant). Multiple
// prefabs may share a signature (variants); selection among them is seeded.
export function createDungeonKit(kit) {
  if (!kit || !Array.isArray(kit.prefabs)) throw new Error('createDungeonKit: kit.prefabs required');
  const size = kit.segmentSize | 0;
  if (size < 3) throw new Error('createDungeonKit: segmentSize must be >= 3');
  const wall = kit.wall ?? '#';
  const floor = kit.floor ?? '.';
  const mid = (size - 1) / 2;
  if (mid !== Math.floor(mid)) throw new Error('createDungeonKit: segmentSize must be odd');

  const bySig = new Map();
  for (const p of kit.prefabs) {
    if (!Array.isArray(p.rows) || p.rows.length !== size) {
      throw new Error(`prefab ${p.id}: rows must be ${size} lines`);
    }
    for (const r of p.rows) {
      if (r.length !== size) throw new Error(`prefab ${p.id}: row '${r}' not width ${size}`);
    }
    // The opening for an edge is the middle cell of that border row/column.
    const opens = {
      N: p.rows[0][mid] === floor,
      S: p.rows[size - 1][mid] === floor,
      W: p.rows[mid][0] === floor,
      E: p.rows[mid][size - 1] === floor,
    };
    for (const d of FACINGS) {
      const declared = p.exits.includes(d);
      if (declared !== opens[d]) {
        throw new Error(`prefab ${p.id}: exit '${d}' declared=${declared} but opening=${opens[d]}`);
      }
    }
    const sig = signature(p.exits);
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(p);
  }

  function pick(exits, rng) {
    const sig = signature(exits);
    const variants = bySig.get(sig);
    if (!variants || !variants.length) throw new Error(`no prefab for signature '${sig}'`);
    return variants[Math.floor(rng() * variants.length)];
  }

  return { segmentSize: size, wall, floor, pick, variantsFor: (exits) => bySig.get(signature(exits)) || [] };
}

// Carve a spanning-tree maze over an M×M cell grid. Returns per-cell exit sets
// (which of N/E/S/W connect to a neighbour). Deterministic in `rng`.
function carveMaze(M, rng) {
  const exits = Array.from({ length: M * M }, () => new Set());
  const visited = new Array(M * M).fill(false);
  const idx = (cx, cy) => cy * M + cx;
  let cx = Math.floor(rng() * M);
  let cy = Math.floor(rng() * M);
  const stack = [[cx, cy]];
  visited[idx(cx, cy)] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nbrs = [];
    for (const d of FACINGS) {
      const v = VEC[d];
      const nx = x + v.dx;
      const ny = y + v.dy;
      if (nx >= 0 && nx < M && ny >= 0 && ny < M && !visited[idx(nx, ny)]) nbrs.push([d, nx, ny]);
    }
    if (!nbrs.length) { stack.pop(); continue; }
    const [d, nx, ny] = nbrs[Math.floor(rng() * nbrs.length)];
    exits[idx(x, y)].add(d);
    exits[idx(nx, ny)].add(OPP[d]);
    visited[idx(nx, ny)] = true;
    stack.push([nx, ny]);
  }
  return exits;
}

// Assemble a dungeon from the kit. opts: { seed, cells (M, default 5) }.
// One boundary cell gets an extra outward exit — the mouth that returns to the
// overworld. Returns the stitched fine tile map plus entrance/start metadata.
export function assembleDungeon(kit, opts = {}) {
  const dk = kit.pick ? kit : createDungeonKit(kit); // accept raw kit or prepared
  const seed = (opts.seed ?? 0) >>> 0;
  const M = (opts.cells ?? 5) | 0;
  if (M < 2) throw new Error('assembleDungeon: cells must be >= 2');
  const rng = mulberry32(seed);
  const seg = dk.segmentSize;
  const mid = (seg - 1) / 2;
  const idx = (cx, cy) => cy * M + cx;

  const exits = carveMaze(M, rng);

  // Choose the mouth: a boundary cell + an outward-pointing direction.
  const mouths = [];
  for (let cx = 0; cx < M; cx++) { mouths.push([cx, 0, 'N']); mouths.push([cx, M - 1, 'S']); }
  for (let cy = 0; cy < M; cy++) { mouths.push([0, cy, 'W']); mouths.push([M - 1, cy, 'E']); }
  const [mcx, mcy, mdir] = mouths[Math.floor(rng() * mouths.length)];
  exits[idx(mcx, mcy)].add(mdir); // knock the outer mouth into the entrance cell's prefab

  // Pick a prefab per cell and stitch into the fine tile map.
  const width = M * seg;
  const height = M * seg;
  const tiles = new Array(width * height).fill(dk.wall);
  const grid = new Array(M * M);
  for (let cy = 0; cy < M; cy++) {
    for (let cx = 0; cx < M; cx++) {
      const cellExits = FACINGS.filter((d) => exits[idx(cx, cy)].has(d));
      const prefab = dk.pick(cellExits, rng);
      grid[idx(cx, cy)] = { cx, cy, exits: cellExits, prefab: prefab.id };
      for (let ry = 0; ry < seg; ry++) {
        for (let rx = 0; rx < seg; rx++) {
          tiles[(cy * seg + ry) * width + (cx * seg + rx)] = prefab.rows[ry][rx];
        }
      }
    }
  }

  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const tileAt = (x, y) => (inBounds(x, y) ? tiles[y * width + x] : dk.wall);
  const floorAt = (x, y) => tileAt(x, y) === dk.floor;
  const passable = floorAt;
  const cellAt = (x, y) => (inBounds(x, y) ? grid[idx(Math.floor(x / seg), Math.floor(y / seg))] : null);

  // Mouth fine-tile: the opening cell in the entrance cell's outer border.
  const mouth = { N: [mcx * seg + mid, mcy * seg], S: [mcx * seg + mid, mcy * seg + seg - 1], W: [mcx * seg, mcy * seg + mid], E: [mcx * seg + seg - 1, mcy * seg + mid] }[mdir];
  const entrance = { x: mouth[0], y: mouth[1], dir: mdir };
  const inward = OPP[mdir];
  const iv = VEC[inward];

  // The prefab's middle may be a pillar or corner, so the tile directly inward
  // from the mouth can be a wall. Search the entrance cell for a floor tile just
  // inside the mouth that also has floor ahead, so the player can always step
  // forward on entry. Deterministic: closest to mouth midpoint, tiebreak y then x.
  const candidates = [];
  const pushCandidate = (x, y) => {
    if (floorAt(x, y) && floorAt(x + iv.dx, y + iv.dy)) {
      candidates.push({ x, y, d: Math.abs(x - mouth[0]) + Math.abs(y - mouth[1]) });
    }
  };
  if (mdir === 'N') for (let x = mcx * seg; x < mcx * seg + seg; x++) pushCandidate(x, mcy * seg + 1);
  else if (mdir === 'S') for (let x = mcx * seg; x < mcx * seg + seg; x++) pushCandidate(x, mcy * seg + seg - 2);
  else if (mdir === 'W') for (let y = mcy * seg; y < mcy * seg + seg; y++) pushCandidate(mcx * seg + 1, y);
  else for (let y = mcy * seg; y < mcy * seg + seg; y++) pushCandidate(mcx * seg + seg - 2, y);
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const startTile = candidates[0] || { x: entrance.x + iv.dx, y: entrance.y + iv.dy };
  const start = { x: startTile.x, y: startTile.y, facing: inward };

  return {
    seed, cells: M, segmentSize: seg, width, height,
    grid, tiles, tileAt, floorAt, passable, cellAt, inBounds,
    entrance, start,
    get floorCount() { return tiles.reduce((n, t) => n + (t === dk.floor ? 1 : 0), 0); },
  };
}

// First-person crawler over an assembled dungeon: grid-locked, 90° turns.
// forward/back translate along facing; turnLeft/turnRight rotate. Stepping out
// through the mouth returns { exited:true } so the shell can pop to the overworld.
export function createCrawl(dungeon, opts = {}) {
  let x = opts.x ?? dungeon.start.x;
  let y = opts.y ?? dungeon.start.y;
  let facing = opts.facing ?? dungeon.start.facing;

  function step(dir) {
    const m = dungeon.entrance;
    if (x === m.x && y === m.y && dir === m.dir) return { moved: false, exited: true, x, y };
    const v = VEC[dir];
    const nx = x + v.dx;
    const ny = y + v.dy;
    if (!dungeon.passable(nx, ny)) return { moved: false, exited: false, x, y, blocked: { x: nx, y: ny } };
    x = nx; y = ny;
    return { moved: true, exited: false, x, y };
  }

  return {
    get x() { return x; },
    get y() { return y; },
    get facing() { return facing; },
    get pos() { return { x, y, facing }; },
    forward: () => step(facing),
    back: () => step(OPP[facing]),
    turnLeft: () => { facing = LEFT[facing]; return facing; },
    turnRight: () => { facing = RIGHT[facing]; return facing; },
    // The tile directly ahead (for the first-person renderer / look-ahead).
    ahead: (n = 1) => ({ x: x + VEC[facing].dx * n, y: y + VEC[facing].dy * n }),
    cell: () => dungeon.cellAt(x, y),
  };
}

// The party: one icon on the overworld grid. Grid-locked movement with
// collision against the world. A move that lands on a dungeon/city site
// reports it so the shell can offer to enter.
export const DIRS = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

export function createParty(world, start, { passable = (x, y) => world.passable(x, y) } = {}) {
  let x = start.x | 0;
  let y = start.y | 0;

  function tryMove(dir) {
    const d = DIRS[dir];
    if (!d) throw new Error(`party.tryMove: unknown dir '${dir}'`);
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (!passable(nx, ny)) {
      return { moved: false, x, y, blocked: { x: nx, y: ny } };
    }
    x = nx;
    y = ny;
    return { moved: true, x, y, site: world.siteAt(x, y) };
  }

  // Warp the icon to a saved position (save/load). Collision-free by design —
  // restore trusts the snapshot; it was a legal position when saved.
  function moveTo(nx, ny) { x = nx | 0; y = ny | 0; return { x, y }; }

  return {
    get x() { return x; },
    get y() { return y; },
    get pos() { return { x, y }; },
    tile: () => world.tileAt(x, y),
    site: () => world.siteAt(x, y),
    tryMove,
    moveTo,
  };
}

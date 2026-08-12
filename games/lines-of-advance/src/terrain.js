// terrain.js: original board terrain for LINES OF ADVANCE M3.
// Terrain counts and behavior are verified per docs/RULES-LEDGER.md.
// The exact coordinate layout is original (the source set does not publish one).

const BOARD_COLS = 25;
const BOARD_ROWS = 20;

const TERRAIN_TYPES = Object.freeze({
  PLAIN: 'plain',
  MOUNTAIN: 'mountain',
  PASS: 'pass',
  FORT: 'fort',
  ARSENAL: 'arsenal'
});

// North territory: y >= 10; South territory: y <= 9.
// Mountains are mostly perpendicular to the frontier in the North,
// mostly parallel in the South, matching the source's territorial description.
const TERRAIN_MAP = {
  North: {
    arsenals: [[4, 18], [20, 18]],
    forts: [[8, 16], [12, 18], [16, 16]],
    pass: [[12, 14]],
    mountains: [
      [6, 11], [6, 13], [6, 15],
      [12, 11], [12, 13], [12, 15],
      [18, 11], [18, 13], [18, 15]
    ]
  },
  South: {
    arsenals: [[4, 1], [20, 1]],
    forts: [[8, 3], [12, 1], [16, 3]],
    pass: [[12, 5]],
    mountains: [
      [2, 7], [6, 7], [10, 7], [14, 7], [18, 7], [22, 7],
      [4, 8], [12, 8], [20, 8]
    ]
  }
};

const COORD_CACHE = new Map();

function makeKey(x, y) {
  return `${x},${y}`;
}

function buildCache() {
  if (COORD_CACHE.size > 0) return;
  for (const side of ['North', 'South']) {
    const data = TERRAIN_MAP[side];
    for (const [x, y] of data.arsenals) {
      COORD_CACHE.set(makeKey(x, y), { type: TERRAIN_TYPES.ARSENAL, side });
    }
    for (const [x, y] of data.forts) {
      COORD_CACHE.set(makeKey(x, y), { type: TERRAIN_TYPES.FORT, side });
    }
    for (const [x, y] of data.pass) {
      COORD_CACHE.set(makeKey(x, y), { type: TERRAIN_TYPES.PASS, side });
    }
    for (const [x, y] of data.mountains) {
      COORD_CACHE.set(makeKey(x, y), { type: TERRAIN_TYPES.MOUNTAIN });
    }
  }
}

function terrainAt(x, y) {
  buildCache();
  return COORD_CACHE.get(makeKey(x, y)) || { type: TERRAIN_TYPES.PLAIN };
}

function isMountain(x, y) {
  return terrainAt(x, y).type === TERRAIN_TYPES.MOUNTAIN;
}

function isPassable(x, y) {
  const t = terrainAt(x, y).type;
  return t !== TERRAIN_TYPES.MOUNTAIN;
}

function isArsenal(x, y) {
  return terrainAt(x, y).type === TERRAIN_TYPES.ARSENAL;
}

function arsenalSide(x, y) {
  const t = terrainAt(x, y);
  return t.type === TERRAIN_TYPES.ARSENAL ? t.side : null;
}

function isFort(x, y) {
  return terrainAt(x, y).type === TERRAIN_TYPES.FORT;
}

function fortSide(x, y) {
  const t = terrainAt(x, y);
  return t.type === TERRAIN_TYPES.FORT ? t.side : null;
}

function isPass(x, y) {
  return terrainAt(x, y).type === TERRAIN_TYPES.PASS;
}

function terrainDefenseBonus(cls, x, y) {
  if (cls === 'Infantry') {
    if (isFort(x, y)) return 4;
    if (isPass(x, y)) return 2;
  }
  if (cls === 'Foot Artillery' || cls === 'Mounted Artillery') {
    if (isFort(x, y)) return 4;
    if (isPass(x, y)) return 2;
  }
  return 0;
}

function activeArsenalsForSide(side) {
  buildCache();
  return TERRAIN_MAP[side].arsenals.map(([x, y]) => ({ x, y }));
}

function terrainCounts() {
  return {
    North: {
      arsenals: TERRAIN_MAP.North.arsenals.length,
      forts: TERRAIN_MAP.North.forts.length,
      passes: TERRAIN_MAP.North.pass.length,
      mountains: TERRAIN_MAP.North.mountains.length
    },
    South: {
      arsenals: TERRAIN_MAP.South.arsenals.length,
      forts: TERRAIN_MAP.South.forts.length,
      passes: TERRAIN_MAP.South.pass.length,
      mountains: TERRAIN_MAP.South.mountains.length
    }
  };
}

export {
  BOARD_COLS,
  BOARD_ROWS,
  TERRAIN_TYPES,
  terrainAt,
  isMountain,
  isPassable,
  isArsenal,
  arsenalSide,
  isFort,
  fortSide,
  isPass,
  terrainDefenseBonus,
  activeArsenalsForSide,
  terrainCounts
};

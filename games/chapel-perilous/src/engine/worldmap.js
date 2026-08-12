// cp-020 — worldmap state and renderer.
//
// Tracks what the lineage of strangers has learned about the overworld: visited
// cells, known biomes, discovered sites/gates/routes, and significant locations
// that earn a label. The state is world-persistent (serialized with the save).

export function worldKey(x, y) { return `${x},${y}`; }

function parseKey(k) { return k.split(',').map(Number); }

export const FEATURE_SITE = 'site';
export const FEATURE_GATE = 'gate';
export const FEATURE_GATE_OPEN = 'gate-open';
export const FEATURE_START = 'start';

/** Create the world-persistent map-memory object. */
export function createWorldMapState(saved = null) {
  const visited = new Set(saved && saved.visited ? saved.visited : []);
  const sites = new Set(saved && saved.sites ? saved.sites : []);
  const gates = new Set(saved && saved.gates ? saved.gates : []);
  const biomes = new Set(saved && saved.biomes ? saved.biomes : []);
  const labels = [];
  if (saved && saved.labels) {
    for (const l of saved.labels) labels.push({ ...l });
  }
  // Per-site dungeon memory: keyed by world coordinate, stores the explored cell
  // set + feature map from the dungeon minimap. Survives permadeath so later
  // strangers inherit the same revealed map.
  const dungeons = new Map();
  if (saved && saved.dungeons) {
    for (const [k, v] of saved.dungeons) dungeons.set(k, { explored: new Set(v.explored || []), features: new Map(v.features || []) });
  }

  function dungeonKey(site) { return worldKey(site.x, site.y); }
  function getDungeon(site) {
    const k = dungeonKey(site);
    if (!dungeons.has(k)) return null;
    const d = dungeons.get(k);
    return { explored: [...d.explored], features: [...d.features.entries()] };
  }
  function setDungeon(site, minimap) {
    const k = dungeonKey(site);
    const ser = minimap ? minimap.serialize() : { explored: [], features: [] };
    dungeons.set(k, { explored: new Set(ser.explored), features: new Map(ser.features) });
  }

  function visit(x, y) { visited.add(worldKey(x, y)); }
  function knowSite(site) {
    const key = worldKey(site.x, site.y);
    if (sites.has(key)) return false;
    sites.add(key);
    labels.push({ x: site.x, y: site.y, text: site.name || site.id || 'a site', kind: FEATURE_SITE });
    return true;
  }
  function knowGate(gate) {
    if (gates.has(gate.id)) return false;
    gates.add(gate.id);
    labels.push({ x: gate.x, y: gate.y, text: gate.label || gate.id, kind: FEATURE_GATE });
    return true;
  }
  function knowBiome(id) { biomes.add(id); }
  function addLabel(x, y, text, kind = null) {
    labels.push({ x, y, text, kind });
  }
  function isVisited(x, y) { return visited.has(worldKey(x, y)); }
  function hasSite(x, y) { return sites.has(worldKey(x, y)); }
  function hasGate(id) { return gates.has(id); }
  function hasBiome(id) { return biomes.has(id); }

  return {
    visit,
    knowSite,
    knowGate,
    knowBiome,
    addLabel,
    isVisited,
    hasSite,
    hasGate,
    hasBiome,
    getDungeon,
    setDungeon,
    get visited() { return visited; },
    get sites() { return sites; },
    get gates() { return gates; },
    get biomes() { return biomes; },
    get labels() { return labels; },
    get dungeons() { return dungeons; },
    serialize() {
      const dungeonEntries = [];
      for (const [k, v] of dungeons) {
        dungeonEntries.push([k, { explored: [...v.explored], features: [...v.features.entries()] }]);
      }
      return {
        visited: [...visited],
        sites: [...sites],
        gates: [...gates],
        biomes: [...biomes],
        labels: labels.map((l) => ({ ...l })),
        dungeons: dungeonEntries,
      };
    },
    restore(saved) {
      if (!saved) return this;
      visited.clear(); if (saved.visited) for (const k of saved.visited) visited.add(k);
      sites.clear(); if (saved.sites) for (const k of saved.sites) sites.add(k);
      gates.clear(); if (saved.gates) for (const k of saved.gates) gates.add(k);
      biomes.clear(); if (saved.biomes) for (const k of saved.biomes) biomes.add(k);
      labels.length = 0; if (saved.labels) for (const l of saved.labels) labels.push({ ...l });
      dungeons.clear();
      if (saved.dungeons) {
        for (const [k, v] of saved.dungeons) {
          dungeons.set(k, { explored: new Set(v.explored || []), features: new Map(v.features || []) });
        }
      }
      return this;
    },
  };
}

/**
 * Build a headless-testable worldmap frame for the current known world.
 * Returns the visible tile set, discovered features, routes, and labels.
 */
export function gatherWorldmap({ world, biomes, mapState, party, start }) {
  const sites = world.listSites();
  const gates = world.listGates();

  // Bounds: include visited cells + known sites/gates with a small margin.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consider = (x, y) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const k of mapState.visited) { const [x, y] = parseKey(k); consider(x, y); }
  for (const s of sites) if (mapState.hasSite(s.x, s.y)) consider(s.x, s.y);
  for (const g of gates) if (mapState.hasGate(g.id)) consider(g.x, g.y);
  if (start) consider(start.x, start.y);
  consider(party.x, party.y);

  if (!isFinite(minX)) { minX = party.x - 4; minY = party.y - 4; maxX = party.x + 4; maxY = party.y + 4; }
  const pad = 2;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const tiles = [];
  const features = [];
  const routes = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const known = mapState.isVisited(x, y);
      const site = world.siteAt(x, y);
      const gate = world.gateAt(x, y);
      const biome = biomes.biomeAt(x, y);
      const inKnownBiome = biome && mapState.hasBiome(biome.id);
      // Fog: only draw cells we've visited. Sites/gates are drawn once discovered
      // even if their cell was never stepped on.
      if (!known && !(site && mapState.hasSite(site.x, site.y)) && !(gate && mapState.hasGate(gate.id))) continue;

      let terrain = 'fog';
      if (known) {
        const tile = world.tileAt(x, y);
        if (!tile.passable) terrain = 'blocked';
        else if (gate && !world.isGateOpen(gate.id)) terrain = 'gate';
        else terrain = 'open';
      }
      tiles.push({ x, y, terrain, known, biome: inKnownBiome ? biome.id : null });

      if (site && mapState.hasSite(site.x, site.y)) {
        features.push({ x, y, kind: FEATURE_SITE, name: site.name || site.id, siteKind: site.kind });
      }
      if (gate && mapState.hasGate(gate.id)) {
        features.push({ x, y, kind: world.isGateOpen(gate.id) ? FEATURE_GATE_OPEN : FEATURE_GATE, name: gate.label || gate.id });
      }
      if (start && x === start.x && y === start.y && mapState.isVisited(start.x, start.y)) {
        features.push({ x, y, kind: FEATURE_START, name: 'where you began' });
      }
    }
  }

  // Simple route lines between adjacent known open cells.
  const key = (x, y) => `${x},${y}`;
  const openSet = new Set(tiles.filter((t) => t.terrain === 'open' || t.terrain === 'gate').map((t) => key(t.x, t.y)));
  for (const t of tiles) {
    if (t.terrain !== 'open' && t.terrain !== 'gate') continue;
    const right = key(t.x + 1, t.y);
    const down = key(t.x, t.y + 1);
    if (openSet.has(right)) routes.push({ x1: t.x, y1: t.y, x2: t.x + 1, y2: t.y });
    if (openSet.has(down)) routes.push({ x1: t.x, y1: t.y, x2: t.x, y2: t.y + 1 });
  }

  return {
    bounds: { minX, minY, maxX, maxY },
    tiles,
    features,
    routes,
    labels: mapState.labels.slice(),
    player: { x: party.x, y: party.y },
  };
}

/** Glyph for a site kind. */
export function siteGlyph(kind) {
  switch (kind) {
    case 'city': return '⌂';
    case 'dungeon': return '▪';
    default: return '◆';
  }
}

/**
 * Draw the worldmap into the scene viewport. The map fills a centred card
 * that fits inside `maxW × maxH`; unknown regions are absent (black).
 */
export function drawWorldmap(ctx, {
  world, biomes, mapState, party, start, shadeColor, accentColor,
  maxW = 320, maxH = 320,
  viewportW = (ctx.canvas && ctx.canvas.width) || maxW,
  viewportH = (ctx.canvas && ctx.canvas.height) || maxH,
}) {
  const data = gatherWorldmap({ world, biomes, mapState, party, start });
  const bw = data.bounds.maxX - data.bounds.minX + 1;
  const bh = data.bounds.maxY - data.bounds.minY + 1;
  const cell = Math.max(4, Math.min(maxW / bw, maxH / bh) | 0);
  const mw = bw * cell;
  const mh = bh * cell;
  const x = Math.round((viewportW - mw) / 2);
  const y = Math.round((viewportH - mh) / 2);

  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = shadeColor(0);
  ctx.fillRect(x - 4, y - 4, mw + 8, mh + 8);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shadeColor(3);
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4, y - 4, mw + 8, mh + 8);

  // Terrain cells.
  for (const t of data.tiles) {
    const px = x + (t.x - data.bounds.minX) * cell;
    const py = y + (t.y - data.bounds.minY) * cell;
    if (t.terrain === 'fog') {
      ctx.fillStyle = shadeColor(0);
    } else if (t.terrain === 'blocked') {
      ctx.fillStyle = shadeColor(1);
    } else if (t.terrain === 'gate') {
      ctx.fillStyle = shadeColor(2);
    } else {
      ctx.fillStyle = t.biome ? shadeColor(3) : shadeColor(2);
    }
    ctx.fillRect(px, py, cell, cell);
  }

  // Routes.
  if (data.routes.length) {
    ctx.strokeStyle = shadeColor(4);
    ctx.lineWidth = Math.max(1, cell / 4);
    ctx.beginPath();
    for (const r of data.routes) {
      ctx.moveTo(x + (r.x1 - data.bounds.minX) * cell + cell / 2, y + (r.y1 - data.bounds.minY) * cell + cell / 2);
      ctx.lineTo(x + (r.x2 - data.bounds.minX) * cell + cell / 2, y + (r.y2 - data.bounds.minY) * cell + cell / 2);
    }
    ctx.stroke();
  }

  // Features: sites, gates, start.
  if (data.features.length) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of data.features) {
      const px = x + (f.x - data.bounds.minX) * cell + cell / 2;
      const py = y + (f.y - data.bounds.minY) * cell + cell / 2;
      if (f.kind === FEATURE_SITE) {
        ctx.fillStyle = shadeColor(6);
        ctx.font = `${Math.max(8, cell)}px monospace`;
        ctx.fillText(siteGlyph(f.siteKind), px, py + 1);
      } else if (f.kind === FEATURE_GATE || f.kind === FEATURE_GATE_OPEN) {
        ctx.fillStyle = f.kind === FEATURE_GATE_OPEN ? accentColor(0.9) : shadeColor(5);
        ctx.font = `${Math.max(8, cell)}px monospace`;
        ctx.fillText('▫', px, py + 1);
      } else if (f.kind === FEATURE_START) {
        ctx.fillStyle = accentColor(0.8);
        ctx.font = `${Math.max(8, cell)}px monospace`;
        ctx.fillText('○', px, py + 1);
      }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Party marker.
  const px = x + (data.player.x - data.bounds.minX) * cell + cell / 2;
  const py = y + (data.player.y - data.bounds.minY) * cell + cell / 2;
  // Three reserved values, not a lone accent dot: dark outer seat, hot phosphor
  // disc, dark core. This remains legible over blocked/open/biome cells in either
  // approved hue after CRT bloom, and echoes the overworld icon's focal stack.
  ctx.fillStyle = shadeColor(0);
  ctx.beginPath();
  ctx.arc(px, py, Math.max(3, cell * 0.68), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accentColor();
  ctx.beginPath();
  ctx.arc(px, py, Math.max(2, cell * 0.48), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(0);
  ctx.beginPath();
  ctx.arc(px, py, Math.max(1, cell * 0.18), 0, Math.PI * 2);
  ctx.fill();

  // Labels for discovered significant locations.
  const labelSet = data.labels.slice().reverse();
  if (labelSet.length) {
    ctx.font = '11px monospace';
    for (const l of labelSet) {
      if (l.x < data.bounds.minX || l.x > data.bounds.maxX || l.y < data.bounds.minY || l.y > data.bounds.maxY) continue;
      const lx = x + (l.x - data.bounds.minX) * cell + cell + 2;
      const ly = y + (l.y - data.bounds.minY) * cell + cell / 2 + 4;
      // Clamp/skip like the panel legend: a label must fit inside the map card so
      // it can never bleed into the HUD region above or below the worldmap.
      if (ly - 11 < y + 2 || ly + 3 > y + mh - 2) continue;
      ctx.fillStyle = shadeColor(0);
      const w = ctx.measureText(l.text).width + 4;
      ctx.fillRect(lx - 2, ly - 11, w, 14);
      ctx.fillStyle = shadeColor(6);
      ctx.fillText(l.text, lx, ly);
    }
  }

  ctx.restore();
  return { x, y, width: mw + 8, height: mh + 8, cell, data };
}

// cp-019 — grid-based dungeon minimap with progressive reveal.
//
// One cell per explored fine tile/room-unit. Cells/features appear only as the
// party walks, sees, or triggers them; no omniscient map. The same state object
// is persisted to the world's map memory so what one character reveals stays
// revealed for the next.

export function minimapKey(x, y) { return `${x},${y}`; }

function parseKey(k) { return k.split(',').map(Number); }

/**
 * Create a minimap state object. `markAround` reveals floor tiles in a small
 * radius around a point (the crawl's current tile), and `markFeature` records
 * discovered points of interest (stairs, caches, shrines, encounters) at their
 * cell. The state can be serialized and restored so it survives a save/load.
 */
export function createMinimap(saved = null) {
  const explored = new Set(saved && saved.explored ? saved.explored : []);
  const features = new Map();
  if (saved && saved.features) {
    for (const [k, v] of saved.features) features.set(k, { ...v });
  }

  return {
    mark(x, y) { explored.add(minimapKey(x, y)); },
    markAround(dungeon, cx, cy, radius = 1) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = cx + dx, y = cy + dy;
          if (dungeon.floorAt(x, y)) explored.add(minimapKey(x, y));
        }
      }
    },
    markFeature(x, y, kind, label = null) {
      features.set(minimapKey(x, y), { kind, label });
    },
    isExplored(x, y) { return explored.has(minimapKey(x, y)); },
    featureAt(x, y) { return features.get(minimapKey(x, y)) || null; },
    get explored() { return explored; },
    get features() { return features; },
    serialize() {
      return { explored: [...explored], features: [...features.entries()] };
    },
    restore(saved) {
      if (!saved) return this;
      explored.clear();
      if (saved.explored) for (const k of saved.explored) explored.add(k);
      features.clear();
      if (saved.features) {
        for (const [k, v] of saved.features) features.set(k, { ...v });
      }
      return this;
    },
  };
}

/** Convenience: reveal the crawl's current tile and its immediate floor neighbours. */
export function exploreCurrent(run) {
  run.minimap.markAround(run.dungeon, run.crawl.x, run.crawl.y);
}

/** Arrow polygon for the four cardinal facings, centred at (cx,cy) with radius r. */
export function facingArrow(facing, cx, cy, r) {
  switch (facing) {
    case 'N': return [[cx, cy - r], [cx + r, cy + r], [cx - r, cy + r]];
    case 'S': return [[cx, cy + r], [cx + r, cy - r], [cx - r, cy - r]];
    case 'E': return [[cx + r, cy], [cx - r, cy + r], [cx - r, cy - r]];
    case 'W': return [[cx - r, cy], [cx + r, cy + r], [cx + r, cy - r]];
    default: return [[cx, cy]];
  }
}

/** Glyph to draw for a feature kind. */
export function featureGlyph(kind) {
  switch (kind) {
    case 'stairs': return '×';
    case 'cache': return '⚑';
    case 'shrine': return '†';
    case 'encounter': return '!';
    case 'gate': return '▫';
    default: return '·';
  }
}

/**
 * Build the logical contents of the minimap for the current frame.
 * Headless-testable: maps the explored Set to drawn cells and reports features
 * without touching a canvas.
 */
export function gatherMinimap(dungeon, minimap, crawl) {
  const floors = [];
  const walls = [];
  const feats = [];
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (!minimap.isExplored(x, y)) continue;
      if (dungeon.floorAt(x, y)) {
        floors.push({ x, y });
        const f = minimap.featureAt(x, y);
        if (f) feats.push({ x, y, ...f });
      } else walls.push({ x, y });
    }
  }
  const exit = {
    x: dungeon.entrance.x,
    y: dungeon.entrance.y,
    seen: minimap.isExplored(dungeon.entrance.x, dungeon.entrance.y),
  };
  return {
    width: dungeon.width,
    height: dungeon.height,
    floors,
    walls,
    features: feats,
    exit,
    player: { x: crawl.x, y: crawl.y, facing: crawl.facing },
  };
}

/**
 * Draw the grid-based minimap into the scene viewport. The map is a chunky,
 * high-contrast square inset in the current monochrome palette; unexplored
 * tiles stay dark (fog). The inset scales to fit `maxSize` while keeping cells
 * an integer pixel size.
 */
export function drawMinimap(ctx, {
  dungeon, crawl, minimap, shadeColor,
  x, y, maxSize = 120,
}) {
  const data = gatherMinimap(dungeon, minimap, crawl);
  const scale = Math.max(3, Math.min(maxSize / data.width, maxSize / data.height) | 0);
  const mw = data.width * scale;
  const mh = data.height * scale;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = shadeColor(0);
  ctx.fillRect(x, y, mw + 2, mh + 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shadeColor(3);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, mw + 2, mh + 2);

  // Explored floor cells.
  ctx.fillStyle = shadeColor(2);
  for (const f of data.floors) {
    ctx.fillRect(x + 1 + f.x * scale, y + 1 + f.y * scale, scale, scale);
  }

  // Explored wall cells (only show walls that have been seen, never cheat).
  ctx.fillStyle = shadeColor(1);
  for (const w of data.walls) {
    ctx.fillRect(x + 1 + w.x * scale, y + 1 + w.y * scale, scale, scale);
  }

  // Feature glyphs: stairs/cache/shrine/encounter marks, drawn centred on cell.
  if (data.features.length) {
    ctx.fillStyle = shadeColor(6);
    ctx.font = `${Math.max(8, scale)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of data.features) {
      const fx = x + 1 + f.x * scale + scale / 2;
      const fy = y + 1 + f.y * scale + scale / 2;
      ctx.fillText(featureGlyph(f.kind), fx, fy + 1);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Exit marker — a small cross, only once the exit tile has been explored.
  if (data.exit.seen) {
    const ex = x + 1 + data.exit.x * scale + scale / 2;
    const ey = y + 1 + data.exit.y * scale + scale / 2;
    const m = Math.max(2, scale * 0.35);
    ctx.strokeStyle = shadeColor(5);
    ctx.lineWidth = Math.max(1, scale / 4);
    ctx.beginPath();
    ctx.moveTo(ex - m, ey - m); ctx.lineTo(ex + m, ey + m);
    ctx.moveTo(ex + m, ey - m); ctx.lineTo(ex - m, ey + m);
    ctx.stroke();
  }

  // Player position + facing arrow.
  const px = x + 1 + data.player.x * scale + scale / 2;
  const py = y + 1 + data.player.y * scale + scale / 2;
  const r = Math.max(2, scale / 2);
  ctx.fillStyle = shadeColor(6);
  ctx.beginPath();
  const pts = facingArrow(data.player.facing, px, py, r);
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  return { width: mw + 2, height: mh + 2 };
}

// Map overlays for INNSMOUTH 2000 (M7): the minimap, the demand indicator, and the newspaper.
// Layout, projection, and hit-testing are pure (node --test covers them); the ctx drawing is
// browser-side. These are the three clickable overlays the milestone adds; the click/drag
// regression harness (test/overlays.test.js) exercises their hit-testing.

import { CHROME, RAMP, ZONE_TINT, BASE, SHADOW, terrainRamp } from './palette.js';
import { isWaterTerrain, hasNetwork } from './tools.js';
import { computeDemand } from './sim.js';
import { drawBevel, drawDitherScrim, inRect, wrapMono, fitMono, PANEL_PAD } from './ui.js';

const MINI_PAD = 4;

// The scar colours on the minimap (aftermath reads at a glance).
const SCAR_COLOR = {
  burnt: '#241c18', overgrown: '#3a5a2a', rubble: '#5a5048', flooded: '#356b64', rift: '#5a3a7a',
};

// --- the minimap -------------------------------------------------------------------------
// A whole-map thumbnail docked bottom-right, above the status strip and the reserved herald row.
// Click it to recenter the camera on that quarter of the town.
export function buildMinimap(viewportW, viewportH, mapCols, mapRows, opts = {}) {
  const bottomInset = opts.bottomInset ?? 30;
  const scale = opts.scale ?? 1;
  const innerW = Math.round((opts.size ?? 132) * scale);
  const innerH = Math.round(innerW * (mapRows / mapCols));
  const w = innerW + MINI_PAD * 2;
  const h = innerH + MINI_PAD * 2;
  const x = viewportW - w - 8;
  const y = viewportH - h - bottomInset - 8;
  return {
    frame: { x, y, w, h },
    inner: { x: x + MINI_PAD, y: y + MINI_PAD, w: innerW, h: innerH },
    cols: mapCols, rows: mapRows,
  };
}

export function overMinimap(layout, px, py) { return inRect(layout.frame, px, py); }

// A minimap pixel -> tile (clamped in bounds). For click-to-recenter.
export function minimapToTile(layout, px, py) {
  const { inner, cols, rows } = layout;
  const col = Math.max(0, Math.min(cols - 1, Math.floor((px - inner.x) / inner.w * cols)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((py - inner.y) / inner.h * rows)));
  return { col, row };
}

// A tile -> its centre pixel on the minimap. For drawing the camera viewport outline.
export function tileToMinimap(layout, col, row) {
  const { inner, cols, rows } = layout;
  return { x: inner.x + (col + 0.5) / cols * inner.w, y: inner.y + (row + 0.5) / rows * inner.h };
}

// The colour of a tile on the minimap: water, then aftermath scars, then what stands on it,
// then the bare ground. Built lots read in their zone tint; empty zoning reads dimmer.
function miniColor(tile) {
  if (!tile) return CHROME.deepFrame;
  if (isWaterTerrain(tile.terrain)) return (RAMP[tile.terrain] || RAMP.deep)[BASE];
  if (tile.scar) return SCAR_COLOR[tile.scar.kind] || '#241c18';
  if (tile.structure) return '#d8d0c0';
  if (tile.building) return ZONE_TINT[tile.zone] || '#9ecf66';
  if (hasNetwork(tile, 'road')) return RAMP.dirt[BASE];
  if (tile.object) return '#241f1a';
  if (tile.zone) return dimTint(ZONE_TINT[tile.zone]);
  return RAMP[terrainRamp(tile.terrain)][BASE];
}

// A muted version of a zone tint (for zoned-but-unbuilt lots): halve toward the ground grey.
function dimTint(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff), g = ((n >> 8) & 0xff), b = (n & 0xff);
  const mix = (c) => Math.round(c * 0.55 + 0x4f * 0.45);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// Draw the minimap. `viewCorners` is the four screen-corner tiles (in order) of the camera's
// visible region; drawn as a bright outline so the player sees where they are looking.
export function drawMinimap(ctx, layout, map, viewCorners) {
  const { frame, inner, cols, rows } = layout;
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  ctx.fillStyle = RAMP.deep[SHADOW];
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  const cw = inner.w / cols;
  const ch = inner.h / rows;
  const cwCeil = Math.ceil(cw);
  const chCeil = Math.ceil(ch);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = miniColor(map.tileAt(col, row));
      ctx.fillRect(inner.x + col * cw, inner.y + row * ch, cwCeil, chCeil);
    }
  }
  if (viewCorners && viewCorners.length === 4) {
    ctx.strokeStyle = '#f4d67a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    viewCorners.forEach((c, i) => {
      const p = tileToMinimap(layout, c.col, c.row);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
  }
}

// --- the demand indicator ----------------------------------------------------------------
// The reference's RCI gadget, transposed: three bars for the town's appetite to build
// Residential / Commercial / Industrial, and a thin class-mix bar below (who actually lives
// here: the Unwary, Cultists, Deep Ones), the game's core dial made visible. Docks bottom-left,
// above the status strip. Clicking it opens the Town Ledger (where the economy lives).
const CLASS_COLOR = { unwary: '#a98d6d', cultist: '#7a5a9a', deepone: '#4d8378', scholar: '#c3a8e0' };
const DEMAND_BARS = [
  { zone: 'residential', letter: 'R', color: ZONE_TINT.residential },
  { zone: 'commercial', letter: 'C', color: ZONE_TINT.commercial },
  { zone: 'industrial', letter: 'I', color: ZONE_TINT.industrial },
];

export function buildDemand(viewportW, viewportH, opts = {}) {
  const scale = opts.scale ?? 1;
  const bottomInset = opts.bottomInset ?? 30;
  const w = Math.round(126 * scale);
  const h = Math.round(84 * scale);
  const x = 8;
  const y = viewportH - h - bottomInset - 8;
  return { frame: { x, y, w, h }, scale };
}

export function overDemand(layout, px, py) { return inRect(layout.frame, px, py); }

export function drawDemand(ctx, layout, sim) {
  const { frame, scale } = layout;
  const pad = Math.round(6 * scale);
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  ctx.fillStyle = CHROME.ink;
  ctx.font = `${Math.round(11 * scale)}px monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Demand', frame.x + pad, frame.y + Math.round(13 * scale));

  const demand = computeDemand(sim);
  const top = frame.y + Math.round(18 * scale);
  const barH = Math.round(40 * scale);
  const barW = Math.round(18 * scale);
  const gap = Math.round(10 * scale);
  const groupW = DEMAND_BARS.length * barW + (DEMAND_BARS.length - 1) * gap;
  let bx = frame.x + Math.round((frame.w - groupW) / 2);
  for (const b of DEMAND_BARS) {
    drawBevel(ctx, bx, top, barW, barH, true);
    const frac = Math.max(0, Math.min(1, demand[b.zone] || 0));
    const fh = Math.round((barH - 4) * frac);
    ctx.fillStyle = b.color;
    ctx.fillRect(bx + 2, top + barH - 2 - fh, barW - 4, fh);
    ctx.fillStyle = CHROME.ink;
    ctx.font = `${Math.round(10 * scale)}px monospace`;
    ctx.fillText(b.letter, bx + barW / 2 - Math.round(3 * scale), top + barH + Math.round(11 * scale));
    bx += barW + gap;
  }

  // The class-mix bar: segments proportional to who lives here (0 when the town is empty).
  const total = sim.pop.unwary + sim.pop.cultist + sim.pop.deepone + sim.pop.scholar;
  const mx = frame.x + pad;
  const mw = frame.w - pad * 2;
  const my = frame.y + frame.h - Math.round(9 * scale);
  const mh = Math.round(5 * scale);
  drawBevel(ctx, mx, my, mw, mh, true);
  if (total > 0) {
    let seg = mx + 1;
    for (const cls of ['unwary', 'cultist', 'deepone', 'scholar']) {
      const wseg = Math.round((mw - 2) * (sim.pop[cls] / total));
      if (wseg <= 0) continue;
      ctx.fillStyle = CLASS_COLOR[cls];
      ctx.fillRect(seg, my + 1, wseg, mh - 2);
      seg += wseg;
    }
  }
}

// --- The Innsmouth Courier (newspaper) ----------------------------------------------------
// A masthead ticker under the top bar shows the latest headline; a click opens the full paper.
// The Courier's voice is a dry New England broadsheet sliding into cosmic dread. Headlines come
// from real sim events (src/sim.js detectNews / summonWrath); this only renders them.
const NEWSPRINT = '#d8d2c2';
const NEWSPRINT_EDGE = '#8c8672';
const COURIER_MASTHEAD = 'THE INNSMOUTH COURIER';

// The month names for a headline's dateline (the sim carries month indices).
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateline(ev) { return `${MONTH_ABBR[ev.month] || '?'} ${ev.year}`; }

export function buildCourierTicker(viewportW, topBarH, opts = {}) {
  const scale = opts.scale ?? 1;
  const h = Math.round(20 * scale);
  return { frame: { x: 0, y: topBarH, w: viewportW, h }, scale };
}

export function overCourierTicker(layout, px, py) { return inRect(layout.frame, px, py); }

export function drawCourierTicker(ctx, layout, latest) {
  const { frame, scale } = layout;
  ctx.fillStyle = NEWSPRINT;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  ctx.fillStyle = NEWSPRINT_EDGE;
  ctx.fillRect(frame.x, frame.y + frame.h - 1, frame.w, 1);
  ctx.textBaseline = 'middle';
  const cy = frame.y + frame.h / 2 + 1;
  ctx.fillStyle = CHROME.ink;
  ctx.font = `${Math.round(11 * scale)}px monospace`;
  const tag = `${COURIER_MASTHEAD}:`;
  ctx.fillText(tag, frame.x + 8, cy);
  const tagW = ctx.measureText(tag).width;
  const line = latest ? latest.headline : 'All quiet along the shore. For now.';
  ctx.font = `${Math.round(11 * scale)}px monospace`;
  ctx.fillText(line, frame.x + 8 + tagW + 10, cy);
}

// The full Courier window: a masthead over a column of the most recent headlines (newest first).
export function buildCourierWindow(viewportW, viewportH, opts = {}) {
  const scale = opts.scale ?? 1;
  const w = Math.round(460 * scale);
  const titleH = Math.round(40 * scale); // the masthead band
  const pad = Math.round(PANEL_PAD * scale); // the one shared padding standard (M10 sweep)
  const rows = opts.rows ?? 8;
  const rowH = Math.round(40 * scale);
  const h = titleH + pad + rows * rowH + pad;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(34, Math.round((viewportH - h) / 2));
  const rowRects = [];
  for (let i = 0; i < rows; i++) rowRects.push({ y: y + titleH + pad + i * rowH, h: rowH });
  return {
    frame: { x, y, w, h },
    masthead: { x, y, w, h: titleH },
    close: { x: x + w - titleH + Math.round(10 * scale), y: y + Math.round(8 * scale), w: Math.round(18 * scale), h: Math.round(18 * scale) },
    rows: rowRects, pad, titleH, scale, capacity: rows,
  };
}

export function courierHit(layout, px, py) {
  if (inRect(layout.close, px, py)) return { type: 'close' };
  return null;
}

export function overCourier(layout, px, py) { return inRect(layout.frame, px, py); }

export function drawCourierWindow(ctx, layout, events) {
  const { frame, masthead, close, scale } = layout;
  ctx.fillStyle = NEWSPRINT_EDGE;
  ctx.fillRect(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4);
  ctx.fillStyle = NEWSPRINT;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  // Masthead.
  ctx.fillStyle = CHROME.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `${Math.round(20 * scale)}px monospace`;
  ctx.fillText(COURIER_MASTHEAD, frame.x + frame.w / 2, masthead.y + masthead.h / 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = NEWSPRINT_EDGE;
  ctx.fillRect(frame.x + layout.pad, masthead.y + masthead.h - 2, frame.w - layout.pad * 2, 2);
  // Close box.
  ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
  ctx.strokeRect(close.x, close.y, close.w, close.h);
  ctx.beginPath();
  ctx.moveTo(close.x + 3, close.y + 3); ctx.lineTo(close.x + close.w - 3, close.y + close.h - 3);
  ctx.moveTo(close.x + close.w - 3, close.y + 3); ctx.lineTo(close.x + 3, close.y + close.h - 3);
  ctx.stroke();
  // Headlines, newest first.
  const recent = events.slice(-layout.capacity).reverse();
  const lx = frame.x + layout.pad;
  const rx = frame.x + frame.w - layout.pad;
  if (recent.length === 0) {
    ctx.fillStyle = CHROME.ink;
    ctx.font = `${Math.round(13 * scale)}px monospace`;
    ctx.fillText('No news of note. The town keeps to itself.', lx, layout.rows[0].y + Math.round(16 * scale));
    return;
  }
  recent.forEach((ev, i) => {
    if (i >= layout.rows.length) return;
    const r = layout.rows[i];
    ctx.fillStyle = CHROME.ink;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${Math.round(14 * scale)}px monospace`;
    ctx.fillText(ev.headline, lx, r.y + Math.round(15 * scale));
    // The dateline, right-aligned on the headline row.
    ctx.font = `${Math.round(10 * scale)}px monospace`;
    ctx.fillStyle = NEWSPRINT_EDGE;
    const dl = dateline(ev);
    ctx.fillText(dl, rx - ctx.measureText(dl).width, r.y + Math.round(15 * scale));
    // The subhead.
    if (ev.sub) {
      ctx.fillStyle = CHROME.ink;
      ctx.font = `${Math.round(11 * scale)}px monospace`;
      ctx.fillText(ev.sub, lx, r.y + Math.round(30 * scale));
    }
    // A thin rule under each story.
    ctx.fillStyle = NEWSPRINT_EDGE;
    ctx.fillRect(lx, r.y + r.h - Math.round(4 * scale), frame.w - layout.pad * 2, 1);
  });
  ctx.textBaseline = 'middle';
}

// --- the end screen (M8: the Cthulhu doom clock) ------------------------------------------
// When the dreamer fully wakes (sim.ended), the map dims and a centred plate names the end and how
// many years the town stood. Text is fit/wrapped to the plate so it never clips (the detector guards
// it at every viewport and scale). Pure layout + a canvas-injected draw.
export function buildEndScreen(viewportW, viewportH, opts = {}) {
  const scale = opts.scale ?? 1;
  const w = Math.min(viewportW - 80, Math.round(560 * scale));
  const h = Math.round(230 * scale);
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(40, Math.round((viewportH - h) / 2));
  const pad = Math.round(18 * scale);
  const buttonH = Math.round(34 * scale);
  const restart = {
    x: x + pad,
    y: y + h - pad - buttonH,
    w: w - pad * 2,
    h: buttonH,
  };
  return { frame: { x, y, w, h }, scale, viewportW, viewportH, restart };
}

export function endScreenHit(layout, px, py) {
  if (layout.restart && inRect(layout.restart, px, py)) return { type: 'new' };
  return null;
}

export function drawEndScreen(ctx, layout, ended, foundedYear = 1927) {
  const { frame, scale, viewportW, viewportH } = layout;
  // A dithered wash over the whole map.
  drawDitherScrim(ctx, viewportW, viewportH, CHROME.deepFrame, 0.55);
  // The plate.
  ctx.fillStyle = NEWSPRINT_EDGE;
  ctx.fillRect(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  const pad = Math.round(18 * scale);
  const inner = frame.w - pad * 2;
  const cx = frame.x + frame.w / 2;
  const years = Math.max(0, (ended && ended.year ? ended.year : foundedYear) - foundedYear);
  // Title.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8a2a22';
  const titlePx = Math.round(20 * scale);
  ctx.font = `${titlePx}px monospace`;
  ctx.fillText(fitMono('INNSMOUTH IS LOST', inner, titlePx), cx, frame.y + Math.round(40 * scale));
  // Body: the cry and the tally, wrapped to the plate.
  ctx.fillStyle = CHROME.ink;
  const bodyPx = Math.round(13 * scale);
  ctx.font = `${bodyPx}px monospace`;
  const cry = 'R’lyeh has risen. The dreamer wakes, and the town is given over to the sea and the dark.';
  let yy = frame.y + Math.round(70 * scale);
  for (const ln of wrapMono(cry, inner, bodyPx, 3)) {
    ctx.fillText(ln, cx, yy);
    yy += Math.round(18 * scale);
  }
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillText(fitMono(`The town stood ${years} years.`, inner, bodyPx), cx, yy + Math.round(6 * scale));
  const restart = layout.restart;
  if (restart) {
    drawBevel(ctx, restart.x, restart.y, restart.w, restart.h, false);
    ctx.fillStyle = CHROME.ink;
    ctx.font = `${Math.round(14 * scale)}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('New Game', restart.x + restart.w / 2, restart.y + restart.h / 2 + 1);
  }
  ctx.textAlign = 'left';
}

// --- first-contact onboarding banner (M7) -------------------------------------------------
// A soft, dismissable in-fiction prompt, shown one at a time just under the Courier ticker.
export function buildOnboarding(viewportW, topOffset, opts = {}) {
  const scale = opts.scale ?? 1;
  const w = Math.min(viewportW - 40, Math.round(720 * scale));
  const h = Math.round(46 * scale);
  const x = Math.round((viewportW - w) / 2);
  const y = topOffset + Math.round(12 * scale);
  return { frame: { x, y, w, h }, scale };
}

export function overOnboarding(layout, px, py) { return inRect(layout.frame, px, py); }

export function drawOnboarding(ctx, layout, text) {
  const { frame, scale } = layout;
  ctx.fillStyle = NEWSPRINT_EDGE;
  ctx.fillRect(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4);
  ctx.fillStyle = NEWSPRINT;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  const pad = Math.round(10 * scale);
  ctx.fillStyle = CHROME.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(12 * scale)}px monospace`;
  ctx.fillText(text, frame.x + pad, frame.y + Math.round(20 * scale));
  ctx.fillStyle = NEWSPRINT_EDGE;
  ctx.font = `${Math.round(10 * scale)}px monospace`;
  const note = '(click to dismiss)';
  ctx.fillText(note, frame.x + frame.w - pad - ctx.measureText(note).width, frame.y + frame.h - Math.round(8 * scale));
  ctx.textBaseline = 'middle';
}

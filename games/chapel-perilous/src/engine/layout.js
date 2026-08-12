// Canvas UI layout — named regions with a line budget, no magic y-coordinates.
// Used by the title + creation screens; draw lists are headless-testable.
// Width math uses a monospace advance estimate so Node tests match the planner
// without a Canvas implementation.

// Logical canvas (M5: enlarged from 378 for a bigger, more confident default —
// 416 = 13 overworld tiles × 32px crisp art cells, and clears the creation
// screen's stacked-region height budget).
export const CANVAS_W = 416;
export const CANVAS_H = 416;

/** Approximate advance width (px) for `Npx monospace` — slightly conservative. */
export function monoAdvance(size) {
  return size * 0.62;
}

export function textWidth(str, size) {
  return String(str).length * monoAdvance(size);
}

/**
 * Strip the [SEED] dev marker for on-canvas display (register strings stay marked
 * in data). Removes EVERY occurrence, not just a leading one: player lines are
 * often concatenated from several [SEED]-prefixed fragments (room prose — prompt —
 * encounter note), and an embedded marker used to survive a leading-only strip and
 * leak to the log (M10 A9/item 14, Ray saw it twice). Global + anywhere-in-string.
 */
export function stripSeed(s) {
  return String(s || '').replace(/\[SEED\]\s*/gi, '');
}

/**
 * Word-wrap `str` into lines that each measure ≤ maxW.
 * Overlong tokens are hard-sliced so nothing can exceed maxW.
 */
export function wrapToWidth(str, maxW, size) {
  const words = String(str).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let cur = '';
  const fits = (s) => textWidth(s, size) <= maxW;
  const sliceToken = (tok) => {
    const out = [];
    let rest = tok;
    while (rest.length) {
      let n = rest.length;
      while (n > 1 && !fits(rest.slice(0, n))) n--;
      out.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    return out;
  };
  for (const w of words) {
    if (!fits(w)) {
      if (cur) { lines.push(cur); cur = ''; }
      const parts = sliceToken(w);
      lines.push(...parts.slice(0, -1));
      cur = parts[parts.length - 1] || '';
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Truncate with an ellipsis so the result fits maxW. */
export function ellipsize(str, maxW, size) {
  const s = String(str);
  if (textWidth(s, size) <= maxW) return s;
  const ell = '…';
  if (textWidth(ell, size) > maxW) return '';
  let n = s.length;
  while (n > 0 && textWidth(s.slice(0, n) + ell, size) > maxW) n--;
  return s.slice(0, n) + ell;
}

/**
 * Stacked-region layout planner.
 * `define(id, { lines, lineHeight, size })` reserves a vertical band.
 * `push(id, text, opts)` places one or more rows inside that band (wrapping to
 * the region's remaining line budget; surplus is ellipsized onto the last line).
 */
export function createLayout({
  width = CANVAS_W,
  height = CANVAS_H,
  marginX = 18,
  marginY = 18,
  gap = 12,
} = {}) {
  const contentW = width - marginX * 2;
  const regions = new Map();
  let cursor = marginY;
  const rows = [];

  function define(id, { lines, lineHeight, size = 14 } = {}) {
    if (!lines || !lineHeight) throw new Error(`layout.define('${id}'): need lines + lineHeight`);
    const band = lines * lineHeight;
    if (cursor + band > height - marginY) {
      throw new Error(`layout.define('${id}'): overflows canvas (y=${cursor}, need ${band})`);
    }
    regions.set(id, {
      id,
      y0: cursor,
      y1: cursor + band,
      lineHeight,
      size,
      maxLines: lines,
      used: 0,
    });
    cursor += band + gap;
  }

  function push(id, text, opts = {}) {
    const r = regions.get(id);
    if (!r) throw new Error(`layout.push: unknown region '${id}'`);
    const size = opts.size ?? r.size;
    const color = opts.color || '#fff';
    const maxW = opts.maxWidth ?? contentW;
    const remaining = r.maxLines - r.used;
    if (remaining <= 0) return [];

    let lines = wrapToWidth(stripSeed(text), maxW, size);
    if (lines.length > remaining) {
      const kept = lines.slice(0, remaining);
      kept[remaining - 1] = ellipsize(lines.slice(remaining - 1).join(' '), maxW, size);
      lines = kept;
    }

    const placed = [];
    for (const line of lines) {
      // Baseline sits near the bottom of the line slot so glyphs clear the top.
      const y = r.y0 + (r.used + 1) * r.lineHeight - Math.floor(r.lineHeight * 0.28);
      const row = {
        text: line,
        x: marginX,
        y,
        size,
        color,
        region: id,
        width: textWidth(line, size),
        bandTop: r.y0 + r.used * r.lineHeight,
        bandBottom: r.y0 + (r.used + 1) * r.lineHeight,
      };
      rows.push(row);
      placed.push(row);
      r.used += 1;
    }
    return placed;
  }

  function skip(id, n = 1) {
    const r = regions.get(id);
    if (!r) throw new Error(`layout.skip: unknown region '${id}'`);
    r.used = Math.min(r.maxLines, r.used + n);
  }

  // How many lines of `lineHeight` still fit below the last defined region (before
  // the bottom margin). Lets a builder size a variable region (e.g. the combat log)
  // to the space that actually remains, so it wraps to fit instead of clipping.
  function remainingLines(lineHeight) {
    if (!lineHeight) return 0;
    return Math.max(0, Math.floor((height - marginY - cursor) / lineHeight));
  }

  return {
    define,
    push,
    skip,
    remainingLines,
    rows: () => rows.slice(),
    regions: () => [...regions.values()].map((r) => ({ ...r })),
    contentWidth: contentW,
    width,
    height,
    marginX,
    marginY,
  };
}

/**
 * The bust rectangle for a bust-bearing card, in the card's logical coords —
 * the SINGLE SOURCE OF TRUTH shared by the panel builders (to size the text
 * column) and the shell (to draw the bust). Keeping both off one box is what
 * guarantees text and the character picture can never overprint (directive §4).
 * { x, y, size, pad } — pad is the frame drawn around the bust.
 */
export function bustBoxFor(kind, width = CANVAS_W) {
  switch (kind) {
    case 'combat': return { x: width - 132, y: 40, size: 120, pad: 3 };
    case 'death': return { x: width - 128, y: 150, size: 108, pad: 3 };
    case 'creation': return { x: width - 128, y: 44, size: 108, pad: 3 };
    default: return null;
  }
}

/** Left edge of a bust box (where its frame begins). */
export function bustLeft(box) { return box.x - box.pad; }

/** Text-column width that keeps rows clear of a bust box, given the card margin. */
export function bustColW(box, marginX, gap = 8) {
  return Math.max(40, bustLeft(box) - gap - marginX);
}

/** Vertical band used by a draw-list row (for overlap tests). */
export function rowBand(row) {
  if (row.bandTop != null) return { top: row.bandTop, bottom: row.bandBottom };
  return { top: row.y - row.size, bottom: row.y + Math.ceil(row.size * 0.25) };
}

/** Assert-friendly: true when two rows' vertical bands overlap. */
export function bandsOverlap(a, b) {
  const A = rowBand(a), B = rowBand(b);
  return A.top < B.bottom && B.top < A.bottom;
}

/**
 * Build the TITLE screen draw list.
 * Regions: brand → subtitle → intro → menu.
 */
export function buildTitleDrawList({
  title,
  subtitle,
  intro,
  paletteName,
  width = CANVAS_W,
  height = CANVAS_H,
} = {}) {
  const L = createLayout({ width, height, marginX: 20, marginY: 28, gap: 14 });
  L.define('brand', { lines: 1, lineHeight: 40, size: 26 });
  L.define('subtitle', { lines: 1, lineHeight: 24, size: 13 });
  L.define('intro', { lines: 4, lineHeight: 20, size: 13 });
  L.define('menu', { lines: 5, lineHeight: 22, size: 13 });

  L.push('brand', title || 'CHAPEL PERILOUS', { color: 'accent', size: 26 });
  L.push('subtitle', subtitle || '', { color: 'dim', size: 13 });
  L.push('intro', intro || '', { color: 'faint', size: 13 });
  L.push('menu', `palette — ${stripSeed(paletteName || '—')}`, { color: 'dim', size: 12 });
  L.push('menu', '[Enter] begin', { color: 'hue', size: 14 });
  L.push('menu', '[L] continue a filed run', { color: 'dim', size: 13 });
  L.push('menu', '[P] palette   [?] all controls', { color: 'dim', size: 13 });
  return L.rows();
}

/**
 * Build the WORLD-MENU title screen draw list.
 * Regions: brand → subtitle → list (worlds + new-world slot) → menu hints.
 * `items` is an array of { label, note, selected, kind }.
 */
export function buildWorldMenuDrawList({
  title,
  subtitle,
  intro,
  paletteName,
  items = [],
  confirmDelete = null,
  width = CANVAS_W,
  height = CANVAS_H,
} = {}) {
  const L = createLayout({ width, height, marginX: 20, marginY: 24, gap: 10 });
  L.define('brand', { lines: 1, lineHeight: 34, size: 22 });
  L.define('subtitle', { lines: 1, lineHeight: 20, size: 12 });
  L.define('intro', { lines: 2, lineHeight: 18, size: 12 });
  const listLines = Math.max(4, Math.min(9, items.length + 1));
  L.define('list', { lines: listLines, lineHeight: 20, size: 13 });
  L.define('menu', { lines: 3, lineHeight: 20, size: 12 });

  L.push('brand', title || 'CHAPEL PERILOUS', { color: 'accent', size: 22 });
  L.push('subtitle', subtitle || '', { color: 'dim', size: 12 });
  L.push('intro', intro || '', { color: 'faint', size: 12 });

  if (confirmDelete) {
    L.push('list', `delete ${stripSeed(confirmDelete.name)}?  [Y] yes  [N] no`, { color: 'hue', size: 13 });
  } else {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const marker = it.selected ? '> ' : '  ';
      const color = it.selected ? 'hue' : (it.kind === 'new' ? 'dim' : 'faint');
      const line = `${marker}${it.label}${it.note ? ` — ${it.note}` : ''}`;
      L.push('list', line, { color, size: 13 });
    }
  }

  L.push('menu', `palette — ${stripSeed(paletteName || '—')}`, { color: 'dim', size: 11 });
  L.push('menu', '[Space] continue selected   [N] new world   [X] delete', { color: 'dim', size: 12 });
  L.push('menu', '[W/S] select   [P] palette   [?] all controls', { color: 'dim', size: 12 });
  return L.rows();
}

/**
 * Build the CREATION (dealt-stranger) screen draw list.
 * Regions: header → name → stats → omen → carries → menu.
 */
export function buildCreationDrawList({
  pc,
  accepted = false,
  width = CANVAS_W,
  height = CANVAS_H,
} = {}) {
  const marginX = 20;
  const L = createLayout({ width, height, marginX, marginY: 24, gap: 10 });
  // The HERO bust sits top-right; every row is clamped to the column left of it
  // so a long dealt name / omen can never overprint the character picture (§4).
  const colW = bustColW(bustBoxFor('creation', width), marginX);
  L.define('header', { lines: 1, lineHeight: 26, size: 13 });
  L.define('name', { lines: 1, lineHeight: 32, size: 18 });
  L.define('stats', { lines: 2, lineHeight: 20, size: 12 });
  L.define('omen', { lines: 3, lineHeight: 18, size: 12 });
  L.define('carries', { lines: 3, lineHeight: 18, size: 12 });
  L.define('menu', { lines: 3, lineHeight: 22, size: 13 });

  const ranks = pc && typeof pc.stats === 'function' ? pc.stats() : (pc && pc.stats) || {};
  const omen = pc && pc.omen ? String(pc.omen) : '—';
  const odd = pc && pc.oddment ? String(pc.oddment.name || pc.oddment) : '—';
  const name = (pc && pc.name) || '—';

  L.push('header', 'A STRANGER IS DEALT:', { color: 'dim', size: 13, maxWidth: colW });
  L.push('name', name, { color: 'hue', size: 18, maxWidth: colW });
  // Two short stat lines — a single line clips on the narrow canvas.
  L.push('stats', `nerve ${ranks.nerve || '—'}   craft ${ranks.craft || '—'}`, { color: 'dim', size: 12, maxWidth: colW });
  L.push('stats', `pull ${ranks.pull || '—'}   gnosis ${ranks.gnosis || '—'}`, { color: 'dim', size: 12, maxWidth: colW });
  L.push('omen', `omen — ${stripSeed(omen)}`, { color: 'faint', size: 12, maxWidth: colW });
  L.push('carries', `carries — ${stripSeed(odd)}`, { color: 'faint', size: 12, maxWidth: colW });
  L.push('menu', accepted ? '[E] embark' : '[Space] accept', { color: 'hue', size: 14, maxWidth: colW });
  L.push('menu', '[R] deal another', { color: 'dim', size: 13, maxWidth: colW });
  L.push('menu', '[Esc] back', { color: 'dim', size: 13, maxWidth: colW });
  return L.rows();
}

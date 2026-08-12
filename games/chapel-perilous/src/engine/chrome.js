// M6 INTERFACE — one chrome vocabulary shared by every mode.
//
// Two headless-testable surfaces:
//   • buildKeybar(hints, opts)  → a bottom-of-screen control legend, wrapped so
//     nothing clips the canvas width. Every mode draws one, so the same key
//     always reads the same way and no control is more than a glance away.
//   • buildHelpOverlay(opts)    → the full control reference ([?] from any mode),
//     grouped by mode + the always-on global keys, on the shared layout planner.
//
// Both return draw-list rows ({text,x,y,size,color,width,bandTop,bandBottom})
// compatible with layout.js's overlap/clip regression helpers.
import { CANVAS_W, CANVAS_H, textWidth, createLayout, ellipsize } from './layout.js';
import { PANEL_W } from './frame.js';
import { STAT_VERB, RANKS } from './character.js';
import { DIFFICULTY_RANK } from './negotiation.js';

// C4 (M12) — the stranger's nature: which stat gates which social verb, in-voice, with
// qualitative rank wording (R4: never a raw %). Sourced from the real STAT_VERB /
// DIFFICULTY_RANK so this reference can never drift from the mechanics it explains.
const NATURE_GLOSS = {
  overawe: 'stare it down',
  impress: 'show real skill',
  bargain: 'offer what it wants',
  bind: 'speak its true name',
};
export function natureLines() {
  const gates = ['nerve', 'craft', 'pull', 'gnosis'].map((stat) => {
    const verb = STAT_VERB[stat];
    return `${stat} → ${verb}: ${NATURE_GLOSS[verb] || verb}`;
  });
  const ladder = `ranks run ${RANKS.join(' · ').toLowerCase()}`;
  const thresh = `a ${DIFFICULTY_RANK.open.toLowerCase()} hand opens most doors; the hard ones want ${DIFFICULTY_RANK.hard.toLowerCase()}`;
  return { gates, ladder, thresh };
}
// The keybar legend + help overlay read their control copy from the ONE bindings
// table (ADDENDUM 3), so the on-screen legend and the live dispatch can't drift.
import { MODE_HINTS, GLOBAL_HINTS } from './bindings.js';

// Re-exported so existing importers (and the regression suite) keep their source.
export { MODE_HINTS, GLOBAL_HINTS };

/** Render one hint pair as a chip: "[Enter] begin". */
export function chip([key, label]) {
  return `[${key}] ${label}`;
}

/**
 * Pack chips onto as few lines as fit within maxW (each line is a string).
 * Chips are separated by two spaces so the legend reads as distinct controls.
 */
export function packChips(chips, maxW, size) {
  const lines = [];
  let cur = '';
  for (const c of chips) {
    const next = cur ? `${cur}  ${c}` : c;
    if (cur && textWidth(next, size) > maxW) { lines.push(cur); cur = c; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Build the bottom keybar draw list for a mode.
 * mode hints first, then the global keys; wrapped to width, bottom-anchored.
 */
export function buildKeybar(mode, {
  width = CANVAS_W,
  height = CANVAS_H,
  marginX = 12,
  size = 12,
  lineHeight = 16,
  bottomPad = 8,
  extra = [],
} = {}) {
  const hints = [...(MODE_HINTS[mode] || []), ...extra, ...GLOBAL_HINTS];
  const maxW = width - marginX * 2;
  const chips = hints.map(chip);
  const lines = packChips(chips, maxW, size);
  const n = lines.length;
  const rows = [];
  lines.forEach((line, i) => {
    const bandTop = height - bottomPad - (n - i) * lineHeight;
    const y = bandTop + lineHeight - Math.floor(lineHeight * 0.28);
    rows.push({
      text: line,
      x: marginX,
      y,
      size,
      color: 'dim',
      region: 'keybar',
      width: textWidth(line, size),
      bandTop,
      bandBottom: bandTop + lineHeight,
    });
  });
  return rows;
}

/**
 * Build the top HUD strip. Three zones on one band, packed so they can never
 * collide (each ellipsized to the space left after the others):
 *   • cue   — an accent mode label ("‹OVERWORLD›") at the far left (optional),
 *   • left  — the place/location, in dim, after the cue,
 *   • right — party vitals, accent, right-aligned.
 * One typographic vocabulary, mirroring the bottom keybar. Passing only
 * {left,right} (no cue) reproduces the original two-column strip exactly.
 */
export function buildHudBar({
  cue = '',
  left = '',
  right = '',
  width = CANVAS_W,
  marginX = 12,
  size = 12,
  topPad = 6,
  lineHeight = 18,
  gap = 8,
} = {}) {
  const bandTop = topPad;
  const y = bandTop + lineHeight - Math.floor(lineHeight * 0.28);
  const band = (text, x, color) => ({
    text, x, y, size, color, region: 'hud',
    width: textWidth(text, size), bandTop, bandBottom: bandTop + lineHeight,
  });
  const rows = [];
  // Right zone first — it anchors the boundary the left zones must stay behind.
  const half = (width - marginX * 2) / 2 - 6;
  const r = ellipsize(String(right), half, size);
  const rightX = width - marginX - textWidth(r, size);
  if (r) rows.push(band(r, rightX, 'accent'));
  const leftLimit = (r ? rightX : width - marginX) - gap;
  // Cue (accent), then place (dim), left-to-right within the remaining space.
  let x = marginX;
  const c = cue ? ellipsize(String(cue), Math.max(0, leftLimit - x), size) : '';
  if (c) { rows.push(band(c, x, 'accent')); x += textWidth(c, size) + gap; }
  const l = ellipsize(String(left), Math.max(0, leftLimit - x), size);
  if (l) rows.push(band(l, x, 'dim'));
  return rows;
}

/** The pixel height the top HUD strip consumes (so mode content can clear it). */
export function hudBarHeight({ topPad = 6, lineHeight = 18 } = {}) {
  return topPad + lineHeight + 4;
}

/**
 * Build the persistent side HUD panel draw list (ADDENDUM 2 — the top HUD strip,
 * folded into a standing CRPG side column). A `cue` title (accent) followed by
 * labelled groups of value lines, stacked on the shared region planner so it
 * inherits the no-overlap / no-clip guarantees the regression suite asserts.
 *   groups: [{ heading?, lines:[string], color? }]
 * Each string is ellipsized to the panel's content width so nothing clips.
 */
export function buildPanel({
  cue = '',
  groups = [],
  width = PANEL_W,
  height = 444,
  marginX = 14,
  marginY = 16,
  gap = 8,
} = {}) {
  const L = createLayout({ width, height, marginX, marginY, gap });
  const contentW = width - marginX * 2;
  L.define('cue', { lines: 1, lineHeight: 24, size: 15 });
  groups.forEach((g, gi) => {
    L.define(`h${gi}`, { lines: 1, lineHeight: 16, size: 11 });
    L.define(`b${gi}`, { lines: Math.max(1, g.lines.length), lineHeight: 18, size: 13 });
  });
  L.push('cue', ellipsize(String(cue || ''), contentW, 15), { color: 'accent', size: 15 });
  groups.forEach((g, gi) => {
    if (g.heading) L.push(`h${gi}`, ellipsize(`— ${g.heading} —`, contentW, 11), { color: 'faint', size: 11 });
    else L.skip(`h${gi}`);
    for (const line of (g.lines.length ? g.lines : [''])) {
      L.push(`b${gi}`, ellipsize(String(line), contentW, 13), { color: g.color || 'dim', size: 13 });
    }
  });
  return L.rows();
}

/** The pixel height the keybar for `mode` will consume (so HUDs can clear it). */
export function keybarHeight(mode, opts = {}) {
  const rows = buildKeybar(mode, opts);
  if (!rows.length) return 0;
  const top = Math.min(...rows.map((r) => r.bandTop));
  return (opts.height ?? CANVAS_H) - top;
}

/**
 * Build the full [?] help overlay draw list: title, then every mode's controls
 * and the global keys, on the shared stacked-region planner (so it inherits the
 * no-overlap/no-clip guarantees the regression suite already asserts).
 */
export function buildHelpOverlay({ width = CANVAS_W, height = CANVAS_H } = {}) {
  const L = createLayout({ width, height, marginX: 18, marginY: 12, gap: 5 });
  const groups = [
    ['moving about', [...MODE_HINTS.overworld, ...MODE_HINTS.dungeon]],
    ['in the city', MODE_HINTS.city],
    ['the journal', MODE_HINTS.journal],
    ['an encounter', [...MODE_HINTS.combat, ...MODE_HINTS.combatTalk]],
    ['always', GLOBAL_HINTS],
  ];
  // De-dupe repeated pairs within a group (overworld+dungeon share some keys).
  const dedupe = (pairs) => {
    const seen = new Set();
    return pairs.filter(([k, l]) => { const id = `${k}|${l}`; if (seen.has(id)) return false; seen.add(id); return true; });
  };
  L.define('title', { lines: 1, lineHeight: 24, size: 18 });
  const maxW = width - 36;
  const packed = groups.map(([label, pairs]) => {
    const lines = packChips(dedupe(pairs).map(chip), maxW, 12);
    return { label, lines };
  });
  packed.forEach((g, gi) => {
    L.define(`h${gi}`, { lines: 1, lineHeight: 16, size: 12 });
    L.define(`b${gi}`, { lines: g.lines.length, lineHeight: 16, size: 12 });
  });
  L.define('close', { lines: 1, lineHeight: 18, size: 13 });

  L.push('title', 'CONTROLS', { color: 'hue', size: 18 });
  packed.forEach((g, gi) => {
    L.push(`h${gi}`, `— ${g.label} —`, { color: 'faint', size: 12 });
    for (const line of g.lines) L.push(`b${gi}`, line, { color: 'dim', size: 12 });
  });
  L.push('close', '[?] again for the stranger\'s nature   ·   [Esc] to close', { color: 'faint', size: 13 });
  return L.rows();
}

// The one-time "the stranger's nature" chargen panel (C4): a framed, skippable
// explainer of the four verb-gates in-voice. Same content as the permanent [?]
// reference; shown once so a first-time player learns what the ranks mean.
export function buildNatureDrawList({ width = CANVAS_W, height = CANVAS_H, reference = false } = {}) {
  const L = createLayout({ width, height, marginX: 22, marginY: 22, gap: 10 });
  const colW = width - 44;
  const nat = natureLines();
  L.define('title', { lines: 1, lineHeight: 30, size: 20 });
  L.define('lead', { lines: 3, lineHeight: 20, size: 13 });
  L.define('gates', { lines: nat.gates.length + 1, lineHeight: 22, size: 14 });
  L.define('ranks', { lines: 3, lineHeight: 19, size: 12 });
  L.define('close', { lines: 1, lineHeight: 20, size: 12 });
  L.push('title', 'THE STRANGER\'S NATURE', { color: 'hue', size: 20 });
  L.push('lead', 'You do not fight your way through everything. Four turns of nature open doors that blows never will:', { color: 'faint', size: 13, maxWidth: colW });
  for (const g of nat.gates) L.push('gates', g, { color: 'dim', size: 14, maxWidth: colW });
  L.push('ranks', nat.ladder, { color: 'faint', size: 12, maxWidth: colW });
  L.push('ranks', nat.thresh, { color: 'faint', size: 12, maxWidth: colW });
  // The chargen panel is dismissed by any key; the permanent [?] reference page closes.
  L.push('close', reference ? '[?] or [Esc] to close' : 'any key to take up the thread', { color: 'faint', size: 12, maxWidth: colW });
  return L.rows();
}

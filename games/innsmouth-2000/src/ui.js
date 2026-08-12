// OS-window UI chrome for INNSMOUTH 2000 (STUDY section 3).
//
// The reference's beveled-panel look: raised grey panels with a light top-left bevel and a dark
// bottom-right bevel, a coloured title bar, chunky labels, tool buttons as pressed/raised wells.
// Layout and hit-testing are pure so node --test covers them; the ctx drawing is browser-side.
// Player-facing wording stays plain English, period register, no em-dashes (hard rule 10).

import { TOOL, TOOL_COST, VIEW } from './tools.js';
import { SPEED, computeBudget, ORDINANCE_INFO, CLASS_LIST, townTitle } from './sim.js';
import { GOD_LIST, GOD_INFO, FAVOR_MAX, favorStage, FAVOR_STAGE } from './gods.js';
import { CHROME, ZONE_TINT, RAMP, BASE, LIGHT, SHADOW, HIGHLIGHT, UNDERGROUND } from './palette.js';
import { SCENARIOS, SCENARIO_LIST } from './scenarios.js';
import { DEFAULT_VOLUME_IDX, VOLUME_LEVELS } from './music.js';

const CLASS_LABEL = { unwary: 'The Unwary', cultist: 'Cultists', deepone: 'Deep Ones', scholar: 'Scholars' };

// Chrome text-scale (M7): a legibility setting independent of the map zoom. The reference's canvas
// monospace at 11-13px is a hard floor on small screens; this multiplies every chrome font AND the
// text-bearing windows/bar that hold it, so enlarged text still fits. The pictographic toolbar is
// left alone (it is not the text floor and would overflow a short viewport if scaled). Tests run at
// the default 1.0 and never touch this, so the pure-layout geometry assertions are unaffected.
export const CHROME_SCALES = [1, 1.25, 1.5];
let CHROME_SCALE = 1;
export function setChromeScale(s) { CHROME_SCALE = s; return CHROME_SCALE; }
export function getChromeScale() { return CHROME_SCALE; }
// Advance to the next scale in the ring; returns the new value.
export function cycleChromeScale() {
  const i = CHROME_SCALES.indexOf(CHROME_SCALE);
  CHROME_SCALE = CHROME_SCALES[(i + 1) % CHROME_SCALES.length];
  return CHROME_SCALE;
}
// A scaled pixel count (rounded), and a scaled monospace font string.
function sc(px) { return Math.round(px * CHROME_SCALE); }
function fpx(px) { return `${sc(px)}px monospace`; }

// --- the one shared padding standard (M10 padding sweep, operator feedback 2026-08-05) ---------
// A box that ends immediately after its text reads as a rendering defect, not chrome. Before this
// pass every popup carried its own magic number (Query 6-8px, the Ledger/Wrath/Help/Advisor 12px,
// Favor 16px, the Courier paper 14px...). PANEL_PAD is now the ONE dial every window below insets
// its title and body text by (scaled, so it still holds the M7 legibility floor at every chrome
// scale); MIN_POPUP_W is the floor a small popup's content box is never squeezed under, so a
// single short word never renders as a bare sliver. Raw, unscaled px -- callers apply their own
// scale helper (sc() here, s()/scale in advisor.js and overlays.js).
export const PANEL_PAD = 16;
export const MIN_POPUP_W = 120;

// --- monospace text fitting (M8 text-overflow) -------------------------------------------
// Headless Chrome's generic `monospace` measures ~0.60 * px advance per glyph (2026-08-06),
// noticeably wider than the old 0.55 calibration. Deriving the advance from the active font size
// keeps wrapping, sizing, and the text-overflow detector honest at every chrome scale. These
// pure helpers let layout size a box to its text without a ctx, so the same box the headless
// build renders is the box the detector measures. Kept here (the chrome hub) and shared by
// strips.js and the detector.
export function monoAdvance(px) { return 0.6; }
export function monoWidth(text, px) { return String(text).length * px * monoAdvance(px); }

// Truncate a run to fit maxWidth at font px, appending an ellipsis when it must cut.
export function fitMono(text, maxWidth, px) {
  const s = String(text);
  if (monoWidth(s, px) <= maxWidth) return s;
  let n = Math.max(0, Math.floor(maxWidth / (px * monoAdvance(px))) - 1);
  while (n > 0 && monoWidth(s.slice(0, n) + '…', px) > maxWidth) n--;
  return s.slice(0, n) + '…';
}

// Greedy word-wrap to maxWidth at font px, at most maxLines; the final line is truncated with an
// ellipsis if the text does not fit. Never breaks below one word per line (a single over-long word
// is itself ellipsized).
export function wrapMono(text, maxWidth, px, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const trial = cur ? `${cur} ${words[i]}` : words[i];
    if (!cur || monoWidth(trial, px) <= maxWidth) {
      cur = trial;
    } else {
      lines.push(cur);
      if (lines.length === maxLines - 1) { cur = words.slice(i).join(' '); break; }
      cur = words[i];
    }
  }
  lines.push(fitMono(cur, maxWidth, px));
  return lines;
}

// The toolbar's tools, in order, with a plain label for the tooltip/aria.
export const TOOLBAR_TOOLS = [
  { tool: TOOL.QUERY, label: 'Query' },
  { tool: TOOL.BULLDOZE, label: 'Bulldoze' },
  { tool: TOOL.ROAD, label: 'Road' },
  { tool: TOOL.POWERLINE, label: 'Power line' },
  { tool: TOOL.GASWORKS, label: 'Gasworks' },
  { tool: TOOL.WHALEOIL, label: 'Whale-Oil Works' },
  { tool: TOOL.ZONE_R, label: 'Residential' },
  { tool: TOOL.ZONE_C, label: 'Commercial' },
  { tool: TOOL.ZONE_I, label: 'Industrial' },
  { tool: TOOL.CONSTABULARY, label: 'Constabulary' },
  { tool: TOOL.ASYLUM, label: 'Asylum' },
  { tool: TOOL.CHAPEL, label: 'Chapel' },
  { tool: TOOL.SHRINE, label: 'Shrine' },
  { tool: TOOL.UNIVERSITY, label: 'University' },
];

// The underground palette (M-a). Building tools switch context with the view: below the street the
// player lays mains and sets the water works, and the bulldozer lifts pipe instead of clearing lots.
// Query and Bulldoze appear in both palettes at the same two places, so their number keys never lie.
export const UNDERGROUND_TOOLS = [
  { tool: TOOL.QUERY, label: 'Query' },
  { tool: TOOL.BULLDOZE, label: 'Bulldoze' },
  { tool: TOOL.PIPE, label: 'Water Main' },
  { tool: TOOL.PUMPHOUSE, label: 'Pump House' },
  { tool: TOOL.WELLHOUSE, label: 'Well House' },
  { tool: TOOL.RESERVOIR, label: 'Reservoir' },
  // M-b: the four answers to a fouled network, in the order a player reaches for them.
  { tool: TOOL.FILTERHOUSE, label: 'Filter House' },
  { tool: TOOL.VALVE, label: 'Valve' },
  { tool: TOOL.FLUSH, label: 'Flush Mains' },
  { tool: TOOL.SEAL, label: 'Sealing Works' },
];

// Every tool that appears on either palette, for tooltip and status-strip lookups.
const ALL_TOOLBAR_TOOLS = TOOLBAR_TOOLS.concat(
  UNDERGROUND_TOOLS.filter((u) => !TOOLBAR_TOOLS.some((t) => t.tool === u.tool)),
);

export function toolLabel(tool) {
  const entry = ALL_TOOLBAR_TOOLS.find((t) => t.tool === tool);
  return entry ? entry.label : tool;
}

// The palette for a build context.
export function toolbarToolsFor(view) {
  return view === VIEW.UNDERGROUND ? UNDERGROUND_TOOLS : TOOLBAR_TOOLS;
}

// The tools that only exist below the street. Selecting one drops the player underground; picking
// a surface-only tool brings them back up (main.js applies this, so the palette always matches).
// The main, the valve and the flush all work ON the mains, so they belong below the street. The
// sealing works caps a fissure, which is a thing in the rock and only visible from down there.
const UNDERGROUND_ONLY = new Set([TOOL.PIPE, TOOL.VALVE, TOOL.FLUSH, TOOL.SEAL]);
const NEUTRAL_TOOLS = new Set([
  TOOL.QUERY, TOOL.BULLDOZE, TOOL.PUMPHOUSE, TOOL.WELLHOUSE, TOOL.RESERVOIR, TOOL.FILTERHOUSE,
]);

// Which view a tool belongs to, or null where it works the same in both.
export function viewForTool(tool) {
  if (UNDERGROUND_ONLY.has(tool)) return VIEW.UNDERGROUND;
  if (NEUTRAL_TOOLS.has(tool)) return null;
  return VIEW.SURFACE;
}

// Build the toolbar layout: a vertical strip docked top-left. Pure geometry. `opts.view` picks the
// palette; the view toggle sits below the tools as its own button, deliberately NOT in `buttons`
// (it selects no tool, so hitToolbar must never return it).
export function buildToolbar(opts = {}) {
  const pad = opts.pad || 6;
  const x = opts.x ?? 12;
  const y = opts.y ?? 12;
  const tools = toolbarToolsFor(opts.view);
  const n = tools.length;
  // The panel holds n tool wells, a separator gap, and the view toggle below them.
  const heightFor = (b, g) => pad * 2 + n * b + (n - 1) * g + g * 2 + b;
  let btn = opts.btn || 34;
  let gap = opts.gap || 4;
  // `opts.maxH` is the room the palette actually has above the Demand gadget docked bottom-left.
  // A long palette on a short viewport tightens its pitch rather than running under it: the gap
  // closes first, then the wells shrink. At ordinary sizes nothing moves at all; only the largest
  // chrome text scale on a small screen ever trims a pixel.
  if (opts.maxH > 0) {
    while (heightFor(btn, gap) > opts.maxH && gap > 2) gap -= 1;
    while (heightFor(btn, gap) > opts.maxH && btn > 24) btn -= 1;
  }
  const buttons = tools.map((t, i) => ({
    tool: t.tool,
    label: t.label,
    rect: { x: x + pad, y: y + pad + i * (btn + gap), w: btn, h: btn },
  }));
  const toolsH = tools.length * btn + (tools.length - 1) * gap;
  const viewToggle = {
    rect: { x: x + pad, y: y + pad + toolsH + gap * 2, w: btn, h: btn },
    view: opts.view === VIEW.UNDERGROUND ? VIEW.UNDERGROUND : VIEW.SURFACE,
  };
  const panel = {
    x, y,
    w: btn + pad * 2,
    h: pad * 2 + toolsH + gap * 2 + btn,
  };
  return { panel, buttons, viewToggle };
}

// Whether a screen point is on the Underground / Surface view toggle.
export function hitViewToggle(toolbar, px, py) {
  return !!(toolbar.viewToggle && inRect(toolbar.viewToggle.rect, px, py));
}

// Point-in-rect.
export function inRect(r, px, py) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// Which toolbar tool (if any) is under a screen point.
export function hitToolbar(toolbar, px, py) {
  for (const b of toolbar.buttons) {
    if (inRect(b.rect, px, py)) return b.tool;
  }
  return null;
}

// Whether a screen point is anywhere on the toolbar panel (so map clicks there are swallowed).
export function overToolbar(toolbar, px, py) {
  return inRect(toolbar.panel, px, py);
}

// The number-key shortcut for a toolbar tool, real and reachable: a keydown event reports one
// digit per press, so only the first 9 tools (index 0-8) of the CURRENT palette have one. Derived
// from that palette's own order so it can never drift from the handler it describes.
export function toolbarShortcut(tool, view) {
  const i = toolbarToolsFor(view).findIndex((t) => t.tool === tool);
  return i >= 0 && i < 9 ? i + 1 : null;
}

// Which tool a digit key (1-9) selects on the current plane. Null for anything that is not a
// single reachable digit, so a press never picks a surface tool while the player is below.
export function toolForNumberKey(n, view) {
  if (!Number.isInteger(n) || n < 1 || n > 9) return null;
  const entry = toolbarToolsFor(view)[n - 1];
  return entry ? entry.tool : null;
}

// The hover/focus tooltip's content for a toolbar tool: its name, then its cost and key shortcut
// when that data exists. Never invents anything -- QUERY has no treasury cost, and five tools
// (Constabulary onward) have no reachable key -- so those lines are simply omitted.
export function toolbarTooltipLines(tool, view) {
  const entry = ALL_TOOLBAR_TOOLS.find((t) => t.tool === tool);
  if (!entry) return null;
  const lines = [entry.label];
  const cost = TOOL_COST[tool];
  const shortcut = toolbarShortcut(tool, view);
  const bits = [];
  if (Number.isFinite(cost)) bits.push(`$${cost}`);
  if (shortcut) bits.push(`key ${shortcut}`);
  if (bits.length) lines.push(bits.join('   '));
  return lines;
}

// The query window layout at a top-left origin. Pure. Returns the frame, title bar, and close box.
// `opts.lines` may be the actual array of body strings (preferred: the window is sized to the widest
// line so no readout clips, M8 text-overflow) or a plain count (older callers get the default width).
// `opts.title` widens the frame for a long title bar too.
export function buildQueryWindow(x, y, opts = {}) {
  const src = opts.lines;
  const titleH = sc(18);
  let w;
  let bodyLines = null;
  if (Array.isArray(src)) {
    // Size the body to its widest line (so short readouts get a snug box), capped at a comfortable
    // width; any line past that cap wraps rather than clips (M8 text-overflow). The window is the
    // player's full readout, so it never truncates — it grows in height instead. Body lines draw at
    // 12px, PANEL_PAD in from each side (the shared padding standard, M10); the title (12px) must
    // also clear the close box.
    const titleNeed = opts.title ? monoWidth(opts.title, sc(12)) + sc(PANEL_PAD) + titleH + sc(6) : 0;
    const bodyNeed = Math.max(0, ...src.map((l) => monoWidth(l, sc(12)))) + sc(PANEL_PAD) * 2;
    w = Math.max(sc(150), Math.min(sc(opts.maxW || 360), Math.ceil(Math.max(bodyNeed, titleNeed))));
    bodyLines = src.flatMap((l) => wrapMono(l, w - sc(PANEL_PAD) * 2, sc(12), 3));
  } else {
    w = sc(opts.w || 210);
  }
  const lineCount = bodyLines ? bodyLines.length : (typeof src === 'number' ? src : 5);
  const bodyH = sc(10) + lineCount * sc(16);
  const h = titleH + bodyH;
  return {
    frame: { x, y, w, h },
    titleBar: { x, y, w, h: titleH },
    close: { x: x + w - titleH + sc(3), y: y + sc(3), w: titleH - sc(6), h: titleH - sc(6) },
    body: { x, y: y + titleH, w, h: bodyH },
    titleH, bodyLines,
  };
}

// The top status bar: city readout on the left, speed buttons on the right. Pure layout.
export const SPEED_ORDER = [SPEED.PAUSED, SPEED.CREEP, SPEED.SLOW, SPEED.MEDIUM, SPEED.FAST];

export function buildTopBar(viewportW) {
  const h = sc(26);
  const btn = sc(22);
  const gap = sc(3);
  const n = SPEED_ORDER.length;
  const startX = viewportW - (btn * n + gap * (n - 1)) - sc(8);
  const speeds = SPEED_ORDER.map((speed, i) => ({
    speed,
    rect: { x: startX + i * (btn + gap), y: sc(2), w: btn, h: btn },
  }));
  // The window buttons march leftward from the speed buttons: Ledger, Gods, Wrath, save, mute,
  // volume, text-size, motion.
  const by = sc(3);
  const bh = sc(20);
  const ledger = { x: startX - sc(78), y: by, w: sc(70), h: bh };
  const gods = { x: ledger.x - sc(62), y: by, w: sc(56), h: bh };
  const disasters = { x: gods.x - sc(68), y: by, w: sc(62), h: bh };
  const save = { x: disasters.x - sc(60), y: by, w: sc(46), h: bh };
  const mute = { x: save.x - sc(28), y: by, w: sc(22), h: bh }; // the music toggle (speaker)
  const vol = { x: mute.x - sc(28), y: by, w: sc(22), h: bh }; // the bed-volume step (bars)
  const textscale = { x: vol.x - sc(28), y: by, w: sc(22), h: bh }; // the chrome text-size cycle
  const motion = { x: textscale.x - sc(28), y: by, w: sc(22), h: bh }; // the ambient-motion toggle (gull)
  return { panel: { x: 0, y: 0, w: viewportW, h }, speeds, ledger, gods, disasters, save, mute, vol, textscale, motion };
}

export function hitSpeed(topbar, px, py) {
  for (const b of topbar.speeds) if (inRect(b.rect, px, py)) return b.speed;
  return null;
}

export function overTopBar(topbar, px, py) {
  return inRect(topbar.panel, px, py);
}

// --- drawing (browser) -------------------------------------------------------------------

// A raised (or pressed) beveled panel: light top+left, shadow bottom+right (STUDY 3).
export function drawBevel(ctx, x, y, w, h, pressed = false) {
  ctx.fillStyle = CHROME.windowFace;
  ctx.fillRect(x, y, w, h);
  const light = pressed ? CHROME.bevelShadow : CHROME.bevelLight;
  const shadow = pressed ? CHROME.bevelLight : CHROME.bevelShadow;
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, 2); // top
  ctx.fillRect(x, y, 2, h); // left
  ctx.fillStyle = shadow;
  ctx.fillRect(x, y + h - 2, w, 2); // bottom
  ctx.fillRect(x + w - 2, y, 2, h); // right
}

// Bayer 4x4 ordered-dither threshold matrix for chrome scrims (STUDY 2.2).
const SCRIM_BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// A full-screen dithered scrim: ordered-dither cells of one palette colour over whatever is already
// drawn, so the plate reads over a busy backdrop without any smooth alpha gradient (STUDY 2.1).
// Density 0..1 is the fraction of cells filled. Falls back to a solid wash when pattern creation is
// unavailable (node test mocks).
export function drawDitherScrim(ctx, w, h, color = CHROME.deepFrame, density = 0.5) {
  if (!ctx.createPattern) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const patW = 4, patH = 4;
  const c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!c) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  c.width = patW;
  c.height = patH;
  const pctx = c.getContext('2d');
  pctx.fillStyle = color;
  const n = Math.max(0, Math.min(patW * patH, Math.round(patW * patH * density)));
  const cells = [];
  for (let y = 0; y < patH; y++) {
    for (let x = 0; x < patW; x++) cells.push({ x, y, t: SCRIM_BAYER4[y][x] });
  }
  cells.sort((a, b) => a.t - b.t);
  for (let i = 0; i < n; i++) pctx.fillRect(cells[i].x, cells[i].y, 1, 1);
  ctx.fillStyle = ctx.createPattern(c, 'repeat');
  ctx.fillRect(0, 0, w, h);
}

export function drawToolbar(ctx, toolbar, activeTool) {
  // Deep frame then the panel face.
  const p = toolbar.panel;
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
  drawBevel(ctx, p.x, p.y, p.w, p.h, false);
  for (const b of toolbar.buttons) {
    const active = b.tool === activeTool;
    drawBevel(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, active);
    drawToolIcon(ctx, b.tool, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2, b.rect.w, active);
  }
  // The view toggle sits apart from the tools, pressed in while the player is below the street.
  const vt = toolbar.viewToggle;
  if (vt) {
    const below = vt.view === VIEW.UNDERGROUND;
    // A hairline rule separates the toggle from the tool wells above it.
    ctx.fillStyle = CHROME.bevelShadow;
    ctx.fillRect(vt.rect.x, vt.rect.y - 5, vt.rect.w, 1);
    drawBevel(ctx, vt.rect.x, vt.rect.y, vt.rect.w, vt.rect.h, below);
    drawViewToggleIcon(ctx, vt.rect.x + vt.rect.w / 2, vt.rect.y + vt.rect.h / 2, vt.rect.w, below);
  }
}

// The view toggle's tooltip: what pressing it does, and the key that also does it.
export function viewToggleTooltipLines(view) {
  return view === VIEW.UNDERGROUND
    ? ['Surface', 'key U']
    : ['Underground', 'key U'];
}

// The toggle icon: a ground line with the town above it, and a main running below. Pressed (below
// the street) the earth reads dark and the main is lit; raised, the surface is the lit half.
function drawViewToggleIcon(ctx, cx, cy, size, below) {
  const s = size * 0.5;
  const off = below ? 1 : 0;
  ctx.save();
  ctx.translate(cx + off, cy + off);
  // The ground line.
  ctx.strokeStyle = CHROME.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, 0);
  ctx.lineTo(s * 0.6, 0);
  ctx.stroke();
  // A little town above the line.
  ctx.fillStyle = below ? CHROME.bevelShadow : RAMP.clapboard[LIGHT];
  ctx.fillRect(-s * 0.45, -s * 0.34, s * 0.3, s * 0.34);
  ctx.fillRect(-s * 0.05, -s * 0.5, s * 0.3, s * 0.5);
  ctx.fillRect(s * 0.32, -s * 0.26, s * 0.24, s * 0.26);
  // The main below it.
  ctx.strokeStyle = below ? UNDERGROUND.pipeGoodLit : CHROME.bevelShadow;
  ctx.lineWidth = Math.max(2, s * 0.22);
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, s * 0.34);
  ctx.lineTo(s * 0.6, s * 0.34);
  ctx.stroke();
  ctx.restore();
}

// A small pictographic icon per tool, drawn from primitives (no bitmap assets, no letters).
export function drawToolIcon(ctx, tool, cx, cy, size, pressed = false) {
  const s = size * 0.5;
  const off = pressed ? 1 : 0; // nudge when the button is pressed
  ctx.save();
  ctx.translate(cx + off, cy + off);
  ctx.lineWidth = 2;
  ctx.strokeStyle = CHROME.ink;
  ctx.fillStyle = CHROME.ink;

  if (tool === TOOL.QUERY) {
    // Magnifying glass: circle + handle.
    ctx.beginPath();
    ctx.arc(-s * 0.15, -s * 0.15, s * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.18);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.stroke();
  } else if (tool === TOOL.BULLDOZE) {
    // A dozer blade: a filled wedge over a small tread bar.
    ctx.fillStyle = RAMP.rock[LIGHT];
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.1);
    ctx.lineTo(s * 0.1, -s * 0.5);
    ctx.lineTo(s * 0.3, -s * 0.25);
    ctx.lineTo(-s * 0.3, s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = CHROME.ink;
    ctx.stroke();
    ctx.fillStyle = CHROME.ink;
    ctx.fillRect(-s * 0.5, s * 0.3, s * 0.9, s * 0.22);
  } else if (tool === TOOL.ROAD) {
    // A dirt lane running diagonally with a centre rut.
    ctx.fillStyle = RAMP.dirt[BASE];
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.15);
    ctx.lineTo(s * 0.15, -s * 0.5);
    ctx.lineTo(s * 0.5, -s * 0.15);
    ctx.lineTo(-s * 0.15, s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = RAMP.dirt[LIGHT];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.0);
    ctx.lineTo(s * 0.0, -s * 0.5);
    ctx.stroke();
  } else if (tool === TOOL.POWERLINE) {
    // A pole with two cross wires.
    ctx.strokeStyle = CHROME.ink;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.lineTo(0, -s * 0.5);
    ctx.moveTo(-s * 0.4, -s * 0.3);
    ctx.lineTo(s * 0.4, -s * 0.3);
    ctx.moveTo(-s * 0.35, -s * 0.1);
    ctx.lineTo(s * 0.35, -s * 0.1);
    ctx.stroke();
  } else if (tool === TOOL.ZONE_R) {
    drawBuildingGlyph(ctx, s, ZONE_TINT.residential, 'house');
  } else if (tool === TOOL.ZONE_C) {
    drawBuildingGlyph(ctx, s, ZONE_TINT.commercial, 'store');
  } else if (tool === TOOL.ZONE_I) {
    drawBuildingGlyph(ctx, s, ZONE_TINT.industrial, 'factory');
  } else if (tool === TOOL.GASWORKS) {
    // A gasholder drum.
    ctx.fillStyle = RAMP.rock[LIGHT]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.75);
    ctx.strokeRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.75);
    ctx.beginPath(); ctx.moveTo(-s * 0.35, -s * 0.05); ctx.lineTo(s * 0.35, -s * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, -s * 0.35, s * 0.35, s * 0.12, 0, 0, Math.PI * 2) : ctx.arc(0, -s * 0.35, s * 0.35, 0, Math.PI * 2); ctx.stroke();
  } else if (tool === TOOL.WHALEOIL) {
    // A tank with a smoking chimney.
    ctx.fillStyle = RAMP.rock[BASE]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.45, -s * 0.05, s * 0.55, s * 0.5);
    ctx.strokeRect(-s * 0.45, -s * 0.05, s * 0.55, s * 0.5);
    ctx.fillRect(s * 0.2, -s * 0.5, s * 0.16, s * 0.95); // chimney
    ctx.strokeRect(s * 0.2, -s * 0.5, s * 0.16, s * 0.95);
    ctx.fillStyle = 'rgba(120,120,120,0.7)';
    ctx.beginPath(); ctx.arc(s * 0.28, -s * 0.55, s * 0.14, 0, Math.PI * 2); ctx.fill();
  } else if (tool === TOOL.CONSTABULARY) {
    // A watch-house with a blue lamp.
    ctx.fillStyle = RAMP.clapboard[LIGHT]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.4, -s * 0.25, s * 0.8, s * 0.7);
    ctx.strokeRect(-s * 0.4, -s * 0.25, s * 0.8, s * 0.7);
    ctx.fillStyle = '#2f5fa0';
    ctx.beginPath(); ctx.arc(0, -s * 0.4, s * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8fb6e0'; ctx.stroke();
  } else if (tool === TOOL.ASYLUM) {
    // An institutional block with a cupola.
    ctx.fillStyle = RAMP.rock[LIGHT]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.6);
    ctx.strokeRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.6);
    ctx.fillRect(-s * 0.12, -s * 0.45, s * 0.24, s * 0.32); // cupola
    ctx.strokeRect(-s * 0.12, -s * 0.45, s * 0.24, s * 0.32);
    ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.45); ctx.lineTo(0, -s * 0.58); ctx.lineTo(s * 0.12, -s * 0.45); ctx.stroke();
  } else if (tool === TOOL.CHAPEL) {
    // A church with a steeple.
    ctx.fillStyle = RAMP.clapboard[HIGHLIGHT]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.4, -s * 0.1, s * 0.7, s * 0.55);
    ctx.strokeRect(-s * 0.4, -s * 0.1, s * 0.7, s * 0.55);
    ctx.beginPath(); // spire
    ctx.moveTo(-s * 0.3, -s * 0.1); ctx.lineTo(-s * 0.15, -s * 0.55); ctx.lineTo(0, -s * 0.1);
    ctx.closePath(); ctx.fillStyle = RAMP.slate[BASE]; ctx.fill(); ctx.stroke();
  } else if (tool === TOOL.SHRINE) {
    // A dark canted monolith with a cold glow.
    ctx.fillStyle = RAMP.slate[SHADOW]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.22, s * 0.45); ctx.lineTo(s * 0.12, s * 0.45);
    ctx.lineTo(s * 0.22, -s * 0.5); ctx.lineTo(-s * 0.08, -s * 0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a9c8b';
    ctx.beginPath(); ctx.arc(s * 0.07, -s * 0.5, s * 0.14, 0, Math.PI * 2); ctx.fill();
  } else if (tool === TOOL.UNIVERSITY) {
    // A college hall with a battlemented tower and a violet containment lamp.
    ctx.fillStyle = RAMP.rock[LIGHT]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.45, -s * 0.1, s * 0.9, s * 0.55);
    ctx.strokeRect(-s * 0.45, -s * 0.1, s * 0.9, s * 0.55);
    ctx.fillRect(-s * 0.4, -s * 0.5, s * 0.26, s * 0.42); // tower
    ctx.strokeRect(-s * 0.4, -s * 0.5, s * 0.26, s * 0.42);
    ctx.fillStyle = CHROME.ink; // crenellations
    ctx.fillRect(-s * 0.4, -s * 0.56, s * 0.07, s * 0.08);
    ctx.fillRect(-s * 0.27, -s * 0.56, s * 0.07, s * 0.08);
    ctx.fillStyle = '#c3a8e0'; // containment lamp
    ctx.beginPath(); ctx.arc(s * 0.28, -s * 0.2, s * 0.12, 0, Math.PI * 2); ctx.fill();
  } else if (tool === TOOL.PIPE) {
    // A length of main with a flanged joint, seen in section: the old utility-map mark.
    ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillStyle = UNDERGROUND.pipeGood;
    ctx.fillRect(-s * 0.55, -s * 0.16, s * 1.1, s * 0.32);
    ctx.strokeRect(-s * 0.55, -s * 0.16, s * 1.1, s * 0.32);
    ctx.fillStyle = UNDERGROUND.pipeGoodLit; // the lit crown of the pipe
    ctx.fillRect(-s * 0.55, -s * 0.16, s * 1.1, s * 0.1);
    ctx.fillStyle = RAMP.slate[BASE]; // the joint collar
    ctx.fillRect(-s * 0.1, -s * 0.28, s * 0.2, s * 0.56);
    ctx.strokeRect(-s * 0.1, -s * 0.28, s * 0.2, s * 0.56);
  } else if (tool === TOOL.PUMPHOUSE) {
    // A pump house: a low shed with a standpipe and a delivery elbow.
    ctx.fillStyle = RAMP.clapboard[LIGHT]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.45, -s * 0.1, s * 0.7, s * 0.55);
    ctx.strokeRect(-s * 0.45, -s * 0.1, s * 0.7, s * 0.55);
    ctx.fillStyle = RAMP.slate[BASE]; // roof
    ctx.beginPath();
    ctx.moveTo(-s * 0.52, -s * 0.1); ctx.lineTo(-s * 0.1, -s * 0.36); ctx.lineTo(s * 0.32, -s * 0.1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = UNDERGROUND.pipeGood; // the standpipe rising out of the shed
    ctx.lineWidth = Math.max(2, s * 0.2);
    ctx.beginPath();
    ctx.moveTo(s * 0.4, s * 0.45); ctx.lineTo(s * 0.4, -s * 0.2); ctx.lineTo(s * 0.12, -s * 0.2);
    ctx.stroke();
  } else if (tool === TOOL.WELLHOUSE) {
    // A covered well: a round curb, a peaked cap, and the bucket rope.
    ctx.fillStyle = RAMP.rock[BASE]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.3, s * 0.05, s * 0.6, s * 0.4);
    ctx.strokeRect(-s * 0.3, s * 0.05, s * 0.6, s * 0.4);
    ctx.fillStyle = RAMP.clapboard[BASE]; // the cap
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.06); ctx.lineTo(0, -s * 0.46); ctx.lineTo(s * 0.42, -s * 0.06);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1; // the rope
    ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, s * 0.06); ctx.stroke();
  } else if (tool === TOOL.RESERVOIR) {
    // A hill cistern: a squat tank on legs with a waterline across it.
    ctx.fillStyle = RAMP.rock[LIGHT]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.5, -s * 0.42, s * 1.0, s * 0.6);
    ctx.strokeRect(-s * 0.5, -s * 0.42, s * 1.0, s * 0.6);
    ctx.fillStyle = UNDERGROUND.pipeGood; // the held water
    ctx.fillRect(-s * 0.46, -s * 0.16, s * 0.92, s * 0.3);
    ctx.strokeStyle = UNDERGROUND.pipeGoodLit; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-s * 0.46, -s * 0.16); ctx.lineTo(s * 0.46, -s * 0.16); ctx.stroke();
    ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5; // the legs
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, s * 0.18); ctx.lineTo(-s * 0.34, s * 0.48);
    ctx.moveTo(s * 0.34, s * 0.18); ctx.lineTo(s * 0.34, s * 0.48);
    ctx.stroke();
  } else if (tool === TOOL.FILTERHOUSE) {
    // Sand beds: three stacked kerbed basins, the sand pale, with clean water running off the last.
    ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const y = -s * 0.42 + i * s * 0.3;
      ctx.fillStyle = i === 2 ? UNDERGROUND.pipeGood : RAMP.beach[LIGHT];
      ctx.fillRect(-s * 0.5, y, s * 1.0, s * 0.22);
      ctx.strokeRect(-s * 0.5, y, s * 1.0, s * 0.22);
    }
    ctx.strokeStyle = UNDERGROUND.pipeGoodLit; ctx.lineWidth = 2; // the outfall
    ctx.beginPath();
    ctx.moveTo(0, s * 0.1); ctx.lineTo(0, s * 0.46);
    ctx.stroke();
  } else if (tool === TOOL.VALVE) {
    // A valve wheel on a length of main: the spoked handwheel every waterworks in 1927 had.
    ctx.strokeStyle = UNDERGROUND.pipeGood; ctx.lineWidth = Math.max(2, s * 0.2);
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.3); ctx.lineTo(s * 0.55, s * 0.3);
    ctx.stroke();
    ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.32, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.moveTo(0, -s * 0.12);
      ctx.lineTo(Math.cos(a) * s * 0.32, -s * 0.12 + Math.sin(a) * s * 0.32);
    }
    ctx.stroke();
    ctx.beginPath(); // the stem down to the main
    ctx.moveTo(0, s * 0.2); ctx.lineTo(0, s * 0.3);
    ctx.stroke();
  } else if (tool === TOOL.FLUSH) {
    // A hydrant standing open, with the water running out of it: the act, not the object.
    ctx.fillStyle = RAMP.rock[BASE]; ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(-s * 0.16, -s * 0.34, s * 0.32, s * 0.68);
    ctx.strokeRect(-s * 0.16, -s * 0.34, s * 0.32, s * 0.68);
    ctx.beginPath(); // the cap
    ctx.moveTo(-s * 0.26, -s * 0.34); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.26, -s * 0.34);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = UNDERGROUND.pipeGoodLit; ctx.lineWidth = 2;
    for (const k of [0, 1, 2]) { // the flow, running off to the right
      ctx.beginPath();
      ctx.moveTo(s * 0.18, -s * 0.06 + k * s * 0.16);
      ctx.lineTo(s * 0.52, s * 0.04 + k * s * 0.16);
      ctx.stroke();
    }
  } else if (tool === TOOL.SEAL) {
    // A sealing works: an iron plate bolted over a crack in the rock.
    ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
    ctx.fillStyle = UNDERGROUND.aquiferVoid; // the fissure showing at the edges
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.42); ctx.lineTo(-s * 0.18, -s * 0.1);
    ctx.lineTo(s * 0.05, s * 0.12); ctx.lineTo(s * 0.42, -s * 0.44);
    ctx.stroke();
    ctx.fillStyle = UNDERGROUND.sealCap; // the plate
    ctx.fillRect(-s * 0.42, -s * 0.24, s * 0.84, s * 0.4);
    ctx.strokeRect(-s * 0.42, -s * 0.24, s * 0.84, s * 0.4);
    ctx.fillStyle = UNDERGROUND.sealCapLit; // the bolts
    for (const bx of [-0.3, -0.1, 0.1, 0.3]) {
      ctx.beginPath(); ctx.arc(bx * s, -s * 0.04, Math.max(1, s * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawBuildingGlyph(ctx, s, color, kind) {
  ctx.fillStyle = color;
  ctx.strokeStyle = CHROME.ink;
  ctx.lineWidth = 1.5;
  if (kind === 'house') {
    ctx.beginPath(); // gable roof
    ctx.moveTo(-s * 0.45, -s * 0.05);
    ctx.lineTo(0, -s * 0.5);
    ctx.lineTo(s * 0.45, -s * 0.05);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillRect(-s * 0.35, -s * 0.05, s * 0.7, s * 0.5);
    ctx.strokeRect(-s * 0.35, -s * 0.05, s * 0.7, s * 0.5);
  } else if (kind === 'store') {
    ctx.fillRect(-s * 0.45, -s * 0.4, s * 0.9, s * 0.85);
    ctx.strokeRect(-s * 0.45, -s * 0.4, s * 0.9, s * 0.85);
    ctx.fillStyle = CHROME.ink; // awning bar
    ctx.fillRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.12);
  } else {
    // factory: block plus a smokestack.
    ctx.fillRect(-s * 0.45, -s * 0.2, s * 0.9, s * 0.65);
    ctx.strokeRect(-s * 0.45, -s * 0.2, s * 0.9, s * 0.65);
    ctx.fillRect(s * 0.15, -s * 0.5, s * 0.18, s * 0.35); // stack
    ctx.strokeRect(s * 0.15, -s * 0.5, s * 0.18, s * 0.35);
  }
}

// The toolbar tooltip's layout (M10): a small popup beside the hovered or keyboard-focused button,
// sized to its own text (M8 text-overflow discipline) and clamped inside the viewport -- it flips
// to the button's left if the right edge would clip, and never runs off the top, bottom, or a
// narrow left edge either. Text-bearing (unlike the pictographic toolbar itself), so it honours the
// chrome text scale like every other readout.
export function buildToolbarTooltip(rect, lines, viewportW, viewportH, opts = {}) {
  const px = sc(11);
  // PANEL_PAD (the one shared padding standard, M10 sweep) both sides, plus a minimum content
  // width so a single short word ("Road") never renders as a bare sliver.
  const padX = sc(PANEL_PAD); const padY = sc(10); const lineH = sc(16);
  const widest = Math.max(0, ...lines.map((l) => monoWidth(l, px)));
  const w = Math.max(sc(MIN_POPUP_W), Math.ceil(widest) + padX * 2);
  const h = lines.length * lineH + padY * 2;
  let x = rect.x + rect.w + sc(8);
  if (x + w > viewportW - sc(4)) x = rect.x - w - sc(8); // flip left of the icon if it would clip
  x = Math.max(sc(4), Math.min(x, viewportW - w - sc(4)));
  const minY = opts.minY ?? sc(4);
  const y = Math.max(minY, Math.min(Math.round(rect.y + rect.h / 2 - h / 2), viewportH - h - sc(4)));
  return { x, y, w, h, px, padX, padY, lineH };
}

export function drawToolbarTooltip(ctx, layout, lines) {
  const { x, y, w, h, px, padX, padY, lineH } = layout;
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  drawBevel(ctx, x, y, w, h, false);
  ctx.fillStyle = CHROME.ink;
  ctx.font = `${px}px monospace`;
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, x + padX, y + padY + lineH * i + lineH / 2);
  });
}

// The Ledger (budget) window layout, centred. Pure geometry with interactive row rects.
export function buildBudgetWindow(viewportW, viewportH) {
  const w = sc(340);
  const h = sc(452);
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(34, Math.round((viewportH - h) / 2));
  const titleH = sc(20);
  const pad = sc(PANEL_PAD);
  // Below the income/expense text block (Treasury, a power gauge, and 7 budget lines).
  let cy = y + titleH + sc(182);

  const taxRows = CLASS_LIST.map((cls) => {
    const row = {
      cls,
      y: cy,
      minus: { x: x + w - sc(96), y: cy, w: sc(20), h: sc(18) },
      plus: { x: x + w - sc(30), y: cy, w: sc(20), h: sc(18) },
    };
    cy += sc(24);
    return row;
  });
  cy += sc(26); // room for the Ordinances header
  const ordRows = Object.keys(ORDINANCE_INFO).map((key) => {
    const row = { key, y: cy, box: { x: x + pad, y: cy, w: sc(16), h: sc(16) } };
    cy += sc(22);
    return row;
  });

  return {
    frame: { x, y, w, h },
    titleBar: { x, y, w, h: titleH },
    close: { x: x + w - titleH + sc(3), y: y + sc(3), w: titleH - sc(6), h: titleH - sc(6) },
    pad, titleH, taxRows, ordRows,
    incomeY: y + titleH + sc(8),
  };
}

// Which budget control is under a point: {type:'close'} | {type:'tax', cls, dir} | {type:'ordinance', key}.
export function budgetHit(layout, px, py) {
  if (inRect(layout.close, px, py)) return { type: 'close' };
  for (const r of layout.taxRows) {
    if (inRect(r.minus, px, py)) return { type: 'tax', cls: r.cls, dir: -1 };
    if (inRect(r.plus, px, py)) return { type: 'tax', cls: r.cls, dir: 1 };
  }
  for (const r of layout.ordRows) {
    if (inRect(r.box, px, py)) return { type: 'ordinance', key: r.key };
  }
  return null;
}

export function overBudget(layout, px, py) {
  return inRect(layout.frame, px, py);
}

// The Ledger's interactive controls in tab order (M7 keyboard chrome): tax minus/plus per class,
// then the ordinance checkboxes, then the close box. Each entry carries the same action object the
// click path returns (budgetHit), plus its rect for the focus ring, so keyboard and mouse run the
// exact same code. Pure over the layout.
export function budgetControls(layout) {
  const controls = [];
  for (const r of layout.taxRows) {
    controls.push({ action: { type: 'tax', cls: r.cls, dir: -1 }, rect: r.minus });
    controls.push({ action: { type: 'tax', cls: r.cls, dir: 1 }, rect: r.plus });
  }
  for (const r of layout.ordRows) {
    controls.push({ action: { type: 'ordinance', key: r.key }, rect: r.box });
  }
  controls.push({ action: { type: 'close' }, rect: layout.close });
  return controls;
}

// Draw a focus ring around a control's rect (the keyboard focus indicator).
export function drawFocusRing(ctx, rect) {
  if (!rect) return;
  ctx.strokeStyle = '#f4d67a';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
}

export function drawBudgetWindow(ctx, layout, sim) {
  const { frame, titleBar, close } = layout;
  const b = computeBudget(sim);
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  ctx.fillStyle = CHROME.titleBar;
  ctx.fillRect(titleBar.x + 2, titleBar.y + 2, titleBar.w - 4, titleBar.h - 2);
  ctx.fillStyle = CHROME.titleText;
  ctx.font = fpx(13);
  ctx.textBaseline = 'middle';
  ctx.fillText('The Town Ledger', titleBar.x + sc(PANEL_PAD), titleBar.y + titleBar.h / 2 + 1);
  drawBevel(ctx, close.x, close.y, close.w, close.h, false);
  ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(close.x + 3, close.y + 3); ctx.lineTo(close.x + close.w - 3, close.y + close.h - 3);
  ctx.moveTo(close.x + close.w - 3, close.y + 3); ctx.lineTo(close.x + 3, close.y + close.h - 3);
  ctx.stroke();

  ctx.fillStyle = CHROME.ink;
  ctx.font = fpx(12);
  const lx = frame.x + layout.pad;
  const rx = frame.x + frame.w - layout.pad;
  const money = (n) => `$${n}`;
  const rightText = (t, y) => { const width = ctx.measureText(t).width; ctx.fillText(t, rx - width, y); };
  let y = layout.incomeY + sc(6);
  const line = (label, val) => { ctx.fillText(label, lx, y); rightText(money(val), y); y += sc(16); };
  if (sim.treasury < 0) ctx.fillStyle = '#8a2a22'; // the coffers are in the red
  ctx.fillText(`Treasury: ${money(sim.treasury)}`, lx, y); y += sc(18);
  ctx.fillStyle = CHROME.ink;

  // Power gauge: demand against capacity, a recessed well that reddens when the grid is over-taxed.
  const power = sim.power && sim.power.totals ? sim.power.totals : { demand: 0, capacity: 0 };
  const over = power.demand > power.capacity;
  ctx.fillText('Power', lx, y);
  const gx = lx + sc(54); const gw = frame.w - sc(54) - layout.pad * 2 - sc(62); const gh = sc(10); const gy = y - sc(8);
  drawBevel(ctx, gx, gy, gw, gh, true);
  if (power.capacity > 0) {
    const frac = Math.min(1, power.demand / power.capacity);
    ctx.fillStyle = over ? '#8a2a22' : '#2f6f4a';
    ctx.fillRect(gx + 2, gy + 2, Math.max(0, (gw - 4) * frac), gh - 4);
  }
  ctx.fillStyle = over ? '#8a2a22' : CHROME.ink;
  rightText(`${power.demand}/${power.capacity}`, y);
  ctx.fillStyle = CHROME.ink; y += sc(18);

  line('Taxes', b.lines.tax);
  line('Sea bounty', b.lines.bounty);
  line('Commerce', b.lines.commerce);
  line('Upkeep', -b.lines.maintenance);
  line('Services', -b.lines.services);
  line('Ordinances', -b.lines.ordinanceUpkeep);
  ctx.fillStyle = b.net >= 0 ? '#2e5a2e' : '#8a2a22';
  ctx.fillText('Each month', lx, y); rightText(money(b.net), y);
  ctx.fillStyle = CHROME.ink;
  // Insolvency note (M8): a town in the red has its ordinances forced off; a sustained one has its
  // services cut. This sits in the gap above the tax section.
  if (sim.treasury < 0 || sim.servicesCut) {
    y += sc(16);
    ctx.fillStyle = '#8a2a22';
    ctx.fillText(sim.servicesCut ? 'Insolvent. The watch is unpaid.' : 'The town is insolvent.', lx, y);
    ctx.fillStyle = CHROME.ink;
  }

  // Section headers.
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillText('Tax rates', lx, layout.taxRows[0].y - 8);
  ctx.fillText('Ordinances', lx, layout.ordRows[0].y - 10);
  ctx.fillStyle = CHROME.ink;
  // Tax controls.
  for (const r of layout.taxRows) {
    ctx.fillText(CLASS_LABEL[r.cls], lx, r.y + 9);
    drawBevel(ctx, r.minus.x, r.minus.y, r.minus.w, r.minus.h, false);
    drawBevel(ctx, r.plus.x, r.plus.y, r.plus.w, r.plus.h, false);
    ctx.fillStyle = CHROME.ink;
    ctx.fillText('-', r.minus.x + 7, r.minus.y + 10);
    ctx.fillText('+', r.plus.x + 6, r.plus.y + 10);
    const pct = `${Math.round(sim.taxRates[r.cls] * 100)}%`;
    ctx.fillText(pct, r.minus.x + 28, r.minus.y + 10);
  }
  // Ordinance toggles.
  for (const r of layout.ordRows) {
    drawBevel(ctx, r.box.x, r.box.y, r.box.w, r.box.h, true);
    if (sim.ordinances[r.key]) {
      ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.box.x + 3, r.box.y + 8);
      ctx.lineTo(r.box.x + 7, r.box.y + 12);
      ctx.lineTo(r.box.x + 13, r.box.y + 3);
      ctx.stroke();
    }
    ctx.fillStyle = CHROME.ink;
    const info = ORDINANCE_INFO[r.key];
    ctx.fillText(`${info.label}  ($${info.upkeep}/mo)`, r.box.x + 24, r.box.y + 9);
  }
}

// Draw the top status bar: date, population, funds, a dread meter, the Ledger button and speeds.
export function drawTopBar(ctx, topbar, sim, activeSpeed, muted = false, reducedMotion = false,
  volumeIdx = DEFAULT_VOLUME_IDX, volumeSteps = VOLUME_LEVELS.length) {
  const p = topbar.panel;
  drawBevel(ctx, p.x, p.y, p.w, p.h, false);
  ctx.fillStyle = CHROME.ink;
  ctx.font = fpx(13);
  ctx.textBaseline = 'middle';
  const cy = p.y + p.h / 2 + 1;
  // The left readouts flow left-to-right by measured width, so they hold together at any text scale.
  // The gap shrinks with the font so the whole strip still fits at 1.5x on a 1280-wide viewport.
  let fx = sc(10);
  const flow = (t, gap = 12) => { ctx.fillText(t, fx, cy); fx += ctx.measureText(t).width + sc(gap); };
  const pop = sim.totalPopulation();
  flow(sim.formatDate());
  flow(`Innsmouth ${townTitle(pop)}`); // the town's growth title (Landing..City)
  flow(`Pop ${pop}`);
  flow(`$${sim.treasury}`);

  // Dread meter: a recessed well with a fill that reddens as dread climbs. Its width is capped by
  // the remaining space before the right-hand chrome buttons so the top bar never overlaps at the
  // largest chrome scale on a narrow viewport.
  const mx = fx;
  const rightEdge = topbar.motion ? topbar.motion.x - sc(8) : p.w - sc(8);
  const mw = Math.min(sc(118), Math.max(sc(48), rightEdge - mx - sc(6)));
  const my = p.y + sc(6);
  const mh = p.h - sc(12);
  drawBevel(ctx, mx, my, mw, mh, true);
  const frac = Math.max(0, Math.min(1, sim.dread / 100));
  const gg = Math.round(150 * (1 - frac));
  ctx.fillStyle = `rgb(${120 + Math.round(80 * frac)}, ${70 + gg}, 60)`;
  ctx.fillRect(mx + 2, my + 2, Math.max(0, (mw - 4) * frac), mh - 4);
  // Numeric readout paired with the bar (M7); the label is dropped when the bar is squeezed.
  ctx.fillStyle = CHROME.ink;
  const dnum = `${Math.round(sim.dread)}`;
  const dnumW = ctx.measureText(dnum).width;
  const labelX = mx + sc(6);
  const numX = mx + mw - sc(6) - dnumW;
  const labelW = ctx.measureText('Dread').width;
  if (labelX + labelW + sc(4) <= numX) ctx.fillText('Dread', labelX, cy);
  ctx.fillText(dnum, numX, cy);

  // The window buttons: Ledger, Gods, Wrath, Save.
  const button = (r, text) => {
    if (!r) return;
    drawBevel(ctx, r.x, r.y, r.w, r.h, false);
    ctx.fillStyle = CHROME.ink;
    ctx.fillText(text, r.x + sc(8), r.y + r.h / 2 + 1);
  };
  button(topbar.ledger, 'Ledger');
  button(topbar.gods, 'Gods');
  button(topbar.disasters, 'Wrath');
  button(topbar.save, 'Save');

  // The chrome text-size cycle button: a small A over a larger A.
  if (topbar.textscale) {
    const T = topbar.textscale;
    drawBevel(ctx, T.x, T.y, T.w, T.h, getChromeScale() > 1);
    ctx.fillStyle = CHROME.ink;
    ctx.textBaseline = 'alphabetic';
    ctx.font = fpx(10);
    ctx.fillText('A', T.x + T.w * 0.18, T.y + T.h * 0.5);
    ctx.font = fpx(14);
    ctx.fillText('A', T.x + T.w * 0.42, T.y + T.h * 0.78);
    ctx.textBaseline = 'middle';
    ctx.font = fpx(13);
  }

  // The music mute toggle: a little speaker, crossed out when muted.
  if (topbar.mute) {
    const M = topbar.mute;
    drawBevel(ctx, M.x, M.y, M.w, M.h, muted);
    const cx = M.x + M.w / 2 - 2;
    const cy = M.y + M.h / 2;
    ctx.fillStyle = CHROME.ink;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 2); ctx.lineTo(cx - 1, cy - 2); ctx.lineTo(cx + 2, cy - 5);
    ctx.lineTo(cx + 2, cy + 5); ctx.lineTo(cx - 1, cy + 2); ctx.lineTo(cx - 4, cy + 2);
    ctx.closePath(); ctx.fill();
    if (muted) {
      ctx.strokeStyle = '#8a2a22'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + 9, cy + 4); ctx.stroke();
    } else {
      ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx + 4, cy, 3, -0.7, 0.7); ctx.stroke();
    }
  }

  // The bed-volume step: a small ascending bar graph, filled up to the current level.
  if (topbar.vol) {
    const V = topbar.vol;
    drawBevel(ctx, V.x, V.y, V.w, V.h, false);
    const bars = Math.max(1, volumeSteps);
    const bw = Math.max(2, Math.floor((V.w - sc(6)) / bars) - 1);
    for (let i = 0; i < bars; i++) {
      const barH = sc(4) + i * sc(3);
      const bx = V.x + sc(3) + i * (bw + 1);
      const bly = V.y + V.h - sc(4) - barH;
      ctx.fillStyle = i <= volumeIdx && !muted ? CHROME.ink : CHROME.bevelShadow;
      ctx.fillRect(bx, bly, bw, barH);
    }
  }

  // The ambient-motion toggle: a small gull (a shallow V), crossed out when the living world is
  // stilled (the reduced-motion / low-power path).
  if (topbar.motion) {
    const G = topbar.motion;
    drawBevel(ctx, G.x, G.y, G.w, G.h, reducedMotion);
    const gx = G.x + G.w / 2 - 1;
    const gy = G.y + G.h / 2;
    ctx.strokeStyle = CHROME.ink;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx - 5, gy + 1); ctx.lineTo(gx - 1, gy - 2); ctx.lineTo(gx + 3, gy + 1);
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (reducedMotion) {
      ctx.strokeStyle = '#8a2a22'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(G.x + G.w - 6, G.y + 4); ctx.lineTo(G.x + 5, G.y + G.h - 4); ctx.stroke();
    }
  }

  for (const b of topbar.speeds) {
    const active = b.speed === activeSpeed;
    drawBevel(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, active);
    drawSpeedIcon(ctx, b.speed, b.rect);
  }
}

function drawSpeedIcon(ctx, speed, r) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.fillStyle = CHROME.ink;
  if (speed === SPEED.PAUSED) {
    ctx.fillRect(cx - 4, cy - 5, 3, 10);
    ctx.fillRect(cx + 1, cy - 5, 3, 10);
    return;
  }
  if (speed === SPEED.CREEP) {
    // One hollow arrow: slower even than a single filled arrow (the contemplative step).
    const w = 6;
    const x = cx - w / 2 - 1;
    ctx.strokeStyle = CHROME.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, cy - 5);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(x, cy + 5);
    ctx.closePath();
    ctx.stroke();
    return;
  }
  const arrows = speed === SPEED.SLOW ? 1 : speed === SPEED.MEDIUM ? 2 : 3;
  const w = 5;
  const startX = cx - (arrows * w) / 2 - 1;
  for (let i = 0; i < arrows; i++) {
    const x = startX + i * w;
    ctx.beginPath();
    ctx.moveTo(x, cy - 5);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(x, cy + 5);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawQueryWindow(ctx, layout, desc) {
  const { frame, titleBar, close, body } = layout;
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  // Title bar.
  ctx.fillStyle = CHROME.titleBar;
  ctx.fillRect(titleBar.x + 2, titleBar.y + 2, titleBar.w - 4, titleBar.h - 2);
  ctx.fillStyle = CHROME.titleText;
  ctx.font = fpx(12);
  ctx.textBaseline = 'middle';
  const titleMax = titleBar.w - sc(PANEL_PAD) - close.w - sc(8);
  ctx.fillText(fitMono(desc.title, titleMax, sc(12)), titleBar.x + sc(PANEL_PAD), titleBar.y + titleBar.h / 2 + 1);
  // Close box.
  drawBevel(ctx, close.x, close.y, close.w, close.h, false);
  ctx.strokeStyle = CHROME.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(close.x + 3, close.y + 3);
  ctx.lineTo(close.x + close.w - 3, close.y + close.h - 3);
  ctx.moveTo(close.x + close.w - 3, close.y + 3);
  ctx.lineTo(close.x + 3, close.y + close.h - 3);
  ctx.stroke();
  // Body lines.
  ctx.fillStyle = CHROME.ink;
  ctx.font = fpx(12);
  const bodyMax = body.w - sc(PANEL_PAD) * 2;
  // Prefer the layout's pre-wrapped lines (content-sized path); fall back to the raw lines, fit to
  // width, for older count-only callers.
  const lines = layout.bodyLines || desc.lines;
  lines.forEach((line, i) => {
    ctx.fillText(fitMono(line, bodyMax, sc(12)), body.x + sc(PANEL_PAD), body.y + sc(12) + i * sc(16));
  });
}

// --- the gods layer windows (M6) ---------------------------------------------------------

// The Favor of the Gods window: one block per god (name, wrath, a favor meter, appease hint).
export function buildFavorWindow(viewportW, viewportH) {
  const w = sc(384);
  const rowH = sc(76); // room for the god row, its meter, and a two-line appease/omen hint (M8)
  const titleH = sc(20);
  const pad = sc(PANEL_PAD);
  const h = titleH + pad + GOD_LIST.length * rowH + pad;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(34, Math.round((viewportH - h) / 2));
  const rows = GOD_LIST.map((god, i) => ({
    god,
    y: y + titleH + pad + i * rowH,
    bar: { x: x + pad, y: y + titleH + pad + i * rowH + sc(22), w: w - pad * 2, h: sc(12) },
  }));
  return {
    frame: { x, y, w, h },
    titleBar: { x, y, w, h: titleH },
    close: { x: x + w - titleH + sc(3), y: y + sc(3), w: titleH - sc(6), h: titleH - sc(6) },
    rows, pad, titleH,
  };
}

export function favorHit(layout, px, py) {
  if (inRect(layout.close, px, py)) return { type: 'close' };
  return null;
}

export function overFavor(layout, px, py) {
  return inRect(layout.frame, px, py);
}

// Favor colour: calm teal when high, an angry red as it falls toward wrath.
function favorColor(frac) {
  const f = Math.max(0, Math.min(1, frac));
  const r = Math.round(150 - 100 * f);
  const g = Math.round(60 + 110 * f);
  const b = Math.round(60 + 70 * f);
  return `rgb(${r}, ${g}, ${b})`;
}

export function drawFavorWindow(ctx, layout, sim) {
  const { frame, titleBar, close } = layout;
  drawWindowShell(ctx, frame, titleBar, close, 'Favor of the Gods');
  ctx.textBaseline = 'middle';
  for (const row of layout.rows) {
    const info = GOD_INFO[row.god];
    const favor = sim.favor[row.god];
    const frac = favor / FAVOR_MAX;
    ctx.fillStyle = CHROME.ink;
    ctx.font = fpx(13);
    const label = info.label;
    ctx.fillText(label, frame.x + layout.pad, row.y + sc(8));
    const labelW = ctx.measureText(label).width;
    // The numeric favor readout, right beside the god's name (M7), clear of the wrath label.
    ctx.font = fpx(11);
    const fnum = `${Math.round(favor)}/${FAVOR_MAX}`;
    ctx.fillText(fnum, frame.x + layout.pad + labelW + sc(10), row.y + sc(8));
    ctx.fillStyle = CHROME.deepFrame;
    const wname = `Wrath: ${info.wrath}`;
    ctx.fillText(wname, frame.x + frame.w - layout.pad - ctx.measureText(wname).width, row.y + sc(8));
    // The favor meter.
    const b = row.bar;
    drawBevel(ctx, b.x, b.y, b.w, b.h, true);
    ctx.fillStyle = favorColor(frac);
    ctx.fillRect(b.x + 2, b.y + 2, Math.max(0, (b.w - 4) * frac), b.h - 4);
    // The appeasement hint, or (once a god is angry) the omen the town is living through. These are
    // full sentences; wrap them to the panel width across up to two lines so they never clip (M8).
    const stage = favorStage(favor);
    const angry = stage === FAVOR_STAGE.OMEN || stage === FAVOR_STAGE.DIRE;
    ctx.fillStyle = angry ? '#8a2a22' : CHROME.ink;
    const hint = angry ? (stage === FAVOR_STAGE.DIRE ? info.dire : info.omen) : info.appease;
    ctx.font = fpx(11);
    wrapMono(hint, frame.w - layout.pad * 2, sc(11), 2).forEach((ln, li) =>
      ctx.fillText(ln, frame.x + layout.pad, b.y + b.h + sc(10) + li * sc(13)));
  }
}

// The Summon a Wrath menu: a button per god's wrath (the reference's disasters menu, and the hook
// that lets a test or a curious player loose any wrath on demand).
export function buildDisasterMenu(viewportW, viewportH) {
  const w = sc(300);
  const titleH = sc(20);
  const pad = sc(PANEL_PAD);
  const btnH = sc(30);
  const gap = sc(8);
  const headerH = sc(44); // the caution line (wraps to two lines at wide chrome scales, M8)
  const h = titleH + pad + headerH + GOD_LIST.length * (btnH + gap) + pad;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(34, Math.round((viewportH - h) / 2));
  const rows = GOD_LIST.map((god, i) => ({
    god,
    rect: { x: x + pad, y: y + titleH + pad + headerH + i * (btnH + gap), w: w - pad * 2, h: btnH },
  }));
  return {
    frame: { x, y, w, h },
    titleBar: { x, y, w, h: titleH },
    close: { x: x + w - titleH + sc(3), y: y + sc(3), w: titleH - sc(6), h: titleH - sc(6) },
    rows, pad, titleH, headerH,
  };
}

export function disasterHit(layout, px, py) {
  if (inRect(layout.close, px, py)) return { type: 'close' };
  for (const r of layout.rows) if (inRect(r.rect, px, py)) return { type: 'summon', god: r.god };
  return null;
}

export function overDisaster(layout, px, py) {
  return inRect(layout.frame, px, py);
}

export function drawDisasterMenu(ctx, layout) {
  const { frame, titleBar, close } = layout;
  drawWindowShell(ctx, frame, titleBar, close, 'Summon a Wrath');
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CHROME.deepFrame;
  ctx.font = fpx(11);
  wrapMono('Loose a god upon the town. There is no taking it back.',
    frame.w - layout.pad * 2, sc(11), 2).forEach((ln, li) =>
    ctx.fillText(ln, frame.x + layout.pad, frame.y + layout.titleH + sc(14) + li * sc(13)));
  for (const r of layout.rows) {
    drawBevel(ctx, r.rect.x, r.rect.y, r.rect.w, r.rect.h, false);
    const info = GOD_INFO[r.god];
    ctx.fillStyle = CHROME.ink;
    ctx.font = fpx(13);
    ctx.fillText(info.wrath, r.rect.x + 10, r.rect.y + r.rect.h / 2 + 1);
    ctx.font = fpx(11);
    ctx.fillStyle = CHROME.deepFrame;
    const g = info.label;
    ctx.fillText(g, r.rect.x + r.rect.w - 10 - ctx.measureText(g).width, r.rect.y + r.rect.h / 2 + 1);
  }
}

// --- the help / legend window (M8) -------------------------------------------------------
// A plain reference: how to start, the keys, and what the meters mean. Section heads plus lines,
// each wrapped to the panel so nothing clips (the detector guards it). Player-facing, period register.
const HELP_SECTIONS = [
  { head: 'Getting started', lines: [
    'Lay a road (key 3), then zone lots beside it (keys 7, 8, 9 for homes, shops, works).',
    'Zoned lots on a road grow on their own. A gasworks and power lines let them grow tall.',
    'New to the game? Press Q for the Quickstart, the first five minutes spelled out.',
  ] },
  { head: 'The keys', lines: [
    'Number keys pick tools. Arrows pan the map. Plus and minus zoom. Space pauses.',
    'B the Ledger, G the Gods, K a Wrath, N the Courier, P the Old Priest, H this help, Q the Quickstart.',
    'S saves the town, L loads it. M stills the living world. Escape closes a window.',
  ] },
  { head: 'The clock', lines: [
    'Speeds run from a slow creep to fast, to watch the town live or push the years on.',
    'When a wrath is loose the clock holds back to a watchful pace until it passes.',
  ] },
  { head: 'The meters', lines: [
    'Dread decides who settles here, and it feeds the gods\' hunger. Keep it low.',
    'Favor: appease each god or its wrath falls. Cthulhu is only ever slowed, never stopped.',
  ] },
  // The Help window is a LEGEND and it is at its ceiling: at the largest chrome text scale on a
  // 1280x800 screen it has room for one more short section and no more (the text-overflow gate
  // measures it). So the underground gets its colour key here and its walkthrough in the Quickstart.
  { head: 'Below the street', lines: [
    'Press U to go below. Mains read blue at pressure, grey when low, dark when dry.',
    'Green mottling means the water has gone off.',
  ] },
];

// The Sound section is appended live (it reports the music toggle/volume, or "tracks not found"
// when assets/music/ is absent from a bare single-file open) rather than hardcoded, so the Help
// window always tells the truth about what's actually playing.
export function buildHelpWindow(viewportW, viewportH, extra = {}) {
  const w = Math.min(viewportW - 40, sc(520));
  const titleH = sc(22);
  const pad = sc(PANEL_PAD);
  const textW = w - pad * 2;
  const sections = extra.musicLine
    ? [...HELP_SECTIONS, { head: 'Sound', lines: [extra.musicLine] }]
    : HELP_SECTIONS;
  // Each section reads as one paragraph: join the authored lines and let wrapMono make every
  // break. Wrapping the authored lines individually re-broke lines that were already hand-broken
  // for a wider panel, leaving a short orphan fragment after each one (operator-caught 2026-08-07
  // on the Quickstart, same layout as here).
  const blocks = sections.map((s) => ({
    head: s.head,
    lines: wrapMono(s.lines.join(' '), textW, sc(12), 8),
  }));
  let bodyH = pad;
  for (const b of blocks) bodyH += sc(20) + b.lines.length * sc(16) + sc(8);
  bodyH += pad;
  const h = titleH + bodyH;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(30, Math.round((viewportH - h) / 2));
  return {
    frame: { x, y, w, h },
    titleBar: { x, y, w, h: titleH },
    close: { x: x + w - titleH + sc(3), y: y + sc(3), w: titleH - sc(6), h: titleH - sc(6) },
    blocks, pad, titleH,
  };
}

export function helpHit(layout, px, py) {
  return inRect(layout.close, px, py) ? { type: 'close' } : null;
}
export function overHelp(layout, px, py) { return inRect(layout.frame, px, py); }

export function drawHelpWindow(ctx, layout) {
  const { frame, titleBar, close } = layout;
  drawWindowShell(ctx, frame, titleBar, close, 'Help and Legend');
  ctx.textBaseline = 'alphabetic';
  let y = frame.y + layout.titleH + layout.pad + sc(4);
  const lx = frame.x + layout.pad;
  for (const b of layout.blocks) {
    ctx.fillStyle = CHROME.titleBar;
    ctx.font = fpx(13);
    ctx.fillText(b.head, lx, y + sc(12));
    y += sc(20);
    ctx.fillStyle = CHROME.ink;
    ctx.font = fpx(12);
    for (const ln of b.lines) { ctx.fillText(ln, lx, y + sc(12)); y += sc(16); }
    y += sc(8);
  }
  ctx.textBaseline = 'middle';
}

// --- the quickstart window (M9.7) ---------------------------------------------------------
// The first five minutes, spelled out. Help and Legend (above) is a keys-and-meters REFERENCE;
// this is the walkthrough for someone who has never placed a tile in this game before -- the
// mechanical bits a half-remembered 1994 city-builder doesn't cover, since I2's placement, toolbar,
// and dread system are all their own shape. Same window-shell/PANEL_PAD chrome, same {head,
// lines} block layout as HELP_SECTIONS, so it reads as a sibling of Help, not a bolt-on.
const QUICKSTART_SECTIONS = [
  { head: 'Placing things', lines: [
    'Pick a tool: click its icon on the left, or press its number. Click a tile to place it,',
    'or hold the button and drag to paint a run of road or zone.',
  ] },
  { head: 'Your first road', lines: [
    'Road (3) costs $10 a tile and needs clear, dry land. Zone beside it: Residential (7),',
    'Commercial (8), or Industrial (9), $20 a lot. A zoned lot on a road grows on its own.',
  ] },
  { head: 'Power', lines: [
    'Growth caps low without it. A Gasworks (5, $800) or a Whale-Oil Works (6, $1300),',
    'run out along Power Lines (4, $5 a tile), lets lots climb their full height.',
  ] },
  { head: 'The dread meter', lines: [
    'Dread decides WHO moves in, not whether a lot grows. Chapels, the Constabulary, and',
    'the Asylum ease it; a Shrine raises it. High dread turns homes Cultist, then Deep One',
    'along the water. Press H any time for the full key list and what the meters mean.',
  ] },
  { head: 'Water, and what gets into it', lines: [
    'Press U and lay Water Mains. A works in brackish or fissured ground takes taint on at its',
    'intake and passes it down the pipes. A Filter House cleanses it, a Valve shuts a branch,',
    'Flush Mains carries it off, a Sealing Works caps a fissure. Better: well the hill, not the shore.',
  ] },
];

// The Quickstart content now shares the same full panel width as Help; the stale advance ratio
// that used to require a local safety margin has been recalibrated across all chrome text.

export function buildQuickstartWindow(viewportW, viewportH) {
  const w = Math.min(viewportW - 40, sc(520));
  const titleH = sc(22);
  const pad = sc(PANEL_PAD);
  const textW = w - pad * 2;
  const blocks = QUICKSTART_SECTIONS.map((s) => ({
    head: s.head,
    lines: wrapMono(s.lines.join(' '), textW, sc(12), 8),
  }));
  let bodyH = pad;
  for (const b of blocks) bodyH += sc(20) + b.lines.length * sc(16) + sc(8);
  bodyH += pad;
  const h = titleH + bodyH;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(30, Math.round((viewportH - h) / 2));
  return {
    frame: { x, y, w, h },
    titleBar: { x, y, w, h: titleH },
    close: { x: x + w - titleH + sc(3), y: y + sc(3), w: titleH - sc(6), h: titleH - sc(6) },
    blocks, pad, titleH,
  };
}

export function quickstartHit(layout, px, py) {
  return inRect(layout.close, px, py) ? { type: 'close' } : null;
}
export function overQuickstart(layout, px, py) { return inRect(layout.frame, px, py); }

export function drawQuickstartWindow(ctx, layout) {
  const { frame, titleBar, close } = layout;
  drawWindowShell(ctx, frame, titleBar, close, 'Quickstart: Your First Five Minutes');
  ctx.textBaseline = 'alphabetic';
  let y = frame.y + layout.titleH + layout.pad + sc(4);
  const lx = frame.x + layout.pad;
  for (const b of layout.blocks) {
    ctx.fillStyle = CHROME.titleBar;
    ctx.font = fpx(13);
    ctx.fillText(b.head, lx, y + sc(12));
    y += sc(20);
    ctx.fillStyle = CHROME.ink;
    ctx.font = fpx(12);
    for (const ln of b.lines) { ctx.fillText(ln, lx, y + sc(12)); y += sc(16); }
    y += sc(8);
  }
  ctx.textBaseline = 'middle';
}

// --- the start menu (M8: difficulty / scenario starts) -----------------------------------
// A centred plate over the opening shore: pick a start (the standard town, an easy cove, a hard
// blighted shore, or a disaster-recovery). Each scenario is a button row with its label and blurb.
// Sized so the longest blurb never clips (wrapped); the text-overflow detector guards it.
export function buildStartMenu(viewportW, viewportH) {
  const w = Math.min(viewportW - 40, sc(520));
  const titleH = sc(24);
  const pad = sc(PANEL_PAD);
  const rowH = sc(58);
  const quickstartH = sc(28); // the "New to Innsmouth? Read the Quickstart." link row
  const rows = SCENARIO_LIST.map((key, i) => ({ key, rect: null, i }));
  const h = titleH + pad + rows.length * (rowH + sc(8)) + quickstartH + pad;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(30, Math.round((viewportH - h) / 2));
  rows.forEach((r, i) => {
    r.rect = { x: x + pad, y: y + titleH + pad + i * (rowH + sc(8)), w: w - pad * 2, h: rowH };
  });
  const quickstart = {
    rect: { x: x + pad, y: y + titleH + pad + rows.length * (rowH + sc(8)), w: w - pad * 2, h: quickstartH },
  };
  return { frame: { x, y, w, h }, titleBar: { x, y, w, h: titleH }, rows, quickstart, pad, titleH, rowH };
}

export function startMenuHit(layout, px, py) {
  for (const r of layout.rows) if (inRect(r.rect, px, py)) return { type: 'pick', key: r.key };
  if (layout.quickstart && inRect(layout.quickstart.rect, px, py)) return { type: 'quickstart' };
  return null;
}

export function drawStartMenu(ctx, layout) {
  const { frame, titleBar } = layout;
  drawDitherScrim(ctx, ctx.canvas ? ctx.canvas.width : frame.x * 2 + frame.w, ctx.canvas ? ctx.canvas.height : frame.y * 2 + frame.h, CHROME.deepFrame, 0.45);
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  ctx.fillStyle = CHROME.titleBar;
  ctx.fillRect(titleBar.x + 2, titleBar.y + 2, titleBar.w - 4, titleBar.h - 2);
  ctx.fillStyle = CHROME.titleText;
  ctx.font = fpx(14);
  ctx.textBaseline = 'middle';
  ctx.fillText('Choose Your Innsmouth', titleBar.x + sc(PANEL_PAD), titleBar.y + titleBar.h / 2 + 1);
  for (const r of layout.rows) {
    const info = SCENARIOS[r.key];
    drawBevel(ctx, r.rect.x, r.rect.y, r.rect.w, r.rect.h, false);
    ctx.fillStyle = CHROME.ink;
    ctx.font = fpx(14);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitMono(info.label, r.rect.w - sc(PANEL_PAD) * 2, sc(14)), r.rect.x + sc(PANEL_PAD), r.rect.y + sc(20));
    ctx.fillStyle = CHROME.deepFrame;
    ctx.font = fpx(11);
    wrapMono(info.blurb, r.rect.w - sc(PANEL_PAD) * 2, sc(11), 2).forEach((ln, li) =>
      ctx.fillText(ln, r.rect.x + sc(PANEL_PAD), r.rect.y + sc(36) + li * sc(13)));
  }

  // "New to Innsmouth? Read the Quickstart." -- a plain link row under the scenarios, so the
  // walkthrough is found before a first-time player ever has to guess at the keyboard.
  if (layout.quickstart) {
    const q = layout.quickstart.rect;
    ctx.fillStyle = CHROME.titleBar;
    ctx.font = fpx(12);
    ctx.textBaseline = 'middle';
    ctx.fillText('New to Innsmouth? Read the Quickstart (or press Q any time).', q.x, q.y + q.h / 2 + 1);
  }
  ctx.textBaseline = 'middle';
}

// --- title screen (operator-directed M9 title package) --------------------------------------
// A confident full-screen title moment: a real generated town is rendered behind the plate as a
// backdrop, the INNSMOUTH 2000 wordmark sits large over it, and the menu offers New Game,
// Continue (when a save exists), and Quickstart. Everything uses the existing chrome palette
// and bevel register; no external art, no copied assets.
export function buildTitleScreen(viewportW, viewportH, { canContinue = false } = {}) {
  const w = Math.min(viewportW - sc(40), sc(520));
  const pad = sc(PANEL_PAD);
  const wordmarkH = sc(78);
  const taglineH = sc(18);
  const buttonH = sc(34);
  const gap = sc(10);
  const footerH = sc(30);
  const h = pad + wordmarkH + taglineH + pad + buttonH * 3 + gap * 2 + footerH + pad;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(sc(20), Math.round((viewportH - h) / 2));
  const wordmark = { x: x + pad, y: y + pad, w: w - pad * 2, h: wordmarkH };
  const tagline = { x: x + pad, y: wordmark.y + wordmark.h, w: w - pad * 2, h: taglineH };
  const newGame = { x: x + pad, y: tagline.y + taglineH + pad, w: w - pad * 2, h: buttonH };
  const continueGame = { x: x + pad, y: newGame.y + buttonH + gap, w: w - pad * 2, h: buttonH };
  const quickstart = { x: x + pad, y: continueGame.y + buttonH + gap, w: w - pad * 2, h: buttonH };
  const footer = { x: x + pad, y: quickstart.y + buttonH + gap, w: w - pad * 2, h: footerH };
  return {
    frame: { x, y, w, h },
    newGame,
    continueGame,
    quickstart,
    wordmark,
    tagline,
    footer,
    canContinue,
  };
}

export function titleScreenHit(layout, px, py) {
  if (inRect(layout.newGame, px, py)) return { type: 'new' };
  if (layout.canContinue && inRect(layout.continueGame, px, py)) return { type: 'continue' };
  if (inRect(layout.quickstart, px, py)) return { type: 'quickstart' };
  return null;
}

// Pixel-font wordmark for the title plate. Drawn entirely with canvas rectangles: chunky
// block lettering with a sea-green/verdigris face, a deep extrusion for depth, and a slow
// horizontal phosphor sheen. Stilled when reduced motion is requested.
const WORDMARK_GLYPHS = {
  I: ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};
// Wordmark drawn from the fixed STUDY palette (the shallow-sea brine ramp), not one-off sea-greens.
const WORDMARK_FACE = RAMP.shallow[LIGHT];
const WORDMARK_HI = RAMP.shallow[HIGHLIGHT];
const WORDMARK_SHADOW = RAMP.shallow[BASE];
const WORDMARK_EXTRUDE = RAMP.deep[SHADOW];

function wordmarkLineUnits(text, gap) {
  let u = 0;
  for (let i = 0; i < text.length; i++) {
    const g = WORDMARK_GLYPHS[text[i]];
    u += g ? g[0].length : (text[i] === ' ' ? 2 : 0);
    if (i < text.length - 1) u += gap;
  }
  return u;
}

export function drawWordmark(ctx, rect, opts = {}) {
  const { now = 0, reducedMotion = false } = opts;
  const top = 'INNSMOUTH';
  const bot = '2000';
  const GW = 5;
  const GH = 7;
  const GAP = 1;
  const topU = wordmarkLineUnits(top, GAP);
  const botU = wordmarkLineUnits(bot, GAP);

  // The main title owns the upper two-thirds; the year sits smaller beneath it.
  const topShare = 0.66;
  const botShare = 0.30;
  const topH = rect.h * topShare;
  const botH = rect.h * botShare;

  let uTop = Math.min((rect.w - 4) / topU, topH / GH);
  let uBot = Math.min((rect.w - 4) / botU, botH / GH, uTop * 0.55);
  uTop = Math.max(1, Math.floor(uTop));
  uBot = Math.max(1, Math.floor(uBot));

  const drawLine = (text, u, yBase, topUnit) => {
    const units = wordmarkLineUnits(text, GAP);
    const lineW = units * u;
    const x0 = rect.x + Math.round((rect.w - lineW) / 2);
    const e = Math.max(1, Math.min(3, Math.round(u * 0.22)));
    const bev = Math.max(1, Math.min(3, Math.round(u * 0.14)));
    const phase = reducedMotion ? -1 : ((now % 7000) / 7000);
    const bandX = phase < 0 ? -9999 : rect.x + rect.w * phase;
    const bandW = u * 3;

    // Extrusion first, so it sits behind the faces.
    ctx.fillStyle = WORDMARK_EXTRUDE;
    let gx = x0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const g = WORDMARK_GLYPHS[ch];
      if (!g) { gx += (ch === ' ' ? 2 : 0) * u; continue; }
      for (let r = 0; r < GH; r++) {
        for (let c = 0; c < g[r].length; c++) {
          if (g[r][c] !== '#') continue;
          const x = gx + c * u + e;
          const y = yBase + r * u + e;
          ctx.fillRect(x, y, u, u);
        }
      }
      gx += (g[0].length + GAP) * u;
    }

    // Faces, with per-block bevel and a slow sheen.
    gx = x0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const g = WORDMARK_GLYPHS[ch];
      if (!g) { gx += (ch === ' ' ? 2 : 0) * u; continue; }
      for (let r = 0; r < GH; r++) {
        for (let c = 0; c < g[r].length; c++) {
          if (g[r][c] !== '#') continue;
          const x = gx + c * u;
          const y = yBase + r * u;
          const cx = x + u / 2;
          const shimmer = Math.abs(cx - bandX) < bandW / 2;
          ctx.fillStyle = shimmer ? WORDMARK_HI : WORDMARK_FACE;
          ctx.fillRect(x, y, u, u);
          if (u >= 3) {
            ctx.fillStyle = WORDMARK_HI;
            ctx.fillRect(x, y, u, bev);
            ctx.fillRect(x, y, bev, u);
            ctx.fillStyle = WORDMARK_SHADOW;
            ctx.fillRect(x + u - bev, y, bev, u);
            ctx.fillRect(x, y + u - bev, u, bev);
          }
        }
      }
      gx += (g[0].length + GAP) * u;
    }
  };

  const topW = topU * uTop;
  const topX = rect.x + Math.round((rect.w - topW) / 2);
  const topY = rect.y + Math.round((topH - GH * uTop) / 2);
  drawLine(top, uTop, topY, true);

  const botW = botU * uBot;
  const botX = rect.x + Math.round((rect.w - botW) / 2);
  const botY = rect.y + Math.round(topH + (rect.h - topH - botH) / 2 + (botH - GH * uBot) / 2);
  drawLine(bot, uBot, botY, false);
}

export function drawTitleScreen(ctx, layout, opts = {}) {
  const { frame, wordmark, tagline } = layout;
  // Dithered scrim across the whole canvas so the plate reads over the rendered town backdrop.
  // Eased from 0.55 to 0.3 with the blue-hour pass: the scrim was calibrated against a bright
  // daylit backdrop, and over the darkened town it buried the very thing it is standing on. The
  // plate is an opaque bevel and never needed the scrim to be legible.
  drawDitherScrim(ctx, ctx.canvas ? ctx.canvas.width : frame.x * 2 + frame.w, ctx.canvas ? ctx.canvas.height : frame.y * 2 + frame.h, CHROME.deepFrame, 0.3);
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);

  // Wordmark: code-drawn block lettering with sea-green depth and shimmer.
  drawWordmark(ctx, wordmark, opts);

  // Tagline.
  ctx.fillStyle = CHROME.ink;
  ctx.font = fpx(12);
  ctx.textBaseline = 'middle';
  ctx.fillText('A rotting Massachusetts coast town, 1926.', tagline.x, tagline.y + tagline.h / 2 + 1);

  const button = (rect, label, enabled = true) => {
    drawBevel(ctx, rect.x, rect.y, rect.w, rect.h, !enabled);
    ctx.fillStyle = enabled ? CHROME.ink : CHROME.bevelShadow;
    ctx.font = fpx(14);
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + sc(PANEL_PAD), rect.y + rect.h / 2 + 1);
  };
  button(layout.newGame, 'New Game');
  button(layout.continueGame, layout.canContinue ? 'Continue' : 'Continue (no saved town)', layout.canContinue);
  button(layout.quickstart, 'Quickstart');

  // Version / credit footer.
  ctx.fillStyle = CHROME.bevelShadow;
  ctx.font = fpx(11);
  ctx.textBaseline = 'middle';
  ctx.fillText('Version 0.1.0. By Innsmouth Works.', layout.footer.x, layout.footer.y + layout.footer.h / 2 + 1);
}

// A window frame + title bar + close box, shared by the M6 windows.
function drawWindowShell(ctx, frame, titleBar, close, title) {
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  ctx.fillStyle = CHROME.titleBar;
  ctx.fillRect(titleBar.x + 2, titleBar.y + 2, titleBar.w - 4, titleBar.h - 2);
  ctx.fillStyle = CHROME.titleText;
  ctx.font = fpx(13);
  ctx.textBaseline = 'middle';
  ctx.fillText(title, titleBar.x + sc(PANEL_PAD), titleBar.y + titleBar.h / 2 + 1);
  drawBevel(ctx, close.x, close.y, close.w, close.h, false);
  ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(close.x + 3, close.y + 3); ctx.lineTo(close.x + close.w - 3, close.y + close.h - 3);
  ctx.moveTo(close.x + close.w - 3, close.y + 3); ctx.lineTo(close.x + 3, close.y + close.h - 3);
  ctx.stroke();
}

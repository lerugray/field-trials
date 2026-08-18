// layout.js — screen geometry and the interactive regions, shared by the renderer (which draws
// them) and input (which hit-tests them). Presentation only, no DOM, no clock. Pointer-primary:
// every interactive region is a rectangle the mouse can hit; the keyboard mirrors the same ids.
import { CONFIG, ROOM } from './model.js';

export const SCREEN = { w: 640, h: 360 };

// The three panels of the desk fill the buffer edge to edge (Gate 6: screen-fill >= 95%, no empty
// letterbox inside the native frame): the cutaway (left), the ledger (right), the action bar
// (bottom). Their union covers ~96% of the buffer; the remainder is desk showing between them.
//
// M7a r2: the gutter between the drawing and the sheet widened from 4px to 6px and both panels
// came a pixel further off the buffer edge. Ray's verdict on r1 was "a little crowded"; two
// objects on a desk should look like two objects on a desk, not one surface divided by a line.
export const CUTAWAY = { x: 3, y: 3, w: 348, h: 302 };
export const LEDGER = { x: 357, y: 3, w: 280, h: 302 };
export const ACTIONBAR = { x: 3, y: 309, w: 634, h: 48 };

function btn(id, x, y, w, h, label, key, enabled = true) {
  return { id, x, y, w, h, label, key, enabled };
}

// The interactive buttons for the current view state. The ids are the contract input dispatches on.
export function computeButtons(view) {
  const f = view.facility;
  switch (view.overlay) {
    // M8's ship shell. The title is where a player arrives, so it carries everything they might
    // want before committing to a tenure: the way in, the sound, and who made what.
    // The shell's controls sit ON the document, inside its lower margin. They used to be placed by
    // eye and the last of them hung off the bottom edge of the paper onto the desk, while the body
    // copy ran underneath the first: an overlay sheet is 280px tall and a stack of four controls
    // has to be laid out against that, not against the screen.
    case 'title': {
      const list = [
        btn('enter', SCREEN.w / 2 - 100, 206, 200, 24, view.resumable ? 'Resume the tenure' : 'Take up the post', 'Enter'),
        btn('options', SCREEN.w / 2 - 100, 236, 200, 22, 'Options', 'O'),
        btn('provenance', SCREEN.w / 2 - 100, 262, 200, 22, 'Provenance', 'P'),
      ];
      if (view.resumable) list.push(btn('newtenure', SCREEN.w / 2 - 100, 288, 200, 22, 'Abandon and begin again', 'N'));
      return list;
    }
    case 'options': {
      const list = [
        btn('mute', 220, 170, 200, 24, view.muted ? 'Sound: muted' : 'Sound: on', 'M'),
        btn('exportlog', 220, 202, 200, 24, 'Export debug log', 'L'),
        btn('totitle', 220, 234, 200, 24, 'Back', 'X'),
      ];
      if (view.hasShell) list.push(btn('quit', 220, 266, 200, 24, 'Quit to shell', 'Q'));
      return list;
    }
    case 'provenance':
      return [btn('totitle', SCREEN.w / 2 - 100, 282, 200, 24, 'Back', 'X')];
    case 'orientation':
      // The overlay sheet bottom is at y≈314; a 24px button at 280 ends exactly at the 10px margin.
      return [btn('begin', SCREEN.w / 2 - 90, 280, 180, 24, 'Enter the premises', 'Enter')];
    case 'checklist': {
      const w = 200;
      return [
        btn('confirm', SCREEN.w / 2 - w - 8, 276, w, 24, 'Sign the cycle over', 'Enter'),
        btn('back', SCREEN.w / 2 + 8, 276, w, 24, 'Return to administration', 'X'),
      ];
    }
    case 'pause': {
      const list = [
        ...(f.status === 'active'
          ? [btn('resume', 220, 150, 200, 24, 'Resume', 'Esc')]
          : [btn('closedreport', 220, 150, 200, 24, 'Closing report', 'C')]),
        btn('mute', 220, 182, 200, 24, view.muted ? 'Sound: muted' : 'Sound: on', 'M'),
        btn('exportlog', 220, 214, 200, 24, 'Export debug log', 'L'),
      ];
      list.push(btn('provenance', 220, 246, 200, 24, 'Provenance', 'P'));
      // Quit-to-shell slot is shown only when a shell hosts the game (contract item 4).
      if (view.hasShell) list.push(btn('quit', 220, 278, 200, 24, 'Quit to shell', 'Q'));
      // Standalone: allow returning to the title while a tenure is still in progress.
      else if (f.status === 'active') list.push(btn('totitle', 220, 278, 200, 24, 'Back', 'X'));
      return list;
    }
    case 'raid': {
      const label = view.replay && view.replay.done ? 'Continue' : 'Skip the incident replay';
      // Clear of the drawing's title block, which occupies the last 25px of the panel: a control
      // sitting on top of the legend hides the legend, and the legend is what makes the drawing
      // readable (the LEGIBILITY LAW).
      return [btn('skip-replay', CUTAWAY.x + CUTAWAY.w / 2 - 110, CUTAWAY.y + CUTAWAY.h - 58, 220, 22, label, 'Enter')];
    }
    case 'error':
      return [
        btn('exportlog', 220, 214, 200, 24, 'Export debug log', 'L'),
        btn('dismiss', 220, 246, 200, 24, 'Dismiss', 'X'),
      ];
    case 'closed':
      return [
        btn('dismiss', SCREEN.w / 2 - 100, 270, 200, 24, 'Return', 'X'),
        btn('newtenure', SCREEN.w / 2 - 100, 300, 200, 26, 'Begin a new tenure', 'Enter'),
      ];
    default: {
      // ADMIN: the operator's levers, laid out as an even row. The tool sets what a grid click does;
      // Answer appears only when an instrument stands (the ladder interaction).
      const active = f.status === 'active';
      const notice = f.notices.find((n) => n.status === 'served');
      // The tool button carries the longest label in the bar ("Tool: Fabrication") and it is the
      // one control whose label must not be abbreviated, because it is the only thing telling the
      // player what a click on the drawing will DO. So it gets a wider slot rather than a shorter
      // name: the others are short and can share what is left.
      const specs = [
        { id: 'tool', label: `Tool: ${view.toolLabel || 'Excavate'}`, key: 'T', weight: 1.5 },
        { id: 'fortify', label: 'Fortify 50g', key: 'F', weight: 1 },
        { id: 'repair', label: 'Repair 40g', key: 'R', weight: 1 },
      ];
      // KEEP #6's production order appears only while a Fabrication department stands. A control
      // that is present but always refuses teaches a player nothing; one that appears when the
      // workshop does teaches them what the workshop is for.
      const hasShop = (f.rooms || []).some((r) => r.type === ROOM.FABRICATION);
      if (hasShop) specs.push({ id: 'fabricate', label: `Fabricate ${CONFIG.orders.fabricate.cost}g`, key: 'B', weight: 1 });
      if (notice) specs.push({ id: 'answer', label: `Answer ${CONFIG.ladder.answerCost[notice.rung]}g`, key: 'A', weight: 1 });
      specs.push({ id: 'sign', label: 'Sign over', key: 'Enter', weight: 1.15 });
      const gap = 6;
      const usable = ACTIONBAR.w - gap * (specs.length + 1);
      const totalWeight = specs.reduce((a, s) => a + s.weight, 0);
      let x = ACTIONBAR.x + gap;
      return specs.map((s) => {
        const w = Math.floor((usable * s.weight) / totalWeight);
        const b = btn(s.id, x, ACTIONBAR.y + 3, w, 24, s.label, s.key, active);
        x += w + gap;
        return b;
      });
    }
  }
}

// The drawing area inside the cutaway panel, between the header strip and the title block. The
// renderer composes the section into exactly this rectangle, so the camera has to size itself to
// it and not to the whole panel.
// r3: the title block grew from 27px to 38px. It carries two 11px lines of legend, and at 27px they
// were set solid with no leading, which was half the reason Ray could not read them.
export const SECTION_INSET = { top: 17, bottom: 38 };

// sectionFocus(f) -> the rectangle of grid cells the drawing should frame, in cell coordinates.
//
// M7a r1 drew the whole 24x16 grid at a fixed 14px cell, which meant a small facility sat as a
// bright cluster in a large field of dark rock. That reads as crowded AND small at once, which was
// exactly Ray's verdict. A section drawing is framed on its subject: this returns the bounding box
// of everything the facility has actually surveyed, plus the loss object, plus a margin of rock so
// the building is still visibly cut INTO something.
const FOCUS_MARGIN = 3;
export function sectionFocus(f, view = null) {
  if (!f || !f.grid) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < f.dims.rows; y++) {
    for (let x = 0; x < f.dims.cols; x++) {
      if (!f.grid[y][x].surveyed) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  const lo = f.lossObject && f.lossObject.cell;
  if (lo) {
    x0 = Math.min(x0, lo.x);
    y0 = Math.min(y0, lo.y);
    x1 = Math.max(x1, lo.x);
    y1 = Math.max(y1, lo.y);
  }
  // During the watchable replay the frame also has to hold the INCIDENT. A raiding party approaches
  // across unsurveyed rock, which is outside the facility's own bounding box, so without this the
  // party walks in from off the edge of the drawing and the first captures of r2 showed a raider
  // sliced in half by the panel. A replay is a thing the player is meant to watch; the camera pulls
  // back once when it starts and returns when it ends.
  if (view && view.overlay === 'raid' && view.replay && view.replay.steps) {
    for (const s of view.replay.steps) {
      if (!s || !s.pos) continue;
      x0 = Math.min(x0, s.pos.x);
      y0 = Math.min(y0, s.pos.y);
      x1 = Math.max(x1, s.pos.x);
      y1 = Math.max(y1, s.pos.y);
    }
  }

  if (!Number.isFinite(x0)) return null;
  return {
    x0: Math.max(0, x0 - FOCUS_MARGIN),
    y0: Math.max(0, y0 - FOCUS_MARGIN),
    x1: Math.min(f.dims.cols - 1, x1 + FOCUS_MARGIN),
    y1: Math.min(f.dims.rows - 1, y1 + FOCUS_MARGIN),
  };
}

// The camera never zooms past this, however small the facility is: beyond it the figures start to
// look like portraits rather than people standing in a building, and the 16x20 cast art has no
// more resolution to give.
const MAX_CELL = 26;
const MIN_CELL = 14;

// The geometry of the cutaway grid: cell size and the top-left origin (including the presentation
// pan). Shared by the renderer (which draws cells) and input (which maps a click back to a cell),
// so the two never disagree about where a cell is. Pass the focus box from sectionFocus(f) to get
// the framed camera; pass nothing and it falls back to framing the whole grid.
export function cutawayGeometry(dims, pan = { x: 0, y: 0 }, focus = null) {
  const availW = CUTAWAY.w - 10;
  const availH = CUTAWAY.h - SECTION_INSET.top - SECTION_INSET.bottom - 6;
  const box = focus || { x0: 0, y0: 0, x1: dims.cols - 1, y1: dims.rows - 1 };
  const boxW = box.x1 - box.x0 + 1;
  const boxH = box.y1 - box.y0 + 1;
  const fit = Math.min(Math.floor(availW / boxW), Math.floor(availH / boxH));
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, fit));
  // Centre the focus box in the drawing area, then express the origin in whole-grid coordinates so
  // every other cell falls out of the same arithmetic.
  const ox = CUTAWAY.x + 5 + Math.floor((availW - cell * boxW) / 2) - box.x0 * cell + pan.x;
  const oy = CUTAWAY.y + SECTION_INSET.top + 3 + Math.floor((availH - cell * boxH) / 2) - box.y0 * cell + pan.y;
  return { cell, ox, oy, cols: dims.cols, rows: dims.rows };
}

// Map a buffer coordinate to a grid cell, or null if it falls outside the grid or the panel.
export function cellAtPoint(geo, bx, by) {
  if (bx < CUTAWAY.x + 1 || bx > CUTAWAY.x + CUTAWAY.w - 1) return null;
  if (by < CUTAWAY.y + 16 || by > CUTAWAY.y + CUTAWAY.h - 1) return null;
  const gx = Math.floor((bx - geo.ox) / geo.cell);
  const gy = Math.floor((by - geo.oy) / geo.cell);
  if (gx < 0 || gy < 0 || gx >= geo.cols || gy >= geo.rows) return null;
  return { x: gx, y: gy };
}

export function hitTest(buttons, x, y) {
  for (const b of buttons) {
    if (!b.enabled) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  }
  return null;
}

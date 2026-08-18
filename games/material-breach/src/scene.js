// scene.js — THE ARCHITECTURAL CUTAWAY, composed as a single lit picture (DESIGN-SEED §4.4, §4.5).
//
// This is the VACUUM SEALED technique stack applied to the facility section:
//
//   1. NATIVE-RESOLUTION SOFTWARE RENDERING. The section is composed pixel by pixel into a buffer
//      the size of the cutaway panel in the 640x360 native frame, then handed to the canvas whole.
//      Nothing here draws at display resolution; the integer upscale happens once, at the edge.
//   2. LIGHTING AS COMPOSITING. There is no translucent gradient anywhere in this file. A pixel's
//      light level chooses WHICH STEP of its material's ramp it selects. A lamp is brighter stone,
//      not a white shape laid over stone.
//   3. DITHER AND FBM. The 8x8 Bayer threshold decides between adjacent steps, and seeded fractal
//      noise perturbs the index, so rock reads as rock and plaster reads as plaster.
//   4. ONE PALETTE IN NAMED RAMPS. Every byte written here comes from palette.js.
//   5. THE SCENE IS STAGED, NOT SCATTERED. The section is lit first (rooms are lamps, the
//      Cornerstone is a lamp), then the structure is cut into it, then the cast is placed standing
//      on the floor slabs. It is a drawing of a building with people in it, not a grid of tiles.
//
// It also inherits the instruments-never-lie law (§4.2), because the cutaway IS an instrument: it
// draws only what has been surveyed (fold 1), the room outline weight really does read room size
// (fold 7), and no pixel here invents a fact the ledger would contradict.
//
// PACING AND DETERMINISM: no clock, no timer, no Math.random. The grain comes from a seeded
// lattice keyed on the facility's own seed, so the same facility always has the same stone.
// Composition is a pure function of (facility, geometry, cast placement); the caller caches it.

import { RAMPS, RAMP_BYTES, DEPT_RAMP, CAST_RAMP } from './palette.js';
import { createNoise, dither, lightAt } from './noise.js';
import { CAST_DATA } from './cast-data.js';
import { CONFIG } from './model.js';
import { DEPT_ARCHETYPE } from './staff.js';

// How far light can push a pixel up its ramp. Three steps is enough for a lamp to read as a lamp
// and little enough that a material never turns into a different material.
const LIGHT_RANGE = 3.2;
const AMBIENT = 0.1;

// Grain strength, in ramp steps, and the feature size of the fbm in pixels.
const GRAIN = 1.15;
const GRAIN_SCALE = 6.5;

// A figure is never allowed to fall below this light level, whatever the room is doing. An
// unlit person in a dark room is realistic and unreadable, and unreadable is a defect.
const FIGURE_LIGHT_FLOOR = 0.34;

// One noise lattice per seed, memoised: a facility's stone must not change between frames.
const noiseCache = new Map();
function grainFor(seed) {
  let n = noiseCache.get(seed);
  if (!n) {
    n = createNoise(`material-breach:section:${seed}`);
    noiseCache.set(seed, n);
  }
  return n;
}

// ---- materials ---------------------------------------------------------------------------------

// What a cell is made of, as a ramp plus the step its unlit back surface sits at. In a section
// drawing you are looking at the far wall of an opened room, so an excavated cell is not empty: it
// is the department's own surface, seen from inside.
function materialAt(f, x, y) {
  if (x < 0 || y < 0 || x >= f.dims.cols || y >= f.dims.rows) return { ramp: 'rock', base: 0, solid: true };
  const c = f.grid[y][x];
  // Fold 1: unsurveyed rock is uniform. The instrument reports nothing about rock it has not seen,
  // so a gold seam inside unsurveyed rock draws as rock, not as gold.
  if (!c.surveyed) return { ramp: 'rock', base: 1, solid: true };
  if (c.roomType) return { ramp: DEPT_RAMP[c.roomType] || 'stone', base: 1, solid: false };
  if (c.kind === 'gold') return { ramp: 'brass', base: c.claimed ? 2 : 1, solid: !c.excavated };
  if (c.claimed) return { ramp: 'plaster', base: 1, solid: false };
  if (c.excavated) return { ramp: 'stone', base: 1, solid: false };
  return { ramp: 'rock', base: 1, solid: true };
}

function isSolid(f, x, y) {
  return materialAt(f, x, y).solid;
}

// ---- the lamps ----------------------------------------------------------------------------------

// The facility lights itself from the things it values: every department is a lamp whose intensity
// is its quality (so fold 7's "quality reads as ramp-step density" is literally true), the
// Cornerstone burns on its own, and a worked gold seam glows where it is being cut.
export function facilityLamps(f, geo) {
  const lamps = [];
  const px = (cx) => geo.ox + cx * geo.cell + geo.cell / 2;
  const py = (cy) => geo.oy + cy * geo.cell + geo.cell / 2;

  for (const room of f.rooms || []) {
    let sx = 0;
    let sy = 0;
    for (const rc of room.cells) {
      sx += rc.x;
      sy += rc.y;
    }
    const n = room.cells.length || 1;
    const quality = typeof room.quality === 'number' ? room.quality : 1;
    lamps.push({
      x: px(sx / n),
      y: py(sy / n),
      radius: geo.cell * (1.6 + Math.min(4, n) * 0.55),
      intensity: 0.42 + Math.min(0.38, quality * 0.22),
    });
  }

  for (let y = 0; y < f.dims.rows; y++) {
    for (let x = 0; x < f.dims.cols; x++) {
      const c = f.grid[y][x];
      if (c.surveyed && c.kind === 'gold' && c.claimed) {
        lamps.push({ x: px(x), y: py(y), radius: geo.cell * 2.2, intensity: 0.5 });
      }
    }
  }

  const co = f.lossObject.cell;
  // The Cornerstone dims as its condition falls. The building is lit by the thing it is losing.
  const cond = Math.max(0, Math.min(100, f.lossObject.condition)) / 100;
  lamps.push({ x: px(co.x), y: py(co.y), radius: geo.cell * 4.4, intensity: 0.3 + cond * 0.45 });

  return lamps;
}

// ---- the cast ------------------------------------------------------------------------------------

// Who is standing where. Staff stand at their own department's posts; a raiding party stands where
// the replay has walked it to; an officer who has served an instrument stands inside the building,
// because the instrument does not leave when he does.
export function castPlacements(f, view) {
  const out = [];
  const rooms = f.rooms || [];
  const staff = (f.staff || []).filter((s) => s.status === 'employed' || s.status === 'grieving');

  // Count the crew by archetype, then seat them in the departments that attract them.
  const byArchetype = new Map();
  for (const s of staff) byArchetype.set(s.archetype, (byArchetype.get(s.archetype) || 0) + 1);

  for (const room of rooms) {
    const arch = DEPT_ARCHETYPE[room.type];
    if (!arch) continue;
    let remaining = byArchetype.get(arch) || 0;
    if (remaining <= 0) continue;
    // Sorted so a facility redraws its people in the same seats every frame.
    const seats = [...room.cells].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const seat of seats) {
      if (remaining <= 0) break;
      out.push({ figure: arch, cell: seat, role: arch, flip: (seat.x + seat.y) % 2 === 0 });
      remaining -= 1;
    }
    byArchetype.set(arch, remaining);
  }

  // Anyone the departments could not seat stands on claimed floor near the Cornerstone: the crew
  // is present whether or not there is a post for it.
  let unseated = 0;
  for (const n of byArchetype.values()) unseated += Math.max(0, n);
  if (unseated > 0) {
    const co = f.lossObject.cell;
    const spare = [];
    for (let r = 1; r <= 3 && spare.length < unseated; r++) {
      for (let dx = -r; dx <= r && spare.length < unseated; dx++) {
        const x = co.x + dx;
        const y = co.y + r;
        if (x < 0 || y < 0 || x >= f.dims.cols || y >= f.dims.rows) continue;
        const c = f.grid[y][x];
        if (c.surveyed && c.excavated && !c.roomType) spare.push({ x, y });
      }
    }
    for (const seat of spare) out.push({ figure: 'drudge', cell: seat, role: 'drudge', flip: false });
  }

  // An officer stands in the building while his instrument is unanswered (M5's ladder). Rung 1 and
  // 3 send the cowled one, rung 2 the inspector, so the standing changes the man in the corridor.
  const served = (f.notices || []).filter((n) => n.status === 'served');
  if (served.length > 0) {
    const rung = served[0].rung;
    const co = f.lossObject.cell;
    const seat = findFloorNear(f, co.x + 2, co.y) || findFloorNear(f, co.x - 2, co.y);
    if (seat) out.push({ figure: rung === 2 ? 'officerB' : 'officer', cell: seat, role: 'officer', flip: true });
  }

  // The raiding party, during the watchable replay: the head of the party where the replay has
  // reached, and a second member a step behind it, so a party reads as a party.
  //
  // The cast data states figures face right; flip mirrors them. Flip is derived from the raid's
  // travel direction so a future profile-sprite swap cannot moonwalk. The walk frame (frames[1]) is
  // prepared but not currently rendered; the replay advances per-frame, not per-step.
  if (view && view.overlay === 'raid' && view.replay) {
    const steps = view.replay.steps;
    const cursor = Math.min(view.replay.cursor, steps.length - 1);
    const head = steps[cursor] && steps[cursor].pos;
    if (head) {
      let dx = 0;
      if (cursor > 0) dx = head.x - steps[cursor - 1].pos.x;
      else if (steps.length > 1) dx = steps[1].pos.x - head.x;
      const flip = dx < 0;
      out.push({ figure: 'raider', cell: head, role: 'raider', flip, front: true });
      const trailIndex = cursor - 2;
      const trail = trailIndex >= 0 && steps[trailIndex] && steps[trailIndex].pos;
      if (trail && (trail.x !== head.x || trail.y !== head.y)) {
        out.push({ figure: 'raiderB', cell: trail, role: 'raider', flip, front: true });
      }
    }
  }

  return out;
}

function findFloorNear(f, x, y) {
  for (let r = 0; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= f.dims.cols || cy >= f.dims.rows) continue;
        const c = f.grid[cy][cx];
        if (c.surveyed && c.excavated) return { x: cx, y: cy };
      }
    }
  }
  return null;
}

// ---- composition ----------------------------------------------------------------------------------

// A signature of everything that changes the picture. The caller recomposes only when it moves,
// which is what keeps a per-pixel renderer affordable inside a draw-only animation frame.
export function sceneSignature(f, view, geo) {
  const parts = [f.seed, geo.cell, geo.ox, geo.oy, f.cycle.number, f.lossObject.condition];
  let carved = 0;
  let claimed = 0;
  let surveyed = 0;
  for (let y = 0; y < f.dims.rows; y++) {
    for (let x = 0; x < f.dims.cols; x++) {
      const c = f.grid[y][x];
      if (c.excavated) carved += x * 31 + y;
      if (c.claimed) claimed += x * 17 + y;
      if (c.surveyed) surveyed += x * 7 + y;
    }
  }
  parts.push(carved, claimed, surveyed);
  for (const room of f.rooms || []) parts.push(`${room.type}:${room.size}`);
  parts.push((f.staff || []).filter((s) => s.status !== 'separated').length);
  parts.push((f.notices || []).filter((n) => n.status === 'served').map((n) => n.rung).join('/'));
  if (view && view.overlay === 'raid' && view.replay) parts.push(`r${view.replay.cursor}`);
  else parts.push('r-');
  return parts.join('|');
}

// composeSection(f, geo, panel, view) -> { w, h, data } — the lit, cut, populated section.
// `panel` is the destination rectangle in buffer coordinates; the returned data is RGBA bytes.
export function composeSection(f, geo, panel, view) {
  const w = panel.w;
  const h = panel.h;
  const data = new Uint8ClampedArray(w * h * 4);
  const noise = grainFor(f.seed);
  const lamps = facilityLamps(f, geo);

  // Per-cell structure flags, computed once rather than per pixel.
  const cols = f.dims.cols;
  const rows = f.dims.rows;

  for (let py = 0; py < h; py++) {
    const by = py + panel.y; // buffer coordinate, so lamps and grain are in one space
    for (let px = 0; px < w; px++) {
      const bx = px + panel.x;
      const gx = Math.floor((bx - geo.ox) / geo.cell);
      const gy = Math.floor((by - geo.oy) / geo.cell);

      const mat = materialAt(f, gx, gy);
      let ramp = mat.ramp;
      let idx = mat.base;

      // Light selects the step (item 2). Solid rock takes far less of it: an unopened seam of rock
      // is not lit by the room next door, and that is what makes the carved space read as carved.
      // A chamber's back wall stays low on its ramp and its FLOOR is the bright thing. That is the
      // difference between a section drawing and a tile map: you read a room by the slab you could
      // stand on and the line where the cut passes through the wall, not by a lit rectangle.
      const light = lightAt(lamps, bx, by, AMBIENT);
      idx += light * LIGHT_RANGE * (mat.solid ? 0.3 : 0.55);

      // Grain (item 3): fbm perturbs the index so the surface has material, not a fill.
      const g = noise.fbm(bx / GRAIN_SCALE, by / GRAIN_SCALE, 4);
      idx += (g - 0.5) * 2 * GRAIN * (mat.solid ? 1.25 : 0.75);

      // Section poché: solid rock carries the cut-earth hatch of a section drawing, and it is
      // STRATIFIED. Ground in a section is not a flat tone: it lies in beds, and it gets darker
      // with depth. Without this the surrounding rock reads as a dark rectangle behind the
      // building rather than as the ground the building is cut into.
      if (mat.solid) {
        if ((bx + by) % 7 === 0) idx += 0.55;
        const strata = noise.fbm(bx / 46, by / 5.5, 3); // stretched wide: beds, not blotches
        idx += (strata - 0.5) * 2 * 0.5;
        idx -= (by - panel.y) / panel.h * 0.85; // deeper is darker
      }

      // The structure, cut into the light rather than drawn over it. In a section, the surfaces the
      // cut plane passes through are the heavy lines: the floor slab you could stand on, the
      // ceiling above it, the walls either side.
      if (!mat.solid && gx >= 0 && gy >= 0 && gx < cols && gy < rows) {
        const lx = bx - (geo.ox + gx * geo.cell);
        const ly = by - (geo.oy + gy * geo.cell);
        const cell = geo.cell;
        if (ly >= cell - 3 && isSolid(f, gx, gy + 1)) idx += 2.9; // the floor slab, cut through
        else if (ly >= cell - 2) idx += 1.9; // the floor line carrying on into the next chamber
        if (ly <= 0 && isSolid(f, gx, gy - 1)) idx += 1.4; // ceiling
        if (lx <= 0 && isSolid(f, gx - 1, gy)) idx += 1.4; // wall, left
        if (lx >= cell - 1 && isSolid(f, gx + 1, gy)) idx += 1.4; // wall, right
      }

      // Dither (item 3): choose between adjacent steps on an ordered matrix, so gradients
      // crosshatch like a drawing instead of blending like a photograph.
      idx += dither(bx, by) - 0.5;

      writeStep(data, (py * w + px) * 4, ramp, idx);
    }
  }

  // Department outlines, drawn after the surfaces: outline weight reads room size (fold 7).
  for (const room of f.rooms || []) {
    const heavy = room.size >= CONFIG.quality.softCapTiles;
    strokeRoom(data, w, h, panel, geo, room, heavy);
  }

  // The cast, standing on the floor slabs of the rooms they are posted to (item 5: the scene is
  // populated last, into a picture that is already lit and framed).
  for (const place of castPlacements(f, view)) {
    const fig = CAST_DATA[place.figure];
    if (!fig) continue;
    const rampName = CAST_RAMP[place.role] || 'stone';
    const cx = geo.ox + place.cell.x * geo.cell + Math.floor((geo.cell - fig.w) / 2) - panel.x;
    const cy = geo.oy + (place.cell.y + 1) * geo.cell - fig.h - 2 - panel.y;
    const light = Math.max(
      FIGURE_LIGHT_FLOOR,
      lightAt(lamps, cx + panel.x + fig.w / 2, cy + panel.y + fig.h / 2, AMBIENT),
    );
    blitFigure(data, w, h, fig, cx, cy, rampName, light, place.flip);
  }

  return { w, h, data };
}

// composePaper(panel, seed, weave) -> { w, h, data } — the ledger's sheet of aged manila.
//
// The lit half of the desk gets the same treatment as the dark half, because §4.5 item 4 means
// EVERYTHING draws from the palette: the paper has fibre (fbm), a dither so the tone breaks up
// rather than banding, and a light that falls off toward the edges of the sheet the way a sheet
// under a desk lamp does. It depends on nothing but its own geometry, so it is composed once.
//
// THE WEAVE is a parameter because a sheet that carries a ledger and a sheet that carries three
// paragraphs of prose are not asking the same thing of their texture. A ruled row of figures is
// read in glances and the busy tone under it is atmosphere; a paragraph is read stroke by stroke,
// and the same tone competes with the letterforms at every stem. Ray's verdict on the opening was
// that the body was "tough to read with the CRT dither", so overlay sheets compose at SHEET_CALM.
//
// WHICH TERM IS ACTUALLY THE PROBLEM is not the one the symptom names, and it was measured rather
// than assumed. The first attempt did the obvious thing and halved the Bayer term along with the
// fibre — and the sheet got visibly WORSE: the paper broke into big soft blotches with hard edges.
// That is BANDING. The lamp fall-off alone swings the index over two whole ramp steps across the
// sheet, and the ±0.5 dither is exactly what lets a fractional index resolve as a mix of the two
// adjacent steps instead of snapping to one. Take the dither below ±0.5 and every smooth gradient
// on the sheet quantises into visible step patches. The dither is not the noise; it is the
// mechanism that keeps the noise from becoming banding.
//
// What actually reads as "busy" under a paragraph is the fbm: the FINE fibre at a 3.2px scale, and
// the COARSE unevenness that makes the sheet's tone wander from one step to another underneath a
// line of text. Bringing those two down and leaving the Bayer term at full strength gives an even,
// finely-grained sheet with no blotching — measurably the calmest of six variants composed and
// compared side by side before this was chosen. It still has fibre, unevenness and a lamp falling
// across it, so it is quieter paper rather than flat grey card.
const PAPER_WEAVE = Object.freeze({ fibre: 0.85, uneven: 0.7, dither: 1 });

// The weave for a sheet with running copy on it. Both fbm terms at moderate strength; the Bayer
// dither at full strength, because it is load-bearing against banding (see above).
export const SHEET_CALM = Object.freeze({ fibre: 0.4, uneven: 0.45, dither: 1 });

export function composePaper(panel, seed = 'material-breach', weave = PAPER_WEAVE) {
  const w = panel.w;
  const h = panel.h;
  const fibre = weave.fibre ?? PAPER_WEAVE.fibre;
  const uneven = weave.uneven ?? PAPER_WEAVE.uneven;
  const ditherAmp = weave.dither ?? PAPER_WEAVE.dither;
  const data = new Uint8ClampedArray(w * h * 4);
  const noise = grainFor(`paper:${seed}`);
  const cx = w * 0.42;
  const cy = h * 0.3;
  const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // A soft fall-off from the lamp, expressed as ramp steps rather than a painted gradient.
      const fall = 1 - Math.hypot(x - cx, y - cy) / maxR;
      let idx = 3.1 + fall * 2.1;
      idx += (noise.fbm(x / 3.2, y / 3.2, 4) - 0.5) * 2 * fibre; // paper fibre, fine and busy
      idx += (noise.fbm(x / 26, y / 26, 3) - 0.5) * 2 * uneven; // the sheet's own unevenness
      idx += (dither(x, y) - 0.5) * ditherAmp;
      writeStep(data, (y * w + x) * 4, 'paper', idx);
    }
  }
  return { w, h, data };
}

// ---- the desk ---------------------------------------------------------------------------------------
//
// M7b. The desk was the last flat fill in the game: one `fillRect` of ink[0] behind everything else.
// That is the surface the WHOLE picture sits on, so leaving it flat meant §4.5 item 5 ("scenes are
// composed as single pictures") was true of the section and the sheet individually and false of the
// screen they share. A composed section and a composed sheet lying on a painted rectangle read as
// two artefacts on a background, not as a desk.
//
// So the desk is now a material: pressed fibre board, with a coarse grain, a fine horizontal fibre
// running across it, and ONE lamp — the same lamp the sheet is lit by, in screen coordinates — so
// the light falls consistently across the whole frame instead of each panel implying its own source.
const DESK_LAMP = { x: 470, y: 95 };

// `quiet` names bands of the desk that CARRY TEXT and must therefore keep a still ground. This is
// the same finding r3 acted on when the title block and status strip moved onto manila: a contrast
// ratio measures two flat colours and cannot see a busy ground, so a band where a light letterform
// sits directly on grain needs its material held down. Measured, not assumed — the composed desk
// reaches ink[2] in about ninety pixels of the header strip, and the incident-replay label on
// ink[2] falls to 4.41:1, under Gate 5's 4.5:1 floor. Clamping those bands is the honest fix; the
// alternative was to keep the number and lower the gate.
export function composeDesk(panel, { seed = 'material-breach', quiet = [] } = {}) {
  const w = panel.w;
  const h = panel.h;
  const data = new Uint8ClampedArray(w * h * 4);
  const noise = grainFor(`desk:${seed}`);
  const maxR = Math.hypot(640, 360) * 0.72;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bx = x + panel.x;
      const by = y + panel.y;
      // Light as a ramp-step selection, never a painted gradient (item 2).
      const fall = 1 - Math.min(1, Math.hypot(bx - DESK_LAMP.x, by - DESK_LAMP.y) / maxR);
      let idx = 0.35 + fall * 1.5;
      idx += (noise.fbm(bx / 5.5, by / 5.5, 4) - 0.5) * 2 * 0.7; // board grain
      idx += (noise.fbm(bx / 60, by / 9, 2) - 0.5) * 2 * 0.45; // fibre, drawn out sideways
      idx += dither(bx, by) - 0.5;
      for (const q of quiet) {
        if (bx >= q.x && bx < q.x + q.w && by >= q.y && by < q.y + q.h && idx > q.max) idx = q.max;
      }
      writeStep(data, (y * w + x) * 4, 'ink', idx);
    }
  }
  return { w, h, data };
}

// ---- the controls ----------------------------------------------------------------------------------
//
// The action bar's buttons were the last widgets on the desk: a flat fill and a one-pixel stroke.
// Under the stack they become objects — pressed-fibre keys with a bevel catching the desk's own
// lamp, a grain, and a dark well beneath. The FIELD under the label stays at the step the palette
// names (`buttonFace`), because Gate 5 measures button text against exactly that colour and a
// prettier button that quietly moved its own background would invalidate a measured legibility
// figure rather than improve it. The light goes into the bevel, where there is no text.
export function composeButton(w, h, { enabled = true, seed = 'material-breach' } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  const noise = grainFor(`button:${seed}`);
  const base = enabled ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = base;
      const top = y;
      const bottom = h - 1 - y;
      const left = x;
      const right = w - 1 - x;
      // A bevel: lit from above-left, shaded below-right, which is what makes a key read as raised.
      if (top === 0 || left === 0) idx += enabled ? 2.0 : 1.1;
      else if (top === 1 || left === 1) idx += enabled ? 1.0 : 0.5;
      if (bottom === 0 || right === 0) idx -= 0.9;
      else if (bottom === 1 || right === 1) idx -= 0.4;
      // The face itself is very slightly domed, so it is not a flat field with an edge drawn on it.
      const dome = 1 - Math.abs(y - (h - 1) / 2) / ((h - 1) / 2 || 1);
      idx += dome * 0.35;
      idx += (noise.fbm(x / 3.4, y / 3.4, 3) - 0.5) * 2 * 0.35;
      idx += dither(x, y) - 0.5;
      writeStep(data, (y * w + x) * 4, 'stone', idx);
    }
  }
  return { w, h, data };
}

// ---- darkening, as ramp-step selection ------------------------------------------------------------
//
// THE VIOLATION THIS REPLACES. Until M7b the overlay backdrop was `fillStyle = 'rgba(6,6,8,0.82)'`
// painted across the finished frame — which is precisely, and only, what §4.5 item 2 forbids:
// "Lighting as compositing, not as an overlay ... not by painting a translucent gradient over
// finished art." It was the one place in the game where light was a sheet of grey rather than a
// choice of step, and it sat on top of every carefully lit pixel underneath.
//
// The replacement takes each pixel, finds which ramp and step it IS, and selects a lower step of
// that same ramp. Manila goes to a darker manila, verdigris to a darker verdigris, and the desk
// keeps its own material. It reads as the room's lights being turned down over a real surface,
// which is what putting a document under a desk lamp actually does to everything around it.
//
// Every colour on screen comes from the palette by law, so the lookup is exact for all of them. The
// exceptions are the canvas's own antialiased text edges; those resolve to the nearest palette
// colour once and are memoised, so the cost is paid on a few thousand distinct values and never
// again.
const STEP_OF = new Map();
const PALETTE_LIST = [];
for (const [name, bytes] of Object.entries(RAMP_BYTES)) {
  const n = bytes.length / 3;
  for (let k = 0; k < n; k++) {
    const r = bytes[k * 3];
    const g = bytes[k * 3 + 1];
    const b = bytes[k * 3 + 2];
    const key = (r << 16) | (g << 8) | b;
    if (!STEP_OF.has(key)) STEP_OF.set(key, { ramp: name, step: k });
    PALETTE_LIST.push({ r, g, b, ramp: name, step: k });
  }
}

function resolve(key, r, g, b) {
  let hit = STEP_OF.get(key);
  if (hit) return hit;
  let best = PALETTE_LIST[0];
  let bestD = Infinity;
  for (const p of PALETTE_LIST) {
    const d = (p.r - r) * (p.r - r) + (p.g - g) * (p.g - g) + (p.b - b) * (p.b - b);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  hit = { ramp: best.ramp, step: best.step };
  STEP_OF.set(key, hit); // memoised: an antialiased edge is resolved once for the life of the page
  return hit;
}

/**
 * darkenPixels(data, steps) — step every pixel down its OWN ramp, in place.
 *
 * `steps` may be fractional; the dither decides between the two adjacent steps, so a half-step
 * darkening crosshatches like the rest of the picture instead of banding.
 */
export function darkenPixels(data, steps, width = 0) {
  for (let o = 0; o < data.length; o += 4) {
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const { ramp, step } = resolve((r << 16) | (g << 8) | b, r, g, b);
    const px = width ? (o / 4) % width : 0;
    const py = width ? Math.floor(o / 4 / width) : 0;
    writeStep(data, o, ramp, step - steps + (width ? dither(px, py) - 0.5 : 0));
  }
  return data;
}

// Write one ramp step into the byte buffer. The clamp lives here so no caller can select a colour
// outside the palette however far its lighting maths overshoots.
function writeStep(data, o, rampName, idx) {
  const bytes = RAMP_BYTES[rampName] || RAMP_BYTES.stone;
  const n = bytes.length / 3;
  let k = Math.floor(idx);
  if (k < 0) k = 0;
  else if (k > n - 1) k = n - 1;
  data[o] = bytes[k * 3];
  data[o + 1] = bytes[k * 3 + 1];
  data[o + 2] = bytes[k * 3 + 2];
  data[o + 3] = 255;
}

// Stroke a department's perimeter. Only the edges that face out of the room are drawn, so a
// six-tile department reads as one room with one outline, not six boxes.
function strokeRoom(data, w, h, panel, geo, room, heavy) {
  const inRoom = new Set(room.cells.map((c) => `${c.x},${c.y}`));
  const thickness = heavy ? 2 : 1;
  const edge = heavy ? RAMPS.bone[5] : RAMPS.bone[3];
  const [r, g, b] = [parseInt(edge.slice(1, 3), 16), parseInt(edge.slice(3, 5), 16), parseInt(edge.slice(5, 7), 16)];
  const put = (x, y) => {
    const px = x - panel.x;
    const py = y - panel.y;
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const o = (py * w + px) * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  };
  for (const c of room.cells) {
    const x0 = geo.ox + c.x * geo.cell;
    const y0 = geo.oy + c.y * geo.cell;
    const x1 = x0 + geo.cell - 1;
    const y1 = y0 + geo.cell - 1;
    if (!inRoom.has(`${c.x},${c.y - 1}`)) for (let t = 0; t < thickness; t++) for (let x = x0; x <= x1; x++) put(x, y0 + t);
    if (!inRoom.has(`${c.x},${c.y + 1}`)) for (let t = 0; t < thickness; t++) for (let x = x0; x <= x1; x++) put(x, y1 - t);
    if (!inRoom.has(`${c.x - 1},${c.y}`)) for (let t = 0; t < thickness; t++) for (let y = y0; y <= y1; y++) put(x0 + t, y);
    if (!inRoom.has(`${c.x + 1},${c.y}`)) for (let t = 0; t < thickness; t++) for (let y = y0; y <= y1; y++) put(x1 - t, y);
  }
}

// Blit one figure. Its stored value is a ramp-step OFFSET, not a colour: the light of the tile it
// stands on is added, so a clerk in a bright Records room and the same clerk in an unlit corridor
// are the same figure at two steps of one ramp. That is item 2 applied to the cast.
// The light a figure receives is worth less than a wall's, because a figure has only four steps of
// its own modelling to spend and the ramp has six or seven in total. Lifting it by the full light
// range pushes every step of the body into the top of the ramp, and the figure flattens into a
// blob: that is exactly what the first capture of the populated section showed, and it is why this
// number is small and deliberate rather than shared with the walls.
const FIGURE_LIGHT_GAIN = 1.9;

export function blitFigure(data, w, h, fig, dx, dy, rampName, light, flip) {
  const frame = fig.frames[0];
  const lift = light * FIGURE_LIGHT_GAIN;
  for (let y = 0; y < fig.h; y++) {
    for (let x = 0; x < fig.w; x++) {
      const ch = frame[y * fig.w + x];
      if (ch === '.') continue;
      const sx = flip ? fig.w - 1 - x : x;
      const px = dx + sx;
      const py = dy + y;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const raw = Number(ch);
      // The pack's figures are drawn with their own outline, and that outline is their darkest
      // value. Rendering it in ink keeps the silhouette crisp against a lit chamber without
      // growing the figure by a pixel, which an added halo does (and which reads as a sticker
      // pasted on the drawing rather than a person standing in it).
      if (raw === 0) {
        writeStep(data, (py * w + px) * 4, 'ink', 1);
        continue;
      }
      writeStep(data, (py * w + px) * 4, rampName, raw - 1 + lift + dither(px, py) - 0.5);
    }
  }
}

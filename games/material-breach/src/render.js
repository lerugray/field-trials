// render.js — draws the desk into the 640x360 buffer. Presentation only: it READS the view and
// never mutates game state, and it uses no clock (the pulse reads view.frame, a presentation
// counter).
//
// The desk is ONE PICTURE (DESIGN-SEED §4.5 item 5): a drawing board with two things on it. On the
// left, an architectural section of the facility, composed pixel by pixel under the VACUUM SEALED
// stack in scene.js. On the right, a sheet of aged manila with the ledger SET on it as a document.
//
// M7a r2, answering Ray's verdict on r1 ("a little crowded/small, log could be better formatted,
// better fonts could be used"):
//   - the section camera FRAMES the built facility instead of drawing the whole grid at a fixed
//     small cell, so the building fills its sheet the way a section drawing does;
//   - the ledger is typeset rather than printed out: a statement zone of ruled label/value rows
//     with leader dots and right-aligned figures, then a report zone with its own heading, the two
//     divided by a double rule;
//   - both faces come from the Not Jam Font Pack, and nothing is drawn at a size they were not cut
//     for (type.js carries the register argument for the pair).
import { SCREEN, CUTAWAY, LEDGER, ACTIONBAR, computeButtons, cutawayGeometry, sectionFocus, SECTION_INSET } from './layout.js';
import { facilityDefense, activeStaff, CONFIG, countClaimed, worksDefense } from './model.js';
import { canExcavate, countExcavated } from './grid.js';
import { housingCapacity, foodCapacity, openPosts, DEPT_ARCHETYPE } from './staff.js';
import { OFFICER, INSTRUMENT_NAME } from './ladder.js';
import { detentionCapacity, CONFIG as CFG } from './model.js';
import { C, RAMPS, TEXT_PAIRS as PALETTE_TEXT_PAIRS } from './palette.js';
import { composeSection, composePaper, composeDesk, composeButton, darkenPixels, sceneSignature, castPlacements, SHEET_CALM } from './scene.js';
import { FACE, SIZE, LEAD, font, MIN_TEXT_PX as TYPE_MIN } from './type.js';
import { PROVENANCE, PROVENANCE_TITLE } from './provenance.js';

// The section's drawing area, between the header strip and the title block. A section drawing has a
// title block; putting the legend in one guarantees its contrast against whatever the drawing is
// doing behind it, and is what the instrument would actually look like.
const HEADER_H = SECTION_INSET.top - 2;
const TITLEBLOCK_H = SECTION_INSET.bottom;

// r3: the title block and the status strip are PRINTED ON MANILA, not written on the dark desk.
//
// Ray's r2 nit was that the text under the drawing "may need to be something else to be a little
// more legible". It was a light bone serif on near-black. That cleared the contrast floor on paper
// (8.6:1) and was still the hardest thing on the screen to read, because a thin light letterform
// sits directly on the section's own hatch and grain, and the texture competes with the glyph at
// every stroke. A contrast ratio measures two flat colours; it cannot see a busy ground.
//
// Setting both strips as paper with ink on them fixes it three ways at once. The ground goes quiet
// and flat. The polarity matches the ledger, so the eye stops switching between light-on-dark and
// dark-on-light inside one picture. And it is what the object actually is: a drawing's title block
// IS a printed panel on the sheet, not a caption floating over the drawing.
const stripCache = new Map();
function paperStrip(ctx, rect, key) {
  let image = stripCache.get(key);
  if (!image) {
    const composed = composePaper(rect, key);
    image = ctx.createImageData(composed.w, composed.h);
    image.data.set(composed.data);
    stripCache.set(key, image);
  }
  ctx.putImageData(image, rect.x, rect.y);
}

const SECTION = {
  x: CUTAWAY.x + 1,
  y: CUTAWAY.y + SECTION_INSET.top,
  w: CUTAWAY.w - 2,
  h: CUTAWAY.h - SECTION_INSET.top - SECTION_INSET.bottom,
};

// The sheet, and its margins. r1 ran text to within 8px of the paper's edge on every side, which is
// part of what made the log read as output rather than as a document. A form has a margin.
const PAPER = { x: LEDGER.x + 1, y: LEDGER.y + 1, w: LEDGER.w - 2, h: LEDGER.h - 2 };
const M = { left: PAPER.x + 13, right: PAPER.x + PAPER.w - 13, top: PAPER.y + 12 };
const COLUMN_W = M.right - M.left;

// The sheet is divided by a double rule into two zones: the STATEMENT of the facility above and the
// AFTER-ACTION REPORT below.
//
// The report is the game (DESIGN-SEED §3: "the report's contents ARE next cycle's paperwork"), so
// the report's space is RESERVED and the statement is what gets trimmed. The statement draws its
// core rows, then the standing officer if one is in attendance, then as many of the optional rows
// as still fit above the reserved line. A statement that ran long used to push the report heading
// to the foot of the sheet with nothing under it, which is the wrong thing to lose.
const REPORT_RESERVE = 116;
const STATEMENT_FLOOR = PAPER.y + PAPER.h - REPORT_RESERVE;
const ZONE_SPLIT = PAPER.y + 168;

const DEPT_LABEL = {
  treasury: 'Treasury',
  records: 'Records',
  fabrication: 'Fabrication',
  holding: 'Holding',
  quarters: 'Quarters',
  commissary: 'Commissary',
  excavation: 'Excavation',
};

// ---- per-pixel caches --------------------------------------------------------------------------

let sectionCache = { sig: null, image: null };
let paperCache = { key: null, image: null };
// M7b: the desk is a composed material, not a fill, so the whole frame is one lit picture rather
// than two lit panels on a painted rectangle. It depends on nothing but its own geometry.
let deskCache = { key: null, image: null };
// Composed button faces, one per size and state. There are a handful of each for a whole session.
const buttonCache = new Map();
// The dimmed backdrop behind a document overlay, cached against the frame it was taken from: the
// darkening walks every pixel on screen, which is far too much work to repeat sixty times a second
// for a picture that is not moving. A document is laid on a still desk.
let dimCache = { key: null, image: null };

function deskSurface(ctx) {
  const key = `${SCREEN.w}x${SCREEN.h}`;
  if (deskCache.key !== key || !deskCache.image) {
    // The header strip carries the drawing's title and, during an incident, the replay label in
    // rust. Those are light letterforms on the desk itself, so the desk is held quiet under them.
    const composed = composeDesk(
      { x: 0, y: 0, w: SCREEN.w, h: SCREEN.h },
      { quiet: [{ x: CUTAWAY.x, y: CUTAWAY.y, w: CUTAWAY.w, h: HEADER_H + 1, max: 1 }] },
    );
    const image = ctx.createImageData(composed.w, composed.h);
    image.data.set(composed.data);
    deskCache = { key, image };
  }
  return deskCache.image;
}

// ---- type helpers --------------------------------------------------------------------------------

function text(ctx, str, x, y, color = C.sectionText, size = SIZE.body, face = FACE.body) {
  ctx.fillStyle = color;
  ctx.font = font(size, face);
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
}

// Right-align a value on a column edge. This is how a ledger sets figures, and it is what makes a
// column of numbers scannable even where the faces have proportional digits.
function textRight(ctx, str, rightX, y, color, size = SIZE.body, face = FACE.body) {
  ctx.font = font(size, face);
  const w = ctx.measureText(str).width;
  text(ctx, str, rightX - w, y, color, size, face);
}

// Centre a string on a column. Letterhead is set on the sheet's axis, not on its left margin, so
// the masthead and its subtitle both come through here. The x is floored to a whole pixel: the
// buffer is integer-scaled, and a glyph run starting on a half pixel is a blurred glyph run.
// Returns the measured width, because the rules drawn around a masthead have to know how wide it is.
function textCenter(ctx, str, centerX, y, color, size = SIZE.body, face = FACE.body) {
  ctx.font = font(size, face);
  const w = ctx.measureText(str).width;
  text(ctx, str, Math.floor(centerX - w / 2), y, color, size, face);
  return w;
}

function band(ctx, r, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

function rule(ctx, x, y, w, color = C.inkRule, thickness = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thickness);
}

// A section heading on the sheet: printed slab type with a rule under it. Returns the new y.
function heading(ctx, label, y, left = M.left, width = COLUMN_W) {
  text(ctx, label, left, y, C.inkSecondary, SIZE.title, FACE.display);
  rule(ctx, left, y + SIZE.title + 3, width);
  return y + SIZE.title + LEAD.rule + 3;
}

// One ruled row: a label on the left, a figure right-aligned on the column edge, and leader dots
// joining them. The dots are what make it read as a ledger rather than a readout, and they are also
// a legibility aid, carrying the eye from a label to its own number, which is the LEGIBILITY LAW's
// whole concern.
function row(ctx, label, value, y, valueColor = C.inkBody, left = M.left, right = M.right) {
  text(ctx, label, left, y, C.inkBody, SIZE.body);
  ctx.font = font(SIZE.body, FACE.body);
  const labelW = ctx.measureText(label).width;
  const valueW = ctx.measureText(value).width;
  const gapStart = left + labelW + 5;
  const gapEnd = right - valueW - 5;
  ctx.fillStyle = C.paperShade;
  for (let x = gapStart; x < gapEnd; x += 4) ctx.fillRect(x, y + SIZE.body - 3, 1, 1);
  textRight(ctx, value, right, y, valueColor);
  return y + LEAD.row;
}

// Word-wrap a string into the given width, returning the new y. `maxY` is a hard floor: a line that
// would be drawn below it is not drawn at all, because a half-line cut off by the edge of the sheet
// is a number the player cannot read.
function wrap(ctx, str, x, y, maxW, color, size = SIZE.body, maxY = Infinity, face = FACE.body) {
  ctx.font = font(size, face);
  const words = String(str).split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      if (y + size > maxY) return y;
      text(ctx, line, x, y, color, size, face);
      y += LEAD.tight;
      line = w;
      ctx.font = font(size, face);
    } else {
      line = test;
    }
  }
  if (line) {
    if (y + size > maxY) return y;
    text(ctx, line, x, y, color, size, face);
    y += LEAD.tight;
  }
  return y;
}

// Measure how many lines `wrap()` would draw without drawing them, so a scrollable report knows
// how far it can scroll.
function measureWrap(ctx, str, maxW, size = SIZE.body, face = FACE.body) {
  ctx.font = font(size, face);
  const words = String(str).split(' ');
  let line = '';
  let lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines += 1;
      line = w;
      ctx.font = font(size, face);
    } else {
      line = test;
    }
  }
  if (line) lines += 1;
  return lines * LEAD.tight;
}

// ---- the section -----------------------------------------------------------------------------------

function drawCutaway(ctx, view) {
  const f = view.facility;
  const geo = cutawayGeometry(f.dims, view.pan || { x: 0, y: 0 }, sectionFocus(f, view));

  const sig = sceneSignature(f, view, geo);
  if (sectionCache.sig !== sig) {
    const composed = composeSection(f, geo, SECTION, view);
    const image = ctx.createImageData(composed.w, composed.h);
    image.data.set(composed.data);
    sectionCache = { sig, image };
  }
  ctx.putImageData(sectionCache.image, SECTION.x, SECTION.y);

  // The header strip: what this drawing is, and what a click does to it. Clipped to the panel, so
  // no caption can ever run under the sheet beside it whatever the numbers in it grow to.
  const hdr = { x: CUTAWAY.x, y: CUTAWAY.y, w: CUTAWAY.w, h: HEADER_H };
  ctx.save();
  ctx.beginPath();
  ctx.rect(hdr.x, hdr.y, hdr.w, hdr.h);
  ctx.clip();
  ctx.font = font(SIZE.title, FACE.display);
  if (view.overlay === 'raid' && view.replay) {
    const raid = f.lastRaid;
    text(ctx, 'INCIDENT REPLAY', CUTAWAY.x + 6, CUTAWAY.y + 2, C.rustBright, SIZE.title, FACE.display);
    const w = ctx.measureText('INCIDENT REPLAY').width;
    text(
      ctx,
      `cycle ${raid ? raid.cycle : f.cycle.number}, party of ${raid ? raid.party.size : '?'}`,
      CUTAWAY.x + 14 + w,
      CUTAWAY.y + 3,
      C.sectionLabel,
    );
  } else {
    text(ctx, 'FACILITY SECTION', CUTAWAY.x + 6, CUTAWAY.y + 2, C.sectionLabel, SIZE.title, FACE.display);
    const w = ctx.measureText('FACILITY SECTION').width;
    text(ctx, 'click rock to carve', CUTAWAY.x + 14 + w, CUTAWAY.y + 3, C.sectionLabel);
  }
  ctx.restore();

  // Annotations that change every frame sit on top of the composed picture, as lines on a drawing.
  ctx.save();
  ctx.beginPath();
  ctx.rect(SECTION.x, SECTION.y, SECTION.w, SECTION.h);
  ctx.clip();

  const cell = geo.cell;
  for (const order of f.orders) {
    if (order.kind !== 'excavate') continue;
    if (order.status === 'done' || order.status === 'cancelled') continue;
    const px = geo.ox + order.target.x * cell;
    const py = geo.oy + order.target.y * cell;
    ctx.strokeStyle = C.brassBright;
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(px + 1.5, py + 1.5, cell - 4, cell - 4);
    ctx.setLineDash([]);
  }

  if (view.hoverCell) {
    const hc = f.grid[view.hoverCell.y] && f.grid[view.hoverCell.y][view.hoverCell.x];
    const tool = view.tool || 'excavate';
    let legal = false;
    if (tool === 'excavate') legal = canExcavate(f, view.hoverCell.x, view.hoverCell.y);
    else if (tool === 'clear') legal = !!(hc && hc.roomType);
    else legal = !!(hc && hc.excavated && hc.claimed && hc.kind === 'floor');
    if (legal) {
      const px = geo.ox + view.hoverCell.x * cell;
      const py = geo.oy + view.hoverCell.y * cell;
      ctx.strokeStyle = RAMPS.bone[6];
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
    }
  }

  // The Cornerstone, with a pulse that rises as its condition falls (fold 4: the proximity read).
  const co = f.lossObject.cell;
  const cxp = geo.ox + co.x * cell + (cell - 1) / 2;
  const cyp = geo.oy + co.y * cell + (cell - 1) / 2;
  const stress = 1 - f.lossObject.condition / 100;
  const pulse = 3 + stress * 8 + (Math.sin(view.frame * 0.15) + 1) * (1.5 + stress * 5);
  ctx.strokeStyle = stress > 0.5 ? C.rustBright : C.cornerstone;
  ctx.beginPath();
  ctx.arc(cxp, cyp, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.cornerstone;
  ctx.fillRect(cxp - 2, cyp - 2, 4, 4);

  if (view.overlay === 'raid' && view.replay) {
    const steps = view.replay.steps;
    const cursor = Math.min(view.replay.cursor, steps.length - 1);
    for (let i = 0; i < cursor; i++) {
      const p = steps[i].pos;
      const px = geo.ox + p.x * cell + (cell - 1) / 2;
      const py = geo.oy + p.y * cell + (cell - 1) / 2;
      ctx.fillStyle = C.rustMark;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    const head = steps[cursor] && steps[cursor].pos;
    if (head) {
      const px = geo.ox + head.x * cell + (cell - 1) / 2;
      const py = geo.oy + head.y * cell + (cell - 1) / 2;
      const label = `strength ${steps[cursor].strength}`;
      ctx.font = font(SIZE.body, FACE.body);
      const lw = ctx.measureText(label).width;
      let lx = px + 12;
      let ly = py - 18;
      if (lx + lw > SECTION.x + SECTION.w) lx = px - 12 - lw;
      if (lx < SECTION.x) lx = SECTION.x;
      if (ly < SECTION.y) ly = SECTION.y;
      text(ctx, label, lx, ly, C.rustBright);
    }
  }
  ctx.restore();

  // The title block: the drawing's legend, in plain language (LEGIBILITY LAW).
  const tb = { x: CUTAWAY.x, y: CUTAWAY.y + CUTAWAY.h - TITLEBLOCK_H, w: CUTAWAY.w, h: TITLEBLOCK_H };
  // The block is printed on manila, inset a little from the panel edge so it reads as a panel stuck
  // to the drawing rather than as the drawing's own bottom edge.
  const plate = { x: tb.x + 3, y: tb.y + 2, w: tb.w - 6, h: tb.h - 4 };
  paperStrip(ctx, plate, 'titleblock');
  ctx.save();
  ctx.beginPath();
  ctx.rect(plate.x, plate.y, plate.w, plate.h);
  ctx.clip();
  rule(ctx, plate.x + 6, plate.y + 15, plate.w - 12, C.inkRule);
  // The legend names the drawing's grammar and nothing else. The census of who is standing on the
  // floors moved to the ledger at r2: it is a figure, and figures belong on the sheet, not written
  // across the bottom of the drawing. Middots rather than full stops: this is a key, not a
  // sentence, and the dots separate the terms without pretending to be punctuation.
  text(ctx, 'LEGEND', plate.x + 6, plate.y + 3, C.inkBody, SIZE.title, FACE.display);
  ctx.font = font(SIZE.title, FACE.display);
  const legendW = ctx.measureText('LEGEND').width;
  text(ctx, 'hatch = rock  ·  bright edge = floor', plate.x + 12 + legendW, plate.y + 3, C.inkBody);
  text(ctx, 'outline = a department  ·  ring = the Cornerstone', plate.x + 6, plate.y + 19, C.inkBody);
  ctx.restore();
}

// ---- the ledger, as a document ------------------------------------------------------------------

function drawLedger(ctx, view) {
  const f = view.facility;
  band(ctx, LEDGER, C.paperEdge);
  const key = `${PAPER.w}x${PAPER.h}:${f.seed}`;
  if (paperCache.key !== key || !paperCache.image) {
    const paper = composePaper(PAPER, f.seed);
    const image = ctx.createImageData(paper.w, paper.h);
    image.data.set(paper.data);
    paperCache = { key, image };
  }
  ctx.putImageData(paperCache.image, PAPER.x, PAPER.y);

  ctx.save();
  ctx.beginPath();
  ctx.rect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
  ctx.clip();

  // ---- the statement zone ----
  let y = M.top;
  text(ctx, 'LEDGER', M.left, y, C.inkBody, SIZE.title, FACE.display);
  textRight(ctx, `cycle ${f.cycle.number}, ${f.cycle.phase}`, M.right, y + 1, C.inkSecondary);
  y += SIZE.title + 5;
  rule(ctx, M.left, y, COLUMN_W, C.inkRule);
  rule(ctx, M.left, y + 2, COLUMN_W, C.inkRule);
  y += 10;

  const crew = activeStaff(f);
  const grieving = crew.filter((s) => s.status === 'grieving').length;
  const avgMorale = crew.length ? Math.round(crew.reduce((a, s) => a + s.morale, 0) / crew.length) : 0;
  const openTotal = Object.values(openPosts(f)).reduce((a, n) => a + n, 0);
  const fed = Math.min(crew.length, foodCapacity(f));
  const housed = Math.min(crew.length, housingCapacity(f));
  const overCap = crew.length > housingCapacity(f) || crew.length > foodCapacity(f);
  const backlog = countExcavated(f) - countClaimed(f);
  const held = f.captives ? f.captives.length : 0;
  const rooms = f.rooms || [];

  // The core of the statement: the figures a manager reads every single cycle.
  y = row(ctx, 'Treasury', `${f.treasury.gold} / ${f.treasury.capacity} g`, y, f.treasury.gold < 60 ? C.stampInk : C.inkBody);
  y = row(ctx, 'Defence', `${facilityDefense(f)}  (fortify ${f.fortify})`, y);
  y = row(ctx, 'Posts', `${crew.length} standing, ${grieving} grieving`, y, grieving > 0 ? C.stampInk : C.inkBody);
  y = row(ctx, 'Amenities', `housed ${housed}/${housingCapacity(f)}, fed ${fed}/${foodCapacity(f)}`, y, overCap ? C.stampInk : C.inkBody);
  y = row(ctx, 'Morale', `${avgMorale} / 100`, y, avgMorale < 30 ? C.stampInk : C.inkBody);
  y = row(ctx, 'Cornerstone', `${f.lossObject.condition} / 100`, y, f.lossObject.condition < 40 ? C.stampInk : C.inkBody);

  // The standing officer and his instrument, drawn BEFORE the optional rows because it is the
  // game's defining mechanic. A served notice is a thing attached to the sheet, so it gets its own
  // stamped block rather than a row.
  const served = f.notices.filter((n) => n.status === 'served');
  if (served.length || f.ladder.rung !== 'none') {
    y += 5;
    y = heading(ctx, 'STANDING', y);
    y = row(ctx, 'Officer', OFFICER[f.ladder.rung] || 'none in attendance', y, served.length ? C.stampInk : C.inkBody);
    for (const n of served) {
      y = row(ctx, INSTRUMENT_NAME[n.rung], `${n.cyclesRemaining} cycle(s) left`, y, C.stampInk);
      y = row(ctx, 'Answer administratively', `${CFG.ladder.answerCost[n.rung]} g  [A]`, y, C.stampInk);
    }
  }

  // The optional rows, drawn only while there is room above the reserved report zone. Each is a
  // figure the drawing already shows in some form, so losing one on a busy sheet costs the player
  // nothing they cannot read off the section or a hover.
  const placed = castPlacements(f, view);
  const onFloors = {
    staff: placed.filter((p) => p.role !== 'raider' && p.role !== 'officer').length,
    raiders: placed.filter((p) => p.role === 'raider').length,
    officers: placed.filter((p) => p.role === 'officer').length,
  };
  const optional = [];
  if (rooms.length) {
    const best = rooms.reduce((a, r) => (r.quality > a.quality ? r : a), rooms[0]);
    optional.push(['Departments', `${rooms.length}, best ${DEPT_LABEL[best.type] || best.type} ${best.quality.toFixed(2)}`, C.inkBody]);
  } else {
    optional.push(['Departments', 'none designated', C.inkSecondary]);
  }
  optional.push([
    'On the floors',
    `${onFloors.staff} staff, ${onFloors.raiders} raiders, ${onFloors.officers} officer`,
    onFloors.raiders > 0 ? C.stampInk : C.inkBody,
  ]);
  // KEEP #6 made legible: the manufactured works are their own row, because a door the facility
  // owns is a different fact from a fortification it bought, and the defence figure alone hides
  // both. The LEGIBILITY LAW asks that every number carry a plain-language label at the point of
  // reading; "Defence 39" does not say where 39 came from, and this row is half the answer.
  const works = f.works || [];
  if (works.length > 0) {
    optional.push(['Works installed', `${works.length}, defence +${worksDefense(f)}`, C.inkBody]);
  }
  if (openTotal > 0) optional.push(['Open posts', String(openTotal), C.inkBody]);
  if (backlog > 0) optional.push(['Claims backlog', `${backlog} cell(s)`, C.inkBody]);
  if (held > 0) optional.push(['Detention', `${held} / ${detentionCapacity(f)} held`, C.inkBody]);
  for (const [label, value, colour] of optional) {
    if (y + LEAD.row > STATEMENT_FLOOR) break;
    y = row(ctx, label, value, y, colour);
  }

  // ---- the report zone ----
  const reportTop = Math.min(Math.max(y + 8, ZONE_SPLIT), STATEMENT_FLOOR + 10);
  rule(ctx, M.left, reportTop - 9, COLUMN_W, C.inkRule);
  rule(ctx, M.left, reportTop - 7, COLUMN_W, C.inkRule);
  let ry = heading(ctx, 'AFTER-ACTION REPORT', reportTop);
  const floor = PAPER.y + PAPER.h - 10;
  const report = f.lastReport;
  if (!report) {
    text(ctx, 'No cycle has been signed over yet.', M.left, ry, C.inkSecondary);
  } else {
    // The report is scrollable: late-cycle reports can be long, and silently dropping their tail
    // lines is a defect (Release fix round B3). The heading stays fixed; only the lines scroll.
    const reportLinesTop = ry;
    const reportLinesH = floor - reportLinesTop;
    const contentH = report.lines.reduce((h, line) => {
      return (
        h +
        measureWrap(ctx, line.numeric, COLUMN_W) +
        measureWrap(ctx, line.text, COLUMN_W - 8) +
        (line.cause ? measureWrap(ctx, `cause: ${line.cause}`, COLUMN_W - 8) : 0) +
        5
      );
    }, 0);
    view.reportMaxScroll = Math.max(0, contentH - reportLinesH);
    view.reportScroll = Math.max(0, Math.min(view.reportScroll || 0, view.reportMaxScroll));

    ctx.save();
    ctx.beginPath();
    ctx.rect(M.left - 2, reportLinesTop, COLUMN_W + 4, reportLinesH);
    ctx.clip();
    ctx.translate(0, -view.reportScroll);

    for (const line of report.lines) {
      ry = wrap(ctx, line.numeric, M.left, ry, COLUMN_W, C.inkBody, SIZE.body, Infinity);
      ry = wrap(ctx, line.text, M.left + 8, ry, COLUMN_W - 8, C.inkSecondary, SIZE.body, Infinity);
      if (line.cause) ry = wrap(ctx, `cause: ${line.cause}`, M.left + 8, ry, COLUMN_W - 8, C.inkSecondary, SIZE.body, Infinity);
      ry += 5;
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawButton(ctx, b) {
  // A pressed-fibre key, composed under the stack (grain, bevel, dither) rather than a filled rect
  // with a stroke around it. The field under the label stays on the step the palette names, so the
  // contrast figure Gate 5 measured for button text remains the contrast that is drawn.
  const key = `${b.w}x${b.h}:${b.enabled ? 1 : 0}`;
  let face = buttonCache.get(key);
  if (!face) {
    const composed = composeButton(b.w, b.h, { enabled: b.enabled });
    face = ctx.createImageData(composed.w, composed.h);
    face.data.set(composed.data);
    buttonCache.set(key, face);
  }
  ctx.putImageData(face, b.x, b.y);
  const label = b.key ? `${b.label}  [${b.key}]` : b.label;
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  ctx.clip();
  text(ctx, label, b.x + 6, b.y + (b.h - SIZE.body) / 2 - 1, b.enabled ? C.buttonText : C.buttonTextOff);
  ctx.restore();
}

// describeCell(f, x, y) -> a plain-language label for a cell, at the point of reading (LEGIBILITY
// LAW): no sigil a first-session player would have to ask about goes unexplained, and that includes
// the figures, so a player can ask the drawing who is standing in a room.
export function describeCell(f, x, y) {
  if (!f.grid[y] || !f.grid[y][x]) return '';
  const c = f.grid[y][x];
  if (f.lossObject.cell.x === x && f.lossObject.cell.y === y) {
    return `The Cornerstone, the loss object (condition ${f.lossObject.condition}/100)`;
  }
  if (!c.surveyed) return 'Unsurveyed rock (contents unknown until it is carved)';
  if (c.roomType) {
    const arch = DEPT_ARCHETYPE[c.roomType];
    const posted = arch ? `, worked by the ${arch} caste` : '';
    return `${DEPT_LABEL[c.roomType] || c.roomType} department (claimed floor, designated${posted})`;
  }
  if (c.kind === 'gold') return c.claimed ? 'Gold seam, worked (pays receipts each cycle)' : 'Gold seam (claim it to work it)';
  if (c.claimed) return 'Claimed floor (defensible, designable as a department)';
  return 'Carved floor (not yet claimed)';
}

function drawActionBar(ctx, view) {
  rule(ctx, ACTIONBAR.x, ACTIONBAR.y, ACTIONBAR.w, C.deskEdge);
  // The status strip: whatever the pointer is over, or the last thing the operator did, read back in
  // plain language. It is printed on manila for the same reason the title block is (r3): this is the
  // line a player reads to find out what a cell IS, so it has to be the easiest line on the screen,
  // not a dim caption on the desk.
  const strip = { x: ACTIONBAR.x, y: ACTIONBAR.y + 30, w: ACTIONBAR.w, h: ACTIONBAR.h - 30 };
  paperStrip(ctx, strip, 'statusstrip');
  const hover = view.hoverCell ? describeCell(view.facility, view.hoverCell.x, view.hoverCell.y) : '';
  const note = hover || view.lastActionNote;
  ctx.save();
  ctx.beginPath();
  ctx.rect(strip.x, strip.y, strip.w, strip.h);
  ctx.clip();
  if (note) text(ctx, note, strip.x + 8, strip.y + 3, C.inkBody);
  ctx.restore();
}

// ---- the charter's letterhead ---------------------------------------------------------------
//
// Ray's verdict on the opening was that the charter "does not read at all as a title screen". It
// did not, and the reason was a hierarchy that stated the wrong thing first: CHARTER OF APPOINTMENT
// was set as the sheet's title at 11px and MATERIAL BREACH sat UNDER it as a second 11px line, so
// the largest, first, boldest thing on a stranger's first screen was the name of a form, and the
// name of the game was a subordinate entry on it.
//
// So the two swap ranks. The game's name becomes a MASTHEAD at 33px across the sheet's axis between
// letterpress rules, and the form's name is demoted to what it always was — the document's subtitle,
// printed under the masthead the way a real letterhead carries "CERTIFICATE OF ..." under the
// institution that issued it. The seed law is untouched: this is still a document on a desk, with
// its own paper, its own shadow and the drawing lit behind it. Nothing floats.
//
// A masthead is a BLOCK, not a heading with a bigger number on it, and it has to pay for itself.
// It does, exactly: the old header spent 72px (the sheet top to the first line of copy) on an 11px
// title, a double rule, an 11px name and another rule, most of it air. The block below spends the
// SAME 72px and lands the copy on the SAME first line. So tripling the size of the name costs the
// charter's six copy lines, the three controls and the desk slip below the sheet exactly nothing —
// which is the point, because "copy that does not fit is copy that does not ship" is this file's
// own law and a masthead paid for by deleting a sentence would be breaking it.
//
// Every offset is measured from the top of the sheet, and CHARTER_COPY_TOP is the contract with
// the copy that follows.
const MASTHEAD = {
  ruleTop: 8, // 3px. The letterhead's top edge.
  name: 15, // 33px display, ink running 15..39 from the sheet top.
  ruleUnder: 43, // 2px.
  ruleUnderThin: 47, // 1px. With the rule above it this is a double rule, which is what an
  // official sheet actually carries under its masthead.
  subtitle: 53, // 11px display: the document's own title, demoted beneath the name.
  ruleFoot: 66, // 1px hairline, dividing the printed letterhead from the entered copy.
};
export const CHARTER_COPY_TOP = 72;

// Draw the letterhead into an overlay sheet. Returns the y the entered copy starts on.
function letterhead(ctx, r, name, subtitle) {
  const left = r.x + 16;
  const width = r.w - 32;
  const axis = r.x + r.w / 2;
  rule(ctx, left, r.y + MASTHEAD.ruleTop, width, C.inkBody, 3);
  textCenter(ctx, name, axis, r.y + MASTHEAD.name, C.inkBody, SIZE.masthead, FACE.display);
  rule(ctx, left, r.y + MASTHEAD.ruleUnder, width, C.inkBody, 2);
  rule(ctx, left, r.y + MASTHEAD.ruleUnderThin, width, C.inkBody, 1);
  textCenter(ctx, subtitle, axis, r.y + MASTHEAD.subtitle, C.inkSecondary, SIZE.title, FACE.display);
  rule(ctx, left, r.y + MASTHEAD.ruleFoot, width, C.inkRule, 1);
  return r.y + CHARTER_COPY_TOP;
}

// An overlay is a document laid on the desk, not a dialog box.
//
// `masthead`, when given, replaces the sheet's ordinary title band with the letterhead block above
// and demotes `title` to the subtitle inside it. Only the charter passes it: every other overlay is
// a form the player is already holding, and a form does not re-announce the game.
function overlayBox(ctx, view, title, masthead = null) {
  // §4.5 item 2, applied to the one surface that was still breaking it. This used to be
  // `fillStyle = 'rgba(6,6,8,0.82)'` across the finished frame: a translucent grey painted over
  // lit art, which is the exact technique the stack forbids. Now every pixel is stepped down its
  // OWN ramp, so the desk stays fibre, the manila stays manila, and the drawing behind the document
  // reads as a lit surface with the lamp turned down rather than as art behind glass.
  const f = view.facility;
  const key = `${view.overlay}|${f.cycle.number}|${f.status}|${sectionCache.sig}`;
  if (dimCache.key !== key || !dimCache.image) {
    const shot = ctx.getImageData(0, 0, SCREEN.w, SCREEN.h);
    darkenPixels(shot.data, 2.4, SCREEN.w);
    dimCache = { key, image: shot };
  }
  ctx.putImageData(dimCache.image, 0, 0);
  const r = { x: 76, y: 34, w: SCREEN.w - 152, h: SCREEN.h - 80 };
  // The sheet's cast shadow, taken from the dimmed backdrop rather than painted: the paper is
  // lying ON something, and what is under its edge is that thing, darker.
  const sh = ctx.getImageData(r.x + 3, r.y + r.h, r.w, 3);
  darkenPixels(sh.data, 1.6, r.w);
  ctx.putImageData(sh, r.x + 3, r.y + r.h);
  // SHEET_CALM: an overlay sheet is the one surface in the game carrying running prose, so its weave
  // composes quieter than the ledger's (scene.js carries the argument, including why the Bayer term
  // stays at full strength and only the two fbm terms come down). The sheet still has fibre,
  // unevenness and a lamp falling across it; what comes down is the tonal wander under a paragraph.
  const paper = composePaper(r, 'overlay', SHEET_CALM);
  const image = ctx.createImageData(paper.w, paper.h);
  image.data.set(paper.data);
  ctx.putImageData(image, r.x, r.y);
  if (masthead) {
    letterhead(ctx, r, masthead, title);
  } else {
    text(ctx, title, r.x + 16, r.y + 12, C.inkBody, SIZE.title, FACE.display);
    rule(ctx, r.x + 16, r.y + 28, r.w - 32, C.inkRule);
    rule(ctx, r.x + 16, r.y + 30, r.w - 32, C.inkRule);
  }
  return r;
}

function drawOverlay(ctx, view) {
  const f = view.facility;
  const bottom = (r) => r.y + r.h - 10;
  if (view.overlay === 'title') {
    // The title is a document too, because everything in this game is: the charter the post is held
    // under, laid on the desk like everything else. A game about paperwork should not open with a
    // logo floating in space — so the game's name is not a logo here, it is the MASTHEAD PRINTED ON
    // THE CHARTER (see letterhead() above), which is how an institution puts its name on a sheet.
    //
    // The copy is written as PARAGRAPHS and wrapped by the renderer. The first version hard-wrapped
    // each line by hand AND then passed it through wrap(), so every line that overran the column
    // was broken again and left a one-word orphan under it, and the last paragraph ran underneath
    // the controls. Text that is wrapped twice is wrapped wrong.
    const r = overlayBox(ctx, view, 'CHARTER OF APPOINTMENT', 'MATERIAL BREACH');
    let y = r.y + CHARTER_COPY_TOP;
    // The controls begin at 206; the copy must finish above them.
    const copyFloor = 198;
    // Three paragraphs that fit SIX lines above the controls. The first arrangement needed seven,
    // and the seventh was silently dropped by the wrap's floor — which cost the pitch its last and
    // most important sentence, the one that states the pacing law to a player who has never seen
    // the game. Copy that does not fit is copy that does not ship, and the line it takes out is
    // whichever one happens to be last.
    const charterParas = [
      'You are appointed facility manager of the premises overleaf.',
      'You do not adventure: you excavate, staff, requisition, pay wages and answer correspondence, then sign the cycle over and read what happened to your building while you were doing paperwork.',
      'Adventurers will raid you. They are the incident, not the opponent. Nothing here happens until you sign.',
    ];
    for (let i = 0; i < charterParas.length; i++) {
      const para = charterParas[i];
      y = wrap(ctx, para, r.x + 16, y, r.w - 32, C.inkCopy, SIZE.body, copyFloor);
      if (i < charterParas.length - 1) y += 6;
    }
    if (view.resumable && y + SIZE.body <= copyFloor) {
      text(ctx, `A tenure is in progress at cycle ${f.cycle.number}.`, r.x + 16, y, C.inkBody);
    }
    // B1/Q1: always draw the notice when it exists. The sheet is full — the charter's six
    // lines own everything above the controls, so a notice forced inside overdraws the copy.
    // It is a separate slip left on the desk BELOW the document, where nothing else draws.
    //
    // AND THE SLIP IS MADE OF PAPER, which it was not. Moving the notice out from under the
    // charter fixed the overdraw and left it set in stampInk — a PAPER ink — directly on the dark
    // desk. Measured on the built artifact at the moment this round was checked: 1.27:1 against the
    // desk under it, where this game's own floor is 4.5:1. It was legible the way a thing you
    // already know the wording of is legible. The palette has no red bright enough to fix by
    // recolouring, either: the brightest stamp step still only reaches 4.24:1 on the desk.
    //
    // So the slip becomes what its name already said it was. A notice left on a desk is a piece of
    // paper, and this renderer's standing answer to "light letterform on a busy dark ground" is to
    // print it on manila instead (the title block and the status strip both went the same way, for
    // the same reason). stampInk on paper is a pairing Gate 5 already measures.
    if (view.saveNotice) {
      const msg = `Save notice: ${view.saveNotice}`;
      const slipW = r.w - 16;
      const inner = slipW - 20;
      const top = r.y + r.h + 6;
      const slip = { x: r.x + 8, y: top, w: slipW, h: Math.min(measureWrap(ctx, msg, inner, SIZE.body) + 9, SCREEN.h - 4 - top) };
      paperStrip(ctx, slip, `saveslip:${slip.h}`);
      wrap(ctx, msg, slip.x + 10, slip.y + 5, inner, C.stampInk, SIZE.body, slip.y + slip.h - 2);
    }
  } else if (view.overlay === 'options') {
    const r = overlayBox(ctx, view, 'OPTIONS');
    wrap(
      ctx,
      'The sound may be silenced here or with M during play. The debug log is an exportable record of everything the facility surfaced, including any failure.',
      r.x + 16,
      r.y + 42,
      r.w - 32,
      C.inkCopy,
      SIZE.body,
      160,
    );
  } else if (view.overlay === 'provenance') {
    // The credits, where a player can actually read them. ATTRIBUTION has shipped inside the
    // artifact since M1, but only as an HTML comment: present, and invisible to anyone playing.
    // The cast pack is CC BY, which is a condition of use rather than a courtesy.
    //
    // Body lines are held to a MEASURED 69 characters in provenance.js and wrapped here as well, so
    // an overlong line becomes two lines rather than text running off the edge of the paper. It ran
    // off the paper on the first attempt, into the ledger beside it, because the width had been
    // estimated instead of measured.
    const r = overlayBox(ctx, view, PROVENANCE_TITLE);
    let y = r.y + 40;
    const floor = 274; // the Back control sits at 282
    for (const [style, line] of PROVENANCE) {
      if (!style) {
        y += 5;
        continue;
      }
      if (y + SIZE.body > floor) break;
      if (style === 'head') {
        text(ctx, line, r.x + 16, y, C.inkBody, SIZE.title, FACE.display);
        y += SIZE.title + 5;
      } else {
        y = wrap(ctx, line, r.x + 16, y, r.w - 32, C.inkCopy, SIZE.body, floor);
      }
    }
  } else if (view.overlay === 'orientation') {
    const r = overlayBox(ctx, view, 'ORIENTATION PACKET');
    let y = r.y + 40;
    for (const line of view.orientation || []) {
      if (!line) {
        y += 6;
        continue;
      }
      y = wrap(ctx, line, r.x + 16, y, r.w - 32, C.inkCopy, SIZE.body, bottom(r));
    }
  } else if (view.overlay === 'checklist') {
    const r = overlayBox(ctx, view, 'PRE-COMMIT CHECKLIST');
    const s = view.checklist;
    const left = r.x + 16;
    const right = r.x + r.w - 16;
    let y = r.y + 40;
    const rows = [
      ['Cycle', String(s.cycle)],
      ['Payroll due', `${s.payrollDue}, ${s.payrollOwed} g owed`],
      ['Open works orders', String(s.openOrders)],
      ['Unanswered notices', String(s.unansweredNotices)],
      ['Treasury', `${s.treasury} / ${s.capacity} g`],
      ['Defence', String(s.defense)],
      ['Cornerstone', `${s.cornerstone} / 100`],
    ];
    for (const [label, value] of rows) y = row(ctx, label, value, y, C.inkBody, left, right);
    for (const d of s.openOrdersDetail) y = wrap(ctx, d, left + 8, y, r.w - 40, C.inkCopy, SIZE.body, bottom(r));
    y += 6;
    y = wrap(ctx, `Intel. ${s.intel}`, left, y, r.w - 32, C.inkCopy, SIZE.body, bottom(r));
    y += 6;
    wrap(ctx, 'Signing over resolves the cycle. Nothing resolves until you sign.', left, y, r.w - 32, C.inkBody, SIZE.body, bottom(r));
  } else if (view.overlay === 'pause') {
    const r = overlayBox(ctx, view, 'PAUSED');
    let y = r.y + 40;
    const keys = [
      'Controls. The mouse is primary; the game is playable with the mouse alone.',
      '',
      'Click a button to act.  Arrows or WASD pan the section.',
      'F raise fortification.  Enter or Z sign over and confirm.  X cancel.',
      'Esc pause.  M mute.  L export debug log.',
    ];
    for (const k of keys) {
      if (!k) {
        y += 6;
        continue;
      }
      y = wrap(ctx, k, r.x + 16, y, r.w - 32, C.inkCopy, SIZE.body, bottom(r));
    }
  } else if (view.overlay === 'error') {
    const r = overlayBox(ctx, view, 'FACILITY ERROR SURFACE');
    let y = r.y + 40;
    y = wrap(ctx, 'An operation was surfaced as failed and not swallowed:', r.x + 16, y, r.w - 32, C.stampInk, SIZE.body, bottom(r));
    y += 6;
    y = wrap(ctx, view.errorMessage || 'unknown error', r.x + 16, y, r.w - 32, C.inkBody, SIZE.body, bottom(r));
    y += 6;
    wrap(ctx, 'Export the debug log for the full record.', r.x + 16, y, r.w - 32, C.inkCopy, SIZE.body, bottom(r));
  } else if (view.overlay === 'closed') {
    const r = overlayBox(ctx, view, 'TENURE CLOSED');
    const left = r.x + 16;
    const right = r.x + r.w - 16;
    let y = r.y + 40;
    const status = f.status === 'condemned' ? 'The premises are condemned.' : 'The facility is insolvent.';
    y = wrap(ctx, status, left, y, r.w - 32, C.inkBody, SIZE.body, bottom(r));
    y += 8;
    y = row(ctx, 'Cycles served', String(f.tenure.cyclesSurvived), y, C.inkBody, left, right);
    y = row(ctx, 'Lowest solvency recorded', `${f.tenure.lowestSolvency} g`, y, C.inkBody, left, right);
    y = row(ctx, 'Cornerstone at close', `${f.lossObject.condition} / 100`, y, C.inkBody, left, right);
    y += 8;
    wrap(ctx, 'The closing report is filed. No commendation attaches to the outcome.', left, y, r.w - 32, C.inkCopy, SIZE.body, bottom(r));
  }
}

// The single entry point. Draw one frame of the whole desk.
export function render(ctx, view) {
  // The ground of the whole picture. Everything else is laid ON this rather than over a fill.
  ctx.putImageData(deskSurface(ctx), 0, 0);
  drawCutaway(ctx, view);
  drawLedger(ctx, view);
  drawActionBar(ctx, view);

  // The overlay sheet goes down BEFORE the controls. computeButtons already returns only the
  // buttons belonging to the current overlay, so drawing them last puts them on top of the sheet
  // instead of underneath it.
  if (view.overlay && view.overlay !== null) drawOverlay(ctx, view);

  for (const b of computeButtons(view)) drawButton(ctx, b);
}

export const RENDER_INFO = { paydayEvery: CONFIG.payday.everyNCycles };

// The legibility floor, as data for Gate 5 (DESIGN-SEED §8.5). The minimum rose from 8px to 11px at
// M7a r2, because the type is now two pixel faces cut at 11px and nothing is drawn off their design
// size. The contrast half lives in palette.js as TEXT_PAIRS.
export const MIN_TEXT_PX = TYPE_MIN;
export const TEXT_PAIRS = PALETTE_TEXT_PAIRS;

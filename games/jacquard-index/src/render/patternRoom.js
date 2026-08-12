// THE JACQUARD INDEX — M4 pattern-room proof of concept.
//
// A composed shop-floor picture for the master index: limewashed mill wall, north-light
// window, iron conduit, working lamp, timber index cabinet, machined brass fittings, and
// eight physical pattern drawers. Everything is code-drawn into the native framebuffer.
// Material albedo is textured first; two light rigs are then composited over the room.

import { PALETTE } from '../gfx/palette.js';
import { bayer, hash2 } from '../gfx/dither.js';
import { drawText, measureText } from '../gfx/font.js';
import { drawBodyText, wrapBodyText, BODY_LINE_HEIGHT } from '../gfx/bodyFont.js';

export const PATTERN_ROOM_DRAWER_COLS = 4;

// Shelf teaching blurbs wrap in the readable body face (pixel font stays for stamps/HUD).
export function wrapPatternRoomText(text, maxWidth, _scale = 1, _tracking = 1) {
  return wrapBodyText(text, maxWidth);
}

export function hitTestPatternRoomShelf(fb, px, py, count = 8) {
  const l = patternRoomLayout(fb);
  for (let i = 0; i < count; i++) {
    const x = l.drawerX;
    const y = l.drawerTop + i * l.drawerH;
    const w = l.drawerW;
    const h = l.drawerH - 2;
    if (px >= x && px < x + w && py >= y && py < y + h) return i;
  }
  return -1;
}

export function hitTestPatternRoomCard(fb, px, py, cardCount) {
  const l = patternRoomDrawerLayout(fb);
  const cols = PATTERN_ROOM_DRAWER_COLS;
  const rows = Math.max(1, Math.ceil(cardCount / cols));
  const cellW = Math.floor(l.innerW / cols);
  const cellH = Math.floor(l.innerH / rows);
  for (let i = 0; i < cardCount; i++) {
    const cx = l.innerX + (i % cols) * cellW + 3;
    const cy = l.innerY + Math.floor(i / cols) * cellH + 3;
    const w = cellW - 6;
    const h = cellH - 6;
    if (px >= cx && px < cx + w && py >= cy && py < cy + h) return i;
  }
  return -1;
}

const ROOM = {
  plasterDeep: [45, 42, 34],
  plaster: [77, 71, 57],
  plasterLit: [104, 96, 75],
  timberDeep: [43, 29, 18],
  timber: [75, 51, 30],
  timberLit: [111, 78, 44],
  iron: [45, 45, 40],
  ironLit: [91, 88, 74],
  glass: [101, 126, 123],
  daylight: [206, 222, 207],
  lamp: [255, 218, 151],
};

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function smoothstep(a, b, value) {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function materialRect(fb, x, y, w, h, dark, light, seed = 0, grain = 12) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const bevel = 1 - ((px / Math.max(1, w - 1)) * 0.35 + (py / Math.max(1, h - 1)) * 0.65);
      const tone = mix(dark, light, bevel);
      const tooth = bayer(x + px, y + py) * grain;
      const fleck = (hash2(x + px + seed * 31, y + py - seed * 17) - 0.5) * grain * 0.55;
      fb.setPixel(x + px, y + py, tone[0] + tooth + fleck, tone[1] + tooth + fleck, tone[2] + tooth + fleck, 255);
    }
  }
}

function applyRoomLights(fb) {
  const warmX = fb.width * 0.62;
  const warmY = fb.height * 0.08;
  const warmR = fb.height * 0.95;
  const coolX = fb.width * 0.08;
  const coolY = fb.height * 0.40;
  const coolR = fb.width * 0.58;
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const wd = Math.hypot(x - warmX, (y - warmY) * 1.25);
      const warm = 1 - smoothstep(warmR * 0.12, warmR, wd);
      if (warm > 0) {
        const tooth = (hash2(x + 17, y + 71) - 0.5) * 5;
        fb.setPixel(x, y, ROOM.lamp[0] + tooth, ROOM.lamp[1] + tooth, ROOM.lamp[2] + tooth, 42 * warm);
      }
      const cd = Math.hypot((x - coolX) * 1.25, y - coolY);
      const cool = 1 - smoothstep(coolR * 0.08, coolR, cd);
      if (cool > 0) fb.setPixel(x, y, ROOM.daylight[0], ROOM.daylight[1], ROOM.daylight[2], 35 * cool);
    }
  }
  // The room corners remain practical shadow, keeping the cabinet as the lit subject.
  const maxR = Math.hypot(fb.width * 0.5, fb.height * 0.5);
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const d = Math.hypot(x - fb.width * 0.51, y - fb.height * 0.48);
      const shade = smoothstep(maxR * 0.63, maxR, d);
      if (shade > 0) fb.setPixel(x, y, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 105 * shade);
    }
  }
}

function drawWindow(fb, x, y, w, h) {
  fb.fillRect(x - 4, y - 4, w + 8, h + 8, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  materialRect(fb, x, y, w, h, ROOM.glass, ROOM.daylight, 9, 8);
  // Tall factory sash: structural muntins, not decorative trim.
  fb.fillRect(x + Math.floor(w / 2) - 2, y, 4, h, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  for (let gy = y + Math.floor(h / 3); gy < y + h; gy += Math.floor(h / 3)) {
    fb.fillRect(x, gy - 2, w, 4, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  }
  fb.strokeRect(x - 5, y - 5, w + 10, h + 10, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 180);
}

function drawConduit(fb, x, y, h) {
  fb.fillRect(x, y, 3, h, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  fb.vLine(x, y, h, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 150);
  for (let cy = y + 12; cy < y + h; cy += 52) {
    fb.fillRect(x - 2, cy, 7, 3, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
    fb.hLine(x - 1, cy, 5, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 160);
  }
}

function drawLamp(fb, cx) {
  fb.fillRect(cx - 1, 0, 3, 12, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  fb.fillRect(cx - 18, 10, 37, 3, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  // Shallow enamel reflector and its working strip.
  for (let i = 0; i < 7; i++) fb.hLine(cx - 18 + i * 2, 13 + i, 37 - i * 4, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 255);
  fb.fillRect(cx - 12, 18, 25, 2, ROOM.lamp[0], ROOM.lamp[1], ROOM.lamp[2], 255);
}

export function patternRoomLayout(fb) {
  const cabinetX = Math.round(fb.width * 0.145);
  const cabinetY = 25;
  const cabinetW = fb.width - cabinetX - 16;
  const cabinetH = fb.height - cabinetY - 28;
  const drawerX = cabinetX + 15;
  const drawerTop = cabinetY + 42;
  const drawerW = cabinetW - 30;
  const drawerH = Math.floor((cabinetH - 54) / 8);
  return { cabinetX, cabinetY, cabinetW, cabinetH, drawerX, drawerTop, drawerW, drawerH };
}

function drawRoomAlbedo(fb) {
  // Limewashed wall: worn, coarse, and laid in horizontal working courses.
  materialRect(fb, 0, 0, fb.width, fb.height, ROOM.plasterDeep, ROOM.plasterLit, 4, 15);
  for (let y = 34; y < fb.height - 30; y += 35) {
    fb.hLine(0, y, fb.width, ROOM.plasterDeep[0], ROOM.plasterDeep[1], ROOM.plasterDeep[2], 75);
  }
  drawWindow(fb, 18, 48, 54, 132);
  drawConduit(fb, 80, 18, 250);

  const l = patternRoomLayout(fb);
  // Cabinet shadow, timber carcass, and recessed bank behind the drawer faces.
  fb.fillRect(l.cabinetX + 7, l.cabinetY + 8, l.cabinetW, l.cabinetH, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 170);
  materialRect(fb, l.cabinetX, l.cabinetY, l.cabinetW, l.cabinetH, ROOM.timberDeep, ROOM.timberLit, 12, 16);
  fb.fillRect(l.drawerX - 5, l.drawerTop - 5, l.drawerW + 10, l.drawerH * 8 + 10, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);

  // Machined corner straps and square-cut fasteners.
  for (const sx of [l.cabinetX + 5, l.cabinetX + l.cabinetW - 9]) {
    fb.fillRect(sx, l.cabinetY + 5, 4, l.cabinetH - 10, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 220);
    for (let sy = l.cabinetY + 12; sy < l.cabinetY + l.cabinetH - 8; sy += 46) {
      fb.fillRect(sx + 1, sy, 2, 2, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 255);
    }
  }

  // Pattern cutter's bench and a steel straightedge in the foreground.
  const benchY = fb.height - 23;
  materialRect(fb, 0, benchY, fb.width, 23, ROOM.timberDeep, ROOM.timber, 27, 18);
  fb.hLine(0, benchY, fb.width, ROOM.timberLit[0], ROOM.timberLit[1], ROOM.timberLit[2], 230);
  fb.fillRect(22, benchY + 7, 58, 4, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 220);
  fb.hLine(22, benchY + 7, 58, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 180);
  for (let tx = 28; tx < 76; tx += 6) fb.vLine(tx, benchY + 7, 3, PALETTE.brassLit[0], PALETTE.brassLit[1], PALETTE.brassLit[2], 170);

  applyRoomLights(fb);
  drawLamp(fb, Math.round(fb.width * 0.63));
}

function drawCompactCabinet(fb, x, y, w, h, activeDrawer) {
  fb.fillRect(x + 5, y + 7, w, h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 190);
  materialRect(fb, x, y, w, h, ROOM.timberDeep, ROOM.timberLit, 118, 15);
  fb.fillRect(x + 8, y + 9, w - 16, h - 18, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);
  const drawerH = Math.floor((h - 20) / 8);
  for (let i = 0; i < 8; i++) {
    const pull = i === activeDrawer ? 6 : 0;
    const dx = x + 10 - pull;
    const dy = y + 11 + i * drawerH;
    const dw = w - 20 + pull;
    const dh = drawerH - 2;
    if (pull) fb.fillRect(dx + 5, dy + 5, dw + 2, dh, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 190);
    materialRect(fb, dx, dy, dw, dh, ROOM.timberDeep, ROOM.timber, 130 + i, 10);
    const edge = pull ? PALETTE.brassLit : PALETTE.brassDark;
    fb.strokeRect(dx, dy, dw, dh, edge[0], edge[1], edge[2], 255);
    fb.fillRect(dx + 6, dy + Math.max(3, Math.floor(dh / 2) - 2), 15, 5, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 255);
    fb.fillRect(dx + dw - 17, dy + Math.max(3, Math.floor(dh / 2) - 2), 10, 5, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  }
}

export function patternRoomWorkLayout(fb) {
  const frame = { x: 91, y: 25, w: fb.width - 192, h: fb.height - 50 };
  const board = { x: frame.x + 14, y: frame.y + 59, w: frame.w - 28, h: frame.h - 91 };
  return { frame, board, footerY: frame.y + frame.h - 16 };
}

export function drawPatternRoomRulePlate(fb, text) {
  if (!text) return fb;
  const l = patternRoomWorkLayout(fb);
  const rw = measureText(text, 1, 1);
  const rx = l.board.x + Math.floor((l.board.w - rw) / 2);
  fb.fillRect(rx - 6, l.board.y - 14, rw + 12, 12, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 255);
  fb.strokeRect(rx - 6, l.board.y - 14, rw + 12, 12, PALETTE.brass[0], PALETTE.brass[1], PALETTE.brass[2], 255);
  drawText(fb, rx, l.board.y - 12, text, PALETTE.linen, 1, 1);
  return fb;
}

// Shared M4 workbench surface. It is the same north-lit room and the same cabinet as the
// approved master-index frame, viewed with a pattern drawer pulled beside the cutter's
// working board. Scenes cache this expensive material/light composition and draw live marks
// over its recessed pattern-paper bed.
export function composePatternRoomWorkSurface(fb, {
  drawer = 0,
  title = 'PATTERN CARD',
  band = 'CERTIFIED  -  NO GUESSING',
  rule = '',
} = {}) {
  materialRect(fb, 0, 0, fb.width, fb.height, ROOM.plasterDeep, ROOM.plasterLit, 4, 15);
  for (let y = 34; y < fb.height - 24; y += 35) {
    fb.hLine(0, y, fb.width, ROOM.plasterDeep[0], ROOM.plasterDeep[1], ROOM.plasterDeep[2], 75);
  }
  drawWindow(fb, 14, 52, 54, 132);
  drawConduit(fb, 78, 18, 276);

  const l = patternRoomWorkLayout(fb);
  fb.fillRect(l.frame.x + 7, l.frame.y + 8, l.frame.w, l.frame.h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 190);
  materialRect(fb, l.frame.x, l.frame.y, l.frame.w, l.frame.h, ROOM.timberDeep, ROOM.timberLit, 104 + drawer, 16);
  fb.fillRect(l.frame.x + 9, l.frame.y + 40, l.frame.w - 18, l.frame.h - 65, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);
  materialRect(fb, l.board.x, l.board.y, l.board.w, l.board.h, PALETTE.manilaShade, PALETTE.manilaLit, 150 + drawer, 7);
  fb.strokeRect(l.board.x - 3, l.board.y - 3, l.board.w + 6, l.board.h + 6, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);

  // Maker's plate carries the card name and solver guarantee as furniture.
  const plateX = l.frame.x + 12;
  const plateY = l.frame.y + 8;
  const plateW = l.frame.w - 24;
  fb.fillRect(plateX, plateY, plateW, 24, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 245);
  fb.strokeRect(plateX, plateY, plateW, 24, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 255);
  drawText(fb, plateX + 8, plateY + 5, title, PALETTE.linen, 2, 1);
  drawText(fb, plateX + plateW - measureText(band, 1, 1) - 8, plateY + 8, band, PALETTE.brassLit, 1, 1);

  drawPatternRoomRulePlate(fb, rule);

  drawCompactCabinet(fb, fb.width - 92, 26, 76, fb.height - 53, drawer);
  const benchY = fb.height - 23;
  materialRect(fb, 0, benchY, fb.width, 23, ROOM.timberDeep, ROOM.timber, 27, 18);
  fb.hLine(0, benchY, fb.width, ROOM.timberLit[0], ROOM.timberLit[1], ROOM.timberLit[2], 230);

  // Recessed job ticket for controls: graphite stays legible instead of sinking into timber.
  fb.fillRect(l.frame.x + 12, l.footerY - 4, l.frame.w - 24, 15, PALETTE.manilaShade[0], PALETTE.manilaShade[1], PALETTE.manilaShade[2], 255);
  fb.strokeRect(l.frame.x + 12, l.footerY - 4, l.frame.w - 24, 15, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);

  applyRoomLights(fb);
  drawLamp(fb, Math.round(fb.width * 0.63));
  return l;
}

// Title cards lie on the same cutter's bench, with the exemplar's sash, conduit, lamp,
// and master cabinet still visible around the stock. This keeps the boot frame inside the
// pattern room instead of introducing a separate abstract title idiom.
export function composePatternRoomTitleSurface(fb) {
  materialRect(fb, 0, 0, fb.width, fb.height, ROOM.plasterDeep, ROOM.plasterLit, 4, 15);
  for (let y = 34; y < fb.height - 24; y += 35) {
    fb.hLine(0, y, fb.width, ROOM.plasterDeep[0], ROOM.plasterDeep[1], ROOM.plasterDeep[2], 75);
  }
  drawWindow(fb, 14, 48, 54, 136);
  drawConduit(fb, 77, 18, 278);
  drawCompactCabinet(fb, fb.width - 76, 27, 61, fb.height - 54, 0);
  const benchY = fb.height - 27;
  materialRect(fb, 0, benchY, fb.width, 27, ROOM.timberDeep, ROOM.timber, 27, 18);
  fb.hLine(0, benchY, fb.width, ROOM.timberLit[0], ROOM.timberLit[1], ROOM.timberLit[2], 230);
  applyRoomLights(fb);
  drawLamp(fb, Math.round(fb.width * 0.63));
  return fb;
}

function drawDrawer(fb, l, drawer, index, selected) {
  const pull = selected ? 6 : 0;
  const x = l.drawerX - pull;
  const y = l.drawerTop + index * l.drawerH;
  const w = l.drawerW + pull;
  const h = l.drawerH - 2;
  if (selected) {
    fb.fillRect(x + 5, y + 5, w + 3, h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 190);
  }
  const base = drawer.unlocked ? PALETTE.manilaShade : ROOM.timberDeep;
  const top = drawer.unlocked ? PALETTE.manilaLit : ROOM.timber;
  materialRect(fb, x, y, w, h, base, top, 40 + index, drawer.unlocked ? 8 : 12);

  const border = selected ? PALETTE.brassLit : (drawer.unlocked ? ROOM.timberLit : PALETTE.brassDark);
  fb.strokeRect(x, y, w, h, border[0], border[1], border[2], 255);
  fb.hLine(x + 1, y + 1, w - 2, top[0], top[1], top[2], 150);

  // Brass catalogue plate and a recessed iron finger pull.
  const plateX = x + 7;
  const plateY = y + Math.floor((h - 15) / 2);
  const plate = drawer.unlocked ? PALETTE.brass : PALETTE.brassDark;
  fb.fillRect(plateX, plateY, 30, 15, plate[0], plate[1], plate[2], 255);
  fb.hLine(plateX, plateY, 30, PALETTE.brassLit[0], PALETTE.brassLit[1], PALETTE.brassLit[2], 210);
  fb.strokeRect(plateX, plateY, 30, 15, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 255);
  const number = String(drawer.order);
  drawText(fb, plateX + Math.floor((30 - measureText(number, 1, 1)) / 2), plateY + 4, number, PALETTE.oilDeep, 1, 1);

  const pullX = x + w - 38;
  fb.fillRect(pullX, y + 7, 22, h - 14, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  fb.hLine(pullX + 2, y + 8, 18, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 190);
  fb.fillRect(pullX + 5, y + 11, 12, Math.max(2, h - 22), PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 255);

  const labelX = x + 47;
  const nameColor = drawer.unlocked ? PALETTE.ink : PALETTE.manilaShade;
  const detailColor = drawer.unlocked ? PALETTE.inkSoft : PALETTE.brassDark;
  drawText(fb, labelX, y + 4, drawer.name, nameColor, 1, 1);
  const statusX = pullX - measureText(drawer.status, 1, 1) - 10;
  const statusColor = selected && drawer.unlocked ? PALETTE.ink
    : (selected ? PALETTE.brassLit : detailColor);
  drawText(fb, statusX, selected ? y + 4 : y + Math.floor((h - 7) / 2), drawer.status, statusColor, 1, 1);
  if (selected && drawer.blurb) {
    const lines = wrapPatternRoomText(drawer.blurb, pullX - labelX - 9);
    for (let i = 0; i < Math.min(2, lines.length); i++) {
      drawBodyText(fb, labelX, y + 12 + i * (BODY_LINE_HEIGHT - 2), lines[i], detailColor);
    }
  } else {
    drawText(fb, labelX, y + 14, drawer.tagline, detailColor, 1, 1);
  }
}

function drawCardSlip(fb, x, y, w, h, card, selected) {
  const lift = selected ? 4 : 0;
  y -= lift;
  if (selected) {
    fb.fillRect(x + 4, y + 6, w, h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 190);
  }
  materialRect(
    fb, x, y, w, h,
    card.woven ? PALETTE.manilaShade : [148, 130, 96],
    card.woven ? PALETTE.manilaLit : PALETTE.manila,
    90 + card.index, 7,
  );
  const edge = selected ? PALETTE.brassLit : ROOM.timberDeep;
  fb.strokeRect(x, y, w, h, edge[0], edge[1], edge[2], 255);
  fb.hLine(x + 1, y + 1, w - 2, PALETTE.manilaLit[0], PALETTE.manilaLit[1], PALETTE.manilaLit[2], 160);

  // A woven entry is a real punched card slotted into the master index.
  if (card.woven) {
    for (let hx = x + 8; hx < x + w - 5; hx += 7) {
      fb.fillRect(hx, y + 5, 2, 2, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 235);
      fb.setPixel(hx + 1, y + 6, PALETTE.manilaLit[0], PALETTE.manilaLit[1], PALETTE.manilaLit[2], 100);
    }
  }

  const name = card.name.length > 14 ? card.name.slice(0, 14) : card.name;
  drawText(fb, x + 6, y + 14, name, PALETTE.ink, 1, 1);
  drawText(fb, x + 6, y + h - 11, card.detail, PALETTE.inkSoft, 1, 1);
  const status = card.woven ? 'WOVEN' : '- - -';
  drawText(
    fb, x + w - measureText(status, 1, 1) - 6, y + h - 11, status,
    card.woven ? PALETTE.brassDark : PALETTE.inkSoft, 1, 1,
  );
}

export function patternRoomDrawerLayout(fb) {
  const x = Math.round(fb.width * 0.145);
  const y = 61;
  const w = fb.width - x - 16;
  const h = fb.height - y - 27;
  // Two body-font lines + padding (readable teaching ticket).
  const blurb = { x: x + 17, y: y + 32, w: w - 34, h: 30 };
  return {
    x, y, w, h, blurb,
    innerX: x + 13, innerY: y + 68, innerW: w - 26, innerH: h - 86,
  };
}

// The selected cabinet drawer pulled fully onto the cutter's bench. The closed bank stays
// visible behind it, so this is a physical state of the approved exemplar, not a new menu.
export function composePatternRoomDrawer(fb, drawers, shelfIndex, totalWoven, shelf, cards, selected) {
  composePatternRoomIndex(fb, drawers, shelfIndex, totalWoven);
  const l = patternRoomDrawerLayout(fb);

  fb.fillRect(l.x + 8, l.y + 9, l.w, l.h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 205);
  materialRect(fb, l.x, l.y, l.w, l.h, ROOM.timberDeep, ROOM.timberLit, 63 + shelf.order, 15);
  fb.strokeRect(l.x, l.y, l.w, l.h, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  fb.fillRect(l.innerX - 4, l.innerY - 4, l.innerW + 8, l.innerH + 8, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);

  // Catalogue plate fixed to the drawer's back rail.
  const plateX = l.x + 14;
  const plateY = l.y + 8;
  const plateW = l.w - 28;
  fb.fillRect(plateX, plateY, plateW, 20, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 245);
  fb.strokeRect(plateX, plateY, plateW, 20, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 255);
  drawText(fb, plateX + 8, plateY + 6, `${shelf.order}  ${shelf.name}`, PALETTE.linen, 1, 1);
  const count = `${shelf.woven} / ${cards.length} WOVEN`;
  drawText(fb, plateX + plateW - measureText(count, 1, 1) - 8, plateY + 6, count, PALETTE.brassLit, 1, 1);

  // The shelf's authored house voice is a fixed job ticket on the open drawer. It is
  // visible before any card opens; THE LOOM's ticket is consequently the base tutorial.
  fb.fillRect(l.blurb.x, l.blurb.y, l.blurb.w, l.blurb.h, PALETTE.manilaShade[0], PALETTE.manilaShade[1], PALETTE.manilaShade[2], 255);
  fb.strokeRect(l.blurb.x, l.blurb.y, l.blurb.w, l.blurb.h, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);
  const blurbLines = wrapPatternRoomText(shelf.blurb, l.blurb.w - 12);
  for (let i = 0; i < Math.min(2, blurbLines.length); i++) {
    drawBodyText(fb, l.blurb.x + 6, l.blurb.y + 4 + i * (BODY_LINE_HEIGHT - 1), blurbLines[i], PALETTE.ink);
  }

  const cols = PATTERN_ROOM_DRAWER_COLS;
  const rows = Math.max(1, Math.ceil(cards.length / cols));
  const cellW = Math.floor(l.innerW / cols);
  const cellH = Math.floor(l.innerH / rows);
  for (let i = 0; i < cards.length; i++) {
    const cx = l.innerX + (i % cols) * cellW + 3;
    const cy = l.innerY + Math.floor(i / cols) * cellH + 3;
    drawCardSlip(fb, cx, cy, cellW - 6, cellH - 6, { ...cards[i], index: i }, i === selected);
  }

  // The drawer front/lip remains visible below the cards, with its machined pull.
  const lipY = l.y + l.h - 18;
  materialRect(fb, l.x + 5, lipY, l.w - 10, 15, ROOM.timberDeep, ROOM.timber, 72, 12);
  fb.hLine(l.x + 6, lipY, l.w - 12, ROOM.timberLit[0], ROOM.timberLit[1], ROOM.timberLit[2], 210);
  fb.fillRect(l.x + Math.floor(l.w / 2) - 18, lipY + 4, 36, 7, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 255);
  fb.hLine(l.x + Math.floor(l.w / 2) - 15, lipY + 5, 30, ROOM.ironLit[0], ROOM.ironLit[1], ROOM.ironLit[2], 180);

  const instruction = 'CLICK OR ARROWS SELECT   ENTER OPEN   ESC CLOSE';
  const tw = measureText(instruction, 1, 1);
  const tx = fb.width - tw - 18;
  const ty = fb.height - 16;
  fb.fillRect(tx - 7, ty - 4, tw + 14, 15, PALETTE.manilaShade[0], PALETTE.manilaShade[1], PALETTE.manilaShade[2], 245);
  fb.strokeRect(tx - 7, ty - 4, tw + 14, 15, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);
  drawText(fb, tx, ty, instruction, PALETTE.ink, 1, 1);
  return fb;
}

export function composePatternRoomIndex(fb, drawers, selected, totalWoven) {
  if (drawers.length !== 8) throw new Error(`pattern-room cabinet requires 8 drawers, got ${drawers.length}`);
  drawRoomAlbedo(fb);
  const l = patternRoomLayout(fb);

  // Cabinet maker's header plate: the title is part of the furniture, not a HUD bar.
  const plateX = l.cabinetX + 18;
  const plateY = l.cabinetY + 9;
  const plateW = l.cabinetW - 36;
  fb.fillRect(plateX, plateY, plateW, 24, ROOM.iron[0], ROOM.iron[1], ROOM.iron[2], 235);
  fb.strokeRect(plateX, plateY, plateW, 24, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 255);
  drawText(fb, plateX + 9, plateY + 5, 'THE JACQUARD INDEX', PALETTE.linen, 2, 1);
  const count = `${totalWoven} WOVEN`;
  drawText(fb, plateX + plateW - measureText(count, 1, 1) - 8, plateY + 8, count, PALETTE.brassLit, 1, 1);

  drawers.forEach((drawer, i) => drawDrawer(fb, l, drawer, i, i === selected));

  // Instruction is stamped on a narrow job ticket resting on the bench.
  const instruction = 'CLICK OR ARROWS SELECT   ENTER OPEN DRAWER';
  const tw = measureText(instruction, 1, 1);
  const tx = fb.width - tw - 18;
  const ty = fb.height - 16;
  fb.fillRect(tx - 7, ty - 4, tw + 14, 15, PALETTE.manilaShade[0], PALETTE.manilaShade[1], PALETTE.manilaShade[2], 245);
  fb.strokeRect(tx - 7, ty - 4, tw + 14, 15, ROOM.timberDeep[0], ROOM.timberDeep[1], ROOM.timberDeep[2], 255);
  drawText(fb, tx, ty, instruction, PALETTE.ink, 1, 1);
  return fb;
}

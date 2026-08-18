// THE JACQUARD INDEX — the title frame, composed as a picture (hard-rule 3d).
//
// The scene: the master index card on the pattern cutter's bench inside the approved
// north-lit pattern room. The exemplar's sash, conduit, suspended lamp, master cabinet,
// composited working-light rigs, and timber bench remain visible around a manila punched
// card ruled as warp/weft paper. No placeholder art: every mark is code-drawn and in-register.
//
// Pure: composeTitle(fb) is deterministic and draws the static picture (cached once by
// the boot shim). drawPrompt(fb, on) draws only the blinking call-to-action, cheap
// enough to run per frame. Layout derives from fb.width/height, so it holds at any
// native resolution.

import { PALETTE } from '../gfx/palette.js';
import { bayer, hash2 } from '../gfx/dither.js';
import { drawTextCentered, measureText, textHeight, fitText } from '../gfx/font.js';
import { composePatternRoomTitleSurface } from '../render/patternRoom.js';

// Invented house name (clean-room, our own expression) — a functional mill-town name;
// "reed" is the loom part that beats the weft. Operator may rename (ratify note).
export const HOUSE_NAME = 'REEDMOOR MILL';

function fillDisc(fb, cx, cy, r, color, a = 255) {
  const r2 = r * r;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r2) fb.setPixel(cx + x, cy + y, color[0], color[1], color[2], a);
    }
  }
}

// Manila card with a toothed dither surface and a soft bevel (lit top-left, shaded
// bottom-right) so the stock reads as physical paper, not a rectangle.
function drawCard(fb, x, y, w, h) {
  const base = PALETTE.manila;
  const lit = PALETTE.manilaLit;
  const shade = PALETTE.manilaShade;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // Bevel: interpolate lit->shade across the diagonal.
      const bev = (px / w + py / h) * 0.5; // 0 (top-left) .. 1 (bottom-right)
      const tooth = bayer(x + px, y + py) * 7;
      const grain = (hash2(x + px, y + py) - 0.5) * 5;
      const r = base[0] + (lit[0] - shade[0]) * (0.5 - bev) + tooth + grain;
      const g = base[1] + (lit[1] - shade[1]) * (0.5 - bev) + tooth + grain;
      const b = base[2] + (lit[2] - shade[2]) * (0.5 - bev) + tooth + grain;
      fb.setPixel(x + px, y + py, r, g, b, 255);
    }
  }
  // Card edge and a drop of shadow on the table beneath it.
  fb.fillRect(x + 3, y + h, w, 3, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 120);
  fb.strokeRect(x, y, w, h, PALETTE.manilaShade[0], PALETTE.manilaShade[1], PALETTE.manilaShade[2]);
}

// Warp/weft ruling: faint hairlines every `minor` px, stronger every `major` px,
// clipped to the drafting area. Kept low-alpha so stamped text stays legible.
function drawGrid(fb, x, y, w, h, minor = 8, major = 32) {
  const gl = PALETTE.gridLine;
  const gm = PALETTE.gridMajor;
  for (let gx = 0; gx <= w; gx += minor) {
    const major_ = gx % major === 0;
    const c = major_ ? gm : gl;
    fb.vLine(x + gx, y, h, c[0], c[1], c[2], major_ ? 110 : 60);
  }
  for (let gy = 0; gy <= h; gy += minor) {
    const major_ = gy % major === 0;
    const c = major_ ? gm : gl;
    fb.hLine(x, y + gy, w, c[0], c[1], c[2], major_ ? 110 : 60);
  }
}

// A row of brass index tabs standing up along the top of the card — the master index
// motif. Each tab is a beveled brass block with a dark label slot.
function drawIndexTabs(fb, cardX, cardY, cardW, count = 8) {
  const gap = 4;
  const tabW = Math.floor((cardW - gap * (count - 1)) / count);
  const tabH = 12;
  for (let i = 0; i < count; i++) {
    const tx = cardX + i * (tabW + gap);
    const ty = cardY - tabH + 2;
    fb.fillRect(tx, ty, tabW, tabH, PALETTE.brass[0], PALETTE.brass[1], PALETTE.brass[2]);
    fb.fillRect(tx, ty, tabW, 2, PALETTE.brassLit[0], PALETTE.brassLit[1], PALETTE.brassLit[2]);
    fb.fillRect(tx, ty + tabH - 2, tabW, 2, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2]);
    // Label slot.
    fb.fillRect(tx + 3, ty + 4, tabW - 6, 4, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 150);
  }
}

// Punch holes down the left margin — the punched pattern card itself. Each is a dark
// disc with a lit lower rim so it reads as a real hole in the stock.
function drawPunchColumn(fb, x, y0, y1, spacing = 18) {
  for (let cy = y0; cy <= y1; cy += spacing) {
    fillDisc(fb, x, cy, 3, PALETTE.oilDeep, 220);
    fillDisc(fb, x + 1, cy + 1, 2, PALETTE.manilaLit, 90); // rim catch-light
  }
}

// Card geometry, shared by static compose and the prompt pass.
export function titleLayout(fb) {
  const cardX = Math.round(fb.width * 0.12);
  const cardY = Math.round(fb.height * 0.18);
  const cardW = fb.width - cardX * 2;
  const cardH = Math.round(fb.height * 0.64);
  return { cardX, cardY, cardW, cardH };
}

export function composeTitle(fb) {
  composePatternRoomTitleSurface(fb);

  const { cardX, cardY, cardW, cardH } = titleLayout(fb);
  drawIndexTabs(fb, cardX, cardY, cardW);
  drawCard(fb, cardX, cardY, cardW, cardH);

  // Drafting area inside a functional ink frame, ruled as pattern paper.
  const pad = 12;
  const daX = cardX + pad, daY = cardY + pad;
  const daW = cardW - pad * 2, daH = cardH - pad * 2;
  drawGrid(fb, daX, daY, daW, daH);
  fb.strokeRect(daX, daY, daW, daH, PALETTE.inkSoft[0], PALETTE.inkSoft[1], PALETTE.inkSoft[2], 180);
  drawPunchColumn(fb, daX + 8, daY + 12, daY + daH - 12);

  // Title block, stamped in graphite, centered on the card.
  // Hero size tracks card height so half-res proof frames still read as manila stock.
  const hero = cardH < 160 ? 3 : (cardH < 210 ? 4 : 5);
  const sub = hero >= 4 ? 2 : 1;
  const cx = cardX, cw = cardW;
  let ty = cardY + Math.round(cardH * 0.10);
  drawTextCentered(fb, cx, cw, ty, 'THE', PALETTE.inkSoft, sub, 1);
  ty += textHeight(sub) + 2;
  drawTextCentered(fb, cx, cw, ty, 'JACQUARD', PALETTE.ink, hero, 1);
  ty += textHeight(hero) + 2;
  drawTextCentered(fb, cx, cw, ty, 'INDEX', PALETTE.ink, hero, 1);
  ty += textHeight(hero) + 8;
  drawTextCentered(fb, cx, cw, ty, `PATTERN LIBRARY OF ${HOUSE_NAME}`, PALETTE.inkSoft, 1, 1);
  ty += textHeight(1) + 4;
  drawTextCentered(fb, cx, cw, ty, 'EST. 1889   -   NO GUESSING, PROVED', PALETTE.inkSoft, 1, 1);
  return fb;
}

// The blinking call-to-action, drawn over the lower drafting area. `on` toggles it.
// `hot` brightens the brass plate for mouse hover affordance.
export function titlePromptRect(fb) {
  const { cardX, cardY, cardW, cardH } = titleLayout(fb);
  // Scale 1 (9px) keeps the CTA on the card; scale 2 overflows the manila stock.
  const text = 'CLICK OR PRESS ENTER TO OPEN THE INDEX';
  const scale = 1;
  const th = textHeight(scale);
  const y = cardY + cardH - (th + 16);
  const w = measureText(text, scale, 1);
  const px = cardX + Math.round((cardW - w) / 2) - 8;
  return { x: px, y: y - 5, w: w + 16, h: th + 10, text, textY: y, scale };
}

export function hitTestTitlePrompt(fb, px, py) {
  const r = titlePromptRect(fb);
  // Whole master card is the activate target; prompt is the hover chrome.
  const { cardX, cardY, cardW, cardH } = titleLayout(fb);
  return px >= cardX && px < cardX + cardW && py >= cardY && py < cardY + cardH;
}

export function drawPrompt(fb, on, hot = false) {
  const r = titlePromptRect(fb);
  if (!on && !hot) return;
  const plate = hot ? PALETTE.brass : PALETTE.brassDark;
  const edge = hot ? PALETTE.brassLit : PALETTE.brassLit;
  // Opaque: at alpha 200 the pale card showed through and lifted the plate to
  // [135, 110, 61], dropping the call-to-action's measured contrast to 3.36:1. A brass
  // plate is not translucent anyway; solid brass restores the full 4.27:1.
  fb.fillRect(r.x, r.y, r.w, r.h, plate[0], plate[1], plate[2], 255);
  fb.strokeRect(r.x, r.y, r.w, r.h, edge[0], edge[1], edge[2]);
  const { cardX, cardW } = titleLayout(fb);
  drawTextCentered(fb, cardX, cardW, r.textY, r.text, PALETTE.linen, r.scale || 1, 1);
}

export function titleChoiceRects(fb) {
  const { cardX, cardY, cardW, cardH } = titleLayout(fb);
  const gap = 8;
  const w = Math.floor((cardW - 40 - gap) / 2);
  const h = textHeight(1) + 10;
  const y = cardY + cardH - h - 10;
  return [
    { x: cardX + 20, y, w, h, text: 'CONTINUE SAVED WORK' },
    { x: cardX + 20 + w + gap, y, w, h, text: 'NEW INDEX' },
  ];
}

export function hitTestTitleChoice(fb, px, py) {
  return titleChoiceRects(fb).findIndex((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
}

export function drawSaveChoice(fb, selected = 0, hot = -1) {
  const rects = titleChoiceRects(fb);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const on = i === selected || i === hot;
    const plate = on ? PALETTE.brass : PALETTE.brassDark;
    fb.fillRect(r.x, r.y, r.w, r.h, plate[0], plate[1], plate[2], 230);
    fb.strokeRect(r.x, r.y, r.w, r.h, PALETTE.brassLit[0], PALETTE.brassLit[1], PALETTE.brassLit[2]);
    drawTextCentered(fb, r.x, r.w, r.y + 5, r.text, PALETTE.linen, 1, 1);
  }
}

export function drawSaveNotice(fb, notice) {
  if (!notice) return;
  const { cardX, cardY, cardW, cardH } = titleLayout(fb);
  const y = cardY + cardH - 46;
  fb.fillRect(cardX + 12, y - 4, cardW - 24, 17, PALETTE.madder[0], PALETTE.madder[1], PALETTE.madder[2], 225);
  fb.strokeRect(cardX + 12, y - 4, cardW - 24, 17, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2]);
  drawTextCentered(fb, cardX + 12, cardW - 24, y, fitText(notice, cardW - 36, 1, 1), PALETTE.linen, 1, 1);
}

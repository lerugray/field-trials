// overlays.js — overlay and menu chrome painted into the native art plate; their
// typography is queued for the registered display-resolution period faces.
//
// The chrome remains one dithered lithograph press with the world behind it, while the
// type is deliberately typeset at its real final size like ink laid over that plate.
//
// The language is not invented here; it is inherited, and the inheritance is the
// point:
//   - the CARD and the poster FRAME are px.js's shared chrome, the same furniture the
//     title card and the HUD are built from,
//   - headings are the wordmark's treatment at a smaller size: an ink cast shadow
//     under a face that ramps down its own height with a lit top edge,
//   - key hints are spelled in words ("LEFT / RIGHT"), exactly as the title card's
//     controls panel already spells them — we have no arrow glyphs and inventing a
//     private symbol set would read as a different game,
//   - ticket stubs, engraved rules with a centre diamond, scalloped fabric and
//     normal-shaded discs are all lifted from surfaces that already shipped.
// Every screen ground is a LIT gradient with paper tooth and a vignette rather than a
// flat fill, because flat fill is the one thing the ratified bar rules out.
//
// Pure draw: every function takes a Painter and plain data. No `window`, no ctx, no
// sim state — so `node --test` renders all thirteen headless and can assert on the
// pixels. The one exception is the error banner, which owns its own small buffer
// because it deliberately lives OUTSIDE the letterboxed play area.

import { NATIVE, NativeScreen, P, P as PAL, R, rampAt, clamp, lerp, shade, fbm, t3, t5, t5r, t3c, t5c, t5s, t5big, t5bigFn, w5big, w3, w5, panel, posterFrame, safeText, Painter } from './px.js';
import { nativeScreen } from './game.js';
import { BODY_FONT_FAMILY } from './fontData.js';

const CX = 240;                    // the native buffer's centre line

// Layout constants the TITLE card constrains. POPINJAY is set at scale 4 and its
// final letter reaches x=336, so the record cards start clear of it — exported so a
// test can assert the clearance instead of a later session rediscovering it by
// printing a panel over the wordmark.
export const LAYOUT = { recordX: 340, recordW: 128, bandTop: 96,
  rehearsalY: 24, rehearsalH: 30,
  noticeY: 56, noticeH: 22, noticeW: 220, noticeRight: 8, noticeAlpha: 0.58 };

// ---------------------------------------------------------------- shared idiom

// Present the finished buffer. Every overlay paints into the shared buffer and the
// app presents ONCE at the end of the frame, so a transition can composite over the
// complete picture rather than over a half-drawn one.
export function presentFrame(ctx, w, h, dx = 0, dy = 0) { return nativeScreen().present(ctx, w, h, dx, dy); }

// Push a live frame back so an overlay can sit in front of it, with the corners
// falling away faster than the middle (the same shape as the vignette every vista
// already wears).
export function scrim(p, amt, col) {
  for (let y = 0; y < p.h; y++) {
    const dy = (y / p.h - 0.5) * 2;
    for (let x = 0; x < p.w; x++) {
      const dx = (x / p.w - 0.5) * 2;
      const d = Math.sqrt(dx * dx * 0.85 + dy * dy);
      p.mul(x, y, col || '#17110c', clamp(amt * (0.82 + d * 0.30), 0, 1));
    }
  }
  return p;
}

// A printed ground: a lit gradient through one of the palette ramps, the lithograph
// paper tooth over it, and an aged vignette. Never a flat fill.
const GROUND_SEED = { options: 4101, trunk: 4102, tourmap: 4103, draft: 4104, scorecard: 4105 };
function posterGround(p, ramp, seed, t0, t1, tooth, vig, vigCol) {
  p.grad(0, 0, p.w, p.h, ramp, t0, t1);
  p.paper(seed, tooth === undefined ? 0.10 : tooth);
  p.vignette(vig === undefined ? 0.55 : vig, vigCol);
  return p;
}

// A heading in the wordmark's treatment: an ink cast shadow, then a face that ramps
// down its own height with a lit top edge, so display type is lit metal rather than
// a coloured fill.
function heading(p, s, cx, y, scale, ramp) {
  const x = Math.round(cx - w5big(s, scale) / 2);
  t5big(p, s, x + 1, y + 2, scale, '#14100c', 0.55);
  t5bigFn(p, s, x, y, scale, (px, py, u, v) => rampAt(ramp, clamp(0.64 - v * 0.26 + (v < 0.18 ? 0.26 : 0), 0, 1), px, py));
  return x;
}
// The same heading where the whole card is fading (the centerpiece beat) — a ramped
// face cannot carry an alpha, so this one is flat and dropped.
function headingA(p, s, cx, y, scale, col, a) {
  const x = Math.round(cx - w5big(s, scale) / 2);
  t5big(p, s, x + 1, y + 2, scale, '#14100c', 0.55 * a);
  t5big(p, s, x, y, scale, col, a);
  return x;
}

// An engraved rule with a centre diamond — the HUD divider turned on its side.
function rule(p, x0, x1, y, col, a) {
  const c = col || P.gd2, al = a === undefined ? 1 : a;
  p.hline(x0, x1, y, c, 0.55 * al);
  p.hline(x0, x1, y + 1, P.ink, 0.28 * al);
  const mx = Math.round((x0 + x1) / 2);
  p.px(mx, y - 1, P.gd4, al); p.px(mx - 1, y, P.gd4, al); p.px(mx + 1, y, P.gd4, al); p.px(mx, y + 1, P.gd4, al);
  p.px(mx, y, P.gd5, al);
  return p;
}

// Leader dots between a label and its value — the printed-programme device that stops
// a wide two-column row from reading as two unrelated things.
function leaders(p, x0, x1, y, col, a) {
  for (let x = x0; x <= x1; x += 4) p.px(x, y, col || P.ink, a === undefined ? 0.42 : a);
  return p;
}

// A prize-ticket stub — the HUD's, so a ticket is the same object everywhere.
function ticketIcon(p, x, y, a) {
  p.frect(x, y, 9, 6, P.gd3, a); p.rect(x, y, 9, 6, P.gd1, (a === undefined ? 1 : a) * 0.9);
  p.hline(x + 1, x + 7, y, P.gd5, (a === undefined ? 1 : a) * 0.7); p.px(x + 4, y + 3, P.rd2, a);
  return x + 11;
}

// A five-point star, for a victory mark.
function starIcon(p, cx, cy, col, a) {
  p.px(cx, cy - 2, col, a);
  p.hline(cx - 2, cx + 2, cy - 1, col, a);
  p.hline(cx - 1, cx + 1, cy, col, a);
  p.px(cx - 2, cy + 1, col, a); p.px(cx + 2, cy + 1, col, a);
  return cx + 3;
}

// A solid chevron marking the adjustable value on a selected menu row.
function chevron(p, x, y, dir, col, a) {
  for (let j = 0; j < 5; j++) {
    const k = j < 3 ? j : 4 - j;
    p.hline(dir > 0 ? x : x + 2 - k, dir > 0 ? x + k : x + 2, y + j, col, a);
  }
  return p;
}

// A pennanted band across a live frame — the shape every in-play announcement takes.
// The edges dither away rather than ending on a hard line, and the bottom rule wears
// the same pennants as the HUD valance so an announcement is unmistakably POPINJAY.
function band(p, y0, hgt, amt, a, pennants) {
  a = a === undefined ? 1 : a;
  for (let y = y0; y < y0 + hgt; y++) {
    const e = Math.min(y - y0, y0 + hgt - 1 - y);
    const f = e < 5 ? (e + 1) / 6 : 1;
    for (let x = 0; x < p.w; x++) p.mul(x, y, '#14100c', amt * f * a);
  }
  p.hline(0, p.w - 1, y0, P.gd2, 0.55 * a);
  p.hline(0, p.w - 1, y0 + 1, P.ink, 0.35 * a);
  p.hline(0, p.w - 1, y0 + hgt - 1, P.gd2, 0.55 * a);
  if (pennants) {
    const ramps = [R.teal, R.paper, R.gold, R.rust];
    let i = 0;
    for (let cx = 4; cx < p.w; cx += 16, i++) {
      const ri = ramps[i % 4];
      for (let j = 0; j < 5; j++) {
        const half = 4 - j;
        for (let k = -half; k <= half; k++) {
          p.px(cx + k, y0 + hgt + j, rampAt(ri, clamp(0.70 - (k / 4.5) * 0.26 - (j / 5) * 0.24, 0, 1), cx + k, y0 + hgt + j), a);
        }
      }
      p.px(cx, y0 + hgt + 5, ri[0], 0.75 * a);
    }
  }
  return p;
}

// A swallow-tailed ribbon — a call to action that is not a paper card.
function ribbon(p, x, y, w, h, ramp, a) {
  a = a === undefined ? 1 : a;
  const tail = Math.round(h * 0.45);
  for (const s of [-1, 1]) {
    const bx = s < 0 ? x : x + w - 1;
    p.fpoly([[bx, y], [bx + s * tail, y + Math.round(h / 2)], [bx, y + h - 1]], ramp[1], 0.95 * a);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    p.px(x + i, y + j, rampAt(ramp, clamp(0.66 - (j / h) * 0.30, 0, 1), x + i, y + j), a);
  }
  p.rect(x, y, w, h, P.ink, 0.8 * a);
  p.hline(x + 1, x + w - 2, y + 1, ramp[5], 0.45 * a);
  for (let i = 0; i < w; i++) p.mul(x + i + 2, y + h, '#1a1208', 0.28 * a);
  return p;
}

// Break a string onto lines that fit `maxW` in the 5x7 body face. Word-wrapping is the
// one thing the vector layer did with ctx.measureText; the pixel faces are fixed
// pitch, so the measure is arithmetic.
function wrap3(s, maxW) {
  const cap = Math.max(1, Math.floor(maxW / 6));
  const words = String(s).toUpperCase().split(' ');
  const out = []; let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (test.length > cap && line) { out.push(line); line = word; } else line = test;
  }
  if (line) out.push(line);
  return out;
}

// ---------------------------------------------------------------- in-play banners

// GALLERY CLEARED — the stage is won and the tour is waiting on the player.
export function drawClearedRibbon(p, { score, timeBonus }) {
  band(p, 116, 54, 0.84, 1, true);
  heading(p, 'GALLERY CLEARED', CX, 124, 2, R.gold);
  const line = timeBonus ? `SCORE ${score}  ·  +${timeBonus} TIME BONUS` : `SCORE ${score}`;
  t5c(p, line, CX + 1, 149, '#14100c', 0.7);
  t5c(p, line, CX, 148, P.pa5, 1);
  t5c(p, 'PRESS ENTER FOR THE NEXT GALLERY', CX + 1, 160, '#14100c', 0.7);
  t5c(p, 'PRESS ENTER FOR THE NEXT GALLERY', CX, 159, P.gd4, 1);
  return p;
}

// DOWNED — the one-second beat before the prize counter, so the culprit reads.
export function drawDowned(p) {
  band(p, 112, 66, 0.88);
  p.glow(CX, 138, 74, '#a8321f', 0.13, 2.4);
  heading(p, 'DOWNED', CX, 124, 3, R.rust);
  t5c(p, 'TO THE PRIZE COUNTER...', CX + 1, 163, '#14100c', 0.7);
  t5c(p, 'TO THE PRIZE COUNTER...', CX, 162, P.pa4, 1);
  return p;
}

// The CENTERPIECE card — a named quasi-boss announcing itself, fading over its window.
export function drawCenterpiece(p, name, a) {
  a = clamp(a, 0, 1);
  band(p, 96, 50, 0.84, a);
  const label = 'C E N T E R P I E C E';
  t5c(p, label, CX + 1, 105, '#14100c', 0.7 * a);
  t5c(p, label, CX, 104, P.gd4, a);
  const nm = String(name || '').toUpperCase();
  const scale = w5big(nm, 2) <= NATIVE.w - 40 ? 2 : 1;
  headingA(p, nm, CX, 116, scale, P.pa5, a);
  return p;
}

// The REHEARSAL burst banner — the Panic Finale taught before it counts.
export function drawRehearsal(p, secs) {
  band(p, LAYOUT.rehearsalY, LAYOUT.rehearsalH, 0.84);
  const l1 = 'REHEARSAL - THE PANIC FINALE RAINS BALLOONS';
  t5c(p, l1, CX + 1, LAYOUT.rehearsalY + 6, '#14100c', 0.7);
  t5c(p, l1, CX, LAYOUT.rehearsalY + 5, P.gd4, 1);
  const l2 = `PRACTISE THE STORM  ·  ${secs}S  ·  ENTER TO SKIP`;
  t5c(p, l2, CX + 1, LAYOUT.rehearsalY + 18, '#14100c', 0.7);
  t5c(p, l2, CX, LAYOUT.rehearsalY + 17, P.pa5, 1);
  return p;
}

// The PAUSE menu — pause, help and controls on ONE screen. Orientation time is the
// player's: nothing here is timed and the card never hurries.
const PAUSE_ROWS = [
  ['WALK', 'LEFT / RIGHT'], ['CLIMB', 'UP / DOWN'], ['FIRE WIRE', 'Z OR SPACE'],
  ['GALLERY SIDEARM', 'X'], ['TUBA BLAST', 'T'], ['PAUSE', 'ESC OR P'],
];
export function drawPaused(p, data) {
  const rows = (data && data.rows) ? data.rows : PAUSE_ROWS;
  const footer = (data && data.footer) ? data.footer : 'ESC RESUME  ·  O OPTIONS  ·  Q QUIT TO TITLE';
  scrim(p, 0.66);
  const extra = rows.length > PAUSE_ROWS.length ? (rows.length - PAUSE_ROWS.length) * 15 : 0;
  const bw = 320, bh = 182 + extra, x = Math.round(CX - bw / 2), y = 58;
  panel(p, x, y, bw, bh);
  heading(p, 'PAUSED', CX, y + 10, 2, R.rust);
  rule(p, x + 26, x + bw - 27, y + 32);
  t5c(p, (data && data.heading) || 'CONTROLS', CX, y + 40, P.tl2, 1);
  let ry = y + 54;
  for (const [k, v] of rows) {
    const kx = t5(p, k, x + 20, ry, P.ink, 0.95);
    const vx = x + bw - 20 - w5(v);
    leaders(p, kx + 4, vx - 5, ry + 4);
    t5r(p, v, x + bw - 20, ry, P.rd2, 0.95);
    ry += 15;
  }
  rule(p, x + 26, x + bw - 27, y + bh - 26);
  t5c(p, footer, CX, y + bh - 18, P.tl2, 1);
  return p;
}

// A live controller connect/disconnect notice. Persistent while disconnected;
// timed after a successful connect. Always uses in-font copy (no underscore).
// Right-corner toast below the REHEARSAL band (rows 24..53) so the two never
// share a y-range, and translucent so a rarer mid-climb pose still reads through.
// The card itself is the shared `panel()` idiom at reduced alpha — px.js carries the
// alpha argument (default 1, every other caller unchanged), so the toast stays the
// same paper stock as every other overlay instead of a private near-copy of it.
export function drawControllerNotice(p, notice) {
  if (!notice) return p;
  const headline = safeText(String(notice.headline || '')).toUpperCase();
  const detail = safeText(String(notice.detail || '')).toUpperCase();
  const bw = LAYOUT.noticeW, bh = LAYOUT.noticeH, a = LAYOUT.noticeAlpha;
  const x = NATIVE.w - LAYOUT.noticeRight - bw;
  const y = LAYOUT.noticeY;
  panel(p, x, y, bw, bh, a);
  const cx = Math.round(x + bw / 2);
  const danger = /DISCONNECT|NOT MAPPED/.test(headline);
  t5c(p, headline, cx, y + 4, danger ? P.rd2 : P.tl2, 0.95);
  t5c(p, detail, cx, y + 13, P.ink, 0.90);
  return p;
}

// ---------------------------------------------------------------- title extras

// The title card's working furniture: the seed the run will use, the doors off the
// title (trunk / options / endless), and the local record — best scores and the
// recent runs that explain them.
export function drawTitleExtras(p, { seed, seedInput, bank, endless, scores, runs }) {
  // --- the seed + doors card, top left
  const rows = [['0-9', 'SET SEED'], ['T', 'THE TRUNK'], ['O', 'OPTIONS']];
  if (endless) rows.push(['E', 'ENDLESS PANIC']);
  const cw = 168, ch = 28 + rows.length * 12 + 6;
  panel(p, 12, 52, cw, ch);
  t5(p, 'SEED', 20, 58, P.tl2, 1);
  // The typing caret is a drawn rule, not a character. There is no underscore in
  // either face, so an '_' would have printed the missing-glyph box every time a
  // player typed a seed — the one place in the game where arbitrary input meets type.
  const sv = String(seedInput || seed);
  const svEnd = t5(p, sv, 50, 57, P.ink, 1);
  if (seedInput !== undefined && seedInput !== '') p.hline(svEnd, svEnd + 4, 63, P.rd2, 1);
  let ry = 52 + 26;
  for (const [k, v] of rows) {
    t5(p, k, 20, ry, P.rd2, 1);
    const endX = t5(p, v, 44, ry, P.ink, 0.95);
    if (v === 'THE TRUNK') { const tx = ticketIcon(p, endX + 4, ry - 1); t5(p, String(bank), tx, ry, P.gd1, 1); }
    if (v === 'ENDLESS PANIC') starIcon(p, endX + 6, ry + 2, P.gd3, 1);
    ry += 12;
  }

  // --- the record, right column: best scores over the runs that produced them.
  // x=340 is not arbitrary: POPINJAY is set at scale 4 and its final letter reaches
  // x=336, so a wider card here would print over the wordmark.
  recordPanel(p, LAYOUT.recordX, 52, LAYOUT.recordW, 74, 'BEST SCORES', (scores || []).slice(0, 4).map((s) => ({
    left: String(s.score).padStart(6, '0'), right: `SEED ${s.seed}`, star: !!s.victory,
  })), 'NO RUNS BANKED YET');
  recordPanel(p, LAYOUT.recordX, 132, LAYOUT.recordW, 74, 'RECENT RUNS', (runs || []).slice(0, 4).map((r) => ({
    left: String(r.score).padStart(6, '0'),
    right: r.victory ? 'TOUR WON' : `FELL ${r.locale}-${r.stage}`,
    star: !!r.victory,
  })), 'FIRST TOUR AWAITS');
  return p;
}

function recordPanel(p, x, y, w, h, title, items, empty) {
  panel(p, x, y, w, h);
  t5(p, title, x + 10, y + 6, P.tl2, 1);
  rule(p, x + 10, x + w - 11, y + 15);
  if (!items.length) { t5(p, empty, x + 10, y + 24, P.pa1, 0.9); return p; }
  let ry = y + 22;
  for (const it of items) {
    t5(p, it.left, x + 8, ry - 1, P.ink, 1);
    t5r(p, it.right, x + w - (it.star ? 18 : 10), ry, P.tl2, 0.9);
    if (it.star) starIcon(p, x + w - 12, ry + 2, P.gd3, 1);
    ry += 12;
  }
  return p;
}

// The resume ribbon — a saved run is waiting. Sits directly above the controls card,
// in the title's primary column, so it cannot be missed.
export function drawResumeHint(p) {
  ribbon(p, 120, 192, 240, 14, R.teal);
  t5c(p, 'SAVED RUN - PRESS R TO RESUME', 240, 197, P.pa5, 1);
  return p;
}

// Confirmation seam: Enter with a live save would otherwise silently overwrite it.
export function drawConfirmNewRun(p) {
  const bw = 300, bh = 60, x = Math.round(CX - bw / 2), y = 200;
  panel(p, x, y, bw, bh);
  heading(p, 'ABANDON THE SAVED TOUR?', CX, y + 10, 1, R.rust);
  t5c(p, 'ENTER TO CONFIRM  ·  ESC TO KEEP', CX, y + 42, P.tl2, 1);
  return p;
}

// ---------------------------------------------------------------- OPTIONS

// The accessibility floor, printed as a programme card on a dark board. Every scale
// row carries a pip meter as well as its percentage, so a value reads at a glance and
// never depends on reading the number (the HUD's chain bar, one surface over).
export function drawOptions(p, { items, cursor, hint }) {
  posterGround(p, R.teal, GROUND_SEED.options, 0.05, 0.17, 0.09, 0.62, '#0b1a1e');
  posterFrame(p, { outer: P.pa4, outerA: 0.35, inner: P.gd2, innerA: 0.5, s: 10, steps: 12, curl: P.gd3, curlA: 0.8, pip: P.gd4, pipA: 0.9 });
  heading(p, 'OPTIONS', CX, 16, 2, R.gold);
  rule(p, CX - 74, CX + 74, 36);
  t5c(p, hint || 'UP / DOWN CHOOSE  ·  LEFT / RIGHT ADJUST  ·  ENTER TOGGLE  ·  ESC BACK', CX, 44, P.tl5, 0.95);

  const x = 52, y = 58, w = 376, rowH = 21;
  panel(p, x, y, w, 194);
  items.forEach((it, i) => {
    const ry = y + 12 + i * rowH, sel = i === cursor;
    if (sel) {
      for (let j = 0; j < rowH - 3; j++) for (let k = 0; k < w - 20; k++) p.add(x + 10 + k, ry + j, '#e7c76b', 0.17);
      p.rect(x + 10, ry, w - 20, rowH - 3, P.gd2, 0.8);
      for (let j = 0; j < 5; j++) { const kk = j < 3 ? j : 4 - j; p.hline(x + 14, x + 14 + kk, ry + 6 + j, P.rd2, 1); }
    }
    t5(p, it.label.toUpperCase(), x + 24, ry + 5, P.ink, sel ? 1 : 0.78);
    const val = String(it.text).toUpperCase();
    const vcol = it.type === 'toggle' ? (it.on ? P.tl2 : P.pa1) : P.ink;
    // The pip meter: a scale/count row shows its position, not only its number.
    // Both are measured against ZERO rather than against the row's own minimum — a
    // meter normalised to the range prints an EMPTY bar at the lowest setting, so
    // three composure hearts and eighty percent game speed both read as "off" when
    // they are nothing of the kind. Counts fill one pip per unit out of max; scales
    // fill in tenths, which is what their printed percentage already says.
    if (it.type !== 'toggle' && it.type !== 'binding' && it.type !== 'nav') {
      const count = it.type === 'count';
      const pips = count ? Math.max(1, it.max) : 10;
      const filled = count ? clamp(it.value, 0, pips) : Math.round(clamp(it.max ? it.value / it.max : 0, 0, 1) * pips);
      for (let k = 0; k < pips; k++) {
        const px0 = x + 232 + k * 6;
        if (k < filled) { p.frect(px0, ry + 6, 4, 5, rampAt(R.gold, 0.62, px0, ry), 1); p.px(px0, ry + 6, P.gd5, 0.8); }
        else p.rect(px0, ry + 6, 4, 5, P.pa1, 0.7);
      }
    }
    t5r(p, val, x + w - 24, ry + 5, vcol, 1);
    if (sel && it.type !== 'binding' && it.type !== 'nav') {
      chevron(p, x + 210, ry + 6, -1, P.rd2, 1);
      chevron(p, x + w - 18, ry + 6, 1, P.rd2, 1);
    }
  });
  t5c(p, 'ASSISTS NEVER DISABLE TICKETS, UNLOCKS, OR VICTORY.', CX, 264, P.tl5, 0.9);
  return p;
}

// ---------------------------------------------------------------- THE TRUNK

// The curated meta, printed on the inside of an actual steamer trunk: boards, brass
// corners, and two inventory bills pasted up — what you own, and what the fair will
// sell you. The selected lot gets a full description, because spending twelve
// tickets on a name alone is not a decision anyone can make.
export function drawTrunk(p, { owned, locked, bank, cursor, cost }) {
  posterGround(p, R.wood, GROUND_SEED.trunk, 0.12, 0.30, 0.12, 0.70, '#160c05');
  // board seams
  for (let y = 26; y < NATIVE.h; y += 37) {
    p.hline(0, NATIVE.w - 1, y, P.wd0, 0.55);
    p.hline(0, NATIVE.w - 1, y + 1, P.wd4, 0.22);
  }
  // brass corner hardware
  for (const [cx, cy, dx, dy] of [[6, 6, 1, 1], [NATIVE.w - 7, 6, -1, 1], [6, NATIVE.h - 7, 1, -1], [NATIVE.w - 7, NATIVE.h - 7, -1, -1]]) {
    for (let k = 0; k < 22; k++) {
      p.px(cx + dx * k, cy, rampAt(R.gold, 0.62 - k * 0.012, cx + dx * k, cy));
      p.px(cx, cy + dy * k, rampAt(R.gold, 0.58 - k * 0.012, cx, cy + dy * k));
      p.px(cx + dx * k, cy + dy, P.gd1, 0.5); p.px(cx + dx, cy + dy * k, P.gd1, 0.5);
    }
    p.fcircle(cx + dx * 4, cy + dy * 4, 2, P.gd4); p.px(cx + dx * 3, cy + dy * 3, P.gd5);
  }
  heading(p, 'THE TRUNK', CX, 14, 2, R.gold);
  const sx = CX - 108;
  const tx = ticketIcon(p, sx, 35);
  let hx = t5(p, `${bank} BANKED`, tx, 36, P.gd4, 1);
  hx = t5(p, `  ·  ${cost} TICKETS EACH  ·  ESC TO LEAVE`, hx, 36, P.pa3, 0.95);

  billPanel(p, 14, 48, 214, 166, `OWNED (${owned.length})`, P.tl2, owned.map((c) => ({ name: c.name })), -1, 'NOTHING YET - CLEAR STAGES');
  billPanel(p, 252, 48, 214, 166, `FOR SALE (${locked.length})`, P.rd2, locked.map((c) => ({ name: c.name })), cursor, 'EVERY LOT SOLD');

  // the selected lot, described
  panel(p, 14, 224, 452, 58);
  const sel = locked[cursor];
  if (sel) {
    t5(p, sel.name.toUpperCase(), 30, 234, P.ink, 1);
    const affordable = bank >= cost;
    const price = `${cost}`;
    const px0 = 452 - 14 - w5(price);
    ticketIcon(p, px0 - 12, 233);
    t5r(p, price, 452 - 14, 234, affordable ? P.gd1 : P.rd2, 1);
    rule(p, 30, 450, 245);
    t5(p, String(sel.blurb).toUpperCase(), 30, 252, P.ink, 0.9);
    t5(p, affordable ? 'PRESS ENTER TO UNLOCK - IT JOINS YOUR DRAFT POOL' : `NEED ${cost - bank} MORE TICKETS - CLEAR MORE STAGES`,
      30, 266, affordable ? P.tl2 : P.rd2, 1);
  } else {
    t5(p, 'THE TRUNK IS COMPLETE', 30, 240, P.ink, 1);
    t5(p, 'EVERY SOUVENIR IS OWNED AND EVERY DRAFT DRAWS FROM THE WHOLE CATALOGUE.', 30, 258, P.tl2, 1);
  }
  return p;
}

// An inventory bill: a paper card with a two-column list, filled column-major so a
// single cursor walking downward covers every row in reading order.
function billPanel(p, x, y, w, h, title, titleCol, items, cursor, empty) {
  panel(p, x, y, w, h);
  t5(p, title, x + 10, y + 6, titleCol, 1);
  rule(p, x + 10, x + w - 11, y + 15);
  if (!items.length) { t5(p, empty, x + 10, y + 24, P.pa1, 0.9); return p; }
  const perCol = 12, colW = Math.floor((w - 18) / 2);
  items.forEach((it, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    if (col > 1) return;                                   // the catalogue fits two columns
    const rx = x + 10 + col * colW, ry = y + 22 + row * 11;
    const sel = i === cursor;
    if (sel) {
      for (let k = 0; k < colW - 2; k++) for (let j = 0; j < 9; j++) p.add(rx - 2 + k, ry - 2 + j, '#e7c76b', 0.20);
      p.rect(rx - 2, ry - 2, colW - 2, 9, P.gd2, 0.7);
    }
    p.px(rx + 1, ry + 2, sel ? P.rd2 : P.tl2); p.px(rx + 1, ry + 3, sel ? P.rd2 : P.tl2);
    t5(p, it.name.toUpperCase(), rx + 5, ry, sel ? P.ink : shade(P.ink, 0.22), 1);
  });
  return p;
}

// ---------------------------------------------------------------- TOUR MAP

// The tour map interstitial: the route pin advances. A printed period map — aged
// stock, a plate-dot ground, a cartouche, three emblem medallions on a dashed route,
// and a compass rose.
export function drawTourMap(p, { locale, names }) {
  p.grad(0, 0, NATIVE.w, NATIVE.h, R.paper, 0.76, 0.54);
  p.paper(GROUND_SEED.tourmap, 0.15);
  for (let y = 8; y < NATIVE.h; y += 9) for (let x = 8; x < NATIVE.w; x += 9) p.px(x, y, P.pa0, 0.10);
  // Foxing: the brown blooms an old sheet grows. Seeded, so the map is the same map
  // every time it is opened.
  const fox = fbm(GROUND_SEED.tourmap + 5, 3);
  for (let y = 8; y < NATIVE.h - 8; y++) for (let x = 8; x < NATIVE.w - 8; x++) {
    const v = fox(x * 0.013, y * 0.019);
    if (v > 0.62) p.mul(x, y, '#7a5326', (v - 0.62) * 0.55);
  }
  // Rhumb lines from two rose nodes, portolan-fashion — the period chart's own way of
  // filling a plain sea, and the reason this sheet reads as a surveyed chart rather
  // than a blank page. Faint enough to sit under every other mark.
  rhumbLines(p, 428, 244, 300, 1);
  rhumbLines(p, 74, 96, 260, 0.62);
  p.vignette(0.85, '#6b4a24');
  posterFrame(p, { m: 6, outer: P.ink, outerA: 0.65, inner: P.gd2, innerA: 0.6, s: 14, steps: 16, curl: P.gd2, curlA: 0.8, pip: P.gd4, pipA: 0.9 });

  panel(p, 96, 14, 288, 34);
  heading(p, "THE WORLD'S FAIR TOUR", CX, 22, 2, R.rust);

  const pins = [0.22, 0.5, 0.78].map((fx, i) => ({ x: Math.round(NATIVE.w * fx), y: Math.round(152 + Math.sin(i - 1) * 6), i }));
  routeDashes(p, pins[0], pins[2], { x: CX, y: pins[1].y - 22 });

  for (const pin of pins) {
    const reached = pin.i + 1 <= locale, here = pin.i + 1 === locale;
    const r = here ? 20 : 16;
    if (here) p.glow(pin.x, pin.y, r + 14, '#e7c76b', 0.26, 2.2);
    p.shadowPool(pin.x + 2, pin.y + r - 1, r, 4, 0.34);
    // a struck medallion: shaded by its own normal against the map's light
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.sqrt(i * i + j * j); if (d > r) continue;
      const nx = i / r, ny = j / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = clamp(-(nx * -0.5 + ny * -0.62) * 0.48 + nz * 0.40 + 0.26, 0, 1);
      p.px(pin.x + i, pin.y + j, rampAt(reached ? R.paper : R.stone, lit, pin.x + i, pin.y + j));
    }
    p.circle(pin.x, pin.y, r, P.ink, 0.85);
    p.circle(pin.x, pin.y, r - 4, reached ? P.gd3 : P.ink, 0.5);
    localeEmblem(p, pin.i, pin.x, pin.y, Math.round(r * 0.62), reached);
    const label = `${pin.i + 1}. ${names[pin.i].toUpperCase()}`;
    t5c(p, label, pin.x + 1, pin.y + r + 9, P.pa0, 0.5);
    t5c(p, label, pin.x, pin.y + r + 8, here ? P.rd1 : P.ink, 1);
    if (here) {                                   // the advancing route flag
      p.vline(pin.x, pin.y - r - 22, pin.y - r, P.ink, 0.9);
      p.px(pin.x - 1, pin.y - r - 22, P.ink, 0.5);
      p.fpoly([[pin.x + 1, pin.y - r - 22], [pin.x + 17, pin.y - r - 18], [pin.x + 1, pin.y - r - 13]], P.gd3);
      p.line(pin.x + 1, pin.y - r - 22, pin.x + 17, pin.y - r - 18, P.gd5, 0.9);
      p.poly([[pin.x + 1, pin.y - r - 22], [pin.x + 17, pin.y - r - 18], [pin.x + 1, pin.y - r - 13]], P.ink, 0.5);
    }
  }
  scaleBar(p, 30, 248);
  compassRose(p, 428, 244, 18);
  const next = `NEXT: LOCALE ${locale} - ${names[locale - 1].toUpperCase()}  ·  PRESS ENTER`;
  const nw = w5(next) + 20;
  panel(p, Math.round(CX - nw / 2), 266, nw, 16);
  t5c(p, next, CX, 271, P.ink, 1);
  return p;
}

// Rhumb lines radiating from the rose, clipped to the sheet and faint enough to sit
// under everything — the ornament that makes a chart look surveyed.
function rhumbLines(p, cx, cy, len, strength) {
  const s = strength === undefined ? 1 : strength;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 20; d < len; d++) {
      const x = Math.round(cx + dx * d), y = Math.round(cy + dy * d);
      if (x < 9 || y < 9 || x >= p.w - 9 || y >= p.h - 9) break;
      p.px(x, y, P.pa0, ((k % 4 === 0) ? 0.24 : 0.14) * s);
    }
  }
  p.circle(cx, cy, 4, P.pa0, 0.30 * s);
  return p;
}

// A distance scale: the small print that tells you a map is a map.
function scaleBar(p, x, y) {
  t5(p, 'LEAGUES', x, y - 9, P.ink, 0.65);
  for (let k = 0; k < 4; k++) {
    const bx = x + k * 14;
    if (k % 2 === 0) p.frect(bx, y, 14, 4, P.ink, 0.62);
    else { p.frect(bx, y, 14, 4, P.pa5, 0.8); p.rect(bx, y, 14, 4, P.ink, 0.62); }
  }
  p.rect(x, y, 56, 4, P.ink, 0.7);
  t5(p, '0', x - 1, y + 6, P.ink, 0.6);
  t5(p, '40', x + 50, y + 6, P.ink, 0.6);
  return p;
}

// The route: a dashed quadratic, drawn by arc-length so the dashes stay even.
function routeDashes(p, a, b, ctrl) {
  let prev = null, run = 0;
  for (let k = 0; k <= 240; k++) {
    const t = k / 240, mt = 1 - t;
    const x = mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x;
    const y = mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y;
    if (prev) {
      run += Math.sqrt((x - prev[0]) ** 2 + (y - prev[1]) ** 2);
      if ((run % 11) < 5) {
        p.px(Math.round(x), Math.round(y), P.ink, 0.78);
        p.px(Math.round(x), Math.round(y) + 1, P.ink, 0.5);
        p.px(Math.round(x), Math.round(y) - 1, P.pa5, 0.32);
      }
    }
    prev = [x, y];
  }
  return p;
}

// A locale emblem struck into its medallion: exposition tower, lighthouse, alpine
// peak — the three places the tour actually visits, in the vistas' own shapes.
function localeEmblem(p, i, cx, cy, r, reached) {
  const ramp = reached ? [R.teal, R.rust, R.gold][i] : R.stone;
  const ink = reached ? P.ink : shade(P.ink, 0.35);
  if (i === 0) {                                  // the exposition tower
    // The locale-1 vista's own landmark: a tall banded shaft that tapers hard, a
    // narrow cap, and the pennant on top. Drawn slim — a squat shaft with a wide dome
    // reads as a bottle, which is exactly what the first pass produced.
    const base = r * 0.34, top = r * 0.12, hgt = r * 1.55, y0 = cy + r * 0.55;
    p.fpoly([[cx - base, y0], [cx - top, y0 - hgt], [cx + top, y0 - hgt], [cx + base, y0]], ramp[2]);
    p.fpoly([[cx - base, y0], [cx - top, y0 - hgt], [cx, y0 - hgt], [cx, y0]], ramp[3]);
    for (let k = 1; k <= 3; k++) {                // the observation bands
      const t = k / 4, wdt = Math.round(lerp(base, top, t));
      p.hline(cx - wdt, cx + wdt, Math.round(y0 - hgt * t), P.gd3, 0.9);
    }
    p.hline(cx - Math.round(base * 1.35), cx + Math.round(base * 1.35), Math.round(y0), ink, 0.8);
    p.fpoly([[cx - top * 1.8, y0 - hgt], [cx, y0 - hgt - r * 0.24], [cx + top * 1.8, y0 - hgt]], ramp[4]);
    p.vline(cx, Math.round(y0 - hgt - r * 0.6), Math.round(y0 - hgt - r * 0.2), P.gd4, 0.95);
    p.fpoly([[cx, y0 - hgt - r * 0.6], [cx + r * 0.3, y0 - hgt - r * 0.48], [cx, y0 - hgt - r * 0.36]], P.rd2);
    p.poly([[cx - base, y0], [cx - top, y0 - hgt], [cx + top, y0 - hgt], [cx + base, y0]], ink, 0.75);
  } else if (i === 1) {                           // the lighthouse
    p.fpoly([[cx - r * 0.44, cy + r], [cx - r * 0.22, cy - r * 0.52], [cx + r * 0.22, cy - r * 0.52], [cx + r * 0.44, cy + r]], ramp[2]);
    p.fpoly([[cx - r * 0.44, cy + r], [cx - r * 0.22, cy - r * 0.52], [cx, cy - r * 0.52], [cx, cy + r]], ramp[3]);
    p.frect(cx - Math.round(r * 0.26), cy - Math.round(r * 0.6), Math.max(1, Math.round(r * 0.52)), Math.max(1, Math.round(r * 0.24)), P.gd4);
    p.glow(cx, cy - Math.round(r * 0.5), 6, '#ffe58a', 0.5, 2);
    p.fpoly([[cx - r * 0.3, cy - r * 0.62], [cx, cy - r], [cx + r * 0.3, cy - r * 0.62]], ink, 0.9);
    p.poly([[cx - r * 0.44, cy + r], [cx - r * 0.22, cy - r * 0.52], [cx + r * 0.22, cy - r * 0.52], [cx + r * 0.44, cy + r]], ink, 0.75);
  } else {                                        // the alpine peak
    p.fpoly([[cx - r, cy + r * 0.7], [cx, cy - r], [cx + r, cy + r * 0.7]], ramp[2]);
    p.fpoly([[cx - r, cy + r * 0.7], [cx, cy - r], [cx, cy + r * 0.7]], ramp[3]);
    p.fpoly([[cx - r * 0.26, cy - r * 0.36], [cx, cy - r], [cx + r * 0.26, cy - r * 0.36], [cx + r * 0.1, cy - r * 0.24], [cx - r * 0.1, cy - r * 0.26]], reached ? P.pa5 : P.pa3);
    p.poly([[cx - r, cy + r * 0.7], [cx, cy - r], [cx + r, cy + r * 0.7]], ink, 0.75);
  }
  return p;
}

// A compass rose — the period cartographic ornament that says "map" before any type
// is read.
function compassRose(p, cx, cy, r) {
  p.circle(cx, cy, r, P.ink, 0.45);
  p.circle(cx, cy, r - 3, P.ink, 0.22);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 - Math.PI / 2;
    const tipX = cx + Math.cos(a) * r, tipY = cy + Math.sin(a) * r;
    p.fpoly([[tipX, tipY],
      [cx + Math.cos(a + 0.42) * r * 0.28, cy + Math.sin(a + 0.42) * r * 0.28],
      [cx + Math.cos(a - 0.42) * r * 0.28, cy + Math.sin(a - 0.42) * r * 0.28]], k === 0 ? P.rd2 : P.ink, 0.9);
  }
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    p.line(cx, cy, Math.round(cx + Math.cos(a) * r * 0.6), Math.round(cy + Math.sin(a) * r * 0.6), P.ink, 0.35);
  }
  p.fcircle(cx, cy, 1, P.gd2);
  t5c(p, 'N', cx, cy - r - 7, P.rd1, 1);
  return p;
}

// ---------------------------------------------------------------- DRAFT

const KIND_RAMP = { weapon: R.rust, defense: R.teal, tempo: R.gold, utility: R.plum };

// The between-stage draft: one of three souvenirs on the stall counter. Untimed and
// declinable, and the card says so — the offer is legible in one glance by name, one
// plain effect line, and an emblem that reads the kind without colour.
export function draftHint(held, padConnected) {
  const h = `HELD: ${held || 'NONE'}`;
  if (padConnected) return `${h}  ·  A TAKES HIGHLIGHT  ·  1 2 3 PICK  ·  B / D DECLINES`;
  return `${h}  ·  PRESS 1  2  3 TO TAKE  ·  D TO DECLINE`;
}

export function drawDraft(p, { offer, held, cursor, pad }) {
  posterGround(p, R.olive, GROUND_SEED.draft, 0.10, 0.26, 0.11, 0.62, '#141a0c');
  posterFrame(p, { outer: P.pa4, outerA: 0.32, inner: P.gd2, innerA: 0.5, s: 10, steps: 12, curl: P.gd3, curlA: 0.8, pip: P.gd4, pipA: 0.9 });
  heading(p, 'DRAFT A SOUVENIR', CX, 14, 2, R.gold);
  rule(p, CX - 110, CX + 110, 34);
  t5c(p, draftHint(held, !!pad), CX, 42, P.ol5, 1);
  if (!offer || !offer.length) return p;

  const n = offer.length, cw = 118, gap = 14;
  let x = Math.round((NATIVE.w - (n * cw + (n - 1) * gap)) / 2);
  const cy = 62, ch = 156;
  offer.forEach((c, i) => {
    panel(p, x, cy, cw, ch);
    if (cursor === i) {
      p.rect(x - 2, cy - 2, cw + 4, ch + 4, P.gd2, 0.9);
      for (let j = 0; j < ch + 4; j++) {
        p.add(x - 2, cy - 2 + j, '#e7c76b', 0.12);
        p.add(x + cw + 1, cy - 2 + j, '#e7c76b', 0.12);
      }
    }
    const ramp = KIND_RAMP[c.kind] || R.slate;
    // the kind ribbon, shaded, inside the card's gold rule
    for (let j = 0; j < 15; j++) for (let k = 0; k < cw - 8; k++) {
      p.px(x + 4 + k, cy + 4 + j, rampAt(ramp, clamp(0.62 - (j / 15) * 0.26, 0, 1), x + 4 + k, cy + 4 + j));
    }
    p.hline(x + 4, x + cw - 5, cy + 4, ramp[4], 0.5);
    p.rect(x + 4, cy + 4, cw - 8, 15, P.ink, 0.6);
    // Gold is too light to carry cream type; it takes ink instead, so every ribbon
    // reads at the same strength rather than one washing out.
    t5c(p, `${i + 1}.  ${c.kind.toUpperCase()}`, x + cw / 2, cy + 9, ramp === R.gold ? P.ink : P.pa5, 1);

    const nm = c.name.toUpperCase();
    if (w5(nm) <= cw - 14) t5c(p, nm, x + cw / 2, cy + 26, P.ink, 1);
    else t5c(p, nm, x + cw / 2, cy + 27, P.ink, 1);
    rule(p, x + 14, x + cw - 15, cy + 38);

    const lines = wrap3(c.blurb, cw - 18);
    lines.slice(0, 4).forEach((ln, k) => t5c(p, ln, x + cw / 2, cy + 46 + k * 8, P.tl1, 1));

    draftIcon(p, c.kind, x + Math.round(cw / 2), cy + ch - 44, 18);
    rule(p, x + 22, x + cw - 23, cy + ch - 24);
    t5c(p, `TAKE ${i + 1}`, x + cw / 2, cy + ch - 16, P.rd2, 1);
    x += cw + gap;
  });
  // Declining is a real choice, not a fallback, so it gets a real affordance rather
  // than a line of small print.
  ribbon(p, CX - 74, 230, 148, 14, R.teal);
  t5c(p, 'D  -  DECLINE THE OFFER', CX, 235, P.pa5, 1);
  t5c(p, 'THE DRAFT IS UNTIMED - TAKE AS LONG AS YOU LIKE', CX, 254, P.ol5, 0.9);
  return p;
}

// One emblem per souvenir kind, shaded rather than filled: a wire climbing (weapon),
// a crest (defense), a metronome (tempo), a spyglass (utility).
function draftIcon(p, kind, cx, cy, r) {
  const ramp = KIND_RAMP[kind] || R.slate;
  p.shadowPool(cx + 2, cy + r - 2, r, 4, 0.28);
  if (kind === 'weapon') {
    for (let k = -1; k <= 1; k++) p.vline(cx + k, cy - r + 4, cy + r, rampAt(ramp, k < 0 ? 0.72 : 0.4, cx + k, cy));
    p.fpoly([[cx, cy - r - 2], [cx - r * 0.52, cy - r * 0.3], [cx + r * 0.52, cy - r * 0.3]], ramp[3]);
    p.fpoly([[cx, cy - r - 2], [cx - r * 0.52, cy - r * 0.3], [cx, cy - r * 0.3]], ramp[4]);
    p.poly([[cx, cy - r - 2], [cx - r * 0.52, cy - r * 0.3], [cx + r * 0.52, cy - r * 0.3]], P.ink, 0.7);
    p.glow(cx, cy - r, 7, '#ffe58a', 0.35, 2);
  } else if (kind === 'defense') {
    const pts = [[cx, cy - r], [cx + r * 0.92, cy - r * 0.4], [cx + r * 0.66, cy + r * 0.86], [cx, cy + r], [cx - r * 0.66, cy + r * 0.86], [cx - r * 0.92, cy - r * 0.4]];
    p.fpoly(pts, ramp[2]);
    p.fpoly([[cx, cy - r], [cx - r * 0.92, cy - r * 0.4], [cx - r * 0.66, cy + r * 0.86], [cx, cy + r]], ramp[3]);
    p.poly(pts, P.ink, 0.75);
    p.vline(cx, cy - Math.round(r * 0.5), cy + Math.round(r * 0.5), ramp[5], 0.5);
  } else if (kind === 'tempo') {
    const pts = [[cx - r * 0.72, cy + r], [cx - r * 0.34, cy - r], [cx + r * 0.34, cy - r], [cx + r * 0.72, cy + r]];
    p.fpoly(pts, ramp[2]);
    p.fpoly([[cx - r * 0.72, cy + r], [cx - r * 0.34, cy - r], [cx, cy - r], [cx, cy + r]], ramp[3]);
    p.poly(pts, P.ink, 0.75);
    p.line(cx, cy + Math.round(r * 0.7), cx + Math.round(r * 0.42), cy - Math.round(r * 0.7), P.pa5, 0.95);
    p.fcircle(cx + Math.round(r * 0.42), cy - Math.round(r * 0.7), 1, P.gd5);
  } else {
    p.fellipse(cx, cy, r, Math.round(r * 0.62), ramp[2]);
    p.fellipse(cx, cy - 1, r - 2, Math.round(r * 0.44), ramp[3]);
    p.ellipse(cx, cy, r, Math.round(r * 0.62), P.ink, 0.75);
    p.fcircle(cx, cy, Math.round(r * 0.3), P.pa5);
    p.fcircle(cx, cy, Math.round(r * 0.16), P.ink);
    p.px(cx - 1, cy - 1, P.wht, 0.9);
  }
  return p;
}

// ---------------------------------------------------------------- SCORECARD

// Fit souvenir display names onto one line, then summarize the overflow so a long
// loadout never truncates mid-word. Exported so the layout rule can be unit-tested.
export function formatSouvenirSummary(souvenirs, maxW) {
  if (!souvenirs || !souvenirs.length) return { shown: '-', more: 0 };
  const names = souvenirs.map((s) => String(s).toUpperCase());
  let line = names[0];
  let i = 1;
  while (i < names.length && w5(line + ', ' + names[i]) <= maxW) {
    line += ', ' + names[i];
    i++;
  }
  return { shown: line, more: names.length - i };
}

// The prize counter. Causal by law: it says what happened, what it paid, and what the
// next run buys — the ledger, then the unlock bar that is the one-more-run hook.
export function drawScorecard(p, { sc, souvenirs, unlock }) {
  posterGround(p, R.slate, GROUND_SEED.scorecard, 0.09, 0.26, 0.10, 0.60, '#0a0f18');
  posterFrame(p, { outer: P.pa4, outerA: 0.30, inner: P.gd2, innerA: 0.5, s: 10, steps: 12, curl: P.gd3, curlA: 0.8, pip: P.gd4, pipA: 0.9 });
  if (!sc) return p;
  const victory = sc.outcome === 'victory';
  const cw = 286, ch = 200, cx = Math.round(CX - cw / 2), cy = 44;
  panel(p, cx, cy, cw, ch);

  heading(p, victory ? 'TOUR COMPLETE' : 'PRIZE COUNTER', CX, cy + 12, 2, victory ? R.gold : R.rust);
  const sub = victory ? "YOU SURVIVED THE WORLD'S FAIR."
    : `DOWNED AT ${sc.locale}-${sc.stage}${sc.culpritCls ? ' BY A ' + String(sc.culpritCls).toUpperCase() : ''}.`;
  t5c(p, sub, CX, cy + 34, P.tl1, 1);
  rule(p, cx + 22, cx + cw - 23, cy + 44);

  const rows = [
    ['SCORE', String(sc.score), false],
    ['BALLOONS POPPED', String(sc.pops), false],
    ['BEST CHAIN', `x${Math.max(1, sc.bestChain)}`, false],
    ['SEED', String(sc.seed), false],
    ['PRIZE TICKETS', String(sc.tickets), true],
  ];
  let ry = cy + 54;
  for (const [k, v, gold] of rows) {
    const kx = t5(p, k, cx + 22, ry + 1, P.tl2, 1);
    const vx = cx + cw - 22 - w5(v);
    leaders(p, kx + 4, vx - (gold ? 17 : 5), ry + 5);
    if (gold) ticketIcon(p, vx - 13, ry, 1);
    t5r(p, v, cx + cw - 22, ry, gold ? P.gd1 : P.ink, 1);
    ry += 16;
  }
  // The loadout, by DISPLAY name and never a raw catalogue id.
  t5(p, 'SOUVENIRS', cx + 22, ry + 1, P.tl2, 1);
  const summary = formatSouvenirSummary(souvenirs, cw - 130);
  t5r(p, summary.shown, cx + cw - 22, ry + 1, P.ink, 1);
  if (summary.more > 0) t5r(p, `+${summary.more} MORE`, cx + cw - 22, ry + 10, P.tl2, 1);
  ry += 12 + (summary.more > 0 ? 10 : 0);

  unlockBar(p, cx + 22, ry, cw - 44, unlock);

  t5c(p, 'PRESS ENTER FOR A NEW RUN', CX, cy + ch - 15, P.rd2, 1);
  if (victory) {
    starIcon(p, cx + 20, cy + 18, P.gd4, 1); starIcon(p, cx + cw - 20, cy + 18, P.gd4, 1);
    t5c(p, 'POPINJAY - EXPOSITION AMUSEMENTS CO.', CX, cy + ch + 12, P.sl5, 0.85);
    t5c(p, 'CODE-DRAWN ART  ·  HOUSE BAND SCORE  ·  ENDLESS PANIC UNLOCKED', CX, cy + ch + 22, P.sl5, 0.7);
  }
  return p;
}

// The next trunk unlock as a filling bar — the hook, in plain legible type.
function unlockBar(p, x, y, w, unlock) {
  if (!unlock) return p;
  if (unlock.complete) {
    t5(p, 'THE TRUNK IS COMPLETE - EVERY SOUVENIR OWNED.', x, y + 4, P.tl2, 1);
    return p;
  }
  t5(p, `NEXT UNLOCK - ${String(unlock.name).toUpperCase()}`, x, y, P.ink, 1);
  const tally = `${unlock.bank} / ${unlock.cost}`;
  const tx = x + w - w5(tally);
  ticketIcon(p, tx - 13, y - 1);
  t5r(p, tally, x + w, y, P.gd1, 1);
  const by = y + 10, bh = 7, frac = clamp(unlock.cost ? unlock.bank / unlock.cost : 0, 0, 1);
  p.rect(x, by, w, bh, P.ink, 0.85);
  p.frect(x + 1, by + 1, w - 2, bh - 2, P.pa5, 0.55);
  const fill = Math.round((w - 2) * frac);
  for (let i = 0; i < fill; i++) for (let j = 0; j < bh - 2; j++) {
    p.px(x + 1 + i, by + 1 + j, rampAt(R.gold, clamp(0.75 - j * 0.10, 0, 1), x + 1 + i, by + 1 + j));
  }
  if (fill > 0) p.px(x + fill, by + 1, P.gd5, 0.9);
  return p;
}

// ---------------------------------------------------------------- save notice

// LOUD save-fault notice on the title card (rule 4). Distinct from the error banner
// — amber register, persists until the player starts a run.
export function drawSaveNotice(p, msg) {
  const bw = Math.min(NATIVE.w - 24, w5(String(msg)) + 16);
  const bx = Math.round((NATIVE.w - bw) / 2), by = 270, bh = 13;
  p.frect(bx, by, bw, bh, P.gd3, 0.92);
  p.frect(bx, by, bw, 1, P.gd4, 0.85);
  p.rect(bx, by, bw, bh, P.ink0, 0.9);
  t5c(p, safeText(String(msg || '')).toUpperCase(), NATIVE.w / 2, by + 4, P.ink, 1);
  return p;
}

// ---------------------------------------------------------------- error banner

// The LOUD-failure banner (hard rule 4). It owns a small buffer of its own because it
// deliberately sits OUTSIDE the letterboxed play area, across the top of the physical
// canvas, where it is visible even when the frame behind it failed to paint at all.
// Presented nearest-neighbor at exactly the game's own pixel size.
let bannerScreen = null;
export function drawErrorBanner(ctx, cssW, msg) {
  if (!bannerScreen) bannerScreen = new NativeScreen(NATIVE.w, 11);
  const p = bannerScreen.painter;
  p.grad(0, 0, NATIVE.w, 11, R.rust, 0.55, 0.34);
  p.paper(77, 0.06, 0, 11);
  p.hline(0, NATIVE.w - 1, 0, P.rd4, 0.5);
  p.hline(0, NATIVE.w - 1, 10, P.ink, 0.9);
  p.hline(0, NATIVE.w - 1, 9, P.gd2, 0.45);
  // a warning lozenge
  p.fpoly([[7, 1], [12, 9], [2, 9]], P.gd3);
  p.poly([[7, 1], [12, 9], [2, 9]], P.ink, 0.85);
  p.vline(7, 4, 6, P.ink); p.px(7, 8, P.ink);
  const hgt = Math.max(16, Math.round(11 * cssW / NATIVE.w));
  bannerScreen.present(ctx, cssW, hgt);
  // This surface is painted after the normal queued type layer, because it must
  // remain visible even when the frame renderer failed. Set the same vendored body
  // face directly on the final Canvas so the emergency path cannot regress to the
  // obsolete bitmap alphabet.
  const scale = cssW / NATIVE.w;
  const tail = 'PRESS L TO EXPORT DEBUG LOG';
  const message = safeText(String(msg || '')).toUpperCase();
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, cssW, hgt); ctx.clip();
  ctx.textBaseline = 'top';
  ctx.fontKerning = 'normal';
  ctx.fillStyle = P.pa4;
  ctx.globalAlpha = 0.9;
  ctx.textAlign = 'right';
  ctx.font = `700 ${7.6 * scale}px "${BODY_FONT_FAMILY}"`;
  ctx.fillText(tail, cssW - 6 * scale, 1.6 * scale);
  const tailW = ctx.measureText(tail).width;
  const msgX = 17 * scale;
  const msgMax = Math.max(30, cssW - tailW - msgX - 20 * scale);
  let size = 7.8 * scale;
  ctx.font = `700 ${size}px "${BODY_FONT_FAMILY}"`;
  while (size > 5.8 * scale && ctx.measureText(message).width > msgMax) {
    size -= 0.25 * scale;
    ctx.font = `700 ${size}px "${BODY_FONT_FAMILY}"`;
  }
  ctx.fillStyle = P.wht;
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.fillText(message, msgX, 1.4 * scale, msgMax);
  ctx.restore();
  return hgt;
}

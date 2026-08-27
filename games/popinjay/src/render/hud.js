// hud.js — the HUD, painted into the SAME native 480x300 buffer as the world so the
// frame is one picture at one resolution (no vector-over-pixel seam).
//
// Legibility law (rule 5): every readout mirrors a real sim value the moment its
// mechanic works — hearts (composure), the wire slot (ready/armed/firing/buffered),
// the chain meter (the tick-denominated window, VISIBLE, never audio-only), the par
// dial (a bandstand CLOCK — pressure, not a bomb; it flips state past par and says
// so in words, never audio-only). Nothing here is decorative-only.
//
// Pure draw: takes the 2D context, the sim World and the logical size; touches no
// `window` and never mutates sim state.

import { CHAIN } from '../tuning.js';
import { nativeScreen } from './game.js';
import { NATIVE, P, R, rampAt, clamp, shade, fbm, t3, t5, t5r, t3c, t5c, w3, w5, posterFrame, ACCENT_RED } from './px.js';
import { HUD_H } from './vistas.js';

const hudPaperNoise = fbm(91, 4);
// The poster frame wears a 3px mat; the HUD band sits inside it instead of flush
// to the viewport top edge.
const HUD_TOP = 3;

export function drawHUD(ctx, world, { w, h }) {
  const p = nativeScreen().painter;

  hudPosterFrame(p);
  hudBand(p);
  hudValance(p);

  hudHearts(p, world);
  hudDivider(p, 70);
  hudWireSlot(p, world);
  hudDivider(p, 152);
  hudStageLabel(p, world);
  hudDivider(p, 300);
  hudChainMeter(p, world);
  hudParDial(p, world);
  hudScoreTickets(p, world);

  nativeScreen().present(ctx, w, h);
}

// The cream stock the readouts sit on: a top-lit gradient with paper tooth, closed by
// an engraved gold + ink rule and a soft drop shadow onto the sky.
function hudBand(p) {
  p.fn(0, HUD_TOP, NATIVE.w, HUD_H, (x, y) => {
    const ry = y - HUD_TOP;
    const t = 0.80 + (hudPaperNoise(x * 0.05, ry * 0.13) - 0.5) * 0.22 - (ry / HUD_H) * 0.10;
    return rampAt(R.paper, clamp(t, 0, 1), x, y);
  });
  const by = HUD_TOP + HUD_H;
  p.hline(0, NATIVE.w - 1, by - 3, P.gd2, 0.85);
  p.hline(0, NATIVE.w - 1, by - 2, shade(P.gd4, 0.25), 0.9);
  p.hline(0, NATIVE.w - 1, by - 1, P.ink, 0.85);
  for (let x = 0; x < NATIVE.w; x++) { p.mul(x, by, '#3a2c18', 0.30); p.mul(x, by + 1, '#3a2c18', 0.14); }
  // art-nouveau corner flourishes anchoring the ribbon ends
  for (const [cx, sx] of [[3, 1], [NATIVE.w - 4, -1]]) {
    for (let a = 0; a < 14; a++) {
      const th = a / 14 * Math.PI * 0.5;
      p.px(cx + sx * Math.round(Math.cos(th) * 10), HUD_TOP + 2 + Math.round(Math.sin(th) * 7), P.gd3, 0.9);
      p.px(cx + sx * Math.round(Math.cos(th) * 13), HUD_TOP + 2 + Math.round(Math.sin(th) * 9), P.gd2, 0.55);
    }
    p.px(cx + sx * 11, HUD_TOP + 3, P.gd4); p.px(cx + sx * 12, HUD_TOP + 4, P.gd4, 0.6);
  }
}

// The scalloped bunting hanging under the bar — period showmanship, and it is what
// makes any frame read as POPINJAY at a glance.
function hudValance(p) {
  const ramps = [R.teal, R.paper, R.gold, R.rust];
  const y = HUD_TOP + HUD_H;
  p.hline(0, NATIVE.w - 1, y, P.wd2); p.hline(0, NATIVE.w - 1, y + 1, P.wd1, 0.9);
  p.hline(0, NATIVE.w - 1, y - 1, P.wd4, 0.5);
  const step = 11, r = 9;
  let i = 0;
  for (let cx = -2; cx < NATIVE.w + 10; cx += step, i++) {
    const ri = ramps[i % 4];
    for (let j = 0; j <= r; j++) for (let k = -r; k <= r; k++) {
      const d = Math.sqrt(k * k + j * j); if (d > r) continue;
      const lit = 0.72 - (k / r) * 0.30 - (j / r) * 0.34 + (1 - d / r) * 0.16;
      const edge = d > r - 1.3 ? -0.35 : 0;
      p.px(cx + k, y + 2 + j, rampAt(ri, clamp(lit + edge, 0, 1), cx + k, y + 2 + j));
    }
    for (let a = 0; a < 10; a++) {
      const th = Math.PI * (0.58 + a * 0.035);
      p.px(cx + Math.round(Math.cos(th) * (r - 2)), y + 2 + Math.abs(Math.round(Math.sin(th) * (r - 2))), ri[5], 0.45);
    }
    p.px(cx, y + 2 + r, ri[0], 0.8);
    p.px(cx, y + 3 + r, P.gd3); p.px(cx, y + 4 + r, P.gd2); p.px(cx, y + 5 + r, P.gd4, 0.7);
    p.px(cx, y + 1, ri[1]); p.px(cx - 1, y + 2, ri[1], 0.6); p.px(cx + 1, y + 2, ri[1], 0.6);
  }
  for (let x = 0; x < NATIVE.w; x++) for (let j = 0; j < 7; j++) p.mul(x, y + r + 4 + j, '#3a2c18', 0.16 * (1 - j / 7));
}

// The in-game tuning of the shared poster frame (px.js) — an ink mat, kept thin so
// the >=95% screen-fill gate holds (rule 9).
function hudPosterFrame(p) { posterFrame(p); }

function hudDivider(p, x) {
  p.vline(x, HUD_TOP + 4, HUD_TOP + HUD_H - 6, P.gd2, 0.45);
  p.px(x, HUD_TOP + 9, P.gd4); p.px(x - 1, HUD_TOP + 10, P.gd4); p.px(x + 1, HUD_TOP + 10, P.gd4); p.px(x, HUD_TOP + 11, P.gd4);
  p.px(x, HUD_TOP + 10, P.gd5);
}

// COMPOSURE — one shaded heart per point, empties left as pips so max is always legible.
function hudHearts(p, world) {
  const n = world.hearts, max = world.maxHearts || 3;
  t5(p, 'COMPOSURE', 6, HUD_TOP + 2, P.tl2, 0.95);
  const step = max > 4 ? 7 : 8;
  for (let i = 0; i < max; i++) {
    const hx = 9 + i * step, hy = HUD_TOP + 12, filled = i < n;
    if (filled) {
      p.hline(hx, hx + 1, hy, P.rd2); p.hline(hx + 3, hx + 4, hy, P.rd2);
      p.hline(hx - 1, hx + 5, hy + 1, P.rd2); p.hline(hx - 1, hx + 5, hy + 2, P.rd2);
      p.hline(hx, hx + 4, hy + 3, P.rd1); p.hline(hx + 1, hx + 3, hy + 4, P.rd1); p.px(hx + 2, hy + 5, P.rd0);
      p.px(hx, hy + 1, P.rd4); p.px(hx + 1, hy, P.rd3);
    } else {
      p.hline(hx, hx + 1, hy, P.pa1, 0.5); p.hline(hx + 3, hx + 4, hy, P.pa1, 0.5);
      p.hline(hx - 1, hx + 5, hy + 1, P.pa1, 0.45);
      p.hline(hx, hx + 4, hy + 2, P.pa1, 0.4); p.hline(hx + 1, hx + 3, hy + 3, P.pa1, 0.35); p.px(hx + 2, hy + 4, P.pa1, 0.3);
    }
  }
}

// WIRE — the single-slot commitment made visible: READY / ARMED / FIRING / BUFFERED.
function hudWireSlot(p, world) {
  const maxSlots = world.souvenirs && world.souvenirs.has('secondBarrel') ? 2 : 1;
  t5(p, maxSlots > 1 ? 'WIRE x2' : 'WIRE', 76, HUD_TOP + 2, P.tl2, 0.95);
  const busy = world.wires ? world.wires.length : (world.wire ? 1 : 0);
  const state = busy >= maxSlots ? 'FIRING' : (busy > 0 ? 'ARMED' : (world.fireBuffer > 0 ? 'BUFFERED' : 'READY'));
  const flash = world.deniedFlashTicks > 0;
  const col = flash ? P.wht : (busy >= maxSlots ? P.gd3 : (busy > 0 ? P.tl3 : (world.fireBuffer > 0 ? P.tl3 : '#4fae63')));
  p.fcircle(80, HUD_TOP + 14, 3, shade(col, -0.35)); p.fcircle(80, HUD_TOP + 14, 2, col); p.px(79, HUD_TOP + 13, shade(col, 0.6));
  p.glow(80, HUD_TOP + 14, 7, col, flash ? 0.6 : 0.35, 2);
  t5(p, state, 88, HUD_TOP + 10, flash ? P.wht : P.ink, 0.95);
  if (world.souvenirs && world.souvenirs.has('gallerySidearm')) {
    t5(p, `X${world.sidearmAmmo}`, 88 + w5(state) + 4, HUD_TOP + 11, ACCENT_RED, 0.95);
  }
}

// The stage reading, and how many balloons are still aloft.
function hudStageLabel(p, world) {
  const cx = Math.round(NATIVE.w / 2);
  const label = String(world.stageLabel || '');
  t5c(p, label, cx, HUD_TOP + 2, P.ink, 1);
  t5c(p, label, cx + 1, HUD_TOP + 2, P.ink, 0.35);                       // faux-bold
  t5c(p, `${world.balloons.length} ALOFT`, cx, HUD_TOP + 12, P.tl2, 0.9);
}

// CHAIN — the tick-denominated window as a draining bar, plus the live multiplier.
function hudChainMeter(p, world) {
  t5(p, 'CHAIN', 306, HUD_TOP + 2, P.tl2, 0.95);
  const active = world.chain > 1 && world.tick <= world.chainExpireTick;
  const remain = active ? clamp(Math.max(0, world.chainExpireTick - world.tick) / CHAIN.windowTicks, 0, 1) : 0;
  const bx = 306, by = HUD_TOP + 12, bw = 40, bh = 6;
  p.rect(bx, by, bw, bh, P.ink, 0.85);
  p.frect(bx + 1, by + 1, bw - 2, bh - 2, P.pa5, 0.55);
  const fill = Math.round((bw - 2) * remain);
  if (fill > 0) {
    for (let i = 0; i < fill; i++) for (let j = 0; j < bh - 2; j++) {
      p.px(bx + 1 + i, by + 1 + j, rampAt(R.gold, clamp(0.75 - j * 0.10, 0, 1), bx + 1 + i, by + 1 + j));
    }
    p.px(bx + fill, by + 1, P.gd5, 0.9);
  }
  const mult = CHAIN.mult[Math.min(CHAIN.mult.length - 1, Math.max(0, world.chain - 1))] || 1;
  t5(p, `x${active ? mult : 1}`, 348, HUD_TOP + 11, active ? ACCENT_RED : P.pa1, active ? 1 : 0.8);
}

// PAR — a bandstand clock. Past par the ring goes red AND the word changes, so the
// state is never colour-only or audio-only.
function hudParDial(p, world) {
  const over = world.tick > world.parTicks && !world.parOff;
  const frac = clamp(world.tick / Math.max(1, world.parTicks), 0, 1);
  const cx = 372, cy = HUD_TOP + 14, R2 = 5;
  t5(p, world.parOff ? 'OFF' : (over ? 'BELL' : 'PAR'), 358, HUD_TOP + 2, over ? ACCENT_RED : P.tl2, 0.95);
  p.fcircle(cx, cy, R2, P.pa5);
  p.circle(cx, cy, R2, over ? P.rd2 : P.ink, 0.9);
  // the swept arc
  const steps = 28;
  for (let i = 0; i <= steps * frac; i++) {
    const ang = -Math.PI / 2 + (i / steps) * Math.PI * 2;
    p.px(Math.round(cx + Math.cos(ang) * R2), Math.round(cy + Math.sin(ang) * R2), over ? P.rd3 : P.tl3, 0.95);
  }
  const ang = -Math.PI / 2 + frac * Math.PI * 2;
  p.line(cx, cy, Math.round(cx + Math.cos(ang) * (R2 - 1)), Math.round(cy + Math.sin(ang) * (R2 - 1)), P.ink);
  p.px(cx, cy, P.ink);
  if (over) p.glow(cx, cy, 9, P.rd2, 0.30, 2);
}

function hudScoreTickets(p, world) {
  const right = NATIVE.w - 8;
  t5(p, 'SCORE', 390, HUD_TOP + 2, P.tl2, 0.95);
  const score = String(world.score).padStart(5, '0');
  t5r(p, score, right, HUD_TOP + 2, P.ink, 1);
  t5(p, 'TICKETS', 390, HUD_TOP + 12, P.tl2, 0.95);
  const tix = String(world.tickets);
  // a little ticket stub, then the count
  const tx = right - w5(tix) - 12;
  const ty = HUD_TOP + 12;
  p.frect(tx, ty, 9, 6, P.gd3); p.rect(tx, ty, 9, 6, P.gd1, 0.9);
  p.hline(tx + 1, tx + 7, ty, P.gd5, 0.7); p.px(tx + 4, ty + 3, P.rd2);
  t5r(p, tix, right, ty, P.ink, 1);
}

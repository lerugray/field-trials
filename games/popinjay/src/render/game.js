// game.js — the gameplay renderer, drawn at NATIVE 480x300 and presented to the
// logical VIEW nearest-neighbor (CLAUDE.md rule 1: code-generated art only; rule 5:
// every mechanic has a visible representation; rule 11: photosensitivity — pop
// effects are localized fading rings, NEVER full-nativeBuf flashes >3/sec).
//
// Pure draw: takes a 2D context, the sim World, and the logical size; touches no
// `window` and never mutates sim state. World coordinates are VIEW coordinates; they
// are scaled by S = 480/VIEW.w on the way to the pixel buffer and NOTHING else about
// them changes — hitboxes, timing and physics are the sim's and are untouched.
//
// CLASS LEGIBILITY IS A HARD CONSTRAINT. At native scale the four balloon classes are
// r = 17 / 13 / 8 / 5 px. They stay instantly distinguishable by SIZE first, then by
// SILHOUETTE + ORNAMENT (gores+crown / twin ribbons / star pips / plain pip) and by
// their base fitting — colour is only ever the third channel, so the colourblind
// proofs hold.

import { CLASSES, CHAIN } from '../tuning.js';
import { classPhysics } from '../sim/balloon.js';
import { CLIMB } from '../sim/player.js';
import { NATIVE, NativeScreen, P, R, rampAt, rampOf, clamp, lerp, shade, bay, fbm, t3, t5, t3c, t5c, t5sc, w3, w5 } from './px.js';
import { paintVista, GROUND, HORIZON, HUD_H } from './vistas.js';

// The shared native art plate. drawGame, drawHUD and the overlay chrome paint into it;
// registered period typography is composited once at display resolution afterward.
const nativeBuf = new NativeScreen();
export function nativeScreen() { return nativeBuf; }
export function nativeScale(viewW) { return NATIVE.w / viewW; }

// The game's committed colour language, and the seed px.js's ramps are grown from.
// Typography lives in fontData.js + px.js and never enters the gameplay simulation.
export const GAME_PAL = {
  skyTop: '#cfe3e0', paper: '#f2e4c4', ink: '#2a2622',
  red: '#b0432f', teal: '#2f6d6a', gold: '#c8912f', cream: '#faf1dc',
  ground: '#c9a36b', ground2: '#a8834e', wood: '#8a5a33', wire: '#d9b45a',
};

const CONFETTI_COLS = ['#b0432f', '#2f6d6a', '#c8912f', '#faf1dc', '#8a4b9c'];
function chainMult(chain) { return CHAIN.mult[Math.min(CHAIN.mult.length - 1, Math.max(0, chain - 1))] || 1; }

// Per-class balloon tint + ornament tint (unchanged tints — the colourblind proofs
// and the player's learned colour language both depend on these staying put).
const CLASS_TINT = {
  grand: { fill: '#b0432f', orn: '#e7c76b' },
  parade: { fill: '#2f6d6a', orn: '#e7c76b' },
  fair: { fill: '#c8912f', orn: '#7a2f22' },
  penny: { fill: '#8a4b9c', orn: '#faf1dc' },
};
const CLASS_RAMP = Object.fromEntries(Object.entries(CLASS_TINT).map(([k, v]) => [k, rampOf(v.fill)]));
const DROP_COL = { medallion: '#e2b53a', slow: '#7a6cc4', freeze: '#8fc7e6', shield: '#3c8a63', dynamite: '#b0432f' };

// A stable art seed per stage — the same stage always paints the same backdrop.
function artSeed(meta) {
  const loc = (meta && meta.locale) || 1;
  const st = (meta && meta.stage) || 1;
  const n = typeof st === 'number' ? st : (st === 'finale' ? 91 : st === 'endless' ? 97 : 89);
  return ((loc * 73856093) ^ (n * 19349663)) >>> 0;
}

export function drawGame(ctx, world, { w, h }, effects) {
  const S = NATIVE.w / w;
  const p = nativeBuf.painter;
  const meta = world.stage.meta || {};
  const stageKey = meta.finale ? (meta.endless ? 'endless' : 'finale') : (meta.stage || 1);

  paintVista(p, { locale: meta.locale || 1, stage: stageKey, seed: artSeed(meta) });

  if (world.stage.windBands && world.stage.windBands.length) drawWindBands(p, world.stage.windBands, S, world.tick || 0);
  drawStage(p, world.stage, S, meta.locale || 1);
  if (world.dripPending) drawDripTelegraph(p, world.dripPending, S);

  // Opera Glasses: ghost apex markers on Grand + Parade arcs (the trajectory hint).
  if (world.souvenirs && world.souvenirs.has('operaGlasses')) {
    for (const b of world.balloons) {
      if (b.cls !== 'grand' && b.cls !== 'parade') continue;
      const apexY = Math.round((b.baseY - classPhysics(b.cls, b.weighted).effectiveApex) * S);
      const bx = Math.round(b.x * S);
      for (let i = -6; i <= 6; i++) if ((i + 60) % 3 !== 2) p.px(bx + i, apexY, P.ink, 0.42);
    }
  }

  for (const d of world.drops) drawDrop(p, d, S);
  for (const b of world.balloons) drawBalloon(p, b, b.id === world.culpritId, S);
  for (const wire of world.wires) drawWire(p, wire, S);
  for (const s of world.sidearmShots) drawShot(p, s, S);
  drawPlayer(p, world.player, S);
  if (effects) effects.draw(p, S);
  drawEffectBadges(p, world);
  if (world.dynamiteFuse > 0) drawDynamiteFuse(p, world);

  nativeBuf.present(ctx, w, h); // retained for tests that paint a single layer; app presents once
}

// -- stage geometry -----------------------------------------------------------
// The ground slab is the boardwalk the player stands on; platforms are timber
// staging; breakables are crates. All shaded, none flat-filled.
function drawStage(p, stage, S, locale) {
  for (const s of stage.solids) {
    if (s.kind === 'breakable' && !s.intact) continue;
    const x0 = Math.floor(s.x0 * S), x1 = Math.ceil(s.x1 * S) - 1;
    const top = Math.floor(s.top * S), bot = Math.ceil(s.bottom * S) - 1;
    if (s.kind === 'ground') drawBoardwalk(p, x0, x1, top, bot, locale);
    else if (s.kind === 'breakable') drawCrate(p, x0, x1, top, bot);
    else drawStaging(p, x0, x1, top, bot);
  }
  for (const l of stage.ladders) {
    drawLadder(p, Math.floor(l.x0 * S), Math.ceil(l.x1 * S) - 1, Math.floor(l.top * S), Math.ceil(l.bottom * S) - 1);
  }
}

const boardNoise = fbm(61, 4);
function drawBoardwalk(p, x0, x1, top, bot, locale) {
  const salt = locale === 2;                       // pier decking is salt-bleached
  const ramp = locale === 3
    ? ['#2a211c', '#42332a', '#5d4736', '#7a5e46', '#9a7a5c', '#b89a78']   // sleeper timber
    : R.wood;
  for (let y = top; y <= bot; y++) {
    const plank = Math.floor((y - top) / 7), seed = plank * 17.3;
    for (let x = x0; x <= x1; x++) {
      let t = 0.40 + ((plank % 2) ? 0.06 : -0.04) + (boardNoise(x * 0.05, (y + seed) * 0.34) - 0.5) * 0.36 + ((y - top) / Math.max(1, bot - top)) * 0.05;
      p.px(x, y, rampAt(ramp, clamp(t, 0, 1), x, y));
      if (salt) {
        const v = boardNoise(x * 0.09, y * 0.22);
        if (v > 0.55) p.px(x, y, '#c2bba8', clamp((v - 0.55) * 1.6, 0, 0.38));
      }
    }
  }
  for (let pk = 0; top + pk * 7 <= bot; pk++) {
    const py = top + pk * 7;
    p.hline(x0, x1, py, P.wd0, 0.72);
    p.hline(x0, x1, py + 1, salt ? '#ddd5c0' : P.wd5, 0.24);
    for (let n = x0 + 14; n < x1; n += 39) { p.px(n, py + 2, '#4a3c2a', 0.8); p.px(n, py + 5, '#4a3c2a', 0.8); }
    for (let b = 0; b < 3; b++) { const bx = x0 + ((pk * 71) + b * 157) % Math.max(1, x1 - x0); p.vline(bx, py + 1, Math.min(bot, py + 6), P.wd0, 0.55); }
  }
  // the lit nosing where the boardwalk meets the ground, and its shadow line
  p.hline(x0, x1, top, P.wd5, 0.55);
  p.hline(x0, x1, top - 1, P.wd1, 0.35);
  for (let x = x0; x <= x1; x++) p.mul(x, top - 2, '#2a1e10', 0.30);
}

function drawStaging(p, x0, x1, top, bot) {
  const h = bot - top + 1;
  for (let y = top; y <= bot; y++) {
    const d = (y - top) / Math.max(1, h - 1);
    for (let x = x0; x <= x1; x++) {
      let t = 0.56 - d * 0.30 + (boardNoise(x * 0.07, y * 0.5) - 0.5) * 0.24;
      p.px(x, y, rampAt(R.wood, clamp(t, 0, 1), x, y));
    }
  }
  p.hline(x0, x1, top, P.wd5, 0.9);                    // the lit top edge = the ledge
  p.hline(x0, x1, top + 1, shade(P.wd5, 0.2), 0.35);
  p.hline(x0, x1, bot, P.wd0, 0.85);
  p.vline(x0, top, bot, P.wd1, 0.7); p.vline(x1, top, bot, P.wd1, 0.7);
  for (let x = x0 + 4; x < x1; x += 11) { p.vline(x, top + 1, bot - 1, P.wd1, 0.35); p.px(x + 1, top + 2, P.wd5, 0.22); }
  for (let x = x0 + 2; x < x1; x += 22) { p.px(x, top + 2, '#4a3c2a', 0.8); p.px(x, bot - 2, '#4a3c2a', 0.8); }
  for (let x = x0; x <= x1; x++) p.mul(x, bot + 1, '#241a10', 0.34);   // it casts down
}

function drawCrate(p, x0, x1, top, bot) {
  const h = bot - top + 1;
  for (let y = top; y <= bot; y++) {
    const d = (y - top) / Math.max(1, h - 1);
    for (let x = x0; x <= x1; x++) {
      p.px(x, y, rampAt(R.rust, clamp(0.52 - d * 0.24 + (boardNoise(x * 0.09, y * 0.4) - 0.5) * 0.22, 0, 1), x, y));
    }
  }
  p.rect(x0, top, x1 - x0 + 1, h, P.rd0, 0.85);
  p.hline(x0 + 1, x1 - 1, top + 1, P.rd4, 0.6);
  // the diagonal bracing that says "this one can break"
  p.line(x0 + 1, top + 1, x1 - 1, bot - 1, P.rd0, 0.55);
  p.line(x1 - 1, top + 1, x0 + 1, bot - 1, P.rd0, 0.55);
  p.line(x0 + 2, top + 1, x1 - 1, bot - 2, P.rd5, 0.18);
  for (const [cx, cy] of [[x0, top], [x1 - 2, top], [x0, bot - 2], [x1 - 2, bot - 2]]) p.frect(cx, cy, 3, 3, P.gd2, 0.9);
  for (let x = x0; x <= x1; x++) p.mul(x, bot + 1, '#241a10', 0.30);
}

function drawLadder(p, x0, x1, top, bot) {
  for (const rx of [x0 + 1, x1 - 1]) {
    for (let y = top; y <= bot; y++) p.px(rx, y, rampAt(R.gold, clamp(0.34 + (y % 3 === 0 ? -0.08 : 0.04), 0, 1), rx, y));
    p.vline(rx + 1, top, bot, P.gd0, 0.5);
  }
  for (let y = top + 3; y < bot; y += 7) {
    p.hline(x0 + 1, x1 - 1, y, P.gd4, 0.95);
    p.hline(x0 + 1, x1 - 1, y + 1, P.gd1, 0.8);
  }
}

// Wind bands: bunting streamers over a warm wash — unmistakable against the sea.
// Deterministic scroll from the sim tick (render-only; never touches sim state).
export const EFFECT_BADGE_Y = 42; // below the valance shadow (rows 35–41)

function drawWindBands(p, bands, S, tick) {
  const streamCols = [R.gold[2], R.rust[2], R.teal[2], R.paper[3]];
  for (const b of bands) {
    const y0 = Math.floor(b.y0 * S), y1 = Math.ceil(b.y1 * S);
    const dir = b.vx >= 0 ? 1 : -1;
    // Warm air mass — contrast-shifted off the sea palette.
    for (let y = y0; y < y1; y++) for (let x = 0; x < NATIVE.w; x++) p.add(x, y, '#c89050', 0.14);
    for (let x = 0; x < NATIVE.w; x++) {
      p.px(x, y0, P.ink0, 0.62); p.px(x, y0 + 1, P.gd3, 0.45);
      p.px(x, y1 - 2, P.gd3, 0.45); p.px(x, y1 - 1, P.ink0, 0.62);
    }
    const off = ((tick * dir * 2) % 14 + 14) % 14;
    for (let x = -14 + off; x < NATIVE.w + 14; x += 14) {
      const sx = Math.round(x);
      const col = streamCols[(Math.abs(sx) + Math.floor(y0 / 7)) % streamCols.length];
      for (let y = y0 + 3; y < y1 - 4; y += 8) {
        p.vline(sx, y, y + 5, col, 0.88);
        p.px(sx, y, shade(col, 0.35), 0.9);
        const ax = sx + 3 * dir, ay = y + 3;
        p.fpoly([[sx, y + 1], [ax, ay], [sx, y + 5]], shade(col, -0.15), 0.82);
        p.px(ax, ay, P.ink0, 0.55);
      }
    }
  }
}

// The closing-bell drip telegraph — a ~2 Hz pulse (rule 11 safe, well under 3/s).
function drawDripTelegraph(p, t, S) {
  const phase = (t.ticksLeft % 30) / 30;
  const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
  const x = Math.round(t.x * S), y = Math.round(t.y * S);
  p.circle(x, y, 7, P.rd2, a);
  p.circle(x, y, 6, P.rd3, a * 0.5);
  p.fpoly([[x - 4, y + 9], [x + 4, y + 9], [x, y + 14]], P.rd2, Math.min(1, a + 0.15));
  p.glow(x, y, 14, P.rd3, a * 0.35, 2.2);
  t5c(p, '!', x + 1, y - 3, P.ink, Math.min(1, a + 0.2));
}

// -- drops: SILHOUETTE-first, colour second; a ~2 Hz blink warns of expiry ------
function drawDrop(p, d, S) {
  const a = d.blinking ? (0.4 + 0.6 * (0.5 + 0.5 * Math.cos((d.ttl % 30) / 30 * Math.PI * 2))) : 1;
  const x = Math.round(d.x * S), y = Math.round(d.y * S);
  const r = Math.max(3, Math.round(d.radius * S));
  const col = DROP_COL[d.kind] || GAME_PAL.gold;
  const ramp = rampOf(col);
  p.shadowPool(x, y + r + 1, r, 2, 0.30 * a);
  if (d.kind === 'medallion') {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const dd = Math.sqrt(i * i + j * j); if (dd > r) continue;
      const nx = i / r, ny = j / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      p.px(x + i, y + j, rampAt(ramp, clamp(-(nx * -0.5 + ny * -0.6) * 0.8 + nz * 0.5, 0, 1), x + i, y + j), a);
    }
    p.circle(x, y, r, P.gd0, a * 0.8);
    p.circle(x, y, Math.max(1, r - 2), P.pa5, a * 0.55);
    p.px(x, y - 1, P.pa5, a); p.px(x - 1, y, P.pa5, a); p.px(x + 1, y, P.pa5, a); p.px(x, y + 1, P.pa5, a);
    p.glow(x, y, r * 3, col, 0.28 * a, 2.2);
  } else if (d.kind === 'slow') {                     // hourglass
    p.fpoly([[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]], col, a);
    p.line(x - r, y - r, x + r, y - r, shade(col, 0.5), a); p.line(x - r, y + r, x + r, y + r, shade(col, -0.4), a);
    p.px(x, y, P.pa5, a * 0.9);
    p.glow(x, y, r * 3, col, 0.22 * a, 2.2);
  } else if (d.kind === 'freeze') {                   // snowflake
    for (let i = 0; i < 6; i++) {
      const ang = i / 6 * Math.PI * 2;
      p.line(x, y, Math.round(x + Math.cos(ang) * r), Math.round(y + Math.sin(ang) * r), col, a);
      p.px(Math.round(x + Math.cos(ang) * r * 0.6), Math.round(y + Math.sin(ang) * r * 0.6), shade(col, 0.5), a);
    }
    p.px(x, y, P.pa5, a);
    p.glow(x, y, r * 3, col, 0.26 * a, 2.2);
  } else if (d.kind === 'shield') {                   // crest
    p.fpoly([[x, y - r], [x + r, y - r * 0.4], [x + r * 0.7, y + r], [x, y + r * 0.6], [x - r * 0.7, y + r], [x - r, y - r * 0.4]], col, a);
    p.line(x, y - r, x + r, y - r * 0.4, shade(col, 0.5), a * 0.8);
    p.line(x, y - r + 2, x, y + r * 0.4, shade(col, 0.35), a * 0.7);
    p.glow(x, y, r * 3, col, 0.22 * a, 2.2);
  } else if (d.kind === 'dynamite') {                 // bomb + fuse
    p.fcircle(x, y + 1, Math.max(2, r - 1), shade(col, -0.35), a);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const dd = Math.sqrt(i * i + (j - 1) * (j - 1)); if (dd > r - 1) continue;
      const nx = i / r, ny = (j - 1) / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      p.px(x + i, y + 1 + j, rampAt(ramp, clamp(-(nx * -0.5 + ny * -0.6) * 0.8 + nz * 0.45, 0, 1), x + i, y + 1 + j), a);
    }
    p.line(x, y - r + 1, x + 2, y - r - 2, P.gd3, a);
    p.px(x + 3, y - r - 3, '#fff0c0', a); p.glow(x + 3, y - r - 3, 6, P.gd4, 0.5 * a, 2);
  }
}

// -- active-effect badges ------------------------------------------------------
function drawEffectBadges(p, world) {
  const badges = [];
  if (world.freeze > 0) badges.push(['FREEZE', DROP_COL.freeze]);
  if (world.timeSlow > 0) badges.push(['SLOW', DROP_COL.slow]);
  if (world.shield) badges.push(['SHIELD', DROP_COL.shield]);
  if (!badges.length) return;
  let y = EFFECT_BADGE_Y;
  for (const [label, col] of badges) {
    const bw = w5(label) + 8;
    p.frect(6, y, bw, 9, shade(col, -0.45), 0.92);
    p.frect(6, y, bw, 1, shade(col, 0.35), 0.9);
    p.rect(6, y, bw, 9, P.ink0, 0.85);
    t5(p, label, 10, y + 2, P.pa5, 1);
    y += 12;
  }
}

// The lit dynamite fuse: a centre-top countdown + a pulsing pip. Telegraphed, never
// an instant flip; rule 11 safe (a smooth ~3 Hz alpha ease, no flash).
function drawDynamiteFuse(p, world) {
  const secs = (world.dynamiteFuse / 60).toFixed(1);
  const pulse = 0.5 + 0.5 * Math.cos((world.dynamiteFuse % 20) / 20 * Math.PI * 2);
  const label = `DYNAMITE ${secs}`;
  const bw = w5(label) + 26, bx = Math.round((NATIVE.w - bw) / 2), by = 42, bh = 15;
  p.frect(bx, by, bw, bh, P.rd1, 0.9);
  p.frect(bx, by, bw, 1, P.rd3, 0.9);
  p.rect(bx, by, bw, bh, P.ink0, 0.9);
  p.frect(bx + 1, by + bh - 1, bw - 2, 1, P.rd0, 0.8);
  t5(p, label, bx + 20, by + 4, P.pa5, 1);
  const px = bx + 10, py = by + 7;
  p.fcircle(px, py, 3, P.ink0, 0.55 + 0.45 * pulse);
  p.px(px, py - 4, P.gd4, 0.8 + 0.2 * pulse);
  p.glow(px, py - 4, 5 + Math.round(pulse * 3), P.gd3, 0.4 * pulse, 2);
}

// -- balloons ------------------------------------------------------------------
// Size is the first channel, ornament the second, colour the third.
function drawBalloon(p, b, isCulprit, S) {
  const t = CLASS_TINT[b.cls] || CLASS_TINT.grand;
  const ramp = CLASS_RAMP[b.cls] || CLASS_RAMP.grand;
  const x = Math.round(b.x * S), y = Math.round(b.y * S);
  const r = Math.max(3, Math.round(b.radius * S));

  // WEIGHTED GORE: an iron, spiked silhouette — heavier at a glance, and readable
  // even at penny size because the spikes break the circle.
  if (b.weighted) {
    const spikes = r > 10 ? 12 : 8, len = Math.max(2, Math.round(r * 0.34));
    for (let i = 0; i < spikes; i++) {
      const a = i / spikes * Math.PI * 2;
      const nx = Math.cos(a), ny = Math.sin(a);
      p.fpoly([
        [x + nx * r - ny * 1.6, y + ny * r + nx * 1.6],
        [x + nx * (r + len), y + ny * (r + len)],
        [x + nx * r + ny * 1.6, y + ny * r - nx * 1.6],
      ], rampAt(R.iron, clamp(0.30 + nx * 0.28, 0, 1), x + (nx * r) | 0, y + (ny * r) | 0));
      p.px(Math.round(x + nx * (r + len)), Math.round(y + ny * (r + len)), P.sl5, 0.7);
    }
  }

  // The body, shaded by its own normal — a hand-tinted rubber orb, never a flat disk.
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const d = Math.sqrt(i * i + j * j); if (d > r) continue;
    const nx = i / r, ny = j / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const lit = clamp(-(nx * -0.55 + ny * -0.6) * 0.85 + nz * 0.5, 0, 1) * 0.9 + 0.06;
    p.px(x + i, y + j, rampAt(ramp, clamp(lit, 0, 1), x + i, y + j));
  }
  // Thin ink outline (art law) — legible against busy vistas, especially fair gold.
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const d = Math.sqrt(i * i + j * j);
    if (d > r - 1.05 && d <= r + 0.35) p.px(x + i, y + j, P.ink0, d > r - 0.55 ? 0.88 : 0.55);
  }

  ornament(p, b, x, y, r, t, ramp);
  baseFitting(p, b, x, y, r, t);

  // specular + the rim opposite it
  const sx = x - Math.round(r * 0.36), sy = y - Math.round(r * 0.4);
  if (r >= 5) { p.fcircle(sx, sy, Math.max(1, Math.round(r * 0.16)), '#fff8e4', 0.85); p.glow(sx, sy, Math.round(r * 1.2), '#ffe9b8', 0.16, 2); }
  else { p.px(sx, sy, '#fff8e4', 0.95); }
  for (let a = 0; a < 26; a++) {
    const th = Math.PI * (0.15 + a * 0.032);
    p.px(Math.round(x + Math.cos(th) * (r - 0.5)), Math.round(y + Math.sin(th) * (r - 0.5)), shade(t.fill, 0.55), 0.32);
  }

  // Culprit stamp: a bright ring marking WHAT hit you, at the moment of impact.
  if (isCulprit) {
    p.circle(x, y, r + 2, '#f7e04a', 0.95); p.circle(x, y, r + 3, '#f7e04a', 0.55);
    p.circle(x, y, r + 5, P.rd2, 0.85);
    p.glow(x, y, r + 12, '#f7e04a', 0.30, 2.2);
  }
}

// grand  = vertical GORES + a crown band at the shoulder
// parade = twin equator ribbons
// fair   = a scatter of star pips
// penny  = a plain pip (the specular alone)
function ornament(p, b, x, y, r, t, ramp) {
  if (b.cls === 'grand') {
    for (let m = -2; m <= 2; m++) {
      for (let yy = -r + 1; yy <= r - 1; yy++) {
        const wq = Math.sqrt(Math.max(0, r * r - yy * yy));
        const xo = Math.round(Math.sin(m * 0.55) * wq * 0.85);
        if (Math.abs(xo) > wq - 1) continue;
        p.px(x + xo, y + yy, t.orn, 0.34 + 0.2 * (1 - Math.abs(m) / 3));
      }
    }
    const cy = y - Math.round(r * 0.3);
    for (let i = -r + 1; i <= r - 1; i++) {
      const yo = Math.round(-Math.sqrt(Math.max(0, r * r - i * i)) * 0.10);
      if (Math.abs(i) > r - 2) continue;
      p.px(x + i, cy + yo, t.orn, 0.8); p.px(x + i, cy + yo + 1, shade(t.orn, 0.4), 0.6);
    }
  } else if (b.cls === 'parade') {
    for (const [fy, aa] of [[-0.2, 0.85], [0.32, 0.7]]) {
      const cy = y + Math.round(r * fy);
      for (let i = -r + 1; i <= r - 1; i++) {
        const lim = Math.sqrt(Math.max(0, r * r - Math.pow(r * fy, 2)));
        if (Math.abs(i) > lim - 1) continue;
        const yo = Math.round(-Math.sqrt(Math.max(0, 1 - (i / r) * (i / r))) * r * 0.08);
        p.px(x + i, cy + yo, t.orn, aa); p.px(x + i, cy + yo + 1, shade(t.orn, -0.25), aa * 0.8);
      }
    }
  } else if (b.cls === 'fair') {
    const n = r >= 7 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i / n * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * r * 0.5), py = Math.round(y + Math.sin(a) * r * 0.5);
      p.px(px, py, t.orn, 0.95);
      if (r >= 7) { p.px(px - 1, py, t.orn, 0.7); p.px(px + 1, py, t.orn, 0.7); p.px(px, py - 1, t.orn, 0.7); p.px(px, py + 1, t.orn, 0.7); }
    }
  }
  // penny: nothing — the plain pip IS its read.
}

function baseFitting(p, b, x, y, r, t) {
  if (b.cls === 'grand') {                             // a dangling tassel
    for (const dx of [-2, 0, 2]) p.line(x + Math.round(dx * 0.5), y + r, x + dx, y + r + Math.round(r * 0.3), t.orn, 0.9);
    p.fcircle(x, y + r + Math.round(r * 0.38), Math.max(1, Math.round(r * 0.13)), t.orn);
    p.px(x, y + r + Math.round(r * 0.38) - 1, shade(t.orn, 0.5), 0.8);
  } else if (b.cls === 'parade') {                     // a ribbon knot
    p.fpoly([[x - 2, y + r], [x - 4, y + r + 3], [x, y + r + 1], [x + 4, y + r + 3], [x + 2, y + r]], t.orn);
    p.px(x, y + r + 1, shade(t.orn, -0.4), 0.8);
  } else {                                             // fair + penny: a knot triangle
    p.fpoly([[x - 2, y + r - 1], [x + 2, y + r - 1], [x, y + r + 2]], shade(t.fill, -0.3));
    p.px(x, y + r, shade(t.fill, 0.3), 0.6);
  }
}

// -- the wire, shots, player ---------------------------------------------------
function drawWire(p, wire, S) {
  const x = Math.round(wire.x * S);
  const y0 = Math.round(wire.bottomY * S), y1 = Math.round(wire.tipY * S);
  if (wire.anchored) {                                 // Sky Anchor: a standing wall
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      p.add(x, y, '#f7e04a', 0.30); p.add(x - 1, y, '#f7e04a', 0.16); p.add(x + 1, y, '#f7e04a', 0.16);
    }
  }
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    p.px(x, y, '#ffe58a', 0.95);
    p.px(x - 1, y, P.gd2, 0.45); p.px(x + 1, y, P.gd2, 0.45);
  }
  // the barbed head
  p.fpoly([[x, y1 - 4], [x - 3, y1 + 2], [x + 3, y1 + 2]], P.gd4);
  p.px(x, y1 - 4, '#fff6d8'); p.px(x - 3, y1 + 2, P.gd1, 0.8); p.px(x + 3, y1 + 2, P.gd1, 0.8);
  p.glow(x, y1, 7, '#ffe58a', 0.34, 2);
}

function drawShot(p, s, S) {
  const x = Math.round(s.x * S), y = Math.round(s.y * S);
  for (let j = 0; j < 5; j++) p.px(x, y + j, P.gd3, 0.7 - j * 0.12);
  p.px(x, y, '#fff6d8'); p.px(x, y - 1, P.gd5, 0.8);
  p.glow(x, y, 5, P.gd4, 0.45, 2);
}

function drawPlayerHead(p, x, top, hgt) {
  const hy = top + Math.round(hgt * 0.22);
  p.fcircle(x, hy, 3, '#d8a87a');
  p.px(x - 1, hy, P.ink); p.px(x + 1, hy, P.ink);
  p.hline(x - 1, x + 1, hy + 2, shade('#d8a87a', -0.35));
  p.hline(x - 6, x + 6, hy - 3, P.rd2); p.hline(x - 6, x + 6, hy - 2, shade(P.rd2, -0.35));
  for (let j = 0; j < 4; j++) p.hline(x - 3, x + 3, hy - 7 + j, rampAt(R.rust, 0.62 - j * 0.06, x, hy + j));
  p.hline(x - 3, x + 3, hy - 4, P.gd3, 0.85);
}

function drawPlayerStand(p, x, feet, top, hgt, f) {
  const legT = Math.round(hgt * 0.34);
  p.frect(x - 3, feet - legT, 2, legT, P.ink);
  p.frect(x + 2, feet - legT, 2, legT, P.ink);
  p.hline(x - 4, x - 1, feet, P.ink0); p.hline(x + 2, x + 5, feet, P.ink0);

  const coatTop = top + Math.round(hgt * 0.30), coatH = hgt - legT - Math.round(hgt * 0.30) + 1;
  for (let j = 0; j < coatH; j++) for (let i = -5; i <= 5; i++) {
    const u = (i + 5) / 10;
    p.px(x + i, coatTop + j, rampAt(R.teal, clamp(0.30 + (f < 0 ? (1 - u) : u) * 0.5 - j * 0.012, 0, 1), x + i, coatTop + j));
  }
  p.vline(x, coatTop + 1, coatTop + coatH - 1, P.pa4, 0.8);
  p.px(x, coatTop + 2, P.gd4); p.px(x, coatTop + 5, P.gd4);

  p.line(x, coatTop + 2, x + f * 5, top + Math.round(hgt * 0.16), P.ink);
  p.fcircle(x + f * 5, top + Math.round(hgt * 0.14), 2, P.gd3);
  p.px(x + f * 5, top + Math.round(hgt * 0.14) - 1, P.gd5, 0.9);

  drawPlayerHead(p, x, top, hgt);
}

function drawPlayerClimb(p, x, feet, top, hgt, pl) {
  const legT = Math.round(hgt * 0.34);
  const coatTop = top + Math.round(hgt * 0.30);
  const coatH = hgt - legT - Math.round(hgt * 0.30) + 1;
  // Two-frame leg cycle keyed to vertical travel; idle-on-ladder holds phase 0.
  const legPhase = Math.floor(pl.feetY / 9) % 2;
  const raised = Math.round(legT * 0.58);
  const kneeH = Math.max(3, Math.round(hgt * 0.10));

  if (legPhase === 0) {
    p.frect(x - 4, feet - raised, 2, raised - kneeH, P.ink);
    p.frect(x - 5, feet - raised - kneeH, 3, kneeH, P.ink);
    p.hline(x - 5, x - 3, feet - raised - kneeH, P.ink0);
    p.frect(x + 2, feet - legT, 2, legT, P.ink);
    p.hline(x + 1, x + 4, feet, P.ink0);
  } else {
    p.frect(x + 3, feet - raised, 2, raised - kneeH, P.ink);
    p.frect(x + 2, feet - raised - kneeH, 3, kneeH, P.ink);
    p.hline(x + 2, x + 4, feet - raised - kneeH, P.ink0);
    p.frect(x - 3, feet - legT, 2, legT, P.ink);
    p.hline(x - 4, x - 1, feet, P.ink0);
  }

  for (let j = 0; j < coatH; j++) for (let i = -5; i <= 5; i++) {
    const u = Math.abs(i) / 5;
    p.px(x + i, coatTop + j, rampAt(R.teal, clamp(0.34 + u * 0.44 - j * 0.012, 0, 1), x + i, coatTop + j));
  }
  p.vline(x, coatTop + 1, coatTop + coatH - 1, P.pa4, 0.8);
  p.px(x, coatTop + 2, P.gd4); p.px(x, coatTop + 5, P.gd4);

  const shoulderY = coatTop + 2;
  p.line(x - 5, shoulderY, x - 9, shoulderY + 2, P.ink);
  p.line(x + 5, shoulderY, x + 9, shoulderY + 2, P.ink);
  p.fcircle(x - 9, shoulderY + 2, 1, '#d8a87a');
  p.fcircle(x + 9, shoulderY + 2, 1, '#d8a87a');
  p.px(x - 10, shoulderY + 1, P.gd4, 0.95);
  p.px(x + 10, shoulderY + 1, P.gd4, 0.95);

  p.frect(x + 3, coatTop + Math.round(coatH * 0.55), 3, 2, P.gd2);
  p.px(x + 4, coatTop + Math.round(coatH * 0.55) - 1, P.gd5, 0.85);

  drawPlayerHead(p, x, top, hgt);
}

function drawPlayer(p, pl, S) {
  const x = Math.round(pl.x * S);
  const feet = Math.round(pl.feetY * S);
  const hgt = Math.max(10, Math.round(pl.height * S));
  const top = feet - hgt;
  const f = pl.facing >= 0 ? 1 : -1;

  p.shadowPool(x, feet + 1, Math.max(4, Math.round(pl.width * S * 0.7)), 2, 0.5);

  if (pl.invulnerable) {
    const period = pl.iframe < 18 ? 14 : 28;
    const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.cos((pl.iframe % period) / period * Math.PI * 2));
    const hw = Math.round(pl.width * S / 2) + 2;
    p.rect(x - hw, top - 3, hw * 2 + 1, hgt + 5, P.pa5, a);
    p.rect(x - hw - 1, top - 4, hw * 2 + 3, hgt + 7, P.pa4, a * 0.4);
  }

  if (pl.state === CLIMB) drawPlayerClimb(p, x, feet, top, hgt, pl);
  else drawPlayerStand(p, x, feet, top, hgt, f);
}

// -- render-only effects (fed from the sim event queue) ------------------------
export class Effects {
  constructor() { this.items = []; this.calm = false; }
  ingest(events) {
    for (const e of events) {
      if (e.type === 'pop') {
        const chain = e.chain || 1;
        this.items.push({ kind: 'pop', x: e.x, y: e.y, r0: (CLASSES[e.cls] || CLASSES.grand).radius, age: 0, life: 0.34, cls: e.cls, chain });
        if (chain >= 2) {
          this.items.push({ kind: 'chaincall', x: e.x, y: e.y, mult: chainMult(chain), age: 0, life: 0.8 });
          const confettiCap = 72;
          const nConf = this.calm ? 0 : Math.min(chain, 5) * 2;
          const live = this.items.reduce((c, it) => c + (it.kind === 'confetti' ? 1 : 0), 0);
          for (let i = 0; i < nConf && live + i < confettiCap; i++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
            const sp = 60 + Math.random() * 120;
            this.items.push({
              kind: 'confetti', x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
              rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10, col: CONFETTI_COLS[i % CONFETTI_COLS.length], age: 0, life: 0.6 + Math.random() * 0.3,
            });
          }
        }
      } else if (e.type === 'denied') this.items.push({ kind: 'denied', x: e.x, y: e.y, age: 0, life: 0.22 });
      else if (e.type === 'break') this.items.push({ kind: 'break', x: e.x, y: e.y, age: 0, life: 0.3 });
      else if (e.type === 'pickup') this.items.push({ kind: 'banner', x: e.x, y: e.y, text: e.label || '', age: 0, life: 1.4 });
      else if (e.type === 'shieldBreak') this.items.push({ kind: 'shield', x: e.x, y: e.y, age: 0, life: 0.4 });
      else if (e.type === 'cascadeSplit') this.items.push({ kind: 'pop', x: e.x, y: e.y, r0: (CLASSES[e.cls] || CLASSES.grand).radius, age: 0, life: 0.3, cls: e.cls });
      else if (e.type === 'dynamiteBoom') this.items.push({ kind: 'boom', x: e.x, y: e.y, age: 0, life: 0.5 });
    }
  }
  update(dt) {
    for (const it of this.items) {
      it.age += dt;
      if (it.kind === 'confetti') { it.x += it.vx * dt; it.y += it.vy * dt; it.vy += 240 * dt; it.vx *= 0.98; it.rot += it.vr * dt; }
    }
    this.items = this.items.filter((it) => it.age < it.life);
  }
  // Draws into the NATIVE painter. S scales world -> native.
  draw(p, S) {
    for (const it of this.items) {
      const k = it.age / it.life, a = 1 - k;
      const x = Math.round(it.x * S), y = Math.round(it.y * S);
      if (it.kind === 'pop') {
        const chain = it.chain || 1, esc = this.calm ? 0 : Math.min(chain, 4);
        const tint = (CLASS_TINT[it.cls] || CLASS_TINT.grand).fill;
        const r0 = Math.max(2, it.r0 * S);
        p.circle(x, y, Math.round(r0 * (1 + k * (1.4 + esc * 0.25))), tint, a * 0.9);
        p.circle(x, y, Math.round(r0 * (1 + k * (1.4 + esc * 0.25))) + 1, tint, a * 0.35);
        if (chain >= 2 && !this.calm) p.circle(x, y, Math.round(r0 * (0.7 + k * (1.0 + esc * 0.3))), P.gd3, a * 0.8);
        const petals = 6 + esc * 2;
        for (let i = 0; i < petals; i++) {
          const ang = (i / petals) * Math.PI * 2, rr = r0 * (0.6 + k * 1.6);
          const px = Math.round(x + Math.cos(ang) * rr), py = Math.round(y + Math.sin(ang) * rr);
          p.fcircle(px, py, a > 0.5 ? 1 : 0, chain >= 3 ? P.gd4 : tint, a);
        }
        p.glow(x, y, Math.round(r0 * 1.6), chain >= 2 ? P.gd4 : tint, 0.22 * a, 2.2);
      } else if (it.kind === 'confetti') {
        const c = Math.cos(it.rot), s = Math.sin(it.rot);
        for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++) {
          p.px(Math.round(x + i * c - j * s), Math.round(y + i * s + j * c), it.col, a);
        }
      } else if (it.kind === 'chaincall') {
        const yy = y - 6 - Math.round(k * 14);
        t5sc(p, `x${it.mult}`, x, yy, P.gd4, P.ink, a);
      } else if (it.kind === 'denied') {
        p.circle(x, y, Math.round(3 + k * 4), '#8a8378', a);
      } else if (it.kind === 'break') {
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2, rr = 2 + k * 11;
          p.frect(Math.round(x + Math.cos(ang) * rr), Math.round(y + Math.sin(ang) * rr), 2, 2, P.wd3, a);
        }
      } else if (it.kind === 'banner') {
        const yy = y - 8 - Math.round(k * 14);
        t5sc(p, it.text, x, yy, P.pa5, P.ink, a);
      } else if (it.kind === 'shield') {
        p.circle(x, y, Math.round(8 + k * 10), DROP_COL.shield, a);
        p.circle(x, y, Math.round(8 + k * 10) + 1, DROP_COL.shield, a * 0.4);
      } else if (it.kind === 'boom') {
        // a single expanding ring for the fuse blow — NOT a full-nativeBuf flash
        const rr = Math.round(11 + k * 45);
        p.circle(x, y, rr, P.rd2, a * 0.9);
        p.circle(x, y, rr + 1, P.rd3, a * 0.5);
        p.circle(x, y, Math.max(1, rr - 3), P.gd3, a * 0.4);
      }
    }
  }
}

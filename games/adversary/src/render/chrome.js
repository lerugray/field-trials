// chrome.js — UI chrome in the M12-ART register (DIRECTIONS: "HUD panels go dark stone/parchment
// with chunky pixel borders — no default-web styling"). One reusable beveled-panel drawer shared by
// the HUD and the menu so every framed surface reads as carved stone or parchment, lit from the
// upper-left like the sprites. Pure canvas draw; palette-keyed so it never leaves the register.

import { PALETTE, RAMPS } from './palette.js';
import { materialFbm, materialRampKey } from './light.js';

/**
 * Draw a carved material panel: fbm stone/bone, notched corners, directional bevels, recessed
 * groove, rivets, and a shadow cast onto the world. All colors remain in the global register.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{fill?:string, light?:string, dark?:string, ink?:string}} [opts]
 */
export function drawPanel(ctx, x, y, w, h, opts = {}) {
  const {
    fill = '8', light = '6', dark = '1', ink = '0', ramp = RAMPS.stone, seed = 31,
  } = opts;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const noise = materialFbm(seed, 4);
  const missing = (px, py) => {
    const lx = px - x; const ly = py - y;
    const rx = w - 1 - lx; const ry = h - 1 - ly;
    return (lx < 2 && ly < 2 && lx + ly < 2) || (rx < 2 && ly < 2 && rx + ly < 2)
      || (lx < 2 && ry < 2 && lx + ry < 2) || (rx < 2 && ry < 2 && rx + ry < 2);
  };
  // A compact shadow makes the HUD read as an object above the scene.
  ctx.save();
  ctx.globalAlpha = 0.36; ctx.fillStyle = PALETTE[ink];
  ctx.fillRect(x + 2, y + h, w - 1, 2); ctx.fillRect(x + w, y + 2, 2, h - 1);
  ctx.restore();
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    if (missing(px, py)) continue;
    const u = (px - x) / Math.max(1, w - 1); const v = (py - y) / Math.max(1, h - 1);
    let amount = 0.44 - v * 0.20 - u * 0.06;
    amount += (noise(px * 0.13, py * 0.13) - 0.5) * 0.30;
    amount += (noise(px * 0.45, py * 0.45) - 0.5) * 0.13;
    ctx.fillStyle = PALETTE[materialRampKey(ramp, Math.max(0, Math.min(1, amount)), px, py)] || PALETTE[fill];
    ctx.fillRect(px, py, 1, 1);
  }
  // Chamfer-aware outline.
  ctx.fillStyle = PALETTE[ink];
  ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
  // Upper-left bevel and lower-right turn into shadow.
  ctx.fillStyle = PALETTE[light];
  ctx.globalAlpha = 0.56; ctx.fillRect(x + 3, y + 1, w - 6, 1); ctx.fillRect(x + 1, y + 3, 1, h - 6);
  ctx.fillStyle = PALETTE[dark];
  ctx.globalAlpha = 0.78; ctx.fillRect(x + 3, y + h - 2, w - 6, 1); ctx.fillRect(x + w - 2, y + 3, 1, h - 6);
  // Recessed inner groove.
  ctx.fillStyle = PALETTE[ink]; ctx.globalAlpha = 0.50;
  ctx.fillRect(x + 3, y + 3, w - 6, 1); ctx.fillRect(x + 3, y + 3, 1, h - 6);
  ctx.fillStyle = PALETTE[light]; ctx.globalAlpha = 0.22;
  ctx.fillRect(x + 3, y + h - 4, w - 6, 1); ctx.fillRect(x + w - 4, y + 3, 1, h - 6);
  ctx.globalAlpha = 1;
  // Four one-pixel iron rivets, each with its own underside.
  for (const [rx, ry] of [[x + 4, y + 4], [x + w - 5, y + 4], [x + 4, y + h - 5], [x + w - 5, y + h - 5]]) {
    ctx.fillStyle = PALETTE[light]; ctx.fillRect(rx, ry, 1, 1);
    if (ry + 1 < y + h - 1) { ctx.fillStyle = PALETTE[ink]; ctx.globalAlpha = 0.55; ctx.fillRect(rx, ry + 1, 1, 1); ctx.globalAlpha = 1; }
  }
}

/** Stone panel preset (dark HUD chrome). */
export function drawStonePanel(ctx, x, y, w, h) {
  drawPanel(ctx, x, y, w, h, { fill: '8', light: '6', dark: '1', ink: '0', ramp: RAMPS.stone, seed: 31 + x * 3 + y });
}

/** Compact carved frame for a persistent screen-wide scrim. It keeps the same notch, cast-shadow,
 * upper-left bevel, lower-right shade, and iron-rivet language as drawPanel without running a deep
 * material sample under an area that the opaque text channel immediately covers. */
export function drawCarvedScrimFrame(ctx, x, y, w, h) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.save();
  ctx.globalAlpha = 0.36; ctx.fillStyle = PALETTE['0'];
  ctx.fillRect(x + 2, y + h, w - 1, 2); ctx.fillRect(x + w, y + 2, 2, h - 1);
  ctx.globalAlpha = 1; ctx.fillStyle = PALETTE['0'];
  ctx.fillRect(x + 2, y, w - 4, h); ctx.fillRect(x, y + 2, w, h - 4);
  ctx.fillStyle = PALETTE['8']; ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
  ctx.fillRect(x + 1, y + 2, w - 2, h - 4);
  ctx.fillStyle = PALETTE['6']; ctx.globalAlpha = 0.56;
  ctx.fillRect(x + 3, y + 1, w - 6, 1); ctx.fillRect(x + 1, y + 3, 1, h - 6);
  ctx.fillStyle = PALETTE['1']; ctx.globalAlpha = 0.78;
  ctx.fillRect(x + 3, y + h - 2, w - 6, 1); ctx.fillRect(x + w - 2, y + 3, 1, h - 6);
  ctx.globalAlpha = 1;
  for (const [rx, ry] of [[x + 4, y + 4], [x + w - 5, y + 4], [x + 4, y + h - 5], [x + w - 5, y + h - 5]]) {
    ctx.fillStyle = PALETTE['6']; ctx.fillRect(rx, ry, 1, 1);
    ctx.fillStyle = PALETTE['0']; ctx.fillRect(rx, Math.min(y + h - 2, ry + 1), 1, 1);
  }
  ctx.restore();
}

/** Carved scrim with an opaque recessed interior: the same high-contrast backing used by the
 * persistent bottom HUD, exported so pause / menu / clear overlays can share the treatment.
 * A subtle 1-pixel stone dither can be requested to match the carved frame's material texture
 * without risking the text contrast of the gameplay HUD (which keeps the default flat interior). */
export function drawOpaqueScrimPanel(ctx, x, y, w, h, opts = {}) {
  const { fillKey = '1', dither = false } = opts;
  drawCarvedScrimFrame(ctx, x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE[fillKey];
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  if (dither) {
    const dk = '8';
    ctx.fillStyle = PALETTE[dk];
    for (let py = y + 3; py < y + h - 3; py += 2) {
      for (let px = x + 3 + (py & 1); px < x + w - 3; px += 2) {
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

/** Parchment panel preset (menu body — warm bone). */
export function drawParchmentPanel(ctx, x, y, w, h) {
  drawPanel(ctx, x, y, w, h, { fill: 'l', light: 'j', dark: '9', ink: '0', ramp: RAMPS.bone, seed: 47 + x + y * 3 });
}

/** A torn bone nameplate: the weapon field is a second material recessed into the stone. */
export function drawBoneNameplate(ctx, x, y, w, h, seed = 58) {
  const noise = materialFbm(seed, 4);
  ctx.fillStyle = PALETTE['0']; ctx.globalAlpha = 0.78;
  ctx.fillRect(x, y - 1, w, 1); ctx.fillRect(x, y + h, w, 1);
  ctx.globalAlpha = 1;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (px >= w - 1 - (py & 1)) continue; // torn right edge
    let amount = 0.64 - py / Math.max(1, h - 1) * 0.36;
    amount += (noise((x + px) * 0.20, (y + py) * 0.30) - 0.5) * 0.34;
    ctx.fillStyle = PALETTE[materialRampKey(RAMPS.bone, Math.max(0, Math.min(1, amount)), x + px, y + py)];
    ctx.fillRect(x + px, y + py, 1, 1);
  }
  ctx.fillStyle = PALETTE['j']; ctx.globalAlpha = 0.42; ctx.fillRect(x, y, w - 2, 1); ctx.globalAlpha = 1;
}

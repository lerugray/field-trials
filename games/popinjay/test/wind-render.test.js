// wind-render.test.js — locale-2 wind bands must be VISIBLE over the sea (rule 5).

import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW } from '../src/tuning.js';
import { World } from '../src/sim/world.js';
import { generateStage } from '../src/sim/generate.js';
import { drawGame, nativeScreen, EFFECT_BADGE_Y } from '../src/render/game.js';
import { HUD_H } from '../src/render/vistas.js';

const ctx = { imageSmoothingEnabled: false, drawImage() {} };

function relLum([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const l1 = relLum(a), l2 = relLum(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function sampleRgb(p, x, y) {
  return p.get(x, y).slice(0, 3);
}

test('effect badge slot sits below the valance shadow band', () => {
  assert.ok(EFFECT_BADGE_Y >= 42, 'badge stack must clear valance rows 35–41');
  assert.ok(EFFECT_BADGE_Y > HUD_H + 18);
});

test('wind bands measure enough contrast against the locale-2 sea at 1:1', () => {
  const stage = generateStage(12, { locale: 2, stage: 2 });
  assert.ok(stage.windBands.length >= 1);
  const band = stage.windBands[0];
  const world = new World({ seed: 12, stage });
  world.tick = 120;
  drawGame(ctx, world, { w: VIEW.w, h: VIEW.h }, null);
  const p = nativeScreen().painter;
  const S = p.w / VIEW.w;
  const yIn = Math.round((band.y0 + band.y1) / 2 * S);
  const yOut = Math.max(0, Math.round(band.y0 * S) - 8);
  const x = 240;
  const inside = sampleRgb(p, x, yIn);
  const outside = sampleRgb(p, x, yOut);
  const ratio = contrast(inside, outside);
  assert.ok(ratio >= 1.35, `wind band interior vs sea contrast ${ratio.toFixed(2)}:1 is too low`);
  // Streamers leave warm marks distinct from sea dashes.
  let warm = 0;
  for (let y = Math.round(band.y0 * S); y < Math.round(band.y1 * S); y++) {
    const px = sampleRgb(p, x, y);
    if (px[0] - px[2] > 18 && px[0] > px[1]) warm++;
  }
  assert.ok(warm >= 3, 'band zone should carry warm streamer pixels over the sea');
});

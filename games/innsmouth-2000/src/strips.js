// The two bottom bands of chrome for INNSMOUTH 2000: the status strip and the herald band above it.
// Pulled out of main.js so the text-overflow detector (test/text-overflow.test.js) can exercise them
// as pure, canvas-injected draws. They span the full viewport width, so the risk they carry is not a
// side escape but a long line clipping off the right edge; the detector fits each to the viewport.
//
// Player-facing wording stays plain English, period register, no em-dashes (hard rule 10).

import { CHROME } from './palette.js';
import { toolLabel, fitMono } from './ui.js';

// The height of the bottom status strip at a given chrome scale (the herald band stacks above it).
export function statusStripH(scale) { return Math.round(22 * scale); }

// The height of the herald band.
export function heraldBandH(scale) { return Math.round(20 * scale); }

// The OS-chrome status strip along the bottom (STUDY 3): tool, zoom, hovered tile, last refusal.
// The refusal lives here in its own slot; it is never overwritten by a wrath cry (that goes to the
// herald band above). Scales with the chrome text-size setting so it holds the 11-13px floor.
export function drawStatusStrip(ctx, camera, hover, map, tool, message, scale = 1) {
  const h = statusStripH(scale);
  const y = camera.viewportH - h;
  ctx.fillStyle = CHROME.windowFace;
  ctx.fillRect(0, y, camera.viewportW, h);
  ctx.fillStyle = CHROME.bevelLight;
  ctx.fillRect(0, y, camera.viewportW, 2);
  ctx.fillStyle = CHROME.bevelShadow;
  ctx.fillRect(0, camera.viewportH - 2, camera.viewportW, 2);
  ctx.fillStyle = CHROME.ink;
  const px = Math.round(13 * scale);
  ctx.font = `${px}px monospace`;
  ctx.textBaseline = 'middle';
  let label = `INNSMOUTH   ${toolLabel(tool)}   zoom ${camera.zoom}x`;
  if (hover && map.inBounds(hover.col, hover.row)) {
    const t = map.tileAt(hover.col, hover.row);
    label += `   ${hover.col},${hover.row} ${t.terrain}`;
  }
  if (message) label += `   ${message}`;
  ctx.fillText(fitMono(label, camera.viewportW - 16, px), 8, y + h / 2 + 1);
}

// The herald band, just above the status strip: the world's own voice. A wrath in progress cries
// in blood red; a god sinking toward wrath speaks an omen in a sick amber. This is the forecast
// ritual made visible: the player is warned by the town before the disaster ever lands.
export function drawHeraldLine(ctx, camera, text, tone, scale = 1) {
  const h = heraldBandH(scale);
  const y = camera.viewportH - statusStripH(scale) - h;
  const face = tone === 'wrath' ? '#3a1613' : '#3a3113';
  const ink = tone === 'wrath' ? '#f0c0a8' : '#e6d69a';
  const edge = tone === 'wrath' ? '#8a2a22' : '#8a7422';
  ctx.fillStyle = face;
  ctx.fillRect(0, y, camera.viewportW, h);
  ctx.fillStyle = edge;
  ctx.fillRect(0, y, camera.viewportW, 2);
  ctx.fillStyle = ink;
  const px = Math.round(13 * scale);
  ctx.font = `${px}px monospace`;
  ctx.textBaseline = 'middle';
  const tag = tone === 'wrath' ? 'WRATH' : 'OMEN';
  ctx.fillText(fitMono(`${tag}   ${text}`, camera.viewportW - 16, px), 8, y + h / 2 + 1);
}

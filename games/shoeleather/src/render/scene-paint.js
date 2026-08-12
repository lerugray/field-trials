// SHOELEATHER — code-drawn scene backdrops (engine-harness register, PRE-M4).
//
// M0 is the ENGINE milestone. This paints a register-correct smoky interior into the
// framebuffer so the rasterizer, palette and light-rig FEEL are exercised and every
// mechanic has a real picture to sit on — but it is explicitly NOT the M4 art bar
// (CLAUDE.md rule 6: PoC-first, operator-ratified). It is a lit backdrop, not scene
// art claiming the VACUUM SEALED stack.
//
// Technique demonstrated (a modest slice of the stack): a vertical light gradient
// (ceiling glow down to dim floor), a floor plane, a table-lamp pool of warmth, and
// an edge vignette — all dithered to avoid banding. Pure: mutates a Framebuffer.

import { PALETTE, ditherMix, mix } from './palette.js';
import { rgba } from './framebuffer.js';

// Paint a generic lit room. `tint` biases the wall hue toward a palette accent so
// different rooms read distinctly (mustard hall, avocado kitchen, ...).
export function paintRoom(fb, { tint = PALETTE.smog, lamp = null } = {}) {
  const w = fb.width, h = fb.height;
  const horizon = Math.floor(h * 0.62); // where wall meets floor
  const wallTop = mix(PALETTE.ceiling, tint, 0.35);
  const wallBottom = mix(PALETTE.umber, tint, 0.25);

  // Walls: top-lit gradient (light rig as compositing, not a flat fill).
  for (let y = 0; y < horizon; y++) {
    const t = y / horizon;
    for (let x = 0; x < w; x++) {
      fb.setPixel(x, y, ditherMix(wallTop, wallBottom, t, x, y));
    }
  }
  // Floor: darker plane receding into shadow.
  for (let y = horizon; y < h; y++) {
    const t = (y - horizon) / (h - horizon);
    for (let x = 0; x < w; x++) {
      fb.setPixel(x, y, ditherMix(PALETTE.floor, PALETTE.ink, t, x, y));
    }
  }
  // Baseboard line where wall meets floor.
  fb.fillRect(0, horizon, w, 1, PALETTE.ink);

  // Optional warm table-lamp pool — a soft additive glow (radial falloff).
  if (lamp) {
    const { x: lx, y: ly, r = Math.floor(h * 0.5), color = PALETTE.mustard } = lamp;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - lx, dy = y - ly;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r) continue;
        const k = (1 - d / r) * 0.5; // gentle
        const cur = fb.getPixel(x, y);
        fb.setPixel(x, y, rgba(
          cur[0] + color[0] * k * 0.3,
          cur[1] + color[1] * k * 0.3,
          cur[2] + color[2] * k * 0.2,
          255,
        ));
      }
    }
  }

  applyVignette(fb, 0.55);
}

// Darken toward the frame edges — the smoky-interior enclosure. strength 0..1.
export function applyVignette(fb, strength = 0.5) {
  const w = fb.width, h = fb.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxD;
      const k = 1 - strength * d * d;
      const c = fb.getPixel(x, y);
      fb.setPixel(x, y, rgba(c[0] * k, c[1] * k, c[2] * k, 255));
    }
  }
}

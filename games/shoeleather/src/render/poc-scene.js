// SHOELEATHER — M4 PoC scene (the VACUUM SEALED bar; CLAUDE.md rule 6).
//
// ONE composed picture: "The Restaurant Office, after hours" — the murder scene. This
// is the art-bar PoC the operator ratifies BEFORE any full pass. It exercises the full
// technique stack in the game's OWN register (70s color script + Exhaustion Floor):
//   (a) native-res software rendering (this buffer; integer upscale by the caller)
//   (b) lighting as COMPOSITING — a warm desk-lamp rig + cool venetian-blind beams
//       composited over albedo, never flat fills
//   (c) material texture via fBm/dither — wall stucco, wood grain, haze
//   (d) composed as a SINGLE picture with depth (window, desk, lamp, ledger), not a
//       sprite scatter
//
// Pure: mutates a Framebuffer. Deterministic (seeded fBm), so proof frames reproduce.

import { rgba } from './framebuffer.js';
import { PALETTE, mix, bayer } from './palette.js';
import { fbm } from './fbm.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.714 * c[2];

export function paintPocScene(fb) {
  const W = fb.width, H = fb.height;

  // --- scene geometry (logical space) ---
  const horizon = Math.round(H * 0.66);            // wall meets floor
  const win = { x: Math.round(W * 0.60), y: Math.round(H * 0.10), w: Math.round(W * 0.30), h: Math.round(H * 0.40) };
  const desk = { x: Math.round(W * 0.06), y: Math.round(H * 0.60), w: Math.round(W * 0.62), h: H };
  const deskTopY = desk.y;
  const lamp = { x: Math.round(W * 0.16), y: Math.round(H * 0.50), r: Math.round(H * 0.62) };
  const ledger = { x: Math.round(W * 0.30), y: deskTopY + 10, w: Math.round(W * 0.20), h: Math.round(H * 0.12) };
  const slatPeriod = 9;

  // Base albedo colours.
  const wallCol = mix(PALETTE.umber, PALETTE.avocado, 0.18);
  const floorCol = mix(PALETTE.floor, PALETTE.ink, 0.25);
  const woodCol = PALETTE.walnut;
  const nightCol = rgba(26, 30, 44); // cool night sky behind the blinds
  const moon = rgba(150, 170, 205);  // cool streetlight/moonlight through slats
  const warm = PALETTE.mustard;      // desk-lamp warmth

  // Lamp object: a shade (trapezoid) on a stem, sitting on the desk.
  const shade = { x: lamp.x - 15, y: lamp.y - 8, w: 30, h: 14 };
  // An empty chair pushed back from the desk (midground depth, rim-lit by the blinds).
  const chair = { x: Math.round(W * 0.74), backTop: Math.round(H * 0.40), seatY: Math.round(H * 0.58), w: 34, legH: Math.round(H * 0.40) };

  // Albedo at a pixel: which surface + its textured base colour.
  function albedo(x, y) {
    // desk lamp object (drawn in front of the wall)
    if (Math.abs(x - lamp.x) <= 2 && y > shade.y + shade.h && y < deskTopY) return mix(PALETTE.ink, woodCol, 0.3); // stem
    if (inTrapezoid(x, y, shade)) {
      const g = (y - shade.y) / shade.h;
      return mix(mix(PALETTE.mustard, rgba(255, 230, 160), 0.5), mix(PALETTE.burntOrange, PALETTE.mustard, 0.4), g); // lit shade
    }

    // window: frame, blinded glass (horizontal slats), sill
    if (inRect(x, y, win)) {
      if (onFrame(x, y, win, 2)) return mix(woodCol, PALETTE.ink, 0.35); // frame
      const slat = ((y - win.y) % 6);
      if (slat < 2) return mix(PALETTE.walnut, PALETTE.ink, 0.5);       // slat bar
      const n = fbm(x * 0.06, y * 0.06, { octaves: 3, seed: 7 });
      return mix(nightCol, rgba(44, 52, 74), n * 0.6);                   // night gap
    }
    if (y >= win.y + win.h && y < win.y + win.h + 3 && x >= win.x - 3 && x < win.x + win.w + 3) return mix(woodCol, PALETTE.ink, 0.2); // sill

    // Empty chair (midground silhouette): backrest posts + rails, seat, front legs.
    { const cx0 = chair.x, cx1 = chair.x + chair.w, dark = mix(PALETTE.walnut, PALETTE.ink, 0.55);
      const post = (x < cx0 + 3) || (x >= cx1 - 3);
      const rail = (y < chair.backTop + 3) || (Math.abs(y - (chair.backTop + chair.seatY) / 2) < 2);
      if (x >= cx0 && x < cx1 && y >= chair.backTop && y < chair.seatY && (post || rail)) return dark;
      if (x >= cx0 - 2 && x < cx1 + 2 && y >= chair.seatY && y < chair.seatY + 4) return dark;      // seat slab
      const legL = Math.abs(x - (cx0 + 2)) < 2, legR = Math.abs(x - (cx1 - 2)) < 2;
      if ((legL || legR) && y >= chair.seatY + 4 && y < chair.seatY + chair.legH) return dark;        // front legs
    }

    if (y >= deskTopY && inRect(x, y, desk)) {
      if (y < deskTopY + 3) return mix(woodCol, PALETTE.mustard, 0.3);   // near-edge highlight
      const front = y > deskTopY + Math.round((desk.h) * 0.18);           // front face below the top
      if (inRect(x, y, ledger) && !onFrame(x, y, ledger, 1)) {
        const rule = ((y - ledger.y) % 5) < 1 ? 0.55 : 0;                 // ruled lines
        const print = fbm(x * 0.6, y * 0.2, { octaves: 2, seed: 3 }) > 0.7 ? 0.35 : 0;
        return mix(PALETTE.paper, PALETTE.faintInk, Math.max(rule, print));
      }
      const grain = fbm(x * 0.08, y * 0.5, { octaves: 4, seed: 11 });
      const base = mix(mix(woodCol, PALETTE.ink, front ? 0.4 : 0.12), mix(woodCol, PALETTE.mustard, 0.12), grain);
      return base;
    }

    if (y < horizon) { // wall stucco
      const stucco = fbm(x * 0.10, y * 0.10, { octaves: 4, seed: 1 });
      return mix(mix(wallCol, PALETTE.ink, 0.12), mix(wallCol, PALETTE.smog, 0.18), stucco);
    }
    if (y < horizon + 2) return PALETTE.ink; // baseboard
    // floor boards
    const board = fbm(x * 0.06, y * 0.22, { octaves: 3, seed: 5 });
    return mix(floorCol, mix(floorCol, PALETTE.walnut, 0.25), board);
  }

  // Light accumulation at a pixel: ambient + warm lamp rig + cool venetian beams.
  function light(x, y) {
    // ambient: low, slightly cool
    let r = 0.30, g = 0.31, b = 0.34;

    // desk-lamp rig: warm radial pool from the shade, strongest at the lamp.
    const dl = Math.hypot(x - lamp.x, y - (shade.y + shade.h)) / lamp.r;
    if (dl < 1) {
      const k = Math.pow(1 - dl, 1.7) * 1.25;
      r += k * (warm[0] / 255) * 1.25; g += k * (warm[1] / 255) * 0.95; b += k * (warm[2] / 255) * 0.5;
    }

    // venetian-blind beams: cool light through the open slats, cast DOWN-LEFT from the
    // window onto the wall and floor to its left. Occluded by the desk and the window
    // itself. The bands follow the slat phase; the mask is strong near the window's
    // left edge and fades left and down.
    const onDesk = (y >= deskTopY && inRect(x, y, desk));
    if (!onDesk && !inRect(x, y, win) && x < win.x + 6) {
      // Feathered slat profile: a smooth band (raised cosine) instead of a hard on/off,
      // so the beams read as soft light through blinds, not graphic stripes.
      const p = (y + (win.x - x) * 0.5) / slatPeriod;
      const frac = ((p % 1) + 1) % 1;                     // 0..1 within a slat cycle
      const soft = 0.5 + 0.5 * Math.cos((frac - 0.5) * 2 * Math.PI); // 1 at gap centre -> 0 at slat
      const maskX = clamp01((x - W * 0.12) / (win.x - W * 0.12));
      const maskY = clamp01(1 - (y - win.y) / (H - win.y));
      const beam = soft * maskX * (0.30 + 0.55 * maskY) * 0.62;
      r += beam * (moon[0] / 255) * 0.75; g += beam * (moon[1] / 255) * 0.85; b += beam * (moon[2] / 255) * 1.05;
    }
    return [r, g, b];
  }

  // Compose: final = albedo (x) light, then haze, dither, vignette.
  const cx = (W - 1) / 2, cy = (H - 1) / 2, maxD = Math.hypot(cx, cy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = albedo(x, y);
      const L = light(x, y);
      let rr = a[0] * L[0], gg = a[1] * L[1], bb = a[2] * L[2];

      // smoky haze: a warm-grey veil that thickens with height and a slow fBm, so the
      // air itself reads (Exhaustion Floor). Screen-ish blend.
      const haze = fbm(x * 0.03, y * 0.03, { octaves: 3, seed: 21 }) * (0.10 + 0.10 * (1 - y / H));
      rr = rr + (150 - rr) * haze * 0.5; gg = gg + (130 - gg) * haze * 0.5; bb = bb + (110 - bb) * haze * 0.5;

      // ordered dither to grain the gradients (crisp pixels, no banding)
      const d = (bayer(x, y) - 0.5) * 8;
      rr += d; gg += d; bb += d;

      // vignette: smoky enclosure
      const vig = 1 - 0.6 * Math.pow(Math.hypot(x - cx, y - cy) / maxD, 2.2);
      rr *= vig; gg *= vig; bb *= vig;

      fb.setPixel(x, y, rgba(rr, gg, bb, 255));
    }
  }
  return { horizon, win, desk, lamp, ledger };
}

function inRect(x, y, r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
// A lamp shade: narrow at the top, wider at the bottom.
function inTrapezoid(x, y, s) {
  if (y < s.y || y >= s.y + s.h) return false;
  const t = (y - s.y) / s.h;
  const halfTop = s.w * 0.28, halfBot = s.w * 0.5;
  const half = halfTop + (halfBot - halfTop) * t;
  const cx = s.x + s.w / 2;
  return Math.abs(x - cx) <= half;
}
function onFrame(x, y, r, t) {
  return inRect(x, y, r) && (x < r.x + t || x >= r.x + r.w - t || y < r.y + t || y >= r.y + r.h - t);
}

export { lum };

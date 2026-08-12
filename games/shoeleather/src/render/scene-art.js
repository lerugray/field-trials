// SHOELEATHER — M4 full art pass: the in-game scenes at the VACUUM SEALED bar.
//
// The operator ratified the restaurant-office PoC (docs/proof/m4-poc-restaurant-
// office-20260810.png) as the standard and green-lit the full pass across scenes
// (docs/DIRECTIONS-2026-08-10-operator-verdicts.md). Every scene here is composed to
// the SAME technique stack (CLAUDE.md rule 6): albedo forms + fBm material, lighting as
// COMPOSITING (a per-scene light rig over albedo, never flat fills), a single composed
// picture with depth, smoky haze, ordered dither, and a vignette enclosure. REGISTER is
// this game's own (the Exhaustion Floor palette), never an exemplar's.
//
// `composeScene` is the shared compositor — its composite math matches the ratified PoC
// exactly (haze veil 150/130/110, vignette 0.6 @ 2.2) so all scenes read as one game.
// Each scene painter supplies only its albedo(x,y) and light(x,y). Pure + deterministic
// (seeded fBm), so proof frames reproduce byte-for-byte.

import { rgba } from './framebuffer.js';
import { PALETTE, mix, bayer } from './palette.js';
import { fbm } from './fbm.js';
import { paintPocScene, lum } from './poc-scene.js';
export { lum }; // shared luminance helper (single declaration — the bundler flattens scopes)

const clampU = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The shared VACUUM SEALED compositor. albedo(x,y)->[r,g,b], light(x,y)->[lr,lg,lb].
export function composeScene(fb, albedo, light, opts = {}) {
  const { hazeSeed = 21, hazeTint = [150, 130, 110], vignette = 0.6, hazeAmt = 1 } = opts;
  const W = fb.width, H = fb.height;
  const cx = (W - 1) / 2, cy = (H - 1) / 2, maxD = Math.hypot(cx, cy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = albedo(x, y);
      const L = light(x, y);
      let rr = a[0] * L[0], gg = a[1] * L[1], bb = a[2] * L[2];

      // smoky haze veil (Exhaustion Floor): thickens with height + a slow fBm.
      const haze = fbm(x * 0.03, y * 0.03, { octaves: 3, seed: hazeSeed }) * (0.10 + 0.10 * (1 - y / H)) * hazeAmt;
      rr = rr + (hazeTint[0] - rr) * haze * 0.5;
      gg = gg + (hazeTint[1] - gg) * haze * 0.5;
      bb = bb + (hazeTint[2] - bb) * haze * 0.5;

      // ordered dither — grain the gradients, no banding.
      const d = (bayer(x, y) - 0.5) * 8;
      rr += d; gg += d; bb += d;

      // vignette: the smoky enclosure.
      const vig = 1 - vignette * Math.pow(Math.hypot(x - cx, y - cy) / maxD, 2.2);
      rr *= vig; gg *= vig; bb *= vig;

      fb.setPixel(x, y, rgba(rr, gg, bb, 255));
    }
  }
}

// --- shared albedo/material primitives -----------------------------------------------

function inRect(x, y, r) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
function onFrame(x, y, r, t) {
  return inRect(x, y, r) && (x < r.x + t || x >= r.x + r.w - t || y < r.y + t || y >= r.y + r.h - t);
}

export const WORLD_PERSON_PROFILES = Object.freeze({
  chef: { skin: rgba(174, 118, 78), costume: mix(PALETTE.paper, PALETTE.ink, 0.58), hair: rgba(42, 27, 18), accent: PALETTE.burntOrange, prop: 'towel', lean: -1, hairStyle: 'swept', stance: 'square', seed: 101 },
  waiter: { skin: rgba(128, 82, 59), costume: mix(PALETTE.avocado, PALETTE.ink, 0.52), hair: rgba(24, 18, 15), accent: PALETTE.paper, prop: 'pad', lean: 2, hairStyle: 'close', stance: 'bent', seed: 103 },
  purser: { skin: rgba(164, 108, 73), costume: mix(PALETTE.smog, PALETTE.ink, 0.68), hair: rgba(62, 49, 38), accent: PALETTE.mustard, prop: 'keys', lean: 0, hairStyle: 'parted', stance: 'seated', seed: 107 },
  bandleader: { skin: rgba(106, 70, 52), costume: mix(PALETTE.burntOrange, PALETTE.ink, 0.52), hair: rgba(20, 16, 14), accent: PALETTE.mustard, prop: 'baton', lean: -2, hairStyle: 'crown', stance: 'long', seed: 109 },
});

export const SPRITE_ART_PASSES = Object.freeze(['silhouette', 'identity-palette', 'material', 'scene-light']);

// A small painted person: face planes, individual posture/costume and one readable
// prop. It still receives the scene's shared light rig and material texture afterward.
function figure(x, y, p) {
  const { cx, topY, botY, w, rimDir = 1, identity = null } = p;
  const profile = WORLD_PERSON_PROFILES[identity] || { skin: PALETTE.smog, costume: PALETTE.ink, hair: PALETTE.ink, accent: PALETTE.mustard, prop: 'none', lean: 0, hairStyle: 'close', stance: 'square', seed: 113 };
  const h = botY - topY;
  const headR = Math.max(4, Math.round(w * 0.28));
  const headCy = topY + headR;
  const faceCx = cx + profile.lean;
  const shoulderY = headCy + headR + 2;
  const hipY = topY + Math.round(h * 0.56);
  // Identity prop/highlight, held beyond the torso edge. Props carry internal marks,
  // so each is a tiny object rather than a single flat rectangle.
  if (profile.prop === 'towel' && inRect(x, y, { x: cx + w * 0.28, y: shoulderY + 7, w: Math.max(5, w * 0.20), h: Math.max(11, h * 0.27) })) {
    const fold = ((x + y) % 5) < 1 ? 0.28 : 0.04;
    return mix(PALETTE.paper, PALETTE.faintInk, fold);
  }
  if (profile.prop === 'pad' && inRect(x, y, { x: cx - w * 0.64, y: shoulderY + 7, w: Math.max(6, w * 0.28), h: Math.max(8, h * 0.22) })) {
    const edge = x < cx - w * 0.59 || y < shoulderY + 9;
    const rule = ((y - shoulderY) % 5) < 1;
    return edge ? mix(PALETTE.walnut, PALETTE.ink, 0.35) : mix(PALETTE.paper, PALETTE.faintInk, rule ? 0.50 : 0.08);
  }
  if (profile.prop === 'keys' && y > hipY - 5 && y < hipY + 7 && Math.abs(x - (cx + w * 0.40)) < 6) {
    const ring = Math.abs(Math.hypot(x - (cx + w * 0.40), y - hipY) - 3) < 1.5;
    return ring || ((x + y) % 4 === 0) ? PALETTE.mustard : profile.costume;
  }
  if (profile.prop === 'baton') { const bx = cx + w * 0.42 + (y - shoulderY) * 0.17; if (y >= shoulderY - 3 && y < hipY + 10 && Math.abs(x - bx) < 1.4) return mix(PALETTE.mustard, PALETTE.paper, ((y - shoulderY) % 7 === 0) ? 0.22 : 0); }
  // hair, face plane, eyes and lit nose.
  const hd = Math.hypot(x - faceCx, y - headCy);
  if (hd <= headR) {
    const hairLine = profile.hairStyle === 'crown' ? -0.30 : profile.hairStyle === 'swept' ? -0.48 : -0.42;
    if (y < headCy + headR * hairLine || (profile.hairStyle === 'parted' && x > faceCx + headR * 0.58 && y < headCy + headR * 0.34)) {
      return mix(profile.hair, PALETTE.walnut, fbm(x * 0.35, y * 0.24, { octaves: 2, seed: profile.seed }) * 0.14);
    }
    // Separate eyes, not one mask-like bar; a nose highlight and jaw shadow provide
    // face planes even at the smaller waiter scale.
    if (Math.abs(y - (headCy - 1)) < 1.2 && (Math.abs(x - (faceCx - headR * 0.38)) < 1.6 || Math.abs(x - (faceCx + headR * 0.38)) < 1.6)) return PALETTE.ink;
    if (Math.abs(x - (faceCx - headR * 0.08)) < 1.2 && y > headCy && y < headCy + headR * 0.42) return mix(profile.skin, PALETTE.mustard, 0.36);
    if (y > headCy + headR * 0.64) return mix(profile.skin, PALETTE.umber, 0.22);
    if (Math.abs(x - (faceCx - rimDir * headR * 0.14)) < 1.2 && y > headCy && y < headCy + headR * 0.38) return mix(profile.skin, PALETTE.mustard, 0.3);
    const skinGrain = fbm(x * 0.28, y * 0.26, { octaves: 2, seed: profile.seed + 3 });
    const face = x > faceCx ? mix(profile.skin, PALETTE.umber, 0.28 + skinGrain * 0.08) : mix(profile.skin, PALETTE.mustard, skinGrain * 0.06);
    return rim(x, y, faceCx, headR, rimDir, face);
  }
  // torso: shoulders taper to hips
  if (y >= shoulderY && y <= hipY) {
    const t = (y - shoulderY) / Math.max(1, hipY - shoulderY);
    const half = (w * 0.5) * (1 - 0.18 * t);
    const bodyCx = cx + profile.lean * t;
    if (Math.abs(x - bodyCx) <= half) {
      const lapel = Math.abs(Math.abs(x - bodyCx) - (y - shoulderY) * 0.32) < 1.4;
      const buttons = Math.abs(x - bodyCx) < 1.2 && ((y - shoulderY) % 8) < 2;
      const cloth = fbm(x * 0.22, y * 0.25, { octaves: 2, seed: profile.seed + 7 });
      const costume = lapel || buttons ? profile.accent : mix(profile.costume, PALETTE.ink, cloth * 0.12);
      return rim(x, y, bodyCx, half, rimDir, costume);
    }
  }
  // legs: two columns from hips down
  if (y > hipY && y < botY) {
    const legHalf = Math.max(2, Math.round(w * 0.16));
    const gap = Math.round(w * (profile.stance === 'long' ? 0.18 : profile.stance === 'seated' ? 0.09 : 0.14));
    const bend = profile.stance === 'bent' ? Math.round((y - hipY) * 0.10) : 0;
    if (Math.abs(x - (cx - gap - legHalf - bend)) <= legHalf) return rim(x, y, cx, w * 0.5, rimDir, profile.costume);
    if (Math.abs(x - (cx + gap + legHalf)) <= legHalf) return rim(x, y, cx, w * 0.5, rimDir, profile.costume);
  }
  return null;
}
// side rim light on a silhouette edge.
function rim(x, y, cx, half, dir, base) {
  const edge = dir >= 0 ? (x - cx) / half : (cx - x) / half;
  if (edge > 0.62) return mix(base, PALETTE.mustard, 0.28 * clampU((edge - 0.62) / 0.38));
  return base;
}

// --- restaurant: "The Restaurant, after hours" ---------------------------------------
//
// A dim burnt-orange dining room after service. Back wall carries the kitchen PASS
// (warm glow behind it) and a wall knife rack; a valet/coat podium with a hanging log
// stands at left; the chef waits at the pass, a waiter mid-room. A hanging pendant lamp
// pools warm over the room; the two exit doorways read as cooler light at the edges.

export function paintRestaurant(fb) {
  const W = fb.width, H = fb.height;
  const horizon = Math.round(H * 0.64);
  const pendant = { x: Math.round(W * 0.50), y: Math.round(H * 0.30), r: Math.round(H * 1.05) };
  const pass = { x: Math.round(W * 0.50), y: Math.round(H * 0.18), w: Math.round(W * 0.24), h: Math.round(H * 0.28) };
  const rack = { x: 120, y: 60, w: 60, h: 40 };            // knife-rack hotspot
  const podium = { x: 22, y: 108, w: 40, h: horizon - 108 }; // under the valet-log hotspot
  const clip = { x: 26, y: 96, w: 30, h: 40 };             // hanging valet clipboard
  const leftExit = { x: 0, w: 22 }, rightExit = { x: W - 30, w: 30 };
  const chef = { cx: 230, topY: 70, botY: 182, w: 42, rimDir: -1, identity: 'chef' };  // lit from the pass (left)
  const waiter = { cx: 111, topY: 120, botY: 196, w: 30, rimDir: 1, identity: 'waiter' };

  const wallCol = mix(PALETTE.umber, PALETTE.burntOrange, 0.30);
  const floorCol = mix(PALETTE.floor, PALETTE.walnut, 0.20);

  function albedo(x, y) {
    // figures (front-most)
    const fc = figure(x, y, chef); if (fc) return fc;
    const fw = figure(x, y, waiter); if (fw) return fw;

    // valet podium + hanging clipboard log (left)
    if (inRect(x, y, clip)) {
      if (onFrame(x, y, clip, 2)) return mix(PALETTE.walnut, PALETTE.ink, 0.4);
      const rule = ((y - clip.y) % 5) < 1 ? 0.5 : 0;
      const ink = fbm(x * 0.5, y * 0.2, { octaves: 2, seed: 4 }) > 0.72 ? 0.4 : 0;
      return mix(PALETTE.paper, PALETTE.faintInk, Math.max(rule, ink));
    }
    if (inRect(x, y, podium)) {
      if (y < podium.y + 4) return mix(PALETTE.walnut, PALETTE.mustard, 0.25);   // top edge
      const g = fbm(x * 0.09, y * 0.4, { octaves: 3, seed: 12 });
      return mix(mix(PALETTE.walnut, PALETTE.ink, 0.35), PALETTE.walnut, g);
    }

    // knife rack on the back wall
    if (inRect(x, y, rack)) {
      if (onFrame(x, y, rack, 1)) return mix(PALETTE.ink, PALETTE.walnut, 0.3);
      const slot = ((x - rack.x) % 9);
      if (slot < 2) {                                    // a knife: bright blade + dark handle
        const blade = y < rack.y + rack.h * 0.62;
        return blade ? mix(PALETTE.smog, PALETTE.paper, 0.5) : mix(PALETTE.ink, PALETTE.walnut, 0.4);
      }
      return mix(PALETTE.ink, PALETTE.umber, 0.5);       // rack backing
    }

    // kitchen pass (a serving window with warm depth behind)
    if (inRect(x, y, pass)) {
      if (onFrame(x, y, pass, 3)) return mix(PALETTE.walnut, PALETTE.ink, 0.3);
      const n = fbm(x * 0.05, y * 0.05, { octaves: 3, seed: 9 });
      return mix(mix(PALETTE.umber, PALETTE.burntOrange, 0.35), PALETTE.walnut, n * 0.5);
    }

    // exit doorways (cool-dark recesses — the night beyond leaks in at the edges)
    const coolBeyond = rgba(30, 36, 52);
    if (x < leftExit.w && y > 70) return mix(PALETTE.ink, coolBeyond, 0.4 + 0.35 * fbm(x * 0.1, y * 0.1, { octaves: 2, seed: 2 }));
    if (x >= rightExit.x && y > 70) return mix(PALETTE.ink, coolBeyond, 0.4 + 0.35 * fbm(x * 0.1, y * 0.1, { octaves: 2, seed: 3 }));

    if (y < horizon) {                                   // wall stucco
      const stucco = fbm(x * 0.10, y * 0.10, { octaves: 4, seed: 1 });
      return mix(mix(wallCol, PALETTE.ink, 0.16), mix(wallCol, PALETTE.smog, 0.16), stucco);
    }
    if (y < horizon + 2) return PALETTE.ink;             // baseboard
    // floor: worn boards receding
    const board = fbm(x * 0.06, y * 0.22, { octaves: 3, seed: 5 });
    return mix(floorCol, mix(floorCol, PALETTE.ink, 0.4), board * (0.5 + 0.5 * (y - horizon) / (H - horizon)));
  }

  function light(x, y) {
    let r = 0.32, g = 0.30, b = 0.30;                    // warm-dim ambient
    // pendant lamp: warm radial pool over the room centre.
    const dl = Math.hypot(x - pendant.x, (y - pendant.y) * 1.15) / pendant.r;
    if (dl < 1) {
      const k = Math.pow(1 - dl, 1.6) * 1.15;
      r += k * 1.35; g += k * 1.0; b += k * 0.52;
    }
    // pass glow: extra warmth spilling from the kitchen window.
    const dp = Math.hypot(x - (pass.x + pass.w / 2), y - (pass.y + pass.h / 2)) / (pass.w * 0.9);
    if (dp < 1) { const k = Math.pow(1 - dp, 2) * 0.6; r += k * 1.2; g += k * 0.75; b += k * 0.3; }
    // exit doorways: cool light leaking from beyond (a way out).
    if (x < 26) { const k = Math.pow(1 - x / 26, 1.5) * 0.5; r += k * 0.5; g += k * 0.62; b += k * 0.85; }
    if (x > W - 34) { const k = Math.pow(1 - (W - 1 - x) / 34, 1.5) * 0.5; r += k * 0.5; g += k * 0.62; b += k * 0.85; }
    return [r, g, b];
  }

  composeScene(fb, albedo, light, { hazeSeed: 21, hazeAmt: 1.05 });
  return { horizon, pendant, pass, rack, podium, clip, chef, waiter,
    qualityPasses: SPRITE_ART_PASSES, keyObjects: { 'valet-log': clip, 'knife-rack': rack },
    hotspots: { 'valet-log': anchor(clip), 'knife-rack': anchor(rack), chef: anchor(box(chef)), waiter: anchor(box(waiter)) } };
}

// --- morgue: "The Coroner's Office" --------------------------------------------------
//
// The cold clinical counterpoint to the warm restaurant: an institutional avocado room
// under a cool overhead fluorescent wash. A slab with a sheeted form sits in the
// foreground (the victim); a bank of file drawers lines the back wall; the coroner's
// report clips to a small table, a time-of-death board hangs on the wall, a bank letter
// waits on a side cabinet. One small warm work-lamp pools over the report for a single
// note of colour-script contrast against the cold rig.

export function paintMorgue(fb) {
  const W = fb.width, H = fb.height;
  const horizon = Math.round(H * 0.66);
  const tube = { x: Math.round(W * 0.46), y: 10, w: Math.round(W * 0.42), h: 5 }; // ceiling fluorescent
  const slab = { x: 118, y: 168, w: 152, h: 14 };           // gurney top (foreground, centre-right)
  const sheet = { x: 138, y: 150, w: 120, h: 22 };          // mounded sheet over the form
  const report = { x: 60, y: 120, w: 90, h: 40 };           // coroner-report hotspot (clipboard on table)
  const board = { x: 180, y: 60, w: 80, h: 50 };            // tod-board hotspot
  const cabinet = { x: 270, y: 120, w: 90, h: horizon - 120 }; // side cabinet under the bank letter
  const letter = { x: 282, y: 110, w: 38, h: 26 };          // bank-letter hotspot
  const drawersY = { top: 96, bot: horizon };
  const rightExit = W - 30;

  const wallCol = mix(PALETTE.umber, PALETTE.avocado, 0.42);
  const floorCol = mix(PALETTE.floor, PALETTE.avocado, 0.12);
  const steel = rgba(120, 132, 130);
  const sheetCol = rgba(176, 184, 178);
  const coolWhite = rgba(205, 218, 222);

  function albedo(x, y) {
    // sheeted form on the slab (foreground): a pale mound, then the steel slab top + legs.
    if (inRect(x, y, sheet)) {
      // domed profile: reject pixels above the mound's arc so it reads rounded.
      const t = (x - sheet.x) / sheet.w;
      const dome = sheet.y + (sheet.h * 0.5) * (1 - Math.sin(t * Math.PI));
      if (y >= dome) {
        const fold = fbm(x * 0.12, y * 0.3, { octaves: 3, seed: 14 });
        const shade = mix(sheetCol, PALETTE.ink, 0.28 * (1 - Math.sin(t * Math.PI))); // side shadow
        return mix(shade, PALETTE.paper, fold * 0.25);
      }
    }
    if (inRect(x, y, slab)) return mix(steel, PALETTE.ink, 0.15 + 0.25 * ((y - slab.y) / slab.h));
    if (y >= slab.y + slab.h && y < slab.y + slab.h + 20 && (Math.abs(x - (slab.x + 10)) < 3 || Math.abs(x - (slab.x + slab.w - 10)) < 3)) return mix(steel, PALETTE.ink, 0.4); // legs

    // coroner's report: a clipboard on a small table (paper, ruled, clipped).
    if (inRect(x, y, report)) {
      if (y < report.y + 5) return mix(steel, PALETTE.ink, 0.3);         // table lip
      const inner = report.y + 6;
      if (y > inner) {
        if ((x < report.x + 4 || x >= report.x + report.w - 4)) return mix(PALETTE.walnut, PALETTE.ink, 0.4); // board edge
        if (Math.abs(x - (report.x + report.w / 2)) < 6 && y < inner + 4) return mix(steel, PALETTE.paper, 0.4); // clip
        const rule = ((y - inner) % 6) < 1 ? 0.5 : 0;
        const ink = fbm(x * 0.5, y * 0.2, { octaves: 2, seed: 6 }) > 0.74 ? 0.4 : 0;
        return mix(PALETTE.paper, PALETTE.faintInk, Math.max(rule, ink));
      }
    }

    // time-of-death board on the wall: a dark board with a marker grid + ticks.
    if (inRect(x, y, board)) {
      if (onFrame(x, y, board, 2)) return mix(PALETTE.walnut, PALETTE.ink, 0.3);
      const grid = ((x - board.x) % 12 < 1 || (y - board.y) % 10 < 1) ? 0.35 : 0;
      const mark = (fbm(x * 0.3, y * 0.3, { octaves: 2, seed: 8 }) > 0.78) ? 0.6 : 0;
      return mix(mix(PALETTE.ink, PALETTE.avocado, 0.25), coolWhite, Math.max(grid, mark) * 0.7);
    }

    // side cabinet + bank letter
    if (inRect(x, y, letter)) {
      if (onFrame(x, y, letter, 1)) return mix(PALETTE.paper, PALETTE.faintInk, 0.5);
      // an envelope: flap diagonal + a franked corner
      const flap = Math.abs((x - letter.x) - (y - letter.y)) < 2 || Math.abs((letter.x + letter.w - x) - (y - letter.y)) < 2;
      return flap ? mix(PALETTE.paper, PALETTE.faintInk, 0.45) : PALETTE.paper;
    }
    if (inRect(x, y, cabinet)) {
      if (y < cabinet.y + 4) return mix(steel, PALETTE.ink, 0.35);
      const drawer = ((y - cabinet.y) % 22);
      if (drawer < 2) return mix(steel, PALETTE.ink, 0.5);              // drawer seam
      const pull = (Math.abs(x - (cabinet.x + cabinet.w / 2)) < 6 && drawer > 8 && drawer < 12);
      const g = fbm(x * 0.1, y * 0.3, { octaves: 3, seed: 13 });
      return pull ? mix(steel, PALETTE.ink, 0.55) : mix(mix(steel, PALETTE.ink, 0.35), steel, g * 0.4);
    }

    // back-wall file drawers (behind the slab, left of the board)
    if (y >= drawersY.top && y < drawersY.bot && x < 180) {
      const dr = ((y - drawersY.top) % 20);
      if (dr < 2) return mix(steel, PALETTE.ink, 0.55);
      const pull = Math.abs((x % 60) - 30) < 5 && dr > 8 && dr < 12;
      const g = fbm(x * 0.09, y * 0.25, { octaves: 3, seed: 15 });
      return pull ? mix(steel, PALETTE.ink, 0.6) : mix(mix(steel, PALETTE.umber, 0.5), steel, g * 0.35);
    }

    // exit doorway (cool recess, right)
    if (x >= rightExit && y > 70) return mix(PALETTE.ink, rgba(30, 40, 46), 0.4 + 0.35 * fbm(x * 0.1, y * 0.1, { octaves: 2, seed: 3 }));

    if (y < horizon) {                                       // wall (institutional avocado, textured)
      const stucco = fbm(x * 0.10, y * 0.10, { octaves: 4, seed: 2 });
      return mix(mix(wallCol, PALETTE.ink, 0.14), mix(wallCol, coolWhite, 0.10), stucco);
    }
    if (y < horizon + 2) return PALETTE.ink;
    const tile = fbm(x * 0.05, y * 0.2, { octaves: 3, seed: 7 });      // cold floor tiles
    return mix(floorCol, mix(floorCol, PALETTE.ink, 0.45), tile * (0.5 + 0.5 * (y - horizon) / (H - horizon)));
  }

  function light(x, y) {
    let r = 0.30, g = 0.33, b = 0.35;                        // cool ambient (b>r)
    // overhead fluorescent: a broad cool wash strongest under the tube, vertical falloff.
    const dx = Math.abs(x - (tube.x + tube.w / 2)) / (tube.w * 0.9);
    const fall = clampU(1 - y / (H * 1.15));
    const k = clampU(1 - dx * dx) * (0.35 + 0.65 * fall) * 1.0;
    r += k * 0.85; g += k * 1.0; b += k * 1.05;
    // the tube itself glares.
    if (inRect(x, y, tube)) { r += 0.9; g += 1.05; b += 1.1; }
    // one small warm work-lamp over the report (single colour-script accent).
    const dl = Math.hypot(x - (report.x + report.w / 2), y - (report.y + 6)) / 60;
    if (dl < 1) { const wk = Math.pow(1 - dl, 1.8) * 0.7; r += wk * 1.3; g += wk * 0.95; b += wk * 0.45; }
    return [r, g, b];
  }

  composeScene(fb, albedo, light, { hazeSeed: 22, hazeTint: [150, 158, 150], vignette: 0.6 });
  return { horizon, tube, slab, sheet, report, board, cabinet, letter,
    qualityPasses: SPRITE_ART_PASSES, keyObjects: { 'coroner-report': report, 'tod-board': board, 'bank-letter': letter },
    hotspots: { 'coroner-report': anchor(report), 'tod-board': anchor(board), 'bank-letter': anchor(letter) } };
}

// --- studio: "The Studio Lot" --------------------------------------------------------
//
// The show-business register (mustard, hard key light) — the soundstage where the
// pre-taped alibi was recorded, so the TAPE apparatus is present and diegetic: a studio
// camera on a pedestal points at a lit cooking-show set flat; a Fresnel lamp on a stand
// throws a hard warm key across the stage; a reel-to-reel deck stands by; the staff
// ledger waits on a production desk. Harder, more directional light than the restaurant
// (a stage is LIT for the camera), still the game's own worn 70s register.

export function paintStudio(fb) {
  const W = fb.width, H = fb.height;
  const horizon = Math.round(H * 0.68);
  const fresnel = { x: 316, y: 30, w: 34, h: 26 };          // lamp head on a stand (upper right)
  const beam = { x: fresnel.x - 4, y: fresnel.y + fresnel.h }; // beam origin
  const setFlat = { x: 138, y: 46, w: 150, h: 96 };         // the cooking-show backdrop flat
  const counterY = setFlat.y + 66;                          // the set counter line
  const camera = { x: 238, y: 118, w: 40, h: 34 };          // camera body (on a pedestal)
  // Keep the deck wholly above the horizon: the old y=150 made h negative at this
  // 216px logical scene, leaving a fully implemented but literally unpainted asset.
  const deck = { x: 300, y: 108, w: 60, h: horizon - 108 }; // reel-to-reel tape deck (right)
  const ledger = { x: 70, y: 110, w: 60, h: 40 };           // staff-ledger hotspot (open book on a desk)
  const leftExit = 22;

  const wallCol = mix(PALETTE.umber, PALETTE.mustard, 0.16); // the dim stage volume beyond the set
  const floorCol = mix(PALETTE.floor, PALETTE.ink, 0.2);
  const dark = mix(PALETTE.ink, PALETTE.umber, 0.3);

  function albedo(x, y) {
    // Fresnel lamp head + barn doors (bright housing) on its stand.
    if (inRect(x, y, fresnel)) {
      if (onFrame(x, y, fresnel, 2)) return dark;             // barn-door frame
      const g = (x - fresnel.x) / fresnel.w;
      return mix(mix(PALETTE.mustard, rgba(255, 235, 170), 0.6), PALETTE.burntOrange, g * 0.4); // hot lens
    }
    if (Math.abs(x - (fresnel.x + fresnel.w / 2)) < 2 && y >= fresnel.y + fresnel.h && y < horizon) return dark; // stand pole

    // studio camera: a boxy silhouette on a pedestal, a bright lens ring facing the set.
    if (inRect(x, y, camera)) {
      const lensCx = camera.x + 4, lensCy = camera.y + camera.h / 2;
      if (x <= camera.x + 8 && Math.hypot((x - lensCx) * 1.4, y - lensCy) < 7) return mix(PALETTE.smog, PALETTE.paper, 0.4); // lens
      if (onFrame(x, y, camera, 2)) return mix(dark, PALETTE.walnut, 0.2);
      return mix(dark, PALETTE.ink, 0.3);
    }
    // pedestal column + a hint of a viewfinder hump on top
    if (Math.abs(x - (camera.x + camera.w / 2)) < 4 && y >= camera.y + camera.h && y < horizon) return dark;
    if (x > camera.x + camera.w - 12 && x < camera.x + camera.w && y > camera.y - 6 && y < camera.y) return dark;

    // reel-to-reel tape deck (the pre-taped alibi apparatus): two reels + a face.
    if (inRect(x, y, deck)) {
      if (y < deck.y + 4) return mix(PALETTE.walnut, PALETTE.mustard, 0.2);
      const faceY = deck.y + 6;
      for (const rx of [deck.x + 16, deck.x + 44]) {
        const rr = Math.hypot(x - rx, y - (faceY + 12));
        if (rr < 10) return rr > 7 ? mix(dark, PALETTE.mustard, 0.15) : (rr < 2 ? PALETTE.mustard : mix(PALETTE.ink, PALETTE.smog, 0.3)); // reel
      }
      const g = fbm(x * 0.1, y * 0.3, { octaves: 3, seed: 17 });
      return mix(mix(PALETTE.walnut, PALETTE.ink, 0.45), PALETTE.walnut, g * 0.4); // deck body
    }

    // the cooking-show SET FLAT: a lit backdrop panel with a counter + panelling.
    if (inRect(x, y, setFlat)) {
      if (y >= counterY && y < counterY + 10) return mix(PALETTE.walnut, PALETTE.mustard, 0.35); // counter top (warm wood)
      if (y >= counterY + 10) {                               // counter front panel
        const panel = ((x - setFlat.x) % 26 < 2) ? 0.4 : 0;
        return mix(mix(PALETTE.walnut, PALETTE.ink, 0.35), PALETTE.walnut, 0.2 + panel * 0.4);
      }
      // backdrop wall of the set: warm painted flat with faint fBm + a hung utensil
      const n = fbm(x * 0.06, y * 0.08, { octaves: 3, seed: 18 });
      const utensil = (Math.abs(x - (setFlat.x + 110)) < 2 && y > setFlat.y + 10 && y < counterY - 8) ? 0.5 : 0;
      return mix(mix(PALETTE.mustard, PALETTE.umber, 0.45), mix(PALETTE.mustard, PALETTE.burntOrange, 0.3), Math.max(n * 0.6, utensil));
    }

    // staff ledger: an open book on a production desk (two cream pages + a spine).
    if (inRect(x, y, ledger)) {
      if (y < ledger.y + 5) return mix(PALETTE.walnut, PALETTE.mustard, 0.25); // desk lip
      const inner = ledger.y + 6;
      if (y > inner) {
        const spine = Math.abs(x - (ledger.x + ledger.w / 2)) < 2;
        if (spine) return mix(PALETTE.walnut, PALETTE.ink, 0.4);
        const rule = ((y - inner) % 6) < 1 ? 0.5 : 0;
        const ink = fbm(x * 0.5, y * 0.25, { octaves: 2, seed: 19 }) > 0.75 ? 0.35 : 0;
        return mix(PALETTE.paper, PALETTE.faintInk, Math.max(rule, ink));
      }
    }
    // desk slab under the ledger
    if (y >= ledger.y + 34 && y < horizon && x > ledger.x - 12 && x < ledger.x + ledger.w + 12) {
      return mix(mix(PALETTE.walnut, PALETTE.ink, 0.4), PALETTE.walnut, fbm(x * 0.1, y * 0.3, { octaves: 2, seed: 20 }) * 0.4);
    }

    // exit doorway (cool recess, left — off the stage)
    if (x < leftExit && y > 70) return mix(PALETTE.ink, rgba(30, 36, 50), 0.4 + 0.35 * fbm(x * 0.1, y * 0.1, { octaves: 2, seed: 4 }));

    if (y < horizon) {                                        // dim stage volume beyond the set
      const stucco = fbm(x * 0.09, y * 0.09, { octaves: 4, seed: 3 });
      return mix(mix(wallCol, PALETTE.ink, 0.30), wallCol, stucco * 0.7);
    }
    if (y < horizon + 2) return PALETTE.ink;
    // stage floor with a snaking cable
    const cable = Math.abs((y - horizon) - 14 * Math.sin(x * 0.05)) < 2 && y > horizon + 6;
    if (cable) return mix(PALETTE.ink, PALETTE.umber, 0.5);
    const g = fbm(x * 0.05, y * 0.2, { octaves: 3, seed: 5 });
    return mix(floorCol, mix(floorCol, PALETTE.ink, 0.5), g * (0.5 + 0.5 * (y - horizon) / (H - horizon)));
  }

  function light(x, y) {
    let r = 0.26, g = 0.25, b = 0.26;                         // dim stage ambient
    // HARD Fresnel key: a directional cone from the lamp head toward the set. Bright,
    // warm, falls off with angle from the beam axis and distance.
    const vx = x - beam.x, vy = y - beam.y;
    const dist = Math.hypot(vx, vy);
    const ang = Math.atan2(vy, vx);                            // beam aimed down-left toward the set
    const aim = Math.atan2(1, -1.1);
    let da = Math.abs(ang - aim); if (da > Math.PI) da = 2 * Math.PI - da;
    const cone = clampU(1 - da / 0.9);
    const reach = clampU(1 - dist / (W * 0.95));
    const key = Math.pow(cone, 1.5) * Math.pow(reach, 1.2) * 1.7;
    r += key * 1.35; g += key * 1.05; b += key * 0.5;
    // the set is on: a soft bright fill on the flat so it reads as the lit performing area.
    if (x >= setFlat.x - 6 && x < setFlat.x + setFlat.w + 6 && y < counterY + 20) {
      const f = 0.35 * clampU(1 - Math.abs(x - (setFlat.x + setFlat.w / 2)) / (setFlat.w * 0.7));
      r += f * 1.1; g += f * 0.9; b += f * 0.55;
    }
    // the lamp lens itself blooms.
    if (inRect(x, y, fresnel)) { r += 1.1; g += 0.9; b += 0.45; }
    // cool edge fill from the left doorway.
    if (x < 26) { const k = Math.pow(1 - x / 26, 1.5) * 0.45; r += k * 0.5; g += k * 0.6; b += k * 0.8; }
    return [r, g, b];
  }

  composeScene(fb, albedo, light, { hazeSeed: 23, hazeAmt: 1.1 });
  return { horizon, fresnel, setFlat, camera, deck, ledger,
    qualityPasses: SPRITE_ART_PASSES, keyObjects: { fresnel, camera, 'tape-deck': deck, 'staff-ledger': ledger },
    hotspots: { 'staff-ledger': anchor(ledger) } };
}

// =====================================================================================
// CASE 2 — the cruise-ship scenes (M6), same VACUUM SEALED stack, the ship's own
// register: warm walnut cabins vs cool night sea through portholes; one prominent
// device prop per scene (the slow lounge clock; the weapon's absence in the dust).
// =====================================================================================

// --- stateroom: "The Auditor's Stateroom" (the murder scene; also the prologue/ending
// backdrop for Case 2). A small warm walnut cabin: a brass porthole with cool night sea,
// a writing desk with the open ledger under a warm sconce, the berth with the auditor's
// covered form, a dinner tray on a low table.
export function paintStateroom(fb) {
  const W = fb.width, H = fb.height;
  const horizon = Math.round(H * 0.72);
  const porthole = { cx: 306, cy: 62, r: 27 };
  const desk = { x: 132, y: 118, w: 92, h: horizon - 118 };  // writing desk against the wall
  const ledger = { x: 150, y: 92, w: 52, h: 40 };            // open-ledger hotspot (on the desk lip)
  const sconce = { x: 60, y: 46 };                           // warm wall lamp (frame-left)
  const berth = { x: 200, y: 150, w: 84, h: 16 };            // bunk frame
  const form = { x: 206, y: 138, w: 66, h: 18 };             // covered form on the berth (the-berth hotspot)
  const tray = { x: 54, y: 150, w: 64, h: 20 };              // dinner-tray hotspot (low table)
  const leftExit = 22, rightExit = W - 32;

  const wallCol = mix(PALETTE.umber, PALETTE.walnut, 0.5);
  const floorCol = mix(PALETTE.floor, PALETTE.walnut, 0.25);
  const sea = rgba(30, 40, 60), moon = rgba(150, 172, 205), brass = mix(PALETTE.mustard, PALETTE.walnut, 0.3);

  function albedo(x, y) {
    // porthole: brass ring, cool sea + a low horizon line inside.
    const pd = Math.hypot(x - porthole.cx, y - porthole.cy);
    if (pd <= porthole.r) {
      if (pd > porthole.r - 4) return mix(brass, PALETTE.ink, 0.2 + 0.3 * ((y - (porthole.cy - porthole.r)) / (2 * porthole.r))); // ring, top-lit
      const seaLine = porthole.cy + 6;
      if (y > seaLine) { const w = fbm(x * 0.2, y * 0.4, { octaves: 2, seed: 33 }); return mix(sea, mix(sea, moon, 0.3), w * 0.5); } // swell
      const n = fbm(x * 0.05, y * 0.05, { octaves: 2, seed: 34 });
      return mix(rgba(24, 30, 46), rgba(40, 50, 72), n);       // night sky
    }

    // the auditor's covered form on the berth (a low pale mound).
    if (inRect(x, y, form)) {
      const t = (x - form.x) / form.w;
      const dome = form.y + (form.h * 0.6) * (1 - Math.sin(t * Math.PI));
      if (y >= dome) { const fold = fbm(x * 0.12, y * 0.3, { octaves: 3, seed: 36 }); return mix(rgba(150, 150, 150), PALETTE.paper, fold * 0.25); }
    }
    if (inRect(x, y, berth)) return mix(PALETTE.walnut, PALETTE.ink, 0.35 + 0.25 * ((y - berth.y) / berth.h)); // bunk frame
    if (y >= berth.y + berth.h && y < horizon && (Math.abs(x - (berth.x + 6)) < 3 || Math.abs(x - (berth.x + berth.w - 6)) < 3)) return mix(PALETTE.walnut, PALETTE.ink, 0.5);

    // writing desk + open ledger
    if (inRect(x, y, ledger)) {
      if (y < ledger.y + 4) return mix(PALETTE.walnut, PALETTE.mustard, 0.25);
      const spine = Math.abs(x - (ledger.x + ledger.w / 2)) < 2;
      if (spine) return mix(PALETTE.walnut, PALETTE.ink, 0.4);
      const rule = ((y - ledger.y) % 5) < 1 ? 0.5 : 0;
      const ink = fbm(x * 0.5, y * 0.2, { octaves: 2, seed: 37 }) > 0.74 ? 0.4 : 0;
      return mix(PALETTE.paper, PALETTE.faintInk, Math.max(rule, ink));
    }
    if (inRect(x, y, desk)) {
      if (y < desk.y + 4) return mix(PALETTE.walnut, PALETTE.mustard, 0.2);
      const g = fbm(x * 0.08, y * 0.4, { octaves: 3, seed: 38 });
      return mix(mix(PALETTE.walnut, PALETTE.ink, 0.4), PALETTE.walnut, g);
    }

    // dinner tray on a low table (cloche + plate).
    if (inRect(x, y, tray)) {
      if (y < tray.y + 4) return mix(PALETTE.walnut, PALETTE.ink, 0.3);           // table lip
      const cloche = Math.hypot((x - (tray.x + tray.w * 0.34)) * 1.1, y - (tray.y + tray.h)) < 10;
      if (cloche) return mix(PALETTE.smog, PALETTE.paper, 0.35);                   // silver cloche
      return mix(mix(PALETTE.walnut, PALETTE.smog, 0.2), PALETTE.paper, 0.15);     // tray
    }

    // brass wall sconce (frame-left).
    if (Math.hypot(x - sconce.x, y - sconce.y) < 5) return mix(PALETTE.mustard, rgba(255, 235, 170), 0.5);

    if (x < leftExit && y > 70) return mix(PALETTE.ink, rgba(28, 34, 50), 0.4 + 0.3 * fbm(x * 0.1, y * 0.1, { octaves: 2, seed: 2 }));
    if (x >= rightExit && y > 70) return mix(PALETTE.ink, rgba(28, 34, 50), 0.4 + 0.3 * fbm(x * 0.1, y * 0.1, { octaves: 2, seed: 3 }));

    if (y < horizon) {                                       // walnut paneling (vertical seams + grain)
      const seam = ((x % 40) < 2) ? 0.4 : 0;
      const grain = fbm(x * 0.12, y * 0.06, { octaves: 3, seed: 1 });
      return mix(mix(wallCol, PALETTE.ink, 0.2 + seam * 0.3), mix(wallCol, PALETTE.mustard, 0.08), grain * 0.7);
    }
    if (y < horizon + 2) return PALETTE.ink;
    const board = fbm(x * 0.06, y * 0.22, { octaves: 3, seed: 5 });
    return mix(floorCol, mix(floorCol, PALETTE.ink, 0.4), board * (0.5 + 0.5 * (y - horizon) / (H - horizon)));
  }

  function light(x, y) {
    let r = 0.34, g = 0.32, b = 0.31;                        // warm-dim cabin ambient
    const ds = Math.hypot(x - sconce.x, (y - sconce.y) * 0.95) / (W * 0.62);   // warm sconce pool
    if (ds < 1) { const k = Math.pow(1 - ds, 1.6) * 1.15; r += k * 1.35; g += k * 1.0; b += k * 0.5; }
    // cool moonlight from the porthole, spilling down-left across the cabin.
    const dm = Math.hypot(x - porthole.cx, y - porthole.cy) / (W * 0.7);
    if (dm < 1 && !(Math.hypot(x - porthole.cx, y - porthole.cy) <= porthole.r)) {
      const k = Math.pow(1 - dm, 1.7) * 0.6; r += k * 0.5; g += k * 0.62; b += k * 0.9;
    }
    return [r, g, b];
  }

  composeScene(fb, albedo, light, { hazeSeed: 24, hazeAmt: 0.9 });
  return { horizon, porthole, desk, ledger, berth, form, tray,
    qualityPasses: SPRITE_ART_PASSES,
    keyObjects: { porthole: { x: porthole.cx - porthole.r, y: porthole.cy - porthole.r, w: porthole.r * 2, h: porthole.r * 2 }, 'the-berth': form, 'dinner-tray': tray, 'open-ledger': ledger },
    hotspots: { 'the-berth': anchor(form), 'dinner-tray': anchor(tray), 'open-ledger': anchor(ledger) } };
}

// --- lounge: "The First-Class Lounge" (the alibi). Plush burnt-orange room under a warm
// chandelier; the SLOW WALL CLOCK is the prominent device prop; the purser sits at a card
// table (left), the bandleader stands by the bandstand (right); the steward's note + the
// maitre's book wait on a side table.
export function paintLounge(fb) {
  const W = fb.width, H = fb.height;
  const horizon = Math.round(H * 0.68);
  const clock = { cx: 198, cy: 60, r: 22 };                  // lounge-clock hotspot (the device)
  const table = { x: 46, y: 150, w: 70, h: 14 };             // card table (foreground left)
  const purser = { cx: 80, topY: 96, botY: 180, w: 40, rimDir: 1, identity: 'purser' };   // seated-ish figure
  const bandleader = { cx: 320, topY: 70, botY: 180, w: 40, rimDir: -1, identity: 'bandleader' };
  const bandstand = { x: 288, y: 150, w: 72, h: horizon - 150 };
  const side = { x: 146, y: 118, w: 132, h: 46 };            // side table under the two documents
  const stewardNote = { x: 150, y: 120, w: 60, h: 40 };
  const maitreBook = { x: 222, y: 120, w: 52, h: 40 };
  const leftExit = 22;

  const wallCol = mix(PALETTE.umber, PALETTE.burntOrange, 0.28);
  const floorCol = mix(PALETTE.floor, PALETTE.walnut, 0.28);

  function albedo(x, y) {
    // figures
    const fp = figure(x, y, purser); if (fp) return fp;
    const fb2 = figure(x, y, bandleader); if (fb2) return fb2;

    // the wall clock: brass rim, pale face, two hands (the device prop, must READ).
    const cd = Math.hypot(x - clock.cx, y - clock.cy);
    if (cd <= clock.r) {
      if (cd > clock.r - 3) return mix(PALETTE.mustard, PALETTE.walnut, 0.3);      // brass rim
      // hands: hour toward ~10 (up-left), minute toward ~10 too (near-vertical) — "ten to"
      const ang = Math.atan2(y - clock.cy, x - clock.cx);
      const hourHand = Math.abs(ang - (-2.5)) < 0.18 && cd < clock.r * 0.6;
      const minHand = Math.abs(ang - (-1.9)) < 0.12 && cd < clock.r * 0.85;
      if (hourHand || minHand) return PALETTE.ink;
      if (cd < 2) return PALETTE.ink;                                              // hub
      const tick = (Math.abs((((ang + Math.PI) % (Math.PI / 6))) - 0) < 0.10) && cd > clock.r * 0.7;
      return mix(PALETTE.paper, PALETTE.faintInk, tick ? 0.5 : 0.12);              // face + ticks
    }

    // card table (foreground) + a scatter of cards
    if (inRect(x, y, table)) {
      if (y < table.y + 3) { const felt = mix(PALETTE.avocado, PALETTE.ink, 0.4); const card = (x % 12 < 5 && x > table.x + 8 && x < table.x + 40) ? 0.7 : 0; return mix(felt, PALETTE.paper, card); }
      return mix(PALETTE.walnut, PALETTE.ink, 0.45);
    }
    if (y >= table.y + 3 && y < horizon && (Math.abs(x - (table.x + 6)) < 2 || Math.abs(x - (table.x + table.w - 6)) < 2)) return mix(PALETTE.walnut, PALETTE.ink, 0.5);

    // bandstand (low dais, right)
    if (inRect(x, y, bandstand)) { const g = fbm(x * 0.1, y * 0.3, { octaves: 2, seed: 40 }); return mix(mix(PALETTE.walnut, PALETTE.ink, 0.5), PALETTE.walnut, g * 0.4); }

    // side table + the two documents
    if (inRect(x, y, stewardNote) || inRect(x, y, maitreBook)) {
      const r0 = inRect(x, y, stewardNote) ? stewardNote : maitreBook;
      if (onFrame(x, y, r0, 1)) return mix(PALETTE.walnut, PALETTE.ink, 0.4);
      const rule = ((y - r0.y) % 6) < 1 ? 0.45 : 0;
      const ink = fbm(x * 0.5, y * 0.2, { octaves: 2, seed: 42 }) > 0.75 ? 0.35 : 0;
      return mix(PALETTE.paper, PALETTE.faintInk, Math.max(rule, ink));
    }
    if (inRect(x, y, side)) { if (y < side.y + 4) return mix(PALETTE.walnut, PALETTE.mustard, 0.2); return mix(PALETTE.walnut, PALETTE.ink, 0.4); }

    if (x < leftExit && y > 70) return mix(PALETTE.ink, rgba(28, 34, 50), 0.4 + 0.3 * fbm(x * 0.1, y * 0.1, { octaves: 2, seed: 2 }));

    if (y < horizon) {                                       // papered wall
      const stucco = fbm(x * 0.10, y * 0.10, { octaves: 4, seed: 1 });
      return mix(mix(wallCol, PALETTE.ink, 0.16), mix(wallCol, PALETTE.smog, 0.14), stucco);
    }
    if (y < horizon + 2) return PALETTE.ink;
    const carpet = fbm(x * 0.09, y * 0.2, { octaves: 3, seed: 5 });
    return mix(floorCol, mix(floorCol, PALETTE.burntOrange, 0.15), carpet * 0.6);
  }

  function light(x, y) {
    let r = 0.32, g = 0.29, b = 0.28;
    const dc = Math.hypot(x - W * 0.5, (y - H * 0.24) * 1.1) / (W * 0.95);   // warm chandelier pool (centre-top)
    if (dc < 1) { const k = Math.pow(1 - dc, 1.5) * 1.05; r += k * 1.3; g += k * 0.98; b += k * 0.52; }
    // a small practical glow behind the clock (so the device reads).
    const dk = Math.hypot(x - clock.cx, y - clock.cy) / (clock.r * 2.4);
    if (dk < 1) { const k = Math.pow(1 - dk, 2) * 0.5; r += k * 1.1; g += k * 0.9; b += k * 0.55; }
    if (x < 26) { const k = Math.pow(1 - x / 26, 1.5) * 0.45; r += k * 0.5; g += k * 0.6; b += k * 0.85; }
    return [r, g, b];
  }

  composeScene(fb, albedo, light, { hazeSeed: 25, hazeAmt: 1.05 });
  return { horizon, clock, table, purser, bandleader, stewardNote, maitreBook,
    qualityPasses: SPRITE_ART_PASSES,
    keyObjects: { 'lounge-clock': { x: clock.cx - clock.r, y: clock.cy - clock.r, w: clock.r * 2, h: clock.r * 2 }, 'card-table': table, 'steward-note': stewardNote, 'maitre-book': maitreBook },
    hotspots: { purser: anchor(box(purser)), bandleader: anchor(box(bandleader)),
      'lounge-clock': anchor({ x: clock.cx - clock.r, y: clock.cy - clock.r, w: clock.r * 2, h: clock.r * 2 }),
      'steward-note': anchor(stewardNote), 'maitre-book': anchor(maitreBook) } };
}

// --- office: "The Purser's Office" (the weapon's absence). A cramped avocado ship's
// office: a desk with papers and a conspicuous CLEAN RING in the dust where the brass
// paperweight stood; a wall of pigeonholes + a small safe behind; one cool porthole.
export function paintOffice(fb) {
  const W = fb.width, H = fb.height;
  const horizon = Math.round(H * 0.70);
  const desk = { x: 110, y: 108, w: 108, h: horizon - 108 };  // purser-desk hotspot
  const ring = { cx: 150, cy: 120, r: 8 };                    // the bare dust-ring (the tell)
  const holes = { x: 250, y: 60, w: 110, h: 70 };             // pigeonholes on the back wall
  const safe = { x: 40, y: 96, w: 52, h: 52 };                // small safe (left)
  const porthole = { cx: 210, cy: 58, r: 18 };
  const lamp = { x: 96, y: 70, r: Math.round(H * 0.7) };

  const wallCol = mix(PALETTE.umber, PALETTE.avocado, 0.34);
  const floorCol = mix(PALETTE.floor, PALETTE.avocado, 0.10);
  const steel = rgba(120, 128, 122);

  function albedo(x, y) {
    // porthole (cool sea)
    const pd = Math.hypot(x - porthole.cx, y - porthole.cy);
    if (pd <= porthole.r) {
      if (pd > porthole.r - 3) return mix(PALETTE.mustard, PALETTE.walnut, 0.3);
      const w = fbm(x * 0.2, y * 0.3, { octaves: 2, seed: 33 });
      return y > porthole.cy ? mix(rgba(30, 40, 60), rgba(60, 74, 96), w * 0.5) : mix(rgba(24, 30, 46), rgba(40, 50, 72), w);
    }

    // desk with scattered papers + the CLEAN RING in the dust
    if (inRect(x, y, desk)) {
      if (y < desk.y + 4) return mix(PALETTE.walnut, PALETTE.mustard, 0.2);        // near edge
      // papers
      const paper1 = inRect(x, y, { x: desk.x + 40, y: desk.y + 8, w: 40, h: 26 });
      if (paper1) { const rule = ((y - (desk.y + 8)) % 5) < 1 ? 0.4 : 0; return mix(PALETTE.paper, PALETTE.faintInk, Math.max(rule, 0.1)); }
      const dust = fbm(x * 0.2, y * 0.2, { octaves: 2, seed: 44 }) * 0.3;          // faint dust film
      const dring = Math.hypot(x - ring.cx, y - ring.cy);
      const base = mix(mix(PALETTE.walnut, PALETTE.ink, 0.4), PALETTE.walnut, fbm(x * 0.08, y * 0.4, { octaves: 3, seed: 38 }) * 0.4);
      if (dring < ring.r && dring > ring.r - 2) return mix(base, PALETTE.ink, 0.4); // the ring outline (weapon gone)
      if (dring < ring.r) return mix(base, PALETTE.mustard, 0.12);                  // clean centre (dust wiped)
      return mix(base, PALETTE.smog, dust);
    }

    // small safe (left): steel box, dial, handle
    if (inRect(x, y, safe)) {
      if (onFrame(x, y, safe, 3)) return mix(steel, PALETTE.ink, 0.4);
      if (Math.hypot(x - (safe.x + safe.w * 0.5), y - (safe.y + safe.h * 0.42)) < 7) return mix(steel, PALETTE.ink, 0.2); // dial
      const g = fbm(x * 0.12, y * 0.3, { octaves: 3, seed: 45 });
      return mix(mix(steel, PALETTE.ink, 0.35), steel, g * 0.4);
    }

    // pigeonholes (a grid of dark cubbies with pale papers)
    if (inRect(x, y, holes)) {
      const cw = 22, ch = 17;
      const lx = (x - holes.x) % cw, ly = (y - holes.y) % ch;
      if (lx < 2 || ly < 2) return mix(PALETTE.walnut, PALETTE.ink, 0.5);          // dividers
      const paper = (ly > 3 && ly < 9 && ((x * 7 + y * 3) % 5 < 3));
      return paper ? mix(PALETTE.paper, PALETTE.faintInk, 0.3) : mix(PALETTE.ink, PALETTE.umber, 0.5);
    }

    if (y < horizon) {
      const stucco = fbm(x * 0.10, y * 0.10, { octaves: 4, seed: 2 });
      return mix(mix(wallCol, PALETTE.ink, 0.16), mix(wallCol, PALETTE.smog, 0.12), stucco);
    }
    if (y < horizon + 2) return PALETTE.ink;
    const tile = fbm(x * 0.05, y * 0.2, { octaves: 3, seed: 7 });
    return mix(floorCol, mix(floorCol, PALETTE.ink, 0.45), tile * (0.5 + 0.5 * (y - horizon) / (H - horizon)));
  }

  function light(x, y) {
    let r = 0.32, g = 0.33, b = 0.32;
    const dl = Math.hypot(x - lamp.x, y - lamp.y) / lamp.r;                        // warm desk lamp (left)
    if (dl < 1) { const k = Math.pow(1 - dl, 1.7) * 1.05; r += k * 1.3; g += k * 1.0; b += k * 0.55; }
    // a hard little raking light across the desk so the dust-ring reads.
    if (inRect(x, y, desk) && y < desk.y + 24) { const k = 0.4 * clampU(1 - Math.abs(x - ring.cx) / 60); r += k * 1.1; g += k * 0.9; b += k * 0.5; }
    const dm = Math.hypot(x - porthole.cx, y - porthole.cy) / (W * 0.6);           // cool porthole spill
    if (dm < 1 && Math.hypot(x - porthole.cx, y - porthole.cy) > porthole.r) { const k = Math.pow(1 - dm, 1.7) * 0.45; r += k * 0.5; g += k * 0.6; b += k * 0.85; }
    return [r, g, b];
  }

  composeScene(fb, albedo, light, { hazeSeed: 26, hazeTint: [150, 156, 150], hazeAmt: 0.95 });
  return { horizon, desk, ring, holes, safe, porthole,
    qualityPasses: SPRITE_ART_PASSES,
    keyObjects: { 'purser-desk': desk, 'dust-ring': { x: ring.cx - ring.r, y: ring.cy - ring.r, w: ring.r * 2, h: ring.r * 2 }, safe, pigeonholes: holes },
    hotspots: { 'purser-desk': anchor(desk) } };
}

// centre point of a rect (for hotspot-coverage verification against final art).
function anchor(r) { return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }; }
function box(f) { return { x: f.cx - f.w / 2, y: f.topY, w: f.w, h: f.botY - f.topY }; }

// Registry: scene-id -> painter. main.js dispatches `background.paint === 'art'` here.
export const SCENE_ART = {
  restaurant: paintRestaurant,
  morgue: paintMorgue,
  studio: paintStudio,
  // the ratified PoC IS the murder scene — "The Restaurant Office, after hours".
  // It backs the prologue (the murder is committed here) and the ending (the reveal
  // returns to it). paintPocScene returns its own meta; wrap to the {hotspots} shape.
  'restaurant-office': (fb) => { const m = paintPocScene(fb); return { ...m, hotspots: {} }; },
  // Case 2 — the cruise-ship scenes (the stateroom doubles as Case 2's murder backdrop).
  stateroom: paintStateroom,
  lounge: paintLounge,
  office: paintOffice,
};

export function paintSceneArt(fb, artId) {
  const painter = SCENE_ART[artId];
  if (!painter) return null;
  return painter(fb);
}

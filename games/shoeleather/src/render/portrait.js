// SHOELEATHER — code-drawn, person-specific portrait cards.
//
// Portraits use the same VACUUM SEALED method as the world scenes: silhouette first,
// a restricted person palette and material pass, then one coherent warm-key/cool-fill
// light composite over the whole card. Posture/expression is diegetic state, never a
// tolerance number. Everything is painted in a native 80x100 buffer and nearest-scaled.

import { PALETTE, mix, bayer } from './palette.js';
import { rgba } from './framebuffer.js';
import { fbm } from './fbm.js';

export const PORTRAIT_ART_PASSES = Object.freeze(['silhouette', 'palette-material', 'scene-light', 'expression-read']);

const POSTURE_TELLS = {
  open:      { shoulderY: 0.66, brow: 0, mouth: 1, spread: 1.00, headDrop: 0, thrust: 0 },
  guarded:   { shoulderY: 0.63, brow: 1, mouth: 0, spread: 0.96, headDrop: 1, thrust: 1 },
  defensive: { shoulderY: 0.59, brow: 2, mouth: -1, spread: 0.92, headDrop: 2, thrust: 2 },
  hostile:   { shoulderY: 0.55, brow: 3, mouth: -2, spread: 0.88, headDrop: 3, thrust: 3 },
};

// Shape data matters as much as colour: each person has a distinct hair silhouette,
// face proportion, costume geometry, lean and held prop. These profiles are shared by
// interrogation, notebook and confrontation cards.
export const PORTRAIT_PROFILES = Object.freeze({
  chef: {
    skin: rgba(184, 132, 91), coat: rgba(190, 178, 144), hair: rgba(45, 28, 18),
    accent: PALETTE.burntOrange, prop: 'towel', lean: -2, faceW: 0.92, faceH: 1.10,
    hairStyle: 'swept', collar: 'double', seed: 61,
  },
  waiter: {
    skin: rgba(136, 91, 65), coat: mix(PALETTE.avocado, PALETTE.ink, 0.25), hair: rgba(28, 20, 16),
    accent: PALETTE.paper, prop: 'pad', lean: 2, faceW: 0.82, faceH: 1.16,
    hairStyle: 'close', collar: 'bow', seed: 67,
  },
  purser: {
    skin: rgba(172, 121, 82), coat: mix(PALETTE.smog, PALETTE.ink, 0.55), hair: rgba(68, 54, 42),
    accent: PALETTE.mustard, prop: 'keys', lean: 0, faceW: 1.02, faceH: 1.04,
    hairStyle: 'parted', collar: 'bars', seed: 71,
  },
  bandleader: {
    skin: rgba(112, 75, 56), coat: mix(PALETTE.burntOrange, PALETTE.walnut, 0.30), hair: rgba(22, 18, 16),
    accent: PALETTE.mustard, prop: 'baton', lean: -3, faceW: 0.88, faceH: 1.18,
    hairStyle: 'crown', collar: 'wide', seed: 79,
  },
});

const FALLBACK_PROFILE = {
  skin: mix(PALETTE.smog, PALETTE.mustard, 0.25), coat: mix(PALETTE.umber, PALETTE.walnut, 0.3),
  hair: PALETTE.ink, accent: PALETTE.burntOrange, prop: 'none', lean: 0,
  faceW: 0.94, faceH: 1.10, hairStyle: 'close', collar: 'wide', seed: 83,
};

export function paintPortrait(fb, { posture = 'open', tint = PALETTE.walnut, personId = null } = {}) {
  const w = fb.width, h = fb.height;
  const tell = POSTURE_TELLS[posture] || POSTURE_TELLS.open;
  const profile = PORTRAIT_PROFILES[personId] || { ...FALLBACK_PROFILE, coat: mix(PALETTE.umber, tint, 0.3) };
  const albedo = new fb.constructor(w, h);

  // PASS 1 — the smoky room is material, not a flat card fill.
  const wallBase = mix(PALETTE.umber, tint, 0.34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const plaster = fbm(x * 0.13, y * 0.11, { octaves: 3, seed: 31 });
    let wall = mix(mix(wallBase, PALETTE.ink, 0.30), mix(wallBase, PALETTE.smog, 0.10), plaster);
    if (y > h * 0.77) wall = mix(wall, PALETTE.ink, 0.23 + 0.12 * ((y - h * 0.77) / (h * 0.23)));
    albedo.setPixel(x, y, wall);
  }

  // PASS 2 — one readable bust silhouette, then costume/face planes within it.
  const headR = Math.max(10, Math.floor(h * 0.205));
  const cx = Math.round(w * 0.50 + profile.lean + tell.thrust * 0.35);
  const headCy = Math.round(h * 0.35 + tell.headDrop);
  const faceRx = Math.round(headR * profile.faceW);
  const faceRy = Math.round(headR * profile.faceH);
  const shoulderY = Math.round(h * tell.shoulderY);

  // Coat silhouette: raised, narrowed shoulders are the large hostile-state tell.
  for (let y = shoulderY; y < h; y++) {
    const p = (y - shoulderY) / Math.max(1, h - shoulderY - 1);
    const half = w * 0.48 * tell.spread * (0.68 + p * 0.32);
    const bodyCx = cx - tell.thrust * p * 0.25;
    for (let x = Math.floor(bodyCx - half); x <= Math.ceil(bodyCx + half); x++) {
      const cloth = fbm(x * 0.18, y * 0.22, { octaves: 3, seed: profile.seed });
      const side = Math.abs(x - bodyCx) / Math.max(1, half);
      albedo.setPixel(x, y, mix(profile.coat, PALETTE.ink, 0.08 + side * 0.22 + cloth * 0.10));
    }
  }

  // Neck, ears and face make a clean head-and-shoulders silhouette at card scale.
  fillEllipse(albedo, cx, shoulderY - 2, Math.round(faceRx * 0.46), Math.round(faceRy * 0.48), mix(profile.skin, PALETTE.umber, 0.28));
  fillEllipse(albedo, cx - faceRx, headCy + 1, 2, 5, mix(profile.skin, PALETTE.umber, 0.20));
  fillEllipse(albedo, cx + faceRx, headCy + 1, 2, 5, mix(profile.skin, PALETTE.umber, 0.34));
  fillEllipse(albedo, cx, headCy, faceRx, faceRy, profile.skin);
  paintFacePlanes(albedo, cx, headCy, faceRx, faceRy, profile);
  paintHair(albedo, cx, headCy, faceRx, faceRy, profile);
  paintExpression(albedo, cx, headCy, faceRx, faceRy, tell, profile);
  paintCostume(albedo, cx, shoulderY, headR, profile);

  // PASS 3 — coherent card lighting over background, skin, cloth and props together.
  // Warm key comes from upper-left; cool fill and a thin right rim preserve the bust
  // under the confrontation scrim without flattening the noir values.
  const lampX = -w * 0.08, lampY = h * 0.18, lampR = w * 1.35;
  const maxD = Math.hypot(w * 0.5, h * 0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = albedo.getPixel(x, y);
    const dl = Math.hypot(x - lampX, (y - lampY) * 1.05) / lampR;
    const key = dl < 1 ? Math.pow(1 - dl, 1.45) : 0;
    const rightFill = Math.pow(x / Math.max(1, w - 1), 1.8);
    let lr = 0.55 + key * 1.05 + rightFill * 0.08;
    let lg = 0.52 + key * 0.82 + rightFill * 0.12;
    let lb = 0.50 + key * 0.48 + rightFill * 0.24;
    // Soft centre lift is compositional: the face stays the card focal point.
    const faceLift = Math.max(0, 1 - Math.hypot((x - cx) * 0.9, y - headCy) / (headR * 2.7));
    lr += faceLift * 0.20; lg += faceLift * 0.15; lb += faceLift * 0.09;
    let rr = a[0] * lr, gg = a[1] * lg, bb = a[2] * lb;
    const haze = fbm(x * 0.05, y * 0.05, { octaves: 2, seed: 41 }) * (0.05 + 0.04 * (1 - y / h));
    rr += (150 - rr) * haze * 0.35; gg += (130 - gg) * haze * 0.35; bb += (110 - bb) * haze * 0.35;
    const dither = (bayer(x, y) - 0.5) * 6;
    const vig = 1 - 0.38 * Math.pow(Math.hypot(x - w / 2, y - h / 2) / maxD, 2.1);
    fb.setPixel(x, y, rgba((rr + dither) * vig, (gg + dither) * vig, (bb + dither) * vig, 255));
  }
}

function paintFacePlanes(fb, cx, cy, rx, ry, profile) {
  // Warm left cheek, darker jaw/right temple and a narrow nose plane establish volume.
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    const cur = fb.getPixel(x, y);
    const grain = fbm(x * 0.24, y * 0.22, { octaves: 2, seed: profile.seed + 5 });
    let plane = nx > 0.12 ? mix(cur, PALETTE.umber, 0.18 + nx * 0.20) : mix(cur, PALETTE.mustard, 0.06 * (1 - grain));
    if (ny > 0.58) plane = mix(plane, PALETTE.umber, 0.15);
    fb.setPixel(x, y, plane);
  }
  fillEllipse(fb, cx - Math.round(rx * 0.34), cy + Math.round(ry * 0.14), Math.max(2, Math.round(rx * 0.22)), Math.max(1, Math.round(ry * 0.13)), mix(profile.skin, PALETTE.mustard, 0.18));
  fb.fillRect(cx - 1, cy - 1, 2, Math.max(4, Math.round(ry * 0.34)), mix(profile.skin, PALETTE.mustard, 0.25));
  fb.fillRect(cx + 1, cy + Math.round(ry * 0.27), 3, 1, mix(profile.skin, PALETTE.umber, 0.42));
}

function paintHair(fb, cx, cy, rx, ry, profile) {
  const top = cy - ry;
  if (profile.hairStyle === 'swept') {
    for (let y = top - 1; y < cy - ry * 0.40; y++) {
      const half = Math.max(2, Math.round(rx * (0.45 + (y - top + 2) / Math.max(1, ry * 0.9))));
      fb.fillRect(cx - half - 2, y, half * 2 + 4, 1, mix(profile.hair, PALETTE.walnut, ((y + cx) % 4) * 0.05));
    }
    fb.fillRect(cx - rx, top + 4, 4, Math.round(ry * 0.46), profile.hair);
  } else if (profile.hairStyle === 'parted') {
    fillEllipse(fb, cx, top + Math.round(ry * 0.18), rx, Math.round(ry * 0.38), profile.hair);
    fb.fillRect(cx - 1, top, 1, Math.round(ry * 0.40), mix(profile.hair, PALETTE.smog, 0.30));
    fb.fillRect(cx + rx - 3, cy - 4, 3, Math.round(ry * 0.50), profile.hair);
  } else if (profile.hairStyle === 'crown') {
    fillEllipse(fb, cx, top + Math.round(ry * 0.14), rx + 2, Math.round(ry * 0.42), profile.hair);
    fb.fillRect(cx - rx - 1, cy - Math.round(ry * 0.36), 4, Math.round(ry * 0.86), profile.hair);
    fb.fillRect(cx + rx - 2, cy - Math.round(ry * 0.32), 4, Math.round(ry * 0.80), profile.hair);
  } else {
    fillEllipse(fb, cx, top + Math.round(ry * 0.16), rx, Math.round(ry * 0.34), profile.hair);
  }
}

function paintExpression(fb, cx, cy, rx, ry, tell, profile) {
  const eyeY = cy - Math.round(ry * 0.12);
  const eyeDx = Math.round(rx * 0.42);
  for (const side of [-1, 1]) {
    const ex = cx + side * eyeDx;
    fb.fillRect(ex - 1, eyeY, 3, 2, PALETTE.ink);
    for (let dx = -3; dx <= 3; dx++) {
      const slope = side * tell.brow * -0.20;
      fb.setPixel(ex + dx, eyeY - 4 + Math.round(dx * slope), mix(profile.hair, PALETTE.ink, 0.25));
    }
  }
  const mouthY = cy + Math.round(ry * 0.52);
  const mouthHalf = Math.max(4, Math.round(rx * 0.43));
  for (let dx = -mouthHalf; dx <= mouthHalf; dx++) {
    const arc = Math.round((1 - Math.pow(dx / mouthHalf, 2)) * tell.mouth * 0.75);
    fb.setPixel(cx + dx, mouthY + arc, mix(PALETTE.ink, PALETTE.burntOrange, 0.18));
  }
  if (tell.brow >= 2) fb.fillRect(cx - 1, eyeY + 3, 2, 2, mix(profile.skin, PALETTE.umber, 0.36));
}

function paintCostume(fb, cx, shoulderY, headR, profile) {
  const lapelLen = Math.round(headR * 1.25);
  for (let i = 0; i < lapelLen; i++) {
    const flare = Math.round(i * (profile.collar === 'wide' ? 0.50 : 0.34));
    fb.setPixel(cx - flare, shoulderY + i, profile.accent);
    fb.setPixel(cx + flare, shoulderY + i, mix(profile.accent, PALETTE.ink, 0.20));
    if (profile.collar === 'double' && i < lapelLen * 0.7) fb.setPixel(cx - flare - 2, shoulderY + i, mix(profile.accent, PALETTE.paper, 0.32));
  }
  if (profile.collar === 'bow') {
    fillEllipse(fb, cx - 4, shoulderY + 4, 4, 2, profile.accent);
    fillEllipse(fb, cx + 4, shoulderY + 4, 4, 2, profile.accent);
  }
  if (profile.collar === 'bars') for (let y = shoulderY + 5; y < shoulderY + 15; y += 4) fb.fillRect(cx - 10, y, 20, 1, profile.accent);

  if (profile.prop === 'towel') {
    const px = cx + Math.round(headR * 0.78);
    for (let y = shoulderY + 9; y < shoulderY + 34; y++) fb.fillRect(px + Math.round(Math.sin(y * 0.55)), y, 8, 1, mix(PALETTE.paper, PALETTE.faintInk, (y % 5 === 0) ? 0.22 : 0.04));
  }
  if (profile.prop === 'pad') {
    const px = cx - headR - 3, py = shoulderY + 11;
    fb.fillRect(px, py, 12, 18, PALETTE.paper); fb.strokeRect(px, py, 12, 18, mix(PALETTE.walnut, PALETTE.ink, 0.35));
    for (let y = py + 4; y < py + 15; y += 4) fb.fillRect(px + 2, y, 7, 1, PALETTE.faintInk);
  }
  if (profile.prop === 'keys') for (let i = 0; i < 3; i++) {
    const px = cx + headR - i * 3, py = shoulderY + 18 + i * 4;
    fillEllipse(fb, px, py, 3, 3, profile.accent); fillEllipse(fb, px, py, 1, 1, PALETTE.ink);
  }
  if (profile.prop === 'baton') for (let i = 0; i < Math.round(headR * 1.8); i++) {
    fb.setPixel(cx + Math.round(headR * 0.50 + i * 0.28), shoulderY + 3 + i, profile.accent);
  }
}

function fillEllipse(fb, cx, cy, rx, ry, color) {
  rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry));
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) fb.setPixel(Math.round(cx + x), Math.round(cy + y), color);
  }
}

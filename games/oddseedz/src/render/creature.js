// Procedural creature rendering. Pure canvas-2D, no assets. One parameterized
// rig varied by archetype (silhouette parts), hue (palette), and seed (details)
// plus squash-and-stretch idle, blinking, and expressive eyes. The bar this
// must clear at every proof shot: "does it look cheap?" A bare circle would be
// a defect, so this leans into charm — big eyes, a belly, cheeks, a bob.
//
// Imports the shared seeded RNG so per-creature detail choices (spots, ear
// count, brow tilt) are stable across frames and reloads.

import { makeRng } from '../engine/rng.js';
import { affinityOf } from '../data/roster.js';

const TAU = Math.PI * 2;

function hsl(h, s, l, a = 1) {
  return `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
}

// Build the full palette for a creature from its hue + rarity.
// opts.silhouette forces every colour to the same dark tone so the shape can be
// judged without the palette layer (used by M13 silhouette proof shots).
export function paletteFor(creature, opts = {}) {
  if (opts.silhouette) {
    const ink = '#0a0a14';
    return {
      h: 0, silhouette: true, body: ink, bodyLo: ink, bodyHi: ink, outline: ink,
      belly: ink, accent: ink, cheek: ink, eyeWhite: ink, eyeDark: ink,
      shine: ink, aura: 'rgba(10,10,20,0.16)',
    };
  }
  const h = creature.species.hue;
  const rarity = creature.rarity;
  const satBump = { common: 0, uncommon: 4, rare: 8, epic: 12, legendary: 16 }[rarity] || 0;
  const s = 58 + satBump;
  return {
    h,
    body: hsl(h, s, 62),
    bodyLo: hsl(h, s, 50),
    bodyHi: hsl(h, s - 6, 74),
    outline: hsl(h, s - 8, 30),
    belly: hsl(h, s - 20, 86),
    accent: hsl(h + 42, s + 6, 56),
    cheek: hsl((h + 350) % 360, 70, 68, 0.55),
    eyeWhite: '#fbfcff',
    eyeDark: hsl(h, 34, 16),
    shine: 'rgba(255,255,255,0.85)',
    aura: hsl(h + 20, 80, 60, 0.16),
  };
}

// Per-species palette overrides. Some creatures are defined more by their
// real-world colours than by the archetype hue wheel; this lets them keep the
// shared body plan while reading as the right species. Silhouette mode ignores
// these overrides so the shape audit stays pure.
const SPECIES_PALETTE = {
  cow: () => ({
    h: 0, body: '#f4f4f7', bodyLo: '#d8d8e0', bodyHi: '#ffffff',
    outline: '#0d0d12', belly: '#f7f7fa', accent: '#c9a0c9', cheek: 'rgba(255,190,190,0.45)',
    eyeWhite: '#fbfcff', eyeDark: '#0d0d12',
  }),
  dice: (p) => ({
    body: '#f2f2f5', bodyLo: '#c8c8d0', bodyHi: '#ffffff',
    outline: '#0d0d12', belly: '#f2f2f5', accent: p.accent, cheek: p.cheek,
    eyeWhite: '#fbfcff', eyeDark: '#0d0d12',
  }),
  panda: () => ({
    h: 0, body: '#f5f5f7', bodyLo: '#e0e0e5', bodyHi: '#ffffff',
    outline: '#0d0d12', belly: '#f7f7fa', accent: '#0d0d12', cheek: 'rgba(255,190,190,0.45)',
    eyeWhite: '#fbfcff', eyeDark: '#0d0d12',
  }),
  raccoon: () => ({
    h: 215, body: '#8a8a96', bodyLo: '#6a6a78', bodyHi: '#a8a8b2',
    outline: '#15151a', belly: '#b8b8c2', accent: '#15151a', cheek: 'rgba(255,200,200,0.4)',
    eyeWhite: '#fbfcff', eyeDark: '#15151a',
  }),
  bat: (p) => ({
    h: 265, body: '#3a2e4a', bodyLo: '#241b30', bodyHi: '#524260',
    outline: '#0f0b14', belly: '#4a3e5a', accent: p.accent, cheek: 'rgba(180,160,200,0.35)',
    eyeWhite: '#e8e0f0', eyeDark: '#0f0b14',
  }),
  coopa: () => ({
    h: 95, body: '#6b8c42', bodyLo: '#4a632c', bodyHi: '#8eb05a',
    outline: '#1a2210', belly: '#c4d6a8', accent: '#8eb05a', cheek: 'rgba(200,220,170,0.45)',
    eyeWhite: '#f4f8e8', eyeDark: '#1a2210',
  }),
  octopus: (p) => ({
    h: 350, body: '#c65a72', bodyLo: '#963e54', bodyHi: '#e07a90',
    outline: '#2a0f16', belly: '#e8a0b0', accent: p.accent, cheek: 'rgba(255,200,210,0.45)',
    eyeWhite: '#fff0f4', eyeDark: '#2a0f16',
  }),
  'joe-camel': (p) => ({
    body: '#c4a06a', bodyLo: '#a08050', bodyHi: '#dec090',
    outline: '#2a1f10', belly: '#e6d4b0', accent: p.accent, cheek: 'rgba(255,210,190,0.45)',
    eyeWhite: '#fff8e8', eyeDark: '#2a1f10',
  }),
  claude: (p) => ({
    h: 18, body: '#d97a5e', bodyLo: '#b55d44', bodyHi: '#f09a7e',
    outline: '#2d1510', belly: '#f5c4b0', accent: '#f5c4b0', cheek: 'rgba(255,200,190,0.5)',
    eyeWhite: '#fff4f0', eyeDark: '#2d1510',
  }),
};

function applySpeciesPalette(p, species) {
  if (p.silhouette) return p;
  const id = species && species.id;
  const over = id && SPECIES_PALETTE[id];
  return over ? { ...p, ...over(p) } : p;
}

// Rarity -> a soft aura / sparkle budget. Legendary glows; common is plain.
const RARITY_SPARKLE = { common: 0, uncommon: 0, rare: 2, epic: 3, legendary: 5 };

// --- species trait layer (M7) ------------------------------------------------
// The archetype gives the base rig; the four traits (ears/face/pattern/eyes)
// paint the species on top. traitsFor merges a species' traits over an archetype
// default so a bare foe or a pre-M7 save still renders a sensible face.
const ARCH_DEFAULT_TRAITS = {
  blob: { ears: 'none', face: 'none', pattern: 'none', eyes: 2 },
  critter: { ears: 'pointed', face: 'muzzle', pattern: 'none', eyes: 2 },
  avian: { ears: 'none', face: 'beak', pattern: 'none', eyes: 2 },
  bug: { ears: 'none', face: 'none', pattern: 'none', eyes: 2 },
  aquatic: { ears: 'fin', face: 'none', pattern: 'none', eyes: 2 },
  humanoid: { ears: 'none', face: 'none', pattern: 'none', eyes: 2 },
  orb: { ears: 'none', face: 'none', pattern: 'none', eyes: 2 },
  object: { ears: 'none', face: 'none', pattern: 'none', eyes: 2 },
  plant: { ears: 'none', face: 'none', pattern: 'none', eyes: 2 },
  spectral: { ears: 'none', face: 'none', pattern: 'none', eyes: 2 },
};
function traitsFor(species) {
  const d = ARCH_DEFAULT_TRAITS[species && species.archetype] || ARCH_DEFAULT_TRAITS.blob;
  return { ...d, ...((species && species.traits) || {}) };
}

// A darker shade of the body hue for markings — reads cohesive, never muddy.
// In silhouette mode all markings collapse to the body ink so only shape shows.
function markColor(p, dl = 26) {
  if (p.silhouette) return p.body;
  return hsl(p.h, 46, Math.max(18, 50 - dl));
}

// Head-top ears/horns/crest, keyed to the species' `ears` trait. Drawn on the
// body silhouette so a Cat (pointed) and a Corgi (floppy) split at a glance.
function drawEars(ctx, p, cx, cy, rx, ry, t, ears) {
  if (ears === 'none') return;
  ctx.save();
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.strokeStyle = p.outline;
  const topY = cy - ry * 0.72;
  if (ears === 'pointed') {
    for (const dir of [-1, 1]) {
      ctx.fillStyle = p.body;
      ctx.beginPath();
      ctx.moveTo(cx + dir * rx * 0.5, topY);
      ctx.quadraticCurveTo(cx + dir * rx * 0.98, cy - ry * 1.55, cx + dir * rx * 0.24, cy - ry * 0.98);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // inner ear
      ctx.fillStyle = p.cheek;
      ctx.beginPath();
      ctx.moveTo(cx + dir * rx * 0.46, cy - ry * 0.82);
      ctx.quadraticCurveTo(cx + dir * rx * 0.74, cy - ry * 1.28, cx + dir * rx * 0.34, cy - ry * 0.95);
      ctx.closePath();
      ctx.fill();
    }
  } else if (ears === 'floppy') {
    for (const dir of [-1, 1]) {
      ctx.fillStyle = p.bodyLo;
      ctx.beginPath();
      ctx.moveTo(cx + dir * rx * 0.5, cy - ry * 0.6);
      ctx.quadraticCurveTo(cx + dir * rx * 1.12, cy - ry * 0.5, cx + dir * rx * 0.86, cy + ry * 0.28);
      ctx.quadraticCurveTo(cx + dir * rx * 0.6, cy - ry * 0.05, cx + dir * rx * 0.42, cy - ry * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (ears === 'round') {
    for (const dir of [-1, 1]) {
      ctx.fillStyle = p.bodyLo;
      ctx.beginPath();
      ctx.arc(cx + dir * rx * 0.6, cy - ry * 0.78, rx * 0.26, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (ears === 'long') {
    for (const dir of [-1, 1]) {
      ctx.fillStyle = p.body;
      ctx.beginPath();
      ctx.ellipse(cx + dir * rx * 0.34, cy - ry * 1.25, rx * 0.13, ry * 0.55, dir * 0.12, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.cheek;
      ctx.beginPath();
      ctx.ellipse(cx + dir * rx * 0.34, cy - ry * 1.2, rx * 0.06, ry * 0.36, dir * 0.12, 0, TAU);
      ctx.fill();
    }
  } else if (ears === 'tuft') {
    for (const dir of [-1, 1]) {
      ctx.strokeStyle = p.outline;
      ctx.lineWidth = Math.max(2, rx * 0.05);
      for (const j of [0, 1, 2]) {
        const sp = (j - 1) * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx + dir * rx * 0.32, topY);
        ctx.quadraticCurveTo(
          cx + dir * rx * (0.5 + sp * 0.5),
          cy - ry * (1.2 + Math.abs(sp) * 0.2),
          cx + dir * rx * (0.42 + sp),
          cy - ry * 1.45,
        );
        ctx.stroke();
      }
    }
  } else if (ears === 'horns') {
    for (const dir of [-1, 1]) {
      ctx.fillStyle = p.bodyHi;
      ctx.beginPath();
      ctx.moveTo(cx + dir * rx * 0.44, topY);
      ctx.quadraticCurveTo(cx + dir * rx * 0.9, cy - ry * 1.3, cx + dir * rx * 0.78, cy - ry * 1.55);
      ctx.quadraticCurveTo(cx + dir * rx * 0.6, cy - ry * 1.28, cx + dir * rx * 0.28, cy - ry * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (ears === 'antler') {
    for (const dir of [-1, 1]) {
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = Math.max(2.5, rx * 0.06);
      ctx.lineCap = 'round';
      const bx = cx + dir * rx * 0.3;
      ctx.beginPath();
      ctx.moveTo(bx, topY);
      ctx.lineTo(cx + dir * rx * 0.5, cy - ry * 1.5);
      ctx.moveTo(cx + dir * rx * 0.42, cy - ry * 1.18);
      ctx.lineTo(cx + dir * rx * 0.74, cy - ry * 1.28);
      ctx.moveTo(cx + dir * rx * 0.47, cy - ry * 1.35);
      ctx.lineTo(cx + dir * rx * 0.3, cy - ry * 1.62);
      ctx.stroke();
    }
  } else if (ears === 'fin') {
    ctx.fillStyle = p.bodyLo;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.28, cy - ry * 0.7);
    ctx.quadraticCurveTo(cx + rx * 0.05, cy - ry * 1.5, cx + rx * 0.34, cy - ry * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// The lighter snout/muzzle pad, drawn low on the face BEHIND eyes and mouth.
function drawMuzzle(ctx, p, cx, cy, rx, ry, face) {
  if (face !== 'muzzle') return;
  ctx.save();
  blobPath(ctx, cx, cy, rx, ry);
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.34, rx * 0.4, ry * 0.32, 0, 0, TAU);
  ctx.fill();
  // a little nose dot
  ctx.fillStyle = p.outline;
  ctx.beginPath();
  ctx.arc(cx, cy + ry * 0.16, rx * 0.07, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Foreground face parts: beak, bill, tusks, fangs — drawn over the mouth.
function drawFaceFront(ctx, p, cx, my, rx, ry, face) {
  ctx.save();
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.strokeStyle = p.outline;
  if (face === 'beak') {
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.16, my - ry * 0.02);
    ctx.lineTo(cx + rx * 0.16, my - ry * 0.02);
    ctx.lineTo(cx, my + ry * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (face === 'bill') {
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.ellipse(cx, my + ry * 0.04, rx * 0.26, ry * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = p.outline;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.24, my + ry * 0.04);
    ctx.lineTo(cx + rx * 0.24, my + ry * 0.04);
    ctx.stroke();
  } else if (face === 'tusk') {
    ctx.fillStyle = '#fbfcff';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * rx * 0.12, my - ry * 0.02);
      ctx.quadraticCurveTo(cx + dir * rx * 0.2, my + ry * 0.28, cx + dir * rx * 0.1, my + ry * 0.34);
      ctx.lineTo(cx + dir * rx * 0.04, my + ry * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (face === 'fangs') {
    ctx.fillStyle = '#fbfcff';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * rx * 0.1, my + ry * 0.02);
      ctx.lineTo(cx + dir * rx * 0.17, my + ry * 0.02);
      ctx.lineTo(cx + dir * rx * 0.135, my + ry * 0.14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Body markings, clipped to the silhouette: spots, stripes, patch, star belly,
// scales, swirl. Seeded so a given creature's spots stay put across frames.
function drawPattern(ctx, p, cx, cy, rx, ry, pattern, rng) {
  if (pattern === 'none') return;
  ctx.save();
  blobPath(ctx, cx, cy, rx, ry);
  ctx.clip();
  const mark = markColor(p);
  if (pattern === 'spots') {
    ctx.fillStyle = mark;
    const n = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const ang = rng() * TAU;
      const rr = rng() * 0.7;
      const sx = cx + Math.cos(ang) * rx * rr;
      const sy = cy + Math.sin(ang) * ry * rr - ry * 0.1;
      ctx.beginPath();
      ctx.arc(sx, sy, rx * (0.08 + rng() * 0.07), 0, TAU);
      ctx.fill();
    }
  } else if (pattern === 'stripes') {
    ctx.strokeStyle = mark;
    ctx.lineWidth = rx * 0.14;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const yy = cy - ry * 0.6 + (i / (n - 1)) * ry * 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - rx, yy);
      ctx.quadraticCurveTo(cx, yy - ry * 0.08, cx + rx, yy);
      ctx.stroke();
    }
  } else if (pattern === 'patch') {
    ctx.fillStyle = mark;
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.42, cy - ry * 0.1, rx * 0.34, ry * 0.4, 0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + rx * 0.36, cy + ry * 0.35, rx * 0.3, ry * 0.34, -0.2, 0, TAU);
    ctx.fill();
  } else if (pattern === 'starbelly') {
    ctx.fillStyle = hsl(p.h + 46, 90, 76, 0.9);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + rng();
      star(ctx, cx + Math.cos(ang) * rx * 0.5, cy + Math.sin(ang) * ry * 0.42, rx * (0.08 + rng() * 0.06));
    }
  } else if (pattern === 'scales') {
    ctx.strokeStyle = mark;
    ctx.lineWidth = Math.max(1.5, rx * 0.03);
    for (let row = 0; row < 3; row++) {
      const yy = cy - ry * 0.2 + row * ry * 0.34;
      for (let col = -2; col <= 2; col++) {
        const xx = cx + col * rx * 0.34 + (row % 2 ? rx * 0.17 : 0);
        ctx.beginPath();
        ctx.arc(xx, yy, rx * 0.18, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
      }
    }
  } else if (pattern === 'swirl') {
    ctx.strokeStyle = mark;
    ctx.lineWidth = rx * 0.09;
    ctx.beginPath();
    const sx = cx + rx * 0.2;
    const sy = cy + ry * 0.1;
    for (let a = 0; a < TAU * 2.4; a += 0.2) {
      const r = rx * 0.06 * a;
      const px = sx + Math.cos(a) * r;
      const py = sy + Math.sin(a) * r * 0.9;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function blobPath(ctx, cx, cy, rx, ry) {
  // A rounded, slightly bottom-heavy body via four bezier quarters.
  const k = 0.5523;
  const oxx = rx * k;
  const oyy = ry * k;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(cx + oxx, cy - ry, cx + rx, cy - oyy, cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy + oyy * 1.12, cx + oxx, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - oxx, cy + ry, cx - rx, cy + oyy * 1.12, cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy - oyy, cx - oxx, cy - ry, cx, cy - ry);
  ctx.closePath();
}

// --- archetype body rigs (M13) -----------------------------------------------
// Each rig draws its silhouette at (cx,cy) using rx/ry as the face reference.
// The shared eyes/ears/muzzle/cheeks/mouth layer is painted on top with the
// same coordinates, so the certified face/trait/palette system stays untouched.

// Default blob: the classic round body + belly patch + jaunty hair curl.
// Used as the fallback while new rigs are landed one archetype at a time.
function drawBlobBody(ctx, p, cx, cy, rx, ry, t, rng, species) {
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  blobPath(ctx, cx, cy, rx, ry);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  ctx.stroke();

  // belly patch
  ctx.save();
  blobPath(ctx, cx, cy, rx, ry);
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.32, rx * 0.56, ry * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // jaunty single hair curl (only when no trait crest already tops the head)
  const ears = species && species.traits && species.traits.ears;
  if (ears === 'none') {
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = Math.max(2, rx * 0.045);
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.92);
    ctx.quadraticCurveTo(cx + rx * 0.22, cy - ry * 1.35, cx - rx * 0.05, cy - ry * 1.4);
    ctx.stroke();
  }
}

// Orb: a clean sphere — the round family stays deliberately round (M13).
function drawOrbBody(ctx, p, cx, cy, rx, ry) {
  const r = Math.max(rx, ry) * 0.98;
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.45, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  ctx.stroke();

  // soft gloss crescent
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(2, rx * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx - r * 0.32, cy - r * 0.32, r * 0.55, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

// Critter: quadruped mass — a distinct head + a lower oval torso + four stubby
// legs. The face reference (cx,cy,rx,ry) is the head, so the certified face layer
// lands on the head where it belongs.
function drawCritterBody(ctx, p, cx, cy, rx, ry, t, rng) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // torso behind/below the head
  const tx = cx;
  const ty = cy + ry * 0.95;
  const trx = rx * 1.18;
  const try_ = ry * 0.72;
  const grad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // four stubby legs
  ctx.fillStyle = p.bodyLo;
  const legW = rx * 0.18;
  const legH = ry * 0.46;
  const legY = ty + try_ * 0.82;
  for (const dir of [-1, 1]) {
    const frontX = cx + dir * rx * 0.42;
    const backX = cx + dir * rx * 0.92;
    for (const lx of [frontX, backX]) {
      ctx.beginPath();
      ctx.ellipse(lx, legY, legW, legH, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // a little tail behind
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.07);
  ctx.lineCap = 'round';
  const tailSway = Math.sin(t / 500) * rx * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - trx * 0.9, ty);
  ctx.quadraticCurveTo(cx - trx * 1.35, ty - ry * 0.25 + tailSway, cx - trx * 1.25, ty + ry * 0.35 + tailSway);
  ctx.stroke();

  // head on top (drawn last so it sits in front of torso)
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  blobPath(ctx, cx, cy, rx, ry);
  ctx.fillStyle = hGrad;
  ctx.fill();
  ctx.stroke();

  // muzzle-ish lighter patch on the lower face
  ctx.save();
  blobPath(ctx, cx, cy, rx, ry);
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.34, rx * 0.44, ry * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Avian: egg/teardrop body with wing stubs and tail feathers. The face sits on
// the upper, wider part of the egg; the lower body tapers to a tail point.
function drawAvianBody(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // tail feathers behind
  ctx.fillStyle = p.bodyLo;
  const tailWag = Math.sin(t / 400) * 0.08;
  ctx.save();
  ctx.translate(cx, cy + ry * 0.85);
  ctx.rotate(tailWag);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(i * rx * 0.32, ry * 0.55, rx * 0.22, ry * 0.55, i * 0.18, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // teardrop/egg body
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry * 1.3);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * 1.05, cy - ry, cx + rx, cy + ry * 0.5, cx + rx * 0.55, cy + ry * 1.15);
  ctx.quadraticCurveTo(cx, cy + ry * 1.38, cx - rx * 0.55, cy + ry * 1.15);
  ctx.bezierCurveTo(cx - rx, cy + ry * 0.5, cx - rx * 1.05, cy - ry, cx, cy - ry);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // wing stubs on the sides, flapping gently
  const flap = Math.sin(t / 240) * 0.18;
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + dir * rx * 0.78, cy + ry * 0.15);
    ctx.rotate(dir * (0.42 + flap));
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.62, ry * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // belly patch on the lower body
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * 1.05, cy - ry, cx + rx, cy + ry * 0.5, cx + rx * 0.55, cy + ry * 1.15);
  ctx.quadraticCurveTo(cx, cy + ry * 1.38, cx - rx * 0.55, cy + ry * 1.15);
  ctx.bezierCurveTo(cx - rx, cy + ry * 0.5, cx - rx * 1.05, cy - ry, cx, cy - ry);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.55, rx * 0.5, ry * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Bug: segmented body — small head + thorax + larger abdomen, six jointed legs,
// antennae on the head. The face reference is the head segment.
function drawBugBody(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // abdomen (largest segment, behind)
  const ax = cx + rx * 0.35;
  const ay = cy + ry * 0.15;
  const arx = rx * 0.92;
  const ary = ry * 0.78;
  const aGrad = ctx.createLinearGradient(ax, ay - ary, ax, ay + ary);
  aGrad.addColorStop(0, p.bodyHi);
  aGrad.addColorStop(0.5, p.body);
  aGrad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(ax, ay, arx, ary, 0, 0, TAU);
  ctx.fillStyle = aGrad;
  ctx.fill();
  ctx.stroke();

  // thorax (middle segment)
  const tx = cx - rx * 0.25;
  const ty = cy + ry * 0.05;
  const trx = rx * 0.55;
  const try_ = ry * 0.5;
  const tGrad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  tGrad.addColorStop(0, p.bodyHi);
  tGrad.addColorStop(0.55, p.body);
  tGrad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.fillStyle = tGrad;
  ctx.fill();
  ctx.stroke();

  // six legs (3 per side) sprouting from thorax
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.lineCap = 'round';
  const legWave = Math.sin(t / 300) * 0.08;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ang = (i - 1) * 0.55 + dir * (Math.PI / 2) + legWave * dir;
      const rLen = rx * (0.95 + i * 0.12);
      const kx = tx + Math.cos(ang) * rLen;
      const ky = ty + Math.sin(ang) * rLen * 0.6;
      ctx.beginPath();
      ctx.moveTo(tx + dir * trx * 0.5, ty + (i - 1) * ry * 0.18);
      ctx.quadraticCurveTo(tx + dir * (trx + rx * 0.35), ty + (i - 1) * ry * 0.25, kx, ky);
      ctx.stroke();
    }
  }

  // head (front segment, face reference)
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  blobPath(ctx, cx, cy, rx, ry);
  ctx.fillStyle = hGrad;
  ctx.fill();
  ctx.stroke();

  // antennae
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * rx * 0.28, cy - ry * 0.85);
    ctx.quadraticCurveTo(
      cx + dir * rx * 0.7,
      cy - ry * 1.5,
      cx + dir * rx * 0.5,
      cy - ry * 1.7,
    );
    ctx.stroke();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(cx + dir * rx * 0.5, cy - ry * 1.72, rx * 0.09, 0, TAU);
    ctx.fill();
  }
}

// Aquatic: horizontal fusiform body with a tail fin, dorsal fin, and side fins.
// The face reference is the front/top of the body where eyes go.
function drawAquaticBody(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // tail fin behind, swaying
  const sway = Math.sin(t / 340) * 0.18;
  ctx.fillStyle = p.bodyLo;
  ctx.save();
  ctx.translate(cx - rx * 1.05, cy + ry * 0.05);
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-rx * 0.55, -ry * 0.75, -rx * 0.25, -ry * 1.05);
  ctx.quadraticCurveTo(-rx * 0.12, -ry * 0.25, 0, 0);
  ctx.quadraticCurveTo(-rx * 0.12, ry * 0.25, -rx * 0.25, ry * 1.05);
  ctx.quadraticCurveTo(-rx * 0.55, ry * 0.75, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // trailing body/tentacles under the tail
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * rx * 0.28;
    const s = Math.sin(t / 300 + i) * rx * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.65, cy + ry * 0.25 + off * 0.3);
    ctx.quadraticCurveTo(cx - rx * 1.0 + s, cy + ry * 0.75 + off, cx - rx * 0.9 + s * 1.3, cy + ry * 1.2 + off);
    ctx.stroke();
  }

  // fusiform body
  const bx = cx + rx * 0.1;
  const by = cy + ry * 0.05;
  const brx = rx * 1.05;
  const bry = ry * 0.72;
  const grad = ctx.createLinearGradient(bx - brx, by - bry, bx + brx, by + bry);
  grad.addColorStop(0, p.bodyLo);
  grad.addColorStop(0.45, p.body);
  grad.addColorStop(0.8, p.bodyHi);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(bx, by, brx, bry, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // dorsal fin on top
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(bx - rx * 0.2, by - bry * 0.85);
  ctx.quadraticCurveTo(bx + rx * 0.05, by - bry * 1.55, bx + rx * 0.45, by - bry * 0.9);
  ctx.quadraticCurveTo(bx + rx * 0.15, by - bry * 0.7, bx - rx * 0.2, by - bry * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // side fins
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(bx + rx * 0.25, by + dir * bry * 0.55);
    ctx.rotate(dir * (0.35 + Math.sin(t / 420) * 0.08));
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.35, ry * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // belly patch
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(bx, by, brx * 0.88, bry * 0.7, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(bx + rx * 0.15, by + ry * 0.15, rx * 0.55, ry * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Humanoid: head + torso + two arms + two legs. The face reference is the head.
function drawHumanoidBody(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // torso (rounded rectangle/oval below head)
  const tx = cx;
  const ty = cy + ry * 1.15;
  const trx = rx * 0.82;
  const try_ = ry * 0.95;
  const tGrad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  tGrad.addColorStop(0, p.bodyHi);
  tGrad.addColorStop(0.5, p.body);
  tGrad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.roundRect(tx - trx, ty - try_, trx * 2, try_ * 2, rx * 0.22);
  ctx.fillStyle = tGrad;
  ctx.fill();
  ctx.stroke();

  // legs
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2.5, rx * 0.08);
  ctx.lineCap = 'round';
  const legSway = Math.sin(t / 520) * rx * 0.05;
  for (const dir of [-1, 1]) {
    const lx = tx + dir * trx * 0.55;
    ctx.beginPath();
    ctx.moveTo(lx, ty + try_ * 0.65);
    ctx.lineTo(lx + dir * legSway, ty + try_ * 1.45);
    ctx.stroke();
  }

  // arms
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2.5, rx * 0.07);
  const armSway = Math.sin(t / 500) * rx * 0.08;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(tx + dir * trx * 0.9, ty - try_ * 0.25);
    ctx.quadraticCurveTo(
      tx + dir * (trx + rx * 0.42),
      ty + armSway * dir,
      tx + dir * (trx + rx * 0.28),
      ty + try_ * 0.55 + armSway * dir,
    );
    ctx.stroke();
  }

  // head (face reference)
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  blobPath(ctx, cx, cy, rx, ry);
  ctx.fillStyle = hGrad;
  ctx.fill();
  ctx.stroke();
}

// Plant: a rooted stem + a leafy cap/canopy. The face reference is the centre of
// the canopy, so eyes/mouth sit on the plant's "head".
function drawPlantBody(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // stem
  const stemX = cx;
  const stemTop = cy + ry * 0.35;
  const stemBottom = cy + ry * 1.55;
  const stemW = rx * 0.22;
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(stemX - stemW, stemTop);
  ctx.lineTo(stemX + stemW, stemTop);
  ctx.quadraticCurveTo(stemX + stemW * 1.2, (stemTop + stemBottom) * 0.5, stemX + stemW * 0.8, stemBottom);
  ctx.lineTo(stemX - stemW * 0.8, stemBottom);
  ctx.quadraticCurveTo(stemX - stemW * 1.2, (stemTop + stemBottom) * 0.5, stemX - stemW, stemTop);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // small leaves sprouting from the stem
  ctx.fillStyle = p.accent;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(stemX + dir * stemW * 1.2, stemTop + ry * 0.35);
    ctx.rotate(dir * 0.6 + Math.sin(t / 500) * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, -ry * 0.25, rx * 0.18, ry * 0.38, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // canopy/cap
  const cGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry * 0.5);
  cGrad.addColorStop(0, p.bodyHi);
  cGrad.addColorStop(0.55, p.body);
  cGrad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.05, cy + ry * 0.45);
  ctx.quadraticCurveTo(cx - rx * 1.15, cy - ry * 1.05, cx, cy - ry);
  ctx.quadraticCurveTo(cx + rx * 1.15, cy - ry * 1.05, cx + rx * 1.05, cy + ry * 0.45);
  ctx.quadraticCurveTo(cx, cy + ry * 0.72, cx - rx * 1.05, cy + ry * 0.45);
  ctx.closePath();
  ctx.fillStyle = cGrad;
  ctx.fill();
  ctx.stroke();

  // underside/spot detail
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.05, cy + ry * 0.45);
  ctx.quadraticCurveTo(cx - rx * 1.15, cy - ry * 1.05, cx, cy - ry);
  ctx.quadraticCurveTo(cx + rx * 1.15, cy - ry * 1.05, cx + rx * 1.05, cy + ry * 0.45);
  ctx.quadraticCurveTo(cx, cy + ry * 0.72, cx - rx * 1.05, cy + ry * 0.45);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.12, rx * 0.55, ry * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Spectral: a wispy, tapered floating form — wide at the face, trailing into a
// ghostly tail. The face reference is the upper body.
function drawSpectralBody(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // soft aura behind
  ctx.fillStyle = p.aura;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.5, ry * 1.5, 0, 0, TAU);
  ctx.fill();

  // wispy tail tapering downward
  const tailSway = Math.sin(t / 500) * rx * 0.15;
  ctx.fillStyle = p.body;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.65, cy + ry * 0.35);
  ctx.bezierCurveTo(
    cx - rx * 1.05 + tailSway, cy + ry * 0.95,
    cx - rx * 0.45 + tailSway, cy + ry * 1.65,
    cx, cy + ry * 2.05,
  );
  ctx.bezierCurveTo(
    cx + rx * 0.45 - tailSway, cy + ry * 1.65,
    cx + rx * 1.05 - tailSway, cy + ry * 0.95,
    cx + rx * 0.65, cy + ry * 0.35,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // upper body (face region)
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry * 0.5);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + ry * 0.45);
  ctx.bezierCurveTo(cx - rx * 1.12, cy - ry * 0.82, cx - rx * 0.45, cy - ry, cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * 0.45, cy - ry, cx + rx * 1.12, cy - ry * 0.82, cx + rx, cy + ry * 0.45);
  ctx.bezierCurveTo(cx + rx * 0.55, cy + ry * 0.78, cx - rx * 0.55, cy + ry * 0.78, cx - rx, cy + ry * 0.45);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // ghostly "sheet" bottom edge
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.72, cy + ry * 0.42);
  ctx.quadraticCurveTo(cx - rx * 0.25, cy + ry * 0.62, cx, cy + ry * 0.42);
  ctx.quadraticCurveTo(cx + rx * 0.25, cy + ry * 0.62, cx + rx * 0.72, cy + ry * 0.42);
  ctx.stroke();
}

// --- object / species-iconic silhouettes (M13) -------------------------------
// Object archetype species and a few named overrides get a shape keyed by
// species id. The certified face/trait/palette layer is still drawn on top.

// Generic object fallback: a simple box with a lid seam.
function drawObjectBox(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const w = rx * 1.15;
  const h = ry * 1.25;
  const x = cx - w;
  const y = cy - h * 0.85;
  const grad = ctx.createLinearGradient(x, y, x, y + h * 2);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w * 2, h * 2, rx * 0.18);
  ctx.fill();
  ctx.stroke();
  // lid seam
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.04);
  ctx.beginPath();
  ctx.moveTo(x + rx * 0.1, y + h * 0.45);
  ctx.lineTo(x + w * 2 - rx * 0.1, y + h * 0.45);
  ctx.stroke();
}

// Taco shape is defined in the M13b recognizability section below.

// Box: a cardboard box with flaps slightly open.
function drawBoxShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const w = rx;
  const h = ry * 1.1;
  const x = cx - w;
  const y = cy - h * 0.65;
  const grad = ctx.createLinearGradient(x, y, x, y + h * 2);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w * 2, h * 2, rx * 0.1);
  ctx.fill();
  ctx.stroke();
  // flaps
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(cx, y - ry * 0.35);
  ctx.lineTo(x + w * 2, y);
  ctx.lineTo(x + w * 2, y + h * 0.05);
  ctx.lineTo(cx, y + ry * 0.25);
  ctx.lineTo(x, y + h * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Dice: a true cube seen from the front corner, with a square front face and
// readable pips dead-centre on that face. The top and side faces give depth.
function drawDiceShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  const face = rx * 0.92; // front face half-size
  const depth = rx * 0.42; // extrusion for top/right faces
  const fx = cx - face;
  const fy = cy - face * 0.95;
  const fw = face * 2;
  const fh = face * 1.9;

  // top face (behind and above the front face)
  ctx.fillStyle = p.bodyHi;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + depth, fy - depth);
  ctx.lineTo(fx + fw + depth, fy - depth);
  ctx.lineTo(fx + fw, fy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // right face (behind and beside the front face)
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(fx + fw, fy);
  ctx.lineTo(fx + fw + depth, fy - depth);
  ctx.lineTo(fx + fw + depth, fy + fh - depth);
  ctx.lineTo(fx + fw, fy + fh);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // front face: a crisp square
  ctx.fillStyle = p.body;
  ctx.beginPath();
  ctx.rect(fx, fy, fw, fh);
  ctx.fill();
  ctx.stroke();

  // readable pips on the front face (5 dice pattern)
  ctx.fillStyle = p.outline;
  const pip = rx * 0.11;
  const offsets = [
    [-0.5, -0.55], [0.5, -0.55], [0, 0],
    [-0.5, 0.55], [0.5, 0.55],
  ];
  for (const [dx, dy] of offsets) {
    ctx.beginPath();
    ctx.arc(cx + dx * face, cy + dy * face * 0.95, pip, 0, TAU);
    ctx.fill();
  }
}

// Anchor: classic nautical anchor shape.
function drawAnchorShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry * 1.3, cx, cy + ry * 1.3);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const sh = ry * 1.35;
  const sw = rx * 0.22;
  ctx.beginPath();
  // ring top
  ctx.arc(cx, cy - ry * 1.15, rx * 0.22, Math.PI, 0);
  // shaft right
  ctx.lineTo(cx + sw * 0.6, cy + sh * 0.75);
  // right fluke
  ctx.quadraticCurveTo(cx + rx * 1.05, cy + sh * 0.55, cx + rx * 0.95, cy + sh * 1.05);
  ctx.quadraticCurveTo(cx + rx * 0.55, cy + sh * 0.95, cx + sw * 0.4, cy + sh * 0.85);
  // bottom point
  ctx.lineTo(cx, cy + sh);
  // shaft left up
  ctx.lineTo(cx - sw * 0.4, cy + sh * 0.85);
  ctx.quadraticCurveTo(cx - rx * 0.55, cy + sh * 0.95, cx - rx * 0.95, cy + sh * 1.05);
  ctx.quadraticCurveTo(cx - rx * 1.05, cy + sh * 0.55, cx - sw * 0.6, cy + sh * 0.75);
  ctx.lineTo(cx - sw * 0.5, cy - ry * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Burger: stacked layers (bun, patty, lettuce, cheese, top bun).
function drawBurgerShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const w = rx * 1.05;
  // bottom bun
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.55, w, ry * 0.28, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // patty
  ctx.fillStyle = p.body;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.28, w * 0.95, ry * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // lettuce wobble
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = cx - w + t * w * 2;
    const y = cy + ry * 0.05 + Math.sin(t * Math.PI * 6) * ry * 0.05;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](x, y);
  }
  ctx.stroke();
  // cheese
  ctx.fillStyle = p.bodyHi;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.75, cy - ry * 0.08);
  ctx.lineTo(cx + w * 0.75, cy - ry * 0.08);
  ctx.lineTo(cx + w * 0.55, cy + ry * 0.18);
  ctx.lineTo(cx - w * 0.85, cy + ry * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // top bun
  ctx.fillStyle = p.body;
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.22, w * 0.92, ry * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // sesame seeds
  ctx.fillStyle = p.belly;
  for (let i = 0; i < 5; i++) {
    const ang = i * 1.1 + 0.2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * rx * 0.35, cy - ry * 0.28 + Math.sin(ang) * ry * 0.18, rx * 0.05, 0, TAU);
    ctx.fill();
  }
}

// Coffee: a mug with a handle and rising steam.
function drawCoffeeShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const w = rx * 0.9;
  const h = ry * 1.05;
  const x = cx - w;
  const y = cy - h * 0.55;
  const grad = ctx.createLinearGradient(x, y, x, y + h * 2);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * 2, y);
  ctx.quadraticCurveTo(x + w * 2.2, y + h, x + w * 2, y + h * 2);
  ctx.lineTo(x, y + h * 2);
  ctx.quadraticCurveTo(x - w * 0.2, y + h, x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // coffee surface
  ctx.fillStyle = p.outline;
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.12, w * 0.82, ry * 0.14, 0, 0, TAU);
  ctx.fill();
  // handle
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2.5, rx * 0.07);
  ctx.beginPath();
  ctx.arc(cx + w * 1.35, cy + ry * 0.25, rx * 0.35, -Math.PI * 0.45, Math.PI * 0.45);
  ctx.stroke();
  // steam
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(2, rx * 0.04);
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const sx = cx + i * rx * 0.28;
    const off = (t / 800 + i * 0.7) % 1;
    ctx.beginPath();
    ctx.moveTo(sx, y - ry * 0.15);
    ctx.quadraticCurveTo(sx + Math.sin(off * Math.PI * 2) * rx * 0.2, y - ry * 0.55 - off * ry * 0.6, sx, y - ry * 0.85 - off * ry * 0.6);
    ctx.stroke();
  }
}

// Dali Clock: a melting disc with sagging numbers/hands.
function drawDaliClockShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createRadialGradient(cx - rx * 0.25, cy - ry * 0.25, rx * 0.1, cx, cy, rx);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  // main disc
  ctx.beginPath();
  ctx.arc(cx, cy - ry * 0.15, rx * 0.92, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // melt drips
  ctx.fillStyle = p.bodyLo;
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * TAU + 0.3;
    const dx = cx + Math.cos(ang) * rx * 0.85;
    const dy = cy - ry * 0.15 + Math.sin(ang) * ry * 0.85;
    const len = ry * (0.25 + (i % 2) * 0.18);
    ctx.beginPath();
    ctx.ellipse(dx, dy + len * 0.5, rx * 0.12, len * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // clock hands
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.04);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry * 0.15);
  ctx.lineTo(cx + rx * 0.35, cy - ry * 0.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry * 0.15);
  ctx.lineTo(cx - rx * 0.25, cy + ry * 0.12);
  ctx.stroke();
}

// Mimic: a treasure chest with a toothy maw.
function drawMimicShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const w = rx * 1.05;
  const h = ry * 0.85;
  const x = cx - w;
  const y = cy - h * 0.35;
  const grad = ctx.createLinearGradient(x, y, x, y + h * 2);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w * 2, h * 2, rx * 0.12);
  ctx.fill();
  ctx.stroke();
  // open lid
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(cx, y - ry * 0.55);
  ctx.lineTo(x + w * 2, y);
  ctx.lineTo(x + w * 2, y + h * 0.55);
  ctx.lineTo(cx, y + h * 0.2);
  ctx.lineTo(x, y + h * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // teeth
  ctx.fillStyle = '#fbfcff';
  for (let i = 0; i < 6; i++) {
    const tx = x + w * 0.25 + i * w * 0.3;
    const top = y + h * 0.52 + (i % 2 === 0 ? 0 : ry * 0.12);
    ctx.beginPath();
    ctx.moveTo(tx, top);
    ctx.lineTo(tx + rx * 0.08, top + ry * 0.18);
    ctx.lineTo(tx + rx * 0.16, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// Clippy: a bent paperclip shape.
function drawClippyShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(4, rx * 0.13);
  ctx.strokeStyle = p.body;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.35, cy - ry * 1.05);
  ctx.lineTo(cx + rx * 0.35, cy - ry * 1.05);
  ctx.quadraticCurveTo(cx + rx * 0.95, cy - ry * 0.55, cx + rx * 0.95, cy);
  ctx.quadraticCurveTo(cx + rx * 0.95, cy + ry * 0.95, cx, cy + ry * 0.95);
  ctx.quadraticCurveTo(cx - rx * 0.95, cy + ry * 0.95, cx - rx * 0.95, cy);
  ctx.quadraticCurveTo(cx - rx * 0.95, cy - ry * 0.55, cx - rx * 0.35, cy - ry * 0.55);
  ctx.lineTo(cx + rx * 0.35, cy - ry * 0.55);
  ctx.quadraticCurveTo(cx + rx * 0.55, cy - ry * 0.45, cx + rx * 0.55, cy);
  ctx.quadraticCurveTo(cx + rx * 0.55, cy + ry * 0.55, cx, cy + ry * 0.55);
  ctx.quadraticCurveTo(cx - rx * 0.55, cy + ry * 0.55, cx - rx * 0.55, cy);
  ctx.quadraticCurveTo(cx - rx * 0.55, cy - ry * 0.45, cx - rx * 0.35, cy - ry * 0.55);
  ctx.stroke();
  // outline to keep it readable against any ground
  ctx.lineWidth = Math.max(2, rx * 0.055);
  ctx.strokeStyle = p.outline;
  ctx.stroke();
}

// Tree (plant archetype override): a woody trunk + a cloud-like canopy.
function drawTreeShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // trunk
  const trunkW = rx * 0.28;
  const trunkTop = cy + ry * 0.15;
  const trunkBot = cy + ry * 1.65;
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(cx - trunkW, trunkTop);
  ctx.lineTo(cx + trunkW, trunkTop);
  ctx.quadraticCurveTo(cx + trunkW * 1.3, (trunkTop + trunkBot) * 0.5, cx + trunkW * 0.9, trunkBot);
  ctx.lineTo(cx - trunkW * 0.9, trunkBot);
  ctx.quadraticCurveTo(cx - trunkW * 1.3, (trunkTop + trunkBot) * 0.5, cx - trunkW, trunkTop);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // canopy: a cluster of rounded lumps
  const grad = ctx.createLinearGradient(cx, cy - ry * 1.15, cx, cy + ry * 0.55);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  const lumps = [
    { x: 0, y: -0.75, r: 0.92 },
    { x: -0.72, y: -0.18, r: 0.68 },
    { x: 0.72, y: -0.18, r: 0.68 },
    { x: -0.42, y: 0.45, r: 0.58 },
    { x: 0.42, y: 0.45, r: 0.58 },
  ];
  ctx.beginPath();
  for (const l of lumps) {
    ctx.moveTo(cx + l.x * rx, cy + l.y * ry);
    ctx.arc(cx + l.x * rx, cy + l.y * ry, l.r * rx, 0, TAU);
  }
  ctx.fill();
  ctx.stroke();
}

// Robot (humanoid override): a boxy chassis with blocky head/torso/limbs.
function drawRobotShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // blocky torso
  const tx = cx;
  const ty = cy + ry * 1.15;
  const trx = rx * 0.82;
  const try_ = ry * 0.92;
  const tGrad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  tGrad.addColorStop(0, p.bodyHi);
  tGrad.addColorStop(0.5, p.body);
  tGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = tGrad;
  ctx.beginPath();
  ctx.roundRect(tx - trx, ty - try_, trx * 2, try_ * 2, rx * 0.08);
  ctx.fill();
  ctx.stroke();
  // chest panel
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.04);
  ctx.beginPath();
  ctx.roundRect(tx - trx * 0.55, ty - try_ * 0.35, trx * 1.1, try_ * 0.7, rx * 0.05);
  ctx.stroke();

  // blocky legs
  ctx.fillStyle = p.bodyLo;
  const legW = rx * 0.22;
  const legH = ry * 0.55;
  for (const dir of [-1, 1]) {
    const lx = tx + dir * trx * 0.5;
    ctx.beginPath();
    ctx.roundRect(lx - legW, ty + try_ * 0.55, legW * 2, legH * 2, rx * 0.06);
    ctx.fill();
    ctx.stroke();
  }

  // blocky arms with piston joints
  ctx.fillStyle = p.body;
  const armW = rx * 0.18;
  const armLen = ry * 0.65;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(tx + dir * trx * 0.95, ty - try_ * 0.15);
    ctx.rotate(dir * (0.25 + Math.sin(t / 500) * 0.08));
    ctx.beginPath();
    ctx.roundRect(-armW, 0, armW * 2, armLen * 2, rx * 0.05);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // boxy head (face reference)
  const hW = rx * 0.88;
  const hH = ry * 0.85;
  const hGrad = ctx.createLinearGradient(cx, cy - hH, cx, cy + hH);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.roundRect(cx - hW, cy - hH, hW * 2, hH * 2, rx * 0.1);
  ctx.fill();
  ctx.stroke();
}

// Potato (blob override): a lumpy, irregular oval.
function drawPotatoShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.55, cy - ry * 0.82);
  ctx.bezierCurveTo(cx + rx * 0.25, cy - ry * 1.12, cx + rx * 1.02, cy - ry * 0.42, cx + rx * 0.82, cy + ry * 0.35);
  ctx.bezierCurveTo(cx + rx * 0.62, cy + ry * 1.05, cx - rx * 0.45, cy + ry * 0.95, cx - rx * 0.88, cy + ry * 0.28);
  ctx.bezierCurveTo(cx - rx * 1.08, cy - ry * 0.22, cx - rx * 0.95, cy - ry * 0.55, cx - rx * 0.55, cy - ry * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // a few potato eyes/dimples
  ctx.fillStyle = p.bodyLo;
  for (const [dx, dy] of [[-0.35, -0.18], [0.42, 0.22], [-0.15, 0.45]]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * rx, cy + dy * ry, rx * 0.08, ry * 0.06, 0, 0, TAU);
    ctx.fill();
  }
}

// Jellyfish (aquatic override): a round bell with dangling tentacles.
function drawJellyfishShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // tentacles
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    const tx = cx + i * rx * 0.22;
    const wave = Math.sin(t / 280 + i * 0.9) * rx * 0.18;
    ctx.beginPath();
    ctx.moveTo(tx, cy + ry * 0.35);
    ctx.quadraticCurveTo(tx + wave, cy + ry * 1.05, tx + wave * 0.5, cy + ry * 1.65);
    ctx.stroke();
  }

  // bell
  const grad = ctx.createRadialGradient(cx - rx * 0.2, cy - ry * 0.35, rx * 0.1, cx, cy, rx);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy - ry * 0.05, rx * 0.92, Math.PI, 0);
  ctx.quadraticCurveTo(cx + rx * 0.55, cy + ry * 0.42, cx, cy + ry * 0.42);
  ctx.quadraticCurveTo(cx - rx * 0.55, cy + ry * 0.42, cx - rx * 0.92, cy - ry * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// --- M13b recognizability cues ------------------------------------------------
// The archetype rigs carry most of the roster, but a label-blind audit showed
// a handful of species whose name did not land at grid scale. Each function
// below adds THE distinguishing silhouette cue for that species while leaving
// the certified face/trait/palette layer untouched. Locked species keep their
// current archetype rig.

// Duck: avian body with a broad, prominent bill that reads from across the grid.
function drawDuckShape(ctx, p, cx, cy, rx, ry, t) {
  drawAvianBody(ctx, p, cx, cy, rx, ry, t);
  ctx.save();
  ctx.fillStyle = p.accent;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.08, cy + ry * 0.05, rx * 0.58, ry * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // bill seam
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.35, cy + ry * 0.05);
  ctx.lineTo(cx + rx * 0.45, cy + ry * 0.05);
  ctx.stroke();
  ctx.restore();
}

// Owl: a hunched, no-neck mass with a broad flat facial disc and ear tufts.
function drawOwlShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);

  // stocky oval body + head in one silhouette
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.16, rx * 1.06, ry * 0.94, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // flat facial disc framing the eyes and beak
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.02, rx * 0.74, ry * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // ear tufts
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * rx * 0.42, cy - ry * 0.58);
    ctx.lineTo(cx + dir * rx * 0.74, cy - ry * 1.18);
    ctx.lineTo(cx + dir * rx * 0.16, cy - ry * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // folded wing stubs on the sides
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + dir * rx * 0.92, cy + ry * 0.12);
    ctx.rotate(dir * 0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.32, ry * 0.48, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Parrot: big hooked beak, upright body, folded wing, tail fan, feet on a branch.
function drawParrotShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);

  // perch branch at the bottom so it reads bird, not leaf
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(3, rx * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.95, cy + ry * 0.98);
  ctx.lineTo(cx + rx * 0.65, cy + ry * 1.02);
  ctx.stroke();

  // tail fan behind the body
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.22, cy + ry * 0.35);
  ctx.quadraticCurveTo(cx - rx * 1.0, cy + ry * 0.85, cx - rx * 0.78, cy + ry * 1.25);
  ctx.quadraticCurveTo(cx - rx * 0.42, cy + ry * 0.95, cx - rx * 0.05, cy + ry * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // upright body
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.08, cy + ry * 0.38, rx * 0.58, ry * 0.72, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // large folded wing on the side
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.12, cy + ry * 0.02);
  ctx.quadraticCurveTo(cx + rx * 0.95, cy - ry * 0.18, cx + rx * 0.85, cy + ry * 0.78);
  ctx.quadraticCurveTo(cx + rx * 0.45, cy + ry * 0.68, cx + rx * 0.12, cy + ry * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // wing bars — the parrot cue
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  for (const yy of [cy + ry * 0.22, cy + ry * 0.42, cy + ry * 0.62]) {
    ctx.beginPath();
    ctx.moveTo(cx + rx * 0.35, yy);
    ctx.quadraticCurveTo(cx + rx * 0.68, yy - ry * 0.04, cx + rx * 0.82, yy + ry * 0.06);
    ctx.stroke();
  }

  // feet gripping the branch
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.lineCap = 'round';
  for (const fx of [cx - rx * 0.08, cx + rx * 0.22]) {
    ctx.beginPath();
    ctx.moveTo(fx, cy + ry * 0.82);
    ctx.lineTo(fx - rx * 0.06, cy + ry * 1.0);
    ctx.moveTo(fx, cy + ry * 0.82);
    ctx.lineTo(fx + rx * 0.08, cy + ry * 1.0);
    ctx.stroke();
  }

  // head at the certified face centre
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.12, cy - ry * 0.12, rx * 0.42, ry * 0.38, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // small crest
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.12, cy - ry * 0.46);
  ctx.quadraticCurveTo(cx + rx * 0.28, cy - ry * 0.78, cx + rx * 0.42, cy - ry * 0.5);
  ctx.quadraticCurveTo(cx + rx * 0.28, cy - ry * 0.42, cx + rx * 0.12, cy - ry * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // hooked beak at mid-face, pointing down (no shared bar across the eyes)
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.38, cy - ry * 0.22);
  ctx.quadraticCurveTo(cx + rx * 0.82, cy - ry * 0.02, cx + rx * 0.58, cy + ry * 0.32);
  ctx.quadraticCurveTo(cx + rx * 0.35, cy + ry * 0.12, cx + rx * 0.38, cy - ry * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // lower mandible line
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.42, cy + ry * 0.02);
  ctx.quadraticCurveTo(cx + rx * 0.55, cy + ry * 0.16, cx + rx * 0.32, cy + ry * 0.12);
  ctx.stroke();
}

// Rooster: red comb + wattle, chest-out strut, arcing tail feathers.
function drawRoosterShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);

  // puffed upright body
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(
    cx + rx * 1.12, cy - ry * 0.82,
    cx + rx * 1.02, cy + ry * 0.58,
    cx + rx * 0.48, cy + ry * 1.12,
  );
  ctx.quadraticCurveTo(cx, cy + ry * 1.38, cx - rx * 0.48, cy + ry * 1.12);
  ctx.bezierCurveTo(
    cx - rx * 0.98, cy + ry * 0.48,
    cx - rx * 1.02, cy - ry * 0.52,
    cx, cy - ry,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // arcing tail fan behind
  ctx.fillStyle = p.bodyLo;
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.translate(cx - rx * (0.52 + Math.abs(i) * 0.08), cy - ry * (0.15 - i * 0.12));
    ctx.rotate(-0.55 + i * 0.22);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.22, ry * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // comb on top (red in colour, silhouette-ink in silhouette mode)
  const red = p.silhouette ? p.body : hsl(0, 82, 52);
  ctx.fillStyle = red;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * rx * 0.18, cy - ry * 0.82, rx * 0.12, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // wattle under the beak
  ctx.fillStyle = red;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.46, rx * 0.11, ry * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // wing stubs
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + dir * rx * 0.78, cy + ry * 0.15);
    ctx.rotate(dir * 0.42);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.58, ry * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Phoenix: rising posture with sweeping flame wings and a flame tail.
// Kept clearly avian so it never reads as Claude.
function drawPhoenixShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);

  // compact rounded body
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.12, rx * 0.62, ry * 0.66, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // sweeping flame wings
  const flicker = Math.sin(t / 220) * 0.06;
  ctx.fillStyle = p.accent;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx, cy - ry * 0.05);
    ctx.rotate(dir * (0.95 + flicker));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(rx * 0.85, -ry * 1.15, rx * 0.35, -ry * 0.55);
    ctx.quadraticCurveTo(rx * 0.55, -ry * 0.12, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // long flame tail
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(cx, cy + ry * 0.55);
  ctx.quadraticCurveTo(cx - rx * 0.42, cy + ry * 1.4, cx, cy + ry * 1.75);
  ctx.quadraticCurveTo(cx + rx * 0.42, cy + ry * 1.4, cx, cy + ry * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // crest tuft on the head
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry * 0.55);
  ctx.quadraticCurveTo(cx - rx * 0.35, cy - ry * 1.05, cx, cy - ry * 0.88);
  ctx.quadraticCurveTo(cx + rx * 0.35, cy - ry * 1.05, cx, cy - ry * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Taco: a folded hard-shell with the filling visibly spilling from the open top.
function drawTacoShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  // folded tortilla
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.85, cy - ry * 0.35);
  ctx.quadraticCurveTo(cx - rx * 0.55, cy - ry * 1.05, cx, cy - ry * 0.75);
  ctx.quadraticCurveTo(cx + rx * 0.55, cy - ry * 1.05, cx + rx * 0.85, cy - ry * 0.35);
  ctx.quadraticCurveTo(cx + rx * 0.55, cy + ry * 0.85, cx, cy + ry * 0.95);
  ctx.quadraticCurveTo(cx - rx * 0.55, cy + ry * 0.85, cx - rx * 0.85, cy - ry * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // jagged filling edge along the open top
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.7, cy - ry * 0.55);
  for (let i = 0; i <= 8; i++) {
    const tt = i / 8;
    const sx = (cx - rx * 0.7) + tt * rx * 1.4;
    const sy = cy - ry * 0.55 + (i % 2 === 0 ? ry * 0.18 : 0);
    ctx.lineTo(sx, sy);
  }
  ctx.lineTo(cx + rx * 0.7, cy - ry * 0.25);
  for (let i = 8; i >= 0; i--) {
    const tt = i / 8;
    const sx = (cx - rx * 0.7) + tt * rx * 1.4;
    const sy = cy - ry * 0.25 + (i % 2 === 0 ? ry * 0.18 : 0);
    ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Bac Man: the wedge mouth IS the identity — a missing slice, not a plain orb.
function drawBacManShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const r = Math.max(rx, ry) * 0.98;
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  const mouth = 0.45;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, mouth, TAU - mouth);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Illuminati: a pyramid around the central eye, not a bare cyclops orb.
function drawIlluminatiShape(ctx, p, cx, cy, rx, ry) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry * 1.15);
  ctx.lineTo(cx + rx * 1.05, cy + ry * 0.75);
  ctx.lineTo(cx - rx * 1.05, cy + ry * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // capstone
  ctx.fillStyle = p.bodyHi;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry * 1.15);
  ctx.lineTo(cx + rx * 0.35, cy - ry * 0.25);
  ctx.lineTo(cx - rx * 0.35, cy - ry * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Crab: a rounded shell with two oversized pincers and splayed legs.
function drawCrabShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.9, ry * 0.82, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // six splayed legs
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const baseAng = dir === -1 ? Math.PI : 0;
      const ang = baseAng + dir * (0.35 + i * 0.28);
      const sx = cx + dir * rx * 0.7;
      const sy = cy + (i - 1) * ry * 0.22;
      const ex = sx + Math.cos(ang) * rx * 0.7;
      const ey = sy + Math.sin(ang) * ry * 0.55;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + dir * rx * 0.2, sy + ry * 0.25, ex, ey);
      ctx.stroke();
    }
  }
  // two big claws in front
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + dir * rx * 0.55, cy - ry * 0.15);
    ctx.rotate(dir * 0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.35, ry * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // pincer fingers
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = Math.max(2.5, rx * 0.05);
    ctx.beginPath();
    ctx.moveTo(rx * 0.25, -ry * 0.1);
    ctx.quadraticCurveTo(rx * 0.55, -ry * 0.35, rx * 0.45, ry * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx * 0.25, ry * 0.1);
    ctx.quadraticCurveTo(rx * 0.55, ry * 0.35, rx * 0.45, -ry * 0.05);
    ctx.stroke();
    ctx.restore();
  }
}

// Gorby: the forehead mark and red shoes make the name land.
function drawGorbyShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawBlobBody(ctx, p, cx, cy, rx, ry, t, rng, species);
  const shoe = '#e02020';
  ctx.fillStyle = shoe;
  ctx.strokeStyle = '#901010';
  ctx.lineWidth = Math.max(1.5, rx * 0.035);
  // forehead mark
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.25, rx * 0.12, ry * 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // red shoes
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.45, cy + ry * 0.92, rx * 0.22, ry * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Comrade: ushanka + chest star give the silhouette its cue.
function drawComradeShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawHumanoidBody(ctx, p, cx, cy, rx, ry, t);
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  // ushanka
  ctx.fillStyle = p.bodyLo;
  const hatY = cy - ry * 0.78;
  ctx.beginPath();
  ctx.ellipse(cx, hatY, rx * 0.95, ry * 0.32, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.75, hatY + ry * 0.25, rx * 0.22, ry * 0.32, dir * 0.2, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // star emblem on chest
  ctx.fillStyle = p.accent;
  star(ctx, cx, cy + ry * 0.95, rx * 0.18);
  ctx.stroke();
}

// Yog-Sothoth: a clustered gate of overlapping orbs, not a generic dotted blob.
function drawYogSothothShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.strokeStyle = p.outline;
  const orbs = [
    { x: 0, y: -0.55, r: 0.42 },
    { x: -0.55, y: -0.1, r: 0.32 },
    { x: 0.55, y: -0.1, r: 0.32 },
    { x: 0, y: 0.35, r: 0.48 },
    { x: -0.4, y: 0.55, r: 0.28 },
    { x: 0.4, y: 0.55, r: 0.28 },
    { x: 0, y: 0, r: 0.55 },
  ];
  for (const o of orbs) {
    const grad = ctx.createRadialGradient(
      cx + o.x * rx - o.r * rx * 0.25,
      cy + o.y * ry - o.r * ry * 0.25,
      0,
      cx + o.x * rx,
      cy + o.y * ry,
      o.r * rx,
    );
    grad.addColorStop(0, p.bodyHi);
    grad.addColorStop(0.6, p.body);
    grad.addColorStop(1, p.bodyLo);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx + o.x * rx, cy + o.y * ry, o.r * rx, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Joe Camel: strong hump, longer neck, tiny rounded ears, droopy split lip.
function drawJoeCamelShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);

  // MASCOT PIVOT: the creature IS the big camel face. The long droopy muzzle
  // is the body mass; tiny feet and hands attach to it. No hump, no neck.
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  // top of the wide camel head dome
  ctx.moveTo(cx - rx * 0.25, cy - ry * 0.62);
  ctx.bezierCurveTo(
    cx - rx * 0.82, cy - ry * 0.58,
    cx - rx * 0.92, cy + ry * 0.02,
    cx - rx * 0.56, cy + ry * 0.32,
  );
  // left side of the droopy muzzle
  ctx.bezierCurveTo(
    cx - rx * 0.42, cy + ry * 0.74,
    cx - rx * 0.22, cy + ry * 1.05,
    cx, cy + ry * 1.05,
  );
  // bottom of the muzzle
  ctx.bezierCurveTo(
    cx + rx * 0.22, cy + ry * 1.05,
    cx + rx * 0.42, cy + ry * 0.74,
    cx + rx * 0.56, cy + ry * 0.32,
  );
  // right side back up to the head dome
  ctx.bezierCurveTo(
    cx + rx * 0.92, cy + ry * 0.02,
    cx + rx * 0.82, cy - ry * 0.58,
    cx + rx * 0.25, cy - ry * 0.62,
  );
  ctx.closePath();
  ctx.clip();
  ctx.fill();
  ctx.stroke();

  // lighter upper-lip/muzzle highlight so the face has volume
  ctx.fillStyle = p.bodyHi;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.22, rx * 0.46, ry * 0.44, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // tiny camel ears at the top of the dome
  ctx.fillStyle = p.body;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.52, cy - ry * 0.55, rx * 0.1, ry * 0.14, dir * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // nostrils on the muzzle
  ctx.fillStyle = p.outline;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.18, cy + ry * 0.36, rx * 0.06, ry * 0.04, 0, 0, TAU);
    ctx.fill();
  }

  // little hands gripping the sides of the muzzle
  ctx.fillStyle = p.bodyHi;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.76, cy + ry * 0.18, rx * 0.13, ry * 0.09, dir * 0.25, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // little feet at the bottom of the muzzle
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.26, cy + ry * 1.12, rx * 0.14, ry * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Joe Camel face accessory: dark sunglasses over the eyes. Drawn after the
// shared face layer so the lenses sit in front.
function drawJoeCamelSunglasses(ctx, p, cx, cy, rx, ry, t, rng, species) {
  ctx.save();
  ctx.lineWidth = Math.max(2, rx * 0.04);
  ctx.strokeStyle = p.outline;
  ctx.fillStyle = p.outline;

  const lensY = cy - ry * 0.08;
  const lensW = rx * 0.48;
  const lensH = ry * 0.34;
  const corner = ry * 0.12;

  // left lens
  ctx.beginPath();
  ctx.roundRect(cx - rx * 0.62, lensY - lensH * 0.5, lensW, lensH, corner);
  ctx.fill();
  ctx.stroke();
  // right lens
  ctx.beginPath();
  ctx.roundRect(cx + rx * 0.14, lensY - lensH * 0.5, lensW, lensH, corner);
  ctx.fill();
  ctx.stroke();

  // bridge + arms
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.14, lensY);
  ctx.lineTo(cx + rx * 0.14, lensY);
  ctx.moveTo(cx - rx * 0.88, lensY);
  ctx.lineTo(cx - rx * 0.62, lensY);
  ctx.moveTo(cx + rx * 0.62, lensY);
  ctx.lineTo(cx + rx * 0.88, lensY);
  ctx.stroke();

  // tiny lens shine
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.5, lensY - ry * 0.06, rx * 0.08, ry * 0.04, -0.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.26, lensY - ry * 0.06, rx * 0.08, ry * 0.04, -0.3, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// Doobie: a serrated leaf silhouette on a stem — the TUI intent is unmistakable.
function drawDoobieShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  // stem
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.roundRect(cx - rx * 0.1, cy + ry * 0.35, rx * 0.2, ry * 1.1, rx * 0.05);
  ctx.fill();
  ctx.stroke();
  // seven-finger leaf
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry * 0.4);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  const leaflets = [
    { x: 0, y: -0.9, r: 0.45 },
    { x: -0.5, y: -0.6, r: 0.32 },
    { x: 0.5, y: -0.6, r: 0.32 },
    { x: -0.75, y: -0.1, r: 0.28 },
    { x: 0.75, y: -0.1, r: 0.28 },
    { x: -0.55, y: 0.35, r: 0.22 },
    { x: 0.55, y: 0.35, r: 0.22 },
  ];
  ctx.beginPath();
  for (const l of leaflets) {
    ctx.ellipse(cx + l.x * rx, cy + l.y * ry, l.r * rx, l.r * ry * 1.45, 0, 0, TAU);
  }
  ctx.fill();
  ctx.stroke();
}

// Zorak: mantis — triangular head, raptorial forearms, angular profile.
function drawZorakShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry * 1.2, cx, cy + ry * 0.6);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  // long thorax
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.15, rx * 0.45, ry * 0.95, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // triangular head
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry * 1.15);
  ctx.lineTo(cx + rx * 0.5, cy - ry * 0.55);
  ctx.lineTo(cx - rx * 0.5, cy - ry * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // abdomen
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.55, rx * 0.55, ry * 0.6, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // raptorial forearms
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2.5, rx * 0.05);
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * rx * 0.35, cy - ry * 0.25);
    ctx.quadraticCurveTo(cx + dir * rx * 0.95, cy + ry * 0.05, cx + dir * rx * 0.6, cy + ry * 0.55);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const tx = cx + dir * rx * (0.55 + i * 0.08);
      const ty = cy + ry * (0.0 + i * 0.15);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + dir * rx * 0.18, ty - ry * 0.12);
      ctx.stroke();
    }
  }
  // antennae
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = Math.max(2, rx * 0.04);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * rx * 0.2, cy - ry * 0.55);
    ctx.quadraticCurveTo(cx + dir * rx * 0.55, cy - ry * 1.45, cx + dir * rx * 0.35, cy - ry * 1.6);
    ctx.stroke();
  }
}

// Dolphin: strengthen the rostrum and dorsal fin so it cannot read as a land-blob.
function drawDolphinShape(ctx, p, cx, cy, rx, ry, t) {
  drawAquaticBody(ctx, p, cx, cy, rx, ry, t);
  // pronounced beak
  ctx.fillStyle = p.bodyLo;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.78, cy + ry * 0.05, rx * 0.38, ry * 0.14, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // tall dorsal fin
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.05, cy - ry * 0.55);
  ctx.quadraticCurveTo(cx + rx * 0.25, cy - ry * 1.25, cx + rx * 0.65, cy - ry * 0.6);
  ctx.quadraticCurveTo(cx + rx * 0.35, cy - ry * 0.45, cx + rx * 0.05, cy - ry * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// --- M13c operator recognizability callouts ----------------------------------
// The operator audited the M12 stage-center grid and named species that did
// not read label-blind. Each function below adds the single cue (colour,
// silhouette, or proportion) that makes the name land, while leaving the
// certified trait/palette/face layer untouched. Locked species are not here.

// Cow: holstein white with black patches; broad flat muzzle; small horn nubs.
function drawCowShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // torso
  const tx = cx;
  const ty = cy + ry * 0.95;
  const trx = rx * 1.18;
  const try_ = ry * 0.72;
  const grad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // holstein patches
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = p.outline;
  const patches = [
    { x: -0.35, y: -0.12, rx: 0.28, ry: 0.22 },
    { x: 0.42, y: 0.18, rx: 0.34, ry: 0.26 },
    { x: -0.1, y: 0.45, rx: 0.18, ry: 0.14 },
  ];
  for (const patch of patches) {
    ctx.beginPath();
    ctx.ellipse(tx + patch.x * trx, ty + patch.y * try_, patch.rx * trx, patch.ry * try_, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // four stubby legs
  ctx.fillStyle = p.bodyLo;
  const legW = rx * 0.18;
  const legH = ry * 0.46;
  const legY = ty + try_ * 0.82;
  for (const dir of [-1, 1]) {
    const frontX = cx + dir * rx * 0.42;
    const backX = cx + dir * rx * 0.92;
    for (const lx of [frontX, backX]) {
      ctx.beginPath();
      ctx.ellipse(lx, legY, legW, legH, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // thin tail
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.06);
  ctx.lineCap = 'round';
  const tailSway = Math.sin(t / 500) * rx * 0.1;
  ctx.beginPath();
  ctx.moveTo(cx - trx * 0.9, ty);
  ctx.quadraticCurveTo(cx - trx * 1.35, ty - ry * 0.25 + tailSway, cx - trx * 1.2, ty + ry * 0.35 + tailSway);
  ctx.stroke();

  // broad, flat head
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.08, ry * 0.82, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // small horn nubs
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.48, cy - ry * 0.62, rx * 0.1, ry * 0.12, dir * 0.15, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Frog: squat blob with dorsal eye domes, wide flat mouth, crouched leg bumps.
function drawFrogShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);

  // low, wide body so the certified eyes land on the dorsal surface
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.42, rx * 0.98, ry * 0.65, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // crouched leg bumps on the sides
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 1.02, cy + ry * 0.55, rx * 0.32, ry * 0.38, dir * 0.2, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // dorsal eye ridges/domes
  ctx.fillStyle = p.bodyHi;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dir * rx * 0.32, cy + ry * 0.05, rx * 0.22, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // wide flat mouth
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.42, cy + ry * 0.62);
  ctx.quadraticCurveTo(cx, cy + ry * 0.68, cx + rx * 0.42, cy + ry * 0.62);
  ctx.stroke();
}

// Bat: membrane wings with finger spokes, big ears, dark palette, fangs via trait.
function drawBatShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // membrane wings first (behind body)
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + dir * rx * 0.15, cy + ry * 0.05);
    ctx.rotate(dir * 0.22);
    // wing outline
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(dir * rx * 0.85, -ry * 0.55, dir * rx * 1.15, ry * 0.55);
    ctx.quadraticCurveTo(dir * rx * 0.55, ry * 0.75, 0, ry * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // finger spokes
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = Math.max(1.5, rx * 0.03);
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        dir * rx * (0.3 + i * 0.22),
        -ry * 0.15 + i * ry * 0.08,
        dir * rx * (0.65 + i * 0.16),
        ry * (0.15 + i * 0.12),
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // furry body
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.12, rx * 0.5, ry * 0.52, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // solid triangular ears attached directly to the head sides (broad, no stalk)
  ctx.fillStyle = p.body;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * rx * 0.22, cy - ry * 0.05);
    ctx.lineTo(cx + dir * rx * 0.68, cy - ry * 0.52);
    ctx.lineTo(cx + dir * rx * 0.48, cy + ry * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // inner ear
    ctx.fillStyle = p.bodyHi;
    ctx.beginPath();
    ctx.moveTo(cx + dir * rx * 0.30, cy - ry * 0.02);
    ctx.lineTo(cx + dir * rx * 0.62, cy - ry * 0.40);
    ctx.lineTo(cx + dir * rx * 0.45, cy + ry * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.body;
  }
}

// Coopa: koopa-adjacent turtle — domed shell with rim, beaked face, stubby legs.
// Palette stays natural greens/browns; no Nintendo trade-dress colours.
function drawCoopaShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // domed shell behind the head
  const shellGrad = ctx.createLinearGradient(cx, cy - ry * 0.4, cx, cy + ry * 1.2);
  shellGrad.addColorStop(0, p.bodyHi);
  shellGrad.addColorStop(0.5, p.body);
  shellGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = shellGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.55, rx * 1.25, ry * 0.92, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // visible rim around the shell
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.55, rx * 1.18, ry * 0.85, 0, 0, TAU);
  ctx.stroke();

  // shell scute seams
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(1.5, rx * 0.03);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * rx * 0.65, cy + ry * 0.08);
    ctx.quadraticCurveTo(cx + i * rx * 0.55, cy + ry * 0.55, cx + i * rx * 0.65, cy + ry * 1.02);
    ctx.stroke();
  }

  // stubby legs
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    for (const front of [true, false]) {
      const x = cx + dir * rx * (front ? 0.55 : 0.98);
      const y = cy + ry * 1.08;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.18, ry * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // turtle head (beak supplied by certified face trait)
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.75, ry * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

// Panda: white body, black limbs/ears/eye patches.
function drawPandaShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // white torso
  const tx = cx;
  const ty = cy + ry * 0.95;
  const trx = rx * 1.12;
  const try_ = ry * 0.7;
  const grad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // black limbs
  ctx.fillStyle = p.outline;
  const legW = rx * 0.2;
  const legH = ry * 0.5;
  const legY = ty + try_ * 0.82;
  for (const dir of [-1, 1]) {
    const frontX = cx + dir * rx * 0.42;
    const backX = cx + dir * rx * 0.88;
    for (const lx of [frontX, backX]) {
      ctx.beginPath();
      ctx.ellipse(lx, legY, legW, legH, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // black ears
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dir * rx * 0.55, cy - ry * 0.72, rx * 0.22, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // white head
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // black eye patches
  ctx.fillStyle = p.outline;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.3, cy - ry * 0.08, rx * 0.22, ry * 0.18, dir * 0.15, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Raccoon: grey body, black bandit mask, ringed tail.
function drawRaccoonShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // grey torso
  const tx = cx;
  const ty = cy + ry * 0.95;
  const trx = rx * 1.08;
  const try_ = ry * 0.68;
  const grad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // legs
  ctx.fillStyle = p.bodyLo;
  const legW = rx * 0.18;
  const legH = ry * 0.46;
  const legY = ty + try_ * 0.82;
  for (const dir of [-1, 1]) {
    const frontX = cx + dir * rx * 0.42;
    const backX = cx + dir * rx * 0.88;
    for (const lx of [frontX, backX]) {
      ctx.beginPath();
      ctx.ellipse(lx, legY, legW, legH, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ringed tail behind
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.055);
  ctx.lineCap = 'round';
  const tailSway = Math.sin(t / 500) * rx * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - trx * 0.9, ty);
  ctx.quadraticCurveTo(cx - trx * 1.45, ty + ry * 0.05 + tailSway, cx - trx * 1.35, ty + ry * 0.65 + tailSway);
  ctx.stroke();
  // tail rings
  ctx.lineWidth = Math.max(2.5, rx * 0.05);
  for (let i = 0; i < 4; i++) {
    const yy = ty + (i - 1.5) * ry * 0.18 + tailSway * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - trx * 1.25, yy);
    ctx.quadraticCurveTo(cx - trx * 1.35, yy + ry * 0.04, cx - trx * 1.15, yy);
    ctx.stroke();
  }

  // grey head
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.95, ry * 0.88, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // black bandit mask
  ctx.fillStyle = p.outline;
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.05, rx * 0.6, ry * 0.26, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // rounded ears
  ctx.fillStyle = p.outline;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dir * rx * 0.6, cy - ry * 0.68, rx * 0.18, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Dragon: horns + protruding snout + small wings + arrow-tip tail.
function drawDragonShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // body
  const tx = cx + rx * 0.1;
  const ty = cy + ry * 0.95;
  const trx = rx * 1.22;
  const try_ = ry * 0.72;
  const grad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // small wings
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + dir * rx * 0.5, cy + ry * 0.05);
    ctx.rotate(dir * 0.38);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(dir * rx * 0.55, -ry * 0.82, dir * rx * 0.95, -ry * 0.12);
    ctx.quadraticCurveTo(dir * rx * 0.45, ry * 0.08, 0, ry * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // wing bone
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = Math.max(1.5, rx * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(dir * rx * 0.45, -ry * 0.52, dir * rx * 0.78, -ry * 0.08);
    ctx.stroke();
    ctx.restore();
  }

  // legs
  ctx.fillStyle = p.bodyLo;
  const legW = rx * 0.18;
  const legH = ry * 0.46;
  const legY = ty + try_ * 0.82;
  for (const dir of [-1, 1]) {
    const frontX = cx + dir * rx * 0.5;
    const backX = cx + dir * rx * 1.0;
    for (const lx of [frontX, backX]) {
      ctx.beginPath();
      ctx.ellipse(lx, legY, legW, legH, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // arrow-tip tail
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.07);
  ctx.lineCap = 'round';
  const tailSway = Math.sin(t / 500) * rx * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - trx * 0.95, ty);
  ctx.quadraticCurveTo(cx - trx * 1.5, ty + ry * 0.15 + tailSway, cx - trx * 1.35, ty + ry * 0.65 + tailSway);
  ctx.stroke();
  ctx.fillStyle = p.bodyLo;
  ctx.beginPath();
  ctx.moveTo(cx - trx * 1.35, ty + ry * 0.45 + tailSway);
  ctx.lineTo(cx - trx * 1.65, ty + ry * 0.78 + tailSway);
  ctx.lineTo(cx - trx * 1.15, ty + ry * 0.88 + tailSway);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // head
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.9, ry * 0.86, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // protruding dragon snout anchored at mouth level, not across the eyes
  ctx.fillStyle = p.bodyHi;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.18, cy + ry * 0.12);
  ctx.lineTo(cx + rx * 0.95, cy + ry * 0.18);
  ctx.quadraticCurveTo(cx + rx * 1.05, cy + ry * 0.42, cx + rx * 0.92, cy + ry * 0.55);
  ctx.lineTo(cx + rx * 0.12, cy + ry * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // nostril line
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(1.5, rx * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.78, cy + ry * 0.28);
  ctx.lineTo(cx + rx * 0.78, cy + ry * 0.42);
  ctx.stroke();

  // fangs anchored at the snout base (trait face is now 'none' so the generic
  // fangs bar cannot sit at the wrong height)
  ctx.fillStyle = '#fbfcff';
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(1.5, rx * 0.03);
  for (const fx of [cx + rx * 0.22, cx + rx * 0.32]) {
    ctx.beginPath();
    ctx.moveTo(fx - rx * 0.03, cy + ry * 0.18);
    ctx.lineTo(fx + rx * 0.03, cy + ry * 0.18);
    ctx.lineTo(fx, cy + ry * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // horns come from the certified ears='horns' trait layer
}

// Octopus: solid rounded mantle with eyes on the mantle and fewer, thicker arms.
function drawOctopusShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // four thick, tapering arms (no bulb tips) splayed below the mantle
  const arms = [
    { x: -0.55, w: 0.28, len: 1.05, curve: -0.35 },
    { x: -0.18, w: 0.24, len: 1.18, curve: 0.0 },
    { x: 0.18, w: 0.24, len: 1.18, curve: 0.0 },
    { x: 0.55, w: 0.28, len: 1.05, curve: 0.35 },
  ];
  ctx.fillStyle = p.bodyLo;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i];
    const ax = cx + a.x * rx;
    const wave = Math.sin(t / 340 + i * 1.3) * rx * 0.16;
    const baseY = cy + ry * 0.32;
    const tipX = ax + a.curve * rx + wave;
    const tipY = baseY + a.len * ry;
    const baseW = a.w * rx;
    const tipW = rx * 0.06;
    ctx.beginPath();
    ctx.moveTo(ax - baseW, baseY);
    ctx.quadraticCurveTo(ax - baseW * 0.5 + wave * 0.3, (baseY + tipY) * 0.5, tipX - tipW, tipY);
    ctx.lineTo(tipX + tipW, tipY);
    ctx.quadraticCurveTo(ax + baseW * 0.5 + wave * 0.3, (baseY + tipY) * 0.5, ax + baseW, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // solid rounded mantle
  const grad = ctx.createRadialGradient(cx - rx * 0.15, cy - ry * 0.25, rx * 0.1, cx, cy, rx * 0.78);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy - ry * 0.05, rx * 0.78, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // eyes on the mantle (large, forward-facing)
  ctx.fillStyle = p.eyeWhite;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.28, cy - ry * 0.05, rx * 0.16, ry * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = p.eyeDark;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dir * rx * 0.28, cy - ry * 0.02, rx * 0.08, 0, TAU);
    ctx.fill();
  }
}

// --- weak-cue sharpening ------------------------------------------------------

// Chonk: visibly wider and rounder than a normal cat.
function drawChonkShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.55, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.34, ry * 1.08, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // belly patch
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.34, ry * 1.08, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.38, rx * 0.74, ry * 0.52, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // stubby paws
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.88, cy + ry * 0.85, rx * 0.22, ry * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Tardigrade: segmented body texture + eight stubby legs.
function drawTardigradeShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry * 0.7, cx, cy + ry * 0.7);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.82, ry * 0.72, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // segmentation rings
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.04);
  for (let i = -2; i <= 2; i++) {
    const yy = cy + i * ry * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.7, yy);
    ctx.quadraticCurveTo(cx, yy + ry * 0.05, cx + rx * 0.7, yy);
    ctx.stroke();
  }
  // eight stubby legs
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const yy = cy - ry * 0.35 + i * ry * 0.22;
      const sx = cx + dir * rx * 0.65;
      const ex = cx + dir * rx * (1.05 + (i % 2) * 0.12);
      ctx.beginPath();
      ctx.moveTo(sx, yy);
      ctx.quadraticCurveTo(cx + dir * rx * 0.85, yy + ry * 0.15, ex, yy + ry * 0.05);
      ctx.stroke();
    }
  }
}

// Rat: small rounded ears, long pointy snout, whiskers, thin tail.
function drawRatShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;

  // torso
  const tx = cx;
  const ty = cy + ry * 0.95;
  const trx = rx * 1.05;
  const try_ = ry * 0.68;
  const grad = ctx.createLinearGradient(tx, ty - try_, tx, ty + try_);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.beginPath();
  ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  // head
  const hGrad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  hGrad.addColorStop(0, p.bodyHi);
  hGrad.addColorStop(0.55, p.body);
  hGrad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.88, ry * 0.82, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // small rounded ears sitting on the sides of the head
  ctx.fillStyle = p.body;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dir * rx * 0.52, cy - ry * 0.62, rx * 0.18, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.cheek;
    ctx.beginPath();
    ctx.arc(cx + dir * rx * 0.52, cy - ry * 0.62, rx * 0.09, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.body;
  }

  // long pointy snout
  ctx.fillStyle = p.bodyHi;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.42, cy + ry * 0.12, rx * 0.48, ry * 0.2, -0.08, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // nose tip
  ctx.fillStyle = p.outline;
  ctx.beginPath();
  ctx.arc(cx + rx * 0.85, cy + ry * 0.08, rx * 0.06, 0, TAU);
  ctx.fill();

  // whiskers
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(1, rx * 0.025);
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + rx * 0.55, cy + ry * 0.05 + (i - 1) * ry * 0.06);
      ctx.lineTo(cx + dir * rx * 1.05, cy + ry * 0.05 + (i - 1) * ry * 0.12 + Math.sin(t / 200 + i) * rx * 0.02);
      ctx.stroke();
    }
  }

  // thin tail
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.035);
  ctx.lineCap = 'round';
  const sway = Math.sin(t / 220) * rx * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx - trx * 0.9, ty);
  ctx.quadraticCurveTo(cx - trx * 1.55, ty + ry * 0.55 + sway, cx - trx * 1.35, ty + ry * 1.05 + sway);
  ctx.stroke();
}

// Imp: small horns (trait layer) plus a pointed tail.
function drawImpShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawHumanoidBody(ctx, p, cx, cy, rx, ry, t);
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2.5, rx * 0.05);
  ctx.lineCap = 'round';
  const sway = Math.sin(t / 250) * rx * 0.1;
  ctx.beginPath();
  ctx.moveTo(cx, cy + ry * 1.95);
  ctx.quadraticCurveTo(cx + rx * 0.45 + sway, cy + ry * 2.35, cx + rx * 0.25 + sway, cy + ry * 2.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.25 + sway, cy + ry * 2.75);
  ctx.lineTo(cx + rx * 0.1 + sway, cy + ry * 2.55);
  ctx.stroke();
}

// Goblin: big club in hand — different from the horned/tailed demon family.
function drawGoblinShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawHumanoidBody(ctx, p, cx, cy, rx, ry, t);
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(3, rx * 0.07);
  ctx.lineCap = 'round';
  // club handle
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.95, cy + ry * 0.65);
  ctx.lineTo(cx + rx * 1.25, cy + ry * 1.45);
  ctx.stroke();
  // club head
  ctx.fillStyle = p.bodyLo;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.beginPath();
  ctx.ellipse(cx + rx * 1.25, cy + ry * 1.55, rx * 0.18, ry * 0.14, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

// Kobold: tail plus a small spear — different build from Imp/Goblin.
function drawKoboldShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawHumanoidBody(ctx, p, cx, cy, rx, ry, t);
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2.5, rx * 0.05);
  ctx.lineCap = 'round';
  const sway = Math.sin(t / 260) * rx * 0.1;
  ctx.beginPath();
  ctx.moveTo(cx, cy + ry * 1.95);
  ctx.quadraticCurveTo(cx + rx * 0.5 + sway, cy + ry * 2.4, cx + rx * 0.35 + sway, cy + ry * 2.8);
  ctx.stroke();
  // spear
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = Math.max(2, rx * 0.04);
  ctx.beginPath();
  ctx.moveTo(cx + rx * 1.0, cy + ry * 1.7);
  ctx.lineTo(cx + rx * 1.55, cy - ry * 0.55);
  ctx.stroke();
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.moveTo(cx + rx * 1.55, cy - ry * 0.75);
  ctx.lineTo(cx + rx * 1.7, cy - ry * 0.45);
  ctx.lineTo(cx + rx * 1.4, cy - ry * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(1.5, rx * 0.035);
  ctx.stroke();
}

// Cane Toad: squat, warty texture so it no longer reads as Frog.
function drawCaneToadShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawBlobBody(ctx, p, cx, cy, rx, ry, t, rng, species);
  ctx.fillStyle = p.bodyLo;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(1, rx * 0.03);
  const warts = [
    [-0.4, -0.25], [0.35, -0.1], [-0.2, 0.25], [0.45, 0.35], [0, 0.45],
  ];
  for (const [dx, dy] of warts) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * rx, cy + dy * ry, rx * 0.09, ry * 0.07, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // squat thick legs
  ctx.fillStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.55, cy + ry * 0.9, rx * 0.25, ry * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Capybara: a broad, flat rectangular muzzle that is the species' hallmark.
function drawCapybaraShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawCritterBody(ctx, p, cx, cy, rx, ry, t, rng);
  ctx.fillStyle = p.bodyHi;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  ctx.beginPath();
  ctx.roundRect(cx - rx * 0.05, cy + ry * 0.12, rx * 0.62, ry * 0.32, rx * 0.08);
  ctx.fill();
  ctx.stroke();
}

// Claude: warm terracotta mascot with a spiral cowlick crest and big curious eyes.
function drawClaudeShape(ctx, p, cx, cy, rx, ry, t) {
  ctx.lineWidth = Math.max(2.5, rx * 0.055);
  ctx.strokeStyle = p.outline;
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  grad.addColorStop(0, p.bodyHi);
  grad.addColorStop(0.5, p.body);
  grad.addColorStop(1, p.bodyLo);
  ctx.fillStyle = grad;
  // round, slightly oversized head/body to make the eyes feel big and curious
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.05, rx * 0.98, ry * 0.94, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // ears
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * rx * 0.32, cy - ry * 0.55);
    ctx.quadraticCurveTo(cx + dir * rx * 0.72, cy - ry * 1.05, cx + dir * rx * 0.22, cy - ry * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // gentle spiral cowlick crest on top of the head
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const crestX = cx + rx * 0.02;
  const crestY = cy - ry * 0.78;
  let first = true;
  for (let a = 0; a < Math.PI * 3.2; a += 0.22) {
    const r = rx * 0.035 * (1 + a / Math.PI);
    const px = crestX + Math.cos(a + 0.6) * r;
    const py = crestY - Math.sin(a + 0.6) * r * 0.75;
    if (first) { ctx.moveTo(px, py); first = false; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // paws
  ctx.fillStyle = p.bodyLo;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.35, cy + ry * 0.88, rx * 0.18, ry * 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // tail
  ctx.strokeStyle = p.bodyLo;
  ctx.lineWidth = Math.max(2, rx * 0.06);
  ctx.lineCap = 'round';
  const sway = Math.sin(t / 300) * rx * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.52, cy + ry * 0.35);
  ctx.quadraticCurveTo(cx - rx * 1.02, cy + ry * 0.75 + sway, cx - rx * 0.88, cy + ry * 1.1 + sway);
  ctx.stroke();
}

// Wolf: leaner body, cheek ruff, and a longer snout than the generic critter.
function drawWolfShape(ctx, p, cx, cy, rx, ry, t, rng, species) {
  drawCritterBody(ctx, p, cx, cy, rx, ry, t, rng);
  // cheek ruff
  ctx.fillStyle = p.bodyLo;
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.55, cy + ry * 0.05, rx * 0.28, ry * 0.42, dir * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // longer snout
  ctx.fillStyle = p.body;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.18, cy + ry * 0.22, rx * 0.42, ry * 0.18, -0.05, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

// Species id -> iconic silhouette. These override the archetype rig.
const SHAPE_FOR = {
  taco: drawTacoShape,
  box: drawBoxShape,
  dice: drawDiceShape,
  anchor: drawAnchorShape,
  burger: drawBurgerShape,
  coffee: drawCoffeeShape,
  'dali-clock': drawDaliClockShape,
  mimic: drawMimicShape,
  clippy: drawClippyShape,
  tree: drawTreeShape,
  robot: drawRobotShape,
  potato: drawPotatoShape,
  jellyfish: drawJellyfishShape,
  duck: drawDuckShape,
  owl: drawOwlShape,
  parrot: drawParrotShape,
  rooster: drawRoosterShape,
  phoenix: drawPhoenixShape,
  'bac-man': drawBacManShape,
  illuminati: drawIlluminatiShape,
  crab: drawCrabShape,
  gorby: drawGorbyShape,
  comrade: drawComradeShape,
  'yog-sothoth': drawYogSothothShape,
  'joe-camel': drawJoeCamelShape,
  doobie: drawDoobieShape,
  zorak: drawZorakShape,
  dolphin: drawDolphinShape,
  chonk: drawChonkShape,
  tardigrade: drawTardigradeShape,
  rat: drawRatShape,
  imp: drawImpShape,
  goblin: drawGoblinShape,
  kobold: drawKoboldShape,
  'cane-toad': drawCaneToadShape,
  capybara: drawCapybaraShape,
  claude: drawClaudeShape,
  wolf: drawWolfShape,
  // M13c operator callouts
  cow: drawCowShape,
  frog: drawFrogShape,
  bat: drawBatShape,
  coopa: drawCoopaShape,
  panda: drawPandaShape,
  raccoon: drawRaccoonShape,
  dragon: drawDragonShape,
  octopus: drawOctopusShape,
};

// Archetype -> body rig. Entries are added incrementally; anything not yet here
// keeps drawing the blob fallback (tests stay green at every checkpoint).
const BODY_FOR = {
  blob: drawBlobBody,
  orb: drawOrbBody,
  critter: drawCritterBody,
  avian: drawAvianBody,
  bug: drawBugBody,
  aquatic: drawAquaticBody,
  humanoid: drawHumanoidBody,
  plant: drawPlantBody,
  spectral: drawSpectralBody,
};

// Archetype-specific silhouette parts drawn BEHIND the body (wings, tentacles).
function drawBackParts(ctx, arch, p, cx, cy, rx, ry, t, rng) {
  ctx.save();
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.05);
  // All archetype-level back parts have moved into the body rigs.
  switch (arch) {
    default:
      break;
  }
  ctx.restore();
}

// Archetype LIMBS drawn on top (arms, antennae) + a fallback head nub. Ears,
// horns and crests are now the species trait layer (drawEars); this handles the
// archetype-level appendages that trait ears do not.
function drawFrontParts(ctx, arch, p, cx, cy, rx, ry, t, rng, look, ears) {
  // All archetype-level front appendages have moved into the body rigs.
  ctx.save();
  ctx.restore();
}

// style: 'open' | 'happy' (closed arc) | 'sleepy' (half-lid) | 'wide' (alarmed)
// | 'sad' (looking down). blink still overrides everything with a quick close.
function drawEye(ctx, p, ex, ey, r, blink, look, style = 'open') {
  ctx.save();
  const closed = blink < 0.14 || style === 'happy';
  if (closed) {
    // a happy upward lash arc (also the blink frame)
    ctx.strokeStyle = p.eyeDark;
    ctx.lineWidth = r * 0.35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ex, ey + r * 0.2, r * 0.9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // per-style openness and gaze
  let openMul = 1;
  let gy = look.y;
  if (style === 'sleepy') openMul = 0.42;
  else if (style === 'wide') openMul = 1.25;
  else if (style === 'sad') gy = 0.7;
  const openY = r * blink * openMul;

  // sclera
  ctx.fillStyle = p.eyeWhite;
  ctx.beginPath();
  ctx.ellipse(ex, ey, r, openY, 0, 0, TAU);
  ctx.fill();
  // iris follows look; a wide (alarmed) eye has a smaller, beadier iris
  const irisR = r * (style === 'wide' ? 0.42 : 0.6);
  ctx.fillStyle = p.eyeDark;
  ctx.beginPath();
  ctx.ellipse(ex + look.x * r * 0.35, ey + gy * openY * 0.4, irisR, Math.min(openY, irisR), 0, 0, TAU);
  ctx.fill();
  // shine
  ctx.fillStyle = p.shine;
  ctx.beginPath();
  ctx.arc(ex - r * 0.22 + look.x * r * 0.3, ey - openY * 0.3, r * 0.22, 0, TAU);
  ctx.fill();
  // a heavy upper lid for sleepy eyes
  if (style === 'sleepy') {
    ctx.strokeStyle = p.eyeDark;
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.98, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  ctx.restore();
}

// Eyebrows, drawn only when the mood is charged (worried -1 / cross +1).
function drawBrows(ctx, p, cx, eyeY, eyeR, eyeDx, brow) {
  if (!brow) return;
  ctx.save();
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, eyeR * 0.28);
  ctx.lineCap = 'round';
  const by = eyeY - eyeR * 1.15;
  for (const dir of [-1, 1]) {
    const inner = cx + dir * eyeDx * 0.55;
    const outer = cx + dir * eyeDx * 1.35;
    // brow +1 (cross): inner end drops; brow -1 (worried): inner end lifts
    const innerY = by + brow * eyeR * 0.45;
    const outerY = by - brow * eyeR * 0.1;
    ctx.beginPath();
    ctx.moveTo(inner, innerY);
    ctx.lineTo(outer, outerY);
    ctx.stroke();
  }
  ctx.restore();
}

// The mouth, keyed to mood: smile/grin (up), flat, frown (down), wobble
// (worried wave), open (a surprised o — used by the startled reaction).
function drawMouth(ctx, p, cx, my, rx, style) {
  ctx.save();
  ctx.strokeStyle = p.outline;
  ctx.lineWidth = Math.max(2, rx * 0.035);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = rx * 0.14;
  if (style === 'open') {
    ctx.fillStyle = p.eyeDark;
    ctx.beginPath();
    ctx.ellipse(cx, my + rx * 0.03, w * 0.7, rx * 0.09, 0, 0, TAU);
    ctx.fill();
  } else if (style === 'frown') {
    ctx.beginPath();
    ctx.moveTo(cx - w, my + rx * 0.06);
    ctx.quadraticCurveTo(cx, my - rx * 0.09, cx + w, my + rx * 0.06);
    ctx.stroke();
  } else if (style === 'flat') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.8, my);
    ctx.lineTo(cx + w * 0.8, my);
    ctx.stroke();
  } else if (style === 'wobble') {
    ctx.beginPath();
    ctx.moveTo(cx - w, my);
    ctx.bezierCurveTo(cx - w * 0.4, my - rx * 0.05, cx + w * 0.4, my + rx * 0.05, cx + w, my);
    ctx.stroke();
  } else if (style === 'grin') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 1.15, my - rx * 0.02);
    ctx.quadraticCurveTo(cx, my + rx * 0.2, cx + w * 1.15, my - rx * 0.02);
    ctx.stroke();
  } else {
    // smile (default contented curve)
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.85, my);
    ctx.quadraticCurveTo(cx, my + rx * 0.14, cx + w * 0.85, my);
    ctx.stroke();
  }
  ctx.restore();
}

// A one-shot reaction envelope over ~1s. reactionMotion returns body-motion
// offsets (a hop for delight, a shake for startled) applied BEFORE the body is
// drawn; drawReactionIcons paints floating icons (hearts, sparkles, a "!") AFTER.
// This is why the pet "visibly behaves differently after" an interaction: it
// moves AND emotes, not just recolors.
const REACT_MS = 1000;

function reactionMotion(reaction, t, scale) {
  if (!reaction || reaction.t0 == null) return { dx: 0, dy: 0 };
  const e = t - reaction.t0;
  if (e < 0 || e > REACT_MS) return { dx: 0, dy: 0 };
  const k = 1 - e / REACT_MS;
  const phase = e / REACT_MS;
  const eff = reaction.effect;
  if (eff === 'delight' || eff === 'playful') {
    return { dx: 0, dy: -Math.abs(Math.sin(phase * Math.PI * 2)) * 26 * scale * k };
  }
  if (eff === 'startled') return { dx: Math.sin(e / 34) * 7 * scale * k, dy: 0 };
  if (eff === 'dislike') return { dx: Math.sin(e / 60) * 5 * scale * k, dy: 0 };
  return { dx: 0, dy: 0 };
}

function drawReactionIcons(ctx, reaction, t, cx, cy, rx, ry, scale, p) {
  if (!reaction || reaction.t0 == null) return;
  const e = t - reaction.t0;
  if (e < 0 || e > REACT_MS) return;
  const k = 1 - e / REACT_MS; // fade out
  const rise = (e / REACT_MS) * ry * 1.4; // icons float upward as they fade
  const topY = cy - ry - rise;
  const eff = reaction.effect;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (eff === 'delight') {
    for (let i = -1; i <= 1; i++) {
      const hx = cx + i * rx * 0.5 + Math.sin(e / 200 + i) * rx * 0.08;
      heart(ctx, hx, topY - Math.abs(i) * ry * 0.15, rx * 0.16 * (0.8 + 0.2 * i), `hsla(340,80%,68%,${k})`);
    }
  } else if (eff === 'playful') {
    heart(ctx, cx, topY, rx * 0.2, `hsla(330,85%,70%,${k})`);
  } else if (eff === 'soothed' || eff === 'happy' || eff === 'content') {
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * TAU + e / 300;
      const sx = cx + Math.cos(ang) * rx * 0.7;
      const sy = topY + Math.sin(ang) * ry * 0.2;
      ctx.fillStyle = `hsla(${p.h + 40},90%,72%,${k})`;
      star(ctx, sx, sy, rx * 0.09);
    }
  } else if (eff === 'startled') {
    ctx.fillStyle = `hsla(48,95%,62%,${k})`;
    ctx.font = `bold ${Math.round(rx * 0.6)}px system-ui, sans-serif`;
    ctx.fillText('!', cx + rx * 0.7, cy - ry * 0.9);
  } else if (eff === 'dislike') {
    // a small grey puff of refusal
    ctx.fillStyle = `hsla(0,0%,70%,${k * 0.8})`;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + (i - 1) * rx * 0.24, topY + rx * 0.05, rx * 0.11 * (1 + i * 0.15), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Eye layout by count: a single big cyclops eye, the usual pair, a triangle, or
// a four-eye spawn cluster. Returns [{x,y,r}] for drawEye to iterate.
function eyePositions(cx, eyeY, eyeDx, eyeR, count) {
  if (count === 1) return [{ x: cx, y: eyeY, r: eyeR * 1.5 }];
  if (count === 3) return [
    { x: cx, y: eyeY - eyeR * 0.95, r: eyeR * 0.9 },
    { x: cx - eyeDx, y: eyeY + eyeR * 0.25, r: eyeR * 0.85 },
    { x: cx + eyeDx, y: eyeY + eyeR * 0.25, r: eyeR * 0.85 },
  ];
  if (count === 4) return [
    { x: cx - eyeDx * 1.15, y: eyeY + eyeR * 0.1, r: eyeR * 0.72 },
    { x: cx - eyeDx * 0.42, y: eyeY - eyeR * 0.35, r: eyeR * 0.72 },
    { x: cx + eyeDx * 0.42, y: eyeY - eyeR * 0.35, r: eyeR * 0.72 },
    { x: cx + eyeDx * 1.15, y: eyeY + eyeR * 0.1, r: eyeR * 0.72 },
  ];
  return [
    { x: cx - eyeDx, y: eyeY, r: eyeR },
    { x: cx + eyeDx, y: eyeY, r: eyeR },
  ];
}

function heart(ctx, x, y, r, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.6);
  ctx.bezierCurveTo(x + r, y - r * 0.3, x + r * 0.5, y - r, x, y - r * 0.35);
  ctx.bezierCurveTo(x - r * 0.5, y - r, x - r, y - r * 0.3, x, y + r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- battle poses (M7) -------------------------------------------------------
// A pose is a rigid+squash transform around the creature's centre, so the same
// rig lunges, recoils or topples without any new art. `facing` is +1 (faces
// right) or -1; `pp` is a 0..1 envelope the caller animates over the beat.
function poseTransform(pose, pp, facing, scale) {
  const f = facing >= 0 ? 1 : -1;
  const e = Math.max(0, Math.min(1, pp == null ? 1 : pp));
  if (pose === 'attack') {
    // a forward lunge that peaks mid-beat then eases back
    const s = Math.sin(e * Math.PI);
    return { dx: f * 22 * scale * s, dy: -4 * scale * s, rot: f * 0.14 * s, sx: 1 + 0.08 * s, sy: 1 - 0.05 * s };
  }
  if (pose === 'hit') {
    // knocked back + a quick shudder, squashed
    const s = 1 - e;
    const shake = Math.sin(e * 34) * 4 * scale * s;
    return { dx: -f * 16 * scale * s + shake, dy: 2 * scale * s, rot: -f * 0.12 * s, sx: 1 - 0.06 * s, sy: 1 + 0.04 * s };
  }
  if (pose === 'ko') {
    // toppled onto its back, settling
    const s = Math.max(0, Math.min(1, e));
    return { dx: f * 10 * scale * s, dy: 20 * scale * s, rot: f * 1.25 * s, sx: 1 + 0.06 * s, sy: 1 - 0.12 * s };
  }
  return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };
}

// --- affinity VFX families (M7) ----------------------------------------------
// Five shared clash effects, each keyed to an archetype's affinity. drawVfx
// paints ONE burst at (x,y) over a 0..1 progress. Colour comes from the family's
// affinity hue so a Tide splash reads blue and a Bloom burst reads green.
const VFX_HUE = { splash: 205, impact: 40, gust: 190, bloom: 110, wisp: 275 };

export function drawVfx(ctx, family, x, y, pp, opts = {}) {
  const p = Math.max(0, Math.min(1, pp == null ? 0.5 : pp));
  const scale = opts.scale ?? 1;
  const hue = opts.hue ?? VFX_HUE[family] ?? 40;
  const k = 1 - p; // fade
  const R = 46 * scale;
  ctx.save();
  ctx.translate(x, y);
  if (family === 'impact') {
    ctx.strokeStyle = hsl(hue, 90, 60, k);
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r0 = R * (0.3 + p * 0.5);
      const r1 = R * (0.7 + p * 0.9);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.fillStyle = hsl(hue + 10, 95, 72, k);
    star(ctx, 0, 0, R * (0.5 + p * 0.3));
  } else if (family === 'splash') {
    ctx.fillStyle = hsl(hue, 80, 60, k * 0.9);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = R * (0.5 + p * 1.1);
      const dr = R * (0.12 + 0.06 * ((i % 3)));
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r - p * 6 * scale, dr, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = hsl(hue, 80, 70, k * 0.7);
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, R * (0.4 + p * 0.9), 0, TAU);
    ctx.stroke();
  } else if (family === 'gust') {
    ctx.strokeStyle = hsl(hue, 55, 82, k * 0.9);
    ctx.lineWidth = 4 * scale;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * R * 0.4;
      const off = p * R * 1.4;
      ctx.beginPath();
      ctx.arc(off * 0.2, yy, R * (0.5 + i * 0.2), Math.PI * 0.8, Math.PI * 1.9);
      ctx.stroke();
    }
  } else if (family === 'bloom') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + p * 1.2;
      const r = R * (0.3 + p * 1.0);
      ctx.save();
      ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
      ctx.rotate(a);
      ctx.fillStyle = hsl(hue + (i % 2 ? 18 : -12), 70, 62, k);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.28, R * 0.14, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = hsl(50, 90, 70, k);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.18, 0, TAU);
    ctx.fill();
  } else if (family === 'wisp') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + p * 2;
      const r = R * (0.2 + p * 1.1) * (0.6 + 0.4 * ((i % 3) / 2));
      const tw = 0.5 + 0.5 * Math.sin(p * 10 + i);
      ctx.fillStyle = hsl(hue + i * 6, 85, 72, k * (0.4 + tw * 0.6));
      star(ctx, Math.cos(a) * r, Math.sin(a) * r, R * (0.08 + 0.06 * tw));
    }
  }
  ctx.restore();
}

// The VFX family + colour a given creature clashes with, from its affinity.
export function vfxForCreature(creature) {
  const aff = affinityOf(creature && creature.species);
  return { family: aff.vfx, hue: VFX_HUE[aff.vfx] ?? aff.hue };
}

// --- stage recentering (M12) -------------------------------------------------
// The operator reported the main creature "window" clipping the pet's bottom
// with dead space up top: the rig's geometric body centre is at cy, but the
// silhouette is NOT symmetric about it — ears/horns/antennae push UP while
// tentacles/arms/feet push DOWN by different amounts per species. Centering on
// the body centre therefore mis-centres the SILHOUETTE. The systematic fix (not
// a one-off nudge): measure each species' drawn bounds with a transform-aware
// recorder, then shift the whole group so the silhouette's visual centre lands
// on the requested cy. This holds across the roster because it is derived from
// the actual drawn geometry, not tuned per creature.
//
// BoundsRecorder is a ctx-shaped stub that tracks the current transform matrix
// (save/restore/translate/scale/rotate) and expands a bounding box over every
// path coordinate. Curves use their control points (a safe over-estimate);
// arcs/ellipses use their radius box. Style assignments (fillStyle, lineWidth,
// ...) land as harmless plain properties. It is the "headless probe that
// measures content bounds" the directive asks for.
class BoundsRecorder {
  constructor() {
    this.m = [1, 0, 0, 1, 0, 0]; // a,b,c,d,e,f
    this.stack = [];
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
  }
  _mul(a, b, c, d, e, f) {
    const m = this.m;
    this.m = [
      m[0] * a + m[2] * b,
      m[1] * a + m[3] * b,
      m[0] * c + m[2] * d,
      m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4],
      m[1] * e + m[3] * f + m[5],
    ];
  }
  _pt(x, y) {
    const m = this.m;
    const X = m[0] * x + m[2] * y + m[4];
    const Y = m[1] * x + m[3] * y + m[5];
    if (X < this.minX) this.minX = X;
    if (X > this.maxX) this.maxX = X;
    if (Y < this.minY) this.minY = Y;
    if (Y > this.maxY) this.maxY = Y;
  }
  save() { this.stack.push(this.m.slice()); }
  restore() { if (this.stack.length) this.m = this.stack.pop(); }
  translate(x, y) { this._mul(1, 0, 0, 1, x, y); }
  scale(x, y) { this._mul(x, 0, 0, y, 0, 0); }
  rotate(a) { const c = Math.cos(a); const s = Math.sin(a); this._mul(c, s, -s, c, 0, 0); }
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
  resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
  beginPath() {}
  closePath() {}
  moveTo(x, y) { this._pt(x, y); }
  lineTo(x, y) { this._pt(x, y); }
  quadraticCurveTo(cx, cy, x, y) { this._pt(cx, cy); this._pt(x, y); }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { this._pt(c1x, c1y); this._pt(c2x, c2y); this._pt(x, y); }
  arc(x, y, r) { this._pt(x - r, y - r); this._pt(x + r, y + r); }
  arcTo(x1, y1, x2, y2) { this._pt(x1, y1); this._pt(x2, y2); }
  ellipse(x, y, rx, ry) { const r = Math.max(rx, ry); this._pt(x - r, y - r); this._pt(x + r, y + r); }
  rect(x, y, w, h) { this._pt(x, y); this._pt(x + w, y + h); }
  roundRect(x, y, w, h) { this._pt(x, y); this._pt(x + w, y + h); }
  fillRect(x, y, w, h) { this._pt(x, y); this._pt(x + w, y + h); }
  fill() {}
  stroke() {}
  clip() {}
  fillText() {}
  strokeText() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  box() {
    if (!isFinite(this.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX: this.minX, minY: this.minY, maxX: this.maxX, maxY: this.maxY };
  }
}

// Measure a creature's drawn footprint (silhouette + ground shadow) at scale 1
// with the body centre at the origin, in a neutral (t=0, no pose/reaction) pose.
// Returns { minX, minY, maxX, maxY } relative to the body centre.
export function measureCreature(creature, opts = {}) {
  const rec = new BoundsRecorder();
  drawCreature(rec, creature, 0, { cx: 0, cy: 0, scale: 1, ...opts, __measure: true, recenter: false });
  return rec.box();
}

// Per-rig vertical recenter offset (scale-1 units): the shift that moves the
// silhouette's vertical midpoint onto the requested cy. Memoized by rig shape
// (archetype + traits), since appendage geometry — the only thing that breaks
// symmetry — depends only on those, not on the seed/variant.
const recenterMemo = new Map();
function rigKey(creature) {
  const sp = creature.species || {};
  const tr = traitsFor(sp);
  // Species id matters now that some species have iconic silhouettes that override
  // their archetype rig (M13). Two species of the same archetype + traits can have
  // different footprints, so the memo key must include the silhouette identity.
  return `${sp.id}|${sp.archetype}|${tr.ears}|${tr.face}|${tr.pattern}|${tr.eyes}`;
}
export function recenterOffsetY(creature) {
  const key = rigKey(creature);
  if (recenterMemo.has(key)) return recenterMemo.get(key);
  const b = measureCreature(creature);
  const off = -(b.minY + b.maxY) / 2; // negative => move up (bottom-heavy silhouette)
  recenterMemo.set(key, off);
  return off;
}

// Species-specific face accessories drawn AFTER the shared eyes/mouth/cheeks so
// they sit on top. Keep this scoped to one or two species — most roster members
// express identity through the shared trait layer.
const FACE_ACCESSORY_FOR = {
  'joe-camel': drawJoeCamelSunglasses,
};

// The main entry point. t is elapsed ms; opts: {cx, cy, scale, pose, poseT, facing,
// recenter}. When `recenter` is set, the silhouette is vertically centred on cy
// (used by the main creature stage so no species clips its window).
export function drawCreature(ctx, creature, t, opts = {}) {
  const measuring = opts.__measure === true;
  const p = applySpeciesPalette(
    paletteFor(creature, { silhouette: opts.silhouette === true }),
    creature.species,
  );
  const rng = makeRng((creature.variant ^ (creature.seed || 0)) >>> 0);
  const baseCx = opts.cx ?? 0;
  // Recenter the whole group (body + its ground shadow move together) so the
  // silhouette's visual centre lands on cy. Off for measurement (no recursion)
  // and for callers that treat cy as a ground line (battle/meadow) unless asked.
  const recenterY = opts.recenter && !measuring ? recenterOffsetY(creature) * (opts.scale ?? 1) : 0;
  const baseCy = (opts.cy ?? 0) + recenterY;
  const scale = opts.scale ?? 1;
  const arch = creature.species.archetype;
  const traits = traitsFor(creature.species);

  // Mood drives the face + how lively the idle is; a one-shot reaction adds a
  // hop/shake on top. Both are optional — an M1 caller with neither still works.
  const mood = opts.mood || { mouth: 'smile', eyes: 'open', brow: 0, bounce: 1 };
  const react = reactionMotion(opts.reaction, t, scale);

  // idle motion (bounce scaled by mood: a playful pet bobs livelier, a tired one barely)
  const breath = Math.sin(t / 780);
  const bob = Math.sin(t / 900) * 5 * scale * (mood.bounce ?? 1);
  const floaty = arch === 'spectral' || arch === 'orb';
  const cx = baseCx + react.dx;
  const cy = baseCy + bob + react.dy + (floaty ? Math.sin(t / 600) * 4 * scale : 0);

  const baseR = 66 * scale;
  const rx = baseR * (1 + breath * 0.03);
  const ry = baseR * (1 - breath * 0.045) * 0.96;

  // blink cycle: mostly open, quick closes, offset per creature
  const bt = (t / 1000 + (creature.variant % 997) * 0.013) % 4.2;
  let blink = 1;
  if (bt > 4.0) blink = Math.max(0.02, 1 - (bt - 4.0) / 0.1); // closing
  else if (bt > 3.9) blink = Math.max(0.02, (4.0 - bt) / 0.1); // opening tail

  // slow eye drift
  const look = { x: Math.sin(t / 1600) * 0.7, y: Math.sin(t / 2100) * 0.4 };

  ctx.save();

  // pose (idle / attack lunge / hit recoil / ko topple) — a transform around the
  // creature centre so the shared rig fights without any new art.
  const pf = poseTransform(opts.pose, opts.poseT, opts.facing ?? 1, scale);

  // ground shadow (stays on the ground; the body poses above it). Counted in the
  // footprint measurement so recentering reserves room for it — this is what
  // keeps the pet's base off the bottom edge of the window.
  ctx.fillStyle = 'rgba(20,16,30,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx + pf.dx * 0.4, baseCy + ry * 0.98, rx * (0.85 - bob * 0.01), ry * 0.22, 0, 0, TAU);
  ctx.fill();

  // apply the pose transform to the whole creature group
  ctx.translate(pf.dx, pf.dy);
  ctx.translate(cx, cy);
  ctx.rotate(pf.rot);
  ctx.scale(pf.sx, pf.sy);
  ctx.translate(-cx, -cy);

  drawBackParts(ctx, arch, p, cx, cy, rx, ry, t, rng);

  // Body dispatch: a species-specific iconic silhouette wins over its archetype
  // rig, so object-shaped species and the few named overrides read as themselves
  // while the rest of the roster stays on-archetype.
  const hasIconicShape = !!(creature.species && SHAPE_FOR[creature.species.id]);
  const bodyFn = (hasIconicShape && SHAPE_FOR[creature.species.id])
    || BODY_FOR[arch]
    || drawBlobBody;
  bodyFn(ctx, p, cx, cy, rx, ry, t, rng, creature.species);

  // Species markings are a shared-body-plan feature: they clip to the generic
  // blob path, so drawing them over a custom iconic silhouette would stomp the
  // divergence cues (e.g. Parrot's stripes painting over its hooked beak and
  // perch posture). Archetype bodies keep the pattern; custom shapes paint their
  // own markings if they need them.
  if (!hasIconicShape) {
    drawPattern(ctx, p, cx, cy, rx, ry, traits.pattern, makeRng((creature.variant ^ 0x9e37) >>> 0));
  }
  drawEars(ctx, p, cx, cy, rx, ry, t, traits.ears);
  drawFrontParts(ctx, arch, p, cx, cy, rx, ry, t, rng, look, traits.ears);
  drawMuzzle(ctx, p, cx, cy, rx, ry, traits.face);

  // face (eyes, brows, cheeks, mouth all keyed to mood). Eye COUNT is a trait —
  // one all-seeing eye, the usual pair, or a spawn's cluster.
  const eyeR = rx * 0.2;
  const eyeY = cy - ry * 0.08;
  const eyeDx = rx * 0.36;
  const eyes = eyePositions(cx, eyeY, eyeDx, eyeR, traits.eyes);
  for (const e of eyes) drawEye(ctx, p, e.x, e.y, e.r, blink, look, mood.eyes);
  if (traits.eyes === 2) drawBrows(ctx, p, cx, eyeY, eyeR, eyeDx, mood.brow || 0);

  // cheeks (a happy/playful pet gets a warmer flush; a sad one stays pale)
  const flush = mood.mouth === 'grin' || mood.mouth === 'smile' ? 1 : 0.55;
  ctx.fillStyle = p.cheek;
  ctx.globalAlpha = flush;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * rx * 0.58, eyeY + eyeR * 1.1, rx * 0.15, rx * 0.1, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const my = eyeY + eyeR * 1.5;
  // a startled reaction overrides the mouth with an open "o" for its window
  const startled = opts.reaction && opts.reaction.effect === 'startled' &&
    t - opts.reaction.t0 >= 0 && t - opts.reaction.t0 < REACT_MS;
  drawMouth(ctx, p, cx, my, rx, startled ? 'open' : mood.mouth);
  drawFaceFront(ctx, p, cx, my, rx, ry, traits.face);

  // species-specific face accessories (e.g. Joe Camel sunglasses) on top of eyes/mouth
  const accessoryFn = creature.species && FACE_ACCESSORY_FOR[creature.species.id];
  if (accessoryFn && !opts.silhouette) {
    accessoryFn(ctx, p, cx, cy, rx, ry, t, rng, creature.species);
  }

  // rarity sparkle / aura (skipped in silhouette mode so the outline stays clean)
  if (!opts.silhouette) {
    const sparkles = RARITY_SPARKLE[creature.rarity] || 0;
    for (let i = 0; i < sparkles; i++) {
      const ang = (i / sparkles) * TAU + t / 1400;
      const sr = rx * (1.15 + 0.08 * Math.sin(t / 500 + i));
      const sxp = cx + Math.cos(ang) * sr;
      const syp = cy + Math.sin(ang) * sr * 0.8;
      const tw = 0.5 + 0.5 * Math.sin(t / 300 + i * 2);
      ctx.fillStyle = hsl(p.h + 40, 90, 70, 0.5 + tw * 0.5);
      star(ctx, sxp, syp, rx * 0.06 * (0.7 + tw * 0.5));
    }
  }

  // one-shot interaction feedback (hearts / sparkles / "!" / puff)
  drawReactionIcons(ctx, opts.reaction, t, cx, cy, rx, ry, scale, p);

  ctx.restore();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.42 : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

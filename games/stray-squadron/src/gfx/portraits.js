// The memorial-cast portraits (hard rules 6 + 7) — code-drawn, in the deluxe-blocky
// register, and RECOGNIZABLE as these specific animals, never generic cartoon pets:
//   * Cuckoo — a tricolor beagle (long floppy ears, dark saddle, white muzzle blaze).
//     No photo exists; drawn from classic-beagle breed likeness (DESIGN-SEED).
//   * Leon  — a grey mackerel tabby (forehead "M", green eyes, white chin/chest,
//     upright ears, white whiskers). Characterized from reference/leon-grey-cat.jpg.
//   * Kirby — a warm-brown toy poodle (curly fluff, rounded topknot, fuzzy ears,
//     dark button eyes/nose). Characterized from reference/kirby-brown-toy-poodle.jpg.
//
// Each portrait is DESCRIPTOR-DRIVEN: a palette + a set of species feature flags that
// the renderer draws from AND the tests assert against (the recognizability spec lives
// in one place). If a likeness ever fails to read as the actual animal, the honest
// move is the emblem seam + a flag, never a cheap un-recognizable face (DIRECTIONS-M6).
// Browser-only rendering; the descriptors and draw calls are headless-testable.

export const PORTRAITS = {
  cuckoo: {
    species: 'beagle',
    name: 'Commander Cuckoo',
    role: 'Squadron Command',
    // tricolor beagle markers
    features: ['floppyEars', 'tricolorSaddle', 'muzzleBlaze', 'blackNose', 'brownEyes'],
    palette: {
      white: '#f1ece2', whiteShade: '#d6d0c4',
      tan: '#c68b4e', tanShade: '#a5713a',
      dark: '#4a382c', darkShade: '#31241a',
      nose: '#1d130e', eye: '#241811',
    },
  },
  leon: {
    species: 'grey-tabby-cat',
    name: 'Leon',
    role: 'Intel & Comms',
    features: ['uprightEars', 'tabbyM', 'greenEyes', 'whiteChin', 'whiteWhiskers', 'pinkNose'],
    palette: {
      grey: '#8e9397', greyShade: '#6d7378', greyLight: '#b2b7ba',
      stripe: '#545a5f', white: '#edefef', whiteShade: '#cccfcf',
      eye: '#8ccb63', eyeDark: '#0e1a0c', nose: '#d78b91', earPink: '#c68f96',
      whisker: '#f4f6f6',
    },
  },
  kirby: {
    species: 'toy-poodle',
    name: 'Kirby',
    role: 'Hangar & Upgrades',
    features: ['curlyCoat', 'topknot', 'fluffyEars', 'buttonEyes', 'darkNose'],
    palette: {
      coat: '#c69a62', coatShade: '#a67c46', coatLight: '#e2c48f',
      muzzle: '#dab784', nose: '#221913', eye: '#1b120e',
    },
  },
};

export const PORTRAIT_KEYS = Object.keys(PORTRAITS);

// --- small drawing helpers ---------------------------------------------------
function poly(x, pts, fill) {
  x.beginPath();
  x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  x.closePath();
  x.fillStyle = fill;
  x.fill();
}
function ell(x, cx, cy, rx, ry, fill, rot = 0) {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.beginPath();
  x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  x.fillStyle = fill;
  x.fill();
  x.restore();
}
// A lumpy "fluff" blob: an ellipse with a scalloped, curly edge — reads as poodle coat.
function fluff(x, cx, cy, rx, ry, bumps, fill) {
  x.beginPath();
  const n = bumps * 2;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.84;
    const px = cx + Math.cos(a) * rx * r;
    const py = cy + Math.sin(a) * ry * r;
    if (i === 0) x.moveTo(px, py);
    else {
      const pa = ((i - 0.5) / n) * Math.PI * 2;
      const pr = 1.06;
      x.quadraticCurveTo(cx + Math.cos(pa) * rx * pr, cy + Math.sin(pa) * ry * pr, px, py);
    }
  }
  x.closePath();
  x.fillStyle = fill;
  x.fill();
}

// --- Cuckoo — the beagle -----------------------------------------------------
function drawBeagle(x, s) {
  const p = PORTRAITS.cuckoo.palette;
  const cx = s * 0.5;
  // chest / shoulders (white, tricolor bottom)
  poly(x, [[s*0.20,s*1.02],[s*0.28,s*0.74],[s*0.72,s*0.74],[s*0.80,s*1.02]], p.white);
  poly(x, [[s*0.20,s*1.02],[s*0.28,s*0.74],[s*0.38,s*0.80],[s*0.30,s*1.02]], p.whiteShade);
  // head base (tan)
  poly(x, [[cx,s*0.16],[s*0.74,s*0.30],[s*0.72,s*0.60],[cx,s*0.72],[s*0.28,s*0.60],[s*0.26,s*0.30]], p.tan);
  // facet shade on the left of the face
  poly(x, [[cx,s*0.16],[s*0.26,s*0.30],[s*0.28,s*0.60],[cx,s*0.72]], p.tanShade);
  // dark saddle / crown over the top of the head (tricolor)
  poly(x, [[cx,s*0.14],[s*0.72,s*0.29],[s*0.62,s*0.40],[cx,s*0.34],[s*0.38,s*0.40],[s*0.28,s*0.29]], p.dark);
  poly(x, [[cx,s*0.14],[s*0.28,s*0.29],[s*0.38,s*0.40],[cx,s*0.34]], p.darkShade);
  // long floppy ears hanging down the sides (dark brown), big blocky drops
  poly(x, [[s*0.28,s*0.28],[s*0.15,s*0.34],[s*0.10,s*0.60],[s*0.20,s*0.74],[s*0.30,s*0.56]], p.dark);
  poly(x, [[s*0.72,s*0.28],[s*0.85,s*0.34],[s*0.90,s*0.60],[s*0.80,s*0.74],[s*0.70,s*0.56]], p.dark);
  poly(x, [[s*0.28,s*0.28],[s*0.15,s*0.34],[s*0.13,s*0.50],[s*0.24,s*0.46]], p.darkShade);
  poly(x, [[s*0.72,s*0.28],[s*0.85,s*0.34],[s*0.87,s*0.50],[s*0.76,s*0.46]], p.darkShade);
  // white muzzle blaze up the center of the face
  poly(x, [[cx,s*0.30],[s*0.57,s*0.50],[s*0.60,s*0.66],[cx,s*0.74],[s*0.40,s*0.66],[s*0.43,s*0.50]], p.white);
  poly(x, [[cx,s*0.30],[s*0.43,s*0.50],[s*0.40,s*0.66],[cx,s*0.74]], p.whiteShade);
  // muzzle / snout lower (white) + black nose
  ell(x, cx, s*0.63, s*0.10, s*0.075, p.white);
  ell(x, cx, s*0.585, s*0.05, s*0.037, p.nose);
  // eyes (dark brown), warm and a touch droopy
  ell(x, s*0.40, s*0.47, s*0.045, s*0.05, p.eye);
  ell(x, s*0.60, s*0.47, s*0.045, s*0.05, p.eye);
  ell(x, s*0.415, s*0.455, s*0.016, s*0.018, '#6a533f'); // catchlight-ish warm highlight
  ell(x, s*0.615, s*0.455, s*0.016, s*0.018, '#6a533f');
  // mouth line
  x.strokeStyle = p.darkShade; x.lineWidth = Math.max(1, s*0.012); x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx, s*0.66); x.lineTo(cx, s*0.70);
  x.moveTo(cx, s*0.70); x.quadraticCurveTo(s*0.56, s*0.72, s*0.60, s*0.70);
  x.moveTo(cx, s*0.70); x.quadraticCurveTo(s*0.44, s*0.72, s*0.40, s*0.70); x.stroke();
}

// --- Leon — the grey tabby ---------------------------------------------------
function drawTabby(x, s) {
  const p = PORTRAITS.leon.palette;
  const cx = s * 0.5;
  // chest / shoulders: grey sides, white bib
  poly(x, [[s*0.20,s*1.02],[s*0.28,s*0.72],[s*0.72,s*0.72],[s*0.80,s*1.02]], p.grey);
  poly(x, [[s*0.38,s*1.02],[s*0.44,s*0.74],[s*0.56,s*0.74],[s*0.62,s*1.02]], p.white);
  // upright ears (triangles) with pink inner
  poly(x, [[s*0.24,s*0.34],[s*0.20,s*0.10],[s*0.42,s*0.26]], p.grey);
  poly(x, [[s*0.76,s*0.34],[s*0.80,s*0.10],[s*0.58,s*0.26]], p.grey);
  poly(x, [[s*0.27,s*0.30],[s*0.245,s*0.16],[s*0.38,s*0.26]], p.earPink);
  poly(x, [[s*0.73,s*0.30],[s*0.755,s*0.16],[s*0.62,s*0.26]], p.earPink);
  poly(x, [[s*0.24,s*0.34],[s*0.20,s*0.10],[s*0.27,s*0.20]], p.greyShade);
  poly(x, [[s*0.76,s*0.34],[s*0.80,s*0.10],[s*0.73,s*0.20]], p.greyShade);
  // head base (grey, blocky-round)
  poly(x, [[cx,s*0.18],[s*0.74,s*0.28],[s*0.78,s*0.48],[s*0.66,s*0.66],[cx,s*0.72],[s*0.34,s*0.66],[s*0.22,s*0.48],[s*0.26,s*0.28]], p.grey);
  // facet shade left side
  poly(x, [[cx,s*0.18],[s*0.26,s*0.28],[s*0.22,s*0.48],[s*0.34,s*0.66],[cx,s*0.72]], p.greyShade);
  // lighter grey highlight across the crown
  poly(x, [[cx,s*0.18],[s*0.74,s*0.28],[s*0.60,s*0.34],[cx,s*0.30],[s*0.40,s*0.34],[s*0.26,s*0.28]], p.greyLight);
  // tabby stripes: the forehead "M" + vertical crown stripes
  x.strokeStyle = p.stripe; x.lineWidth = Math.max(1.4, s*0.018); x.lineCap = 'round';
  x.beginPath();
  // three vertical crown stripes
  x.moveTo(s*0.44,s*0.20); x.lineTo(s*0.45,s*0.32);
  x.moveTo(cx,s*0.19); x.lineTo(cx,s*0.31);
  x.moveTo(s*0.56,s*0.20); x.lineTo(s*0.55,s*0.32);
  // the "M" above the eyes
  x.moveTo(s*0.40,s*0.40); x.lineTo(s*0.44,s*0.34); x.lineTo(s*0.48,s*0.40);
  x.moveTo(s*0.52,s*0.40); x.lineTo(s*0.56,s*0.34); x.lineTo(s*0.60,s*0.40);
  // cheek stripes
  x.moveTo(s*0.24,s*0.44); x.lineTo(s*0.34,s*0.46);
  x.moveTo(s*0.76,s*0.44); x.lineTo(s*0.66,s*0.46);
  x.stroke();
  // white chin / muzzle
  poly(x, [[cx,s*0.50],[s*0.63,s*0.56],[s*0.60,s*0.68],[cx,s*0.72],[s*0.40,s*0.68],[s*0.37,s*0.56]], p.white);
  // big green eyes
  ell(x, s*0.385, s*0.45, s*0.062, s*0.058, p.white);
  ell(x, s*0.615, s*0.45, s*0.062, s*0.058, p.white);
  ell(x, s*0.385, s*0.45, s*0.05, s*0.05, p.eye);
  ell(x, s*0.615, s*0.45, s*0.05, s*0.05, p.eye);
  ell(x, s*0.385, s*0.455, s*0.02, s*0.045, p.eyeDark); // slit pupil
  ell(x, s*0.615, s*0.455, s*0.02, s*0.045, p.eyeDark);
  ell(x, s*0.40, s*0.435, s*0.014, s*0.014, '#eafbe0'); // catchlight
  ell(x, s*0.63, s*0.435, s*0.014, s*0.014, '#eafbe0');
  // pink nose
  poly(x, [[cx,s*0.575],[s*0.535,s*0.55],[s*0.465,s*0.55]], p.nose);
  ell(x, cx, s*0.555, s*0.026, s*0.02, p.nose);
  // mouth
  x.strokeStyle = p.greyShade; x.lineWidth = Math.max(1, s*0.011);
  x.beginPath(); x.moveTo(cx,s*0.585); x.lineTo(cx,s*0.62);
  x.moveTo(cx,s*0.62); x.quadraticCurveTo(s*0.55,s*0.65,s*0.57,s*0.62);
  x.moveTo(cx,s*0.62); x.quadraticCurveTo(s*0.45,s*0.65,s*0.43,s*0.62); x.stroke();
  // white whiskers, fanned
  x.strokeStyle = p.whisker; x.lineWidth = Math.max(1, s*0.008);
  x.beginPath();
  for (const [dx, dy] of [[-0.02,0],[-0.015,0.02],[-0.01,0.04]]) {
    x.moveTo(s*0.46, s*(0.60+dy)); x.lineTo(s*(0.14+dx), s*(0.56+dy*2));
  }
  for (const [dx, dy] of [[0.02,0],[0.015,0.02],[0.01,0.04]]) {
    x.moveTo(s*0.54, s*(0.60+dy)); x.lineTo(s*(0.86+dx), s*(0.56+dy*2));
  }
  x.stroke();
}

// --- Kirby — the toy poodle --------------------------------------------------
function drawPoodle(x, s) {
  const p = PORTRAITS.kirby.palette;
  const cx = s * 0.5;
  // fluffy chest / shoulders (scalloped)
  fluff(x, cx, s*0.92, s*0.34, s*0.22, 9, p.coat);
  fluff(x, s*0.40, s*0.92, s*0.18, s*0.16, 7, p.coatShade);
  // fluffy ears framing the face (big curly puffs at the sides)
  fluff(x, s*0.24, s*0.52, s*0.15, s*0.20, 8, p.coatShade);
  fluff(x, s*0.76, s*0.52, s*0.15, s*0.20, 8, p.coatShade);
  fluff(x, s*0.25, s*0.50, s*0.11, s*0.16, 7, p.coat);
  fluff(x, s*0.75, s*0.50, s*0.11, s*0.16, 7, p.coat);
  // head (round curly fluff)
  fluff(x, cx, s*0.44, s*0.26, s*0.25, 11, p.coat);
  // crown topknot puff
  fluff(x, cx, s*0.24, s*0.20, s*0.15, 9, p.coatLight);
  fluff(x, cx, s*0.26, s*0.16, s*0.12, 8, p.coat);
  // lighter facet on the right of the head
  fluff(x, s*0.58, s*0.44, s*0.16, s*0.20, 9, p.coatLight);
  // fuzzy muzzle
  ell(x, cx, s*0.56, s*0.14, s*0.11, p.muzzle);
  ell(x, cx, s*0.60, s*0.10, s*0.075, p.coatLight);
  // dark button eyes
  ell(x, s*0.41, s*0.46, s*0.042, s*0.05, p.eye);
  ell(x, s*0.59, s*0.46, s*0.042, s*0.05, p.eye);
  ell(x, s*0.423, s*0.445, s*0.015, s*0.017, '#6b533b'); // highlight
  ell(x, s*0.603, s*0.445, s*0.015, s*0.017, '#6b533b');
  // dark nose
  ell(x, cx, s*0.545, s*0.05, s*0.04, p.nose);
  ell(x, s*0.487, s*0.535, s*0.016, s*0.012, '#5a463a'); // nose highlight
  // little mouth
  x.strokeStyle = '#7a5c3e'; x.lineWidth = Math.max(1, s*0.012); x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx,s*0.58); x.lineTo(cx,s*0.61);
  x.moveTo(cx,s*0.61); x.quadraticCurveTo(s*0.55,s*0.64,s*0.575,s*0.615);
  x.moveTo(cx,s*0.61); x.quadraticCurveTo(s*0.45,s*0.64,s*0.425,s*0.615); x.stroke();
}

const DRAW = { cuckoo: drawBeagle, leon: drawTabby, kirby: drawPoodle };

// Render `key`'s portrait into the 2D context, filling an s x s box. Draws only the
// bust (head + shoulders); the hub owns the framing panel behind it.
export function drawPortrait(ctx, key, s) {
  const fn = DRAW[key];
  if (!fn) return false;
  ctx.save();
  ctx.lineJoin = 'round';
  fn(ctx, s);
  ctx.restore();
  return true;
}

// Convenience for the hub: a standalone <canvas> element with the portrait drawn,
// DPR-aware. Browser-only.
export function portraitCanvas(key, size) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = size * dpr; c.height = size * dpr;
  c.style.cssText = `width:${size}px;height:${size}px;display:block`;
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPortrait(x, key, size);
  return c;
}

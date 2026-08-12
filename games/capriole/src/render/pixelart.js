// pixelart.js — the PSX-1995 pixel-art kit: the shared treatment layer the whole
// render pass is built on. Ratified art direction (operator, 2026-08-10), transposed
// from the standalone PoC into this repo's required stack (hard rule 1: Three.js
// geometry + canvas-generated textures + procedural gradients, no image assets).
//
// Four disciplines, all of them code:
//   1. NATIVE-RES BUFFER — the world renders into a small buffer (~480x300) and the
//      browser upscales it with no smoothing. Every dither dot is one real pixel.
//      (Owned by main.js; this file's shaders read gl_FragCoord in that space.)
//   2. ONE PALETTE PER SPHERE — the committed table in palettes.js is untouched.
//      Every surface tone is a STOP ON A RAMP built from a committed hue, so a
//      sphere cannot drift outside its own family. `ink` is DERIVED from the sky
//      (not a new palette key) so the 9-key art-law contract stays exactly as
//      committed and its test stays green.
//   3. LIGHTING AS COMPOSITING — glow is additive, shade is multiply. Scenes read
//      LIT, not filled.
//   4. MATERIAL VIA DITHER + FBM — an 8x8 Bayer threshold picks between adjacent
//      ramp stops, and a little fbm "tooth" rides the tone, so flat-shaded facets
//      carry surface character without a single texture file.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Colour: plain sRGB 0..255 triples. The register is 8-bit; do the maths there.
// ---------------------------------------------------------------------------

export function hexToRgb(h) {
  const s = String(h).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const asRgb = (c) => (typeof c === 'string' ? hexToRgb(c) : c);
const lerp = (a, b, t) => a + (b - a) * t;

export function mixRgb(a, b, t) {
  a = asRgb(a); b = asRgb(b);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// t < 0 shades toward black, t > 0 toward white. The one tone operator.
export function shade(c, t) {
  return t < 0 ? mixRgb(c, [0, 0, 0], -t) : mixRgb(c, [255, 255, 255], t);
}

// The six ramp stops every surface quantises onto. Value does the modelling.
export const RAMP_STOPS = [-0.68, -0.42, -0.18, 0, 0.22, 0.48];
export function ramp(c) { const base = asRgb(c); return RAMP_STOPS.map((t) => shade(base, t)); }

// `ink` — the scene's deep shadow/void colour. DERIVED from the sphere's own sky so
// depth-shade, vignette and strata-depth stay inside the committed hue family
// instead of introducing a tenth colour the palette never committed to.
export function inkFor(palette) { return shade(hexToRgb(palette.skyTop), -0.78); }

// ---------------------------------------------------------------------------
// Deterministic value noise (no Math.random anywhere — hard rule 6 in spirit even
// though this is render-side). Mirrors the GLSL below closely enough that canvas
// surfaces and shaded surfaces read as one material world.
// ---------------------------------------------------------------------------

export function hash2(x, y, s = 0) {
  let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177 | 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
export function noise2(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  return lerp(lerp(hash2(ix, iy, s), hash2(ix + 1, iy, s), fx),
    lerp(hash2(ix, iy + 1, s), hash2(ix + 1, iy + 1, s), fx), fy);
}
export function fbm2(x, y, s = 0) {
  let v = 0, a = 0.52, f = 1, t = 0;
  for (let i = 0; i < 4; i++) { v += noise2(x * f, y * f, s + i * 17) * a; t += a; a *= 0.5; f *= 2; }
  return v / t;
}

// 8x8 Bayer, ordered 0..1. The one dither everything shares.
export const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);
export const bayerAt = (x, y) => BAYER[(((y & 7) << 3) + (x & 7))];

// Pick a ramp stop for tone `t`, dithering the fraction between neighbouring stops.
function rampPick(stops, t, x, y) {
  const v = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(v), f = v - i;
  if (i >= stops.length - 1) return stops[stops.length - 1];
  return f > bayerAt(x, y) ? stops[i + 1] : stops[i];
}

// The reference frame the direction was ratified at. Large-scale sky features are
// evaluated in these coordinates so a sphere looks the same at any buffer size;
// per-pixel grain and the dither stay in REAL pixels (they are a screen texture).
export const REF_W = 480, REF_H = 300;

// Sun/moon placement per sphere — deterministic decor, not a palette hue. Indices
// 0 / 3 / 8 carry the exact positions from the three ratified frames.
const SUN_POS = [
  [0.156, 0.343], [0.640, 0.300], [0.300, 0.255],
  [0.821, 0.273], [0.210, 0.310], [0.720, 0.240],
  [0.400, 0.290], [0.860, 0.250], [0.508, 0.247],
];
export const sunFor = (i) => SUN_POS[Math.max(0, Math.min(SUN_POS.length - 1, i | 0))];

// ---------------------------------------------------------------------------
// THE SKY — a dithered ramp, an fbm cloud band, a motivated sun with additive
// glare, and stars that only really arrive at act 3. Drawn once per sphere into a
// canvas at native buffer resolution, so one dither dot is one screen pixel.
// ---------------------------------------------------------------------------

export function makeSkyCanvas(palette, w, h, sphereIndex = 0) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, w | 0); c.height = Math.max(2, h | 0);
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const D = img.data;
  const W = c.width, H = c.height;
  const sx = REF_W / W, sy = REF_H / H; // reference-space scale for large features

  const sky = ramp(palette.skyTop), haze = ramp(palette.skyBot);
  const stops = [sky[1], sky[2], sky[3], haze[3], haze[4]];
  const act = palette.act | 0;

  const put = (x, y, col) => {
    const i = (y * W + x) * 4;
    D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = 255;
  };
  const addPx = (x, y, col, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || !(a > 0)) return;
    const i = (y * W + x) * 4;
    D[i] = Math.min(255, D[i] + col[0] * a);
    D[i + 1] = Math.min(255, D[i + 1] + col[1] * a);
    D[i + 2] = Math.min(255, D[i + 2] + col[2] * a);
  };

  // 1. The dithered vertical ramp — sky family into haze family, no smooth banding.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rx = x * sx, ry = y * sy;
      const t = Math.max(0, Math.min(1, (y / H) * 1.13 + (fbm2(rx * 0.008, ry * 0.018, 7) - 0.5) * 0.09));
      put(x, y, rampPick(stops, t, x, y));
    }
  }

  // 2. Cloud band — soft additive fbm through the middle third only.
  const cloud = hexToRgb(palette.skyBot);
  const y0 = Math.round(H * 0.253), y1 = Math.round(H * 0.607);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const band = fbm2(x * sx * 0.014, y * sy * 0.045, 19) - 0.53;
      if (band > 0) addPx(x, y, cloud, Math.min(0.2, band * 2.2));
    }
  }

  // 3. Sun/moon — additive glare (wide + tight) then a hard disc. Lighting as
  //    compositing: this is the frame's motivated light source, and every surface
  //    ramp is lit from the matching direction.
  const [sfx, sfy] = sunFor(sphereIndex);
  const cx = Math.round(sfx * W), cy = Math.round(sfy * H);
  const scale = Math.min(W / REF_W, H / REF_H);
  const gold = hexToRgb(palette.floatB), hazeTop = haze[5];
  const glow = (r, col, str, pow) => {
    const R = Math.max(1, Math.round(r * scale));
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const q = Math.hypot(x, y) / R;
        if (q > 1) continue;
        const v = Math.pow(1 - q, pow) * str;
        // Dither the faint tail so the glare fades in dots, not in a smooth wash.
        if (v < 0.055 && v * 13 < bayerAt(cx + x, cy + y)) continue;
        addPx(cx + x, cy + y, col, v);
      }
    }
  };
  glow(74, gold, 0.34, 2.4);
  glow(28, hexToRgb(palette.skyBot), 0.5, 2);
  const discR = Math.max(2, Math.round(7 * scale));
  for (let y = -discR; y <= discR; y++) {
    const half = Math.sqrt(Math.max(0, discR * discR - y * y));
    for (let x = -Math.floor(half); x <= half; x++) {
      const px = cx + x, py = cy + y;
      if (px >= 0 && py >= 0 && px < W && py < H) put(px, py, hazeTop);
    }
  }

  // 4. Stars — a scatter through the upper sky. Act 3 is where they truly arrive.
  const starCount = 58;
  for (let i = 0; i < starCount; i++) {
    const x = Math.round(hash2(i, 2, 11) * W);
    const y = Math.round(H * 0.06 + hash2(i, 7, 13) * H * 0.30);
    if (!(act === 2 || i % 4 === 0)) continue;
    if (Math.hypot(x - cx, y - cy) < 35 * scale) continue;
    const a = act === 2 ? 0.62 : 0.24;
    const col = haze[i % 2 ? 4 : 5];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const idx = (y * W + x) * 4;
    D[idx] = D[idx] * (1 - a) + col[0] * a;
    D[idx + 1] = D[idx + 1] * (1 - a) + col[1] * a;
    D[idx + 2] = D[idx + 2] * (1 - a) + col[2] * a;
  }

  g.putImageData(img, 0, 0);
  return c;
}

export function makeSkyTexture(palette, w, h, sphereIndex = 0) {
  const tex = new THREE.CanvasTexture(makeSkyCanvas(palette, w, h, sphereIndex));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ---------------------------------------------------------------------------
// THE COMPOSITING PASS — two full-screen quads over the rendered world. Both are
// STATIC per sphere, so they are baked into canvases rather than recomputed per
// frame: a MULTIPLY plate (depth shade toward the bottom of the frame, vignette,
// dark half of the grain) and an ADD plate (light half of the grain). This is the
// "scenes read lit, not filled" half of the direction.
// ---------------------------------------------------------------------------

export function makePostCanvases(palette, w, h) {
  const W = Math.max(2, w | 0), H = Math.max(2, h | 0);
  const ink = inkFor(palette), inkR = ramp(palette.skyTop);
  const hazeR = ramp(palette.skyBot);
  const inkMid = mixRgb(ink, inkR[0], 0.5); // the shade colour the PoC used for depth
  const lift = hazeR[4];

  const mulC = document.createElement('canvas'); mulC.width = W; mulC.height = H;
  const addC = document.createElement('canvas'); addC.width = W; addC.height = H;
  const mg = mulC.getContext('2d'), ag = addC.getContext('2d');
  const mImg = mg.createImageData(W, H), aImg = ag.createImageData(W, H);
  const M = mImg.data, A = aImg.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Multiply plate starts white (no-op) and darkens.
      let mr = 1, mg2 = 1, mb = 1;
      const applyMul = (col, a) => {
        mr *= 1 - a + a * col[0] / 255;
        mg2 *= 1 - a + a * col[1] / 255;
        mb *= 1 - a + a * col[2] / 255;
      };
      // Depth shade — the lower half of the frame settles into the void.
      const q = (y / H - 0.5) / 0.5;
      if (q > 0.05) applyMul(inkMid, q * 0.10);
      // Vignette — pulls the eye to the compositional focus.
      const edge = Math.hypot((x / W - 0.5) * 1.65, (y / H - 0.48) * 1.2);
      if (edge > 0.58) applyMul(inkMid, Math.max(0, Math.min(0.22, (edge - 0.58) * 0.34)));
      // Grain — per-PIXEL, so it stays a screen texture at any buffer size.
      const tooth = (noise2(x * 0.63, y * 0.63, 103) - 0.5) * 0.10;
      let ar = 0, ag2 = 0, ab = 0;
      if (tooth > 0) { const a = tooth * 0.28; ar = lift[0] * a; ag2 = lift[1] * a; ab = lift[2] * a; }
      else applyMul(inkR[1], -tooth * 0.34);

      M[i] = mr * 255; M[i + 1] = mg2 * 255; M[i + 2] = mb * 255; M[i + 3] = 255;
      A[i] = ar; A[i + 1] = ag2; A[i + 2] = ab; A[i + 3] = 255;
    }
  }
  mg.putImageData(mImg, 0, 0); ag.putImageData(aImg, 0, 0);
  return { mul: mulC, add: addC };
}

function plateTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

// A tiny scene holding the two plates, rendered over the world with autoClear off.
export function makeCompositor(palette, w, h) {
  const { mul, add } = makePostCanvases(palette, w, h);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);
  // MultiplyBlending in three r180 REQUIRES premultipliedAlpha; without it the
  // renderer refuses the blend and the plate lands as an opaque near-white quad
  // over the whole frame (caught by the art probe on the first run).
  const mulMat = new THREE.MeshBasicMaterial({
    map: plateTexture(mul), blending: THREE.MultiplyBlending, depthTest: false, depthWrite: false,
    transparent: true, premultipliedAlpha: true,
  });
  const addMat = new THREE.MeshBasicMaterial({
    map: plateTexture(add), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    transparent: true, premultipliedAlpha: true,
  });
  const mulMesh = new THREE.Mesh(geo, mulMat); mulMesh.renderOrder = 1;
  const addMesh = new THREE.Mesh(geo, addMat); addMesh.renderOrder = 2;
  scene.add(mulMesh); scene.add(addMesh);

  return {
    scene, camera,
    resize(pal, nw, nh) {
      const next = makePostCanvases(pal, nw, nh);
      mulMat.map.dispose(); addMat.map.dispose();
      mulMat.map = plateTexture(next.mul); addMat.map = plateTexture(next.add);
      mulMat.needsUpdate = true; addMat.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mulMat.map.dispose(); addMat.map.dispose();
      mulMat.dispose(); addMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// THE SURFACE MATERIAL — flat-shaded lambert quantised onto the base colour's own
// ramp, Bayer-dithered between stops, with fbm tooth riding the tone. Base colour
// arrives as a per-vertex attribute so one material can carry a whole island's
// strata without smearing the bands into a gradient.
//
// Deliberately NOT built on MeshLambertMaterial: the tone has to be a clean
// 0..1 lambert term to index the ramp, and going through the light accumulator
// would make that depend on light intensities instead of geometry. Flat shading
// comes from FACE NORMALS baked into the geometry, not from derivatives, so this
// compiles on WebGL1 too.
// ---------------------------------------------------------------------------

const RAMP_VERT = /* glsl */`
  attribute vec3 aBase;
  varying vec3 vNormalW;
  varying vec3 vBase;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vBase = aBase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RAMP_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uLight;
  uniform float uKind;   // 0 = cap, 1 = strata, 2 = prop
  varying vec3 vNormalW;
  varying vec3 vBase;

  float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
  float bayer4(vec2 a){ return bayer2(a * 0.5) * 0.25 + bayer2(a); }
  float bayer8(vec2 a){ return bayer4(a * 0.5) * 0.25 + bayer2(a); }

  float hash21(vec2 p, float s){
    p = floor(p);
    float n = p.x * 127.1 + p.y * 311.7 + s * 74.7;
    return fract(sin(n) * 43758.5453123);
  }
  float vnoise(vec2 p, float s){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i, s);
    float b = hash21(i + vec2(1.0, 0.0), s);
    float c = hash21(i + vec2(0.0, 1.0), s);
    float d = hash21(i + vec2(1.0, 1.0), s);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbmF(vec2 p, float s){
    float v = 0.0, a = 0.52, t = 0.0, fr = 1.0;
    for (int i = 0; i < 4; i++) {
      v += vnoise(p * fr, s + float(i) * 17.0) * a;
      t += a; a *= 0.5; fr *= 2.0;
    }
    return v / t;
  }

  // The six ramp stops, without an array (GLSL1-safe dynamic indexing).
  float stopFor(float k){
    float s = -0.68;
    s = mix(s, -0.42, step(0.5, k));
    s = mix(s, -0.18, step(1.5, k));
    s = mix(s,  0.00, step(2.5, k));
    s = mix(s,  0.22, step(3.5, k));
    s = mix(s,  0.48, step(4.5, k));
    return s;
  }
  vec3 shadeC(vec3 c, float t){ return t < 0.0 ? mix(c, vec3(0.0), -t) : mix(c, vec3(1.0), t); }

  void main() {
    vec3 n = normalize(vNormalW);
    float lam = clamp(dot(n, uLight) * 0.5 + 0.52, 0.08, 1.0);

    float toothAmt = (uKind == 0.0) ? 0.15 : 0.23;
    float tooth = (fbmF(gl_FragCoord.xy * vec2(0.055, 0.09), uKind * 31.0) - 0.5) * toothAmt;
    if (uKind == 1.0) tooth += sin(gl_FragCoord.y * 0.82) * 0.055;  // strata ripple

    float capLift = (uKind == 0.0) ? 0.09 : 0.0;
    float tone = clamp(0.13 + lam * 0.74 + capLift + tooth, 0.0, 1.0);

    float v = tone * 5.0;
    float i = floor(v);
    float f = v - i;
    float k = min(i + step(bayer8(gl_FragCoord.xy), f), 5.0);
    gl_FragColor = vec4(shadeC(vBase, stopFor(k)), 1.0);
  }
`;

// The key light direction — it must match the sun THIS sphere's sky canvas paints.
//
// This was originally per-ACT (three directions for nine spheres). That reads correctly
// at the three ratified frames by luck of their sun placement, but the sky paints a sun
// PER SPHERE, so spheres 1, 4 and 7 ended up lit from the side opposite their own sun.
// Deriving the side from `sunFor` fixes those three and leaves the other six alone.
//
// The dead-band matters: a sun sitting on the vertical centreline carries no side
// information, so those spheres keep the act's authored default. Crown of Heaven's sun
// is at x=0.508 — dead centre — and the ratified frame lights it from the LEFT, which
// the dead-band is what preserves. Do not remove it without re-ratifying that frame.
export function lightForSphere(sphereIndex, act) {
  const actSide = act === 1 ? 1 : -1;
  const sunX = sunFor(sphereIndex)[0] - 0.5;
  const side = Math.abs(sunX) < 0.05 ? actSide : Math.sign(sunX);
  const d = [0.7 * side, 0.75, 0.3];
  const n = Math.hypot(d[0], d[1], d[2]);
  return new THREE.Vector3(d[0] / n, d[1] / n, d[2] / n);
}

export function rampMaterial(kind, lightDir) {
  return new THREE.ShaderMaterial({
    uniforms: { uLight: { value: lightDir.clone() }, uKind: { value: kind } },
    vertexShader: RAMP_VERT,
    fragmentShader: RAMP_FRAG,
  });
}

// Attach a uniform base colour to any geometry as the `aBase` attribute, with FACE
// normals (flat shading by construction — the idiom law, no smooth normals).
export function toRampGeometry(geo, baseHex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  g.computeVertexNormals(); // non-indexed => per-face normals => flat shading
  const n = g.getAttribute('position').count;
  const rgb = asRgb(baseHex);
  const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    base[i * 3] = rgb[0] / 255; base[i * 3 + 1] = rgb[1] / 255; base[i * 3 + 2] = rgb[2] / 255;
  }
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  return g;
}

// ---------------------------------------------------------------------------
// A small builder for hand-authored flat-shaded geometry with per-vertex base
// colours — how the islands get hard strata bands instead of a smeared gradient.
// ---------------------------------------------------------------------------

export function makeSurfaceBuilder() {
  const pos = [], nrm = [], base = [];
  const push = (p, n, c) => {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    base.push(c[0] / 255, c[1] / 255, c[2] / 255);
  };
  const faceNormal = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    return [nx / L, ny / L, nz / L];
  };
  return {
    tri(a, b, c, colour, normal) {
      const n = normal || faceNormal(a, b, c);
      const col = asRgb(colour);
      push(a, n, col); push(b, n, col); push(c, n, col);
    },
    quad(a, b, c, d, colour, normal) {
      this.tri(a, b, c, colour, normal);
      this.tri(a, c, d, colour, normal);
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
      return g;
    },
    get triangleCount() { return pos.length / 9; },
  };
}

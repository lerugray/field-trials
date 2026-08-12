// light.js — native-resolution software light compositor. drawStage paints albedo, licensed
// sprites, and matter FX into the shared 256x240 buffer; this post-pass then adds practical/event
// light and closes the frame with a palette-tinted vignette. Dither/material sampling is always
// keyed to world coordinates so camera motion cannot make the pattern swim across the scene.

import { PALETTE, hexToRgb } from './palette.js';

export const LIGHT_BAYER_8 = Object.freeze([
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((value) => (value + 0.5) / 64));

export function lightBayerAt(worldX, worldY) {
  return LIGHT_BAYER_8[(Math.floor(worldY) & 7) * 8 + (Math.floor(worldX) & 7)];
}

function lightSmooth(value) { return value * value * (3 - 2 * value); }
function lightMix(a, b, amount) { return a + (b - a) * amount; }
function lightClamp(value, low = 0, high = 1) { return value < low ? low : value > high ? high : value; }

/** Deterministic gradient noise used by both world materials and light spill. */
export function materialNoise2(seed = 1) {
  const permutation = new Uint8Array(512);
  let state = (Number(seed) || 1) >>> 0;
  const random = () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 256; i++) permutation[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = permutation[i]; permutation[i] = permutation[j]; permutation[j] = swap;
  }
  for (let i = 0; i < 256; i++) permutation[i + 256] = permutation[i];
  const gradient = (hash, x, y) => {
    switch (hash & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };
  return (x, y) => {
    const floorX = Math.floor(x); const floorY = Math.floor(y);
    const X = floorX & 255; const Y = floorY & 255;
    const xf = x - floorX; const yf = y - floorY;
    const u = lightSmooth(xf); const v = lightSmooth(yf);
    const aa = permutation[permutation[X] + Y];
    const ab = permutation[permutation[X] + Y + 1];
    const ba = permutation[permutation[X + 1] + Y];
    const bb = permutation[permutation[X + 1] + Y + 1];
    const first = lightMix(gradient(aa, xf, yf), gradient(ba, xf - 1, yf), u);
    const second = lightMix(gradient(ab, xf, yf - 1), gradient(bb, xf - 1, yf - 1), u);
    return (lightMix(first, second, v) + 1) * 0.5;
  };
}

export function materialFbm(seed = 1, octaves = 4) {
  const noise = materialNoise2(seed);
  return (x, y) => {
    let sum = 0; let amplitude = 0.5; let frequency = 1; let total = 0;
    for (let octave = 0; octave < octaves; octave++) {
      sum += noise(x * frequency, y * frequency) * amplitude;
      total += amplitude; amplitude *= 0.5; frequency *= 2;
    }
    return sum / total;
  };
}

/** Ordered ramp selection. Both fbm inputs and this threshold receive world coordinates. */
export function materialRampKey(ramp, amount, worldX, worldY) {
  if (amount <= 0) return ramp[0];
  if (amount >= 1) return ramp[ramp.length - 1];
  const scaled = amount * (ramp.length - 1);
  const index = Math.floor(scaled);
  return scaled - index > lightBayerAt(worldX, worldY) ? ramp[index + 1] : ramp[index];
}

export function createLightFrame(theme, camera, width, height, reduceEffects = false) {
  return {
    theme,
    rig: theme.lightRig || {},
    cameraX: Math.round(camera?.x || 0),
    cameraY: Math.round(camera?.y || 0),
    width,
    height,
    reduceEffects: !!reduceEffects,
    emitters: [],
    heroLayers: [],
  };
}

/** Register a world-space emitter. Matter is drawn by stagerender; only its light comes here. */
export function registerLight(frame, emitter) {
  if (!frame || !emitter) return;
  frame.emitters.push({ ...emitter });
}

/** Register the certified hero's render-time alpha mask. Source pixels remain untouched: the mask
 * lets the shared-buffer pass address only pixels contributed by the hero draw. */
export function registerHeroLayer(frame, layer) {
  if (!frame || !layer?.alphaMask || !layer.width || !layer.height) return;
  frame.heroLayers.push({ ...layer });
}

const LIGHT_METRICS = {
  frames: 0, totalMs: 0, lastMs: 0, maxMs: 0, readbacks: 0,
  heroConformedFrames: 0, heroPixels: 0,
};

export function lightStatsSnapshot() {
  return {
    frames: LIGHT_METRICS.frames,
    lastMs: LIGHT_METRICS.lastMs,
    averageMs: LIGHT_METRICS.frames ? LIGHT_METRICS.totalMs / LIGHT_METRICS.frames : 0,
    maxMs: LIGHT_METRICS.maxMs,
    readbacks: LIGHT_METRICS.readbacks,
    heroConformedFrames: LIGHT_METRICS.heroConformedFrames,
    heroPixels: LIGHT_METRICS.heroPixels,
  };
}

function lightNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function lightAddPixel(data, width, height, x, y, rgb, amount) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height || amount <= 0) return;
  const index = (y * width + x) * 4;
  data[index] = Math.min(255, data[index] + rgb[0] * amount);
  data[index + 1] = Math.min(255, data[index + 1] + rgb[1] * amount);
  data[index + 2] = Math.min(255, data[index + 2] + rgb[2] * amount);
}

function lightMixPixel(data, index, rgb, amount) {
  data[index] = lightMix(data[index], rgb[0], amount);
  data[index + 1] = lightMix(data[index + 1], rgb[1], amount);
  data[index + 2] = lightMix(data[index + 2], rgb[2], amount);
}

/** Biome ambient/material response for the hero layer. This is deliberately inside the existing
 * framebuffer readback: no second per-frame readback and no mutation/recolour of certified art. */
function lightApplyHeroMaterial(data, frame) {
  const spec = frame.rig.hero;
  if (!spec || !frame.heroLayers.length) return 0;
  const ambient = hexToRgb(PALETTE[spec.ambient] || spec.ambient);
  const tint = hexToRgb(PALETTE[spec.tint] || spec.tint);
  const noise = materialFbm(spec.seed || 83, 3);
  let conformed = 0;
  for (const layer of frame.heroLayers) {
    const screenX = Math.round(layer.x - frame.cameraX);
    const screenY = Math.round(layer.y - frame.cameraY);
    for (let localY = 0; localY < layer.height; localY++) for (let localX = 0; localX < layer.width; localX++) {
      const maskX = layer.flip ? layer.width - 1 - localX : localX;
      if (!layer.alphaMask[localY * layer.width + maskX]) continue;
      const x = screenX + localX; const y = screenY + localY;
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
      const worldX = x + frame.cameraX; const worldY = y + frame.cameraY;
      const texture = noise(worldX * 0.19, worldY * 0.23);
      const ordered = lightBayerAt(worldX, worldY);
      const grainGate = 0.18 + texture * 0.24;
      const shade = lightClamp((spec.shade || 0) * (0.78 + texture * 0.38)
        + (ordered < grainGate ? (spec.grain || 0) : 0), 0, 0.42);
      const index = (y * frame.width + x) * 4;
      lightMixPixel(data, index, ambient, shade);
      // Sparse ordered catches keep the same upper-left palette-light logic as world materials.
      if (ordered > 0.82 && texture > 0.48) {
        lightMixPixel(data, index, tint, spec.tintStrength || 0);
      }
      conformed++;
    }
  }
  return conformed;
}

function lightGlow(data, frame, cx, cy, radius, color, strength, power = 2) {
  const rgb = hexToRgb(PALETTE[color] || color);
  const x0 = Math.max(0, Math.floor(cx - radius)); const x1 = Math.min(frame.width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)); const y1 = Math.min(frame.height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > radius) continue;
    const amount = Math.pow(1 - distance / radius, power) * strength;
    const worldX = x + frame.cameraX; const worldY = y + frame.cameraY;
    if (amount < 0.06 && amount * 12 < lightBayerAt(worldX, worldY)) continue;
    lightAddPixel(data, frame.width, frame.height, x, y, rgb, amount);
  }
}

function lightSpill(data, frame, cx, sourceY, floorY, radius, color, strength, seed) {
  if (floorY == null || floorY < sourceY) return;
  const rgb = hexToRgb(PALETTE[color] || color);
  const noise = materialFbm(seed || 3, 3);
  const lastY = Math.min(frame.height - 1, floorY + Math.round(radius * 0.75));
  for (let y = Math.max(0, floorY); y <= lastY; y++) {
    const progress = (y - floorY) / Math.max(1, lastY - floorY);
    const halfWidth = radius * (0.24 + progress * 0.62);
    for (let x = Math.max(0, Math.floor(cx - halfWidth)); x <= Math.min(frame.width - 1, Math.ceil(cx + halfWidth)); x++) {
      const across = 1 - Math.abs(x - cx) / halfWidth;
      if (across <= 0) continue;
      const worldX = x + frame.cameraX; const worldY = y + frame.cameraY;
      const wobble = 0.58 + 0.76 * noise(worldX * 0.1, worldY * 0.45);
      const amount = strength * Math.pow(1 - progress, 1.5) * Math.pow(across, 1.4) * wobble;
      if (amount < 0.05 && amount * 14 < lightBayerAt(worldX, worldY)) continue;
      lightAddPixel(data, frame.width, frame.height, x, y, rgb, amount);
    }
  }
}

function lightWash(data, frame, cx, cy, radiusX, radiusY, color, strength) {
  const rgb = hexToRgb(PALETTE[color] || color);
  const x0 = Math.max(0, Math.floor(cx - radiusX)); const x1 = Math.min(frame.width - 1, Math.ceil(cx + radiusX));
  const y0 = Math.max(0, Math.floor(cy - radiusY)); const y1 = Math.min(frame.height - 1, Math.ceil(cy + radiusY));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const distance = Math.hypot((x - cx) / radiusX, (y - cy) / radiusY);
    if (distance > 1) continue;
    const amount = Math.pow(1 - distance, 1.7) * strength;
    const worldX = x + frame.cameraX; const worldY = y + frame.cameraY;
    if (amount < 0.05 && amount * 14 < lightBayerAt(worldX, worldY)) continue;
    lightAddPixel(data, frame.width, frame.height, x, y, rgb, amount);
  }
}

function lightApplyRig(data, frame) {
  const rig = frame.rig;
  if (rig.key) {
    const keyX = frame.width * rig.key.x; const keyY = frame.height * rig.key.y;
    lightWash(data, frame, keyX, keyY, rig.key.radiusX || frame.width, rig.key.radiusY || frame.height,
      rig.key.color, rig.key.strength * (frame.reduceEffects ? 0.65 : 1));
  }
  if (rig.shaft) {
    const shaft = rig.shaft;
    const rgb = hexToRgb(PALETTE[shaft.color]);
    const noise = materialFbm(shaft.seed || 9, 3);
    for (let y = 0; y < frame.height; y++) {
      const progress = y / Math.max(1, frame.height - 1);
      const center = lightMix(frame.width * shaft.x0, frame.width * shaft.x1, progress);
      const halfWidth = lightMix(shaft.w0, shaft.w1, progress);
      for (let x = Math.max(0, Math.floor(center - halfWidth)); x <= Math.min(frame.width - 1, Math.ceil(center + halfWidth)); x++) {
        const across = 1 - Math.abs(x - center) / halfWidth;
        if (across <= 0) continue;
        const worldX = x + frame.cameraX; const worldY = y + frame.cameraY;
        const amount = shaft.strength * (frame.reduceEffects ? 0.55 : 1) * Math.pow(across, 1.6)
          * Math.pow(1 - progress * 0.72, 1.25) * (0.56 + noise(worldX * 0.07, worldY * 0.06) * 0.72);
        if (amount < 0.05 && amount * 14 < lightBayerAt(worldX, worldY)) continue;
        lightAddPixel(data, frame.width, frame.height, x, y, rgb, amount);
      }
    }
  }
}

function lightApplyEmitter(data, frame, emitter) {
  const cx = emitter.x - frame.cameraX;
  const cy = emitter.y - frame.cameraY;
  const baseRadius = emitter.radius || 24;
  const practicalScale = frame.reduceEffects ? 0.45 : 1;
  const eventScale = frame.reduceEffects ? 0.16 : 1;
  const isEvent = ['impact', 'death', 'shockwave'].includes(emitter.kind);
  const scale = isEvent ? eventScale : practicalScale;
  const lifeScale = emitter.maxLife ? lightClamp(emitter.life / emitter.maxLife) : 1;
  const strength = (emitter.strength == null ? 0.5 : emitter.strength) * scale * lifeScale;
  if (strength <= 0) return;
  const color = emitter.color || (emitter.kind === 'marker' ? 'u' : emitter.kind === 'death' ? 'o' : 'c');
  lightGlow(data, frame, cx, cy, baseRadius, color, strength, emitter.kind === 'impact' ? 3 : 2);
  if (emitter.kind === 'torch' || emitter.kind === 'checkpoint' || emitter.kind === 'marker' || emitter.kind === 'impact') {
    const core = emitter.coreColor || (emitter.kind === 'marker' ? 'u' : emitter.kind === 'impact' ? '5' : 'p');
    lightGlow(data, frame, cx, cy, Math.max(4, Math.round(baseRadius * 0.32)), core, strength * 1.18, 2);
  }
  if (emitter.floorY != null) {
    lightSpill(data, frame, cx, cy, emitter.floorY - frame.cameraY, baseRadius, color, strength * 0.58, emitter.seed);
  }
  if (emitter.kind === 'torch' || emitter.kind === 'checkpoint') {
    lightWash(data, frame, cx, cy + baseRadius * 0.18, baseRadius * 1.25, baseRadius, color, strength * 0.35);
  }
}

function lightApplyVignette(data, frame) {
  const spec = frame.rig.vignette;
  if (!spec) return;
  const rgb = hexToRgb(PALETTE[spec.color] || spec.color);
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const dx = (x / frame.width - 0.5) * 2;
    const dy = (y / frame.height - 0.5) * 2;
    const distance = Math.hypot(dx * 0.9, dy);
    if (distance <= 0.56) continue;
    const amount = lightClamp((distance - 0.56) * spec.amount, 0, 0.82);
    const index = (y * frame.width + x) * 4;
    data[index] *= 1 - amount + amount * rgb[0] / 255;
    data[index + 1] *= 1 - amount + amount * rgb[1] / 255;
    data[index + 2] *= 1 - amount + amount * rgb[2] / 255;
  }
}

/** Apply one bounded getImageData/putImageData light pass to the real logical buffer. */
export function applyLightPass(ctx, frame) {
  const started = lightNow();
  const image = ctx.getImageData(0, 0, frame.width, frame.height);
  LIGHT_METRICS.readbacks++;
  const heroPixels = lightApplyHeroMaterial(image.data, frame);
  lightApplyRig(image.data, frame);
  for (const emitter of frame.emitters) lightApplyEmitter(image.data, frame, emitter);
  lightApplyVignette(image.data, frame);
  ctx.putImageData(image, 0, 0);
  const elapsed = lightNow() - started;
  LIGHT_METRICS.frames++;
  LIGHT_METRICS.totalMs += elapsed;
  LIGHT_METRICS.lastMs = elapsed;
  LIGHT_METRICS.maxMs = Math.max(LIGHT_METRICS.maxMs, elapsed);
  if (heroPixels > 0) LIGHT_METRICS.heroConformedFrames++;
  LIGHT_METRICS.heroPixels += heroPixels;
  return { elapsedMs: elapsed, emitters: frame.emitters.length, readbacks: 1, heroPixels };
}

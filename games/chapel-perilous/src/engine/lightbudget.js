// Measured additive-light knobs. The renderer imports these values directly and
// test/bloom-restraint.test.js places independent ceilings over their worst-case
// local luminance lift and pool area. Keep a light in the smallest semantic class
// that owns it; do not add anonymous `lighter` passes in scene code.

const circle = (radius, intensity, extra = {}) => Object.freeze({ shape: 'circle', radius, intensity, ...extra });
const ellipse = (rx, ry, intensity, extra = {}) => Object.freeze({ shape: 'ellipse', rx, ry, intensity, ...extra });

export const BLOOM_CLASSES = Object.freeze({
  siteChapel: Object.freeze({ areaUnit: 'tile', layers: Object.freeze([circle(0.28, 0.10)]) }),
  siteCity: Object.freeze({ areaUnit: 'tile', layers: Object.freeze([circle(0.46, 0.18)]) }),
  siteDungeon: Object.freeze({ areaUnit: 'tile', layers: Object.freeze([circle(0.20, 0.05)]) }),

  partyTorch: Object.freeze({ areaUnit: 'tile', layers: Object.freeze([
    circle(0.48, 0.10, { role: 'outer' }),
    circle(0.22, 0.18, { role: 'inner' }),
  ]) }),

  dungeonTorch: Object.freeze({ areaUnit: 'scene', layers: Object.freeze([
    ellipse(0.18, 0.18, 0.16, { role: 'throw' }),
    circle(0.10, 0.10, { role: 'outer', radiusAxis: 'sceneHeight' }),
    circle(0.035, 0.24, { role: 'core', radiusAxis: 'sceneHeight' }),
  ]) }),
  dungeonEncounter: Object.freeze({ areaUnit: 'bust', layers: Object.freeze([
    circle(0.32, 0.05),
  ]) }),

  // Full-frame CRT copy: area is necessarily one frame, so restraint lives in
  // the alpha and blur radius. Glare area is a frame-height-normalized circle.
  crtBloom: Object.freeze({ areaUnit: 'frame', blend: 'self', blurPx: 1.5, layers: Object.freeze([
    Object.freeze({ shape: 'frame', intensity: 0.08 }),
  ]) }),
  crtGlare: Object.freeze({ areaUnit: 'frame', blend: 'overlay', layers: Object.freeze([
    circle(0.34, 0.012, { radiusAxis: 'frameHeight' }),
  ]) }),
});

export function lightLayer(className, role = null) {
  const spec = BLOOM_CLASSES[className];
  if (!spec) throw new Error(`unknown bloom class '${className}'`);
  const layer = role == null ? spec.layers[0] : spec.layers.find((candidate) => candidate.role === role);
  if (!layer) throw new Error(`bloom class '${className}' has no '${role}' layer`);
  return layer;
}

// sRGB grayscale -> normalized linear luminance. White is the conservative tint:
// every shipped phosphor HOT triple is equal or dimmer in relative luminance.
function grayLuminance(value) {
  const c = Math.max(0, Math.min(255, value)) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function maxSweep(deltaAt) {
  let max = 0;
  for (let base = 0; base <= 255; base++) max = Math.max(max, grayLuminance(deltaAt(base)) - grayLuminance(base));
  return max;
}

/** Conservative maximum normalized local luminance lift for one light class. */
export function maxLocalLuminanceLift(spec) {
  const intensity = spec.layers.reduce((sum, layer) => sum + layer.intensity, 0);
  if (spec.blend === 'self') return maxSweep((base) => Math.min(255, base * (1 + intensity)));
  if (spec.blend === 'overlay') return maxSweep((base) => Math.min(255, base + 255 * intensity));
  return grayLuminance(255 * Math.min(1, intensity));
}

/**
 * Maximum pool area in the class's declared unit:
 * - tile/bust: multiples of the owning square's area;
 * - scene: fraction of scene area (ellipse rx/ry are W/H fractions; circular
 *   layers are H-normalized and measured at the reference 16:10 aspect);
 * - frame: fraction of frame area at the reference 16:10 aspect.
 */
export function maxGlowPoolArea(spec, aspect = 16 / 10) {
  let max = 0;
  for (const layer of spec.layers) {
    let area;
    if (layer.shape === 'frame') area = 1;
    else if (layer.shape === 'ellipse') area = Math.PI * layer.rx * layer.ry;
    else if (spec.areaUnit === 'scene' || spec.areaUnit === 'frame') area = Math.PI * layer.radius * layer.radius / aspect;
    else area = Math.PI * layer.radius * layer.radius;
    max = Math.max(max, area);
  }
  return max;
}


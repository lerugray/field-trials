// Pure pixel-luminance probe for the overworld party focal stack. It mirrors the
// live draw order at the authored 16x16 tile scale and includes the approved CRT
// bloom/mask character. Tests can therefore sweep real seeded terrain without a
// DOM or a browser and gate the marker against its eight local neighbours.

import { TRANSPARENT } from './tileart.js';
import { contrastOutlineShade } from './tiledraw.js';
import { BLOOM_CLASSES, lightLayer } from './lightbudget.js';

const PARTY_OUTER = lightLayer('partyTorch', 'outer');
const PARTY_INNER = lightLayer('partyTorch', 'inner');
export const PARTY_FOCAL = Object.freeze({
  outerRadiusTiles: PARTY_OUTER.radius, outerStrength: PARTY_OUTER.intensity,
  innerRadiusTiles: PARTY_INNER.radius, innerStrength: PARTY_INNER.intensity,
  shadowRxTiles: 0.38, shadowRyTiles: 0.18, shadowStrength: 0.56,
});

function adjacent(grid, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const yy = y + dy, xx = x + dx;
    if (yy >= 0 && yy < grid.length && xx >= 0 && xx < grid[yy].length && grid[yy][xx] !== TRANSPARENT) return true;
  }
  return false;
}

export function relativeLuminance([r, g, b]) {
  const linear = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function shadeLuminances(palettes, scheme, inputLuminances = null) {
  const colors = inputLuminances
    ? inputLuminances.map((luminance) => palettes.luminanceToColor(scheme, luminance))
    : palettes.ramp(scheme);
  return colors.map((color) => relativeLuminance(color.match(/\d+/g).map(Number)));
}

function meanGrid(grid, lumas) {
  let sum = 0, n = 0;
  for (const row of grid) for (const shade of row) {
    if (shade === TRANSPARENT) continue;
    sum += lumas[shade]; n++;
  }
  return n ? sum / n : 0;
}

function addGlow(pixels, cx, cy, radius, strength) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > radius) continue;
    const v = Math.pow(1 - d / radius, 2) * strength;
    pixels[y][x] = Math.min(1, pixels[y][x] + v);
  }
}

function applyCrt(pixels) {
  // The PoC's blurred additive copy is locally approximated by a 3x3 mean. The
  // slot mask is then applied at the live 2-logical-pixel cadence, which becomes
  // the PoC's 3 display pixels at the 1440x900 proof scale.
  const src = pixels.map((row) => row.slice());
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let sum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < 16 && xx >= 0 && xx < 16) { sum += src[yy][xx]; n++; }
    }
    let value = Math.min(1, src[y][x] + (sum / n) * BLOOM_CLASSES.crtBloom.layers[0].intensity);
    if (y % 2 === 1) value *= 0.70;
    if (x % 2 === 1) value *= 0.90;
    pixels[y][x] = value;
  }
}

/**
 * RMS luminance separation between the composed party tile and the mean of its
 * eight surrounding terrain tiles. `treatment:'legacy'` models the rejected live
 * order (sprite, then weak wash); `conformed` models the new value reservation.
 */
export function measurePartyLocalContrast({ ground, neighbours, party, shadeLumas: lumas, partyLumas = lumas, treatment = 'conformed' }) {
  const pixels = ground.map((row) => row.map((shade) => lumas[shade]));
  const groundMean = meanGrid(ground, lumas);
  const outline = contrastOutlineShade(Math.round(ground.flat().reduce((a, b) => a + b, 0) / 256));
  // The superseded icon had no separate focal ramp; only the approved stack
  // reserves the brighter party values against round-1's restrained terrain.
  const focalLumas = treatment === 'legacy' ? lumas : partyLumas;

  if (treatment === 'conformed') {
    // Directional glow and the under-foot dark pool are painted before the icon.
    addGlow(pixels, 8, 5, 16 * PARTY_FOCAL.outerRadiusTiles, PARTY_FOCAL.outerStrength);
    addGlow(pixels, 8, 5, 16 * PARTY_FOCAL.innerRadiusTiles, PARTY_FOCAL.innerStrength);
    for (let y = 9; y < 16; y++) for (let x = 1; x < 15; x++) {
      const d = Math.hypot((x - 8) / 6, (y - 13) / 3);
      if (d <= 1) pixels[y][x] *= 1 - PARTY_FOCAL.shadowStrength * (1 - d * d);
    }
  }

  // Actual 16x16 sprite and its adaptive one-art-pixel silhouette halo.
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const shade = party[y][x];
    if (shade !== TRANSPARENT) pixels[y][x] = focalLumas[shade];
    else if (adjacent(party, x, y)) pixels[y][x] = focalLumas[outline];
  }

  if (treatment === 'legacy') addGlow(pixels, 8, 8, 30, 0.13);
  else {
    // White-hot hood catch remains crisp because it is painted after the pool.
    pixels[4][8] = partyLumas[6]; pixels[4][9] = partyLumas[6];
    pixels[5][8] = partyLumas[6]; pixels[5][9] = partyLumas[6];
  }
  applyCrt(pixels);

  const neighbourMean = neighbours.reduce((sum, grid) => sum + meanGrid(grid, lumas), 0) / neighbours.length;
  // Apply average CRT bloom/mask energy to the flat local surround reference.
  const surround = Math.min(1, neighbourMean * (1 + BLOOM_CLASSES.crtBloom.layers[0].intensity)) * 0.80;
  let squared = 0;
  for (const row of pixels) for (const value of row) squared += (value - surround) ** 2;
  return {
    score: Math.sqrt(squared / 256),
    groundMean,
    neighbourMean,
  };
}

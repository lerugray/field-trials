import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, THEMES } from '../src/render/palette.js';
import {
  applyLightPass, createLightFrame, lightBayerAt, materialFbm, materialRampKey, registerHeroLayer,
  registerLight,
} from '../src/render/light.js';

test('light/material: Bayer and fbm sampling stay fixed in world space while the camera scrolls', () => {
  const noise = materialFbm(20260810, 4);
  for (const [screenX, screenY, cameraX, cameraY] of [[5, 9, 0, 0], [41, 17, 83, 2], [190, 101, 411, 37]]) {
    const worldX = screenX + cameraX; const worldY = screenY + cameraY;
    const shiftedCameraX = cameraX + 13; const shiftedCameraY = cameraY + 7;
    const shiftedScreenX = screenX - 13; const shiftedScreenY = screenY - 7;
    assert.equal(
      lightBayerAt(worldX, worldY),
      lightBayerAt(shiftedScreenX + shiftedCameraX, shiftedScreenY + shiftedCameraY),
      'ordered threshold follows the same world pixel',
    );
    assert.equal(
      noise(worldX * 0.055, worldY * 0.09),
      noise((shiftedScreenX + shiftedCameraX) * 0.055, (shiftedScreenY + shiftedCameraY) * 0.09),
      'fbm follows the same world sample',
    );
    assert.equal(
      materialRampKey(['1', '8', '7', '6'], 0.47, worldX, worldY),
      materialRampKey(['1', '8', '7', '6'], 0.47, shiftedScreenX + shiftedCameraX, shiftedScreenY + shiftedCameraY),
      'ramp result cannot shimmer under camera translation',
    );
  }
});

test('light: every theme defines a palette-keyed rig', () => {
  for (const [id, theme] of Object.entries(THEMES)) {
    assert.ok(theme.lightRig?.vignette, `${id} has a frame-closing vignette`);
    assert.ok(theme.lightRig?.hero, `${id} has a hero material rig`);
    assert.ok(PALETTE[theme.lightRig.hero.ambient], `${id} hero ambient is in-palette`);
    assert.ok(PALETTE[theme.lightRig.hero.tint], `${id} hero tint is in-palette`);
    for (const part of Object.values(theme.lightRig)) {
      if (part.color) assert.ok(PALETTE[part.color], `${id} rig color ${part.color} is in-palette`);
    }
  }
});

test('light: hero conform shades only its alpha mask inside the shared readback', () => {
  const width = 8; const height = 6;
  const original = new Uint8ClampedArray(width * height * 4).fill(255);
  let output;
  const ctx = {
    getImageData() { return { data: new Uint8ClampedArray(original) }; },
    putImageData(image) { output = image.data; },
  };
  const theme = { lightRig: { hero: {
    ambient: '2', tint: 'u', shade: 0.18, grain: 0.12, tintStrength: 0.04, seed: 7,
  } } };
  const frame = createLightFrame(theme, { x: 10, y: 4 }, width, height, false);
  registerHeroLayer(frame, {
    x: 12, y: 6, width: 2, height: 2, alphaMask: new Uint8Array([1, 0, 0, 1]), flip: false,
  });
  const result = applyLightPass(ctx, frame);
  const changed = (x, y) => {
    const i = (y * width + x) * 4;
    return output[i] !== original[i] || output[i + 1] !== original[i + 1] || output[i + 2] !== original[i + 2];
  };
  assert.equal(result.readbacks, 1);
  assert.equal(result.heroPixels, 2);
  assert.equal(changed(2, 2), true);
  assert.equal(changed(3, 3), true);
  assert.equal(changed(3, 2), false, 'transparent hero cell leaves the world untouched');
  assert.equal(changed(0, 0), false, 'outside world pixels remain untouched');

  let litOutput;
  const litContext = {
    getImageData() { return { data: new Uint8ClampedArray(original) }; },
    putImageData(image) { litOutput = image.data; },
  };
  const litFrame = createLightFrame(theme, { x: 10, y: 4 }, width, height, false);
  registerHeroLayer(litFrame, {
    x: 12, y: 6, width: 2, height: 2, alphaMask: new Uint8Array([1, 0, 0, 1]), flip: false,
  });
  registerLight(litFrame, { kind: 'torch', x: 12, y: 6, radius: 5, strength: 0.6, color: 'c' });
  applyLightPass(litContext, litFrame);
  const maskedPixel = (pixels) => pixels.slice((2 * width + 2) * 4, (2 * width + 2) * 4 + 3)
    .reduce((sum, value) => sum + value, 0);
  assert.ok(maskedPixel(litOutput) > maskedPixel(output), 'nearby practical illuminates the conformed hero pixel');
});

function compositorFixture(reduceEffects) {
  const width = 32; const height = 24;
  const original = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < original.length; i += 4) {
    original[i] = 22; original[i + 1] = 24; original[i + 2] = 34; original[i + 3] = 255;
  }
  let gets = 0; let puts = 0; let output;
  const ctx = {
    getImageData() { gets++; return { data: new Uint8ClampedArray(original) }; },
    putImageData(image) { puts++; output = image.data; },
  };
  const theme = { lightRig: {} };
  const frame = createLightFrame(theme, { x: 11, y: 3 }, width, height, reduceEffects);
  registerLight(frame, {
    kind: 'impact', x: 27, y: 13, floorY: 20, radius: 14, strength: 0.8,
    color: 'c', coreColor: '5', life: 8, maxLife: 9,
  });
  const result = applyLightPass(ctx, frame);
  return { gets, puts, output, result, original };
}

test('light: compositor performs one bounded read/write and reduceEffects caps event glow', () => {
  const full = compositorFixture(false);
  const reduced = compositorFixture(true);
  assert.equal(full.gets, 1); assert.equal(full.puts, 1); assert.equal(full.result.readbacks, 1);
  assert.equal(reduced.gets, 1); assert.equal(reduced.puts, 1);
  const energy = ({ output, original }) => output.reduce((sum, value, index) => sum + Math.max(0, value - original[index]), 0);
  assert.ok(energy(full) > 0, 'impact emits into the shared buffer');
  assert.ok(energy(reduced) < energy(full) * 0.35, 'reduce-effects materially gates the flash/glow');
});

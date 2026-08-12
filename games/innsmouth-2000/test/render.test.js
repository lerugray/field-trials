import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tileScreenFaces, edgeMidpoints, bakeTileSprite, buildTileSprites,
  TILE_SPRITE_W, TILE_SPRITE_H,
} from '../src/render.js';
import { makeCamera } from '../src/camera.js';
import { HALF_W, HALF_H, ELEV_STEP } from '../src/geometry.js';
import { RAMP } from '../src/palette.js';
import { DIR } from '../src/tools.js';

// A minimal headless canvas so the sprite baker can run under node --test.
function fakeCanvas(w, h) {
  const ctx = {
    createImageData: (cw, ch) => ({
      width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4),
    }),
    stored: null,
    putImageData(img) { this.stored = img; },
  };
  return { width: w, height: h, getContext: () => ctx };
}

test('tileScreenFaces places a flat tile as a 2:1 diamond', () => {
  const cam = makeCamera({ mapCols: 32, mapRows: 32, viewportW: 800, viewportH: 600, zoom: 1 });
  const f = tileScreenFaces(5, 5, 0, cam);
  // width across (left->right) is twice the height (top->bottom).
  assert.equal(f.right.x - f.left.x, 2 * (f.bottom.y - f.top.y));
  assert.equal(f.right.x - f.left.x, 2 * HALF_W);
  assert.equal(f.wallH, 0);
});

test('elevation raises the tile and grows the wall band', () => {
  const cam = makeCamera({ mapCols: 32, mapRows: 32, viewportW: 800, viewportH: 600, zoom: 1 });
  const flat = tileScreenFaces(5, 5, 0, cam);
  const high = tileScreenFaces(5, 5, 3, cam);
  assert.equal(flat.center.y - high.center.y, 3 * ELEV_STEP); // raised up-screen
  assert.equal(high.wallH, 3 * ELEV_STEP);
  assert.equal(flat.center.x, high.center.x); // no horizontal shift
});

test('zoom scales the tile faces and walls', () => {
  const cam = makeCamera({ mapCols: 32, mapRows: 32, viewportW: 800, viewportH: 600, zoom: 2 });
  const f = tileScreenFaces(5, 5, 2, cam);
  assert.equal(f.right.x - f.left.x, 2 * HALF_W * 2); // diamond doubled
  assert.equal(f.wallH, 2 * ELEV_STEP * 2);
});

test('wall quads connect the top diamond to its dropped edge', () => {
  const cam = makeCamera({ mapCols: 32, mapRows: 32, viewportW: 800, viewportH: 600, zoom: 1 });
  const f = tileScreenFaces(3, 4, 2, cam);
  // left wall: left, bottom, bottom+H, left+H
  assert.deepEqual(f.leftWall[0], f.left);
  assert.deepEqual(f.leftWall[1], f.bottom);
  assert.equal(f.leftWall[2].y, f.bottom.y + f.wallH);
  assert.equal(f.leftWall[3].y, f.left.y + f.wallH);
  // right wall: bottom, right, right+H, bottom+H
  assert.deepEqual(f.rightWall[0], f.bottom);
  assert.deepEqual(f.rightWall[1], f.right);
  assert.equal(f.rightWall[2].y, f.right.y + f.wallH);
});

test('edgeMidpoints sit on the tile edges toward each neighbour', () => {
  const cam = makeCamera({ mapCols: 32, mapRows: 32, viewportW: 800, viewportH: 600, zoom: 1 });
  const f = tileScreenFaces(6, 6, 0, cam);
  const mids = edgeMidpoints(f);
  // Each midpoint is the average of the two corners bounding that edge.
  const avg = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  assert.deepEqual(mids[DIR.SE.bit], avg(f.bottom, f.right));
  assert.deepEqual(mids[DIR.SW.bit], avg(f.bottom, f.left));
  assert.deepEqual(mids[DIR.NW.bit], avg(f.left, f.top));
  assert.deepEqual(mids[DIR.NE.bit], avg(f.top, f.right));
  // Midpoints lie strictly inside the tile's bounding box.
  for (const b of [DIR.SE.bit, DIR.SW.bit, DIR.NW.bit, DIR.NE.bit]) {
    assert.ok(mids[b].x >= f.left.x && mids[b].x <= f.right.x);
    assert.ok(mids[b].y >= f.top.y && mids[b].y <= f.bottom.y);
  }
});

test('sprite dimensions are the tile base size', () => {
  assert.equal(TILE_SPRITE_W, 2 * HALF_W);
  assert.equal(TILE_SPRITE_H, 2 * HALF_H);
});

test('baked sprite is opaque in the diamond and transparent at the corners', () => {
  const cv = bakeTileSprite('grass', fakeCanvas);
  const img = cv.getContext().stored;
  assert.ok(img, 'putImageData was not called');
  const at = (px, py) => img.data[(py * TILE_SPRITE_W + px) * 4 + 3];
  // Center is opaque.
  assert.equal(at(HALF_W, HALF_H), 255);
  // The four bounding-box corners are outside the diamond -> transparent.
  assert.equal(at(0, 0), 0);
  assert.equal(at(TILE_SPRITE_W - 1, 0), 0);
  assert.equal(at(0, TILE_SPRITE_H - 1), 0);
  assert.equal(at(TILE_SPRITE_W - 1, TILE_SPRITE_H - 1), 0);
});

test('baked sprites use only their ramp colours', () => {
  const cv = bakeTileSprite('rock', fakeCanvas);
  const img = cv.getContext().stored;
  const allowed = new Set(RAMP.rock.map((h) => h.toLowerCase()));
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue; // skip transparent
    const hex = '#' + [img.data[i], img.data[i + 1], img.data[i + 2]]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
    assert.ok(allowed.has(hex), `pixel colour ${hex} is not in the rock ramp`);
  }
});

test('buildTileSprites bakes one sprite per ramp', () => {
  const sprites = buildTileSprites(fakeCanvas);
  for (const key of Object.keys(RAMP)) {
    assert.ok(sprites[key], `missing sprite for ${key}`);
  }
});

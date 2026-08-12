import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera, mapWorldBounds, ZOOM_LEVELS } from '../src/camera.js';

test('zoom levels are the three locked powers of two', () => {
  assert.deepEqual(ZOOM_LEVELS, [0.5, 1, 2]);
});

test('default camera centers on the map and uses 1x zoom', () => {
  const cam = makeCamera({ mapCols: 96, mapRows: 96 });
  assert.equal(cam.zoom, 1);
  const b = mapWorldBounds(96, 96);
  assert.equal(cam.cx, (b.minX + b.maxX) / 2);
  assert.equal(cam.cy, (b.minY + b.maxY) / 2);
});

test('screenToWorld is the exact inverse of worldToScreen', () => {
  const cam = makeCamera({ mapCols: 64, mapRows: 64, viewportW: 1280, viewportH: 800, zoom: 2 });
  for (const [wx, wy] of [[0, 0], [100, -50], [-320, 480], [12.5, 7.5]]) {
    const s = cam.worldToScreen(wx, wy);
    const back = cam.screenToWorld(s.x, s.y);
    assert.ok(Math.abs(back.x - wx) < 1e-9, `x round-trip ${back.x} != ${wx}`);
    assert.ok(Math.abs(back.y - wy) < 1e-9, `y round-trip ${back.y} != ${wy}`);
  }
});

test('the world center maps to the viewport center at any zoom', () => {
  for (const z of ZOOM_LEVELS) {
    const cam = makeCamera({ mapCols: 40, mapRows: 40, viewportW: 800, viewportH: 600, zoom: z });
    const s = cam.worldToScreen(cam.cx, cam.cy);
    assert.equal(s.x, 400);
    assert.equal(s.y, 300);
  }
});

test('zoomIn / zoomOut step through the levels and clamp at the ends', () => {
  const cam = makeCamera({ zoom: 0.5 });
  assert.equal(cam.zoom, 0.5);
  cam.zoomOut();
  assert.equal(cam.zoom, 0.5, 'cannot zoom below the lowest level');
  cam.zoomIn();
  assert.equal(cam.zoom, 1);
  cam.zoomIn();
  assert.equal(cam.zoom, 2);
  cam.zoomIn();
  assert.equal(cam.zoom, 2, 'cannot zoom above the highest level');
});

test('setZoom snaps to the nearest allowed level', () => {
  const cam = makeCamera({});
  cam.setZoom(0.7);
  assert.equal(cam.zoom, 0.5);
  cam.setZoom(1.6);
  assert.equal(cam.zoom, 2);
  cam.setZoom(1.1);
  assert.equal(cam.zoom, 1);
});

test('panByScreen moves by delta over zoom and clamps to bounds', () => {
  const cam = makeCamera({ mapCols: 64, mapRows: 64, viewportW: 800, viewportH: 600, zoom: 2 });
  const x0 = cam.cx;
  cam.panByScreen(200, 0); // 200 screen px / zoom 2 = 100 world px
  assert.equal(cam.cx, Math.min(x0 + 100, cam.bounds.maxX));
});

test('the camera center cannot leave the map bounds', () => {
  const cam = makeCamera({ mapCols: 32, mapRows: 32 });
  cam.panTo(1e9, 1e9);
  assert.equal(cam.cx, cam.bounds.maxX);
  assert.equal(cam.cy, cam.bounds.maxY);
  cam.panTo(-1e9, -1e9);
  assert.equal(cam.cx, cam.bounds.minX);
  assert.equal(cam.cy, cam.bounds.minY);
});

test('mapWorldBounds spans the full diamond', () => {
  const b = mapWorldBounds(96, 96);
  // Leftmost is tile (0,95); rightmost is (95,0); bottom is (95,95); top is (0,0).
  assert.equal(b.minX, -(95) * 32);
  assert.equal(b.maxX, 95 * 32);
  assert.equal(b.minY, 0);
  assert.equal(b.maxY, (95 + 95) * 16);
});

test('visibleWorldRect scales inversely with zoom', () => {
  const camFar = makeCamera({ viewportW: 1000, viewportH: 800, zoom: 0.5 });
  const camNear = makeCamera({ viewportW: 1000, viewportH: 800, zoom: 2 });
  const far = camFar.visibleWorldRect();
  const near = camNear.visibleWorldRect();
  const farW = far.right - far.left;
  const nearW = near.right - near.left;
  assert.ok(farW > nearW, 'lower zoom should see more world');
  assert.equal(farW / nearW, 4); // 2 / 0.5
});

test('setViewport updates the projection', () => {
  const cam = makeCamera({ viewportW: 800, viewportH: 600, zoom: 1 });
  cam.setViewport(1440, 900);
  const s = cam.worldToScreen(cam.cx, cam.cy);
  assert.equal(s.x, 720);
  assert.equal(s.y, 450);
});

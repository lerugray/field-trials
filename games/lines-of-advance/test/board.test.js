import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  normalizeZoom,
  zoomFromWheel,
  zoomFromPinch,
  normalizePieceStyle,
  PIECE_STYLES,
  SUPPLY_COVERAGE_MODES,
  nextSupplyCoverageMode,
  supplyCoverageSide
} from '../src/board.js';

test('piece styles expose default plus two render-only variants', () => {
  assert.deepEqual(PIECE_STYLES, ['default', 'nato', 'chess']);
  assert.equal(normalizePieceStyle('nato'), 'nato');
  assert.equal(normalizePieceStyle('chess'), 'chess');
  assert.equal(normalizePieceStyle('unknown'), 'default');
});

test('board zoom defaults to fit and never shrinks below the fitted viewport', () => {
  assert.equal(MIN_ZOOM, 1);
  assert.equal(normalizeZoom(undefined), MIN_ZOOM);
  assert.equal(normalizeZoom(0.5), MIN_ZOOM);
  assert.equal(zoomFromWheel(MIN_ZOOM, 100), MIN_ZOOM);
});

test('wheel zoom is opt-in and bounded', () => {
  assert.equal(zoomFromWheel(MIN_ZOOM, -100), 1.25);
  assert.equal(zoomFromWheel(1.25, 100), MIN_ZOOM);
  assert.equal(zoomFromWheel(MAX_ZOOM, -100), MAX_ZOOM);
});

test('pinch zoom uses distance ratio and shares the fit bounds', () => {
  assert.equal(zoomFromPinch(1, 100, 150), 1.5);
  assert.equal(zoomFromPinch(1.5, 100, 50), MIN_ZOOM);
  assert.equal(zoomFromPinch(2, 100, 200), MAX_ZOOM);
  assert.equal(zoomFromPinch(1.5, 0, 200), 1.5);
});

test('supply coverage cycles off, my side, enemy side, then off', () => {
  assert.deepEqual(SUPPLY_COVERAGE_MODES, ['off', 'my', 'enemy']);
  assert.equal(nextSupplyCoverageMode('off'), 'my');
  assert.equal(nextSupplyCoverageMode('my'), 'enemy');
  assert.equal(nextSupplyCoverageMode('enemy'), 'off');
  assert.equal(supplyCoverageSide('my', 'North'), 'North');
  assert.equal(supplyCoverageSide('enemy', 'North'), 'South');
  assert.equal(supplyCoverageSide('off', 'South'), null);
});

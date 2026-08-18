// Release fix round B4 — provenance opened from pause must return to pause on close.
// Opening it from the title still returns to the title, so the fix is path-aware, not a global swap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createView, showOverlay, backToTitle, togglePause } from '../src/view.js';

test('provenance from the title returns to the title', () => {
  const view = createView({ seed: 'prov-title' });
  assert.equal(view.overlay, 'title');
  showOverlay(view, 'provenance');
  assert.equal(view.overlay, 'provenance');
  backToTitle(view);
  assert.equal(view.overlay, 'title');
});

test('provenance from pause returns to pause', () => {
  const view = createView({ seed: 'prov-pause' });
  view.overlay = null;
  togglePause(view);
  assert.equal(view.overlay, 'pause');
  showOverlay(view, 'provenance');
  assert.equal(view.overlay, 'provenance');
  backToTitle(view);
  assert.equal(view.overlay, 'pause', 'closing provenance from pause ejected to title instead of pause');
});

test('options from the title returns to the title', () => {
  const view = createView({ seed: 'opts-title' });
  showOverlay(view, 'options');
  assert.equal(view.overlay, 'options');
  backToTitle(view);
  assert.equal(view.overlay, 'title');
});

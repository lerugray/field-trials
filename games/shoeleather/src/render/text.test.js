import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, ZoomModel, DocumentReader, DEFAULT_ZOOM_STEPS } from './text.js';

test('wrapText wraps to the column budget', () => {
  const lines = wrapText('the rumpled lieutenant asks one more question', 12);
  for (const l of lines) assert.ok(l.length <= 12, `line too long: "${l}"`);
  assert.equal(lines.join(' '), 'the rumpled lieutenant asks one more question');
});

test('wrapText preserves paragraph breaks', () => {
  const lines = wrapText('one\n\ntwo', 20);
  assert.deepEqual(lines, ['one', '', 'two']);
});

test('wrapText hard-breaks overlong words so nothing clips', () => {
  const lines = wrapText('supercalifragilistic', 5);
  for (const l of lines) assert.ok(l.length <= 5);
  assert.equal(lines.join(''), 'supercalifragilistic');
});

test('wrapText rejects a bad column budget', () => {
  assert.throws(() => wrapText('x', 0), /positive integer/);
});

test('ZoomModel steps within bounds and clamps', () => {
  const z = new ZoomModel();
  assert.equal(z.size(), DEFAULT_ZOOM_STEPS[2]);
  z.zoomOut(); z.zoomOut(); z.zoomOut(); // clamp at min
  assert.equal(z.size(), DEFAULT_ZOOM_STEPS[0]);
  assert.equal(z.canZoomOut(), false);
  while (z.canZoomIn()) z.zoomIn();
  assert.equal(z.size(), DEFAULT_ZOOM_STEPS.at(-1));
  assert.equal(z.canZoomIn(), false);
});

test('ZoomModel reset returns to base and scale reflects size', () => {
  const z = new ZoomModel();
  const base = z.size();
  z.zoomIn();
  assert.ok(z.scale() > 1);
  z.reset();
  assert.equal(z.size(), base);
  assert.equal(z.scale(), 1);
});

test('DocumentReader lays out title then body', () => {
  const doc = new DocumentReader({ id: 'letter', title: 'NOTICE', body: 'pay the debt or else' });
  const lines = doc.layout(40);
  assert.equal(lines[0], 'NOTICE');
  assert.equal(lines[1], ''); // separator
  assert.ok(lines.slice(2).join(' ').includes('pay the debt'));
});

test('DocumentReader requires an id', () => {
  assert.throws(() => new DocumentReader({}), /needs an id/);
});

test('narrower column budget produces more lines (zoom-in effect)', () => {
  const doc = new DocumentReader({ id: 'd', body: 'the ledger shows a payment that was never taped' });
  assert.ok(doc.layout(20).length > doc.layout(60).length);
});

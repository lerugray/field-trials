import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from './scene.js';
import { FocusRing, readingOrder, DEFAULT_KEYMAP } from './focus.js';
import { rect } from './geometry.js';

// Layout: top row (b then a by x), bottom row (c). Reading order = b, a, c.
function scene() {
  return new Scene({ id: 's', hotspots: [
    { id: 'a', bounds: rect(50, 4, 10, 10), label: 'A' },
    { id: 'b', bounds: rect(4, 4, 10, 10), label: 'B' },
    { id: 'c', bounds: rect(4, 80, 10, 10), label: 'C' },
  ] });
}

test('readingOrder is top-to-bottom then left-to-right', () => {
  const s = scene();
  assert.deepEqual(readingOrder(s.hotspots).map((h) => h.id), ['b', 'a', 'c']);
});

test('next cycles through reading order and wraps', () => {
  const ring = new FocusRing(scene());
  assert.equal(ring.focused(), null);
  assert.equal(ring.next().id, 'b');
  assert.equal(ring.next().id, 'a');
  assert.equal(ring.next().id, 'c');
  assert.equal(ring.next().id, 'b'); // wrap
});

test('prev from nothing lands on last, and wraps', () => {
  const ring = new FocusRing(scene());
  assert.equal(ring.prev().id, 'c');
  assert.equal(ring.prev().id, 'a');
  assert.equal(ring.prev().id, 'b');
  assert.equal(ring.prev().id, 'c'); // wrap
});

test('cursorKind follows the focused hotspot verb', () => {
  const s = new Scene({ id: 's', hotspots: [
    { id: 'door', bounds: rect(0, 0, 10, 10), label: 'Door', kind: 'exit' },
  ] });
  const ring = new FocusRing(s);
  assert.equal(ring.cursorKind(), 'default');
  ring.next();
  assert.equal(ring.cursorKind(), 'exit');
});

test('focusAt sets focus from a point and clears off-hotspot', () => {
  const ring = new FocusRing(scene());
  assert.equal(ring.focusAt(9, 9).id, 'b');
  assert.equal(ring.index, 0);
  assert.equal(ring.focusAt(500, 500), null);
  assert.equal(ring.index, -1);
});

test('keyboard and mouse share one focus: hover then cycle continues from there', () => {
  const ring = new FocusRing(scene());
  ring.focusAt(54, 9); // hover 'a'
  assert.equal(ring.focused().id, 'a');
  assert.equal(ring.next().id, 'c'); // continues in reading order after 'a'
});

test('focusById jumps to a named hotspot', () => {
  const ring = new FocusRing(scene());
  assert.equal(ring.focusById('c').id, 'c');
  assert.equal(ring.focusById('missing'), null);
});

test('empty scene: next/prev are safe no-ops', () => {
  const ring = new FocusRing(new Scene({ id: 'void' }));
  assert.equal(ring.next(), null);
  assert.equal(ring.prev(), null);
  assert.equal(ring.cursorKind(), 'default');
});

test('DEFAULT_KEYMAP binds cycling and select for the keyboard path', () => {
  assert.equal(DEFAULT_KEYMAP.ArrowRight, 'focus-next');
  assert.equal(DEFAULT_KEYMAP.ArrowLeft, 'focus-prev');
  assert.equal(DEFAULT_KEYMAP.Enter, 'select');
  assert.equal(DEFAULT_KEYMAP.Tab, 'focus-next');
});

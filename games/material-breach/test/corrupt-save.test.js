// Release fix round B5 — a malformed save must surface a loud notice instead of silently booting to
// a fresh title. The persistence layer already returns a reason; the caller must not drop it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/persistence.js';
import { createView, tryResume, corruptSaveNoticeFor, CORRUPT_SAVE_NOTICE } from '../src/view.js';
import { render } from '../src/render.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

function recordingCtx(widthFactor = 5) {
  const calls = [];
  const t = { font: '11px serif' };
  return {
    calls,
    ctx: new Proxy(
      {},
      {
        get(_target, p) {
          if (p === 'measureText') return (str) => ({ width: String(str).length * widthFactor });
          if (p === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          if (p === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          if (p === 'fillText') return (text, x, y) => calls.push({ text: String(text), x, y });
          if (p === 'font') return t.font;
          return () => {};
        },
        set(_target, p, v) {
          if (p === 'font') t.font = v;
          return true;
        },
      },
    ),
  };
}

test('a tampered save returns a readable reason instead of a silent miss', () => {
  const store = memStorage();
  store.setItem(SAVE_KEY, 'this is not valid json');
  const view = createView({ seed: 'corrupt' });
  view.storage = store;
  const res = tryResume(view);
  assert.equal(res.ok, false);
  assert.match(res.reason, /unreadable|JSON|parse/i);
});

test('a missing save is not treated as corrupt', () => {
  const view = createView({ seed: 'missing' });
  view.storage = memStorage();
  const res = tryResume(view);
  assert.equal(res.ok, false);
  assert.equal(res.reason, undefined);
});

test('the title renders the corrupt-save notice in-register', () => {
  const view = createView({ seed: 'corrupt-render' });
  view.saveNotice = CORRUPT_SAVE_NOTICE;
  const r = recordingCtx(3);
  render(r.ctx, view);
  const text = r.calls.map((c) => c.text).join(' ');
  assert.match(text, /Save notice/);
  assert.match(text, /unreadable/);
});

test('corruptSaveNoticeFor never returns raw parser output', () => {
  const raw = "Expected property name or '}' in JSON at position 1 (line 1 column 2)";
  const notice = corruptSaveNoticeFor(raw);
  assert.equal(notice, CORRUPT_SAVE_NOTICE);
  assert.ok(!notice.includes('Expected property name'), 'raw exception text leaked into player-facing notice');
});

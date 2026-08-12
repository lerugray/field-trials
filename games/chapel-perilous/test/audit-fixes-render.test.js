// Post-audit mechanical render probes: the Manual must expose its wrapped body
// through the real keyboard conduit, and an immediate terminal wall must retain
// the surrounding perspective faces instead of overpainting the full viewport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFP } from '../src/engine/fprender.js';

function recordingCtx(textSink = []) {
  const noop = () => {};
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', filter: 'none', font: '14px monospace', textAlign: 'left',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop, drawImage: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop, arc: noop,
    fillText: (t) => textSink.push(String(t)), strokeText: (t) => textSink.push(String(t)),
    measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  };
}

async function bootHeadless(sink) {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => recordingCtx(sink), addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {} };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)),
  };
  global.localStorage = { getItem: (k) => (k === 'chp-nature-seen' ? '1' : null), setItem: () => {} };
  return boot();
}

function teardown() {
  delete global.window;
  delete global.document;
  delete global.localStorage;
}

test('Manual overlay wraps prose and W/S reaches the final operation through the real input conduit', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  const press = (key) => api.onKey({ key, preventDefault() {} });
  try {
    api.renderMode('overworld');
    sink.length = 0;
    press('h');
    for (let i = 0; i < 24; i++) press('s');
    const shown = sink.join('\n');
    assert.match(shown, /You found the manual/);
    assert.match(shown, /Operation 5 — Terminal Audit/);
    assert.match(shown, /here, unconfirmed either way/);
    assert.ok(!sink.some((line) => /teaches:.*…/.test(line)), 'teaching prose must never hard-truncate');
    assert.doesNotThrow(() => press('w'), 'W scrolls back up');
    assert.doesNotThrow(() => press('Escape'), 'Escape closes the reader');

    // Operation 1 starts at (4,11). West one tile to (3,11), then face south:
    // (3,12) is authored wall. The bump must paint the punctuated cue as its own
    // console line through the real crawl input/render path.
    api.renderMode('dungeon');
    press('a');
    press('w');
    press('a');
    sink.length = 0;
    press('w');
    assert.ok(sink.includes('the way is shut.'), 'blocked wall cue is a visible, punctuated line');
  } finally {
    teardown();
  }
});

test('an immediate terminal wall is inset at corridor depth, not a full-viewport paint', () => {
  const polygons = [];
  let path = [];
  const ctx = recordingCtx();
  ctx.beginPath = () => { path = []; };
  ctx.moveTo = (x, y) => { path.push([x, y]); };
  ctx.lineTo = (x, y) => { path.push([x, y]); };
  ctx.fill = () => { if (path.length) polygons.push(path.slice()); };

  const dungeon = { seed: 1, floorAt: (x, y) => x === 0 && y === 0 };
  const crawl = { x: 0, y: 0, facing: 'N' };
  const register = {
    pattern: 'none', wallNear: 5, wallFar: 1, ceil: 2, floor: 3,
    edge: false, edgeShade: 1, edgeWidth: 1, floorLines: false, accent: 4,
  };
  renderFP(ctx, 416, 444, { dungeon, crawl, register }, String);

  assert.equal(polygons.length, 5, 'ceiling, floor, two side faces, and the terminal wall are painted');
  const terminal = polygons.at(-1);
  const xs = terminal.map(([x]) => x);
  const ys = terminal.map(([, y]) => y);
  assert.deepEqual(
    { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) },
    { left: 104, right: 312, top: 111, bottom: 333 },
    'the wall occupies the far edge of the first perspective slice',
  );
});

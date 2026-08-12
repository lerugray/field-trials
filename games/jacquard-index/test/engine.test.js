import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/engine/input.js';
import { DebugLog, LEVELS } from '../src/engine/debuglog.js';
import { App } from '../src/engine/app.js';

// ---- Input ----------------------------------------------------------------

test('Input tracks held keys and edge presses, draining once per frame', () => {
  const inp = new Input();
  inp.pressKey('Enter');
  assert.ok(inp.isDown('Enter'));
  const f1 = inp.drainFrame();
  assert.deepEqual(f1.pressedKeys, ['Enter']);
  // Still held, but no longer a fresh press next frame.
  const f2 = inp.drainFrame();
  assert.deepEqual(f2.pressedKeys, []);
  assert.ok(inp.isDown('Enter'));
  inp.releaseKey('Enter');
  assert.ok(!inp.isDown('Enter'));
  assert.deepEqual(inp.drainFrame().releasedKeys, ['Enter']);
});

test('Input does not double-count a key already held', () => {
  const inp = new Input();
  inp.pressKey('KeyX');
  inp.pressKey('KeyX');
  assert.deepEqual(inp.drainFrame().pressedKeys, ['KeyX']);
});

test('Input pointer mapping and releaseAll clear phantom holds', () => {
  const inp = new Input();
  inp.movePointer(12, 34, true);
  assert.deepEqual([inp.pointer.x, inp.pointer.y, inp.pointer.inside], [12, 34, true]);
  inp.pressButton(0);
  inp.pressKey('KeyA');
  inp.releaseAll();
  assert.ok(!inp.isButtonDown(0));
  assert.ok(!inp.isDown('KeyA'));
});

// ---- DebugLog -------------------------------------------------------------

test('DebugLog records levels and counts errors', () => {
  const log = new DebugLog();
  log.info('boot');
  assert.ok(!log.hasErrors());
  log.error('boom', 100);
  assert.ok(log.hasErrors());
  assert.equal(log.errorCount, 1);
  assert.match(log.toText(), /ERROR {2}boom/);
});

test('DebugLog ring buffer caps entries', () => {
  const log = new DebugLog(3);
  for (let i = 0; i < 10; i++) log.info(`m${i}`);
  assert.equal(log.entries.length, 3);
  assert.equal(log.entries[0].message, 'm7');
});

test('DebugLog recent() is most-recent-first', () => {
  const log = new DebugLog();
  log.info('a'); log.info('b'); log.info('c');
  assert.deepEqual(log.recent(2).map((e) => e.message), ['c', 'b']);
});

// ---- App loop -------------------------------------------------------------

test('App steps the scene, advances time, and drains input', () => {
  const app = new App(64, 36);
  const seen = [];
  app.setScene({
    enter: (a) => seen.push(['enter', a.elapsed]),
    update: (a, dt, frame) => seen.push(['update', dt, frame.pressedKeys.slice()]),
    render: (a, fb) => fb.clear(1, 2, 3, 255),
  });
  app.input.pressKey('Enter');
  app.step(16);
  app.render();
  assert.equal(app.elapsed, 16);
  assert.equal(app.frameCount, 1);
  assert.deepEqual(seen[0], ['enter', 0]);
  assert.deepEqual(seen[1], ['update', 16, ['Enter']]);
  assert.deepEqual(app.fb.getPixel(0, 0), [1, 2, 3, 255]);
});

test('App catches scene errors loudly instead of throwing', () => {
  const app = new App(32, 32);
  app.setScene({
    update: () => { throw new Error('scene blew up'); },
    render: () => { throw new Error('render blew up'); },
  });
  assert.doesNotThrow(() => { app.step(16); app.render(); });
  assert.ok(app.log.hasErrors());
  assert.match(app.log.toText(), /scene blew up/);
  assert.match(app.log.toText(), /render blew up/);
});

test('App render paints the fault overlay when errors exist', () => {
  const app = new App(120, 60);
  app.setScene({ render: (a, fb) => fb.clear(20, 20, 20, 255) });
  // No errors: top strip stays the scene color.
  app.render();
  assert.deepEqual(app.fb.getPixel(2, 1), [20, 20, 20, 255]);
  // Inject an error: the overlay's madder top border appears.
  app.log.error('test fault');
  app.render();
  const top = app.fb.getPixel(2, 0);
  assert.ok(top[0] > 120 && top[1] < 90, `expected madder border, got ${top}`);
});

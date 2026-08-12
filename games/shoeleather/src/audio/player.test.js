import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HouseBandPlayer, HouseBandController } from './player.js';

// A mock AudioContext that records the nodes and scheduling the player creates.
function mockCtx() {
  const log = { osc: [], gain: 0, noise: 0, starts: [], sources: [], disconnects: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() { log.disconnects++; }, ...extra });
  const source = (extra = {}) => {
    const s = node({
      scheduled: false, stoppedNow: false, onended: null,
      start(t) { this.scheduled = true; log.starts.push(t); },
      stop(t) { if (t <= ctx.currentTime) this.stoppedNow = true; },
      ...extra,
    });
    log.sources.push(s);
    return s;
  };
  const ctx = {
    currentTime: 0, sampleRate: 44100, destination: node(),
    state: 'suspended',
    resume() { this.state = 'running'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
    createGain() { log.gain++; return node({ gain: param() }); },
    createOscillator() { const o = source({ type: 'sine', frequency: param() }); log.osc.push(o); return o; },
    createBufferSource() { return source({ buffer: null }); },
    createBiquadFilter() { return node({ type: '', frequency: param(), Q: param() }); },
    createBuffer(ch, len) { log.noise++; return { getChannelData: () => new Float32Array(len) }; },
    _log: log,
  };
  return ctx;
}

test('with no context the player is an inert no-op (loud-failure safe)', () => {
  const p = new HouseBandPlayer(null);
  assert.equal(p.available(), false);
  assert.equal(p.start(), false);
  assert.doesNotThrow(() => p.stop());
});

test('start schedules a batch of voice nodes on the graph', () => {
  const ctx = mockCtx();
  const p = new HouseBandPlayer(ctx, { bars: 4 });
  assert.ok(p.start());
  p.stop(); // prevent the loop timer
  assert.ok(ctx._log.osc.length > 0, 'expected oscillator voices scheduled');
  assert.ok(ctx._log.gain > 0, 'expected gain envelopes');
  assert.ok(ctx._log.starts.length > 0, 'expected node start times');
});

test('brushed kit uses a noise buffer', () => {
  const ctx = mockCtx();
  const p = new HouseBandPlayer(ctx, { bars: 1 });
  p.start(); p.stop();
  assert.ok(ctx._log.noise >= 1, 'expected a noise buffer for the brushed kit');
});

test('stop halts and start is idempotent while playing', () => {
  const ctx = mockCtx();
  const p = new HouseBandPlayer(ctx, { bars: 1 });
  assert.ok(p.start());
  assert.equal(p.start(), false); // already playing
  p.stop();
  assert.equal(p.playing, false);
});

test('toggle OFF tears down every active or scheduled audio source and releases the instance', () => {
  const ctx = mockCtx();
  const controller = new HouseBandController(() => new HouseBandPlayer(ctx, { bars: 1 }));
  assert.equal(controller.toggle(), true);
  assert.ok(ctx._log.sources.some((source) => source.scheduled));
  assert.equal(controller.toggle(), false);
  assert.equal(controller.instance, null);
  assert.equal(ctx.state, 'closed');
  assert.ok(ctx._log.sources.every((source) => source.stoppedNow));
  assert.ok(ctx._log.disconnects > 0);
});

test('rapid double and triple toggling never leaves more than one running score instance', () => {
  const contexts = [];
  const controller = new HouseBandController(() => {
    const ctx = mockCtx(); contexts.push(ctx); return new HouseBandPlayer(ctx, { bars: 1 });
  });
  for (let i = 0; i < 9; i++) {
    controller.toggle();
    const liveContexts = contexts.filter((ctx) => ctx.state === 'running');
    assert.ok(controller.runningCount() <= 1);
    assert.ok(liveContexts.length <= 1);
  }
  controller.stop();
});

test('score lifecycle on/off/on ends with exactly one clean running instance', () => {
  const contexts = [];
  const controller = new HouseBandController(() => {
    const ctx = mockCtx(); contexts.push(ctx); return new HouseBandPlayer(ctx, { bars: 1 });
  });
  assert.equal(controller.toggle(), true);
  const first = controller.instance;
  assert.equal(controller.toggle(), false);
  assert.equal(first.activeSourceCount(), 0);
  assert.equal(controller.toggle(), true);
  assert.notEqual(controller.instance, first);
  assert.equal(controller.runningCount(), 1);
  assert.equal(contexts.filter((ctx) => ctx.state === 'running').length, 1);
  controller.stop();
});

test('empirical acceptance: scheduling three passes yields three non-identical event sequences', () => {
  const p = new HouseBandPlayer(mockCtx(), { bars: 8, seed: 20260811 });
  const reports = [p.schedulePass(0), p.schedulePass(100), p.schedulePass(200)];
  const signatures = reports.map((r) => JSON.stringify(r.events.map((e) => [e.voice, +e.t.toFixed(4), +e.freq.toFixed(2), +e.gain.toFixed(3)])));
  assert.equal(new Set(signatures).size, 3);
  assert.deepEqual(reports.map((r) => r.passIndex), [0, 1, 2]);
});

test('empirical acceptance: transport and modulation phases meet continuously at pass seams', () => {
  const p = new HouseBandPlayer(mockCtx(), { bars: 8, seed: 991 });
  const a = p.schedulePass(0), b = p.schedulePass(a.loopLen), c = p.schedulePass(a.loopLen * 2);
  assert.equal(a.transportStart + a.loopLen, b.transportStart);
  assert.equal(b.transportStart + b.loopLen, c.transportStart);
  assert.deepEqual(a.modulationEnd, b.modulationStart);
  assert.deepEqual(b.modulationEnd, c.modulationStart);
  assert.notDeepEqual(b.modulationStart, a.modulationStart, 'flutter phase must not reset at a seam');
});

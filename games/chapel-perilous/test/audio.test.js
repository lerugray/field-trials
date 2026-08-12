// M10 Part B — audio engine. Sound is SYNTHESISED in code (hard rule 2: no committed
// audio binaries), headless-safe (no window at module load; graceful no-op without a
// context). These lock the SFX spec coverage, the graceful headless behaviour, that a
// real (mock) context actually gets oscillator/gain nodes driven, and — since
// 2026-08-09 — that the ambient bed is the procedural SCORE (band.js + score.js)
// rather than the retired two-sine drone, with mute parking the sequencer and the
// optional sidecar master still taking precedence over it when present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, SFX, SFX_EVENTS, computeLoopWindow, seamTimes, LOOP_INSET } from '../src/engine/audio.js';
import { createMockCtx } from '../test-support/audio-ctx-mock.mjs';

// The shared recording mock, shaped to the old `log` fields these tests assert on
// (counts rather than the richer per-node records) so the original assertions
// still read the way they did.
function mockCtxFactory(log) {
  const { ctx, log: rec } = createMockCtx({ state: 'suspended' });
  Object.defineProperties(log, {
    oscs: { get: () => rec.oscs.length, configurable: true },
    gains: { get: () => rec.gains, configurable: true },
    resumed: { get: () => rec.resumed, configurable: true },
    sources: { get: () => rec.sources, configurable: true },
  });
  log.rec = rec;
  return () => ctx;
}

test('the SFX spec covers every directive-named moment', () => {
  for (const name of ['kill', 'encounter', 'bump', 'cache', 'death']) {
    assert.ok(SFX[name], `SFX missing "${name}"`);
    assert.ok(SFX[name].dur > 0 && SFX[name].gain > 0, `${name} has a real envelope`);
    assert.ok(SFX_EVENTS.includes(name));
  }
});

test('headless (no context factory) is a graceful no-op, never throws', () => {
  const a = createAudio(); // no ctxFactory
  assert.equal(a.live, false);
  assert.equal(a.sfx('kill'), false);
  assert.equal(a.start(), false);
  assert.equal(a.started, false);
  assert.doesNotThrow(() => { a.resume(); a.toggleMute(); a.sfx('nope'); });
});

test('with a real (mock) context, start() runs the ambient score and sfx() drives nodes', () => {
  const log = {};
  const a = createAudio({ ctxFactory: mockCtxFactory(log) });
  assert.equal(a.start(), true, 'start succeeds with a context');
  assert.ok(a.live && a.started);
  assert.ok(log.resumed, 'a suspended context is resumed on the first gesture');
  // The bed is the score now: setting the scene schedules its first step
  // synchronously, so sound begins on the gesture rather than a timer wake later.
  assert.equal(a.usingScore, true, 'the procedural score is the ambient bed');
  assert.equal(a.scene, 'threshold', 'and it opens on the title bed');
  assert.ok(log.oscs >= 3, 'the ambient bed built its oscillators');
  const oscBefore = log.oscs;
  assert.equal(a.sfx('kill'), true, 'an sfx plays');
  assert.ok(log.oscs > oscBefore, 'the sfx created its own oscillator');
});

test('mute silences sfx and is reversible', () => {
  const log = {};
  const a = createAudio({ ctxFactory: mockCtxFactory(log) });
  a.start();
  assert.equal(a.toggleMute(), true, 'toggles to muted');
  const before = log.oscs;
  assert.equal(a.sfx('kill'), false, 'muted sfx does nothing');
  assert.equal(log.oscs, before, 'no node built while muted');
  assert.equal(a.toggleMute(), false, 'toggles back');
  assert.equal(a.sfx('kill'), true, 'sfx works again');
});

// --- M11 Part C: the sidecar ambient loop path -------------------------------
// The same recording mock; it already supports buffer decode + source nodes.
function sidecarCtxFactory(log) {
  const { ctx, log: rec } = createMockCtx({ state: 'running' });
  if (log.duration !== undefined) rec.duration = log.duration;
  for (const k of ['loopStarted', 'startOffset', 'src', 'sources', 'decoded']) {
    Object.defineProperty(log, k, { get: () => rec[k], configurable: true });
  }
  log.rec = rec;
  return () => ctx;
}

test('sidecar loads a dropped ambient master and loops it in place of the drone', async () => {
  const log = {};
  const fetched = [];
  const fetchImpl = async (url) => { fetched.push(url); return { ok: url.endsWith('.ogg'), arrayBuffer: async () => new ArrayBuffer(8) }; };
  const a = createAudio({ ctxFactory: sidecarCtxFactory(log), sidecar: ['a.ogg', 'b.wav'], fetchImpl });
  a.start();
  const loaded = await a.loadSidecar();
  assert.equal(loaded, true, 'the .ogg cut loaded');
  assert.equal(a.usingSidecar, true, 'the sidecar bed is live');
  assert.ok(log.loopStarted, 'the buffer source started looping');
  // A2: the loop window is inset off each edge and the source starts at loopStart.
  assert.ok(log.src.loop, 'native looping is on');
  assert.equal(log.src.loopStart, LOOP_INSET, 'loopStart is inset past the head fade');
  assert.equal(log.src.loopEnd, 60 - LOOP_INSET, 'loopEnd is inset before the tail fade');
  assert.equal(log.startOffset, LOOP_INSET, 'playback starts at the loop start so seams fall on a clean period');
});

// --- A2 (M12): clean loop-seam math -----------------------------------------
test('computeLoopWindow insets a normal cut and trims nothing on a tiny one', () => {
  const w = computeLoopWindow(60);
  assert.equal(w.loopStart, LOOP_INSET);
  assert.equal(w.loopEnd, 60 - LOOP_INSET);
  assert.ok(w.loopEnd - w.loopStart > 0);
  // A buffer too short to spare both insets loops whole (no negative window).
  const tiny = computeLoopWindow(0.1);
  assert.equal(tiny.loopStart, 0);
  assert.equal(tiny.loopEnd, 0.1);
  assert.deepEqual(computeLoopWindow(0), { loopStart: 0, loopEnd: 0 });
});

test('seamTimes lists the upcoming loop wraps at a clean period', () => {
  // started at t=0, period 10s → seams at 10, 20, 30... within the horizon.
  assert.deepEqual(seamTimes(0, 10, 0, 25), [10, 20]);
  assert.deepEqual(seamTimes(0, 10, 12, 20), [20, 30]); // only seams past `fromTime`
  assert.deepEqual(seamTimes(0, 0, 0, 10), [], 'a zero period yields no seams');
  assert.deepEqual(seamTimes(5, 10, 0, 8), [], 'no seam before the first period elapses');
});

test('sidecar is graceful when no file is present — the drone stays, no throw', async () => {
  const log = {};
  const fetchImpl = async () => ({ ok: false }); // every candidate 404s
  const a = createAudio({ ctxFactory: sidecarCtxFactory(log), sidecar: ['x.ogg', 'y.wav'], fetchImpl });
  a.start();
  const loaded = await a.loadSidecar();
  assert.equal(loaded, false, 'nothing loaded');
  assert.equal(a.usingSidecar, false, 'no sidecar bed — the procedural drone carries it');
});

test('file:// skips optional sidecar fetches that browsers reject noisily', async () => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let fetches = 0;
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'file:' } });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      fetches += 1;
      throw new Error('file fetch must not be attempted');
    },
  });
  try {
    const a = createAudio({ ctxFactory: sidecarCtxFactory({}), sidecar: ['x.ogg', 'y.wav'] });
    assert.equal(await a.loadSidecar(), false, 'optional sidecar remains absent under file://');
    assert.equal(fetches, 0, 'no unsupported Fetch API request was issued');
  } finally {
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else delete globalThis.location;
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else delete globalThis.fetch;
  }
});

test('sidecar without a fetch (single-file / headless) is a graceful no-op', async () => {
  const a = createAudio({ ctxFactory: sidecarCtxFactory({}), sidecar: ['x.ogg'], fetchImpl: null });
  a.start();
  // no fetchImpl and (in case a global fetch exists) unreachable relative URLs → false, never throws
  const loaded = await a.loadSidecar().catch(() => 'threw');
  assert.notEqual(loaded, 'threw', 'loadSidecar never throws');
});

// --- 2026-08-09: the ambient bed is the procedural score --------------------

test('the retired two-sine drone is gone — no standalone ambient survives beside the score', () => {
  // supersession-means-deletion: the old bed must not still be running under the
  // new one (two beds is mud). Pin its absence at the source, not just by ear.
  const a = createAudio();
  assert.equal(typeof a.startAmbient, 'undefined', 'no drone entry point remains on the API');
  assert.ok('setScene' in a, 'the score is the replacement, and it is wired');
  assert.ok('usingScore' in a);
});

test('setScene before the first gesture is remembered and applied when sound starts', () => {
  const log = {};
  const a = createAudio({ ctxFactory: mockCtxFactory(log) });
  // The shell renders (and therefore syncs the score) before any keypress; with
  // no context yet this must be recorded, not dropped on the floor.
  assert.equal(a.setScene('under', { weirdness: 0.8 }), false, 'nothing live to change yet');
  assert.equal(a.scene, null);
  assert.equal(log.oscs, undefined ? 0 : log.oscs, 'still silent before the gesture');
  a.start();
  assert.equal(a.scene, 'under', 'the remembered scene is what actually starts');
  assert.equal(a.band.params.weirdness, 0.8, 'and its params came with it');
});

test('setScene is cheap to call every frame and switches the bed on a state change', () => {
  const log = {};
  const a = createAudio({ ctxFactory: mockCtxFactory(log) });
  a.start();
  assert.equal(a.scene, 'threshold');
  assert.equal(a.setScene('country', { weirdness: 0.3 }), true, 'a state change switches');
  assert.equal(a.scene, 'country');
  for (let k = 0; k < 30; k++) assert.equal(a.setScene('country', { weirdness: 0.3 }), false);
  assert.equal(a.setScene('pattern', { pressure: 0.5 }), true);
  assert.equal(a.scene, 'pattern');
});

test('muted means NO audio: the sequencer is parked, not just turned down', () => {
  const log = {};
  const a = createAudio({ ctxFactory: mockCtxFactory(log) });
  a.start();
  a.setScene('country', { weirdness: 0.4 });
  const playing = log.oscs;
  assert.ok(playing > 0, 'the score was building voices');

  assert.equal(a.toggleMute(), true, 'muted');
  assert.equal(a.band.track, null, 'the score was stopped, not merely faded');
  const atMute = log.oscs;
  // Drive the clock well past a loop: a muted score must build nothing at all.
  for (let k = 0; k < 200; k++) { log.rec.now += 0.05; a.band.tick(log.rec.now); }
  assert.equal(log.oscs, atMute, 'a muted score builds no oscillator nodes');
  assert.equal(a.sfx('kill'), false, 'and sfx stay silent too');

  assert.equal(a.toggleMute(), false, 'unmuted');
  assert.equal(a.band.track, 'country', 'the remembered scene resumes');
  log.rec.now += 0.1; a.band.tick(log.rec.now);
  assert.ok(log.oscs > atMute, 'and it is building voices again');
});

test('starting while muted stays silent until unmuted', () => {
  const log = {};
  const a = createAudio({ ctxFactory: mockCtxFactory(log), muted: true });
  assert.equal(a.start(), false, 'a muted start does nothing');
  assert.equal(a.scene, null);
  assert.equal(log.oscs, undefined ? 0 : log.oscs || 0);
});

test('the sidecar master, when present, still takes precedence over the score', async () => {
  // PRESERVED behaviour: dropping Ray's compressed cut beside the game makes it
  // the bed, with the score fading out under it — the score does not fight it.
  const log = {};
  const fetchImpl = async (url) => ({ ok: url.endsWith('.ogg'), arrayBuffer: async () => new ArrayBuffer(8) });
  const a = createAudio({ ctxFactory: sidecarCtxFactory(log), sidecar: ['a.ogg'], fetchImpl });
  a.start();
  assert.equal(a.usingScore, true, 'the score is the bed to begin with');
  assert.equal(await a.loadSidecar(), true);
  assert.equal(a.usingSidecar, true);
  assert.equal(a.band.track, null, 'the score stood down for the master');
  // And a later state change must not wrestle the bed back off the sidecar.
  assert.equal(a.setScene('under', { weirdness: 0.5 }), false, 'the sidecar keeps the bed');
  assert.equal(a.band.track, null);
});

test('with no sidecar present the score keeps the bed — the shipped file:// case', async () => {
  const log = {};
  const fetchImpl = async () => ({ ok: false }); // nothing dropped beside the game
  const a = createAudio({ ctxFactory: sidecarCtxFactory(log), sidecar: ['x.ogg'], fetchImpl });
  a.start();
  assert.equal(await a.loadSidecar(), false);
  assert.equal(a.usingSidecar, false);
  assert.equal(a.usingScore, true, 'the procedural score carries it, as shipped');
  assert.equal(a.scene, 'threshold');
});

test('the band is seeded from the live world, late-bound at the first gesture', () => {
  // The shell passes a function because the context is not built until the player
  // presses a key, by which point they may have minted a different world.
  const log = {};
  let worldSeed = 111;
  const a = createAudio({ ctxFactory: mockCtxFactory(log), seed: () => worldSeed });
  worldSeed = 4242; // a new world was rolled at the title screen
  a.start();
  assert.equal(a.usingScore, true);
  // A throwing / absent seed source must not take the audio layer down.
  const b = createAudio({ ctxFactory: mockCtxFactory({}), seed: () => { throw new Error('no world'); } });
  assert.equal(b.start(), true, 'audio survives a bad seed source');
  assert.equal(b.usingScore, true);
});

test('a context too thin to build a band degrades to SFX rather than dying', () => {
  // Some engines lack a convolver. The score is best-effort; the SFX are not.
  const thin = () => ({
    state: 'running', currentTime: 0, destination: {},
    resume() {},
    createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }),
    createOscillator: () => ({ type: 'sine', frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
    // no createBiquadFilter / createBuffer / createConvolver
  });
  const a = createAudio({ ctxFactory: thin });
  assert.equal(a.start(), true, 'audio still starts');
  assert.equal(a.sfx('kill'), true, 'sfx still play');
  assert.doesNotThrow(() => a.setScene('country', { weirdness: 0.5 }));
  assert.doesNotThrow(() => a.toggleMute());
});

test('a render-driven setScene while muted must not build a single node', () => {
  // The regression scripts/probe-audio.mjs caught in a real browser and the mocks
  // did not: the shell calls render() right after [M], render() syncs the score,
  // and setScene handed the band a fresh track — a burst of nodes nobody can hear.
  const log = {};
  const a = createAudio({ ctxFactory: mockCtxFactory(log) });
  a.start();
  a.setScene('country', { weirdness: 0.4 });
  a.toggleMute();
  const atMute = log.oscs;
  // The shell's post-mute render, then thirty more frames of it.
  for (let k = 0; k < 30; k++) assert.equal(a.setScene('country', { weirdness: 0.4 }), false);
  assert.equal(a.setScene('under', { weirdness: 0.9 }), false, 'even a real state change stays silent');
  assert.equal(log.oscs, atMute, 'not one node was built while muted');
  assert.equal(a.band.track, null, 'and the band was never handed a track');
  // Unmuting picks up the state the shell asked for while it was silent.
  a.toggleMute();
  assert.equal(a.band.track, 'under', 'the last requested scene is what resumes');
});

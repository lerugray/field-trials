// node --test — M3 action-legibility AUDIBLE hooks. Headless-safe (silent no-op with no
// AudioContext); with an injected stub context, world event flags trigger synthesized
// voices. No audio files, no wall-clock in the sim path (band lives in src/engine). No WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx } from '../src/engine/sfx.js';

// A permissive stub AudioContext sufficient for band.js (which is itself stub-tolerant).
function stubCtx() {
  let oscCount = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, gain: param(), frequency: param(), detune: param(), Q: param(), type: 'sine', start() {}, stop() {}, ...extra });
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running', destination: node(),
    createGain: () => node(), createBiquadFilter: () => node(),
    createOscillator: () => { oscCount++; return node(); },
    createBufferSource: () => node({ buffer: null, loop: false }),
    createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }),
    createConvolver: () => node({ buffer: null }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    resume() {},
  };
  return { ctx, oscs: () => oscCount };
}

function fakeWorld(over = {}) {
  return {
    player: { jumpedThisTick: false, jumpChain: 0 },
    enemies: [{ boss: false }],
    stompedThisTick: -1, killedThisTick: -1, damagedThisTick: false,
    sparkCollectedThisTick: 0, pipGainedThisTick: false,
    fireworkFiredThisTick: false, fireworkHitThisTick: -1,
    podCollectedThisTick: -1, exitOpenedThisTick: false,
    bossDefeatedThisTick: false, netTollThisTick: false, diedThisTick: false,
    stompChain: 0, ...over,
  };
}

test('headless (no AudioContext): enable() is false and triggers are silent no-ops', () => {
  const sfx = createSfx({ seed: 1 });
  assert.equal(sfx.enable(), false, 'no AudioContext → not enabled');
  assert.equal(sfx.enabled, false);
  // Must never throw even when disabled.
  sfx.stomp(3); sfx.hit(); sfx.death();
  sfx.fromWorld(fakeWorld({ diedThisTick: true }));
  assert.ok(true, 'no throw while disabled');
});

test('with a stub context, a stomp event synthesizes voices', () => {
  const { ctx, oscs } = stubCtx();
  const sfx = createSfx({ seed: 1, ctx });
  assert.equal(sfx.enable(), true, 'enabled with injected ctx');
  const before = oscs();
  sfx.fromWorld(fakeWorld({ stompedThisTick: 0, stompChain: 2, player: { jumpedThisTick: true, jumpChain: 2 } }));
  assert.ok(oscs() > before, 'stomp + jump created oscillator voices');
});

test('volume 0 mutes triggers (no voices synthesized)', () => {
  const { ctx, oscs } = stubCtx();
  const sfx = createSfx({ seed: 1, ctx });
  sfx.enable();
  sfx.setVolume(0);
  const before = oscs();
  sfx.fromWorld(fakeWorld({ killedThisTick: 0, damagedThisTick: true, diedThisTick: true }));
  assert.equal(oscs(), before, 'muted → nothing synthesized');
});

test('a full event burst triggers without error', () => {
  const { ctx } = stubCtx();
  const sfx = createSfx({ seed: 2, ctx });
  sfx.enable();
  sfx.fromWorld(fakeWorld({
    player: { jumpedThisTick: true, jumpChain: 3 },
    stompedThisTick: 0, killedThisTick: 0, enemies: [{ boss: true }],
    sparkCollectedThisTick: 2, pipGainedThisTick: true,
    fireworkFiredThisTick: true, fireworkHitThisTick: 0,
    podCollectedThisTick: 1, exitOpenedThisTick: true,
    bossDefeatedThisTick: true, stompChain: 3,
  }));
  assert.ok(true, 'every hook fired cleanly');
});

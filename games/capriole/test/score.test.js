// node --test — M5-minimal House Band score. Structural/audio-node tests use a permissive
// AudioContext stub: no speakers or browser required, but real track steps build real kit
// voices and exercise scene/layer wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScore, SCORE_TRACKS, trackForScene } from '../src/engine/score.js';

function stubCtx() {
  let oscCount = 0;
  const param = () => ({
    value: 0,
    setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({
    connect() {}, disconnect() {}, gain: param(), frequency: param(), detune: param(), Q: param(),
    type: 'sine', start() {}, stop() {}, ...extra,
  });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: node(),
    createGain: () => node(), createBiquadFilter: () => node(),
    createOscillator: () => { oscCount++; return node(); },
    createBufferSource: () => node({ buffer: null, loop: false }),
    createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }),
    createConvolver: () => node({ buffer: null }),
    createDynamicsCompressor: () => node({
      threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    }),
    resume() {},
  };
  return { ctx, oscs: () => oscCount };
}

test('score is headless-safe and remembers its pending title scene', () => {
  const score = createScore({ seed: 7 });
  assert.equal(score.track, 'title');
  assert.equal(score.enable(), false, 'no browser AudioContext in node');
  assert.equal(score.enabled, false);
});

test('scene mapping covers title, all act ascents/bosses, and scorecard', () => {
  assert.equal(trackForScene('title'), 'title');
  assert.equal(trackForScene('play', { act: 0 }), 'ascent-1');
  assert.equal(trackForScene('play', { act: 2 }), 'ascent-3');
  assert.equal(trackForScene('play', { act: 1, boss: true }), 'boss-2');
  assert.equal(trackForScene('scorecard'), 'scorecard');
  assert.equal(trackForScene('meta'), 'scorecard');
});

test('enabling registers the complete score and volume controls the music bus', (t) => {
  const { ctx } = stubCtx();
  const score = createScore({ seed: 9, ctx });
  t.after(() => score.dispose());
  score.setVolume(0.35);
  assert.equal(score.enable(), true);
  assert.deepEqual(score.trackNames, SCORE_TRACKS);
  assert.equal(score.track, 'title');
  assert.equal(score.volume, 0.35);
  assert.equal(score.setScene('play', { act: 1, boss: true, intensity: 0.7 }), 'boss-2');
  assert.equal(score.track, 'boss-2');
  score.setScene('scorecard');
  assert.equal(score.track, 'scorecard');
  score.setVolume(0);
  assert.equal(score.volume, 0);
});

test('act III schedules an added FM intensity layer over the act I core groove', (t) => {
  const a = stubCtx(), b = stubCtx();
  const act1 = createScore({ seed: 4, ctx: a.ctx });
  const act3 = createScore({ seed: 4, ctx: b.ctx });
  t.after(() => { act1.dispose(); act3.dispose(); });
  act1.enable(); act3.enable();
  const before1 = a.oscs(), before3 = b.oscs();
  act1.setScene('play', { act: 0, intensity: 0 });
  act3.setScene('play', { act: 2, intensity: 0.8 });
  const layer1 = a.oscs() - before1, layer3 = b.oscs() - before3;
  assert.ok(layer1 > 0, 'act I core bass/percussion/lead scheduled');
  assert.ok(layer3 > layer1, 'act III added the FM counterline layer');
});


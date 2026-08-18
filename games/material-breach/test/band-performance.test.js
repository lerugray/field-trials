// THE PERFORMANCE-PASS API, as behaviour. These tests pin the House Band humanize layer that was
// grafted into this game's kit: omitted performance is exactly neutral, opted-in knobs are
// deterministic, and per-voice overrides actually override. They do not play the score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePerformance,
  performanceAdjustment,
  performanceReleaseTail,
} from '../src/band.js';

test('omitting performance is exactly neutral', () => {
  assert.equal(normalizePerformance(undefined), null);
  assert.equal(performanceReleaseTail(undefined), 0);
  const adj = performanceAdjustment(undefined, {
    seed: 1, absoluteStep: 0, stepIndex: 1, stepSeconds: 0.25, voice: 'pad',
  });
  assert.equal(adj.timeSeconds, 0);
  assert.equal(adj.velocity, 0);
  assert.equal(adj.releaseTail, 0);
});

test('normalizePerformance accepts the documented shape and rejects inverted ranges', () => {
  assert.doesNotThrow(() => normalizePerformance({
    humanize: { timingMs: [-5, 8], velocity: [-0.1, 0.05], swing: 0.2 },
    releaseTail: 0.5,
    voices: { pad: { releaseTail: 0.8 } },
  }));
  assert.throws(
    () => normalizePerformance({ humanize: { timingMs: [5, -5] } }),
    TypeError,
  );
  assert.throws(
    () => normalizePerformance({ voices: { snare: { releaseTail: 0.2 } } }),
    TypeError,
  );
});

test('performanceAdjustment is seeded: same coordinates replay, a new seed only moves time and weight', () => {
  const performance = {
    humanize: { timingMs: [-10, 10], velocity: [-0.2, 0.2], swing: 0.25 },
    releaseTail: 0.4,
  };
  const args = { absoluteStep: 17, stepIndex: 3, stepSeconds: 0.2, voice: 'pad', call: 0 };
  const a = performanceAdjustment(performance, { ...args, seed: 4242 });
  const again = performanceAdjustment(performance, { ...args, seed: 4242 });
  assert.deepEqual(again, a);
  const other = performanceAdjustment(performance, { ...args, seed: 99 });
  assert.notEqual(other.timeSeconds, a.timeSeconds);
  assert.notEqual(other.velocity, a.velocity);
  assert.equal(other.releaseTail, a.releaseTail);
});

test('per-voice humanize overrides the score-level range; releaseTail is pad/drone only', () => {
  const performance = {
    humanize: { timingMs: [10, 10], velocity: [0.2, 0.2], swing: 0.3 },
    releaseTail: 0.5,
    voices: {
      hat: { humanize: { timingMs: [0, 0], velocity: [0, 0], swing: 0 } },
      pad: { releaseTail: 0.8 },
    },
  };
  const hat = performanceAdjustment(performance, {
    seed: 7, absoluteStep: 4, stepIndex: 1, stepSeconds: 0.25, voice: 'hat',
  });
  const pad = performanceAdjustment(performance, {
    seed: 7, absoluteStep: 4, stepIndex: 1, stepSeconds: 0.25, voice: 'pad',
  });
  const lead = performanceAdjustment(performance, {
    seed: 7, absoluteStep: 4, stepIndex: 1, stepSeconds: 0.25, voice: 'lead',
  });
  assert.equal(hat.timeSeconds, 0);
  assert.equal(hat.velocity, 0);
  assert.equal(hat.releaseTail, 0);
  assert.ok(lead.timeSeconds > 0);
  assert.equal(lead.velocity, 0.2);
  assert.equal(lead.releaseTail, 0);
  assert.equal(pad.releaseTail, 0.8);
  assert.equal(performanceReleaseTail(performance), 0.8);
});

test('the performance pass draws from hash2, not a wall clock, and the kit still owns no timer', () => {
  const kit = readFileSync(new URL('../src/band.js', import.meta.url), 'utf8');
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const code = strip(kit);
  assert.match(kit, /performanceAdjustment[\s\S]*hash2/);
  assert.ok(!code.includes('Math.random'), 'the kit reached for Math.random');
  assert.ok(!/\bsetInterval\b/.test(code), 'grafting the performance pass reintroduced the kit timer');
  assert.ok(!/\bfunction start\(/.test(code), 'grafting the performance pass restored start()');
});

// band.js — the portable synth-band kit. These pin the three things another
// game adopting the kit depends on: the scheduler is DETERMINISTIC and driven by
// ctx.currentTime, the bus architecture retires a track's nodes so scene changes
// cannot leak or accumulate, and every voice actually builds sound. Headless
// throughout — a recording mock stands in for WebAudio (test-support/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBand, noteFreq, chord, LOOKAHEAD, MAX_STEPS_PER_TICK,
} from '../src/engine/band.js';
import { createMockCtx, runClock } from '../test-support/audio-ctx-mock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A one-note-per-step track: the step count is directly observable as oscillators.
function counterTrack(len = 16, bpm = 120) {
  return {
    bpm,
    len,
    vol: 0.8,
    step(i, t, s) { s.v.pluck(t, noteFreq('A4'), 0.2, { vol: 0.1 }); },
  };
}

test('noteFreq reads note names and passes numbers through', () => {
  assert.equal(Math.round(noteFreq('A4')), 440);
  assert.equal(Math.round(noteFreq('A3')), 220);
  assert.equal(Math.round(noteFreq('C4') * 100) / 100, 261.63);
  assert.equal(Math.round(noteFreq('D1') * 100) / 100, 36.71);
  assert.ok(noteFreq('Bb2') < noteFreq('B2'), 'a flat is below the natural');
  assert.ok(noteFreq('F#4') > noteFreq('F4'), 'a sharp is above the natural');
  assert.equal(noteFreq(123.4), 123.4, 'a number passes through');
  assert.equal(noteFreq('not-a-note'), 440, 'garbage falls back rather than throwing');
  assert.deepEqual(chord(['A4', 'A3']).map(Math.round), [440, 220]);
});

test('createBand refuses to build without a context, and builds its bus rig with one', () => {
  assert.throws(() => createBand({}), /needs an AudioContext/);
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx, seed: 7 });
  assert.equal(log.convolvers, 1, 'a send reverb was built');
  assert.equal(log.buffers, 2, 'two buffers built by code: the reverb IR and the shared noise');
  assert.equal(log.compressors, 1, 'the output is glued by a compressor');
  assert.equal(band.track, null, 'nothing plays until a track is set');
  assert.deepEqual(band.trackNames, []);
});

test('registerTrack demands a real track spec', () => {
  const { ctx } = createMockCtx();
  const band = createBand({ ctx });
  assert.throws(() => band.registerTrack('x', {}), /needs/);
  assert.throws(() => band.registerTrack('', counterTrack()), /needs/);
  assert.equal(band.registerTrack('ok', counterTrack()), 'ok');
  assert.deepEqual(band.trackNames, ['ok']);
});

test('the scheduler only schedules inside the lookahead window, and never re-schedules a step', () => {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  band.registerTrack('t', counterTrack(64, 120)); // step = 60/120/4 = 0.125s
  band.setTrack('t'); // setTrack ticks once immediately so sound starts on the gesture
  const afterSet = band.step;
  assert.ok(afterSet >= 1, 'the first step is scheduled at once, not on the next timer wake');
  assert.ok(afterSet <= Math.ceil(LOOKAHEAD / 0.125) + 1, 'and no further than the lookahead');

  // Ticking again at the SAME clock time must add nothing.
  const before = band.step;
  assert.equal(band.tick(log.now), 0, 'no steps are due');
  assert.equal(band.step, before, 'the step cursor did not move');

  // Driven the way the real timer drives it (every 25ms), one second of clock is
  // one second of music: 1.0s / 0.125s = 8 steps, give or take the window edge.
  runClock(band, log, 1.0);
  const added = band.step - before;
  assert.ok(added >= 7 && added <= 9, `1.0s at 0.125s/step is ~8 steps, got ${added}`);
});

test('a long clock gap resyncs to the present instead of replaying the missed music', () => {
  // A backgrounded tab wakes up minutes later. The sequencer must NOT try to
  // catch up by scheduling every step it slept through — it snaps `nextTime` to
  // now and carries on, so one tick can only ever place a lookahead's worth.
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  band.registerTrack('t', counterTrack(16, 240)); // step = 0.0625s
  band.setTrack('t');
  const before = band.step;
  log.now += 600; // ten minutes
  const scheduled = band.tick(log.now);
  const window = Math.ceil(LOOKAHEAD / 0.0625) + 1; // ~4 steps
  assert.ok(scheduled > 0, 'the score resumed');
  assert.ok(scheduled <= window, `only a lookahead's worth was placed, got ${scheduled}`);
  assert.ok(scheduled < MAX_STEPS_PER_TICK, 'nowhere near the hard per-tick cap');
  assert.equal(band.step, before + scheduled);
  // And everything it did place is in the future, not ten minutes stale.
  const starts = log.oscs.map((o) => o.start).filter((v) => v !== null);
  assert.ok(Math.max(...starts) >= log.now, 'the resumed notes are scheduled at the new clock');
});

test('the same seed schedules an identical event trace; a different seed does not', () => {
  const trace = (seed) => {
    const { ctx, log } = createMockCtx();
    const band = createBand({ ctx, seed });
    band.registerTrack('t', {
      bpm: 120, len: 16, vol: 0.8,
      // Frequency chosen by the seeded per-step hash — the drift under test.
      step(i, t, s) { s.v.bell(t, 200 + Math.floor(s.rand(1) * 800), 0.4, { vol: 0.05 }); },
    });
    band.setTrack('t');
    runClock(band, log, 4);
    return log.events;
  };
  const a = trace(12345);
  const b = trace(12345);
  const c = trace(999);
  assert.ok(a.length > 20, 'the run produced a real trace');
  assert.deepEqual(a, b, 'same seed, same score');
  assert.notDeepEqual(a, c, 'a different world drifts differently');
});

test('nothing in the audio path calls Math.random', () => {
  // The seeded-determinism promise is only as good as this: a stray Math.random
  // in a voice or in the IR fill would silently break replay.
  for (const rel of ['src/engine/band.js', 'src/engine/score.js']) {
    const src = readFileSync(resolve(root, rel), 'utf8');
    const hits = src.split('\n')
      .map((line, n) => [n + 1, line])
      .filter(([, line]) => /Math\.random/.test(line) && !/^\s*(\/\/|\*)/.test(line));
    assert.deepEqual(hits, [], `${rel} must not use Math.random in the audio path`);
  }
});

test('every voice in the kit builds sound without throwing — including the unused percussion', () => {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx, seed: 3 });
  band.registerTrack('all', {
    bpm: 120, len: 1, vol: 0.8,
    step(i, t, s) {
      s.v.pad(t, noteFreq('D3'), 2, { vol: 0.05 });
      s.v.drone(t, noteFreq('D1'), 4, { vol: 0.1, beat: 6, glide: 'C1' });
      s.v.bell(t, noteFreq('A5'), 2, { vol: 0.05, ratios: [1, 1.414] });
      s.v.pluck(t, noteFreq('F4'), 0.5, { vol: 0.05 });
      s.v.bass(t, noteFreq('D2'), 0.6, { vol: 0.1 });
      s.v.lead(t, noteFreq('A4'), 1, { vol: 0.08 });
      s.v.air(t, 3, { vol: 0.04 });
      s.v.kick(t, {});
      s.v.snare(t, {});
      s.v.hat(t, {});
    },
  });
  assert.doesNotThrow(() => band.setTrack('all'));
  // pad 3 + drone 4 (2 partners x fundamental+sub) + bell 2 + pluck 1 + bass 2
  // + lead 2 (osc + vibrato LFO) + kick 1 = 15 oscillators on the first step.
  assert.ok(log.oscs.length >= 15, `expected the full voice set, got ${log.oscs.length}`);
  // air/snare/hat are noise voices: buffer sources, not oscillators.
  assert.ok(log.sources >= 3, 'the three noise voices each took a buffer source');
  assert.ok(log.filters.length >= 7, 'the filtered voices each built a biquad');
  // Every oscillator is bounded — an un-stopped node is a leak that a soak's
  // heap gate would eventually catch.
  for (const o of log.oscs) {
    assert.notEqual(o.start, null, 'every oscillator started');
    assert.notEqual(o.stop, null, 'every oscillator has a stop scheduled');
    assert.ok(o.stop > o.start, 'and stops after it starts');
  }
});

test('voices schedule at the time they are given, not at currentTime', () => {
  // The whole point of lookahead scheduling: notes are placed in the future.
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  band.registerTrack('t', counterTrack(16, 60)); // step = 0.25s
  band.setTrack('t');
  const starts = log.oscs.map((o) => o.start).filter((v) => v !== null);
  assert.ok(starts.length >= 1);
  assert.ok(starts.every((s) => s >= log.now), 'nothing was scheduled in the past');
  assert.ok(Math.max(...starts) > log.now, 'and at least one note is genuinely ahead');
});

test('setTrack: same name is a no-op, null is silence, and a switch resets the loop', () => {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  const seenA = []; const seenB = [];
  const watch = (into) => ({ bpm: 120, len: 16, vol: 0.8, step(i, t, s) { into.push(i); s.v.pluck(t, 440, 0.2, { vol: 0.1 }); } });
  band.registerTrack('a', watch(seenA));
  band.registerTrack('b', watch(seenB));

  assert.equal(band.setTrack('a'), true);
  assert.equal(band.setTrack('a'), false, 'the shell may call this every frame');
  log.now += 1; band.tick(log.now);
  const advanced = band.step;
  assert.ok(advanced > 3, 'the loop advanced');

  assert.equal(band.setTrack('b'), true, 'switched');
  assert.ok(band.step < advanced, 'the step cursor reset for the new track');
  assert.equal(seenB[0], 0, 'and the new track began at its own step 0');

  assert.equal(band.setTrack(null), true, 'null fades out');
  assert.equal(band.track, null);
  const before = log.oscs.length;
  log.now += 2; band.tick(log.now);
  assert.equal(log.oscs.length, before, 'silence schedules nothing at all');
});

test('an unknown track name yields silence rather than an exception', () => {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  band.registerTrack('a', counterTrack());
  assert.doesNotThrow(() => band.setTrack('nope'));
  const before = log.oscs.length;
  log.now += 1; band.tick(log.now);
  assert.equal(log.oscs.length, before, 'nothing plays for a track that does not exist');
});

test('retired track buses are disconnected, so repeated scene changes do not accumulate', () => {
  // The soak measures heap growth; a session flipping between overworld, dungeon
  // and combat for an hour must not leave a gain node per transition alive.
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  band.registerTrack('a', counterTrack());
  band.registerTrack('b', counterTrack());
  for (let k = 0; k < 40; k++) {
    band.setTrack(k % 2 ? 'a' : 'b');
    log.now += 0.5;
    band.tick(log.now);
  }
  assert.ok(band.retiringCount > 0, 'buses are queued for disposal');
  // Advance past the retire tail and sweep.
  log.now += 60;
  band.tick(log.now);
  assert.equal(band.retiringCount, 0, 'every retired bus was swept');
  assert.ok(log.disconnects >= 40, 'and actually disconnected');
});

test('a throwing step never stops the score', () => {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  band.registerTrack('bad', {
    bpm: 120, len: 4, vol: 0.8,
    step(i, t, s) {
      if (i === 2) throw new Error('a composer typo');
      s.v.pluck(t, 440, 0.2, { vol: 0.1 });
    },
  });
  band.setTrack('bad');
  assert.doesNotThrow(() => runClock(band, log, 2));
  assert.ok(band.step > 8, 'the sequencer kept going past the bad step');
  assert.ok(log.oscs.length > 4, 'the good steps still played');
});

test('setParams merges live and reaches the steps without restarting the track', () => {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  const seen = [];
  band.registerTrack('t', {
    bpm: 240, len: 4, vol: 0.8,
    step(i, t, s) { seen.push(s.params.dread); },
  });
  band.setTrack('t');
  band.setParams({ dread: 0.2 });
  log.now += 0.5; band.tick(log.now);
  band.setParams({ other: 1 });
  assert.deepEqual(band.params, { dread: 0.2, other: 1 }, 'params merge, they do not replace');
  band.setParams({ dread: 0.9 });
  const stepBefore = band.step;
  log.now += 0.5; band.tick(log.now);
  assert.equal(band.track, 't', 'the track did not change');
  assert.ok(band.step > stepBefore, 'and did not restart');
  assert.ok(seen.includes(0.2) && seen.includes(0.9), 'steps saw both values');
});

test('the step context reports loop position, absolute count and bar', () => {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx });
  const rows = [];
  band.registerTrack('t', {
    bpm: 240, len: 32, vol: 0.8, // step = 0.0625s
    step(i, t, s) { rows.push({ i, n: s.n, bar: s.bar }); },
  });
  band.setTrack('t');
  runClock(band, log, 3);
  assert.ok(rows.length > 32, 'the loop wrapped at least once');
  assert.deepEqual(rows.slice(0, 3).map((r) => r.i), [0, 1, 2]);
  assert.equal(rows[0].bar, 0);
  assert.equal(rows.find((r) => r.i === 16).bar, 1, '16 steps is one bar');
  const wrapped = rows.find((r) => r.n === 32);
  assert.equal(wrapped.i, 0, 'the loop index wraps');
  assert.equal(wrapped.n, 32, 'the absolute count does not');
});

test('start/stop/dispose are safe and idempotent, and the timer never holds the loop open', () => {
  const { ctx } = createMockCtx();
  const band = createBand({ ctx });
  band.registerTrack('t', counterTrack());
  band.setTrack('t');
  assert.equal(band.start(), true);
  assert.equal(band.start(), false, 'already running');
  assert.equal(band.stop(), true);
  assert.doesNotThrow(() => band.stop());
  assert.doesNotThrow(() => band.dispose());
  assert.equal(band.track, null, 'dispose leaves silence');
  assert.doesNotThrow(() => band.dispose(), 'and is safe twice');
});

test('a context missing convolver/compressor support still plays (graceful degrade)', () => {
  const { ctx, log } = createMockCtx();
  delete ctx.createConvolver;
  delete ctx.createDynamicsCompressor;
  const band = createBand({ ctx });
  band.registerTrack('t', counterTrack());
  assert.doesNotThrow(() => band.setTrack('t'));
  assert.ok(log.oscs.length >= 1, 'dry voices still sound without a reverb bus');
});

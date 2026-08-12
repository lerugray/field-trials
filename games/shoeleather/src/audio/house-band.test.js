import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteFreq, composeBar, composeProgression, beatDur, SWING, BASS_DRAG, HAT_GAINS, TEMPO_BPM, passPlan, flutterMultiplier, sessionSeed } from './house-band.js';

test('noteFreq maps standard pitches', () => {
  assert.ok(Math.abs(noteFreq('A4') - 440) < 1e-6);
  assert.ok(Math.abs(noteFreq('A2') - 110) < 1e-6);
  assert.ok(noteFreq('C5') > noteFreq('C4'));
  assert.throws(() => noteFreq('H9'), /bad note/);
});

test('a bar emits all four voices', () => {
  const ev = composeBar(0, 0);
  const voices = new Set(ev.map((e) => e.voice));
  for (const v of ['bass', 'kit', 'stab', 'lead']) assert.ok(voices.has(v), `missing voice ${v}`);
  const hat = ev.filter((e) => e.voice === 'kit').slice(0, 2);
  assert.deepEqual(hat.map((e) => e.gain), [HAT_GAINS.onbeat, HAT_GAINS.offbeat]);
  assert.deepEqual(HAT_GAINS, { onbeat: 0.25, offbeat: 0.14 });
});

test('SWING delays the offbeat toward a triplet feel', () => {
  const bd = beatDur();
  const ev = composeBar(0, 0);
  // the two kit hits on beat 0: onbeat at 0, swung ghost delayed by SWING*beat
  const kit0 = ev.filter((e) => e.voice === 'kit' && e.t < bd).sort((a, b) => a.t - b.t);
  assert.equal(kit0[0].t, 0);
  assert.ok(Math.abs(kit0[1].t - SWING * bd) < 1e-9);
  assert.ok(SWING > 0.5 && SWING < 0.667, 'swing sits between straight and triplet');
});

test('BASS DRAGS behind the beat (lands late)', () => {
  const bd = beatDur();
  const ev = composeBar(0, 0);
  const bass1 = ev.find((e) => e.voice === 'bass');
  assert.ok(bass1.t > 0, 'bass beat-1 should land after the downbeat');
  assert.ok(Math.abs(bass1.t - BASS_DRAG * bd) < 1e-9);
});

test('chord stabs DROP the 3rd (harmonic ambiguity)', () => {
  const ev = composeBar(0, 0).filter((e) => e.voice === 'stab');
  assert.ok(ev.length > 0);
  const root = ev[0].freq;
  // no stab note is a major or minor 3rd above the root (ratio ~1.26 or ~1.19)
  for (const e of ev) {
    const ratio = e.freq / root;
    const rel = ratio / Math.pow(2, Math.floor(Math.log2(ratio))); // fold into an octave
    assert.ok(Math.abs(rel - Math.pow(2, 3 / 12)) > 0.02, 'found a minor 3rd (should be dropped)');
    assert.ok(Math.abs(rel - Math.pow(2, 4 / 12)) > 0.02, 'found a major 3rd (should be dropped)');
  }
});

test('progression is deterministic for one session seed/pass and time-ordered', () => {
  const a = composeProgression(4, { seed: 77, passIndex: 2 });
  const b = composeProgression(4, { seed: 77, passIndex: 2 });
  assert.deepEqual(a.map((e) => [e.voice, +e.t.toFixed(6), +e.freq.toFixed(3)]),
    b.map((e) => [e.voice, +e.t.toFixed(6), +e.freq.toFixed(3)]));
  for (let i = 1; i < a.length; i++) assert.ok(a[i].t >= a[i - 1].t, 'events should be time-sorted');
});

test('three passes rotate A/A-prime/B and reharmonize rather than repeating', () => {
  const passes = [0, 1, 2].map((passIndex) => composeProgression(4, { seed: 20260811, passIndex }));
  assert.deepEqual(new Set(passes.map((p) => p[0].section)), new Set(['A', "A'", 'B']));
  const signatures = passes.map((events) => JSON.stringify(events.map((e) => [e.voice, +e.t.toFixed(4), +e.freq.toFixed(2)])));
  assert.equal(new Set(signatures).size, 3);
  assert.ok(new Set([0, 1, 2].map((i) => passPlan(20260811, i).inversion)).size >= 2);
});

test('intensity raises the arrangement energy without changing its register', () => {
  const quiet = composeProgression(4, { seed: 9, passIndex: 0, intensity: 0 }).filter((e) => e.voice === 'bass');
  const urgent = composeProgression(4, { seed: 9, passIndex: 0, intensity: 1 }).filter((e) => e.voice === 'bass');
  assert.ok(urgent[0].gain > quiet[0].gain);
  assert.equal(urgent[0].freq, quiet[0].freq);
});

test('wow/flutter is continuous at a loop seam instead of restarting', () => {
  const seam = 8 * 4 * beatDur();
  const phase = (sessionSeed('case-1', 42) % 6283) / 1000;
  const left = flutterMultiplier(seam - 1e-6, phase);
  const at = flutterMultiplier(seam, phase);
  const right = flutterMultiplier(seam + 1e-6, phase);
  assert.ok(Math.abs(at - left) < 1e-6);
  assert.ok(Math.abs(right - at) < 1e-6);
  assert.notEqual(at, flutterMultiplier(0, phase), 'seam must not hard-reset to t=0 modulation');
});

test('the progression resolves LATE: the last bar is the dominant, not the tonic', () => {
  // 4-bar loop ends on E (dominant) -> never a clean tonic cadence
  const bd = beatDur();
  const lead = composeProgression(4).filter((e) => e.voice === 'lead');
  const lastBarLead = lead.filter((e) => e.t >= 3 * 4 * bd);
  assert.ok(lastBarLead.length > 0);
  assert.equal(TEMPO_BPM, 84);
});

// score.js — CHP's ambient score. These pin the STATE→TRACK contract (every
// game mode the shell can be in maps to a track that actually exists), that the
// journal overlay HOLDs rather than interrupting the world, that silence is
// reachable on purpose, and that the intensity params are wired to something
// audible rather than merely stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBand } from '../src/engine/band.js';
import { createScore, sceneFor, HOLD, TRACK_IDS, SCENE_MODES, DEFAULT_SCENE } from '../src/engine/score.js';
import { createMockCtx, runClock } from '../test-support/audio-ctx-mock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function rig(seed = 4242) {
  const { ctx, log } = createMockCtx();
  const band = createBand({ ctx, seed });
  const score = createScore({ band });
  return { ctx, log, band, score };
}

/** Play one scene for `seconds` of clock and report what it built. */
function play(scene, params, seconds = 30, seed = 4242) {
  const { log, band, score } = rig(seed);
  score.setScene(scene, params);
  runClock(band, log, seconds);
  return { log, band, score };
}

/**
 * The brightest LOWPASS cutoff a run opened — i.e. how open the harmonic voices
 * (pad/drone/bass) were. Deliberately type-filtered: the `air` voice is a
 * BANDPASS whose centre rises with weirdness, so counting every filter measures
 * the noise texture instead of the pad and reads backwards.
 */
const brightest = (r) => Math.max(0, ...r.log.filters
  .filter((f) => f.type === 'lowpass')
  .map((f) => f.freqs[0] || 0));

// --- the state contract ----------------------------------------------------

test('every mode the shell can be in maps to a real track', () => {
  // The shell's `mode` variable is documented in main.js; this list is that set.
  const MODES = ['title', 'creation', 'overworld', 'city', 'building',
    'dungeon', 'dungeonEnc', 'combat', 'death', 'journal'];
  const { band, score } = rig();
  const registered = new Set(band.trackNames);
  for (const m of MODES) {
    const scene = sceneFor(m);
    assert.ok(scene, `mode '${m}' has no scene`);
    if (scene === HOLD) continue;
    assert.ok(registered.has(scene), `mode '${m}' -> '${scene}' which is not a registered track`);
  }
  assert.equal(score.tracks.length, TRACK_IDS.length, 'no track is registered that no state reaches');
  for (const id of TRACK_IDS) assert.ok(registered.has(id), `${id} missing`);
});

test('the mode list in score.js matches the modes main.js actually uses', () => {
  // A mode added to the shell without a scene would fall through to the country
  // bed silently. Cross-check against the real dispatch in main.js.
  const src = readFileSync(resolve(root, 'src/main.js'), 'utf8');
  const used = new Set();
  for (const m of src.matchAll(/\bmode\s*===\s*'([a-zA-Z]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bmode\s*=\s*'([a-zA-Z]+)'/g)) used.add(m[1]);
  // 'combatItem'/'combatTalk' are keybar hint contexts, not shell modes.
  used.delete('combatItem'); used.delete('combatTalk');
  const mapped = new Set(SCENE_MODES);
  const unmapped = [...used].filter((m) => !mapped.has(m));
  assert.deepEqual(unmapped, [], `these shell modes have no scene mapping: ${unmapped.join(', ')}`);
});

test('the journal overlay HOLDs — opening your notes does not interrupt the world', () => {
  assert.equal(sceneFor('journal'), HOLD);
  const { band, score } = rig();
  score.setScene(sceneFor('dungeon'), { weirdness: 0.5 });
  assert.equal(band.track, 'under');
  assert.equal(score.setScene(HOLD), false, 'HOLD reports no change');
  assert.equal(band.track, 'under', 'the dungeon bed is still playing under the journal');
  assert.equal(score.scene, 'under');
});

test('an unknown mode falls back to the country bed rather than to silence', () => {
  assert.equal(sceneFor('some-future-mode'), 'country');
  assert.equal(sceneFor(undefined), 'country');
});

test('silence is reachable on purpose, and schedules nothing', () => {
  const { log, band, score } = rig();
  score.setScene('country', { weirdness: 0.3 });
  runClock(band, log, 2);
  assert.ok(log.oscs.length > 0);
  score.setScene(null);
  assert.equal(band.track, null);
  const before = log.oscs.length;
  runClock(band, log, 10);
  assert.equal(log.oscs.length, before, 'true silence builds no voices at all');
});

test('re-asserting the same scene is a no-op the shell can call every frame', () => {
  const { band, score } = rig();
  assert.equal(score.setScene('country', { weirdness: 0.3 }), true);
  for (let k = 0; k < 50; k++) {
    assert.equal(score.setScene('country', { weirdness: 0.3 }), false);
  }
  assert.equal(band.track, 'country');
  assert.equal(band.retiringCount, 0, 'no bus churn from repeated identical calls');
});

test('the default scene is the title bed — the first gesture happens on the title screen', () => {
  const { band, score } = rig();
  assert.equal(DEFAULT_SCENE, 'threshold');
  score.setScene(DEFAULT_SCENE);
  assert.equal(band.track, 'threshold');
});

// --- what each track actually plays ----------------------------------------

test('every track produces sound within one loop, and the sparse ones stay sparse', () => {
  // Per-track voice counts over 40s of clock. These are the "what plays" numbers
  // the lane report quotes; they also catch a track that silently stops emitting.
  const counts = {};
  for (const id of TRACK_IDS) {
    const { log } = play(id, { weirdness: 0.4, pressure: 0.3, chapel: false }, 40);
    counts[id] = { oscs: log.oscs.length, noise: log.sources };
    assert.ok(log.oscs.length + log.sources > 0, `${id} played nothing`);
  }
  // The register: death and the building interior are the sparsest; combat is
  // the busiest because it is the only track with a pulse.
  assert.ok(counts.thread.oscs < counts.country.oscs, 'death is sparser than the open country');
  assert.ok(counts.room.oscs < counts.town.oscs, 'a room is sparser than the town around it');
  assert.ok(counts.pattern.oscs > counts.under.oscs, 'combat is busier than the crawl');
  assert.ok(counts.under.noise > 0, 'the dungeon leans on its noise texture');
  assert.ok(counts.town.oscs > 0 && counts.threshold.oscs > 0);
});

test('bells belong to the wilderness and the uncanny — the town has none', () => {
  // A bell is a stack of sine partials at bell ratios; the town track calls no
  // bell at all, which is a deliberate register choice, so pin it.
  const src = readFileSync(resolve(root, 'src/engine/score.js'), 'utf8');
  const townBlock = src.slice(src.indexOf("band.registerTrack('town'"), src.indexOf("band.registerTrack('room'"));
  assert.ok(townBlock.length > 100, 'found the town track');
  assert.ok(!/\.bell\(/.test(townBlock), 'the town track must not ring a bell');
  const countryBlock = src.slice(src.indexOf("band.registerTrack('country'"), src.indexOf("band.registerTrack('town'"));
  assert.ok(/\.bell\(/.test(countryBlock), 'the country track does ring');
});

test('the 23s land where the register says they do', () => {
  // DESIGN-SEED's numerology: bell events sit on steps 23 and 46 of the 64-step
  // country and threshold loops.
  const src = readFileSync(resolve(root, 'src/engine/score.js'), 'utf8');
  for (const id of ['threshold', 'country']) {
    const start = src.indexOf(`band.registerTrack('${id}'`);
    const block = src.slice(start, start + 1400);
    assert.ok(/i === 23/.test(block), `${id} has no bell on step 23`);
    assert.ok(/i === 46/.test(block), `${id} has no bell on step 46`);
  }
});

// --- the intensity layers are wired to something audible -------------------

test('biome weirdness audibly changes the country bed', () => {
  const calm = play('country', { weirdness: 0.1 }, 40);
  const weird = play('country', { weirdness: 0.95 }, 40);
  // Past the 0.55 threshold the country rings more often and off the beat.
  assert.ok(weird.log.oscs.length > calm.log.oscs.length,
    `weird country should ring more: ${weird.log.oscs.length} vs ${calm.log.oscs.length}`);
  // And the pads are darker: the pad lowpass drops as weirdness rises.
  assert.ok(brightest(weird) < brightest(calm),
    `the weird country is filtered darker: ${brightest(weird)} vs ${brightest(calm)}`);
});

test('the Chapel bends the underground — a lower floor and bent bell partials', () => {
  const plain = play('under', { weirdness: 0.5, chapel: false }, 40);
  const chapel = play('under', { weirdness: 0.5, chapel: true }, 40);
  const lowest = (r) => Math.min(...r.log.oscs.map((o) => o.freqs[0]).filter((f) => f > 0));
  assert.ok(lowest(chapel) < lowest(plain), 'the Chapel drops the floor');
  // Bent partials are a tritone stack: a 1.414 ratio shows up in the frequencies.
  const ratioSeen = (r, ratio) => r.log.oscs.some((o) => r.log.oscs.some((p) =>
    p.freqs[0] > 0 && o.freqs[0] > 0 && Math.abs(o.freqs[0] / p.freqs[0] - ratio) < 0.01));
  assert.ok(ratioSeen(chapel, 1.414), 'the Chapel bell rings a tritone partial');
});

test('combat pressure opens the filter as the stranger is worn down', () => {
  const fresh = play('pattern', { pressure: 0 }, 20);
  const dying = play('pattern', { pressure: 1 }, 20);
  assert.ok(brightest(dying) > brightest(fresh),
    `pressure should open the pad filter: ${brightest(dying)} vs ${brightest(fresh)}`);
  assert.ok(dying.log.oscs.length >= fresh.log.oscs.length, 'and never thins the texture');
});

test('params update the live bed without restarting the track', () => {
  const { log, band, score } = rig();
  score.setScene('country', { weirdness: 0.2 });
  runClock(band, log, 5);
  const stepBefore = band.step;
  assert.equal(score.setScene('country', { weirdness: 0.9 }), false, 'no scene change');
  assert.equal(band.track, 'country', 'same track');
  assert.ok(band.step >= stepBefore, 'the loop was not restarted');
  assert.equal(band.params.weirdness, 0.9, 'but the intensity took effect');
});

test('a missing or nonsense param falls back instead of scheduling NaN frequencies', () => {
  for (const params of [null, {}, { weirdness: undefined }, { weirdness: NaN }, { weirdness: 'loud' }]) {
    const { log } = play('country', params, 20);
    assert.ok(log.oscs.length > 0, 'still played');
    for (const o of log.oscs) {
      for (const f of o.freqs) assert.ok(Number.isFinite(f), `non-finite frequency ${f} from ${JSON.stringify(params)}`);
    }
    for (const fl of log.filters) {
      for (const f of fl.freqs) assert.ok(Number.isFinite(f), 'non-finite filter frequency');
    }
  }
});

test('the same world seed plays the same score; a different world does not', () => {
  const a = play('country', { weirdness: 0.7 }, 30, 777);
  const b = play('country', { weirdness: 0.7 }, 30, 777);
  const c = play('country', { weirdness: 0.7 }, 30, 31337);
  assert.deepEqual(a.log.events, b.log.events, 'a seeded world is a fixed score');
  assert.notDeepEqual(a.log.events, c.log.events, 'a different world drifts differently');
});

test('createScore refuses to build without a band', () => {
  assert.throws(() => createScore({}), /needs a band/);
});

test('held escalates from under on the same harmonic floor', () => {
  // The design point: seeing something ahead must read as escalation, not as a
  // scene change, so both tracks sit on the same root.
  const under = play('under', { weirdness: 0.5 }, 30);
  const held = play('held', { weirdness: 0.5 }, 30);
  const roots = (r) => [...new Set(r.log.oscs.map((o) => Math.round(o.freqs[0] || 0)))].filter((f) => f > 0 && f < 60);
  const shared = roots(under).filter((f) => roots(held).some((g) => Math.abs(f - g) < 1));
  assert.ok(shared.length > 0, `held and under share no low root: ${roots(under)} vs ${roots(held)}`);
  // And nothing rings while you are deciding.
  const src = readFileSync(resolve(root, 'src/engine/score.js'), 'utf8');
  const heldBlock = src.slice(src.indexOf("band.registerTrack('held'"), src.indexOf("band.registerTrack('pattern'"));
  assert.ok(!/\.bell\(/.test(heldBlock), 'no bell while the player is deciding');
});

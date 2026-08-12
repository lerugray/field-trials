// Music bed playback (M9). Proves the pure phase->track selector, the bed-volume +
// mute math, and the driver's behaviour over an injectable fake audio element: it
// loops looping tracks, keeps a track playing across same-track phase changes,
// switches on a real change, honours the gesture gate, and goes silent on mute.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  trackForPhase, bedVolume, createMusicPlayer,
  MUSIC_TRACKS, MUSIC_CREDIT, BED_CEILING,
} from '../src/audio/music.js';

// A fake audio element recording what the driver does to it.
function fakeAudioFactory(log) {
  return () => {
    const el = {
      src: '', loop: false, volume: 1, currentTime: 0, plays: 0, pauses: 0,
      play() { this.plays++; log.push('play:' + this.src); return Promise.resolve(); },
      pause() { this.pauses++; log.push('pause:' + this.src); },
    };
    return el;
  };
}

const EMBEDDED_SOURCES = {
  [MUSIC_TRACKS.hangar.file]: 'data:audio/ogg;base64,HANGAR',
  [MUSIC_TRACKS.corridor.file]: 'data:audio/ogg;base64,CORRIDOR',
  [MUSIC_TRACKS.fanfare.file]: 'data:audio/ogg;base64,FANFARE',
};

function player(log = [], deps = {}) {
  return createMusicPlayer({
    makeAudio: fakeAudioFactory(log),
    getVolume: () => 1,
    sources: EMBEDDED_SOURCES,
    ...deps,
  });
}

test('trackForPhase maps run phases to the right bed', () => {
  assert.equal(trackForPhase('hub'), 'hangar');
  assert.equal(trackForPhase('briefing'), 'hangar');
  assert.equal(trackForPhase('level'), 'corridor');
  assert.equal(trackForPhase('map'), 'corridor');
  assert.equal(trackForPhase('results', { victory: true }), 'fanfare');
  assert.equal(trackForPhase('results', { victory: false }), 'hangar');
  assert.equal(trackForPhase('nonsense'), null);
});

test('the M12 title phase maps to the title socket (pending an operator file)', () => {
  assert.equal(trackForPhase('title'), 'title');
  assert.ok(MUSIC_TRACKS.title, 'title track slot exists');
  assert.ok(MUSIC_TRACKS.title.file.endsWith('.ogg'), 'title slot names an .ogg');
  assert.equal(MUSIC_TRACKS.title.pending, true, 'title slot is a not-yet-shipped socket');
});

test('every logical track names a real shipped file + Abel Aeolian credit', () => {
  for (const t of ['hangar', 'corridor', 'fanfare']) {
    assert.ok(MUSIC_TRACKS[t].file.endsWith('.ogg'), `${t} has no .ogg file`);
  }
  assert.match(MUSIC_CREDIT, /Abel Aeolian/);
});

test('bedVolume scales by the ceiling and mute silences it', () => {
  assert.equal(bedVolume(1, false), BED_CEILING);
  assert.equal(bedVolume(0.5, false), 0.5 * BED_CEILING);
  assert.equal(bedVolume(1, true), 0); // muted -> silent
  assert.equal(bedVolume(NaN, false), 0.5 * BED_CEILING); // default fallback
});

test('driver loads, loops, and plays the phase track once started', () => {
  const log = [];
  const m = player(log, { isMuted: () => false });
  m.start();
  m.setPhase('hub');
  assert.equal(m.currentTrack(), 'hangar');
  const el = m._el();
  assert.equal(el.src, EMBEDDED_SOURCES[MUSIC_TRACKS.hangar.file]);
  assert.equal(el.loop, true);
  assert.equal(el.volume, BED_CEILING);
  assert.ok(el.plays >= 1, 'should have attempted playback after start()');
});

test('the fanfare does not loop', () => {
  const m = player();
  m.start();
  m.setPhase('results', { victory: true });
  assert.equal(m.currentTrack(), 'fanfare');
  assert.equal(m._el().loop, false);
});

test('a same-track phase change does NOT restart the element', () => {
  const log = [];
  const m = player(log);
  m.start();
  m.setPhase('hub');       // hangar
  const el1 = m._el();
  m.setPhase('briefing');  // still hangar
  assert.strictEqual(m._el(), el1, 'element should be reused across same-track phases');
});

test('a real track change switches elements and pauses the old one', () => {
  const log = [];
  const m = player(log);
  m.start();
  m.setPhase('hub');    // hangar
  m.setPhase('level');  // corridor
  assert.equal(m.currentTrack(), 'corridor');
  assert.ok(log.some((l) => l.startsWith('pause:')), 'old track should be paused on switch');
});

test('nothing plays before start() (the browser gesture gate)', () => {
  const log = [];
  const m = player(log);
  m.setPhase('hub'); // loaded but not started
  assert.equal(m.currentTrack(), 'hangar');
  assert.equal(m._el().plays, 0, 'must not autoplay before a gesture');
  m.start();
  assert.ok(m._el().plays >= 1, 'start() begins playback');
});

test('mute drives the element volume to zero; refresh re-reads it', () => {
  let muted = false;
  const m = player([], { isMuted: () => muted });
  m.start();
  m.setPhase('hub');
  assert.equal(m._el().volume, BED_CEILING);
  muted = true;
  m.refresh();
  assert.equal(m._el().volume, 0);
});

test('with no audio available the driver no-ops silently', () => {
  const m = createMusicPlayer({ makeAudio: null, getVolume: () => 1, sources: EMBEDDED_SOURCES });
  m.start();
  m.setPhase('hub'); // must not throw
  assert.equal(m._el(), null);
  assert.equal(m.isPlaying(), false);
});

test('an absent or pending source does not create, assign, or play audio', () => {
  const made = [];
  const m = createMusicPlayer({
    makeAudio: fakeAudioFactory(made),
    getVolume: () => 1,
    sources: EMBEDDED_SOURCES,
  });
  m.start();
  m.setPhase('title');

  assert.equal(m.currentTrack(), null);
  assert.equal(m._el(), null);
  assert.deepEqual(made, []);
});

test('an injected embedded source is assigned verbatim', () => {
  const source = 'data:audio/ogg;base64,TEST_EMBED';
  const m = createMusicPlayer({
    makeAudio: fakeAudioFactory([]),
    sources: { [MUSIC_TRACKS.hangar.file]: source },
  });
  m.setPhase('hub');
  assert.equal(m._el().src, source);
});

// THE AUDIO BUS — collection-contract item 6, as behaviour:
//
//   "One audio bus (single master gain), unlocked on first user gesture, no pre-gesture autoplay,
//    honoured by mute(bool)."
//
// Every clause is asserted here rather than described, because all four are the kind of property
// that is true on the day it is written and quietly false three milestones later when someone
// routes one new sound directly at the destination "just for now".
//
// The stub context below records its own graph, so "one bus" can be checked the only way that
// actually means anything: by proving every sound-producing node's path terminates at the master
// gain, not by counting gain nodes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, SFX } from '../src/audio.js';
import { createFacility } from '../src/model.js';

// ---- a recording stub AudioContext -----------------------------------------------------------------

function stubContext() {
  const edges = []; // [from, to]
  const nodes = [];
  let id = 0;

  const param = () => ({
    value: 0,
    setValueAtTime() {
      return this;
    },
    linearRampToValueAtTime() {
      return this;
    },
    exponentialRampToValueAtTime() {
      return this;
    },
    cancelScheduledValues() {
      return this;
    },
  });

  function node(kind) {
    const n = {
      kind,
      id: id++,
      gain: param(),
      frequency: param(),
      Q: param(),
      detune: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      type: '',
      buffer: null,
      loop: false,
      connect(to) {
        edges.push([n, to]);
        return to;
      },
      disconnect() {},
      start() {},
      stop() {},
    };
    nodes.push(n);
    return n;
  }

  const destination = node('destination');
  const ctx = {
    sampleRate: 44100,
    currentTime: 0,
    state: 'running',
    destination,
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('source'),
    createConvolver: () => node('convolver'),
    createDynamicsCompressor: () => node('compressor'),
    createBuffer: (ch, len) => ({
      numberOfChannels: ch,
      length: len,
      getChannelData: () => new Float32Array(len),
    }),
    close() {},
    _edges: edges,
    _nodes: nodes,
  };
  return ctx;
}

// Walk the graph forward from `from`; true if it ever reaches `to`.
function reaches(ctx, from, to) {
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const n = stack.pop();
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const [a, b] of ctx._edges) if (a === n) stack.push(b);
  }
  return false;
}

// ---- no pre-gesture autoplay -------------------------------------------------------------------------

test('there is no audio context at all until a gesture unlocks it', () => {
  let built = 0;
  const audio = createAudio({
    contextFactory: () => {
      built++;
      return stubContext();
    },
  });
  // Constructing the surface, and even driving it, must not create a context: contract item 6's
  // "no pre-gesture autoplay" is a state the game cannot leave rather than a policy it follows.
  audio.update({ facility: createFacility({ seed: 'quiet' }), overlay: null });
  audio.play('stamp');
  audio.setMuted(true);
  assert.equal(built, 0, 'audio built a context before any gesture');
  assert.equal(audio.live, false);

  audio.unlock();
  assert.equal(built, 1);
  assert.equal(audio.live, true);
});

test('unlock is idempotent, so it can hang off every input event', () => {
  let built = 0;
  const audio = createAudio({
    contextFactory: () => {
      built++;
      return stubContext();
    },
  });
  for (let i = 0; i < 25; i++) audio.unlock();
  assert.equal(built, 1, 'repeated gestures built more than one context');
});

test('a host with no audio at all leaves the game playable and silent', () => {
  const audio = createAudio({
    contextFactory: () => {
      throw new Error('no audio on this device');
    },
  });
  assert.doesNotThrow(() => audio.unlock());
  assert.equal(audio.live, false);
  // Every surface stays callable and inert. Audio is never a correctness dependency.
  assert.doesNotThrow(() => audio.update({ facility: createFacility({ seed: 'silent' }), overlay: null }));
  assert.equal(audio.play('stamp'), false);
  assert.doesNotThrow(() => audio.setMuted(true));
  assert.doesNotThrow(() => audio.dispose());
});

// ---- one bus -------------------------------------------------------------------------------------------

test('ONE bus: every effect routes through the master gain, never straight to the destination', () => {
  const ctx = stubContext();
  const audio = createAudio({ contextFactory: () => ctx });
  audio.unlock();

  // The master is the single gain wired to the destination.
  const toDest = ctx._edges.filter(([, b]) => b === ctx.destination).map(([a]) => a);
  assert.equal(toDest.length, 1, `${toDest.length} nodes connect to the destination; exactly one bus may`);
  const master = toDest[0];

  for (const name of SFX) {
    const before = ctx._nodes.length;
    assert.equal(audio.play(name), true, `${name} did not play`);
    const made = ctx._nodes.slice(before);
    assert.ok(made.length > 0, `${name} produced no nodes`);
    // Every source it created must reach the master, and none may reach the destination directly.
    for (const n of made) {
      if (n.kind !== 'osc' && n.kind !== 'source') continue;
      assert.ok(reaches(ctx, n, master), `${name}: a ${n.kind} does not route through the master bus`);
    }
  }
  const stillOne = ctx._edges.filter(([, b]) => b === ctx.destination).length;
  assert.equal(stillOne, 1, 'an effect opened a second path to the destination');
});

test('the band is built onto the master bus, not onto the destination', () => {
  const ctx = stubContext();
  const audio = createAudio({ contextFactory: () => ctx });
  audio.unlock();
  const toDest = ctx._edges.filter(([, b]) => b === ctx.destination).map(([a]) => a);
  assert.equal(toDest.length, 1);
  assert.ok(audio.band, 'no band was built');
});

// ---- mute -------------------------------------------------------------------------------------------------

test('mute(bool) is honoured, and is remembered across an unlock', () => {
  const ctx = stubContext();
  const audio = createAudio({ contextFactory: () => ctx });
  audio.unlock();
  audio.setMuted(true);
  assert.equal(audio.muted, true);
  audio.setMuted(false);
  assert.equal(audio.muted, false);

  // Muted before there is anything to mute: the intent has to survive until the bus exists, or the
  // first gesture would blare at a player who muted the game on the pause surface.
  const ctx2 = stubContext();
  const later = createAudio({ contextFactory: () => ctx2 });
  later.setMuted(true);
  later.unlock();
  assert.equal(later.muted, true);
  const master = ctx2._edges.filter(([, b]) => b === ctx2.destination).map(([a]) => a)[0];
  assert.equal(master.gain.value, 0, 'the bus came up loud despite being muted before unlock');
});

// ---- the game's state, as music -----------------------------------------------------------------------------

test('update maps the facility onto the score without touching the facility', () => {
  const ctx = stubContext();
  const audio = createAudio({ contextFactory: () => ctx });
  audio.unlock();
  const f = createFacility({ seed: 'readonly' });
  const before = JSON.stringify(f);
  const view = { facility: f, overlay: null };
  for (let i = 0; i < 5; i++) audio.update(view);
  assert.equal(JSON.stringify(f), before, 'the audio layer mutated the facility');
  assert.equal(audio.scene, 'lobby');
});

test('a closed tenure changes the track; an overlay does not', () => {
  const ctx = stubContext();
  const audio = createAudio({ contextFactory: () => ctx });
  audio.unlock();
  const f = createFacility({ seed: 'closing' });
  audio.update({ facility: f, overlay: null });
  assert.equal(audio.scene, 'lobby');
  audio.update({ facility: f, overlay: 'checklist' });
  assert.equal(audio.scene, 'lobby', 'an overlay cut the music');
  f.status = 'condemned';
  audio.update({ facility: f, overlay: 'closed' });
  assert.equal(audio.scene, 'closed');
});

test('an unknown effect name is ignored rather than thrown', () => {
  const ctx = stubContext();
  const audio = createAudio({ contextFactory: () => ctx });
  audio.unlock();
  assert.equal(audio.play('trumpet-fanfare'), false);
  // A garnish must never be able to take down a cycle commit.
  assert.doesNotThrow(() => audio.play(undefined));
});

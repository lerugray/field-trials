// band.js — THE BAND KIT. A portable procedural WebAudio band: synthesised
// instruments, a bus architecture with a send reverb, and a lookahead step
// scheduler. Zero assets, zero fetches, zero dependencies (hard rule 2: all
// assets code-generated). Register-specific tuning belongs in presets or scores,
// never in this canonical kit.
//
// ============================================================================
// THE API (this header is the kit's documentation — other games adopt this file
// verbatim and write their own tracks module beside it)
// ============================================================================
//
// NOTE TO THE READER: these examples show only calls, never the ES module lines
// that would normally head them. scripts/build-singlefile.mjs discovers each
// module's dependencies with a plain regex that does not skip comments, so
// mentioning the ES keyword — or any quoted module path — in a comment above the
// real dependency list registers as a bogus extra dependency and breaks the
// single-file build. Pull createBand / noteFreq / chord out the usual way.
//
//   const band = createBand({
//     ctx, destination: someGainNode, seed: worldSeed,
//     performance: { // optional; omitted is exactly neutral
//       humanize: { timingMs: [-8, 8], velocity: [-0.05, 0.05], swing: 0.12 },
//       releaseTail: 0.4, // added to pad/drone note releases
//       voices: { pad: { releaseTail: 0.8 } }, // per-voice overrides
//     },
//   });
//
//   band.registerTrack('example', {
//     bpm: 40,          // a STEP is a sixteenth: stepSeconds = 60 / bpm / 4
//     len: 64,          // steps in one loop (16 steps = one bar)
//     vol: 0.8,         // this track's level on the music bus
//     step(i, t, s) {   // i = step within the loop, t = ctx time to schedule AT
//       if (i === 0) s.v.drone(t, noteFreq('D1'), 16, { vol: 0.10 });
//       if (i === 23) s.v.bell(t, noteFreq('A5'), 4, { vol: 0.07 });
//     },
//   });
//
//   band.setTrack('example');   // crossfades: old track's bus down, new one up
//   band.setTrack('example', { now: 12.5, fadeIn: 0.05 }); // optional clock override
//                              // for OfflineAudioContext (currentTime frozen until render)
//   band.tick();               // schedule the lookahead window — CALL THIS EVERY FRAME
//   band.setParams({ intensity: 0.7 });  // live params, no track restart
//
// THIS PORT HAS NO start()/stop(). The upstream kit drives its scheduler off a
// setInterval; MATERIAL BREACH's pacing law (hard rule 3) bans every timer token
// from every src file but boot.js, and Gate 1 asserts it. Rather than exempt the
// audio layer, the port DELETED the timer: the host calls tick() from the same
// draw-only animation frame that already drives the renderer. See the note above
// dispose(). Consequence for a reader: audio advances only while frames are drawn,
// which is correct — a backgrounded tab should not keep scheduling notes.
//
// `step(i, t, s)` receives a step context `s`:
//   s.v        the instrument voices (see below) — call them with an absolute
//              ctx time `t`; they build and free their own nodes
//   s.i        step within the loop (0..len-1)
//   s.n        absolute step count since the track started (never wraps —
//              key long-form drift off this)
//   s.bar      bar within the loop, i.e. (i / 16 | 0)
//   s.params   the live params object from setParams (intensity layers)
//   s.rand(k)  DETERMINISTIC [0,1) for this step, salted by k. Seeded off the
//              band's seed + n via prng.hash2 — never Math.random, so a seeded
//              world always drifts the same way.
//
// VOICES (`band.voices`, or `s.v` inside a step). All take (t, freq, dur, opts)
// except air/kick/snare/hat. `dur` is seconds of sustain; the release tail runs
// past it. Every voice routes dry to the active track bus and wet to the shared
// send reverb, so a track change cannot bleed the old track's notes back in.
//   pad    (t, freq, dur, o)  detuned saw stack + swept lowpass — the harmonic bed
//   drone  (t, freq, dur, o)  sine + sub (+ optional detuned partner / glide) — the floor
//   bell   (t, freq, dur, o)  detuned sine partial stack — sparse events
//   pluck  (t, freq, dur, o)  triangle + fast filter decay — short figures
//   bass   (t, freq, dur, o)  saw + sub through a resonant lowpass — pulse/weight
//   lead   (t, freq, dur, o)  square/triangle + vibrato — melody
//   air    (t, dur, o)        filtered noise with a swept band — texture/breath
//   kick / snare / hat        (t, o) percussion voices
// Common opts: vol, wave, cut (filter Hz), sweep (cut multiplier by end), q,
// a/d/s/r (envelope, seconds), verb (send amount 0..1), det (detune cents),
// ratios (bell partials), glide (drone end freq), hp/bp (air band).
//
// DETERMINISM. The reverb impulse response and the noise buffer are filled from
// a seeded mulberry32, and s.rand is a seeded hash — so nothing in the audio
// path calls Math.random. Same seed, same score.
//
// HEADLESS SAFETY. Nothing at module-load time touches `window`. createBand needs a
// real AudioContext; callers that may not have one guard the call (see
// audio.js). tick(now) is callable by hand, which is how the tests drive the
// scheduler without timers or a browser — which, since this port removed start(),
// is now also exactly how the game itself drives it.

import { mulberry32, hash2 } from './prng.js';

// ---------------------------------------------------------------------------
// note names -> frequency. 'D1', 'Bb2', 'F#4'. A number passes straight through.
// ---------------------------------------------------------------------------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteFreq(name) {
  if (typeof name === 'number') {
    if (Number.isFinite(name) && name > 0) return name;
    throw new TypeError(`noteFreq: expected a positive finite frequency, got ${name}`);
  }
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name));
  if (!m) throw new TypeError(`noteFreq: invalid note name "${name}"`);
  const s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const oct = parseInt(m[3], 10);
  return 440 * Math.pow(2, (s - 9) / 12 + (oct - 4));
}

/** Chord helper: note names -> frequencies. */
export function chord(names) { return names.map(noteFreq); }

// A tiny positive floor — exponential ramps cannot reach or cross zero.
const EPS = 0.0001;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const PERFORMANCE_VOICE_NAMES = Object.freeze(['pad', 'drone', 'bell', 'pluck', 'bass', 'lead', 'air', 'kick', 'snare', 'hat']);
const PERFORMANCE_VOICE_INDEX = Object.freeze(Object.fromEntries(PERFORMANCE_VOICE_NAMES.map((name, index) => [name, index])));
const VOICE_OPTION_INDEX = Object.freeze({ pad: 3, drone: 3, bell: 3, pluck: 3, bass: 3, lead: 3, air: 2, kick: 1, snare: 1, hat: 1 });
const RELEASE_VOICES = new Set(['pad', 'drone']);
const normalizedPerformanceConfigs = new WeakSet();

function normalizeRange(value, name) {
  if (value === undefined) return Object.freeze([0, 0]);
  if (!Array.isArray(value) || value.length !== 2
    || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))
    || value[0] > value[1]) {
    throw new TypeError(`${name}: expected [min, max] finite numbers with min <= max`);
  }
  return Object.freeze([value[0], value[1]]);
}

function normalizeHumanize(value = {}, name = 'performance.humanize') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}: expected an object`);
  for (const key of Object.keys(value)) {
    if (!['timingMs', 'velocity', 'swing'].includes(key)) throw new TypeError(`${name}.${key}: unknown field`);
  }
  const timingMs = normalizeRange(value.timingMs, `${name}.timingMs`);
  const velocity = normalizeRange(value.velocity, `${name}.velocity`);
  if (timingMs[0] < -50 || timingMs[1] > 50) throw new RangeError(`${name}.timingMs: values must be between -50 and 50`);
  if (velocity[0] < -1 || velocity[1] > 1) throw new RangeError(`${name}.velocity: values must be between -1 and 1`);
  const swing = value.swing ?? 0;
  if (typeof swing !== 'number' || !Number.isFinite(swing) || swing < 0 || swing > 1) {
    throw new RangeError(`${name}.swing: must be between 0 and 1`);
  }
  return Object.freeze({ timingMs, velocity, swing });
}

/** Validate and normalize the register-neutral performance tool configuration. */
export function normalizePerformance(performance) {
  if (performance === undefined) return null;
  if (performance && normalizedPerformanceConfigs.has(performance)) return performance;
  if (performance === null || typeof performance !== 'object' || Array.isArray(performance)) {
    throw new TypeError('performance: expected an object');
  }
  for (const key of Object.keys(performance)) {
    if (!['humanize', 'releaseTail', 'voices'].includes(key)) throw new TypeError(`performance.${key}: unknown field`);
  }
  const releaseTail = performance.releaseTail ?? 0;
  if (typeof releaseTail !== 'number' || !Number.isFinite(releaseTail) || releaseTail < 0 || releaseTail > 30) {
    throw new RangeError('performance.releaseTail: must be between 0 and 30 seconds');
  }
  const humanize = normalizeHumanize(performance.humanize);
  const givenVoices = performance.voices ?? {};
  if (givenVoices === null || typeof givenVoices !== 'object' || Array.isArray(givenVoices)) {
    throw new TypeError('performance.voices: expected an object');
  }
  const voices = {};
  for (const [voice, value] of Object.entries(givenVoices)) {
    if (!PERFORMANCE_VOICE_NAMES.includes(voice)) throw new TypeError(`performance.voices.${voice}: unknown voice`);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`performance.voices.${voice}: expected an object`);
    for (const key of Object.keys(value)) {
      if (!['humanize', 'releaseTail'].includes(key)) throw new TypeError(`performance.voices.${voice}.${key}: unknown field`);
    }
    if (value.releaseTail !== undefined && !RELEASE_VOICES.has(voice)) {
      throw new TypeError(`performance.voices.${voice}.releaseTail: release tails are supported only for pad and drone`);
    }
    const voiceRelease = value.releaseTail ?? releaseTail;
    if (typeof voiceRelease !== 'number' || !Number.isFinite(voiceRelease) || voiceRelease < 0 || voiceRelease > 30) {
      throw new RangeError(`performance.voices.${voice}.releaseTail: must be between 0 and 30 seconds`);
    }
    let ownHumanize = humanize;
    if (value.humanize !== undefined) {
      if (value.humanize === null || typeof value.humanize !== 'object' || Array.isArray(value.humanize)) {
        throw new TypeError(`performance.voices.${voice}.humanize: expected an object`);
      }
      ownHumanize = normalizeHumanize({
        timingMs: value.humanize.timingMs ?? humanize.timingMs,
        velocity: value.humanize.velocity ?? humanize.velocity,
        swing: value.humanize.swing ?? humanize.swing,
      }, `performance.voices.${voice}.humanize`);
    }
    voices[voice] = Object.freeze({ humanize: ownHumanize, releaseTail: voiceRelease });
  }
  const normalized = Object.freeze({ humanize, releaseTail, voices: Object.freeze(voices) });
  normalizedPerformanceConfigs.add(normalized);
  return normalized;
}

function performanceForVoice(performance, voice) {
  return performance?.voices[voice] ?? Object.freeze({
    humanize: performance?.humanize ?? Object.freeze({ timingMs: Object.freeze([0, 0]), velocity: Object.freeze([0, 0]), swing: 0 }),
    releaseTail: performance?.releaseTail ?? 0,
  });
}

/** Largest additional release requested by a score, used to retain render tails. */
export function performanceReleaseTail(performance) {
  const normalized = normalizePerformance(performance);
  if (!normalized) return 0;
  return Math.max(...[...RELEASE_VOICES].map((voice) => performanceForVoice(normalized, voice).releaseTail));
}

/** Pure deterministic adjustment shared by synth scheduling and sample custody. */
export function performanceAdjustment(performance, { seed, absoluteStep, stepIndex, stepSeconds, voice, call = 0 }) {
  const normalized = normalizePerformance(performance);
  const resolved = performanceForVoice(normalized, voice);
  const { timingMs, velocity, swing } = resolved.humanize;
  const lane = (PERFORMANCE_VOICE_INDEX[voice] ?? PERFORMANCE_VOICE_NAMES.length) * 0x10000 + call;
  const timingDraw = hash2(absoluteStep, lane * 2 + 0x1000, (seed >>> 0) || 1);
  const velocityDraw = hash2(absoluteStep, lane * 2 + 0x1001, (seed >>> 0) || 1);
  const jitterSeconds = (timingMs[0] + (timingMs[1] - timingMs[0]) * timingDraw) / 1000;
  const swingSeconds = (stepIndex & 1) ? swing * stepSeconds * 0.5 : 0;
  return Object.freeze({
    timeSeconds: jitterSeconds + swingSeconds,
    velocity: velocity[0] + (velocity[1] - velocity[0]) * velocityDraw,
    releaseTail: RELEASE_VOICES.has(voice) ? resolved.releaseTail : 0,
  });
}

/**
 * Conservative register-neutral tuning. Register presets may override any of
 * these values through createBand({ ...band, voiceDefaults: voices }).
 */
export const NEUTRAL_DEFAULTS = Object.freeze({
  band: Object.freeze({
    gain: 0.5,
    reverb: Object.freeze({ seconds: 0.7, decay: 1.4 }),
    reverbReturnGain: 0.18,
    lookahead: 0.22,
    tickMs: 25,
    fadeOut: 0.08,
    fadeIn: 0.08,
    retireTail: 0.75,
  }),
  voices: Object.freeze({
    pad: Object.freeze({ verb: 0.12, cut: 1600, sweep: 1.1, q: 0.7, det: 3, vol: 0.08, wave: 'triangle', a: 0.04, d: 0.12, s: 0.65, r: 0.25 }),
    drone: Object.freeze({ verb: 0.08, cut: 800, q: 0.7, vol: 0.08, beat: 0, wave: 'sine', a: 0.03, d: 0.15, s: 0.75, r: 0.3 }),
    bell: Object.freeze({ verb: 0.2, ratios: Object.freeze([1, 2, 3, 4]), levels: Object.freeze([1, 0.35, 0.18, 0.08]), vol: 0.06, a: 0.004, dScale: 0.5, s: 0.01, r: 0.35, holdScale: 0.25 }),
    pluck: Object.freeze({ verb: 0.12, cut: 2800, wave: 'triangle', a: 0.003, dScale: 0.45, s: 0.05, r: 0.15, vol: 0.06, holdScale: 0.4 }),
    bass: Object.freeze({ verb: 0.05, cut: 600, q: 1.2, vol: 0.1, wave: 'sawtooth', a: 0.01, dScale: 0.3, s: 0.45, r: 0.12, holdScale: 0.75 }),
    lead: Object.freeze({ verb: 0.1, cut: 2400, q: 1.2, wave: 'triangle', vibrato: 4.5, vibratoDepth: 0.003, a: 0.03, d: 0.15, s: 0.65, r: 0.2, vol: 0.07 }),
    air: Object.freeze({ verb: 0.1, type: 'bandpass', bp: 1200, sweep: 1.2, q: 0.8, attackScale: 0.08, decayScale: 0.15, s: 0.5, r: 0.25, vol: 0.025 }),
    kick: Object.freeze({ f0: 130, f1: 40, dur: 0.24, vol: 0.3 }),
    snare: Object.freeze({ bp: 1900, q: 0.8, dur: 0.15, vol: 0.11, verb: 0.12 }),
    hat: Object.freeze({ hp: 7000, dur: 0.05, vol: 0.04, verb: 0.08 }),
  }),
});

// Scheduler constants. LOOKAHEAD is how far ahead of currentTime we schedule;
// TICK_MS how often the driver wakes. MAX_STEPS_PER_TICK stops a pathological
// clock jump (tab wake, breakpoint) from scheduling thousands of notes at once.
export const LOOKAHEAD = NEUTRAL_DEFAULTS.band.lookahead;
export const TICK_MS = NEUTRAL_DEFAULTS.band.tickMs;
export const MAX_STEPS_PER_TICK = 64;

// Register-neutral crossfade and retirement defaults.
export const FADE_OUT = NEUTRAL_DEFAULTS.band.fadeOut;
export const FADE_IN = NEUTRAL_DEFAULTS.band.fadeIn;
// How long a retired track bus lingers before disconnect — long enough for the
// longest voice release to finish under the fade.
export const RETIRE_TAIL = NEUTRAL_DEFAULTS.band.retireTail;

export class BandStepError extends Error {
  constructor({ track, index, absoluteStep, scheduledTime, cause }) {
    super(`track "${track}" step ${index} (absolute ${absoluteStep}, t=${scheduledTime.toFixed(6)}): ${cause?.message || cause}`);
    this.name = 'BandStepError';
    this.track = track;
    this.index = index;
    this.absoluteStep = absoluteStep;
    this.scheduledTime = scheduledTime;
    this.cause = cause;
  }
}

/**
 * Build a band on an existing AudioContext.
 * @param {object}   o
 * @param {AudioContext} o.ctx          required
 * @param {AudioNode} [o.destination]   where the band's output goes (default ctx.destination)
 * @param {number}   [o.seed]           seeds the reverb IR, the noise buffer, and s.rand
 * @param {number}   [o.gain]           the band's output level
 * @param {object}   [o.reverb]         { seconds, decay } of the generated IR
 * @param {Function} [o.nowFn]          scheduler clock (default ctx.currentTime)
 * @param {boolean}  [o.strict]         collect step failures for authoring renders
 * @param {boolean}  [o.disconnectRetired] disconnect expired buses (disable while pre-scheduling offline)
 * @param {object}   [o.performance]    deterministic humanize/release tools; omitted is neutral
 */
export function createBand({
  ctx,
  destination = null,
  seed = 1,
  gain = NEUTRAL_DEFAULTS.band.gain,
  reverb = NEUTRAL_DEFAULTS.band.reverb,
  reverbReturnGain = NEUTRAL_DEFAULTS.band.reverbReturnGain,
  lookahead = LOOKAHEAD,
  tickMs = TICK_MS,
  fadeOut = FADE_OUT,
  fadeIn = FADE_IN,
  retireTail = RETIRE_TAIL,
  voiceDefaults = {},
  performance = undefined,
  nowFn = () => ctx.currentTime,
  strict = false,
  disconnectRetired = true,
} = {}) {
  if (!ctx) throw new Error('createBand: needs an AudioContext');
  if (typeof nowFn !== 'function') throw new Error('createBand: nowFn must be a function');
  const rngSeed = (seed >>> 0) || 1;
  const resolvedVoiceDefaults = Object.fromEntries(
    Object.entries(NEUTRAL_DEFAULTS.voices).map(([name, defaults]) => [
      name,
      { ...defaults, ...(voiceDefaults[name] || {}) },
    ]),
  );
  const resolvedPerformance = normalizePerformance(performance);

  function readNow(explicitNow) {
    const now = explicitNow === undefined ? nowFn() : explicitNow;
    if (typeof now !== 'number' || !Number.isFinite(now) || now < 0) {
      throw new Error('band clock: expected a finite non-negative time');
    }
    return now;
  }

  // -- bus architecture ------------------------------------------------------
  //   voices -> trackBus.out ---------------------\
  //          \-> sendGain -> trackBus.send -> verb -> verbReturn -> out -> destination
  //                                                       music bus  ^
  // The per-track bus is what makes a scene change clean: both its dry out and
  // its reverb send are ramped down together, so nothing from the outgoing
  // track can fade back in when the incoming one rises.
  const out = ctx.createGain();
  out.gain.value = gain;
  const comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;
  if (comp) {
    // Gentle glue so overlapping ambient pads never clip the sum.
    try {
      comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 3;
      comp.attack.value = 0.01; comp.release.value = 0.3;
    } catch (_) { /* a stub context without full params — harmless */ }
    out.connect(comp);
    comp.connect(destination || ctx.destination);
  } else {
    out.connect(destination || ctx.destination);
  }

  const verb = makeVerb(ctx, reverb, rngSeed);
  const verbReturn = ctx.createGain();
  verbReturn.gain.value = reverbReturnGain;
  if (verb) { verb.connect(verbReturn); verbReturn.connect(out); }

  const noiseBuf = makeNoise(ctx, rngSeed ^ 0x5bf03635);

  // -- track buses -----------------------------------------------------------
  let bus = null;        // the live track's { out, send, vol }
  const retiring = [];   // buses fading out, disposed on a later tick

  function makeBus(vol, now, fadeSeconds) {
    const o = ctx.createGain();
    o.gain.value = EPS;
    o.connect(out);
    const s = ctx.createGain();
    s.gain.value = EPS;
    if (verb) s.connect(verb);
    return { out: o, send: s, vol, fadeStart: now, fadeSeconds };
  }

  function retire(b, now) {
    if (!b) return;
    const progress = b.fadeSeconds === 0
      ? 1
      : clamp01((now - b.fadeStart) / b.fadeSeconds);
    const outLevel = EPS + (b.vol - EPS) * progress;
    const sendLevel = EPS + (1 - EPS) * progress;
    ramp(b.out.gain, outLevel, EPS, now, fadeOut);
    ramp(b.send.gain, sendLevel, EPS, now, fadeOut);
    retiring.push({ bus: b, disposeAt: now + fadeOut + retireTail });
  }

  function sweepRetired(now) {
    for (let i = retiring.length - 1; i >= 0; i--) {
      if (retiring[i].disposeAt <= now) {
        if (disconnectRetired) {
          try { retiring[i].bus.out.disconnect(); retiring[i].bus.send.disconnect(); } catch (_) { /* ignore */ }
        }
        retiring.splice(i, 1);
      }
    }
  }

  // A voice's dry destination, and its wet tap. With no live bus (silence) the
  // voices still build correctly but land on a bus at EPS, i.e. inaudible.
  function dry() { return bus ? bus.out : out; }
  function send(node, amount) {
    if (!amount || !bus) return;
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(bus.send);
  }

  // -- envelope --------------------------------------------------------------
  // Attack to peak, decay to a sustain fraction, hold to `dur`, release out.
  // Exponential throughout (musical), floored at EPS.
  function env(g, t, { a = 0.4, d = 0.5, s = 0.6, r = 1.0, peak = 0.1, dur = 1 }) {
    const p = Math.max(EPS * 2, peak);
    const hold = Math.max(a + d, dur);
    try {
      g.gain.setValueAtTime(EPS, t);
      g.gain.exponentialRampToValueAtTime(p, t + a);
      g.gain.exponentialRampToValueAtTime(Math.max(EPS * 2, p * s), t + a + d);
      g.gain.setValueAtTime(Math.max(EPS * 2, p * s), t + hold);
      g.gain.exponentialRampToValueAtTime(EPS, t + hold + r);
    } catch (_) { /* param without full automation */ }
    return hold + r;
  }

  function ramp(param, from, to, t, secs) {
    try {
      param.setValueAtTime(Math.max(EPS, from), t);
      param.linearRampToValueAtTime(Math.max(EPS, to), t + secs);
    } catch (_) { try { param.value = to; } catch (__) { /* ignore */ } }
  }

  // ==========================================================================
  // VOICES
  // ==========================================================================

  // The harmonic bed: three detuned oscillators (one an octave down) through a
  // lowpass that sweeps open across the note — the slow filter movement is what
  // keeps a long pad from reading as a held organ chord.
  function pad(t, freq, dur, o = {}) {
    o = { ...resolvedVoiceDefaults.pad, ...o };
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const cut = o.cut;
    try {
      f.frequency.setValueAtTime(cut, t);
      f.frequency.linearRampToValueAtTime(cut * o.sweep, t + dur * 0.6);
      f.Q.value = o.q;
    } catch (_) { /* stub */ }
    f.connect(o1);
    const det = o.det;
    const vol = o.vol;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = o.wave;
      try { osc.frequency.value = freq * (i === 2 ? 0.5 : 1); osc.detune.value = (i - 1) * det; } catch (_) { /* stub */ }
      const g = ctx.createGain();
      const tail = env(g, t, { a: o.a, d: o.d, s: o.s, r: o.r, peak: vol * (i === 2 ? 0.7 : 1), dur });
      osc.connect(g); g.connect(f);
      osc.start(t); osc.stop(t + tail + 0.2);
    }
  }

  // A sine foundation with a sub octave, optional detuned partner, and glide.
  function drone(t, freq, dur, o = {}) {
    o = { ...resolvedVoiceDefaults.drone, ...o };
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    try { f.frequency.value = o.cut; f.Q.value = o.q; } catch (_) { /* stub */ }
    f.connect(o1);
    const vol = o.vol;
    const partners = o.beat ? [0, o.beat] : [0];
    for (const cents of partners) {
      for (const [mult, level] of [[1, 1], [0.5, 0.7]]) {
        const osc = ctx.createOscillator();
        osc.type = o.wave;
        try {
          osc.frequency.setValueAtTime(freq * mult, t);
          if (o.glide) osc.frequency.linearRampToValueAtTime(noteFreq(o.glide) * mult, t + dur);
          osc.detune.value = cents;
        } catch (_) { /* stub */ }
        const g = ctx.createGain();
        const tail = env(g, t, { a: o.a, d: o.d, s: o.s, r: o.r, peak: vol * level, dur });
        osc.connect(g); g.connect(f);
        osc.start(t); osc.stop(t + tail + 0.2);
      }
    }
  }

  // Sparse events: a configurable stack of sine partials.
  function bell(t, freq, dur, o = {}) {
    o = { ...resolvedVoiceDefaults.bell, ...o };
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb);
    const ratios = o.ratios;
    const levels = o.levels;
    const vol = o.vol;
    for (let i = 0; i < ratios.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      try { osc.frequency.value = freq * ratios[i]; } catch (_) { /* stub */ }
      const g = ctx.createGain();
      const tail = env(g, t, { a: o.a, d: dur * o.dScale, s: o.s, r: o.r, peak: vol * (levels[i] === undefined ? 0.1 : levels[i]), dur: dur * o.holdScale });
      osc.connect(g); g.connect(o1);
      osc.start(t); osc.stop(t + tail + 0.4);
    }
  }

  function pluck(t, freq, dur, o = {}) {
    o = { ...resolvedVoiceDefaults.pluck, ...o };
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const cut = o.cut;
    try {
      f.frequency.setValueAtTime(cut, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(120, cut * 0.18), t + Math.max(0.05, dur));
    } catch (_) { /* stub */ }
    f.connect(o1);
    const osc = ctx.createOscillator();
    osc.type = o.wave;
    try { osc.frequency.value = freq; } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const tail = env(g, t, { a: o.a, d: dur * o.dScale, s: o.s, r: o.r, peak: o.vol, dur: dur * o.holdScale });
    osc.connect(g); g.connect(f);
    osc.start(t); osc.stop(t + tail + 0.3);
  }

  function bass(t, freq, dur, o = {}) {
    o = { ...resolvedVoiceDefaults.bass, ...o };
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    try { f.frequency.value = o.cut; f.Q.value = o.q; } catch (_) { /* stub */ }
    f.connect(o1);
    const vol = o.vol;
    for (const [wave, mult, level] of [[o.wave, 1, 1], ['sine', 0.5, 0.6]]) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      try { osc.frequency.value = freq * mult; } catch (_) { /* stub */ }
      const g = ctx.createGain();
      const tail = env(g, t, { a: o.a, d: dur * o.dScale, s: o.s, r: o.r, peak: vol * level, dur: dur * o.holdScale });
      osc.connect(g); g.connect(f);
      osc.start(t); osc.stop(t + tail + 0.3);
    }
  }

  function lead(t, freq, dur, o = {}) {
    o = { ...resolvedVoiceDefaults.lead, ...o };
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    try { f.frequency.value = o.cut; f.Q.value = o.q; } catch (_) { /* stub */ }
    f.connect(o1);
    const osc = ctx.createOscillator();
    osc.type = o.wave;
    try { osc.frequency.value = freq; } catch (_) { /* stub */ }
    // A touch of vibrato so a sustained lead is not a test tone.
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    try { lfo.frequency.value = o.vibrato; lg.gain.value = freq * o.vibratoDepth; } catch (_) { /* stub */ }
    lfo.connect(lg); lg.connect(osc.frequency);
    const g = ctx.createGain();
    const tail = env(g, t, { a: o.a, d: o.d, s: o.s, r: o.r, peak: o.vol, dur });
    osc.connect(g); g.connect(f);
    osc.start(t); osc.stop(t + tail + 0.4);
    lfo.start(t); lfo.stop(t + tail + 0.4);
  }

  // Texture: the shared seeded noise buffer through a swept band.
  function air(t, dur, o = {}) {
    o = { ...resolvedVoiceDefaults.air, ...o };
    if (!noiseBuf) return;
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb);
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    const bp = o.bp;
    try {
      f.frequency.setValueAtTime(bp, t);
      f.frequency.linearRampToValueAtTime(bp * o.sweep, t + dur);
      f.Q.value = o.q;
    } catch (_) { /* stub */ }
    // src -> filter -> envelope gain -> bus
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    const tail = env(g, t, { a: o.a === undefined ? dur * o.attackScale : o.a, d: dur * o.decayScale, s: o.s, r: o.r, peak: o.vol, dur });
    src.connect(f); f.connect(g); g.connect(o1);
    src.start(t); src.stop(t + tail + 0.3);
  }

  // --- percussion -----------------------------------------------------------
  function kick(t, o = {}) {
    o = { ...resolvedVoiceDefaults.kick, ...o };
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    try {
      osc.frequency.setValueAtTime(o.f0, t);
      osc.frequency.exponentialRampToValueAtTime(o.f1, t + 0.11);
    } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const dur = o.dur;
    try {
      g.gain.setValueAtTime(o.vol, t);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    } catch (_) { /* stub */ }
    osc.connect(g); g.connect(dry());
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function snare(t, o = {}) {
    o = { ...resolvedVoiceDefaults.snare, ...o };
    if (!noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    try { f.frequency.value = o.bp; f.Q.value = o.q; } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const dur = o.dur;
    try {
      g.gain.setValueAtTime(o.vol, t);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    } catch (_) { /* stub */ }
    src.connect(f); f.connect(g); g.connect(dry());
    send(g, o.verb);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function hat(t, o = {}) {
    o = { ...resolvedVoiceDefaults.hat, ...o };
    if (!noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    try { f.frequency.value = o.hp; } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const dur = o.dur;
    try {
      g.gain.setValueAtTime(o.vol, t);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    } catch (_) { /* stub */ }
    src.connect(f); f.connect(g); g.connect(dry());
    send(g, o.verb);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const voices = { pad, drone, bell, pluck, bass, lead, air, kick, snare, hat };

  function performanceVoices(absoluteStep, stepIndex, stepSeconds) {
    if (!resolvedPerformance) return voices;
    const calls = Object.create(null);
    return Object.fromEntries(Object.entries(voices).map(([name, voice]) => [name, (...given) => {
      const args = [...given];
      const call = calls[name] ?? 0;
      calls[name] = call + 1;
      const adjusted = performanceAdjustment(resolvedPerformance, {
        seed: rngSeed, absoluteStep, stepIndex, stepSeconds, voice: name, call,
      });
      args[0] = Math.max(0, Number(args[0]) + adjusted.timeSeconds);
      const optionIndex = VOICE_OPTION_INDEX[name];
      const authored = args[optionIndex] || {};
      if (adjusted.velocity !== 0 || adjusted.releaseTail !== 0) {
        const played = { ...authored };
        if (adjusted.velocity !== 0) {
          const baseVol = authored.vol === undefined ? resolvedVoiceDefaults[name].vol : authored.vol;
          played.vol = Math.max(0, baseVol * (1 + adjusted.velocity));
        }
        if (adjusted.releaseTail !== 0) {
          const baseRelease = authored.r === undefined ? resolvedVoiceDefaults[name].r : authored.r;
          played.r = baseRelease + adjusted.releaseTail;
        }
        args[optionIndex] = played;
      }
      return voice(...args);
    }]));
  }

  // ==========================================================================
  // SCHEDULER — lookahead step scheduling against ctx.currentTime
  // ==========================================================================
  const tracks = new Map();
  let cur = null, curName = null;
  let step = 0, nextTime = 0;
  let params = {};
  const stepErrors = [];

  function registerTrack(name, spec) {
    if (!name || !spec || typeof spec.step !== 'function') throw new Error('registerTrack: needs { bpm, len, step }');
    tracks.set(name, {
      bpm: spec.bpm || 60,
      len: Math.max(1, spec.len | 0 || 16),
      vol: spec.vol === undefined ? 0.8 : spec.vol,
      step: spec.step,
    });
    return name;
  }

  /**
   * Schedule every step falling inside the lookahead window. Callable by hand
   * (the tests do exactly this) or driven by start()'s timer. Returns how many
   * steps it scheduled.
   */
  function tick(now) {
    now = readNow(now);
    sweepRetired(now);
    if (!cur) return 0;
    const spb = 60 / cur.bpm / 4;
    let scheduled = 0;
    while (nextTime < now + lookahead && scheduled < MAX_STEPS_PER_TICK) {
      if (nextTime < now) nextTime = now + 0.03;
      const i = step % cur.len;
      const n = step;
      try {
        cur.step(i, nextTime, {
          v: performanceVoices(n, i, spb), i, n, bar: (i / 16) | 0, params,
          rand: (salt = 0) => hash2(n, salt | 0, rngSeed),
        });
      } catch (cause) {
        if (strict) {
          stepErrors.push(new BandStepError({
            track: curName,
            index: i,
            absoluteStep: n,
            scheduledTime: nextTime,
            cause,
          }));
        }
        // Tolerant live/game mode intentionally continues scheduling. Strict
        // authoring callers inspect stepErrors and fail the render as a unit.
      }
      step += 1;
      nextTime += spb;
      scheduled += 1;
    }
    return scheduled;
  }

  /**
   * Change track with a crossfade. Same name is a no-op (so a shell may call
   * this every frame). `null` fades to silence. Returns true if it switched.
   */
  function setTrack(name, o = {}) {
    if (name === curName) return false;
    // o.now lets a headless renderer drive the clock when ctx.currentTime is
    // frozen (OfflineAudioContext before startRendering). Live callers omit it.
    const now = readNow(o.now);
    retire(bus, now);
    bus = null;
    curName = name;
    cur = name ? tracks.get(name) || null : null;
    step = 0;
    if (!cur) return true;
    const incomingFade = o.fadeIn === undefined ? fadeIn : o.fadeIn;
    bus = makeBus(cur.vol, now, incomingFade);
    ramp(bus.out.gain, EPS, cur.vol, now, incomingFade);
    ramp(bus.send.gain, EPS, 1, now, incomingFade);
    nextTime = now + 0.03;
    tick(now); // begin at once — no gap waiting for the driver's first wake
    return true;
  }

  /** Live intensity params. Merged, no track restart — steps read s.params. */
  function setParams(p) { params = { ...params, ...(p || {}) }; return params; }

  // THE PORT DROPS THE KIT'S TIMER DRIVER. Upstream, start() runs the scheduler on a
  // setInterval. That token may not appear anywhere in this game's src/ except boot.js
  // (the pacing law, hard rule 3, asserted by Gate 1 over every other file), and an
  // exemption would be the wrong fix: it would carve a hole in the law for the one
  // subsystem that most wants a clock of its own. Instead the HOST drives tick() from
  // the existing draw-only animation frame, which is already the sanctioned
  // presentation clock. The audio scheduler therefore rides the same loop as the
  // renderer, owns no timer, and cannot advance the sim any more than a drawn pixel can.
  function dispose() {
    const now = readNow();
    retire(bus, now);
    bus = null; cur = null; curName = null;
    try { out.disconnect(); } catch (_) { /* ignore */ }
  }

  return {
    voices,
    registerTrack,
    setTrack,
    setParams,
    tick,
    dispose,
    setGain: (v) => { try { out.gain.value = clamp01(v); } catch (_) { /* ignore */ } },
    get track() { return curName; },
    get step() { return step; },
    get params() { return { ...params }; },
    get trackNames() { return [...tracks.keys()]; },
    get retiringCount() { return retiring.length; },
    get stepErrors() { return [...stepErrors]; },
    get buses() { return { out, verb, verbReturn }; },
  };
}

// ---------------------------------------------------------------------------
// Generated impulse response: seeded exponentially-decaying noise. A convolver
// on a code-made IR is how you get a real reverb tail with zero assets.
// ---------------------------------------------------------------------------
function makeVerb(ctx, {
  seconds = NEUTRAL_DEFAULTS.band.reverb.seconds,
  decay = NEUTRAL_DEFAULTS.band.reverb.decay,
} = {}, seed = 1) {
  if (!ctx.createConvolver || !ctx.createBuffer) return null;
  try {
    const rate = ctx.sampleRate || 44100;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const rnd = mulberry32((seed ^ (c * 0x9e3779b9)) >>> 0);
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        d[i] = (rnd() * 2 - 1) * Math.pow(1 - x, decay) * (1 - Math.exp(-i / 200));
      }
    }
    const cv = ctx.createConvolver();
    cv.buffer = buf;
    return cv;
  } catch (_) { return null; }
}

/** Two seconds of seeded white noise, shared by every noise voice. */
function makeNoise(ctx, seed = 1) {
  if (!ctx.createBuffer) return null;
  try {
    const rate = ctx.sampleRate || 44100;
    const buf = ctx.createBuffer(1, rate * 2, rate);
    const rnd = mulberry32(seed >>> 0);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    return buf;
  } catch (_) { return null; }
}

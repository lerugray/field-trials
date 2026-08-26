// band.js — THE BAND KIT. A portable procedural WebAudio band: synthesised
// instruments, a bus architecture with a send reverb, and a lookahead step
// scheduler. Zero assets, zero fetches, zero dependencies (hard rule 2: all
// assets code-generated). Nothing here is Chapel-Perilous-specific — CHP's own
// score lives in score.js and is the reference consumer.
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
//   const band = createBand({ ctx, destination: someGainNode, seed: worldSeed });
//
//   band.registerTrack('cellar', {
//     bpm: 40,          // a STEP is a sixteenth: stepSeconds = 60 / bpm / 4
//     len: 64,          // steps in one loop (16 steps = one bar)
//     vol: 0.8,         // this track's level on the music bus
//     step(i, t, s) {   // i = step within the loop, t = ctx time to schedule AT
//       if (i === 0) s.v.drone(t, noteFreq('D1'), 16, { vol: 0.10 });
//       if (i === 23) s.v.bell(t, noteFreq('A5'), 4, { vol: 0.07 });
//     },
//   });
//
//   band.setTrack('cellar');   // crossfades: old track's bus down, new one up
//   band.start();              // drive the scheduler off a timer
//   band.setParams({ dread: 0.7 });  // live intensity, no track restart
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
//   kick / snare / hat        (t, o) percussion; CHP's ambient score does not use
//                            these, they are here because the kit is portable
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
// scheduler without timers or a browser.

import { mulberry32, hash2 } from './prng.js';

// ---------------------------------------------------------------------------
// note names -> frequency. 'D1', 'Bb2', 'F#4'. A number passes straight through.
// ---------------------------------------------------------------------------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteFreq(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name));
  if (!m) return 440;
  const s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const oct = parseInt(m[3], 10);
  return 440 * Math.pow(2, (s - 9) / 12 + (oct - 4));
}

/** Chord helper: note names -> frequencies. */
export function chord(names) { return names.map(noteFreq); }

// A tiny positive floor — exponential ramps cannot reach or cross zero.
const EPS = 0.0001;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Scheduler constants. LOOKAHEAD is how far ahead of currentTime we schedule;
// TICK_MS how often the driver wakes. MAX_STEPS_PER_TICK stops a pathological
// clock jump (tab wake, breakpoint) from scheduling thousands of notes at once.
export const LOOKAHEAD = 0.22;
export const TICK_MS = 25;
export const MAX_STEPS_PER_TICK = 64;

// Crossfade defaults, tuned long for an ambient register (see score.js).
export const FADE_OUT = 1.1;
export const FADE_IN = 2.2;
// How long a retired track bus lingers before disconnect — long enough for the
// longest voice release to finish under the fade.
export const RETIRE_TAIL = 4.0;

/**
 * Build a band on an existing AudioContext.
 * @param {object}   o
 * @param {AudioContext} o.ctx          required
 * @param {AudioNode} [o.destination]   where the band's output goes (default ctx.destination)
 * @param {number}   [o.seed]           seeds the reverb IR, the noise buffer, and s.rand
 * @param {number}   [o.gain]           the band's output level
 * @param {object}   [o.reverb]         { seconds, decay } of the generated IR
 */
export function createBand({
  ctx,
  destination = null,
  seed = 1,
  gain = 0.5,
  reverb = { seconds: 3.4, decay: 2.6 },
  lookahead = LOOKAHEAD,
  tickMs = TICK_MS,
  fadeOut = FADE_OUT,
  fadeIn = FADE_IN,
} = {}) {
  if (!ctx) throw new Error('createBand: needs an AudioContext');
  const rngSeed = (seed >>> 0) || 1;

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
  verbReturn.gain.value = 0.55;
  if (verb) { verb.connect(verbReturn); verbReturn.connect(out); }

  const noiseBuf = makeNoise(ctx, rngSeed ^ 0x5bf03635);

  // -- track buses -----------------------------------------------------------
  let bus = null;        // the live track's { out, send, vol }
  const retiring = [];   // buses fading out, disposed on a later tick

  function makeBus(vol) {
    const o = ctx.createGain();
    o.gain.value = EPS;
    o.connect(out);
    const s = ctx.createGain();
    s.gain.value = EPS;
    if (verb) s.connect(verb);
    return { out: o, send: s, vol };
  }

  function retire(b, now) {
    if (!b) return;
    ramp(b.out.gain, EPS, now, fadeOut);
    ramp(b.send.gain, EPS, now, fadeOut);
    retiring.push({ bus: b, disposeAt: now + fadeOut + RETIRE_TAIL });
  }

  function sweepRetired(now) {
    for (let i = retiring.length - 1; i >= 0; i--) {
      if (retiring[i].disposeAt <= now) {
        try { retiring[i].bus.out.disconnect(); retiring[i].bus.send.disconnect(); } catch (_) { /* ignore */ }
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

  function ramp(param, to, t, secs) {
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(Math.max(EPS, param.value), t);
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
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb === undefined ? 0.5 : o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const cut = o.cut || 700;
    try {
      f.frequency.setValueAtTime(cut, t);
      f.frequency.linearRampToValueAtTime(cut * (o.sweep === undefined ? 1.5 : o.sweep), t + dur * 0.6);
      f.Q.value = o.q === undefined ? 1.2 : o.q;
    } catch (_) { /* stub */ }
    f.connect(o1);
    const det = o.det === undefined ? 7 : o.det;
    const vol = o.vol === undefined ? 0.10 : o.vol;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = o.wave || 'sawtooth';
      try { osc.frequency.value = freq * (i === 2 ? 0.5 : 1); osc.detune.value = (i - 1) * det; } catch (_) { /* stub */ }
      const g = ctx.createGain();
      const tail = env(g, t, { a: o.a === undefined ? 1.2 : o.a, d: o.d === undefined ? 1.0 : o.d, s: 0.7, r: o.r === undefined ? 2.0 : o.r, peak: vol * (i === 2 ? 0.7 : 1), dur });
      osc.connect(g); g.connect(f);
      osc.start(t); osc.stop(t + tail + 0.2);
    }
  }

  // The floor: a sine with a sub octave, optionally a slightly-detuned partner
  // (which produces the slow beating that reads as "unquiet"), optionally
  // gliding to another frequency across the note.
  function drone(t, freq, dur, o = {}) {
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb === undefined ? 0.25 : o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    try { f.frequency.value = o.cut || 320; f.Q.value = o.q === undefined ? 0.8 : o.q; } catch (_) { /* stub */ }
    f.connect(o1);
    const vol = o.vol === undefined ? 0.11 : o.vol;
    const partners = o.beat ? [0, o.beat] : [0];
    for (const cents of partners) {
      for (const [mult, level] of [[1, 1], [0.5, 0.7]]) {
        const osc = ctx.createOscillator();
        osc.type = o.wave || 'sine';
        try {
          osc.frequency.setValueAtTime(freq * mult, t);
          if (o.glide) osc.frequency.linearRampToValueAtTime(noteFreq(o.glide) * mult, t + dur);
          osc.detune.value = cents;
        } catch (_) { /* stub */ }
        const g = ctx.createGain();
        const tail = env(g, t, { a: o.a === undefined ? 2.2 : o.a, d: 0.8, s: 0.85, r: o.r === undefined ? 3.0 : o.r, peak: vol * level, dur });
        osc.connect(g); g.connect(f);
        osc.start(t); osc.stop(t + tail + 0.2);
      }
    }
  }

  // Sparse events: a stack of slightly-inharmonic sine partials. The default
  // ratios are bell-like; pass your own for something stranger (score.js uses a
  // tritone partial underground).
  function bell(t, freq, dur, o = {}) {
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb === undefined ? 0.8 : o.verb);
    const ratios = o.ratios || [1, 2.01, 3.03, 4.78];
    const levels = o.levels || [1, 0.4, 0.22, 0.1];
    const vol = o.vol === undefined ? 0.07 : o.vol;
    for (let i = 0; i < ratios.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      try { osc.frequency.value = freq * ratios[i]; } catch (_) { /* stub */ }
      const g = ctx.createGain();
      const tail = env(g, t, { a: 0.006, d: dur * 0.85, s: 0.02, r: o.r === undefined ? 1.4 : o.r, peak: vol * (levels[i] === undefined ? 0.1 : levels[i]), dur: dur * 0.4 });
      osc.connect(g); g.connect(o1);
      osc.start(t); osc.stop(t + tail + 0.4);
    }
  }

  function pluck(t, freq, dur, o = {}) {
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb === undefined ? 0.4 : o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const cut = o.cut || 2400;
    try {
      f.frequency.setValueAtTime(cut, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(120, cut * 0.18), t + Math.max(0.05, dur));
    } catch (_) { /* stub */ }
    f.connect(o1);
    const osc = ctx.createOscillator();
    osc.type = o.wave || 'triangle';
    try { osc.frequency.value = freq; } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const tail = env(g, t, { a: 0.005, d: dur * 0.6, s: 0.06, r: o.r === undefined ? 0.3 : o.r, peak: o.vol === undefined ? 0.07 : o.vol, dur: dur * 0.5 });
    osc.connect(g); g.connect(f);
    osc.start(t); osc.stop(t + tail + 0.3);
  }

  function bass(t, freq, dur, o = {}) {
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb === undefined ? 0.1 : o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    try { f.frequency.value = o.cut || 400; f.Q.value = o.q === undefined ? 2.5 : o.q; } catch (_) { /* stub */ }
    f.connect(o1);
    const vol = o.vol === undefined ? 0.13 : o.vol;
    for (const [wave, mult, level] of [[o.wave || 'sawtooth', 1, 1], ['sine', 0.5, 0.6]]) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      try { osc.frequency.value = freq * mult; } catch (_) { /* stub */ }
      const g = ctx.createGain();
      const tail = env(g, t, { a: o.a === undefined ? 0.02 : o.a, d: dur * 0.4, s: 0.5, r: o.r === undefined ? 0.25 : o.r, peak: vol * level, dur: dur * 0.85 });
      osc.connect(g); g.connect(f);
      osc.start(t); osc.stop(t + tail + 0.3);
    }
  }

  function lead(t, freq, dur, o = {}) {
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb === undefined ? 0.45 : o.verb);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    try { f.frequency.value = o.cut || 2000; f.Q.value = 1.8; } catch (_) { /* stub */ }
    f.connect(o1);
    const osc = ctx.createOscillator();
    osc.type = o.wave || 'square';
    try { osc.frequency.value = freq; } catch (_) { /* stub */ }
    // A touch of vibrato so a sustained lead is not a test tone.
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    try { lfo.frequency.value = o.vibrato === undefined ? 4.8 : o.vibrato; lg.gain.value = freq * 0.005; } catch (_) { /* stub */ }
    lfo.connect(lg); lg.connect(osc.frequency);
    const g = ctx.createGain();
    const tail = env(g, t, { a: o.a === undefined ? 0.06 : o.a, d: 0.2, s: 0.7, r: o.r === undefined ? 0.4 : o.r, peak: o.vol === undefined ? 0.08 : o.vol, dur });
    osc.connect(g); g.connect(f);
    osc.start(t); osc.stop(t + tail + 0.4);
    lfo.start(t); lfo.stop(t + tail + 0.4);
  }

  // Texture: the shared seeded noise buffer through a swept band. This is the
  // "breath" / room-tone voice — the dominant colour of CHP's dungeon bed.
  function air(t, dur, o = {}) {
    if (!noiseBuf) return;
    const o1 = ctx.createGain(); o1.gain.value = 1; o1.connect(dry());
    send(o1, o.verb === undefined ? 0.5 : o.verb);
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    const bp = o.bp || 500;
    try {
      f.frequency.setValueAtTime(bp, t);
      f.frequency.linearRampToValueAtTime(bp * (o.sweep === undefined ? 2.2 : o.sweep), t + dur);
      f.Q.value = o.q === undefined ? 1.4 : o.q;
    } catch (_) { /* stub */ }
    // src -> filter -> envelope gain -> bus
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    const tail = env(g, t, { a: o.a === undefined ? dur * 0.4 : o.a, d: dur * 0.3, s: 0.7, r: o.r === undefined ? 1.6 : o.r, peak: o.vol === undefined ? 0.05 : o.vol, dur });
    src.connect(f); f.connect(g); g.connect(o1);
    src.start(t); src.stop(t + tail + 0.3);
  }

  // --- percussion. CHP's ambient score does not use these; the kit ships them
  // because other games will, and the tests instantiate them so they can't rot.
  function kick(t, o = {}) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    try {
      osc.frequency.setValueAtTime(o.f0 || 130, t);
      osc.frequency.exponentialRampToValueAtTime(o.f1 || 40, t + 0.11);
    } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const dur = o.dur || 0.24;
    try {
      g.gain.setValueAtTime(o.vol === undefined ? 0.3 : o.vol, t);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    } catch (_) { /* stub */ }
    osc.connect(g); g.connect(dry());
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function snare(t, o = {}) {
    if (!noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    try { f.frequency.value = o.bp || 1900; f.Q.value = 0.8; } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const dur = o.dur || 0.15;
    try {
      g.gain.setValueAtTime(o.vol === undefined ? 0.11 : o.vol, t);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    } catch (_) { /* stub */ }
    src.connect(f); f.connect(g); g.connect(dry());
    send(g, 0.35);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function hat(t, o = {}) {
    if (!noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    try { f.frequency.value = o.hp || 7000; } catch (_) { /* stub */ }
    const g = ctx.createGain();
    const dur = o.dur || 0.05;
    try {
      g.gain.setValueAtTime(o.vol === undefined ? 0.04 : o.vol, t);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    } catch (_) { /* stub */ }
    src.connect(f); f.connect(g); g.connect(dry());
    send(g, 0.2);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const voices = { pad, drone, bell, pluck, bass, lead, air, kick, snare, hat };

  // ==========================================================================
  // SCHEDULER — lookahead step scheduling against ctx.currentTime
  // ==========================================================================
  const tracks = new Map();
  let cur = null, curName = null;
  let step = 0, nextTime = 0;
  let params = {};
  let timer = null;

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
  function tick(now = ctx.currentTime) {
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
          v: voices, i, n, bar: (i / 16) | 0, params,
          rand: (salt = 0) => hash2(n, salt | 0, rngSeed),
        });
      } catch (_) { /* one bad step must never stop the score */ }
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
    const now = ctx.currentTime;
    retire(bus, now);
    bus = null;
    curName = name;
    cur = name ? tracks.get(name) || null : null;
    step = 0;
    if (!cur) return true;
    bus = makeBus(cur.vol);
    ramp(bus.out.gain, cur.vol, now, o.fadeIn === undefined ? fadeIn : o.fadeIn);
    ramp(bus.send.gain, 1, now, o.fadeIn === undefined ? fadeIn : o.fadeIn);
    nextTime = now + 0.03;
    tick(now); // begin at once — no gap waiting for the driver's first wake
    return true;
  }

  /** Live intensity params. Merged, no track restart — steps read s.params. */
  function setParams(p) { params = { ...params, ...(p || {}) }; return params; }

  function start() {
    if (timer || typeof setInterval !== 'function') return false;
    timer = setInterval(() => { try { tick(); } catch (_) { /* ignore */ } }, tickMs);
    if (timer && typeof timer.unref === 'function') timer.unref(); // never hold a node loop open
    return true;
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    return true;
  }

  function dispose() {
    stop();
    const now = ctx.currentTime;
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
    start,
    stop,
    dispose,
    setGain: (v) => { try { out.gain.value = clamp01(v); } catch (_) { /* ignore */ } },
    get track() { return curName; },
    get step() { return step; },
    get params() { return { ...params }; },
    get trackNames() { return [...tracks.keys()]; },
    get retiringCount() { return retiring.length; },
    get buses() { return { out, verb, verbReturn }; },
  };
}

// ---------------------------------------------------------------------------
// Generated impulse response: seeded exponentially-decaying noise. A convolver
// on a code-made IR is how you get a real reverb tail with zero assets.
// ---------------------------------------------------------------------------
function makeVerb(ctx, { seconds = 3.4, decay = 2.6 } = {}, seed = 1) {
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

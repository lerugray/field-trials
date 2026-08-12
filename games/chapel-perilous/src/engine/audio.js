// M10 Part B — audio. Hard rule 2 keeps ALL committed assets code-generated (no
// audio binaries in git; assets/audio/ is gitignored), so the shipped sound is
// SYNTHESISED in code via WebAudio: a procedural ambient SCORE plus short SFX for
// the moments the directive named (kill beat, encounter start, blocked bump, cache
// find, death). Ray's Monastery Protocol master + his ray-samples/MS-20 palette are
// the intended final voice — loaded through the optional SIDECAR path (see the shell
// + AUDIO-NOTE.md), never inlined/committed. Candidates are staged for Ray's ear.
//
// This module owns the CONTEXT and the master gain; the music itself lives in
// band.js (the portable synth-band kit) and score.js (CHP's nine tracks + the
// state→track map). Everything hangs off the one master gain, so [M] mute
// silences the score, the SFX and the sidecar together.
//
// SUPERSEDED (2026-08-09): the two-detuned-sine procedural drone that used to be
// the whole ambient bed is GONE, not left running under the score — two beds is
// mud. Its role is now score.js's `drone` voice with a `beat` option, per track.
//
// PRECEDENCE, unchanged: if an optional sidecar master is present beside the
// game it still wins and becomes the bed, with the score fading out under it.
// On file:// no sidecar fetch is attempted at all (silence-by-design), so the
// shipped single file plays the score and issues zero network requests.
//
// Headless-safe: nothing touches `window` at import. The shell injects a context
// factory; with none (Node/tests) every method is a graceful no-op.

import { createBand } from './band.js';
import { createScore, DEFAULT_SCENE, HOLD } from './score.js';

// SFX specs — pure data, unit-testable. Each is a tiny envelope over an oscillator
// (or filtered noise), tuned to read as UI feedback, not melody. dur in seconds.
export const SFX = {
  bump:      { osc: 'square',   f0: 150, f1: 90,  dur: 0.08, gain: 0.12 }, // a dull knock
  encounter: { osc: 'sawtooth', f0: 220, f1: 330, dur: 0.30, gain: 0.16 }, // a rising sting
  kill:      { osc: 'triangle', f0: 400, f1: 70,  dur: 0.22, gain: 0.18 }, // a downward thud
  cache:     { osc: 'sine',     f0: 660, f1: 990, dur: 0.28, gain: 0.16 }, // a bright chime up
  death:     { osc: 'sawtooth', f0: 200, f1: 40,  dur: 0.90, gain: 0.20 }, // a long descent
};

export const SFX_EVENTS = Object.keys(SFX);

// Sidecar ambient loop (M11 Part C): the intended final voice is Ray's Monastery Protocol
// master. Hard rule 2 keeps NO audio binary in git (assets/audio/ is gitignored), so the
// shipped game stays silent-but-graceful with the procedural drone; if a compressed cut is
// dropped beside the game at one of these paths, the sidecar path decodes it and loops it
// as the ambient bed IN PLACE OF the drone. Ordered: a shippable OGG cut first, then the
// raw WAV master the directive names.
export const SIDECAR_AMBIENT = [
  'assets/audio/monastery-protocol.ogg',
  'assets/audio/Monastery Protocol.wav',
];

// A2 (M12): make ANY reasonable ambient cut loop cleanly — no click at the seam —
// without tuning to the current placeholder file. Two pure, tested levers:
//  (1) loopStart/loopEnd INSET: trim a slice off each edge so the loop points sit in
//      the file's steady-state body, past whatever head/tail fade the master carries
//      (the placeholder is "a plain 6-min cut with fades"). Native looping is sample-
//      accurate; the audible click is the endpoint mismatch, not the loop itself.
//  (2) a short SEAM gain-dip: right at each loop splice, ramp the bed gain down to a
//      floor and back over a few ms, masking any residual phase discontinuity — the
//      directive's "gain-ramp strategy at the boundary" (no 2nd source needed).
export const LOOP_INSET = 0.075; // seconds trimmed off each edge (~75ms)
export const SEAM_XFADE = 0.04;  // total seconds of gain dip centred on each seam
export const SEAM_FLOOR = 0.35;  // gain multiplier at the bottom of the dip

// The loop window for a buffer of `duration` seconds: inset off each edge, unless the
// buffer is too short to spare it (then loop the whole thing).
export function computeLoopWindow(duration, inset = LOOP_INSET) {
  const d = Number(duration) || 0;
  if (d <= 0) return { loopStart: 0, loopEnd: 0 };
  if (d <= inset * 2 + 0.25) return { loopStart: 0, loopEnd: d }; // too short — whole buffer
  return { loopStart: inset, loopEnd: d - inset };
}

// Upcoming loop-seam times (playback wrapping loopEnd→loopStart), given the source
// was started at `startTime` AT the loopStart offset so seams fall every `period`
// seconds. Returns the seams in (fromTime, fromTime+horizon]. Pure — the scheduler
// arms a gain dip at each.
export function seamTimes(startTime, period, fromTime, horizon) {
  const out = [];
  if (!(period > 0) || !(horizon > 0)) return out;
  let k = Math.max(1, Math.ceil((fromTime - startTime) / period));
  for (let t = startTime + k * period; t <= fromTime + horizon; t += period, k += 1) out.push(t);
  return out;
}

export function createAudio({ ctxFactory = null, muted = false, sidecar = SIDECAR_AMBIENT, fetchImpl = null, seed = 1 } = {}) {
  let ctx = null;
  let master = null;
  let band = null;         // the synth-band kit (band.js)
  let score = null;        // CHP's tracks + scene controller (score.js)
  let sidecarNode = null;  // the looping master buffer, once loaded
  let started = false;
  let _muted = !!muted;
  // The scene the shell has asked for, remembered even before a context exists
  // (the shell renders before the player's first gesture). Applied by start().
  let pendingScene = null;
  let pendingParams = null;

  function ensure() {
    if (ctx || !ctxFactory) return ctx;
    try {
      ctx = ctxFactory();
      master = ctx.createGain();
      master.gain.value = _muted ? 0 : 1;
      master.connect(ctx.destination);
    } catch (_) { ctx = null; master = null; return ctx; }
    // The band is best-effort: a context missing convolver/filter support must
    // degrade to SFX-only rather than take the whole audio layer down with it.
    // `seed` may be a function so the shell can late-bind the live world seed
    // (the context is not built until the player's first gesture).
    try {
      let s = 1;
      try { s = (typeof seed === 'function' ? seed() : seed) >>> 0 || 1; } catch (_) { s = 1; }
      band = createBand({ ctx, destination: master, seed: s });
      score = createScore({ band });
    } catch (_) { band = null; score = null; }
    return ctx;
  }

  // Play one SFX spec: an oscillator through a short attack/decay gain envelope.
  function playSpec(s) {
    const c = ensure();
    if (!c || !s || _muted) return false;
    try {
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = s.osc;
      osc.frequency.setValueAtTime(s.f0, t);
      osc.frequency.linearRampToValueAtTime(s.f1, t + s.dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(s.gain, t + Math.min(0.02, s.dur * 0.2));
      g.gain.linearRampToValueAtTime(0, t + s.dur);
      osc.connect(g); g.connect(master || c.destination);
      osc.start(t); osc.stop(t + s.dur + 0.02);
      return true;
    } catch (_) { return false; }
  }

  function sfx(name) { return playSpec(SFX[name]); }

  // The procedural ambient bed IS the score (band.js + score.js). Starting it
  // sets the requested scene — which schedules its first step synchronously, so
  // sound begins on the gesture rather than on the scheduler's first wake — and
  // then hands the sequencer to its own timer.
  function startScore() {
    const c = ensure();
    if (!c || !score || !band) return false;
    try {
      score.setScene(pendingScene || DEFAULT_SCENE, pendingParams);
      band.start();
      return true;
    } catch (_) { return false; }
  }

  // Fade the score out — used when the sidecar master takes over the bed, and
  // when muting. Routed THROUGH the score rather than straight at the band, so
  // the score's own idea of the current scene stays truthful; otherwise resuming
  // to the same scene later reads as "no change" and silently stays silent.
  function silenceScore() {
    if (!score) return;
    try { score.setScene(null); } catch (_) { try { band.setTrack(null); } catch (__) { /* ignore */ } }
  }

  /**
   * Point the score at the current game state. Safe to call every render: an
   * unchanged scene is a no-op, params update live with no track restart, and
   * with no context yet the request is remembered for the first gesture.
   * HOLD (the journal overlay) deliberately leaves the current bed alone.
   */
  function setScene(id, params = null) {
    if (id !== HOLD) pendingScene = id;
    if (params) pendingParams = { ...(pendingParams || {}), ...params };
    // Muted means muted. The shell re-renders (and therefore re-syncs the scene)
    // immediately after [M], so without this guard the very next frame would hand
    // the band a fresh track and it would build a burst of inaudible nodes —
    // caught by scripts/probe-audio.mjs, invisible to the mocked unit tests.
    // The request is still remembered above and applied on unmute.
    if (_muted) return false;
    // The sidecar master, when present, owns the bed — leave it alone.
    if (!score || sidecarNode) return false;
    try { return score.setScene(id, params); } catch (_) { return false; }
  }

  let seamArmedUntil = 0; // ctx-time we've scheduled seam dips through
  let seamTimer = null;   // the re-arm interval handle (browser only)

  // Schedule an equal-power-ish gain dip at each upcoming loop seam so the splice is
  // masked. Idempotent + rolling: only arms seams past what's already armed, out to a
  // short horizon, and (in a browser) re-arms itself so the masking never runs out.
  function armSeams() {
    const c = ctx, node = sidecarNode;
    if (!c || !node || !(node.period > 0)) return;
    const horizon = Math.max(2 * node.period, 4); // seconds of lookahead
    const from = Math.max(c.currentTime, seamArmedUntil);
    const seams = seamTimes(node.t0, node.period, from, horizon);
    const half = SEAM_XFADE / 2;
    const floor = node.base * SEAM_FLOOR;
    for (const s of seams) {
      const gp = node.g.gain;
      try {
        gp.setValueAtTime(node.base, Math.max(c.currentTime, s - half));
        gp.linearRampToValueAtTime(floor, s);
        gp.linearRampToValueAtTime(node.base, s + half);
      } catch (_) { /* a param without full automation — the inset alone still helps */ }
    }
    seamArmedUntil = from + horizon;
    if (!seamTimer && typeof setInterval === 'function') {
      // Re-arm a little before the current horizon lapses. Cleared on stop.
      seamTimer = setInterval(() => { try { armSeams(); } catch (_) { /* ignore */ } },
        Math.max(500, node.period * 500));
      if (seamTimer && typeof seamTimer.unref === 'function') seamTimer.unref(); // never hold the loop open
    }
  }

  // Try each sidecar URL until one decodes; loop it as the ambient bed IN PLACE OF the
  // procedural drone. Fully graceful: no fetch (Node/single-file), a missing file, or a
  // decode error leaves the drone running and returns false. Resolves to whether it loaded.
  async function loadSidecar() {
    const c = ensure();
    // Browsers reject Fetch API requests from file:// with a console error before the
    // rejection reaches this catch path. Sidecars are optional, so do not probe there.
    if (typeof location !== 'undefined' && location.protocol === 'file:') return false;
    const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    const urls = Array.isArray(sidecar) ? sidecar : (sidecar ? [sidecar] : []);
    if (!c || !f || !urls.length || _muted || sidecarNode) return false;
    for (const url of urls) {
      try {
        const resp = await f(url);
        if (!resp || !resp.ok) continue;
        const bytes = await resp.arrayBuffer();
        const buffer = await c.decodeAudioData(bytes);
        silenceScore(); // the sidecar master replaces the score as the bed
        const src = c.createBufferSource();
        src.buffer = buffer; src.loop = true;
        // (1) inset the loop window so the seam sits past the file's edge fades.
        const win = computeLoopWindow(buffer.duration || 0);
        src.loopStart = win.loopStart;
        src.loopEnd = win.loopEnd;
        const g = c.createGain();
        const base = 0.5; g.gain.value = base;
        src.connect(g); g.connect(master || c.destination);
        // Start AT the loop start so seams fall on a clean period (see seamTimes).
        const t0 = c.currentTime;
        try { src.start(t0, win.loopStart); } catch (_) { src.start(t0); }
        const period = win.loopEnd - win.loopStart;
        sidecarNode = { src, g, t0, period, base };
        // (2) arm the seam gain-dips and keep re-arming them ahead of playback.
        armSeams();
        return true;
      } catch (_) { /* try the next candidate */ }
    }
    return false;
  }

  // Begin sound on the first user gesture (browser autoplay policy). Idempotent. Starts
  // the procedural score immediately (never silent), then attempts the sidecar master in
  // the background — if it loads, it replaces the score as the bed.
  function start() {
    if (started || _muted) return false;
    const c = ensure();
    if (!c) return false;
    started = true;
    if (c.state === 'suspended' && c.resume) { try { c.resume(); } catch (_) { /* ignore */ } }
    startScore();
    Promise.resolve().then(loadSidecar).catch(() => {}); // fire-and-forget; score stays if it fails
    return true;
  }

  function resume() { const c = ctx; if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (_) { /* ignore */ } } }

  // Mute is the master gain (so SFX, score and sidecar all go at once) AND it
  // parks the sequencer — a muted score should not keep building oscillator
  // nodes nobody can hear. Unmuting re-arms it at the remembered scene.
  function setMuted(m) {
    _muted = !!m;
    if (master) master.gain.value = _muted ? 0 : 1;
    if (band) {
      if (_muted) { try { band.stop(); } catch (_) { /* ignore */ } silenceScore(); }
      else if (started && !sidecarNode) startScore();
    }
    return _muted;
  }
  function toggleMute() { return setMuted(!_muted); }

  return {
    sfx,
    start,
    setScene,
    loadSidecar,
    get usingSidecar() { return !!sidecarNode; },
    get usingScore() { return !!(band && score && band.track); },
    get scene() { return score ? score.scene : null; },
    resume,
    setMuted,
    toggleMute,
    isMuted: () => _muted,
    spec: (name) => SFX[name] || null,
    get started() { return started; },
    get live() { return !!ctx; },
    // Exposed for tests and for a future in-game mixer; not used by the shell.
    get band() { return band; },
  };
}

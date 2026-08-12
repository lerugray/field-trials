// SHOELEATHER — House Band WebAudio player (thin browser glue).
//
// Schedules the code-composed score (house-band.js) on a WebAudio graph, with a WORN
// TAPE surface: gentle wow/flutter on pitch and a hiss bed, over period-instrument
// synths (upright-ish bass, brushed-kit noise, wah stabs, flute/vibes lead). The
// AudioContext is injected so the scheduling logic is testable with a mock; the browser
// passes a real one. Loud-failure safe: with no context it is an inert no-op.

import { composeProgression, beatDur, flutterMultiplier, modulationPhases } from './house-band.js';

export class HouseBandPlayer {
  constructor(ctx = null, { bars = 8, seed = 0, intensityProvider = null } = {}) {
    this.ctx = ctx;              // AudioContext-like, or null (no-op)
    this.bars = bars;
    this.master = null;
    this.playing = false;
    this._stopped = true;
    this.seed = seed >>> 0;
    this.intensityProvider = intensityProvider || (() => 0);
    this.passIndex = 0;
    this.transportTime = 0;
    this.flutterPhase = (this.seed % 6283) / 1000;
    this._scheduled = new Set();
  }

  available() { return !!this.ctx; }

  _ensureMaster() {
    if (!this.master && this.ctx) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    return this.master;
  }

  // Schedule one voice event as a synth node with an amplitude envelope.
  scheduleEvent(e, t) {
    const ctx = this.ctx; if (!ctx) return;
    const master = this._ensureMaster();
    const g = ctx.createGain();
    g.connect(master);
    const a = 0.008, rel = Math.max(0.05, e.dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur + rel);

    if (e.brushed) {
      // brushed kit: a short filtered noise burst
      const src = ctx.createBufferSource();
      src.buffer = this._noise();
      const bp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
      if (bp) { bp.type = 'highpass'; bp.frequency.value = 6000; src.connect(bp); bp.connect(g); }
      else src.connect(g);
      this._track(src, bp ? [src, bp, g] : [src, g]);
      src.start(t); src.stop(t + e.dur + rel);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = e.voice === 'bass' ? 'sine' : e.voice === 'stab' ? 'sawtooth' : 'triangle';
    // WOW/FLUTTER: a hair of pitch wobble so the tape never sits still.
    osc.frequency.value = e.freq * flutterMultiplier(e.transportT ?? e.t, this.flutterPhase);
    let filter = null;
    if (e.wah && ctx.createBiquadFilter) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = e.freq * 2; f.Q.value = 6;
      osc.connect(f); f.connect(g);
      filter = f;
    } else {
      osc.connect(g);
    }
    this._track(osc, filter ? [osc, filter, g] : [osc, g]);
    osc.start(t); osc.stop(t + e.dur + rel);
  }

  _track(source, nodes) {
    const scheduled = { source, nodes };
    this._scheduled.add(scheduled);
    source.onended = () => {
      this._scheduled.delete(scheduled);
      for (const node of nodes) {
        try { if (node.disconnect) node.disconnect(); } catch (_) { /* already detached */ }
      }
    };
  }

  _noise() {
    if (this._noiseBuf) return this._noiseBuf;
    const ctx = this.ctx;
    const len = Math.floor((ctx.sampleRate || 44100) * 0.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
    const d = buf.getChannelData(0);
    // deterministic-ish noise (no Math.random available); a hashy sequence
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x40000000) - 1; }
    this._noiseBuf = buf;
    return buf;
  }

  // Start the loop. Autoplay policy: call from a user gesture in the browser.
  start() {
    if (!this.ctx || this.playing) return false;
    this.playing = true; this._stopped = false;
    this._scheduleFrom(this.ctx.currentTime + 0.05);
    return true;
  }

  _scheduleFrom(t0) {
    if (this._stopped) return;
    const pass = this.schedulePass(t0);
    // schedule the next loop (browser: via setTimeout; tests stop before this fires)
    if (typeof setTimeout === 'function') {
      this._timer = setTimeout(() => { if (!this._stopped) this._scheduleFrom(t0 + pass.loopLen); }, pass.loopLen * 1000 * 0.9);
    }
  }

  // Schedule exactly one pass. Kept separate so acceptance tests can empirically
  // inspect three real scheduled passes without waiting through wall-clock loops.
  schedulePass(t0) {
    const intensity = Math.max(0, Math.min(1, Number(this.intensityProvider()) || 0));
    const loopLen = this.bars * 4 * beatDur();
    const transportStart = this.transportTime;
    const events = composeProgression(this.bars, { seed: this.seed, passIndex: this.passIndex, intensity })
      .map((event) => ({ ...event, transportT: transportStart + event.t }));
    for (const event of events) this.scheduleEvent(event, t0 + event.t);
    const report = {
      passIndex: this.passIndex, intensity, events, loopLen, transportStart,
      modulationStart: modulationPhases(transportStart, this.flutterPhase),
      modulationEnd: modulationPhases(transportStart + loopLen, this.flutterPhase),
    };
    this.passIndex++;
    this.transportTime += loopLen;
    return report;
  }

  stop() {
    this._stopped = true; this.playing = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const now = this.ctx ? this.ctx.currentTime : 0;
    for (const scheduled of this._scheduled) {
      try { scheduled.source.stop(now); } catch (_) { /* source may have ended naturally */ }
      for (const node of scheduled.nodes) {
        try { if (node.disconnect) node.disconnect(); } catch (_) { /* already detached */ }
      }
    }
    this._scheduled.clear();
    if (this.master) {
      try { this.master.disconnect(); } catch (_) { /* already detached */ }
      this.master = null;
    }
  }

  activeSourceCount() { return this._scheduled.size; }
}

// Owns the browser-facing score lifecycle. OFF always releases the player handle and
// closes its AudioContext; ON is idempotent and can therefore create exactly one graph.
export class HouseBandController {
  constructor(createPlayer) {
    if (typeof createPlayer !== 'function') throw new TypeError('HouseBandController needs a player factory');
    this.createPlayer = createPlayer;
    this.instance = null;
  }

  start() {
    if (this.instance && this.instance.playing) return false;
    if (this.instance) this.stop();
    const player = this.createPlayer();
    if (!player) return false;
    this.instance = player;
    try {
      if (player.ctx && player.ctx.resume) player.ctx.resume();
      if (player.start()) return true;
    } catch (err) {
      this.stop();
      throw err;
    }
    this.stop();
    return false;
  }

  stop() {
    const player = this.instance;
    if (!player) return false;
    this.instance = null;
    player.stop();
    const ctx = player.ctx;
    if (ctx && ctx.close && ctx.state !== 'closed') {
      try {
        const closing = ctx.close();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch (_) { /* a browser may already be closing the context */ }
    }
    return true;
  }

  toggle() {
    if (this.instance && this.instance.playing) { this.stop(); return false; }
    return this.start();
  }

  runningCount() { return this.instance && this.instance.playing ? 1 : 0; }
}

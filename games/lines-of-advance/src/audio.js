// audio.js: self-contained procedural sound hooks for the single-file build.

const SLOTS = Object.freeze({
  select: 'procedural-select',
  move: 'procedural-move',
  error: 'procedural-error',
  capture: 'procedural-capture',
  reset: 'procedural-reset'
});

function isReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.settings = {
      sfx: true,
      music: false,
      reducedEffects: isReducedMotion()
    };
    this.musicNodes = null;
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        this.settings.reducedEffects = e.matches;
        if (e.matches) this.stopMusic();
      });
    }
  }

  _ensureContext() {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) {
      return null;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    return this.ctx;
  }

  _maybeResume() {
    const ctx = this._ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  _tone({ type = 'sine', frequency = 440, duration = 0.08, attack = 0.005, decay = 0.05, volume = 0.1 }) {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  _noise({ duration = 0.08, volume = 0.1 }) {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  _playSlot(slot, fallback) {
    if (typeof window === 'undefined') return;
    if (this.settings.reducedEffects || !this.settings.sfx) return;
    this._maybeResume();
    if (!SLOTS[slot]) return;
    fallback();
  }

  playSelect() {
    this._playSlot('select', () => this._tone({ frequency: 880, duration: 0.05, volume: 0.08 }));
  }

  playMove() {
    this._playSlot('move', () => this._noise({ duration: 0.06, volume: 0.08 }));
  }

  playError() {
    this._playSlot('error', () => this._tone({ type: 'sawtooth', frequency: 180, duration: 0.12, volume: 0.06 }));
  }

  playCapture() {
    this._playSlot('capture', () => this._noise({ duration: 0.14, volume: 0.12 }));
  }

  playReset() {
    this._playSlot('reset', () => this._tone({ frequency: 220, duration: 0.18, volume: 0.05 }));
  }

  toggleMusic(enabled) {
    this.settings.music = enabled;
    if (enabled && !this.settings.reducedEffects) {
      this._startMusic();
    } else {
      this.stopMusic();
    }
  }

  _startMusic() {
    const ctx = this._ensureContext();
    if (!ctx || this.musicNodes) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55; // low A
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.015;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    lfo.start();
    this.musicNodes = { osc, lfo, lfoGain, gain };
  }

  stopMusic() {
    if (!this.musicNodes) return;
    try {
      this.musicNodes.osc.stop();
      this.musicNodes.lfo.stop();
    } catch {
      // already stopped
    }
    this.musicNodes = null;
  }

  setSfx(enabled) {
    this.settings.sfx = enabled;
  }

  setReducedEffects(enabled) {
    this.settings.reducedEffects = enabled;
    if (enabled) this.stopMusic();
  }
}

export { AudioEngine, SLOTS, isReducedMotion };

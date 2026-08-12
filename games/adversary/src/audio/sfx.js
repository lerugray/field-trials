// sfx.js — code-generated WebAudio sound effects (DESIGN-SEED "Sound": WebAudio SFX code-generated;
// music hook points wired but tracks are operator-supplied later; NEVER fetch or synthesize music).
// The SFX SPEC table (pure, headless-testable) maps game events → tiny synth recipes; the browser
// player realizes them with oscillators + a noise burst. Music cues are named no-op hooks the
// operator can later bind to real tracks.

// Each spec: { wave:'square'|'triangle'|'sawtooth'|'sine'|'noise', f0, f1?, dur, gain?, sweepMs? }.
// f0→f1 is a pitch sweep over dur seconds. Kept chiptune-simple to match the art.
export const SFX = Object.freeze({
  hit:       { wave: 'square',   f0: 220, f1: 140, dur: 0.06, gain: 0.18 },
  kill:      { wave: 'square',   f0: 320, f1: 90,  dur: 0.16, gain: 0.20 },
  hurt:      { wave: 'sawtooth', f0: 180, f1: 70,  dur: 0.14, gain: 0.22 },
  jump:      { wave: 'triangle', f0: 300, f1: 620, dur: 0.10, gain: 0.14 },
  pickup:    { wave: 'square',   f0: 520, f1: 780, dur: 0.10, gain: 0.16 },
  unlock:    { wave: 'triangle', f0: 440, f1: 880, dur: 0.28, gain: 0.20 },
  levelup:   { wave: 'square',   f0: 523, f1: 1046, dur: 0.30, gain: 0.20 },
  unique:    { wave: 'triangle', f0: 660, f1: 1320, dur: 0.42, gain: 0.22 },
  death:     { wave: 'sawtooth', f0: 200, f1: 40,  dur: 0.5,  gain: 0.24 },
  respawn:   { wave: 'triangle', f0: 260, f1: 520, dur: 0.20, gain: 0.16 },
  checkpoint:{ wave: 'sine',     f0: 660, f1: 990, dur: 0.22, gain: 0.16 },
  charged:   { wave: 'square',   f0: 160, f1: 480, dur: 0.14, gain: 0.20 },
  projectile:{ wave: 'sawtooth', f0: 700, f1: 300, dur: 0.10, gain: 0.14 },
  boss:      { wave: 'noise',    f0: 0,   f1: 0,   dur: 0.4,  gain: 0.26 },
  menu:      { wave: 'square',   f0: 440, f1: 440, dur: 0.04, gain: 0.10 },
});

// Named music cue points — wired but silent (operator supplies tracks). The player calls musicCue()
// at these moments; a later binding turns names into playback.
export const MUSIC_CUES = Object.freeze(['title', 'stage', 'boss', 'clear', 'death', 'sidemode']);

/** Map a game event type to an SFX key (or null if that event has no sound). */
export function sfxForEvent(type) {
  switch (type) {
    case 'hit': return 'hit';
    case 'kill': return 'kill';
    case 'boss-defeat': return 'boss';
    case 'hurt': return 'hurt';
    case 'pickup': return 'pickup';
    case 'unlock': return 'unlock';
    case 'unique-drop': return 'unique';
    case 'levelup': return 'levelup';
    case 'death': return 'death';
    case 'respawn': return 'respawn';
    case 'checkpoint': return 'checkpoint';
    case 'rest': return 'checkpoint';
    case 'recover': return 'pickup';
    case 'double-jump': return 'jump';
    case 'kit-move': return null; // specialized below by move
    default: return null;
  }
}

/**
 * Browser audio player. Realizes specs with WebAudio; a no-op (but API-complete) when there is no
 * AudioContext (headless/tests). Also holds the music-cue hook (silent until the operator binds it).
 */
export function createAudio(AudioCtx = (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext))) {
  let ctx = null;
  let muted = false;
  const ensure = () => {
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    return ctx;
  };

  function playSpec(spec) {
    const ac = ensure();
    if (!ac || muted || !spec) return false;
    const t = ac.currentTime;
    const gainNode = ac.createGain();
    gainNode.gain.setValueAtTime(spec.gain ?? 0.15, t);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);
    gainNode.connect(ac.destination);
    if (spec.wave === 'noise') {
      const len = Math.floor(ac.sampleRate * spec.dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buf; src.connect(gainNode); src.start(t); src.stop(t + spec.dur);
    } else {
      const osc = ac.createOscillator();
      osc.type = spec.wave;
      osc.frequency.setValueAtTime(spec.f0, t);
      if (spec.f1 && spec.f1 !== spec.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.f1), t + spec.dur);
      osc.connect(gainNode); osc.start(t); osc.stop(t + spec.dur);
    }
    return true;
  }

  return {
    play(key) { return playSpec(SFX[key]); },
    playEvent(type, extra) {
      if (type === 'kit-move' && extra) return playSpec(SFX[extra] || SFX.charged);
      const key = sfxForEvent(type);
      return key ? playSpec(SFX[key]) : false;
    },
    musicCue(_name) { /* wired hook; silent until the operator binds a track */ return false; },
    setMuted(m) { muted = !!m; },
    isMuted() { return muted; },
    _hasContext() { return !!ensure(); },
  };
}

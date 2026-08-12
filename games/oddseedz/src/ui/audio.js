// The WebAudio player (M10). The ONLY module that touches an AudioContext. It
// reads the pure specs from engine/sfx.js and schedules them on real oscillator
// nodes. Everything here degrades to a silent no-op when there is no AudioContext
// (node, old browsers), so importing it never throws and the game runs mute-safe.
//
// Mute is MANDATORY (a hard rule of the spec). The player starts muted-until-known
// from persisted settings and exposes setMuted/isMuted; nothing plays while muted,
// and no AudioContext is even created until the first unmuted sound after a user
// gesture (respecting browser autoplay policy).

import { sfxSpec, sfxSchedule } from '../engine/sfx.js';

// Audio-module-private state. Names are deliberately a-prefixed so they never
// collide with app.js's own top-level `ctx`/`master` once the single-file build
// flattens all modules into one scope.
let audioCtx = null; // lazily created AudioContext
let audioMaster = null; // master GainNode (also the mute switch, gain 0 when muted)
let audioMuted = false; // current mute state (settings layer drives this)
const audioVolume = 0.7; // 0..1 master volume (fixed; no volume slider in the UI)

const AUDIO_AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;

// Create the context + master bus on demand. Returns null when audio is
// unavailable so every caller can bail cheaply.
function ensureCtx() {
  if (!AUDIO_AC) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AUDIO_AC();
      audioMaster = audioCtx.createGain();
      audioMaster.gain.value = audioMuted ? 0 : audioVolume;
      audioMaster.connect(audioCtx.destination);
    } catch {
      audioCtx = null;
      return null;
    }
  }
  // Browsers suspend the context until a gesture resumes it.
  if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function isSfxMuted() {
  return audioMuted;
}

export function setSfxMuted(v) {
  audioMuted = !!v;
  if (audioMaster && audioCtx) audioMaster.gain.setValueAtTime(audioMuted ? 0 : audioVolume, audioCtx.currentTime);
}

// Schedule one gliding tone: an oscillator through its own gain envelope (a fast
// attack and an exponential release) so notes read as plucky blips, never clicks.
function playTone(context, tone) {
  const osc = context.createOscillator();
  const g = context.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, tone.start);
  if (tone.slide !== tone.freq) {
    // portamento across the note
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.slide), tone.stop);
  }
  const peak = Math.max(0.0001, tone.gain);
  g.gain.setValueAtTime(0.0001, tone.start);
  g.gain.exponentialRampToValueAtTime(peak, tone.start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, tone.stop);
  osc.connect(g);
  g.connect(audioMaster);
  osc.start(tone.start);
  osc.stop(tone.stop + 0.02);
}

/**
 * Play a creature/UI sound. No-op when muted or when audio is unavailable.
 * @param {string} archetype creature archetype (or 'ui' voice via default)
 * @param {string} event one of SFX_EVENTS
 * @param {number} [seed=0] detunes the voice
 */
export function playSfx(archetype, event, seed = 0) {
  if (audioMuted) return;
  const context = ensureCtx();
  if (!context) return;
  const spec = sfxSpec(archetype, event, seed);
  const sched = sfxSchedule(spec, context.currentTime + 0.001);
  for (const tone of sched) playTone(context, tone);
}

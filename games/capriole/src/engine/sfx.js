// sfx.js — the ACTION-LEGIBILITY audio hooks (M3). Every game-critical event (jump,
// stomp, hit, damage taken, death, pod/spark pickup, firework, boss defeat, exit open) gets
// a synthesized one-shot the moment its mechanic fires — the "audible-hook" half of the
// action-legibility law. Code-composed on the House Band kit (band.js) — no audio files, no
// CDNs (score law). The FULL score (music tracks + a fuller SFX pass) is M5; this is the
// per-event SFX floor in the seed's register: bouncy toybox synth-funk, bright and springy.
//
// The AudioContext is gesture-gated (browsers suspend it until a user gesture) and built
// lazily on enable(); before that, and headless, every trigger is a silent no-op. The band's
// voices route to master when no music track is set, so SFX play without a track.

import { createBand, noteFreq } from './band.js';

export function createSfx({ seed = 1, ctx = null } = {}) {
  let _ctx = ctx, band = null, ready = false, volume = 0.7;

  function enable() {
    if (ready) return true;
    if (!_ctx) {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return false;
      try { _ctx = new AC(); } catch (_) { return false; }
    }
    try {
      band = createBand({ ctx: _ctx, seed, gain: volume });
      ready = true;
      resume();
      return true;
    } catch (_) { return false; }
  }
  function resume() { try { if (_ctx && _ctx.state === 'suspended' && _ctx.resume) _ctx.resume(); } catch (_) {} }
  function now() { return (_ctx && _ctx.currentTime) || 0; }
  // Play a one-shot: fn(voices, t). Silent (no-op) until enabled or when muted.
  function play(fn) {
    if (!ready || volume <= 0) return;
    try { fn(band.voices, now()); } catch (_) { /* one bad SFX never breaks the frame */ }
  }

  // ---- the register: springy, bright, major-key. Chain pitch climbs to reward stomp chains.
  const CHAIN_NOTES = ['A5', 'C6', 'E6', 'G6', 'B6', 'D7'];
  const chainNote = (n) => CHAIN_NOTES[Math.min(CHAIN_NOTES.length - 1, Math.max(0, n - 1))];

  const api = {
    enable, resume,
    get enabled() { return ready; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (band) band.setGain(volume); },
    get volume() { return volume; },

    jump(chain = 1) { play((v, t) => v.pluck(t, noteFreq(['C5', 'E5', 'G5'][Math.min(2, chain - 1)] || 'C5'), 0.12, { vol: 0.08, wave: 'triangle' })); },
    stomp(chain = 1) { play((v, t) => { v.kick(t, { vol: 0.22, f0: 190, f1: 60 }); v.bell(t + 0.005, noteFreq(chainNote(chain)), 0.16, { vol: 0.09, ratios: [1, 2, 3] }); }); },
    hit() { play((v, t) => { v.bass(t, noteFreq('E2'), 0.2, { vol: 0.16, wave: 'square', cut: 500 }); v.snare(t, { vol: 0.09 }); }); },
    kill(boss = false) {
      play((v, t) => {
        const seq = boss ? ['C5', 'E5', 'G5', 'C6', 'E6'] : ['E5', 'A5', 'C6'];
        seq.forEach((nn, k) => v.pluck(t + k * 0.05, noteFreq(nn), 0.12, { vol: boss ? 0.09 : 0.07 }));
      });
    },
    pickup() { play((v, t) => v.bell(t, noteFreq('E6'), 0.08, { vol: 0.045, ratios: [1, 2.5] })); },
    pipGain() { play((v, t) => ['C6', 'E6', 'G6'].forEach((nn, k) => v.bell(t + k * 0.06, noteFreq(nn), 0.12, { vol: 0.06 }))); },
    fire() { play((v, t) => { v.hat(t, { vol: 0.05 }); v.air(t, 0.14, { vol: 0.04, bp: 1400, sweep: 3.0 }); }); },
    fireworkHit() { play((v, t) => v.bell(t, noteFreq('C6'), 0.1, { vol: 0.06 })); },
    podCollect() { play((v, t) => v.bell(t, noteFreq('G5'), 0.22, { vol: 0.08, ratios: [1, 2, 3, 4] })); },
    exitOpen() { play((v, t) => ['C5', 'E5', 'G5', 'C6'].forEach((nn, k) => v.lead(t + k * 0.04, noteFreq(nn), 0.5, { vol: 0.06, wave: 'triangle' }))); },
    bossDefeat() { play((v, t) => ['C6', 'G5', 'E5', 'C5', 'G4'].forEach((nn, k) => v.bell(t + k * 0.09, noteFreq(nn), 0.35, { vol: 0.09 }))); },
    death() { play((v, t) => { v.drone(t, noteFreq('C2'), 1.2, { vol: 0.14, glide: 'G1' }); v.bass(t, noteFreq('C2'), 0.6, { vol: 0.12 }); }); },
    net() { play((v, t) => v.air(t, 0.4, { vol: 0.06, bp: 400, sweep: 4.0 })); },

    // Map a world's per-tick legibility flags to SFX — call once per frame after the sim
    // step. `player.jumpedThisTick` triggers the jump note; the rest read world event flags.
    fromWorld(world) {
      if (!ready || volume <= 0 || !world) return;
      const p = world.player;
      if (p && p.jumpedThisTick) this.jump(p.jumpChain);
      if (world.stompedThisTick >= 0) this.stomp(world.stompChain);
      if (world.killedThisTick >= 0) { const e = world.enemies[world.killedThisTick]; this.kill(!!(e && e.boss)); }
      if (world.damagedThisTick) this.hit();
      if (world.sparkCollectedThisTick > 0) this.pickup();
      if (world.pipGainedThisTick) this.pipGain();
      if (world.fireworkFiredThisTick) this.fire();
      if (world.fireworkHitThisTick >= 0) this.fireworkHit();
      if (world.podCollectedThisTick >= 0) this.podCollect();
      if (world.exitOpenedThisTick) this.exitOpen();
      if (world.bossDefeatedThisTick) this.bossDefeat();
      if (world.netTollThisTick && !world.diedThisTick) this.net();
      if (world.diedThisTick) this.death();
    },
  };
  return api;
}

export default { createSfx };

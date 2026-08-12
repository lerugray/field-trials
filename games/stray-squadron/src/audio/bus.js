// Master audio bus — the thing master-mute actually controls (accessibility law,
// live from M2). Lazy WebAudio: the context is created on first sound (browsers
// block autoplay before a gesture). Provides a short square-wave blip for UI
// feedback now and a real master gain for the barks/music wired later (M7/M9).
// Browser-only. With no WebAudio, everything no-ops silently.

export function createAudioBus() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return;
    const AC = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }

  return {
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },

    // Short scrambled blip — SNES-style, in-register UI feedback.
    blip(freq = 520, dur = 0.06) {
      if (muted) return;
      ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(master);
      const t = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
  };
}

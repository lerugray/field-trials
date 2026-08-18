// audio.js — THE ONE AUDIO BUS (collection contract item 6), the score's connection to game state,
// and the sound effects of the desk.
//
// CONTRACT ITEM 6, in full: a single master gain; unlocked on the first user gesture; no
// pre-gesture autoplay; honoured by mute(bool). All four are structural here rather than
// intentional. There is no AudioContext at all until unlock() is called from a real input event, so
// "no pre-gesture autoplay" is not a policy this file follows, it is a state it cannot leave: with
// no context there is nothing to play out of. Every sound in the game — the band's tracks and every
// effect below — is wired to `master` and nowhere else, so mute(true) is one assignment and cannot
// miss a voice that was routed somewhere clever.
//
// THE PACING LAW BINDS THIS FILE. It is not in the presentation set, so Gate 1 scans it: no timer,
// no wall clock, no animation frame. The scheduler is driven by the host calling tick() from the
// draw loop (band.js's port note explains why the kit's own timer was deleted rather than
// exempted), and ctx.currentTime is an audio clock read only to schedule audio. Nothing in this
// file can advance the sim, and nothing in the sim reads it.
//
// DETERMINISM. The noise every effect is built from is filled by a seeded mulberry32, the same as
// the band's. No Math.random reaches the audio path.

import { createScoredBand, sceneFor, paramsFor, HOLD } from './score.js';
import { mulberry32 } from './prng.js';

const EPS = 0.0001;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The effects, named in the register of the thing that makes them. DESIGN-SEED §10's SFX brief is
// "stamps, drawer slides, distant structural failure"; the other two are the actions the game
// performs most often and would feel dead without.
export const SFX = Object.freeze(['stamp', 'drawer', 'structural', 'pen', 'refused']);

/**
 * createAudio({ seed }) -> the audio surface.
 *
 * Nothing is built here. The object is inert and safe to construct in any environment, including
 * the boot smoke test's stubbed DOM and node, where AudioContext does not exist at all.
 */
export function createAudio({ seed = 1, log = null, contextFactory = null } = {}) {
  let ctx = null;
  let master = null;
  let band = null;
  let noiseBuf = null;
  let muted = false;
  let scene = null;
  let failed = false;

  function alive() {
    return !!(ctx && master && band);
  }

  /**
   * unlock() — build the context on a REAL user gesture and never before.
   *
   * Returns true once audio is live. Safe to call on every input event: the second call onward is a
   * cheap no-op. A browser that refuses an AudioContext, or a host that has none, leaves the game
   * completely playable and silent; audio is never allowed to be a correctness dependency, which is
   * why every failure here is recorded and swallowed at this boundary rather than surfaced as a
   * game error.
   */
  function unlock() {
    if (alive() || failed) return alive();
    try {
      // contextFactory is the seam for a harness: the offline listen-set renderer hands back an
      // OfflineAudioContext, and a test hands back a stub. The game itself never passes one, so the
      // real path is the plain constructor below and the seam costs the shipped build nothing.
      if (contextFactory) {
        ctx = contextFactory();
      } else {
        const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
        if (!Ctor) {
          failed = true;
          return false;
        }
        ctx = new Ctor();
      }
      if (!ctx) {
        failed = true;
        return false;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(ctx, seed);
      band = createScoredBand({ ctx, destination: master, seed, gain: 0.5 });
      // A live context handed to us before the gesture settles may still be suspended. An offline
      // context is ALSO 'suspended' until startRendering, and must not be resumed, so this is
      // guarded rather than assumed: a throw here would wrongly mark audio permanently failed.
      try {
        if (ctx.state === 'suspended' && ctx.resume && !isOffline(ctx)) ctx.resume();
      } catch (_) {
        /* a context that declines to resume is still usable once the browser lets it */
      }
      if (log) log.info('audio unlocked', `rate=${ctx.sampleRate}`);
      return true;
    } catch (err) {
      failed = true;
      if (log) log.warn('audio unavailable', err && err.message);
      return false;
    }
  }

  /**
   * update(view) — called once a frame from the draw loop.
   *
   * Maps game state onto the score (which track, how sour) and advances the scheduler's lookahead
   * window. Reads the view; writes nothing to it.
   */
  function update(view) {
    if (!alive()) return;
    try {
      const want = sceneFor(view);
      if (want !== HOLD && want !== scene) {
        band.setTrack(want);
        scene = want;
      }
      band.setParams(paramsFor(view));
      band.tick();
    } catch (err) {
      if (log) log.warn('audio update failed', err && err.message);
    }
  }

  /** mute(bool) — contract item 6. One gain, so one assignment mutes everything. */
  function setMuted(next) {
    muted = !!next;
    if (!master) return muted;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(EPS, master.gain.value), now);
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.06);
    } catch (_) {
      try {
        master.gain.value = muted ? 0 : 1;
      } catch (__) {
        /* a stub gain without automation */
      }
    }
    return muted;
  }

  // ---- the sound effects --------------------------------------------------------------------------
  // Each is built from oscillators and the shared seeded noise buffer, on the master bus. Zero
  // assets, so provenance stays code-composed and the artifact stays a single file.

  function noise(t, dur, { hp = 0, bp = 0, lp = 0, q = 1, vol = 0.1, decay = 1 } = {}) {
    if (!noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    let node = src;
    if (bp) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = bp;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    if (hp) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = hp;
      node.connect(f);
      node = f;
    }
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur * decay);
    node.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(t, f0, f1, dur, { vol = 0.1, type = 'sine' } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /**
   * play(name, at) — one effect. `at` is an explicit context time, used only by the offline
   * listen-set renderer, whose currentTime is frozen at zero until it renders; the game always
   * omits it and gets "now". Unknown names are ignored rather than thrown: an effect is a garnish,
   * and a typo in a garnish must never take down a cycle commit.
   */
  function play(name, at) {
    if (!alive()) return false;
    try {
      const t = (at === undefined ? ctx.currentTime : at) + 0.001;
      if (name === 'stamp') {
        // A date stamp: an inked block driven onto a desk. Pitched, brief, dead. The two halves are
        // the impact and the ink, twelve milliseconds apart, which is what stops it reading as a
        // drum hit.
        tone(t, 190, 68, 0.13, { vol: 0.16 });
        noise(t + 0.012, 0.06, { bp: 2400, q: 1.4, vol: 0.075 });
        noise(t + 0.03, 0.09, { lp: 700, vol: 0.03 });
      } else if (name === 'drawer') {
        // A drawer on wooden runners: a rolling band of noise that opens and closes, then the stop.
        const src = ctx.createBufferSource();
        if (noiseBuf) {
          src.buffer = noiseBuf;
          src.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = 2.2;
          f.frequency.setValueAtTime(420, t);
          f.frequency.linearRampToValueAtTime(1250, t + 0.16);
          f.frequency.linearRampToValueAtTime(560, t + 0.3);
          const g = ctx.createGain();
          g.gain.setValueAtTime(EPS, t);
          g.gain.linearRampToValueAtTime(0.055, t + 0.05);
          g.gain.linearRampToValueAtTime(0.04, t + 0.24);
          g.gain.exponentialRampToValueAtTime(EPS, t + 0.32);
          src.connect(f);
          f.connect(g);
          g.connect(master);
          src.start(t);
          src.stop(t + 0.4);
        }
        tone(t + 0.29, 150, 92, 0.08, { vol: 0.06 });
      } else if (name === 'structural') {
        // Distant structural failure. "Distant" is the whole brief: everything above a few hundred
        // hertz is gone, because that is what a wall coming down two floors away sounds like from a
        // desk. A long lowpassed rumble, a subsonic drop under it, and a scatter of debris after.
        noise(t, 1.5, { lp: 260, q: 0.7, vol: 0.13, decay: 1 });
        tone(t, 62, 24, 1.1, { vol: 0.1 });
        noise(t + 0.22, 0.8, { bp: 480, q: 0.9, vol: 0.035 });
        noise(t + 0.55, 0.5, { bp: 900, q: 1.2, vol: 0.018 });
      } else if (name === 'pen') {
        // A works order signed: one short scratch, nothing more.
        noise(t, 0.085, { hp: 3600, vol: 0.05, decay: 0.8 });
      } else if (name === 'refused') {
        // An action the facility declines. A dry wooden click, deliberately unmusical: this is the
        // sound of nothing happening, and it should not be satisfying.
        tone(t, 320, 240, 0.035, { vol: 0.05, type: 'square' });
        noise(t, 0.03, { hp: 2200, vol: 0.03 });
      } else {
        return false;
      }
      return true;
    } catch (err) {
      if (log) log.warn('sfx failed', `${name}: ${err && err.message}`);
      return false;
    }
  }

  function dispose() {
    try {
      if (band) band.dispose();
      if (master) master.disconnect();
      if (ctx && ctx.close) ctx.close();
    } catch (_) {
      /* teardown is best-effort by design; a failed close must not block quit() */
    }
    ctx = null;
    master = null;
    band = null;
    scene = null;
  }

  return {
    unlock,
    update,
    play,
    setMuted,
    dispose,
    get live() {
      return alive();
    },
    get muted() {
      return muted;
    },
    get scene() {
      return scene;
    },
    get band() {
      return band;
    },
  };
}

/** True for an OfflineAudioContext, which renders faster than real time and must not be resumed. */
function isOffline(ctx) {
  return !!(ctx && (typeof ctx.startRendering === 'function' || ctx.length !== undefined));
}

/** Two seconds of seeded noise, shared by every effect. Seeded, so the audio path stays clean. */
function makeNoise(ctx, seed = 1) {
  if (!ctx.createBuffer) return null;
  try {
    const rate = ctx.sampleRate || 44100;
    const buf = ctx.createBuffer(1, rate * 2, rate);
    const rnd = mulberry32(seed >>> 0);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    return buf;
  } catch (_) {
    return null;
  }
}

export { clamp01 };

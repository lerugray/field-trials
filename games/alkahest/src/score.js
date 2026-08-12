/* ALKAHEST -- M5 House Band: procedural glass-and-clockwork score.
 *
 * The House Band pattern is a pure score/parameter layer over a tiny WebAudio
 * kit. Musical expression here is ALKAHEST's own: additive struck glass,
 * close-partial armonica swells, an imperfect escapement, warm room tone, and
 * slag/ink action voices. No samples or generated media exist.
 *
 * `scoreParams` and `scoreEvents` are pure and deterministic. ScoreDirector
 * observes simulation state and turns changes into named hooks. AudioSystem is
 * the browser adapter: gesture-gated WebAudio, a bounded look-ahead scheduler,
 * and loud logging for genuine runtime failures. Node can load all of it without
 * WebAudio, which keeps the engine/tests headless.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var ACT_VOICES = {
    nigredo:    { root: 46, scale: [0, 3, 5, 7, 10], path: [0, 3, 1, 4] },
    albedo:     { root: 52, scale: [0, 2, 5, 7, 9],  path: [0, 2, 4, 1] },
    citrinitas: { root: 54, scale: [0, 2, 4, 7, 9],  path: [0, 4, 2, 3] },
    rubedo:     { root: 48, scale: [0, 3, 5, 8, 10], path: [0, 1, 3, 4] }
  };
  var ACTIONS = ["swap", "clear", "combo", "chain", "incoming", "dross", "draft", "cast", "danger"];

  function clamp01(v) { return Math.max(0, Math.min(1, +v || 0)); }
  function midiFreq(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  /* Pure mapping from procedural state to the score timeline. Both pressure
   * terms are positive-only, so the monotonicity contract is obvious and pinned. */
  function scoreParams(s) {
    s = s || {};
    var stack = clamp01(s.stack);
    var density = clamp01(s.chainDensity);
    var surface = s.surface || "title";
    var stop = !!s.stopTime;
    var pressure = clamp01(stack * 0.68 + density * 0.32 + (s.danger ? 0.12 : 0));
    if (surface !== "bout") pressure = Math.min(pressure, surface === "end" ? 0.32 : 0.22);
    return {
      stack: stack,
      chainDensity: density,
      pressure: pressure,
      intensity: 0.16 + pressure * 0.84,
      bpm: 66 + pressure * 42,
      clockGain: stop ? 0 : 0.018 + pressure * 0.038,
      glassGain: 0.034 + density * 0.050 + pressure * 0.018,
      glassSustain: (0.72 + density * 0.65) * (stop ? 1.85 : 1),
      roomGain: 0.018 + (1 - pressure) * 0.006,
      stopTime: stop,
      surface: surface
    };
  }

  function scaleNote(voice, degree, octave) {
    var n = voice.scale[((degree % voice.scale.length) + voice.scale.length) % voice.scale.length];
    return voice.root + n + (octave || 0) * 12;
  }

  /* Deterministic sixteen-step material. State changes density, gain, sustain,
   * tempo, and the presence of the clock; act changes pitch material. */
  function scoreEvents(act, step, p) {
    var v = ACT_VOICES[act] || ACT_VOICES.nigredo;
    var s = ((step % 16) + 16) % 16;
    var bar = Math.floor(step / 16);
    var rootDegree = v.path[((bar % v.path.length) + v.path.length) % v.path.length];
    var out = [];
    if (s === 0) {
      out.push({ voice: "armonica", freq: midiFreq(scaleNote(v, rootDegree, -1)),
        dur: 2.2 + p.glassSustain, gain: p.glassGain * 0.72 });
      out.push({ voice: "armonica", freq: midiFreq(scaleNote(v, rootDegree + 2, 0)),
        dur: 2.0 + p.glassSustain, gain: p.glassGain * 0.48 });
    }
    var clockEvery = p.pressure > 0.58 ? 1 : 2;
    if (p.clockGain > 0 && s % clockEvery === 0) {
      out.push({ voice: "clock", tooth: (step * 5 + bar * 3) % 7, gain: p.clockGain });
    }
    var glassEvery = p.chainDensity > 0.55 ? 2 : 4;
    if (s % glassEvery === 2) {
      var degree = rootDegree + ((s / 2 + bar) | 0);
      out.push({ voice: "glass", freq: midiFreq(scaleNote(v, degree, 1)),
        dur: p.glassSustain, gain: p.glassGain });
    }
    if (p.chainDensity > 0.68 && (s === 7 || s === 15)) {
      out.push({ voice: "glass", freq: midiFreq(scaleNote(v, rootDegree + 4, 2)),
        dur: p.glassSustain * 0.82, gain: p.glassGain * 0.72 });
    }
    return out;
  }

  function machineStack(m) {
    if (!m || !m.grid || !m.grid.rows || typeof m.grid.stackHeight !== "function") return 0;
    return clamp01(m.grid.stackHeight() / m.grid.rows);
  }

  function ScoreDirector(emit) {
    this.emit = typeof emit === "function" ? emit : function () {};
    this.machineState = new WeakMap();
    this.runState = new WeakMap();
    this.chainDensity = 0;
    this.time = 0;
  }

  ScoreDirector.prototype._machine = function (m, budget) {
    var old = this.machineState.get(m);
    if (!old) {
      old = { swaps: 0, eventT: null, queue: 0, crushT: null, castT: null,
        danger: false, dangerAt: -999 };
      this.machineState.set(m, old);
    }
    var self = this;
    function fire(name, detail) {
      budget[name] = budget[name] || 0;
      if (budget[name] >= 2) return;
      budget[name]++;
      self.emit(name, detail || {});
    }

    var swaps = m.stats && m.stats.swaps || 0;
    if (swaps > old.swaps) fire("swap", { count: swaps - old.swaps });
    old.swaps = swaps;

    var ev = m.lastEvent;
    if (ev && ev.t !== old.eventT) {
      fire("clear", { chain: ev.chain || 1, combo: ev.combo || 0 });
      var breadth = Math.max(0, (ev.combo || 0) - 3) * 0.075;
      var depth = Math.max(0, (ev.chain || 1) - 1) * 0.24;
      this.chainDensity = clamp01(this.chainDensity + 0.08 + breadth + depth);
      if ((ev.chain || 1) > 1) fire("chain", { chain: ev.chain });
      if ((ev.combo || 0) >= 4) fire("combo", { combo: ev.combo });
      old.eventT = ev.t;
    }

    var queue = m.drossQueue ? m.drossQueue.length : 0;
    if (queue > old.queue) fire("incoming", { count: queue - old.queue });
    old.queue = queue;

    if (m.lastCrush && m.lastCrush.t !== old.crushT) {
      fire("dross", { width: m.lastCrush.width, height: m.lastCrush.height });
      old.crushT = m.lastCrush.t;
    }
    if (m.lastCast && m.lastCast.t !== old.castT) {
      fire("cast", { kind: m.lastCast.kind });
      old.castT = m.lastCast.t;
    }

    var danger = !!m.danger;
    if (danger && (!old.danger || this.time - old.dangerAt >= 1.25 - machineStack(m) * 0.55)) {
      fire("danger", { stack: machineStack(m) });
      old.dangerAt = this.time;
    }
    old.danger = danger;
  };

  /* Observe once per visual frame, after simulation update. It returns the pure
   * snapshot/params even without WebAudio, which makes adaptation testable. */
  ScoreDirector.prototype.observe = function (snapshot, dt) {
    snapshot = snapshot || {};
    dt = Math.max(0, Math.min(0.25, +dt || 0));
    this.time += dt;
    this.chainDensity *= Math.exp(-dt / 2.8);
    var machines = snapshot.machines || [];
    var budget = Object.create(null);
    for (var i = 0; i < machines.length; i++) this._machine(machines[i], budget);

    var run = snapshot.run;
    if (run) {
      var rs = this.runState.get(run);
      if (!rs) { rs = { state: run.state, cards: run.folio && run.folio.cards.length || 0 }; this.runState.set(run, rs); }
      if (run.state === "draft" && rs.state !== "draft") this.emit("draft", { phase: "open" });
      rs.state = run.state;
      rs.cards = run.folio && run.folio.cards.length || 0;
    }

    var stack = 0;
    for (var j = 0; j < machines.length; j++) stack = Math.max(stack, machineStack(machines[j]));
    var stop = !!snapshot.paused;
    for (var k = 0; k < machines.length; k++) {
      if (machines[k] && typeof machines[k].isFrozen === "function" && machines[k].isFrozen()) stop = true;
    }
    var procedural = {
      act: snapshot.act || "nigredo",
      surface: snapshot.surface || "title",
      stack: stack,
      chainDensity: this.chainDensity,
      stopTime: stop,
      danger: !!(machines[0] && machines[0].danger)
    };
    return { snapshot: procedural, params: scoreParams(procedural) };
  };

  function sceneAudioSnapshot(scene) {
    var out = { act: "nigredo", surface: "title", machines: [] };
    if (!scene) return out;
    if (scene.run) {
      var run = scene.run;
      out.run = run; out.act = run.actName || "nigredo";
      out.surface = run.state === "bout" ? "bout" :
        (run.state === "draft" || run.state === "workshop" ? "folio" : "end");
      if (run.duel && run.state === "bout") {
        out.machines = [run.duel.player, run.duel.rival]; out.paused = run.duel.paused;
      }
    } else if (scene.duel) {
      out.surface = "bout"; out.act = scene.act || "nigredo";
      out.machines = [scene.duel.player, scene.duel.rival]; out.paused = scene.duel.paused;
    } else if (scene.tut) {
      out.surface = "bout"; out.act = "nigredo"; out.machines = [scene.tut.m];
    } else if (scene.m) {
      out.surface = "bout"; out.act = scene.act || "nigredo"; out.machines = [scene.m];
      out.paused = !!scene.paused;
    }
    return out;
  }

  function AudioSystem() {
    var self = this;
    this.ctx = null;
    this.ready = false;
    this.failed = false;
    this.muted = false;
    this.attached = [];
    this.step = 0;
    this.nextTime = 0;
    this.act = "nigredo";
    this.params = scoreParams({});
    this.director = new ScoreDirector(function (name, detail) { self.play(name, detail); });
  }

  AudioSystem.prototype._report = function (message, err) {
    if (this.failed) return;
    this.failed = true;
    var text = "audio: " + message + (err && err.message ? " (" + err.message + ")" : "");
    if (AL.debug && AL.debug.error) AL.debug.error(text);
    else if (typeof console !== "undefined" && console.error) console.error("[AL] " + text);
  };

  AudioSystem.prototype.attach = function (win) {
    if (!win || typeof win.addEventListener !== "function" || this.attached.indexOf(win) >= 0) return this;
    this.attached.push(win);
    var self = this;
    function wake() { self.init(win); }
    win.addEventListener("keydown", wake);
    win.addEventListener("mousedown", wake);
    win.addEventListener("touchstart", wake);
    return this;
  };

  function seededNoise(data, seed) {
    var x = seed >>> 0;
    for (var i = 0; i < data.length; i++) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      data[i] = ((x >>> 0) / 2147483648) - 1;
    }
  }

  AudioSystem.prototype.init = function (win) {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume();
      return this.ready && !this.failed;
    }
    if (this.failed) return false;
    win = win || (typeof window !== "undefined" ? window : null);
    var Ctor = win && (win.AudioContext || win.webkitAudioContext);
    if (!Ctor) return false; // supported headless/older-browser path, not an error
    try {
      var ac = this.ctx = new Ctor();
      this.master = ac.createGain(); this.master.gain.value = 0.38;
      var comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 4;
      comp.attack.value = 0.008; comp.release.value = 0.24;
      this.master.connect(comp); comp.connect(ac.destination);
      this.musicBus = ac.createGain(); this.musicBus.gain.value = 0.78; this.musicBus.connect(this.master);
      this.sfxBus = ac.createGain(); this.sfxBus.gain.value = 0.86; this.sfxBus.connect(this.master);
      this.roomBus = ac.createGain(); this.roomBus.gain.value = this.params.roomGain; this.roomBus.connect(this.master);

      var impulse = ac.createBuffer(2, Math.floor(ac.sampleRate * 1.65), ac.sampleRate);
      for (var c = 0; c < 2; c++) {
        var id = impulse.getChannelData(c); seededNoise(id, 0xa17e51 + c * 7919);
        for (var q = 0; q < id.length; q++) id[q] *= Math.pow(1 - q / id.length, 2.7);
      }
      this.verb = ac.createConvolver(); this.verb.buffer = impulse;
      var wet = ac.createGain(); wet.gain.value = 0.30; this.verb.connect(wet); wet.connect(this.master);

      var roomBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      seededNoise(roomBuf.getChannelData(0), 0x51a6f00d);
      this.noiseBuffer = roomBuf;
      var room = ac.createBufferSource(); room.buffer = roomBuf; room.loop = true;
      var roomFilter = ac.createBiquadFilter(); roomFilter.type = "lowpass"; roomFilter.frequency.value = 520;
      room.connect(roomFilter); roomFilter.connect(this.roomBus); room.start(); this.roomSource = room;
      this.ready = true;
      this.nextTime = ac.currentTime + 0.035;
      return true;
    } catch (e) {
      this._report("WebAudio initialization failed", e);
      return false;
    }
  };

  AudioSystem.prototype._send = function (node, amount) {
    if (!amount || !this.verb) return;
    var g = this.ctx.createGain(); g.gain.value = amount; node.connect(g); g.connect(this.verb);
  };

  function envelope(gain, t, attack, decay, peak) {
    gain.setValueAtTime(0.0001, t);
    gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  AudioSystem.prototype._tone = function (t, freq, dur, gain, wave, bus, verb, slide) {
    var ac = this.ctx, osc = ac.createOscillator(), g = ac.createGain();
    osc.type = wave || "sine"; osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    envelope(g.gain, t, 0.004, dur, gain);
    osc.connect(g); g.connect(bus || this.sfxBus); this._send(g, verb || 0);
    osc.start(t); osc.stop(t + dur + 0.04);
  };

  AudioSystem.prototype._noise = function (t, dur, freq, gain, bus, verb) {
    var ac = this.ctx, src = ac.createBufferSource(); src.buffer = this.noiseBuffer;
    var f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.8;
    var g = ac.createGain(); envelope(g.gain, t, 0.002, dur, gain);
    src.connect(f); f.connect(g); g.connect(bus || this.sfxBus); this._send(g, verb || 0);
    src.start(t); src.stop(t + dur + 0.04);
  };

  AudioSystem.prototype._glass = function (t, freq, dur, gain, bus) {
    var ratios = [1, 2.018, 2.94, 4.17], vols = [1, 0.38, 0.20, 0.09];
    for (var i = 0; i < ratios.length; i++)
      this._tone(t, freq * ratios[i], dur * (1 - i * 0.09), gain * vols[i], "sine", bus || this.musicBus, 0.52);
  };

  AudioSystem.prototype._armonica = function (t, freq, dur, gain) {
    var ac = this.ctx, out = ac.createGain(); out.connect(this.musicBus); this._send(out, 0.64);
    for (var i = 0; i < 3; i++) {
      var osc = ac.createOscillator(), g = ac.createGain(); osc.type = "sine";
      osc.frequency.value = freq * (i === 2 ? 2.002 : 1); osc.detune.value = i === 0 ? -4 : (i === 1 ? 5 : 0);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * (i === 2 ? 0.22 : 0.5), t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
    }
  };

  AudioSystem.prototype._clock = function (t, tooth, gain) {
    this._noise(t, 0.026 + tooth * 0.001, 2600 + tooth * 130, gain, this.musicBus, 0.06);
    this._tone(t, 76 + tooth * 2, 0.045, gain * 0.48, "triangle", this.musicBus, 0);
  };

  AudioSystem.prototype._schedule = function (event, t) {
    if (event.voice === "glass") this._glass(t, event.freq, event.dur, event.gain, this.musicBus);
    else if (event.voice === "armonica") this._armonica(t, event.freq, event.dur, event.gain);
    else if (event.voice === "clock") this._clock(t, event.tooth, event.gain);
  };

  AudioSystem.prototype.play = function (name, detail) {
    if (!this.ready || this.failed || this.muted || ACTIONS.indexOf(name) < 0) return false;
    var t = this.ctx.currentTime + 0.008, d = detail || {}, i;
    try {
      if (name === "swap") {
        this._tone(t, 720, 0.045, 0.055, "triangle", this.sfxBus, 0.10, 610);
        this._tone(t + 0.035, 860, 0.040, 0.045, "triangle", this.sfxBus, 0.08, 760);
      } else if (name === "clear") {
        for (i = 0; i < 3; i++) this._glass(t + i * 0.035, 980 / Math.pow(1.12, i), 0.20, 0.035, this.sfxBus);
      } else if (name === "combo") {
        var combo = Math.min(7, Math.max(4, d.combo || 4));
        for (i = 0; i < Math.min(4, combo - 2); i++) this._glass(t, 390 * Math.pow(1.24, i), 0.42, 0.038, this.sfxBus);
      } else if (name === "chain") {
        var links = Math.min(6, Math.max(2, d.chain || 2));
        for (i = 0; i < links; i++) this._glass(t + i * 0.055, 520 * Math.pow(1.16, i), 0.58, 0.042, this.sfxBus);
      } else if (name === "incoming") {
        this._tone(t, 150, 0.22, 0.075, "triangle", this.sfxBus, 0.08, 112);
        this._tone(t + 0.14, 128, 0.20, 0.065, "triangle", this.sfxBus, 0.06, 96);
      } else if (name === "dross") {
        this._noise(t, 0.34, 360, 0.12, this.sfxBus, 0.16);
        this._tone(t, 92, 0.30, 0.105, "sine", this.sfxBus, 0.05, 48);
      } else if (name === "draft") {
        this._noise(t, 0.18, 1700, 0.045, this.sfxBus, 0.05);
        this._glass(t + 0.12, 784, 0.72, 0.055, this.sfxBus);
      } else if (name === "cast") {
        for (i = 0; i < 4; i++) this._glass(t + i * 0.045, 420 * Math.pow(1.22, i), 0.34, 0.032, this.sfxBus);
      } else if (name === "danger") {
        var lift = 1 + clamp01(d.stack) * 0.14;
        this._glass(t, 196 * lift, 0.48, 0.055, this.sfxBus);
        this._glass(t + 0.16, 174 * lift, 0.55, 0.052, this.sfxBus);
      }
      return true;
    } catch (e) {
      this._report("sound hook failed: " + name, e);
      return false;
    }
  };

  AudioSystem.prototype.update = function (dt, snapshot) {
    var state = this.director.observe(snapshot, dt);
    this.params = state.params; this.act = state.snapshot.act;
    if (!this.ready || this.failed || this.muted) return state;
    try {
      var ac = this.ctx, now = ac.currentTime;
      if (this.roomBus && this.roomBus.gain.setTargetAtTime)
        this.roomBus.gain.setTargetAtTime(this.params.roomGain, now, 0.12);
      if (this.nextTime < now - 0.1) this.nextTime = now + 0.03;
      var guard = 0;
      while (this.nextTime < now + 0.18 && guard++ < 12) {
        var events = scoreEvents(this.act, this.step, this.params);
        for (var i = 0; i < events.length; i++) this._schedule(events[i], this.nextTime);
        this.step++;
        this.nextTime += 60 / this.params.bpm / 4;
      }
    } catch (e) { this._report("score scheduler failed", e); }
    return state;
  };

  AudioSystem.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.38, this.ctx.currentTime, 0.04);
    return this.muted;
  };

  AL.scoreParams = scoreParams;
  AL.scoreEvents = scoreEvents;
  AL.sceneAudioSnapshot = sceneAudioSnapshot;
  AL.ScoreDirector = ScoreDirector;
  AL.AudioSystem = AudioSystem;
  AL.SCORE = { ACT_VOICES: ACT_VOICES, ACTIONS: ACTIONS, midiFreq: midiFreq };
  AL.audio = AL.audio || new AudioSystem();
});

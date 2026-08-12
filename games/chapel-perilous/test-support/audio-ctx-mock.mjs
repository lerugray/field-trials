// A recording WebAudio mock, shared by the audio/band/score suites.
//
// It lives OUTSIDE test/ deliberately: `node --test` treats every file under a
// directory named `test` as a test file and executes it, so a helper there runs
// as an empty (and in practice disruptive) test. `test-support/` is not matched
// by any of the runner's patterns — verified before this file was written.
//
// The mock records enough to make behavioural assertions about the score rather
// than just "it did not throw": which oscillators were built at which times and
// frequencies, what the filters were tuned to, and a flat event trace that two
// runs can be compared on for determinism.

export function createMockCtx({ sampleRate = 8000, state = 'running' } = {}) {
  const log = {
    now: 0,
    gains: 0,
    oscs: [],       // { type, freqs, detune, start, stop }
    filters: [],    // { type, freqs }
    sources: 0,     // AudioBufferSourceNode count
    buffers: 0,
    convolvers: 0,
    compressors: 0,
    connects: 0,
    disconnects: 0,
    resumed: false,
    events: [],     // flat trace: 'osc:<type>@<t>:<hz>' — comparable across runs
    // sidecar path
    decoded: 0,
    loopStarted: false,
    startOffset: null,
    src: null,
    duration: 60,
  };

  const round = (v) => Math.round(v * 1e6) / 1e6;

  function param(record) {
    const p = {
      value: 0,
      setValueAtTime(v) { if (record) record.push(round(v)); return p; },
      linearRampToValueAtTime(v) { if (record) record.push(round(v)); return p; },
      exponentialRampToValueAtTime(v) { if (record) record.push(round(v)); return p; },
      cancelScheduledValues() { return p; },
    };
    return p;
  }

  // A recording AudioParam whose `.value` assignments are captured too. Must be
  // built with defineProperty rather than Object.assign — Object.assign copies a
  // getter's RESULT, not the accessor, which silently loses the setter.
  function recordingParam(record) {
    const p = param(record);
    Object.defineProperty(p, 'value', {
      enumerable: true,
      get() { return record.length ? record[0] : 0; },
      set(v) { record.push(round(v)); },
    });
    return p;
  }

  const ctx = {
    sampleRate,
    state,
    get currentTime() { return log.now; },
    destination: { id: 'dest' },
    resume() { log.resumed = true; ctx.state = 'running'; },

    createGain() {
      log.gains += 1;
      return {
        gain: param(null),
        connect() { log.connects += 1; },
        disconnect() { log.disconnects += 1; },
      };
    },

    createOscillator() {
      const rec = { type: 'sine', freqs: [], detune: 0, start: null, stop: null };
      log.oscs.push(rec);
      return {
        get type() { return rec.type; },
        set type(v) { rec.type = v; },
        frequency: recordingParam(rec.freqs),
        detune: {
          get value() { return rec.detune; },
          set value(v) { rec.detune = round(v); },
          setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {},
        },
        connect() { log.connects += 1; },
        disconnect() { log.disconnects += 1; },
        start(t) {
          rec.start = round(t === undefined ? log.now : t);
          log.events.push(`osc:${rec.type}@${rec.start}:${rec.freqs[0] === undefined ? '-' : rec.freqs[0]}`);
        },
        stop(t) { rec.stop = round(t === undefined ? log.now : t); },
      };
    },

    createBiquadFilter() {
      const rec = { type: 'lowpass', freqs: [] };
      log.filters.push(rec);
      return {
        get type() { return rec.type; },
        set type(v) { rec.type = v; },
        frequency: recordingParam(rec.freqs),
        Q: param(null),
        connect() { log.connects += 1; },
        disconnect() { log.disconnects += 1; },
      };
    },

    createDynamicsCompressor() {
      log.compressors += 1;
      return {
        threshold: param(null), knee: param(null), ratio: param(null),
        attack: param(null), release: param(null),
        connect() { log.connects += 1; }, disconnect() { log.disconnects += 1; },
      };
    },

    createConvolver() {
      log.convolvers += 1;
      return { buffer: null, connect() { log.connects += 1; }, disconnect() { log.disconnects += 1; } };
    },

    createBuffer(channels, length) {
      log.buffers += 1;
      const data = [];
      for (let c = 0; c < channels; c++) data.push(new Float32Array(length));
      return { duration: length / sampleRate, length, numberOfChannels: channels, getChannelData: (c) => data[c] };
    },

    createBufferSource() {
      log.sources += 1;
      const src = {
        buffer: null, loop: false, loopStart: 0, loopEnd: 0,
        connect() { log.connects += 1; }, disconnect() { log.disconnects += 1; },
        start(t, offset) { log.loopStarted = true; log.startOffset = offset; },
        stop() {},
      };
      log.src = src;
      return src;
    },

    async decodeAudioData() { log.decoded += 1; return { duration: log.duration }; },
  };

  return { ctx, log, factory: () => ctx };
}

/** Advance the mock clock and drive a band's scheduler over a span of seconds. */
export function runClock(band, log, seconds, stepMs = 25) {
  const dt = stepMs / 1000;
  for (let t = 0; t < seconds; t += dt) {
    log.now = Math.round((log.now + dt) * 1e6) / 1e6;
    band.tick(log.now);
  }
  return log;
}

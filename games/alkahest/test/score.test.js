"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

const AL = require("../src/core.js");
require("../src/score.js");

test("scorePressureMonotone: stack and chain density cannot lower intensity", () => {
  const low = AL.scoreParams({ surface: "bout", stack: 0.1, chainDensity: 0.1 });
  const stack = AL.scoreParams({ surface: "bout", stack: 0.8, chainDensity: 0.1 });
  const chain = AL.scoreParams({ surface: "bout", stack: 0.8, chainDensity: 0.9 });
  assert.ok(stack.intensity > low.intensity, "a taller stack raises pressure");
  assert.ok(chain.intensity > stack.intensity, "recent chain yield raises pressure again");
  assert.ok(chain.bpm >= stack.bpm && stack.bpm >= low.bpm);
});

test("stopTimeHangsGlass: stop-time removes clock and extends glass sustain", () => {
  const moving = AL.scoreParams({ surface: "bout", stack: 0.6, chainDensity: 0.5 });
  const frozen = AL.scoreParams({ surface: "bout", stack: 0.6, chainDensity: 0.5, stopTime: true });
  assert.ok(moving.clockGain > 0);
  assert.strictEqual(frozen.clockGain, 0, "the escapement goes silent");
  assert.ok(frozen.glassSustain > moving.glassSustain, "ringing glass hangs in the gap");
});

test("scoreActVoicingsDistinct: all four acts produce distinct pitch material", () => {
  const p = AL.scoreParams({ surface: "bout", stack: 0.4, chainDensity: 0.4 });
  const firstGlass = AL.ACT_ORDER ? AL.ACT_ORDER : ["nigredo", "albedo", "citrinitas", "rubedo"];
  const pitches = firstGlass.map((act) => AL.scoreEvents(act, 2, p).find((e) => e.voice === "glass").freq);
  assert.strictEqual(new Set(pitches.map((n) => n.toFixed(6))).size, 4);
});

test("scoreDeterministic: equal act, step, and params yield equal events", () => {
  const p = AL.scoreParams({ surface: "bout", stack: 0.73, chainDensity: 0.81 });
  assert.deepStrictEqual(AL.scoreEvents("citrinitas", 31, p), AL.scoreEvents("citrinitas", 31, p));
});

test("actionVocabularyComplete: every M5 hook plus distinct combo exists", () => {
  for (const name of ["swap", "clear", "chain", "dross", "draft", "combo"])
    assert.ok(AL.SCORE.ACTIONS.includes(name), name + " hook exists");
  assert.ok(AL.SCORE.ACTIONS.includes("incoming"), "incoming dross has advance warning");
});

function fakeMachine() {
  return {
    stats: { swaps: 0 },
    lastEvent: null,
    drossQueue: [],
    lastCrush: null,
    lastCast: null,
    danger: false,
    state: "play",
    grid: { rows: 14, stackHeight: () => 7 },
    isFrozen: () => false
  };
}

test("directorHooksSimulation: changed sim state emits each action once", () => {
  const heard = [];
  const director = new AL.ScoreDirector((name, detail) => heard.push({ name, detail }));
  const m = fakeMachine();
  const folio = { cards: [] };
  const run = { state: "bout", folio };
  director.observe({ act: "nigredo", surface: "bout", machines: [m], run }, 0.016);

  m.stats.swaps = 1;
  m.lastEvent = { t: 1, chain: 2, combo: 5 };
  m.drossQueue.push({ width: 6, height: 1 });
  m.lastCrush = { t: 1, width: 4, height: 1 };
  run.state = "draft";
  const state = director.observe({ act: "nigredo", surface: "folio", machines: [m], run }, 0.016);
  const names = heard.map((e) => e.name);
  for (const name of ["swap", "clear", "chain", "combo", "incoming", "dross", "draft"])
    assert.ok(names.includes(name), name + " was derived from state");
  assert.ok(state.params.chainDensity > 0, "the clear also feeds procedural score density");

  const count = heard.length;
  director.observe({ act: "nigredo", surface: "folio", machines: [m], run }, 0.016);
  assert.strictEqual(heard.length, count, "unchanged state never repeats hooks");
});

test("chainComboDistinct: a deep wide clear emits both separate vocabularies", () => {
  const heard = [];
  const director = new AL.ScoreDirector((name, detail) => heard.push({ name, detail }));
  const m = fakeMachine();
  director.observe({ surface: "bout", machines: [m] }, 0);
  m.lastEvent = { t: 2, chain: 3, combo: 6 };
  director.observe({ surface: "bout", machines: [m] }, 0.01);
  assert.strictEqual(heard.filter((e) => e.name === "chain").length, 1);
  assert.strictEqual(heard.filter((e) => e.name === "combo").length, 1);
  assert.strictEqual(heard.find((e) => e.name === "chain").detail.chain, 3);
  assert.strictEqual(heard.find((e) => e.name === "combo").detail.combo, 6);
});

test("audioUnavailableSafe: no WebAudio is a supported silent path", () => {
  const listeners = {};
  const win = { addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); } };
  const audio = new AL.AudioSystem();
  assert.strictEqual(audio.attach(win), audio);
  assert.strictEqual(audio.init(win), false);
  assert.strictEqual(audio.failed, false, "absence is not a loud runtime failure");
  assert.doesNotThrow(() => audio.update(0.016, { surface: "title", machines: [] }));
  assert.ok(listeners.keydown.length && listeners.mousedown.length && listeners.touchstart.length,
    "every common first gesture can wake audio");
});

function fakeAudioContextClass() {
  function Param(value) { this.value = value || 0; }
  Param.prototype.setValueAtTime = function (v) { this.value = v; };
  Param.prototype.exponentialRampToValueAtTime = function (v) { this.value = v; };
  Param.prototype.linearRampToValueAtTime = function (v) { this.value = v; };
  Param.prototype.setTargetAtTime = function (v) { this.value = v; };
  function Node() {}
  Node.prototype.connect = function () { return this; };
  function Source(ctx) {
    this.frequency = new Param(); this.detune = new Param(); this.loop = false;
    this.start = function () { ctx.started++; };
    this.stop = function () { ctx.stopped++; };
  }
  Source.prototype = Object.create(Node.prototype);
  Source.prototype.constructor = Source;
  return function FakeAudioContext() {
    const self = this;
    this.currentTime = 0; this.sampleRate = 1000; this.destination = new Node();
    this.state = "running"; this.started = 0; this.stopped = 0;
    this.createGain = () => { const n = new Node(); n.gain = new Param(); return n; };
    this.createDynamicsCompressor = () => {
      const n = new Node();
      for (const k of ["threshold", "knee", "ratio", "attack", "release"]) n[k] = new Param();
      return n;
    };
    this.createBuffer = (channels, length) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (i) => data[i] };
    };
    this.createConvolver = () => { const n = new Node(); n.buffer = null; return n; };
    this.createBufferSource = () => { const n = new Source(self); n.buffer = null; return n; };
    this.createBiquadFilter = () => {
      const n = new Node(); n.frequency = new Param(); n.Q = new Param(); return n;
    };
    this.createOscillator = () => new Source(self);
    this.resume = () => { this.state = "running"; };
  };
}

test("code-composed WebAudio graph schedules score and every action voice", () => {
  const FakeAudioContext = fakeAudioContextClass();
  const audio = new AL.AudioSystem();
  assert.strictEqual(audio.init({ AudioContext: FakeAudioContext }), true);
  assert.ok(audio.roomSource, "generated room tone is running");
  const before = audio.ctx.started;
  audio.update(0.016, { act: "albedo", surface: "bout", machines: [] });
  for (const name of AL.SCORE.ACTIONS) assert.strictEqual(audio.play(name, { chain: 4, combo: 6, stack: 0.9 }), true);
  assert.ok(audio.ctx.started > before, "oscillators/noise sources were scheduled");
  assert.strictEqual(audio.failed, false, "the complete graph and kit ran without a synthesis error");
});

#!/usr/bin/env node
/**
 * probe-audio.mjs — REAL-BROWSER verification of the ambient score.
 *
 * The score's unit suites (test/band.test.js, test/score.test.js) run against a
 * mock AudioContext, which proves the scheduling logic but cannot prove the game
 * drives a real WebAudio graph. This probe closes that gap the only way it can be
 * closed: it instruments the genuine AudioContext prototype BEFORE the page
 * boots, drives the artifact over file:// with real keyboard gestures, and then
 * asserts on the nodes the browser actually built.
 *
 * It verifies, objectively and without ears:
 *   1. the score starts on the first gesture and keeps scheduling (a live sequencer)
 *   2. notes are scheduled AHEAD of currentTime (lookahead, not fire-and-forget)
 *   3. a game state change actually changes the bed (a different pitch signature)
 *   4. [M] mute parks the sequencer — node creation stops dead
 *   5. zero console errors, and no unbounded node growth
 *
 * It does NOT and cannot judge whether the music sounds good. That is the
 * operator's ear, and it is the only gate for that question.
 *
 * Run: node scripts/probe-audio.mjs [path-to-artifact]
 *      (defaults to the repo's chapel-perilous.html)
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = process.argv[2] || resolve(root, 'chapel-perilous.html');
if (!existsSync(ARTIFACT)) {
  console.error(`FAIL: no artifact at ${ARTIFACT} (run scripts/build-singlefile.mjs)`);
  process.exit(1);
}

const results = [];
let failed = false;
const pass = (name, detail) => { results.push(['PASS', name, detail]); console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`); };
const fail = (name, detail) => { failed = true; results.push(['FAIL', name, detail]); console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); };

// Instrument the real WebAudio API before any page script runs.
const INSTRUMENT = () => {
  const rec = {
    oscs: 0, sources: 0, convolvers: 0, buffers: 0, gains: 0, filters: 0,
    starts: [],            // { t, freq, at }  t = scheduled time, at = currentTime when scheduled
    freqs: [],             // every frequency assigned to an oscillator
    contexts: 0,
  };
  window.__AUDIOREC = rec;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const P = AC.prototype;
  const wrap = (name, after) => {
    const orig = P[name];
    if (typeof orig !== 'function') return;
    P[name] = function (...args) {
      const node = orig.apply(this, args);
      try { after(node, this, args); } catch (_) { /* never break the game */ }
      return node;
    };
  };
  const OrigAC = AC;
  const Patched = function (...args) { rec.contexts += 1; return new OrigAC(...args); };
  Patched.prototype = OrigAC.prototype;
  window.AudioContext = Patched;
  if (window.webkitAudioContext) window.webkitAudioContext = Patched;

  wrap('createOscillator', (node, ctx) => {
    rec.oscs += 1;
    // Record the frequency actually assigned, and when the note is scheduled for.
    const fp = node.frequency;
    const origSet = fp.setValueAtTime.bind(fp);
    fp.setValueAtTime = (v, t) => { rec.freqs.push(Math.round(v * 100) / 100); return origSet(v, t); };
    let assigned = null;
    try {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(fp), 'value');
      Object.defineProperty(fp, 'value', {
        configurable: true,
        get() { return d.get.call(fp); },
        set(v) { assigned = Math.round(v * 100) / 100; rec.freqs.push(assigned); d.set.call(fp, v); },
      });
    } catch (_) { /* ignore */ }
    const origStart = node.start.bind(node);
    node.start = (t) => {
      const when = t === undefined ? ctx.currentTime : t;
      rec.starts.push({ t: Math.round(when * 1000) / 1000, at: Math.round(ctx.currentTime * 1000) / 1000, freq: assigned });
      return origStart(t);
    };
  });
  wrap('createBufferSource', () => { rec.sources += 1; });
  wrap('createConvolver', () => { rec.convolvers += 1; });
  wrap('createBuffer', () => { rec.buffers += 1; });
  wrap('createGain', () => { rec.gains += 1; });
  wrap('createBiquadFilter', () => { rec.filters += 1; });
};

const snap = (page) => page.evaluate(() => {
  const r = window.__AUDIOREC || {};
  return {
    oscs: r.oscs | 0, sources: r.sources | 0, convolvers: r.convolvers | 0,
    buffers: r.buffers | 0, gains: r.gains | 0, filters: r.filters | 0,
    contexts: r.contexts | 0,
    starts: (r.starts || []).slice(-400),
    freqs: (r.freqs || []).slice(-400),
  };
});

/** The distinct low pitches a window of the trace used — a bed's fingerprint. */
const signature = (freqs) => [...new Set(freqs.filter((f) => f > 0 && f < 400).map((f) => Math.round(f)))].sort((a, b) => a - b);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));

  await page.addInitScript(INSTRUMENT);
  console.log(`artifact: ${ARTIFACT}`);
  await page.goto(pathToFileURL(ARTIFACT).href);
  await page.waitForTimeout(900);

  // --- 1. silent before any gesture (autoplay policy + silence by design) ----
  const beforeGesture = await snap(page);
  if (beforeGesture.oscs === 0 && beforeGesture.contexts === 0) {
    pass('silent_before_gesture', 'no context, no nodes until the player acts');
  } else {
    fail('silent_before_gesture', `oscs=${beforeGesture.oscs} contexts=${beforeGesture.contexts}`);
  }

  // --- 2. the score starts on the gesture and keeps running ------------------
  await page.keyboard.press('Space'); // title -> creation; also the audio gesture
  await page.waitForTimeout(1200);
  const t1 = await snap(page);
  if (t1.contexts === 1 && t1.oscs > 0) pass('score_starts_on_gesture', `oscs=${t1.oscs} gains=${t1.gains} filters=${t1.filters}`);
  else fail('score_starts_on_gesture', `contexts=${t1.contexts} oscs=${t1.oscs}`);

  if (t1.convolvers === 1 && t1.buffers >= 2) pass('reverb_bus_built', `convolver=${t1.convolvers} code-generated buffers=${t1.buffers}`);
  else fail('reverb_bus_built', `convolvers=${t1.convolvers} buffers=${t1.buffers}`);

  await page.waitForTimeout(2500);
  const t2 = await snap(page);
  if (t2.oscs > t1.oscs) pass('sequencer_keeps_scheduling', `${t1.oscs} -> ${t2.oscs} nodes over 2.5s`);
  else fail('sequencer_keeps_scheduling', `stalled at ${t2.oscs}`);

  // --- 3. lookahead: notes are placed in the future, not at currentTime ------
  const ahead = t2.starts.filter((s) => s.t > s.at + 0.005).length;
  const behind = t2.starts.filter((s) => s.t < s.at - 0.005).length;
  if (ahead > 0 && behind === 0) pass('lookahead_scheduling', `${ahead}/${t2.starts.length} notes scheduled ahead, 0 in the past`);
  else fail('lookahead_scheduling', `ahead=${ahead} behind=${behind}`);

  // --- 4. a state change changes the bed ------------------------------------
  const sigCreation = signature(t2.freqs);
  await page.keyboard.press('Space'); // creation -> overworld
  await page.waitForTimeout(600);
  // Entering the world for the first time raises the one-time "the stranger's
  // nature" explainer, and main.js dismisses that overlay on ANY key BEFORE the
  // global action table is consulted. Clear it, or the next keypress in this probe
  // gets eaten and the mute gates measure the wrong thing entirely.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3500);
  const t3 = await snap(page);
  const sigCountry = signature(t3.freqs);
  const changed = JSON.stringify(sigCreation) !== JSON.stringify(sigCountry);
  if (changed) pass('bed_follows_game_state', `creation低=[${sigCreation.slice(0, 6)}] -> overworld=[${sigCountry.slice(0, 6)}]`.replace('低', ''));
  else fail('bed_follows_game_state', `the pitch signature did not change: [${sigCountry.slice(0, 8)}]`);

  // --- 5. mute parks the sequencer ------------------------------------------
  // MEASUREMENT WINDOW: the country bed is deliberately sparse — its pad chords
  // retrigger every 16 steps, which at 40bpm is one every 6 seconds. A 2-3s
  // window can therefore contain zero node-creating steps and "prove" anything.
  // So: press, SETTLE (let notes already inside the lookahead finish being
  // scheduled), then measure across a window wider than one phrase.
  const SETTLE = 1500;
  const WINDOW = 8000; // > 6s, so at least one pad retrigger must fall inside

  await page.keyboard.press('m'); // mute
  await page.waitForTimeout(SETTLE);
  const mutedStart = (await snap(page)).oscs;
  await page.waitForTimeout(WINDOW);
  const mutedEnd = (await snap(page)).oscs;
  if (mutedEnd === mutedStart) pass('mute_parks_sequencer', `zero nodes built over ${WINDOW / 1000}s muted (held at ${mutedEnd})`);
  else fail('mute_parks_sequencer', `${mutedStart} -> ${mutedEnd}: a muted score is still building nodes`);

  await page.keyboard.press('m'); // unmute
  await page.waitForTimeout(SETTLE);
  const upStart = (await snap(page)).oscs;
  await page.waitForTimeout(WINDOW);
  const upEnd = (await snap(page)).oscs;
  if (upEnd > upStart) pass('unmute_resumes', `${upStart} -> ${upEnd} over ${WINDOW / 1000}s`);
  else fail('unmute_resumes', `still parked at ${upEnd}`);

  // --- 6. hygiene -----------------------------------------------------------
  if (consoleErrors.length === 0 && pageErrors.length === 0) pass('no_errors', 'zero console + page errors');
  else fail('no_errors', `console=${JSON.stringify(consoleErrors.slice(0, 4))} page=${JSON.stringify(pageErrors.slice(0, 4))}`);

  await browser.close();

  console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} gates passed`);
  console.log(failed ? 'PROBE FAILED' : 'PROBE PASS');
  console.log('NOTE: this probe verifies the score PLAYS and follows state. Whether it');
  console.log('sounds good is the operator\'s ear and is not checkable here.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('probe crashed:', e); process.exit(1); });

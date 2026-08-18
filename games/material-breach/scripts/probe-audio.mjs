// probe-audio.mjs — proves the audio is CONNECTED, not merely correct.
//
// The battery proves the score's structure and the bus's contract. The offline renderer proves the
// synthesis sounds like something. Neither proves that the shipped dist/index.html actually makes a
// noise when a player clicks it: a UI-to-logic seam stays invisible to unit tests, and "the engine
// is right" is exactly the claim that survives the engine never being called.
//
// So this drives the real artifact in a real browser, taps the audio graph at the destination, does
// a REAL click, and measures the signal that comes out.
//
// Run:  node scripts/probe-audio.mjs
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(process.env.PW_PATH || join(ROOT, 'node_modules'), 'noop.js'));
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Tap the graph: replace the destination with a gain node that also feeds an analyser, so whatever
// the game connects to "the speakers" can be measured instead.
await page.addInitScript(() => {
  const Real = window.AudioContext;
  window.AudioContext = class Tapped extends Real {
    constructor(...args) {
      super(...args);
      const real = super.destination;
      const tap = this.createGain();
      const analyser = this.createAnalyser();
      analyser.fftSize = 2048;
      tap.connect(analyser);
      tap.connect(real);
      this.__tap = tap;
      this.__analyser = analyser;
      window.__TAPPED = this;
    }
    get destination() {
      return this.__tap || super.destination;
    }
  };
});

await page.goto('file://' + join(ROOT, 'dist', 'index.html'));
await page.waitForFunction(() => !!window.__GAME);

const fail = [];
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail.push(label);
};

console.log('\nbefore any gesture:');
let st = await page.evaluate(() => window.__GAME.state().audio);
check('no audio context exists', st.live === false, JSON.stringify(st));
check('no context was constructed at all', (await page.evaluate(() => !window.__TAPPED)) === true);

// A REAL click on the canvas: the orientation packet's own button, i.e. what a player does first.
console.log('\nafter one real click:');
await page.mouse.click(640, 500);
await page.waitForTimeout(400);
st = await page.evaluate(() => window.__GAME.state().audio);
check('the gesture unlocked the bus', st.live === true, JSON.stringify(st));
check('the lobby track is playing', st.scene === 'lobby');

// Measure. Sample the analyser repeatedly over a couple of seconds and take the loudest window:
// the bed is sparse by design, so a single sample could legitimately land in a gap.
async function measure(ms = 2500) {
  return page.evaluate(async (ms) => {
    const a = window.__TAPPED.__analyser;
    const buf = new Float32Array(a.fftSize);
    let peak = 0;
    let bestRms = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      a.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
        sum += buf[i] * buf[i];
      }
      const rms = Math.sqrt(sum / buf.length);
      if (rms > bestRms) bestRms = rms;
      await new Promise((r) => setTimeout(r, 25));
    }
    return { peak, rms: bestRms };
  }, ms);
}

const live = await measure();
check('the game is actually making sound', live.rms > 0.0005, `peak ${live.peak.toFixed(4)} rms ${live.rms.toFixed(5)}`);

// Mute must silence everything, through the one bus.
console.log('\nmute:');
await page.evaluate(() => window.__GAME.mute(true));
await page.waitForTimeout(300);
const muted = await measure(1200);
check('mute(true) silences the bus', muted.rms < 0.00002, `peak ${muted.peak.toFixed(6)} rms ${muted.rms.toFixed(7)}`);
await page.evaluate(() => window.__GAME.mute(false));
await page.waitForTimeout(400);
const unmuted = await measure(1800);
check('mute(false) restores it', unmuted.rms > 0.0005, `rms ${unmuted.rms.toFixed(5)}`);

// The sim must be unaffected by any of it.
console.log('\nthe pacing law is untouched:');
const c0 = await page.evaluate(() => window.__GAME.state().cycle);
await page.waitForTimeout(2500);
const c1 = await page.evaluate(() => window.__GAME.state().cycle);
check('the clock did not advance while the music played', c0 === c1, `cycle ${c0} -> ${c1}`);

// Quit must tear the audio down cleanly.
console.log('\nteardown:');
await page.evaluate(() => window.__GAME.quit());
await page.waitForTimeout(200);
const closed = await page.evaluate(() => window.__TAPPED.state);
check('quit() closes the audio context', closed === 'closed', `state=${closed}`);

await browser.close();
console.log(fail.length ? `\nAUDIO PROBE FAILED: ${fail.join(', ')}` : '\nAUDIO PROBE PASSED — the shipped artifact makes sound on a real gesture, mutes through one bus, and never touches the clock.');
process.exit(fail.length ? 1 : 0);

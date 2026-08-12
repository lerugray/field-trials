// SHOELEATHER — field-fix round 2 browser probe + fresh intro proof frames.
// Runs the shipped single-file build over file:// with the operator-provided Playwright.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_URL = pathToFileURL(join(ROOT, 'dist', 'shoeleather.html')).href;
const OUT = join(ROOT, 'docs', 'proofs', 'fieldfix2-20260811');
const LAUNCH_ARGS = ['--single-process', '--no-zygote', '--disable-gpu', '--disable-software-rasterizer'];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  try { localStorage.setItem('shoeleather:settings', JSON.stringify({ textSpeedCps: 0, reducedMotion: true })); } catch (_) {}
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
  if (!NativeAudioContext) return;
  const records = [];
  const instrument = (ctx) => {
    const record = { ctx, sources: [] };
    records.push(record);
    for (const method of ['createOscillator', 'createBufferSource']) {
      const nativeCreate = ctx[method].bind(ctx);
      ctx[method] = (...args) => {
        const source = nativeCreate(...args);
        const sourceRecord = { started: false, stoppedImmediately: false, ended: false };
        record.sources.push(sourceRecord);
        source.addEventListener('ended', () => { sourceRecord.ended = true; });
        const nativeStart = source.start.bind(source);
        const nativeStop = source.stop.bind(source);
        source.start = (...startArgs) => { sourceRecord.started = true; return nativeStart(...startArgs); };
        source.stop = (when = ctx.currentTime) => {
          if (when <= ctx.currentTime + 0.002) sourceRecord.stoppedImmediately = true;
          return nativeStop(when);
        };
        return source;
      };
    }
    return ctx;
  };
  function ProbedAudioContext(...args) { return instrument(new NativeAudioContext(...args)); }
  ProbedAudioContext.prototype = NativeAudioContext.prototype;
  Object.setPrototypeOf(ProbedAudioContext, NativeAudioContext);
  window.AudioContext = ProbedAudioContext;
  window.webkitAudioContext = ProbedAudioContext;
  window.__slAudioProbe = records;
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const snapshot = () => page.evaluate(() => ({
  button: document.querySelector('.sl-bar button:nth-child(6)')?.textContent,
  state: document.querySelector('#app')?.dataset.musicState,
  instances: Number(document.querySelector('#app')?.dataset.musicInstances || 0),
  contexts: (window.__slAudioProbe || []).map((record) => ({
    state: record.ctx.state,
    started: record.sources.filter((source) => source.started).length,
    activeOrScheduled: record.sources.filter((source) => source.started && !source.stoppedImmediately && !source.ended).length,
  })),
}));

await page.goto(`${BUILD_URL}?case=1&demo=world`, { waitUntil: 'load' });
const music = page.getByRole('button', { name: 'Music: off' });
await music.click();
await page.waitForTimeout(150);
const on1 = await snapshot();
assert(on1.state === 'on' && on1.instances === 1, `first ON ownership mismatch: ${JSON.stringify(on1)}`);
assert(on1.contexts.length === 1 && on1.contexts[0].activeOrScheduled > 0, `first ON scheduled no sources: ${JSON.stringify(on1)}`);

await page.getByRole('button', { name: 'Music: on' }).click();
await page.waitForTimeout(150);
const off = await snapshot();
assert(off.state === 'off' && off.instances === 0, `OFF retained an instance: ${JSON.stringify(off)}`);
assert(off.contexts[0].state === 'closed', `OFF left context open: ${JSON.stringify(off)}`);
assert(off.contexts[0].activeOrScheduled === 0, `OFF left sources active/scheduled: ${JSON.stringify(off)}`);

await page.getByRole('button', { name: 'Music: off' }).click();
await page.waitForTimeout(150);
const on2 = await snapshot();
assert(on2.state === 'on' && on2.instances === 1, `second ON ownership mismatch: ${JSON.stringify(on2)}`);
assert(on2.contexts.length === 2, `second ON did not create one clean context: ${JSON.stringify(on2)}`);
assert(on2.contexts.filter((ctx) => ctx.state !== 'closed').length === 1, `second ON has duplicate live contexts: ${JSON.stringify(on2)}`);
assert(on2.contexts[0].activeOrScheduled === 0 && on2.contexts[1].activeOrScheduled > 0,
  `second ON has wrong source ownership: ${JSON.stringify(on2)}`);
await page.getByRole('button', { name: 'Music: on' }).click();

console.log(`music probe PASS: ${JSON.stringify({ on: on1, off, onAgain: on2 })}`);

await page.evaluate(() => localStorage.removeItem('shoeleather:save:case-1:auto'));
await page.goto(`${BUILD_URL}?case=1`, { waitUntil: 'load' });
await page.locator('.sl-prologue').waitFor();
const introPath = join(OUT, 'case1-intro-card-20260811.png');
await page.screenshot({ path: introPath, fullPage: false });
console.log(`captured ${introPath}`);

for (let guard = 0; guard < 12; guard++) {
  if (await page.locator('.sl-prologue').getAttribute('data-beat') === 'murder') break;
  await page.locator('.sl-p-action').click();
}
assert(await page.locator('.sl-prologue').getAttribute('data-beat') === 'murder', 'Case 1 murder beat was not reachable');
assert(await page.locator('.sl-p-kicker').textContent() === 'THE MURDER', 'murder beat did not receive explicit staging');
const killPath = join(OUT, 'case1-murder-beat-20260811.png');
await page.screenshot({ path: killPath, fullPage: false });
console.log(`captured ${killPath}`);

await context.close();
await browser.close();
if (errors.length) throw new Error(`browser emitted ${errors.length} error(s):\n${errors.join('\n')}`);
console.log('fieldfix2 browser verification clean: music on/off/on, 2 frames, 0 page/console errors');

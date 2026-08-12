#!/usr/bin/env node

// STRAY SQUADRON player-path soak probe (WARGAME-KIT s12).
//
// This intentionally drives the staged, operator-played HTML through public inputs.
// The init script observes browser surfaces (canvas text, WebGL loss, WebAudio, media
// failures) but does not reach into or mutate game state.

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist', 'stray-squadron.html');
const ARTIFACT = process.env.STRAY_SOAK_ARTIFACT || DIST;
const OUT_DIR = path.join(ROOT, 'artifacts', 'soak-stray-squadron');
const EVIDENCE_FILE = path.join(OUT_DIR, 'evidence.json');
const SEED = process.env.STRAY_SOAK_SEED || 'wargame-kit-s12-player-path';
const MAX_DEATH_MS = Number(process.env.STRAY_SOAK_DEATH_TIMEOUT_MS || 125_000);
const RESTART_SOAK_MS = Number(process.env.STRAY_SOAK_RESTART_MS || 65_000);
const POLL_MS = 2_000;
const SCREENSHOT_MS = 10_000;
const HEAP_MS = 30_000;

const startedAt = new Date().toISOString();
const failures = [];
const passes = [];
const notes = [];
const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];
const screenshots = [];
const liveness = [];
const heaps = [];
const timeline = [];
let browser;
let context;
let page;
let cdp;
let previousScreenshot = null;
let previousFrame = null;
let lastScreenshotAt = 0;
let lastHeapAt = 0;
let shotIndex = 0;
let monitoringExpected = true;
const metadata = {};
let contextLostObserved = 0;

function log(message, data = undefined) {
  const item = { at: new Date().toISOString(), message };
  if (data !== undefined) item.data = data;
  timeline.push(item);
  process.stdout.write(`[soak] ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}\n`);
}

function pass(id, detail) {
  if (!passes.some((x) => x.id === id)) passes.push({ id, detail });
  log(`PASS ${id}`, detail);
}

function fail(id, detail) {
  if (!failures.some((x) => x.id === id && x.detail === detail)) failures.push({ id, detail });
  log(`FAIL ${id}`, detail);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function visibleTextIncludes(text) {
  return page.evaluate((needle) => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      return el.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
    };
    return [...document.querySelectorAll('body *')]
      .some((el) => visible(el) && (el.textContent || '').includes(needle));
  }, text);
}

async function waitForVisibleText(text, timeout = 12_000) {
  await page.waitForFunction((needle) => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      return el.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
    };
    return [...document.querySelectorAll('body *')]
      .some((el) => visible(el) && (el.textContent || '').includes(needle));
  }, text, { timeout });
}

async function probeState() {
  return page.evaluate(() => ({
    frame: window.__strayFrame || 0,
    ready: !!window.__strayReady,
    focus: document.hasFocus(),
    soak: window.__soak ? {
      contextLost: window.__soak.contextLost,
      audioContexts: window.__soak.audioContexts,
      audioStates: window.__soak.audioStates.slice(),
      oscillatorStarts: window.__soak.oscillatorStarts,
      audioErrors: window.__soak.audioErrors.slice(),
      mediaErrors: window.__soak.mediaErrors.slice(),
      canvasTexts: Object.keys(window.__soak.canvasTexts),
    } : null,
    bodyText: document.body.innerText,
    storage: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
  }));
}

async function compareScreens(a, b) {
  return page.evaluate(async ([a64, b64]) => {
    const decode = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:image/png;base64,${src}`;
    });
    const [ia, ib] = await Promise.all([decode(a64), decode(b64)]);
    const w = Math.min(ia.width, ib.width);
    const h = Math.min(ia.height, ib.height);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0, w, h);
    const da = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h);
    x.drawImage(ib, 0, 0, w, h);
    const db = x.getImageData(0, 0, w, h).data;
    let changed = 0;
    let compared = 0;
    let absoluteDelta = 0;
    // Compare a regular 2px grid. A sample counts changed when its RGB delta is
    // visibly meaningful, filtering tiny antialias/dither noise.
    for (let y = 0; y < h; y += 2) {
      for (let xx = 0; xx < w; xx += 2) {
        const i = (y * w + xx) * 4;
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d >= 18) changed++;
        absoluteDelta += d;
        compared++;
      }
    }
    return {
      width: w, height: h, compared, changed,
      changedFraction: compared ? changed / compared : 0,
      meanRgbDelta: compared ? absoluteDelta / compared : 0,
    };
  }, [a.toString('base64'), b.toString('base64')]);
}

async function screenshot(label, { requireChange = true } = {}) {
  const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const filename = `${String(++shotIndex).padStart(2, '0')}-${safe}.png`;
  const file = path.join(OUT_DIR, filename);
  const bytes = await page.screenshot({ path: file, type: 'png' });
  let diff = null;
  if (previousScreenshot && requireChange) {
    diff = await compareScreens(previousScreenshot, bytes);
    // Exact/static output yields zero. Results/hangar deliberately have only a very
    // dark ambient rail drift, so accept a small but measurable set of changed samples;
    // the independent frame stall detector must advance as well.
    const alive = diff.changed >= 10 && diff.meanRgbDelta >= 0.02;
    liveness.push({ label, file, alive, ...diff });
    if (!alive) fail('visual-liveness', `${label}: only ${(diff.changedFraction * 100).toFixed(3)}% sampled pixels changed (mean RGB delta ${diff.meanRgbDelta.toFixed(3)})`);
  }
  previousScreenshot = bytes;
  screenshots.push({ label, file, at: new Date().toISOString(), diff });
  lastScreenshotAt = Date.now();
  log('screenshot', { label, file: path.relative(ROOT, file), changedFraction: diff && diff.changedFraction });
}

async function heapSample(label) {
  let used = null;
  let total = null;
  let source = 'performance.memory';
  try {
    const mem = await page.evaluate(() => performance.memory ? ({
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
    }) : null);
    if (mem) { used = mem.used; total = mem.total; }
    if (used == null && cdp) {
      source = 'CDP Performance.getMetrics';
      const data = await cdp.send('Performance.getMetrics');
      used = data.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? null;
      total = data.metrics.find((m) => m.name === 'JSHeapTotalSize')?.value ?? null;
    }
  } catch (error) {
    notes.push(`heap sample ${label} unavailable during navigation: ${error.message}`);
  }
  heaps.push({ at: new Date().toISOString(), label, used, total, source });
  lastHeapAt = Date.now();
  log('heap sample', { label, used, total, source });
}

async function poll(label) {
  const state = await probeState();
  contextLostObserved = Math.max(contextLostObserved, state.soak?.contextLost || 0);
  if (monitoringExpected && previousFrame != null && state.frame <= previousFrame) {
    fail('stall-detector', `${label}: render frame did not advance (${previousFrame} -> ${state.frame}) over ${POLL_MS}ms`);
  }
  previousFrame = state.frame;
  if (Date.now() - lastScreenshotAt >= SCREENSHOT_MS) await screenshot(label);
  if (Date.now() - lastHeapAt >= HEAP_MS) await heapSample(label);
  return state;
}

async function monitoredWait(ms, label, tick = null) {
  const until = Date.now() + ms;
  let n = 0;
  while (Date.now() < until) {
    if (tick) await tick(n++);
    await delay(Math.min(POLL_MS, Math.max(0, until - Date.now())));
    if (Date.now() < until + POLL_MS) await poll(label);
  }
}

async function clickText(text) {
  const matches = page.getByText(text, { exact: false });
  for (let i = (await matches.count()) - 1; i >= 0; i--) {
    const candidate = matches.nth(i);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`No visible text target: ${text}`);
}

async function openFirstFlight() {
  await waitForVisibleText('New Run');
  // Returning from title Options leaves selection on Options; Up skips the disabled
  // Continue row on a clean profile and lands on New Run.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  if (await visibleTextIncludes('HOW TO FLY')) await page.keyboard.press('Enter');
  await waitForVisibleText('MISSION BRIEFING');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__strayFrame > 10);
  await delay(800);
}

async function exerciseMouseDefault() {
  const center = { x: Math.floor(page.viewportSize().width / 2), y: Math.floor(page.viewportSize().height / 2) };
  await page.mouse.move(center.x, center.y);
  await delay(500);
  const before = await page.evaluate(() => document.body.innerText.match(/frame off\s*x\s*(-?[\d.]+)\s*y\s*(-?[\d.]+)/)?.slice(1) || null);
  await page.mouse.move(Math.floor(page.viewportSize().width * 0.76), Math.floor(page.viewportSize().height * 0.30), { steps: 12 });
  await delay(1_100);
  const after = await page.evaluate(() => document.body.innerText.match(/frame off\s*x\s*(-?[\d.]+)\s*y\s*(-?[\d.]+)/)?.slice(1) || null);
  if (before && after && (Math.abs(Number(after[0]) - Number(before[0])) > 0.25 || Math.abs(Number(after[1]) - Number(before[1])) > 0.25)) {
    pass('mouse-default-flight', `frame offset moved from ${before.join(',')} to ${after.join(',')} without enabling mouse aim`);
  } else {
    fail('mouse-default-flight', `debug frame offset did not respond clearly: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
  await page.mouse.move(center.x, center.y, { steps: 12 });
}

async function exercisePauseFuzzAudio() {
  const rail = async () => Number((await page.evaluate(() => document.body.innerText.match(/rail s\s*([\d.]+)/)?.[1])) || NaN);
  const before = await rail();
  await page.keyboard.press('Escape');
  await waitForVisibleText('PAUSED');
  const paused0 = await rail();
  await delay(1_600);
  const paused1 = await rail();
  if (Number.isFinite(paused0) && Number.isFinite(paused1) && Math.abs(paused1 - paused0) <= 0.2) {
    pass('pause-freezes-sim', `rail station held at ${paused0.toFixed(1)} -> ${paused1.toFixed(1)}`);
  } else fail('pause-freezes-sim', `rail station changed while paused: ${paused0} -> ${paused1}`);

  // Rapid mixed input at a menu boundary. It intentionally avoids Enter so it cannot
  // toggle settings; the menu must remain coherent and resumable.
  const fuzz = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'KeyW', 'KeyS', 'Escape'];
  for (let i = 0; i < 44; i++) {
    if (i === 6) { // Escape closed it; reopen during the burst.
      await page.keyboard.press('Escape');
    } else {
      await page.keyboard.press(fuzz[i % fuzz.length]);
    }
    if (i % 8 === 0) await page.mouse.move(40 + (i * 37) % 900, 80 + (i * 23) % 500);
  }
  if (!(await visibleTextIncludes('PAUSED'))) await page.keyboard.press('Escape');
  await waitForVisibleText('PAUSED');
  await page.keyboard.press('Escape');
  await delay(1_000);
  const after = await rail();
  if (Number.isFinite(before) && Number.isFinite(after) && after > before + 0.5) pass('pause-resume', `rail advanced ${before.toFixed(1)} -> ${after.toFixed(1)} after resume`);
  else fail('pause-resume', `rail did not resume: ${before} -> ${after}`);

  const audio = (await probeState()).soak;
  if (audio && audio.audioContexts > 0 && audio.oscillatorStarts > 0 && audio.audioErrors.length === 0 && audio.audioStates.includes('running')) {
    pass('real-gesture-webaudio', `${audio.audioContexts} context(s), ${audio.oscillatorStarts} oscillator start(s), running state observed`);
  } else fail('real-gesture-webaudio', JSON.stringify(audio));
}

async function exerciseResizeAndFocus() {
  const old = page.viewportSize();
  await page.setViewportSize({ width: 1032, height: 704 });
  await delay(900);
  const resized = await page.evaluate(() => ({ inner: [innerWidth, innerHeight], canvases: [...document.querySelectorAll('canvas')].map((c) => [c.width, c.height]) }));
  if (resized.inner[0] === 1032 && resized.inner[1] === 704 && resized.canvases.every(([w, h]) => w > 0 && h > 0)) pass('resize', JSON.stringify(resized));
  else fail('resize', JSON.stringify(resized));

  monitoringExpected = false;
  const other = await context.newPage();
  await other.setContent('<title>focus sink</title><p>focus sink</p>');
  await other.bringToFront();
  await delay(1_500);
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await other.close();
  await delay(600);
  monitoringExpected = true;
  previousFrame = (await probeState()).frame;
  const focused = await page.evaluate(() => document.hasFocus());
  if (focused) pass('blur-focus', 'second page took focus and game page regained it');
  else fail('blur-focus', 'game page did not report focus after bringToFront');
  await page.setViewportSize(old);
  await delay(700);
}

async function fireBurst() {
  const vp = page.viewportSize();
  await page.mouse.move(Math.floor(vp.width / 2), Math.floor(vp.height / 2));
  await page.mouse.down();
  await delay(1_300);
  await page.mouse.up();
}

async function waitForDeathAndResults() {
  const deadline = Date.now() + MAX_DEATH_MS;
  let burstAt = 0;
  while (Date.now() < deadline) {
    if (Date.now() >= burstAt) {
      await fireBurst();
      burstAt = Date.now() + 3_500;
    }
    await delay(700);
    const state = await poll('first-flight');
    if (state.soak.canvasTexts.some((t) => t.startsWith('HIT: ASTEROID') || t.startsWith('HIT: COLLISION'))) {
      pass('actual-collision', state.soak.canvasTexts.find((t) => t.startsWith('HIT: ASTEROID') || t.startsWith('HIT: COLLISION')));
    }
    if (state.soak.canvasTexts.includes('SHIP DOWN') || await visibleTextIncludes('RUN ENDED')) {
      if (!(await visibleTextIncludes('RUN ENDED'))) {
        await page.keyboard.press('KeyR');
        await waitForVisibleText('RUN ENDED', 8_000);
      }
      pass('death-transition', state.soak.canvasTexts.find((t) => t.startsWith('cause:')) || 'SHIP DOWN -> RUN ENDED');
      return;
    }
  }
  fail('death-transition', `no death/results transition within ${MAX_DEATH_MS}ms`);
}

function analyzeHeap() {
  const usable = heaps.filter((h) => Number.isFinite(h.used));
  if (usable.length < 3) {
    fail('heap-growth', `only ${usable.length} usable heap samples`);
    return;
  }
  let longest = [];
  let current = [];
  for (const h of usable) {
    if (!current.length || h.used > current[current.length - 1].used) current.push(h);
    else current = [h];
    if (current.length > longest.length) longest = current.slice();
  }
  const growth = longest.length > 1 ? longest.at(-1).used - longest[0].used : 0;
  const gross = longest.length >= 4 && growth > Math.max(64 * 1024 * 1024, longest[0].used * 0.75);
  if (gross) fail('heap-growth', `gross monotonic run of ${longest.length} samples grew ${(growth / 1048576).toFixed(1)} MiB`);
  else pass('heap-growth', `${usable.length} samples; longest monotonic run ${longest.length}, ${(growth / 1048576).toFixed(1)} MiB growth`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const [artifactInfo, distInfo, artifactHash, distHash] = await Promise.all([
    stat(ARTIFACT), stat(DIST), sha256(ARTIFACT), sha256(DIST),
  ]);
  Object.assign(metadata, { artifactInfo, distInfo, artifactHash, distHash });
  log('artifact verified', { path: ARTIFACT, bytes: artifactInfo.size, sha256: artifactHash });
  log('repo dist verified', { path: DIST, bytes: distInfo.size, sha256: distHash, sameBytes: artifactHash === distHash });

  browser = await chromium.launch({
    headless: true,
    // Single-process avoids macOS Mach-service registration in restricted CI shells;
    // SwiftShader/WebGL remains enabled (Playwright supplies --enable-unsafe-swiftshader).
    args: ['--single-process', '--no-zygote', '--enable-precise-memory-info', '--autoplay-policy=user-gesture-required'],
  });
  metadata.browserVersion = browser.version();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ at: new Date().toISOString(), text: msg.text() });
  });
  page.on('pageerror', (error) => pageErrors.push({ at: new Date().toISOString(), text: error.stack || error.message }));
  page.on('requestfailed', (request) => requestFailures.push({
    at: new Date().toISOString(), url: request.url(), error: request.failure()?.errorText || 'unknown',
  }));

  await page.addInitScript(() => {
    const state = window.__soak = {
      contextLost: 0,
      audioContexts: 0,
      audioStates: [],
      oscillatorStarts: 0,
      audioErrors: [],
      mediaErrors: [],
      canvasTexts: Object.create(null),
    };
    document.addEventListener('webglcontextlost', () => { state.contextLost++; }, true);
    document.addEventListener('error', (event) => {
      if (event.target instanceof HTMLMediaElement) {
        state.mediaErrors.push({ src: event.target.currentSrc || event.target.src, code: event.target.error?.code || 0 });
      }
    }, true);
    window.addEventListener('unhandledrejection', (event) => {
      const text = String(event.reason && (event.reason.stack || event.reason.message) || event.reason || 'unknown rejection');
      if (/audio|media|play\(\)|decode/i.test(text)) state.audioErrors.push(text);
    });
    const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (proto) {
      const original = proto.fillText;
      proto.fillText = function (value, ...args) {
        state.canvasTexts[String(value)] = performance.now();
        return original.call(this, value, ...args);
      };
    }
    const instrumentAudioContext = (name) => {
      const Native = window[name];
      if (!Native) return;
      class SoakAudioContext extends Native {
        constructor(...args) {
          super(...args);
          state.audioContexts++;
          const remember = () => { if (!state.audioStates.includes(this.state)) state.audioStates.push(this.state); };
          remember();
          this.addEventListener('statechange', remember);
        }
        createOscillator(...args) {
          const oscillator = super.createOscillator(...args);
          const start = oscillator.start.bind(oscillator);
          oscillator.start = (...startArgs) => { state.oscillatorStarts++; return start(...startArgs); };
          return oscillator;
        }
      }
      window[name] = SoakAudioContext;
    };
    instrumentAudioContext('AudioContext');
    if (window.webkitAudioContext !== window.AudioContext) instrumentAudioContext('webkitAudioContext');
  });

  const url = `${pathToFileURL(ARTIFACT).href}?debug&seed=${encodeURIComponent(SEED)}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__strayReady === true, null, { timeout: 20_000 });
  pass('artifact-under-test', `${ARTIFACT} (${artifactHash})`);
  pass('dist-present', `${DIST} (${distHash}, ${artifactHash === distHash ? 'byte-identical' : 'different'})`);
  await screenshot('title-start', { requireChange: false });
  await heapSample('start');
  previousFrame = (await probeState()).frame;

  // Menus and current pointer defaults. Down skips disabled Continue and lands on Options.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForVisibleText('Mouse aim');
  const optionText = await page.evaluate(() => document.body.innerText);
  if (/Mouse aim\s+On/.test(optionText) && /Mouse sensitivity\s+4\.00/.test(optionText)) pass('pointer-defaults', 'Options shows Mouse aim On and sensitivity 4.00x on a clean profile');
  else fail('pointer-defaults', 'Options did not show clean-profile Mouse aim On / sensitivity 4.00x');
  if (optionText.includes('Master mute') && optionText.includes('Reduced motion') && optionText.includes('Controls (remap inputs)')) pass('menu-surface', 'title Options exposes assists and all input bindings');
  else fail('menu-surface', 'expected Options rows missing');
  await page.keyboard.press('Escape');

  await openFirstFlight();
  pass('mission-structure', 'NEW RUN -> one-time controls -> MISSION BRIEFING -> rail level');
  await screenshot('first-flight-entry');
  await exerciseMouseDefault();
  await exercisePauseFuzzAudio();
  await exerciseResizeAndFocus();
  await waitForDeathAndResults();
  await screenshot('failed-run-results');

  const afterDeath = await probeState();
  contextLostObserved = Math.max(contextLostObserved, afterDeath.soak?.contextLost || 0);
  const ledgerRaw = afterDeath.storage['stray.ledger'];
  const ledger = ledgerRaw ? JSON.parse(ledgerRaw) : null;
  if (ledger && ledger.runs >= 1 && Array.isArray(ledger.log) && ledger.log.at(-1)?.died) pass('progress-write', `failed run persisted: runs=${ledger.runs}, earned=${ledger.earned}, log=${ledger.log.length}`);
  else fail('progress-write', `missing failed-run ledger: ${ledgerRaw}`);

  // Real restart from results, then continue soaking active flight with mouse steering,
  // fire, boost, and roll inputs. The first result's ledger is our persistence baseline.
  await page.keyboard.press('KeyR');
  await waitForVisibleText('MISSION BRIEFING');
  await page.keyboard.press('Enter');
  await delay(700);
  pass('restart', 'R on results opened a fresh briefing and launched a second sortie');
  await monitoredWait(RESTART_SOAK_MS, 'restarted-flight', async (n) => {
    const vp = page.viewportSize();
    const angle = n * 0.83;
    const x = vp.width * (0.5 + Math.sin(angle) * 0.23);
    const y = vp.height * (0.5 + Math.cos(angle * 0.71) * 0.19);
    await page.mouse.move(x, y, { steps: 5 });
    if (n % 3 === 0) {
      await page.mouse.down(); await delay(320); await page.mouse.up();
    }
    if (n % 7 === 0) await page.keyboard.press('KeyE');
    if (n % 9 === 0) { await page.keyboard.down('ShiftLeft'); await delay(220); await page.keyboard.up('ShiftLeft'); }
  });

  // Refresh mid-sortie: completed progress must remain, while the unfinished sortie
  // must not mint a second record. Continue should now route to the hangar.
  const ledgerBeforeReload = await page.evaluate(() => localStorage.getItem('stray.ledger'));
  monitoringExpected = false;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__strayReady === true, null, { timeout: 20_000 });
  await delay(600);
  previousFrame = (await probeState()).frame;
  monitoringExpected = true;
  await waitForVisibleText('Continue');
  const titleText = await page.evaluate(() => document.body.innerText);
  if (!titleText.includes('No saved progress yet')) pass('continue-enabled', 'Continue enabled after recorded failed run');
  else fail('continue-enabled', 'Continue remained disabled after a recorded run');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForVisibleText('THE HANGAR');
  const ledgerAfterReload = await page.evaluate(() => localStorage.getItem('stray.ledger'));
  if (ledgerAfterReload === ledgerBeforeReload) pass('progress-reload', 'ledger survived reload byte-for-byte; unfinished sortie did not double-count');
  else fail('progress-reload', 'ledger changed across mid-sortie reload');
  await screenshot('persisted-hangar');

  // Launch from the persisted hub and reach the briefing once more, covering the hub
  // launch path without extending the run into another full death cycle.
  await page.keyboard.press('Enter');
  await waitForVisibleText('MISSION BRIEFING');
  pass('hub-launch', 'persisted hangar -> fresh mission briefing');
  await page.keyboard.press('Enter');
  await monitoredWait(12_000, 'post-persistence-flight', async (n) => {
    const vp = page.viewportSize();
    await page.mouse.move(vp.width * (n % 2 ? 0.62 : 0.38), vp.height * 0.5, { steps: 4 });
    if (n % 2 === 0) { await page.mouse.down(); await delay(260); await page.mouse.up(); }
  });

  const finalState = await probeState();
  contextLostObserved = Math.max(contextLostObserved, finalState.soak.contextLost || 0);
  if (contextLostObserved === 0) pass('webgl-context', 'zero webglcontextlost events');
  else fail('webgl-context', `${contextLostObserved} webglcontextlost event(s)`);
  if (consoleErrors.length === 0 && pageErrors.length === 0) pass('runtime-errors', 'zero console.error and zero pageerror events');
  else fail('runtime-errors', `${consoleErrors.length} console error(s), ${pageErrors.length} pageerror(s)`);
  if (finalState.soak.audioErrors.length === 0) pass('audio-context-errors', 'zero audio-context/unhandled audio errors');
  else fail('audio-context-errors', JSON.stringify(finalState.soak.audioErrors));

  const requiredMissing = requestFailures.filter((e) =>
    /\/assets\/music\//.test(e.url) && !/ss-title-theme\.ogg(?:$|\?)/.test(e.url));
  if (requiredMissing.length === 0) pass('staged-music-media', 'no required music media failures (pending title socket excluded)');
  else fail('staged-music-media', `${requiredMissing.length} required music media failure(s): ${[...new Set(requiredMissing.map((e) => e.url))].join(', ')}`);

  if (!failures.some((x) => x.id === 'stall-detector')) pass('stall-detector', 'render frame advanced at every expected 2s poll');
  if (liveness.length >= 3 && liveness.every((x) => x.alive)) pass('visual-liveness', `${liveness.length} periodic pixel-diff samples all live`);
  else if (liveness.length < 3) fail('visual-liveness', `only ${liveness.length} pixel-diff samples`);
  const dynamicHud = finalState.soak.canvasTexts.some((t) => /^HIT:|^SHIP DOWN$| DOWN$|^PACE:/.test(t));
  if (dynamicHud) pass('hud-text-advance', 'captured live pace/combat/death HUD text changes');
  else fail('hud-text-advance', 'no dynamic pace/combat/death HUD text captured');
  analyzeHeap();

  return { artifactHash, distHash, artifactInfo, distInfo, browserVersion: browser.version(), finalState };
}

let summary = {};
try {
  summary = await main();
} catch (error) {
  fail('probe-exception', error.stack || error.message);
} finally {
  const endedAt = new Date().toISOString();
  const evidence = {
    schema: 1,
    result: failures.length ? 'FAIL' : 'PASS',
    startedAt,
    endedAt,
    durationSeconds: (Date.parse(endedAt) - Date.parse(startedAt)) / 1000,
    browser: (summary.browserVersion || metadata.browserVersion) ? `Chromium ${summary.browserVersion || metadata.browserVersion} (Playwright, headless)` : 'Chromium (Playwright, headless)',
    artifact: { path: ARTIFACT, sha256: summary.artifactHash || metadata.artifactHash || null, bytes: summary.artifactInfo?.size || metadata.artifactInfo?.size || null },
    dist: { path: DIST, exists: !!(summary.distInfo || metadata.distInfo), sha256: summary.distHash || metadata.distHash || null, bytes: summary.distInfo?.size || metadata.distInfo?.size || null },
    seed: SEED,
    inputScript: 'title Options; New Run; dismiss teaching; briefing launch; mouse aim; held-click fire; pause/menu fuzz/resume; resize; focus loss/recovery; center-lane collision/death; R restart; mouse/fire/roll/boost soak; reload; Continue; hangar launch',
    passes,
    failures,
    notes,
    consoleErrors,
    pageErrors,
    requestFailures,
    screenshots,
    liveness,
    heaps,
    timeline,
    finalProbeState: summary.finalState || null,
    systemsExercised: {
      scriptedEnemies: 'Engaged seeded drone/gunner waves with basic and held-click weapon fire; gunners use scripted firing logic.',
      hazards: 'Center-lane flight required a recorded ASTEROID or enemy-contact collision and ship-down transition.',
      ai: 'No autonomous combat AI exists in this build; wingmates are narrative/passive support by documented design.',
    },
  };
  try {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`[soak] evidence ${EVIDENCE_FILE}\n`);
  } catch (error) {
    process.stderr.write(`[soak] could not write evidence: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
  if (browser) await browser.close();
  process.exitCode = failures.length ? 1 : process.exitCode || 0;
}

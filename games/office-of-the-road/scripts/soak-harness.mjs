// Browserless fresh-boot harness for environments without Chrome. It boots the
// real main module against a minimal DOM/canvas shell, advances the real rAF and
// interval queues, and handles location.reload by destroying the window and
// importing a fresh main.js instance that rereads shared local/session storage.
// Player input still traverses the game's actual KeyboardEvent listeners.

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = pathToFileURL(resolve(ROOT, 'src/main.js')).href;

class Store {
  constructor(map) { this.map = map; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatchEvent(event) {
    event.target = this;
    for (const fn of this.listeners.get(event.type) || []) fn(event);
    return !event.defaultPrevented;
  }
}

class HarnessEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); this.defaultPrevented = false; }
  preventDefault() { this.defaultPrevented = true; }
}

function context2d() {
  const target = {
    measureText(text) { return { width: String(text).length * 4 }; },
    getImageData() { return { data: new Uint8ClampedArray(320 * 200 * 4) }; },
  };
  return new Proxy(target, {
    get(obj, key) { if (key in obj) return obj[key]; return () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}

function makeEnvironment(href, shared, breakVerb) {
  const win = new Target();
  win.innerWidth = 1280; win.innerHeight = 800;
  win.localStorage = new Store(shared.local);
  win.sessionStorage = new Store(shared.session);
  win.KeyboardEvent = class extends HarnessEvent { constructor(type, init) { super(type, init); } };
  win.MouseEvent = class extends HarnessEvent { constructor(type, init) { super(type, init); } };
  win.performance = { now: () => env.now };
  win.setInterval = (fn, ms) => { const id = ++env.timerId; env.intervals.set(id, { fn, ms, next: env.now + ms }); return id; };
  win.clearInterval = (id) => env.intervals.delete(id);
  win.requestAnimationFrame = (fn) => { env.rafs.push(fn); return env.rafs.length; };
  win.clearTimeout = () => {};
  win.setTimeout = (fn) => { fn(); return 0; };

  const locUrl = new URL(href);
  const location = {
    get href() { return locUrl.href; },
    get search() { return locUrl.search; },
    reload() { win.dispatchEvent(new HarnessEvent('beforeunload')); env.reloadRequested = true; },
  };
  win.location = location;
  win.history = { replaceState(_state, _title, next) { const u = new URL(next); locUrl.href = u.href; } };

  const ctx = context2d();
  const canvas = new Target();
  canvas.style = {}; canvas.dataset = {};
  canvas.getContext = () => ctx;
  const banner = { style: {}, textContent: '' };
  const document = {
    title: 'THE OFFICE OF THE ROAD',
    getElementById(id) { return id === 'stage' ? canvas : id === 'boot-error' ? banner : null; },
    createElement() { return { style: {}, click() {}, remove() {} }; },
    body: { appendChild() {} },
  };
  win.document = document;

  const originalDispatch = win.dispatchEvent.bind(win);
  win.dispatchEvent = (event) => {
    if (breakVerb === 'shopTxn' && event.type === 'keydown' && event.key === 'Enter' && win.__office && win.__office.ui.screen === 'shop') return true;
    return originalDispatch(event);
  };

  const env = { win, document, location, now: 0, timerId: 0, intervals: new Map(), rafs: [], reloadRequested: false };
  return env;
}

async function boot(href, shared, breakVerb, serial) {
  const env = makeEnvironment(href, shared, breakVerb);
  globalThis.window = env.win;
  globalThis.document = env.document;
  globalThis.location = env.location;
  globalThis.KeyboardEvent = env.win.KeyboardEvent;
  globalThis.Image = class { constructor() { this.complete = true; this.naturalWidth = 0; this.src = ''; } };
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: env.win.performance });
  await import(`${MAIN}?harnessBoot=${serial}`);
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  let seed = 1, budget = 360000, breakVerb = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed') seed = args[++i];
    else if (args[i] === '--budget') budget = Number(args[++i]) || budget;
    else if (args[i] === '--break-verb') breakVerb = args[++i];
  }
  const shared = { local: new Map(), session: new Map() };
  let href = `file://${resolve(ROOT, 'dist/office-of-the-road.html')}?soak=1&fresh=1&seed=${seed}`;
  let serial = 0;
  let env = await boot(href, shared, breakVerb, serial++);
  let elapsed = 0;

  while (elapsed <= budget) {
    if (env.reloadRequested) {
      href = env.location.href;
      env = await boot(href, shared, breakVerb, serial++);
      continue;
    }
    const dt = 16;
    env.now += dt; elapsed += dt;
    const rafs = env.rafs.splice(0);
    for (const fn of rafs) fn(env.now);
    for (const timer of [...env.intervals.values()]) {
      while (timer.next <= env.now) { timer.next += timer.ms; timer.fn(); if (env.reloadRequested) break; }
      if (env.reloadRequested) break;
    }
    if (/^SOAK (PASS|FAIL)/.test(env.document.title)) break;
  }

  const title = env.document.title;
  console.log('[soak:harness] ' + title);
  if (env.win.__soak) {
    console.log('[soak:harness] verbs ' + JSON.stringify(env.win.__soak.verbs));
    for (const finding of env.win.__soak.findings || []) console.log(`[soak:harness] [${finding.sev}] ${finding.text}`);
  }
  const pass = /SOAK PASS/.test(title) && /blockers=0/.test(title) && /reloads=[1-9]\d*/.test(title);
  console.log(pass ? '[soak:harness] ACCEPTANCE: PASS (fresh boot + no blockers)' : '[soak:harness] ACCEPTANCE: FAIL');
  process.exitCode = pass ? 0 : 1;
}

main();

// soak-diag.mjs — instrumented M9 soak for shopTxn / early-wipe diagnosis.
// Logs gold, stock, prices, and driver attempts at first town; logs leg-1 combat
// attrition for early-wipe seeds. Soak tooling only — not game code.

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TUNING } from '../src/tuning.js';
import { generateShop } from '../src/shop.js';
import { getItem } from '../src/items.js';

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

function makeEnvironment(href, shared) {
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

  const env = { win, document, location, now: 0, timerId: 0, intervals: new Map(), rafs: [], reloadRequested: false };
  return env;
}

async function boot(href, shared, serial) {
  const env = makeEnvironment(href, shared);
  globalThis.window = env.win;
  globalThis.document = env.document;
  globalThis.location = env.location;
  globalThis.KeyboardEvent = env.win.KeyboardEvent;
  globalThis.Image = class { constructor() { this.complete = true; this.naturalWidth = 0; this.src = ''; } };
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: env.win.performance });
  await import(`${MAIN}?harnessBoot=${serial}`);
  return env;
}

function partySnapshot(o) {
  return {
    gold: o.party.gold | 0,
    supplies: o.party.supplies | 0,
    hp: o.party.frames.map((f) => ({ id: f.id, hp: f.hp, max: f.max.hp, alive: f.alive, job: f.jobId })),
    inventory: (o.party.inventory || []).slice(),
  };
}

function shopLines(o) {
  const shop = o.ui.shop;
  if (!shop) return [];
  return shop.lines.map((ln, i) => ({
    idx: i,
    id: ln.id,
    price: ln.price,
    sold: ln.sold,
    affordable: (o.party.gold | 0) >= ln.price,
  }));
}

function cheapestPurchasable(gold, lines) {
  const open = lines.filter((l) => !l.sold && gold >= l.price);
  if (open.length) return { kind: 'buy', price: open[0].price, id: open[0].id };
  if (gold >= TUNING.resupplyCost) return { kind: 'resupply', price: TUNING.resupplyCost, id: 'resupply' };
  const unsold = lines.filter((l) => !l.sold).sort((a, b) => a.price - b.price);
  return { kind: 'none', price: unsold[0] ? unsold[0].price : Infinity, id: unsold[0] ? unsold[0].id : null };
}

function createDiag(seed) {
  return {
    seed,
    lastScreen: null,
    lastTriedLen: 0,
    lastFocus: null,
    shopDiag: null,
    leg1CombatLog: [],
    earlyWipe: null,
    poll(env) {
      const o = env.win.__office;
      const S = env.win.__soak;
      if (!o) return;
      const scr = o.ui.screen;

      if (scr === 'camp' && o.ui.camp && o.ui.camp.isTown && !this.shopDiag) {
        const leg = o.ui.camp.leg;
        const stock = generateShop(seed, leg);
        const lines = stock.lines.map((l) => ({ id: l.id, price: l.price, sold: false }));
        const gold = o.party.gold | 0;
        this.shopDiag = {
          leg,
          goldAtTown: gold,
          supplies: o.party.supplies | 0,
          stock: lines,
          cheapestLine: lines.length ? Math.min(...lines.map((l) => l.price)) : null,
          resupplyCost: TUNING.resupplyCost,
          purchasableAtArrival: cheapestPurchasable(gold, lines),
          attempts: [],
          reachedShop: false,
        };
      }

      if (scr === 'shop' && !this.shopDiag && o.ui.shop) {
        const leg = o.ui.camp ? o.ui.camp.leg : null;
        const lines = shopLines(o);
        const gold = o.party.gold | 0;
        this.shopDiag = {
          leg,
          goldAtTown: gold,
          supplies: o.party.supplies | 0,
          stock: lines.map((l) => ({ id: l.id, price: l.price, sold: l.sold })),
          cheapestLine: lines.length ? Math.min(...lines.filter((l) => !l.sold).map((l) => l.price)) : null,
          resupplyCost: TUNING.resupplyCost,
          purchasableAtArrival: cheapestPurchasable(gold, lines),
          attempts: [],
          reachedShop: true,
        };
      }
      if (scr === 'shop' && this.shopDiag) {
        this.shopDiag.reachedShop = true;
        const tried = (S && S.shopTried) || [];
        if (tried.length > this.lastTriedLen) {
          const target = tried[tried.length - 1];
          const m = /^buy(\d+)$/.exec(target);
          const line = m ? shopLines(o)[Number(m[1])] : null;
          this.shopDiag.attempts.push({
            target,
            goldBefore: o.party.gold | 0,
            price: line ? line.price : (target === 'resupply' ? TUNING.resupplyCost : null),
            affordable: line ? line.affordable : (target === 'resupply' ? (o.party.gold | 0) >= TUNING.resupplyCost : null),
          });
          this.lastTriedLen = tried.length;
        }
      }

      if (o.march.leg === 0 && scr === 'combat' && o.ui.combat) {
        const cb = o.ui.combat;
        const snap = partySnapshot(o);
        const key = `${cb.leg}:${o.march.encounterCount}:${cb.done ? 'd' : 'l'}:${snap.hp.map((h) => h.hp).join(',')}:${snap.gold}`;
        if (!this.leg1CombatLog.some((e) => e.key === key)) {
          this.leg1CombatLog.push({
            key,
            enc: o.march.encounterCount,
            tier: cb.tier,
            done: cb.done,
            victory: cb.st && cb.st.victory,
            pay: cb.pay || 0,
            ...snap,
          });
        }
      }

      if (scr === 'defeat' && o.march.leg === 0 && !this.shopDiag) {
        this.earlyWipe = {
          encounterCount: o.march.encounterCount,
          party: partySnapshot(o),
          combats: this.leg1CombatLog.slice(),
        };
      }

      this.lastScreen = scr;
    },
    finish(env) {
      const o = env.win.__office;
      const S = env.win.__soak;
      if (this.shopDiag && o) {
        const live = shopLines(o);
        this.shopDiag.goldFinal = o.party.gold | 0;
        this.shopDiag.purchasableAtFinish = cheapestPurchasable(o.party.gold | 0, live.length ? live : this.shopDiag.stock);
        this.shopDiag.shopTxnCredited = !!(S && S.current.verbs.shopTxn);
        this.shopDiag.driverTried = (S && S.shopTried) ? [...S.shopTried] : this.shopDiag.attempts.map((a) => a.target);
        this.shopDiag.shopUnavailable = !!(S && S.shopUnavailable);
      }
      return {
        seed: this.seed,
        shop: this.shopDiag,
        soakShop: S ? { shopTried: S.shopTried || [], shopUnavailable: !!S.shopUnavailable } : null,
        endLeg: o ? o.march.leg : null,
        endScreen: o ? o.ui.screen : null,
        earlyWipe: this.earlyWipe,
        leg1Combats: this.leg1CombatLog.length,
        verbs: S ? { ...S.current.verbs } : null,
        findings: S ? (S.findings || []).slice() : [],
        title: env.document.title,
      };
    },
  };
}

async function runSeed(seed, budget = 360000) {
  const shared = { local: new Map(), session: new Map() };
  let href = `file://${resolve(ROOT, 'dist/office-of-the-road.html')}?soak=1&fresh=1&seed=${seed}`;
  let serial = 0;
  let env = await boot(href, shared, serial++);
  const diag = createDiag(seed);
  let elapsed = 0;

  while (elapsed <= budget) {
    diag.poll(env);
    if (env.reloadRequested) {
      href = env.location.href;
      env = await boot(href, shared, serial++);
      continue;
    }
    const dt = 16;
    env.now += dt; elapsed += dt;
    const rafs = env.rafs.splice(0);
    for (const fn of rafs) fn(env.now);
    for (const timer of [...env.intervals.values()]) {
      while (timer.next <= env.now) { timer.next += timer.ms; timer.fn(); diag.poll(env); if (env.reloadRequested) break; }
      if (env.reloadRequested) break;
    }
    if (/^SOAK (PASS|FAIL)/.test(env.document.title)) break;
  }
  diag.poll(env);
  return diag.finish(env);
}

async function main() {
  const args = process.argv.slice(2);
  let seeds = [3, 4, 7, 8, 9, 10];
  if (args.includes('--all')) seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  else if (args.includes('--seed')) {
    seeds = [];
    for (let i = 0; i < args.length; i++) if (args[i] === '--seed') seeds.push(Number(args[++i]));
  }

  const rows = [];
  for (const seed of seeds) rows.push(await runSeed(seed));

  console.log(JSON.stringify(rows, null, 2));
}

main();

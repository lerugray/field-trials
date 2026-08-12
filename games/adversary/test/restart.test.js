import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage, writeSave, readSave } from '../src/sim/save.js';
import { CAMPAIGN_NODES } from '../src/content/campaign.js';

const SAVE_KEY = 'adversary.run';

/** Build a no-op 2D canvas context that can survive the boot renderer's setup and one render pass. */
function fakeCtx() {
  const noop = () => {};
  const target = {
    fillRect: noop, strokeRect: noop, clearRect: noop,
    drawImage: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 0 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w * h) || 0) * 4) }),
    putImageData: noop, createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w * h) || 0) * 4) }),
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    setTransform: noop, resetTransform: noop, beginPath: noop, moveTo: noop,
    lineTo: noop, closePath: noop, fill: noop, stroke: noop, clip: noop,
    arc: noop, rect: noop, ellipse: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      return noop;
    },
    set(obj, prop, value) { obj[prop] = value; return true; },
  });
}

function fakeCanvas() {
  return {
    width: 512, height: 480,
    getContext: () => fakeCtx(),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

/** Snapshot the globals we need to mock so they can be restored after the test. */
function snapshotBrowserGlobals() {
  return {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    performance: globalThis.performance,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
}

function installBrowserGlobals(storage) {
  const canvas = fakeCanvas();
  const doc = {
    createElement: (tag) => (tag === 'canvas' ? canvas : {}),
    readyState: 'complete',
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
  };
  const win = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 512,
    innerHeight: 480,
    getGamepads: () => [],
    requestAnimationFrame: () => 0,
    localStorage: storage,
    performance: { now: () => Date.now() },
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.localStorage = storage;
  globalThis.performance = win.performance;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
}

function restoreBrowserGlobals(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
}

/** Import boot with a fresh module instance for each test so the mocked globals are observed. */
async function importBoot() {
  // Bust ESM cache for the boot module tree so installBrowserGlobals is visible at module load.
  const now = Date.now();
  const { boot } = await import(`../src/boot.js?t=${now}`);
  return boot;
}

test('boot: campaign-clear K handler starts a true new run and does not resurrect the old save', async () => {
  const storage = createMemoryStorage();
  // Seed storage with a genuine finisher's save (the exact failure mode from the re-exam).
  writeSave(storage, SAVE_KEY, {
    campaignIndex: 5,
    taken: ['s1', 's2', 's3l', 's4', 's5l'],
    choice: null,
    assist: false,
  });

  const savedGlobals = snapshotBrowserGlobals();
  installBrowserGlobals(storage);
  let boot, win;
  try {
    boot = await importBoot();
    win = globalThis.window;
    const displayCanvas = fakeCanvas();
    boot(displayCanvas);
  } finally {
    // Restore globals after boot has run so other tests are not affected.
    restoreBrowserGlobals(savedGlobals);
  }

  // Stage the campaign-complete state. The internal mode is not exposed for writing, but the
  // restartRun path is; calling it is exactly what the 'PRESS K TO START A NEW RUN' handler does.
  const campaign = win.__campaign;
  const restartRun = win.__restartRun;
  campaign.index = CAMPAIGN_NODES.length;
  campaign.taken = ['s1', 's2', 's3l', 's4', 's5l', 's6'];
  campaign.choice = null;

  restartRun();

  assert.equal(campaign.index, 0, 'campaign resets to Stage 1');
  assert.deepEqual(campaign.taken, [], 'taken path is cleared');
  assert.equal(campaign.choice, null, 'branch choice is cleared');
  assert.equal(win.__mode(), 'play', 'mode returns to play');

  const stage = win.__stage();
  assert.equal(stage.theme, 'cemetery', 'fresh run loads Stage 1 (cemetery)');
  assert.equal(stage.progress.totalXp, 0, 'fresh run has no carried-over XP');
  assert.equal(stage.gold, 30, 'fresh run has starting gold');

  // The save contract: both the main slot and the backup must be gone.
  const { save } = readSave(storage, SAVE_KEY);
  assert.equal(save, null, 'old autosave does not resurrect');
  assert.equal(storage.getItem(SAVE_KEY), null, 'main save slot removed');
  assert.equal(storage.getItem(SAVE_KEY + '.bak'), null, 'backup save slot removed');
});

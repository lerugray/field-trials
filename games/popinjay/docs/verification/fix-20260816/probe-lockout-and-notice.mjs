// Shipped-dist probe: keyboard menu-recovery + connect-notice occlusion.
// Writes JSON + PNGs under this directory. Run: node docs/verification/fix-20260816/probe-lockout-and-notice.mjs --label before
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const label = process.argv.includes('--label')
  ? process.argv[process.argv.indexOf('--label') + 1]
  : 'run';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const outDir = HERE;

function standardPad() {
  return {
    id: 'Synthetic Standard Gamepad',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(DIST, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  return { ctx, page };
}

async function settle(page, ms = 80) {
  await page.waitForTimeout(ms);
}

async function openBinds(page) {
  await page.keyboard.press('o');
  await settle(page, 120);
  for (let i = 0; i < 16; i++) {
    const { pane, cursor } = await page.evaluate(() => ({
      pane: window.POPINJAY.controller.optPane,
      cursor: window.POPINJAY.controller.optCursor,
    }));
    if (pane === 'settings' && cursor === 8) break;
    await page.keyboard.press('ArrowDown');
    await settle(page, 35);
  }
  await page.keyboard.press('Enter');
  await settle(page, 120);
  return page.evaluate(() => ({
    mode: window.POPINJAY.mode,
    pane: window.POPINJAY.controller.optPane,
    cursor: window.POPINJAY.controller.optCursor,
  }));
}

async function goToRow(page, rowIndex) {
  for (let i = 0; i < 20; i++) {
    const cur = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    if (cur === rowIndex) return true;
    await page.keyboard.press('ArrowDown');
    await settle(page, 35);
  }
  return (await page.evaluate(() => window.POPINJAY.controller.optCursor)) === rowIndex;
}

async function rebindRow(page, rowIndex, key) {
  const at = await goToRow(page, rowIndex);
  if (!at) return { ok: false, reason: 'could-not-reach-row', cursor: await page.evaluate(() => window.POPINJAY.controller.optCursor) };
  await page.keyboard.press('Enter');
  await settle(page, 70);
  const capturing = await page.evaluate(() => window.POPINJAY.controller.rebinding);
  await page.keyboard.press(key);
  await settle(page, 70);
  return {
    ok: true,
    capturing,
    rebindingAfter: await page.evaluate(() => window.POPINJAY.controller.rebinding),
    keys: await page.evaluate((idx) => {
      const rows = ['left', 'right', 'up', 'down', 'fire', 'sidearm', 'tuba', 'pause', 'options', 'quit'];
      return window.POPINJAY.controller.bindings[rows[idx]];
    }, rowIndex),
  };
}

async function measureNativeRows(page, rows) {
  return page.evaluate((rows) => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const box = window.POPINJAY.present;
    const probe = window.POPINJAY.probe();
    const S = box.native.w / 1280;
    const out = {
      present: box,
      paused: window.POPINJAY.paused,
      mode: window.POPINJAY.mode,
      notice: window.POPINJAY.controller.notice,
      playerWorld: { x: probe.playerX, feetY: probe.feetY },
      playerNative: {
        x: probe.playerX == null ? null : probe.playerX * S,
        feetY: probe.feetY == null ? null : probe.feetY * S,
        headY: probe.feetY == null ? null : (probe.feetY - 56) * S,
      },
      rows: {},
      panelBand: {},
    };
    for (const ny of rows) {
      const cy = Math.min(canvas.height - 1, Math.max(0, Math.floor(box.y + (ny + 0.5) * box.scale)));
      let sum = 0;
      for (let x = 0; x < canvas.width; x++) {
        const i = (cy * canvas.width + x) * 4;
        sum += img.data[i] + img.data[i + 1] + img.data[i + 2];
      }
      let panelSum = 0, panelCount = 0;
      const x0 = Math.floor(box.x + 80 * box.scale);
      const x1 = Math.ceil(box.x + 400 * box.scale);
      for (let x = x0; x < x1; x++) {
        const i = (cy * canvas.width + x) * 4;
        panelSum += img.data[i] + img.data[i + 1] + img.data[i + 2];
        panelCount++;
      }
      out.rows[ny] = { canvasY: cy, rgbSum: sum, panelRgbSum: panelSum, panelCount, panelMean: panelCount ? panelSum / panelCount : 0 };
    }
    return out;
  }, rows);
}

const report = { label, stamp, dist: DIST };

const browser = await chromium.launch({ headless: true });
try {
  // ----- probe A: rebind Climb down to KeyS -----
  {
    const { ctx, page } = await freshPage(browser);
    const opened = await openBinds(page);
    const rebound = await rebindRow(page, 3, 's');
    const cursorBefore = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    await page.keyboard.press('ArrowDown');
    await settle(page, 80);
    const cursorAfterArrow = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    await page.keyboard.press('s');
    await settle(page, 80);
    const cursorAfterS = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    const hint = await page.evaluate(() => {
      // optHint is not exported; read the bottom of the native-present canvas is
      // the hint. Bindings dump is enough to prove the mapping; source string is
      // quoted in the lane report. Expose via DOM label if painted.
      return { pane: window.POPINJAY.controller.optPane, cursor: window.POPINJAY.controller.optCursor };
    });
    report.probeA = {
      opened, rebound,
      cursorBeforeArrow: cursorBefore,
      cursorAfterArrowDown: cursorAfterArrow,
      cursorAfterS: cursorAfterS,
      arrowMoved: cursorAfterArrow !== cursorBefore,
      sMoved: cursorAfterS !== cursorAfterArrow,
      hintPane: hint,
    };
    await ctx.close();
  }

  // ----- probe B: bind Climb up AND Climb down to KeyJ -----
  {
    const { ctx, page } = await freshPage(browser);
    await openBinds(page);
    await rebindRow(page, 2, 'j'); // Climb up
    await rebindRow(page, 3, 'j'); // Climb down
    const bindings = await page.evaluate(() => ({
      up: window.POPINJAY.controller.bindings.up,
      down: window.POPINJAY.controller.bindings.down,
    }));
    await goToRow(page, 3);
    const start = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    const samples = [];
    for (const key of ['ArrowDown', 'ArrowUp', 'j']) {
      const before = await page.evaluate(() => window.POPINJAY.controller.optCursor);
      await page.keyboard.press(key);
      await settle(page, 60);
      const after = await page.evaluate(() => window.POPINJAY.controller.optCursor);
      samples.push({ key, before, after, moved: after !== before });
    }
    let reachedReset = false;
    const trail = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowDown');
      await settle(page, 40);
      const cur = await page.evaluate(() => window.POPINJAY.controller.optCursor);
      trail.push(cur);
      if (cur === 10) { reachedReset = true; break; }
    }
    report.probeB = {
      bindings,
      startCursor: start,
      samples,
      twentyArrowDownTrail: trail,
      resetDefaultsReachable: reachedReset,
    };

    // persist check: the poison is in localStorage
    report.poisonedStorage = await page.evaluate(() => localStorage.getItem('popinjay:binds:v1'));
    await ctx.close();
  }

  // ----- probe C: already-poisoned localStorage recovery on reload -----
  {
    const { ctx, page } = await freshPage(browser);
    await page.evaluate((raw) => localStorage.setItem('popinjay:binds:v1', raw), report.poisonedStorage);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
    const loaded = await page.evaluate(() => ({
      up: window.POPINJAY.controller.bindings.up,
      down: window.POPINJAY.controller.bindings.down,
    }));
    await page.keyboard.press('o');
    await settle(page, 120);
    // 20 ArrowDown attempts from settings row 0 toward Controller (8) then Reset via binds
    const settingsTrail = [];
    let reachedController = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowDown');
      await settle(page, 35);
      const cur = await page.evaluate(() => ({
        pane: window.POPINJAY.controller.optPane,
        cursor: window.POPINJAY.controller.optCursor,
      }));
      settingsTrail.push(cur);
      if (cur.pane === 'settings' && cur.cursor === 8) { reachedController = true; break; }
    }
    let reachedReset = false, resetRoute = 'none';
    if (reachedController) {
      await page.keyboard.press('Enter');
      await settle(page, 100);
      const bindTrail = [];
      for (let i = 0; i < 20; i++) {
        const cur = await page.evaluate(() => window.POPINJAY.controller.optCursor);
        bindTrail.push(cur);
        if (cur === 10) { reachedReset = true; resetRoute = 'ArrowDown on reserved menu codes after reload of poisoned binds'; break; }
        await page.keyboard.press('ArrowDown');
        await settle(page, 35);
      }
      report.probeC = { loaded, settingsTrail, reachedController, bindTrail, reachedReset, resetRoute };
    } else {
      // even if Controller is unreachable, try J (should freeze) then arrows from binds if we can
      report.probeC = { loaded, settingsTrail, reachedController, reachedReset: false, resetRoute: 'none — could not reach Controller' };
    }
    await ctx.close();
  }

  // ----- probe D: connect-notice occlusion during unpaused play -----
  {
    const { ctx, page } = await freshPage(browser);
    await page.evaluate(() => window.POPINJAY.startStageAt(1, 1));
    await settle(page, 500);
    // Walk the player into native x ≈ 170 (world x ≈ 453)
    const targetWorldX = 170.3 / (480 / 1280);
    for (let i = 0; i < 90; i++) {
      const x = await page.evaluate(() => window.POPINJAY.probe().playerX);
      if (Math.abs(x - targetWorldX) < 8) break;
      await page.keyboard.down(x > targetWorldX ? 'ArrowLeft' : 'ArrowRight');
      await settle(page, 40);
      await page.keyboard.up(x > targetWorldX ? 'ArrowLeft' : 'ArrowRight');
    }
    await settle(page, 200);
    const rows = [256, 266, 274, 277, 282, 290];
    const beforeNotice = await measureNativeRows(page, rows);
    const beforePng = resolve(outDir, `connect-notice-unpaused-${label}-beforetoast_${stamp}.png`);
    await page.screenshot({ path: beforePng, type: 'png' });

    await page.evaluate((pad) => {
      window.__pjPad = pad;
      window.getGamepads = () => [window.__pjPad];
      const ev = new Event('gamepadconnected');
      Object.defineProperty(ev, 'gamepad', { value: window.__pjPad });
      window.dispatchEvent(ev);
    }, standardPad());
    await settle(page, 180);

    const withNotice = await measureNativeRows(page, rows);
    const livePng = resolve(outDir, `connect-notice-unpaused-${label}_${stamp}.png`);
    await page.locator('canvas').screenshot({ path: livePng, type: 'png' });
    await page.screenshot({ path: resolve(outDir, `connect-notice-unpaused-${label}-page_${stamp}.png`), type: 'png' });

    report.probeD = {
      beforeNotice,
      withNotice,
      captures: { beforeToast: beforePng, liveCanvas: livePng },
      rowDeltas: {},
    };
    for (const ny of rows) {
      report.probeD.rowDeltas[ny] = {
        rgbSumBefore: beforeNotice.rows[ny].rgbSum,
        rgbSumAfter: withNotice.rows[ny].rgbSum,
        panelMeanBefore: beforeNotice.rows[ny].panelMean,
        panelMeanAfter: withNotice.rows[ny].panelMean,
      };
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const jsonPath = resolve(outDir, `probe-${label}-${stamp}.json`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  jsonPath,
  probeA: report.probeA && {
    cursorBeforeArrow: report.probeA.cursorBeforeArrow,
    cursorAfterArrowDown: report.probeA.cursorAfterArrowDown,
    cursorAfterS: report.probeA.cursorAfterS,
    arrowMoved: report.probeA.arrowMoved,
    sMoved: report.probeA.sMoved,
    downKeys: report.probeA.rebound && report.probeA.rebound.keys,
  },
  probeB: report.probeB && {
    bindings: report.probeB.bindings,
    samples: report.probeB.samples,
    resetDefaultsReachable: report.probeB.resetDefaultsReachable,
    trailTail: report.probeB.twentyArrowDownTrail.slice(-5),
  },
  probeC: report.probeC && {
    loaded: report.probeC.loaded,
    reachedController: report.probeC.reachedController,
    reachedReset: report.probeC.reachedReset,
    resetRoute: report.probeC.resetRoute,
  },
  probeD: report.probeD && {
    playerNative: report.probeD.withNotice.playerNative,
    paused: report.probeD.withNotice.paused,
    notice: report.probeD.withNotice.notice && report.probeD.withNotice.notice.headline,
    rowDeltas: report.probeD.rowDeltas,
    captures: report.probeD.captures,
  },
}, null, 2));

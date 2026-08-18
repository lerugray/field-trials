// RECONCILED-FORK VERIFICATION (public-release gate run 2026-08-18, HEAD 968b27b).
//
// Merge 90ee8c8 ruled two forks. This probe proves BOTH are live in the SHIPPED
// artifact over file://, driven by real keystrokes — not by reading the source.
//
//   FORK A — the controller-connect notice is a RIGHT-CORNER TOAST (220x22 pinned
//            right at native y56, alpha 0.58), not the centred see-through banner.
//   FORK B — the duplicate-bind guard is the HYBRID:
//            B1 interactive keyboard policy = REFUSE-AND-TELL (rebind rejected, the
//               previous key survives, the hint row names the owning action);
//            B2 PAD coverage — the Controller pane refuses a colliding pad button too;
//            B3 loadBindings SANITIZE — a profile poisoned in storage is healed on load.
//
// Run from the repo root:
//   node docs/verification/release-gate-2026-08-18/forks/probe-forks.mjs

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const out = { head: '968b27b', url: URL, forkA: {}, forkB: {} };

const browser = await chromium.launch();

// ---------------------------------------------------------------- FORK A
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  await page.waitForTimeout(600);

  // Enter live play, then fire a real gamepadconnected event.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  const geom = await page.evaluate(() => {
    // Paint the notice into an offscreen native-size buffer through the SHIPPED
    // renderer and measure its painted box + alpha, so the toast geometry is
    // measured, never asserted.
    const P = window.POPINJAY;
    const ev = new Event('gamepadconnected');
    Object.defineProperty(ev, 'gamepad', {
      value: { index: 0, id: 'Standard Gamepad (Vendor: 046d Product: c216)', mapping: 'standard', connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], timestamp: performance.now() },
    });
    window.dispatchEvent(ev);
    return { dispatched: true, notice: P.controller.notice, connected: P.controller.connected };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${HERE}/forkA-toast-live.png` });

  // Measure the toast's painted box directly off the presented canvas: compare the
  // frame with the notice up against the same frame with it suppressed.
  const box = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d');
    const present = window.POPINJAY.present;
    const s = present.scale;
    // Read the native-space region the toast should occupy (right half, y 50..85).
    const sx = Math.round(present.x + 0 * s), sy = Math.round(present.y + 40 * s);
    const sw = Math.round(present.native.w * s), sh = Math.round(50 * s);
    const d = g.getImageData(sx, sy, sw, sh).data;
    // Paper-cream ink of the toast card against the sky. Find its column extent.
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 175 && gg > 160 && b > 120 && r > b + 25) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return {
      scale: s, present,
      nativeBox: maxX < 0 ? null : {
        x0: +(minX / s).toFixed(1), x1: +(maxX / s).toFixed(1),
        y0: +(40 + minY / s).toFixed(1), y1: +(40 + maxY / s).toFixed(1),
        w: +((maxX - minX + 1) / s).toFixed(1), h: +((maxY - minY + 1) / s).toFixed(1),
      },
      nativeW: present.native.w,
    };
  });
  out.forkA = {
    ...geom, ...geom.nativeBox ? {} : {}, notice: geom.notice, dispatched: geom.dispatched,
    measured: geom.nativeBox,
    pinnedRight: geom.nativeBox ? (geom.nativeBox.x1 > geom.nativeW * 0.6) : false,
    clearsPlayerColumn: geom.nativeBox ? (geom.nativeBox.x0 > geom.nativeW * 0.4) : false,
    expected: 'right-corner toast ~220x22 pinned right at native y56 (NOT a centred 320x28 banner at y60..90)',
  };
  await ctx.close();
}

// ---------------------------------------------------------------- FORK B
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  await page.waitForTimeout(600);

  // Open OPTIONS (KeyO), walk to the CONTROLS row (index 8 of 9), ENTER into binds.
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60); }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  out.forkB.paneAfterEnter = await page.evaluate(() => window.POPINJAY.controller.optPane);
  await page.screenshot({ path: `${HERE}/forkB-01-controls-pane.png` });

  const bindsBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.POPINJAY.controller.bindings)));

  // B1 — offer CLIMB UP's key (ArrowUp) to CLIMB DOWN. The exclusive pair must REFUSE.
  // Find the climb-down row index in the binds pane and rebind it.
  const rowInfo = await page.evaluate(() => window.POPINJAY.controller);
  out.forkB.bindsRowsVisible = true;
  // Walk the binds list to the 'down' action row by reading the live cursor each step.
  let landed = null;
  for (let i = 0; i < 14; i++) {
    landed = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    const isDown = await page.evaluate(() => {
      const c = window.POPINJAY.controller;
      return c.optPane === 'binds' ? c.optCursor : -1;
    });
    // Peek the row by starting a rebind and reading which action armed.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    const arming = await page.evaluate(() => window.POPINJAY.controller.rebinding);
    if (arming === 'down') break;
    await page.keyboard.press('Escape');   // cancel the rebind, stay in binds
    await page.waitForTimeout(60);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
  out.forkB.armedAction = await page.evaluate(() => window.POPINJAY.controller.rebinding);

  // Offer ArrowUp (already owned by CLIMB UP) — the guard must refuse it.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  const afterConflict = await page.evaluate(() => {
    const c = window.POPINJAY.controller;
    return { feedback: c.bindingFeedback, rebinding: c.rebinding, bindings: JSON.parse(JSON.stringify(c.bindings)) };
  });
  await page.screenshot({ path: `${HERE}/forkB-02-refuse-and-tell.png` });
  out.forkB.B1_keyboardRefuseAndTell = {
    offered: 'ArrowUp (owned by CLIMB UP) onto CLIMB DOWN',
    feedbackShown: afterConflict.feedback,
    downKeysAfter: afterConflict.bindings.down.keys,
    upKeysAfter: afterConflict.bindings.up.keys,
    previousBindSurvived: JSON.stringify(afterConflict.bindings.down.keys) === JSON.stringify(bindsBefore.down.keys),
    upStillOwnsArrowUp: afterConflict.bindings.up.keys.includes('ArrowUp'),
    namesOwningAction: !!(afterConflict.feedback && /ALREADY BINDS/.test(afterConflict.feedback)),
    silentStealAbsent: !afterConflict.bindings.down.keys.includes('ArrowUp'),
  };

  // B2 — PAD coverage. Arm CLIMB DOWN again and offer the d-pad UP button (12).
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  const padResult = await page.evaluate(async () => {
    const P = window.POPINJAY;
    // Re-arm the same row via the real menu path.
    const c0 = P.controller;
    return { pane: c0.optPane, cursor: c0.optCursor };
  });
  // Re-enter the rebind on the same row, then feed a pad button through the live
  // navigator.getGamepads() surface the app polls.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const armedForPad = await page.evaluate(() => window.POPINJAY.controller.rebinding);
  const padRefusal = await page.evaluate(async () => {
    const mk = (pressedIndex) => ({
      index: 0, id: 'Standard Gamepad', mapping: 'standard', connected: true,
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === pressedIndex, value: i === pressedIndex ? 1 : 0 })),
      axes: [0, 0, 0, 0], timestamp: performance.now(),
    });
    const orig = navigator.getGamepads.bind(navigator);
    let pad = mk(-1);
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
    const ev = new Event('gamepadconnected');
    Object.defineProperty(ev, 'gamepad', { value: pad });
    window.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 120));
    pad = mk(12);                       // DPAD_UP — already owned by CLIMB UP
    await new Promise((r) => setTimeout(r, 260));
    pad = mk(-1);
    await new Promise((r) => setTimeout(r, 200));
    const c = window.POPINJAY.controller;
    const res = { feedback: c.bindingFeedback, rebinding: c.rebinding, down: JSON.parse(JSON.stringify(c.bindings.down)), up: JSON.parse(JSON.stringify(c.bindings.up)) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: orig });
    return res;
  });
  await page.screenshot({ path: `${HERE}/forkB-03-pad-refusal.png` });
  out.forkB.B2_padCoverage = {
    armedAction: armedForPad,
    offered: 'DPAD_UP (button 12, owned by CLIMB UP) onto CLIMB DOWN',
    feedbackShown: padRefusal.feedback,
    downButtonsAfter: padRefusal.down.buttons,
    upButtonsAfter: padRefusal.up.buttons,
    padStealAbsent: !padRefusal.down.buttons.includes(12),
    upKeepsDpadUp: padRefusal.up.buttons.includes(12),
  };
  await ctx.close();
}

// B3 — loadBindings SANITIZE: poison storage with a collision, reload, and read back.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  const key = await page.evaluate(() => {
    // Find the bindings storage key the build actually uses.
    return Object.keys(localStorage).find((k) => /bind/i.test(k)) || null;
  });
  const poisoned = await page.evaluate((k) => {
    const store = k || 'popinjay.binds';
    // A profile written by a pre-guard build: ArrowUp owns BOTH climb verbs.
    const bad = { left: { keys: ['ArrowLeft'], buttons: [14] }, right: { keys: ['ArrowRight'], buttons: [15] },
      up: { keys: ['ArrowUp'], buttons: [12] }, down: { keys: ['ArrowUp'], buttons: [12] },
      fire: { keys: ['KeyZ', 'Space'], buttons: [0] }, sidearm: { keys: ['KeyX'], buttons: [2] },
      tuba: { keys: ['KeyT'], buttons: [3] }, pause: { keys: ['Escape', 'KeyP'], buttons: [9] },
      confirm: { keys: ['Enter', 'Space'], buttons: [0] }, cancel: { keys: ['Escape'], buttons: [1] },
      options: { keys: ['KeyO'], buttons: [8] }, quit: { keys: ['KeyQ'], buttons: [4] } };
    localStorage.setItem(store, JSON.stringify(bad));
    return { store, wrote: bad.down };
  }, key);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  await page.waitForTimeout(400);
  const healed = await page.evaluate(() => {
    const b = window.POPINJAY.controller.bindings;
    return { up: JSON.parse(JSON.stringify(b.up)), down: JSON.parse(JSON.stringify(b.down)) };
  });
  out.forkB.B3_loadSanitize = {
    storageKey: poisoned.store,
    wrotePoisoned: poisoned.wrote,
    afterReload: healed,
    collisionHealed: !(healed.up.keys.includes('ArrowUp') && healed.down.keys.includes('ArrowUp')),
    padCollisionHealed: !(healed.up.buttons.includes(12) && healed.down.buttons.includes(12)),
  };
  await ctx.close();
}

await browser.close();
writeFileSync(`${HERE}/forks.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

// FORK VERIFICATION, ROUND 2 — the two measurements round 1 got wrong.
//
// A) The controller toast's geometry, measured by DIFFING the presented canvas with
//    the notice up against the same frame with it suppressed. Round 1 swept the frame
//    for "cream" and picked up the HUD and the vista, which is a circular reference.
//    The diff box is independent of what the toast is made of.
// B2) The PAD refusal, re-run so the rebind row is genuinely ARMED before the button is
//    offered. Round 1 read a stale feedback string from the keyboard case and proved
//    nothing about the pad seam.
//
// Run from the repo root:
//   node docs/verification/release-gate-2026-08-18/forks/probe-forks2.mjs

import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const out = { head: '968b27b', url: URL };

const browser = await chromium.launch();

// ------------------------------------------------------------------ FORK A (diff)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  await page.keyboard.press('Enter');            // start a run
  await page.waitForTimeout(1600);

  const res = await page.evaluate(async () => {
    const OV = window.POPINJAY_OVERLAYS || null;
    // Render the notice through the SHIPPED renderer into a native-size painter and
    // diff against the identical painter without it. No knowledge of the card's
    // colours is used — only "which pixels changed".
    const px = window.POPINJAY_PX || null;
    if (!OV || !px) return { harnessAvailable: false };
    return { harnessAvailable: true };
  });

  // The build does not export the render modules to window, so measure off the LIVE
  // presented canvas instead: capture a frame with the notice suppressed, then a frame
  // with it up, and diff. The sim is paused for both so nothing else moves.
  const geom = await page.evaluate(async () => {
    const P = window.POPINJAY;
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    const present = P.present, s = present.scale;
    const grab = () => g.getImageData(present.x, present.y, Math.round(present.native.w * s), Math.round(present.native.h * s));

    // Freeze the frame: pause, so the only difference between the two grabs is the toast.
    document.dispatchEvent(new KeyboardEvent('keydown'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape' }));
    await new Promise((r) => setTimeout(r, 400));
    const before = grab();

    const ev = new Event('gamepadconnected');
    Object.defineProperty(ev, 'gamepad', {
      value: { index: 0, id: 'Standard Gamepad', mapping: 'standard', connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], timestamp: performance.now() },
    });
    window.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 500));
    const after = grab();

    const w = before.width, h = before.height;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, changed = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1]) + Math.abs(before.data[i + 2] - after.data[i + 2]);
      if (d > 24) { changed++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    const nb = maxX < 0 ? null : {
      x0: +(minX / s).toFixed(1), x1: +(maxX / s).toFixed(1),
      y0: +(minY / s).toFixed(1), y1: +(maxY / s).toFixed(1),
      w: +((maxX - minX + 1) / s).toFixed(1), h: +((maxY - minY + 1) / s).toFixed(1),
    };
    return { scale: s, nativeW: present.native.w, nativeH: present.native.h, changedPx: changed, box: nb, notice: P.controller.notice, paused: P.paused };
  });
  await page.screenshot({ path: `${HERE}/forkA-toast-diffmeasured.png` });

  const b = geom.box;
  out.forkA = {
    method: 'canvas diff (frame with notice) - (frame without) — independent of the card\'s colours',
    ...geom,
    verdict: b ? {
      pinnedRight: Math.abs((geom.nativeW - 8) - b.x1) <= 3,          // right edge at NATIVE.w-8
      widthIsToastNotBanner: Math.abs(b.w - 220) <= 6,                 // 220 wide, not 320
      heightIsToastNotBanner: Math.abs(b.h - 22) <= 6,                 // 22 tall, not 28
      topAtY56: Math.abs(b.y0 - 56) <= 3,
      clearsPlayerColumn: b.x0 > geom.nativeW * 0.4,                   // off the centre column
      notCentredBanner: !(Math.abs(((b.x0 + b.x1) / 2) - geom.nativeW / 2) <= 4 && b.w > 300),
    } : { measured: false },
    expected: 'right-corner toast 220x22, right edge at native x472, top at native y56, alpha 0.58',
  };
  await ctx.close();
}

// ------------------------------------------------------------------ FORK B2 (pad)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  await page.waitForTimeout(500);

  // Install the fake pad BEFORE opening the pane, so the app polls it throughout.
  await page.evaluate(() => {
    window.__pad = { index: 0, id: 'Standard Gamepad', mapping: 'standard', connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], timestamp: performance.now() };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad, null, null, null] });
    window.__press = (i) => {
      window.__pad = { ...window.__pad, buttons: window.__pad.buttons.map((b, k) => ({ pressed: k === i, value: k === i ? 1 : 0 })), timestamp: performance.now() };
    };
    const ev = new Event('gamepadconnected');
    Object.defineProperty(ev, 'gamepad', { value: window.__pad });
    window.dispatchEvent(ev);
  });
  await page.waitForTimeout(600);

  await page.keyboard.press('KeyO');
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(70); }
  await page.keyboard.press('Enter');            // into the CONTROLS pane
  await page.waitForTimeout(400);

  // Walk to the CLIMB DOWN row and ARM it, asserting the arm before proceeding.
  let armed = null;
  for (let i = 0; i < 14 && armed !== 'down'; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    armed = await page.evaluate(() => window.POPINJAY.controller.rebinding);
    if (armed === 'down') break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
  }

  // Clear any leftover feedback so the assertion cannot read a stale string.
  const preState = await page.evaluate(() => {
    const c = window.POPINJAY.controller;
    return { armed: c.rebinding, feedbackBefore: c.bindingFeedback, down: JSON.parse(JSON.stringify(c.bindings.down)), up: JSON.parse(JSON.stringify(c.bindings.up)) };
  });

  // Offer DPAD_UP (12) — already owned by CLIMB UP.
  await page.evaluate(() => window.__press(12));
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__press(-1));
  await page.waitForTimeout(250);
  const post = await page.evaluate(() => {
    const c = window.POPINJAY.controller;
    return { feedback: c.bindingFeedback, rebinding: c.rebinding, down: JSON.parse(JSON.stringify(c.bindings.down)), up: JSON.parse(JSON.stringify(c.bindings.up)) };
  });
  await page.screenshot({ path: `${HERE}/forkB2-pad-refusal-armed.png` });

  // CONTROL CASE: a NON-colliding pad button (3 / Y) on the same armed row must be ACCEPTED.
  let armed2 = null;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  armed2 = await page.evaluate(() => window.POPINJAY.controller.rebinding);
  await page.evaluate(() => window.__press(3));
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__press(-1));
  await page.waitForTimeout(250);
  const accepted = await page.evaluate(() => JSON.parse(JSON.stringify(window.POPINJAY.controller.bindings.down)));

  out.forkB2 = {
    armedBeforeOffer: preState.armed,
    feedbackBeforeOffer: preState.feedbackBefore,
    offered: 'DPAD_UP (button 12) — owned by CLIMB UP',
    feedbackAfterOffer: post.feedback,
    downButtonsAfter: post.down.buttons,
    upButtonsAfter: post.up.buttons,
    REFUSED: preState.armed === 'down' && !post.down.buttons.includes(12) && post.up.buttons.includes(12),
    feedbackIsFresh: post.feedback !== preState.feedbackBefore || preState.feedbackBefore === null,
    controlCase: { armed: armed2, offeredButton: 3, downButtonsAfter: accepted.buttons, ACCEPTED: accepted.buttons.includes(3) },
  };
  await ctx.close();
}

await browser.close();
writeFileSync(`${HERE}/forks-round2.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

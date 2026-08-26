// App-side gamepad + rebind wiring. app.js is never imported by node --test (by
// design); these drive the SHIPPED dist through window.getGamepads and the
// POPINJAY debug surface so pollPad / processPadMenus / rebind-capture /
// disconnect-pause are proven on the boot path, not just on the pure module.

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DIST = pathToFileURL(resolve('dist/popinjay.html')).href;

async function freshPage() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(DIST, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  return { browser, ctx, page };
}

async function settle(page, ms = 80) {
  await page.waitForTimeout(ms);
}

function standardPadState() {
  return {
    id: 'Synthetic Standard Gamepad',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}

async function installHarnessPad(page) {
  await page.evaluate((pad) => {
    window.__pjPad = pad;
    window.getGamepads = () => [window.__pjPad];
  }, standardPadState());
  await settle(page, 120);
}

async function setPadButton(page, index, down) {
  await page.evaluate(({ index, down }) => {
    window.__pjPad.buttons[index] = { pressed: !!down, value: down ? 1 : 0 };
  }, { index, down });
  await settle(page, 50);
}

async function tapPadButton(page, index) {
  await setPadButton(page, index, true);
  await settle(page, 50);
  await setPadButton(page, index, false);
}

test('keyboard rebinding of Pause / Options / Quit is live, not decorative', async () => {
  const { browser, page } = await freshPage();
  try {
    const mode = () => page.evaluate(() => window.POPINJAY.mode);
    const paused = () => page.evaluate(() => window.POPINJAY.paused);
    const optPane = () => page.evaluate(() => window.POPINJAY.controller.optPane);
    const optCursor = () => page.evaluate(() => window.POPINJAY.controller.optCursor);
    const rebinding = () => page.evaluate(() => window.POPINJAY.controller.rebinding);

    await page.keyboard.press('o');
    await settle(page, 120);
    assert.equal(await mode(), 'options', 'O opens Options before rebind');

    const nSettings = await page.evaluate(() => {
      const cur = window.POPINJAY.controller.optCursor;
      return 8 - cur; // Controller is the 9th row (index 8)
    });
    for (let i = 0; i < nSettings + 8; i++) {
      if (await optCursor() === 8 && await optPane() === 'settings') break;
      await page.keyboard.press('ArrowDown');
      await settle(page, 40);
    }
    assert.equal(await optCursor(), 8, 'cursor on Controller row');
    await page.keyboard.press('Enter');
    await settle(page, 120);
    assert.equal(await optPane(), 'binds');

    async function rebindRow(rowIndex, key) {
      for (let i = 0; i < 16; i++) {
        if (await optCursor() === rowIndex) break;
        await page.keyboard.press('ArrowDown');
        await settle(page, 40);
      }
      assert.equal(await optCursor(), rowIndex, `cursor on rebind row ${rowIndex}`);
      await page.keyboard.press('Enter');
      await settle(page, 80);
      assert.ok(await rebinding(), `capture open on row ${rowIndex}`);
      await page.keyboard.press(key);
      await settle(page, 80);
      assert.equal(await rebinding(), null, 'capture closed after key');
    }

    await rebindRow(7, 'k'); // Pause
    await rebindRow(8, 'i'); // Options
    await rebindRow(9, 'u'); // Quit

    await page.keyboard.press('Escape');
    await settle(page, 80);
    await page.keyboard.press('Escape');
    await settle(page, 120);
    assert.equal(await mode(), 'title');

    await page.keyboard.press('i');
    await settle(page, 120);
    assert.equal(await mode(), 'options', 'rebound Options key opens Options');
    await page.keyboard.press('Escape');
    await settle(page, 120);

    await page.keyboard.press('Enter');
    await settle(page, 400);
    assert.equal(await mode(), 'playing');
    assert.equal(await paused(), false);

    await page.keyboard.press('k');
    await settle(page, 120);
    assert.equal(await paused(), true, 'rebound Pause key pauses');
    await page.keyboard.press('p');
    await settle(page, 120);
    assert.equal(await paused(), true, 'old P no longer toggles pause after rebind');

    await page.keyboard.press('u');
    await settle(page, 200);
    assert.equal(await mode(), 'title', 'rebound Quit key returns to title');
  } finally {
    await browser.close();
  }
});

test('window.getGamepads pollPad Start pauses and disconnect during play stays paused', async () => {
  const { browser, page } = await freshPage();
  try {
    const mode = () => page.evaluate(() => window.POPINJAY.mode);
    const paused = () => page.evaluate(() => window.POPINJAY.paused);
    const connected = () => page.evaluate(() => window.POPINJAY.controller.connected);
    const notice = () => page.evaluate(() => window.POPINJAY.controller.notice);

    await page.keyboard.press('Enter');
    await settle(page, 400);
    assert.equal(await mode(), 'playing');

    await installHarnessPad(page);
    assert.equal(await connected(), true, 'pollPad consumed window.getGamepads');
    const onNotice = await notice();
    assert.equal(onNotice && onNotice.headline, 'CONTROLLER CONNECTED');
    const pauseRows = await page.evaluate(() => window.POPINJAY.controller.pauseControls);
    assert.ok(pauseRows && pauseRows.rows.length === 8, 'connected pause uses pauseControlLines (8 KEY>PAD rows)');

    await tapPadButton(page, 9); // Start
    assert.equal(await paused(), true, 'processPadMenus Start pauses play');
    await tapPadButton(page, 9);
    assert.equal(await paused(), false, 'Start toggles resume');

    await page.evaluate(() => {
      const ev = new Event('gamepaddisconnected');
      Object.defineProperty(ev, 'gamepad', { value: window.__pjPad });
      window.__pjPad.connected = false;
      window.getGamepads = () => [];
      window.dispatchEvent(ev);
    });
    await settle(page, 150);
    assert.equal(await paused(), true, 'disconnect during play pauses');
    const off = await notice();
    assert.equal(off && off.headline, 'CONTROLLER DISCONNECTED');
    assert.match(off.detail, /GAME PAUSED/);
    assert.equal(off.ticks, Infinity);
    assert.equal(await paused(), true, 'reconnect does not auto-resume — still paused after the event');
  } finally {
    await browser.close();
  }
});

test('pad rebind capture from the Controller pane writes the new button and suppresses it until release', async () => {
  const { browser, page } = await freshPage();
  try {
    const optPane = () => page.evaluate(() => window.POPINJAY.controller.optPane);
    const optCursor = () => page.evaluate(() => window.POPINJAY.controller.optCursor);
    const rebinding = () => page.evaluate(() => window.POPINJAY.controller.rebinding);
    const paused = () => page.evaluate(() => window.POPINJAY.paused);
    const mode = () => page.evaluate(() => window.POPINJAY.mode);

    await page.keyboard.press('o');
    await settle(page, 120);
    for (let i = 0; i < 16; i++) {
      if (await optCursor() === 8 && await optPane() === 'settings') break;
      await page.keyboard.press('ArrowDown');
      await settle(page, 40);
    }
    await page.keyboard.press('Enter');
    await settle(page, 120);
    assert.equal(await optPane(), 'binds');
    for (let i = 0; i < 16; i++) {
      if (await optCursor() === 7) break;
      await page.keyboard.press('ArrowDown');
      await settle(page, 40);
    }
    await page.keyboard.press('Enter');
    await settle(page, 80);
    assert.equal(await rebinding(), 'pause');

    await installHarnessPad(page);
    await tapPadButton(page, 5); // RB
    assert.equal(await rebinding(), null, 'pad button captured');
    const buttons = await page.evaluate(() => window.POPINJAY.controller.bindings.pause.buttons);
    assert.deepEqual(buttons, [5]);

    await page.keyboard.press('Escape');
    await settle(page, 80);
    await page.keyboard.press('Escape');
    await settle(page, 120);
    await page.keyboard.press('Enter');
    await settle(page, 400);
    assert.equal(await mode(), 'playing');

    // The capturing press is suppressed until release; a later RB press pauses.
    await tapPadButton(page, 5);
    assert.equal(await paused(), true, 'rebound pad Pause button pauses play');
  } finally {
    await browser.close();
  }
});

test('draft Enter takes the highlighted souvenir (same logical confirm as pad A)', async () => {
  const { browser, page } = await freshPage();
  try {
    await page.evaluate(() => window.POPINJAY.draftDemo());
    await settle(page, 120);
    assert.equal(await page.evaluate(() => window.POPINJAY.mode), 'draft');
    const before = await page.evaluate(() => window.POPINJAY.souvenirs.length);
    assert.equal(before, 0);
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.equal(await page.evaluate(() => window.POPINJAY.souvenirs.length), 1, 'Enter takes, it does not decline');
    assert.notEqual(await page.evaluate(() => window.POPINJAY.mode), 'draft');
  } finally {
    await browser.close();
  }
});

test('reserved menu arrows keep Options navigable after climb rebind and a poisoned KeyJ profile', async () => {
  const { browser, page } = await freshPage();
  try {
    async function openBinds() {
      await page.keyboard.press('o');
      await settle(page, 100);
      for (let i = 0; i < 16; i++) {
        const at = await page.evaluate(() => window.POPINJAY.controller.optPane === 'settings'
          && window.POPINJAY.controller.optCursor === 8);
        if (at) break;
        await page.keyboard.press('ArrowDown');
        await settle(page, 30);
      }
      await page.keyboard.press('Enter');
      await settle(page, 80);
    }
    async function goTo(row) {
      for (let i = 0; i < 20; i++) {
        if (await page.evaluate(() => window.POPINJAY.controller.optCursor) === row) return;
        await page.keyboard.press('ArrowDown');
        await settle(page, 30);
      }
    }
    async function rebind(row, key) {
      await goTo(row);
      await page.keyboard.press('Enter');
      await settle(page, 50);
      await page.keyboard.press(key);
      await settle(page, 50);
    }

    await openBinds();
    await rebind(3, 's');
    const at3 = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    await page.keyboard.press('ArrowDown');
    await settle(page, 80);
    const afterArrow = await page.evaluate(() => window.POPINJAY.controller.optCursor);
    assert.notEqual(afterArrow, at3, 'ArrowDown still moves the Controller cursor after Climb-down rebound to KeyS');

    await rebind(2, 'j');
    await rebind(3, 'j');
    assert.deepEqual(await page.evaluate(() => window.POPINJAY.controller.bindings.up.keys), ['KeyJ']);
    assert.deepEqual(await page.evaluate(() => window.POPINJAY.controller.bindings.down.keys), ['KeyS'],
      'duplicate Climb-down binding is refused and its previous key survives');
    assert.match(await page.evaluate(() => window.POPINJAY.controller.bindingFeedback),
      /J ALREADY BINDS CLIMB UP/, 'duplicate refusal gives visible action-specific feedback');
    await goTo(3);
    await page.keyboard.press('ArrowDown');
    await settle(page, 80);
    assert.notEqual(await page.evaluate(() => window.POPINJAY.controller.optCursor), 3,
      'ArrowDown still moves after Climb-up and Climb-down were both offered KeyJ');

    // The seam can no longer CREATE this shape, but storage written by a pre-guard
    // build (or edited by hand) still can. Forge it directly and prove the reload
    // heals it — and that reserved arrows keep the menu usable regardless.
    await page.evaluate(() => {
      const b = JSON.parse(localStorage.getItem('popinjay:binds:v1'));
      b.up.keys = ['KeyJ']; b.down.keys = ['KeyJ'];
      localStorage.setItem('popinjay:binds:v1', JSON.stringify(b));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
    const reloaded = await page.evaluate(() => window.POPINJAY.controller.bindings);
    assert.equal(reloaded.down.keys.includes('KeyJ'), true);
    assert.equal(reloaded.up.keys.includes('KeyJ'), false,
      'reloaded profile must not restore a KeyJ climb collision');
    await openBinds();
    let reachedReset = false;
    for (let i = 0; i < 16; i++) {
      if (await page.evaluate(() => window.POPINJAY.controller.optCursor) === 10) { reachedReset = true; break; }
      await page.keyboard.press('ArrowDown');
      await settle(page, 30);
    }
    assert.equal(reachedReset, true, 'RESET-DEFAULTS ROW REACHABLE FROM KEYBOARD: true via reserved ArrowDown after reload of poisoned binds');
  } finally {
    await browser.close();
  }
});

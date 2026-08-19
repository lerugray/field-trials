// Withdraw-verb LOOK evidence (release-gate Q3 hotfix, 2026-08-19).
//
// Builds the artifact, boots it headless from file://, drives REAL mouse clicks (never synthetic
// dispatch) through the shell/orientation, raises a fortify order, captures the queued state,
// clicks the live Withdraw control at its real on-screen rectangle (state().buttons, never a
// guessed coordinate), and captures the refunded state. Three frames land in this directory at
// display scale so a looker can read them exactly as a player would see them, over the same CRT
// register (pixelated section + dithered surfaces) and the crisp text-layer carve-out.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'look-withdraw-20260819');
mkdirSync(OUT, { recursive: true });

execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'inherit' });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

async function clientPoint(bx, by) {
  return page.evaluate(
    ({ bx, by }) => {
      const c = document.getElementById('screen').getBoundingClientRect();
      return { x: c.left + bx * (c.width / 640), y: c.top + by * (c.height / 360) };
    },
    { bx, by },
  );
}

async function clickButton(id) {
  const state = await page.evaluate(() => window.__GAME.state());
  const b = state.buttons.find((btn) => btn.id === id);
  if (!b) throw new Error(`no live button with id "${id}" (buttons: ${state.buttons.map((x) => x.id).join(', ')})`);
  if (!b.enabled) throw new Error(`button "${id}" is not enabled`);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const client = await clientPoint(cx, cy);
  await page.mouse.click(client.x, client.y);
  await page.waitForTimeout(80);
}

// Walk in through the shell exactly as a player does.
await page.keyboard.press('Enter'); // title -> orientation
await page.waitForFunction(() => window.__GAME.state().overlay === 'orientation', { timeout: 3000 });
await page.keyboard.press('Enter'); // orientation -> the desk
await page.waitForTimeout(80);

let state = await page.evaluate(() => window.__GAME.state());
if (state.overlay !== null) throw new Error(`did not reach the desk (overlay=${state.overlay})`);
console.log('before:', state);

// Raise a fortify order with a real click on the real Fortify control, exactly as a player would.
await clickButton('fortify');
state = await page.evaluate(() => window.__GAME.state());
console.log('after fortify:', state);
if (state.ordersOpen !== 1) throw new Error(`fortify click did not queue an order (ordersOpen=${state.ordersOpen})`);
const hasWithdraw = state.buttons.some((b) => b.id === 'withdraw' && b.enabled);
if (!hasWithdraw) throw new Error('Withdraw control did not appear once an order was queued');
await page.screenshot({ path: join(OUT, '1-order-queued.png') });

// Zoom on the action bar so the Withdraw label (and its refund figure) is independently legible.
const barBox = await page.evaluate(() => {
  const c = document.getElementById('screen').getBoundingClientRect();
  return { x: c.left, y: c.top + c.height * (300 / 360), width: c.width, height: c.height * (60 / 360) };
});
await page.screenshot({ path: join(OUT, '1b-actionbar-zoom.png'), clip: barBox });

// Click the live Withdraw control at its REAL rectangle.
await clickButton('withdraw');
state = await page.evaluate(() => window.__GAME.state());
console.log('after withdraw:', state);
if (state.ordersOpen !== 0) throw new Error(`withdraw click did not clear the order (ordersOpen=${state.ordersOpen})`);
if (state.buttons.some((b) => b.id === 'withdraw')) throw new Error('Withdraw control did not retire itself');
await page.screenshot({ path: join(OUT, '2-refunded.png') });
await page.screenshot({ path: join(OUT, '2b-actionbar-zoom.png'), clip: barBox });

const treasuryLine = await page.evaluate(() => window.__GAME.state().treasury);
console.log('treasury after refund:', treasuryLine, '(before fortify it was 400)');

await browser.close();
console.log('wrote captures to', OUT);

// preview-ui.mjs — dev-only: screenshot the HUD, the paused menu, and the action menu overlay in the
// M12-ART register so the chrome can be eyeballed. Writes to /tmp. Not a proof.
import { chromium } from 'playwright';
import { writeBuild } from './build.js';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(writeBuild()).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 480 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
await page.goto(url);
await page.waitForTimeout(300);

// Give the player some gold/xp so the HUD panels are populated, then screenshot the HUD.
await page.evaluate(() => { const s = window.__stage(); s.gold = 143; s.progress.totalXp = 30; });
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/ui-hud.png' });
console.log('hud ok');

const tap = async (key) => { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(90); };

// Open the action menu (Enter = MENU/Start per the input map); step to the weapons tab.
await tap('Enter');
await tap('ArrowRight');
const menuOpen = await page.evaluate(() => window.__stage().menu.open);
await page.screenshot({ path: '/tmp/ui-menu.png' });
console.log('menu ok, open =', menuOpen);
await tap('KeyH'); // CANCEL closes the menu

// Pause overlay.
await tap('Escape');
const paused = await page.evaluate(() => window.__mode());
await page.screenshot({ path: '/tmp/ui-pause.png' });
console.log('pause ok, mode =', paused);

await browser.close();

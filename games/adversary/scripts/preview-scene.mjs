// preview-scene.mjs — dev-only: boot the dist and screenshot one in-game frame per theme so the
// M12-ART backdrop/dressing/tiles can be eyeballed headlessly. Writes to /tmp. Not a proof.
import { chromium } from 'playwright';
import { writeBuild } from './build.js';
import { pathToFileURL } from 'node:url';

const outPath = writeBuild();
const url = pathToFileURL(outPath).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 480 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
await page.goto(url);
await page.waitForTimeout(300);

// Load one representative stage per theme by node id (s1 cemetery, s4 crypt, s6 keep).
const picks = [['cemetery', 's1'], ['crypt', 's4'], ['keep', 's6']];
for (const [name, id] of picks) {
  const ok = await page.evaluate((nid) => {
    const nodes = window.__nodes;
    const node = nodes.find((n) => n.id === nid);
    const def = node.stage || (node.branch && node.branch.left.stage);
    if (!def) return false;
    const s = window.__loadStageDef(def);
    // nudge the player a little into the level so dressing is on-screen
    s.player.x += 80; s.camera.x = Math.max(0, s.player.x - 128);
    return true;
  }, id);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `/tmp/scene-${name}.png` });
  console.log(`scene ${name} (${id}): ${ok ? 'ok' : 'FAIL'}`);
}
await browser.close();

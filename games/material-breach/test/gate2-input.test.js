// GATE 2 — real-event input smoke (DESIGN-SEED §8.2). Playwright driving REAL mouse events against
// the built dist/index.html. Synthetic handler dispatch is NOT this gate. Pointer-primary game:
// this gate is non-negotiable. It builds the artifact, loads it from file://, and clicks a grid
// cell with a real mouse; the click must queue an excavation works order (treasury spent, order
// opened). Skips gracefully where no browser is available so the battery stays green everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // Playwright not installed here; the gate skips (it runs wherever a browser is available).
}

test('a real mouse click on the cutaway carves a cell (Gate 2)', { skip: chromium ? false : 'playwright unavailable' }, async (t) => {
  execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'ignore' });
  const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    t.skip(`no browser binary: ${err.message}`);
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(fileUrl);
    await page.waitForFunction(() => !!window.__GAME);

    // Walk in through the shell: the title (M8), then the orientation packet, and the ADMIN grid
    // is interactive. Pressing Enter once was enough before M8 put a title in front of the game.
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__GAME.state().overlay === 'orientation', { timeout: 3000 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);

    const before = await page.evaluate(() => window.__GAME.state());
    assert.equal(before.overlay, null, 'orientation not dismissed');
    assert.equal(before.ordersOpen, 0);

    // A cell just beyond the claimed founding footprint (deterministic: centre + ortho at 24x16).
    // The geometry is READ FROM THE RUNNING GAME, because the camera frames the built facility
    // rather than the whole grid. Recomputing it here from a fixed cell size would click a
    // different cell than the one under the player's cursor, and the gate would test a fiction.
    const geo = before.geo;
    const targetCell = { x: 12 + 2, y: 8 }; // adjacent to the claimed cell at (13,8)
    const bx = geo.ox + targetCell.x * geo.cell + geo.cell / 2;
    const by = geo.oy + targetCell.y * geo.cell + geo.cell / 2;

    // Map buffer coords to client coords through the real canvas rectangle (handles any scale).
    const client = await page.evaluate(
      ({ bx, by }) => {
        const c = document.getElementById('screen').getBoundingClientRect();
        return { x: c.left + bx * (c.width / 640), y: c.top + by * (c.height / 360) };
      },
      { bx, by },
    );

    await page.mouse.click(client.x, client.y);
    await page.waitForTimeout(80);

    const after = await page.evaluate(() => window.__GAME.state());
    assert.equal(after.ordersOpen, 1, 'the real mouse click did not queue an excavation order');
    assert.equal(
      after.treasury,
      before.treasury - CONFIG.orders.excavate.cost,
      'the excavation cost was not spent by the real click',
    );
  } finally {
    await browser.close();
  }
});

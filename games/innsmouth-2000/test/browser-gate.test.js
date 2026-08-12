// Playwright pixel gate for the built single-file artifact.
//
// The text-overflow detector is calibrated to headless Chrome's generic monospace metrics, so the
// suite can be green while a real browser fails to render. This gate loads the actual built
// dist/innsmouth2000.html in headless Chromium, listens for runtime errors, and checks that the
// canvas is not blank. It is skipped when Playwright is not installed (e.g. a bare CI image), but it
// runs here because the capture pipeline already depends on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'dist', 'innsmouth2000.html');

let pw = null;
try {
  pw = await import('playwright');
} catch {
  // Playwright is optional; the unit suite still covers layout/sim logic.
}

if (!pw || !existsSync(HTML)) {
  const reason = !pw ? 'playwright not installed' : 'dist/innsmouth2000.html not built';
  test.skip(`built single-file renders without runtime errors and is not blank (${reason})`, () => {});
} else {
  test('built single-file renders without runtime errors and is not blank', async () => {
    const browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto('file://' + encodeURI(HTML), { waitUntil: 'networkidle' });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const distinctColors = await page.evaluate(() => {
      const c = document.getElementById('screen');
      if (!c) return 0;
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set();
      // Sample every 16th pixel; enough to distinguish a blank void from a rendered town.
      for (let i = 0; i < data.length; i += 64) {
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return colors.size;
    });

    await browser.close();
    assert.equal(errors.length, 0, `runtime errors: ${errors.join('; ')}`);
    assert.ok(distinctColors > 20, `canvas should contain many colors, got ${distinctColors}`);
  });
}

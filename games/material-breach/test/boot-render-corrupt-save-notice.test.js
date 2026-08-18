import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // Playwright not installed; these tests will be skipped cleanly.
}

function buildIfNeeded() {
  execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'ignore' });
  return 'file://' + join(ROOT, 'dist', 'index.html');
}

async function takeTitleScreenshot(page) {
  await page.waitForFunction(() => !!window.__GAME);
  await page.waitForTimeout(400);
  return page.screenshot({ type: 'png' });
}

test(
  'boot→render: malformed-but-version-valid save recovers and shows the corrupt-save notice',
  { skip: chromium ? false : 'playwright unavailable' },
  async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();

    const url = buildIfNeeded();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));

    await page.goto(url);
    const clean = await takeTitleScreenshot(page);

    // v-valid but shape-invalid: missing cycle.number.
    await page.evaluate(() =>
      localStorage.setItem(
        'material-breach:save',
        JSON.stringify({ v: 1, facility: { status: 'active' } }),
      ),
    );

    await page.reload();
    const dirty = await takeTitleScreenshot(page);

    assert.equal(Buffer.compare(clean, dirty) === 0, false, 'title screenshot stayed byte-identical');
    assert.equal(errs.length, 0, `page errors under corrupt save: ${errs.join(' | ')}`);

    // A second reload must recover without manual localStorage edits.
    await page.reload();
    await takeTitleScreenshot(page);
    assert.equal(errs.length, 0, `page errors under second reload: ${errs.join(' | ')}`);

    await ctx.close();
    await browser.close();
  },
);

test(
  'boot→render: corrupt save notice renders (unparseable JSON)',
  { skip: chromium ? false : 'playwright unavailable' },
  async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();

    const url = buildIfNeeded();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));

    await page.goto(url);
    const clean = await takeTitleScreenshot(page);

    await page.evaluate(() => localStorage.setItem('material-breach:save', '{{{ not json'));

    await page.reload();
    const dirty = await takeTitleScreenshot(page);

    assert.equal(Buffer.compare(clean, dirty) === 0, false, 'title screenshot stayed byte-identical');
    assert.equal(errs.length, 0, `page errors under corrupt save: ${errs.join(' | ')}`);

    await ctx.close();
    await browser.close();
  },
);


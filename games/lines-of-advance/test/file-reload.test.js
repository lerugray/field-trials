// D1 regression: loading the same save file twice must work, and a failed load
// must surface an error status. Root cause was clearing an out-of-scope fileInput.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createState,
  resetToCommsDrill,
  serializeState,
  parseState
} from '../src/state.js';
import { initTurnState } from '../src/turn.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MAIN_SRC = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');

test('D1: loadFromFile no longer references unbound fileInput', () => {
  const match = MAIN_SRC.match(/loadFromFile\(file\)\s*\{([\s\S]*?)\n    \},\n    saveLocal/);
  assert.ok(match, 'loadFromFile method present');
  assert.equal(
    match[1].includes('fileInput'),
    false,
    'loadFromFile must not touch panel-scoped fileInput (throws ReferenceError)'
  );
});

test('D1: change handler clears fileInput after capturing the File', () => {
  assert.match(
    MAIN_SRC,
    /fileInput\.addEventListener\('change',\s*async\s*\(e\)\s*=>\s*\{[\s\S]*?const file = e\.target\.files\[0\];[\s\S]*?fileInput\.value\s*=\s*'';[\s\S]*?await app\.loadFromFile\(file\)/
  );
});

test('D1: failed parse surfaces Load failed status text in source', () => {
  assert.match(MAIN_SRC, /Load failed: \$\{err\.message\}/);
  assert.match(MAIN_SRC, /Load failed: file could not be read\./);
});

test('D1: serialize/parse round-trip of comms drill is stable for reload fixture', () => {
  const state = initTurnState(resetToCommsDrill(createState()));
  const again = parseState(serializeState(state));
  assert.equal(again.preset, 'comms-drill');
  assert.equal(again.pieces.length, state.pieces.length);
});

async function loadPlaywright() {
  const candidates = [
    '/Users/rayweiss/Desktop/Dev Work/flattop-digital/node_modules/playwright/index.mjs',
    'playwright'
  ];
  for (const id of candidates) {
    try {
      return await import(id);
    } catch {
      // try next
    }
  }
  return null;
}

test('D1+B1 UI: same-file reload and click-attack under file://', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) {
    t.skip('playwright not available');
    return;
  }

  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'loa-d1-'));
  const dist = join(dir, 'index.html');
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.js')], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, LOA_BUILD_OUT: dist }
  });
  const savePath = join(dir, 'comms-drill.json');
  writeFileSync(savePath, serializeState(initTurnState(resetToCommsDrill(createState()))));

  let browser;
  try {
    browser = await pw.chromium.launch();
  } catch (error) {
    const details = String(error?.message || error);
    if (details.includes('MachPortRendezvousServer') && details.includes('Permission denied')) {
      t.skip('managed macOS sandbox denies Chromium Mach port registration');
      return;
    }
    throw error;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  try {
    await page.goto(pathToFileURL(dist).href);
    await page.waitForSelector('.board-svg');
    for (const label of ['Skip', 'Skip tour', 'Close', 'Got it', 'Dismiss']) {
      const b = page.locator(`button:has-text("${label}")`).first();
      if (await b.count() && await b.isVisible().catch(() => false)) {
        await b.click();
        break;
      }
    }

    // --- D1: load, clear, reload same file ---
    await page.setInputFiles('input.file-input', savePath);
    await page.waitForFunction(() => {
      const input = document.querySelector('input.file-input');
      return document.body.textContent.includes('Save file loaded.')
        && input
        && input.value === '';
    });

    await page.locator('button:has-text("Opening")').click();
    await page.waitForTimeout(150);
    await page.setInputFiles('input.file-input', savePath);
    await page.waitForFunction(() => {
      const input = document.querySelector('input.file-input');
      return document.body.textContent.includes('Save file loaded.')
        && input
        && input.value === '';
    });
    assert.ok(
      await page.locator('[data-coord="f18"]').count(),
      'comms-drill board restored on second load'
    );
    // Piece layer still has the isolated South infantry after reload.
    const pieceCount = await page.locator('.board-svg [data-id]').count();
    assert.equal(pieceCount, 4);

    // Failed load surfaces error + clears input.
    await page.setInputFiles('input.file-input', {
      name: 'bad.loa',
      mimeType: 'application/json',
      buffer: Buffer.from('{not-json')
    });
    await page.waitForFunction(() => {
      const input = document.querySelector('input.file-input');
      return document.body.textContent.includes('Load failed:')
        && input
        && input.value === '';
    });

    // --- B1: Comms Audit, select f17, click f18 → attack ---
    await page.locator('button:has-text("Comms Audit")').click();
    await page.waitForTimeout(200);
    await page.locator('[data-coord="f17"]').first().click();
    await page.waitForTimeout(100);
    const selectedBefore = await page.locator('.panel .card').first().textContent();
    assert.match(selectedBefore, /North/);
    await page.locator('[data-coord="f18"]').first().click();
    await page.waitForTimeout(150);
    const body = await page.locator('body').textContent();
    assert.match(body, /attack f18 destroyed/);
    const selectedAfter = await page.locator('.panel .card').first().textContent();
    assert.doesNotMatch(selectedAfter, /Side\s*South/, 'click-attack must not leave the enemy selected');
    assert.equal(
      pageErrors.some((m) => m.includes('fileInput is not defined')),
      false,
      `no fileInput ReferenceError; got: ${pageErrors.join(' | ')}`
    );
  } finally {
    await browser.close();
  }
});

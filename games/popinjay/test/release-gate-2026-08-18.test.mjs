import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { drawTitle } from '../src/render/title.js';
import { NATIVE, Painter, beginTextLayer, takeTextLayer, computeLetterbox } from '../src/render/px.js';
import { buildBundle } from '../scripts/build.js';

const ROOT = process.cwd();
const BODY_LINE_HEIGHT = 8.8;
const VIEWPORTS = [
  [900, 600],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1512, 860],
  [1920, 1080],
  [2560, 1440],
];

function titleTextQueue() {
  beginTextLayer({ skipNative: true });
  drawTitle({
    imageSmoothingEnabled: false,
    drawImage() {},
    save() {},
    restore() {},
    fillText() {},
  }, { w: 1280, h: 800, seed: 1, build: 'M7' });
  return takeTextLayer();
}

function freshArtifactUrl() {
  const dir = mkdtempSync(resolve(ROOT, '.tmp-release-gate-'));
  const out = resolve(dir, 'popinjay.html');
  writeFileSync(out, buildBundle().html);
  return { dir, url: pathToFileURL(out).href };
}

test('title footer body rows stay at least one real line-height apart and inside the native frame', () => {
  const q = titleTextQueue();
  const prompt = q.find((cmd) => cmd.s === 'PRESS ENTER TO BEGIN THE TOUR' && cmd.face === 'body');
  const credit = q.find((cmd) => cmd.s === 'EXPOSITION AMUSEMENTS CO.' && cmd.face === 'body');
  assert.ok(prompt, 'title prompt must be queued on the body text layer');
  assert.ok(credit, 'title credit row must be queued on the body text layer');
  assert.ok(credit.y - prompt.y >= BODY_LINE_HEIGHT,
    `footer rows need at least ${BODY_LINE_HEIGHT} native units; got ${credit.y - prompt.y}`);
  assert.ok(credit.y + BODY_LINE_HEIGHT <= NATIVE.h,
    `credit row bottom ${credit.y + BODY_LINE_HEIGHT} overruns native height ${NATIVE.h}`);
});

test('title footer layout leaves a positive pixel gap between the two center rows at every release viewport', async () => {
  const artifact = freshArtifactUrl();
  const q = titleTextQueue();
  const prompt = q.find((cmd) => cmd.s === 'PRESS ENTER TO BEGIN THE TOUR' && cmd.face === 'body');
  const credit = q.find((cmd) => cmd.s === 'EXPOSITION AMUSEMENTS CO.' && cmd.face === 'body');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      try {
        await page.goto(artifact.url, { waitUntil: 'load' });
        await page.waitForFunction('window.__popinjayReady === true', { timeout: 15000 });
        await page.waitForTimeout(800);
        const metrics = await page.evaluate(({ promptY, creditY }) => {
          const p = window.POPINJAY;
          const box = p.present;
          const canvas = document.getElementById('stage');
          const ctx = canvas.getContext('2d');
          ctx.save();
          ctx.font = `700 ${8.8 * box.scale}px "Popinjay Old Standard"`;
          ctx.textBaseline = 'top';
          const promptBox = ctx.measureText('PRESS ENTER TO BEGIN THE TOUR');
          const creditBox = ctx.measureText('EXPOSITION AMUSEMENTS CO.');
          ctx.restore();
          const promptTop = box.y + promptY * box.scale;
          const promptBottom = promptTop + Math.max(8.8 * box.scale,
            (promptBox.actualBoundingBoxAscent || 0) + (promptBox.actualBoundingBoxDescent || 0));
          const creditTop = box.y + creditY * box.scale;
          const creditBottom = creditTop + Math.max(8.8 * box.scale,
            (creditBox.actualBoundingBoxAscent || 0) + (creditBox.actualBoundingBoxDescent || 0));
          return {
            promptTop,
            promptBottom,
            creditTop,
            creditBottom,
            gapRows: Math.floor(creditTop) - Math.ceil(promptBottom),
            bottomSlack: Math.floor(box.y + box.h) - Math.ceil(creditBottom),
          };
        }, { promptY: prompt.y, creditY: credit.y });
        assert.ok(metrics.gapRows >= 1, `${w}x${h}: footer rows fused, gap rows ${metrics.gapRows}`);
        assert.ok(metrics.bottomSlack >= 1, `${w}x${h}: credit row overruns footer slack ${metrics.bottomSlack}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    rmSync(artifact.dir, { recursive: true, force: true });
  }
});

test('player-facing gate strings in the known release findings use ASCII punctuation instead of em dashes', () => {
  const app = readFileSync(resolve(ROOT, 'src/app.js'), 'utf8');
  const saves = readFileSync(resolve(ROOT, 'src/engine/saves.js'), 'utf8');
  const catalog = readFileSync(resolve(ROOT, 'src/sim/catalog.js'), 'utf8');
  assert.doesNotMatch(app, /ONE WIRE — WAIT RETURN/, 'denied-fire banner must not use an em dash');
  assert.doesNotMatch(saves, /SAVE VERSION MISMATCH — NEW RUN STARTED/, 'save-version notice must not use an em dash');
  assert.doesNotMatch(saves, /SAVE TRUNCATED — NEW RUN STARTED/, 'save-truncated notice must not use an em dash');
  assert.doesNotMatch(saves, /SAVE UNREADABLE — NEW RUN STARTED/, 'save-unreadable notice must not use an em dash');
  assert.doesNotMatch(catalog, /Two wire slots — both still walls\./, 'souvenir blurb must not use an em dash');
});

test('release viewport scalers preserve at least one device row of footer gap when the native gap is positive', () => {
  const q = titleTextQueue();
  const prompt = q.find((cmd) => cmd.s === 'PRESS ENTER TO BEGIN THE TOUR' && cmd.face === 'body');
  const credit = q.find((cmd) => cmd.s === 'EXPOSITION AMUSEMENTS CO.' && cmd.face === 'body');
  const nativeGap = credit.y - (prompt.y + BODY_LINE_HEIGHT);
  assert.ok(nativeGap > 0, `native footer gap must be positive, got ${nativeGap}`);
  for (const [w, h] of VIEWPORTS) {
    const box = computeLetterbox(w, h);
    const deviceGap = nativeGap * box.scale;
    assert.ok(deviceGap >= 1, `${w}x${h}: footer gap shrinks below one device row (${deviceGap})`);
  }
});

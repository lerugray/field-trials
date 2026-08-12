// proof-release-recheck.mjs — capture fork/progress-map carved-scrim overlays and the
// campaign-clear → true-restart flow from the shipped dist/index.html.
// Frames only; behavioral pass/fail is asserted in the sidecar JSON. Orchestrator judges visuals.
// Usage: node scripts/proof-release-recheck.mjs

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'proof', 'release-recheck-20260812');
const DIST = pathToFileURL(join(ROOT, 'dist', 'index.html')).href;

async function launchProofBrowser() {
  try { return await chromium.launch(); }
  catch (error) {
    const message = String(error?.message || error);
    if (!message.includes('MachPortRendezvousServer')) throw error;
    return chromium.launch({ args: ['--single-process', '--no-zygote'] });
  }
}

async function realKey(page, code, hold = 40) {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
  await page.waitForTimeout(200);
}

async function capture(page, name, scale = 3) {
  const path = join(OUT, name);
  if (existsSync(path)) throw new Error(`refusing to overwrite proof: ${path}`);
  const uri = await page.evaluate((s) => {
    const src = window.__logicalBuffer;
    const c = document.createElement('canvas');
    c.width = src.width * s;
    c.height = src.height * s;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, scale);
  writeFileSync(path, Buffer.from(uri.split(',')[1], 'base64'));
  return name;
}

async function snap(page) {
  return page.evaluate(() => ({
    mode: window.__mode(),
    index: window.__campaign.index,
    taken: [...window.__campaign.taken],
    choice: window.__campaign.choice,
    stageId: (() => { try { return window.__stage()?.def?.id ?? null; } catch { return null; } })(),
    playerX: (() => { try { return Math.round(window.__stage().player.x); } catch { return null; } })(),
    deaths: (() => { try { return window.__stage().deaths; } catch { return null; } })(),
  }));
}

mkdirSync(OUT, { recursive: true });
const report = { frames: [], behavior: {} };
const browser = await launchProofBrowser();
const ctx = await browser.newContext({ viewport: { width: 768, height: 720 } });
const page = await ctx.newPage();
await page.goto(DIST);
await page.waitForFunction(() => !!window.__stage, null, { timeout: 15000 });
await page.waitForTimeout(400);

/* --- Fork overlay (Stage-3 branch) — carved scrim FIX2 panel --- */
{
  await page.evaluate(() => {
    window.__campaign.index = 1;
    window.__campaign.choice = null;
    window.__toNext();
  });
  await page.waitForTimeout(400);
  report.behavior.fork = await snap(page);
  if (report.behavior.fork.mode !== 'fork') {
    throw new Error(`expected fork mode, got ${report.behavior.fork.mode}`);
  }
  report.frames.push(await capture(page, 'fork-scrim-overlay.png', 3));
}

/* --- Progress-map / campaign-clear carved scrim --- */
{
  await page.evaluate(() => {
    window.__campaign.index = window.__nodes.length - 1;
    window.__campaign.choice = null;
    window.__toNext();
  });
  await page.waitForTimeout(400);
  report.behavior.campaignClear = await snap(page);
  if (report.behavior.campaignClear.mode !== 'campaign-clear') {
    throw new Error(`expected campaign-clear, got ${report.behavior.campaignClear.mode}`);
  }
  report.frames.push(await capture(page, 'campaign-clear-progress-scrim.png', 3));
}

/* --- True restart: walk campaign with autosaves, then K → fresh Stage 1 --- */
{
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__stage, null, { timeout: 15000 });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    for (let g = 0; g < 12; g++) {
      if (window.__mode() === 'campaign-clear') break;
      if (window.__mode() === 'fork') window.__campaign.choice = 'left';
      window.__toNext();
    }
  });
  await page.waitForTimeout(300);
  report.behavior.beforeRestart = await snap(page);
  report.behavior.saveBeforeRestart = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('adversary.run')); }
    catch (e) { return { parseError: String(e) }; }
  });
  if (report.behavior.beforeRestart.mode !== 'campaign-clear') {
    throw new Error(`expected campaign-clear before restart, got ${report.behavior.beforeRestart.mode}`);
  }
  report.frames.push(await capture(page, 'true-restart-before-K.png', 3));

  await realKey(page, 'KeyK');
  await page.waitForTimeout(500);
  report.behavior.afterRestart = await snap(page);
  report.behavior.saveAfterRestart = await page.evaluate(() => localStorage.getItem('adversary.run'));
  report.frames.push(await capture(page, 'true-restart-after-K-stage1.png', 3));

  const after = report.behavior.afterRestart;
  const fail = [];
  if (after.mode !== 'play') fail.push(`mode=${after.mode}`);
  if (after.index !== 0) fail.push(`index=${after.index}`);
  if ((after.taken || []).length !== 0) fail.push(`taken=${JSON.stringify(after.taken)}`);
  if (after.choice != null) fail.push(`choice=${after.choice}`);
  // Stage 6 resurrection would land on a late node / high campaign index.
  if (after.index >= 5) fail.push('stage6-resurrection-suspected');
  report.behavior.trueRestartPass = fail.length === 0;
  report.behavior.trueRestartFailures = fail;
  if (fail.length) throw new Error(`true-restart behavioral fail: ${fail.join('; ')}`);
}

writeFileSync(join(OUT, 'behavior.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();

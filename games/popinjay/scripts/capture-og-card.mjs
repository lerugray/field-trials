// capture-og-card.mjs — shelf OG card at standard 1200×630 from the title screen.
// Run from repo root: node scripts/capture-og-card.mjs

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'docs/collateral/og-card.png');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const W = 1200;
const H = 630;

build();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(600);
const png = await page.screenshot({ type: 'png' });
writeFileSync(OUT, png);
await ctx.close();
await browser.close();
console.log(`[capture-og-card] ${OUT} (${W}x${H})`);

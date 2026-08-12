// shoot-m12 — the M12 item-1 proof grid: draws EVERY species in a mini creature
// window (same scale + recenter the main stage uses) with the window border
// visible, so the systematic recentering can be eyeballed across the whole
// roster — no species clips, each sits centred with margins. Dev tooling only.
//
// It bundles the render module the same way build-singlefile does (walk the
// relative-import graph, strip module syntax, concat into one inline module),
// appends a small draw routine, and screenshots the result in a real browser.

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/screenshots');
const DATE = process.argv[2] || 'undated';
const IMPORT_RE = /^\s*import\s+[^;]*?from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;

function stripModuleSyntax(src) {
  return src
    .replace(IMPORT_RE, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^(\s*)export\s+(?=(async\s+)?(function|const|let|var|class)\b)/gm, '$1');
}

async function bundle(entryRel) {
  const order = [];
  const seen = new Set();
  async function visit(abs) {
    if (seen.has(abs)) return;
    seen.add(abs);
    const src = await readFile(abs, 'utf8');
    let m;
    IMPORT_RE.lastIndex = 0;
    const deps = [];
    while ((m = IMPORT_RE.exec(src)) !== null) deps.push(resolve(dirname(abs), m[1]));
    for (const d of deps) await visit(d);
    order.push({ abs, src });
  }
  await visit(resolve(ROOT, entryRel));
  return order.map((o) => stripModuleSyntax(o.src).trim()).join('\n\n');
}

const DRAW = `
const canvas = document.getElementById('grid');
const ctx = canvas.getContext('2d');
const COLS = 9;
const TILE = 168, PAD = 8, LABEL = 16;
const rows = Math.ceil(SPECIES.length / COLS);
const W = COLS * TILE, H = rows * TILE;
canvas.width = W; canvas.height = H;
canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
ctx.fillStyle = '#0e1424'; ctx.fillRect(0, 0, W, H);
SPECIES.forEach((sp, i) => {
  const col = i % COLS, row = (i / COLS) | 0;
  const x = col * TILE + PAD, y = row * TILE + PAD;
  const w = TILE - PAD * 2, h = TILE - PAD * 2 - LABEL;
  // the window interior (same warm split as the real stage)
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#1C2A5E'); g.addColorStop(0.54, '#28406C');
  g.addColorStop(0.55, '#2A3A18'); g.addColorStop(1, '#243418');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const c = { species: sp, rarity: sp.rarity, variant: (i * 2654435761) >>> 0, seed: (i * 40503 + 7) >>> 0, age: 6 };
  ctx.save();
  ctx.translate(x, y);
  drawCreature(ctx, c, 0, { cx: w * 0.5, cy: h * 0.5, scale: Math.min(w, h) / 320, recenter: true, mood: { mouth: 'smile', eyes: 'open', brow: 0, bounce: 1 } });
  ctx.restore();
  // window frame + centre guide + label
  ctx.strokeStyle = '#6f86ff'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  ctx.fillStyle = '#cbd6ff'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(sp.name, x + w / 2, y + h + 12);
});
window.__done = true;
`;

async function run() {
  await mkdir(OUT, { recursive: true });
  const code = await bundle('src/render/creature.js') + '\n\n' + DRAW;
  const html = `<!doctype html><html><head><meta charset="utf8"><style>body{margin:0;background:#0e1424}</style></head><body><canvas id="grid"></canvas><script type="module">${code}<\/script></body></html>`;
  const tmp = resolve(ROOT, 'dist/_m12-grid.html');
  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  await writeFile(tmp, html, 'utf8');

  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForFunction('window.__done === true', { timeout: 5000 });
  const el = await page.$('#grid');
  await el.screenshot({ path: resolve(OUT, `${DATE}-m12-stage-center-grid.png`) });
  console.log('m12 grid written; console errors:', errors.length);
  await page.close();

  // --- the real app: prove the actual in-game stage window is recentred -------
  const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
  const app = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  app.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  app.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await app.goto(DIST);
  await app.waitForSelector('#scene');
  await app.waitForTimeout(400);
  const begin = await app.$('#title-begin');
  if (begin) { await begin.click(); await app.waitForTimeout(300); }
  await app.fill('#phrase', 'a jellyfish drifting in the tide');
  await app.click('#summon');
  await app.waitForSelector('#rename-pet');
  await app.waitForTimeout(400);
  const stage = await app.$('#stage');
  await stage.screenshot({ path: resolve(OUT, `${DATE}-m12-stage-window.png`) });
  console.log('m12 app stage written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 8));

  await browser.close();
  await rm(tmp, { force: true });
  process.exit(errors.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });

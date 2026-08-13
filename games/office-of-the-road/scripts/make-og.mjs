// Render the 1200x630 share card from THE OFFICE OF THE ROAD's SHIPPED assets:
// two licensed Willibab/Monsteretrope sideview battlers (Bailiff, Chirurgeon, and a
// road foe), one Pixel Tarot card, and the Retro Icons iconset — the same files
// scripts/build.js inlines into the single-file build. The palette and pixel font
// are the game's own (src/palette.js, src/pixel-font.js). No generated or borrowed
// art-law language is used.
//
// Usage: node scripts/make-og.mjs [output.png]

import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(process.argv[2] || resolve(ROOT, 'og.png'));
const TEMP = resolve(ROOT, 'dist/_og-card.html');
const IMPORT_RE = /^\s*import\s+[^;]*?from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;

// SHIPPED asset paths (same sources as scripts/build.js).
const SV_DIR = resolve(ROOT,
  'materials/art-packs/Simple-8-bit-Sideview-Battlers/Simple 8-bit Sideview Battlers/Simple 8-bit Sideview Battlers/Style 1/sv_actors');
const TAROT_DIR = resolve(ROOT, 'materials/art-packs/Pixel-Tarot');
const ICONSET_PATH = resolve(ROOT, "materials/art-packs/Willibab-s-Retro-Icons/Willibab's Retro Icons/Willibab's Retro Icons/Iconset.png");

const HERO_PNG = resolve(SV_DIR, 'HEDGE_KNIGHT_BROWN.png'); // Bailiff
const HERO2_PNG = resolve(SV_DIR, 'MYSTIC_GREEN.png');      // Chirurgeon
const ENEMY_PNG = resolve(SV_DIR, 'GHOUL_GREEN.png');       // road foe
const TAROT_PNG = resolve(TAROT_DIR, 'the_fool.png');       // the deck's instrument

function stripModuleSyntax(source) {
  return source
    .replace(IMPORT_RE, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^(\s*)export\s+(?=(async\s+)?(function|const|let|var|class)\b)/gm, '$1');
}

async function bundle(entries) {
  const ordered = [];
  const seen = new Set();

  async function visit(path) {
    if (seen.has(path)) return;
    seen.add(path);
    const source = await readFile(path, 'utf8');
    IMPORT_RE.lastIndex = 0;
    const dependencies = [];
    let match;
    while ((match = IMPORT_RE.exec(source)) !== null) {
      dependencies.push(resolve(dirname(path), match[1]));
    }
    for (const dependency of dependencies) await visit(dependency);
    ordered.push(source);
  }

  for (const entry of entries) await visit(resolve(ROOT, entry));
  return ordered.map((source) => stripModuleSyntax(source).trim()).join('\n\n');
}

const DRAW_CARD = `
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const BATTLER_SIZE = 144;
const TAROT_W = 57;
const TAROT_H = 79;
const ICON = 32;

function loadImage(src) {
  return new Promise((resolveImage, rejectImage) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = () => rejectImage(new Error('shipped asset failed to load'));
    image.src = src;
  });
}

function drawBattlerImg(img, x, y, size, flip) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(x + size, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, BATTLER_SIZE, BATTLER_SIZE, 0, 0, size, size);
  } else {
    ctx.drawImage(img, 0, 0, BATTLER_SIZE, BATTLER_SIZE, x, y, size, size);
  }
  ctx.restore();
}

function drawIconImg(img, cell, x, y, size) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cell.col * ICON, cell.row * ICON, ICON, ICON, x, y, size, size);
  ctx.restore();
}

function drawScaledText(text, yDevice, scale, color) {
  ctx.save();
  ctx.font = '14px ui-monospace, monospace'; // triggers pixel font scale = 2
  const width = pixelTextWidth(ctx, text) * scale;
  const xDevice = (1200 - width) / 2;
  ctx.translate(xDevice, yDevice);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  pixelText(ctx, text, 0, 0);
  ctx.restore();
}

// Background: the Office's ink page.
ctx.fillStyle = PALETTE.ink;
ctx.fillRect(0, 0, 1200, 630);

// Sparse register dither (faint paper on ink).
ctx.fillStyle = 'rgba(232,223,206,0.03)';
for (let y = 0; y < 630; y += 10) {
  for (let x = (y / 10 % 2) * 5; x < 1200; x += 10) ctx.fillRect(x, y, 2, 2);
}

// Title slab — warm panel with paper/rule bevels.
ctx.fillStyle = PALETTE.panel;
ctx.fillRect(48, 36, 1104, 218);
ctx.strokeStyle = PALETTE.edge;
ctx.lineWidth = 2;
ctx.strokeRect(48, 36, 1104, 218);
ctx.fillStyle = PALETTE.paper;
ctx.fillRect(48, 36, 1104, 4);
ctx.fillRect(48, 36, 4, 218);
ctx.fillStyle = PALETTE.rule;
ctx.fillRect(48, 250, 1104, 4);
ctx.fillRect(1148, 36, 4, 218);

// Title (Ray holds name veto; current provisional name).
drawScaledText('THE OFFICE OF THE ROAD', 84, 4, PALETTE.paper);

// One-line hook: <=12 words, no em-dashes.
drawScaledText('THE PARTY MARCHES; THE DESK DECIDES.', 182, 3, PALETTE.dim);

// Ground band for the cast.
ctx.fillStyle = PALETTE.panel2;
ctx.fillRect(0, 520, 1200, 110);
ctx.fillStyle = PALETTE.rule;
ctx.fillRect(0, 520, 1200, 2);

(async () => {
  const [hero1, hero2, enemy, tarot, iconset] = await Promise.all([
    loadImage(HERO_SRC),
    loadImage(HERO2_SRC),
    loadImage(ENEMY_SRC),
    loadImage(TAROT_SRC),
    loadImage(ICON_SRC),
  ]);

  // Party battlers (left), facing a road foe (right), from the same sv_actors
  // sheets the combat resolver draws.
  drawBattlerImg(hero1, 90, 280, 288, false);  // Bailiff
  drawBattlerImg(hero2, 340, 280, 288, false); // Chirurgeon
  drawBattlerImg(enemy, 850, 280, 288, true);  // Ghoul, mirrored to face the party

  // A played tarot card — the desk's instrument in combat.
  ctx.drawImage(tarot, 0, 0, TAROT_W, TAROT_H, 520, 330, TAROT_W * 3, TAROT_H * 3);

  // Pack iconography: the ledger's gold orb and the provision bag.
  drawIconImg(iconset, { col: 3, row: 9 }, 76, 560, 48);  // gold
  drawIconImg(iconset, { col: 14, row: 7 }, 1060, 560, 48); // supplies

  window.__oorOgReady = true;
})().catch((error) => {
  window.__oorOgError = String(error && error.message || error);
});
`;

async function main() {
  await mkdir(dirname(OUTPUT), { recursive: true });
  await mkdir(dirname(TEMP), { recursive: true });

  const source = await bundle([
    'src/palette.js',
    'src/pixel-font.js',
  ]);

  const toData = async (path) => `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
  const heroData = await toData(HERO_PNG);
  const hero2Data = await toData(HERO2_PNG);
  const enemyData = await toData(ENEMY_PNG);
  const tarotData = await toData(TAROT_PNG);
  const iconData = await toData(ICONSET_PATH);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0d0b0a}
canvas{display:block;width:1200px;height:630px}
</style></head><body><canvas width="1200" height="630"></canvas>
<script type="module">
const HERO_SRC = ${JSON.stringify(heroData)};
const HERO2_SRC = ${JSON.stringify(hero2Data)};
const ENEMY_SRC = ${JSON.stringify(enemyData)};
const TAROT_SRC = ${JSON.stringify(tarotData)};
const ICON_SRC = ${JSON.stringify(iconData)};
${source}\n${DRAW_CARD}<\/script></body></html>`;
  await writeFile(TEMP, html, 'utf8');

  let browser;
  try {
    try { browser = await chromium.launch(); }
    catch (error) {
      const message = String(error?.message || error);
      if (!message.includes('MachPortRendezvousServer')) throw error;
      browser = await chromium.launch({ args: ['--single-process', '--no-zygote'] });
    }
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(TEMP).href);
    await page.waitForFunction('window.__oorOgReady === true || window.__oorOgError');
    const ogError = await page.evaluate('window.__oorOgError || null');
    if (ogError) throw new Error(ogError);
    await page.locator('canvas').screenshot({ path: OUTPUT });
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    if (browser) await browser.close();
    await rm(TEMP, { force: true });
  }

  console.log(`wrote ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

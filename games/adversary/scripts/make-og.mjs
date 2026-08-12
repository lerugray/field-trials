// Render the 1200x630 share card from ADVERSARY's SHIPPED cast: the Ray-certified
// Variant B paint-over hero + a licensed Admurin pack enemy (both read from
// assets/art/, the same files the game embeds) + live chrome sprites (MARKER) and the
// game's palette/pixel font. NEVER blit the superseded code-drawn cast from
// sprites.js onto promotional surfaces — those survive only as asset-load fallbacks
// (see the SUPERSEDED-AS-CAST note in src/render/sprites.js; 2026-08-12 incident).
// Usage: node scripts/make-og.mjs [output.png]

import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(process.argv[2] || resolve(ROOT, 'og.png'));
const TEMP = resolve(ROOT, 'dist/_og-card.html');
const IMPORT_RE = /^\s*import\s+[^;]*?from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;

// Shipped cast sources (frame 0 of each strip; dims from assets/art/MANIFEST.json).
const HERO_PNG = resolve(ROOT, 'assets/art/player_bareheaded_idle.png'); // 10x 48x48, canonical LEFT
const ENEMY_PNG = resolve(ROOT, 'assets/art/enemy_walker_bones_gladiator_idle.png'); // 4x 58x38, faces RIGHT

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

// Night sky → stone mid → umber ground. ADVERSARY's dark gothic register.
ctx.fillStyle = PALETTE['2'];
ctx.fillRect(0, 0, 1200, 630);
ctx.fillStyle = PALETTE['3'];
ctx.fillRect(0, 0, 1200, 220);
ctx.fillStyle = PALETTE['1'];
ctx.fillRect(0, 220, 1200, 210);
ctx.fillStyle = PALETTE['9'];
ctx.fillRect(0, 430, 1200, 200);
ctx.fillStyle = PALETTE['m'];
ctx.fillRect(0, 500, 1200, 130);

// Sparse stone dither (register, not decoration noise).
ctx.fillStyle = 'rgba(255,255,255,0.03)';
for (let y = 0; y < 430; y += 10) {
  for (let x = (y / 10 % 2) * 5; x < 1200; x += 10) ctx.fillRect(x, y, 2, 2);
}

// Carved title slab — same family as the in-game opaque scrim panels.
ctx.fillStyle = PALETTE['0'];
ctx.fillRect(64, 52, 1072, 196);
ctx.fillStyle = PALETTE['1'];
ctx.fillRect(52, 40, 1072, 196);
ctx.fillStyle = PALETTE['6'];
ctx.fillRect(52, 40, 1072, 5);
ctx.fillRect(52, 40, 5, 196);
ctx.fillStyle = PALETTE['8'];
ctx.fillRect(52, 231, 1072, 5);
ctx.fillRect(1119, 40, 5, 196);

const title = 'ADVERSARY';
const titleScale = 14;
const titleWidth = textWidth(title, titleScale);
drawPixelText(ctx, title, (1200 - titleWidth) / 2, 78, PALETTE['5'], titleScale);

const line = 'SIX STAGES  DEATH RISKS XP  GEAR IS SAFE';
const lineScale = 4;
const lineWidth = textWidth(line, lineScale);
drawPixelText(ctx, line, (1200 - lineWidth) / 2, 178, PALETTE.c, lineScale);

function blitSprite(sprite, destX, destY, scale) {
  const rgba = rasterize(sprite);
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const i = (y * sprite.w + x) * 4;
      const a = rgba[i + 3];
      if (!a) continue;
      ctx.fillStyle = \`rgba(\${rgba[i]},\${rgba[i + 1]},\${rgba[i + 2]},\${a / 255})\`;
      ctx.fillRect(destX + x * scale, destY + y * scale, scale, scale);
    }
  }
}

function loadImage(src) {
  return new Promise((resolveImage, rejectImage) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = () => rejectImage(new Error('cast image failed to load'));
    image.src = src;
  });
}

// Draws frame 0 of a strip, optionally mirrored so the figure faces the card center.
function drawCastFrame(image, frameW, frameH, destX, destY, scale, mirror) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (mirror) {
    ctx.translate(destX + frameW * scale, destY);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, frameW, frameH, 0, 0, frameW * scale, frameH * scale);
  } else {
    ctx.drawImage(image, 0, 0, frameW, frameH, destX, destY, frameW * scale, frameH * scale);
  }
  ctx.restore();
}

// SHIPPED cast: certified hero (canonical-left source, mirrored to face the field)
// and the Admurin bones-gladiator (right-facing source, mirrored to face the hero).
// MARKER is the game's live waypoint sprite (still canon chrome).
(async () => {
  const [hero, enemy] = await Promise.all([loadImage(HERO_SRC), loadImage(ENEMY_SRC)]);
  drawCastFrame(hero, 48, 48, 170, 330, 6, true);
  blitSprite(MARKER, 560, 420, 10);
  drawCastFrame(enemy, 58, 38, 850, 400, 5, true);
  window.__adversaryOgReady = true;
})().catch((error) => {
  window.__adversaryOgError = String(error && error.message || error);
});
`;

async function main() {
  await mkdir(dirname(OUTPUT), { recursive: true });
  await mkdir(dirname(TEMP), { recursive: true });

  const source = await bundle([
    'src/render/palette.js',
    'src/render/pixelfont.js',
    'src/render/sprite.js',
    'src/render/sprites.js',
  ]);
  const heroData = `data:image/png;base64,${(await readFile(HERO_PNG)).toString('base64')}`;
  const enemyData = `data:image/png;base64,${(await readFile(ENEMY_PNG)).toString('base64')}`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#14151e}
canvas{display:block;width:1200px;height:630px}
</style></head><body><canvas width="1200" height="630"></canvas>
<script type="module">
const HERO_SRC = ${JSON.stringify(heroData)};
const ENEMY_SRC = ${JSON.stringify(enemyData)};
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
    await page.waitForFunction('window.__adversaryOgReady === true || window.__adversaryOgError');
    const castError = await page.evaluate('window.__adversaryOgError || null');
    if (castError) throw new Error(castError);
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

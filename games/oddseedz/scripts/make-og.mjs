// Render the 1200x630 share card from Oddseedz's shipped creature and type code.
// Usage: node scripts/make-og.mjs [output.png]

import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(process.argv[2] || resolve(ROOT, 'og.png'));
const TEMP = resolve(ROOT, 'dist/_og-card.html');
const IMPORT_RE = /^\s*import\s+[^;]*?from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;

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

// Sun-Disk Chrome backdrop: the same hard navy bands and warm stage used in-game.
ctx.fillStyle = PALETTE.bgBandLo;
ctx.fillRect(0, 0, 1200, 630);
ctx.fillStyle = PALETTE.bgBandHi;
ctx.fillRect(0, 88, 1200, 174);
ctx.fillStyle = '#16234f';
ctx.fillRect(0, 262, 1200, 168);
ctx.fillStyle = PALETTE.creatureFloor;
ctx.fillRect(0, 430, 1200, 200);

// Sparse register dither.
ctx.fillStyle = 'rgba(255,255,255,0.035)';
for (let y = 0; y < 430; y += 12) {
  for (let x = (y / 12 % 2) * 6; x < 1200; x += 12) ctx.fillRect(x, y, 2, 2);
}

// Hard-edged title window and offset shadow.
ctx.fillStyle = PALETTE.shadow;
ctx.fillRect(61, 55, 1078, 208);
ctx.fillStyle = PALETTE.headerBand;
ctx.fillRect(52, 46, 1078, 208);
ctx.fillStyle = PALETTE.headerBevelLight;
ctx.fillRect(52, 46, 1078, 6);
ctx.fillRect(52, 46, 6, 208);
ctx.fillStyle = PALETTE.headerBevelDark;
ctx.fillRect(52, 248, 1078, 6);
ctx.fillRect(1124, 46, 6, 208);

const title = 'ODDSEEDZ';
const titleScale = 16;
const titleWidth = measure(title, { scale: titleScale }).width;
drawText(ctx, title, (1200 - titleWidth) / 2, 75, {
  scale: titleScale,
  color: PALETTE.headerText,
});

const loop = 'SUMMON  RAISE  RETIRE  INHERIT';
const loopScale = 4;
const loopWidth = measure(loop, { scale: loopScale }).width;
drawText(ctx, loop, (1200 - loopWidth) / 2, 205, {
  scale: loopScale,
  color: PALETTE.accentGold,
});

// Certified roster drawings, with the same deterministic creature objects used
// by the codex and proof grids.
const ids = ['parrot', 'joe-camel', 'frog', 'dragon', 'octopus'];
const xs = [130, 360, 600, 840, 1070];
ids.forEach((id, index) => {
  const species = SPECIES_BY_ID.get(id);
  const creature = {
    species,
    rarity: species.rarity,
    variant: ((index + 3) * 2654435761) >>> 0,
    seed: ((index + 11) * 40503 + 7) >>> 0,
    age: 6,
  };
  drawCreature(ctx, creature, 0, {
    cx: xs[index],
    cy: 455,
    scale: index === 2 ? 1.18 : 1.08,
    recenter: true,
    mood: { mouth: 'smile', eyes: 'open', brow: 0, bounce: 1 },
  });
});

window.__oddseedzOgReady = true;
`;

async function main() {
  await mkdir(dirname(OUTPUT), { recursive: true });
  await mkdir(dirname(TEMP), { recursive: true });

  const source = await bundle([
    'src/render/creature.js',
    'src/render/font.js',
    'src/render/palette.js',
  ]);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#101a3c}
canvas{display:block;width:1200px;height:630px}
</style></head><body><canvas width="1200" height="630"></canvas>
<script type="module">${source}\n${DRAW_CARD}<\/script></body></html>`;
  await writeFile(TEMP, html, 'utf8');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(TEMP).href);
    await page.waitForFunction('window.__oddseedzOgReady === true');
    await page.locator('canvas').screenshot({ path: OUTPUT });
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    await browser.close();
    await rm(TEMP, { force: true });
  }

  console.log(`wrote ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

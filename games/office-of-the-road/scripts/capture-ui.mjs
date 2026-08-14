// capture-ui.mjs — capture every player-visible screen at native 1× and at 2×,
// from the SHIPPED single-file build, into one dated verification directory.
//
//   node scripts/capture-ui.mjs [outDirName] [--tag=lex] [--only=shop,march,...]
//
// --tag inserts a round label into every filename (shop-lex-1x.png), so a fix
// round never overwrites the frames the previous one was judged on. --only
// narrows the run to the surfaces a round actually touched.
//
// 1× frames are the honest raster (exactly the pixels the game draws); the 2×
// frames are the same pixels nearest-neighbour doubled, which is how a reviewer
// actually reads a 320×200 screen. Both are written for every state so a look
// pass can check composition at 2× and pixel placement at 1×.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist/office-of-the-road.html');

const STATES = [
  ['title', 'fresh=1&title=1'],
  ['howto', 'fresh=1&howto=1'],
  ['howto-p2', 'fresh=1&howto=1'],
  ['march', 'fresh=1&ticks=30&paused=1'],
  ['combat', 'fresh=1&ticks=400&beats=6'],
  ['draft', 'fresh=1&ticks=400&beats=200'],
  ['camp', 'fresh=1&paused=1&camp=1'],
  ['route', 'fresh=1&paused=1&route=1'],
  ['shop', 'fresh=1&shop=1'],
  // The quartermaster's party column reports a DIFFERENT set of figures once an
  // item is under focus or hover, so the focused board is its own surface.
  ['shop-focus-buy', 'fresh=1&shop=1&shopfocus=buy0'],
  ['shop-focus-inv', 'fresh=1&shop=1&shopfocus=inv0'],
  ['shop-focus-slot', 'fresh=1&shop=1&shopfocus=slot0arm'],
  ['deck', 'fresh=1&deck=1'],
  ['docket', 'fresh=1&asdocket=1'],
  ['intake', 'fresh=1&intake=1'],
  ['defeat', 'fresh=1&dead=1'],
  ['credits', 'fresh=1&intake=1'], // reached by clicking CREDITS on intake
];

/** Read the native 320×200 buffer straight out of the game, not off the screen. */
const GRAB = `(() => {
  const c = document.querySelector('canvas#stage');
  const off = document.createElement('canvas');
  off.width = 320; off.height = 200;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(window.__office.buffer || c, 0, 0, 320, 200);
  return off.toDataURL('image/png');
})()`;

const SCALE = (n) => `(() => {
  const src = new Image();
  return new Promise((res) => {
    src.onload = () => {
      const off = document.createElement('canvas');
      off.width = 320 * ${n}; off.height = 200 * ${n};
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(src, 0, 0, off.width, off.height);
      res(off.toDataURL('image/png'));
    };
    src.src = window.__lastGrab;
  });
})()`;

async function main() {
  const args = process.argv.slice(2);
  const outName = args.find((a) => !a.startsWith('--')) || 'ui-overhaul';
  const tagArg = args.find((a) => a.startsWith('--tag='));
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const tag = tagArg ? '-' + tagArg.slice(6) : '';
  const only = onlyArg ? new Set(onlyArg.slice(7).split(',').filter(Boolean)) : null;
  const OUT = resolve(ROOT, 'docs/verification', outName);
  mkdirSync(OUT, { recursive: true });
  execFileSync('node', [resolve(ROOT, 'scripts/build.js')], { cwd: ROOT, stdio: 'inherit' });
  if (!existsSync(DIST)) throw new Error('no dist build');

  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const url = pathToFileURL(DIST).href;
  const written = [];

  for (const [label, query] of STATES) {
    if (only && !only.has(label)) continue;
    await page.goto(`${url}?${query}`);
    await page.waitForTimeout(600);
    if (label === 'howto-p2') {
      // Focus opens on NEXT (page 1 has no PREV), so Enter alone turns the page.
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
    }
    if (label === 'credits') {
      // Credits has no deep-link; reach it the way a player does.
      const box = await page.locator('#stage').boundingBox();
      const scale = Number(await page.locator('#stage').getAttribute('data-scale'));
      await page.mouse.click(box.x + (238 + 33) * scale, box.y + (176 + 8) * scale);
      await page.waitForTimeout(300);
    }
    const data = await page.evaluate(GRAB);
    await page.evaluate((d) => { window.__lastGrab = d; }, data);
    const x2 = await page.evaluate(SCALE(2));
    for (const [suffix, uri] of [['1x', data], ['2x', x2]]) {
      const file = resolve(OUT, `${label}${tag}-${suffix}.png`);
      writeFileSync(file, Buffer.from(uri.split(',')[1], 'base64'));
      written.push(`${label}${tag}-${suffix}.png`);
    }
  }

  await browser.close();
  console.log(`[capture-ui] ${written.length} frames -> docs/verification/${outName}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });

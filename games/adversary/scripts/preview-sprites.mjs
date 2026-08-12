// preview-sprites.mjs — dev-only: rasterize every sprite in Node, inline the pixels into a page, and
// screenshot them scaled up so the M12-ART sprites can be eyeballed headlessly. Not a proof.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import * as S from '../src/render/sprites.js';
import { PALETTE } from '../src/render/palette.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['PLAYER_R','WALKER_R','HOPPER_R','BOSS_R','TILE_GRASS','TILE_DIRT','CHECKPOINT','MARKER','UNLOCK','DROP_HEAL'];
const data = names.map((n) => {
  const spr = S[n];
  const px = [];
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
    const hex = PALETTE[spr.rows[y][x]];
    if (hex != null) px.push([x, y, hex]);
  }
  return { name: n.replace('_R', ''), w: spr.w, h: spr.h, px };
});

const html = `<!doctype html><meta charset=utf8><body style="margin:0;background:#101018">
<canvas id=c width=780 height=340></canvas>
<script>
const data = ${JSON.stringify(data)};
const ctx = document.getElementById('c').getContext('2d');
ctx.imageSmoothingEnabled = false; ctx.font='10px monospace';
const scale=5; let x=8;
for (const d of data){
  const y=26;
  for (const [px,py,hex] of d.px){ ctx.fillStyle=hex; ctx.fillRect(x+px*scale, y+py*scale, scale, scale); }
  ctx.fillStyle='#fff'; ctx.fillText(d.name, x, 16);
  x += d.w*scale + 14;
}
</script></body>`;
const tmp = join(ROOT, 'runs', 'preview.html');
writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(tmp).href);
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/sprite-preview.png' });
await browser.close();
console.log('wrote /tmp/sprite-preview.png');

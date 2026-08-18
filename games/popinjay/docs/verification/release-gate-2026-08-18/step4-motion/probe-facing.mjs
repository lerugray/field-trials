// STEP 4 (facing) — the moonwalk check, cropped with the CORRECT world->native mapping.
// VIEW is 1280x800 and NATIVE is 480x300, so native = world * 0.375. The earlier strip
// used /4 and cropped empty plaza; this one is anchored on the player every frame.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const K = 480 / 1280; // world -> native
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
await p.goto(URL, { waitUntil: 'load' }); await p.waitForFunction('window.__popinjayReady === true');
await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
const log = {};
async function run(name, hold, frames = 8) {
  const tiles = [], data = [];
  if (hold) await p.keyboard.down(hold);
  for (let i = 0; i < frames; i++) {
    const s = await p.evaluate((k) => { const P = window.POPINJAY, pr = P.probe(), pres = P.present;
      return { x: pr.x ?? pr.playerX, feetY: pr.feetY, tick: pr.tick, pres }; }, K);
    const sc = s.pres.scale;
    const nx = s.x * K, ny = s.feetY * K;
    const cx = s.pres.x + nx * sc, cy = s.pres.y + ny * sc;
    const clip = { x: Math.max(0, Math.round(cx - 26 * sc)), y: Math.max(0, Math.round(cy - 34 * sc)), width: Math.round(52 * sc), height: Math.round(40 * sc) };
    tiles.push((await p.screenshot({ clip })).toString('base64'));
    data.push({ tick: s.tick, x: +s.x.toFixed(1), nativeX: +nx.toFixed(1) });
    await p.waitForTimeout(95);
  }
  if (hold) await p.keyboard.up(hold);
  const png = await p.evaluate(async (imgs) => {
    const im0 = new Image(); await new Promise(r => { im0.onload = r; im0.src = 'data:image/png;base64,' + imgs[0]; });
    const W = im0.width, H = im0.height, Z = 3;
    const cv = document.createElement('canvas'); cv.width = (W * Z + 8) * imgs.length; cv.height = H * Z + 20;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < imgs.length; i++) { const im = new Image();
      await new Promise(r => { im.onload = r; im.src = 'data:image/png;base64,' + imgs[i]; });
      g.drawImage(im, 0, 0, im.width, im.height, i * (W * Z + 8), 18, W * Z, H * Z);
      g.fillStyle = '#ff2255'; g.font = '13px monospace'; g.fillText('f' + i, i * (W * Z + 8) + 4, 13); }
    return cv.toDataURL('image/png').split(',')[1];
  }, tiles);
  writeFileSync(`${HERE}/${name}.png`, Buffer.from(png, 'base64'));
  log[name] = { frames: data, netTravel: +(data[data.length - 1].x - data[0].x).toFixed(1) };
}
await run('FACING-A-walk-right', 'ArrowRight');
await p.waitForTimeout(400);
await run('FACING-B-walk-left', 'ArrowLeft');
await p.waitForTimeout(400);
await p.evaluate(() => window.POPINJAY.startStageAt(1, 3));
await p.waitForTimeout(600);
await run('FACING-C-climb', 'ArrowUp');
await c.close(); await b.close();
writeFileSync(`${HERE}/facing.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));

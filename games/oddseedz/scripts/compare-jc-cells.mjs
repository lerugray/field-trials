// compare-jc-cells — pixel-compare Rat/Dragon/Parrot cells between the M13CC
// grid (certified baseline) and the new JC grid. Only Joe Camel should differ.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/screenshots');

const BASE = resolve(OUT, '20260809-m13cc-recognizability-grid.png');
const NEW = resolve(OUT, '20260809-jc-recognizability-grid.png');

// SPECIES indices in the recognizability grid (COLS=10, TILE=144, PAD=8, LABEL=18)
const CHECKS = [
  { name: 'Rat', idx: 11 },
  { name: 'Parrot', idx: 27 },
  { name: 'Dragon', idx: 39 },
  { name: 'Joe Camel', idx: 41 },
];
const COLS = 10;
const TILE = 144;
const PAD = 8;
const LABEL = 18;

function cellBox(idx) {
  const col = idx % COLS;
  const row = (idx / COLS) | 0;
  // screenshots are taken at deviceScaleFactor=2
  const s = 2;
  const x = (col * TILE + PAD) * s;
  const y = (row * TILE + PAD) * s;
  const w = (TILE - PAD * 2) * s;
  const h = (TILE - PAD * 2 - LABEL) * s;
  return { x, y, w, h };
}

function toBase64(buf) {
  return Buffer.from(buf).toString('base64');
}

async function run() {
  const [baseBuf, newBuf] = await Promise.all([readFile(BASE), readFile(NEW)]);
  const base64Base = toBase64(baseBuf);
  const base64New = toBase64(newBuf);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const results = await page.evaluate(
    ({ base64Base, base64New, checks }) => {
      function dataUrl(b64) {
        return `data:image/png;base64,${b64}`;
      }

      function cellBox(idx) {
        const col = idx % 10;
        const row = (idx / 10) | 0;
        const s = 2;
        const x = (col * 144 + 8) * s;
        const y = (row * 144 + 8) * s;
        const w = (144 - 16) * s;
        const h = (144 - 16 - 18) * s;
        return { x, y, w, h };
      }

      async function load(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('failed to load image'));
          img.src = src;
        });
      }

      async function cellPixels(img, box) {
        const cv = document.createElement('canvas');
        cv.width = box.w;
        cv.height = box.h;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
        return ctx.getImageData(0, 0, box.w, box.h).data;
      }

      return (async () => {
        const [imgBase, imgNew] = await Promise.all([load(dataUrl(base64Base)), load(dataUrl(base64New))]);
        const out = [];
        for (const c of checks) {
          const box = cellBox(c.idx);
          const d1 = await cellPixels(imgBase, box);
          const d2 = await cellPixels(imgNew, box);
          let diff = 0;
          for (let i = 0; i < d1.length; i += 4) {
            if (d1[i] !== d2[i] || d1[i + 1] !== d2[i + 1] || d1[i + 2] !== d2[i + 2] || d1[i + 3] !== d2[i + 3]) {
              diff++;
            }
          }
          out.push({ name: c.name, idx: c.idx, pixels: d1.length / 4, diff });
        }
        return out;
      })();
    },
    { base64Base, base64New, checks: CHECKS },
  );

  await browser.close();

  let fail = false;
  for (const r of results) {
    const status = r.diff === 0 ? 'IDENTICAL' : `${r.diff}/${r.pixels} pixels differ`;
    console.log(`${r.name} (idx ${r.idx}): ${status}`);
    if (r.name !== 'Joe Camel' && r.diff !== 0) fail = true;
    if (r.name === 'Joe Camel' && r.diff === 0) fail = true;
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });

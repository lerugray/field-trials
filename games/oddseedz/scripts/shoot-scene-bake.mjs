// shoot-scene-bake — renders the baked static scenes (no creatures) at the real
// in-game buffer sizes and screenshots them. This is the tuning loop for the art
// migration: the scenes are pure painting, so they bake in node and only need a
// browser to be looked at. Dev tooling only.

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LitPainter } from '../src/render/lit.js';
import {
  toyRoomLayout, drawToyRoom, tournamentLayout, drawTournament, meadowLayout, drawMeadow,
} from '../src/render/scene.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/art-poc-2026-08-10/migration-proofs');
const LABEL = process.argv[2] || 'bake';

const SCENES = [
  ['toyroom', 429, 230, 2, (p, w, h) => drawToyRoom(p, toyRoomLayout(w, h))],
  ['tournament', 377, 150, 2, (p, w, h) => drawTournament(p, tournamentLayout(w, h))],
  ['meadow', 407, 190, 2, (p, w, h) => drawMeadow(p, meadowLayout(w, h))],
];

async function run() {
  await mkdir(OUT, { recursive: true });
  const blocks = SCENES.map(([name, w, h, s, fn]) => {
    const p = new LitPainter(w, h);
    fn(p, w, h);
    return `<figure><figcaption>${name} ${w}x${h} @${s}x</figcaption>
      <canvas id="c-${name}" width="${w}" height="${h}" style="width:${w * s}px;height:${h * s}px"></canvas>
      <script>(function(){
        var d=[${Array.from(p.d).join(',')}];
        var c=document.getElementById('c-${name}'),x=c.getContext('2d');
        var im=x.createImageData(${w},${h}); im.data.set(d); x.putImageData(im,0,0);
      })();<\/script></figure>`;
  }).join('\n');

  const html = `<!doctype html><meta charset="utf8"><style>
    body{margin:0;background:#0b0f1c;font:12px system-ui;color:#cbd6ff;padding:12px}
    figure{margin:0 0 16px}figcaption{margin-bottom:4px;letter-spacing:1px}
    canvas{display:block;image-rendering:pixelated}
  </style>${blocks}`;

  const tmp = resolve(ROOT, 'dist/_scene-bake.html');
  await writeFile(tmp, html, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForTimeout(250);
  for (const [name] of SCENES) {
    const el = await page.$(`#c-${name}`);
    await el.screenshot({ path: resolve(OUT, `${LABEL}-${name}.png`) });
    console.log('shot', name);
  }
  await browser.close();
  await rm(tmp, { force: true });
  console.log('errors:', errs.length, errs.slice(0, 4));
}

run().catch((e) => { console.error(e); process.exit(1); });

// before-after.mjs — composite BEFORE/AFTER pairs for the art migration.
//
// Pairs the newest proof for a scene with a named earlier one and stacks them into a
// single labelled sheet, so a reviewer sees the change in one image instead of
// flipping between files. Uses the browser (already a dev dependency for proofs) to
// decode + compose; writes into proofs/before-after/.
//
//   node scripts/before-after.mjs --before=20260810-085309

import { chromium } from 'playwright';
import { readdirSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PROOFS = resolve(ROOT, 'proofs');
const OUT = resolve(PROOFS, 'before-after');

// The migration landed in two rounds, so a scene's BEFORE depends on which round
// changed it. The WORLD round (vistas, gameplay, HUD, title art) is measured against
// the pre-migration set; the OVERLAY round against the set taken after the world
// round, when these surfaces were the last vector-over-pixel layer left. An entry may
// carry its own before-stamp and captions; anything unset falls back to the CLI
// --before and the world-round captions.
const WORLD_CAPTIONS = ['BEFORE — flat vector fills', 'AFTER — native 480x300, lit + dithered'];
const OVERLAY_CAPTIONS = ['BEFORE — vector text and hairlines over a pixel frame',
  'AFTER — one artifact: painted into the same 480x300 buffer'];
const OVERLAY_BEFORE = '20260810-132553';

const SCENES = [
  ['M5-vista1', 'LOCALE 1 — EMERALD MIDWAY'],
  ['M5-vista2', 'LOCALE 2 — THE WINDWARD PIER'],
  ['M5-vista3', 'LOCALE 3 — SUNSET IRONWORKS'],
  ['M0-title', 'TITLE CARD'],
  ['M3-hit', 'GAMEPLAY — HIT + CULPRIT STAMP'],
  ['M4-gore', 'GAMEPLAY — WEIGHTED GORES'],
  ['M4-draft', 'THE DRAFT', OVERLAY_BEFORE, OVERLAY_CAPTIONS],
  ['M4-scorecard', 'THE PRIZE COUNTER', OVERLAY_BEFORE, OVERLAY_CAPTIONS],
  ['M4-tourmap', 'THE TOUR MAP', OVERLAY_BEFORE, OVERLAY_CAPTIONS],
  ['M6-options', 'OPTIONS', OVERLAY_BEFORE, OVERLAY_CAPTIONS],
  ['M6-pause', 'THE PAUSE MENU', OVERLAY_BEFORE, OVERLAY_CAPTIONS],
];
const VP = '1440x900@1x';

function pick(prefix, stamp) {
  const all = readdirSync(PROOFS).filter((f) => f.startsWith(`${prefix}_${VP}_`) && f.endsWith('.png'));
  if (!all.length) return null;
  if (stamp) { const m = all.find((f) => f.includes(stamp)); if (m) return m; }
  return all.sort().at(-1);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--'))
    .map((a) => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
  const beforeStamp = args.before ? String(args.before) : null;
  if (!beforeStamp) { console.error('need --before=<timestamp> (a proof stamp taken before the migration)'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1320 }, deviceScaleFactor: 1 });
  let n = 0;
  for (const [prefix, title, sceneBefore, captions] of SCENES) {
    const stamp = sceneBefore || beforeStamp;
    const [capBefore, capAfter] = captions || WORLD_CAPTIONS;
    const before = pick(prefix, stamp);
    const after = readdirSync(PROOFS)
      .filter((f) => f.startsWith(`${prefix}_${VP}_`) && f.endsWith('.png') && !f.includes(stamp))
      .sort().at(-1);
    if (!before || !after || before === after) { console.log(`  skip ${prefix} (need both a before and an after)`); continue; }

    // Inline as data URIs: a page created with setContent has an about:blank origin
    // and Chromium refuses to load file:// subresources into it, which silently
    // yields two broken-image icons instead of the comparison.
    const dataURI = (f) => 'data:image/png;base64,' + readFileSync(resolve(PROOFS, f)).toString('base64');
    const html = `<style>
      html,body{margin:0;background:#171310;font:600 13px ui-monospace,Menlo,monospace;color:#e7c76b}
      .h{padding:10px 14px 6px;font-size:15px;letter-spacing:.08em;color:#f2e4c4}
      .l{padding:4px 14px;color:#8b7248;letter-spacing:.14em}
      img{display:block;width:960px;margin:0 14px;image-rendering:pixelated;border:1px solid #3a2c18}
      .sp{height:10px}
    </style>
    <div class="h">${title}</div>
    <div class="l">${capBefore}</div><img src="${dataURI(before)}">
    <div class="sp"></div>
    <div class="l">${capAfter}</div><img src="${dataURI(after)}">`;
    await page.setContent(html);
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
    const file = resolve(OUT, `${prefix}-before-after.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ${prefix}: ${before}  ->  ${after}`);
    n++;
  }
  await browser.close();
  console.log(`[before-after] ${n} sheet(s) in proofs/before-after/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

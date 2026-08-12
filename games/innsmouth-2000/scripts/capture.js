// Proof-capture harness for INNSMOUTH 2000 (hard rule 5).
//
// Loads the BUILT single-file artifact (dist/innsmouth2000.html) in headless Chromium at each of the
// study's three viewports and writes a dated PNG per surface into docs/proofs/. It captures the real
// artifact through its real proof hooks, so every pixel comes from the same code path a player runs;
// nothing is staged for the camera.
//
// It also FAILS on a runtime error or a near-blank canvas, so a capture run doubles as the boot check
// that catches the blank-dist class of defect (a module missing from the build's hand-maintained
// list, or two modules declaring the same top-level name).
//
// Usage:
//   node scripts/capture.js                       every surface, today's date
//   node scripts/capture.js underground help      only the named surfaces
//   node scripts/capture.js --date 20260809       override the date stamp
//
// Playwright is not a dependency of this repo. It lives in the npx cache on this machine; the path is
// resolved below and the script exits with a clear message rather than a stack trace if it is absent.

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'dist', 'innsmouth2000.html');
const OUT = join(ROOT, 'docs', 'proofs');

// The study's three viewports (DESIGN-SEED: the legibility floor is asserted at each).
const VIEWPORTS = [[1280, 800], [1440, 900], [2560, 1440]];

// Each surface: the proof hook that produces it, and how long to let the sim settle before the shot.
// `settle` is real milliseconds, because the ambient layer and the underground's slow movements are
// on a wall clock, not the sim clock.
const SURFACES = {
  // M-b, the milestone's own surfaces.
  underground: {
    query: '?underground',
    settle: 2600,
    note: 'the underground view over a town whose intake has been in brackish ground for three years',
  },
  'underground-above': {
    query: '?underground&above',
    settle: 2600,
    note: 'the same town from the street: seeped damp ground, the works, the filter house beds',
  },
  'underground-priest': {
    query: '?underground&priest',
    settle: 2600,
    note: 'the Old Priest counselling on the mains, over the plane he is talking about',
  },
  'help-water': { query: '?help', settle: 1800, note: 'Help and Legend, with the underground key' },
  // Kept alongside so a capture run can refresh the older surfaces too.
  title: { query: '', settle: 2200, note: 'the title plate' },
  ledger: { query: '?ledger', settle: 1800, note: 'the Town Ledger' },
  priest: { query: '?priest', settle: 1800, note: 'the Old Priest' },
};

const args = process.argv.slice(2);
let date = null;
const wanted = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date') { date = args[++i]; continue; }
  wanted.push(args[i]);
}
if (!date) {
  const d = new Date();
  date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
const names = wanted.length ? wanted : Object.keys(SURFACES);
for (const n of names) {
  if (!SURFACES[n]) {
    console.error(`unknown surface "${n}". Known: ${Object.keys(SURFACES).join(', ')}`);
    process.exit(2);
  }
}

if (!existsSync(HTML)) {
  console.error(`dist/innsmouth2000.html is not built. Run: node scripts/build.js`);
  process.exit(2);
}

// Find playwright without adding a dependency to the repo.
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const npx = join(homedir(), '.npm', '_npx');
  if (existsSync(npx)) {
    for (const hash of readdirSync(npx)) {
      const candidate = join(npx, hash, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(candidate)) {
        try { return await import(candidate); } catch { /* try the next */ }
      }
    }
  }
  return null;
}

const pw = await loadPlaywright();
if (!pw) {
  console.error('playwright not found (checked node_modules and the npx cache). Captures skipped.');
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ headless: true });
let failures = 0;

for (const name of names) {
  const surface = SURFACES[name];
  for (const [w, h] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(`file://${encodeURI(HTML)}${surface.query}`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, surface.settle));

    // A blank page is the failure mode this whole harness exists to catch, so measure it.
    const colors = await page.evaluate(() => {
      const c = document.getElementById('screen');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const set = new Set();
      for (let i = 0; i < d.length; i += 4 * 89) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return set.size;
    });

    // Hard rule 5: dated filenames, and an operator-facing capture is NEVER overwritten.
    const file = join(OUT, `i2-${name}-${w}x${h}-${date}.png`);
    if (existsSync(file)) {
      console.error(`REFUSED ${file} already exists; pass --date or rename, never overwrite a proof`);
      failures++;
      await page.close();
      continue;
    }
    const shot = await page.screenshot();
    writeFileSync(file, shot);
    const ok = errors.length === 0 && colors > 40;
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${w}x${h}  colors=${colors}  ${file.replace(`${ROOT}/`, '')}`);
    for (const e of errors.slice(0, 4)) console.log(`       ${e}`);
    await page.close();
  }
}

await browser.close();
if (failures) {
  console.error(`${failures} capture(s) failed. A near-blank canvas or a runtime error means the `
    + 'built page is broken, whatever node --test says.');
  process.exit(1);
}
console.log(`captured ${names.length} surface(s) at ${VIEWPORTS.length} viewports into docs/proofs/`);

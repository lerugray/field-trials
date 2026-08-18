// capture.mjs — the M0 proof-capture harness (DESIGN-SEED M0: "Playwright captures
// a frame at DPR 1+2"; CLAUDE.md hard rule 9: fixed viewports, dated filenames,
// never overwrite an existing proof; hard rule 4: failures are LOUD).
//
// It rebuilds the single-file dist, boots it over file:// in headless Chromium at
// the two ratified viewports × DPR 1 and 2, and for each frame:
//   - waits for the app's readiness signal (window.__popinjayReady),
//   - pulls the in-page debug log and FAILS the run if any error was logged (a red
//     banner / sim-boot / render failure must never pass silently),
//   - asserts the canvas fills ≥95% of the viewport (rule 9: no wasted screen),
//   - writes a dated PNG to proofs/ WITHOUT ever overwriting an existing proof.
//
// Playwright is a dev/proof tool (not shipped, not an art asset) — it never enters
// the single-file build, so the "code-generated art only / zero-dependency build"
// laws are untouched. Run: `npm run capture` (optionally `-- --dpr=1,2`).

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.js';
import { PAGE_BG, measurePresentBox, toCssBox, computeFill, FILL_THRESHOLD } from './fill-measure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PROOFS = resolve(ROOT, 'proofs');

// The two ratified proof viewports (CLAUDE.md hard rule 9).
const VIEWPORTS = [
  { w: 1280, h: 800, tag: '1280x800' },
  { w: 1440, h: 900, tag: '1440x900' },
];
const DPRS = [1, 2];

// The seven viewports the release fill gate must prove (docs/handoffs/RELEASE-FIX-ROUND-2026-08-15.md).
const FILL_VIEWPORTS = [
  { w: 900, h: 600, tag: '900x600' },
  { w: 1280, h: 800, tag: '1280x800' },
  { w: 1440, h: 812, tag: '1440x812' },
  { w: 1440, h: 900, tag: '1440x900' },
  { w: 1512, h: 860, tag: '1512x860' },
  { w: 1920, h: 1080, tag: '1920x1080' },
  { w: 2560, h: 1440, tag: '2560x1440' },
];

// A stable, sortable, second-resolution UTC stamp for dated filenames.
function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function captureOne(browser, vp, dpr, ts, url, scene) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`console.error: ${m.text()}`); });

  await page.goto(url, { waitUntil: 'load' });
  // The app flips window.__popinjayReady once its first frame has painted (or its
  // fallback path ran) — never screenshot a half-drawn frame.
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  // Scene-specific staging (e.g. start the stage and let the Grand bounce into frame).
  if (scene.prep) await scene.prep(page);

  // LOUD-failure gate: the in-page ring buffer is the source of truth. Any error
  // entry means the red banner is up — fail the proof and dump the log beside it.
  const diag = await page.evaluate(() => {
    const p = window.POPINJAY;
    const errs = (p && p.debuglog && p.debuglog.errors()) || [];
    return {
      errors: errs.map((e) => `t${e.tick} ${e.msg}${e.detail != null ? ' :: ' + (typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)) : ''}`),
      logText: (p && p.debuglog && p.debuglog.export()) || '',
      present: p && p.present,
    };
  });
  for (const e of diag.errors) failures.push(`debuglog.error: ${e}`);

  // Screen-fill gate (rewritten for release fix round): measure the ACTUAL presented
  // playfield box from canvas pixels, not the canvas element (which is always 100%).
  // The page background is painted into the letterbox bars, so non-background pixels
  // bound the playfield. This gate must FAIL against the old integer scaler.
  const cssBox = await page.evaluate((bg) => {
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixelBox = (() => {
      const data = img.data;
      const width = img.width;
      const height = img.height;
      const bgRgb = {
        r: parseInt(bg.substr(1, 2), 16),
        g: parseInt(bg.substr(3, 2), 16),
        b: parseInt(bg.substr(5, 2), 16),
      };
      const diff = (i) => Math.abs(data[i] - bgRgb.r) + Math.abs(data[i + 1] - bgRgb.g) + Math.abs(data[i + 2] - bgRgb.b);
      let minX = width, minY = height, maxX = 0, maxY = 0, any = false;
      for (let y = 0; y < height; y++) {
        let row = false;
        const rowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          if (diff(rowStart + x * 4) > 12) { row = true; break; }
        }
        if (row) { any = true; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (!any) return { x: 0, y: 0, w: 0, h: 0 };
      for (let x = 0; x < width; x++) {
        let col = false;
        for (let y = minY; y <= maxY; y++) {
          if (diff((y * width + x) * 4) > 12) { col = true; break; }
        }
        if (col) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
      }
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    })();
    return {
      x: pixelBox.x / dpr,
      y: pixelBox.y / dpr,
      w: pixelBox.w / dpr,
      h: pixelBox.h / dpr,
    };
  }, PAGE_BG);
  const fill = computeFill(cssBox, vp.w, vp.h);
  if (fill.fill < FILL_THRESHOLD) {
    failures.push(`playfield fill ${(fill.fill * 100).toFixed(1)}% (box ${cssBox.w.toFixed(0)}x${cssBox.h.toFixed(0)} in ${vp.w}x${vp.h}) < ${FILL_THRESHOLD * 100}%`);
  }

  const base = `${scene.prefix}_${vp.tag}@${dpr}x_${ts}`;
  const pngPath = resolve(PROOFS, `${base}.png`);
  if (existsSync(pngPath)) throw new Error(`proof already exists (never overwrite): ${pngPath}`);
  await page.screenshot({ path: pngPath });

  // On failure, bank the debug log next to the frame so the defect is diagnosable.
  if (failures.length) {
    writeFileSync(resolve(PROOFS, `${base}.FAIL.log`),
      failures.join('\n') + '\n\n--- in-page debug log ---\n' + diag.logText + '\n');
  }

  await context.close();
  return { base, dpr, vp, failures, fill: `${(fill.fill * 100).toFixed(1)}%` };
}

async function main() {
  // Fresh dist so the proof reflects HEAD (hard rule 7).
  build();
  mkdirSync(PROOFS, { recursive: true });
  const url = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
  const ts = stamp();

  const fillgate = process.argv.includes('--fillgate');

  // Allow `--dpr=1` to capture a single ratio when iterating.
  const dprArg = (process.argv.find((a) => a.startsWith('--dpr=')) || '').slice(6);
  let dprs = dprArg ? dprArg.split(',').map((n) => parseInt(n, 10)).filter(Boolean) : DPRS;

  // The scenes proven at each milestone. Title = the M0 poster; play = an M1 in-run
  // frame (start the stage headlessly via the exposed hook, let the Grand bounce into
  // view). Both must pass the LOUD-error + fill gate.
  const SCENES = fillgate ? [
    { prefix: 'fillgate', prep: null },
  ] : [
    { prefix: 'M0-title', prep: null },
    { prefix: 'M2-gen', prep: async (page) => {
      // A GENERATED mid-tour stage (2-3): varied platforms + ladders + roster.
      await page.evaluate(() => window.POPINJAY.startStageAt(2, 3));
      await page.waitForTimeout(1000); // balloons descend into legible mid-arc poses
    } },
    { prefix: 'M2-drip', prep: async (page) => {
      // The closing-bell state: red par dial + a telegraphed anti-camp drip Penny.
      await page.evaluate(() => window.POPINJAY.dripDemo(2, 2));
      await page.waitForTimeout(1400); // past the forced-low par; a drip is in play
    } },
    { prefix: 'M3-hit', prep: async (page) => {
      // Composure hit: a lost heart, the culprit balloon outlined, i-frame pulse.
      await page.evaluate(() => window.POPINJAY.hitDemo(1, 2));
      await page.waitForTimeout(300); // during the i-frame + culprit window
    } },
    { prefix: 'M3-drops', prep: async (page) => {
      // The drop table: one of every silhouette + active-effect badges.
      await page.evaluate(() => window.POPINJAY.dropsDemo(1, 2));
      await page.waitForTimeout(400);
    } },
    { prefix: 'M3-dynamite', prep: async (page) => {
      // The telegraphed dynamite fuse (the beat cascade is about to fire).
      await page.evaluate(() => window.POPINJAY.dynamiteDemo(1, 3));
      await page.waitForTimeout(250);
    } },
    { prefix: 'M3-souvenir', prep: async (page) => {
      // Weapon-class souvenirs: two wires (Second Barrel), a sidearm bullet, ammo HUD.
      await page.evaluate(() => window.POPINJAY.souvenirDemo(2, 3));
      await page.waitForTimeout(120);
    } },
    { prefix: 'M4-finale', prep: async (page) => {
      // The Panic Finale: escalating rain against the survival clock.
      await page.evaluate(() => window.POPINJAY.finaleDemo());
      await page.waitForTimeout(2500);
    } },
    { prefix: 'M4-gore', prep: async (page) => {
      // Locale-3 act: a WEIGHTED GORE (spiked iron silhouette, deeper arc).
      await page.evaluate(() => window.POPINJAY.startStageAt(3, 2));
      await page.waitForTimeout(900);
    } },
    { prefix: 'M4-tourmap', prep: async (page) => {
      // The between-locale tour-map interstitial (the route pin advances).
      await page.evaluate(() => window.POPINJAY.tourmapDemo());
      await page.waitForTimeout(120);
    } },
    { prefix: 'M4-draft', prep: async (page) => {
      // The between-stage souvenir draft (1 of 3, bad-luck weapon floor).
      await page.evaluate(() => window.POPINJAY.draftDemo());
      await page.waitForTimeout(120);
    } },
    { prefix: 'M4-scorecard', prep: async (page) => {
      // The prize-counter scorecard: causal death, banked tickets, run stats.
      await page.evaluate(() => window.POPINJAY.scorecardDemo());
      await page.waitForTimeout(120);
    } },
    { prefix: 'M5-vista1', prep: async (page) => {
      // LOCALE 1 vista: the exposition esplanade + tower behind the play field.
      await page.evaluate(() => window.POPINJAY.startStageAt(1, 1));
      await page.waitForTimeout(900);
    } },
    { prefix: 'M5-vista2', prep: async (page) => {
      // LOCALE 2 vista: the windward pier + lighthouse (wind-band act).
      await page.evaluate(() => window.POPINJAY.startStageAt(2, 2));
      await page.waitForTimeout(900);
    } },
    { prefix: 'M5-vista3', prep: async (page) => {
      // LOCALE 3 vista: alpine peaks + funicular over the ironworks (gore act).
      await page.evaluate(() => window.POPINJAY.startStageAt(3, 1));
      await page.waitForTimeout(900);
    } },
    { prefix: 'M6-options', prep: async (page) => {
      // The options + accessibility screen (audio, game-speed, flash-reduce, reduce-motion).
      await page.evaluate(() => window.POPINJAY.optionsDemo());
      await page.waitForTimeout(120);
    } },
    { prefix: 'M6-pause', prep: async (page) => {
      // The pause menu: controls/help on one screen + resume/options/quit actions.
      await page.evaluate(() => window.POPINJAY.pauseDemo());
      await page.waitForTimeout(120);
    } },
    { prefix: 'M5-chain', prep: async (page) => {
      // The chain fanfare: escalated pop bursts + paper confetti + rising ×N callouts.
      await page.evaluate(() => window.POPINJAY.chainDemo());
      await page.waitForTimeout(180); // confetti mid-air, callouts rising
    } },
    { prefix: 'M1-feelgate', prep: async (page) => {
      // The signature verbs on a real capture: a wire in flight rising toward a Grand.
      await page.evaluate(() => window.POPINJAY.feelGate());
      await page.waitForTimeout(180); // wire mid-flight, climbing toward the balloon
    } },
    // ---- M8: the overlay layer, now painted at native resolution like everything
    // else. Every one of these was a vector-over-pixel surface before.
    { prefix: 'M8-trunk', prep: async (page) => {
      // THE TRUNK: the curated meta — owned against for sale, with the selected lot
      // described, so spending twelve tickets is a decision rather than a guess.
      await page.evaluate(() => window.POPINJAY.trunkDemo());
      await page.waitForTimeout(150);
    } },
    { prefix: 'M8-cleared', prep: async (page) => {
      // The GALLERY CLEARED ribbon over a live frame — a pennanted announcement.
      await page.evaluate(() => window.POPINJAY.clearedDemo());
      await page.waitForTimeout(200);
    } },
    { prefix: 'M8-downed', prep: async (page) => {
      // The DOWNED beat: the one second that lets the culprit read before the counter.
      await page.evaluate(() => window.POPINJAY.killDemo());
      await page.waitForTimeout(500);
    } },
    { prefix: 'M8-centerpiece', prep: async (page) => {
      // The CENTERPIECE card announcing a named quasi-boss.
      await page.evaluate(() => window.POPINJAY.centerpieceDemo());
      await page.waitForTimeout(200);
    } },
    { prefix: 'M8-rehearsal', prep: async (page) => {
      // The REHEARSAL burst banner: the Panic Finale taught before it counts.
      await page.evaluate(() => window.POPINJAY.rehearsalDemo());
      await page.waitForTimeout(250);
    } },
    { prefix: 'M8-titleextras', prep: async (page) => {
      // The title card's working furniture — seed entry mid-type, the doors off the
      // title, the score/run records, the resume ribbon — over the REAL title card.
      // This is the frame the old seam was worst on: two Georgia-set lines sitting on
      // a pixel poster.
      await page.evaluate(() => window.POPINJAY.titleExtrasDemo());
      await page.waitForTimeout(200);
    } },
    { prefix: 'M8-transition', prep: async (page) => {
      // The SLIDE CHANGE, frozen mid-plate. Held at a fixed phase, so the proof is of
      // the transition itself rather than a race against a fifth of a second.
      await page.evaluate(() => window.POPINJAY.transitionDemo(0.45));
      await page.waitForTimeout(300);
    } },
    { prefix: 'M8-banner', prep: async (page) => {
      // The LOUD-failure banner (hard rule 4) in the pixel idiom. It is the one
      // surface that deliberately sits OUTSIDE the letterboxed play area, so it is
      // visible even when the frame behind it failed to paint at all.
      await page.evaluate(() => window.POPINJAY.bannerDemo());
      await page.waitForTimeout(200);
    } },
  ];

  if (fillgate) dprs = [1];
  const viewports = fillgate ? FILL_VIEWPORTS : VIEWPORTS;

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const scene of SCENES) {
      for (const vp of viewports) {
        for (const dpr of dprs) {
          results.push(await captureOne(browser, vp, dpr, ts, url, scene));
        }
      }
    }
  } finally {
    await browser.close();
  }

  let failed = 0;
  console.log('\n[capture] proof frames (proofs/):');
  for (const r of results) {
    const ok = r.failures.length === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${r.base}.png  fill=${r.fill}` +
      (ok ? '' : `\n         ${r.failures.join('\n         ')}`));
  }
  console.log(`[capture] ${results.length} frame(s), ${failed} failed.`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error('[capture] FATAL', e && e.stack || e); process.exit(1); });

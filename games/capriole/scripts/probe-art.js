// probe-art.js — ART proof captures at the three palette moments of the ascent
// (day → dusk → night), against the SHIPPED dist/capriole.html over file:// (stack law).
//
// Unlike probe.js (which gates on a feel condition and so lands on a wall-clock-dependent
// frame), this probe waits for an EXACT SIM TICK before capturing. The sim is fixed-timestep
// and seeded, so tick N is the same world state on every run — which is what makes a
// before/after art pair genuinely comparable instead of two different moments.
//
// Usage: node scripts/build.js && CAPRIOLE_ART_TAG=before node scripts/probe-art.js

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const TAG = process.env.CAPRIOLE_ART_TAG || 'after';
const OUT = process.env.CAPRIOLE_ART_DIR || 'proofs/art-migration-20260810';
const TICK = parseInt(process.env.CAPRIOLE_ART_TICK || '210', 10);

// The three palette moments the operator ratified, mapped onto the committed 9-sphere arc.
const RATIFIED = [
  { sphere: 0, name: 'dawn-fair', label: 'DAWN FAIR (day)' },
  { sphere: 3, name: 'plum-orchard', label: 'PLUM ORCHARD (dusk)' },
  { sphere: 8, name: 'crown-of-heaven', label: 'CROWN OF HEAVEN (night)' },
];

// Any sphere set can be probed — the treatment is palette-driven and has to hold on all
// NINE, not only the three that were ratified. `CAPRIOLE_ART_SPHERES=1,4,7` covers the
// three spheres whose key light was corrected during the art×M4 integration (one per act).
const SPHERES_ENV = (process.env.CAPRIOLE_ART_SPHERES || '').trim();
const MOMENTS = SPHERES_ENV
  ? SPHERES_ENV.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n))
      .map((n) => ({ sphere: n, name: `sphere${String(n).padStart(2, '0')}`, label: `SPHERE ${n}` }))
  : RATIFIED;

// A carnival screen (draft | scorecard | victory | meta) is an art surface too — it sits
// next to treated gameplay, so it gets proved, not assumed.
const SCREEN_ENV = (process.env.CAPRIOLE_ART_SCREEN || '').trim();

const VIEWPORT = { w: 1280, h: 800, name: '1280x800' };

async function main() {
  const htmlPath = resolve(root, 'dist/capriole.html');
  if (!existsSync(htmlPath)) {
    console.error('ART PROBE FAILED: dist/capriole.html missing — run `node scripts/build.js`.');
    process.exit(1);
  }
  const url = pathToFileURL(htmlPath).href;
  const outDir = resolve(root, OUT);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  let failed = false;

  // ---- Carnival-screen art proof. Distinct gates from a world capture: the overlay is
  // DOM, so "the canvas painted" says nothing about whether the screen was DRESSED. This
  // asserts the pixel-typeface title actually drew ink and the backdrop plate actually
  // painted a dithered, multi-tone field — the two things whose absence is exactly what
  // a flat-default screen looks like.
  if (SCREEN_ENV) {
    const context = await browser.newContext({ viewport: { width: VIEWPORT.w, height: VIEWPORT.h } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text()); });

    await page.goto(`${url}?probe=1&demo=1&screen=${encodeURIComponent(SCREEN_ENV)}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__capriole && window.__capriole.booted, { timeout: 20000 });
    await page.waitForFunction(() => {
      const s = window.__capriole.state && window.__capriole.state();
      return !!(s && s.screen);
    }, null, { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => window.__capriole.freeze && window.__capriole.freeze(true));
    await page.waitForTimeout(200);

    const engineErrors = await page.evaluate(() => window.__capriole.errors());
    const dressed = await page.evaluate(() => {
      const s = document.querySelector('#cap-screen');
      if (!s || getComputedStyle(s).display === 'none') return { ok: false, reason: 'screen not open' };
      const bd = s.querySelector('.backdrop'), tp = s.querySelector('.titleplate');
      if (!bd || !tp) return { ok: false, reason: 'plates missing — screen is undressed' };
      // Title plate: count drawn (non-transparent) pixels. A blank plate = the pixel
      // typeface never ran, which is the flat-default failure this gate exists for.
      const td = tp.getContext('2d').getImageData(0, 0, tp.width, tp.height).data;
      let inked = 0;
      for (let i = 3; i < td.length; i += 4) if (td[i] > 8) inked++;
      // Backdrop plate: must cover the frame and carry more than one tone (the dither).
      const bdd = bd.getContext('2d').getImageData(0, 0, bd.width, bd.height).data;
      let covered = 0; const tones = new Set();
      for (let i = 0; i < bdd.length; i += 4) {
        if (bdd[i + 3] > 8) covered++;
        tones.add((bdd[i + 3] >> 3 << 15) | (bdd[i] >> 3 << 10) | (bdd[i + 1] >> 3 << 5) | (bdd[i + 2] >> 3));
      }
      const cs = getComputedStyle(s);
      const gold = cs.getPropertyValue('--gold').trim(), ink = cs.getPropertyValue('--ink').trim();
      const titled = (s.querySelector('h1.sr') || {}).textContent || '';
      return {
        ok: inked > 40 && covered > bd.width * bd.height * 0.5 && tones.size >= 8 && !!gold && !!ink,
        inked, titlePlate: `${tp.width}x${tp.height}`, coveredPct: Math.round(100 * covered / (bd.width * bd.height)),
        tones: tones.size, gold, ink, title: titled,
      };
    });

    const outPath = resolve(outDir, `capriole-art-${TAG}-screen-${SCREEN_ENV}-${VIEWPORT.name}.png`);
    await page.screenshot({ path: outPath });
    const ok = pageErrors.length === 0 && engineErrors === 0 && dressed.ok;
    console.log(
      `${TAG}/screen-${SCREEN_ENV}: title="${dressed.title || '?'}" plate=${dressed.titlePlate || 'n/a'} ` +
      `inkedPx=${dressed.inked} backdrop=${dressed.coveredPct}% cover/${dressed.tones} tones ` +
      `gold=${dressed.gold || 'unset'} engineErrors=${engineErrors} pageErrors=${pageErrors.length} -> ${ok ? 'OK' : 'FAIL'}`,
    );
    if (!ok) {
      failed = true;
      if (dressed.reason) console.error('  UNDRESSED SCREEN:', dressed.reason);
      if (pageErrors.length) console.error('  pageErrors:', pageErrors.slice(0, 5));
    }
    await context.close();
    await browser.close();
    if (failed) { console.error('ART PROBE FAILED'); process.exit(1); }
    console.log(`ART PROBE OK — ${TAG} carnival-screen capture (${SCREEN_ENV}) in ${OUT}.`);
    return;
  }

  for (const m of MOMENTS) {
    const context = await browser.newContext({ viewport: { width: VIEWPORT.w, height: VIEWPORT.h } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text()); });

    await page.goto(`${url}?probe=1&demo=1&sphere=${m.sphere}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__capriole && window.__capriole.booted, { timeout: 20000 });
    // Capture point: the first tick at or past the target that is actually WORTH
    // capturing. Three conditions, each ruling out a way a frame lies about the art:
    //   1. tick >= TICK          — the sim has settled into the sphere.
    //   2. islands in frame      — the demo leaps, so the camera is often pointed at
    //                              open sky, and a gorgeous empty sky is not an art proof.
    //   3. no damage-rim flash   — the rim tints the whole frame red for a few ticks.
    //                              A red-washed Dawn Fair misrepresents its palette just
    //                              as badly as an empty frame does; it is combat FX, not
    //                              the art pass, and it has contaminated proofs before.
    // The sim is seeded and fixed-timestep, so "first acceptable tick" is deterministic
    // and the chosen tick is reported below. Soft fallback so a capture always happens;
    // the hard assertions after this are what actually fail the run.
    await page.waitForFunction(
      (t) => {
        const s = window.__capriole.state && window.__capriole.state();
        if (!s || s.tick < t) return false;
        // A pre-migration build has no island counter — don't hang waiting for one.
        if (typeof s.islandsOnScreen === 'number' && s.islandsOnScreen < 3) return false;
        const r = document.querySelector('#hud-rim');
        return !(r && r.classList.contains('on'));
      },
      TICK, { timeout: 30000 },
    ).catch(() => {});

    // FREEZE before reading or capturing. Without this the sim keeps stepping while
    // the screenshot is taken, so the captured frame is not the tick that was waited
    // for — and two runs of the same probe capture two different moments.
    await page.evaluate(() => window.__capriole.freeze && window.__capriole.freeze(true));
    await page.waitForTimeout(120); // let a couple of frames render the frozen state

    const engineErrors = await page.evaluate(() => window.__capriole.errors());
    const st = await page.evaluate(() => window.__capriole.state && window.__capriole.state());
    // Transient combat FX (the damage rim) would read as an art defect in a still.
    // Surface it rather than let it silently contaminate a proof.
    const rimOn = await page.evaluate(() => {
      const r = document.querySelector('#hud-rim');
      return !!(r && r.classList.contains('on'));
    });

    // Non-blank + colour-variety check. A pixel-register frame that "renders" as a flat
    // wash is a finding, not a pass — so measure distinct colours as well as luminance.
    const painted = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return { ok: false, reason: 'no canvas' };
      const tmp = document.createElement('canvas'); tmp.width = 160; tmp.height = 100;
      const g = tmp.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(c, 0, 0, 160, 100);
      const d = g.getImageData(0, 0, 160, 100).data;
      let min = 255, max = 0; const seen = new Set();
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (l < min) min = l; if (l > max) max = l;
        seen.add((d[i] >> 3 << 10) | (d[i + 1] >> 3 << 5) | (d[i + 2] >> 3));
      }
      return { ok: max - min > 20 && seen.size >= 16, min, max, colors: seen.size };
    });

    const outPath = resolve(outDir, `capriole-art-${TAG}-${m.name}-${VIEWPORT.name}.png`);
    await page.screenshot({ path: outPath });

    // A pre-migration build has neither the freeze nor the island counter; tolerate it
    // so BEFORE/AFTER pairs can be shot with the same probe, and say so rather than
    // silently reporting a gate that never ran.
    const legacy = !st || typeof st.islandsOnScreen !== 'number';
    const worldInFrame = legacy || st.islandsOnScreen >= 2;
    const ok = pageErrors.length === 0 && engineErrors === 0 && painted.ok && worldInFrame;
    console.log(
      `${TAG}/${m.name}: tick=${st ? st.tick : '?'} islands=${legacy ? 'n/a(legacy build)' : st.islandsOnScreen} ` +
      `y=${st ? st.y.toFixed(1) : '?'} hp=${st ? st.hp : '?'} ` +
      `rimFlash=${rimOn} engineErrors=${engineErrors} ` +
      `pageErrors=${pageErrors.length} painted=${painted.ok}(lum ${painted.min}->${painted.max}, ` +
      `${painted.colors} colors) -> ${ok ? 'OK' : 'FAIL'}`,
    );
    if (rimOn) console.warn('  NOTE: damage rim flash is live in this capture — combat FX, not the art pass.');
    if (!ok) {
      failed = true;
      if (pageErrors.length) console.error('  pageErrors:', pageErrors.slice(0, 5));
      if (!painted.ok) console.error('  weak frame:', painted);
      if (!worldInFrame) console.error('  EMPTY-WORLD FRAME: only sky in shot — not an art proof.');
    }
    await context.close();
  }
  await browser.close();
  if (failed) { console.error('ART PROBE FAILED'); process.exit(1); }
  console.log(`ART PROBE OK — ${TAG} captures at ${SPHERES_ENV ? `spheres ${SPHERES_ENV}` : 'the three ratified palette moments'} in ${OUT}.`);
}
main().catch((e) => { console.error('ART PROBE CRASHED:', e); process.exit(1); });

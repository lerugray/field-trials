// probe.js — headless render proof against the SHIPPED dist/capriole.html over
// file:// (stack law). Verifies real animated frames with ZERO errors and non-blank
// GL output, then captures a first-person LOOK frame mid-leap (scripted ?demo) so
// the auto-pitch tip-down is visible. Both fixed viewports, dated, never overwritten
// (hard rule 9). SwiftShader = structure proof only (fold); the feel gate + idiom
// judgment happen on real-GPU captures at the home-PC.
//
// Usage: node scripts/build.js && node scripts/probe.js

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const MILESTONE = process.env.CAPRIOLE_MS || 'M1';

const VIEWPORTS = [
  { w: 1280, h: 800, name: '1280x800', aimYaw: 0, aimFacing: '-Z' },
  { w: 1440, h: 900, name: '1440x900', aimYaw: Math.PI, aimFacing: '+Z' },
];

function dateStamp() {
  const d = process.env.CAPRIOLE_DATE || new Date().toISOString().slice(0, 10);
  return d.replace(/-/g, '');
}

async function main() {
  const htmlPath = resolve(root, 'dist/capriole.html');
  if (!existsSync(htmlPath)) { console.error('PROBE FAILED: dist/capriole.html missing — run `node scripts/build.js`.'); process.exit(1); }
  const url = pathToFileURL(htmlPath).href;
  const outDir = resolve(root, `proofs/${MILESTONE}`);
  mkdirSync(outDir, { recursive: true });
  const stamp = dateStamp();

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  let failed = false;
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });

    // ?demo drives a scripted leap so the capture shows the apex tip-down. CAPRIOLE_SPHERE
    // starts the demo on an enemy-populated sphere (M3 proofs); CAPRIOLE_FIRE pulses the
    // firework so a projectile/burst is captured.
    let q = `?probe=1&demo=1&aimYaw=${encodeURIComponent(vp.aimYaw)}`;
    if (process.env.CAPRIOLE_SPHERE) q += `&sphere=${encodeURIComponent(process.env.CAPRIOLE_SPHERE)}`;
    // The aim-indicator probe needs the firework armed so the reticle is visible; default to on.
    if (process.env.CAPRIOLE_FIRE !== '0') q += '&fire=1';
    // CAPRIOLE_SCREEN (draft|scorecard|victory|meta) stages an M4 carnival overlay for capture.
    const screenMode = process.env.CAPRIOLE_SCREEN || '';
    if (screenMode) q += `&screen=${encodeURIComponent(screenMode)}`;
    await page.goto(url + q, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__capriole && window.__capriole.booted, { timeout: 15000 });
    await page.waitForFunction(() => window.__capriole.frames > 20, { timeout: 15000 });
    if (screenMode) {
      // Overlay proof: wait for the carnival screen to be up (the sim is frozen behind it).
      await page.waitForFunction(() => {
        const s = window.__capriole.state && window.__capriole.state();
        return s && s.screen;
      }, { timeout: 15000 }).catch(() => {});
    }
    // Wait until the auto-pitch has engaged mid-leap (chain>=2, tilt building), with
    // a soft fallback so a capture always happens.
    // The demo loops its triple-jump, so a deep tilt recurs; capture on it.
    // On an enemy sphere (M3 proof) also require a billboard on-screen so the capture proves
    // the bestiary renders; otherwise just the apex tip-down. Soft fallback either way.
    const needEnemy = !!process.env.CAPRIOLE_SPHERE;
    if (!screenMode) await page.waitForFunction((needE) => {
      const s = window.__capriole.state ? window.__capriole.state() : null;
      const ready = s && s.tilt > 30 && s.chain >= 3 && s.aimIndicator && s.aimIndicator.visible &&
        (!needE || s.enemiesOnScreen > 0);
      // Pin the exact qualifying frame. The armed fire pulse lasts only three sim ticks;
      // without this, later evaluate/screenshot awaits can observe it after it expires.
      if (ready) window.__capriole.freeze();
      return ready;
    }, needEnemy, { timeout: 15000 }).catch(() => {});

    const engineErrors = await page.evaluate(() => window.__capriole.errors());
    const frames = await page.evaluate(() => window.__capriole.frames);
    const st = await page.evaluate(() => window.__capriole.state && window.__capriole.state());

    // The straight-shot affordance must be rendered at the real fixed-distance launch
    // point in both cardinal facings (the two viewports deliberately stage opposites).
    const aimed = (() => {
      if (!st || !st.aimIndicator || !st.player) return { ok: false, reason: 'aim probe state missing' };
      const a = st.aimIndicator, p = st.player;
      const dx = a.x - p.x, dz = a.z - p.z;
      const flatDist = Math.hypot(dx, dz);
      const axis = Math.abs(dx) < 1e-6 && (vp.aimFacing === '-Z' ? dz < 0 : dz > 0);
      const eye = Math.abs(a.y - (p.y + st.eyeHeight)) < 1e-6;
      return { ok: a.visible && axis && eye && Math.abs(flatDist - st.aimDistance) < 1e-6, flatDist, axis, eye };
    })();

    const painted = await page.evaluate(() => {
      const c = document.querySelector('canvas'); if (!c) return { ok: false };
      const tmp = document.createElement('canvas'); tmp.width = 64; tmp.height = 40;
      const g = tmp.getContext('2d'); g.drawImage(c, 0, 0, 64, 40);
      const d = g.getImageData(0, 0, 64, 40).data;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l < min) min = l; if (l > max) max = l; }
      return { ok: max - min > 20, min, max };
    });

    const outPath = resolve(outDir, `capriole-${MILESTONE.toLowerCase()}-${vp.name}-${stamp}.png`);
    if (existsSync(outPath)) console.log(`  (proof for ${stamp} exists — keeping it)`);
    else await page.screenshot({ path: outPath });

    const ok = pageErrors.length === 0 && engineErrors === 0 && painted.ok && aimed.ok;
    console.log(`${vp.name}: frames=${frames} tilt=${st ? st.tilt.toFixed(1) : '?'} chain=${st ? st.chain : '?'} aim=${vp.aimFacing}/${aimed.ok ? 'OK' : 'FAIL'} engineErrors=${engineErrors} pageErrors=${pageErrors.length} painted=${painted.ok}(lum ${painted.min}->${painted.max}) -> ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) { failed = true; if (pageErrors.length) console.error('  pageErrors:', pageErrors.slice(0, 5)); if (!painted.ok) console.error('  blank canvas:', painted); if (!aimed.ok) console.error('  aim indicator:', aimed); }
    await context.close();
  }
  await browser.close();
  if (failed) { console.error('PROBE FAILED'); process.exit(1); }
  console.log(`PROBE OK — ${MILESTONE} renders a first-person leap headless.`);
}
main().catch((e) => { console.error('PROBE CRASHED:', e); process.exit(1); });

// Deterministic browser captures for the 2026-08-10 approved-art conformance lane.
// Usage: node scripts/capture-conform.mjs before|after|mockup

import { readFileSync, mkdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'docs', 'art-poc', 'conform-20260810');
const phase = process.argv[2];
if (!['before', 'after', 'mockup'].includes(phase)) {
  throw new Error('usage: node scripts/capture-conform.mjs before|after|mockup');
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  // xorshift32, pinned independently of the game's own seeded engine PRNG.
  let state = 0x43504831;
  crypto.getRandomValues = (array) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      bytes[i] = state & 0xff;
    }
    return array;
  };
  try { localStorage.clear(); localStorage.setItem('chp-nature-seen', '1'); } catch (_) { /* about:blank */ }
  // Freeze the PoC's decorative loop; __poc.show() paints the requested phase 1.
  window.requestAnimationFrame = () => 0;
});

// A routed HTTP origin gives browser-native ES module semantics without coupling
// the proof to a long-running dev server process.
await context.route('http://chp.local/**', async (route) => {
  const url = new URL(route.request().url());
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const path = normalize(join(ROOT, rel));
  if (!path.startsWith(ROOT)) return route.abort();
  try {
    let body = phase === 'before'
      ? execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 })
      : readFileSync(path);
    // Capture control needs boot()'s returned render conduit. Suppress only the
    // module's automatic boot in the served copy; production source is untouched.
    if (rel === 'src/main.js') {
      const source = body.toString('utf8');
      body = Buffer.from(source.replace(
        /if \(typeof window !== 'undefined'\) \{[\s\S]*?\n\}\s*$/,
        "if (typeof window !== 'undefined') window.__captureBoot = boot;\n",
      ));
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
    await route.fulfill({ status: 200, contentType: types[extname(path)] || 'application/octet-stream', body });
  } catch (_) {
    await route.fulfill({ status: 404, body: 'not found' });
  }
});

async function assertPainted(page) {
  const result = await page.locator('#screen').evaluate((canvas) => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 20;
    const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0; const colors = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] > 9) nonBlack++;
      colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    }
    return { nonBlack, colors: colors.size };
  });
  if (result.nonBlack < 20 || result.colors < 4) throw new Error(`blank capture: ${JSON.stringify(result)}`);
}

async function writeShot(page, name, opts = {}) {
  await assertPainted(page);
  const path = join(OUT, name);
  await page.screenshot({ path, ...opts });
  if (statSync(path).size < 10_000) throw new Error(`suspiciously small capture: ${path}`);
  return path;
}

async function captureMockup() {
  // Provenance ruling: the committed round-1 frame is the overworld authority.
  // Copy it byte-for-byte into the comparison column; the procedural PoC HTML is
  // retained only to render the round-2 dungeon/chrome reference frames below.
  copyFileSync(
    join(ROOT, 'docs', 'art-poc', 'approval-record', 's1-overworld-green.png'),
    join(OUT, 'scene1-overworld-mockup-green-crt.png'),
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 934 }); // 900px canvas + PoC bar allowance
  await page.goto('http://chp.local/docs/art-poc/chp-art-poc-approved.html');
  await page.waitForFunction(() => window.__poc);
  const canvas = page.locator('#screen');
  for (const [scene, slug] of [[2, 'dungeon'], [3, 'crpg-chrome']]) {
    await page.evaluate(([n]) => window.__poc.show(n, 0, true), [scene]);
    await assertPainted(page);
    await canvas.screenshot({ path: join(OUT, `scene${scene}-${slug}-mockup-green-crt.png`) });
  }
  await page.evaluate(() => window.__poc.show(2, 1, true));
  await assertPainted(page);
  await canvas.screenshot({ path: join(OUT, 'scene2-dungeon-mockup-amber-crt.png') });
  await page.close();
}

async function captureGame(label) {
  const page = await context.newPage();
  await page.goto('http://chp.local/index.html');
  await page.waitForFunction(() => window.__captureBoot);
  await page.evaluate(() => { window.__captureGame = window.__captureBoot(); });
  await page.waitForFunction(() => window.__captureGame && window.__captureGame.canvas.width > 0);

  // Live overworld + its real standing CRPG chrome.
  await page.evaluate(() => window.__captureGame.renderMode('overworld'));
  await writeShot(page, `scene1-overworld-${label}-green-crt.png`);

  // First-person technique proof: crop the live scene viewport, excluding chrome,
  // then scale it to the mockup's 1440x900 comparison dimensions.
  await page.evaluate(() => window.__captureGame.renderMode('dungeon'));
  await page.evaluate(() => {
    const game = window.__captureGame, src = game.canvas, s = game.frame().scene;
    let proof = document.getElementById('scene-proof');
    if (!proof) { proof = document.createElement('canvas'); proof.id = 'scene-proof'; document.body.appendChild(proof); }
    proof.width = 1440; proof.height = 900;
    proof.style.cssText = 'position:fixed;inset:0;width:1440px;height:900px;image-rendering:pixelated;z-index:9';
    const p = proof.getContext('2d'); p.imageSmoothingEnabled = false;
    p.drawImage(src, s.x, s.y, s.w, s.h, 0, 0, proof.width, proof.height);
  });
  await page.locator('#scene-proof').screenshot({ path: join(OUT, `scene2-dungeon-${label}-green-crt.png`) });
  await page.evaluate(() => document.getElementById('scene-proof').remove());

  // Full dungeon frame is the live counterpart to the PoC's explicit chrome scene.
  await writeShot(page, `scene3-crpg-chrome-${label}-green-crt.png`);

  // Amber is one palette step from the default. Clear the toast with an unmapped
  // key, then repaint the deterministic dungeon frame before cropping it.
  await page.keyboard.press('p');
  await page.keyboard.press('Shift');
  await page.evaluate(() => window.__captureGame.renderMode('dungeon'));
  await page.evaluate(() => {
    const game = window.__captureGame, src = game.canvas, s = game.frame().scene;
    const proof = document.createElement('canvas'); proof.id = 'scene-proof';
    proof.width = 1440; proof.height = 900;
    proof.style.cssText = 'position:fixed;inset:0;width:1440px;height:900px;image-rendering:pixelated;z-index:9';
    const p = proof.getContext('2d'); p.imageSmoothingEnabled = false;
    p.drawImage(src, s.x, s.y, s.w, s.h, 0, 0, proof.width, proof.height);
    document.body.appendChild(proof);
  });
  await page.locator('#scene-proof').screenshot({ path: join(OUT, `scene2-dungeon-${label}-amber-crt.png`) });
  await page.close();
}

try {
  if (phase === 'mockup') await captureMockup();
  else await captureGame(phase);
  // As sets accumulate (mockup -> before -> after), reject any byte-identical
  // pair. A claimed change must always have a hash-distinct image.
  const groups = [
    ['scene1-overworld', 'green'], ['scene2-dungeon', 'green'],
    ['scene3-crpg-chrome', 'green'], ['scene2-dungeon', 'amber'],
  ];
  for (const [slug, hue] of groups) {
    const files = ['mockup', 'before', 'after']
      .map((label) => join(OUT, `${slug}-${label}-${hue}-crt.png`))
      .filter(existsSync);
    const hashes = files.map((path) => createHash('sha256').update(readFileSync(path)).digest('hex'));
    if (new Set(hashes).size !== hashes.length) throw new Error(`capture hash collision in ${slug}-${hue}`);
  }
} finally {
  await browser.close();
}

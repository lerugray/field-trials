// capture-motion.mjs — PUBLIC-RELEASE-GATE STEP 4 (motion looker) capture harness for
// MATERIAL BREACH. Read-only against src/ and dist/; writes ONLY into this evidence directory.
//
// Motion in an administration game is not a walk cycle. What actually moves in this build is:
// the incident replay (a party marker crawling the cutaway), the Cornerstone pulse, the overlay
// chain (title -> orientation -> admin -> checklist -> replay -> admin -> closed), the hover
// selection box, the dashed works-order markers, and the works-order cycle counters. This harness
// captures FRAME SEQUENCES of each, frame-exact, so they can be read with the eye rather than
// inferred from state.
//
// Frames come off the real canvas on consecutive requestAnimationFrame callbacks, so a burst of
// N frames is N genuine presentation frames of the running game — the same counter the replay
// cursor and the pulse are driven from.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const outDir = join(HERE, 'frames');
mkdirSync(outDir, { recursive: true });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

const st = () => page.evaluate(() => window.__GAME.state());
const manifest = [];

// burst(name, count, stride): capture `count` canvas frames, every `stride`-th animation frame.
// Returns a promise; call WITHOUT await to drive real input across the burst.
function burst(name, count, stride = 1) {
  return page
    .evaluate(
      async ({ count, stride }) => {
        const cvs = document.getElementById('screen');
        const out = [];
        await new Promise((res) => {
          let n = 0;
          let skip = 0;
          function grab() {
            if (skip <= 0) {
              const s = window.__GAME.state();
              out.push({
                png: cvs.toDataURL('image/png'),
                overlay: s.overlay,
                cycle: s.cycle,
                cornerstone: s.cornerstone,
                ordersOpen: s.ordersOpen,
                status: s.status,
              });
              skip = stride - 1;
              n++;
            } else skip--;
            if (n >= count) return res();
            requestAnimationFrame(grab);
          }
          requestAnimationFrame(grab);
        });
        return out;
      },
      { count, stride },
    )
    .then((frames) => {
      const dir = join(outDir, name);
      mkdirSync(dir, { recursive: true });
      frames.forEach((f, i) => {
        const idx = String(i).padStart(2, '0');
        writeFileSync(join(dir, `${idx}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
      });
      const meta = frames.map((f, i) => ({
        i,
        rafFrame: i * stride,
        overlay: f.overlay,
        cycle: f.cycle,
        cornerstone: f.cornerstone,
        ordersOpen: f.ordersOpen,
        status: f.status,
      }));
      writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
      manifest.push({ name, count, stride, frames: meta.length });
      console.log(`burst ${name}: ${frames.length} frames, stride ${stride}`);
      return meta;
    });
}

async function cellPoint(gx, gy) {
  return page.evaluate(
    ({ gx, gy }) => {
      const g = window.__GAME.state().geo;
      const bx = g.ox + gx * g.cell + g.cell / 2;
      const by = g.oy + gy * g.cell + g.cell / 2;
      const r = document.getElementById('screen').getBoundingClientRect();
      return { x: r.left + bx * (r.width / 640), y: r.top + by * (r.height / 360) };
    },
    { gx, gy },
  );
}
const clickCell = async (x, y) => page.mouse.click(...Object.values(await cellPoint(x, y)));
const moveCell = async (x, y) => {
  const c = await cellPoint(x, y);
  await page.mouse.move(c.x, c.y);
};

// ---------------------------------------------------------------- S6a: title -> orientation
const p6a = burst('S6a-title-to-orientation', 18, 2);
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await p6a;

// ---------------------------------------------------------------- S6b: orientation -> admin
const p6b = burst('S6b-orientation-to-admin', 18, 2);
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await p6b;

// ---------------------------------------------------------------- S4: hover selection box
await clickCell(12, 8);
await clickCell(13, 8);
await clickCell(14, 8);
const p4 = burst('S4-hover-selection', 14, 6);
for (const gx of [11, 12, 13, 14, 15, 16, 17]) {
  await moveCell(gx, 8);
  await page.waitForTimeout(85);
}
await p4;

// ---------------------------------------------------------------- S3a: Cornerstone pulse, healthy
await page.mouse.move(10, 10);
await burst('S3a-cornerstone-pulse-healthy', 16, 1);

// ---------------------------------------------------------------- S2: admin -> checklist
const p2 = burst('S2-admin-to-checklist', 16, 2);
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await p2;

// ------------------------------------------------- S1: checklist -> sign-over -> incident replay
const p1 = burst('S1-incident-replay', 26, 3);
await page.waitForTimeout(100);
await page.keyboard.press('Enter'); // the sign-over: the sim advances here and only here
await p1;

// ---------------------------------------------------------------- S5: replay end dwell + dismiss
await burst('S5-replay-end-dwell', 22, 4);
console.log('after S5 overlay =', (await st()).overlay);

// Land back in ADMIN if the dwell has not dismissed yet.
for (let i = 0; i < 10 && (await st()).overlay === 'raid'; i++) await page.waitForTimeout(200);

// ---------------------------------------------------------------- S7: works-order cycle counters
// A works order carries a stated lead time in CYCLES. The checklist prints it. It must decrement
// exactly one per sign-over and never on a presentation frame — the pacing law, read off the face
// of the thing that counts.
const counterLog = [];
async function readChecklistCounters(tag) {
  await page.keyboard.press('Enter'); // open the checklist
  await page.waitForFunction(() => window.__GAME.state().overlay === 'checklist', { timeout: 2000 });
  const dir = join(outDir, 'S7-order-counters');
  mkdirSync(dir, { recursive: true });
  const png = await page.evaluate(() => document.getElementById('screen').toDataURL('image/png'));
  writeFileSync(join(dir, `${tag}.png`), Buffer.from(png.split(',')[1], 'base64'));
  const s = await st();
  counterLog.push({ tag, cycle: s.cycle, ordersOpen: s.ordersOpen });
  return s;
}
// Raise a fresh excavation order so there is something with a lead time standing.
await clickCell(15, 8);
await clickCell(16, 8);
await readChecklistCounters('a-checklist-cycle-N');
// Hold the checklist open for 90 presentation frames: a stated cycle count must NOT move.
await burst('S7b-checklist-held-open', 12, 8);
await page.keyboard.press('Enter'); // sign over
await page.waitForTimeout(1400);
for (let i = 0; i < 12 && (await st()).overlay === 'raid'; i++) await page.waitForTimeout(200);
await readChecklistCounters('b-checklist-cycle-N+1');
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(150);

// ---------------------------------------------------------------- S1b: replay SKIP path
if ((await st()).overlay === 'checklist') {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
}
for (let i = 0; i < 12 && (await st()).overlay === 'raid'; i++) await page.waitForTimeout(200);
// Enter the next replay and cut it short mid-crawl: the skip must leave nothing stranded.
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(220);
const pSkip = burst('S1b-replay-skip', 16, 2);
await page.waitForTimeout(120);
await page.keyboard.press('Enter'); // skip
await pSkip;

// ------------------------------------------------ drive the tenure to a stressed Cornerstone
for (let i = 0; i < 6; i++) {
  const s = await st();
  if (s.status !== 'active') break;
  if (s.cornerstone <= 40) break;
  if (s.overlay === 'raid') {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    continue;
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(140);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  if ((await st()).overlay === 'raid') {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
}
const stressed = await st();
console.log('stressed state:', JSON.stringify(stressed).slice(0, 200));

// ---------------------------------------------------------------- S3b: Cornerstone pulse, stressed
if (stressed.status === 'active' && stressed.overlay !== 'closed') {
  await burst('S3b-cornerstone-pulse-stressed', 16, 1);
}

// ---------------------------------------------------------------- S6c: pause overlay transition
if ((await st()).status === 'active') {
  const p6c = burst('S6c-pause-transition', 16, 2);
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__GAME.pause());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__GAME.resume());
  await p6c;
}

// ---------------------------------------------------------------- S8: tenure close transition
for (let i = 0; i < 14; i++) {
  const s = await st();
  if (s.status !== 'active') break;
  if (s.overlay === 'raid') {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    continue;
  }
  if (s.cornerstone <= 12) {
    const p8 = burst('S8-tenure-close', 24, 4);
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(160);
    await page.keyboard.press('Enter');
    await p8;
    break;
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(140);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}
const final = await st();
console.log('final:', JSON.stringify(final).slice(0, 260));
await page.waitForTimeout(600);
await burst('S8b-closed-surface', 10, 4);

writeFileSync(
  join(outDir, 'MANIFEST.json'),
  JSON.stringify({ manifest, counterLog, pageErrors: errors, final }, null, 1),
);
console.log('counters:', JSON.stringify(counterLog));
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();

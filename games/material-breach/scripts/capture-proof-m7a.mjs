// capture-proof-m7a.mjs — the M7a ART PoC proof. Drives a real browser against the shipped
// file:// artifact with real mouse and real keys, builds a facility that is actually worth looking
// at (several departments, a crew standing at posts, a served instrument, an incident replay), and
// captures the frames Ray reviews.
//
// The scene has to be EARNED, not staged: every cell here is carved by a click and every cycle is
// signed over by a key, so the picture in the proof is a picture of the real game.
//
// Run:  PW_PATH=<node_modules with playwright> node scripts/capture-proof-m7a.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const pwBase = process.env.PW_PATH;
if (!pwBase) throw new Error('set PW_PATH to the node_modules dir that contains playwright');
const require = createRequire(join(pwBase, 'noop.js'));
const { chromium } = require('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || join(ROOT, 'docs', 'proofs', 'shots-m7a');
mkdirSync(outDir, { recursive: true });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const C0 = { x: 12, y: 8 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

const st = () => page.evaluate(() => window.__GAME.state());

async function shot(name) {
  await page.waitForTimeout(180);
  await page.screenshot({ path: join(outDir, name) });
  console.log('captured', name);
}

// Where a grid cell sits on screen RIGHT NOW. The camera frames the built facility, so the geometry
// moves as the facility grows and has to be read from the running game rather than recomputed here.
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

async function clickCell(gx, gy) {
  const c = await cellPoint(gx, gy);
  await page.mouse.click(c.x, c.y);
}

// Move the pointer over a cell without clicking, so the hover read is on screen for the frame.
async function hoverCell(gx, gy) {
  const c = await cellPoint(gx, gy);
  await page.mouse.move(c.x, c.y);
}

// Sign one cycle from ADMIN back to ADMIN, skipping the replay.
async function sign() {
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GAME.state().overlay === 'checklist', { timeout: 2000 }).catch(() => {});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(70);
  if ((await st()).overlay === 'raid') {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__GAME.state().overlay !== 'raid', { timeout: 2000 }).catch(() => {});
  }
}

// Cycle the grid tool to a named department (the tool ring is fixed in view.js TOOLS).
const TOOL_ORDER = ['excavate', 'treasury', 'records', 'fabrication', 'holding', 'quarters', 'commissary', 'clear'];
async function selectTool(name) {
  const want = TOOL_ORDER.indexOf(name);
  for (let guard = 0; guard < TOOL_ORDER.length + 1; guard++) {
    const cur = TOOL_ORDER.indexOf((await st()).tool);
    if (cur === want) return;
    await page.keyboard.press('t');
  }
  throw new Error(`could not select tool '${name}'`);
}

// Walk in through the shell: the title surface (M8), then the orientation packet.
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__GAME.state().overlay === 'orientation', { timeout: 3000 }).catch(() => {});
await page.keyboard.press('Enter'); // dismiss the orientation packet

// ---- carve a facility worth drawing ------------------------------------------------------------
// A hall running east and west of the Cornerstone, with two chambers off it. Carving is limited to
// rock touching claimed ground, so it is done in waves with cycles between them, exactly as a
// player would have to.
const WAVES = [
  [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]],
  [[3, 0], [-3, 0], [1, 1], [-1, 1], [2, 1], [-2, 1], [0, 2]],
  [[4, 0], [-4, 0], [3, 1], [-3, 1], [1, 2], [-1, 2], [2, 2], [-2, 2]],
  [[4, 1], [-4, 1], [3, 2], [-3, 2], [0, 3], [1, 3], [-1, 3], [2, 3]],
];
for (const wave of WAVES) {
  for (const [dx, dy] of wave) await clickCell(C0.x + dx, C0.y + dy);
  await sign();
  await sign();
  if ((await st()).status !== 'active') break;
}
console.log('after carving:', JSON.stringify(await st()));

// ---- designate the departments -----------------------------------------------------------------
const PLAN = [
  ['records', [[-2, 1], [-3, 1], [-2, 2], [-3, 2]]],
  ['quarters', [[2, 1], [3, 1], [2, 2], [3, 2]]],
  ['fabrication', [[-1, 2], [-1, 3]]],
  ['holding', [[1, 2], [1, 3]]],
  ['treasury', [[0, 2], [0, 3]]],
];
for (const [tool, cells] of PLAN) {
  await selectTool(tool);
  for (const [dx, dy] of cells) await clickCell(C0.x + dx, C0.y + dy);
}
await sign();
await sign();
await sign();
console.log('after departments:', JSON.stringify(await st()));

// Frame 1: the administration phase. The section lit by its own departments, the crew at posts,
// the ledger on paper beside it.
await hoverCell(C0.x - 2, C0.y + 1);
await shot('01-section-departments-and-crew.png');

// Frame 2: the same drawing with the pointer on the Cornerstone, so the plain-language read of the
// loss object is on screen (the LEGIBILITY LAW at the point of reading).
await hoverCell(C0.x, C0.y);
await shot('02-cornerstone-read-in-plain-language.png');

// ---- run the tenure until an officer is in the building ------------------------------------------
let served = false;
for (let i = 0; i < 14; i++) {
  const s = await st();
  if (s.noticesServed > 0) {
    served = true;
    break;
  }
  if (s.status !== 'active') break;
  await sign();
}
if (served) {
  await hoverCell(C0.x + 2, C0.y);
  await shot('03-officer-in-the-building.png');
} else {
  console.log('no instrument was served within the drive; frame 03 skipped');
}

// ---- catch the incident replay mid-approach -------------------------------------------------------
// Sign over and stay inside the replay overlay, so the raiders are on the drawing, walking.
if ((await st()).status === 'active') {
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GAME.state().overlay === 'checklist', { timeout: 2000 }).catch(() => {});
  await shot('04-pre-commit-checklist-on-paper.png');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  if ((await st()).overlay === 'raid') {
    await page.waitForTimeout(330); // let the party walk a few steps into the section
    await shot('05-incident-replay-raiders-on-the-section.png');
    await page.waitForTimeout(420);
    await shot('06-incident-replay-nearer-the-cornerstone.png');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__GAME.state().overlay !== 'raid', { timeout: 2000 }).catch(() => {});
  }
  // Whatever follows the incident: the after-action report back in ADMIN, or the closing report if
  // the incident ended the tenure. Named for what is actually on the frame, either way.
  const after = await st();
  await shot(after.status === 'active' ? '07-after-action-report-on-paper.png' : '07-tenure-closed-report-on-paper.png');
}

console.log('final:', JSON.stringify(await st()));
await browser.close();

// Reproducible native-frame evidence for the 2026-08-11 skeptical-audit fixes.
// These captures exercise scene input directly and never overwrite prior proof frames.

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { App } from '../src/engine/app.js';
import { makeIndexScene } from '../src/scenes/indexScene.js';
import { makePlayScene } from '../src/scenes/playScene.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { encodePNG } from './png.js';

const DATE = '2026-08-11';
const outputDir = process.argv[2];
if (!outputDir || !path.isAbsolute(outputDir)) {
  throw new Error('usage: node scripts/capture-audit-fix.js /absolute/output/directory');
}

function shelf(id) { return SHELVES.find((s) => s.id === id); }
function firstCard(id) { return shelfCards(shelf(id))[0]; }
function press(app, code) {
  app.input.pressKey(code); app.step(16);
  app.input.releaseKey(code); app.step(16);
}
function capture(name, app) {
  app.render();
  if (app.log.errorCount) throw new Error(`${name}: ${app.log.toText()}`);
  const out = path.join(outputDir, `${name}-${DATE}.png`);
  if (existsSync(out)) throw new Error(`refusing to overwrite proof frame: ${out}`);
  writeFileSync(out, encodePNG(app.fb));
  console.log(`captured ${path.basename(out)}  640x360`);
}

{
  const app = new App(640, 360);
  app.setScene(makeIndexScene()); app.step(16);
  press(app, 'Escape');
  capture('audit-fix-title-return', app);
}

{
  const app = new App(640, 360);
  app.setScene(makeIndexScene()); app.step(16);
  press(app, 'Enter');
  capture('audit-fix-loom-tutorial-drawer', app);
}

{
  const app = new App(640, 360);
  for (const id of shelf('loom').memberIds) app.progress.add(id);
  app.setScene(makeIndexScene()); app.step(16);
  press(app, 'ArrowDown');
  press(app, 'Enter');
  capture('audit-fix-proof-badges-drawer-t-star', app);
}

{
  const app = new App(640, 360);
  app.setScene(makePlayScene(firstCard('mirror-weave'), { onExit: () => {} })); app.step(4000);
  capture('audit-fix-mirror-before', app);
  press(app, 'Space');
  capture('audit-fix-mirror-one-stitch', app);
  for (let i = 0; i < 3; i++) press(app, 'KeyZ');
  capture('audit-fix-mirror-after-three-undo', app);
}

{
  const card = firstCard('house-rules');
  const app = new App(640, 360);
  app.setScene(makePlayScene(card, { onExit: () => {} })); app.step(4000);
  let target = null;
  for (let y = 0; y < card.puzzle.height && !target; y++) {
    for (let x = 0; x < card.puzzle.width; x++) {
      if (!card.puzzle.at(x, y)) { target = { x, y }; break; }
    }
  }
  for (let x = 0; x < target.x; x++) press(app, 'ArrowRight');
  for (let y = 0; y < target.y; y++) press(app, 'ArrowDown');
  capture('audit-fix-house-before', app);
  press(app, 'Space');
  capture('audit-fix-house-one-strike', app);
  for (let i = 0; i < 3; i++) press(app, 'KeyZ');
  capture('audit-fix-house-after-three-undo', app);
}

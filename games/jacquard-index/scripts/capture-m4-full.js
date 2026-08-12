// Reproducible proof inventory for the approved M4 pattern-room propagation.
// Every output is native 640x360, matching the approved PoC exemplar. Existing files are
// never overwritten: a repeated final capture must use a new dated filename by editing the
// manifest, preserving the old evidence.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { App } from '../src/engine/app.js';
import { composeTitle, drawPrompt } from '../src/scenes/title.js';
import { makeIndexScene } from '../src/scenes/indexScene.js';
import { makePlayScene } from '../src/scenes/playScene.js';
import { makeTwoThreadScene } from '../src/scenes/twoThreadScene.js';
import { makeCountingHouseScene } from '../src/scenes/countingHouseScene.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { PATCHWORK_PANELS } from '../src/content/patchworkMotifs.js';
import { CB_A, CB_B } from '../src/puzzle/coloredBoard.js';
import { encodePNG } from './png.js';

const DATE = '2026-08-11';
const outputDir = process.argv[2];
if (!outputDir || !path.isAbsolute(outputDir)) {
  throw new Error('usage: node scripts/capture-m4-full.js /absolute/output/directory');
}
mkdirSync(outputDir, { recursive: true });

function shelf(id) { return SHELVES.find((s) => s.id === id); }
function card(id, cardId) { return shelfCards(shelf(id)).find((c) => c.id === cardId); }

function appFor(scene, progress = []) {
  const app = new App(640, 360);
  for (const id of progress) app.progress.add(id);
  app.setScene(scene);
  app.step(4000); // dismiss the transient blurb so the surface itself is judgeable.
  return app;
}

function partialBinary(app, puzzle, step = 2) {
  let filled = 0, bare = 0;
  for (let y = 0; y < puzzle.height; y++) for (let x = 0; x < puzzle.width; x++) {
    if (puzzle.at(x, y)) {
      if (filled++ % step === 0) app.scene._board.toggleFill(x, y);
    } else if (bare++ % 7 === 0) app.scene._board.toggleCross(x, y);
  }
  app.step(16);
  return app;
}

function solveBinary(app, puzzle) {
  for (let y = 0; y < puzzle.height; y++) for (let x = 0; x < puzzle.width; x++) {
    if (puzzle.at(x, y)) app.scene._board.toggleFill(x, y);
  }
  app.step(16);
  return app;
}

function partialTwoThread(app, twoCard, step = 2) {
  let stitch = 0;
  for (let y = 0; y < twoCard.height; y++) for (let x = 0; x < twoCard.width; x++) {
    const value = twoCard.colored.grid[y * twoCard.width + x];
    if ((value === CB_A || value === CB_B) && stitch++ % step === 0) app.scene._board.place(x, y, value);
  }
  app.step(16);
  return app;
}

function solveTwoThread(app, twoCard) {
  for (let y = 0; y < twoCard.height; y++) for (let x = 0; x < twoCard.width; x++) {
    const value = twoCard.colored.grid[y * twoCard.width + x];
    if (value === CB_A || value === CB_B) app.scene._board.place(x, y, value);
  }
  app.step(16);
  return app;
}

function titleFrame() {
  const app = new App(640, 360);
  composeTitle(app.fb);
  drawPrompt(app.fb, true);
  return app;
}

function drawerFrame() {
  const woven = shelfCards(shelf('loom')).slice(0, 5).map((c) => c.id);
  const app = appFor(makeIndexScene(), woven);
  app.input.pressKey('Enter'); app.step(16); app.input.releaseKey('Enter'); app.step(16);
  app.input.pressKey('ArrowRight'); app.step(16); app.input.releaseKey('ArrowRight'); app.step(16);
  return app;
}

function binaryPlay(shelfId, cardId, step = 2) {
  const c = card(shelfId, cardId);
  return partialBinary(appFor(makePlayScene(c)), c.puzzle, step);
}

function houseRulesFrame() {
  const c = card('house-rules', 'thistle');
  const app = partialBinary(appFor(makePlayScene(c)), c.puzzle, 3);
  outer: for (let y = 0; y < c.puzzle.height; y++) for (let x = 0; x < c.puzzle.width; x++) {
    if (!c.puzzle.at(x, y) && app.scene._board.primaryAt(x, y) === 0) {
      app.scene._board.toggleFill(x, y);
      break outer;
    }
  }
  app.step(16); // the supervisor strikes the wrong stitch through.
  return app;
}

function twoThreadPlay(solved = false) {
  const c = card('two-thread', 'flagAB');
  const app = appFor(makeTwoThreadScene(c));
  return solved ? solveTwoThread(app, c) : partialTwoThread(app, c);
}

function countingPlay(solved = false) {
  const c = card('counting-house', 'ch_hourglass');
  const app = appFor(makeCountingHouseScene(c));
  return solved ? solveBinary(app, c.puzzle) : partialBinary(app, c.puzzle);
}

function revealFrame() {
  const c = card('loom', 'shuttle');
  return solveBinary(appFor(makePlayScene(c)), c.puzzle);
}

function panelFrame() {
  const panel = PATCHWORK_PANELS[0];
  const last = panel.members[panel.members.length - 1];
  const c = card('patchwork', last);
  return solveBinary(appFor(makePlayScene(c), panel.members.slice(0, -1)), c.puzzle);
}

const captures = [
  ['pattern-room-title-M4', titleFrame],
  ['pattern-room-open-drawer-M4', drawerFrame],
  ['pattern-room-loom-play-M4', () => binaryPlay('loom', 'shuttle')],
  ['pattern-room-negative-play-M4', () => binaryPlay('negative-cloth', 'keyhole')],
  ['pattern-room-mirror-play-M4', () => binaryPlay('mirror-weave', 'butterfly')],
  ['pattern-room-house-rules-play-M4', houseRulesFrame],
  ['pattern-room-patchwork-play-M4', () => binaryPlay('patchwork', 'patch')],
  ['pattern-room-two-thread-play-M4', () => twoThreadPlay(false)],
  ['pattern-room-counting-house-play-M4', () => countingPlay(false)],
  ['pattern-room-woven-reveal-M4', revealFrame],
  ['pattern-room-two-thread-reveal-M4', () => twoThreadPlay(true)],
  ['pattern-room-counting-house-reveal-M4', () => countingPlay(true)],
  ['pattern-room-panel-reveal-M4', panelFrame],
];

for (const [surface, make] of captures) {
  const out = path.join(outputDir, `${surface}-${DATE}.png`);
  if (existsSync(out)) throw new Error(`refusing to overwrite proof frame: ${out}`);
  const app = make();
  app.render();
  if (app.log.errorCount) throw new Error(`${surface} logged ${app.log.errorCount} runtime error(s):\n${app.log.toText()}`);
  writeFileSync(out, encodePNG(app.fb));
  console.log(`captured ${path.basename(out)}  640x360`);
}

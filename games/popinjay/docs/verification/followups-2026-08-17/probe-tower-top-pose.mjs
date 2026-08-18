// Tower-top pose verification. The climber's entire rendered mask is placed inside
// the controller card; the same toast is applied to frames with and without the
// player. If the card is opaque, survivingPosePixels is zero.

import { chromium } from 'playwright';
import { Stage } from '../../../src/sim/stage.js';
import { World } from '../../../src/sim/world.js';
import { CLIMB } from '../../../src/sim/player.js';
import { VIEW } from '../../../src/tuning.js';
import { Painter, NATIVE } from '../../../src/render/px.js';
import { drawGame, Effects, nativeScreen } from '../../../src/render/game.js';
import { drawControllerNotice } from '../../../src/render/overlays.js';

const ladder = { id: 'tower-ladder', x0: 624, x1: 656, top: 180, bottom: 740 };
const stage = new Stage({
  bounds: { left: 0, right: VIEW.w, top: 0, bottom: VIEW.h },
  solids: [
    { id: 'ground', kind: 'ground', x0: 0, x1: VIEW.w, top: 740, bottom: VIEW.h },
    { id: 'tower-top', kind: 'platform', x0: 460, x1: 820, top: 180, bottom: 204 },
  ],
  ladders: [ladder], spawns: [],
  meta: { locale: 1, stage: 3, playerSpawnX: 640, groundTop: 740, parTicks: 3000 },
});
const world = new World({ seed: 17, stage });
world.balloons = [];
Object.assign(world.player, { x: 640, feetY: 226, state: CLIMB, ladder, vy: 0 });

function render(playerX) {
  world.player.x = playerX;
  drawGame(null, world, { w: VIEW.w, h: VIEW.h }, new Effects());
  return nativeScreen().painter.snapshot();
}
function toast(frame) {
  const p = new Painter(NATIVE.w, NATIVE.h); p.restoreFrom(frame);
  drawControllerNotice(p, { headline: 'CONTROLLER CONNECTED', detail: 'STANDARD GAMEPAD READY' });
  return p.snapshot();
}

const poseFrame = render(640);
const noPoseFrame = render(-100);
const poseNotice = toast(poseFrame);
const noPoseNotice = toast(noPoseFrame);
let posePixels = 0, survivingPosePixels = 0;
let x0 = NATIVE.w, y0 = NATIVE.h, x1 = -1, y1 = -1;
for (let y = 0; y < NATIVE.h; y++) for (let x = 0; x < NATIVE.w; x++) {
  const i = (y * NATIVE.w + x) * 4;
  const pose = poseFrame[i] !== noPoseFrame[i] || poseFrame[i + 1] !== noPoseFrame[i + 1] || poseFrame[i + 2] !== noPoseFrame[i + 2];
  if (!pose) continue;
  posePixels++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  if (poseNotice[i] !== noPoseNotice[i] || poseNotice[i + 1] !== noPoseNotice[i + 1] || poseNotice[i + 2] !== noPoseNotice[i + 2]) survivingPosePixels++;
}
const visibleRatio = survivingPosePixels / posePixels;
const poseInsideNotice = x0 >= 80 && x1 <= 399 && y0 >= 60 && y1 <= 87;
const report = {
  date: '2026-08-17', probe: 'tower-top-pose-alpha',
  fixture: { state: CLIMB, ladderTopWorld: ladder.top, feetYWorld: 226, xWorld: 640 },
  noticeCardNative: { x0: 80, y0: 60, x1: 399, y1: 87, alpha: 0.68 },
  poseBoundsNative: { x0, y0, x1, y1 }, poseInsideNotice,
  posePixels, survivingPosePixels, visibleRatio,
  fullyCovered: survivingPosePixels === 0,
  pass: poseInsideNotice && visibleRatio >= 0.75,
  capture: 'tower-top-connect-alpha.png',
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: NATIVE.w, height: NATIVE.h } });
  await page.setContent(`<style>html,body{margin:0;background:#000}canvas{display:block}</style><canvas width="${NATIVE.w}" height="${NATIVE.h}"></canvas>`);
  await page.evaluate(({ bytes, width, height }) => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes), width, height), 0, 0);
  }, { bytes: Array.from(poseNotice), width: NATIVE.w, height: NATIVE.h });
  await page.locator('canvas').screenshot({ path: 'docs/verification/followups-2026-08-17/tower-top-connect-alpha.png' });
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

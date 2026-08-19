// player-render.test.js — ladder climb pose must paint distinct pixels from standing
// (the 2026-08-18 looker defect: byte-identical climb frames with no climb branch).

import test from 'node:test';
import assert from 'node:assert/strict';

import { VIEW } from '../src/tuning.js';
import { NATIVE } from '../src/render/px.js';
import { World } from '../src/sim/world.js';
import { Player, STAND, CLIMB } from '../src/sim/player.js';
import { authoredStageM1 } from '../src/sim/stage.js';
import { drawGame, nativeScreen } from '../src/render/game.js';

const ctx = { imageSmoothingEnabled: false, drawImage() {} };
const S = NATIVE.w / VIEW.w;

function playerSpriteBox(pl) {
  const x = Math.round(pl.x * S);
  const feet = Math.round(pl.feetY * S);
  const hgt = Math.max(10, Math.round(pl.height * S));
  return { x0: x - 12, x1: x + 12, y0: feet - hgt - 10, y1: feet + 3 };
}

function samplePlayerRegion(pl) {
  const stage = authoredStageM1();
  const world = new World({ seed: 11, stage });
  world.balloons = [];
  world.wires = [];
  world.drops = [];
  world.sidearmShots = [];
  world.player = new Player({ x: pl.x, feetY: stage.floorBelow(pl.x, 0).y, stage });
  world.player.feetY = pl.feetY;
  world.player.state = pl.state;
  world.player.facing = pl.facing ?? 1;
  world.player.walking = !!pl.walking;
  if (pl.ladder) world.player.ladder = pl.ladder;
  drawGame(ctx, world, { w: VIEW.w, h: VIEW.h }, null);
  const p = nativeScreen().painter;
  const box = playerSpriteBox(world.player);
  const out = [];
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) out.push(...p.get(x, y));
  }
  return out;
}

function pixelDiff(a, b) {
  assert.equal(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) diff++;
  }
  return diff;
}

test('ladder climb pose paints different pixels from the standing pose', () => {
  const stage = authoredStageM1();
  const lad = stage.ladders[0];
  const cx = (lad.x0 + lad.x1) / 2;
  const feetY = (lad.top + lad.bottom) / 2;
  const stand = samplePlayerRegion({ x: cx, feetY, state: STAND, facing: 1 });
  const climb = samplePlayerRegion({ x: cx, feetY, state: CLIMB, ladder: lad, facing: 1 });
  const diff = pixelDiff(stand, climb);
  assert.ok(diff >= 8, `climb pose must differ from stand in >=8 pixels, got ${diff}`);
});

test('climbing leg cycle alternates pixels between vertical-travel phases', () => {
  const stage = authoredStageM1();
  const lad = stage.ladders[0];
  const cx = (lad.x0 + lad.x1) / 2;
  const phase0 = samplePlayerRegion({ x: cx, feetY: 540, state: CLIMB, ladder: lad, facing: 1 });
  const phase1 = samplePlayerRegion({ x: cx, feetY: 549, state: CLIMB, ladder: lad, facing: 1 });
  const diff = pixelDiff(phase0, phase1);
  assert.ok(diff >= 4, `climb cycle frames must differ in >=4 pixels, got ${diff}`);
});

// 2026-08-18: real walk read with alternating stride frames (was a static slide).
test('walking pose paints different pixels from the standing pose', () => {
  const stage = authoredStageM1();
  const x = 400;
  const feetY = stage.floorBelow(x, 0).y;
  const stand = samplePlayerRegion({ x, feetY, state: STAND, facing: 1 });
  const walk = samplePlayerRegion({ x, feetY, state: STAND, facing: 1, walking: true });
  const diff = pixelDiff(stand, walk);
  assert.ok(diff >= 8, `walk pose must differ from stand in >=8 pixels, got ${diff}`);
});

test('walking leg cycle alternates pixels between stride phases', () => {
  const stage = authoredStageM1();
  const feetY = stage.floorBelow(400, 0).y;
  const phase0 = samplePlayerRegion({ x: 400, feetY, state: STAND, facing: 1, walking: true });
  const phase1 = samplePlayerRegion({ x: 412, feetY, state: STAND, facing: 1, walking: true });
  const diff = pixelDiff(phase0, phase1);
  assert.ok(diff >= 4, `walk cycle frames must differ in >=4 pixels, got ${diff}`);
});

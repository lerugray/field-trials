import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makeTitleScene } from '../src/scenes/titleScene.js';
import { makeIndexScene } from '../src/scenes/indexScene.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { titleLayout } from '../src/scenes/title.js';
import { patternRoomLayout, patternRoomDrawerLayout, PATTERN_ROOM_DRAWER_COLS } from '../src/render/patternRoom.js';

function clickAt(app, x, y) {
  app.input.movePointer(x, y, true);
  app.input.pressButton(0);
  app.step(16);
  app.input.releaseButton(0);
  app.step(16);
}

function hoverAt(app, x, y) {
  app.input.movePointer(x, y, true);
  app.step(16);
}

test('title card click opens the index (mouse path)', () => {
  const app = new App(640, 360);
  app.setScene(makeTitleScene());
  app.step(16);
  const { cardX, cardY, cardW, cardH } = titleLayout(app.fb);
  clickAt(app, cardX + (cardW >> 1), cardY + (cardH >> 1));
  assert.match(app.log.toText(), /title: OPEN INDEX/);
  assert.ok(app.scene._artStats, 'should be on the index scene');
});

test('index shelf hover selects and click opens THE LOOM drawer', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  const l = patternRoomLayout(app.fb);
  // Click shelf 0 (THE LOOM).
  clickAt(app, l.drawerX + 20, l.drawerTop + 8);
  assert.match(app.log.toText(), /index: opened THE LOOM/);
});

test('index card click opens the teaching card', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  const l = patternRoomLayout(app.fb);
  clickAt(app, l.drawerX + 20, l.drawerTop + 8); // open THE LOOM
  const d = patternRoomDrawerLayout(app.fb);
  const cellW = Math.floor(d.innerW / PATTERN_ROOM_DRAWER_COLS);
  const cellH = Math.floor(d.innerH / Math.ceil(shelfCards(SHELVES[0]).length / PATTERN_ROOM_DRAWER_COLS));
  clickAt(app, d.innerX + 10, d.innerY + 10);
  assert.match(app.log.toText(), new RegExp(`index: open ${shelfCards(SHELVES[0])[0].name}`));
  assert.ok(app.scene._board);
  // cell geometry sanity for hover path
  assert.ok(cellW > 20 && cellH > 20);
});

test('hovering a lower shelf updates selection chrome without opening', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  app.render();
  const before = Buffer.from(app.fb.data);
  const l = patternRoomLayout(app.fb);
  hoverAt(app, l.drawerX + 20, l.drawerTop + l.drawerH * 2 + 8);
  app.render();
  assert.notDeepEqual(Buffer.from(app.fb.data), before);
  assert.ok(!app.log.toText().includes('opened'), 'hover alone must not open a drawer');
});

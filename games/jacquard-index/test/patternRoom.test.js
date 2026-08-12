import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makeIndexScene } from '../src/scenes/indexScene.js';
import { PALETTE } from '../src/gfx/palette.js';
import { SHELVES } from '../src/content/shelves.js';
import { measureBodyText } from '../src/gfx/bodyFont.js';
import { patternRoomDrawerLayout, wrapPatternRoomText } from '../src/render/patternRoom.js';

function pressStep(app, code) {
  app.input.pressKey(code);
  app.step(16);
  app.input.releaseKey(code);
  app.step(16);
}

function renderIndex() {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  return { app, fb: app.render() };
}

function distinctColors(fb) {
  const colors = new Set();
  for (let i = 0; i < fb.data.length; i += 4) {
    colors.add(`${fb.data[i]},${fb.data[i + 1]},${fb.data[i + 2]},${fb.data[i + 3]}`);
  }
  return colors.size;
}

test('M4 pattern-room PoC is a fully opaque composed scene', () => {
  const { fb } = renderIndex();
  for (let i = 3; i < fb.data.length; i += 4) assert.equal(fb.data[i], 255);
  assert.ok(distinctColors(fb) > 500, `pattern room has only ${distinctColors(fb)} tones`);
});

test('pattern-room scene contains north light, timber, brass, and deep working shadow', () => {
  const { fb } = renderIndex();
  const window = fb.getPixel(40, 80);
  const shadow = fb.getPixel(5, 350);
  let brassPixels = 0;
  for (let i = 0; i < fb.data.length; i += 4) {
    if (fb.data[i] > 145 && fb.data[i + 1] > 105 && fb.data[i + 2] < 115) brassPixels++;
  }
  assert.ok(window[1] > window[0] - 10 && window[1] > 100, `window should read as cool daylight: ${window}`);
  assert.ok(shadow[0] < 80, `foreground shadow should stay deep: ${shadow}`);
  assert.ok(brassPixels > 250, `expected functional brass fittings, found ${brassPixels}`);
});

test('the selected physical drawer changes visibly when the selection moves', () => {
  const { app, fb } = renderIndex();
  const before = Buffer.from(fb.data);
  app.input.pressKey('ArrowDown');
  app.step(16);
  app.input.releaseKey('ArrowDown');
  app.step(16);
  app.render();
  assert.notDeepEqual(Buffer.from(app.fb.data), before);
});

test('THE BIAS remains visibly gated in the PoC and cannot be opened', () => {
  const { app } = renderIndex();
  for (let i = 0; i < 6; i++) {
    app.input.pressKey('ArrowDown');
    app.step(16);
    app.input.releaseKey('ArrowDown');
    app.step(16);
  }
  app.input.pressKey('Enter');
  app.step(16);
  assert.match(app.log.toText(), /THE BIAS is sealed/);
  assert.ok(!app.scene._board);
  assert.deepEqual(PALETTE.madder, [146, 62, 49]); // palette spine remains unchanged.
});

test('the open card view is the selected physical drawer pulled onto the bench', () => {
  const { app } = renderIndex();
  app.input.pressKey('Enter');
  app.step(16);
  app.input.releaseKey('Enter');
  app.step(16);
  const fb = app.render();
  const coolWindow = fb.getPixel(40, 80);
  const drawerTimber = fb.getPixel(100, 66);
  const cardStock = fb.getPixel(125, 105);
  assert.ok(coolWindow[1] > 95, `open drawer keeps the north-light scenery: ${coolWindow}`);
  assert.ok(drawerTimber[0] > drawerTimber[2] + 20, `drawer carcass should read timber: ${drawerTimber}`);
  assert.ok(cardStock[0] > 120 && cardStock[0] > cardStock[2], `drawer should hold warm card stock: ${cardStock}`);
});

test('closed cabinet and open drawer frames are cached until physical state changes', () => {
  const { app } = renderIndex();
  app.render();
  assert.equal(app.scene._artStats.shelfBuilds, 1);
  app.input.pressKey('Enter'); app.step(16); app.input.releaseKey('Enter'); app.step(16);
  app.render(); app.render();
  assert.equal(app.scene._artStats.drawerBuilds, 1);
  app.input.pressKey('ArrowRight'); app.step(16); app.input.releaseKey('ArrowRight'); app.step(16);
  app.render();
  assert.equal(app.scene._artStats.drawerBuilds, 2, 'moving a card changes the pulled-card state');
});

test('every shelf blurb fits the two-line drawer ticket without losing words', () => {
  const fb = renderIndex().fb;
  const l = patternRoomDrawerLayout(fb);
  for (const shelf of SHELVES) {
    const lines = wrapPatternRoomText(shelf.blurb, l.blurb.w - 12);
    assert.ok(lines.length <= 2, `${shelf.name} blurb needs ${lines.length} lines`);
    assert.equal(lines.join(' '), shelf.blurb, `${shelf.name} blurb is complete`);
    for (const line of lines) assert.ok(measureBodyText(line) <= l.blurb.w - 12);
  }
});

test("THE LOOM's tutorial blurb is visibly inked on the open drawer before a card opens", () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  pressStep(app, 'Enter');
  const fb = app.render();
  const box = patternRoomDrawerLayout(fb).blurb;
  let ink = 0;
  for (let y = box.y + 3; y < box.y + box.h - 2; y++) {
    for (let x = box.x + 3; x < box.x + box.w - 3; x++) {
      const p = fb.getPixel(x, y);
      if (p[0] < 90 && p[1] < 90 && p[2] < 90) ink++;
    }
  }
  assert.ok(ink > 100, `expected readable tutorial ink on the drawer ticket, found ${ink} pixels`);
});

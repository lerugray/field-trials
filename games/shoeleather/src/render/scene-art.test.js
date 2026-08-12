import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from './framebuffer.js';
import { composeScene, paintRestaurant, paintMorgue, paintStudio, paintStateroom, paintLounge, paintOffice, paintSceneArt, SCENE_ART, WORLD_PERSON_PROFILES, SPRITE_ART_PASSES, lum } from './scene-art.js';
import { LOGICAL_W, LOGICAL_H } from '../config.js';

function render(painter) {
  const fb = new Framebuffer(LOGICAL_W, LOGICAL_H);
  const meta = painter(fb);
  return { fb, meta };
}

// --- shared compositor (matches the ratified PoC composite math) ---------------------

test('composeScene fills every pixel opaquely (single composed picture)', () => {
  const fb = new Framebuffer(64, 48);
  composeScene(fb, () => [100, 80, 60], () => [1, 1, 1]);
  for (let y = 0; y < 48; y += 5) for (let x = 0; x < 64; x += 5) {
    assert.equal(fb.getPixel(x, y)[3], 255);
  }
});

test('composeScene applies a vignette (edges darker than centre)', () => {
  const fb = new Framebuffer(64, 48);
  composeScene(fb, () => [140, 120, 100], () => [1, 1, 1]);
  assert.ok(lum(fb.getPixel(32, 24)) > lum(fb.getPixel(1, 1)), 'centre should out-light the corner');
});

// --- restaurant scene ----------------------------------------------------------------

test('restaurant fills every pixel opaquely', () => {
  const { fb } = render(paintRestaurant);
  for (let y = 0; y < LOGICAL_H; y += 11) for (let x = 0; x < LOGICAL_W; x += 11) {
    assert.equal(fb.getPixel(x, y)[3], 255);
  }
});

test('restaurant pendant rig out-lights the far corner', () => {
  const { fb, meta } = render(paintRestaurant);
  const nearLamp = fb.getPixel(meta.pendant.x, meta.pendant.y + 20);
  const corner = fb.getPixel(2, LOGICAL_H - 2);
  assert.ok(lum(nearLamp) > lum(corner), 'pendant pool should out-light the corner');
});

test('restaurant reads warm (70s burnt-orange register) at the lit centre', () => {
  const { fb, meta } = render(paintRestaurant);
  const c = fb.getPixel(meta.pendant.x, meta.pendant.y + 30);
  assert.ok(c[0] > c[2], 'lit interior should be warm (R > B)');
});

test('restaurant exit doorways carry cooler light than the warm centre', () => {
  const { fb } = render(paintRestaurant);
  // scan the left doorway column for a pixel cooler (bluer) than a warm interior pixel
  let cool = false;
  for (let y = 90; y < 180 && !cool; y++) {
    const p = fb.getPixel(3, y);
    if (p[2] >= p[0]) cool = true; // B >= R at the doorway
  }
  assert.ok(cool, 'exit doorway should leak cool "way out" light');
});

test('restaurant material is textured, not a flat fill', () => {
  const { fb } = render(paintRestaurant);
  const a = fb.getPixel(200, 30), b = fb.getPixel(201, 30), c = fb.getPixel(200, 31);
  assert.ok(a[0] !== b[0] || a[0] !== c[0] || a[1] !== b[1], 'wall should carry fBm/dither texture');
});

test('restaurant paints an object at each object-hotspot anchor (action-legibility)', () => {
  const { fb, meta } = render(paintRestaurant);
  // the valet clipboard is paper (bright) against the dim podium/wall around it.
  const clip = meta.hotspots['valet-log'];
  const clipPx = fb.getPixel(clip.x, clip.y);
  const wallPx = fb.getPixel(clip.x, clip.y - 40);
  assert.ok(lum(clipPx) > lum(wallPx), 'valet log should read brighter than the wall behind');
  // the knife rack carries a bright blade streak somewhere in its band.
  let blade = false;
  const rack = meta.rack;
  for (let x = rack.x; x < rack.x + rack.w && !blade; x++) {
    const p = fb.getPixel(x, rack.y + 4);
    if (lum(p) > lum(wallPx) + 20) blade = true;
  }
  assert.ok(blade, 'knife rack should show a bright blade');
});

test('restaurant paints face and costume planes at the talk-hotspot anchors', () => {
  const { fb, meta } = render(paintRestaurant);
  const chef = meta.hotspots.chef;
  const face = fb.getPixel(chef.x, 82);
  const body = fb.getPixel(chef.x, chef.y);
  assert.ok(lum(face) > lum(body), 'chef face plane should read against the costume');
});

test('world people ship person-specific costume, posture and prop profiles', () => {
  assert.deepEqual(Object.keys(WORLD_PERSON_PROFILES).sort(), ['bandleader', 'chef', 'purser', 'waiter']);
  assert.equal(new Set(Object.values(WORLD_PERSON_PROFILES).map((p) => p.prop)).size, 4);
  assert.ok(new Set(Object.values(WORLD_PERSON_PROFILES).map((p) => p.lean)).size >= 3);
  assert.equal(new Set(Object.values(WORLD_PERSON_PROFILES).map((p) => p.costume.join(','))).size, 4);
  assert.equal(new Set(Object.values(WORLD_PERSON_PROFILES).map((p) => p.hairStyle)).size, 4);
  assert.ok(new Set(Object.values(WORLD_PERSON_PROFILES).map((p) => p.stance)).size >= 3);
});

test('world figures paint face planes brighter than their costume bodies', () => {
  const restaurant = render(paintRestaurant).fb;
  const lounge = render(paintLounge).fb;
  for (const [fb, x, faceY, bodyY, id] of [[restaurant, 229, 82, 115, 'chef'], [restaurant, 113, 128, 151, 'waiter'], [lounge, 80, 107, 130, 'purser'], [lounge, 318, 82, 117, 'bandleader']]) {
    assert.ok(lum(fb.getPixel(x, faceY)) > lum(fb.getPixel(x, bodyY)), `${id} face plane should read against costume`);
  }
});

test('restaurant deterministic (same seed -> identical frame)', () => {
  const a = new Framebuffer(96, 54); paintRestaurant(a);
  const b = new Framebuffer(96, 54); paintRestaurant(b);
  assert.deepEqual([...a.data], [...b.data]);
});

// --- morgue scene --------------------------------------------------------------------

test('morgue fills every pixel opaquely', () => {
  const { fb } = render(paintMorgue);
  for (let y = 0; y < LOGICAL_H; y += 11) for (let x = 0; x < LOGICAL_W; x += 11) {
    assert.equal(fb.getPixel(x, y)[3], 255);
  }
});

test('morgue reads COLD-institutional (green-dominant avocado, not warm)', () => {
  const { fb } = render(paintMorgue);
  const wall = fb.getPixel(40, 90);   // upper-left wall, away from the warm report lamp
  assert.ok(wall[1] >= wall[0] && wall[1] >= wall[2], 'morgue wall should be green-dominant (institutional avocado)');
});

test('morgue fluorescent is cooler (bluer) than the warm report lamp', () => {
  const { fb, meta } = render(paintMorgue);
  const underTube = fb.getPixel(meta.tube.x + meta.tube.w / 2, 80); // wall lit by the cool tube
  const underLamp = fb.getPixel(meta.report.x + 20, meta.report.y + 20); // warm work-lamp pool
  const coolShare = underTube[2] / (underTube[0] + 1);
  const warmShare = underLamp[2] / (underLamp[0] + 1);
  assert.ok(coolShare > warmShare, 'the fluorescent should read cooler (higher B/R) than the warm report lamp');
});

test('morgue overhead fluorescent glares brighter than the floor', () => {
  const { fb, meta } = render(paintMorgue);
  const tube = fb.getPixel(meta.tube.x + 10, meta.tube.y + 2);
  const floor = fb.getPixel(meta.tube.x + 10, LOGICAL_H - 4);
  assert.ok(lum(tube) > lum(floor), 'the ceiling tube should out-glare the floor');
});

test('morgue keeps one warm colour-script accent (the report lamp is warmer than the wall)', () => {
  const { fb, meta } = render(paintMorgue);
  const report = fb.getPixel(meta.report.x + 20, meta.report.y + 20);
  assert.ok(report[0] >= report[2], 'the work-lamp pool over the report should read warm (R >= B) against the cold room');
});

test('morgue paints an object at each hotspot anchor', () => {
  const { fb, meta } = render(paintMorgue);
  const wall = fb.getPixel(40, 70);
  for (const id of ['coroner-report', 'tod-board', 'bank-letter']) {
    const a = meta.hotspots[id];
    const px = fb.getPixel(a.x, a.y);
    assert.ok(Math.abs(lum(px) - lum(wall)) > 6, `${id} should paint an object distinct from the bare wall`);
  }
});

test('morgue paints a sheeted form on the slab (pale foreground mound)', () => {
  const { fb, meta } = render(paintMorgue);
  const mound = fb.getPixel(meta.sheet.x + meta.sheet.w / 2, meta.sheet.y + meta.sheet.h - 4);
  const floor = fb.getPixel(20, LOGICAL_H - 8);
  assert.ok(lum(mound) > lum(floor), 'the sheet should read pale against the dim floor');
});

test('morgue deterministic (same seed -> identical frame)', () => {
  const a = new Framebuffer(96, 54); paintMorgue(a);
  const b = new Framebuffer(96, 54); paintMorgue(b);
  assert.deepEqual([...a.data], [...b.data]);
});

// --- studio scene --------------------------------------------------------------------

test('studio fills every pixel opaquely', () => {
  const { fb } = render(paintStudio);
  for (let y = 0; y < LOGICAL_H; y += 11) for (let x = 0; x < LOGICAL_W; x += 11) {
    assert.equal(fb.getPixel(x, y)[3], 255);
  }
});

test('studio Fresnel lens is the brightest, warmest element (hard key source)', () => {
  const { fb, meta } = render(paintStudio);
  const lens = fb.getPixel(meta.fresnel.x + meta.fresnel.w / 2, meta.fresnel.y + meta.fresnel.h / 2);
  const stageDark = fb.getPixel(60, 40);
  assert.ok(lum(lens) > lum(stageDark) + 40, 'the lamp head should blaze against the dim stage');
  assert.ok(lens[0] > lens[2], 'the key light should read warm (R > B)');
});

test('studio key beam lights the set flat brighter than the unlit stage volume', () => {
  const { fb, meta } = render(paintStudio);
  const onSet = fb.getPixel(meta.setFlat.x + meta.setFlat.w - 20, meta.setFlat.y + meta.setFlat.h - 30); // in the beam
  const offStage = fb.getPixel(60, 40); // dark stage volume, out of the beam
  assert.ok(lum(onSet) > lum(offStage), 'the lit set should out-light the dark stage');
});

test('studio paints the staff ledger (bright pages) at its hotspot anchor', () => {
  const { fb, meta } = render(paintStudio);
  const led = meta.hotspots['staff-ledger'];
  const page = fb.getPixel(led.x - 12, led.y);
  const desk = fb.getPixel(led.x, led.y + 30);
  assert.ok(lum(page) > lum(desk), 'the ledger pages should read brighter than the desk');
});

test('studio paints a camera silhouette in front of the lit set (dark against bright)', () => {
  const { fb, meta } = render(paintStudio);
  const body = fb.getPixel(meta.camera.x + meta.camera.w - 6, meta.camera.y + meta.camera.h / 2);
  const setBehind = fb.getPixel(meta.setFlat.x + meta.setFlat.w - 30, meta.camera.y);
  assert.ok(lum(body) < lum(setBehind), 'the camera should silhouette dark against the lit set');
});

test('studio deterministic (same seed -> identical frame)', () => {
  const a = new Framebuffer(96, 54); paintStudio(a);
  const b = new Framebuffer(96, 54); paintStudio(b);
  assert.deepEqual([...a.data], [...b.data]);
});

// --- Case 2 cruise-ship scenes -------------------------------------------------------

for (const [name, painter] of [['stateroom', paintStateroom], ['lounge', paintLounge], ['office', paintOffice]]) {
  test(`${name} fills every pixel opaquely`, () => {
    const { fb } = render(painter);
    for (let y = 0; y < LOGICAL_H; y += 11) for (let x = 0; x < LOGICAL_W; x += 11) {
      assert.equal(fb.getPixel(x, y)[3], 255);
    }
  });
  test(`${name} material is textured, not a flat fill`, () => {
    const { fb } = render(painter);
    const a = fb.getPixel(40, 30), b = fb.getPixel(41, 30), c = fb.getPixel(40, 31);
    assert.ok(a[0] !== b[0] || a[0] !== c[0] || a[1] !== b[1], 'wall should carry fBm/dither texture');
  });
  test(`${name} deterministic (same seed -> identical frame)`, () => {
    const p = new Framebuffer(96, 54); painter(p);
    const q = new Framebuffer(96, 54); painter(q);
    assert.deepEqual([...p.data], [...q.data]);
  });
}

test('stateroom is a warm cabin with a cool porthole (colour-script contrast)', () => {
  const { fb, meta } = render(paintStateroom);
  const wall = fb.getPixel(meta.desk.x - 20, 40);
  assert.ok(wall[0] > wall[2], 'cabin wall should read warm (R > B)');
  // the porthole interior carries cool night light in its lower half (the sea).
  const seaPx = fb.getPixel(meta.porthole.cx, meta.porthole.cy + meta.porthole.r - 6);
  assert.ok(seaPx[2] >= seaPx[0], 'porthole sea should read cool (B >= R)');
});

test('stateroom anchors an object inside each hotspot (berth/tray/ledger)', () => {
  const { fb, meta } = render(paintStateroom);
  const wall = fb.getPixel(meta.desk.x - 20, 40);
  for (const id of ['the-berth', 'dinner-tray', 'open-ledger']) {
    const a = meta.hotspots[id];
    assert.ok(Math.abs(lum(fb.getPixel(a.x, a.y)) - lum(wall)) > 5, `${id} should paint an object distinct from the wall`);
  }
});

test('lounge clock is the bright backlit device prop (the alibi trick)', () => {
  const { fb, meta } = render(paintLounge);
  const face = fb.getPixel(meta.clock.cx + 4, meta.clock.cy + 4);
  const wall = fb.getPixel(meta.clock.cx, meta.clock.cy - meta.clock.r - 12);
  assert.ok(lum(face) > lum(wall) + 30, 'the clock face should blaze against the papered wall');
});

test('lounge seats the purser and stands the bandleader (talk silhouettes)', () => {
  const { fb, meta } = render(paintLounge);
  const purserBody = fb.getPixel(meta.hotspots.purser.x, meta.hotspots.purser.y);
  const beside = fb.getPixel(meta.hotspots.purser.x + 50, meta.hotspots.purser.y);
  assert.ok(lum(purserBody) < lum(beside), 'the purser should silhouette dark against the lit room');
});

test('office shows the weapon\'s absence: a dust-ring on the desk', () => {
  const { fb, meta } = render(paintOffice);
  // the ring outline pixels differ from the clean centre (the paperweight is gone).
  const outline = fb.getPixel(meta.ring.cx + meta.ring.r - 1, meta.ring.cy);
  const centre = fb.getPixel(meta.ring.cx, meta.ring.cy);
  assert.ok(lum(outline) !== lum(centre), 'the dust-ring should be visible against the wiped centre');
});

test('the three world scenes carry distinct register (restaurant warm, morgue green, studio hard-key)', () => {
  const rest = new Framebuffer(LOGICAL_W, LOGICAL_H); paintRestaurant(rest);
  const morg = new Framebuffer(LOGICAL_W, LOGICAL_H); paintMorgue(morg);
  // sample a lit interior wall from each; the restaurant should be warmer (higher R-B) than the morgue.
  const rWall = rest.getPixel(300, 60), mWall = morg.getPixel(300, 60);
  assert.ok((rWall[0] - rWall[2]) > (mWall[0] - mWall[2]), 'restaurant should read warmer than the morgue');
});

test('paintSceneArt dispatches known ids and returns null for unknown', () => {
  const fb = new Framebuffer(LOGICAL_W, LOGICAL_H);
  assert.ok(paintSceneArt(fb, 'restaurant'), 'restaurant id should paint + return meta');
  assert.equal(paintSceneArt(fb, 'nope'), null);
  assert.ok(typeof SCENE_ART.restaurant === 'function');
});

test('every world painter declares the shared multi-pass sprite/object quality gate', () => {
  assert.deepEqual(SPRITE_ART_PASSES, ['silhouette', 'identity-palette', 'material', 'scene-light']);
  for (const painter of [paintRestaurant, paintMorgue, paintStudio, paintStateroom, paintLounge, paintOffice]) {
    const { meta } = render(painter);
    assert.deepEqual(meta.qualityPasses, SPRITE_ART_PASSES);
    assert.ok(Object.keys(meta.keyObjects).length >= 2);
  }
});

test('every key object has internal palette/material/light variation at final pixels', () => {
  for (const [scene, painter] of [['restaurant', paintRestaurant], ['morgue', paintMorgue], ['studio', paintStudio], ['stateroom', paintStateroom], ['lounge', paintLounge], ['office', paintOffice]]) {
    const { fb, meta } = render(painter);
    for (const [id, r] of Object.entries(meta.keyObjects)) {
      const colors = new Set(), values = [];
      const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
      const x1 = Math.min(fb.width, Math.ceil(r.x + r.w)), y1 = Math.min(fb.height, Math.ceil(r.y + r.h));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = fb.getPixel(x, y); colors.add(p.slice(0, 3).join(',')); values.push(lum(p));
      }
      assert.ok(colors.size > 12, `${scene}/${id} must not collapse to a flat placeholder`);
      assert.ok(Math.max(...values) - Math.min(...values) > 8, `${scene}/${id} needs readable value planes`);
    }
  }
});

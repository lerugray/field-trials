// THE PARTY COLUMN reports one labelled figure, and reports the purchase.
//
// Ray's ratified option B (2026-08-14). At rest each frame's line is `hp 43/43`;
// under focus or hover of a purchasable item every line becomes the stat that
// item moves, current and target, with the target aware of the item it would
// REPLACE. Two ancestors of this line were rejected by the operator's eye —
// `a19 d7 m4` (letters fused to figures) and a column header three rows above
// its figures — so the assertions here are about the LABEL being present at the
// point of reading, not merely about the numbers being right.
//
// Catalog-level, like its sibling shop test: a given town stocks four lines, so
// a stat line that overflows would otherwise stay invisible until the leg that
// happens to stock the item.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ITEM_IDS, getItem } from '../src/items.js';
import { createParty, equipItem } from '../src/party.js';
import { generateShop } from '../src/shop.js';
import { pixelTextWidth } from '../src/pixel-font.js';
import { render } from '../src/main.js';

/** Kept in step with main.js: names start at 166, the slot chips at 236. */
const STAT_ZONE_X = 166;
const STAT_ZONE_W = 68;
const CAPTION = { font: '6px monospace', textAlign: 'left' };

function stubCtx() {
  const target = {
    font: '7px monospace', fillStyle: '#000', strokeStyle: '#000',
    textAlign: 'left', textBaseline: 'top', lineWidth: 1, globalAlpha: 1,
    imageSmoothingEnabled: false, __pixelTextEvents: [],
  };
  return new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}

/** Render the quartermaster with `focusId` under focus; returns the draw events. */
function renderShopWith(focusId, mutate) {
  const party = createParty();
  const shop = generateShop(7, 3);
  if (mutate) mutate(party, shop);
  const ctx = stubCtx();
  const ui = { screen: 'shop', focus: -1, hover: -1, paused: true, shop };
  const state = {
    ui, party, march: { tick: 0 }, controls: [], log: { errorCount: 0 },
    shopControls: null,
  };
  // The controls the renderer reads are the ones the app builds; rebuild the
  // same shape here so a focus index can be addressed by control id.
  state.shopControls = buildControls(party, shop);
  if (focusId) {
    const idx = state.shopControls.findIndex((c) => c.id === focusId);
    assert.ok(idx >= 0, `no such shop control: ${focusId}`);
    ui.focus = idx;
  }
  render(ctx, state);
  return { events: ctx.__pixelTextEvents, party, shop };
}

/** A minimal mirror of buildShopControls' identity + kind, which is all the
 *  party column reads. Geometry is irrelevant to these assertions. */
function buildControls(party, shop) {
  const arr = [];
  shop.lines.forEach((l, i) => arr.push({ id: 'buy' + i, kind: 'buy', line: i, rect: { x: 0, y: 0, w: 1, h: 1 } }));
  arr.push({ id: 'resupply', kind: 'resupply', rect: { x: 0, y: 0, w: 1, h: 1 } });
  party.frames.forEach((f, i) => ['arm', 'guard'].forEach((slot) => {
    arr.push({ id: 'slot' + i + slot, kind: 'slot', frameIndex: i, slot, rect: { x: 0, y: 0, w: 1, h: 1 } });
  }));
  (party.inventory || []).forEach((id, i) => arr.push({ id: 'inv' + i, kind: 'inv', itemId: id, rect: { x: 0, y: 0, w: 1, h: 1 } }));
  arr.push({ id: 'back', kind: 'back', rect: { x: 0, y: 0, w: 1, h: 1 } });
  return arr;
}

const inColumn = (events) => events.filter((e) => String(e.stack || '').startsWith('shop-frame:'));
const textsOf = (events) => events.map((e) => String(e.text));

test('at rest every frame reports a LABELLED hp figure, not a bare number', () => {
  const { events, party } = renderShopWith(null);
  const column = inColumn(events);
  assert.equal(column.filter((e) => e.text === 'hp').length, party.frames.length);
  for (const f of party.frames) {
    assert.ok(textsOf(column).includes(`${f.hp}/${f.max.hp}`), `${f.name}'s hp figure is missing`);
  }
  // The label is drawn immediately before the figure it names, in the same
  // block — that adjacency is what the legibility lint reads.
  for (let i = 0; i < column.length; i++) {
    if (column[i].text !== 'hp') continue;
    assert.match(String(column[i + 1].text), /^\d+\/\d+$/);
    assert.equal(column[i + 1].stack, column[i].stack);
  }
});

test('focusing a buy line swaps every frame to that item\'s stat and target', () => {
  const { events, shop, party } = renderShopWith('buy0');
  const it = getItem(shop.lines[0].id);
  const key = ['atk', 'def', 'mag'].find((k) => it.mods[k] != null) || Object.keys(it.mods)[0];
  const column = inColumn(events);
  const texts = textsOf(column);
  assert.equal(column.filter((e) => e.text === key).length, party.frames.length, `every frame should name ${key}`);
  assert.ok(!texts.includes('hp'), 'the rest line must give way to the purchase line');
  assert.equal(column.filter((e) => e.text === '>').length, party.frames.length);
  for (const f of party.frames) {
    const target = (f.max[key] | 0) + (it.mods[key] | 0);
    assert.ok(texts.includes(String(target)), `${f.name} should show a target of ${target}`);
  }
});

test('the target is REPLACEMENT-aware: a downgrade shows the loss, not the gain', () => {
  // Issue the strongest arm item, then focus the weakest: the swap must report
  // the stat FALLING, which is the whole reason the delta is worth showing.
  const strong = 'distraint_warhammer'; // atk 10
  const weak = 'issue_billhook'; // atk 3
  const { events, party } = renderShopWith('inv0', (p, shop) => {
    p.inventory = [weak];
    p.gold = 500;
    p.frames[0].equip.arm = strong;
    equipItem(p, 0, strong);
    shop.lines.forEach((l) => { l.sold = true; }); // isolate the stores chip
  });
  const column = inColumn(events);
  const frame0 = column.filter((e) => e.stack === 'shop-frame:0');
  const texts = frame0.map((e) => String(e.text));
  assert.ok(texts.includes('atk'), 'the swap should be reported against atk');
  const cur = party.frames[0].max.atk;
  const target = cur - getItem(strong).mods.atk + getItem(weak).mods.atk;
  assert.ok(target < cur, 'this fixture must be a downgrade for the test to mean anything');
  assert.ok(texts.includes(String(target)), `frame 0 should show the fallen figure ${target}`);
});

test('a picked item keeps reporting while the focus moves to a slot chip', () => {
  const { events } = renderShopWith('slot0arm', (p, shop) => {
    p.inventory = ['weighted_maul'];
    shop.pick = 'weighted_maul';
  });
  const texts = textsOf(inColumn(events));
  assert.ok(texts.includes('atk'), 'choosing WHICH frame is exactly when the delta matters most');
  assert.ok(!texts.includes('hp'), 'the column must not revert while a pick is live');
});

test('every stat line fits the 68px the party column owns', () => {
  // Widest live composition: the longest label, a three-digit current and a
  // three-digit target. The zone must also clear the frame names above them.
  const widest = `${'mag'} 199 > 199`;
  assert.ok(
    pixelTextWidth(CAPTION, widest) <= STAT_ZONE_W,
    `stat line needs ${pixelTextWidth(CAPTION, widest)}px of ${STAT_ZONE_W}px`,
  );
  assert.ok(pixelTextWidth(CAPTION, 'hp 999/999') <= STAT_ZONE_W);
  for (const id of ITEM_IDS) {
    const it = getItem(id);
    for (const key of Object.keys(it.mods)) {
      const line = `${key} 199 > 199`;
      assert.ok(
        pixelTextWidth(CAPTION, line) <= STAT_ZONE_W,
        `${id}: "${line}" overflows the party column`,
      );
    }
  }
});

test('the column never draws past the slot chips at x=236', () => {
  const { events } = renderShopWith('buy0');
  for (const e of inColumn(events)) {
    assert.ok(e.x >= STAT_ZONE_X, `${e.text} starts left of the party column`);
    assert.ok(e.x + e.w <= STAT_ZONE_X + STAT_ZONE_W, `${e.text} runs into the slot chips`);
  }
});

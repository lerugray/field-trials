// M12 shops — seeded-chaotic barter commerce end-to-end tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShop } from '../src/engine/shop.js';
import { createSession } from '../src/engine/session.js';
import { createChargen } from '../src/engine/chargen.js';
import { normalizeItem } from '../src/engine/items.js';
import shopRegister from '../data/register/shop.json' with { type: 'json' };
import chargenData from '../data/register/chargen.json' with { type: 'json' };

const chargen = createChargen(chargenData);
const shop = createShop(shopRegister);

function makeSession(seed = 1) {
  return createSession({ chargen, seed });
}

function stockItem({ name, trueName = name, price, mislabel = false, buildingId = 'shop-test', extra = {} } = {}) {
  const trueItem = normalizeItem({ name: trueName, ...extra });
  const display = normalizeItem({ name, ...extra });
  const rec = { ...display };
  rec._truth = {
    trueName,
    trueItem,
    price,
    mislabel,
    buildingId,
  };
  return rec;
}

test('money tender: buy deducts grey coins and adds the item', () => {
  const s = makeSession();
  s.addMoney(10);
  const item = stockItem({ name: '[SEED] a small tonic', price: { tender: 'money', amount: 3 }, extra: { effect: { kind: 'heal', power: [2, 4] }, charges: 1 } });
  const res = shop.buy(item, s);
  assert.equal(res.ok, true);
  assert.equal(s.money, 7);
  assert.equal(s.items().length, 1);
  assert.equal(s.items()[0].name, item._truth.trueName);
});

test('food tender: buy spends a carried food item', () => {
  const s = makeSession();
  s.addItem({ kind: 'food', name: '[SEED] a ration of grey bread', tags: ['food'] });
  const item = stockItem({ name: '[SEED] a warding charm', price: { tender: 'food', amount: 1 }, extra: { effect: { kind: 'status', status: { id: 'WARDED', polarity: 'good', duration: 3, amount: 2 } }, charges: 1, tags: ['secrets'] } });
  const res = shop.buy(item, s);
  assert.equal(res.ok, true);
  assert.equal(s.items().length, 1);
  assert.equal(s.items()[0].name, item._truth.trueName);
  assert.ok(!s.items().some((it) => (it.tags || []).includes('food')), 'the food item is gone');
});

test('rest-offering tender: buy spends a carried offering', () => {
  const s = makeSession();
  s.addItem({ kind: 'offering', name: '[SEED] a half-empty flask', tags: ['rest-offering'] });
  const item = stockItem({ name: '[SEED] a dried fish', price: { tender: 'rest-offering', amount: 1 }, extra: { tags: ['food'] } });
  const res = shop.buy(item, s);
  assert.equal(res.ok, true);
  assert.equal(s.items().length, 1);
  assert.equal(s.items()[0].name, item._truth.trueName);
});

test('attention tender: buy spends a carried attention item', () => {
  const s = makeSession();
  s.addItem({ kind: 'attention', name: '[SEED] a spool of red thread', tags: ['attention'] });
  const item = stockItem({ name: '[SEED] a wax-sealed letter', price: { tender: 'attention', amount: 1 }, extra: { tags: ['attention'] } });
  const res = shop.buy(item, s);
  assert.equal(res.ok, true);
  assert.equal(s.items().length, 1);
});

test('blood tender: buy costs hp but never drops below 1', () => {
  const s = makeSession();
  s.pc.hp = 5;
  const item = stockItem({ name: '[SEED] a blood-priced knife', price: { tender: 'blood', amount: 3 } });
  const res = shop.buy(item, s);
  assert.equal(res.ok, true);
  assert.equal(s.pc.hp, 2);
  assert.equal(res.before, 5);
  assert.equal(res.after, 2);

  // Refused if it would drop below 1.
  s.pc.hp = 2;
  const res2 = shop.buy(stockItem({ name: '[SEED] a too-bloody thing', price: { tender: 'blood', amount: 2 } }), s);
  assert.equal(res2.ok, false);
  assert.equal(s.pc.hp, 2);
});

test('secrets tender: one secret per shop per life', () => {
  const s = makeSession();
  const item = stockItem({ name: '[SEED] a secret-priced charm', price: { tender: 'secrets', amount: 1 }, buildingId: 'shop-secrets' });
  const res = shop.buy(item, s);
  assert.equal(res.ok, true);
  assert.equal(s.items().length, 1);

  // A second secrets-priced item at the same shop is refused.
  const item2 = stockItem({ name: '[SEED] another secret thing', price: { tender: 'secrets', amount: 1 }, buildingId: 'shop-secrets' });
  const res2 = shop.buy(item2, s);
  assert.equal(res2.ok, false);
  assert.equal(s.items().length, 1, 'no second secret item added');

  // A different shop still accepts the secret.
  const item3 = stockItem({ name: '[SEED] a secret from another room', price: { tender: 'secrets', amount: 1 }, buildingId: 'shop-other' });
  const res3 = shop.buy(item3, s);
  assert.equal(res3.ok, true);
  assert.equal(s.items().length, 2);
});

test('refusal when the player cannot afford', () => {
  const s = makeSession();
  s.addMoney(1);
  const item = stockItem({ name: '[SEED] an expensive thing', price: { tender: 'money', amount: 5 } });
  const res = shop.buy(item, s);
  assert.equal(res.ok, false);
  assert.ok(res.refusal);
  assert.equal(s.items().length, 0);
  assert.equal(s.money, 1);
});

test('mislabeled item reveals its true name on use/equip', () => {
  const s = makeSession();
  s.addMoney(10);
  const trueName = '[SEED] a small tonic';
  // Use a reusable trinket so the item remains in inventory after reveal.
  const item = stockItem({
    name: '[SEED] a rusty hatchet',
    trueName,
    mislabel: true,
    price: { tender: 'money', amount: 2 },
    extra: { kind: 'trinket' },
  });
  const res = shop.buy(item, s);
  assert.equal(res.ok, true);
  const bought = s.items()[0];
  assert.equal(bought.name, '[SEED] a rusty hatchet', 'inventory shows the wrong listing at first');
  assert.equal(bought.trueName, trueName);
  assert.equal(bought.mislabel, true);

  // Reveal by using it.
  s.consumeItem(bought.uid);
  assert.equal(s.items()[0].name, trueName, 'true name revealed after use');
  assert.equal(s.items()[0].mislabel, undefined);
});

test('sell offer: dealer quotes money for 1-3 items and the sale round-trips', () => {
  const s = makeSession();
  s.addItem({ kind: 'trinket', name: '[SEED] a brass token' });
  s.addItem({ kind: 'trinket', name: '[SEED] a corroded key' });
  s.addItem({ kind: 'trinket', name: '[SEED] a folded map' });
  const offer = shop.makeSellOffer(s.items(), 'shop-sell', 12345, 0);
  assert.ok(offer);
  assert.ok(offer.length >= 1 && offer.length <= 3);
  const before = s.money;
  const res = shop.sell(offer, s);
  assert.equal(res.ok, true);
  assert.equal(s.money, before + res.amount);
  // Items actually removed.
  for (const o of offer) {
    assert.ok(!s.items().some((it) => it.uid === o.item.uid), `sold ${o.item.name} removed`);
  }
});

test('stock generation is deterministic and sized 3-6', () => {
  const a = shop.stockFor(1, 0x1234, 0, 'market');
  const b = shop.stockFor(1, 0x1234, 0, 'market');
  assert.equal(a.length, b.length);
  assert.ok(a.length >= 3 && a.length <= 6);
  assert.deepEqual(a.map((x) => x.name), b.map((x) => x.name));
});

test('priceText renders money and item tenders', () => {
  assert.match(shop.priceText({ tender: 'money', amount: 1 }, shop.labels), /grey coin/);
  assert.match(shop.priceText({ tender: 'money', amount: 5 }, shop.labels), /grey coins/);
  assert.equal(shop.priceText({ tender: 'food', amount: 1 }, shop.labels), 'food');
  assert.equal(shop.priceText({ tender: 'blood', amount: 2 }, shop.labels), '2 blood');
});

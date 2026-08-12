// M12 shops — seeded-chaotic barter commerce.
// Pure + deterministic in (world seed, shop/building id, restock epoch, town archetype).
// Mixed tender: money, food, rest-offering, attention, blood (small HP cost), secrets.
// A seeded minority of listings are mislabeled; the true item is revealed on use/equip.
import { mulberry32, hashInt } from './prng.js';
import { normalizeItem } from './items.js';

const MISLABEL_CHANCE = 0.20; // ~1 in 5 listings are slightly wrong
const STOCK_SIZE_MIN = 3;
const STOCK_SIZE_MAX = 6;

// Tender weights: money is the most common, secrets and blood are rarer.
const TENDER_WEIGHTS = [
  { tender: 'money', weight: 40 },
  { tender: 'food', weight: 22 },
  { tender: 'rest-offering', weight: 14 },
  { tender: 'attention', weight: 10 },
  { tender: 'blood', weight: 8 },
  { tender: 'secrets', weight: 6 },
];

function pickWeighted(rng, table) {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const e of table) {
    roll -= e.weight;
    if (roll <= 0) return e.tender;
  }
  return table[table.length - 1].tender;
}

function derivePriceAmount(tender, rng) {
  switch (tender) {
    case 'money': return 2 + Math.floor(rng() * 7); // 2..8 grey coins
    case 'blood': return 1 + Math.floor(rng() * 3);  // 1..3 hp
    default: return 1; // item tenders cost one tagged item
  }
}

function priceText(price, labels) {
  if (price.tender === 'money') return `${price.amount} ${price.amount === 1 ? labels.singular : labels.plural}`;
  if (price.tender === 'blood') return `${price.amount} blood`;
  return price.tender;
}

function normalizeSpec(spec) {
  if (!spec) return null;
  const rec = { ...spec };
  if (rec.tags) rec.tags = rec.tags.slice();
  return normalizeItem(rec);
}

export function createShop(register = {}) {
  const labels = (register && register.currency) || { singular: '[SEED] grey coin', plural: '[SEED] grey coins' };
  const refusal = (register && register.refusal) || {};
  const archetypes = (register && register.archetypes) || {};
  const fallback = (register && register.fallback) || { stock: [] };

  function stockFor(buildingId, worldSeed, epoch = 0, archetype = 'market') {
    const seed = hashInt(buildingId | 0, worldSeed ^ 0x5c4a, (epoch | 0) * 0x9e37) >>> 0;
    const rng = mulberry32(seed || 1);
    const table = (archetypes[archetype] && archetypes[archetype].stock) || fallback.stock || [];
    if (!table.length) return [];

    const count = STOCK_SIZE_MIN + Math.floor(rng() * (STOCK_SIZE_MAX - STOCK_SIZE_MIN + 1));
    const out = [];
    for (let i = 0; i < count; i++) {
      const spec = table[Math.floor(rng() * table.length)];
      let item = normalizeSpec(spec);
      if (!item) continue;

      const tender = pickWeighted(rng, TENDER_WEIGHTS);
      const amount = derivePriceAmount(tender, rng);
      const price = { tender, amount };

      // Mislabel: a seeded minority of listings describe the item slightly wrong.
      // The true item is preserved; the listing name is swapped with another item from the table.
      let mislabel = false;
      let displayName = item.name;
      if (rng() < MISLABEL_CHANCE && table.length > 1) {
        let alt = table[Math.floor(rng() * table.length)];
        let guard = 0;
        while (alt && alt.name === spec.name && guard++ < 10) alt = table[Math.floor(rng() * table.length)];
        if (alt && alt.name !== spec.name) {
          mislabel = true;
          displayName = alt.name;
        }
      }

      // The record given to the player: name is the (possibly wrong) listing.
      const stockItem = { ...item, name: displayName };
      // Hidden truth: store the real item record and mislabel flag on a non-enumerable
      // symbol-ish field? Tests need to inspect it, so use a plain property with a
      // leading underscore — it rides along with the normalized item.
      stockItem._truth = {
        trueName: item.name,
        trueItem: item,
        mislabel,
        price,
        buildingId: buildingId,
      };
      out.push(stockItem);
    }
    return out;
  }

  // Dealer sell offer: 1-3 of your items, each quoted in money. Deterministic in
  // (buildingId, worldSeed, epoch, inventory length).
  function makeSellOffer(inventory, buildingId, worldSeed, epoch = 0) {
    if (!inventory || !inventory.length) return null;
    const seed = hashInt(buildingId | 0, worldSeed ^ 0x7e11, (epoch | 0) * 0x6d2b) >>> 0;
    const rng = mulberry32(seed || 1);
    const count = Math.min(inventory.length, 1 + Math.floor(rng() * 3)); // 1..3
    const offered = [];
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let idx = Math.floor(rng() * inventory.length);
      let guard = 0;
      while (used.has(idx) && guard++ < 10) idx = (idx + 1) % inventory.length;
      used.add(idx);
      const item = inventory[idx];
      const amount = 1 + Math.floor(rng() * 5); // 1..5 grey coins per item
      offered.push({ item, amount, index: idx });
    }
    return offered;
  }

  // Purchase one stock item. Returns { ok, item?, price?, line?, refusal?, before?, after? }.
  function buy(stockItem, session) {
    const truth = stockItem && stockItem._truth;
    if (!truth) return { ok: false, refusal: refusal.default || '[SEED] that is not for sale' };
    const price = truth.price;
    const trueItem = truth.trueItem;

    // Affordance checks.
    if (price.tender === 'money') {
      if ((session.money || 0) < price.amount) {
        return { ok: false, refusal: (refusal.money || '[SEED] the price is ${amount} grey coins; your purse disagrees').replace('${amount}', price.amount) };
      }
    } else if (['food', 'rest-offering', 'attention'].includes(price.tender)) {
      const have = session.items().find((it) => Array.isArray(it.tags) && it.tags.includes(price.tender));
      if (!have) return { ok: false, refusal: refusal[price.tender] || refusal.default };
    } else if (price.tender === 'blood') {
      if ((session.pc.hp || 1) <= price.amount) {
        return { ok: false, refusal: refusal.blood || refusal.default };
      }
    } else if (price.tender === 'secrets') {
      if (!session.tellSecret || !session.tellSecret(buildingIdFor(stockItem))) {
        return { ok: false, refusal: refusal.secrets || refusal.default };
      }
    }

    // Pay.
    let beforeHp = null;
    let afterHp = null;
    if (price.tender === 'money') {
      session.addMoney(-price.amount);
    } else if (['food', 'rest-offering', 'attention'].includes(price.tender)) {
      const have = session.items().find((it) => Array.isArray(it.tags) && it.tags.includes(price.tender));
      session.dropItem(have.uid);
    } else if (price.tender === 'blood') {
      beforeHp = session.pc.hp;
      session.pc.hp = Math.max(1, session.pc.hp - price.amount);
      afterHp = session.pc.hp;
    }

    // Hand over the item carrying the (possibly wrong) listing name. The true
    // capabilities are from the true item; the visible name is the listing. The
    // mislabel flag + trueName ride along for reveal-on-use.
    const bought = { ...trueItem, name: stockItem.name };
    delete bought._truth;
    if (truth.mislabel) {
      bought.mislabel = true;
      bought.trueName = truth.trueName;
    }
    session.addItem(bought);

    let line = (register.buy_line || '[SEED] you lay down the price and take ${item}').replace('${item}', stripSeed(trueItem.name));
    if (price.tender === 'blood') {
      line = (register.blood_buy_line || '[SEED] you pay in blood — ${before}→${after} hp — and take ${item}')
        .replace('${before}', beforeHp).replace('${after}', afterHp).replace('${item}', stripSeed(trueItem.name));
    }
    return { ok: true, item: bought, price, line, before: beforeHp, after: afterHp };
  }

  // Accept a dealer sell offer. Returns { ok, amount, line }.
  function sell(offer, session) {
    if (!offer || !offer.length) return { ok: false };
    let total = 0;
    // Drop in reverse index order so splicing doesn't shift remaining targets.
    const sorted = offer.slice().sort((a, b) => b.index - a.index);
    const removed = [];
    for (const o of sorted) {
      const items = session.items();
      if (o.index < 0 || o.index >= items.length) continue;
      const it = items[o.index];
      if (session.dropItem(it.uid)) {
        total += o.amount;
        removed.push(stripSeed(it.name));
      }
    }
    if (total > 0) session.addMoney(total);
    const itemsStr = removed.length > 1 ? `${removed.slice(0, -1).join(', ')} and ${removed[removed.length - 1]}` : (removed[0] || 'something');
    const line = (register.sell_line || '[SEED] the dealer counts out ${amount} grey coins for ${item}')
      .replace('${amount}', total).replace('${item}', itemsStr);
    return { ok: total > 0, amount: total, line };
  }

  return { stockFor, makeSellOffer, buy, sell, priceText, MISLABEL_CHANCE, register, labels };
}

// Recover a stable building id from a stock item's truth metadata.
function buildingIdFor(stockItem) {
  return (stockItem && stockItem._truth && stockItem._truth.buildingId) || 'shop';
}

function stripSeed(s) {
  return String(s || '').replace(/^\[SEED\]\s*/i, '');
}

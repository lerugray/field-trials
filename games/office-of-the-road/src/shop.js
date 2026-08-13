// shop.js — THE QUARTERMASTER (DESIGN-SEED M4). A town's shop: a stocked set of
// equipment lines (gold-priced, curved by leg so no early run-ending spike) plus
// an ALWAYS-OPEN resupply sink. The economy's closed loop lives here: combat +
// mandates pay gold IN; equipment and resupply take it OUT, and resupply can
// never sell out — there is always somewhere for gold to go.
//
// Stock is a PURE function of (seed, legIndex): re-entering the same town yields
// the same lines, and it never consumes a live RNG stream (so it can't perturb
// mandate/terrain/combat determinism). Buying/selling mutate the party ledger +
// inventory; the live town/shop surface is captured by the v5 run save and
// restored exactly after a reload.
//
// Register laws 1,2,6: the quartermaster deals in standardized issue, priced and
// numeric. Prose is deadpan; every line ships its exact figure.

import { TUNING } from './tuning.js';
import { hashInt } from './prng.js';
import { Stream } from './rng.js';
import { ITEMS, ITEM_IDS, getItem, itemsUnlockedBy, sellValue } from './items.js';
import { spendGold, earnGold } from './party.js';

// A distinct salt so shop generation is independent of every named stream.
const SHOP_SALT = 0x510c17e; // "stockit"-ish; fixed constant, part of nothing saved

// generateShop: the quartermaster's board at a town on `legIndex`, deterministic
// under `seed`. Stocks up to shopStockSize distinct equipment lines from those
// UNLOCKED at this leg (minLeg gate). Later legs unlock dearer tiers, so the
// spike is curved, not sudden. Returns { legIndex, lines:[{id, price, sold}] }.
export function generateShop(seed, legIndex) {
  const pool = itemsUnlockedBy(legIndex).slice();
  const stream = new Stream(hashInt(SHOP_SALT, legIndex, seed >>> 0));
  const lines = [];
  const n = Math.min(TUNING.shopStockSize, pool.length);
  for (let i = 0; i < n; i++) {
    const k = stream.int(pool.length);
    const id = pool.splice(k, 1)[0];
    lines.push({ id, price: getItem(id).price, sold: false });
  }
  // Stable display order: cheapest first, then by id (deterministic).
  lines.sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
  return { legIndex, lines };
}

// buyLine: purchase the shop line at index `li` into the party inventory. Refuses
// (returns a reason) if already sold or the ledger can't cover it. Loud, never
// silent — the caller surfaces the reason.
export function buyLine(party, shop, li) {
  const line = shop.lines[li];
  if (!line) return { ok: false, reason: 'no such line' };
  if (line.sold) return { ok: false, reason: 'already requisitioned' };
  if ((party.gold | 0) < line.price) return { ok: false, reason: `insufficient — ${party.gold}¤ < ${line.price}¤` };
  spendGold(party, line.price);
  party.inventory = party.inventory || [];
  party.inventory.push(line.id);
  line.sold = true;
  return { ok: true, id: line.id, spent: line.price, gold: party.gold };
}

// sellItem: return an UNEQUIPPED inventory item to the quartermaster for a
// fraction of price. Refuses if the item isn't in the loose inventory.
export function sellItem(party, invIndex) {
  const inv = party.inventory || [];
  const id = inv[invIndex];
  if (id == null) return { ok: false, reason: 'no such item' };
  const value = sellValue(id);
  inv.splice(invIndex, 1);
  earnGold(party, value);
  return { ok: true, id, value, gold: party.gold };
}

// resupply: the ALWAYS-OPEN sink — buy one block of supplies for gold. Never
// sold out; independent of stock. Refuses only if the ledger can't cover a block.
export function resupply(party) {
  if ((party.gold | 0) < TUNING.resupplyCost) return { ok: false, reason: `insufficient — ${party.gold}¤ < ${TUNING.resupplyCost}¤` };
  spendGold(party, TUNING.resupplyCost);
  party.supplies += TUNING.resupplyBlock;
  return { ok: true, added: TUNING.resupplyBlock, spent: TUNING.resupplyCost, supplies: party.supplies, gold: party.gold };
}

// isTownLeg: is the pause point after completing `legIndex` a town? Deterministic
// cadence — every townEveryLegs-th leg carries a quartermaster.
export function isTownLeg(legIndex) {
  return TUNING.townEveryLegs > 0 && ((legIndex + 1) % TUNING.townEveryLegs === 0);
}

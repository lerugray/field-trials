// The hangar shop — base upgrades (hull/blaster/boost-charge) and the wingmate
// contract sink past them. Pure logic over the ledger; spending goes through the
// ledger so the currency-integrity law still holds after every purchase.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from '../src/economy/ledger.js';
import {
  UPGRADES, UPGRADE_IDS, CONTRACTS, maxTier,
  priceOf, buyUpgrade, buyContract, contractsUnlocked,
  upgradeEffects, shopState,
} from '../src/economy/upgrades.js';

function funded(amount) {
  const store = { _m: new Map(), getItem(k){return this._m.has(k)?this._m.get(k):null;}, setItem(k,v){this._m.set(k,String(v));} };
  const L = createLedger(store);
  L.earn(amount);
  return L;
}

test('there are exactly three base upgrade tracks: hull, blaster, boost', () => {
  assert.deepEqual(UPGRADE_IDS.sort(), ['blaster', 'boost', 'hull']);
  for (const id of UPGRADE_IDS) assert.ok(UPGRADES[id].costs.length >= 1);
});

test('buying a base tier costs the listed price and raises the tier', () => {
  const L = funded(1000);
  assert.equal(L.upgradeTier('hull'), 0);
  const price = priceOf(L, 'hull');
  const bal0 = L.balance();
  const r = buyUpgrade(L, 'hull');
  assert.equal(r.ok, true);
  assert.equal(r.tier, 1);
  assert.equal(L.upgradeTier('hull'), 1);
  assert.equal(L.balance(), bal0 - price);
  assert.ok(L.ok());
});

test('a track maxes out and then refuses further purchase', () => {
  const L = funded(5000);
  const n = maxTier('blaster');
  for (let i = 0; i < n; i++) assert.equal(buyUpgrade(L, 'blaster').ok, true);
  assert.equal(L.upgradeTier('blaster'), n);
  assert.equal(priceOf(L, 'blaster'), null);
  const r = buyUpgrade(L, 'blaster');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'maxed');
});

test('an unaffordable purchase is refused and changes nothing', () => {
  const L = funded(10);
  const r = buyUpgrade(L, 'blaster'); // costs 50
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'poor');
  assert.equal(L.upgradeTier('blaster'), 0);
  assert.equal(L.balance(), 10);
  assert.ok(L.ok());
});

test('effects scale with owned tiers', () => {
  const L = funded(5000);
  const before = upgradeEffects(L);
  assert.equal(before.bonusHull, 0);
  assert.equal(before.blasterDamageBonus, 0);
  assert.equal(before.boostChargeMul, 1);
  buyUpgrade(L, 'hull'); buyUpgrade(L, 'hull');   // tier 2
  buyUpgrade(L, 'blaster');                        // tier 1
  buyUpgrade(L, 'boost');                          // tier 1
  const e = upgradeEffects(L);
  assert.equal(e.bonusHull, 2 * UPGRADES.hull.hullPerTier);
  assert.equal(e.blasterDamageBonus, 1 * UPGRADES.blaster.damagePerTier);
  assert.ok(e.boostChargeMul > 1);
  assert.ok(e.boostRegenMul > 1);
});

test('contracts are LOCKED until every base track is maxed (the sink past them)', () => {
  const L = funded(9000);
  assert.equal(contractsUnlocked(L), false);
  const early = buyContract(L, CONTRACTS[0].id);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'locked');
  // max all base tracks
  for (const id of UPGRADE_IDS) {
    for (let i = 0; i < maxTier(id); i++) buyUpgrade(L, id);
  }
  assert.equal(contractsUnlocked(L), true);
  const r = buyContract(L, CONTRACTS[0].id);
  assert.equal(r.ok, true);
  assert.equal(L.hasContract(CONTRACTS[0].id), true);
  // buying the same contract again is refused
  assert.equal(buyContract(L, CONTRACTS[0].id).reason, 'owned');
  assert.ok(L.ok());
});

test('each owned contract raises the passive Salvage multiplier', () => {
  const L = funded(20000);
  for (const id of UPGRADE_IDS) for (let i = 0; i < maxTier(id); i++) buyUpgrade(L, id);
  assert.equal(upgradeEffects(L).salvageMul, 1);
  buyContract(L, CONTRACTS[0].id);
  const e = upgradeEffects(L);
  assert.ok(e.salvageMul > 1);
  assert.equal(e.contractCount, 1);
});

test('shopState is a coherent UI snapshot', () => {
  const L = funded(60);
  const s = shopState(L);
  assert.equal(s.balance, 60);
  assert.equal(s.base.length, 3);
  const hull = s.base.find((b) => b.id === 'hull');
  assert.equal(hull.tier, 0);
  assert.equal(hull.affordable, true);   // hull tier 1 costs 40, we have 60
  const blaster = s.base.find((b) => b.id === 'blaster');
  assert.equal(blaster.affordable, true);  // costs 50, we have 60
  const boost = s.base.find((b) => b.id === 'boost');
  assert.equal(boost.tier, 0);
  assert.equal(s.contracts.length, CONTRACTS.length);
  assert.equal(s.contracts.every((c) => c.locked), true); // nothing maxed yet
  assert.equal(s.contractsUnlocked, false);
});

test('the contract salvage dividend flows through recordRun bonusMul', () => {
  const L = funded(0);
  const summary = { totalKills: 10, totalScore: 400, levelsFlown: 2, runMedal: 'silver', victory: false };
  // baseline payout at mul 1
  const base = L.recordRun(summary, 'a').salvage;
  const boosted = L.recordRun(summary, 'b', 1.16).salvage;
  assert.ok(boosted > base, 'a >1 multiplier must pay more');
  assert.ok(L.ok());
});

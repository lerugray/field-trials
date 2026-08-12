// The hangar shop — M6's economy sink, run by Kirby (the fussy poodle mechanic who
// is proud of every upgrade). Pure catalog + purchase logic over the ledger; it
// never touches balances directly (it spends through ledger.spend), so the currency
// integrity law is untouched. It returns effect DELTAS only; main.js owns applying
// them to its base PLAYER/WEAPON/flight constants (no coupling, no import cycle).
//
// Two layers, per DESIGN-SEED M6:
//   * BASE UPGRADES — hull, blaster, boost-charge. Three tracks, three tiers each,
//     ramping cost. These are the bread-and-butter progression.
//   * WINGMATE CONTRACTS — the sink PAST the base upgrades. They unlock only once all
//     base tracks are maxed, and each contracted hand hauls a little more Salvage home
//     (a passive support bonus). The full wingmate system (species/name/trait/bark,
//     rescue beats) is M7 by the plan; an M6 contract is the honest economic seam:
//     a permanent purchase that pays a passive dividend. Flagged in PROGRESS.

// Base-upgrade tracks. costs[i] is the price to buy tier i+1 (from tier i). tier
// starts at 0 (unowned) and maxes at costs.length. Effects grow one step per tier.
export const UPGRADES = {
  hull: {
    id: 'hull', name: 'Hull Plating', track: 'HULL',
    blurb: 'More plates between you and the black.',
    costs: [40, 90, 160],
    hullPerTier: 2,        // +2 max hull per tier (base 6 -> up to 12)
  },
  blaster: {
    id: 'blaster', name: 'Blaster Coils', track: 'BLASTER',
    blurb: 'Hotter bolts. They hit like they mean it.',
    costs: [50, 110, 190],
    damagePerTier: 1,      // +1 bolt damage per tier (tier 3 one-shots a gunner)
  },
  boost: {
    id: 'boost', name: 'Boost Cells', track: 'BOOST',
    blurb: 'Faster charge, quicker second wind.',
    costs: [45, 100, 170],
    chargeMulPerTier: 0.18,  // charge shot winds up faster
    regenMulPerTier: 0.15,   // boost/brake meter refills quicker
  },
};

export const UPGRADE_IDS = ['hull', 'blaster', 'boost'];
export const maxTier = (id) => UPGRADES[id].costs.length;

// Wingmate contracts — the end-sink. Hand-authored NAMES (Cuckoo/Leon/Kirby are never
// recruits; these warm, in-register names are not the memorial cast). In M7 the seam
// MATURED into the mechanic it always sold: each hired veteran now flies the run with
// you as a named wing in your procedural squad (runflow draws the roster from these
// names) AND keeps paying the passive Salvage dividend from being on the crew. Fly one
// home safe and you also keep their in-run support and callouts; a distress can still
// down them for a run (they are recovered by the next). The name -> wing link is by
// `name`, which is what generateRoster consumes.
export const CONTRACTS = [
  { id: 'wing-vesper', name: 'Vesper', blurb: 'A quiet hand who never misses pickup duty. Flies your wing.', cost: 400, salvageBonus: 0.08 },
  { id: 'wing-tuck',   name: 'Tuck',   blurb: 'Loud, cheerful, hauls twice his weight in scrap. Flies your wing.', cost: 600, salvageBonus: 0.08 },
  { id: 'wing-marlowe',name: 'Marlowe',blurb: 'Reads a debris field like a map. Flies your wing and finds the good salvage.', cost: 800, salvageBonus: 0.09 },
];
export const contractById = (id) => CONTRACTS.find((c) => c.id === id) || null;

// The hired-veteran names, in contract order — what runflow feeds to generateRoster so
// each owned contract adds its named wing to the run's squad.
export function contractedNames(ledger) {
  return CONTRACTS.filter((c) => ledger.hasContract(c.id)).map((c) => c.name);
}

// Price to buy the next tier of a base track, or null if the track is maxed.
export function priceOf(ledger, id) {
  const u = UPGRADES[id];
  const tier = ledger.upgradeTier(id);
  return tier >= u.costs.length ? null : u.costs[tier];
}

// Buy the next tier of a base track. Refuses a maxed track or an unaffordable price.
export function buyUpgrade(ledger, id) {
  const u = UPGRADES[id];
  if (!u) return { ok: false, reason: 'unknown' };
  const tier = ledger.upgradeTier(id);
  if (tier >= u.costs.length) return { ok: false, reason: 'maxed' };
  const price = u.costs[tier];
  if (!ledger.spend(price)) return { ok: false, reason: 'poor' };
  ledger.setUpgrade(id, tier + 1);
  return { ok: true, id, tier: tier + 1, price };
}

// Contracts open only once every base track is maxed — the sink "past" the base.
export function contractsUnlocked(ledger) {
  return UPGRADE_IDS.every((id) => ledger.upgradeTier(id) >= maxTier(id));
}

export function buyContract(ledger, id) {
  const c = contractById(id);
  if (!c) return { ok: false, reason: 'unknown' };
  if (ledger.hasContract(id)) return { ok: false, reason: 'owned' };
  if (!contractsUnlocked(ledger)) return { ok: false, reason: 'locked' };
  if (!ledger.spend(c.cost)) return { ok: false, reason: 'poor' };
  ledger.addContract(id);
  return { ok: true, id, price: c.cost };
}

// The gameplay effect DELTAS from everything currently owned. main.js reads these and
// applies them to its base constants; upgrades.js stays decoupled and pure.
export function upgradeEffects(ledger) {
  const hullTier = ledger.upgradeTier('hull');
  const blasterTier = ledger.upgradeTier('blaster');
  const boostTier = ledger.upgradeTier('boost');
  const owned = CONTRACTS.filter((c) => ledger.hasContract(c.id));
  const salvageBonus = owned.reduce((a, c) => a + c.salvageBonus, 0);
  return {
    bonusHull: hullTier * UPGRADES.hull.hullPerTier,
    blasterDamageBonus: blasterTier * UPGRADES.blaster.damagePerTier,
    boostChargeMul: 1 + boostTier * UPGRADES.boost.chargeMulPerTier,
    boostRegenMul: 1 + boostTier * UPGRADES.boost.regenMulPerTier,
    salvageMul: 1 + salvageBonus,     // contracts pay a passive Salvage dividend
    contractCount: owned.length,
  };
}

// A UI-ready snapshot of the whole shop for the hub screen: base tracks with their
// current tier / next price / state, and the contract list with its lock state.
export function shopState(ledger) {
  const bal = ledger.balance();
  const base = UPGRADE_IDS.map((id) => {
    const u = UPGRADES[id];
    const tier = ledger.upgradeTier(id);
    const maxed = tier >= u.costs.length;
    const price = maxed ? null : u.costs[tier];
    return {
      id, name: u.name, track: u.track, blurb: u.blurb,
      tier, max: u.costs.length, maxed, price,
      affordable: !maxed && bal >= price,
    };
  });
  const unlocked = contractsUnlocked(ledger);
  const contracts = CONTRACTS.map((c) => {
    const owned = ledger.hasContract(c.id);
    return {
      id: c.id, name: c.name, blurb: c.blurb, cost: c.cost,
      owned, locked: !unlocked && !owned,
      affordable: unlocked && !owned && bal >= c.cost,
    };
  });
  return { balance: bal, base, contracts, contractsUnlocked: unlocked };
}

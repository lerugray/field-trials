// The run session — permadeath with a persistent world
// (CHARACTER-DESIGN-2026-08-02: "The PC dies for good ... roll a new stranger
// into the SAME seeded world; map, cleared sites, and world history remain").
//
// The session owns the mortal, replaceable layer (the current PC + roster + hp)
// and the immortal layer that survives death (cleared sites, death count, a
// terse history). It also orchestrates a combat from the current roster and an
// encounter's foes, and syncs survivors back afterward.
import { createRoster, createCharacter } from './character.js';
import { createCombat } from './combat.js';
import { normalizeItem } from './items.js';
import { mulberry32 } from './prng.js';

// Strip a leading [SEED] marker so a "stowed X" re-wrap doesn't double the tag.
const stripMark = (s) => String(s).replace(/^\[SEED\]\s*/i, '');

export function createSession({ chargen, seed = 0, capacity = 2 } = {}) {
  if (!chargen) throw new Error('createSession: needs a chargen');
  // Follower capacity (M12 E6): grows on WORLD milestones, applied by the shell via
  // setCapacity. A fresh stranger's roster is built at the current capacity, so the
  // world-persistent share (opened gates, cleared biomes) carries across permadeath.
  let capacityFloor = Math.max(1, capacity | 0);

  // Immortal layer — persists across PC deaths.
  const cleared = new Set();
  const history = [];
  let deaths = 0;
  // The lineage / death-log (M12 C3): a permanent WORLD roll of dead strangers — the
  // world remembers who walked it. Each entry: name, days survived, killer, deeds
  // (gates opened, sites cleared, followers lost during that life). Never reset on death.
  const lineage = [];
  // Per-LIFE deed counters (reset when a fresh stranger is dealt) — the deeds a single
  // stranger accrues, banked into their lineage entry at death.
  let life = { clears: 0, followersLost: 0, gatesOpened: 0 };
  let bornTick = 0; // the run clock when the current stranger was dealt (for days-survived)

  // A reroll seed the deal-a-stranger loop advances; deterministic per session.
  let rerollSeed = (seed >>> 0) || 1;
  let pc = null;
  let roster = null;
  // Live pattern exposure: a mortal 0..1 clock. Dungeon travel raises it, with
  // hidden FNORD only modulating the gain; safe rest or death clears it. The
  // journal and encounter pressure read this same value.
  let exposure = 0;
  // Lodge memberships — the initiation ladder's rungs. Mortal-layer state: a new
  // stranger starts uninitiated (cleared on death alongside the roster).
  let memberships = new Set();
  // Inventory (M10 Part B — loot). Mortal-layer: what this stranger has picked up
  // (salvage, trinkets, cache relics). Cleared on death like the roster; each item
  // gets a session-unique uid so the shell can equip/drop a specific one.
  let inventory = [];
  let itemUid = 0;
  // M12 shops — a light currency tracked across lives (found in caches/loot and
  // earned by selling). The purse persists death because the world persists.
  let money = 0;
  // One secret per shop per life: the "tell the dealer something" interaction.
  let shopSecretsTold = new Set();
  // Equipment (M11 §1b) — exactly three slots: weapon / armor / accessory. The weapon
  // slot's live profile IS pc.weapon (the only thing combat's ATTACK reads — power from
  // items). armor/accessory hold their equipped item records here; combat's adaptive
  // DEFENSE reads armor, and the accessory is the flexible found-object slot. Mortal
  // layer: reset on death with the rest of the pack.
  let equipment = { armor: null, accessory: null };
  function addItem(item) {
    if (!item) return null;
    const it = { uid: `it${++itemUid}`, ...item };
    inventory.push(it);
    return it;
  }
  function dropItem(uid) {
    const i = inventory.findIndex((x) => x.uid === uid);
    if (i < 0) return false;
    inventory.splice(i, 1);
    return true;
  }
  // M12 shops — reveal a mislabeled listing the first time it is used or equipped.
  // Returns true if a reveal happened. The true name is written back onto the item.
  function revealItem(uid) {
    const it = inventory.find((x) => x.uid === uid);
    if (!it || !it.mislabel) return false;
    it.name = it.trueName || it.name;
    delete it.mislabel;
    delete it.trueName;
    return true;
  }
  // Apply a combat item use to the pack: a finite-charge consumable loses a charge (and
  // is removed at zero); a reusable item is untouched. Returns the remaining charges (or
  // null for reusable / not-found). The combat engine reports {uid, spent} to drive this.
  function consumeItem(uid) {
    revealItem(uid); // M12: mislabel reveal-on-use
    const it = inventory.find((x) => x.uid === uid);
    if (!it) return null;
    if (it.charges == null) return null; // reusable — nothing to spend
    it.charges = Math.max(0, (it.charges | 0) - 1);
    if (it.charges === 0) dropItem(uid);
    return it.charges;
  }
  // Equip an item into its slot (weapon / armor / accessory), routed by the item data
  // model (items.js reads which slot a record fills from its composable fields). The
  // swap is reversible: whatever occupied the slot is stowed back into the pack. A
  // slotless item (a pure trinket/relic/consumable) is a no-op. Power-from-items: the
  // weapon slot's profile becomes pc.weapon, the only thing combat's ATTACK reads.
  function equip(uid) {
    const raw = inventory.find((x) => x.uid === uid);
    if (!raw) return false;
    const it = normalizeItem(raw);
    const slot = it && it.slot;
    if (!slot) return false; // not equippable

    if (slot === 'weapon') {
      revealItem(uid); // M12: mislabel reveal-on-equip
      const old = pc.weapon;
      pc.weapon = { name: it.weapon.name, dmg: it.weapon.dmg.slice() };
      dropItem(uid);
      if (old && Array.isArray(old.dmg)) addItem({ kind: 'weapon', name: `[SEED] stowed ${stripMark(old.name || 'weapon')}`, weapon: { name: old.name, dmg: old.dmg.slice() } });
      return true;
    }
    // armor / accessory: swap the slot's held record, stow the previous one back.
    revealItem(uid); // M12: mislabel reveal-on-equip
    const prev = equipment[slot];
    equipment[slot] = { ...raw };
    dropItem(uid);
    if (prev) addItem({ ...prev, name: `[SEED] stowed ${stripMark(prev.name || slot)}` });
    return true;
  }
  // The live equipped set across all three slots (weapon profile mirrors pc.weapon).
  function equipped() {
    return {
      weapon: pc && pc.weapon ? { name: pc.weapon.name, dmg: pc.weapon.dmg.slice() } : null,
      armor: equipment.armor ? { ...equipment.armor } : null,
      accessory: equipment.accessory ? { ...equipment.accessory } : null,
    };
  }

  // Deal a fresh stranger into the current world. Unlimited at creation and the
  // sole outcome of death. Orphaned followers are dropped for now (the "persist
  // somewhere, recruitable again" hook is banked, per the design doc).
  function reroll() {
    rerollSeed = (rerollSeed * 1664525 + 1013904223) >>> 0; // LCG step: next stranger
    pc = chargen.rollSeeded(rerollSeed);
    roster = createRoster(pc, { capacity: capacityFloor });
    memberships = new Set(); // a new stranger is uninitiated
    inventory = []; // ...and carries nothing yet (mortal layer, lost on death)
    equipment = { armor: null, accessory: null }; // ...and wears nothing found
    shopSecretsTold = new Set(); // M12: a new life has fresh secrets to tell
    life = { clears: 0, followersLost: 0, gatesOpened: 0 }; // a fresh life keeps no deeds yet
    exposure = 0;
    return pc;
  }
  reroll(); // deal the first stranger

  // E6: set the follower capacity from world milestones (the shell computes the target).
  // Absolute + bounded; applied to the live roster and remembered for the next stranger.
  function setCapacity(n) {
    capacityFloor = Math.max(1, n | 0);
    if (roster) roster.setCapacity(capacityFloor);
    return capacityFloor;
  }

  function accrueExposure(amount = 0) {
    const base = Math.max(0, Number(amount) || 0);
    const fnordFactor = 0.85 + 0.15 * ((pc && pc._fnordIndex) || 0);
    exposure = Math.max(0, Math.min(1, exposure + base * fnordFactor));
    return exposure;
  }
  function clearExposure() { exposure = 0; return exposure; }

  // Rest economics (M12 A3 / playtest2 rest gating). Rest is only permitted at safe
  // locations — inns and shrines inside towns. The open field refuses; recovery there
  // is consumable-only. Every safe path reports before→after HP so the shell can
  // voice it (Part A: "always reports").
  //   'inn' | 'shrine' — FULL heal; FREE while the world holds no cleared dungeon, then
  //       it costs one carried item tagged `rest-offering`. No offering and not free →
  //       refused, no heal.
  //   any other context (e.g. 'camp') — refused with reason 'not-safe'.
  // Returns { ok, context, before, after, healed, free?, offering?, reason? }.
  function rest(context = 'camp') {
    const before = pc.hp;
    if (context !== 'inn' && context !== 'shrine') {
      return { ok: false, context, before, after: pc.hp, healed: 0, free: false, reason: 'not-safe' };
    }
    const free = cleared.size === 0;
    let offering = null;
    if (!free) {
      offering = inventory.find((it) => Array.isArray(it.tags) && it.tags.includes('rest-offering')) || null;
      if (!offering) return { ok: false, context, before, after: pc.hp, healed: 0, free, reason: 'no-offering' };
      dropItem(offering.uid);
    }
    pc.hp = pc.maxHp;
    roster.healAll();
    const exposureBefore = exposure;
    clearExposure();
    return { ok: true, context, before, after: pc.hp, healed: pc.hp - before, free, offering: offering ? offering.name : null, exposureBefore, exposureAfter: exposure };
  }

  // Out-of-combat consumable use (playtest2 field recovery). Only healing effects are
  // usable in the field; other effects resolve inside combat. A finite-charge item is
  // consumed exactly as in combat. Respects the item's own heal band as the dial.
  function useItem(uid, seed = 1) {
    const raw = inventory.find((x) => x.uid === uid);
    if (!raw) return { ok: false, reason: 'missing' };
    const it = normalizeItem(raw);
    if (!it || !it.effect || it.effect.kind !== 'heal' || it.charges === 0) {
      return { ok: false, reason: 'not-usable' };
    }
    const rng = mulberry32(((seed >>> 0) || 1) ^ ((uid >>> 0) * 0x9e3779b1 >>> 0));
    const p = it.effect.power;
    const band = Array.isArray(p) ? p : [p, p];
    const amt = Math.max(1, band[0] + Math.floor(rng() * (band[1] - band[0] + 1)));
    const before = pc.hp;
    pc.hp = Math.min(pc.maxHp, pc.hp + amt);
    const after = pc.hp;
    const healed = after - before;
    consumeItem(uid);
    return { ok: true, kind: 'heal', before, after, healed, name: it.name };
  }

  // Death: permadeath. The world persists; a new stranger is dealt in. Before the
  // reroll, bank this stranger's LINEAGE entry into permanent world state (C3): who
  // they were, how long they lasted (atTick − bornTick), what killed them, their deeds.
  function die(cause = null, atTick = bornTick) {
    deaths += 1;
    const days = Math.max(0, (atTick | 0) - bornTick);
    lineage.push({ name: pc.name, days, killer: cause || 'the tail', deeds: { ...life } });
    history.push({ event: 'death', name: pc.name, cause, at: cleared.size });
    reroll();
    bornTick = atTick | 0; // the new stranger is dealt at this moment
    return pc;
  }

  function clearSite(id) {
    if (id == null) return false;
    const first = !cleared.has(id);
    cleared.add(id);
    if (first) { history.push({ event: 'cleared', site: id }); life.clears += 1; }
    return first;
  }
  // A gate opened counts toward the current life's deeds (E lands the caller).
  function noteGateOpened() { life.gatesOpened += 1; }
  const isCleared = (id) => cleared.has(id);

  // M12 shops — currency and secret-economy helpers.
  function addCoins(n) { money = Math.max(0, money + (n | 0)); return money; }
  const addMoney = addCoins;
  function tellSecret(shopId) {
    if (shopId == null || shopSecretsTold.has(shopId)) return false;
    shopSecretsTold.add(shopId);
    return true;
  }

  // Start a combat from the current roster vs an encounter's foes. Returns a
  // combat bound to the pc + roster (so talk/recruit work).
  function startCombat(encounter, combatSeed = 0, opts = {}) {
    if (!encounter || encounter.kind !== 'fight') throw new Error('startCombat: not a fight encounter');
    // Feed the equipped armor into combat: its absorb becomes the PC combatant's passive
    // soak, and its profile biases the adaptive-defense flavor (M11 §1b).
    const armorItem = equipment.armor ? normalizeItem(equipment.armor) : null;
    const pcArmor = armorItem ? armorItem.armor : null;
    const armorAbsorb = pcArmor ? pcArmor.absorb : 0;
    const party = roster.toCombatants().map((c) => (c.id === 'pc' ? { ...c, armorAbsorb } : c));
    return createCombat({
      party,
      foes: encounter.foes,
      seed: combatSeed >>> 0,
      pc,
      roster,
      pcArmor,
      narrate: opts.narrate || null,
      targeting: opts.targeting || null,
    });
  }

  // Sync a finished combat back onto the persistent party: write survivors' hp,
  // remove fallen followers (permadeath), and trigger PC death on a loss. Returns
  // a summary the shell can narrate.
  function resolveCombat(combat, atTick = bornTick) {
    if (!combat.over) throw new Error('resolveCombat: combat not finished');
    // Write surviving hp back: the PC by hand, followers through the roster.
    const pcc = combat.combatants.find((c) => c.id === 'pc');
    if (pcc) pc.hp = pcc.hp;
    roster.syncHp(combat.combatants);
    // Fallen followers are gone for good (follower permadeath). Count them as a deed
    // of THIS life before any death banks the lineage entry (C3).
    const dead = [];
    for (const c of combat.combatants) {
      if (c.side === 'party' && c.id !== 'pc' && c.hp <= 0) { roster.dismiss(c.id); dead.push(c.id); }
    }
    life.followersLost += dead.length;
    const lost = combat.outcome === 'lose';
    if (lost) {
      const foe = typeof combat.living === 'function' ? combat.living('foe')[0] : null;
      die(foe ? stripMark(foe.name) : 'the tail', atTick);
    }
    return { outcome: combat.outcome, deadFollowers: dead, recruited: combat.recruited, pcDied: lost };
  }

  // Lodge membership — the initiation ladder. join is idempotent; memberships
  // are the PC's and reset when a new stranger is dealt.
  function joinLodge(id) { if (id == null) return false; const first = !memberships.has(id); memberships.add(id); return first; }
  const isMember = (id) => memberships.has(id);

  // Save/load: capture the whole run (mortal + immortal layers) as a plain,
  // JSON-able snapshot, and rebuild it. Deterministic — restore(serialize())
  // reproduces the run exactly (statline, hp, roster, world progress).
  function serialize() {
    return {
      rerollSeed, deaths, bornTick, capacityFloor,
      cleared: [...cleared],
      memberships: [...memberships],
      history: history.slice(),
      lineage: lineage.map((e) => ({ ...e, deeds: { ...e.deeds } })),
      life: { ...life },
      exposure,
      pc: { name: pc.name, portrait: pc.portrait, stats: pc.stats(), fnord: pc._fnord, omen: pc.omen, oddment: pc.oddment, hp: pc.hp, maxHp: pc.maxHp, weapon: pc.weapon },
      followers: roster.serialize(),
      inventory: inventory.map((it) => ({ ...it })),
      itemUid,
      equipment: { armor: equipment.armor ? { ...equipment.armor } : null, accessory: equipment.accessory ? { ...equipment.accessory } : null },
      money,
      shopSecretsTold: [...shopSecretsTold],
    };
  }
  function restore(data) {
    if (!data || !data.pc) throw new Error('session.restore: bad snapshot');
    const p = data.pc;
    pc = createCharacter({ name: p.name, portrait: p.portrait, stats: p.stats, fnord: p.fnord, omen: p.omen, oddment: p.oddment, hp: p.maxHp ?? p.hp });
    pc.hp = p.hp ?? pc.maxHp;
    // Re-apply the equipped weapon if the saved stranger had swapped off the oddment.
    if (p.weapon && Array.isArray(p.weapon.dmg)) pc.weapon = { name: p.weapon.name, dmg: p.weapon.dmg.slice() };
    roster = createRoster(pc, { capacity: capacityFloor });
    roster.load(data.followers);
    cleared.clear(); for (const id of data.cleared || []) cleared.add(id);
    memberships = new Set(data.memberships || []);
    inventory = (data.inventory || []).map((it) => ({ ...it }));
    itemUid = data.itemUid | 0;
    money = data.money | 0;
    shopSecretsTold = new Set(data.shopSecretsTold || []);
    equipment = {
      armor: data.equipment && data.equipment.armor ? { ...data.equipment.armor } : null,
      accessory: data.equipment && data.equipment.accessory ? { ...data.equipment.accessory } : null,
    };
    history.length = 0; for (const h of data.history || []) history.push(h);
    deaths = data.deaths | 0;
    lineage.length = 0; for (const e of data.lineage || []) lineage.push({ ...e, deeds: { ...(e.deeds || {}) } });
    life = data.life ? { clears: data.life.clears | 0, followersLost: data.life.followersLost | 0, gatesOpened: data.life.gatesOpened | 0 } : { clears: 0, followersLost: 0, gatesOpened: 0 };
    bornTick = data.bornTick | 0;
    exposure = Math.max(0, Math.min(1, Number(data.exposure) || 0));
    if (data.capacityFloor) { capacityFloor = Math.max(1, data.capacityFloor | 0); roster.setCapacity(capacityFloor); }
    rerollSeed = (data.rerollSeed >>> 0) || rerollSeed;
    return pc;
  }

  return {
    get pc() { return pc; },
    get roster() { return roster; },
    get deaths() { return deaths; },
    get history() { return history.slice(); },
    get money() { return money; },
    get exposure() { return exposure; },
    serialize,
    restore,
    memberships: () => [...memberships],
    joinLodge,
    isMember,
    clearedSites: () => [...cleared],
    lineage: () => lineage.map((e) => ({ ...e, deeds: { ...e.deeds } })),
    life: () => ({ ...life }),
    noteGateOpened,
    setCapacity,
    accrueExposure,
    clearExposure,
    get capacity() { return capacityFloor; },
    items: () => inventory.map((it) => ({ ...it })),
    addItem,
    dropItem,
    consumeItem,
    useItem,
    equip,
    equipped,
    reroll,
    rest,
    die,
    clearSite,
    isCleared,
    startCombat,
    resolveCombat,
    addMoney,
    addCoins,
    tellSecret,
    revealItem,
  };
}

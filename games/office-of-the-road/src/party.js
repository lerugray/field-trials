// party.js — THE PARTY (DESIGN-SEED M2). Four frames the Office assigns to a
// road, each running a job (its fixed kit). Attrition is the core: HP and the
// expedition's supply reserve PERSIST across encounters and recover only at
// camps/towns, at cost. Pure + serializable (folds into the save envelope).
//
// A frame: { id, jobId, name, max (derived stat block), hp (current), alive }.
// A party: { frames: [...], supplies }.

import { TUNING } from './tuning.js';
import { getJob, deriveStats, DEFAULT_PARTY } from './jobs.js';
import { applyMods, getItem, SLOTS } from './items.js';

// frameStats: a frame's LIVE stat block = the job's derived block (chassis ×
// weights × job-mastery overlay) with the equipment overlay folded in. Combat
// reads frame.max, so keeping max = frameStats(...) means both equipment (M4) and
// mastery (M5) flow into resolution with no change to the resolver. `masteryMult`
// defaults to 1 (a fresh ledger), preserving the M2 baseline. Pure.
export function frameStats(jobId, equip, masteryMult = 1) {
  return applyMods(deriveStats(jobId, 1, masteryMult), equip);
}

// createFrame: a fresh frame at full HP for a job, no equipment issued. The
// mastery multiplier (from the certification ledger) is snapshotted onto the
// frame — fixed for the run — so mid-run swaps and restores read a stable value.
export function createFrame(id, jobId, masteryMult = 1) {
  const job = getJob(jobId);
  const equip = { arm: null, guard: null };
  const max = frameStats(jobId, equip, masteryMult);
  return { id, jobId, name: job.name, masteryMult, equip, max, hp: max.hp, alive: true };
}

// createParty: the default (or a given) comp at full strength with full supplies.
// `gold` is the expedition ledger's cash: earned from combat + mandate discharge,
// spent at the quartermaster (M4). Starts empty — the road pays as it goes.
export function createParty(jobIds = DEFAULT_PARTY, masteryByJob = {}) {
  const frames = jobIds.slice(0, TUNING.partySize).map((jid, i) => createFrame(i, jid, masteryByJob[jid] || 1));
  // The run holds the mastery snapshot fixed (fixed at swap time), so a mid-run
  // job change reads a stable multiplier for whatever job it swaps to.
  return { frames, supplies: TUNING.startSupplies, gold: 0, inventory: [], mastery: { ...masteryByJob } };
}

// earnGold / spendGold: the ledger's only two verbs. spendGold refuses (returns
// false, deducts nothing) if the reserve can't cover it — the caller surfaces it.
export function earnGold(party, amount) {
  party.gold = (party.gold | 0) + Math.max(0, Math.round(amount));
  return party.gold;
}
export function spendGold(party, amount) {
  const cost = Math.max(0, Math.round(amount));
  if ((party.gold | 0) < cost) return false;
  party.gold -= cost;
  return true;
}

// changeJob: swap a frame's job (camp verb — deck-neutral). Recomputes the max
// stat block; current HP carries over as a PROPORTION so a swap neither fully
// heals nor guts the frame. Returns the party (mutated).
export function changeJob(party, frameIndex, newJobId) {
  const f = party.frames[frameIndex];
  if (!f) throw new Error('no frame at index ' + frameIndex);
  const frac = f.max.hp > 0 ? f.hp / f.max.hp : 1;
  f.jobId = newJobId;
  f.name = getJob(newJobId).name;
  f.masteryMult = (party.mastery && party.mastery[newJobId]) || 1; // the run's fixed snapshot
  f.max = frameStats(newJobId, f.equip, f.masteryMult); // keep the equipment overlay across a swap
  f.hp = f.alive ? Math.max(1, Math.round(f.max.hp * frac)) : 0;
  return party;
}

// equipItem: assign an inventory item to its slot on a frame (M4). Any item the
// frame already held in that slot returns to the loose inventory (a swap, never a
// loss). Recomputes max stats; current HP is kept absolute (equipping armour does
// not heal — a raised max must be earned by rest), clamped to the new max.
// Returns { ok, reason? }. Loud refusal, never silent.
export function equipItem(party, frameIndex, itemId) {
  const f = party.frames[frameIndex];
  if (!f) return { ok: false, reason: 'no frame at index ' + frameIndex };
  const inv = party.inventory || (party.inventory = []);
  const invIdx = inv.indexOf(itemId);
  if (invIdx < 0) return { ok: false, reason: 'item not in inventory' };
  const slot = getItem(itemId).slot;
  const prev = f.equip[slot];
  inv.splice(invIdx, 1);
  if (prev) inv.push(prev); // the displaced item goes back to stores
  f.equip[slot] = itemId;
  f.max = frameStats(f.jobId, f.equip, f.masteryMult || 1);
  f.hp = f.alive ? Math.min(f.hp, f.max.hp) : 0;
  return { ok: true, slot, equipped: itemId, displaced: prev || null };
}

// unequipSlot: pull a frame's slot item back to the inventory (M4). No-op if the
// slot is empty. Recomputes max; HP is clamped down if the item carried max HP.
export function unequipSlot(party, frameIndex, slot) {
  const f = party.frames[frameIndex];
  if (!f) return { ok: false, reason: 'no frame' };
  const id = f.equip[slot];
  if (!id) return { ok: false, reason: 'slot empty' };
  f.equip[slot] = null;
  (party.inventory || (party.inventory = [])).push(id);
  f.max = frameStats(f.jobId, f.equip, f.masteryMult || 1);
  f.hp = f.alive ? Math.min(f.hp, f.max.hp) : 0;
  return { ok: true, slot, removed: id };
}

// livingFrames / isWiped: party-status helpers (combat + the report use these).
export function livingFrames(party) {
  return party.frames.filter((f) => f.alive && f.hp > 0);
}
export function isWiped(party) {
  return livingFrames(party).length === 0;
}

// spendSupplies: deduct from the reserve, floored at zero. Returns amount spent.
export function spendSupplies(party, amount) {
  const spent = Math.min(party.supplies, Math.max(0, amount));
  party.supplies -= spent;
  return spent;
}

// campRest: recover a fraction of each living frame's MISSING HP, paid for in
// supplies. No-op (returns false) if the reserve can't cover it — recovery is
// never free and never silent (the caller surfaces the result).
export function campRest(party) {
  if (party.supplies < TUNING.campRecoverSupplyCost) return { rested: false, restored: 0, cost: 0 };
  const cost = spendSupplies(party, TUNING.campRecoverSupplyCost);
  let restored = 0;
  for (const f of party.frames) {
    if (!f.alive) continue;
    const missing = f.max.hp - f.hp;
    const heal = Math.round(missing * TUNING.campRecoverHpFrac);
    f.hp = Math.min(f.max.hp, f.hp + heal);
    restored += heal;
  }
  return { rested: true, restored, cost };
}

// applyDamage / applyHeal: HP mutation with death bookkeeping (combat uses these
// so death is recorded in exactly one place — action-legibility).
export function applyDamage(frame, amount) {
  const dealt = Math.max(0, Math.round(amount));
  frame.hp = Math.max(0, frame.hp - dealt);
  if (frame.hp === 0) frame.alive = false;
  return dealt;
}
export function applyHeal(frame, amount) {
  if (!frame.alive) return 0;
  const before = frame.hp;
  frame.hp = Math.min(frame.max.hp, frame.hp + Math.max(0, Math.round(amount)));
  return frame.hp - before;
}

// ---- Serialization (folds into the save envelope at M2 inc2/inc3) -----------
export function serializeParty(party) {
  return {
    supplies: party.supplies,
    gold: party.gold | 0,
    inventory: (party.inventory || []).slice(),
    mastery: { ...(party.mastery || {}) },
    frames: party.frames.map((f) => ({
      id: f.id, jobId: f.jobId, hp: f.hp, alive: f.alive,
      equip: { arm: f.equip.arm || null, guard: f.equip.guard || null },
    })),
  };
}
export function restoreParty(snap) {
  const mastery = snap.mastery || {};
  const frames = snap.frames.map((s) => {
    const mm = mastery[s.jobId] || 1;
    const f = createFrame(s.id, s.jobId, mm);
    if (s.equip) { for (const slot of SLOTS) f.equip[slot] = s.equip[slot] || null; }
    f.max = frameStats(f.jobId, f.equip, mm);
    f.hp = s.hp | 0;
    f.alive = !!s.alive && f.hp > 0;
    return f;
  });
  return { frames, supplies: snap.supplies | 0, gold: snap.gold | 0, inventory: (snap.inventory || []).slice(), mastery: { ...mastery } };
}

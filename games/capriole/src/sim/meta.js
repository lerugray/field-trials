// meta.js — the LIGHT META layer (M4 — The Ascent). Tickets bank on death/victory and buy
// PERMANENT additions to the caprice pool (unlocks go into the player's TRUNK); the pre-run
// draft pool is a curated LOADOUT of up to 16 from the trunk (default auto-fill = the whole
// trunk). Progression is curation AGENCY, never pool dilution (studio fold): the starter
// trunk (all tier-0 caprices) is always present, so the very first run already drafts.
//
// Pure + browser-agnostic: operates on a plain meta object. The browser layer (main.js)
// wraps this with its own localStorage key, SEPARATE from the single run-save slot — meta
// survives death (which deletes the run save), so progression persists across runs.

import { CAPRICES, CAPRICE_BY_ID } from './caprices.js';
import { tuning } from './tuning.js';

export const META_VERSION = 1;

// The starter trunk: every tier-0 caprice, unlocked from the first boot (so act-1 drafts
// always have options and the "first run is already the whole game" holds for the base verbs).
export const STARTER_TRUNK = CAPRICES.filter((c) => c.tier === 0).map((c) => c.id);

export function defaultMeta() {
  return { version: META_VERSION, tickets: 0, trunk: STARTER_TRUNK.slice(), loadout: STARTER_TRUNK.slice() };
}

// Ticket cost to unlock `id` into the trunk (by tier; tier 0 is the free starter set).
export function unlockCost(id) {
  const c = CAPRICE_BY_ID[id];
  if (!c) return Infinity;
  return tuning.tickets.unlockCost[c.tier] ?? 0;
}

// Caprices NOT yet in the trunk (the unlock shop list), in pool order.
export function lockedCaprices(meta) {
  const owned = new Set(meta.trunk);
  return CAPRICES.filter((c) => !owned.has(c.id));
}

// Can the player afford + is it not already owned?
export function canUnlock(meta, id) {
  if (!CAPRICE_BY_ID[id] || meta.trunk.includes(id)) return false;
  return meta.tickets >= unlockCost(id);
}

// Unlock a caprice into the trunk (and auto-add to the loadout). Returns a NEW meta; a no-op
// (returns the same meta) if unaffordable or already owned.
export function unlockCaprice(meta, id) {
  if (!canUnlock(meta, id)) return meta;
  const cost = unlockCost(id);
  const loadout = meta.loadout.includes(id) ? meta.loadout : [...meta.loadout, id].slice(0, tuning.caprice.poolSize);
  return { ...meta, tickets: meta.tickets - cost, trunk: [...meta.trunk, id], loadout };
}

// Bank a run's scorecard tickets into the meta. Returns a NEW meta.
export function bankTickets(meta, scorecard) {
  const total = scorecard && scorecard.tickets ? scorecard.tickets.total : 0;
  return { ...meta, tickets: meta.tickets + Math.max(0, Math.floor(total)) };
}

// Curate the loadout (subset of the trunk, deduped, capped at the pool size). Returns NEW meta.
export function setLoadout(meta, ids) {
  const trunkSet = new Set(meta.trunk);
  const cleaned = [...new Set(ids)].filter((id) => trunkSet.has(id)).slice(0, tuning.caprice.poolSize);
  return { ...meta, loadout: cleaned };
}

// The draft pool for the next run: the curated loadout, or (auto-fill) the whole trunk if the
// loadout is empty. Capped at the pool size. This is what createWorld receives as `pool`.
export function runPool(meta) {
  const pool = meta.loadout && meta.loadout.length ? meta.loadout : meta.trunk;
  return pool.slice(0, tuning.caprice.poolSize);
}

// Validate/repair a loaded meta object; never throws — a corrupt meta falls back to default
// (save-fuzz discipline). The starter trunk is always guaranteed present (no dilution).
export function sanitizeMeta(raw) {
  if (!raw || typeof raw !== 'object') return defaultMeta();
  const validIds = (arr) => (Array.isArray(arr) ? arr.filter((id) => CAPRICE_BY_ID[id]) : []);
  let trunk = validIds(raw.trunk);
  for (const id of STARTER_TRUNK) if (!trunk.includes(id)) trunk.push(id);
  trunk = [...new Set(trunk)];
  let loadout = validIds(raw.loadout).filter((id) => trunk.includes(id));
  loadout = [...new Set(loadout)];
  if (!loadout.length) loadout = trunk.slice();
  const tickets = Number.isFinite(raw.tickets) && raw.tickets >= 0 ? Math.floor(raw.tickets) : 0;
  return { version: META_VERSION, tickets, trunk, loadout: loadout.slice(0, tuning.caprice.poolSize) };
}

export default {
  META_VERSION, STARTER_TRUNK, defaultMeta, unlockCost, lockedCaprices, canUnlock,
  unlockCaprice, bankTickets, setLoadout, runPool, sanitizeMeta,
};

// save.js — autosave (DESIGN-SEED QoL: autosave at checkpoints; testing law: saves are ATOMIC
// write-then-swap with a corruption-recovery test). A save is a plain JSON snapshot of the
// persistent run state (XP, gold, gear, inventory, checkpoint, death marker). Writes go to a main
// slot plus a preserved backup slot, each with a checksum; a torn/corrupt main slot recovers from
// the backup. Storage is abstracted so the sim tests headless and the browser uses localStorage.

import { levelForXp, statsForLevel } from './stats.js';
import { equipWeapon, equipArmor } from './equipment.js';
import { weaponDef } from './inventory.js';

const SAVE_VERSION = 1;

/** djb2 checksum over a string → uint32 hex, for tamper/torn-write detection. */
function checksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** In-memory storage (headless/default). Browser callers pass a localStorage-like object. */
export function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

/** Serialize the persistent slice of a stage into a plain object. */
export function serializeSave(stage, stageId = 'stage1') {
  return {
    v: SAVE_VERSION,
    stageId,
    totalXp: stage.progress.totalXp,
    gold: stage.gold,
    weaponId: stage.loadout.weapon.id,
    armorId: stage.loadout.armor.id,
    inventory: {
      weapons: [...stage.inventory.weapons],
      armors: [...stage.inventory.armors],
      items: { ...stage.inventory.items },
    },
    activeCheckpoint: stage.activeCheckpoint,
    respawnPoint: { ...stage.respawnPoint },
    marker: stage.marker ? { ...stage.marker } : null,
    deaths: stage.deaths,
    kit: { ...stage.kit },
    unlocked: stage.unlockPickups.filter((u) => u.collected).map((u) => u.move),
  };
}

/**
 * Write a save atomically: preserve the current main slot as the backup, then write the new main
 * with a checksum. A crash between the two leaves a recoverable backup.
 */
export function writeSave(storage, key, save) {
  const record = JSON.stringify({ data: save, sum: checksum(JSON.stringify(save)) });
  const prevMain = storage.getItem(key);
  if (prevMain != null) storage.setItem(key + '.bak', prevMain); // preserve last-known-good
  storage.setItem(key, record);
}

function parseVerified(raw) {
  if (raw == null) return null;
  let rec;
  try { rec = JSON.parse(raw); } catch { return null; }
  if (!rec || typeof rec !== 'object' || rec.data == null || rec.sum == null) return null;
  if (checksum(JSON.stringify(rec.data)) !== rec.sum) return null; // torn / tampered
  return rec.data;
}

/**
 * Read a save, verifying the checksum; recover from the backup slot if the main slot is corrupt.
 * @returns {{save:object|null, recovered:boolean}}
 */
export function readSave(storage, key) {
  const main = parseVerified(storage.getItem(key));
  if (main) return { save: main, recovered: false };
  const bak = parseVerified(storage.getItem(key + '.bak'));
  if (bak) return { save: bak, recovered: true };
  return { save: null, recovered: false };
}

/** Apply a loaded save onto a fresh stage (created from the same stage def). Best-effort restore. */
export function applySave(stage, save) {
  if (!save) return stage;
  // progress: rebuild level + stats from total XP, restore to full HP on load
  const xp = save.totalXp | 0;
  stage.progress.totalXp = xp;
  stage.progress.level = levelForXp(xp);
  stage.progress.stats = statsForLevel(stage.progress.level);
  stage.progress.hp = stage.progress.stats.maxHP;
  stage.gold = save.gold | 0;
  // gear — resolve through weaponDef so a persisted UNIQUE re-equips (WEAPONS-only lookup misses it)
  if (save.weaponId) equipWeapon(stage.loadout, weaponDef(save.weaponId) || save.weaponId);
  if (save.armorId) equipArmor(stage.loadout, save.armorId);
  // inventory
  if (save.inventory) {
    stage.inventory.weapons = [...save.inventory.weapons];
    stage.inventory.armors = [...save.inventory.armors];
    stage.inventory.items = { ...save.inventory.items };
  }
  // M11: a granted unique lives in inventory.weapons (the source of truth) — mark its exploration
  // pickup collected on load so a reloaded stage doesn't re-offer an already-owned unique.
  for (const u of stage.uniquePickups || []) {
    if (stage.inventory.weapons.includes(u.id)) u.collected = true;
  }
  // souls state
  stage.activeCheckpoint = save.activeCheckpoint ?? -1;
  if (save.respawnPoint) stage.respawnPoint = { ...save.respawnPoint };
  stage.marker = save.marker ? { ...save.marker } : null;
  stage.deaths = save.deaths | 0;
  // kit unlocks (persist Metroid-style progression) + mark matching pickups collected
  if (save.kit) Object.assign(stage.kit, save.kit);
  if (Array.isArray(save.unlocked)) {
    for (const u of stage.unlockPickups) if (save.unlocked.includes(u.move)) u.collected = true;
  }
  return stage;
}

export { SAVE_VERSION, checksum };

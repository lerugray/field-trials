// persistence.js — namespaced save/load (collection contract v0, item 2). Every key is prefixed
// `material-breach:`, and the game SURVIVES storage being unavailable: a failed save or load
// degrades gracefully to a result object and never throws into game logic. A failure is reported
// (the caller logs it) rather than swallowed silently.
//
// storage is any object with getItem/setItem/removeItem (localStorage in the browser; a Map-backed
// stand-in in tests). If none is available, every operation returns { ok: false }.

export const KEY_PREFIX = 'material-breach:';
export const SAVE_KEY = `${KEY_PREFIX}save`;
export const SAVE_VERSION = 1;

function looksLikeSavedFacility(f) {
  if (!f || typeof f !== 'object') return false;
  if (typeof f.status !== 'string') return false;
  if (!f.cycle || !Number.isFinite(f.cycle.number)) return false;

  if (!f.dims || !Number.isFinite(f.dims.cols) || !Number.isFinite(f.dims.rows)) return false;
  if (!Array.isArray(f.grid) || f.grid.length === 0 || !Array.isArray(f.grid[0])) return false;

  if (!f.treasury || !Number.isFinite(f.treasury.gold) || !Number.isFinite(f.treasury.capacity)) return false;
  if (!f.lossObject || !Number.isFinite(f.lossObject.condition)) return false;
  if (!f.lossObject.cell || !Number.isFinite(f.lossObject.cell.x) || !Number.isFinite(f.lossObject.cell.y)) return false;

  if (!Array.isArray(f.rooms) || !Array.isArray(f.orders) || !Array.isArray(f.notices)) return false;
  if (!f.ladder || typeof f.ladder !== 'object') return false;
  if (!f.tenure || typeof f.tenure !== 'object') return false;
  if (!f.counters || typeof f.counters !== 'object') return false;
  return true;
}

// Resolve a usable storage: the passed one, else the ambient localStorage, else null.
function resolveStorage(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Accessing localStorage can itself throw (privacy modes). Treat as unavailable.
  }
  return null;
}

// save(facility, storage) -> { ok, reason? }. Serialises the facility under the namespaced key.
export function save(facility, storage) {
  const s = resolveStorage(storage);
  if (!s) return { ok: false, reason: 'no storage available' };
  try {
    const payload = JSON.stringify({ v: SAVE_VERSION, facility });
    s.setItem(SAVE_KEY, payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : 'save failed' };
  }
}

// load(storage) -> { ok, facility?, reason? }. Returns the saved facility, or a graceful failure.
export function load(storage) {
  const s = resolveStorage(storage);
  if (!s) return { ok: false, reason: 'no storage available' };
  try {
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return { ok: false, reason: 'no save present' };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== SAVE_VERSION || !parsed.facility) {
      return { ok: false, reason: 'save is unreadable or from another version' };
    }
    if (!looksLikeSavedFacility(parsed.facility)) {
      return { ok: false, reason: 'save is unreadable or from another version' };
    }
    return { ok: true, facility: parsed.facility };
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : 'load failed' };
  }
}

// clear(storage) -> { ok }. Removes the save; a no-op if storage is unavailable.
export function clear(storage) {
  const s = resolveStorage(storage);
  if (!s) return { ok: false, reason: 'no storage available' };
  try {
    s.removeItem(SAVE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : 'clear failed' };
  }
}

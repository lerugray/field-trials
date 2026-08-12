// SHOELEATHER — checkpoint save/load.
//
// DESIGN-SEED save law: auto-checkpoint at scene boundaries; NO saving inside
// interrogations or the accusation board; case restart always offered; named access
// points for save/review ship in M0/M1, not implied.
//
// This module is the persistence layer only: it wraps a snapshot (an opaque JSON-able
// object the engine produces) with a schema version and slot metadata, and round-
// trips it through an injectable string store. The atomic-scene guard lives with the
// engine (it decides WHEN a checkpoint is legal); this decides HOW it is stored.
//
// Loud-failure law (rule 9): a corrupt payload or version mismatch THROWS a typed
// error so the engine logs it visibly rather than silently loading a blank game.

export const SAVE_VERSION = 1;

export class SaveError extends Error {
  constructor(message, { slot, cause } = {}) {
    super(message);
    this.name = 'SaveError';
    this.slot = slot;
    if (cause) this.cause = cause;
  }
}

// Reference in-memory store for tests and headless runs. The browser adapter over
// localStorage implements the same shape (get/set/remove/keys).
export class MemoryStore {
  constructor() { this._m = new Map(); }
  get(key) { return this._m.has(key) ? this._m.get(key) : null; }
  set(key, value) { this._m.set(key, String(value)); }
  remove(key) { this._m.delete(key); }
  keys() { return [...this._m.keys()]; }
}

export class SaveManager {
  constructor(store, { prefix = 'shoeleather:save:', version = SAVE_VERSION } = {}) {
    if (!store || typeof store.get !== 'function') {
      throw new TypeError('SaveManager needs a store with get/set/remove/keys');
    }
    this.store = store;
    this.prefix = prefix;
    this.version = version;
  }

  _key(slot) {
    if (!slot) throw new TypeError('save slot name required');
    return this.prefix + String(slot);
  }

  // Persist a snapshot under a named slot. `stamp` is an optional caller-supplied
  // marker (e.g. scene name + tick) — the core takes no wall-clock itself.
  save(slot, snapshot, stamp = null) {
    const record = { version: this.version, slot: String(slot), stamp, data: snapshot };
    let json;
    try {
      json = JSON.stringify(record);
    } catch (err) {
      throw new SaveError(`snapshot for slot "${slot}" is not serializable`, { slot, cause: err });
    }
    this.store.set(this._key(slot), json);
    return record;
  }

  has(slot) {
    return this.store.get(this._key(slot)) !== null;
  }

  // Load a slot. Returns null if absent; THROWS SaveError on corrupt JSON or a
  // version mismatch (loud, never a silent blank).
  load(slot) {
    const raw = this.store.get(this._key(slot));
    if (raw === null) return null;
    let record;
    try {
      record = JSON.parse(raw);
    } catch (err) {
      throw new SaveError(`save slot "${slot}" is corrupt (bad JSON)`, { slot, cause: err });
    }
    if (!record || typeof record !== 'object' || record.version === undefined) {
      throw new SaveError(`save slot "${slot}" is corrupt (missing version)`, { slot });
    }
    if (record.version !== this.version) {
      throw new SaveError(
        `save slot "${slot}" version ${record.version} != engine ${this.version}`, { slot });
    }
    return { data: record.data, stamp: record.stamp ?? null };
  }

  delete(slot) {
    this.store.remove(this._key(slot));
  }

  // Named access points currently present (for a save/review menu).
  list() {
    return this.store.keys()
      .filter((k) => k.startsWith(this.prefix))
      .map((k) => k.slice(this.prefix.length))
      .sort();
  }
}

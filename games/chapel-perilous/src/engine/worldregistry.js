// Multi-world save registry (chp-worldgen lane).
// A small localStorage-backed registry that tracks every world the player has
// started, with per-world save slots. Existing single-slot saves are migrated in
// without losing the run.

const REGISTRY_KEY = 'chapel-perilous.worlds';
const WORLD_SAVE_PREFIX = 'chapel-perilous.world-save.';
const LEGACY_SAVE_KEY = 'chapel-perilous.save';

/**
 * Factory that binds to a localStorage-like storage object (default: global localStorage).
 * All mutation goes through here; the returned API is what the shell and tests use.
 */
export function createWorldRegistry(storage = null, opts = {}) {
  const store = storage || safeStorage();
  const namer = opts.namer || defaultNamer;

  function read(key) {
    try { return store.getItem(key); } catch (_) { return null; }
  }
  function write(key, value) {
    try { store.setItem(key, value); return true; } catch (_) { return false; }
  }
  function remove(key) {
    try { store.removeItem(key); return true; } catch (_) { return false; }
  }

  function parse(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function load() {
    return parse(read(REGISTRY_KEY)) || [];
  }

  function save(registry) {
    return write(REGISTRY_KEY, JSON.stringify(registry || []));
  }

  function generateId(seed) {
    return `w-${(seed >>> 0).toString(16).padStart(8, '0')}`;
  }

  function generateName(seed) {
    return namer(seed);
  }

  function createRecord(seed, name) {
    const now = Date.now();
    return {
      id: generateId(seed),
      seed: seed >>> 0,
      name: name || generateName(seed),
      created: now,
      lastPlayed: now,
    };
  }

  function find(registry, id) {
    return registry.find((r) => r.id === id) || null;
  }

  function add(registry, seed, name) {
    const id = generateId(seed);
    if (find(registry, id)) return { registry, existing: true, record: find(registry, id) };
    const record = createRecord(seed, name);
    return { registry: [record, ...registry], existing: false, record };
  }

  function touch(registry, id) {
    const now = Date.now();
    return registry.map((r) => (r.id === id ? { ...r, lastPlayed: now } : r));
  }

  function removeRecord(registry, id) {
    const next = registry.filter((r) => r.id !== id);
    remove(worldSaveKey(id));
    return next;
  }

  function worldSaveKey(id) {
    return `${WORLD_SAVE_PREFIX}${id}`;
  }

  function loadWorldSave(id) {
    return parse(read(worldSaveKey(id)));
  }

  function saveWorldSave(id, data) {
    return write(worldSaveKey(id), JSON.stringify(data));
  }

  function deleteWorld(id) {
    const before = load();
    const next = removeRecord(before, id);
    save(next);
    return { before, after: next };
  }

  function migrateLegacy() {
    const raw = read(LEGACY_SAVE_KEY);
    if (!raw) return null;
    const wrapper = parse(raw);
    if (!wrapper || !wrapper.save || wrapper.save.version == null) {
      // Unreadable or too old: clean it out so it does not keep blocking the title.
      remove(LEGACY_SAVE_KEY);
      return null;
    }
    const seed = wrapper.save.seed >>> 0;
    const registry = load();
    const { registry: next, record } = add(registry, seed, `legacy world ${generateId(seed).slice(-4)}`);
    save(next);
    saveWorldSave(record.id, wrapper);
    remove(LEGACY_SAVE_KEY);
    return record;
  }

  return {
    REGISTRY_KEY,
    WORLD_SAVE_PREFIX,
    LEGACY_SAVE_KEY,
    generateId,
    generateName,
    createRecord,
    load,
    save,
    add,
    touch,
    removeRecord,
    deleteWorld,
    loadWorldSave,
    saveWorldSave,
    worldSaveKey,
    migrateLegacy,
  };
}

/** Best-effort default world name: Discordiana-style, never generic fantasy. */
function defaultNamer(seed) {
  const n = ((seed * 0x9e3779b9) >>> 0) % 23;
  return `[SEED] World ${n || 5}`;
}

/** Storage access that never throws in a headless / no-localStorage environment. */
function safeStorage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  const mem = new Map();
  return {
    getItem: (k) => mem.get(k) || null,
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

export { REGISTRY_KEY, WORLD_SAVE_PREFIX, LEGACY_SAVE_KEY };

// Deterministic string hashing. Pure, no platform deps — same input, same
// output in node and the browser. This is the root of every summon.

// Normalize a summon phrase so trivial differences collapse: trim, lowercase,
// collapse internal whitespace. "  Hello  World " and "hello world" summon the
// same creature; that predictability is a feature (the operator can re-summon a
// favorite by remembering the phrase).
export function normalizePhrase(phrase) {
  return String(phrase == null ? '' : phrase)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// FNV-1a, 32-bit. Small, fast, well-distributed for short strings, and trivial
// to reproduce byte-for-byte anywhere. Returns an unsigned 32-bit integer.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    // handle code units above 0xff by mixing the high byte too
    const hi = str.charCodeAt(i) >>> 8;
    if (hi) h ^= hi;
    // h *= 16777619, kept in 32 bits via the shift-add form
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// The single entry point: phrase -> normalized -> 32-bit seed.
export function seedFromPhrase(phrase) {
  return fnv1a(normalizePhrase(phrase));
}

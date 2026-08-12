// M11 Part A — the item data model. Ray's scale-ready constraint (2026-08-02 late
// eve): "the whole game is items basically" — a deliberately monotonous world whose
// variety load is carried by an eventually-ENORMOUS procedurally-generated item pool.
// M11 does NOT build that pool or its generator (banked cp-014); it builds the DATA
// MODEL the pool will speak, so nothing downstream assumes a small hand-authored list.
//
// An item is a plain record with COMPOSABLE optional fields. A record may carry any
// combination of: an attack profile (weapon), a mitigation profile (armor), a flexible
// accessory profile, an arcane (GNOSIS-gated) profile, a combat effect, finite charges,
// and free-form tags. A "blessed sword" is a weapon + arcane; a "warding cloak" is armor
// + effect; the generator composes fields, it does not pick from an enum of item types.
//
// EQUIPMENT LOCK (directive §1b): exactly three slots — weapon / armor / accessory.
// weapon feeds ATTACK, armor feeds the absorb side of adaptive DEFENSE, accessory is the
// flexible slot where found-object weirdness lives. slotOf() reads which slot a record
// fills; nothing here hard-codes a fixed catalogue.
//
// CHARACTER-DESIGN LOCK: power from items, magic from books. The arcane profile carries a
// GNOSIS rank gate (gnosisGate) so the combat ITEM verb runs found arcane objects through
// the same rank-gate negotiation uses — magic is loot, no spell list from leveling.
import { RANKS } from './character.js';

export const SLOTS = ['weapon', 'armor', 'accessory'];
export const DEFENSE_FLAVORS = ['dodge', 'avoid', 'absorb'];

// normalizeItem: canonicalize any loose record into the stable shape. Missing fields
// stay absent (null) rather than being invented, so a record's capabilities are exactly
// what its author/generator put on it. Idempotent: normalize(normalize(x)) === shape.
export function normalizeItem(rec = {}) {
  if (rec == null || typeof rec !== 'object') return null;
  const name = String(rec.name || rec.id || '[SEED] a nameless thing');

  const weapon = normWeapon(rec.weapon);
  const armor = normArmor(rec.armor);
  const accessory = normAccessory(rec.accessory);
  const arcane = normArcane(rec.arcane);
  const effect = normEffect(rec.effect);
  // charges: finite uses for a consumable (a potion, a one-shot charm). null = reusable
  // (an equipped weapon/armor never depletes). 0 is spent. Undefined stays reusable.
  const charges = rec.charges == null ? null : Math.max(0, rec.charges | 0);
  const tags = Array.isArray(rec.tags) ? rec.tags.map(String) : [];

  const item = { name, weapon, armor, accessory, arcane, effect, charges, tags };
  // kind is a convenience label (UI grouping); it is DERIVED from the fields, never the
  // source of truth. An explicit kind is honoured but capabilities come from the fields.
  item.kind = rec.kind || deriveKind(item);
  // slot: which of the three equipment slots this record fills (null = unequippable,
  // e.g. a pure trinket/relic or a pure consumable). Explicit slot honoured if valid.
  item.slot = SLOTS.includes(rec.slot) ? rec.slot : deriveSlot(item);
  // Preserve identity/back-pointers the caller hung on the record (uid, artifact id).
  if (rec.uid != null) item.uid = rec.uid;
  if (rec.artifact != null) item.artifact = rec.artifact;
  return item;
}

function normWeapon(w) {
  if (w == null) return null;
  const d = w.dmg ?? w.damage ?? null;
  if (d == null) return null;
  const band = Array.isArray(d) ? [d[0] | 0, d[1] | 0] : [d | 0, d | 0];
  if (band[1] < band[0]) band[1] = band[0];
  return { name: String(w.name || 'strike'), dmg: band };
}

function normArmor(a) {
  if (a == null) return null;
  const absorb = Math.max(0, (a.absorb ?? a.soak ?? 0) | 0);
  // An armor may bias the adaptive-defense flavor (a heavy plate leans 'absorb', a light
  // cloak 'dodge'); null lets the being's own weighting decide the matchup.
  const defense = DEFENSE_FLAVORS.includes(a.defense) ? a.defense : null;
  return { name: String(a.name || 'guard'), absorb, defense };
}

function normAccessory(x) {
  if (x == null) return null;
  // The flexible slot: a free bag of composable fields. Kept open on purpose so the
  // future generator can hang weirdness here without a schema change — every field of
  // `x` survives, with `name` guaranteed a string.
  return { ...x, name: String(x.name || 'charm') };
}

// The arcane profile: a GNOSIS-gated combat capability (magic-are-items). `gnosis` is the
// minimum word-rank required to safely invoke it; below it the ITEM verb refuses (or, per
// the shell, backfires). The effect it produces reuses the composable effect shape.
function normArcane(a) {
  if (a == null) return null;
  const gnosis = RANKS.includes(a.gnosis) ? a.gnosis : 'STEADY';
  const effect = normEffect(a.effect) || { kind: 'damage', power: [2, 4] };
  return { name: a.name ? String(a.name) : null, gnosis, effect };
}

// A combat effect the ITEM verb resolves. Composable and small on purpose:
//   kind   : 'damage' | 'heal' | 'shield' | 'edge'  (extensible — unknown kinds pass
//            through so a future generator can add kinds without breaking normalize)
//   power  : a scalar or [min,max] band the resolver rolls; meaning is per-kind
//   target : 'foe' | 'self' | 'party'   (default per kind at the resolver)
function normEffect(e) {
  if (e == null) return null;
  const kind = String(e.kind || 'damage');
  const p = e.power ?? e.amount ?? null;
  const power = p == null ? null : (Array.isArray(p) ? [p[0] | 0, p[1] | 0] : [p | 0, p | 0]);
  if (power && power[1] < power[0]) power[1] = power[0];
  const out = { kind, power };
  if (e.target) out.target = String(e.target);
  return out;
}

function deriveKind(item) {
  if (item.arcane) return 'arcane';
  if (item.weapon) return 'weapon';
  if (item.armor) return 'armor';
  if (item.accessory) return 'accessory';
  if (item.effect) return 'consumable';
  return 'trinket';
}

// Which equipment slot a record fills. weapon-profile → weapon slot; armor → armor;
// an accessory/arcane profile without a weapon/armor → the flexible accessory slot.
// Pure effect/charges with no equip profile is a consumable — no slot (used, not worn).
function deriveSlot(item) {
  if (item.weapon) return 'weapon';
  if (item.armor) return 'armor';
  if (item.accessory || item.arcane) return 'accessory';
  return null;
}

export function slotOf(item) {
  const it = item && item.slot !== undefined ? item : normalizeItem(item);
  return it ? it.slot : null;
}

export function isEquippable(item) {
  return slotOf(item) != null;
}

// The GNOSIS rank an item's arcane profile requires, or null if it has none. The shell's
// ITEM verb compares this against the PC's gnosis rank (the negotiation-style gate).
export function gnosisGate(item) {
  const it = item && item.arcane !== undefined ? item : normalizeItem(item);
  return it && it.arcane ? it.arcane.gnosis : null;
}

// The combat effect an ITEM-verb use produces: an explicit effect, else the arcane
// profile's effect (once its gate passes), else null (nothing to invoke in combat —
// a pure trinket). The resolver (combat.js) reads this; it never reads the raw record.
export function combatEffect(item) {
  const it = item && item.effect !== undefined ? item : normalizeItem(item);
  if (!it) return null;
  if (it.effect) return it.effect;
  if (it.arcane) return it.arcane.effect;
  return null;
}

// A consumable is spent (charges hit 0). Reusable items (charges === null) never spend.
export function isSpent(item) {
  return item && item.charges === 0;
}

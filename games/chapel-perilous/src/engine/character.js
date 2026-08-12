// The character: statline + roster (CHARACTER-DESIGN-2026-08-02).
//
// THE LOCK, restated so it stays true: verbs from stats, power from items.
//   - Four visible stats (NERVE/CRAFT/PULL/GNOSIS) + hidden FNORD, each a
//     WORD-RANK on a ~4-step ladder. No numerals on the sheet.
//   - Stats are PURE VERB-GATING. A rank decides which approaches a being shows
//     you; it NEVER scales damage, accuracy, or hp. The rank index below exists
//     ONLY for a threshold comparison (do you meet a being's resistance?), never
//     as a multiplier — combat.js reads none of it.
//   - Power (hp, weapon) comes from the oddment/items, not the statline.

// Word-ranks, low→high. Names are [SEED] until Ray's voice pass.
export const RANKS = ['SHAKY', 'STEADY', 'SHARP', 'UNCANNY'];
export function rankIndex(rank) {
  const i = RANKS.indexOf(rank);
  if (i < 0) throw new Error(`unknown rank '${rank}'`);
  return i;
}

// Visible stats and the verb each one gates (DIRECTIONS / character-design).
export const STATS = ['nerve', 'craft', 'pull', 'gnosis'];
export const STAT_VERB = { nerve: 'overawe', craft: 'impress', pull: 'bargain', gnosis: 'bind' };
export const VERB_STAT = { overawe: 'nerve', impress: 'craft', bargain: 'pull', bind: 'gnosis' };

const BASE_PC_HP = 12; // hp is item/omen territory, never stat-derived (lock)

// createCharacter: build a person from a word-rank statline + an oddment (the
// starting item that IS the weapon) + an omen/quirk. FNORD is stored but never
// surfaced by the public API — only the tail system may consult it.
export function createCharacter(spec = {}) {
  const stats = {};
  for (const s of STATS) stats[s] = validRank(spec[s] || spec.stats?.[s] || 'STEADY', s);
  const fnord = validRank(spec.fnord || 'STEADY', 'fnord');
  const oddment = spec.oddment || spec.weapon || null;
  const hp0 = Math.max(1, (spec.hp ?? BASE_PC_HP) | 0);

  return {
    name: spec.name || '[SEED] Initiate',
    portrait: spec.portrait || 'HERO', // the dealt face (M10 A10); HERO is the default
    omen: spec.omen || null,
    oddment,
    hp: hp0,
    maxHp: hp0,
    weapon: oddment && oddment.weapon ? oddment.weapon : (spec.weapon || oddment || { name: '[SEED] bare hands', dmg: [1, 3] }),
    // rank(stat) -> word; rankIndex(stat) -> number (comparison only).
    rank: (s) => stats[requireStat(s)],
    rankIndex: (s) => rankIndex(stats[requireStat(s)]),
    stats: () => ({ ...stats }),
    // The verb this character can even attempt: a stat must be at least STEADY to
    // give any social lever (SHAKY = you don't have that approach in you).
    hasVerb: (verb) => rankIndex(stats[VERB_STAT[verb]]) >= rankIndex('STEADY'),
    verbs: () => Object.keys(VERB_STAT).filter((v) => rankIndex(stats[VERB_STAT[v]]) >= rankIndex('STEADY')),
    // FNORD access is deliberately awkward and unnamed in normal use.
    _fnord: fnord,
    _fnordIndex: rankIndex(fnord),
    // A combat spec: hp + weapon only. No stat crosses into combat.
    toCombatantSpec() {
      return { id: 'pc', name: this.name, hp: this.hp, weapon: this.weapon, side: 'party', ref: this };
    },
  };
}

// createRoster: the party spine — one PC plus followers up to a capacity that
// grows with level (never touches stats or damage; it's how much weirdness you
// can hold together). Recruited beings become followers with their want/upkeep.
export function createRoster(pc, opts = {}) {
  if (!pc) throw new Error('createRoster: needs a pc');
  let capacity = Math.max(1, (opts.capacity ?? 2) | 0);
  const followers = [];

  function recruit(being) {
    if (!being) throw new Error('recruit: no being');
    if (being.sacred || being.recruitable === false) return { ok: false, reason: 'refuses' };
    if (followers.length >= capacity) return { ok: false, reason: 'full' };
    const f = { id: being.id, name: being.name, want: being.want ?? null, hp: being.hp, maxHp: being.hp, weapon: being.weapon, being };
    followers.push(f);
    return { ok: true, follower: f };
  }

  function dismiss(id) {
    const i = followers.findIndex((f) => f.id === id);
    if (i < 0) return false;
    followers.splice(i, 1);
    return true;
  }

  return {
    pc,
    get capacity() { return capacity; },
    get followers() { return followers.slice(); },
    get full() { return followers.length >= capacity; },
    get size() { return followers.length + 1; },
    grow(by = 1) { capacity += Math.max(0, by | 0); return capacity; },
    // Set the follower capacity to an absolute value (M12 E6 milestone leveling).
    setCapacity(n) { capacity = Math.max(1, n | 0); return capacity; },
    recruit,
    dismiss,
    has: (id) => followers.some((f) => f.id === id),
    // Recover every follower to full (the PC is healed by its owner).
    healAll() { for (const f of followers) f.hp = f.maxHp; },
    // Recover a FRACTION of each follower's missing HP (M12 A3 partial camp rest).
    healFraction(frac) {
      for (const f of followers) {
        const heal = Math.max(1, Math.ceil((f.maxHp - f.hp) * frac));
        f.hp = Math.min(f.maxHp, f.hp + heal);
      }
    },
    // Write surviving hp from a finished combat's combatants back onto the live
    // follower records (followers is a copy getter; this mutates the store).
    syncHp(combatants) {
      for (const c of combatants) {
        const f = followers.find((x) => x.id === c.id);
        if (f) f.hp = Math.max(0, c.hp);
      }
    },
    // The combat party: the PC plus each follower as a combatant spec.
    toCombatants() {
      return [pc.toCombatantSpec(), ...followers.map((f) => ({ id: f.id, name: f.name, hp: f.hp, weapon: f.weapon, side: 'party', ref: f.being }))];
    },
    // Save/load: plain follower records (the being ref is dropped — combat and
    // upkeep read only these fields; negotiation never queries a follower).
    serialize() {
      return followers.map((f) => ({ id: f.id, name: f.name, hp: f.hp, maxHp: f.maxHp, weapon: f.weapon, want: f.want }));
    },
    load(records) {
      followers.length = 0;
      for (const r of records || []) followers.push({ id: r.id, name: r.name, hp: r.hp, maxHp: r.maxHp, weapon: r.weapon, want: r.want ?? null, being: null });
    },
  };
}

function validRank(rank, what) {
  if (!RANKS.includes(rank)) throw new Error(`character: ${what} has invalid rank '${rank}'`);
  return rank;
}
function requireStat(s) {
  if (!STATS.includes(s)) throw new Error(`character: unknown stat '${s}'`);
  return s;
}

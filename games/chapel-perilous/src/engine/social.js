// M12 F1/F2 — the minimal social layer (un-banked). A real talk ACTION against a
// single adjacent being resolves from a FIXED outcome table (ADDENDUM #5): lore /
// rumor / barter / joinable-if-capacity / rebuff — each with its own register prose,
// logged by the shell. Barter is ONE exchange: the being wants one item by TAG and
// offers one generated item from a tiered pool; PULL rank widens only the OFFER-POOL
// tier (never counts, never prices — the never-scale-numbers lock).
//
// Pure + deterministic in (subject, seed). No currency anywhere.
import { mulberry32 } from './prng.js';
import { rankIndex } from './character.js';
import { normalizeItem } from './items.js';

// Canonical trade tags: the beings' existing `want` vocabulary + the rest-offering tag
// + the gate work-item tags. No new tag families are invented (ADDENDUM #5).
export const TRADE_TAGS = ['attention', 'blood', 'food', 'money', 'secrets', 'rest-offering', 'ford'];

// The tiered OFFER pool — what a barter partner can give back. Higher tiers are unlocked
// by higher PULL rank (the pool WIDENS; the deal never gets cheaper). Every offer is a
// generated item carrying a trade tag so the loop (offerings, ford stones) stays one
// system. Tier 0 is always available; SHARP/UNCANNY PULL open tiers 1 and 2.
const OFFER_TIERS = [
  [
    { name: '[SEED] a ration of grey bread', tags: ['food'] },
    { name: '[SEED] a fistful of small attention', tags: ['attention'] },
  ],
  [
    { name: '[SEED] a folded offering-slip', tags: ['rest-offering'] },
    { name: '[SEED] a vial of someone else’s blood', tags: ['blood'] },
  ],
  [
    { name: '[SEED] a bundle of ford stones', tags: ['ford'] },
    // H2 hook: a WARDED consumable — the one status wired end-to-end. Used in combat it
    // lays a multi-round damage ward (effect.kind:'status'); acquired here via barter.
    { name: '[SEED] a warding charm', tags: ['secrets'], effect: { kind: 'status', status: { id: 'WARDED', polarity: 'good', duration: 3, amount: 2 } }, charges: 1 },
  ],
];

// PULL rank → how many offer tiers are open (1..3). STEADY-or-less: tier 0 only;
// SHARP: +1; UNCANNY: +2. Never a discount — only a wider pool.
export function offerTiersOpen(pc) {
  const r = pc && typeof pc.rankIndex === 'function' ? pc.rankIndex('pull') : 0;
  if (r >= rankIndex('UNCANNY')) return 3;
  if (r >= rankIndex('SHARP')) return 2;
  return 1;
}

// Fallback register pools so the engine stays usable headlessly even when no
// register file is passed. Every fallback line keeps the leading [SEED] marker.
const FALLBACK = {
  greeting: ['[SEED] ${name} nods as if you had an appointment.'],
  talk: ['[SEED] ${name} tells you a thing you half-believe.'],
  recruit_attempt: ['[SEED] you ask ${name} to throw in with you.'],
  join: ['[SEED] ${name} joins you.'],
  refuse: ['[SEED] ${name} has nothing for you and less to say.'],
  farewell: ['[SEED] ${name} walks on.'],
};

export function createSocial({ prose = null, register = null } = {}) {
  function pool(name) {
    const p = register && register[name];
    return (Array.isArray(p) && p.length) ? p : (FALLBACK[name] || ['[SEED] ...']);
  }
  function pick(poolName, seed) {
    const lines = pool(poolName);
    const rng = mulberry32(((seed >>> 0) || 1) ^ 0x50c1a1);
    return lines[Math.floor(rng() * lines.length)];
  }
  function format(line, ctx = {}) {
    return String(line)
      .replace(/\$\{name\}/g, strip(ctx.name || ctx.who || 'a stranger'))
      .replace(/\$\{target\}/g, strip(ctx.target || 'somewhere'));
  }
  function lineFor(poolName, subject, seed) {
    return format(pick(poolName, seed), { name: subject && subject.name });
  }

  function greeting(subject, seed) { return lineFor('greeting', subject, seed); }
  function farewell(subject, seed) { return lineFor('farewell', subject, seed); }
  function joinLine(subject, seed) { return lineFor('join', subject, seed); }
  function refuseLine(subject, seed) { return lineFor('refuse', subject, seed); }

  // Resolve a talk against `subject` (a being record or a plain NPC {name}). Options:
  //   seed          deterministic pick
  //   capacityOpen  the roster has room (gates the 'joinable' class)
  //   pointers      real targets a rumor can point at (site/gate {name})
  // Returns { class, line, want?, offer?, target?, greeting?, farewell? } — the shell
  // voices `line`, logs the class, and (for barter) opens the one-exchange overlay.
  function resolveTalk(subject, pc, { seed = 0, capacityOpen = false, pointers = [] } = {}) {
    const rng = mulberry32((seed >>> 0) || 1);
    const recruitable = !!(subject && subject.recruitable) && capacityOpen && !(subject && subject.sacred);
    const classes = ['lore', 'rumor', 'barter', 'rebuff'];
    if (recruitable) classes.push('joinable');
    const cls = classes[Math.floor(rng() * classes.length)];

    if (cls === 'rumor') {
      const target = pointers.length ? pointers[Math.floor(rng() * pointers.length)] : null;
      const line = target
        ? `[SEED] "${strip(subject && subject.name)} leans in: seek ${strip(target.name)}, ${target.dir || 'out that way'}."`
        : lineFor('talk', { name: subject && subject.name }, seed);
      return { class: 'rumor', line, target, greeting: greeting(subject, seed), farewell: farewell(subject, seed) };
    }
    if (cls === 'barter') {
      const want = pickWant(subject, rng);
      const offer = pickOffer(pc, rng);
      return {
        class: 'barter',
        line: lineFor('talk', { name: subject && subject.name }, seed),
        want,
        offer,
        greeting: greeting(subject, seed),
        farewell: farewell(subject, seed),
      };
    }
    if (cls === 'joinable') {
      return {
        class: 'joinable',
        line: lineFor('recruit_attempt', { name: subject && subject.name }, seed),
        greeting: greeting(subject, seed),
        farewell: farewell(subject, seed),
      };
    }
    if (cls === 'rebuff') {
      return {
        class: 'rebuff',
        line: lineFor('refuse', { name: subject && subject.name }, seed),
        greeting: greeting(subject, seed),
        farewell: farewell(subject, seed),
      };
    }
    // lore — a flavor line from the talk pool (register when wired, else fallback)
    const lore = prose && typeof prose.describeTerrain === 'function'
      ? `[SEED] ${strip(subject && subject.name)}: ${strip(prose.describeTerrain('rumor', (seed & 0xffff), (seed >>> 16) & 0xffff, seed, { weirdness: 0.5 }))}`
      : lineFor('talk', { name: subject && subject.name }, seed);
    return { class: 'lore', line: lore, greeting: greeting(subject, seed), farewell: farewell(subject, seed) };
  }

  // What a being wants in trade: its own `want` tag if it's a real trade tag, else a
  // seeded pick from the canonical tags (never invents a new family).
  function pickWant(subject, rng) {
    const w = subject && subject.want;
    if (w && TRADE_TAGS.includes(w)) return w;
    return TRADE_TAGS[Math.floor(rng() * TRADE_TAGS.length)];
  }
  // The offered item: a seeded pick within the tiers PULL has opened (wider, not cheaper).
  function pickOffer(pc, rng) {
    const open = offerTiersOpen(pc);
    const tier = Math.floor(rng() * open); // 0..open-1
    const pool = OFFER_TIERS[tier];
    const spec = pool[Math.floor(rng() * pool.length)];
    const rec = { kind: 'trade', name: spec.name, tags: spec.tags.slice() };
    if (spec.effect) rec.effect = spec.effect; // a combat effect rides along (e.g. WARDED)
    if (spec.charges != null) rec.charges = spec.charges;
    return normalizeItem(rec);
  }

  return { resolveTalk, greeting, farewell, joinLine, refuseLine, pickOffer };
}

function strip(s) { return String(s).replace(/^\[SEED\]\s*/i, ''); }

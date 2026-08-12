// City services — the live interactions behind each building door (M3
// CITY). Increment 1 opened the doors; this gives each a first interaction:
//   inn    — take a room; the party rests (heal).
//   rumor  — buy a seeded [SEED] rumor (prose engine).
//   lodge  — the initiation ladder's rung: give the word. Gated on PULL (cities
//            are PULL's home field, CONTENT-IDENTITY) — a STEADY-or-better hand
//            joins; anyone weaker is kept waiting. Pure verb-gating, no roll.
//   shop   — seeded stock, buying, selling, and appraisal.
//
// All player-facing lines are [SEED] register strings or prose-engine output.
// Deterministic: a given (building, seed) always yields the same interaction.
import { rankIndex } from './character.js';
import { createShop } from './shop.js';
import shopRegister from '../../data/register/shop.json' with { type: 'json' };

// Strip a leading [SEED] marker so an item name can be embedded mid-line without
// leaking the marker into the middle of prose (the line carries its own leading one).
const stripMark = (s) => String(s).replace(/^\[SEED\]\s*/i, '');

export function createServices(cityRegister, deps = {}) {
  const services = (cityRegister && cityRegister.services) || {};
  const effects = (cityRegister && cityRegister.service_effects) || {};
  const prose = deps.prose || null;
  const shop = deps.shop || createShop(deps.shopRegister || shopRegister);

  // interact(building, { session, seed }): run the building's service once and
  // return { service, name, lines, effect } — effects are applied in-line on the
  // session so state (hp, memberships) is observable immediately.
  function interact(building, ctx = {}) {
    const svc = services[building.service] || {};
    const name = svc.name || building.service;
    const greeting = svc.greeting || '';
    const session = ctx.session || null;
    const seed = (ctx.seed ?? 0) >>> 0;
    const lines = [greeting];
    let effect = null;

    switch (building.service) {
      case 'inn':
        if (session) {
          const r = session.rest('inn');
          effect = r.ok ? 'rest' : 'rest-refused';
          lines.push(restLine(r, 'inn'));
        } else {
          lines.push('[SEED] the beds are turned down but no one is here to take a room');
        }
        break;
      case 'rumor':
        lines.push(rumorLine(seed));
        effect = 'rumor';
        break;
      case 'lodge':
        if (session && pcHasPull(session)) {
          const fresh = session.joinLodge(building.id);
          effect = fresh ? 'joined' : 'already-member';
          lines.push(fresh ? '[SEED] you give the word; a door within a door opens' : '[SEED] you are known here; the door was already open');
        } else {
          effect = 'refused';
          lines.push('[SEED] you lack the word, and they are very good at waiting');
        }
        break;
      case 'shrine':
        // The changing-saint shrine is a full-heal rest path like the inn (A3: a town
        // guaranteed at least one of inn/shrine must be a real heal source, so healing
        // here no longer requires GNOSIS). GNOSIS still MATTERS: the seeing-past-the-veil
        // hand additionally earns the saint's mark on top of the rest.
        if (session) {
          const r = session.rest('shrine');
          if (!r.ok) {
            effect = 'rest-refused';
            lines.push(restLine(r, 'shrine'));
          } else {
            const blessed = pcHasStat(session, 'gnosis');
            effect = blessed ? 'blessed' : 'rest';
            lines.push(restLine(r, 'shrine'));
            if (blessed) lines.push(effects.shrine_blessed || '[SEED] the saint marks you');
          }
        } else {
          effect = 'refused';
          lines.push(effects.shrine_refused || '[SEED] nothing kneels with you');
        }
        break;
      case 'bureau':
        // The sub-office: files your existence (a one-way membership-style stamp).
        if (session) {
          const fresh = session.joinLodge(`bureau:${building.id}`);
          effect = fresh ? 'filed' : 'pending';
          lines.push((fresh ? effects.bureau_filed : effects.bureau_pending) || '[SEED] your file is stamped');
        } else {
          lines.push('[SEED] the counter is unattended, permanently');
        }
        break;
      case 'shop':
        {
          const epoch = Math.floor((ctx.tick || 0) / 200);
          const archetype = ctx.archetype || 'market';
          const stock = session ? shop.stockFor(building.id, ctx.seed || 0, epoch, archetype) : [];
          const sellOffer = (session && stock.length) ? shop.makeSellOffer(session.items(), building.id, ctx.seed || 0, epoch) : null;
          effect = 'shop';
          if (!stock.length) {
            lines.push((shop.register && shop.register.no_stock) || '[SEED] the shelf is bare');
          } else {
            lines.push('[SEED] the shelf holds what the record claims');
          }
          return { service: building.service, name, lines, effect, stock, sellOffer, shop, buildingId: building.id };
        }
      default:
        lines.push('[SEED] nothing changes hands — the stall wants a password you have not earned');
        break;
    }
    return { service: building.service, name, lines, effect };
  }

  // Voice a rest outcome with before→after HP (A3: rest/heal ALWAYS reports the
  // numbers). Distinguishes free rest, a rest paid with a barter offering, and a
  // refusal for want of one. Numbers are shown; only wording is [SEED].
  function restLine(r, where) {
    const place = where === 'shrine' ? 'the saint' : 'the room';
    if (!r || !r.ok) {
      return '[SEED] no rest without an offering — ' + place + ' turns you away, still ' + r.before + ' hp';
    }
    const hp = `${r.before}→${r.after} hp`;
    if (r.offering) return `[SEED] you leave ${stripMark(r.offering)} and rest whole — ${hp}`;
    return `[SEED] you rest whole, no charge yet — ${hp}`;
  }

  // A seeded [SEED] rumor. Uses the prose engine when wired; otherwise a stub so
  // the module is usable headlessly without the full register stack.
  function rumorLine(seed) {
    if (prose && typeof prose.describeTerrain === 'function') {
      return prose.describeTerrain('rumor', seed & 0xffff, (seed >>> 16) & 0xffff, seed, { weirdness: 0.6 });
    }
    return '[SEED] someone saw a light in the Chapel that was not a light';
  }

  return { interact };
}

function pcHasPull(session) {
  return pcHasStat(session, 'pull');
}
function pcHasStat(session, stat) {
  const pc = session.pc;
  if (!pc || typeof pc.rankIndex !== 'function') return false;
  return pc.rankIndex(stat) >= rankIndex('STEADY');
}

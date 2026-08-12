// The bestiary: data-driven roster of beings (CONTENT-IDENTITY-2026-08-02).
// A being carries combat stats-lite (hp + weapon band — nothing stat-derived),
// an interaction profile (which of the four verbs bite: overawe/bargain/bind/
// impress), a want (follower upkeep), rarity, habitat, and a portrait recipe
// stub for the later gallery pass. This module validates the roster and turns a
// being into combat-ready combatant specs.
import { normalizeWeapon } from './combat.js';

export const VERBS = ['overawe', 'bargain', 'bind', 'impress'];
const RARITIES = ['common', 'uncommon', 'rare', 'tail'];
const HABITATS = ['overworld', 'city', 'dungeon'];

export function createBestiary(data) {
  const list = (data && data.beings) || [];
  if (!Array.isArray(list) || list.length === 0) throw new Error('createBestiary: no beings');

  const byId = new Map();
  for (const b of list) {
    validateBeing(b);
    if (byId.has(b.id)) throw new Error(`createBestiary: duplicate being id '${b.id}'`);
    byId.set(b.id, normalizeBeing(b));
  }

  function get(id) {
    const b = byId.get(id);
    if (!b) throw new Error(`bestiary.get: unknown being '${id}'`);
    return b;
  }

  // Build a combat spec from a being. `n` disambiguates multiple copies so the
  // combat log reads "Cave Rat", "Cave Rat 2" rather than colliding ids.
  function toCombatantSpec(id, n = 1) {
    const b = get(id);
    return {
      id: n > 1 ? `${id}#${n}` : id,
      name: n > 1 ? `${b.name} ${n}` : b.name,
      hp: b.hp,
      weapon: b.weapon,
      side: 'foe',
      ref: b,
    };
  }

  // Which verbs are available against this being GIVEN a set of verbs the actor's
  // statline unlocks. A being's profile lists only the verbs that bite; a sacred
  // being bites to none. Returns the intersection with its difficulty.
  function approachesFor(id, actorVerbs) {
    const b = get(id);
    if (b.sacred) return [];
    const avail = actorVerbs || VERBS;
    return VERBS
      .filter((v) => v in b.interaction && avail.includes(v))
      .map((v) => ({ verb: v, difficulty: b.interaction[v] }));
  }

  return {
    get,
    has: (id) => byId.has(id),
    all: () => [...byId.values()],
    ids: () => [...byId.keys()],
    get count() { return byId.size; },
    toCombatantSpec,
    approachesFor,
  };
}

function validateBeing(b) {
  if (!b || typeof b !== 'object') throw new Error('bestiary: being must be an object');
  if (!b.id) throw new Error('bestiary: being missing id');
  if (!b.name) throw new Error(`bestiary: being '${b.id}' missing name`);
  if (!(Number(b.hp) > 0)) throw new Error(`bestiary: being '${b.id}' needs hp > 0`);
  if (!b.weapon) throw new Error(`bestiary: being '${b.id}' missing weapon`);
  if (b.rarity && !RARITIES.includes(b.rarity)) throw new Error(`bestiary: being '${b.id}' bad rarity '${b.rarity}'`);
  const hab = b.habitat || [];
  for (const h of hab) if (!HABITATS.includes(h)) throw new Error(`bestiary: being '${b.id}' bad habitat '${h}'`);
  const inter = b.interaction || {};
  for (const v of Object.keys(inter)) {
    if (!VERBS.includes(v)) throw new Error(`bestiary: being '${b.id}' unknown interaction verb '${v}'`);
  }
  // Consistency: a sacred being (refuses all) must not be recruitable, and a
  // recruitable being must offer at least one biting verb — else the "most yes,
  // a sacred few never" rule silently breaks.
  if (b.sacred && b.recruitable) throw new Error(`bestiary: '${b.id}' is sacred but marked recruitable`);
  if (b.recruitable && !b.sacred && Object.keys(inter).length === 0) {
    throw new Error(`bestiary: recruitable '${b.id}' offers no interaction verbs`);
  }
}

function normalizeBeing(b) {
  return {
    id: b.id,
    name: b.name,
    habitat: b.habitat || [],
    rarity: b.rarity || 'common',
    hp: b.hp | 0,
    weapon: normalizeWeapon(b.weapon),
    interaction: { ...(b.interaction || {}) },
    want: b.want || null,
    sacred: !!b.sacred,
    recruitable: !!b.recruitable,
    register: b.register || {},
    portrait: b.portrait || null,
    // M11 tactical combat, all data-driven per being (absent → derived defaults):
    //   defense  : which flavor a DEFENSE against this foe resolves as
    //              ('dodge' | 'avoid' | 'absorb') — the matchup weighting (§1).
    //   behavior : the foe's combat disposition ('aggressive' | 'cowardly' |
    //              'pack' | 'caster' | 'steady') driving its AI (§2).
    //   talkInCombat : may still be reasoned with AFTER blows land (two-layer verb
    //              model; default false — most beings harden once fighting starts).
    defense: DEFENSE_FLAVORS.includes(b.defense) ? b.defense : null,
    behavior: BEHAVIORS.includes(b.behavior) ? b.behavior : null,
    talkInCombat: !!b.talkInCombat,
  };
}

const DEFENSE_FLAVORS = ['dodge', 'avoid', 'absorb'];
const BEHAVIORS = ['aggressive', 'cowardly', 'pack', 'caster', 'steady'];

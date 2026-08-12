// Streamlined turn-based combat. Party vs an encounter; actions are fight /
// talk / flee. Everything is seeded and deterministic — the whole engine runs
// headlessly under `node --test`.
//
// CHARACTER-DESIGN LOCK (docs/CHARACTER-DESIGN-2026-08-02.md): power comes from
// ITEMS, never the statline. So combat outputs — damage, HP, initiative — read
// ONLY a combatant's weapon and hp. Stats never enter this module; they gate the
// TALK approaches (owned by negotiation.js), which is a verb-availability
// question, not a damage one. Talk consults ranks only to decide which
// approaches EXIST — never to scale a number. Keep it that way.
import { mulberry32 } from './prng.js';
import { availableApproaches, resolveApproach } from './negotiation.js';
import { combatEffect, gnosisGate } from './items.js';
import { rankIndex } from './character.js';

// A combatant: a name, hit points, and an equipped weapon whose damage band is
// the ONLY thing that decides how hard it hits. `side` splits party from foes.
// `ref` is an opaque back-pointer (a bestiary being, a follower record) the
// caller can hang recruitment/loot logic off later — combat never reads it.
export function createCombatant(spec = {}) {
  const maxHp = Math.max(1, (spec.hp ?? spec.maxHp ?? 1) | 0);
  const weapon = normalizeWeapon(spec.weapon);
  return {
    id: spec.id || spec.name || 'combatant',
    name: spec.name || spec.id || 'combatant',
    side: spec.side === 'foe' ? 'foe' : 'party',
    maxHp,
    hp: maxHp,
    weapon,
    // Passive armor soak (M11 §1b: armor feeds the absorb side of defense). From the
    // equipped armor slot; every incoming hit is reduced by this, and the DEFENSE
    // verb's 'absorb' flavor braces on top of it. Non-party combatants carry 0.
    armorAbsorb: Math.max(0, (spec.armorAbsorb ?? 0) | 0),
    // The adaptive-defense stance set for the round by the DEFENSE verb, or null.
    stance: null,
    // Statuses (M12 H1): {id, polarity, duration, effect} timed effects reusing the
    // combatEffect shape. WARDED is the first end-to-end one (a multi-round damage ward).
    statuses: [],
    ref: spec.ref ?? null,
    get alive() { return this.hp > 0; },
  };
}

// The total incoming-damage ward from a combatant's active WARDED statuses (H1).
export function wardAmount(combatant) {
  if (!combatant || !Array.isArray(combatant.statuses)) return 0;
  return combatant.statuses.reduce((n, s) => n + ((s.id === 'WARDED' && s.duration > 0 && s.effect) ? (s.effect.amount | 0) : 0), 0);
}

// Weapons carry a damage band [min,max]. A bare fist is the floor so an unarmed
// combatant still resolves. Accepts {name,dmg:[a,b]} or {name,dmg:n} or a number.
export function normalizeWeapon(w) {
  if (w == null) return { name: 'bare hands', dmg: [1, 2] };
  if (typeof w === 'number') return { name: 'strike', dmg: [w, w] };
  const d = w.dmg ?? w.damage ?? [1, 2];
  const band = Array.isArray(d) ? [d[0] | 0, d[1] | 0] : [d | 0, d | 0];
  if (band[1] < band[0]) band[1] = band[0];
  return { name: w.name || 'strike', dmg: band };
}

export const DEFENSE_FLAVORS = ['dodge', 'avoid', 'absorb'];

// The adaptive DEFENSE flavor for a matchup (directive §1: "whatever the target is
// weighted toward", read from being data). Priority: the foe's own `defense` weighting;
// else a bias from the defender's equipped armor (heavy armor leans 'absorb', light
// 'dodge'); else derived from the foe's profile (a heavy hitter you brace/absorb, a
// frail fast thing you dodge, the middle you avoid). Pure + deterministic.
export function defenseFlavorFor(foeRef, armor) {
  if (foeRef && DEFENSE_FLAVORS.includes(foeRef.defense)) return foeRef.defense;
  if (armor && DEFENSE_FLAVORS.includes(armor.defense)) return armor.defense;
  const dmgMax = foeRef && foeRef.weapon && Array.isArray(foeRef.weapon.dmg) ? foeRef.weapon.dmg[1] : 3;
  const hp = foeRef && foeRef.hp ? foeRef.hp : 4;
  if (dmgMax >= 5) return 'absorb';   // it hits hard — set your feet and take it
  if (hp <= 3) return 'dodge';        // frail and quick — slip it
  return 'avoid';                     // the broad middle — turn it aside
}

// Apply one raw hit through the defender's passive armor soak and any active stance.
// Returns { dmg, flavor, negated }. Seeded via the passed rng so a dodge is deterministic.
//   dodge  : a coin-plus chance (0.55) to negate the hit entirely
//   avoid  : halve the incoming (ceil)
//   absorb : subtract a flat brace (BRACE) — the stance that leans on armor
// Passive armor soak (armorAbsorb) is then applied ONCE underneath, so armor matters even
// without a stance but pays off most under the absorb brace (the directive's "absorb side").
const ABSORB_BRACE = 2;
export function mitigate(rawDmg, defender, rng) {
  const soak = Math.max(0, defender.armorAbsorb || 0);
  const st = defender.stance;
  let dmg = rawDmg;
  let negated = false;
  let flavor = null;
  if (st && st.flavor) {
    flavor = st.flavor;
    if (flavor === 'dodge') { if (rng() < 0.55) { dmg = 0; negated = true; } }
    else if (flavor === 'avoid') dmg = Math.ceil(dmg / 2);
    else if (flavor === 'absorb') dmg = Math.max(0, dmg - (st.shield || ABSORB_BRACE));
  }
  if (!negated) dmg = Math.max(0, dmg - soak);
  // H1: a WARDED status soaks incoming damage on top of armor/brace (multi-round).
  if (!negated) dmg = Math.max(0, dmg - wardAmount(defender));
  return { dmg, flavor, negated };
}

// createCombat: assemble a fight from party + foe specs and a seed. Returns a
// state machine advanced one actor-turn at a time via `take(action)`.
//
//   party / foes : arrays of createCombatant specs (or combatants)
//   seed         : integer; identical seed + identical actions => identical run
//
// Turn order is a seeded shuffle of every combatant, fixed at construction — a
// streamlined single initiative track rather than per-round re-rolls. Dead
// combatants are skipped as the cursor walks the order; a wrap increments round.
// Optional `pc` (a character) and `roster` enable the talk/recruit layer: with
// them, a foe whose `ref` is a being can be negotiated with mid-fight.
export function createCombat({ party = [], foes = [], seed = 0, pc = null, roster = null, pcArmor = null, narrate = null, targeting = null } = {}) {
  // H3: follower-targeting weights (a tunable design lever). Defaults to EXACTLY uniform
  // {pc:1, follower:1} so the weighted pick consumes rng identically to the old
  // party[floor(rng*len)] — existing seeded combat is byte-for-byte unchanged.
  const TARGETING = { pc: (targeting && targeting.pc) ?? 1, follower: (targeting && targeting.follower) ?? 1 };
  // Optional register narrator (A4): (event, {foe, verb}) => voiced line | null. When
  // present, negotiation outcomes are logged in-voice; absent (headless/tests), the
  // terse internal English is kept so the engine stays self-contained + deterministic.
  const voice = (event, foe, verb, plain) => {
    let line = null;
    try { line = narrate ? narrate(event, { foe, verb }) : null; } catch (_) { line = null; }
    return line || plain;
  };
  const rng = mulberry32(seed >>> 0);
  const combatants = [
    ...party.map((s) => asCombatant(s, 'party')),
    ...foes.map((s) => asCombatant(s, 'foe')),
  ];
  if (!combatants.some((c) => c.side === 'party')) throw new Error('createCombat: no party');
  if (!combatants.some((c) => c.side === 'foe')) throw new Error('createCombat: no foes');

  const order = shuffle(combatants.map((_, i) => i), rng);
  let cursor = 0;
  let round = 1;
  let outcome = null; // null | 'win' | 'lose' | 'fled' | 'parley'
  let killedFoes = 0; // foes felled by violence (distinguishes win from parley)
  let blowsLanded = false; // once true, in-combat talk hardens (two-layer verb model)
  let subterfugeUsed = false; // one environmental gambit per fight (never a repeatable exploit)
  let packTarget = null; // the shared mark 'pack'-behavior foes coordinate on
  const fallenFoes = []; // names of foes felled, in order — the kill-beat source (A7)
  const recruited = []; // followers won mid-fight
  const log = [];
  const rounds = []; // legibility trail: one structured record per resolved turn

  function pcHp() {
    const pc = combatants.find((c) => c.id === 'pc');
    return pc ? pc.hp : null;
  }
  function actorMeta(c) {
    return c ? { id: c.id, name: c.name, side: c.side } : null;
  }

  // A `left` foe walked away (recruited or parleyed) — no longer in the fight.
  const living = (side) => combatants.filter((c) => c.side === side && c.alive && !c.left);
  const partyAlive = () => living('party').length > 0;
  const foesAlive = () => living('foe').length > 0;

  function checkEnd() {
    if (outcome) return outcome;
    if (!foesAlive()) outcome = killedFoes > 0 ? 'win' : 'parley';
    else if (!partyAlive()) outcome = 'lose';
    return outcome;
  }

  // Apply/refresh a timed status onto a combatant (H1). Same id refreshes duration.
  function applyStatus(c, spec) {
    if (!c || !spec || !spec.id) return;
    const existing = c.statuses.find((s) => s.id === spec.id);
    const rec = { id: spec.id, polarity: spec.polarity || 'good', duration: Math.max(1, spec.duration | 0 || 1), effect: { amount: spec.amount | 0 || (spec.effect && spec.effect.amount) | 0 } };
    if (existing) Object.assign(existing, rec); else c.statuses.push(rec);
  }
  // Tick every combatant's statuses down one round, dropping the expired ones (H1).
  function tickStatuses() {
    for (const c of combatants) {
      if (!Array.isArray(c.statuses) || !c.statuses.length) continue;
      for (const s of c.statuses) s.duration -= 1;
      c.statuses = c.statuses.filter((s) => s.duration > 0);
    }
  }

  // Advance the cursor to the next living combatant, incrementing round on wrap.
  // Returns false if no living combatant remains (combat is over).
  function advance() {
    for (let steps = 0; steps < order.length; steps++) {
      cursor++;
      if (cursor >= order.length) { cursor = 0; round++; tickStatuses(); } // statuses tick per round (H1)
      if (combatants[order[cursor]].alive) return true;
    }
    return false;
  }

  function active() {
    if (outcome) return null;
    const c = combatants[order[cursor]];
    return c && c.alive ? c : null;
  }

  // Resolve one hit: roll the attacker's weapon band on the combat PRNG and
  // subtract from the target. Damage reads the WEAPON only (character-design lock).
  function strike(attacker, target) {
    const [min, max] = attacker.weapon.dmg;
    const weaponRoll = min + Math.floor(rng() * (max - min + 1));
    let raw = weaponRoll;
    // A SUBTERFUGE that EXPOSED this target opens it up for one harder blow (temporary).
    const exposed = target.exposed;
    if (exposed) { raw += 2; target.exposed = false; }
    // Route through the defender's passive armor + any adaptive-defense stance. The
    // stance holds through the round (each incoming hit is checked against it) and is
    // cleared when the defender next acts.
    const m = mitigate(raw, target, rng);
    const dmg = m.dmg;
    blowsLanded = true; // a blow is a blow, from either side — talk hardens now
    target.hp = Math.max(0, target.hp - dmg);
    rounds.push({
      round,
      actor: actorMeta(attacker),
      action: 'attack',
      target: actorMeta(target),
      weapon: attacker.weapon.name,
      rolled: raw,
      weaponRoll,
      exposed: !!exposed,
      flavor: m.flavor || null,
      negated: m.negated,
      damage: dmg,
      absorbed: raw - dmg,
      hpAfter: target.hp,
      maxHp: target.maxHp,
      pcHpAfter: pcHp(),
      fell: !target.alive,
    });
    if (m.negated) {
      log.push(`${target.name} slips ${attacker.name}'s ${attacker.weapon.name} (dodge)`);
    } else if (m.flavor && dmg < raw) {
      log.push(`${attacker.name} hits ${target.name} for ${dmg} (${attacker.weapon.name}) [${m.flavor} −${raw - dmg}]`);
    } else {
      log.push(`${attacker.name} hits ${target.name} for ${dmg} (${attacker.weapon.name})`);
    }
    if (!target.alive) {
      // A kill gets an explicit beat, not a silent removal (M10 A7): a distinct
      // felled glyph in the log, and foe deaths are tracked so the shell can
      // surface a prominent kill acknowledgement.
      log.push(`✖ ${target.name} falls`);
      if (target.side === 'foe') { killedFoes++; fallenFoes.push(target.name); }
    }
    return dmg;
  }

  // Roll a power band [min,max] on the combat PRNG (item effects, not weapons).
  function rollBand(band, floor) {
    if (!band) return floor || 0;
    return band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
  }

  // Resolve one item combat effect for `actor`. Composable kinds (items.js): damage a
  // foe, heal the user, or raise a ward (an absorb brace sized by the effect). Unknown
  // kinds pass through as a flavored no-op so the future generator can add kinds freely.
  function applyEffect(actor, effect, sourceName) {
    const kind = effect.kind;
    if (kind === 'damage') {
      const target = living('foe')[0];
      if (!target) return { kind: 'damage', target: null, damage: 0 };
      const dmg = Math.max(1, rollBand(effect.power, 2));
      blowsLanded = true;
      target.hp = Math.max(0, target.hp - dmg);
      const fell = !target.alive;
      log.push(`${actor.name} looses ${sourceName} — ${target.name} takes ${dmg}`);
      if (fell) {
        log.push(`✖ ${target.name} falls`);
        if (target.side === 'foe') { killedFoes++; fallenFoes.push(target.name); }
      }
      return { kind: 'damage', target: actorMeta(target), targetName: target.name, damage: dmg, hpAfter: target.hp, maxHp: target.maxHp, fell };
    }
    if (kind === 'heal') {
      const amt = rollBand(effect.power, 3);
      const before = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + amt);
      const healed = actor.hp - before;
      log.push(`${actor.name} draws on ${sourceName} — mends ${healed}`);
      return { kind: 'heal', amount: healed, hpAfter: actor.hp, maxHp: actor.maxHp };
    }
    if (kind === 'shield') {
      const amt = Math.max(1, rollBand(effect.power, 2));
      actor.stance = { flavor: 'absorb', shield: amt }; // a ward: an absorb brace this size
      log.push(`${actor.name} raises ${sourceName} — a ward (${amt})`);
      return { kind: 'shield', amount: amt, flavor: 'absorb' };
    }
    if (kind === 'status') {
      // H1: apply a timed status (WARDED end-to-end). Refresh if already present.
      const spec = effect.status || { id: 'WARDED', polarity: 'good', duration: 3, amount: effect.amount ?? effect.power ?? 2 };
      applyStatus(actor, spec);
      log.push(`${actor.name} takes on ${sourceName} — ${String(spec.id || 'a mark').toLowerCase()}`);
      return { kind: 'status', status: spec.id, amount: spec.amount ?? effect.amount ?? effect.power ?? 2 };
    }
    log.push(`${actor.name} invokes ${sourceName}`); // edge / unknown — flavored no-op here
    return { kind: 'unknown' };
  }

  // Foe AI (directive §2: "enemy behavior worth reading"). Per-being behaviors from the
  // bestiary drive TARGETING and TIMING only — never damage (character-design lock:
  // outputs read the weapon band alone, so behavior can't inflate the unfair tail). Each
  // disposition reads distinctly in the log:
  //   aggressive : presses the WEAKEST party member (focus-fire, finish them)
  //   cowardly   : fights, but bolts when badly hurt (a foe that runs — flavor, not pity)
  //   pack       : the group coordinates on ONE marked target (only bites when 2+ strong)
  //   caster     : telegraphs — gathers a rite one turn (no damage), looses it the next
  //   steady     : the plain default — a seeded target
  function foeTurn(foe) {
    // A successful SUBTERFUGE throws a foe off its next turn (temporary edge).
    if (foe.skipNext) {
      foe.skipNext = false;
      log.push(`${foe.name} shakes off the distraction`);
      rounds.push({ round, actor: actorMeta(foe), action: 'recover', target: null, pcHpAfter: pcHp() });
      return;
    }
    const party = living('party');
    if (!party.length) return;
    const behavior = (foe.ref && foe.ref.behavior) || 'steady';
    const weakest = () => party.reduce((a, b) => (b.hp < a.hp ? b : a));
    // H3: a seeded target by the weight table (uniform by default → same pick as before).
    const pickTarget = () => {
      const w = party.map((c) => (c.id === 'pc' ? TARGETING.pc : TARGETING.follower));
      const total = w.reduce((a, b) => a + b, 0);
      if (!(total > 0)) return party[Math.floor(rng() * party.length)];
      let r = rng() * total;
      for (let i = 0; i < party.length; i++) { r -= w[i]; if (r < 0) return party[i]; }
      return party[party.length - 1];
    };

    if (behavior === 'cowardly' && foe.hp <= Math.ceil(foe.maxHp * 0.35)) {
      const cowardRoll = rng();
      if (cowardRoll < 0.5) {
        foe.left = true; // it loses its nerve and quits the field
        log.push(`${foe.name} loses its nerve and bolts`);
        rounds.push({
          round, actor: actorMeta(foe), action: 'flee', target: null,
          chance: 0.5, roll: +cowardRoll.toFixed(5), success: true, pcHpAfter: pcHp(),
        });
        return;
      }
    }
    if (behavior === 'caster') {
      if (!foe.channeling) {
        foe.channeling = true;
        log.push(`${foe.name} gathers a rite`);
        rounds.push({ round, actor: actorMeta(foe), action: 'gather', target: null, pcHpAfter: pcHp() });
        return;
      }
      foe.channeling = false;
      const t = pickTarget();
      log.push(`${foe.name} looses the rite`);
      strike(foe, t);
      return;
    }
    if (behavior === 'aggressive') { strike(foe, weakest()); return; }
    if (behavior === 'pack') {
      const packmates = living('foe').length;
      if (packmates >= 2) {
        // coordinate: keep hitting the shared marked target while it lives
        if (!packTarget || !packTarget.alive || packTarget.left) packTarget = weakest();
        log.push(`${foe.name} joins the pack on ${packTarget.name}`);
        rounds.push({
          round, actor: actorMeta(foe), action: 'pack', target: actorMeta(packTarget), pcHpAfter: pcHp(),
        });
        strike(foe, packTarget);
        return;
      }
      // alone, a pack animal is timid — just a plain strike
    }
    strike(foe, pickTarget());
  }

  // The TALK approaches available against a foe: a verb-gating question owned by
  // negotiation.js. With a pc + a foe that carries a being `ref`, return the
  // approaches this character's ranks unlock against it; otherwise none.
  function approaches(target) {
    if (!pc) return [];
    const foe = resolveFoe(target) || living('foe')[0];
    if (!foe || !foe.ref) return [];
    return availableApproaches(pc, foe.ref);
  }

  // take(action): resolve the active combatant's turn.
  //   foe turn  -> action ignored, AI runs
  //   party turn:
  //     {type:'fight', target}  target = foe id/index; deals weapon damage
  //     {type:'flee'}           seeded escape; success ends combat 'fled'
  //     {type:'talk'}           not yet available (returns {ok:false}); a later
  //                             increment wires negotiation here
  // Returns { ok, outcome, event }. A resolved turn advances to the next actor.
  function take(action) {
    if (outcome) return { ok: false, outcome, event: 'over' };
    const actor = active();
    if (!actor) { checkEnd(); return { ok: false, outcome, event: 'over' }; }

    if (actor.side === 'foe') {
      foeTurn(actor);
      return resolve('foe-attack');
    }

    // A party actor taking its turn ends any brace it was holding from last round.
    actor.stance = null;

    const type = action && action.type;
    if (type === 'fight') {
      const target = resolveFoe(action.target);
      if (!target) return { ok: false, outcome, event: 'no-target' };
      strike(actor, target);
      return resolve('attack');
    }
    if (type === 'defend') {
      // Adaptive DEFENSE (directive §1): one verb, resolution flavor read from the
      // matchup — the lead foe's weighting, biased by the defender's armor. Sets a
      // brace that holds until this actor's next turn.
      const lead = resolveFoe(action.target) || living('foe')[0];
      const flavor = defenseFlavorFor(lead && lead.ref, pcArmor);
      actor.stance = { flavor };
      log.push(`${actor.name} braces (${flavor})`);
      rounds.push({
        round, actor: actorMeta(actor), action: 'defend', target: actorMeta(lead),
        flavor, pcHpAfter: pcHp(),
      });
      return resolve('defend');
    }
    if (type === 'item') {
      // Use an item in combat (directive §1). The shell passes the chosen item record;
      // combat resolves its composable effect and reports what to consume. Magic-are-
      // items: an arcane item is GNOSIS-rank-gated (per book) — below the gate the rite
      // slips and the turn is spent for nothing (the risk of dabbling above your rank).
      const item = action.item;
      if (!item) return { ok: false, outcome, event: 'no-item' };
      const effect = combatEffect(item);
      if (!effect) return { ok: false, outcome, event: 'item-no-effect' };
      const gate = gnosisGate(item);
      if (gate && pc && rankIndex(pc.rank('gnosis')) < rankIndex(gate)) {
        log.push(`${actor.name} fumbles ${item.name} — the rite slips its gnosis`);
        rounds.push({
          round, actor: actorMeta(actor), action: 'item-fumble', target: null,
          item: item.name, pcHpAfter: pcHp(),
        });
        return resolve('item-fumble'); // arcane item survives; the turn does not
      }
      const effectRes = applyEffect(actor, effect, item.name);
      rounds.push({
        round, actor: actorMeta(actor), action: 'item', target: effectRes && effectRes.target,
        item: item.name, effect: effectRes, pcHpAfter: pcHp(),
      });
      const res = resolve('item');
      // A finite-charge consumable is spent; a reusable item (charges null) is not.
      res.consumed = item.uid ? { uid: item.uid, spent: item.charges != null } : null;
      return res;
    }
    if (type === 'subterfuge') {
      // SUBTERFUGE / DISTRACTION (directive §1, the wildcard): manipulate the
      // environment for a TEMPORARY edge. Environment-keyed — the shell passes a context
      // {chance,kind,label} derived from the current biome/site (register-flavored). Risky
      // (seeded roll) and NEVER a repeatable exploit: one gambit per fight, spent on any
      // attempt. Success either throws the foe off its next turn ('distract') or opens it
      // up for one harder blow ('expose').
      if (subterfugeUsed) return { ok: false, outcome, event: 'subterfuge-spent' };
      subterfugeUsed = true;
      const ctx = action.context || {};
      const chance = typeof ctx.chance === 'number' ? ctx.chance : 0.5;
      const label = ctx.label || 'works the ground for an opening';
      const foe = living('foe')[0];
      const subRoll = rng();
      const success = subRoll < chance && !!foe;
      if (success) {
        const kind = ctx.kind === 'expose' ? 'expose' : 'distract';
        if (kind === 'distract') { foe.skipNext = true; log.push(`${actor.name} ${label} — ${foe.name} is thrown off`); }
        else { foe.exposed = true; log.push(`${actor.name} ${label} — ${foe.name} is left exposed`); }
        rounds.push({
          round, actor: actorMeta(actor), action: 'subterfuge', target: actorMeta(foe),
          chance, roll: +subRoll.toFixed(5), success, kind, label, pcHpAfter: pcHp(),
        });
        const res = resolve('subterfuge');
        res.subterfuge = { ok: true, kind };
        return res;
      }
      log.push(`${actor.name} ${label} — but the moment passes`);
      rounds.push({
        round, actor: actorMeta(actor), action: 'subterfuge', target: actorMeta(foe),
        chance, roll: +subRoll.toFixed(5), success, label, pcHpAfter: pcHp(),
      });
      const res = resolve('subterfuge-fail');
      res.subterfuge = { ok: false };
      return res;
    }
    if (type === 'flee') {
      // Seeded escape. Combat flee is the riskier layer (two-layer verb model): easier
      // to back away at contact than to break off once blows are landing.
      const chance = blowsLanded ? 0.35 : 0.5;
      const fleeRoll = rng();
      const got = fleeRoll < chance;
      rounds.push({
        round, actor: actorMeta(actor), action: 'flee', target: null,
        chance, roll: +fleeRoll.toFixed(5), success: got, pcHpAfter: pcHp(),
      });
      if (got) {
        outcome = 'fled';
        log.push(`${actor.name} breaks away`);
        return { ok: true, outcome, event: 'fled' };
      }
      log.push(`${actor.name} fails to break away`);
      return resolve('flee-fail');
    }
    if (type === 'talk') {
      const foe = resolveFoe(action.target) || living('foe')[0];
      if (!foe) return { ok: false, outcome, event: 'no-target' };
      // Two-layer verb model (Ray, RESOLVED): once blows land, talk hardens for all
      // but beings flagged talk-capable-in-combat. Parley is primarily an encounter-
      // layer activity; in the thick of it, most things are past words.
      if (blowsLanded && !(foe.ref && foe.ref.talkInCombat)) {
        return { ok: false, outcome, event: 'talk-hardened', approaches: approaches(foe.id) };
      }
      const avail = approaches(foe.id);
      // No pc, or nothing bites (sacred / rank too low): parley is impossible.
      if (!pc || avail.length === 0) {
        return { ok: false, outcome, event: 'no-parley', approaches: avail };
      }
      // No verb chosen yet: hand the UI the menu without consuming the turn.
      if (!action.verb) return { ok: false, outcome, event: 'choose-verb', foe: foe.id, approaches: avail };
      const res = resolveApproach(pc, foe.ref, action.verb, roster);
      if (!res.ok) {
        // A4: a verb that doesn't bite is voiced too (its own line — not a shared
        // fallback) and recorded; no turn is consumed, so the fight is not advanced.
        log.push(voice('verb-unavailable', foe, action.verb, `${foe.name} is unmoved (${action.verb})`));
        return { ok: false, outcome, event: 'verb-unavailable', approaches: avail };
      }
      // The approach lands: the foe leaves the fight (recruited or stood down).
      foe.left = true;
      const talkOutcome = res.outcome === 'recruit' ? 'recruit' : 'parley';
      if (talkOutcome === 'recruit') { recruited.push(res.follower); log.push(voice('recruit', foe, action.verb, `${foe.name} joins you (${action.verb})`)); }
      else log.push(voice('parley', foe, action.verb, `${foe.name} stands down (${action.verb})`));
      rounds.push({
        round, actor: actorMeta(actor), action: 'talk', target: actorMeta(foe),
        verb: action.verb, outcome: talkOutcome, pcHpAfter: pcHp(),
      });
      return resolve(talkOutcome);
    }
    return { ok: false, outcome, event: 'unknown-action' };
  }

  function resolve(event) {
    if (checkEnd()) return { ok: true, outcome, event };
    advance();
    // Skip is handled by advance(); if the new actor is a foe the caller will
    // call take() again to run its AI (keeps every turn an explicit step).
    return { ok: true, outcome, event, next: active() };
  }

  function resolveFoe(target) {
    if (target == null) return living('foe')[0] || null;
    if (typeof target === 'number') {
      const c = combatants[target];
      return c && c.side === 'foe' && c.alive ? c : null;
    }
    return combatants.find((c) => c.id === target && c.side === 'foe' && c.alive) || null;
  }

  return {
    get outcome() { return outcome; },
    get over() { return outcome != null; },
    get round() { return round; },
    get log() { return log; },
    get rounds() { return rounds.slice(); },
    get recruited() { return recruited.slice(); },
    get fallenFoes() { return fallenFoes.slice(); }, // names of foes felled, in order (A7 kill beat)
    get engaged() { return blowsLanded; }, // blows have landed → in-combat talk hardened
    get subterfugeSpent() { return subterfugeUsed; }, // the one environmental gambit is used
    // Can this foe still be reasoned with right now? (encounter layer, or a
    // talk-capable-in-combat being). The shell greys the TALK verb when false.
    canTalk(target) {
      const foe = resolveFoe(target) || living('foe')[0];
      if (!pc || !foe || !foe.ref) return false;
      if (blowsLanded && !foe.ref.talkInCombat) return false;
      return availableApproaches(pc, foe.ref).length > 0;
    },
    combatants,
    order: order.slice(),
    active,
    living,
    take,
    approaches,
    state() {
      return {
        over: outcome != null,
        outcome,
        round,
        active: active() && active().id,
        party: living('party').map((c) => ({ id: c.id, hp: c.hp, maxHp: c.maxHp })),
        foes: living('foe').map((c) => ({ id: c.id, hp: c.hp, maxHp: c.maxHp })),
      };
    },
  };
}

function asCombatant(s, side) {
  // Already a combatant (has our alive accessor)? honour its side. Else build one.
  if (s && typeof s === 'object' && 'maxHp' in s && 'weapon' in s && 'hp' in s) {
    return s.side ? s : { ...s, side };
  }
  return createCombatant({ ...s, side: (s && s.side) || side });
}

// Fisher–Yates on a copy, driven by the passed PRNG so the order is seeded.
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// cp-018: turn one structured combat round into a terse legibility line for the
// event-log record. `pcMaxHp` is the player character's maximum hp at draw time.
const stripSeedMark = (s) => String(s || '').replace(/^\[SEED\]\s*/gi, '');
export function formatCombatRound(r, pcMaxHp) {
  const actor = stripSeedMark(r.actor && r.actor.name) || 'someone';
  const you = `you ${r.pcHpAfter != null ? r.pcHpAfter : '?'}/${pcMaxHp != null ? pcMaxHp : '?'}`;
  const pct = (n) => `${Math.round(n * 100)}%`;
  const targetName = (t) => stripSeedMark((t && t.name) || 'it');
  switch (r.action) {
    case 'attack': {
      const t = targetName(r.target);
      const weapon = stripSeedMark(r.weapon || 'strike');
      let s = `Round ${r.round} - ${actor} strikes ${t}: rolled ${r.rolled} (${weapon})`;
      if (r.exposed) s += ` +2`;
      s += `, dealt ${r.damage}`;
      if (r.negated) s += ` (dodged)`;
      else if (r.flavor) s += r.absorbed
        ? ` (guard ${r.flavor} blocked ${r.absorbed})`
        : ` (guard ${r.flavor} broke)`;
      s += `, ${you}`;
      if (r.fell) s += `; ${t} falls`;
      return s;
    }
    case 'flee':
      return `Round ${r.round} - ${actor} tries to flee: odds ${pct(r.chance)}, roll ${r.roll.toFixed(2)}, ${r.success ? 'escaped' : 'failed'}, ${you}`;
    case 'defend':
      return `Round ${r.round} - ${actor} braces (${r.flavor || 'guard'}), ${you}`;
    case 'item': {
      const e = r.effect || {};
      let s = `Round ${r.round} - ${actor} uses ${stripSeedMark(r.item || 'something')}`;
      if (e.kind === 'damage') s += `: hits ${targetName(e.target)} for ${e.damage}, ${you}`;
      else if (e.kind === 'heal') s += `: mends ${e.amount}, ${you}`;
      else if (e.kind === 'shield') s += `: ward ${e.amount}, ${you}`;
      else if (e.kind === 'status') s += `: ${String(e.status || 'mark').toLowerCase()} ${e.amount}, ${you}`;
      else s += `, ${you}`;
      return s;
    }
    case 'item-fumble':
      return `Round ${r.round} - ${actor} fumbles ${stripSeedMark(r.item || 'something')}, ${you}`;
    case 'subterfuge': {
      const t = targetName(r.target);
      let s = `Round ${r.round} - ${actor} gambit: odds ${pct(r.chance)}, roll ${r.roll.toFixed(2)}, ${r.success ? 'hit' : 'miss'}`;
      if (r.success) s += ` (${r.kind})`;
      s += `, ${you}`;
      return s;
    }
    case 'talk': {
      const t = targetName(r.target);
      const verb = stripSeedMark(r.verb || 'words');
      return `Round ${r.round} - ${actor} parleys (${verb}): ${t} ${r.outcome === 'recruit' ? 'joins you' : 'stands down'}, ${you}`;
    }
    case 'gather':
      return `Round ${r.round} - ${actor} gathers a rite, ${you}`;
    case 'pack':
      return `Round ${r.round} - ${actor} joins the pack on ${targetName(r.target)}, ${you}`;
    case 'recover':
      return `Round ${r.round} - ${actor} shakes off the distraction, ${you}`;
    default:
      return `Round ${r.round} - ${actor} acts, ${you}`;
  }
}

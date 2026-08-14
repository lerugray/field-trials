// combat.js — THE STEPPED AUTO-RESOLVER (DESIGN-SEED M2 + M3). Combat advances
// one action at a time (initCombat / stepCombat), so the tarot hand can intervene
// BETWEEN actions (applyCard) — the M3 intervention layer. With no cards played,
// stepping to completion reproduces the M2 batch fight byte-for-byte (same RNG
// order), so the committed baseline/degeneracy gates still hold. resolveCombat is
// now a thin wrapper that steps to the end — one code path for probes and play.
//
// Determinism: the resolver consumes the `combat` stream (attack variance, enemy
// target choice). Cards consume NO randomness, so a card play never shifts the
// resolver's stream — only the fight state it reads. Attrition mutates party HP in
// place. Every action + card emits a legible log entry.

import { TUNING } from './tuning.js';
import { livingFrames } from './party.js';
import { JOBS } from './jobs.js';
import { getCard } from './deck.js';

export const ENEMY_NAMES = ['Clerk', 'Warden', 'Server', 'Assessor', 'Sgt'];
export const ENEMY_VERBS = [{ id: 'serve', name: 'Serve Writ', kind: 'attack', power: 1.0, target: 'enemy' }];

// `escMult` (M5) scales enemy strength with the escalation curve. Default 1 →
// exact identity, so the M2 baseline + economy gate (which pass no escalation)
// are untouched. It only scales stats — the jitter draw order is unchanged, so
// determinism holds.
export function makeEnemies(tier, stream, escMult = 1) {
  const def = TUNING.encounterTiers[tier];
  if (!def) throw new Error('unknown tier: ' + tier);
  const b = TUNING.baseStats;
  const m = def.mult * escMult;
  const enemies = [];
  for (let i = 0; i < def.count; i++) {
    const jitter = 0.9 + 0.2 * stream.next();
    const max = {
      hp: Math.max(1, Math.round(b.hp * m * jitter)),
      atk: Math.round(b.atk * m), def: Math.round(b.def * m),
      mag: Math.round(b.mag * m), spd: Math.round(b.spd * m),
    };
    enemies.push({ id: i, name: ENEMY_NAMES[i % ENEMY_NAMES.length], max, hp: max.hp, alive: true });
  }
  return enemies;
}

// ---- Stepped resolver -------------------------------------------------------
export function initCombat(party, enemies) {
  const wrap = (side) => (e, idx) => ({ side, e, idx, temp: { def: 0 }, atkBuff: 0, defBuff: 0, stunned: false });
  const partyW = party.frames.map(wrap('party'));
  const enemyW = enemies.map(wrap('enemy'));
  const order = [...partyW, ...enemyW].sort((a, b) => {
    if (b.e.max.spd !== a.e.max.spd) return b.e.max.spd - a.e.max.spd;
    if (a.side !== b.side) return a.side === 'party' ? -1 : 1;
    return a.idx - b.idx;
  });
  return { party, enemies, partyW, enemyW, order, round: 1, ptr: 0, done: false, victory: false, stalemate: false, log: [] };
}

const livingOf = (arr) => arr.filter((w) => w.e.alive && w.e.hp > 0);
function partyDown(s) { return livingOf(s.partyW).length === 0; }
function enemyDown(s) { return livingOf(s.enemyW).length === 0; }

// nextActor: advance ptr to the next living unit, rolling rounds. Returns the unit
// or null (fight over / round cap hit -> caller finalises).
function nextActor(s) {
  let scanned = 0;
  while (scanned <= s.order.length + 1) {
    if (s.ptr >= s.order.length) {
      if (s.round >= TUNING.combatMaxRounds) return null; // round cap -> stalemate
      s.round++; s.ptr = 0;
    }
    const w = s.order[s.ptr]; s.ptr++; scanned++;
    if (w.e.alive) return w;
  }
  return null;
}

// stepCombat: perform exactly one action (or a stun-skip). Returns the log entry,
// or null when the fight is already over / just ended with no action.
export function stepCombat(s, stream) {
  if (s.done) return null;
  if (partyDown(s) || enemyDown(s)) { finalise(s); return null; }
  const w = nextActor(s);
  if (!w) { finalise(s); return null; }

  w.temp.def = 0; // guard/ward from a prior round expires at this unit's turn
  if (w.stunned) {
    w.stunned = false;
    const entry = { round: s.round, side: w.side, actorIdx: w.idx, actor: w.e.name, verb: 'Stayed', targets: [], deaths: [], stayed: true };
    s.log.push(entry);
    if (partyDown(s) || enemyDown(s)) finalise(s);
    return entry;
  }
  const foes = w.side === 'party' ? s.enemyW : s.partyW;
  const friends = w.side === 'party' ? s.partyW : s.enemyW;
  const act = chooseAction(w, friends, foes, stream);
  const entry = { round: s.round, side: w.side, actorIdx: w.idx, actor: w.e.name, verb: act.verb.name, targets: [], deaths: [] };
  applyAction(w, act, stream, entry);
  s.log.push(entry);
  if (partyDown(s) || enemyDown(s)) finalise(s);
  return entry;
}

function finalise(s) {
  if (s.done) return;
  s.done = true;
  s.victory = enemyDown(s) && !partyDown(s);
  if (!s.victory && !partyDown(s)) { s.stalemate = true; s.log.push({ round: s.round, side: 'system', actor: 'resolver', verb: 'STALEMATE', targets: [], deaths: [], warn: true }); }
}

// resolveCombat: batch wrapper — step to completion, no card interventions.
// (Probes + the M2 gates run through this, so the gate measures the live engine.)
export function resolveCombat(party, enemies, stream, opts = {}) {
  const s = initCombat(party, enemies);
  const cap = TUNING.combatMaxRounds * (s.order.length + 1) + 8;
  let g = 0;
  while (!s.done && g++ < cap) stepCombat(s, stream);
  if (!s.done) finalise(s);
  return {
    victory: s.victory, rounds: s.round, log: opts.quiet ? [] : s.log,
    survivors: livingFrames(party).length, enemiesDown: enemies.filter((e) => !e.alive).length,
  };
}

// ---- Standing-order AI (unchanged logic; now buff-aware) --------------------
function effAtk(w) { return w.e.max.atk + w.atkBuff; }
function effMag(w) { return w.e.max.mag + w.atkBuff; }
function effDef(w) { return w.e.max.def + w.temp.def + w.defBuff; }

function chooseAction(w, friends, foes, stream) {
  const livingFoes = foes.filter((f) => f.e.alive);
  const livingFriends = friends.filter((f) => f.e.alive);
  const verbs = w.side === 'party' ? JOBS[w.e.jobId].verbs : ENEMY_VERBS;
  if (w.side === 'enemy') {
    const target = livingFoes[stream.int(Math.max(1, livingFoes.length))] || livingFoes[0];
    return { verb: verbs[0], targets: target ? [target] : [] };
  }
  const heal = verbs.find((v) => v.kind === 'heal');
  const ward = verbs.find((v) => v.kind === 'ward');
  const guard = verbs.find((v) => v.kind === 'guard');
  const attacks = verbs.filter((v) => v.kind === 'attack' || v.kind === 'spell');
  const hurt = livingFriends.filter((f) => f.e.hp < f.e.max.hp * 0.55);
  if (heal && hurt.length) {
    if (heal.target === 'allies' || hurt.length >= 2) {
      const allyVerb = verbs.find((v) => v.kind === 'heal' && v.target === 'allies') || heal;
      return { verb: allyVerb, targets: allyVerb.target === 'allies' ? livingFriends : [mostReduced(livingFriends)] };
    }
    const single = verbs.find((v) => v.kind === 'heal' && v.target === 'ally') || heal;
    return { verb: single, targets: [mostReduced(livingFriends)] };
  }
  if (attacks.length) {
    const best = attacks.slice().sort((a, b) => b.power - a.power)[0];
    if (best.target === 'enemies') return { verb: best, targets: livingFoes };
    let target;
    if (best.id === 'distrain') target = sturdiest(livingFoes);
    else if (best.id === 'mark_and_loose') target = weakestWarded(livingFoes);
    else target = lowestHp(livingFoes);
    return { verb: best, targets: target ? [target] : [] };
  }
  if (ward) return { verb: ward, targets: livingFriends };
  if (guard) return { verb: guard, targets: [w] };
  return { verb: { id: 'stand', name: 'Stand', kind: 'guard', power: 0, target: 'self' }, targets: [w] };
}

function applyAction(w, act, stream, entry) {
  const v = act.verb;
  for (const t of act.targets) {
    if (v.kind === 'attack' || v.kind === 'spell') {
      const atkStat = v.kind === 'spell' ? effMag(w) : effAtk(w);
      const variance = 0.85 + 0.3 * stream.next();
      const raw = v.power * atkStat * variance - effDef(t) * TUNING.defScale;
      const dealt = Math.max(TUNING.dmgFloor, Math.round(raw));
      const died = t.e.alive && t.e.hp - dealt <= 0;
      t.e.hp = Math.max(0, t.e.hp - dealt); if (t.e.hp === 0) t.e.alive = false;
      entry.targets.push({ side: t.side, idx: t.idx, name: t.e.name, dmg: dealt });
      if (died) entry.deaths.push(t.e.name);
    } else if (v.kind === 'heal') {
      if (!t.e.alive) continue;
      const amount = Math.round(v.power * effMag(w) * TUNING.healScale);
      const before = t.e.hp; t.e.hp = Math.min(t.e.max.hp, t.e.hp + amount);
      entry.targets.push({ side: t.side, idx: t.idx, name: t.e.name, heal: t.e.hp - before });
    } else if (v.kind === 'guard' || v.kind === 'ward') {
      t.temp.def += Math.round(t.e.max.def * TUNING.guardDefBonus);
      entry.targets.push({ side: t.side, idx: t.idx, name: t.e.name, ward: t.temp.def });
    }
  }
}

function mostReduced(list) { return list.slice().sort((a, b) => (a.e.hp / a.e.max.hp) - (b.e.hp / b.e.max.hp))[0]; }
function lowestHp(list) { return list.slice().sort((a, b) => a.e.hp - b.e.hp)[0]; }
function sturdiest(list) { return list.slice().sort((a, b) => (b.e.max.def + b.e.hp) - (a.e.max.def + a.e.hp))[0]; }
function weakestWarded(list) { return list.slice().sort((a, b) => a.e.max.def - b.e.max.def)[0]; }

// ---- M3: card intervention (no RNG — deterministic given state + card) -------
// peekThreat: the next enemy action that will occur, as {actor, target, dmg,
// willDown}. Read-only (does not mutate ptr) — used for window-state legibility
// and 'stay' targeting.
export function peekThreat(s) {
  const n = s.order.length;
  for (let k = 0; k < n; k++) {
    const w = s.order[(s.ptr + k) % n];
    if (!w.e.alive) continue;
    if (w.side !== 'enemy' || w.stunned) continue;
    const foes = livingOf(s.partyW);
    if (!foes.length) return null;
    // enemy AI hits a party frame; estimate expected (mean-variance) damage.
    const target = foes[0]; // deterministic proxy for "a frame will be hit"
    const dmg = Math.max(TUNING.dmgFloor, Math.round(effAtk(w) * 1.0 - effDef(target) * TUNING.defScale));
    return { actor: w, target, dmg, willDown: dmg >= target.e.hp };
  }
  return null;
}
function nextEnemyToAct(s) { const t = peekThreat(s); return t ? t.actor : null; }

// applyCard: apply a card's effect to the combat state. Returns the log entry
// (with an optional { draw } signal for 'instrument'). Never consumes the stream.
export function applyCard(s, cardId) {
  const card = getCard(cardId);
  const entry = { round: s.round, side: 'card', actor: 'the desk', verb: card.name, card: cardId, text: card.text, targets: [], deaths: [] };
  const enemies = livingOf(s.enemyW);
  const allies = livingOf(s.partyW);
  const dmgOf = (p) => Math.max(TUNING.dmgFloor, Math.round(p * TUNING.cardDamageBase));

  if (card.kind === 'strike' || card.kind === 'smite') {
    const t = card.target === 'sturdiest' ? sturdiest(enemies) : card.target === 'weakest' ? lowestHp(enemies) : lowestHp(enemies);
    if (t) hitEnemy(t, dmgOf(card.power), entry);
  } else if (card.kind === 'execute') {
    const t = lowestHp(enemies);
    if (t) {
      if (t.e.hp <= card.power * t.e.max.hp) { const dealt = t.e.hp; t.e.hp = 0; t.e.alive = false; entry.targets.push({ side: 'enemy', idx: t.idx, name: t.e.name, dmg: dealt }); entry.deaths.push(t.e.name); }
      else hitEnemy(t, dmgOf(0.6), entry);
    }
  } else if (card.kind === 'mend') {
    const t = mostReduced(allies); if (t) healAlly(t, Math.round(card.power * TUNING.cardHealBase), entry);
  } else if (card.kind === 'salve') {
    for (const t of allies) healAlly(t, Math.round(card.power * TUNING.cardHealBase), entry);
  } else if (card.kind === 'rally') {
    const t = mostReduced(allies) || allies[0]; if (t) { t.atkBuff += Math.round(card.power * TUNING.cardBuffBase); entry.targets.push({ side: 'party', idx: t.idx, name: t.e.name, buff: t.atkBuff }); }
  } else if (card.kind === 'ordinance') {
    for (const t of allies) { t.atkBuff += Math.round(card.power * TUNING.cardBuffBase); entry.targets.push({ side: 'party', idx: t.idx, name: t.e.name, buff: t.atkBuff }); }
  } else if (card.kind === 'ward') {
    const targets = card.target === 'self' ? [mostReduced(allies) || allies[0]].filter(Boolean) : allies;
    for (const t of targets) { t.defBuff += Math.round(card.power * TUNING.cardWardBase); entry.targets.push({ side: 'party', idx: t.idx, name: t.e.name, ward: t.defBuff }); }
  } else if (card.kind === 'stay') {
    const t = nextEnemyToAct(s) || lowestHp(enemies); if (t) { t.stunned = true; entry.targets.push({ side: 'enemy', idx: t.idx, name: t.e.name, stay: true }); }
  } else if (card.kind === 'instrument') {
    entry.draw = card.power;
  }
  s.log.push(entry);
  if (enemyDown(s)) finalise(s);
  return entry;
}
function hitEnemy(t, dealt, entry) {
  const died = t.e.alive && t.e.hp - dealt <= 0;
  t.e.hp = Math.max(0, t.e.hp - dealt); if (t.e.hp === 0) t.e.alive = false;
  entry.targets.push({ side: 'enemy', idx: t.idx, name: t.e.name, dmg: dealt });
  if (died) entry.deaths.push(t.e.name);
}
function healAlly(t, amt, entry) {
  const before = t.e.hp; t.e.hp = Math.min(t.e.max.hp, t.e.hp + amt);
  entry.targets.push({ side: 'party', idx: t.idx, name: t.e.name, heal: t.e.hp - before });
}

/**
 * The window states as the PLAYER reads them, one plain word each. Shared with
 * the text catalog so the gate measures the string the plate actually draws.
 * The strip used to read `DEC` / `ok` / `-`: `DEC` was explained nowhere in the
 * game and the hyphen labelled nothing. The plate is 32px and shares it with
 * the input key, so `decisive` (33px in the shipped face) cannot fit however it
 * is set — these three are the audit's second choice, inside the budget.
 *   now  — playing this card here would turn the matter
 *   ok   — playable, but it decides nothing yet
 *   none — nothing on the board for it to act on
 */
export const WINDOW_LABEL = Object.freeze({ decisive: 'now', playable: 'ok', wasted: 'none' });

// evaluateCard: the per-card live window state (DESIGN-SEED M3) — 'decisive' |
// 'playable' | 'wasted' vs the resolver's next action. Pure, read-only.
export function evaluateCard(s, cardId) {
  const card = getCard(cardId);
  const enemies = livingOf(s.enemyW);
  const allies = livingOf(s.partyW);
  const threat = peekThreat(s);
  const someoneInDanger = threat && threat.willDown;
  const hurtExists = allies.some((a) => a.e.hp < a.e.max.hp);
  const lowExists = allies.some((a) => a.e.hp < a.e.max.hp * TUNING.cardDangerFrac);

  switch (card.kind) {
    case 'strike': case 'smite': {
      if (!enemies.length) return 'wasted';
      const dmg = Math.max(TUNING.dmgFloor, Math.round(card.power * TUNING.cardDamageBase));
      const kills = enemies.some((e) => e.e.hp <= dmg);
      return (kills && threat) ? 'decisive' : 'playable';
    }
    case 'execute': {
      if (!enemies.length) return 'wasted';
      const canExec = enemies.some((e) => e.e.hp <= card.power * e.e.max.hp);
      return canExec && threat ? 'decisive' : 'playable';
    }
    case 'mend': return !hurtExists ? 'wasted' : (someoneInDanger || lowExists) ? 'decisive' : 'playable';
    case 'salve': return !hurtExists ? 'wasted' : (someoneInDanger || lowExists) ? 'decisive' : 'playable';
    case 'ward': return !enemies.length ? 'wasted' : someoneInDanger ? 'decisive' : 'playable';
    case 'rally': case 'ordinance': return !enemies.length ? 'wasted' : 'playable';
    case 'stay': return !enemies.length ? 'wasted' : someoneInDanger ? 'decisive' : 'playable';
    case 'instrument': return 'playable';
    default: return 'playable';
  }
}

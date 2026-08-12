// The first coached tournament (M4): one E-rank battle, end to end. A battle is
// a turn-based clash resolved on the POW/DEF/SPD triangle. The player COACHES —
// each round you call a move, and the pet may OBEY or REFUSE depending on its
// bond and temperament, so the raising you did buys you obedience in the ring.
//
// Everything is PURE and DETERMINISTIC given a seed. The reducer carries a
// serializable rng cursor (rc) instead of a live closure, so a battle can be
// stepped, saved, replayed and TESTED without hidden state. stepBattle returns
// the next state plus the one-sentence LOG LINES for that round.
//
// The triangle (rock-paper-scissors, one stat each):
//   Strike (POW) beats Dash,  Dash (SPD) beats Guard,  Guard (DEF) beats Strike.
//   Surge (FOC) is the signature: unblockable and heavy, but costs a lot of
//   battle stamina and then goes on cooldown.

import { makeRng, rngPick } from './rng.js';
import { STRESS_MAX, FATIGUE_MAX, BOND_MAX } from './raise.js';
import { TELL_CLARITIES } from '../data/roster.js';

// --- moves -------------------------------------------------------------------
export const MOVES = {
  strike: { id: 'strike', label: 'Strike', glyph: '⚔️', stat: 'pow', beats: 'dash', stam: 5, cooldown: 0 },
  guard: { id: 'guard', label: 'Guard', glyph: '🛡️', stat: 'def', beats: 'strike', stam: 3, cooldown: 0 },
  dash: { id: 'dash', label: 'Dash', glyph: '💨', stat: 'spd', beats: 'guard', stam: 4, cooldown: 0 },
  surge: { id: 'surge', label: 'Surge', glyph: '✨', stat: 'foc', beats: '*', stam: 12, cooldown: 3 },
};
export const MOVE_IDS = ['strike', 'guard', 'dash', 'surge'];
export const BASIC_IDS = ['strike', 'guard', 'dash'];

// Enemy intent is phrased in the same short, temperament-colored register as
// mood notes. Clear tells name the physical preparation; shaded tells soften it;
// oblique tells stay truthful while pointing at an adjacent posture cue.
const TELL_PHRASES = {
  clear: {
    strike: ['sets its weight forward for a hard swing', 'draws back for a striking blow'],
    guard: ['plants itself and raises a tight guard', 'settles low and braces'],
    dash: ['leans quick, ready to dart', 'shows quick footwork before the rush'],
    surge: ['gathers a bright charge of energy', 'holds a rising glow close'],
  },
  shaded: {
    strike: ['lets one shoulder drift forward', 'presses forward behind a quiet swing'],
    guard: ['keeps a guarded, planted stance', 'plants its feet and watches'],
    dash: ['stays quick on shifting feet', 'keeps its weight shifting for a dart'],
    surge: ['hums with banked energy', 'keeps a low glow under its skin'],
  },
  oblique: {
    strike: ['quietly takes the space forward', 'makes the next swing feel close'],
    guard: ['leaves one planted line closed', 'lets its guard become very still'],
    dash: ['leaves its weight shifting nowhere for long', 'holds quick distance on restless feet'],
    surge: ['dims around a gathering charge', 'goes still around one point of energy'],
  },
};

const TELL_LEAD = {
  Bold: 'squares up',
  Wild: 'goes taut',
  Stoic: 'barely shifts',
  Cheeky: 'gives a small twitch',
  Timid: 'watches carefully',
  Curious: 'tilts toward the opening',
  Calm: 'breathes out',
  Loyal: 'checks its coach, then',
};

function tellVariant(seed, round, action) {
  let n = ((seed >>> 0) ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < action.length; i++) n = Math.imul(n ^ action.charCodeAt(i), 16777619) >>> 0;
  return n;
}

export function tellForAction(foe, action, seed = 1, round = 1) {
  const requested = foe?.species?.tellClarity;
  const clarity = TELL_CLARITIES.includes(requested) ? requested : 'clear';
  const phrases = TELL_PHRASES[clarity][action] || TELL_PHRASES[clarity].strike;
  const phrase = phrases[tellVariant(seed, round, action) % phrases.length];
  const lead = TELL_LEAD[foe?.temperament] || 'settles';
  const name = foe?.name || 'The rival';
  return {
    action,
    clarity,
    presentationClass: `tell-${clarity}`,
    text: `${name} ${lead}, then ${phrase}.`,
  };
}

const clampv = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Triangle verdict of basic move `a` against basic move `b`.
function triangle(a, b) {
  if (a === b) return 'tie';
  if (MOVES[a].beats === b) return 'win';
  if (MOVES[b].beats === a) return 'lose';
  return 'tie';
}

// A combatant's result for its own move against the other's move. Surge is
// special: it always lands heavy (unblockable), and eating a surge weakens your
// own counter-hit.
function resultFor(mine, theirs) {
  if (mine === 'surge') return 'surge';
  if (theirs === 'surge') return 'eaten';
  return triangle(mine, theirs);
}

// --- battle-stat derivation --------------------------------------------------
// HP and battle-stamina come from the raised stats, so raising matters here.
export function maxHpOf(c) {
  return 40 + Math.round(c.stats.sta * 0.6) + Math.round(c.stats.def * 0.3);
}
export function maxStamOf(c) {
  return 24 + Math.round(c.stats.sta * 0.4);
}

// --- obedience (the coaching heart) ------------------------------------------
// Bond and temperament decide whether the pet heeds a call. Stress and fatigue
// (carried from raising) erode it — a frazzled pet fights on instinct. This is
// pure and reads straight off the creature's care vitals.
const OBEY_MOD = {
  Loyal: 0.22, Stoic: 0.12, Calm: 0.12, Bold: 0.0,
  Timid: -0.03, Curious: -0.05, Cheeky: -0.15, Wild: -0.2,
};
export function obedienceChance(c) {
  let p = 0.5 + (c.bond - 50) / 120 + (OBEY_MOD[c.temperament] || 0);
  p -= (c.stress || 0) / 220 + (c.fatigue || 0) / 320;
  return clampv(p, 0.05, 0.98);
}

// What a disobedient pet does instead — its temperament's instinct (never Surge).
const INSTINCT = {
  Bold: 'strike', Wild: 'strike', Loyal: 'strike',
  Cheeky: 'dash', Curious: 'dash',
  Timid: 'guard', Calm: 'guard', Stoic: 'guard',
};
function instinctMove(c) {
  return INSTINCT[c.temperament] || 'strike';
}

// --- combatant + battle construction -----------------------------------------
function makeCombatant(side, c) {
  return {
    side,
    name: c.name || (side === 'foe' ? 'Rival' : 'Your pet'),
    rank: c.rank || null,
    temperament: c.temperament || 'Bold',
    bond: c.bond ?? 50,
    stress: c.stress ?? 0,
    fatigue: c.fatigue ?? 0,
    stats: { ...c.stats },
    hp: maxHpOf(c),
    maxHp: maxHpOf(c),
    stam: maxStamOf(c),
    maxStam: maxStamOf(c),
    cooldowns: { surge: 0 },
    lastMove: null,
  };
}

// startBattle(playerCreature, opponentCreature, seed) -> battle state.
export function startBattle(creature, opponent, seed = 1) {
  const s = {
    seed: seed >>> 0,
    rc: 0,
    round: 0,
    over: false,
    winner: null,
    player: makeCombatant('player', creature),
    foe: makeCombatant('foe', opponent),
    log: [],
  };
  // Reserve the round's obedience roll before choosing the foe move, preserving
  // the established seeded RNG order while making that move visible pre-commit.
  s.playerObeyRoll = roll(s);
  s.foeIntent = chooseFoeIntent(s);
  return s;
}

// One deterministic roll in [0,1), advancing the serializable cursor on `s`.
function roll(s) {
  const r = makeRng((s.seed + s.rc * 0x9e3779b1) >>> 0)();
  s.rc += 1;
  return r;
}

function cloneCombatant(c) {
  return { ...c, stats: { ...c.stats }, cooldowns: { ...c.cooldowns } };
}
function cloneState(s) {
  return { ...s, player: cloneCombatant(s.player), foe: cloneCombatant(s.foe), log: s.log.slice() };
}

// Can this combatant actually perform `move` right now?
export function canUse(c, move) {
  const m = MOVES[move];
  if (!m) return false;
  if (m.cooldown > 0 && (c.cooldowns[move] || 0) > 0) return false;
  if (c.stam < m.stam) return false;
  return true;
}

// --- opponent AI (E-rank: simple and readable) -------------------------------
function strongestBasic(c) {
  let best = 'strike';
  let bestVal = -Infinity;
  for (const id of BASIC_IDS) {
    const v = c.stats[MOVES[id].stat] || 0;
    if (v > bestVal) { bestVal = v; best = id; }
  }
  return best;
}
// The basic move that beats `target`.
function counterTo(target) {
  for (const id of BASIC_IDS) if (MOVES[id].beats === target) return id;
  return 'strike';
}
function foeChoose(s, foe, playerLast) {
  const affordable = BASIC_IDS.filter((id) => foe.stam >= MOVES[id].stam);
  const pool = affordable.length ? affordable : ['guard'];
  const r = roll(s);
  let pick;
  if (r < 0.2) pick = rngPick(makeRng((s.seed + s.rc * 0x85ebca6b) >>> 0), pool);
  else if (r < 0.55 && playerLast && BASIC_IDS.includes(playerLast)) pick = counterTo(playerLast);
  else pick = strongestBasic(foe);
  s.rc += 1;
  return pool.includes(pick) ? pick : pool[0];
}

function chooseFoeIntent(s) {
  const move = foeChoose(s, s.foe, s.player.lastMove);
  return {
    move,
    tell: tellForAction(s.foe, move, s.seed, s.round + 1),
  };
}

// --- damage ------------------------------------------------------------------
function attackDamage(s, move, atk, def, result) {
  const stat = atk.stats[MOVES[move].stat] || 0;
  let base = Math.max(3, stat - Math.round((def.stats.def || 0) * 0.35));
  let mult = 1.0;
  if (result === 'win') mult = 1.6;
  else if (result === 'lose') mult = 0.4;
  else if (result === 'surge') mult = 1.9;
  else if (result === 'eaten') mult = 0.5;
  const winded = atk.stam <= 0 ? 0.5 : 1;
  const variance = 0.9 + roll(s) * 0.2;
  return Math.max(1, Math.round(base * mult * winded * variance));
}

// --- log line phrasing -------------------------------------------------------
function obeyLine(c, commanded) {
  const verb = c.bond >= 70 ? 'trusts you and' : 'heeds the call and';
  return `${c.name} ${verb} readies a ${MOVES[commanded].label}.`;
}
function refuseLine(c, commanded, actual) {
  const why = c.stress >= 55
    ? 'too frazzled to listen'
    : c.temperament === 'Wild' ? 'too wild to heed you'
      : c.temperament === 'Cheeky' ? 'feeling cheeky'
        : c.bond < 40 ? 'not sure it trusts you'
          : 'caught up in the moment';
  return `${c.name} ignores the ${MOVES[commanded].label} (${why}) and goes for a ${MOVES[actual].label}.`;
}
function clashLine(p, f, pMove, fMove, pRes, pDmg, fDmg) {
  const P = MOVES[pMove].label, F = MOVES[fMove].label;
  let head;
  if (pRes === 'surge') head = `${p.name}'s Surge tears through`;
  else if (pRes === 'eaten') head = `${p.name} is caught by the Surge`;
  else if (pRes === 'win') head = `${P} beats ${F}`;
  else if (pRes === 'lose') head = `${F} turns aside the ${P}`;
  else head = `${P} clashes with ${F}`;
  return `${head} - ${f.name} takes ${pDmg}, ${p.name} takes ${fDmg}.`;
}
function koLine(s) {
  return s.winner === 'player'
    ? `${s.foe.name} is down. ${s.player.name} wins the bout!`
    : `${s.player.name} can't continue. ${s.foe.name} takes the bout.`;
}

// --- announcer beats (M8) ----------------------------------------------------
// Tournament colour: a pre-bout call the UI shows before round one, and a crowd
// flourish appended to the knockout. Pure, deterministic, and phrased off what
// actually happened (the winner's remaining health tells a rout from a squeaker).
export function battleIntro(state) {
  const p = state.player, f = state.foe;
  const rank = f.rank || 'E';
  return {
    kind: 'announce',
    text: `The ${rank}-rank bout is set - ${p.name} steps up against ${f.name} the ${f.temperament} rival. Coach well!`,
  };
}
function flourishLine(s) {
  const won = s.winner === 'player';
  const win = won ? s.player : s.foe;
  const frac = win.maxHp > 0 ? win.hp / win.maxHp : 0;
  const margin = frac >= 0.6 ? 'commanding' : frac <= 0.15 ? 'razor-thin' : 'hard-fought';
  if (won) {
    if (margin === 'commanding') return `The crowd roars - a commanding win for ${s.player.name}!`;
    if (margin === 'razor-thin') return `${s.player.name} wins by a whisker, and the stands erupt!`;
    return `A hard-fought win - ${s.player.name} earns this one.`;
  }
  if (margin === 'commanding') return `${s.foe.name} was in control throughout. Back to training.`;
  if (margin === 'razor-thin') return `So close - ${s.player.name} nearly had it. Heartbreak in the ring.`;
  return `${s.foe.name} takes a hard-fought bout. There's always the next meet.`;
}

// --- the round reducer -------------------------------------------------------
// stepBattle(state, command) -> { state, events }. command = { move }.
// events are this round's log lines: { kind, text }. kind vocabulary:
//   'command' | 'obey' | 'refuse' | 'clash' | 'ko'
export function stepBattle(state, command) {
  if (state.over) return { state, events: [] };
  const s = cloneState(state);
  const events = [];
  s.round += 1;
  const p = s.player, f = s.foe;

  // 1. resolve the command (fall back if the called move isn't available)
  let commanded = command && MOVES[command.move] ? command.move : 'strike';
  if (!canUse(p, commanded)) commanded = 'strike';
  events.push({ kind: 'command', text: `Round ${s.round}: you call for ${MOVES[commanded].label}.` });

  // 2. obey / refuse
  const obeyP = obedienceChance(p);
  const obeyed = (s.playerObeyRoll ?? roll(s)) < obeyP;
  let pMove = commanded;
  if (obeyed) {
    events.push({ kind: 'obey', text: obeyLine(p, commanded) });
  } else {
    pMove = instinctMove(p);
    if (!canUse(p, pMove)) pMove = 'strike';
    events.push({ kind: 'refuse', text: refuseLine(p, commanded, pMove) });
  }

  // 3. opponent chooses
  const fMove = s.foeIntent?.move || foeChoose(s, f, p.lastMove);

  // 4. results + simultaneous damage
  const pRes = resultFor(pMove, fMove);
  const fRes = resultFor(fMove, pMove);
  const pDmg = attackDamage(s, pMove, p, f, pRes);
  const fDmg = attackDamage(s, fMove, f, p, fRes);
  f.hp = Math.max(0, f.hp - pDmg);
  p.hp = Math.max(0, p.hp - fDmg);

  // 5. costs, cooldowns, memory
  p.stam = Math.max(0, p.stam - MOVES[pMove].stam);
  f.stam = Math.max(0, f.stam - MOVES[fMove].stam);
  if (pMove === 'surge') p.cooldowns.surge = MOVES.surge.cooldown + 1;
  if (fMove === 'surge') f.cooldowns.surge = MOVES.surge.cooldown + 1;
  p.lastMove = pMove;
  f.lastMove = fMove;
  tickCooldowns(p);
  tickCooldowns(f);

  events.push({ kind: 'clash', text: clashLine(p, f, pMove, fMove, pRes, pDmg, fDmg) });

  // 6. knockout
  if (p.hp <= 0 || f.hp <= 0) {
    s.over = true;
    if (f.hp <= 0 && p.hp <= 0) s.winner = p.hp >= f.hp ? 'player' : 'foe';
    else s.winner = f.hp <= 0 ? 'player' : 'foe';
    events.push({ kind: 'ko', text: koLine(s) });
    events.push({ kind: 'announce', text: flourishLine(s) });
  }

  // Prepare the next truthful cue only while another command can be made.
  // Reserving obedience first keeps the historical RNG sequence intact.
  if (s.over) {
    s.playerObeyRoll = null;
    s.foeIntent = null;
  } else {
    s.playerObeyRoll = roll(s);
    s.foeIntent = chooseFoeIntent(s);
  }

  s.log = [...s.log, ...events];
  return { state: s, events };
}

function tickCooldowns(c) {
  for (const k of Object.keys(c.cooldowns)) {
    if (c.cooldowns[k] > 0) c.cooldowns[k] -= 1;
  }
}

// --- opponents (clean-room ladder stables E / D / C) -------------------------
// A stable of rivals per rung, each a renderable creature (archetype + hue) so
// drawCreature can put a real animated foe across the ring. Names/species are our
// own coinage. Stats climb by rung: an M2-raised pet clears E, a well-raised one
// pushes into D, and C is the wall that rewards a full raising run. M8 owns the
// exact bands; these are legible first-pass tiers.
const E_FOES = [
  { name: 'Muddle', species: 'Bog Pollywog', archetype: 'aquatic', hue: 150, tellClarity: 'clear', temperament: 'Timid', stats: { pow: 22, def: 24, spd: 20, sta: 28, foc: 16 } },
  { name: 'Sprocket', species: 'Tin Beetle', archetype: 'bug', hue: 40, tellClarity: 'clear', temperament: 'Stoic', stats: { pow: 26, def: 28, spd: 18, sta: 24, foc: 18 } },
  { name: 'Yipp', species: 'Dust Kit', archetype: 'critter', hue: 30, tellClarity: 'shaded', temperament: 'Wild', stats: { pow: 24, def: 18, spd: 30, sta: 22, foc: 16 } },
  { name: 'Blorb', species: 'Puddle Slime', archetype: 'blob', hue: 120, tellClarity: 'clear', temperament: 'Calm', stats: { pow: 20, def: 26, spd: 16, sta: 30, foc: 20 } },
  { name: 'Pecky', species: 'Scrub Fledgling', archetype: 'avian', hue: 55, tellClarity: 'shaded', temperament: 'Cheeky', stats: { pow: 25, def: 20, spd: 28, sta: 20, foc: 18 } },
];
const D_FOES = [
  { name: 'Grivet', species: 'Crag Toad', archetype: 'aquatic', hue: 170, tellClarity: 'clear', temperament: 'Stoic', stats: { pow: 38, def: 42, spd: 30, sta: 44, foc: 30 } },
  { name: 'Karn', species: 'Iron Stag', archetype: 'critter', hue: 20, tellClarity: 'clear', temperament: 'Bold', stats: { pow: 46, def: 38, spd: 36, sta: 40, foc: 28 } },
  { name: 'Whisk', species: 'Gale Vixen', archetype: 'critter', hue: 300, tellClarity: 'oblique', temperament: 'Cheeky', stats: { pow: 36, def: 30, spd: 50, sta: 34, foc: 32 } },
  { name: 'Thummel', species: 'Loam Golem', archetype: 'blob', hue: 100, tellClarity: 'clear', temperament: 'Calm', stats: { pow: 34, def: 48, spd: 24, sta: 50, foc: 34 } },
  { name: 'Skree', species: 'Cliff Harrier', archetype: 'avian', hue: 210, tellClarity: 'shaded', temperament: 'Wild', stats: { pow: 42, def: 32, spd: 46, sta: 34, foc: 30 } },
];
const C_FOES = [
  { name: 'Basalt', species: 'Ridge Wyrm', archetype: 'aquatic', hue: 260, tellClarity: 'shaded', temperament: 'Bold', stats: { pow: 58, def: 56, spd: 44, sta: 60, foc: 46 } },
  { name: 'Vex', species: 'Ember Jackal', archetype: 'critter', hue: 12, tellClarity: 'oblique', temperament: 'Wild', stats: { pow: 64, def: 46, spd: 56, sta: 52, foc: 44 } },
  { name: 'Orrin', species: 'Bastion Beetle', archetype: 'bug', hue: 48, tellClarity: 'shaded', temperament: 'Stoic', stats: { pow: 50, def: 66, spd: 40, sta: 62, foc: 48 } },
  { name: 'Halcyon', species: 'Storm Roc', archetype: 'avian', hue: 200, tellClarity: 'oblique', temperament: 'Calm', stats: { pow: 54, def: 48, spd: 62, sta: 50, foc: 52 } },
  { name: 'Mirella', species: 'Prism Sylph', archetype: 'humanoid', hue: 320, tellClarity: 'oblique', temperament: 'Loyal', stats: { pow: 52, def: 50, spd: 54, sta: 54, foc: 60 } },
];
const FOE_STABLES = { E: E_FOES, D: D_FOES, C: C_FOES };

// Build a renderable, battle-ready opponent for a rank from a seed. Deterministic.
export function makeOpponent(seed, rank = 'E') {
  const rng = makeRng((seed ^ 0x0ba77_1e) >>> 0);
  const stable = FOE_STABLES[rank] || E_FOES;
  const base = rngPick(rng, stable);
  const jitter = () => Math.round((rng() - 0.5) * 6); // +/-3 wobble
  const stats = {};
  for (const k of ['pow', 'def', 'spd', 'sta', 'foc']) {
    stats[k] = clampv((base.stats[k] || 20) + jitter(), 10, 80);
  }
  return {
    name: base.name,
    species: { id: base.species, name: base.species, archetype: base.archetype, hue: base.hue, tellClarity: base.tellClarity },
    rarity: 'common',
    stats,
    temperament: base.temperament,
    rank,
    bond: 60, // rivals fight for their own coach; steady but not perfect
    stress: 0,
    fatigue: 0,
    seed: (seed ^ 0x0ba77_1e) >>> 0,
    variant: (seed * 2654435761) >>> 0,
  };
}

// --- prize + settlement ------------------------------------------------------
const PRIZE_TABLE = {
  E: { win: 60, loss: 10 },
  D: { win: 110, loss: 18 },
  C: { win: 180, loss: 28 },
};
export function battleReward(rank, won) {
  const t = PRIZE_TABLE[rank] || PRIZE_TABLE.E;
  return { money: won ? t.win : t.loss };
}

// Fold a finished battle back into the save world: pay the prize into the estate,
// bank the win/loss record, and apply the battle's wear (stress + fatigue up,
// a small bond bump for a shared victory). Pure — returns fresh creature+estate.
export function settleBattle(state, creature, estate) {
  const won = state.winner === 'player';
  const rank = state.foe?.rank || 'E';
  const reward = battleReward(rank, won);
  const nextCreature = {
    ...creature,
    stress: clampv((creature.stress || 0) + (won ? 6 : 14), 0, STRESS_MAX),
    fatigue: clampv((creature.fatigue || 0) + 16, 0, FATIGUE_MAX),
    bond: clampv((creature.bond || 0) + (won ? 4 : 1), 0, BOND_MAX),
  };
  const rec = estate.record || { wins: 0, losses: 0 };
  const nextEstate = {
    ...estate,
    money: (estate.money || 0) + reward.money,
    record: { wins: rec.wins + (won ? 1 : 0), losses: rec.losses + (won ? 0 : 1) },
  };
  return { won, reward, creature: nextCreature, estate: nextEstate };
}

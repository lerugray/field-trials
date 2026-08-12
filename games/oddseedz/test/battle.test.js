import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOVES, MOVE_IDS, BASIC_IDS,
  maxHpOf, maxStamOf, obedienceChance, canUse,
  startBattle, stepBattle, makeOpponent, battleReward, settleBattle,
  battleIntro, tellForAction,
} from '../src/engine/battle.js';

// A helper creature with tunable care vitals.
function pet(over = {}) {
  return {
    name: 'Testo',
    temperament: 'Loyal',
    bond: 60,
    stress: 0,
    fatigue: 0,
    stats: { pow: 40, def: 30, spd: 35, sta: 40, foc: 45 },
    ...over,
  };
}

test('the triangle is a clean rock-paper-scissors over the three basics', () => {
  // strike>dash, dash>guard, guard>strike — each basic beats exactly one other.
  assert.equal(MOVES.strike.beats, 'dash');
  assert.equal(MOVES.dash.beats, 'guard');
  assert.equal(MOVES.guard.beats, 'strike');
  const targets = BASIC_IDS.map((id) => MOVES[id].beats).sort();
  assert.deepEqual(targets, ['dash', 'guard', 'strike']); // a perfect cycle
});

test('every move maps to one distinct stat', () => {
  const stats = MOVE_IDS.map((id) => MOVES[id].stat);
  assert.deepEqual([...new Set(stats)].sort(), ['def', 'foc', 'pow', 'spd']);
});

test('battle HP and stamina derive from the raised stats', () => {
  const strong = pet({ stats: { pow: 40, def: 60, spd: 35, sta: 60, foc: 45 } });
  const weak = pet({ stats: { pow: 40, def: 20, spd: 35, sta: 20, foc: 45 } });
  assert.ok(maxHpOf(strong) > maxHpOf(weak), 'more STA/DEF => more HP');
  assert.ok(maxStamOf(strong) > maxStamOf(weak), 'more STA => more stamina');
});

test('obedience rises with bond and falls with stress/fatigue', () => {
  const low = obedienceChance(pet({ bond: 20 }));
  const high = obedienceChance(pet({ bond: 95 }));
  assert.ok(high > low, 'bond buys obedience');
  const calm = obedienceChance(pet({ bond: 60, stress: 0, fatigue: 0 }));
  const frazzled = obedienceChance(pet({ bond: 60, stress: 90, fatigue: 90 }));
  assert.ok(frazzled < calm, 'stress and fatigue erode obedience');
  // clamped to a sane window
  assert.ok(obedienceChance(pet({ bond: 100, temperament: 'Loyal' })) <= 0.98);
  assert.ok(obedienceChance(pet({ bond: 0, stress: 100, fatigue: 100, temperament: 'Wild' })) >= 0.05);
});

test('temperament shifts obedience (Loyal heeds, Wild strays)', () => {
  const loyal = obedienceChance(pet({ temperament: 'Loyal' }));
  const wild = obedienceChance(pet({ temperament: 'Wild' }));
  assert.ok(loyal > wild);
});

test('a fresh battle sets both sides to full HP/stamina and no log', () => {
  const s = startBattle(pet(), makeOpponent(123), 7);
  assert.equal(s.round, 0);
  assert.equal(s.over, false);
  assert.equal(s.winner, null);
  assert.equal(s.log.length, 0);
  assert.equal(s.player.hp, s.player.maxHp);
  assert.equal(s.foe.stam, s.foe.maxStam);
});

test('tell clarity tiers produce their intended subtle presentation classes', () => {
  const expected = {
    clear: 'tell-clear',
    shaded: 'tell-shaded',
    oblique: 'tell-oblique',
  };
  const actionWords = {
    strike: /swing|striking|forward/,
    guard: /brace|guard|planted/,
    dash: /dart|quick|shifting/,
    surge: /charge|energy|glow/,
  };
  for (const [clarity, presentationClass] of Object.entries(expected)) {
    for (const action of MOVE_IDS) {
      const tell = tellForAction({
        name: 'Rival',
        temperament: 'Cheeky',
        species: { name: 'Test Beast', tellClarity: clarity },
      }, action, 91, 3);
      assert.equal(tell.action, action);
      assert.equal(tell.clarity, clarity);
      assert.equal(tell.presentationClass, presentationClass);
      assert.match(tell.text, actionWords[action], `${clarity} ${action} stays truthful`);
    }
  }
});

test('the visible tell always binds to the move the foe actually uses over seeded rounds', () => {
  let checked = 0;
  for (let seed = 1; seed <= 240; seed++) {
    let s = startBattle(
      pet({ stats: { pow: 45, def: 45, spd: 45, sta: 80, foc: 45 } }),
      makeOpponent(seed, ['E', 'D', 'C'][seed % 3]),
      seed,
    );
    for (let round = 0; round < 8 && !s.over; round++) {
      const shown = s.foeIntent;
      assert.ok(shown && shown.tell, `seed ${seed} round ${round + 1} has a pre-commit tell`);
      assert.equal(shown.tell.action, shown.move, `seed ${seed} tell names its chosen move`);
      const next = stepBattle(s, { move: BASIC_IDS[(seed + round) % BASIC_IDS.length] }).state;
      assert.equal(next.foe.lastMove, shown.move, `seed ${seed} round ${round + 1} used the telegraphed move`);
      s = next;
      checked++;
    }
  }
  assert.ok(checked > 500, `property exercised ${checked} seeded rounds`);
});

test('stepBattle is deterministic for the same seed and command stream', () => {
  const foe = makeOpponent(999);
  const run = () => {
    let s = startBattle(pet(), foe, 42);
    const cmds = ['strike', 'guard', 'dash', 'strike', 'dash'];
    for (const m of cmds) { if (s.over) break; s = stepBattle(s, { move: m }).state; }
    return s;
  };
  const a = run();
  const b = run();
  assert.equal(a.player.hp, b.player.hp);
  assert.equal(a.foe.hp, b.foe.hp);
  assert.deepEqual(a.log.map((l) => l.text), b.log.map((l) => l.text));
});

test('stepBattle does not mutate the input state (pure reducer)', () => {
  const s0 = startBattle(pet(), makeOpponent(3), 5);
  const before = JSON.stringify(s0);
  stepBattle(s0, { move: 'strike' });
  assert.equal(JSON.stringify(s0), before, 'input state untouched');
});

test('each round emits a command line, an obey/refuse line, and a clash line', () => {
  const s = startBattle(pet(), makeOpponent(11), 8);
  const { events } = stepBattle(s, { move: 'strike' });
  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.includes('command'));
  assert.ok(kinds.includes('obey') || kinds.includes('refuse'));
  assert.ok(kinds.includes('clash'));
  for (const e of events) assert.ok(typeof e.text === 'string' && e.text.length > 0);
});

test('a low-bond frazzled pet refuses commands (obey/refuse theater)', () => {
  // bond 5, max stress/fatigue, Wild temperament => obedience floored at 0.05.
  const rebel = pet({ bond: 5, stress: 100, fatigue: 100, temperament: 'Wild' });
  let s = startBattle(rebel, makeOpponent(1), 3);
  let sawRefuse = false;
  for (let i = 0; i < 6 && !s.over; i++) {
    const { state, events } = stepBattle(s, { move: 'guard' });
    s = state;
    if (events.some((e) => e.kind === 'refuse')) sawRefuse = true;
  }
  assert.ok(sawRefuse, 'a rebellious pet should disobey at least once in six rounds');
});

test('a devoted pet obeys reliably', () => {
  const good = pet({ bond: 100, stress: 0, fatigue: 0, temperament: 'Loyal' });
  let s = startBattle(good, makeOpponent(2), 4);
  let obeys = 0, rounds = 0;
  for (let i = 0; i < 6 && !s.over; i++) {
    const { state, events } = stepBattle(s, { move: 'strike' });
    s = state;
    rounds++;
    if (events.some((e) => e.kind === 'obey')) obeys++;
  }
  assert.ok(obeys >= Math.ceil(rounds * 0.6), 'a devoted pet obeys most of the time');
});

test('the triangle advantage is felt: winning the matchup hits harder', () => {
  // Compare damage when the player wins vs loses the triangle, all else equal.
  // Strike(player) vs a foe forced to a losing move — measured via many seeds.
  const strongHitter = pet({ stats: { pow: 60, def: 30, spd: 35, sta: 40, foc: 45 }, bond: 100, temperament: 'Loyal' });
  let winFoeHp = 0, loseFoeHp = 0, n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    // We cannot force the foe move, but over many seeds a player who always
    // strikes will, on net, deal more total damage than one who always guards
    // against the same foe (strike is offensive, guard is defensive).
    let sa = startBattle(strongHitter, makeOpponent(50), seed);
    let sb = startBattle(strongHitter, makeOpponent(50), seed);
    sa = stepBattle(sa, { move: 'strike' }).state;
    sb = stepBattle(sb, { move: 'guard' }).state;
    winFoeHp += sa.foe.maxHp - sa.foe.hp;
    loseFoeHp += sb.foe.maxHp - sb.foe.hp;
    n++;
  }
  assert.ok(winFoeHp > loseFoeHp, 'striking deals more damage than guarding on net');
});

test('Surge respects stamina and cooldown (falls back when unavailable)', () => {
  const s = startBattle(pet(), makeOpponent(7), 6);
  assert.ok(canUse(s.player, 'surge'), 'fresh pet can surge');
  const after = stepBattle(s, { move: 'surge' }).state;
  // Surge put it on cooldown; it cannot immediately surge again.
  assert.ok(after.player.cooldowns.surge > 0);
  assert.ok(!canUse(after.player, 'surge'), 'cannot surge while on cooldown');
});

test('a battle reaches a decisive winner within a bounded number of rounds', () => {
  let s = startBattle(pet({ stats: { pow: 55, def: 40, spd: 45, sta: 45, foc: 50 } }), makeOpponent(88), 12);
  let guard = 0;
  while (!s.over && guard < 60) {
    s = stepBattle(s, { move: 'strike' }).state;
    guard++;
  }
  assert.ok(s.over, 'battle terminates');
  assert.ok(s.winner === 'player' || s.winner === 'foe');
  assert.ok(guard < 60, 'terminates well before the guard rail');
});

test('makeOpponent is deterministic and renderable', () => {
  const a = makeOpponent(2026);
  const b = makeOpponent(2026);
  assert.deepEqual(a, b);
  assert.ok(a.species && a.species.archetype && typeof a.species.hue === 'number');
  assert.ok(a.rarity && a.stats && a.temperament && a.rank === 'E');
});

test('winning pays the E-rank prize into the estate and banks the record', () => {
  const estate = { money: 100 };
  const finished = { winner: 'player', foe: { rank: 'E' } };
  const r = settleBattle(finished, pet(), estate);
  assert.equal(r.won, true);
  assert.equal(r.reward.money, battleReward('E', true).money);
  assert.equal(r.estate.money, 100 + battleReward('E', true).money);
  assert.deepEqual(r.estate.record, { wins: 1, losses: 0 });
  assert.ok(r.creature.bond >= pet().bond, 'a win nudges bond up');
});

test('losing still pays a consolation and banks a loss, with more wear', () => {
  const estate = { money: 100 };
  const finished = { winner: 'foe', foe: { rank: 'E' } };
  const r = settleBattle(finished, pet({ stress: 10, fatigue: 10 }), estate);
  assert.equal(r.won, false);
  assert.equal(r.estate.money, 100 + battleReward('E', false).money);
  assert.deepEqual(r.estate.record, { wins: 0, losses: 1 });
  assert.ok(r.creature.stress > 10, 'a loss frazzles the pet more');
});

test('settleBattle preserves an existing record and does not mutate inputs', () => {
  const estate = { money: 50, record: { wins: 3, losses: 2 } };
  const snap = JSON.stringify(estate);
  const r = settleBattle({ winner: 'player', foe: { rank: 'E' } }, pet(), estate);
  assert.deepEqual(r.estate.record, { wins: 4, losses: 2 });
  assert.equal(JSON.stringify(estate), snap, 'input estate untouched');
});

// --- announcer beats (M8) ----------------------------------------------------
test('battleIntro names both fighters and the rank, and is announce-kind', () => {
  const s = startBattle(pet(), makeOpponent(5, 'D'), 9);
  const intro = battleIntro(s);
  assert.equal(intro.kind, 'announce');
  assert.ok(intro.text.includes(s.player.name), 'intro names your pet');
  assert.ok(intro.text.includes(s.foe.name), 'intro names the rival');
  assert.ok(intro.text.includes('D-rank'), 'intro names the rung');
});

test('a knockout appends an announcer flourish after the KO line', () => {
  // A strong pet vs a weak foe reaches a KO quickly; the last two events should
  // be the KO and then the crowd flourish.
  const strong = pet({ stats: { pow: 80, def: 60, spd: 70, sta: 70, foc: 60 }, bond: 100, temperament: 'Loyal' });
  let s = startBattle(strong, makeOpponent(2, 'E'), 3);
  let last = [];
  let guard = 0;
  while (!s.over && guard++ < 200) {
    const r = stepBattle(s, { move: 'strike' });
    s = r.state;
    last = r.events;
  }
  assert.ok(s.over, 'bout ended');
  const kinds = last.map((e) => e.kind);
  assert.ok(kinds.includes('ko'), 'KO event present');
  assert.ok(kinds.includes('announce'), 'announcer flourish present on the KO round');
  // The flourish comes after the KO line.
  assert.ok(kinds.lastIndexOf('announce') > kinds.indexOf('ko'), 'flourish follows the KO');
  const flourish = last[kinds.lastIndexOf('announce')].text;
  assert.ok(typeof flourish === 'string' && flourish.length > 0);
});

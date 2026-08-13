// leg1-survival.mjs — headless leg-1 replay with competent card play (economy probe
// policy) to test whether early wipes are mathematically survivable. Soak tooling.

import { TUNING } from '../src/tuning.js';
import { createMarch, step } from '../src/engine.js';
import { createParty, isWiped, livingFrames, earnGold } from '../src/party.js';
import { makeEnemies, initCombat, stepCombat, applyCard, evaluateCard } from '../src/combat.js';
import { createDeck, drawUp, playFromHand, discardHand, getCard, STARTING_DECK } from '../src/deck.js';
import { escalationMult } from '../src/certifications.js';

const HEAL_BELOW = 0.6;
const KIND_TIER = { 1: 'routine', 2: 'elite', 3: 'boss' };

function partyHpFrac(s) {
  let hp = 0, mx = 0;
  for (const w of s.partyW) { hp += Math.max(0, w.e.hp); mx += w.e.max.hp; }
  return mx ? hp / mx : 0;
}

function autoPlayCards(s, deck, shuffleStream) {
  let acted = true;
  while (acted && !s.done) {
    acted = false;
    for (let i = 0; i < deck.hand.length; i++) {
      const id = deck.hand[i], card = getCard(id), win = evaluateCard(s, id);
      const isHeal = card.kind === 'mend' || card.kind === 'salve' || card.kind === 'ward';
      const wantHeal = isHeal && win !== 'wasted' && partyHpFrac(s) < HEAL_BELOW;
      if (win === 'decisive' || wantHeal) {
        applyCard(s, id); playFromHand(deck, i);
        if (card.kind === 'instrument') drawUp(deck, card.power, shuffleStream);
        acted = true; break;
      }
    }
  }
}

function resolveWithDeck(party, enemies, deck, streams, meta) {
  const s = initCombat(party, enemies);
  discardHand(deck); drawUp(deck, TUNING.handSize, streams.shuffle);
  const cap = TUNING.combatMaxRounds * (s.order.length + 1) + 8;
  let g = 0, round = s.round;
  const log = [];
  while (!s.done && g++ < cap) {
    autoPlayCards(s, deck, streams.shuffle);
    if (s.done) break;
    const entry = stepCombat(s, streams.combat);
    if (entry && entry.round > round) { round = entry.round; drawUp(deck, TUNING.handSize, streams.shuffle); }
    log.push({ round: s.round, hp: partyHpFrac(s), done: s.done, victory: s.victory });
  }
  return { victory: !!s.victory, log, finalHp: livingFrames(party).map((f) => ({ id: f.id, hp: f.hp, max: f.max.hp })) };
}

function runLeg1(seed) {
  const meta = { runs: 0, deepestLeg: 0, mastery: {} };
  const party = createParty();
  const deck = createDeck(STARTING_DECK);
  const march = createMarch(seed);
  const combats = [];
  let events = [];

  while (!isWiped(party)) {
    events = step(march);
    for (const ev of events) {
      if (ev.type === 'encounter') {
        const tier = KIND_TIER[ev.kind] || 'routine';
        party.supplies = Math.max(0, party.supplies - TUNING.supplyPerEncounter);
        const enemies = makeEnemies(tier, march.streams.combat);
        const r = resolveWithDeck(party, enemies, deck, march.streams, meta);
        combats.push({ n: ev.n, kind: ev.kind, tier, victory: r.victory, hp: r.finalHp, logLen: r.log.length });
        if (r.victory) {
          const gm = march.legMods ? march.legMods.goldMult : 1;
          earnGold(party, Math.round((TUNING.goldPerWin[tier] || 0) * gm * escalationMult(meta)));
        }
        if (isWiped(party)) return { seed, wiped: true, at: 'encounter', combats, gold: party.gold, party: livingFrames(party).length };
      }
      if (ev.type === 'leg-complete') {
        return { seed, wiped: false, combats, gold: party.gold, encounters: ev.encounters, hp: party.frames.map((f) => ({ id: f.id, hp: f.hp, max: f.max.hp })) };
      }
    }
  }
  return { seed, wiped: true, combats, gold: party.gold };
}

const seeds = process.argv.slice(2).map(Number).filter(Boolean);
const list = seeds.length ? seeds : [7];
for (const s of list) console.log(JSON.stringify(runLeg1(s)));

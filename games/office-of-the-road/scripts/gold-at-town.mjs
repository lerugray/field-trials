// gold-at-town.mjs — compute party gold at first town arrival + shop stock for a seed.
// Mirrors soak path: leg-0 combats with limited card play, save-reload not modeled.

import { TUNING } from '../src/tuning.js';
import { createMarch, step } from '../src/engine.js';
import { createParty, isWiped, livingFrames, earnGold } from '../src/party.js';
import { makeEnemies, initCombat, stepCombat, applyCard, evaluateCard } from '../src/combat.js';
import { createDeck, drawUp, playFromHand, discardHand, getCard, STARTING_DECK } from '../src/deck.js';
import { generateShop, isTownLeg } from '../src/shop.js';
import { escalationMult } from '../src/certifications.js';

// Soak combat policy (src/soak.js)
function soakPlayCards(party, s, deck, shuffleStream, cardsPlayed, cardBudget) {
  if (cardsPlayed >= cardBudget || !deck.hand.length) return cardsPlayed;
  const minHp = Math.min(...party.frames.filter((f) => f.alive).map((f) => f.hp / f.max.hp), 1);
  const hurt = minHp < 0.8;
  let idx = 0;
  if (hurt) {
    const h = deck.hand.findIndex((id) => ['mend', 'salve', 'ward'].includes(getCard(id).kind));
    if (h >= 0) idx = h;
  }
  const cardId = deck.hand[idx];
  applyCard(s, cardId);
  playFromHand(deck, idx);
  if (getCard(cardId).kind === 'instrument') drawUp(deck, getCard(cardId).power, shuffleStream);
  return cardsPlayed + 1;
}

function resolveSoakCombat(party, enemies, deck, streams, meta) {
  const s = initCombat(party, enemies);
  discardHand(deck);
  drawUp(deck, TUNING.handSize, streams.shuffle);
  let cardsThisFight = 0;
  const cap = TUNING.combatMaxRounds * (s.order.length + 1) + 8;
  let g = 0, round = s.round;
  while (!s.done && g++ < cap) {
    const minHp = Math.min(...party.frames.filter((f) => f.alive).map((f) => f.hp / f.max.hp), 1);
    const hurt = minHp < 0.8;
    const cardBudget = hurt ? 3 : 2;
    cardsThisFight = soakPlayCards(party, s, deck, streams.shuffle, cardsThisFight, cardBudget);
    if (s.done) break;
    stepCombat(s, streams.combat);
    if (s.round > round) { round = s.round; drawUp(deck, TUNING.handSize, streams.shuffle); }
  }
  return { victory: !!s.victory, tier: s.victory ? (s.enemies[0]?.tier || 'routine') : null };
}

const KIND_TIER = { 1: 'routine', 2: 'elite', 3: 'boss' };

function goldAtFirstTown(seed) {
  const meta = { runs: 0, deepestLeg: 0, mastery: {} };
  const party = createParty();
  const deck = createDeck(STARTING_DECK);
  const march = createMarch(seed);
  const combats = [];

  while (!isWiped(party)) {
    const events = step(march);
    for (const ev of events) {
      if (ev.type === 'encounter') {
        const tier = KIND_TIER[ev.kind] || 'routine';
        party.supplies = Math.max(0, party.supplies - TUNING.supplyPerEncounter);
        const enemies = makeEnemies(tier, march.streams.combat);
        const r = resolveSoakCombat(party, enemies, deck, march.streams, meta);
        combats.push({ leg: march.leg, n: ev.n, kind: ev.kind, tier, victory: r.victory });
        if (r.victory) {
          const gm = march.legMods ? march.legMods.goldMult : 1;
          earnGold(party, Math.round((TUNING.goldPerWin[tier] || 0) * gm * escalationMult(meta)));
        } else return { seed, wiped: true, at: `leg${march.leg}-enc${ev.n}`, gold: party.gold, combats };
      }
      if (ev.type === 'leg-complete') {
        if (isTownLeg(ev.leg)) {
          const shop = generateShop(seed, ev.leg);
          const cheapest = shop.lines.length ? Math.min(...shop.lines.map((l) => l.price)) : null;
          const canResupply = party.gold >= TUNING.resupplyCost;
          const canBuy = shop.lines.some((l) => party.gold >= l.price);
          return {
            seed,
            wiped: false,
            leg: ev.leg,
            gold: party.gold,
            encounters: combats,
            shopStock: shop.lines.map((l) => ({ id: l.id, price: l.price })),
            cheapest,
            resupplyCost: TUNING.resupplyCost,
            purchasable: canBuy || canResupply,
            canBuy,
            canResupply,
          };
        }
      }
    }
  }
  return { seed, wiped: true, gold: party.gold, combats };
}

const seeds = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = seeds.length ? seeds : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
for (const s of list) console.log(JSON.stringify(goldAtFirstTown(s)));

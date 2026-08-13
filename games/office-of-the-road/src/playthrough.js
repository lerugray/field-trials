// playthrough.js — headless player-path breadth probe (AUDIT-PLAYTHROUGH 2026-08-11,
// finding 7). Exercises multi-leg routing, town shop docking, an open-save docket
// boot, and defeat without DOM. Mirrors camp → shop (town) → route → march.

import { TUNING } from './tuning.js';
import { createMarch, step } from './engine.js';
import { createParty, isWiped, livingFrames, campRest, earnGold, equipItem } from './party.js';
import { makeEnemies, initCombat, stepCombat, applyCard, evaluateCard } from './combat.js';
import { createDeck, drawUp, playFromHand, discardHand, getCard, STARTING_DECK } from './deck.js';
import { createMandate, isTerminus, dischargeReward } from './mandate.js';
import { generateShop, buyLine, resupply, isTownLeg } from './shop.js';
import { getItem } from './items.js';
import { generateBranches } from './route.js';
import { makeSave, parseSaveRecord, RUN_OPEN, createRunId } from './save.js';

const KIND_TIER = { 1: 'routine', 2: 'elite', 3: 'boss' };
const REST_BELOW = 0.7;
const RESUPPLY_BELOW = 12;
const HEAL_BELOW = 0.6;
const ROUTE_POLICY = 'ordinary';

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
      const isHeal = card.kind === 'mend' || card.kind === 'salve';
      const wantHeal = isHeal && win !== 'wasted' && partyHpFrac(s) < HEAL_BELOW;
      if (win === 'decisive' || wantHeal) {
        applyCard(s, id); playFromHand(deck, i);
        if (card.kind === 'instrument') drawUp(deck, card.power, shuffleStream);
        acted = true; break;
      }
    }
  }
}

function resolveWithDeck(party, enemies, deck, streams) {
  const s = initCombat(party, enemies);
  discardHand(deck); drawUp(deck, TUNING.handSize, streams.shuffle);
  const cap = TUNING.combatMaxRounds * (s.order.length + 1) + 8;
  let g = 0, round = s.round;
  while (!s.done && g++ < cap) {
    autoPlayCards(s, deck, streams.shuffle);
    if (s.done) break;
    stepCombat(s, streams.combat);
    if (s.round > round) { round = s.round; drawUp(deck, TUNING.handSize, streams.shuffle); }
  }
  return { victory: !!s.victory };
}

function lowestFrac(party) {
  let lo = 1;
  for (const f of livingFrames(party)) lo = Math.min(lo, f.hp / f.max.hp);
  return livingFrames(party).length ? lo : 0;
}

function maybeSurvive(party) {
  while (party.supplies < RESUPPLY_BELOW && party.gold >= TUNING.resupplyCost) {
    if (!resupply(party).ok) break;
  }
  let guard = 0;
  while (lowestFrac(party) < REST_BELOW && party.supplies >= TUNING.campRecoverSupplyCost && guard++ < 12) {
    if (!campRest(party).rested) break;
  }
}

function bestFrameFor(party, item) {
  const slot = item.slot;
  const curVal = (f) => { const id = f.equip[slot]; return id ? getItem(id).price : 0; };
  return party.frames.reduce((best, f, i) => (curVal(f) < curVal(party.frames[best]) ? i : best), 0);
}

function shopAtTown(seed, leg, party, stats) {
  stats.shopVisits += 1;
  const shop = generateShop(seed, leg);
  for (let i = 0; i < shop.lines.length; i++) {
    const line = shop.lines[i];
    if (line.sold || party.gold < line.price) continue;
    const r = buyLine(party, shop, i);
    if (r.ok) {
      equipItem(party, bestFrameFor(party, getItem(r.id)), r.id);
      stats.shopTxns += 1;
      return;
    }
  }
  if (party.gold >= TUNING.resupplyCost && resupply(party).ok) stats.shopTxns += 1;
}

function pickRoute(seed, march, party, ledgerRouteByLeg) {
  const { branches } = generateBranches(seed, march.leg);
  const b = branches.find((x) => x.id === ROUTE_POLICY) || branches[0];
  if (b.supplyToll > 0) party.supplies = Math.max(0, party.supplies - b.supplyToll);
  march.legMods = { encounterMult: b.mods.encounterMult, goldMult: b.mods.goldMult };
  ledgerRouteByLeg[march.leg] = b.id;
}

function openSaveIsDocketReady(config, march, party, deck, mandate, runId, ui) {
  const save = makeSave(config, march, party, deck, mandate, {}, {
    runId,
    ui: { ...ui, screen: 'camp' },
    ledger: { routeByLeg: {} },
    runMastery: {},
  });
  const record = parseSaveRecord(JSON.stringify(save));
  return !!(record && record.status === RUN_OPEN);
}

// runPlaythroughSession: march through camp pauses with the full player verbs the
// skeptical playthrough audit expects — route every leg, shop at every town, rest/
// resupply as needed. Returns breadth counters for node tests.
export function runPlaythroughSession(seed, opts = {}) {
  const maxLegs = opts.maxLegs ?? 8;
  const march = createMarch(seed);
  const party = createParty();
  const deck = createDeck(STARTING_DECK, march.streams.shuffle);
  const config = { seed, speedIndex: TUNING.defaultSpeedIndex };
  const runId = createRunId(seed);
  let mandate = createMandate(march.streams.mandate, 0, march.leg, march.encounterCount, party.supplies);
  const ledgerRouteByLeg = {};

  const stats = {
    seed,
    routeVisits: 0,
    shopVisits: 0,
    shopTxns: 0,
    legsCompleted: 0,
    reachedDefeat: false,
    reachedDocket: false,
    wipedLeg: null,
  };

  let pause = null; // { leg, town } after leg-complete
  let guard = 0;

  while (!stats.reachedDefeat && march.leg < maxLegs && guard++ < 250000) {
    if (pause) {
      maybeSurvive(party);
      if (pause.town) shopAtTown(seed, pause.leg, party, stats);
      pickRoute(seed, march, party, ledgerRouteByLeg);
      stats.routeVisits += 1;
      if (stats.legsCompleted >= 2) {
        stats.reachedDocket = openSaveIsDocketReady(config, march, party, deck, mandate, runId, {
          screen: 'camp', camp: { leg: pause.leg, isTown: pause.town },
        });
      }
      pause = null;
      continue;
    }

    for (const ev of step(march)) {
      if (ev.type === 'encounter') {
        const tier = KIND_TIER[ev.kind] || 'routine';
        party.supplies = Math.max(0, party.supplies - TUNING.supplyPerEncounter);
        const enemies = makeEnemies(tier, march.streams.combat);
        const r = resolveWithDeck(party, enemies, deck, march.streams);
        if (r.victory) {
          const gm = march.legMods ? march.legMods.goldMult : 1;
          earnGold(party, Math.round((TUNING.goldPerWin[tier] || 0) * gm));
        }
        if (isWiped(party)) {
          stats.reachedDefeat = true;
          stats.wipedLeg = ev.leg;
          break;
        }
      } else if (ev.type === 'leg-complete') {
        stats.legsCompleted += 1;
        if (!mandate.discharged && isTerminus(mandate, ev.leg)) {
          const rec = { encounters: march.encounterCount - mandate.issuedAtEncounters, supplies: party.supplies };
          earnGold(party, dischargeReward(mandate, rec).gold);
          mandate.discharged = true;
          mandate = createMandate(march.streams.mandate, mandate.index + 1, march.leg, march.encounterCount, party.supplies);
        }
        pause = { leg: ev.leg, town: isTownLeg(ev.leg) };
      }
    }
  }

  return stats;
}

// findBreadthSeed: locate a deterministic seed whose session reaches the audit's
// minimum breadth in one run (multi-leg routes, a docked shop txn, open docket).
export function findBreadthSeed(maxSeed = 64, minRouteVisits = 2, minShopVisits = 1) {
  for (let seed = 1; seed <= maxSeed; seed++) {
    const s = runPlaythroughSession(seed, { maxLegs: 6 });
    if (s.routeVisits >= minRouteVisits && s.shopVisits >= minShopVisits && s.shopTxns >= 1 && s.reachedDocket) {
      return { seed, stats: s };
    }
  }
  return null;
}

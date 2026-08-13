// economy.js — THE CLOSED-LOOP PROBE (DESIGN-SEED M4 exit gate). A headless
// expedition simulator that runs the REAL engine + resolver + mandate/shop/route
// systems forward for N legs under a spending STRATEGY, reporting the gold curve.
//
// The seed's economy health signal is the divergence between two strategies:
//   null   — buys NO equipment (hoards). Uses the always-open sink (resupply)
//            only to survive, exactly like any player would.
//   greedy — buys EVERY affordable equipment line at every town and equips it.
// Both rest and resupply as needed (survival is available to everyone); the only
// difference is equipment investment. If the loop is closed, greedy's gear turns
// into more hard-fight wins (more income) at the cost of cash-on-hand, and null
// hoards cash but wins fewer elites/bosses. Their gold curves diverge — and
// neither strands. This module MEASURES that; gates.mjs asserts it.
//
// Deterministic: same seed + strategy → identical trace (real seeded streams).
// No cards are played (isolates the economy against the M2 auto-resolve baseline).

import { TUNING } from './tuning.js';
import { createMarch, step } from './engine.js';
import { createParty, isWiped, livingFrames, campRest, earnGold, equipItem } from './party.js';
import { makeEnemies, initCombat, stepCombat, applyCard, evaluateCard } from './combat.js';
import { createDeck, drawUp, playFromHand, discardHand, getCard, STARTING_DECK } from './deck.js';
import { createMandate, isTerminus, dischargeReward } from './mandate.js';
import { generateShop, buyLine, resupply, isTownLeg } from './shop.js';
import { getItem, ITEMS } from './items.js';
import { getJob } from './jobs.js';
import { generateBranches } from './route.js';

const KIND_TIER = { 1: 'routine', 2: 'elite', 3: 'boss' };

// Probe policy (NOT game tuning — these are the simulated player's competent
// reflexes: rest/resupply when low, and play the deck the way the UI's window
// states advise. Held here so the game's tuning.js stays the single game-constant
// home).
const REST_BELOW = 0.7; // rest (repeatedly, if affordable) when a frame is below this
const RESUPPLY_BELOW = 12; // resupply when the reserve drops under ~a leg's worth
const HEAL_BELOW = 0.6; // play a heal card when party HP falls under this fraction
const ROUTE_POLICY = 'ordinary'; // both strategies route identically → isolates shopping

// ---- Headless deck auto-pilot (models the M3 intervention contract) ---------
// A competent desk plays decisive windows and heals when the party is hurt —
// exactly what the live hand's window states advise. This lets the economy run
// survive the road the way a real player does, so the gold curve is meaningful.
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
        acted = true; break; // hand mutated — rescan
      }
    }
  }
}
// resolveWithDeck: run a stepped fight to completion, auto-piloting the deck each
// round. Mutates party HP (attrition persists) + the deck. Returns { victory }.
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

// equipValue: total price of everything the party has equipped (greedy's spend
// becomes on-body value, so "gold + equipValue" is the fair wealth comparison).
export function equipValue(party) {
  let v = 0;
  for (const f of party.frames) for (const slot of ['arm', 'guard']) { const id = f.equip[slot]; if (id) v += getItem(id).price; }
  return v;
}

function lowestFrac(party) {
  let lo = 1;
  for (const f of livingFrames(party)) lo = Math.min(lo, f.hp / f.max.hp);
  return livingFrames(party).length ? lo : 0;
}

// maybeSurvive: resupply if the reserve is low (the always-open sink, costs
// gold), then rest — repeatedly, each rest mending half the missing HP — while
// anyone is hurt and supplies allow. Both strategies do this (survival is not
// "buying"); the strategy difference is equipment only.
function maybeSurvive(party, trace) {
  while (party.supplies < RESUPPLY_BELOW && party.gold >= TUNING.resupplyCost) {
    if (!resupply(party).ok) break;
    trace.resupplySpent += TUNING.resupplyCost; trace.resupplies++;
  }
  let guard = 0;
  while (lowestFrac(party) < REST_BELOW && party.supplies >= TUNING.campRecoverSupplyCost && guard++ < 12) {
    if (!campRest(party).rested) break;
    trace.rests++;
  }
}

// bestFrameFor: the frame that gains most from an item. Guard goes to the frame
// with the weakest current guard (survival first). An arm item goes to the frame
// whose JOB gear matches the item's offence (atk→arms jobs, mag→implements) and
// whose arm slot is weakest — so gear lands where it actually works.
function bestFrameFor(party, item) {
  const slot = item.slot;
  const curVal = (f) => { const id = f.equip[slot]; return id ? getItem(id).price : 0; };
  let pool = party.frames.map((f, i) => i);
  if (slot === 'arm') {
    const wantGear = item.mods.mag ? 'implements' : 'arms';
    const fit = pool.filter((i) => getJob(party.frames[i].jobId).gear === wantGear);
    if (fit.length) pool = fit;
  }
  return pool.reduce((best, i) => (curVal(party.frames[i]) < curVal(party.frames[best]) ? i : best), pool[0]);
}
// applyGreedyShop: buy every affordable line (cheapest first, repeatable) and
// issue each to the frame that gains most from it.
function applyGreedyShop(seed, leg, party, trace) {
  const shop = generateShop(seed, leg);
  for (let i = 0; i < shop.lines.length; i++) {
    const l = shop.lines[i];
    if (l.sold || party.gold < l.price) continue;
    const r = buyLine(party, shop, i);
    if (!r.ok) continue;
    trace.equipmentSpent += r.spent;
    equipItem(party, bestFrameFor(party, getItem(r.id)), r.id);
  }
}

// runEconomy: simulate one expedition. Returns a trace with the per-leg gold
// curve and outcome tallies.
export function runEconomy(seed, opts = {}) {
  const legs = opts.legs || 8;
  const strategy = opts.strategy || 'null';
  const march = createMarch(seed);
  const party = createParty();
  const deck = createDeck(STARTING_DECK, march.streams.shuffle); // the desk plays this
  let mandate = createMandate(march.streams.mandate, 0, march.leg, march.encounterCount, party.supplies);

  const trace = {
    seed, strategy,
    goldCurve: [], legIndex: [], // gold on hand at each leg boundary
    wins: { routine: 0, elite: 0, boss: 0 },
    equipmentSpent: 0, resupplySpent: 0, resupplies: 0, rests: 0,
    mandateRewards: [mandate.reward], mandatesDischarged: 0,
    minGold: party.gold, wiped: false, legsReached: 0,
  };

  let guard = 0;
  while (march.leg < legs && !trace.wiped && guard++ < 200000) {
    const events = step(march);
    for (const ev of events) {
      if (ev.type === 'encounter') {
        const tier = KIND_TIER[ev.kind] || 'routine';
        party.supplies = Math.max(0, party.supplies - TUNING.supplyPerEncounter);
        const enemies = makeEnemies(tier, march.streams.combat);
        const r = resolveWithDeck(party, enemies, deck, march.streams);
        if (r.victory) {
          const gm = march.legMods ? march.legMods.goldMult : 1;
          earnGold(party, Math.round((TUNING.goldPerWin[tier] || 0) * gm));
          trace.wins[tier]++;
        }
        if (isWiped(party)) { trace.wiped = true; break; }
      } else if (ev.type === 'leg-complete') {
        // mandate discharge at the terminus, then the Office issues the next
        if (!mandate.discharged && isTerminus(mandate, ev.leg)) {
          const rec = { encounters: march.encounterCount - mandate.issuedAtEncounters, supplies: party.supplies };
          earnGold(party, dischargeReward(mandate, rec).gold);
          mandate.discharged = true; trace.mandatesDischarged++;
          mandate = createMandate(march.streams.mandate, mandate.index + 1, march.leg, march.encounterCount, party.supplies);
          trace.mandateRewards.push(mandate.reward);
        }
        // camp: survive; town: apply the shop strategy
        maybeSurvive(party, trace);
        if (isTownLeg(ev.leg) && strategy === 'greedy') applyGreedyShop(march.seed, ev.leg, party, trace);
        // route the next leg under the fixed policy (isolates shopping), pay toll
        const { branches } = generateBranches(march.seed, march.leg);
        const b = branches.find((x) => x.id === ROUTE_POLICY) || branches[0];
        if (b.supplyToll > 0) party.supplies = Math.max(0, party.supplies - b.supplyToll);
        march.legMods = { encounterMult: b.mods.encounterMult, goldMult: b.mods.goldMult };
        // record the gold curve at the leg boundary
        trace.goldCurve.push(party.gold); trace.legIndex.push(ev.leg);
        trace.minGold = Math.min(trace.minGold, party.gold);
        trace.legsReached = ev.leg + 1;
      }
    }
  }
  trace.endGold = party.gold;
  trace.equipValue = equipValue(party);
  trace.wealth = party.gold + trace.equipValue;
  return trace;
}

// compareStrategies: run null vs greedy over the same seed and return both traces
// plus the divergence curve (greedy − null gold at each shared leg boundary).
export function compareStrategies(seed, legs = 8) {
  const nul = runEconomy(seed, { strategy: 'null', legs });
  const grd = runEconomy(seed, { strategy: 'greedy', legs });
  const n = Math.min(nul.goldCurve.length, grd.goldCurve.length);
  const divergence = [];
  for (let i = 0; i < n; i++) divergence.push(grd.goldCurve[i] - nul.goldCurve[i]);
  return { seed, nul, grd, divergence };
}

// ---- The M4 economy exit gate (aggregate health signals) --------------------

// measureEconomy: run null vs greedy over seeds 1..N and aggregate the economy's
// health signals. Deterministic. The gate asserts these; the doc records them.
export function measureEconomy(N = 60, legs = 8) {
  let nWipe = 0, gWipe = 0, nLegs = 0, gLegs = 0, gSurvGE = 0, gSpent = 0, nEnd = 0;
  let nWealth = 0, gWealth = 0, minGold = Infinity, floorOk = true;
  const finalDivs = [];
  let sample = null;
  for (let seed = 1; seed <= N; seed++) {
    const cmp = compareStrategies(seed, legs);
    if (seed === 1) sample = cmp;
    const { nul, grd, divergence } = cmp;
    if (nul.wiped) nWipe++;
    if (grd.wiped) gWipe++;
    nLegs += nul.legsReached; gLegs += grd.legsReached;
    if (grd.legsReached >= nul.legsReached) gSurvGE++;
    gSpent += grd.equipmentSpent; nEnd += nul.endGold;
    nWealth += nul.wealth; gWealth += grd.wealth;
    minGold = Math.min(minGold, nul.minGold, grd.minGold);
    for (const r of nul.mandateRewards.concat(grd.mandateRewards)) if (r < TUNING.mandateRewardFloor) floorOk = false;
    if (divergence.length) finalDivs.push(divergence[divergence.length - 1]);
  }
  finalDivs.sort((a, b) => a - b);
  const medDiv = finalDivs.length ? finalDivs[Math.floor(finalDivs.length / 2)] : 0;
  const nAvgLegs = nLegs / N;
  return {
    N, legs,
    nWipe, gWipe,
    nAvgLegs, gAvgLegs: gLegs / N,
    greedyWorthFrac: gSurvGE / N,
    goldPerLeg: nAvgLegs > 0 ? nEnd / N / nAvgLegs : 0, // measured net gold/leg (null)
    nAvgWealth: nWealth / N, gAvgWealth: gWealth / N,
    greedySpent: gSpent, minGold, floorOk, medDiv,
    sample,
  };
}

// sinkAlwaysOpen: the resupply sink never refuses while the ledger can cover it.
export function sinkAlwaysOpen() {
  const p = createParty(); p.gold = TUNING.resupplyCost * 6;
  for (let i = 0; i < 6; i++) if (!resupply(p).ok) return false;
  return p.gold === 0; // exactly drained — the sink absorbed every coin
}

// noEarlySpike: no town before a tier's minLeg may stock it (the power curve).
export function noEarlySpike(seeds = 60) {
  const latestMinLeg = Math.max(...Object.values(ITEMS).map((it) => it.minLeg));
  for (let seed = 1; seed <= seeds; seed++) {
    for (let leg = 0; leg < latestMinLeg; leg++) {
      for (const l of generateShop(seed, leg).lines) {
        if (getItem(l.id).minLeg > leg) return false; // a too-strong line leaked early
      }
    }
  }
  return true;
}

// soak.js — honest M9 player-path acceptance. Every required verb is accounted
// per expedition and is credited only after its relevant state mutation is
// observed. Player verbs travel through KeyboardEvents; automated combat travels
// through the same requestAnimationFrame -> tickCombat path as ordinary play.

import { getCard } from './deck.js';
import { evaluateCard } from './combat.js';
import { TUNING } from './tuning.js';

export const SOAK_VERBS = ['cardPlay', 'jobChange', 'shopTxn', 'routeBranch', 'saveRoundTrip', 'deathCycle'];
export const SOAK_STATE_KEY = 'office-of-the-road/soak/v2';

export function freshVerbLedger() {
  return Object.fromEntries(SOAK_VERBS.map((verb) => [verb, false]));
}

export function acceptanceFindings(expeditions, metrics) {
  const findings = [];
  const add = (sev, text) => { if (!findings.some((f) => f.text === text)) findings.push({ sev, text }); };
  for (let i = 0; i < expeditions.length; i++) {
    for (const [verb, ok] of Object.entries(expeditions[i].verbs)) if (!ok) add('BLOCKER', `expedition ${i + 1}: player-path verb did not mutate state: ${verb}`);
  }
  if (!expeditions.length) add('BLOCKER', 'no expedition reached a terminal report');
  if (metrics.maxPassiveSec > 25) add('BLOCKER', `longest passive stretch ${metrics.maxPassiveSec.toFixed(1)}s exceeds 25s floor`);
  if (metrics.interventionsPerMin < 3) add('BLOCKER', `interventions/min ${metrics.interventionsPerMin.toFixed(1)} below 3`);
  return findings;
}

function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }
function partyView(o) {
  return {
    jobs: o.party.frames.map((f) => f.jobId),
    hp: o.party.frames.map((f) => f.hp),
    gold: o.party.gold,
    supplies: o.party.supplies,
    inventory: (o.party.inventory || []).slice(),
  };
}

// installSoak: begin or continue the soak against a live game document. The only
// state carried over a reload is this driver ledger; the game itself must rebuild
// by rereading its own storage and presenting the returned docket.
export function installSoak(win) {
  const o = win.__office;
  if (!o) return null;

  let stateStore = null;
  try {
    stateStore = win.sessionStorage;
    stateStore.setItem('__oor_soak_probe__', '1');
    stateStore.removeItem('__oor_soak_probe__');
  } catch {
    try { stateStore = win.localStorage; } catch { stateStore = null; }
  }
  const params = new URLSearchParams(win.location.search || '');
  if (params.has('fresh') && stateStore) stateStore.removeItem(SOAK_STATE_KEY);

  let recovered = null;
  if (stateStore) {
    try { recovered = JSON.parse(stateStore.getItem(SOAK_STATE_KEY) || 'null'); } catch { recovered = null; }
  }
  const S = recovered || {
    current: { verbs: freshVerbLedger(), startedMetaRuns: o.meta.runs | 0 },
    runs: [], verbs: null,
    metrics: { elapsedMs: 0, passiveMs: 0, maxPassiveSec: 0, interventions: 0, interventionsPerMin: 0 },
    findings: [], done: false, phase: 'run', steps: 0, spedUp: false,
    seenScreens: {}, reloads: 0, awaitingReload: false, reloadExpected: null,
  };
  S.verbs = S.current.verbs; // renderer compatibility; always the current expedition
  S.reloads = (S.reloads | 0) + (S.awaitingReload ? 1 : 0);
  win.__soak = S;

  let lastClock = win.performance.now();
  function updateClock() {
    const now = win.performance.now();
    const dt = Math.max(0, now - lastClock);
    lastClock = now;
    S.metrics.elapsedMs += dt;
    S.metrics.passiveMs += dt;
    S.metrics.maxPassiveSec = Math.max(S.metrics.maxPassiveSec, S.metrics.passiveMs / 1000);
  }
  function persist() {
    if (!stateStore) return false;
    try { stateStore.setItem(SOAK_STATE_KEY, JSON.stringify(S)); return true; } catch { return false; }
  }
  function key(k) { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true })); }
  function act(kind) {
    updateClock();
    S.metrics.passiveMs = 0;
    S.metrics.interventions += 1;
    if (kind) S.seenScreens[kind] = (S.seenScreens[kind] | 0) + 1;
  }
  function pickCombatCard(o, cb) {
    const minHp = Math.min(...o.party.frames.filter((f) => f.alive).map((f) => f.hp / f.max.hp), 1);
    const hurt = minHp < 0.85;
    for (let i = 0; i < o.deck.hand.length; i++) {
      const card = getCard(o.deck.hand[i]);
      const win = evaluateCard(cb.st, o.deck.hand[i]);
      const isHeal = card.kind === 'mend' || card.kind === 'salve' || card.kind === 'ward';
      if (win === 'decisive' && !isHeal) return i;
      if (isHeal && hurt && win !== 'wasted') return i;
    }
    return -1;
  }

  function shopActionOrder(o) {
    const ids = o.controlIds().filter((id) => /^buy\d+$/.test(id) || id === 'resupply');
    const gold = o.party.gold | 0;
    const buys = ids.filter((id) => /^buy\d+$/.test(id)).map((id) => {
      const line = o.ui.shop.lines[Number(id.slice(3))];
      return { id, price: line ? line.price : Infinity, sold: line ? line.sold : true };
    }).filter((x) => !x.sold).sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
    const order = buys.filter((x) => gold >= x.price).map((x) => x.id);
    if (gold >= TUNING.resupplyCost && ids.includes('resupply')) order.push('resupply');
    for (const id of ids) if (!order.includes(id)) order.push(id);
    return order;
  }
  function find(sev, text) { if (!S.findings.some((f) => f.text === text)) S.findings.push({ sev, text }); }
  function mark(verb, ok, failure) {
    if (ok) { S.current.verbs[verb] = true; act(verb); return true; }
    if (failure) find('DEFECT', failure);
    return false;
  }

  function focusThenEnter(pred) {
    const fid = o.focusId();
    if (fid && pred(fid)) { key('Enter'); return true; }
    key('Tab');
    return false;
  }

  function beginRealReload() {
    if (S.awaitingReload) return;
    if (!stateStore) { find('BLOCKER', 'save/quit/reload could not persist the soak driver across documents'); return; }
    S.awaitingReload = true;
    S.reloadExpected = o.stateSnapshot();
    updateClock();
    if (!persist()) { find('BLOCKER', 'save/quit/reload could not persist its expected state'); return; }
    const url = new URL(win.location.href);
    url.searchParams.delete('fresh');
    win.history.replaceState(null, '', url.href);
    win.location.reload(); // beforeunload performs the ordinary quit save
  }

  function finish() {
    if (S.done) return;
    updateClock();
    const mins = Math.max(1 / 600, S.metrics.elapsedMs / 60000);
    S.metrics.interventionsPerMin = S.metrics.interventions / mins;
    S.findings.push(...acceptanceFindings(S.runs, S.metrics).filter((f) => !S.findings.some((old) => old.text === f.text)));
    S.pass = !S.findings.some((f) => f.sev === 'BLOCKER');
    S.done = true;
    persist();
    if (win.__soakTimer) { win.clearInterval(win.__soakTimer); win.__soakTimer = null; }
    try {
      const b = Object.values(S.verbs).filter(Boolean).length;
      win.document.title = `SOAK ${S.pass ? 'PASS' : 'FAIL'} verbs=${b}/6 blockers=${S.findings.filter((f) => f.sev === 'BLOCKER').length} defects=${S.findings.filter((f) => f.sev === 'DEFECT').length} friction=${S.findings.filter((f) => f.sev === 'FRICTION').length} reloads=${S.reloads | 0} passive=${S.metrics.maxPassiveSec.toFixed(1)}s ipm=${S.metrics.interventionsPerMin.toFixed(1)}`;
    } catch { /* headless title may be read-only */ }
  }

  function step() {
    if (S.done) return;
    updateClock();
    S.steps += 1;
    if (S.steps > 12000) { find('BLOCKER', 'soak did not complete the player path within the step budget'); return finish(); }
    const scr = o.ui.screen;
    S.seenScreens[scr] = (S.seenScreens[scr] | 0) + 1;
    if (scr !== 'camp') S.campRested = false;

    if (S.awaitingReload) {
      if (scr !== 'docket') { find('BLOCKER', `real reload did not return to the docket (opened ${scr})`); return finish(); }
      if (focusThenEnter((id) => id === 'resume')) {
        const exact = o.stateSnapshot() === S.reloadExpected;
        mark('saveRoundTrip', exact && o.ui.screen === 'combat', exact ? null : 'real reload did not resume the byte-exact live combat state');
        S.awaitingReload = false;
        S.reloadExpected = null;
        persist();
      }
      return;
    }

    switch (scr) {
      case 'title': {
        if (o.focusId() !== 'start') { key('Tab'); return; }
        key('Enter');
        if (o.ui.screen === 'march') act('titleStart');
        return;
      }
      case 'howto': {
        key('Escape');
        return;
      }
      case 'intake': {
        key('Enter');
        if (o.ui.screen === 'march') act('intake');
        return;
      }
      case 'combat': {
        const cb = o.ui.combat;
        if (!cb) return;
        const combatToken = `${cb.leg}:${o.march.encounterCount}`;
        if (S.combatToken !== combatToken) { S.combatToken = combatToken; S.cardsThisFight = 0; }
        if (cb.draft) {
          const before = o.deck.list.length;
          key('Enter');
          if (o.deck.list.length === before + 1) act('draft');
          else find('DEFECT', 'draft input did not add the selected card');
          return;
        }
        if (!cb.done) {
          const cardsPlayed = S.cardsThisFight | 0;
          const minHp = Math.min(...o.party.frames.filter((f) => f.alive).map((f) => f.hp / f.max.hp), 1);
          const hurt = minHp < 0.85;
          const cardBudget = hurt ? 4 : 3;
          const verbsDone = SOAK_VERBS.filter((v) => v !== 'deathCycle').every((v) => S.current.verbs[v]);
          const idx = verbsDone ? -1 : pickCombatCard(o, cb);
          if (cardsPlayed < cardBudget && idx >= 0) {
            const beforeHand = o.deck.hand.slice();
            const beforeCards = cb.st.log.filter((e) => e.side === 'card').length;
            key(String(idx + 1));
            const afterCards = cb.st.log.filter((e) => e.side === 'card').length;
            const mutated = changed(beforeHand, o.deck.hand) && afterCards === beforeCards + 1;
            if (!S.current.verbs.cardPlay) mark('cardPlay', mutated, 'card key did not mutate both the hand and combat log');
            else if (mutated) act('card');
            else find('DEFECT', 'card key did not mutate both the hand and combat log');
            if (mutated) S.cardsThisFight = (S.cardsThisFight | 0) + 1;
            return;
          }
          if (!S.current.verbs.saveRoundTrip) { beginRealReload(); return; }
          if (o.ui.paused) {
            const before = o.ui.paused;
            key(' ');
            if (o.ui.paused !== before) act('combatResume');
          }
          // Normal rAF is intentionally allowed to call tickCombat; no debug step.
          return;
        }
        return; // normal tickCombat delay surfaces the draft/end
      }
      case 'route': {
        const beforeRoutes = Object.keys(o.ledger.routeByLeg || {}).length;
        key('Enter');
        const afterRoutes = Object.keys(o.ledger.routeByLeg || {}).length;
        mark('routeBranch', o.ui.screen === 'march' && afterRoutes === beforeRoutes + 1, 'route input did not file a route mutation');
        return;
      }
      case 'camp': {
        if (!S.current.verbs.jobChange) {
          if (o.focusId() !== 'f3') { key('Tab'); return; }
          const before = partyView(o).jobs;
          key('ArrowRight');
          mark('jobChange', changed(before, partyView(o).jobs), 'camp reassignment input did not change a frame job');
          return;
        }
        if (!S.campRested) {
          if (focusThenEnter((id) => id === 'rest')) {
            S.campRested = true;
            act('restAttempt');
          }
          return;
        }
        const town = o.ui.camp && o.ui.camp.isTown;
        if (town && !S.current.verbs.shopTxn && !S.shopUnavailable) { focusThenEnter((id) => id === 'shop'); return; }
        focusThenEnter((id) => id === 'march');
        return;
      }
      case 'shop': {
        if (!S.current.verbs.shopTxn) {
          S.shopTried = S.shopTried || [];
          const order = shopActionOrder(o);
          const target = order.find((id) => !S.shopTried.includes(id));
          if (!target) {
            find('DEFECT', 'every shop action was refused; no transaction mutated state');
            S.shopUnavailable = true;
            key('Escape');
            return;
          }
          if (o.focusId() === target) {
            const before = partyView(o);
            key('Enter');
            const after = partyView(o);
            S.shopTried.push(target);
            mark('shopTxn', changed(before, after), null);
          } else key('Tab');
          return;
        }
        key('Escape');
        return;
      }
      case 'defeat': {
        const rep = o.ui.report;
        const mutated = !!(rep && rep.filed && rep.filed.lines.length && rep.gains && (o.meta.runs | 0) === (S.current.startedMetaRuns | 0) + 1 && !o.savedOk());
        mark('deathCycle', mutated, 'terminal report did not bank once and close the resumable save');
        if (rep && rep.filed && !rep.filed.lines.some((l) => l.tone === 'credit')) find('DEFECT', 'filed report has no credit line');
        S.runs.push({ verbs: { ...S.current.verbs }, cause: rep && rep.cause });
        return finish();
      }
      case 'march': {
        if (o.ui.paused) {
          key(' ');
          act('openingUnpause');
          return;
        }
        if (!S.spedUp) {
          const before = o.config.speedIndex;
          key('ArrowRight'); key('ArrowRight'); key('ArrowRight');
          S.spedUp = true;
          if (o.config.speedIndex !== before) act('speed');
        }
        return; // normal rAF advances the march
      }
      default: return;
    }
  }

  win.__soakTimer = win.setInterval(step, 24);
  return S;
}

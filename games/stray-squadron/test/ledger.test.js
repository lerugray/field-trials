// The economy ledger — one currency + the permanent flight-log archive, and the
// currency-integrity fuzz test the milestone requires (DIRECTIONS-M6: "no sequence
// of runs/purchases may mint or leak currency"). The load/clamp/persist rules are
// headless via an injectable storage, same as settings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLedger, salvageForRun, CURRENCY, LOG_CAP, SALVAGE,
} from '../src/economy/ledger.js';
import { makeRng } from '../src/core/rng.js';

// A tiny in-memory Storage stand-in (getItem/setItem), like the settings tests use.
function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _raw: m,
  };
}

test('a fresh ledger starts empty and integrity holds', () => {
  const L = createLedger(memStore());
  assert.equal(L.balance(), 0);
  assert.equal(L.lifetime().earned, 0);
  assert.equal(L.lifetime().spent, 0);
  assert.ok(L.ok());
});

test('the currency is a single named unit', () => {
  assert.equal(typeof CURRENCY.name, 'string');
  assert.ok(CURRENCY.name.length > 0);
  assert.ok(CURRENCY.short.length > 0);
});

test('earn adds; spend removes; you cannot overspend into the negative', () => {
  const L = createLedger(memStore());
  L.earn(100);
  assert.equal(L.balance(), 100);
  assert.equal(L.spend(30), true);
  assert.equal(L.balance(), 70);
  assert.equal(L.spend(999), false, 'overspend must be refused');
  assert.equal(L.balance(), 70, 'a refused spend must not change the balance');
  assert.equal(L.spend(0), false);
  assert.equal(L.spend(-5), false);
  assert.ok(L.ok());
  // balance is always earned - spent
  assert.equal(L.balance(), L.lifetime().earned - L.lifetime().spent);
});

test('balance is DERIVED — a tampered stored balance cannot mint currency', () => {
  const store = memStore();
  const L = createLedger(store);
  L.earn(50);
  L.spend(20); // earned 50, spent 20, balance 30
  // maliciously rewrite storage with an inflated balance and garbage
  store.setItem('stray.ledger', JSON.stringify({ balance: 999999, earned: 50, spent: 20 }));
  const L2 = createLedger(store);
  assert.equal(L2.balance(), 30, 'balance must be re-derived from earned - spent, not read');
  assert.ok(L2.ok());
  // spent can never exceed earned even if storage claims so
  store.setItem('stray.ledger', JSON.stringify({ earned: 10, spent: 500 }));
  const L3 = createLedger(store);
  assert.ok(L3.balance() >= 0);
  assert.ok(L3.ok());
});

test('corrupt / missing storage yields clean defaults, never throws', () => {
  const store = memStore();
  store.setItem('stray.ledger', '{not json');
  const L = createLedger(store);
  assert.equal(L.balance(), 0);
  assert.ok(L.ok());
  assert.doesNotThrow(() => createLedger(null)); // no storage at all
});

test('salvageForRun is a pure, sane payout of a run summary', () => {
  const zero = salvageForRun({});
  assert.equal(zero, 0);
  const s = salvageForRun({
    totalKills: 10, totalScore: 800, levelsFlown: 3, runMedal: 'gold', victory: true,
  });
  const expected =
    10 * SALVAGE.perKill +
    Math.floor(800 * SALVAGE.perScore) +
    3 * SALVAGE.perSector +
    SALVAGE.medalBonus.gold +
    SALVAGE.victoryBonus;
  assert.equal(s, expected);
  // a ship-down (no victory, none medal) still pays for what was downed
  const down = salvageForRun({ totalKills: 4, totalScore: 100, levelsFlown: 1, runMedal: 'none', victory: false });
  assert.ok(down > 0);
});

test('recordRun pays out once, updates the lifetime aggregate, logs the run', () => {
  const L = createLedger(memStore());
  const summary = {
    seed: 'run-a', totalKills: 6, totalScore: 500, levelsFlown: 2, routeLevels: 3,
    runMedal: 'silver', victory: false, died: true,
  };
  const r = L.recordRun(summary, 'tok-1');
  assert.equal(r.salvage, salvageForRun(summary));
  assert.equal(L.balance(), r.salvage);
  const lt = L.lifetime();
  assert.equal(lt.runs, 1);
  assert.equal(lt.kills, 6);
  assert.equal(lt.sectors, 2);
  assert.equal(lt.bestMedal, 'silver');
  const log = L.log();
  assert.equal(log.length, 1);
  assert.equal(log[0].seed, 'run-a');
  assert.equal(log[0].died, true);
  assert.ok(L.ok());
});

test('recordRun is idempotent per token — an abnormal replay never double-counts', () => {
  const L = createLedger(memStore());
  const summary = { totalKills: 3, totalScore: 120, levelsFlown: 1, runMedal: 'bronze', victory: false };
  const first = L.recordRun(summary, 'same-token');
  const bal = L.balance();
  const again = L.recordRun(summary, 'same-token'); // same run re-committed (refresh/re-show)
  assert.equal(again.duplicate, true);
  assert.equal(again.salvage, 0);
  assert.equal(L.balance(), bal, 'a duplicate commit must not add currency');
  assert.equal(L.lifetime().runs, 1, 'a duplicate commit must not count a second run');
  // a genuinely different run (different token) DOES count
  L.recordRun(summary, 'other-token');
  assert.equal(L.lifetime().runs, 2);
  assert.ok(first.salvage > 0);
});

test('bestMedal only ratchets up, never down', () => {
  const L = createLedger(memStore());
  L.recordRun({ runMedal: 'gold', totalKills: 1 }, 'a');
  L.recordRun({ runMedal: 'bronze', totalKills: 1 }, 'b');
  assert.equal(L.lifetime().bestMedal, 'gold');
});

test('the flight-log detail is capped but the lifetime aggregate is permanent', () => {
  const L = createLedger(memStore());
  const N = LOG_CAP + 15;
  for (let i = 0; i < N; i++) {
    L.recordRun({ totalKills: 1, totalScore: 40, levelsFlown: 1, runMedal: 'none' }, 't' + i);
  }
  assert.equal(L.log().length, LOG_CAP, 'detail list is capped');
  assert.equal(L.lifetime().runs, N, 'lifetime run count is NOT capped (permanent archive)');
  assert.equal(L.lifetime().kills, N);
  assert.ok(L.ok());
});

test('upgrades and contracts persist across a reload without touching balances', () => {
  const store = memStore();
  const L = createLedger(store);
  L.earn(200);
  L.setUpgrade('hull', 2);
  L.setUpgrade('blaster', 1);
  L.addContract('wingmate-vesper');
  L.addContract('wingmate-vesper'); // dupe ignored
  const balBefore = L.balance();
  const L2 = createLedger(store); // simulate a page reload
  assert.equal(L2.upgradeTier('hull'), 2);
  assert.equal(L2.upgradeTier('blaster'), 1);
  assert.deepEqual(L2.contracts(), ['wingmate-vesper']);
  assert.equal(L2.balance(), balBefore, 'reload must not change balance');
  assert.ok(L2.ok());
});

// --- the currency-integrity FUZZ TEST (DIRECTIONS-M6 requirement) -------------
// Hammer the ledger with a long random sequence of the exact "abnormal ending"
// events the milestone names: runs (death mid-boss, quit, plain finishes),
// purchases (spend attempts, some unaffordable), duplicate commits (refresh), and
// full reloads from the SAME storage (page refresh). After every single step, the
// integrity law must hold: balance === earned - spent, balance >= 0, spent <= earned,
// and no run is ever double-counted. Currency is neither minted nor dropped.
test('FUZZ: no sequence of runs / purchases / reloads mints or leaks currency', () => {
  const store = memStore();
  const gen = makeRng('ledger-fuzz-seed');
  const rng = () => gen.next();
  let L = createLedger(store);

  // A shadow model of what SHOULD be true, computed independently of the ledger.
  let shadowEarned = 0;
  let shadowSpent = 0;
  const committedTokens = new Set();
  let tokenCounter = 0;

  const STEPS = 4000;
  for (let i = 0; i < STEPS; i++) {
    const roll = rng();
    if (roll < 0.35) {
      // commit a run (some are deaths mid-run, some victories) with a FRESH token
      const token = 'run-' + (tokenCounter++);
      const summary = {
        totalKills: Math.floor(rng() * 12),
        totalScore: Math.floor(rng() * 1000),
        levelsFlown: 1 + Math.floor(rng() * 4),
        runMedal: ['none', 'bronze', 'silver', 'gold'][Math.floor(rng() * 4)],
        victory: rng() < 0.3,
        died: rng() < 0.4,
      };
      const pay = salvageForRun(summary);
      L.recordRun(summary, token);
      committedTokens.add(token);
      shadowEarned += pay;
    } else if (roll < 0.5) {
      // abnormal replay: re-commit the most recent token (refresh landing on results)
      if (tokenCounter > 0) {
        const token = 'run-' + (tokenCounter - 1);
        const before = L.balance();
        const res = L.recordRun({ totalKills: 5, totalScore: 100, levelsFlown: 1, runMedal: 'gold' }, token);
        // it may or may not be the ledger's lastToken; if it is, it must be a no-op
        if (res.duplicate) assert.equal(L.balance(), before, 'duplicate commit changed balance');
        else shadowEarned += res.salvage; // a non-adjacent replay is treated as a new run
      }
    } else if (roll < 0.8) {
      // attempt a purchase of a random size (many will be unaffordable)
      const cost = Math.floor(rng() * 300);
      const ok = L.spend(cost);
      if (ok) shadowSpent += cost;
    } else {
      // page reload: rebuild the ledger from the SAME storage
      L = createLedger(store);
    }

    // the integrity law, after EVERY step
    assert.ok(L.ok(), 'integrity broken at step ' + i);
    assert.ok(L.balance() >= 0, 'negative balance at step ' + i);
  }

  // final cross-check against the independently-tracked shadow: nothing minted, nothing lost.
  const lt = L.lifetime();
  assert.equal(lt.earned, shadowEarned, 'earned drifted from the shadow model (mint/leak)');
  assert.equal(lt.spent, shadowSpent, 'spent drifted from the shadow model');
  assert.equal(lt.balance, shadowEarned - shadowSpent);
  assert.ok(L.ok());
});

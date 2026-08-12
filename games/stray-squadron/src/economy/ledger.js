// The economy ledger — M6's persistent spine. ONE currency (Salvage: what a stray
// squadron scavenges off the craft it downs) plus the permanent flight-log archive,
// living side by side per Ray's settled call (DESIGN-SEED M6: "both", not either/or).
//
// Integrity is guaranteed BY CONSTRUCTION, not by hoping the fuzz test passes:
//   * `earned` and `spent` are the canonical lifetime counters. Both are monotonic
//     (only ever increase) and never negative.
//   * `balance` is a DERIVED value: balance === earned - spent, always. On load it is
//     re-derived from earned/spent, so a tampered/corrupt stored balance can never
//     mint or leak currency (the ledger law: no sequence mints or drops Salvage).
//   * The only two mutators are earn(amount) and spend(amount). Every earn adds the
//     same amount to both balance and earned; every spend subtracts from balance and
//     adds to spent. That preserves the invariant on every single operation.
//
// Storage is INJECTABLE (localStorage in the browser, a plain object in tests), same
// pattern as core/settings.js, so the whole load/clamp/persist contract is headless.

// The single currency. Renameable by the operator later (like the memorial names);
// the mechanic never depends on the literal word. Kept in one place on purpose.
export const CURRENCY = { name: 'Salvage', short: 'SLV' };

// How much Salvage a completed run pays out. Pure function of the run summary so it
// is trivially testable and the ledger stays the only thing that touches balances.
// Generous but not inflationary: kills and cleared sectors are the bulk, medals and a
// full-map victory are the flourish. A ship-down still pays for what you downed.
export const SALVAGE = {
  perKill: 4,
  perScore: 1 / 40,       // 40 points -> 1 Salvage
  perSector: 8,
  victoryBonus: 60,
  medalBonus: { none: 0, bronze: 15, silver: 35, gold: 70 },
};

export function salvageForRun(summary) {
  const s = summary || {};
  const kills = Math.max(0, s.totalKills | 0);
  const score = Math.max(0, s.totalScore | 0);
  const sectors = Math.max(0, s.levelsFlown | 0);
  const medal = SALVAGE.medalBonus[s.runMedal] || 0;
  const victory = s.victory ? SALVAGE.victoryBonus : 0;
  return (
    kills * SALVAGE.perKill +
    Math.floor(score * SALVAGE.perScore) +
    sectors * SALVAGE.perSector +
    medal +
    victory
  );
}

// How many detailed run records the archive keeps. The LIFETIME aggregate
// (runs/kills/sectors/best medal/earned) is truly permanent and never trimmed; only
// the per-run detail list is capped so storage cannot grow without bound.
export const LOG_CAP = 40;

const KEY = 'stray.ledger';
const MEDAL_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };
const nn = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function defaults() {
  return {
    version: 1,
    earned: 0,          // lifetime Salvage earned (monotonic)
    spent: 0,           // lifetime Salvage spent (monotonic)
    runs: 0,            // lifetime completed runs
    victories: 0,       // lifetime full-map victories
    kills: 0,           // lifetime enemies downed
    sectors: 0,         // lifetime sectors flown
    wingsLost: 0,       // lifetime wingmates lost across all runs (M7)
    bestMedal: 'none',  // best run medal ever earned
    upgrades: { hull: 0, blaster: 0, boost: 0 }, // base-upgrade tiers (owned by shop)
    contracts: [],      // owned wingmate-contract ids (the sink past base upgrades)
    log: [],            // recent run records (rolling, capped at LOG_CAP)
    lastToken: null,    // dedupe guard: the last committed run token
  };
}

// Re-derive a clean, integrity-safe state from whatever was stored. Canonical fields
// are earned/spent; balance is NEVER trusted from storage (it is derived on read).
function sanitize(o) {
  const d = defaults();
  if (!o || typeof o !== 'object') return d;
  const earned = nn(o.earned);
  let spent = nn(o.spent);
  if (spent > earned) spent = earned; // can never have spent more than earned
  const up = o.upgrades && typeof o.upgrades === 'object' ? o.upgrades : {};
  return {
    version: 1,
    earned,
    spent,
    runs: nn(o.runs),
    victories: nn(o.victories),
    kills: nn(o.kills),
    sectors: nn(o.sectors),
    wingsLost: nn(o.wingsLost),
    bestMedal: MEDAL_RANK[o.bestMedal] != null ? o.bestMedal : 'none',
    upgrades: { hull: nn(up.hull), blaster: nn(up.blaster), boost: nn(up.boost) },
    contracts: Array.isArray(o.contracts) ? o.contracts.filter((c) => typeof c === 'string') : [],
    log: Array.isArray(o.log) ? o.log.slice(-LOG_CAP) : [],
    lastToken: typeof o.lastToken === 'string' ? o.lastToken : null,
  };
}

export function createLedger(storage) {
  const store =
    storage || (typeof localStorage !== 'undefined' ? localStorage : null);

  let s = defaults();
  if (store) {
    try {
      const raw = store.getItem(KEY);
      if (raw) s = sanitize(JSON.parse(raw));
    } catch (e) {
      // corrupt/unavailable storage -> clean defaults, never throw, never mint
    }
  }

  function persist() {
    if (!store) return;
    try {
      store.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      /* storage full/blocked -> keep in-memory; integrity is unaffected */
    }
  }

  // balance is DERIVED, never stored as truth. This is the anti-mint guarantee.
  const balance = () => s.earned - s.spent;

  function earn(amount) {
    const amt = nn(amount);
    if (amt <= 0) return 0;
    s.earned += amt;
    persist();
    return amt;
  }

  function spend(amount) {
    const amt = nn(amount);
    if (amt <= 0) return false;
    if (amt > balance()) return false;   // cannot overspend into the negative
    s.spent += amt;
    persist();
    return true;
  }

  // Commit a completed run: pay out its Salvage, fold it into the lifetime aggregate,
  // and append it to the flight-log archive. `token` makes the commit IDEMPOTENT:
  // committing the same run token twice (a re-shown results screen, a refresh that
  // lands back on results) is a no-op, so no abnormal ending can double-count. A run
  // that never reaches here (quit/refresh mid-level) simply never paid out -> no leak.
  function recordRun(summary, token, bonusMul = 1) {
    const sum = summary || {};
    if (token != null && token === s.lastToken) {
      return { salvage: 0, duplicate: true, balance: balance() };
    }
    const mul = Number.isFinite(bonusMul) && bonusMul > 0 ? bonusMul : 1;
    const salvage = Math.floor(salvageForRun(sum) * mul);
    s.earned += salvage;
    s.runs += 1;
    if (sum.victory) s.victories += 1;
    s.kills += Math.max(0, sum.totalKills | 0);
    s.sectors += Math.max(0, sum.levelsFlown | 0);
    s.wingsLost += Math.max(0, sum.wingsLost | 0);
    const medal = sum.runMedal || 'none';
    if ((MEDAL_RANK[medal] || 0) > (MEDAL_RANK[s.bestMedal] || 0)) s.bestMedal = medal;
    s.log.push({
      seed: String(sum.seed == null ? '' : sum.seed),
      sectors: Math.max(0, sum.levelsFlown | 0),
      routeSectors: Math.max(0, sum.routeLevels | 0),
      kills: Math.max(0, sum.totalKills | 0),
      score: Math.max(0, sum.totalScore | 0),
      medal,
      victory: !!sum.victory,
      died: !!sum.died,
      wingsLost: Math.max(0, sum.wingsLost | 0),
      salvage,
    });
    if (s.log.length > LOG_CAP) s.log = s.log.slice(-LOG_CAP);
    if (token != null) s.lastToken = token;
    persist();
    return { salvage, duplicate: false, balance: balance() };
  }

  // Setters used by the shop (upgrades.js). They persist; they never touch balances
  // (spending is done through spend()), so integrity is untouched.
  function setUpgrade(id, tier) {
    if (!(id in s.upgrades)) return;
    s.upgrades[id] = nn(tier);
    persist();
  }
  function addContract(id) {
    if (typeof id !== 'string' || s.contracts.includes(id)) return;
    s.contracts.push(id);
    persist();
  }

  return {
    balance,
    earn,
    spend,
    recordRun,
    setUpgrade,
    addContract,
    upgradeTier: (id) => s.upgrades[id] || 0,
    hasContract: (id) => s.contracts.includes(id),
    contracts: () => s.contracts.slice(),
    // read-only snapshots
    lifetime: () => ({
      earned: s.earned, spent: s.spent, balance: balance(),
      runs: s.runs, victories: s.victories, kills: s.kills,
      sectors: s.sectors, wingsLost: s.wingsLost, bestMedal: s.bestMedal,
    }),
    log: () => s.log.slice(),
    // integrity self-check: the one invariant that must always hold.
    ok: () => balance() >= 0 && balance() === s.earned - s.spent && s.spent <= s.earned,
  };
}

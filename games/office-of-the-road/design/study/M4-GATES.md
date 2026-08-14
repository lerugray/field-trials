# M4 EXIT GATES — Mandates, quartermaster, routes + the closed-loop economy

DESIGN-SEED M4 requires the economy stated as a **closed loop**: an intended gold
balance per leg index, at least one always-open sink, a shop-availability curve
with no early power spike, and a mandate reward floor such that a bad branch can
never make forward progress worse than standing still. The stated probe: a
**null-strategy** run (buy nothing) vs a **greedy** run (buy everything
affordable), reporting both gold curves — their divergence is the health signal.

All figures below are produced by `node scripts/gates.mjs` (GATE 4) and asserted
at moderate sample by `test/economy.test.js`. The probe is `src/economy.js`: a
headless run of the REAL engine + resolver + mandate/shop/route systems, with a
competent deck auto-pilot (plays decisive windows + heals, per the M3 contract)
and survival reflexes (rest + the always-open resupply). Deterministic under seed.

## Committed constants (tuning.js)

| Constant | Value | Shape / meaning |
|---|---|---|
| `goldPerWin` | routine 7 / elite 19 / boss 52 | the road's pay scale (income) |
| `mandateRewardFloor` | 24 | **the floor** — no discharge ever pays less |
| `mandateReward` (base/perLeg) | 26 + 9·span | disbursement rises with haul length |
| `resupplyBlock` / `resupplyCost` | +8 supplies / 10¤ | the **always-open sink** (never sells out) |
| `shopSellFraction` | 0.5 | quartermaster buy-back |
| item `minLeg` | 0 / 3 / 6 (tier 1/2/3) | the **no-early-spike** availability curve |
| `roadTierWeights` | routine .80 / elite .16 / boss .04 | routine-heavy road (was a uniform 1/3 M1 placeholder) |
| `routeSupplyToll` | posted 2–4 / ordinary 0–1 / verge 0 | the safety-vs-resource toll |
| `economyGoldPerLegBand` | [30, 90] | **intended net gold / leg** for a surviving run |
| `economyGreedyWorthFrac` | 0.75 | greedy must survive ≥ null in ≥ this share |

## Measured (GATE 4 — 60 seeds × 8 legs, null vs greedy)

```
sample seed 1 — gold curve per leg:
  null (hoard)    66  134  179                          wealth 193
  greedy (buy)    66   48   93   45   58   48   69   38  wealth 210  (spent 318 on kit)
  divergence       0  -86  -86

measured net gold/leg (null, surviving): 43.4   band [30, 90]        -> IN BAND
greedy survives ≥ null (buying is worth it): 96.7% of seeds (floor 75%) -> PASS
depth: null avg 6.5 legs (28 wipes) · greedy avg 7.2 legs (13 wipes)
divergence is real (median final Δ -232, greedy spent 16394 on kit)  -> PASS
always-open resupply sink                                            -> PASS
no early power spike                                                 -> PASS
never strands (min gold 0 ≥ 0)                                       -> PASS
mandate reward floor holds                                           -> PASS
-> ECONOMY HEALTHY
```

## How to read the divergence (the health signal)

The null run **hoards**: it buys no equipment, so its gold curve is (when it
survives) monotonically rising — pure income, `43.4¤/leg` net. This is the
"forward progress ≥ standing still" guarantee made visible: marching only ever
adds to the ledger.

The greedy run **invests**: it spends every affordable coin on kit (16,394¤ across
the sample). Its gold-on-hand is therefore lower — the divergence is **negative on
cash** — but the equipment is survival insurance: greedy survives at least as deep
as null in **96.7%** of seeds and wipes less than half as often (13 vs 28). The
sink has real teeth, and buying pays for itself in depth (deeper legs → more
mandate discharges → more income). A healthy loop: cash converts to survival
converts to further income.

## Structural guarantees (asserted, not sampled)

- **Reward floor** — `createMandate` returns `max(floor, base + span·perLeg)`; every
  mandate reward across the whole probe cleared 24. (Also `test/mandate.test.js`.)
- **Always-open sink** — `resupply` refuses only when the ledger cannot cover a
  block; it never "sells out". `sinkAlwaysOpen()` drains a stocked ledger to zero.
- **No early spike** — `generateShop(seed, leg)` stocks only `itemsUnlockedBy(leg)`;
  across 60 seeds × every pre-`minLeg` leg, no too-strong line ever leaked early.
- **Never strands** — `spendGold` refuses overspend; min gold across the probe = 0.

## Legibility (M4 surfaces)

The two new interactive surfaces — the **quartermaster** and the **route board** —
carry the milestone's input-parity + contrast floor. Every flavour line ships its
exact numeric neighbour (register law 6): item mods (`+6 atk`), prices, the
resupply figure, and per-branch `encounters ×`, `pay ×`, `toll`. The route board's
safety rating uses colour AND a bracket-text channel (`[guarded]/[ordinary]/
[exposed]`), so it survives a colour-vision-deficiency pass — see
`proofs/route-cvd-deuteranopia-inc4-*.png` and `proofs/shop-cvd-deuteranopia-inc4-*.png`.
Keyboard (Tab/←→/Enter/Esc) and mouse both reach every control with a visible
outline focus ring.

## Ratify notes (for the operator)

- **Road tier mix reweighted** routine .80 / elite .16 / boss .04 (from the M1
  uniform 1/3 placeholder, which put a <15%-winrate boss on every third step and
  wiped auto-parties at leg 0). This is a genuine road-legibility fix, not just a
  probe convenience; determinism + the M2 per-tier baseline are untouched (both
  run off their own construction). *Lean: keep — matches "routine is the road's
  ordinary work"; M6's varied bestiary can revisit the exact split.*
- **Bosses on the open road remain rare but present** (4%). A card-light party
  will occasionally lose one; that is the deck's job (M3). *Lean: keep.*
- **The economy probe models a competent player** (deck auto-pilot + rest/resupply)
  rather than perfect play. The gold/leg band [30,90] is the intended steady state.
  *Lean: keep; M5's certifications will add a second compounding axis to re-measure.*

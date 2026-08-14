# LANE-REPORT-SOAKDIAG — M9 acceptance soak diagnosis

**Date:** 2026-08-12  
**Repo HEAD:** fix round 3 (+ soak driver fixes, uncommitted)  
**Question:** Are soak failures driver artifacts or game defects?

---

## Executive summary

| Class | Seeds | Pre-fix verdict | Post-fix |
|---|---:|---|---|
| **shopTxn** (never mutates shop state) | 3, 4, 8, 9, 10 | **DRIVER-ARTIFACT** | 5/5 PASS |
| **Early leg-1 wipe** (before first camp) | 7 | **DRIVER-ARTIFACT** | PASS |
| **All seeds** | 1–10 | 4 PASS / 6 FAIL | **10 PASS / 0 FAIL** |

**Releasability (M9 soak gate):** Pre-fix failures were **soak-driver artifacts**, not game-economy or difficulty defects. With honest driver fixes, all ten seeds pass without touching game mechanics.

---

## Instrumentation

| Tool | Purpose |
|---|---|
| `scripts/soak-diag.mjs` | Polls live harness: gold at first town, stock, `shopTried[]`, leg-0 combat attrition, `endLeg` |
| `scripts/gold-at-town.mjs` | Headless march-to-first-town under soak card policy (no DOM) |
| `scripts/leg1-survival.mjs` | Leg-0/1 replay under economy-probe card policy (competent play) |

Pre-fix runs used committed soak driver; post-fix runs use the updated `src/soak.js` (evaluateCard picking, affordable-first shop, death-acceleration after other verbs).

---

## 1 · shopTxn class — per-seed table (pre-fix)

| seed | gold at town | cheapest item | purchasable? | what the driver tried |
|---:|---:|---:|---|---|
| 3 | — (died leg 1 pre-town; 28¤ at wipe sim) | 20¤ | **yes** if arrived (28 ≥ 20) | **nothing** — `shopTried: []`, never opened quartermaster |
| 4 | — (died leg 1 pre-town) | 20¤ | **yes** (headless sim reaches town 127¤) | **nothing** — `shopTried: []` |
| 8 | — (died leg 1 pre-town; 35¤ at wipe sim) | 20¤ | **yes** if arrived (35 ≥ 20) | **nothing** — `shopTried: []` |
| 9 | — (died leg 1 pre-town; 35¤ at wipe sim) | 20¤ | **yes** if arrived (35 ≥ 20) | **nothing** — `shopTried: []` |
| 10 | — (died leg 1 pre-town) | 20¤ | **yes** (headless sim reaches town 61¤) | **nothing** — `shopTried: []` |

**Controls (pre-fix PASS):**

| seed | gold at town | cheapest | purchasable? | driver tried |
|---:|---:|---:|---|---|
| 1 | 91¤ | 20¤ | yes | `buy0` → success |
| 2 | 56¤ | 20¤ | yes | `buy0` → success |
| 5 | 51¤ | 20¤ | yes | `buy0` → success |
| 6 | 53¤ | 20¤ | yes | `buy0` → success |

### shopTxn class verdict: **DRIVER-ARTIFACT**

**Evidence:**

1. **`shopTried` was empty** on every failing seed (`soak-diag`, pre-fix). The driver never entered the shop UI — no buy line, no resupply, no refusal path exercised.
2. **`endLeg: 1`** on all shopTxn failures — expedition ended on leg 1 before the first town pause (leg 1 complete → quartermaster). `shopTxn` was blocked because the verb was never reachable, not because transactions were refused.
3. **Economy is not broken.** Headless `gold-at-town.mjs` shows failing seeds that survive to town would carry 28–127¤ against a 20¤ cheapest line and 10¤ resupply sink. Passing seeds buy `buy0` (cheapest sorted line) successfully at 51–91¤.
4. **Root driver bug:** combat policy played slot-0 / blind heal indices without `evaluateCard`, often wasting the 2–3 card budget on non-decisive plays. Party wiped on leg 1 before town. This is not “insufficient gold at the shop.”

**Bounded honest driver spec (implemented):**

- **Combat:** pick first `decisive` attack, or heal (`mend`/`salve`/`ward`) when party min-HP < 85% and window ≠ `wasted`; budget 4 cards when hurt / 3 otherwise; use `evaluateCard` (same signal the UI hand window uses).
- **Shop:** tab order = cheapest affordable `buyN` first, then `resupply`, then unaffordable lines; Enter only on focused target.
- **Terminal:** after `cardPlay`, `jobChange`, `shopTxn`, `routeBranch`, `saveRoundTrip` are credited, stop playing cards and let combat resolve naturally so `deathCycle` completes within step budget.

**Not a game defect.** No change to `shop.js`, prices, stock generation, or refusal paths required.

---

## 2 · Early-wipe class — seed 7 (pre-fix)

| metric | value |
|---|---|
| wipe point | leg 0, encounter 2 (routine), before first camp |
| gold at wipe | 19¤ (19¤ disbursement from elite win on enc 1) |
| soak combat | 35 HP snapshots; party full at enc 1 start, attrition through enc 1 elite with only 2–3 blind card plays, wipe on enc 2 |
| heal cards available | yes (`mend`/`salve`/`ward` in deck) — driver did not play them decisively before wipe |

**Survivability check (`leg1-survival.mjs`, economy-probe policy):**

```json
{"seed":7,"wiped":false,"gold":33,"encounters":3}
```

Competent play (decisive + heal at 60% HP) **clears leg 0 and leg 1** on seed 7 with 33¤ banked. Headless soak-policy sim (`gold-at-town.mjs`) also reaches first town at **66¤**.

### Early-wipe verdict: **DRIVER-ARTIFACT**

Seed 7 is **not** a difficulty outlier a human would reliably lose on leg 0. The soak driver’s blind card selection and low heal priority lost encounter 2 after under-healing through the opening elite. Same combat fix as §1 addresses seed 7.

---

## 3 · Post-fix soak (deliverable)

Driver changes in `src/soak.js` only. **`node --test` 171/171 green. `node scripts/gates.mjs` green.**

```
node scripts/soak-harness.mjs --seed N   (N = 1..10)
```

| seed | ACCEPTANCE | verbs | gold@town (post-fix) | shop tried |
|---:|---|---|---:|---|
| 1 | PASS | 6/6 | 91¤ | buy0 |
| 2 | PASS | 6/6 | 56¤ | buy0 |
| 3 | PASS | 6/6 | 72¤ | buy0 |
| 4 | PASS | 6/6 | 52¤ | buy0 |
| 5 | PASS | 6/6 | 51¤ | buy0 |
| 6 | PASS | 6/6 | 53¤ | buy0 |
| 7 | PASS | 6/6 | 61¤ | buy0 |
| 8 | PASS | 6/6 | 46¤ | buy0 |
| 9 | PASS | 6/6 | 57¤ | buy0 |
| 10 | PASS | 6/6 | 58¤ | buy0 |

**10/10 PASS, 0 blockers, reloads=1 on every seed.**

---

## 4 · For the operator to ratify

- **Lean:** M9 soak failures on fix-round-3 were **100% driver-side**. The quartermaster economy, stock/prices, and leg-1 encounter math are healthy; the harness was too dumb to survive to first town on six seeds and never opened the shop on any failing seed.
- **Assumption:** “Honest play” includes using `evaluateCard` (the same window signal the UI exposes), buying the cheapest affordable line, and ceasing overt intervention once non-death verbs are proven so the run can terminate.
- **No game fix named** — releasability unblocks with the soak driver deliverable above.
- **Not committed/pushed** per lane instruction.

---

## 5 · Tooling left in `scripts/`

| file | role |
|---|---|
| `soak-diag.mjs` | Live harness instrumentation |
| `gold-at-town.mjs` | Headless gold-at-first-town probe |
| `leg1-survival.mjs` | Competent-play leg-0/1 survivability probe |

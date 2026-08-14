# OOR fix round 3 — lane report

Date: 2026-08-12  
Authority: `AUDIT-RERELEASE-2026-08-12.md` (FIX-FIRST)  
Scope: blockers 1–4, HIGH 5–7, extended GATE 7, full battery ×2. **No commit/push.**

## Result

| Check | Result |
|---|---|
| `node --test` | **173/173** green (+2 glyph tests) |
| `node scripts/gates.mjs` | **ALL GATES GREEN** (run twice consecutively) |
| GATE 7 catalog | **434/434** · 0 overflow · 0 drops · 0 intra-word splits · leading floor 8px |
| GATE 7 layout probe | **11 states** · 0 text-vs-text · 0 unowned text-vs-control · 0 OOB |
| `node scripts/build.js` | rebuilt `dist/office-of-the-road.html` |

---

## Blockers fixed

### 1 · Combat status strip through party roster

**Fix:** Resolver copy moved to an **owned left column** (`COMBAT_STATUS_W = 140`, cleared band y=108–125) so x≥156 roster HP/name rows stay clear. Comments no longer assert a false “full-width above roster” invariant.

**Files:** `src/main.js` (`renderCombat`, `drawCombatantW`)

### 2 · Camp overprint (stats + supplies)

**Fix:**
- Header stack uses `TEXT_LEADING` (8px) for intro + supplies; panel starts at `CAMP_PANEL_Y = 78`.
- Camp controls rebuilt on 18px row pitch; stats use single-line `drawTextFit` inside each row.
- Supplies line 2 no longer lands on the party panel.

**Files:** `src/main.js` (`buildCampControls`, `renderCamp`), `src/layout.js`

### 3 · Route intro / supplies smear

**Fix:** Intro wrapped at `TEXT_LEADING`; supplies line at `40 + introLines×8 + 2`; route cards at `ROUTE_CARD_Y = 70`.

**Files:** `src/main.js` (`renderRoute`, `buildRouteControls`)

### 4 · GATE 7 extensions (structural)

**4a — no intra-word splits:** `wrapLinesNoEllipsis` never char-splits; gate asserts alphabetic fragment splits.  
**4b — leading ≥ cell+1:** `TEXT_LEADING = 8` exported; credits body `y += 8`; all former `lineHeight 6` call sites raised.  
**4c — bbox intersections:** `scripts/layout-gate-probe.py` (Playwright) calls live `layoutProbe()` — fails on **text-vs-text** and **unowned text-vs-control** across 11 proof states + credits.

**Files:** `src/text-wrap.js`, `scripts/text-gate.mjs`, `scripts/layout-gate.mjs`, `scripts/layout-gate-probe.py`, `scripts/gates.mjs`

#### Red/green proof (blocker 1 revert)

Temporarily restored pre-fix combat strip (`drawTextLines(..., 12, 110, VW-24, 2, 7)`):

```
LAYOUT GATE FAILED
{"state": "combat", "kind": "text-vs-text", "hits": [{"a": "Bailiff: Distrain → Server (−16)", "b": "43/43", ...}], "count": 1}
```

Restored fix → `LAYOUT GATE PASSED`.

---

## HIGH items

### 5 · 5×7 face — `g` vs `9`, descenders

**Fix:** Redrew `g`, `p`, `q`, `y` with distinct tails; `g` no longer matches `9`.  
**Tests:** confusable-pair Hamming floor (≥3) for `g/9`, `g/6`, `g/q`, etc.; no duplicate glyph bitmaps in a-z/0-9.

**Files:** `src/pixel-font.js`, `test/pixel-font.test.js`

### 6 · Credits leading

**Fix:** `renderCredits` advances `y += TEXT_LEADING` (8px). Layout probe: credits page fits above control band (`perPage` 15). Gate 4b covers this.

### 7 · M9 acceptance soak — diagnosis (STOP: not band-aided)

`node scripts/soak-harness.mjs --seed N` (seeds 1–10):

| Seed | Verdict | Notes |
|---:|---|---|
| 1 | **PASS** 6/6 | |
| 2 | **PASS** 6/6 | Was 3/6 pre-lane; soak combat heal budget helped survival to camp |
| 3 | **FAIL** 5/6 | `shopTxn` — reached camp, town shop did not mutate state |
| 4 | **FAIL** 5/6 | `shopTxn` (was PASS in audit; still seed-fragile) |
| 5 | **PASS** 6/6 | Was step-budget FAIL in audit |
| 6 | **PASS** 6/6 | |
| 7 | **FAIL** 3/6 | Wiped **before first camp** → `jobChange`, `shopTxn`, `routeBranch` unreachable |
| 8 | **FAIL** 5/6 | `shopTxn` |
| 9 | **FAIL** 5/6 | `shopTxn` (was PASS in audit) |
| 10 | **FAIL** 5/6 | `shopTxn` (was PASS in audit) |

**Summary:** **4 PASS / 6 FAIL** — same failure rate as audit, different seed mix.

**Root causes (precise):**

1. **Early leg-1 wipe (seed 7 class):** Combat ends with `isWiped(party)` before the first `leg-complete` → `enterCamp` never runs. Soak marks `deathCycle` on defeat but cannot credit camp/route verbs. This is soak-policy vs seed lethality, not a layout regression.

2. **`shopTxn` class (seeds 3, 4, 8, 10):** Driver reaches camp on leg 1 (a town leg per `townEveryLegs: 2`) but exhausts shop actions without a state mutation — typically insufficient gold for buy lines + resupply refusals on tight economy seeds. Soak sets `shopUnavailable` and exits shop without crediting the verb.

3. **Not fixed:** Extending soak to rest/hoard gold, skip shop when broke, or redefining M9 as single-seed smoke would change acceptance semantics — out of scope for this layout lane.

**Soak tweak applied (bounded):** `src/soak.js` — heal threshold 0.8, up to 3 card plays when hurt (seed 2 now passes). Insufficient for shop/economy class.

---

## Collateral (needed for green gates)

- Enemy display tags shortened (`Clerk`, `Server`, `Sgt`) to fit 40px columns without mid-word splits.
- Hand window labels abbreviated (`DEC` / `ok` / `—`) — colour outline retained.
- Narrow fields use `drawTextFit` / catalog `truncateText` (deck, draft, camp stats, reduced).
- Draft layout raised (cards y=142) with preview line at y=118; card names inside tile bottoms.

---

## Verification log

```
node --test                          → 173/173
node scripts/gates.mjs               → ALL GREEN (×2)
node scripts/text-gate.mjs           → TEXT GATE PASSED
node scripts/layout-gate.mjs         → LAYOUT GATE PASSED
```

---

## For the operator to ratify

- **Enemy names** shortened again for 40px battler columns (`Clerk`, `Server`, `Sgt`). Lean: keep — gate now forbids mid-word splits; longer hyphenated forms do not fit.
- **Hand state words** are abbreviated; decisive/playable/wasted remain visible via outline colour (non-colour channel preserved).
- **M9 soak** remains **seed-fragile (4/10)**. Recommend either (a) a dedicated soak/economy lane with explicit broke-shop policy, or (b) documenting M9 harness as non-release-blocking until shopTxn logic handles broke quarters.
- **No commit/push** this lane (per instruction).

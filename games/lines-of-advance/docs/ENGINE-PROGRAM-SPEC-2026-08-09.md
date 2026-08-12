# LoA Engine Program Specification — Fugu, 2026-08-09

> Provenance: fugu-base spec dispatch (prompt: gs-private session scratchpad loa-engine-spec-prompt.md;
> inputs: src/engine.js @ b402958, CERT-LOA-RC2 dossier, RULES-LEDGER, SCOPING-MEMO, loa-engine-r1 WIP diff 60e0f12).
> Orchestrator spot-checked S3's cited literals against engine.js (ENGINE_TIME_BUDGET_MS, isolatedFighterFactor 0.18,
> victoryProximity formula, orderingScore, retreatedThisTurn absent from shipped positionKey) — all confirmed 2026-08-09.

S1. NOTATION.

**Purpose.** Define a stable LoA position and game-record notation for automated regression, A/B replay, and engine debugging. It is derived from the rule-affecting state used by `engine.js`: `rulesetId`, `turn`, `hasAttacked`, `movedThisTurn`, `pendingRetreats`, `pieces`, and game-over state as consumed by `legalActions`, `applyAction`, `evaluatePosition`, and `positionKey`. UI-only fields deliberately stripped by `searchState` — `selectedId`, `combatPreview`, `history`, `log` — are not part of engine position identity; game records carry replay history instead. This matches the scoping memo’s requirement for auditable engine analysis and move logs, without turning UI transient state into search state.

Although the operator calls the game a hex-wargame, the implemented rules ledger defines a **25×20 rectangular grid** with orthogonal/diagonal movement and fire lines: Rules Ledger rows 1, 27, and 38. Coordinates therefore use the game’s existing `coordFromXY` style: file `a`–`y`, rank `1`–`20`.

### S1.1 Coordinate, side, class, and ID conventions

- Coordinate: `a1` through `y20`.
- Mapping: `x=0 → a`, `x=24 → y`; `y=0 → 1`, `y=19 → 20`.
- Side: `N` = North, `S` = South.
- Unit class codes, mapped to `engine.js` class strings and Rules Ledger roster rows 13–25:
  - `I` = Infantry
  - `CV` = Cavalry
  - `FA` = Foot Artillery
  - `MA` = Mounted Artillery
  - `FR` = Foot Relay / foot communications unit
  - `MR` = Mounted Relay / mounted communications unit
- Piece IDs are the actual stable `piece.id` values. If an ID contains anything outside `[A-Za-z0-9._~-]`, it is percent-encoded as UTF-8 `%HH`.
- Canonical output sorts piece tokens by piece ID. ID lists are sorted except `pendingRetreats`, whose order is preserved because `currentPendingRetreat(state)` is a queue-like rule path in `turn.js`.

### S1.2 Position format: `LOA1`

The format is single-line, diffable, and round-trips every rule-affecting engine state field. It also includes neutralized/captured arsenal coordinates because `engine.js` evaluation calls `activeArsenals(state, side)` and `activeArsenalsForSide`; if the current implementation stores arsenal neutralization under a different field name, the notation adapter maps it into `cap=`. If no such field exists, `cap=-`.

Canonical field order is fixed.

```ebnf
<loafen>        ::= "LOA1" SP <ruleset> SP <version> SP <board>
                   SP <turn> SP <attacked> SP <moved>
                   SP <retreated> SP <pending-retreats>
                   SP <captured-arsenals> SP <game-over>
                   SP <pieces>

<ruleset>       ::= "r=" <atom>                 ; e.g. r=base-v1
<version>       ::= "v=" <uint>                 ; save/state schema, e.g. v=4
<board>         ::= "b=25x20"                   ; fixed by Rules Ledger row 1
<turn>          ::= "t=" <side>
<attacked>      ::= "h=" <bit>                  ; state.hasAttacked
<moved>         ::= "m=" <id-list>              ; state.movedThisTurn
<retreated>     ::= "rt=" <id-list>             ; state.retreatedThisTurn, if present
<pending-retreats>
                 ::= "pr=" "-" | "pr=" <retreat> (";" <retreat>)*
<captured-arsenals>
                 ::= "cap=" <coord-list>        ; neutralized arsenals, if state stores them
<game-over>     ::= "go=-" | "go=" <side> ":" <win-reason>
<pieces>        ::= "p=" <piece> (";" <piece>)*

<retreat>       ::= <id> "@" <coord>            ; pendingRetreat id and original fromX/fromY
<piece>         ::= <id> "/" <side> <class> "@" <coord>

<id-list>       ::= "-" | <id> ("," <id>)*
<coord-list>    ::= "-" | <coord> ("," <coord>)*
<side>          ::= "N" | "S"
<class>         ::= "I" | "CV" | "FA" | "MA" | "FR" | "MR"
<win-reason>    ::= "elim" | "arsenal" | "adjudication" | "unknown"
<coord>         ::= <file> <rank>
<file>          ::= "a" | "b" | ... | "y"
<rank>          ::= "1" | "2" | ... | "20"
<bit>           ::= "0" | "1"
<uint>          ::= DIGIT+
<atom>          ::= (<unreserved> | <pct-encoded>)+
<id>            ::= <atom>
<unreserved>    ::= "A".."Z" | "a".."z" | "0".."9" | "." | "_" | "~" | "-"
<pct-encoded>   ::= "%" HEX HEX
```

Example shape, not a canonical game position:

```text
LOA1 r=base-v1 v=4 b=25x20 t=S h=0 m=- rt=- pr=- cap=- go=- p=nI1/NI@k3;sI1/SI@o18;sMR1/SMR@q17
```

### S1.3 Primitive move notation

LoA turns consist of up to five unit moves followed by at most one attack; the engine enumerates these as primitive actions in `legalActions`: `move`, `retreat`, `attack`, `arsenal`, and `end-turn`. The notation records primitive actions exactly, so an A/B replay can feed each action through `applyAction`.

Normal moves and retreats include both `from` and `to` coordinates. The engine only needs the destination plus ID, but the `from` coordinate is a replay assertion and makes diffs readable. Attacks include the target ID and current target coordinate, because `applyCombat` is target-ID based while humans debug board coordinates. Arsenal capture records the arsenal coordinate, matching `applyArsenalCapture`.

```ebnf
<action>        ::= <move-action>
                 | <retreat-action>
                 | <attack-action>
                 | <arsenal-action>
                 | <end-action>

<move-action>   ::= "M:" <id> "@" <coord> "-" <coord>
<retreat-action>::= "R:" <id> "@" <coord> "~" <coord>
<attack-action> ::= "A:" <id> "@" <coord>
<arsenal-action>::= "Z:" <coord>
<end-action>    ::= "E"
```

Examples:

```text
M:sI3@o1-p1
R:nCV2@h8~h7
A:nFA1@f18
Z:v18
E
```

### S1.4 Game-record format: `LOAGR1`

A regression record is a start position, a primitive move list, a result, and optional tags. It is deliberately line-oriented for fixtures and A/B replay.

```ebnf
<game-record>   ::= "LOAGR1" "|" <loafen> "|" <move-list> "|" <result>
                   [ "|" <tag-list> ]

<move-list>     ::= "-" | <action> ("," <action>)*
<result>        ::= "N:" <result-reason>
                 | "S:" <result-reason>
                 | "D:" <result-reason>
                 | "*"

<result-reason> ::= "elim"          ; all enemy fighting units eliminated, Rules Ledger row 75
                 | "arsenal"       ; both enemy arsenals neutralized, rows 75–77
                 | "rep3"          ; harness adjudication, not a rules change
                 | "noprog"
                 | "maxturn"
                 | "illegal"
                 | "timeout"
                 | "crash"
                 | "unknown"

<tag-list>      ::= <tag> (";" <tag>)*
<tag>           ::= <atom> "=" <atom>
```

Example shape:

```text
LOAGR1|LOA1 r=base-v1 v=4 b=25x20 t=N h=0 m=- rt=- pr=- cap=- go=- p=...|M:nI1@k3-l3,M:nI2@o1-p1,E,M:sI1@k18-l18,E|D:rep3|book=opening-seed-0042;tc=d3n5000
```

Round-trip acceptance for S1:

1. Parse `LOA1` to state.
2. Re-serialize to canonical `LOA1`; bytes must match.
3. `legalActions`, `evaluatePosition`, `gameOver`, active arsenals, pending retreat behavior, and `applyAction` replay must match the original state.
4. Existing save schema `version: 4` noted in the certification dossier must map cleanly into `v=4`.

---

S2. MATCH HARNESS.

### S2.1 Scope and engine interface

Build a headless Node runner with no build dependencies, consistent with the scoping memo’s browser-native/no-server constraint. It imports the same rule and engine modules used by the browser: `legalActions`, `applyAction`, `searchBestAction`, `evaluatePosition`, and scenario/preset factories. An engine under test is an adapter exposing:

- engine ID and git/build metadata;
- deterministic seed;
- fixed search options: depth, node budget, or time budget;
- `choose(state) → action + diagnostics`.

Every action must be one of the S1 primitive actions and must be legal under `legalActions(state)`. Illegal action, throw, timeout, or non-deterministic mismatch is a forfeit record, not a manual investigation.

### S2.2 Controls

Use **fixed node or fixed depth controls** for strength gates. Wall-clock time is recorded but not trusted for fairness, because `engine.js` intentionally converts milliseconds into a deterministic node quota via `ENGINE_NODES_PER_MS`.

Required controls:

1. **Smoke control:** shallow, fast.
   - Example: turn-aware depth 1 or primitive depth 3, fixed node budget 1k–2k per decision.
   - Purpose: detect crashes, illegal moves, massive regressions.

2. **Development control:** main A/B gate.
   - Fixed node budget, e.g. 5k–20k nodes per engine decision, or fixed completed turn-depth if implemented.
   - Same opening list, same seeds, both engines.

3. **Final control:** declared acceptance control.
   - Fixed and published before the run.
   - Example: 20k nodes per decision, maximum 200 full turns, deterministic seed set.
   - Final comparison is against shipped rc2 `engine.js`.

Wall-clock soft cap remains to prevent hung CI jobs, but the verdict is based on node/depth-controlled play, not browser timer jitter.

### S2.3 Opening-position generation

Sources:

- Existing game scenarios/presets identified in the certification dossier: full-board `Opening` currently labeled `test` in D5, plus `comms-drill` and `comm-cut`.
- Teaching/endgame probes used by the automated acceptance battery, where available, kept in a separate tactical bucket.
- Rules Ledger row 82: setup is free deployment inside each side’s territory; therefore seeded legal deployment generators may be used for engine testing, but must be tagged as generated test openings, not canonical historical starts.

Book builder:

1. Convert every scenario start to canonical `LOA1`.
2. For each base scenario and seed, generate legal playout prefixes of 0–6 full turns using a **neutral reference policy**, not either candidate engine.
   - Policy uses only rules-grounded filters: keep fighters in communication where possible, avoid immediate terminal blunders, avoid repeated positions, and preserve material balance unless the scenario is explicitly tactical.
   - It may weight legal moves for variety but must not use candidate engine eval.
3. Filter positions:
   - no `gameOver`;
   - no unresolved pending retreat unless building a retreat-specific test bucket;
   - material swing below a fixed threshold for rating book, e.g. ≤300 eval points;
   - at least two meaningful legal actions besides `E`;
   - not an exact duplicate `LOA1`.
4. Cluster openings by `(baseScenario, seed, prefixLength)`.
5. Split into disjoint pools:
   - training/tuning pool;
   - development A/B pool;
   - final holdout pool.

Balanced match use:

- Every opening is played as a **paired mini-match**:
  1. A controls North, B controls South.
  2. B controls North, A controls South.
- The starting `LOA1` is identical in both games. This controls side bias without assuming geometric symmetry, important because the Rules Ledger says the two territories are asymmetrically disposed.
- Game order is randomized by seed.
- A verdict may not draw more than two paired openings from the same ancestor cluster. This prevents correlated-position bias from swamping the statistical gate.

### S2.4 Termination and draw adjudication

Rules wins always dominate:

- North/South win by eliminating all enemy fighting units or neutralizing both enemy arsenals, Rules Ledger rows 75–77.
- Combat, retreat, and arsenal actions are applied only through `applyAction`, which delegates to `turn.js`, `combat.js`, and `comms.js`.

Harness adjudications are testing conventions, not rules changes:

1. **Threefold exact repetition:** same canonical `LOA1` appears three times with same side/phase.
   - Result: `D:rep3`.
   - Directly targets the rc2 oscillation documented in CERT D4.

2. **No-progress draw:** 80 full turns with no fighter destruction, relay destruction, forced retreat, arsenal neutralization, or irreversible communication/victory change.
   - Result: `D:noprog`.

3. **Maximum length:** 200 full turns.
   - Result: `D:maxturn`.

4. **No-action loop:** if both sides choose only `E` for a configurable number of consecutive full turns, e.g. 10, adjudicate `D:noprog`.

5. **Illegal/crash/timeout:**
   - illegal move: loss for offending engine, `result-reason=illegal`;
   - uncaught exception: loss, `crash`;
   - decision exceeding hard wall-clock guard: loss, `timeout`.

### S2.5 JSON result records

Each game emits one JSON object plus an S1 `LOAGR1` line. Required fields:

- `schema`: result schema version;
- `gameId`, `pairId`, `openingId`, `openingCluster`;
- `start`: canonical `LOA1`;
- `engines`: A/B metadata, commit, options, seed;
- `control`: depth/node/time/max-turn settings;
- `actions`: array of primitive actions with:
  - before/after `LOA1` hash;
  - side to move;
  - engine actor;
  - selected S1 action;
  - score, depth, nodes, elapsedMs, PV if provided;
  - legal-action count;
- `result`: `N`, `S`, `D`, or `*`;
- `reason`: rules win or adjudication reason;
- `record`: canonical `LOAGR1`;
- `pathologyMetrics`: reversal rate, advance rate, attack count, arsenal attempts, repetition count.

### S2.6 Sequential statistical gate

Use a paired-game SPRT, preferably pentanomial as in chess-engine testing, because every opening produces two correlated games with colors swapped. Unit of evidence is the pair score for B over A: `0, 0.5, 1, 1.5, 2`.

Default gates:

1. **Quick development gate**
   - Hypotheses: `H0: B ≤ A`, `H1: B ≥ A + 50 Elo`.
   - Error bounds: `α = β = 0.10`.
   - Bounds: approximately `±2.197` log-likelihood.
   - Minimum: 64 paired games = 128 games.
   - Maximum: 150 pairs = 300 games.
   - Use for cheap iteration only; not final acceptance.

2. **Merge strength gate**
   - Hypotheses: `H0: B ≤ A`, `H1: B ≥ A + 35 Elo`.
   - Error bounds: `α = β = 0.05`.
   - Bounds: approximately `±2.944`.
   - Minimum: 100 pairs = 200 games.
   - Maximum: 400 pairs = 800 games.
   - If upper bound crossed: accept strength claim.
   - If lower bound crossed: reject.
   - If cap reached without crossing: no strength claim; merge only if the change is non-strength infrastructure with separate functional gates.

3. **Final rc2 superiority gate**
   - Opponent A: shipped rc2 engine from attached `engine.js`.
   - Candidate B: release engine.
   - Fixed final control declared before run.
   - Hypotheses: `H0: B ≤ rc2`, `H1: B ≥ rc2 + 75 Elo`.
   - Error bounds: `α = β = 0.05`.
   - Cap: 500 pairs = 1000 games.
   - If cap is reached, require a two-sided 95% paired bootstrap confidence interval with lower bound above 0 Elo; otherwise verdict is inconclusive.

Bias controls:

- never count unpaired games in SPRT;
- randomize pair order;
- no duplicate exact `LOA1` in one verdict;
- cap openings per cluster;
- report per-cluster scores to catch one-scenario overfitting;
- use disjoint opening pools for tuning and final gates.

---

S3. PATHOLOGY DIAGNOSIS.

The certification dossier reports two engine-relevant failures: D4, depth-1 move reversal on 72–86% of engine turns, and D5, the shipped opponent never advances or contests. The following hypotheses are ranked by likelihood from the actual `engine.js` paths.

### S3.1 Ranked hypotheses and discriminating tests

| Rank | Hypothesis | Suspect source path | Why it fits CERT D4/D5 | Automated discriminating test |
|---:|---|---|---|---|
| 1 | **Search depth counts primitive actions, not full turns.** | `negamax(state, depth...)` decrements depth for every `move`, `attack`, `retreat`, or `end-turn`; `legalActions` emits individual unit moves plus `E`; turn rule allows up to five moves and one attack, Rules Ledger rows 31–35. | At reported depth 1, the engine evaluates after a single sub-move, often before ending its own turn and before the opponent acts. It cannot see the consequence of advancing, contact, or reply. CERT reports depth 1 and repeated two-unit shuffles. | Run identical openings under: primitive-depth 1/2/3, high-node primitive depth, and a turn-aware search where depth decrements only on side change. Measure reversal rate, attack count, average forward progress, and completed depth. If turn-aware depth 1 sharply reduces reversals, this is confirmed. |
| 2 | **Node budget prevents depth 2 completion.** | `ENGINE_TIME_BUDGET_MS=900`, `ENGINE_NODES_PER_MS=1`, `ENGINE_MAX_DEPTH=3`; `searchBestAction` keeps only the last fully completed depth and aborts on `NodeBudgetReached`. | With LoA’s large branching from 25×20 board, 34 pieces, up to five moves, attacks, retreats, and `E`, depth 2 often fails, so completed result remains depth 1. CERT saw depth 1 and about 450 nodes. | For the shipped engine, run fixed node budgets: 450, 900, 2k, 5k, 20k. Record completed depth and reversal rate. If reversals fall only when depth 2+ completes, budget/depth is causal. |
| 3 | **Evaluator has no explicit anti-reversal, repetition, or territorial tempo term.** | `evaluatePosition` is static; `searchState` strips `history` and `log`; `sideEvaluation` has material, communication, arsenal safety, mobility, attack pressure, and weak arsenal approach, but no “undo last move” or repetition feature. | A move and its reverse can have almost identical static value. The engine cannot remember that `p1-o1` undoes last turn’s `o1-p1`. Deterministic tie-breaking can form a two-cycle. | Add a diagnostic wrapper that scores all legal root actions from reproduced D4 positions and tags exact reversals. Report eval delta between best reversal and best non-reversal. Then run a no-search root policy with a temporary reversal penalty only. If reversal rate collapses without other changes, this is confirmed. |
| 4 | **Progress toward the enemy is underweighted or mis-specified.** | `victoryProximity += max(0,25-nearestEnemyArsenal) * 1.5`; no frontier/territory feature; own `arsenalSafety` is 230 per active arsenal; connected relay is 64; connected fighter is 18; mobility is 2 per legal move. | One step closer to an enemy arsenal is worth about 1.5 points per fighter, often dominated by mobility or communication safety. Advancing may risk isolation, which reduces fighter material to `base * 0.18`. This explains “never advances” even when legal. | For each opening-book root, classify legal fighter moves by `ΔdistanceToEnemyArsenal` and communication status. Compute rank correlation between eval delta and forward progress. If chosen moves are neutral/backward despite safe forward options, progress weighting is defective. |
| 5 | **Deterministic hash tie-break creates stable two-cycles among equal moves.** | `orderedActions` sorts by action class, then `hash32(positionKey|action)`, then lexical key. All normal moves get the same `orderingScore=10000`. | If many moves have equal depth-1 eval, the hash chooses one arbitrary move in position A and the reverse in position B. CERT examples show exact alternating move sets. | At D4 positions, count how many root actions share the best score. Compare chosen action to ordering rank. Re-run with seed changes and with tie-break preferring non-reversing/advancing actions. If cycles change with seed while scores are equal, ordering is amplifying the issue. |
| 6 | **Engine overvalues moving because `E` competes as just another action.** | `legalActions` always appends `{type:'end-turn'}`; root search chooses one primitive action, UI likely calls engine repeatedly until turn end. | If every harmless move is slightly positive and `E` is neutral, the engine will spend moves even when no plan exists, creating shuffle material. | Compare three policies: current primitive selection, root option to choose a complete turn plan ending in `E`, and a penalty for non-progress primitive moves after the first. Measure moves-per-turn and reversal rate. |
| 7 | **Position key omits rule-affecting fields.** | Shipped `positionKey` omits `retreatedThisTurn`; likely omits neutralized arsenal state if stored outside piece occupancy; WIP adds `retreatedThisTurn` but still needs a complete key audit. | Unsound transpositions can corrupt search. This is less likely to explain depth-1 reversals, but it is dangerous for stronger search and retreat/combat positions. | Generate random legal states, clone them, mutate one suspected field only, and compare `legalActions`, `evaluatePosition`, active arsenals, and `positionKey`. Any pair with different legal/eval behavior but same key is a blocker. |
| 8 | **Evaluation mobility term rewards lateral/back-line shuffling.** | `sideEvaluation` adds legal-move counts for connected fighters and relays; mobility weight is 2. | Sideways moves in own communication net may increase mobility without strategic progress. | Ablate mobility in fixed-depth self-play and root action scoring. If reversal rate falls while strength does not, mobility is too noisy or needs safe/progress normalization. |

### S3.2 Required pathology metrics

Every S2 game record must compute:

- `reverseRate`: share of full turns where a side’s move set contains exact reversals of its previous own turn.
- `firstMoveReverseRate`: share of turns whose first primitive move reverses the same piece’s last move.
- `advanceRate`: share of fighter moves reducing distance to an active enemy arsenal or increasing side-relative front progress while remaining in communication.
- `attackTurns`: turns with `A:` action.
- `arsenalAttempts`: `Z:` actions and legal missed `Z:` opportunities.
- `cycleLength2Count`: exact two-position/two-turn cycles.
- `completedDepthHistogram`.

Acceptance for fixing D4/D5 is not “looks better”; it is an automated reduction from rc2’s reproduced 72–86% reversal band to a target threshold, initially ≤25% in development and ≤15% final, while increasing safe advance and attack frequency.

---

S4. SEARCH ROADMAP.

### S4.1 Judgment on the attached WIP diff

The WIP is **not merge-ready**. It is a plausible bounded-TT extension to an engine that already has exact-result caching and move ordering, but it does not address the main D4/D5 causes: primitive-action depth, depth-1 completion, and evaluation/tempo.

What the WIP does well:

- Adds `retreatedThisTurn` to `positionKey`, likely necessary because Rules Ledger row 46 says a retreating unit cannot contribute to counter-attack that turn.
- Converts exact-only TT into bound-aware TT: `exact`, `lower`, `upper`.
- Stores `bestKey` for move ordering.
- Records `transpositionHits` and `cutoffs`, useful for S2 JSON diagnostics.

Blockers before merge:

1. **State-key completeness audit.**
   - `positionKey` must include every field affecting `legalActions`, `applyAction`, `evaluatePosition`, active arsenals, retreat legality, and game-over.
   - Suspects: neutralized arsenal state, `retreatedThisTurn`, pending-retreat order, game-over winner/reason for terminal identity.
   - Gate: 10k random legal-state mutations; no pair may have same key and different legal/eval behavior.

2. **TT correctness equivalence.**
   - With high node budget and fixed depth, WIP TT and a no-TT exact alpha-beta must return identical root score and a legal best action on a random corpus at depths feasible for exhaustive comparison.
   - Gate: 1k positions depth 1–3 primitive or depth 1 turn-aware.

3. **Bound semantics under iterative deepening.**
   - Bound hits returning `{score, pv: []}` are acceptable inside the tree but must not cause root fallback to an arbitrary action.
   - Gate: root PV first action must always be legal and score-equivalent to no-TT search.

4. **Pending-retreat order decision.**
   - Shipped key sorted `pendingRetreats`; WIP preserves order. If `currentPendingRetreat` makes order rule-affecting, preserve order and make S1 do the same. If not, canonicalize. Gate decides, not taste.

5. **A/B proof.**
   - Quick S2 gate against pre-WIP engine at same control.
   - Required outcome for merge: no strength regression, no pathology regression, ≥15–25% node reduction or completed-depth improvement on the benchmark corpus.

Merge policy: WIP may merge only as an infrastructure improvement after these gates. It must not be presented as the D4/D5 fix.

### S4.2 Ordered classical ladder for LoA

| Rung | Improvement | LoA-specific reason | Expected gain | Effort | Automated gate |
|---:|---|---|---:|---|---|
| 0 | **Notation, perft-like legal action counts, replay corpus.** | Rules are complex: communications, forced retreats, arsenal actions, one attack after moves. Engine must not drift from `movement.js`, `combat.js`, `comms.js`, `turn.js`. | Enables all later work | S | S1 round-trip; existing 109 tests; random replay no illegal actions. |
| 1 | **Pathology baseline harness.** | CERT D4/D5 must be reproduced automatically before fixing. | Diagnostic | S | rc2 reversal rate reproduced within certification band on seeded book; depth histogram matches shallow behavior. |
| 2 | **Turn-aware search semantics.** | A LoA turn is not one primitive move; Rules Ledger row 31 allows up to five moves plus attack. Primitive depth 1 is strategically blind. | Very large, likely +100–300 Elo vs rc2 | M/L | S2 quick SPRT vs rc2; reversal ≤30%; completed depth reports full-turn depth; no illegal turn sequences. |
| 3 | **Iterative deepening with stable PV.** | Current `searchBestAction` iterates primitive depths but often completes only depth 1. Turn-depth ID gives usable anytime behavior and move ordering. | Medium | M | Fixed-node benchmark: monotonic completed depth vs nodes; PV replay legal; no weaker by quick gate. |
| 4 | **Complete transposition table.** | LoA has many move-order transpositions within a turn: moving A then B can reach same position as B then A, subject to `movedThisTurn`. | Medium speed; indirect strength | M | TT/no-TT equivalence; ≥20% node reduction at same score; S2 no regression. |
| 5 | **PV/hash move, capture/arsenal/retreat ordering.** | `legalActions` already distinguishes arsenal, attack, retreat, move, `E`; ordering should prefer terminal and deterministic combat outcomes. | Medium | S/M | Node reduction at equal depth; no strength regression; tactical suite finds one-ply wins. |
| 6 | **Killer and history heuristics for non-capturing moves.** | Many quiet moves exist on a 25×20 board. Cutoff-causing relay cuts, fortress occupations, and safe advances should be learned by side/phase. | Medium | M | ≥10% node reduction beyond TT+PV; S2 quick pass or neutral with speed gain. |
| 7 | **Evaluation v1 with tempo/repetition/progress.** | Direct fix for D4/D5; must value communication, arsenals, terrain, combat, and safe advance under Rules Ledger rows 55–77. | Large | M | Pathology gates: reversal ≤25%, safe advance rate improved, attack/arsenal opportunities not missed; S2 merge gate vs rc2. |
| 8 | **Quiescence analogue for combat and supply tactics.** | LoA has deterministic attacks, forced retreats, surrounded-force destruction, and arsenal capture. Leaf nodes with immediate `A:`/`Z:` are unstable. | Large tactical gain | L | Tactical regression suite: no horizon blunders on destroy/retreat/arsenal/relay-cut positions; S2 merge gate. |
| 9 | **Selective pruning.** | Branching is high, but null-move assumptions are risky because real `E` exists and communication zugzwang-like states occur. | Medium speed | M/L | Only conservative pruning: futility, razoring, late-move reductions on non-tactical quiet moves. Gate: exact-search equivalence on shallow corpus; S2 no regression. |
| 10 | **Time/node management.** | Browser/node must remain local and deterministic; scoping memo requires responsive engine and no cloud at play time. | UX + strength stability | M | Same seed/control gives same action in Node and browser; wall-clock cap respected; no final-control timeouts. |
| 11 | **Principal variation and multi-PV diagnostics.** | CERT F4 says PV like `MA v18` is unreadable; A/B debugging needs full S1 moves. | Diagnostic/UX | S | PV is legal replay from root; JSON contains S1 action list; no UI dependency. |
| 12 | **Parallel self-play runner, not parallel shipped engine.** | Hobbyist budget benefits from CPU saturation offline; shipped browser engine remains local and simple. | Tuning throughput | M | Sharded S2 results aggregate deterministically; no cloud/API dependency at play time. |

### S4.3 Quiescence definition for this game

A position is **not quiet** if any of these are true:

- pending forced retreat exists;
- legal `Z:` arsenal capture exists, Rules Ledger rows 75–77;
- legal attack destroys a unit or forces retreat, rows 37–45;
- legal attack can destroy an isolated/surrounded unit under communication rules, rows 63 and 67;
- immediate enemy reply can destroy a high-value undefended fighter/relay or neutralize an arsenal.

Quiescence searches only tactical continuations: forced retreats, arsenal captures, destroying/retreat attacks, and narrowly defined defensive replies. It must not expand all quiet moves, or it becomes another full-width turn search.

### S4.4 Pruning policy

Allowed after exact gates:

- alpha-beta with TT bounds;
- aspiration windows after iterative deepening;
- futility pruning for late quiet moves whose maximum plausible swing cannot reach alpha;
- late move reductions for non-tactical moves after good ordering;
- razoring near leaf only outside combat/arsenal/retreat/contact positions.

Avoid or treat as experimental:

- chess-style null-move pruning. LoA already has a legal `E` action, and communications can make passing/moving fewer units strategically meaningful.
- pruning that assumes material is the only tactical swing; communication collapse can be worth more than a unit.

---

S5. EVALUATION.

Evaluation must be grounded in the implemented rules, not generic chess terms. Compute features for North and South with the same side-relative function, then return `North - South`; `evaluateForSide` may flip as in `engine.js`. No feature may privilege North or South by hard-coded board bias.

### S5.1 Initial material scale

Use current `EVAL_WEIGHTS` as the starting scale, adjusted only by automated tuning:

| Class | Initial value | Source |
|---|---:|---|
| Infantry | 100 | Rules Ledger rows 13, 15–16 |
| Cavalry | 110 | rows 17–20, 49–54 |
| Foot Artillery | 140 | rows 21–23 |
| Mounted Artillery | 155 | rows 21–23 |
| Foot Relay | 70 | rows 14, 24–25, 59–61 |
| Mounted Relay | 85 | rows 14, 24–25, 59–61 |

Isolation treatment:

- Connected fighter: full material.
- Isolated fighter: 5–18% material until tuned, because Rules Ledger row 63 says isolated fighters are immobile and lose offensive/defensive value.
- Relay out of useful communication: retain body value but lose route value; relays can move while out of communication per row 69.

### S5.2 Feature table

| Feature | Initial weight idea | Cheap/expensive | Rule/source grounding |
|---|---:|---|---|
| Connected fighter bonus | +15 to +25 each | Medium: needs `computeCommunications` | Rows 55, 61–64 |
| Connected relay bonus | +50 to +75 each | Medium | Rows 59–61, 69–71 |
| Supplied source diversity | +30 per distinct own arsenal source | Medium | Rows 55–60 |
| Relay-chain integrity | +6 to +10 per useful link, capped | Medium | Rows 59–61 |
| Communication redundancy | +20 per alternate source/relay path | Expensive unless cached | Lines can be cut/restored, rows 65–66 |
| Bottleneck penalty | -25 to -60 for single relay/source whose loss isolates cluster | Expensive | Rows 65–68 |
| Enemy cluster cut potential | +20 to +40 per enemy fighter that can be isolated by one move | Expensive | Rows 63, 65–68 |
| Active own arsenal | +240 to +300 each | Cheap/medium | Rows 55–57, 75–77 |
| Enemy arsenal neutralized | +500 to +700 for first; terminal for second | Cheap | Rows 75–77 |
| Own arsenal threat | -20 to -60 by enemy fighter distance/line | Medium | Rows 75–77 |
| Legal arsenal capture available | near-terminal tactical bonus | Cheap via `legalActions` | Row 77; `legalActions` has `arsenal` |
| Fort occupation | +10 to +30 if useful unit and connected | Cheap | Rows 9–11 |
| Pass occupation | +5 to +20, especially infantry/artillery | Cheap | Rows 10, 16, 22, 54 |
| Mountain line blockage value | context only | Expensive | Rows 5–7, 38, 48 |
| Safe mobility | +0.5 to +1.5 per legal move, capped per piece | Expensive: `getLegalMoves` | Rows 26–33, 55–63 |
| Unsafe/isolating move penalty | -20 to -80 | Medium | Rows 62–63 |
| Immediate destroying attack | target value × 0.7 to 1.0 plus +40 | Expensive: `computeCombat` | Rows 37–45 |
| Immediate forced retreat | +25 to +60 | Expensive | Rows 43, 45–47 |
| Resisted attack pressure | +0 to +8 | Expensive | Row 42 |
| Own hanging unit | negative mirror of enemy attack pressure | Expensive | Rows 40–45 |
| Cavalry charge formation | +20 to +80 by completeness/contact | Medium/expensive | Rows 19, 49–54 |
| Supplied advance toward enemy arsenal/frontier | +3 to +8 per safe step | Cheap/medium | Victory rows 75–77; movement rows 26–33 |
| Bridgehead in enemy territory while supplied | +20 to +50 | Cheap/medium | Territory rows 2–4, 80 |
| Non-progress shuffle penalty | -2 to -8 per primitive move | Cheap | Anti-D4 tempo term |
| Exact reversal penalty | -25 to -50 at root/search | Cheap with game record/history | CERT D4; `searchState` currently strips history |
| Repetition penalty | draw score at 3-fold; small penalty at 2-fold | Medium | Harness D:rep3; CERT D4 |

### S5.3 Tempo and symmetry treatment

The oscillation fix must be principled and symmetric.

1. **Side-relative progress.**
   - Define progress as reducing distance to active enemy arsenals, improving supplied presence beyond the frontier, or creating a legal arsenal/combat threat.
   - Do not hard-code “North should increase y” unless the coordinate orientation is explicitly mapped by the rules adapter. Use enemy objectives and territory ownership from the ruleset.

2. **Exact reversal penalty.**
   - If the same piece moved `A→B` on its previous own turn and now considers `B→A`, subtract a small root/search penalty unless the move:
     - wins material;
     - captures/neutralizes an arsenal;
     - restores communication;
     - avoids immediate loss;
     - executes a forced retreat.
   - This uses game-record history and does not change legal rules.

3. **Repetition handling.**
   - The search should score third repetition as draw under harness rules and mildly penalize second repetition.
   - This is separate from game rules; it prevents the engine from choosing known test-adjudicated cycles.

4. **Move-budget sanity.**
   - Because Rules Ledger row 31 allows “up to five” moves, unused moves are legal. Evaluation must not reward moving for its own sake.
   - Penalize non-progress primitive moves slightly; waive penalty for attacks, retreats, arsenal capture, communication restoration, safe advance, or tactical defense.

5. **Attack tempo.**
   - `hasAttacked` matters: after attacking, movement should be unavailable under the enforced rule path noted in CERT D3. Evaluation must value using the one attack when it creates deterministic gain and not hallucinate post-attack movement.

### S5.4 Computation budget

Cheap features:

- material;
- coordinates/progress;
- fort/pass occupancy;
- exact reversal;
- active piece counts;
- simple arsenal distance.

Medium features:

- one `computeCommunications` per evaluated state;
- connected status;
- source arsenal count;
- relay chain length;
- safe mobility if legal moves are cached.

Expensive features:

- full mobility for every piece;
- `attackableEnemies` and `computeCombat` for both sides;
- communication redundancy and bottleneck analysis;
- one-move supply-cut search;
- quiescence tactical expansion.

Rule: compute expensive features at interior nodes only if cached or depth-limited. Leaf eval must remain fast enough for hobbyist self-play.

---

S6. TUNING.

No neural-network training pipeline. Tuning is scalar parameter optimization for the classical evaluator/search only, consistent with the anti-goals and browser-local shipping constraint.

### S6.1 Parameter set

Tune 20–40 parameters at first:

- material multipliers by class;
- isolated fighter multiplier;
- connected fighter/relay bonuses;
- arsenal active/captured/threat weights;
- terrain occupation weights;
- mobility cap and weight;
- attack result weights;
- progress and bridgehead weights;
- reversal/repetition/non-progress penalties;
- quiescence tactical thresholds;
- pruning margins, only after correctness gates.

Use bounded parameters. For weights that must stay positive, tune in log-space or clamp after each update. Keep a human-readable parameter file so every tuned value maps to a rule-grounded S5 feature.

### S6.2 Single always-on CPU recipe

Assume one consumer desktop running headless Node continuously.

Preparation:

1. Build three disjoint S2 opening pools:
   - `train`: 512–2048 paired openings;
   - `dev`: 256 paired openings;
   - `final-holdout`: untouched until release gates.
2. Fix a fast tuning control:
   - deterministic node budget;
   - maximum 120–160 full turns;
   - same adjudication as S2;
   - no UI/browser overhead.
3. Freeze a baseline parameter vector.

SPSA recipe:

- Iterations: 300 initial, extend to 600 if still improving.
- Per iteration:
  - sample random ± perturbation for all parameters;
  - create `θ+` and `θ-`;
  - run 16 opening pairs = 32 games using common openings/seeds;
  - score by paired result points, draw = 0.5;
  - update parameters with SPSA.
- SPSA constants:
  - `α = 0.602`, `γ = 0.101`;
  - choose initial `c` so typical perturbation is 5–10% of parameter range;
  - choose `a` so early updates move important weights by about 1–3%.
- Every 10 iterations:
  - run 64-game sanity match `current` vs `incumbent` on dev pool.
  - promote only if score improves and pathology metrics do not regress.
- Every 50 iterations:
  - run S2 quick SPRT, α=β=0.10, H1=+50 Elo, cap 300 games.
- Every 150 iterations:
  - run merge-style SPRT against the pre-tuning engine, α=β=0.05, H1=+35 Elo, cap 800 games if compute budget allows.

Stopping rules:

- Stop after 300 iterations if last three 64-game validations fail to improve.
- Stop after 600 iterations regardless and validate the best checkpoint.
- Reject tuned vectors that improve self-play but worsen:
  - reversal rate;
  - missed one-ply arsenal captures;
  - tactical regression suite;
  - existing 109 tests.

Expected size:

- 300 iterations × 32 games = 9600 games, plus validations.
- At 5–20 seconds per headless game, this is roughly 13–53 CPU-hours for the core SPSA pass, feasible on an always-on home CPU over a weekend.

### S6.3 Cheap-cloud burst variant

Optional, offline only; no cloud calls at play time and no server dependency in the shipped browser engine.

Use <$10 of commodity CPU burst to parallelize self-play shards:

- 8–32 vCPU for a few hours, depending on market price;
- each shard gets disjoint opening seeds;
- write JSONL S2 records;
- aggregate locally;
- deterministic replay of promoted candidates on the home machine before merge.

Burst plan:

1. Run 100–200 SPSA iterations with 64 games/iteration instead of 32.
2. Run one merge SPRT for the best 3–5 candidates against incumbent.
3. Bring only the scalar parameter file and JSON records back; no runtime service, no trained model.

### S6.4 Overfitting controls

- Tune on `train`, promote on `dev`, accept on `final-holdout`.
- Maintain tactical unit tests for combat, retreat, arsenal, and communication cuts.
- Do not tune against rc2 only; rc2 has known D4/D5 pathologies and can reward anti-rc2 tricks.
- Use paired openings and common random numbers to reduce noise.
- Track per-scenario performance so `comms-drill` or `comm-cut` does not dominate full-game strength.
- Keep old parameter checkpoints and replayable S1 records for every promotion.

---

S7. MILESTONES.

Every milestone gate is automated through S1/S2 plus the existing 109-test suite. The operator never plays to test engine quality.

### M1. Notation and replay foundation

Deliver:

- `LOA1` parser/serializer adapter;
- `LOAGR1` game-record writer/reader;
- canonical coordinate/class/side mapping;
- corpus folder for regression records.

Gate:

- 10k random legal states round-trip canonically.
- Replayed `LOAGR1` records produce identical final `LOA1`.
- `legalActions`, `evaluatePosition`, active arsenals, pending retreats, and `gameOver` preserved.
- Existing 109 tests pass.

### M2. Headless match harness

Deliver:

- Node engine-vs-engine runner;
- scenario/opening book generator;
- JSONL result output;
- paired-game scheduler;
- draw/termination adjudication;
- SPRT implementation.

Gate:

- rc2 vs rc2 scores statistically equal within expected noise.
- No illegal moves in 1000 self-play games.
- Result records include S1 start, S1 move list, final result, diagnostics.
- Existing 109 tests pass.

### M3. Pathology reproducer

Deliver:

- Automated D4/D5 metrics: reversal, advance, attack, depth.
- Reproduction book seeded from Opening/test plus scenario probes.

Gate:

- Shipped rc2 reproduces certification behavior: high two-cycle reversal, shallow completed depth, low/no advance.
- Store canonical failing `LOAGR1` examples.
- Existing 109 tests pass.

### M4. WIP TT triage

Deliver:

- Key-completeness audit.
- TT/no-TT equivalence tests.
- WIP A/B report.

Gate:

- If WIP passes key/equivalence/speed and no-regression gates, merge.
- If not, discard or patch before any search ladder work.
- No strength claim unless S2 quick gate passes.
- Existing 109 tests pass.

### M5. Turn-aware search

Deliver:

- Depth measured in full turns or side changes, not blindly in primitive actions.
- Legal full-turn/PV replay.
- Deterministic node/depth controls.

Gate:

- No illegal action sequences in 1000 games.
- Reversal rate ≤30% on pathology book.
- Safe advance rate materially above rc2.
- S2 quick SPRT vs rc2 passes or, at minimum, no regression with large pathology improvement.
- Existing 109 tests pass.

### M6. Evaluation v1

Deliver:

- S5 feature set: material, communication, arsenals, terrain, combat pressure, progress, tempo/repetition.
- Feature dump in JSON for each root decision.
- Initial hand weights, not tuned yet.

Gate:

- Tactical tests: one-ply destroy, forced retreat, arsenal capture, communication restoration/cut are preferred when clearly winning.
- Reversal ≤25%; final target trend visible.
- Merge SPRT vs rc2 at development control passes.
- Existing 109 tests pass.

### M7. Classical search efficiency

Deliver:

- Iterative deepening;
- aspiration windows;
- complete TT;
- PV/hash ordering;
- killer/history heuristics;
- conservative pruning where proven safe.

Gate:

- Same-depth score equivalence on shallow exact corpus.
- ≥25% node reduction or higher completed depth at same node budget.
- S2 merge gate vs previous milestone passes or is neutral with documented speed gain.
- Existing 109 tests pass.

### M8. Quiescence and tactical stability

Deliver:

- Combat/retreat/arsenal quiescence.
- Tactical regression suite from Rules Ledger rows 37–47, 63, 67, 75–77.
- Horizon-blunder reports.

Gate:

- Tactical suite ≥99% expected choices.
- No search explosion under fixed node cap.
- S2 merge gate vs M7 passes.
- Existing 109 tests pass.

### M9. SPSA tuning

Deliver:

- Tunable parameter file;
- SPSA runner;
- training/dev/final-holdout split;
- checkpoint archive.

Gate:

- Best tuned candidate beats untuned M8 by S2 quick gate.
- Candidate passes merge gate against M8 before promotion.
- Pathology metrics do not regress.
- Existing 109 tests pass.

### M10. Browser/Node parity and packaging

Deliver:

- Same engine options in browser and Node.
- Deterministic action selection by seed/control.
- PV rendered in S1 move notation, fixing the unreadable principal-line problem noted in CERT F4.

Gate:

- 1000 random positions: Node and browser choose same action at fixed node/depth control.
- Browser hard cap respected.
- Existing 109 tests pass.

### M11. Final acceptance

Deliver:

- Release candidate engine.
- Frozen final control.
- Frozen final opening holdout.
- Complete S2 statistical report.

Final gate:

1. Existing 109 tests: zero regressions.
2. S1 replay corpus: zero parse/replay/eval/key regressions.
3. Pathology:
   - reversal ≤15% on final pathology book;
   - safe advance materially above rc2;
   - legal attack/arsenal opportunities not systematically missed.
4. Statistical superiority:
   - B = release candidate;
   - A = shipped rc2 engine;
   - paired SPRT, α=β=0.05, H0 `B≤A`, H1 `B≥A+75 Elo`;
   - cap 500 pairs / 1000 games;
   - if no SPRT crossing, require 95% paired CI lower bound >0 Elo.
5. No human playtesting required or accepted as a gate.

---

S8. RISKS & ANTI-PATTERNS.

| Risk / anti-pattern | Why it is likely here | Guardrail |
|---|---|---|
| Optimizing before harness exists | CERT shows automated play revealed D4/D5; manual impressions would miss or normalize cycles. | No engine merge without S2 record and S1 replay. |
| Treating one primitive move as one strategic ply | `legalActions` emits sub-turn actions, but Rules Ledger row 31 defines up to five moves plus attack. | Turn-aware search milestone before serious strength work. |
| Believing TT/move ordering fixes bad play | WIP can improve speed but not evaluation blindness or action-depth pathology. | WIP must pass equivalence/speed/A-B gates and is not the D4/D5 fix. |
| Unsound transposition keys | `positionKey` currently omits suspected rule-affecting fields such as `retreatedThisTurn` and possibly neutralized arsenals. | Key-completeness fuzz test: same key must imply same legal/eval behavior. |
| Correlated self-play openings | Thousands of games from one scenario can produce false confidence. | Paired openings, cluster caps, disjoint train/dev/final pools. |
| Overfitting to rc2’s passivity | rc2 never advances per CERT D5; beating it may reward shallow anti-shuffle tricks. | Tune against diverse self-play and holdout scenarios; final rc2 gate is necessary but not sufficient. |
| Human “looks stronger” testing | Operator explicitly wants no manual gates; scoping memo emphasizes auditable engine assistance. | Every milestone has S1/S2 automated gates; human play cannot pass or fail engine quality. |
| Rules drift disguised as engine improvement | Changing communication, combat, retreat, or arsenal rules could make search easier but violates Rules Ledger. | Engine calls real `movement.js`, `combat.js`, `comms.js`, `turn.js`; existing 109 tests must stay green. |
| Generic chess heuristics applied blindly | LoA tactics are communication cuts, deterministic summed attacks, forced retreats, arsenals, and relay networks. | Every eval/search feature must map to Rules Ledger rows and S5 feature table. |
| Null-move pruning abuse | LoA has a real `E` action and zugzwang-like communication states; passing/moving fewer units is legal. | Use real end-turn search; null-move only as separately gated experiment, default off. |
| Mobility swamp | Current engine may reward harmless lateral moves; CERT D4 shows shuffling. | Cap mobility, score safe/progressive mobility, penalize exact reversals/non-progress moves. |
| Quiescence explosion | Tactical continuations can become full-width turn search on a 25×20 board. | Quiescence only for forced retreats, arsenal captures, destroying/retreat attacks, and narrow defensive replies. |
| Tuning too many parameters too early | SPSA can find noise if search is unstable. | Tune only after M8 tactical/search correctness; start with 20–40 bounded weights. |
| Mixing training and final tests | Cheap self-play encourages repeated reuse of the same book. | Hard split opening pools; final holdout untouched until M11. |
| Browser/Node divergence | Engine ships in browser but training runs in Node. | Deterministic parity test at fixed control before final. |
| Time-control noise | `engine.js` exposes time budgets but uses node quota; browsers vary. | Strength gates use fixed node/depth; wall-clock only as hard guard. |
| Incomplete result records | Without replayable records, regressions cannot be diagnosed. | Every game emits JSON plus canonical `LOAGR1`. |
| Overclaiming “Stockfish-like” | Scoping memo forbids fake chess-engine claims. | Describe as classical local engine; publish depth/node/control and statistical results only. |
| Neural-network creep | User anti-goal: no NN training pipeline, no budget. | Only scalar SPSA/tuning; no model training artifacts. |
| Cloud dependency creep | User anti-goal: no cloud API calls at play time; scoping memo forbids server dependency. | Cloud may only run offline self-play shards; shipped engine remains local/in-browser. |
| Letting UI bugs contaminate engine tests | CERT B1/D3 are UI interaction defects; engine must be judged through rule APIs. | S2 uses `legalActions`/`applyAction` directly; UI is parity-tested separately. |
| Accepting drawish non-play as “not losing” | rc2 shuffled for 220 turns with no attacks. | Draw adjudication plus advance/attack/reversal pathology metrics; strength gate alone is not enough. |
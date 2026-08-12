# SCOPING MEMO — Neutral Working Title: **Lines of Advance**

Small browser game digitizing the **mechanics** of Debord’s grid operational game, presented as a sleek modern chess program: fast, austere, auditable, and engine-assisted. This is not a museum object, not a manifesto, and not a wargame-hobby nostalgia piece.

Build target: **single-file HTML preferred**, playable via `file://`, code-drawn/CSS visuals only, no image assets. Builder: autonomous CLI coding agent **kimi K3**, working milestone-by-milestone inside a bounded harness.

---

## 1. v1 SCOPE — Minimal Faithful Game

### v1 product definition

v1 is the **base game only**: a faithful implementation of the verified printed rules, streamlined only through setup presets and UI clarity.

v1 includes:

- 25x20 rectangular board.
- Two symmetric armies.
- Unit classes: infantry, cavalry, artillery, arsenals, relays.
- Movement according to the verified source rules.
- Lines-of-communication system:
  - Units must trace communication from an arsenal, possibly through relays.
  - Cut communications disable units.
  - Exact tracing geometry, blockage, timing, and disable effects: **VERIFY-AT-BUILD**.
- Deterministic summed attack/defense combat in range.
  - Exact combat values, ranges, target rules, resolution timing, and post-combat effects: **VERIFY-AT-BUILD**.
- Victory/end conditions from the verified source.
  - Exact victory rule: **VERIFY-AT-BUILD**.
- Hotseat play.
- MVP engine opponent once rules core is stable.
- Analysis affordances: legal-move surfacing, communication audit, move log, engine evaluation/hints.

### Implementation order: hotseat first, not engine-first

Decision: **hotseat-first implementation**.

Reason: the engine is only meaningful if the move generator, communications rules, combat resolution, and victory detection are correct. Engine work begins after the rules core can run a complete legal hotseat game.

v1 release target should include an **MVP real engine opponent**, but if engine work slips, the project may have an internal hotseat milestone before public v1. Public positioning must not imply chess-engine strength.

### What “faithful” requires

The memo is not the rules source. The build must not invent missing rule details.

Before any rules claim ships, perform a named verification step:

**Rules Verification Gate / RVG**

A human operator must provide or approve a printed-rules source. The builder then creates an internal rules ledger mapping every implemented rule to that source. The ledger must cover:

- Board dimensions and coordinate orientation.
- Unit roster, counts, names, values, and initial deployments.
- Movement by unit type.
- Communication tracing rules.
- Relay and arsenal behavior.
- Disabled-unit effects.
- Combat range and resolution.
- Victory/end conditions.
- Any timing/order-of-operations rules.
- Any examples, diagrams, or edge cases in the source.

Acceptance condition: no player-facing rule text, tutorial text, combat log phrasing, or engine assumption is considered v1 until the RVG is signed off.

### IP and presentation boundary inside v1

Binding:

- Do not use the original title as product title or marketing hook.
- Do not reproduce original rules prose.
- Do not reproduce original board art.
- Do not use scans, image assets, or historical facsimile styling.
- Use original UI text.
- Attribution, if used, appears only in documentation as neutral “inspired by Debord” language.
- No player-facing overclaim such as “official,” “definitive,” “complete,” or “authentic” unless legally and factually cleared.

---

## 2. MILESTONE PLAN FOR THE GAUNTLET

Each milestone is a bounded kimi K3 task. The operator should be able to open the delivered file locally and perform the acceptance check without reading code.

### M1 — Source, Rules Ledger, and IP Boundary

**Goal:** Establish the verified rules source, rule ledger, unknowns list, and no-copy IP checklist before gameplay implementation.

**Acceptance check:** Operator can open a short rules ledger showing every required mechanic as either “verified” or **VERIFY-AT-BUILD**, with no copied prose/art and no player-facing Debord branding.

---

### M2 — Board, State Model, and Visual Chassis

**Goal:** Deliver the 25x20 board, two sides, verified unit roster placeholders, coordinate system, selection, reset, save/load, and clean visual style.

**Acceptance check:** Operator opens one local HTML file, sees a crisp 25x20 board, can select pieces, reset to a verified preset or temporary test preset, and confirm no image assets are used.

---

### M3 — Legal Movement + Communications Audit

**Goal:** Implement verified legal movement and the communications network, including disabled-unit state and visual tracing.

**Acceptance check:** Operator selects a unit and sees legal destinations only. Operator can create or load a test position where a communication line is intact, then cut it and see affected units marked disabled with an audit explaining why.

---

### M4 — Combat, Victory, and Complete Hotseat

**Goal:** Implement deterministic summed combat, turn flow, capture/removal effects, victory/end detection, move log, undo/restart, and rules audit logs.

**Acceptance check:** Operator can play a complete hotseat game or scripted mini-scenario to legal conclusion. A combat example shows all contributing attack/defense values and the final deterministic result.

---

### M5 — MVP Engine and Analysis Tools

**Goal:** Add a real minimax/alpha-beta opponent with legal move generation, material/comms-aware evaluation, shallow search, eval bar, and optional hints.

**Acceptance check:** Operator starts a human-vs-engine game. Engine moves are legal, arrive within the stated browser budget, and the evaluation visibly changes when a relay or arsenal communication route is cut.

---

### M6 — Polish, Packaging, Register Gate, and v1 Release Candidate

**Goal:** Package as a single-file local browser deliverable, complete UI polish pass, register/prose review, no-overclaim review, and dormant variant hooks.

**Acceptance check:** Operator opens the final file via `file://`, plays hotseat and engine games, reads original concise help text, sees no copied art/prose/name-trading, and confirms variants are unavailable unless explicitly enabled in a post-v1 build.

---

## 3. ENGINE PLAN

### Engine principle

This is not Stockfish and must never be represented as Stockfish-class. It is a real game-specific engine:

- Legal move generator.
- Position evaluator.
- Minimax/negamax search.
- Alpha-beta pruning.
- Optional iterative deepening.
- Engine UI styled like a chess program: eval bar, candidate moves, depth/time display, hint button, analysis mode.

### MVP tier

MVP engine target:

- Searches only legal moves from the verified rule core.
- Uses deterministic combat resolver from v1.
- Evaluates:
  - Material balance using verified unit values or provisional tuned values if no explicit values exist.
  - Communication status: connected vs disabled units.
  - Arsenal safety.
  - Relay network health.
  - Mobility: number/quality of legal moves.
  - Attack pressure: units attacking or defending important targets.
  - Victory proximity according to verified conditions.
- Shallow depth: likely 1–3 plies depending on branching.
- Simple move ordering:
  - Winning combats first.
  - Communication-cutting moves high.
  - Arsenal/relay threats high.
  - Mobility-improving moves next.
- Optional transposition cache if it materially improves response time.

Acceptance standard: it need not be strong, but it must be legal, responsive, and visibly aware of communications.

### Stretch tier

Stretch after MVP:

- Iterative deepening with time controls.
- Quiescence or tactical extension around combat/contact positions.
- Better move ordering using previous principal variation.
- Transposition table.
- Evaluation tuning from self-play.
- Opening book integration.
- Analysis mode with top 2–3 candidate lines.
- Eval bar calibration so scores are stable and not misleading.
- Engine blunder/hint explanations in original, restrained prose.

### What makes communications-aware evaluation interesting

The core strategic feature is not material alone. A position with many units may be losing if the relay/arsenal network is fragile. The engine must value:

- Redundant communication paths.
- Bottleneck relays.
- Units one move away from being cut off.
- Moves that disable enemy clusters without direct combat.
- Moves that restore own communications.
- Threats against arsenals and relays as positional attacks.
- Difference between apparent force and actually communicable force.

The eval bar should therefore react sharply to communication collapse, not merely to captures.

### Browser performance budget

Target platform: modern desktop browser, local single-file HTML.

Budget:

- UI remains interactive at 60fps during human interaction.
- Engine should not block input; use a worker-like isolation if feasible inside single-file packaging.
- MVP engine move target: under 1–3 seconds on ordinary hardware.
- Hint target: under 1 second at shallow depth.
- Hard cap on search time exposed in UI.
- Memory target: comfortably under 100MB.
- If the full board creates high branching, engine must degrade gracefully by reducing depth, not freezing.

---

## 4. UI REGISTER PLAN

### Overall register

Classy, austere, modern chess-program feel.

Not hobby wargame. Not art museum. Not manifesto.

Visual language:

- Cream/black/ops-red or stark monochrome.
- Subtle grid.
- Sharp typography using system fonts or permissively licensed fonts.
- No scans, paper textures, antique maps, Situationist visual quotations, or decorative battle animation.
- The board is a calculation surface.

### Board interaction

Expected feel:

- Click-to-select and drag-to-move.
- Legal destinations appear instantly.
- Illegal moves either do nothing or give a restrained explanation.
- Last move highlight.
- Hover/selection shows unit class, side, communication status, attack/defense summary.
- Optional range overlay for selected unit.
- Smooth but minimal movement animation: functional slide or instant snap.
- Clear disabled-state styling without visual clutter.

### Move list

Move list should feel closer to lichess than to a wargame logbook:

- Compact turn-by-turn notation.
- Coordinate-based moves.
- Combat and communication events logged as auditable facts.
- Click a move to inspect position if history browsing is implemented.
- Undo/restart for casual and analysis play.
- Export/import position or move record if cheap within single-file scope.

Notation must be original. Do not copy source notation unless verified as purely functional and safe.

### Premove?

Decision: **no premove in v1**.

Reason: this is not speed chess, and communication/combat consequences can change legal state dramatically. Premove risks confusion.

Replacement: analysis affordances.

- “Try line” mode may be added later.
- Engine hint can suggest a move without queuing it.
- Opening presets provide streamlining without changing turn structure.

### Analysis panel

Panel elements:

- Eval bar, side-relative.
- Engine depth/time indicator.
- “Hint” button.
- “Analyze current position” button.
- Top candidate line in MVP; top 2–3 in stretch.
- Toggle overlays:
  - Legal moves.
  - Communication network.
  - Attack ranges.
  - Disabled units.
- Concise explanation register:
  - “Relay cut: three units disabled.”
  - “Attack total exceeds defense total.”
  - No theatrical or theoretical prose.

### Signature UI element: communications-line visualization

This is the distinctive v1 affordance.

When selecting a unit or toggling communications:

- Draw its current traced line back to an arsenal through relays, if valid.
- Show valid route in cool/neutral color.
- Show broken segment or missing link in red/ops-red.
- Mark relays participating in the route.
- Allow “why?” audit:
  - source arsenal,
  - relay chain,
  - blocking/break condition,
  - resulting enabled/disabled status.

This must be more legible than manual board inspection. It is the central modernization.

---

## 5. SETUP / STREAMLINE DESIGN

### Streamlining definition

Streamlining means reducing handling burden, not simplifying rules.

Allowed:

- Preset setup loading.
- Legal-move highlighting.
- Communication audit.
- Combat sum display.
- Opening book positions.
- Undo/replay.
- Engine hints.
- Clear logs.

Not allowed in v1:

- Shortened rules.
- Optional easier communication.
- Simplified combat.
- Freeform alternate setup unless source rules explicitly allow it.
- Random CRT combat.
- Hidden balancing edits.

### Preset system

v1 presets:

1. **Verified Historical Deployment**
   - The printed/source setup.
   - Exact coordinates and unit counts: **VERIFY-AT-BUILD**.

2. **Training Positions**
   - Small teaching positions derived from legal states or explicitly marked as drills.
   - Must not imply they are historical/source scenarios unless verified.
   - Used to teach movement, communication, relay cuts, combat, and victory.

3. **Curated Openings**
   - Stored as legal move sequences from the verified starting setup.
   - Loading an opening means replaying or jumping to a position reachable under v1 rules.
   - No altered unit values, board geometry, or setup rules.

### Opening book shape

Opening book should be modest:

- Name.
- Starting preset.
- Move sequence.
- Resulting position.
- One-line neutral note:
  - “Early relay pressure.”
  - “Central communication test.”
  - “Arsenal flank exposure.”
- Optional engine eval after v1 engine exists.

No theory-heavy labels, no grand claims about optimal play.

### Setup editor

Decision: **no public free setup editor in v1** unless the verified source includes such a mode.

A private/dev position loader can exist for testing, but player-facing v1 should present faithful presets and legal openings.

---

## 6. VARIANT GATE

### Rule

Variants come **after v1**. They must not delay or contaminate the base game.

Variant work starts only after:

- RVG passed.
- Hotseat base game complete.
- Deterministic combat verified.
- Engine MVP works on base rules.
- UI register and IP gate passed.

### First variant candidate: CRT dice-odds combat

Candidate variant:

- Replaces deterministic summed combat with a slim dice-odds Combat Results Table.
- Uses odds columns and dice resolution.
- Exact table, odds bands, and effects require a separate variant spec and playtest.
- This variant must be clearly labeled as a variant, not the base game.

The variant is not in v1.

### No engine fork

Architecture requirement at planning level:

- Shared board/state model.
- Shared legal movement.
- Shared communications.
- Shared victory detection unless a variant explicitly changes victory.
- Combat resolver is swappable:
  - Base resolver: deterministic summed attack/defense.
  - CRT resolver: stochastic table outcome.
- Engine calls the same abstract combat/evaluation interface.
- For stochastic combat, engine uses expected value, sampled outcomes, or conservative heuristics.
- Save files and logs are tagged with the active ruleset.

### Later possible variants

Possible post-v1 candidates, gated separately:

- CRT dice-odds combat.
- 1981 monochrome/CRT display skin.
- Fog-of-war/referee mode.
- Advisory evaluation/training mode expansion.
- Alternative Weiss rulesets.
- Other combat or command variants.

Any variant that changes information, randomness, communication, victory, or setup must be a separate ruleset, not a hidden option inside base v1.

---

## 7. ANTI-GOALS

This project must not become:

1. **A branded Debord product.** No trading on the original title/name in product title, marketing, metadata, screenshots, or UI.

2. **A reproduction artifact.** No copied rules prose, board art, scans, diagrams, facsimile layout, or image assets.

3. **A Situationist museum piece.** No manifesto text, gallery typography, curatorial framing, or theory quotes in the game UI.

4. **A generic hobby wargame UI.** No faux counters, parchment, hex-map conventions, Ameritrash battle art, or SPI nostalgia skin as default.

5. **A simplified adaptation.** v1 must not change the rules to make them easier. UX may clarify; mechanics remain verified.

6. **A variant-first project.** CRT, fog, skins, and Weiss variants wait until base v1 is complete and gated.

7. **A fake chess-engine claim.** No Stockfish wrapper, no “AI” theater, no pretending the engine is stronger than it is.

8. **A web-service platform.** No accounts, matchmaking, cloud saves, ratings, chat, or server dependency in v1.

9. **A cinematic game.** No explosions, decorative combat sequences, camera drama, or animation that slows calculation.

10. **An overclaimed historical edition.** Avoid “official,” “definitive,” “complete,” “authentic,” or similar unless formally cleared.

11. **A rules-lawyer black box.** Every combat, disabled status, and engine hint must be auditable.

12. **A build-system science project.** Keep the deliverable small, local, browser-native, and inspectable.

---

## 8. RISKS + KILL CRITERIA

### Major risks

#### Rules verification risk

The summary is insufficient to implement faithfully. Exact values, timing, movement, combat, and victory need printed-source confirmation.

Mitigation: RVG before serious implementation.

Kill/reshape criterion: if the printed rules source cannot be obtained or verified, the project cannot ship as a faithful v1. It may only continue as a private prototype or be rescoped as an explicitly original game.

---

#### IP boundary risk

Even with original prose and art, the project touches a recognizable game design.

Operational checklist:

- Neutral title only.
- No original title in product branding.
- “Inspired by Debord” only in documentation, if cleared.
- No original prose copied or close-paraphrased.
- No board art reproduction.
- No scans or image assets.
- Original notation and help text.
- Screenshots checked for protected material.
- Metadata/package names checked for name-trading.
- Fonts/assets license-clean.
- If public release is planned, legal review or rights-holder strategy completed.

Kill/reshape criterion: if legal review finds the project cannot be safely distributed under these constraints, public release is killed or converted into a substantially original ruleset.

---

#### Scope creep risk

The variant list is attractive and can swamp v1.

Mitigation: base rules only until M6. Variants remain dormant hooks.

Kill/reshape criterion: if CRT/fog/skinning work begins before base hotseat and engine MVP are accepted, stop variant work and reset scope.

---

#### Engine strength/performance risk

The game may have high branching due to board size and communication interactions.

Mitigation: shallow MVP engine, hard time caps, comms-aware heuristic, graceful depth reduction.

Kill/reshape criterion: if the engine cannot produce legal moves within the browser budget, public v1 is blocked until fixed. Do not ship a fake engine. A private hotseat-only build may exist, but not as the promised v1.

---

#### Communications UI legibility risk

A 25x20 board with relay paths may become visually noisy.

Mitigation: selected-unit route first, global overlay optional, audit panel textual fallback, restrained line styling.

Kill/reshape criterion: if testers cannot understand why units are enabled/disabled after a short explanation, UI design must be reworked before release. Do not simplify the rule to solve a visualization problem.

---

#### Faithfulness vs uncertainty risk

The printed source may reveal mechanics beyond the initial summary.

Mitigation: source rules win; this memo does not define exact rules.

Kill/reshape criterion: if verified rules materially exceed small-project scope, either extend milestones honestly or reduce release ambition. Do not silently omit rules while calling v1 faithful.

---

#### Register risk

The project can easily drift into art-game homage, academic framing, or wargame nostalgia.

Mitigation: register gate at M6. All player-facing prose must be short, functional, and no-overclaim.

Kill/reshape criterion: if the UI depends on Situationist framing, copied visual style, or hobbyist nostalgia to feel complete, the presentation has failed and needs redesign.

---

#### Single-file/browser constraint risk

A clean local browser build may conflict with engine isolation or performance.

Mitigation: prefer single-file HTML; if needed, use browser-supported worker techniques compatible with local play. Keep all visuals code-drawn.

Kill/reshape criterion: if single-file packaging prevents acceptable play, request operator approval for a slightly expanded local bundle. Do not add a server dependency for v1.
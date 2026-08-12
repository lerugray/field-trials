REFUTE: the contract has the right thesis, but it is **not executable enough for an autonomous overnight LLM builder**. Several parts silently require human design choices, depend on later parts, or contradict locked model decisions.

Line numbers below refer to the supplied contract excerpt; part IDs are the safer anchors.

---

## BLOCKERS

### 1. A4 depends on Part B and Part C before they exist

- **Severity:** BLOCKER  
- **Contract line/part:** A4, lines 33–36; ordering lines 141–144  
- **Finding:** A4 is in **Part A**, but requires outcomes to “persist in the event log (Part B)” and “hold on screen for a beat,” which is structurally Part C. The stated order is A → B → C/D. A builder following order must either invent a temporary log/beat system, build B/C early, or leave A incomplete.  
- **Minimal fix wording:**  
  > “A4 in Part A only adds distinct register-voiced negotiation outcome text to the existing combat/overworld note and existing combat log. The persistent `eventLog` hook is added in Part B. The framed beat treatment is added in Part C. Do not require Part B/C infrastructure for A to pass.”

---

### 2. A3 contradicts locked R5 rest economics

- **Severity:** BLOCKER  
- **Contract line/part:** A3, lines 29–32; R5, lines 152–154  
- **Finding:** A3 frames `session.rest()` as the existing full-heal path from R key + inn/shrine, and only asks for feedback/service guarantees. R5 says rest economics are locked: **overworld partial+risk / inn-shrine full for barter item / consumables mid-dungeon / starting town free until first dungeon clear**. The contract says R5 “builds into A3+F2,” but A3 does not actually instruct the builder to split `session.rest()`.  
- **Minimal fix wording:**  
  > “A3 replaces the single `session.rest()` behavior with `restAt(context)`: overworld R = partial heal + encounter risk; inn/shrine = full heal; starting-town inn/shrine are free until first dungeon clear; after that, inn/shrine require one barter item tagged `rest-offering`; dungeon healing only comes from consumables. Every path reports before→after HP/♥ and logs the event.”

---

### 3. E1/E2 fight each other on carried traversal items vs world-persistent gates

- **Severity:** BLOCKER  
- **Contract line/part:** E1–E3, lines 85–93; world-remembers ratification lines 10–13  
- **Finding:** E1 says `passable()` consults `gateAt()` before tile type. E2 says spending a traversal item consumes it and toggles persistent world state. E3 says traversal items like “waders → mud” seed into loot. This is internally unstable: if passability checks carried/equipped tags, permadeath breaks; if the item is consumed, “waders” as equipment makes no sense; if the gate is tile-type-wide, opening one mud tile may open all mud.  
- **Missing decisions:** gate schema, gate coordinates/edges, opened-state key, activation action, whether gates are per-tile/per-edge/per-region, whether traversal items are equipment or consumable world-work items.  
- **Minimal fix wording:**  
  > “Traversal gates are coordinate/edge records, not carried-key passability. Add `world.gates[id] = {x, y, requiresTag, opened:false, label}`. `passable(x,y)` returns true for a gate tile/edge only if `world.gates[id].opened`; otherwise it falls back to normal tile passability. When the player is adjacent to an unopened gate and has one item with `tags:[requiresTag]`, the action consumes that item and sets `opened=true` permanently in WORLD state. Never check carried traversal items for ordinary passability after the gate is opened.”

---

### 4. E4/E5/E6 are not buildable: all the tuning constants are missing

- **Severity:** BLOCKER  
- **Contract line/part:** E4–E6, lines 94–103  
- **Finding:** “biased,” “suppressed within N tiles,” “1–2 reachable caches,” “minimum distance,” “fewer wanderers,” “dangerous or populated areas,” and “capacity grows on WORLD milestones” all require exact constants and milestone definitions. An LLM builder will guess map radii, weights, caps, and capacity curves, likely destabilizing world-generation tests.  
- **Missing decisions:** safe radius, cache count/radius, dungeon minimum distance, encounter-table weights, wanderer caps by region type, initial roster capacity, max capacity, exact milestone list, whether site clears count, whether repeated gates count.  
- **Minimal fix wording:**  
  > “Define M12 placement constants before implementation: `START_SAFE_RADIUS = __`, `START_CACHE_COUNT = __`, `START_CACHE_RADIUS = __`, `MIN_START_DUNGEON_DISTANCE = __`, `SAFE_WANDERER_CAP = __`, `DANGEROUS_WANDERER_CAP = __`, `POPULATED_WANDERER_CAP = __`. Capacity starts at `__`, caps at `__`, and increases only on these unique WORLD milestones: `[openedGate, ladderRung, clearedBiome]`. Site clears and kills do not increase capacity unless explicitly listed.”

---

### 5. F1/F2 “real talk” and barter are underspecified as an interaction system

- **Severity:** BLOCKER  
- **Contract line/part:** F1–F2, lines 107–112  
- **Finding:** The contract asks for outcome-bearing talk, barter offers, joinables, rumors, shared want-tag vocabulary, and PULL-ranked offer widening, but does not define the player action, target selection, outcome tables, UI flow, acceptance/rejection, item selection, canonical tags, or failure cases. This is not “minimal”; it is a full social/trade interaction system unless constrained.  
- **Missing decisions:** talk key, talk range, target focus rules, citizen vs overworld NPC behavior, outcome probabilities, rumor target selection, barter accept/cancel flow, whether player chooses item or system auto-matches tags, canonical trade tags, offer pool tiers, inventory-full handling, joinable capacity handling.  
- **Minimal fix wording:**  
  > “For M12, talk uses key `T` against the single adjacent/focused being; if multiple are adjacent, cycle focus with existing movement/selection convention, otherwise log ‘no one answers’ [SEED]. Each talk resolves from a fixed table: lore / rumor / barter / joinable-if-capacity / rebuff. Barter is one offered exchange at a time: NPC wants one item whose tag is in `TRADE_TAGS`, offers one generated item from a tiered pool; player accepts with Enter or cancels with Escape. PULL rank widens only the offer pool tier, never the requested count or numeric price.”

---

### 6. G3/R3 requires a human decision during a no-human overnight run

- **Severity:** BLOCKER  
- **Contract line/part:** G3, lines 125–126; R3, lines 155–156  
- **Finding:** G3 says build both dither-density renders and surface both to Ray; R3 says Ray decides and “do not self-select.” But the builder has no human in the loop overnight. Part G cannot be completed as written.  
- **Minimal fix wording:**  
  > “G3 overnight deliverable is only: generate the side-by-side comparison surface and dated screenshot; do not change the production/default terrain render. Mark the density choice as pending Ray review. Part G is passable without selecting a winner.”

---

### 7. The “stop between parts, never mid-part” rule is unsafe because parts are not atomic

- **Severity:** BLOCKER  
- **Contract line/part:** Ordering & gates, lines 141–144  
- **Finding:** Part A includes five unrelated fixes, including audio, town generation, combat feedback, and text wrapping. Part E includes a terrain-gate progression system, opening pacing, density, and world milestone leveling. Part F includes talk + barter + art differentiation. “Stop between parts” forces oversized increments and increases regression risk.  
- **Minimal fix wording:**  
  > “Stop boundaries are per numbered increment, not per lettered part. Each A1, A2, A3… is independently checkpointed with its own test and rebuild. The builder may stop after any numbered increment with the suite green.”

---

## SHOULD-FIXES

### 8. A1 “continuous coverage” needs exact FP visibility semantics

- **Severity:** SHOULD-FIX  
- **Contract line/part:** A1, lines 20–24  
- **Finding:** “Continuous coverage of the forward cells” leaves the range and blocking rules ambiguous. Does it mean 1–5 tiles? 1–10? Until wall? Same segment only? Also “visibility must never depend on prior combat/flee flags” could accidentally render killed/recruited/despawned enemies.  
- **Minimal fix wording:**  
  > “`enemyAhead()` samples every forward tile from distance 1 through 10, stopping at the first blocking wall/door according to existing dungeon collision. It returns the nearest living hostile/recruitable enemy occupying those cells. It must ignore stale approach/flee flags but must not render defeated, recruited, or removed enemies.”

---

### 9. A2 audio seam requirement is too large and too absolute

- **Severity:** SHOULD-FIX  
- **Contract line/part:** A2, lines 25–28  
- **Finding:** “Make ANY reasonable cut loop clean” plus “equal-power crossfade” can imply a Web Audio buffer scheduler / dual-source crossfade, which is large for a single-file browser game and risky for tests/autoplay policies.  
- **Minimal fix wording:**  
  > “Implement the smallest robust seam mitigation compatible with the current audio path: set `loopStart`/`loopEnd` insets when supported and add a short gain ramp at start/resume/loop boundary where the current engine exposes gain control. Do not rewrite the audio engine unless necessary. Acceptance: no audible click on the current sidecar and no console/autoplay regressions.”

---

### 10. B1 promises deterministic replay without defining RNG capture

- **Severity:** SHOULD-FIX  
- **Contract line/part:** B1, lines 43–46  
- **Finding:** “Seed used for that roll” may not exist at every side-effect site. A log entry alone is not “sufficient to replay deterministically” unless it records RNG stream position, inputs, location, actor IDs, and version. Also `logEvent()` must not itself consume RNG.  
- **Minimal fix wording:**  
  > “`logEvent()` is diagnostic, not a full replay system. Each entry records: `tick`, `mode`, `worldSeed`, `runSeed/sessionSeed`, `rngDrawIndexBefore` if available, player position, relevant actor/site/item IDs, `kind`, and resolved prose/outcome. `logEvent()` must never call seeded randomness.”

---

### 11. B1 misses future side-effect sites introduced later in the same contract

- **Severity:** SHOULD-FIX  
- **Contract line/part:** B1, lines 43–46; F1, E2, H2  
- **Finding:** B1 lists current side-effect sites but later parts add gates, barter, new talk outcomes, capacity milestones, status ticks, and lineage. If B is built early and not revisited, the event log will be incomplete.  
- **Minimal fix wording:**  
  > “Every new M12 side effect added after Part B must call `logEvent`: gate unlocks, traversal-item consumption, capacity changes, barter accept/reject, talk outcomes, rest costs, status application/expiration/tick damage, follower dismiss/join/loss, and lineage append.”

---

### 12. B2/B3 need exact keybindings and overlay behavior

- **Severity:** SHOULD-FIX  
- **Contract line/part:** B2–B3, lines 47–50  
- **Finding:** `[L]` is specified, but dump hotkey is not. Scroll behavior, close behavior, and browser-reserved shortcuts are unspecified.  
- **Minimal fix wording:**  
  > “`L` toggles the record overlay. Arrow/Page keys scroll it. Escape closes it. `Shift+L` downloads the JSON dump. Do not use `Ctrl+L` or browser-reserved shortcuts.”

---

### 13. B2 register risk: event log can become a debug console

- **Severity:** SHOULD-FIX  
- **Contract line/part:** B2, lines 47–48  
- **Finding:** A visible overlay with tick/mode/seed/kind risks reading as generic debug UI, violating the identity gate.  
- **Minimal fix wording:**  
  > “The player-facing `[L]` overlay is titled and framed as ‘the record’ and shows register prose summaries. Raw fields such as seed, tick, mode, and JSON structure appear only in the dump file or an explicitly marked diagnostic fold.”

---

### 14. C1/C2 “held a beat” is underspecified

- **Severity:** SHOULD-FIX  
- **Contract line/part:** C1–C2, lines 54–57  
- **Finding:** “Held a beat” could mean timer, input-gated modal, queued mode, or animation. Tests become flaky if wall-clock timing is used. Multiple kills/recruits are also unspecified.  
- **Minimal fix wording:**  
  > “Beat screens are input-gated, not timer-gated: enter `mode:'beat'` with `{returnMode, lines}`; dismiss with Space/Enter/click/Escape. If several kills happen in one resolution, show one summarized kill beat. Join beat occurs after combat resolution before returning to overworld.”

---

### 15. C3 lineage depends on future E/D systems but is ordered before them

- **Severity:** SHOULD-FIX  
- **Contract line/part:** C3, lines 58–62; ordering lines 141–142  
- **Finding:** C3 asks for deeds including gates opened, sites cleared, followers lost. Gates do not exist until E; richer follower surfaces arrive in D; loss semantics are not specified.  
- **Minimal fix wording:**  
  > “C3 adds `world.lineage[]` now with optional fields. On death, append before reroll: `{name, daysSurvived, killer, sitesCleared, followersLost, gatesOpened:[], biomesCleared:[], ladderRungs:[]}`. Later E fills gate/biome fields. Death clears the mortal roster; lineage only records them.”

---

### 16. C4 conflicts with R4 unless “thresholds” are qualitative

- **Severity:** SHOULD-FIX  
- **Contract line/part:** C4, lines 63–65; R4, line 151  
- **Finding:** C4 says the panel names “rank thresholds.” R4 locks NERVE % → qualitative wording. A builder may expose numeric percentages or thresholds.  
- **Minimal fix wording:**  
  > “The chargen/help explainer names verb-gates and rank bands qualitatively only. Do not show percent chances, numeric thresholds, or formulae. Use rank words already present in the game/register.”

---

### 17. D1/D3 depend on statuses and wants before H/F land

- **Severity:** SHOULD-FIX  
- **Contract line/part:** D1–D3, lines 69–77  
- **Finding:** D1 says follower rows include statuses “once Part H lands”; D3 says party management shows wants, while F2 later changes want vocabulary. If D is built first, the builder must guess absent fields and later refactor.  
- **Minimal fix wording:**  
  > “D surfaces must tolerate missing future data. Before H, statuses render as absent/blank. Before F2, wants display the existing `want` string read-only. H/F later only populate these fields; they must not require D layout rewrites.”

---

### 18. D1 “capped/scrollable past 2–3” leaves the HUD layout undecided

- **Severity:** SHOULD-FIX  
- **Contract line/part:** D1, lines 69–71  
- **Finding:** A sidebar HUD with scrolling rows is a UI/layout decision. “2–3” is not a spec.  
- **Minimal fix wording:**  
  > “HUD shows at most 3 follower rows. If more exist, show `+N more at your back`; the full scrollable list lives only in the party-management surface.”

---

### 19. D2 leaves portrait implementation as an open design choice

- **Severity:** SHOULD-FIX  
- **Contract line/part:** D2, lines 72–74  
- **Finding:** “Small bust tiles or a portrait strip” asks the builder to choose layout/art direction.  
- **Minimal fix wording:**  
  > “Use a horizontal portrait strip beside/below the PC bust: max 3 follower mini-busts at fixed size; overflow is `+N`. Do not invent a second portrait layout.”

---

### 20. D3 party-management surface lacks keybinding and mode rules

- **Severity:** SHOULD-FIX  
- **Contract line/part:** D3, lines 75–77  
- **Finding:** The contract says expose party management but not where it lives, what key opens it, whether it works in combat/town/dungeon, or how dismiss confirmation works.  
- **Minimal fix wording:**  
  > “`P` opens the party surface outside combat. It lists followers with portrait, HP/♥, current statuses/want text, and a dismiss action. Dismiss requires confirmation and logs the event. In combat, `P` is disabled with an in-register note.”

---

### 21. D5 legend placement is ambiguous

- **Severity:** SHOULD-FIX  
- **Contract line/part:** D5, lines 79–81  
- **Finding:** “Move/add it to the WORLD MAP screen” and “keep FP access if free” leaves possible duplication or inconsistent controls.  
- **Minimal fix wording:**  
  > “World-map mode always shows or toggles the terrain legend using the existing legend component. FP keeps the existing legend only if this is a direct reuse with no separate code path.”

---

### 22. E3 traversal item examples fight E2 consumption

- **Severity:** SHOULD-FIX  
- **Contract line/part:** E2–E3, lines 88–93  
- **Finding:** “Waders → mud” sounds like wearable equipment, but E2 says the traversal item is consumed to create world state. That creates a register/mechanics mismatch.  
- **Minimal fix wording:**  
  > “First traversal unlock item is a consumable world-work item, not wearable gear: e.g. `fen-planks` or `ford-kit`, `tags:['mud']`. Spending it marks/builds the crossing permanently. Do not implement equippable carried-key traversal in M12.”

---

### 23. E3 does not specify first gates/items/loot placement

- **Severity:** SHOULD-FIX  
- **Contract line/part:** E3, lines 91–93  
- **Finding:** “Seeded into loot tables of adjacent biomes” leaves the builder to choose which tables, weights, counts, and guarantee logic.  
- **Minimal fix wording:**  
  > “M12 implements exactly one first terrain gate: FEN_MUD. Add exactly one traversal tag: `mud`. Guarantee one `mud` traversal item in a reachable pre-gate cache and allow additional copies only in named adjacent-biome loot tables at explicit weights.”

---

### 24. E6 “biomes cleared” is not an existing defined milestone

- **Severity:** SHOULD-FIX  
- **Contract line/part:** E6, lines 100–103  
- **Finding:** Gates opened and sites cleared have obvious persistence patterns; “biomes cleared” may not exist as a system. The builder may invent biome-clear rules.  
- **Minimal fix wording:**  
  > “For M12 capacity leveling, use only currently defined/persistable milestones unless a biome-clear schema is explicitly added. If `clearedBiome` is not already implemented, exclude it from the capacity formula for this increment.”

---

### 25. F2 needs a canonical tag vocabulary

- **Severity:** SHOULD-FIX  
- **Contract line/part:** F2, lines 110–112  
- **Finding:** “Item tags,” beings’ `want`, follower upkeep, and trade all sharing vocabulary is good, but no canonical mapping is given. Existing wants like food/secrets/blood/attention may not match item tags cleanly.  
- **Minimal fix wording:**  
  > “Add `TRADE_TAGS` as a documented canonical list. Map existing being wants to these tags explicitly. Unknown wants remain prose-only and do not participate in barter until mapped.”

---

### 26. F2 “PULL widens offer pool” needs exact tiers

- **Severity:** SHOULD-FIX  
- **Contract line/part:** F2, lines 110–112  
- **Finding:** “Widens the offer pool” is directionally clear but not executable.  
- **Minimal fix wording:**  
  > “Define offer pools by qualitative PULL rank: low = common pool only; middle = common + uncommon; high = common + uncommon + rare/odd. Requested item count remains exactly one. No discounts, prices, percentages, or numeric modifiers.”

---

### 27. F3 town differentiation should be constrained to visual-only changes

- **Severity:** SHOULD-FIX  
- **Contract line/part:** F3, lines 113–116  
- **Finding:** “Archetype-keyed wall/street dither pattern, per-service door glyphs, header silhouettes” is plausible, but it can accidentally alter city layout, service placement, or hit-testing.  
- **Minimal fix wording:**  
  > “F3 is render-only. Do not change `assembleCity()` layout, service probability, building coordinates, collision, or interaction logic. Only branch tile glyph/dither/header art on existing archetype/service fields.”

---

### 28. H1/H2 status schema lacks turn, stacking, expiration, and display rules

- **Severity:** SHOULD-FIX  
- **Contract line/part:** H1–H2, lines 132–135  
- **Finding:** `statuses[] = {id, polarity, duration, effect}` is not enough. The builder must guess when duration decrements, whether statuses stack, whether duplicate applications refresh, how death clears them, and how they render in HUD/combat/log.  
- **Minimal fix wording:**  
  > “Status rules: durations decrement at the affected combatant’s turn start unless stated otherwise; duplicate status application refreshes duration, does not stack; all statuses clear on combat end unless marked persistent; death clears statuses; application, expiration, and tick effects call `logEvent`; HUD/combat rows display short in-register labels.”

---

### 29. H2 “first five” statuses need exact mechanical mappings

- **Severity:** SHOULD-FIX  
- **Contract line/part:** H2, lines 134–135  
- **Finding:** The audit describes mappings, but the contract only lists names. An autonomous builder may implement generic RPG buffs/debuffs.  
- **Minimal fix wording:**  
  > “Implement exactly: WARDED = existing shield effect over duration; MARKED = preferred target for pack/focus targeting; SHAKEN = disables dodge/avoid flavor and falls back to soak; BOUND = reuses `skipNext`; BLEEDING = damage tick at turn start using existing damage path. No new damage/stat-scaling mechanics.”

---

### 30. H3 combat targeting change risks destabilizing combat tests

- **Severity:** SHOULD-FIX  
- **Contract line/part:** H3, lines 136–137  
- **Finding:** Replacing uniform target selection with a weight table changes deterministic combat outcomes unless defaults preserve current behavior.  
- **Minimal fix wording:**  
  > “If `combat.json` lacks targeting weights, behavior is exactly current uniform selection for steady/caster and current weakest/focus behavior for aggressive/pack. Add tests proving default output is unchanged before enabling tuned weights.”

---

### 31. R4 is ratified but not assigned to any build part

- **Severity:** SHOULD-FIX  
- **Contract line/part:** R4, line 151  
- **Finding:** “NERVE % → qualitative wording” is locked, but no part says where to change it except vague “build it.” An LLM builder may miss it.  
- **Minimal fix wording:**  
  > “Add explicit increment C5 or A6: replace player-facing NERVE percentage/chance displays with qualitative rank wording everywhere they appear; add regression test that no `%` appears in NERVE-facing UI.”

---

### 32. Save compatibility is not addressed for new world fields

- **Severity:** SHOULD-FIX  
- **Contract line/part:** B3, C3, E2, E6; lines 49–50, 58–62, 88–90, 100–103  
- **Finding:** Event log, lineage, gates, and capacity milestones all add save data. There is no migration/defaulting instruction. This can break old saves and tests.  
- **Minimal fix wording:**  
  > “All new save fields must be optional with migration defaults: `eventLog=[]`, `world.lineage=[]`, `world.gates={}`, `world.milestones={}`, `rosterCapacity=currentDefault`. Loading an old save must not throw.”

---

## REGISTER RISKS

### 33. Party/HUD surfaces risk generic RPG UI

- **Severity:** SHOULD-FIX  
- **Contract line/part:** D1–D3, lines 69–77  
- **Finding:** “HP, statuses, wants, dismiss” can easily become a generic party screen.  
- **Minimal fix wording:**  
  > “Use existing panel language: ‘the stranger,’ ‘at your back,’ ‘wants,’ ‘wounds/♥’; no XP, level, DPS, price, buff icon grid, or generic RPG tab labels.”

---

### 34. Barter wording risks currency/shop genericness

- **Severity:** SHOULD-FIX  
- **Contract line/part:** F2, lines 110–112  
- **Finding:** Even with no currency, “offer pool,” “shops,” “discounts,” and “price” can lead to generic buy/sell UI.  
- **Minimal fix wording:**  
  > “Player-facing barter UI must use ask/offer/prose framing, not buy/sell/price/discount/storefront language. Raw tags are internal unless surfaced through register prose.”

---

### 35. Status names should be internal IDs, not necessarily raw UI labels

- **Severity:** NOTE  
- **Contract line/part:** H2, lines 134–135  
- **Finding:** WARDED/MARKED/SHAKEN/BOUND/BLEEDING are mostly register-safe, but all-caps status-chip presentation can read generic videogame.  
- **Minimal fix wording:**  
  > “Internal IDs may be uppercase; player-facing labels use register prose or short lowercase phrases: ‘warded,’ ‘marked,’ ‘shaken,’ ‘bound,’ ‘bleeding.’”

---

## SCOPE TRAPS FOR A SINGLE-FILE BROWSER GAME / 363-TEST SUITE

### 36. Full M12 is too large for one autonomous overnight pass

- **Severity:** BLOCKER  
- **Contract line/part:** Entire contract; especially E/F/H  
- **Finding:** This milestone includes correctness fixes, audio engine work, persistent event logging, lineage, new HUD surfaces, portrait strips, party management, terrain gates, world-persistent unlocks, placement retuning, capacity leveling, talk actions, barter economy, town art differentiation, terrain rendering trials, and statuses. That is not one safe overnight build unless aggressively checkpointed.  
- **Minimal fix wording:**  
  > “Tonight’s executable scope is A1–A5 + B1–B3 only, or explicitly A through D only. E–H are design-ready but not overnight-executable until their missing constants/schemas/UI flows are filled. The builder must stop after any numbered increment that turns the suite red for more than one repair attempt.”

---

### 37. Passability changes are high-risk global changes

- **Severity:** SHOULD-FIX  
- **Contract line/part:** E1–E2, lines 85–90  
- **Finding:** `passable()` likely underpins overworld movement, pathing, encounter placement, site reachability, and tests. Changing it before defining gates precisely can break many systems.  
- **Minimal fix wording:**  
  > “Gate logic must be additive and coordinate-scoped. Existing tile-type passability remains unchanged for all non-gate coordinates. Add regression tests proving pre-M12 passability is identical outside declared gate cells/edges.”

---

### 38. Statuses are cross-cutting, not S

- **Severity:** SHOULD-FIX  
- **Contract line/part:** H1–H3, lines 132–137  
- **Finding:** Statuses touch item normalization, loot tables, combat turn order, AI targeting, prose, HUD, save/logging, and tests. This is not an isolated small feature.  
- **Minimal fix wording:**  
  > “H is optional if time remains. If built, implement only one status end-to-end first, with tests, then add the remaining four as data-only extensions of the same path.”

---

## Verdict

**No.** This contract is **not safe to hand to the builder tonight after only the SHOULD-FIXes**. It has multiple **BLOCKERS**: ordering contradictions, locked rest-economy contradiction, unresolved world-gate schema, open Ray-dependent G3 decision, and oversized/non-atomic scope.

After the BLOCKER fixes, it could be safe **only if the overnight scope is reduced to atomic numbered increments**, preferably A+B or A–D.
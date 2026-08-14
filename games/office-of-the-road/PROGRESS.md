# PROGRESS

## 2026-08-13 — RELEASE GATE RUN + post-ship ledger (QA blemishes)

9-step gate run by the shipping session: docs/verification/release-gate-2026-08-13/RECORD.md.
Steps 1-7 green (two defect classes found IN-gate and fixed: em-dashes 6250d22, combat
polish a676642). QA verdict SHIP; its one claimed blocker adjudicated false positive.
**HELD post-ship rows (non-blocking, disclosed):** (1) REST-waste blemish; (2) victory-
draft focus desync (focusId lags card highlight); (3) HOLD button ignores Enter (H key
works); (4) Space-as-confirm inconsistent across screens. Re-pickup trigger: first
post-release fix round, or any player report touching these.

## 2026-08-13 — SCORE RATIFIED (operator ear)

Ray on V3.1: "Much better on the OOR soundtrack, passes my approval now." The score is
CLOSED at V3.1 (967979d): 5 contexts, ~10% tempo notch from V3, arrangements from V3.
The V3.1 lane's open lean (note gates unscaled) is subsumed — the approved render carries it.
Remaining path to public: the 9-step release gate (queued post-reset), nothing musical.

## DRAFT — 2026-08-10 — OOR fix round 1 (audit findings 2 and 3 only)

- **Checkpoint 1 — audit + baseline.** Read the completeness audit and the
  DESIGN-SEED exact-resume/acceptance clauses. Confirmed the reported v4 gaps in
  `src/save.js`, `src/main.js`, and `src/soak.js`. Baseline `node --test` is
  **145/145 green**. Scope remains limited to persistence/run closure and the M9
  soak; art, mandates, orientation, intervention accuracy, and other audit findings
  are intentionally untouched.
- **Implementation direction.** Bump the open-run envelope version; include a
  stable run id, exact live screen/UI state, resolver graph, hand/draft, incident
  ledger, and no-progress tracker. Terminal paths will share an idempotent closure
  transaction whose receipt is kept in the permanent meta ledger and whose run-save
  record is non-resumable. The soak will use a real document reload, per-expedition
  verb ledgers, post-input mutation checks, normal combat ticking, whole-session
  watch/act timing, and BLOCKER severity for either metric floor.
- **Checkpoint 2 — persistence + closure implemented.** `src/save.js` now writes
  v5 OPEN/CLOSED records, invalidates the known v4 key, serializes the whole live
  surface, and explicitly rewires combat's party/enemy/initiative reference graph
  on restore. `src/meta.js` retains closed-run receipts; `src/run.js` performs the
  receipt-first idempotent close transaction; every terminal path in `src/main.js`
  uses it. Quit now saves from every nonterminal screen, draft offers autosave, and
  resume restores the saved screen/ledger/progress/UI instead of forcing march.
  New path tests cover byte-exact mid-combat, deterministic combat continuation,
  pending draft, wipe, early return, successful close semantics, v4 invalidation,
  and the interrupted-write/stale-OPEN case. Targeted persistence tests are green.
- **Checkpoint 3 — honest soak implemented.** `src/soak.js` now keeps a separate
  verb ledger for the expedition, credits required verbs only after observing the
  relevant state mutation, reloads the actual document and compares the resumed
  live snapshot byte-for-byte, lets normal rAF/tickCombat advance fights, measures
  passive/active time on every screen, and makes either metric-floor breach a
  BLOCKER. `scripts/soak.mjs` requires evidence of at least one document reload.
  Unit integrity tests are green. This sandbox has no Chrome/Chromium binary, so
  `scripts/soak.mjs` used its fresh-module-boot fallback: it destroyed and rebuilt
  the real `main.js` window against shared storage, exercised `beforeunload`, reread
  the v5 file, and resumed through the returned docket. Seed 1 passed **6/6**, with
  **1 reload, 0 blockers, 0 defects**, 4.5s longest passive stretch, and 71.5
  interventions/minute. A temporary `--break-verb shopTxn` fault swallowed shop
  activation; the same soak exited 1 with **5/6**, one DEFECT and one BLOCKER, then
  the normal invocation passed again. A Chrome screenshot was not produced because
  no browser binary is installed.
- **Checkpoint 4 — final validation.** `node --test` is **157/157 green** (baseline
  145/145; +12 focused tests). `node scripts/gates.mjs` reports all M2/M4/M6/M7
  gates GREEN. `node scripts/soak.mjs --seed 1` passes through the fresh-boot
  fallback. `git diff --check` is clean.

## 2026-08-09 — Founded (orchestrator)

Repo founded. DESIGN-SEED.md (with five-role studio edge-sweep folded in), CLAUDE.md hard
rules, register corpus (design/register/ — PD texts + REGISTER-SEED with 33 verified
exemplars), full art-pack set staged in materials/art-packs/ (Willibab collection +
Sideview Battlers + Pixel Tarot, licenses noted), CHP band kit ported to src/band.js
(prng.js dependency to port with it at M1), night-run harness adapted.

## 2026-08-09 — M0 COMPLETE (Study + manifest)

M0's full stated scope is authored. No game code (per milestone). Deliverables:

- **`design/study/M0-STUDY.md`** — clean-room study. FF3 job system characterized
  empirically (shared party, tiered fixed-kit jobs, cheap swapping as the central verb, a
  soft transition tax on churn, per-job proficiency); FFT progression depth (per-job learned
  abilities, bounded cross-equips, prereq-gated unlocks); KOPAP automation frame (mediated/
  generated adventuring, encounters as work units, reject low-agency slots); StS deck-agency
  model + the full INTERVENTION CONTRACT stated now (visible tick, persistent hand with
  per-card window state, pause-first, 3-card draft, camp-only removal, zero-card routine law).
  Synthesis: two orthogonal build axes (deck-neutral fixed-kit jobs + run-scoped thin deck)
  over one automated loop. Section 6 commits the baseline curves M2–M5 tune against.
- **`materials/ASSET-MANIFEST.md`** — every licensed sheet inventoried (dims read from PNG
  IHDR, not estimated): grid stated [confirmed] where cleanly divisible, [confirm at
  integration] otherwise. Canonical-scale rule (ship 1×/native, scale in-engine). Licence +
  attribution per sheet. Sideview `sv_actors` confirmed 9×6 @144px = primary battler grid.
  ⚠ Character Creator pack flagged RESTRICTED (no-redistribution terms) — left out of the
  build by default; composites-only if the operator opts in.
- **`ATTRIBUTION.md`** (root, ships every build) — Willibab/Monsteretrope (CC BY),
  GuttyKreum Pixel Tarot (commercial purchase), RonnyG tool credit; band-kit score noted as
  attribution-free (code-composed).

Suite: `node --test` — no test files yet (M0 adds no code; M1 scaffolds the suite). Node v22.

## 2026-08-09 — M1 COMPLETE (Spine)

M1's full stated scope is implemented across three checkpoint-committed increments; the
single-file build boots from file://; `node --test` is green (31 tests). Increments:

- **inc1 — harness + spine primitives.** `package.json` (type:module, `npm test`/`npm run
  build`); `src/tuning.js` (all pacing/speed/save constants, each tagged shape+feel — no
  scattered magic numbers); `src/rng.js` (named streams terrain/encounter/shuffle/loot,
  independent per-stream salts, single-uint32 serializable state); `src/debuglog.js`
  (loud-failure core — levels, onError/onAny, guard(), ring buffer, exportText);
  `src/main.js` boot (fixed 320×200 virtual canvas → fills the 16:10 proof viewport, loud
  boot-error banner, E exports the log); `scripts/build.js` (dependency-ordered single-file
  bundler → `dist/office-of-the-road.html`, strips module syntax from real import lines
  only).
- **inc2 — the march.** `src/engine.js` (pure deterministic sim: generated road, party
  marches, per-leg terrain from the terrain stream kept independent of per-pace encounter
  rolls, encounter ticker with min-gap, legs roll over). Live loop with a fixed-tick
  accumulator — **SPEED changes how often we step, never a step's result**. Speed control
  0.5/1/2/4× + PAUSE + HOLD-to-pause, **keyboard AND mouse**, focused control draws an
  OUTLINE ring. **Onboarding beat**: marching before first input. Route table + day-book
  ticker + exact instrument line. `scripts/proof.mjs` (reusable dated-proof harness via
  headless Chrome; deterministic `?seed/?speed/?ticks/?paused` boot params; never
  overwrites).
- **inc3 — autosave + resume + determinism.** `src/save.js` (plain-JSON save envelope
  capturing seed + config + exact engine state incl. RNG positions; guarded storage that
  degrades to in-memory LOUDLY when file:// localStorage is denied; runtime
  `determinismProbe`). Continuous autosave at the leg pause point + heartbeat + on quit;
  **VISIBLE save indicator** (FILED ✓ — silent saves are banned). **Returned docket** resume
  screen (exact ON FILE figures; RESUME / FILE ANEW; keyboard+mouse; default focus ring).
  **Save-round-trip determinism probe**: serialize mid-expedition → full envelope →
  JSON→reload → next 200 ticks byte-identical (tested across 6 seeds + a leg-generation
  boundary).

Speed index is persisted in the save envelope and restored on resume. Input parity floor met
on both M1 surfaces (march HUD + docket): keyboard (←→ speed, Tab/Shift-Tab focus, Enter
activate, Space pause, H hold, E export) and mouse (click/hover), visible outline focus ring.

Suite: **31/31 green**. Build: `dist/office-of-the-road.html` (41 KB, 7 modules), boots
headless-clean. Proofs (1280×800, 100% fill): `proofs/march-inc2-*`, `march-inc3-saving-*`
(leg filed + FILED ✓ indicator), `docket-inc3-*` (returned docket, focus ring).

### For the operator to ratify (M1)
- **Space = toggle pause; H = hold-to-pause; Enter = activate focused control.** The seed
  lists both "Enter/Space activate" and "hold-to-pause"; Space-conflict resolved toward M3's
  stated "Space toggles" pause. *Lean: keep* (H covers the hold gesture; the mouse HOLD
  button also holds).
- **Autosave triggers at M1 = the leg pause point + a heartbeat + on quit.** Camp/town/
  combat/route-choice triggers attach as those systems land (M2/M4). *Lean: correct for the
  skeleton.*
- **Shipped debug affordances**: deterministic URL params (`?seed/?speed/?ticks/?paused/
  ?fresh/?asdocket`) and a `window.__office` handle. Harmless, deterministic, consistent
  with the debug-forward ethos. *Lean: keep; revisit before public listing if undesired.*
- **Proofs of cross-reload persistence are test-based** (localStorage round-trip + full-
  envelope determinism), since headless Chrome can't proof cross-process file:// persistence.
  The docket UI itself is proofed via `?asdocket`. *Lean: sufficient.*

Current milestone: **M2 — Jobs + auto-combat.** (was M1)

## 2026-08-09 — M2 COMPLETE (Jobs + auto-combat)

M2's full stated scope is implemented across four checkpoint-committed increments; the suite
is green (58 tests); the single-file build boots with licensed battler art inlined; all three
M2 exit gates pass (`node scripts/gates.mjs` → ALL GREEN). Increments:

- **inc1 — jobs + party.** `src/jobs.js`: 6 deck-neutral fixed-kit jobs (Bailiff, Chirurgeon,
  Surveyor, Almoner, Notary, Sumpter) — original in-register bureaucratic-trade names, a
  distinct verb set each (distinctness law tested), stat weights, mapped battler. `src/party.js`:
  4-frame party, HP + persistent supply reserve (attrition), job change (HP carries
  proportionally), camp rest (recovers at a supply cost), serialize/restore.
- **inc2 — auto-resolver.** `src/combat.js`: deterministic SPD-ordered resolver, standing-order
  AI per job (heal / distrain-the-sturdy / mark-the-weak / AoE injunction / bear-guard),
  damage/heal/guard/ward, stalemate = loud defect, action-legible log. Independent `combat`
  RNG stream. Attrition persists out of the fight.
- **inc3 — art + battle + camp.** `scripts/build.js` base64-inlines 9 Willibab sv_actor
  sheets (CC BY) → single-file boots from file://. `src/art.js` maps jobs/foes → battler
  frames. Combat plays back beat-by-beat over the battlers (HP bars, floating numerals,
  reduced frames faded); a wipe → NOTICE OF REDUCTION (M5 does the causal report). Party HP +
  supplies shown on the march. CAMP at the leg pause point: deck-neutral job change (◄►) +
  REST, keyboard+mouse parity + focus ring. Provenance recorded in the manifest.
- **inc4 — exit gates.** `src/baseline.js` + `scripts/gates.mjs`: the auto-win baseline
  (routine **94.7%** / elite **54.4%** / boss **11.5%**, all in the committed bands, 2000
  fights/tier) and the job-comp degeneracy sweep (15 comps, spread **19.7%** < 50% margin, no
  degenerate comp, no-healer comps flagged trap-tier). `src/legibility.js` + `src/palette.js`:
  WCAG contrast (all body ≥4.5, all interactive edges ≥3 — palette re-tuned), the non-colour
  channel inventory, and an in-build `?cvd=` filter with deuteranopia/protanopia/tritanopia
  proof frames. Committed + measured in `design/study/M2-GATES.md`.

Suite: **58/58 green**. Build: `dist/office-of-the-road.html` (~269 KB, 12 modules, 9 battler
sheets). Proofs (1280×800, 100% fill): `combat-inc3-*` / `combat-inc4-palette-*` (sideview
battle on pack art), `march-panel-inc3-*` (party attrition on the road), `camp-inc3-*` (job
change), `combat-cvd-{deuteranopia,protanopia,tritanopia}-*` (CVD legibility).

Current milestone: **M3 — The deck.**

## 2026-08-09 — M3 COMPLETE (The deck)

M3's full stated scope is implemented across three checkpoint-committed increments; the suite
is green (75 tests); the M2 baseline is preserved exactly (RNG order unchanged by the combat
refactor). The INTERVENTION CONTRACT (stated at M0) is now live:

- **inc1 — deck + art.** `src/deck.js`: 12 major-arcana cards (in-register administrative
  effects), a thin 5-card starting deck, shuffle/draw/discard on the SHUFFLE stream (never
  perturbs combat), run-persistent add/remove, serialize/restore. Pixel Tarot art (22 arcana +
  back, GuttyKreum) inlined by the build.
- **inc2 — stepped resolver.** `src/combat.js` refactored to `initCombat`/`stepCombat` (visible
  tick); `resolveCombat` is now a wrapper that steps to completion — with no cards it
  reproduces the M2 fight byte-for-byte (baseline still 94.7/54.4/11.5%). `applyCard` (no RNG),
  `peekThreat`, `evaluateCard` (window state). STALE-TARGET + DOUBLE-PLAY probes.
- **inc3 — live play.** Combat runs live with a persistent tarot HAND (drawn on the shuffle
  stream, replenished per round); cards played by 1–3/click, fully resolvable while PAUSED
  ("pause on hand draw" defaults ON; Space runs). Per-card window state (decisive/playable/
  wasted — outline weight + word). 3-card DRAFT at victory (loot stream) over the tarot art,
  with DECLINE. Camp-only deck REMOVAL at a supply cost (THE FILE — DECK REVIEW). Road OMENS
  each leg. Zero-card law surfaced + tested (routine winnable card-free); "LEFT ROUTINE"
  signal. Deck folds into the save envelope (v3).

Intervention contract checklist (all met): visible tick ✓; persistent hand ✓; per-card live
window state vs the next action ✓; pause first-class (Space; play while paused) ✓; 3-card
draft at resolution ✓; removal camp-only at cost ✓; deck run-persistent (save) ✓; stale-target
+ double-play probes ✓; routine winnable with zero cards + UI states when a fight leaves
routine ✓. Certifications extending the deck are M5.

Suite: **75/75 green**. Gates: baseline still ALL GREEN. Build: ~330 KB (13 modules, 9
battlers + 23 tarot). Proofs (1280×800): `combat-cards-inc3-*` (hand + window states, paused),
`draft-inc3-*` (3-card draft), `deck-review-inc3-*` (camp deck removal).

Current milestone: **M4 — Mandates + quartermaster.** (was M3)

## 2026-08-09 — M4 COMPLETE (Mandates + quartermaster)

M4's full stated scope is implemented across four checkpoint-committed increments; the
suite is green (109 tests); the single-file build boots from file://; the economy exit gate
passes (`node scripts/gates.mjs` → ALL GATES (M2 + M4): GREEN). The run now has a spine
(mandates), a power economy (the quartermaster), and legible forks (routes). Increments:

- **inc1 — mandate spine + gold ledger.** `src/mandate.js`: the Office issues a quest-chain
  with a terminus (a destination leg); completing it DISCHARGES the mandate, pays a
  floor-guaranteed disbursement (+ met side-clauses: frugality / provisioning) into the
  ledger, and the Office issues the next. Deterministic on a new independent `mandate` RNG
  stream (M2 baseline preserved exactly). Gold on the party (`earnGold`/`spendGold`); combat
  victory disburses per tier. Save envelope → v4. March HUD gains a mandate strip (deadpan
  title + exact numeric neighbour) + the ledger.
- **inc2 — the quartermaster.** `src/items.js` (10 standardized-issue items, arm/guard slots,
  tiered with a `minLeg` gate — the no-early-spike curve) + `src/shop.js` (town stock as a
  PURE fn of (seed, leg) — never perturbs determinism; buy/sell + the ALWAYS-OPEN resupply
  sink). Equipment overlays onto `frame.max` via `frameStats`, so combat reads it with no
  resolver change and jobs stay orthogonal (gear survives a swap). Full QUARTERMASTER UI
  (buy / resupply / pick-then-slot equip / un-issue / sell), keyboard+mouse + focus ring.
  Currency glyph `¤` (renders in-font). Towns are every `townEveryLegs`-th pause point.
- **inc3 — route branches.** `src/route.js`: three archetypes spanning safety-vs-resource —
  The Posted Road (guarded, a supply toll), The Cut (ordinary), The Unassessed Verge
  (exposed, best pay, no toll). Content pure from (seed, leg); the chosen mods ride on the
  leg (`march.legMods`: encounterMult scales the encounter roll, goldMult scales pay).
  Neutral (×1) is the exact identity → baseline + determinism untouched. MARCH ON now opens
  the route board (autosaves the choice); a new legible route screen with CVD-safe safety
  words (colour + bracket channel).
- **inc4 — economy closed-loop gate.** `src/economy.js`: a headless expedition simulator
  (real engine + resolver + a competent deck auto-pilot per the M3 contract + rest/resupply)
  running null (hoard) vs greedy (buy-everything). GATE 4 measures the closed loop: net
  **43.4¤/leg** (band [30,90]); greedy survives ≥ null in **96.7%** of seeds (buying is
  survival insurance — 13 wipes vs 28); the divergence is real (greedy spent 16,394¤ on
  kit); always-open sink, no early spike, never strands, floor holds — **ECONOMY HEALTHY**.
  Also reweighted the road tier mix to routine-heavy (routine .80 / elite .16 / boss .04),
  fixing an M1 uniform-1/3 placeholder that wiped auto-parties at leg 0. `design/study/
  M4-GATES.md` commits the constants + measured figures.

Suite: **109/109 green**. Gates: **ALL GATES (M2 + M4) GREEN**. Build: `dist/office-of-the-
road.html` (~397 KB, 18 modules). Proofs (1280×800): `march-mandate-inc1-*` (mandate strip +
ledger), `shop-equipped-inc2-*` (quartermaster; Bailiff atk 13→19 via an issued maul),
`route-inc3-*` (three roads, tradeoffs on file), `route-cvd-deuteranopia-inc4-*` /
`shop-cvd-deuteranopia-inc4-*` (CVD legibility of the new surfaces).

### For the operator to ratify (M4)
- **Road tier mix reweighted** to routine .80 / elite .16 / boss .04 (from the M1 uniform
  1/3, which put a <15%-winrate boss on every third step). A real road-legibility fix, not
  just a probe convenience; determinism + the M2 per-tier baseline are untouched. *Lean:
  keep — matches "routine is the road's ordinary work"; M6's bestiary can revisit the split.*
- **Equipment = two slots (arm/guard), no job-gate** — any frame may equip any item; arm
  items simply reward the matching job's stat. *Lean: keep — simple + legible; a gear-type
  gate can come later if the operator wants job identity to constrain kit.*
- **Route choice is a required screen before every march-on** (not skippable). *Lean: keep —
  it's the seed's "route the next leg" beat; the neutral-ish Cut is always available as a
  no-cost default.*
- **Economy probe models a competent player** (deck auto-pilot + rest/resupply), not perfect
  play; the [30,90] gold/leg band is the intended steady state. *Lean: keep; M5's
  certifications add a second compounding axis to re-measure against.*
- **Save envelope bumped to v4** — pre-M4 saves are discarded (parseSave returns null →
  FILE ANEW). *Lean: fine in dev; a migration path is only worth it post-listing.*

Current milestone: **M5 — The run loop.** (was M4)

## 2026-08-09 — M5 COMPLETE (The run loop)

M5's full stated scope is implemented across four checkpoint-committed increments; the
suite is green (131 tests); the single-file build boots from file://; the M2 + M4 gates
stay GREEN (a fresh ledger + escalation 0 leave the baseline exact). The roguelite loop now
closes: expeditions die, file a causal report, bank certifications, and the next run departs
deeper and better-provisioned. Increments:

- **inc1 — the certification ledger.** `src/meta.js`: job MASTERY as the cross-run currency
  in its OWN storage key (separate from the per-run save). Per-job XP→level→a small stat
  multiplier (threaded through `deriveStats`/`frameStats`/`createParty`; level 0 → ×1, so the
  baseline is exact). Earned by fielding a job in won fights, banked at run-end; the run
  snapshots the mastery map so mid-run swaps read a fixed value. Unbanked run-mastery rides
  in the save. A deadpan CERTIFICATIONS-ON-FILE surface on death.
- **inc2 — the causal filed report.** `src/report.js`: an incident ledger tracing leg-chosen
  → matter-fielded → coverage-gap → unplayed-decisive-window → deduction, each line tied to
  its cause, plus exactly ONE credit line. Register laws 4 & 5 enforced in phrasing (passive
  voice for suffering, active for the desk; never triumphant). A DECISIVE protection card
  sitting unplayed as a frame falls becomes a named coverage gap. `renderDefeat` leads with
  the tone-coloured ledger.
- **inc3 — certifications + escalation.** `src/certifications.js`: a four-clearance wall
  gated on total mastery (starting requisitions of gold/supplies + deck slots), and an
  escalation curve set by the DEEPEST leg ever reached — scaling enemy strength AND pay via a
  `makeEnemies` escMult (default 1 = identity; baseline + economy gate untouched). Fresh runs
  depart under the wall + at the world's escalation; the HUD shows the level; death announces
  NEW CLEARANCEs.
- **inc4 — abandon valve + no-progress detector + Orientation Mandate.** The FILE EARLY
  RETURN valve at any camp/town banks a reduced certification share (`abandonCreditFrac`).
  `src/progress.js`: a no-progress detector (two legs of net-negative gold + no gear/xp gain)
  surfaces the valve loudly (stamp banner + auto-focus). Expedition 0 opens on the ORIENTATION
  MANDATE — an intake form introducing each intervention verb as a required, acknowledged box
  (diegetic; no tutorial voice; proof/deep-link boots skip it).

Intervention/roguelite checklist (all met): mastery persists across runs ✓; report is causal
not a stat dump ✓; certifications = meta-unlocks gated on the ledger ✓; escalation deepens
with the record ✓; abandon valve banks reduced credit ✓; no-progress detector surfaces it ✓;
Expedition 0 is the diegetic Orientation Mandate ✓.

Suite: **131/131 green**. Gates: **ALL GATES (M2 + M4) GREEN**. Build: `dist/office-of-the-
road.html` (~427 KB, 22 modules). Proofs (1280×800): `certifications-inc3-*` (report + certs
+ NEW CLEARANCE + escalation L1), `report-inc2-*` (the causal incident ledger),
`intake-inc4-*` (the Orientation Mandate intake form), `camp-valve-inc4-*` (the early-return
valve).

### For the operator to ratify (M5)
- **Mastery multiplier is small (+3%/level, cap 10)** and job-mastery is the ONLY
  certification currency (per the seed). *Lean: keep gentle — it compounds with escalation +
  starting kit; M8/M9 can re-measure the deepened curve.*
- **Escalation is driven by deepest-leg-ever, not run count** (proving you can go there before
  the world follows). *Lean: keep — matches "runs get deeper as the wall fills".*
- **Certification wall is 4 clearances (gold/supplies/deck slots)**; new jobs + route options
  are named in the seed as possible unlocks but deferred (new jobs = new art/verbs). *Lean:
  ship these 4 now; flag +jobs/+routes for a later content pass.*
- **No-progress detector = net-negative gold AND no gear/xp gain for 2 legs.** Within-run
  "level gain" doesn't exist (mastery banks at run-end), so the condition reduces to gold+gear.
  *Lean: correct reading; tune the streak length if it fires too eagerly.*
- **Incident ledger is in-memory** (a resumed run starts a fresh ledger). *Lean: acceptable —
  the report matters at death; persisting the full history is an M8 QoL option.*
- **Save envelope stays v4** (M5 adds `runMastery` additively; the meta ledger is its own key
  at v1). *Lean: fine.*

Current milestone: **M6 — Full art pass.** (was M5)

## 2026-08-09 — M6 COMPLETE (Full art pass)

M6's stated scope — Willibab integration across map/UI/town/battle, idiom + pixel gates, an
opus-looker checklist per surface, and a colour-blind re-run — is delivered across four
checkpoint-committed increments; the suite is green (134 tests); the build boots from file://;
GATE 5 (art idiom) is GREEN alongside M2 + M4. All art is licensed-pack only (hard rule #1);
provenance for every sheet the build touches is recorded in the manifest. Increments:

- **inc1 — UI icons.** Willibab's Retro Icons (`Iconset.png`, 32×32) inlined + sliced 1:1 by
  `drawIcon` via `art.js:ICON`. Gold orb (ledger), provision bag (supplies), a rolled
  instrument (mandate), sword (arm), shield (guard) — wired into the march party panel, the
  mandate strip, and the quartermaster slot chips.
- **inc2 — map tiles.** Willibab Overworld `OW_A2` (16px) inlined; the road's 5 in-register
  terrains bind to solid A2 ground sub-tiles (grass/chalk/sand/rock/water) via `TERRAIN_TILE`.
  `tileFillCell` repeats a native-16px tile, clipped, nearest-neighbour; `drawRoute` floors
  each leg segment with its real terrain tile under a legible label chip.
- **inc3 — idiom + pixel gates + CVD.** `src/artgate.js` + GATE 5: every bound cell must be
  grid-aligned, in-bounds, on a confirmed grid (sheet dims read from the PNG IHDR). Pixel gate:
  native-integer draws, nearest-neighbour, no stretch. CVD re-run over the new art surfaces
  (`march-cvd-{deuter,protan,tritan}-m6`, `shop-cvd-deuter-m6`). Opus-looker checklist per
  surface in `design/study/M6-GATES.md`.
- **inc4 — town tiles.** Willibab Town `TOWNS_ALL_1x` (512×544 @16px) inlined; the
  quartermaster is floored with the grey round-cobblestone street tile `(0,18)` via
  `TOWN_TILE` — the office stands somewhere. GATE 5 extended to cover it (12 bindings, all
  grid-aligned).

Art coverage (map ✓ overworld tiles · UI ✓ icons · town ✓ cobblestone · battle ✓ sv_actors
from M2 + tarot from M3). Suite: **134/134 green**. Gates: **ALL GATES (M2 + M4 + M6) GREEN**.
Build: `dist/office-of-the-road.html` (~638 KB, 22 modules, now with iconset + overworld +
town tiles inlined). Proofs (1280×800): `icons-march-m6`, `tiles-march-m6`, `town-cobble-m6`,
`march-cvd-{deuter,protan,tritan}-m6`, `shop-cvd-deuter-m6`.

### For the operator to ratify (M6)
- **Terrain/town tiles bind to solid ground sub-tiles**, not full RM autotiling — correct for
  a terrain *band*/footer, idiom-safe. Full autotile borders only matter if a surface becomes a
  walkable field. *Lean: keep.*
- **UI icons downscale to ~10px** (clean nearest-neighbour). A purist pixel gate prefers integer
  scales; a 16px HUD band would show them 1:1. *Lean: acceptable for chrome; flagged.*
- **Town is grounded (cobblestone) but not a walkable tiled SCENE.** The Willibab TOWN interiors
  are staged. *Lean: a tiled town vignette is worthwhile polish; flagged for ratification.*
- **Enemies still draw the sv_actor grid (flipped)**, not the Monster Pack. *Lean: Monster Pack
  can enrich the bestiary at a later content pass.*

Current milestone: **M7 — Score.** (was M6)

## 2026-08-09 — M7 COMPLETE (Score)

M7's stated scope — band-kit tracks in the chiptune/medieval register, wired to march/town/
office/combat/report, with density metrics + an audio probe — is delivered across two
checkpoint-committed increments; the suite is green (139 tests); GATE 6 (score density) is
GREEN alongside M2 + M4 + M6. Code-composed WebAudio only, zero audio files (hard rule #10).
Increments:

- **inc1 — tracks + wiring + probe.** `src/score.js`: 5 D-modal tracks in the seed's Famicom-
  consort register — office (drone+bell), march (plucked walk + square lead), town (skipping
  pluck + bell), combat (pulse bass + full kit + square arpeggio; the only percussion track),
  report (somber drone + descending lead). `STATE_TRACK` maps every screen. `main.js` creates
  the band on the first user gesture (headless stays silent), crossfades per paint; `M` mutes;
  a visible `score: <track> (M)` indicator (loudness law). `test/score.test.js`: a density
  probe over a counting voice stub (no WebAudio).
- **inc2 — density gate + doc.** `scripts/gates.mjs` GATE 6 reports per-track density (CHP
  audio-probe pattern) and asserts every track is voiced + in-band, the kit is combat-only,
  and office-quietest/combat-busiest. `design/study/M7-GATES.md` records the metrics + the
  operator score-direction ratify note.

Measured density: office 0.13 · march 0.78 · town 0.69 · combat 2.50 (KIT) · report 0.22
notes/step. Suite: **139/139 green**. Gates: **ALL GATES (M2 + M4 + M6 + M7) GREEN**. Build:
`dist/office-of-the-road.html` (~670 KB, 24 modules — band + score added). Proof:
`score-march-m7` (the score indicator).

### For the operator to ratify (M7)
- **Tracks are a FIRST PASS composed structurally** (mode/register/voices/density correct) but
  not auditioned by ear in-build — the seed reserves score DIRECTION for Weiss. *Lean: keep as
  a working bed; Ray sets melodies/mood/mix at audition.*
- **`setParams` live-intensity is unused** (the band supports thickening combat as HP falls
  without a restart). *Lean: an easy expressivity win; flagged.*
- **Mute (M) is session-only, not saved.** *Lean: a saved audio pref is M8 QoL.*

Current milestone: **M8 — Genre-completeness + QoL audit.** (was M7)

## 2026-08-09 — M8 COMPLETE (Genre-completeness + QoL audit)

M8's stated scope — enumerate JRPG + roguelite + deckbuilder table-stakes, audit + land-or-
defer each, and settle the mutation-during-automation class — is delivered across two
checkpoint-committed increments; the suite is green (145 tests); gates stay GREEN. Increments:

- **inc1 — run-history + the mutation guarantee.** The certification ledger keeps a rolling,
  capped, newest-first run-history (run/leg/cause/gold), shown as a RECORD column on a
  two-column returned docket. The mutation-during-automation hazard is HARD-BLOCKED and proven:
  `advanceTicks` guards so the march advances only on the march screen (every edit surface is a
  frozen pause point), and `step(march)` is pure w.r.t. party/deck/ledger. `test/automation.
  test.js` (7) asserts a tick never mutates party/deck and that a mid-automation job-swap/equip/
  deck-edit is single-applied with no orphaned refs.
- **inc2 — the audit.** `design/study/M8-AUDIT.md` enumerates the table-stakes across all three
  genres with a LAND / PARTIAL / DEFER verdict + location/reason for each. Result: table-stakes
  are LANDed, with a small set of considered DEFERs (broader status ailments, card rarity, StS
  relics, per-turn energy [out BY DESIGN — pause-first, not resource-metered], hover tooltips,
  a settings screen) — none blockers, none required before M9.

Suite: **145/145 green**. Gates: **ALL GATES (M2 + M4 + M6 + M7) GREEN**. Proof:
`docket-history-m8` (the RECORD column of filed expeditions).

### For the operator to ratify (M8)
- **The DEFER list is the builder's call** — each item is safe for a later content/QoL pass;
  flag any to pull forward before the STOP line. *Lean: none are blockers.*
- **Energy is DEFERRED BY DESIGN** (pause-first interventions, not a per-turn budget) — please
  confirm this reading of the intervention contract.
- **Run-history is 8 entries, session/save-persisted.** *Lean: sufficient; a fuller archive is
  optional.*

Current milestone: **M9 — Acceptance battery + soak + polish. (THE STOP LINE.)** (was M8)

## 2026-08-09 — M9 COMPLETE — THE STOP LINE (Acceptance battery + soak)

M9's stated scope — an automated acceptance dossier (BLOCKER/DEFECT/FRICTION) + a player-path
soak driven through REAL input events, with watch/act metrics gated as blockers — is delivered
across two checkpoint-committed increments. **This is the STOP line; everything further is
operator-directed.** Increments:

- **inc1 — the player-path soak.** `src/soak.js` (installed on `?soak`) self-drives a full
  expedition via dispatched KeyboardEvents through the game's own listeners — never engine API
  calls for any player VERB. Headless Chrome's `--virtual-time-budget` accelerates its loop.
  It exercises the player-path minimum (live card play, camp job change, shop transaction,
  route branch, save round-trip, death→report→cert), persisting across expeditions (capped) so
  an unlucky early death never fails acceptance. Watch/act metrics are measured in game-time
  (march ticks): longest passive stretch (25s floor = BLOCKER) + interventions/min. Only the
  passage of AUTOMATED time is fast-forwarded (o.advance/o.advanceCombat — the watching, not a
  verb). `main.js` renders the ACCEPTANCE DOSSIER + mirrors a verdict into the page title;
  `scripts/soak.mjs` runs it end-to-end (dump-dom verdict + screenshot dossier), exiting
  non-zero on any BLOCKER.
- **inc2 — the acceptance dossier.** `design/study/M9-ACCEPTANCE.md`: the full battery (how to
  run), the soak VERDICT (PASS across seeds 3/5/7/11/42 — 6/6 verbs, 0 blockers, passive
  7.4–11.9s ≤ 25s floor, 78–146 interventions/min), the six-gate summary (ALL GREEN), and the
  BLOCKER/DEFECT/FRICTION tally (no blockers, no defects; FRICTION = the documented M8 DEFERs +
  score direction reserved for Weiss). The STOP declaration.

**Acceptance state (authoritative):** Suite **145/145 green**. Gates: **ALL (M2+M4+M6+M7)
GREEN**. Soak: **PASS (6/6 verbs, 0 blockers)** across 5 seeds. Build: `dist/office-of-the-
road.html` (~685 KB, 25 modules) boots from file://. Proof: `soak-dossier-*` (VERDICT PASS).

### For the operator to ratify (M9 / whole build)
- **The build is feature-complete against DESIGN-SEED M0–M9.** No blockers. STOP reached.
- **Standing DEFERs** (M8-AUDIT): broader status ailments, card rarity, StS relics, per-turn
  energy [out by design], hover tooltips, a settings screen. Flag any to pull forward.
- **Score DIRECTION is reserved for Weiss** (seed §Score) — the M7 tracks are a structurally-
  sound first pass to audition/redirect.
- **The name** (THE OFFICE OF THE ROAD) — CONFIRMED by Ray 2026-08-11 (veto row closed).

Current milestone: **NONE — M9 (STOP) reached. Awaiting operator direction.**

### For the operator to ratify (M3)
- **Card magnitudes** (`TUNING.card*Base`) tuned by feel, not yet re-measured against the
  win-band the way M2 enemies were. *Lean: acceptable — routine stays card-optional (tested);
  M4/M5 can add a "card value" probe if wanted.*
- **Auto-target** for cards (weakest/sturdiest/most-reduced) rather than player-picked targets.
  *Lean: keep for now — the agency is which-card-when; free target-picking can come at polish
  if it reads as thin.*
- **Road omens resolve nothing** (pure register flavour). *Lean: keep — it's the Kafka beat;
  if Ray wants omens to carry a small mechanical hook, that's an M4+ option.*
- **Draft pool = all 12 cards uniformly** (loot stream). *Lean: fine v1; rarity/weighting is a
  later economy knob.*

### For the operator to ratify (M2)
- **6 jobs v1** (seed says 6–8). *Lean: ship 6 now; the battler roster has headroom for +2 at
  M3/M5 if wanted.* Names/verbs are in-register and clean-room.
- **Steep difficulty cliff** between routine (×1.44 → 95%) and elite (×1.62 → 54%): the band
  targets sit close in enemy strength because the party scales hard with focus-fire + a
  healer. *Lean: fine for the M2 skeleton — a varied bestiary (M6) widens the gap naturally;
  M3 cards will also reshape it.* Flagged in case Ray wants more separation sooner.
- **Wipe → simple NOTICE OF REDUCTION + new expedition** is a placeholder; the causal filed
  report + certifications are M5 (as the seed schedules). *Lean: correct staging.*
- **Enemies drawn from the same sv_actor battler grid** (flipped) rather than the Monster
  Pack, for a uniform 144×144 slice. *Lean: keep for now; the Monster Pack (per-image sprites)
  can enrich the bestiary at M6.*
- **Palette re-tuned for the contrast gate** (brighter `stamp`/`faint`, new `edge`). *Lean:
  keep — it's more legible and still in-register; Ray may fine-tune hues at the M6 art pass.*

### For the operator to ratify (M0)
- **Two-axis thesis** (jobs ⟂ deck; deck-neutral fixed-kit jobs) as the tuning spine.
  *Lean: keep* — cleanest reading of the seed; makes degeneracy detectable per axis.
- **Soft transition tax on job swaps** (churn tax, not a lock; tuned gentle at M2).
  *Lean: include, defaulted gentle.* Ray may prefer zero tax (pure free swapping) — flagged.
- **Pause-first, no baseline time pressure** (departure from real-time deckbuilders; fits the
  desk register). *Lean: keep; time pressure only as a chosen expedition contract.*
- **Character Creator pack**: left OUT of the build by default over its no-redistribution
  terms vs. the single-file inlined build. *Lean: keep it out* — CC-BY packs cover the need.
- The name (THE OFFICE OF THE ROAD — Ray holds veto until public listing).

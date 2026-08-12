# M12 studio audit — five role voices, 2026-08-03

Charter-adoption fan-out (game-studio roles: qa-tester, ux-designer, game-designer,
systems-designer, art-director) over the M11 build + Ray's three-wave playtest
observations (docs/PLAYTEST-2026-08-03-M11-OBSERVATIONS.md). Reports verbatim.
Consumed by DIRECTIONS-2026-08-03-M12.md.

---

## QA-TESTER

**1. FP enemy icons intermittent — BUG CONFIRMED**, `src/main.js:936-947` (`enemyAhead()`). It samples only `n = [3, 4, 6]` tiles ahead, skipping 1, 2, 5. Dungeon "cells" (rooms) are `segmentSize = 5` tiles (`data/dungeon/kit.json:3`), so whether one of those three sampled tiles lands in a *different* cell than the crawler's current one depends entirely on the crawler's tile-offset mod 5. The same enemy placement reads visible or invisible purely from approach angle — the "sometimes visible" symptom exactly. The function's own comment ("a cell or two forward," line 934-935) doesn't match its `n` values.

**2. Talk outcomes/NPCs — BUG CONFIRMED (design gap).** Outside combat there is no talk *action* at all: overworld NPC contact (`main.js:685-696`) and town citizens (`main.js:986-998`, `citylife.js:65-67`) only print a passive greeting on bump-proximity — nothing chosen, nothing distinguishable as an "outcome." `main.js:683-684` says so directly: "the social layer is banked." In-combat talk *is* implemented (`negotiation.js` + `combat.js:376-399`) but its result only flashes in `combatNote`, overwritten next turn — no persistent confirmation.

**3. No HP recovery — NOT REPRODUCED as coded.** `R` = rest is a bound, help-listed overworld action (`bindings.js:51,97`) calling `session.rest()` (`session.js:115-119`), which sets `pc.hp = maxHp` and heals the whole roster from anywhere on the map. Town inn/shrine buildings call the identical `session.rest()` (`services.js:33,55`). Real gaps: (a) services are placed *probabilistically* per building (`city.js:28-33`), so a small town can genuinely lack any inn/shrine (a 4-building "bureau" town has ~45% odds of neither); (b) neither path shows a before/after HP number, so a working heal at near-full HP looks like nothing happened.

**4. Follower targeting — NOT REPRODUCED as absent; it's a legibility gap.** `foeTurn` (`combat.js:234-267`) targets `living('party')` (PC + followers): 'steady'/'caster' pick randomly, 'aggressive'/'pack' target lowest HP — often a follower. Followers do appear with live HP in the combat card's "YOU" column (`panels.js:64`) and by name in the strike log (`combat.js:173`). Gap: nothing marks which row is "you" vs. an ally, and no HUD shows follower state outside combat.

**5. Audio click — BUG CONFIRMED**, `src/engine/audio.js:105-127` (`loadSidecar`). `src.loop = true` is set with zero seam handling — no `loopStart`/`loopEnd` trim, no crossfade, no boundary gain ramp. A fade-in/fade-out (not crossfade-authored) source will click at the loop point regardless of file; the code path has no mitigation, confirming the operator's diagnosis.

**6. Towns share one screen — BUG CONFIRMED (visual layer).** `tileart.js:478-582` defines exactly 5 `CITY_*` art variants, used identically by `renderCity` (`main.js:965-1001`) for every archetype. Differentiation is text-only (blurb, proprietor names, service-mix bias) plus randomized grid size/gate side (`city.js:46-50`) — the rendered layout is the same boxes-and-lanes screen every time.

**Game event log — proposed shape**
- Ring-buffer `game.eventLog` (~200 entries) fed by one `logEvent(kind, data)` call dropped at existing side-effect sites already in the code (combat.take, session.rest, enterBuilding, overworldContact, encounter rolls, death).
- Each entry: tick, mode, the seed used for that roll, event kind, resolved outcome string — enough to *replay* a "weirdness" report deterministically from the seed.
- Surface via a `[L]` overlay (same pattern as the existing `[?]`/`[I]` overlays), last ~20 entries, scrollable.
- A "dump log" hotkey that serializes the buffer to JSON (toast/download) so Ray can hand it back without describing what he saw.
- Persist the log inside `save()` (`session.js:267`) so a bug report travels with the exact save that reproduces it.

---

## UX-DESIGNER

Gated on: identity intact (monochrome CRPG panel, Discordian [SEED] prose, no genre-generic UI) x more enjoyable.

**1. Talk outcomes have no dedicated feedback — S, P1**
`src/main.js` `talkPick()` (~745-757) calls `combat.take({type:'talk',...})` and just re-renders; the only trace is whatever `combat.log` already holds (`combatprose.js` `outcome()`). There's no register-voiced line naming what changed. Fix: every `resolveApproach()` result (`negotiation.js`) gets its own `combatProse.outcome()` string surfaced as `combatNote` — "parley," "recruit," and "unavailable" each need distinct in-voice text, not a shared fallback. Register-safe: reuses the existing prose engine, just calls it where it's currently silent.

**2. No kill beat, no join beat — M, P1**
Evidence: `combatAttack()` (`src/main.js` 715-719) fires a one-line flash (`✖ Name falls — one fewer pattern`) inside the *same* combat screen, gone on next render; `endCombat()` (795-822) appends `· Name joins you` as plain string concatenation onto the outcome line — no register voice, no beat. Contrast with `mode:'death'` which gets a whole screen (portrait + "THE THREAD" cue, `HUD_CUE`). A kill or a recruit is a comparable narrative event and gets nothing structurally similar. Fix: a brief in-scene text beat (reuse the `centered()` framed-panel pattern already used for death/journal — NOT a popup) with one authored-register line per event, held for a beat before returning to combat/overworld. Small: piggybacks on existing panel machinery.

**3. Stats have zero in-fiction explainer — S, P1**
`character.js` defines `nerve/craft/pull/gnosis` → `overawe/impress/bargain/bind` and rank thresholds (`STEADY`/`SHARP`), but nothing in `chargen.js` or anywhere else surfaces that mapping. Ray, the designer, doesn't know how his own stats work — this is the sharpest finding. In-register fix: fold a one-time, skippable "the stranger's nature" panel into character creation (`chargen`) that names the four verbs in-voice ("what you overawe, you need not impress"), plus a permanent `[?]` help-key reference (the HUD already reserves `[?] help` in the footer strip, currently unused for this).

**4. Town sameness + text formatting — M/L, P2**
`city.js` `assembleCity()` varies size/archetype/service-mix by seed, but `renderCity()`'s tile art is limited to 5 generic types (`CITY_GATE/DOOR/STREET/WALL/BUILDING`) regardless of archetype — a pilgrimage town and a market town are structurally identical rectangles. `renderBuilding()` is one shared framed-text template for every service (shop/shrine/lodge alike). This is why "all locations share the same screen." Fix: archetype-tinted building silhouettes (still on-ramp, still Ultima-legible per DIRECTIONS) + per-service interior framing cues (a shrine's panel reads differently from a bureau's, even sharing layout). Text formatting: audit `wrapToWidth` usage in `layout.js`/`panels.js` for the building-interior column — the town-interior SVG shows unwrapped long lines close to the panel edge; needs the same pre-wrap discipline `panels.js` already documents for busts.

**5. Follower HP/status absent from HUD — S, P1**
`panelGroups()` (`main.js` ~479-489) only ever shows `session.pc` vitals; followers collapse to `+N at your back`. Fix: a compact per-follower row (name + ♥) in the "the stranger" HUD group, capped/scrollable past 2-3 followers — small, additive to existing panel groups array.

**6. No player-facing event log — M, P2**
Every mode keeps an ephemeral one-line status (`owNote`, `encLine`, `combatNote`) that overwrites on next render; nothing persists. Fix: a scrollable in-register "the record" log (the HUD panel already has a "the record" heading showing only deaths/cleared-count) — append each notable event there, viewable via existing `[?]`/journal-adjacent key. Also solves the operator's stated diagnosability need.

---

## GAME-DESIGNER

**Loop verdict: thesis holds, with one structural amendment**

The operator's terrain-gate thesis is right and cheap to build, but needs one fix to survive contact with permadeath.

**Fit check.** Passability today is a static binary property of tile *type* — `DEEP/WATER/MOUNT` always impassable, `SAND/GRASS/FOREST/HILL` always open (`tiles.js`). M9's own ratify note says biome dressing deliberately does *not* touch collision ("Say if you want a biome to make shallow water walkable — a bigger change I deliberately avoided"). So the operator's "mud" note is naming a real, currently-nonexistent axis, not a mislabeled feature — there's room to build. The item model (`items.js`) is already composable/tag-based ("the whole game is items"), so a `traversal` capability items can carry is a natural, small extension of a pattern that already exists — no redesign.

**The amendment.** Inventory is explicitly mortal-layer, wiped on death (`session.js reroll()`). A naive "carry the key item" gate breaks permadeath: next stranger can't re-cross. Fix: model the unlock as **world state, like `clearSite`** — spending a traversal item at a gate consumes it and toggles a persistent fact (bridge built, ford marked), reusing the exact persistence pattern already proven for cleared sites/history. Progression becomes about the *world* opening across your lineage of strangers, not one character's bag — thematically sharper (RAW: the ladder climbs permanently, not personally) and free to build.

**Loop:** loot/caches/artifacts → spent at a terrain gate → permanently opens a biome → richer tables + signature being + its own register weirdness (M9's four-channel biome design already gives each area this) → better items → deeper gates → the Chapel as the final, unbypassable gate. That's the return hook.

**Opening pacing**

Stats are pure verb-gates, never power (`character.js` lock) — there's no difficulty-scaling lever to soften. Forgiveness has to come from *placement*, using knobs the engine already has: bias the spawn region's encounter table toward visible/avoidable/joinable beings, suppress ambush-tail rolls within N tiles of start, guarantee 1–2 reachable caches before any dungeon site is walkable, and hold the nearest dungeon a deliberate minimum distance out so touring the safe zone is the natural onboarding. No new systems — just data.

**The XP question — framed, not decided**

Three models against the "statline = playstyle, power = items" lock:

**A) No XP (status quo).** Power grows only through items/roster. Cleanest identity fit; risk is that "reasons to return" then rest entirely on loot variety, which doesn't exist at scale yet (item-pool generator still banked).

**B) Capacity-only leveling.** Follower-roster slots grow (already precedented in CHARACTER-DESIGN: "capacity grows with level... never touches stats or damage"), triggered by world milestones — gates opened, ladder rungs, biomes cleared — not kill-count.

**C) Diegetic mastery.** No number; killing/surviving a being-type unlocks a new verb or eases a threshold against it — competence growth that never touches HP/damage.

**Lean: B**, keyed to world-unlock progress rather than kills — answers "yes, characters gain experience" without ever contradicting the power-from-items law, and folds directly into the terrain-gate loop above (opening a gate *is* the XP).

**Session vs meta loop**

**Session:** wander → visible encounter (fight/talk/flee) → dungeon crawl (sneak or fight, GNOSIS-gated items) → return, rest (risking the tail), equip loot → push toward the next gate or rung.

**Meta:** permadeath discards the character, not the world. Cleared sites, opened terrain, ladder progress persist (`session.js` proves this pattern today). Tomorrow's stranger inherits a more-open map. The hook isn't "get stronger" — it's **the world remembers what you found, even after you die.**

---

## SYSTEMS-DESIGNER

Grounded in `src/engine/items.js`, `combat.js`, `character.js`, `party.js`, `negotiation.js`, `services.js`, `city.js`, `world.js`, `tiles.js`, `data/bestiary/beings.json`, `data/register/{combat,loot,city}.json`, PROGRESS.md M11, CHARACTER-DESIGN-2026-08-02.md.

**1. Buff/debuff statuses (S–M).** `combat.js` already carries transient combatant flags — `target.exposed` (subterfuge bonus), `foe.skipNext`, `foe.channeling` — proving a temporary-state pattern already threads `foeTurn`/`strike`. `items.js` `normEffect()` types `kind:'damage'|'heal'|'shield'|'edge'`, unknown kinds pass through unbroken. Proposal: add `combatant.statuses[]` = `{id, polarity, duration, effect}` reusing `combatEffect()`'s shape, plus `effect.kind:'status'` so any weapon/armor/accessory/arcane record can carry one — no new slot. In-register candidates, each mapped to code that already exists: WARDED (buff, multi-turn version of the existing 'shield' kind), MARKED (debuff, item-applied version of the 'pack' focus-target), SHAKEN (debuff, forces `defenseFlavorFor` to lose dodge/avoid and fall to bare soak), BOUND (debuff, literalizes `skipNext` outside subterfuge), BLEEDING (debuff, damage-over-time at turn start).

**2. Party targeting distribution (S).** `foeTurn()` already spreads targets over `living('party')` (PC+followers, per `character.js` `toCombatants()`) uniformly for `steady`/`caster`; `aggressive`/`pack` deliberately focus `weakest()`. Followers ARE sometimes hit today — Ray's "can't tell" is a HUD gap, not a missing mechanic: `roster.followers[].hp/maxHp` exists but nothing in `panels.js`/`combatprose.js` reads it. Proposal: keep focus-fire behaviors as-is (good, readable), replace `steady`'s flat uniform pick with a weight table in `combat.json` (tunable without code) so PC-vs-follower odds are an explicit design lever, not an accident of array order. Party-management needs no new mechanics — `roster.dismiss(id)`/`.followers`/`.want` already exist — it needs that data exposed to whatever panel the UX role builds.

**3. HP recovery economy (S).** Not missing in code: `session.rest()` heals PC+roster to full, wired to overworld key R and to `inn`/`shrine` in `services.js`. The playtest report is a city-flow wiring bug, not an absent system — flag for QA/programmer. Proposal once wired: don't leave it one free full-heal. Split into overworld `rest` (partial %, ambush-risk, free), inn/shrine (full, costs a barter item — see below), and portable consumables reusing the already-built `effect.kind:'heal'` + `charges` fields so mid-dungeon recovery stays item-gated. Forgiving-opening: flag the starting town `free_service:true` until the first dungeon clears.

**4. Trade/barter (M).** No currency field exists anywhere in the codebase. The `shop` stub's own line — "nothing changes hands — the stall wants a password you have not earned" — already signals a non-monetary, reputation-gated register. Proposal: barter-only, no currency. Shops/NPCs want an item `tag`/`kind` (reused fields, no new schema) and offer one back; PULL rank (via `negotiation.js`'s existing bargain-verb gate) widens WHICH offer-pool a shop draws from rather than discounting a price, honoring the never-scale-numbers lock. Beings' existing `want` field (food/secrets/blood/attention) becomes the same tag vocabulary, so follower upkeep and shop trade run on one system.

**5. Terrain-traversal items (S).** `world.js` `passable()` is a flat per-tile-id boolean from `tiles.js`'s static table; `siteAt()` is the one precedent for coordinate-conditional passability. FEN_MUD in `drowned-fen` is currently pure visual dress, not a distinct passable state. Proposal: mirror `sites` with a `gates` map (`{requires: tag}`); `passable()` checks `gateAt()` against carried/equipped item tags before falling back to tile type. A "waders" accessory (existing `tags[]`) unlocks mud; the pattern generalizes to any future gate — no new equipment mechanics needed.

---

## ART-DIRECTOR

Screenshots opened: `2026-08-02-m10-overworld`, `m10-biome-perilous-verge`, `m10-city`, `m10-town-interior`, `m10-dungeon-visible-enemy`, `m11-combat` (localhost render via `docs/screenshots/`). Code read: `src/engine/palette.js` (accent model), `src/engine/tiledraw.js` (halo mechanism), `src/engine/city.js`/`citylife.js` (archetype system), `src/main.js` `renderCity`/`renderDungeon`/`drawBust`.

**1. Terrain differentiation — S/M, in two parts.**
Overworld/biome shots show the real problem: it's not "no color," it's that the one accent hue (orange flecks) scatters uniformly across all terrain rather than marking specific materials, and adjacent terrain types (the legend's "ground·walk" vs "water·blocked" swatches) sit too close in ramp value to separate at a glance. The CYCLOPEAN study's own finding is the fix, not a contradiction: accent must be **placed on meaning** (water, danger, interactables), never sprinkled as ambient texture. **(S)** Widen the base-ramp shade gap between adjacent terrain types (water pulled 1-2 shades darker/lighter than its neighbor ground) — pure value work, zero register risk. **(M)** Retarget `accent.shades`/`chance` per tile type in `main.js` (~line 890) so water gets dense, near-constant accent hits (reads as glinting surface) and mundane ground gets none — this is the single-accent-hue architecture (`palette.js` `accentColor`) working as designed, just aimed. Fold in the already-staged **dither-density trial**: denser/coarser dither per terrain family is the third lever and costs nothing new to build — just needs the side-by-side surfaced to Ray for the pick. Register-safe: no second hue, no flat fills, only where/how much of the one accent lands.

**2. World-map NPC density readability — S.** `m10-biome-perilous-verge` shows six wanderer sprites on one screen, all rendered at identical full-contrast halo strength — mundane folk and any dangerous beast read with equal visual weight, so a busy safe field and a genuinely dangerous one look the same. Recommend tiering the M10 A4 halo: full ramp-opposite contrast reserved for danger-flagged entities (already partially done — `beastAccent()` exists), common folk drop to a dimmer/thinner ring. That gives density itself a readable signal instead of uniform noise. Register-safe: halo mechanism unchanged, just weighted — no new draw path.

**3. Towns render identically — M.** Confirmed in code, not just feel: `renderCity()` (`main.js`) selects tile art purely by geometry (`CITY_GATE`/`STREET`/`WALL`/`BUILDING`) with **zero branching on `city.archetype`**, even though `city.js`/`citylife.js` already compute a real archetype (walled/pilgrimage/etc.) for text. The text differentiates; the art doesn't. Cheapest fix in-register: key the wall/street dither *pattern* (not hue) off archetype — a pilgrimage town's walls read denser/more worn than a garrison town's. The already-banked "city door glyphs" phase-2 item is the second lever (a per-service glyph on doors, silhouette-style, matching the bust language). `m10-town-interior` also confirms building interiors are a flat black screen + prose with zero header art regardless of building type — worth a cheap **(S)** per-service header glyph (shop/shrine/tavern silhouette) above the text, same silhouette-forward language as busts.

**4. FP enemy visibility floor — S (spec only).** `m10-dungeon-visible-enemy` shows `drawBust()` unconditionally paints a shade-0 backing + shade-5 border — when an enemy renders, it is never low-contrast. The intermittent-invisibility report is therefore a **presence bug** (QA's `enemyAhead()`/line-of-sight logic), not a contrast bug. Design floor to hold QA to: any enemy occupying the corridor cell in current facing must render every frame, full stop — visibility state must never depend on prior combat/flee flags. No art change needed once QA's fix lands.

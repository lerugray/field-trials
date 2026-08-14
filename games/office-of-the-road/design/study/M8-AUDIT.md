# M8 AUDIT — Genre-completeness + QoL

DESIGN-SEED M8: *Enumerate JRPG + roguelite + deckbuilder table-stakes … audit;
land or defer-with-reason each. Includes the mutation-during-automation class.*

Verdict key: **LAND** = present in the build · **PARTIAL** = present but narrow ·
**DEFER** = intentionally out of scope now, with reason. Every LAND names where it
lives; every DEFER states why (and, where relevant, flags it for the operator).

## JRPG table-stakes

| Feature | Verdict | Where / reason |
|---|---|---|
| Party of characters | LAND | `party.js` — 4 frames, HP + attrition |
| Class / job system | LAND | `jobs.js` — 6 in-register jobs, camp swap (the central verb) |
| Auto/turn combat | LAND | `combat.js` — SPD-ordered resolver + card interventions |
| Damage / heal formulas | LAND | `tuning.js` + `combat.js`, committed constants |
| HP recovery at cost | LAND | camp rest + the resupply sink |
| Equipment | LAND | `items.js` — arm/guard slots, stat overlay |
| Inventory | LAND | `party.inventory` + the quartermaster STORES |
| Shops | LAND | `shop.js` — the quartermaster (buy/sell) |
| Consumables / provisioning | LAND | resupply (supplies) — the always-open sink |
| Leveling / growth | LAND | job MASTERY (`meta.js`) — compounds across runs |
| World map / travel | LAND | the march + route table, now floored with Willibab tiles |
| Encounters | LAND | seeded road encounter ticker, weighted tiers |
| Bosses | LAND | boss tier (rare on the open road; the deck's job) |
| Quest log | LAND | the MANDATE — the Office's quest-chain, on the HUD |
| Save / load | LAND | `save.js` — continuous autosave + the returned docket |
| Score | LAND | `score.js` — code-composed, one track per state |
| Status effects | PARTIAL | guard/ward/stay/rally/ordinance exist in combat; **DEFER** broader ailments (poison/sleep/silence) — flagged for a combat-depth pass |

## Roguelite table-stakes

| Feature | Verdict | Where / reason |
|---|---|---|
| Run-based structure | LAND | expeditions (a run = a mandate chain to a terminus) |
| Permadeath → report | LAND | death files the causal report; the run ends |
| Meta-progression | LAND | certifications — job mastery is the currency |
| Unlocks | LAND | the certification wall (`certifications.js`) |
| Escalation / scaling | LAND | escalation curve keyed to deepest-leg-ever |
| Procedural generation | LAND | seeded road / terrain / mandate / shop / route |
| Run variety | LAND | world seed drives everything deterministically |
| Abandon / retreat | LAND | the FILE EARLY RETURN valve (banks reduced credit) |
| No-progress signal | LAND | the stalled-legs detector surfaces the valve loudly |
| Run history | LAND | the RECORD column on the docket (M8 inc1) |
| Determinism / replay | LAND | named RNG streams + the save-round-trip determinism probe |

## Deckbuilder table-stakes

| Feature | Verdict | Where / reason |
|---|---|---|
| Deck of cards | LAND | the tarot deck (`deck.js`), Pixel Tarot art |
| Card play in combat | LAND | the persistent hand + window states |
| Card acquisition / draft | LAND | the 3-card draft at victory |
| Deck editing / removal | LAND | THE FILE — camp deck review (removal at a supply cost) |
| Deck viewer | LAND | the deck-review screen shows the full list |
| Thin-deck discipline | LAND | 5-card start; removal at cost; zero-card routine law |
| Card rarity / weighting | DEFER | uniform draft pool v1 (flagged in the M3 ratify) — a later economy knob |
| Relics / persistent modifiers | DEFER | certifications + the mastery overlay serve the compounding role; StS-style relics are not modelled — flagged if the operator wants a distinct relic axis |
| Energy / per-turn cost | DEFER (by design) | deliberately NOT StS energy — cards are pause-first interventions, no per-turn budget (seed §M3: time pressure only as a chosen modifier) |

## QoL / feedback table-stakes

| Feature | Verdict | Where / reason |
|---|---|---|
| Save feedback | LAND | the FILED ✓ indicator (silent saves banned) |
| Kill acknowledgement | LAND | `(reduced)` + floating numerals |
| Damage / heal numbers | LAND | combat floats |
| Inventory feedback | LAND | STORES + slot chips with pack icons |
| Speed control | LAND | 0.5×–4× + hold-to-pause |
| Pause (first-class) | LAND | Space; cards resolvable while paused |
| Colour-blind support | LAND | CVD sim + a non-colour channel on every state distinction |
| Input parity (kb + mouse) | LAND | every surface, with an outline focus ring |
| Loud failures | LAND | the debug log + in-game fault banner + `E` export |
| Audio mute | LAND | `M`, with a visible indicator |
| Run summary | LAND | the causal filed report (not a stat dump) |
| Tooltips (hover) | PARTIAL | inline instrument text everywhere; **DEFER** hover tooltips — the numbers are always on screen, so low value |
| Settings screen | DEFER | speed/mute/seed are reachable (controls + `M` + URL); a dedicated options screen is deferred — flagged as QoL polish |

## The mutation-during-automation class — LAND (proven)

The seed's specific hazard: *attempt every camp/town edit while the march ticker is
live (or prove pause points hard-block).* **Proven hard-block:** `advanceTicks`
guards at the top so the march advances ONLY on the march screen; every edit
surface (camp / town / shop / deck / route / combat / docket / intake / defeat) is
a pause point where the ticker is frozen. And `step(march)` is pure w.r.t. the
party / deck / ledger — a tick cannot touch them. `test/automation.test.js` asserts
both: the march never mutates party/deck, and a mid-automation job-swap / equip /
deck-edit is applied EXACTLY once with no orphaned references.

## Summary

Table-stakes across all three genres are **LANDed**, with a small set of considered
**DEFERs** — none of them blockers: broader status ailments, card rarity/weighting,
StS-style relics, per-turn energy (out by design), hover tooltips, a settings
screen. The mutation-during-automation class is proven hard-blocked + tested. No
gap found requires landing before M9's acceptance battery + soak.

### Ratify notes (for the operator)
- The DEFERs above are the builder's calls; each is safe to leave for a later
  content/QoL pass. Flag any you want pulled forward before the STOP line.
- **Energy is DEFERRED BY DESIGN** (not an oversight) — the intervention contract
  is pause-first, not resource-metered. Confirm this reading.

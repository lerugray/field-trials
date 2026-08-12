# M8 — Genre-completeness audit + balance + onboarding

Enumerated table-stakes of the three references (Oddballz — the pet; Monster
Rancher — the rancher's year; Dragonseeds — the bloodline), audited against the
build, each LANDED or DEFERRED with a named reason. Balance verdicts are
bot-simmed (see `test/balance.test.js`, `test/pacing.test.js`), never hand-feel.

Legend: ✅ landed (pre-M8 or in M8) · 🆕 landed in M8 · ⏭️ deferred (reason) · N/A

## The pet (Oddballz lineage)

| Table-stake | Verdict | Where |
| --- | --- | --- |
| Summon a creature that looks alive, not a rect | ✅ | M1/M7 renderer, all 70 archetype rigs |
| Name your pet (rename, not just a coined default) | 🆕 M8 | header pencil → rename; `renameCreature` sanitizes + persists |
| Monster stats sheet (the five stats, readable) | ✅ | `renderCard` stat bars |
| Pet / poke / drag direct manipulation | ✅ | M3 care layer, pointer handlers |
| Snack pantry with discovered likes | ✅ | M3 `care.js` SNACKS + taste reveal |
| Snack discovery moment (feedback on a reveal) | 🆕 M8 | discovery toast + a persisted taste log line |
| Mood / bond / stress reactions | ✅ | M3 mood layer, reaction bubbles |

## The rancher's year (Monster Rancher)

| Table-stake | Verdict | Where |
| --- | --- | --- |
| Compressed-week schedule with before/after preview | ✅ | M2 planner |
| Aging that thins the action budget | ✅ | `lifeStage` young→prime→elder |
| Rank ladder E→D→C with entry fees + prizes | ✅ | M5 `career.js` |
| Mandatory tournament dates on a calendar | ✅ | M5 `nextMandatory`, meet-due UI |
| Announcer beats (pre-bout intro + result flourish) | 🆕 M8 | battle intro + KO flourish log lines |
| One-sentence battle log lines | ✅ | M4 `clashLine`/`obeyLine`/`refuseLine` |
| Non-death failure recovery, no softlock | ✅ | M5 free-E escape valve, `softlock.test` |
| Balance: E friendly, D contest, C a wall | 🆕 M8 | `balance.test.js`, bot-simmed |
| First-life pacing to ~45 active minutes | 🆕 M8 | `pacing.js` bracketed target invariant |
| Fast-forward / debug week-skip | 🆕 M8 | planner fast-forward (skip an idle week) |
| Pause | N/A | the loop is turn-based (weeks), nothing runs in real time to pause |

## The bloodline (Dragonseeds)

| Table-stake | Verdict | Where |
| --- | --- | --- |
| Retire alive into a visitable Meadow | ✅ | M6 Meadow overlay, pettable |
| Read-only retiree sheet | ✅ | M6 Meadow sheets |
| Inherit an egg with visible inherited traits | ✅ | M6 inheritance screen |
| Heir lineage ribbon / tooltip | ✅ | M6 `lineageRibbon` |
| Persistent estate across generations | ✅ | M6 save v6 |
| Adoption / lineage certificate export (PNG) | ⏭️ M9 | DESIGN-SEED assigns the certificate PNG to M9 |

## Onboarding & session hygiene

| Table-stake | Verdict | Where |
| --- | --- | --- |
| First-run tutorial prompts | 🆕 M8 | staged coach hints for a fresh player |
| Save feedback ("saved" pulse) | ✅ | header `saved` status |
| Load feedback ("welcome back" on restore) | 🆕 M8 | boot restore toast |
| Reduced-motion respect | 🆕 M8 | honors `prefers-reduced-motion` (calms idle/VFX) |
| Mute (procedural audio toggle) | ⏭️ M9 | DESIGN-SEED assigns all audio + mute to M9 |
| Full accessibility toggle panel | ⏭️ M9 | DESIGN-SEED assigns the toggle panel to M9 (M8 respects the OS pref) |
| Save export / import | ⏭️ M9 | DESIGN-SEED assigns export/import to M9 |
| Title screen + name pass | ⏭️ M9 | DESIGN-SEED assigns the title/name pass to M9 |

## Balance verdicts (bot-simmed, `test/balance.test.js` + `test/pacing.test.js`)

- **Rarity** — the roll tracks its weights within 3 points over 6000 draws; every
  rarity reachable, commons dominate legendaries. LOCKED.
- **Difficulty curve** — E winnable fresh (>70%) and dominated raised (>95%); D a
  fresh coin-flip (25–65%) that raising visibly lifts; C a wall fresh (<35%) that
  a full 20-week run clears (>55%); monotonic E≥D≥C at fixed prep. LOCKED.
- **Raising vs rarity** — stat bands overlap across adjacent rarities; a raising
  run out-adds a whole rarity tier, so a beloved common stays competitive. LOCKED.
- **Economy** — a steady player keeps a >100 cushion and climbs; no play style
  drives money negative; entry fees are real pressure (bot-sim disproved the naive
  "grinding always pays" — a reckless over-fighter bleeds fees). LOCKED.
- **Pacing** — a first life brackets [~16, ~58] min across fast/deliberate play,
  with the 45-min target comfortably interior. LOCKED.

Balance conclusion: the M4/M5/M6 first-pass numbers held up under simulation. The
balance pass RATIFIES them as invariants rather than overhauling — nothing was
found broken. Every deferral above names a DESIGN-SEED milestone that owns it.

## First-life timeline (hatch → retirement)

The shape of one first generation, from `raise.js`/`career.js`/`pacing.js`:

| Weeks | Life stage | Action budget/week | What's happening |
| --- | --- | --- | --- |
| 1–8 | Young | 12 | Big budget — build a base; first mandatory meet at week 5, E rung |
| 9–20 | Prime | 8 | Budget tightens; the training-vs-care-vs-rest squeeze bites; climb E→D→C |
| 21–29 | Elder | 4 | Few actions — every choice counts; bank a last promotion |
| 30 | Twilight | 4 | Retirement due (`isRetirementDue`) — graduate into the Meadow, breed the heir |

- **Mandatory meets** land every 4 weeks (≈7 across a life); missing one fines you,
  never demotes or ends the run.
- **Estimated wall-clock**: ~16 min (fast, mandatory bouts only) to ~58 min
  (deliberate, fights often), the 45-min target sitting comfortably interior.
- **Archetype note**: combat is stats + temperament + the POW/DEF/SPD triangle;
  affinity/archetype is cosmetic (M7 ratified), so no archetype confers a battle
  edge — cross-archetype balance is structural, and a well-raised member of any of
  the 10 archetypes competes on equal footing. Rarity only nudges starting bands,
  which overlap and are outweighed by raising.

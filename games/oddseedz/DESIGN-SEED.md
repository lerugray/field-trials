# ODDSEEDZ — design seed (founding contract)

Working title: **ODDSEEDZ** (operator's usage at fire time; a title pass stays open in M9).
A browser-native, fully code-generated monster-ranching toy: summon strange creatures from
phrases, raise them on a schedule, bond with them in a toy room, coach them through ranked
tournaments, retire them — alive — to a visible Memory Meadow, and seed the next generation
from what they were.

## The references (specific works, not genres)

1. **Oddballz (PF.Magic, 1996)** — the toy-room care layer: pets live AUTONOMOUSLY in one cozy
   scene (wander, nap, sulk, play, react); hand-cursor interaction (pet, poke, pick up, drag);
   a toybox; a snack machine with likes/dislikes discovered by feeding; moods readable at a
   glance. Gross-cute charm, not saccharine.
2. **Monster Rancher (Tecmo, 1997)** — the spine: the rancher's year. Schedule-driven raising
   in compressed weeks (drills, rest), stress/fatigue, money, ranked MANDATORY tournaments,
   lifespan and aging, obedience earned through the relationship, combine two monsters into an
   heir.
3. **Dragonseeds (Jaleco, 1998)** — summon-from-data, arena 1v1 with a legible move triangle,
   and the retirement answer: age → retire to a Memory Forest (alive, frolicking) → the next
   generation starts stronger via inheritance.

CLEAN-ROOM: characterize these from this document. Never download, extract, or copy assets,
sprites, sounds, or data from any of them.

## Stack (decided, not optional)

Vanilla JS + canvas, zero runtime dependencies, no asset pipeline, no network. Develop in
modules with a build script that emits a single self-contained `dist/index.html` (file://
double-click boots — this is the ONLY artifact the operator reviews). `node --test` suite,
deterministic/seeded, green in <60s. Autosave to localStorage from M1.

## The fused loop (the game)

**summon → raise by calendar → care/bond in the toy room → coached tournament → age →
retire to the Memory Meadow → inherit into the next egg.**

Laws that bind every milestone:

- **The cozy law**: no death, no corpses, no trauma spiral. Neglect makes a pet sulky or
  semi-feral, never gone. Retirement is graduation, not loss.
- **The Meadow is a museum, not a reserve bench**: retirees stay visible, animated, and
  pettable — but petting there is affection only. NOTHING in the Meadow restores stats,
  returns a retiree to the roster, or fights again. Their sheet becomes a permanent read-only
  record that feeds inheritance. (This is what keeps the time-cap ache honest.)
- **One action pool, two hungers**: care and training draw from the SAME weekly action budget.
  Care raises Bond but lets stats drift down; training raises stats but drains Bond/raises
  Stress. A 90-stat monster with low Bond visibly botches commands; a beloved weakling gets
  body-slammed. The player must split the pool — that tension IS the game.
- **Aging thins the budget**: the weekly action budget shrinks with age (young ~12 actions →
  peak ~8 → near-retirement ~4). The player feels the cap in shrinking bandwidth before any
  UI says "time's up."
- **Obedience is theatrical, not numeric**: low-Bond refusal shows hesitation, a glance away,
  an impulsive move, and a one-line reason ("Ignored Guard: Bond low, Stress high"). High Bond
  shows crisp response and rare "listened perfectly" moments. Bands + theater, not hidden
  psychology.
- **Battle legibility is non-negotiable**: 1v1, three-move triangle (Strike > Trick > Guard >
  Strike), stamina + cooldowns, visible enemy tendency, visible coach command, visible
  obey/refuse, and a battle log that explains every exchange in ONE sentence. If a result
  can't be explained in one sentence, the system is too complex.
- **Summoning always gives**: type a phrase (canonical) or drop a file (optional; local-only,
  byte-capped, hash-then-discard, "never uploaded" labeled) → deterministic hash → species +
  rarity + stat seed + temperament. Every input summons SOMETHING; discovered catalysts bias
  rarity/variants — bonus magic, never denial.
- **Inheritance is visible and simple**: two retirees (or one retiree + a "wild seed" fallback
  for generation one) combine into an egg carrying 1-2 boosted stats, one temperament
  tendency, parent badges, maybe a visual motif — plus the persistent estate (money, toys,
  facilities). No genetics charts, no fusion maze.
- **Lifespan (v1 constant)**: ~45 active minutes hatch-to-retirement via compressed weeks,
  with fast-forward and a debug skip. Attachment-long, provable-in-one-sitting-short.

## The cast

All 70 Buddies species exist as summonable roster entries, built as PARAMETERIZED ARCHETYPES:
8-10 shared body rigs × generated palettes × species silhouette parts × rarity frames, with
shared idle/hit/recoil animations and ~5 generic VFX families. All 70 exist; none get bespoke
animation projects before M6. Rarity maps to egg/summon tiers.

- Common (14): Anchor, Bee, Cat, Corgi, Cow, Duck, Frog, Gorby, Hamster, Pig, Potato, Rat, Slime, Taco
- Uncommon (18): Axolotl, Bat, Box, Coopa, Crab, Dice, Dolphin, Fox, Goblin, Imp, Moth, Owl, Panda, Parrot, Penguin, Raccoon, Rooster, Snail
- Rare (17): Bac Man, Basilisk, Cane Toad, Capybara, Coffee, Dali Clock, Doobie, Dragon, Jellyfish, Joe Camel, Kobold, Mantis Shrimp, Mushroom, Octopus, Orca, Sanic, Wolf
- Epic (12): Beholder, Burger, Chonk, Clippy, Comrade, Kilowatt, Kraken, Mimic, Phoenix, Robot, Tardigrade, Unicorn
- Legendary (9): Claude, Cosmic Whale, Ghost, Illuminati, Starspawn, Tree, Void Cat, Yog-Sothoth, Zorak

## The aesthetic law

Toy-like affection from code-generated art: readable silhouettes, expressive eyes,
squash-and-stretch, emote/reaction bubbles — charm over detail. The failing test, asked at
every proof shot: **"does it look cheap?"** Bare rects or markers standing in for creatures
are a DEFECT, not an increment. Legibility floor underneath the charm: every creature clears
readable contrast on every ground it appears on; game text never clips; every player-blocking
state answers visibly in-world.

## Milestones (build order; each ends battery-green + committed + pushed, with a dated proof shot)

- **M1 — Shell, roster data, deterministic summon.** Single-page shell w/ save/load; 70-species
  data table; phrase summon → species/rarity/seed/stats + a visible, animated, non-cheap pet.
  Proof: phrase → pet on screen + reload persistence.
- **M2 — Schedule-driven raising.** Compressed-week calendar: drills, rest, stress, fatigue,
  stat deltas shown BEFORE confirming a week, money, aging tick, thinning action budget.
  Proof: a week resolves on screen with visible before/after.
- **M3 — Toy-room bond layer.** Pet/poke/drag, toybox, snacks w/ discovered likes; Bond,
  Stress, mood, temperament states with visible reactions; care and training share the pool.
  Proof: an interaction changes mood/Bond and the pet behaves differently after.
- **M4 — First coached tournament.** One E-rank battle end-to-end: triangle, stamina,
  cooldowns, coach command, obey/refuse theater, win/loss, prize, one-sentence log lines.
  Proof: a commanded exchange with visible obey/refuse + explanation.
- **M5 — Rank ladder + economy pressure.** E→D→C with entry fees/prizes, mandatory tournament
  dates, training/rest tradeoffs, non-death failure recovery, no softlocks (bot-simulate
  careless/balanced/min-max players; generous first-generation economy).
  Proof: rank, money, age, next mandatory date, battle/prize log on one screen.
- **M6 — FULL LINEAGE LOOP (the gate).** summon → raise → tournament → retire (visible in the
  Meadow, pettable, read-only sheet) → inherit new egg with visible inherited traits.
  NOTHING from M7+ starts until this is proven on screen.
  Proof: retired parent frolicking + inheritance screen + heir tooltip showing lineage.
- **M7 — 70-species archetype pass.** All 70 summonable/viewable via archetype rigs, palettes,
  silhouettes, affinities, basic battle poses/VFX.
  Proof: all-70 grid + battles showing 3+ archetypes visibly distinct.
- **M8 — Genre-completeness audit + balance + onboarding.** ENUMERATE the table-stakes of the
  three references (naming your pet, monster stats sheet, tournament calendar/announcer beats,
  Meadow visiting, snack discovery log, save/load feedback, first-run tutorial prompts, pause/
  fast-forward/mute, reduced-motion, adoption/lineage certificate export…), AUDIT the build
  against the list, land the misses or defer each with a named reason in PROGRESS.md. Tune
  first-life pacing; validate no common softlock; battle logs readable.
  Proof: the checklist with land/defer verdicts + a first-life timeline summary.
- **M9 — Final polish package.** Procedural squeaks/blips per archetype (mute mandatory),
  visual juice, save export/import, adoption/lineage certificate PNG, accessibility toggles,
  title screen + name pass (surface title candidates for the operator — ODDSEEDZ is the
  working title, not necessarily the shipped one), stable single-file build.
  Proof: a 60-90s capture of the full loop, summon to certificate.

**Stop at M9. Everything further is operator-directed.**

## Anti-scope (cut ruthlessly; adding any of these is a defect)

No Claude-Code/session integration. No network, multiplayer, BBS, sharing. No arcade
minigames, no MUD. No fusion recipes / deep genetics / breeding charts (inheritance as
specified only). No expeditions beyond at most one simple event card. No team battles, no
direct-control combat. No gear/inventory economy beyond simple estate upgrades. No death.
No file storage/upload of any kind. No IP-cleanup work in v1.

## Failure smells (self-check every session)

Toy room ignorable while tournaments stay winnable · care-only play progresses without
training · Bond changes only as a number · refusals without theater + reason · unexplainable
battle outcomes · an always-best schedule action · money irrelevant OR softlocking ·
retirement reads as deletion · heirs inherit nothing visible · species polish delaying M6 ·
summoning feels unsafe or stingy · the full loop can't be shown inside an hour.

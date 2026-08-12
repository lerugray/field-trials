# CHP loop critique — fresh three-role studio panel (2026-08-10)

Commissioned by Ray: "the loop may not be really tight enough yet and it still might play
as more of an art project than an actual game." Three independent panelists: game-designer
(loop vs the crawler form), systems-designer (code-grounded teeth audit), fresh-player
(two real permadeath runs via Playwright, ~60 screenshots, no state-peeking). Register is
ratified and untouched — every finding is stakes/loop, not aesthetics.

## Converged diagnosis

The game has a SPINE (the Manual's five Operations genuinely gate, post-08-07 fix) and a
world-class register. Minute-to-minute play lacks three things, and all three panelists
hit the same wall from different sides:

1. **Nothing PULLS.** The fresh player walked 150+ tiles of flavor text with a blank fog
   map, no destination on screen, and no reason to pick a direction. The engine ALREADY
   computes compass-word rumors for every site and gate (`talkPointers`/`dirWord`,
   src/main.js) — they are simply never surfaced. Walking is blind roulette between
   lethal ambushes.
2. **Nothing CLOCKS.** No resource pressure anywhere: rest is free until the world's
   first clear and near-free after; no hunger/torch/turn budget; encounter tables are
   the same flat fat-tail roll from Operation 1 through 4 (single binary flip at op-5);
   idling and grinding are always safe. The exposure/FNORD stat exists and accrues — but
   only feeds cosmetic journal corruption, never gameplay pressure.
3. **Nothing BINDS.** Money is the only thing that survives permadeath and nothing
   mandatory ever consumes it; maxHp is 12 forever; death rerolls a stranger with world
   state untouched — the fat-tail's bite never outlives the single fight. Combat locally
   threatens (a 1/100 pack can deal 9-30 vs 12 HP round 1 — the fresh player died to it
   WHILE GUARDING) but across a session is decorative.

Two hard defects from the play session, severity beyond critique: (a) confirm-mash at
character creation both accepts the first stranger AND enters the overworld — the
unlimited-reroll system is skippable unnoticed by a normal Space press; (b) Guard did not
visibly matter against a round-1 one-shot — whatever the math intends, the player-legible
answer to "did my choice do anything" was no.

## Tightening package (ranked; leans marked)

| # | Change | Cost class | Source |
|---|---|---|---|
| 1 | Surface the bearing: HUD line showing the active Operation's compass word (from existing talkPointers/dirWord) from minute one | trivial (wiring) | fresh-player's "one change" |
| 2 | Wire exposure/FNORD as a live clock: visible accrual in the crawl HUD + a real consequence tier (hostility/encounter weight rises with exposure) — push-or-retreat becomes a decision | one system | game-designer #3 |
| 3 | Escalate encounter+loot tables by Operation number (ops 2-4 currently identical to op-1) | data tune | game-designer #1 |
| 4 | Guard legibility + creation-mash fix: guard visibly reduces/blocks the hit or visibly breaks; Space at creation confirms only, second input to embark | small | fresh-player defects |
| 5 | Money gets a mandatory sink: post-first-clear rest offering priced in coins; death burns a share of the purse | constants + small system | systems #1/#2 |
| 6 | Bank/retreat: loot past a dungeon's milestone is unbanked until exit; die/flee loses it | one system | game-designer #2 |

**[LOCK lean: fire 1+2+3+4 as ONE tightening lane]** — they convert art-project energy
into game stakes using systems that already exist, zero new content, register untouched.
5+6 second wave after Ray plays the result. Panel full texts: session transcripts;
grounding cited in-line (encounters.js lock header, session.js:49/169/206, shop.js:34,
character.js:25, main.js:295-315).

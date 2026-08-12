> **PROVENANCE**
> - **Source URLs** (all fetched live 2026-08-07):
>   - https://www.r-s-g.org/kriegspiel/about.php — history
>   - https://www.r-s-g.org/kriegspiel/rules.php — overview
>   - https://r-s-g.org/kriegspiel/rules_units.php — units
>   - https://r-s-g.org/kriegspiel/rules_movementandattack.php — movement & attack
>   - https://r-s-g.org/kriegspiel/rules_specialrules.php — special rules
>   - https://r-s-g.org/kriegspiel/rules_howtowin.php — victory conditions
>   - https://r-s-g.org/kriegspiel/faq.php — FAQ
> - **Archived copies (permanence backup, all confirmed live via the Wayback "available" API
>   2026-08-07):**
>   - http://web.archive.org/web/20260514232943/https://r-s-g.org/kriegspiel/rules.php
>   - http://web.archive.org/web/20260514232944/https://r-s-g.org/kriegspiel/rules_units.php
>   - http://web.archive.org/web/20260518101351/https://r-s-g.org/kriegspiel/rules_movementandattack.php
>   - http://web.archive.org/web/20260514232943/https://r-s-g.org/kriegspiel/rules_specialrules.php
>   - http://web.archive.org/web/20260514232945/https://r-s-g.org/kriegspiel/rules_howtowin.php
>   - http://web.archive.org/web/20260514232943/https://r-s-g.org/kriegspiel/about.php
> - **What this is:** the published "How to Play" rules pages for the Radical Software
>   Group's *Kriegspiel* — Alex Galloway (NYU professor, founding RSG member)'s digital
>   re-implementation of Debord's *Le Jeu de la Guerre*, built (per RSG's own history page)
>   from thorough research into Debord's original rules with the explicit aim of
>   "re-enacting the game's algorithm" faithfully in a new medium. Currently distributed as a
>   Mac/iOS app; this rules documentation is posted openly on RSG's public site as the app's
>   how-to-play reference.
> - **Why legitimate to hold:** RSG is the publisher of this documentation; it is posted
>   openly on their own public site for players, no login/paywall. It is a secondary
>   (re-implementation) source, not the original designer's rules text — used here to
>   corroborate the Debord/Nicholson-Smith primary source (see
>   `debord-nicholson-smith-official-rules.md`), not as the sole authority. Where the two
>   disagree in wording, the Debord/Nicholson-Smith translation is the higher-authority
>   source, since it is the designer's own published rules text.
> - **Fetched via:** WebFetch (page rendered, not raw HTML scrape) — quoted fragments below
>   are verbatim as returned; paraphrased connective text is marked as such.
> - **Note on legal history:** the RSG about page and multiple secondary sources (Artforum,
>   notbored.org) record that a lawyer for Alice Becker-Ho (Debord's widow) once sent a fax
>   demanding institutions "suppress any connection" between this computer game and Debord's
>   work; one venue complied by physically relocating the installation. Recorded here for
>   context only — it does not affect the legitimacy of citing RSG's own published rules text
>   for verification purposes, and has no bearing on this project's own IP posture (see
>   `CLAUDE.md` rule 1: original prose, no Debord/Becker-Ho branding on player-facing
>   surfaces).

---

## History (about.php)

Guy Debord founded "Strategic and Historical Games" in January 1977 to produce Kriegspiel, a
chess variant inspired by Clausewitz's military theory and Napoleon's campaigns. The game
features a 500-square board (20×25 squares) for two opposing players. Debord initially
produced a limited edition in summer 1977 with silver-plated copper tokens. He completed the
rulebook by June 1978. In 1987, the game was mass-produced on cardboard with wood tiles,
accompanied by a book co-authored with Alice Becker-Ho.

The computer edition began in the mid-2000s as a research project by Alexander R. Galloway
(NYU professor) to reinterpret Debord's game for contemporary contexts.

## Overview (rules.php)

**Board:** "The game board contains 500 squares arranged in a 20 by 25 configuration. It's
divided into northern and southern territories, each featuring: one mountain range (9
squares), a mountain pass, two arsenals, and three fortresses."

**Communications:** "Players maintain communication networks powered by immobile arsenals
that radiate lines in vertical, horizontal, and diagonal directions. Two mobile relay units
per player reflect communication lines. Friendly units must stay connected to avoid
capture."

**Victory:** "The object of the game is to destroy the opponent, either by eliminating all
its forces, or by destroying its two arsenals."

## Units (rules_units.php)

Starting roster: 9 infantry, 4 cavalry, 1 cannon, 1 swift cannon, plus 1 relay + 1 swift
relay (support units, per rules_specialrules/howtowin cross-reference).

| Unit | Attack | Defense | Move | Range | Notes |
|---|---|---|---|---|---|
| Infantry | 4 | 6 | 1 | 2 | — |
| Cavalry | 4 (7 charging) | 5 | 2 | 2 | "charge" raises attack to 7 when adjacent to enemy |
| Cannon | 5 | 8 | 1 | 3 | |
| Swift Cannon | 5 | 8 | 2 | 3 | "identical to the normal cannon in attack, defense, and range" |
| Relay | — (no attack) | 1 | 1 | — | |
| Swift Relay | — (no attack) | 1 | 2 | — | otherwise identical to normal relay |

**Fortifications:** "Fortifications provide defensive bonuses of +2 (passes) or +4
(fortresses) to infantry and cannons." Mountains are impassable and block communication.

*(Cross-check: this table's numbers match the Debord/Nicholson-Smith primary source exactly
for infantry (atk4/def6) and cannon (atk5/def8 base), and for the pass/fort defense bonus
pattern — RSG's "+4 at a fortress" corresponds to Debord's absolute values of 10 (infantry)
and 12 (artillery) at a fort, i.e. base+4 in both cases. RSG's cavalry table lists a flat
"base attack of 4... charge increases attack to 7" which matches Debord's text precisely.)*

## Movement & Attack (rules_movementandattack.php)

Before play, "players position units freely in their territory." "A roll of the dice
determines who moves first." Each turn: move "up to five units each turn, followed by a
single attack." No unit moves more than once per turn.

**Combat resolution:** attack power = "summing all the offensive power in range of an enemy
target square"; compared against "a summation of all the defensive power supporting the same
target square." Power flows in "straight line, either vertically, horizontally, or at 45º
diagonals." Worked example given: North attacks with 30 total points against South's defense
of 24 points at square E5.

**Outcomes:**
- **Capture:** offense exceeds defense by 2+ points
- **Forced Retreat:** offense exceeds defense by exactly 1 point — defender "is obligated to
  move the unit at the commencement of its next turn" and cannot attack that turn
- **Secure:** offense ≤ defense

*(This is an exact match to Debord's §3 Tactical Engagement thresholds — RSG did not alter
the designer's combat math.)*

## Special Rules (rules_specialrules.php)

**Occupancy:** "Only one unit at a time may occupy an arsenal, fortress, mountain pass, or
other square."

**Fortresses:** "Fortresses are not allied with a faction and can be occupied by any unit
from either side. Fortresses do not propagate communication and cannot be destroyed."

**Arsenals:** "An arsenal is destroyed if it is occupied by the enemy. Only empty arsenals
can be occupied." Destroying an enemy arsenal counts as a single attack that turn, preventing
additional attacks. Relay units cannot destroy arsenals (no offensive capability).

**Cavalry restrictions:** "Cavalry can not charge against a fortress or mountain pass; any
cavalry currently occupying a fortress can not participate in a charge (although charging
while in a pass is allowed)."

## How to Win (rules_howtowin.php)

Three win conditions, any one sufficient:
- **(A) Arsenal Destruction:** "Destroy the enemy's two arsenals"
- **(B) Unit Elimination:** "Destroy all enemy combat units"
- **(C) Relay and Offline Strategy:** "Destroy the enemy's two relays and force all remaining
  units offline"

*(Note: (C) as phrased by RSG is not stated as an independent win condition in the
Debord/Nicholson-Smith primary text — Debord's text ties victory strictly to (A) arsenal
capture or (B) elimination of all fighting units, and separately notes communications units
"having no offensive strength, cannot eliminate an arsenal." RSG's condition (C) reads like
a practical corollary of (A)/(B) — destroying both relays plus isolating the rest of the army
would eventually force elimination or arsenal loss anyway — but it is RSG's own framing, not
verbatim Debord. Flag any ledger row built on (C) as RSG-sourced, not designer-sourced, and
prefer (A)/(B) framing from the primary source where the two could conflict.)*

## FAQ (faq.php)

Mostly app-distribution logistics (iOS/macOS system requirements, no ads/IAP, Game Center
login for multiplayer) — not mechanically relevant. One useful pointer: for deeper historical
context, the FAQ recommends Alexander R. Galloway's book *Uncomputable: Play and Politics in
the Long Digital Age*, "Crystalline War" section — not fetched (not freely available online;
would need library access) but noted here as a further-reading pointer.

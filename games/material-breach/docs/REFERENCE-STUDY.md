# REFERENCE STUDY — Dungeon Keeper, characterised clean-room

**M0 deliverable. Documentary, not empirical.** Dungeon Keeper (Bullfrog, 1997) is the named
reference. This study is a **documentary characterisation** written from what is available to the
project (design memory, published descriptions, the ratified brief), **not** a teardown of a
running build. Dungeon Keeper is almost certainly not installed on any of Ray's machines and was
not run. Where this document states a convention, it states it as a characterisation to design
against, not as a measured fact lifted from the game.

**Clean-room throughout.** No reference-game names, room names, creature names, text or trade
dress appear anywhere in the shipped game. Every department and post below is named in this game's
own institutional register. The purpose of the study is to fix which conventions we KEEP and which
we CUT, per the ratified brief (DESIGN-SEED §2), because the CUT list is as load-bearing as the
KEEP list: Ray's framing was "the reference without the genre's trappings."

---

## 1. The shape we are matching

The reference's core loop is: **carve a dungeon out of solid rock, build rooms that attract
creatures, keep those creatures fed / paid / rested or watch them revolt, manufacture defences,
and repel heroes who invade to loot a single central object.** The player is the keeper, not an
adventurer. That inversion — you are the building, the heroes are the incident — is the whole
premise, and it is what MATERIAL BREACH keeps and turns administrative.

What the reference does in real time, MATERIAL BREACH does in paperwork. That is the one
deliberate divergence, and it is a law (DESIGN-SEED §3), not a shortcut.

---

## 2. The room set (characterised), mapped to our departments

The reference's rooms are **areas carved from rock**, not building slots, and their **size drives
their effectiveness** (a bigger library researches faster). We keep that exactly (KEEP #1, #2).
Each reference function maps to a department named in our own register:

| Reference function (characterised) | Our department (`ROOM`) | KEEP served |
|---|---|---|
| The working face / dig frontier | **Excavation** | #1 carve, #5 worker caste |
| Gold store, capacity-bounded | **Treasury** | #2 size drives capacity |
| Research / study room | **Records** | #2 size drives research rate |
| Workshop that manufactures defences | **Fabrication** | #6 traps and doors have lead time |
| Prison / holding for captured heroes | **Holding** | #9 capture-and-convert head |
| Lair / rest | **Quarters** | #4 staff needs |
| Hatchery / food | **Commissary** | #4 staff needs |

Rooms are areas with a **quality curve**, implemented as `roomQuality(tileCount)` in `src/model.js`:
linear up to a soft cap of six tiles, sub-linear beyond it. The sub-linear tail is deliberate — it
is what makes "dig one enormous room and nothing else" a losing strategy (the degenerate probe,
DIRECTIONS fold 12).

---

## 3. The needs model (characterised)

Reference creatures are not units you command; they are **staff with needs** who arrive because the
amenities exist, and who leave, strike or turn on the keeper when neglected. We keep this as the
single most admin-shaped mechanic (KEEP #3, #4). Characterised needs, mapped to our model:

- **Food.** Satisfied by the Commissary. Modelled as `staff.needs.food` (0..100), decaying per
  cycle (decay wired in M3).
- **Rest.** Satisfied by Quarters. Modelled as `staff.needs.rest` (0..100).
- **Pay.** Satisfied on payday out of a capacity-bounded treasury. Modelled as `staff.wage`,
  `staff.missedPaydays`, and the treasury's finite `capacity`.

Neglect has a graduated consequence, not an instant one: a grievance is filed, then morale falls,
then the staffer resigns or defects. Our numbers (DIRECTIONS fold 15): a grievance at two
consecutive missed paydays, a quit roll at three. A **skeleton-crew floor** (fold 11) keeps the
count from collapsing to zero — the last three stay, unpaid and grieving, rather than quitting the
facility out of existence.

Per DIRECTIONS fold 3, each archetype carries two or three named grievance triggers (room
adjacency, wage sensitivity, hazard tolerance) so the systems differentiate a cast that the
licensed art cannot. Archetypes: **Drudge** (the worker caste; digs, claims, hauls, drags),
**Clerk** (records and correspondence), **Artificer** (fabrication), **Warden** (holding and
conversion).

---

## 4. Payday cadence (characterised)

In the reference, creatures are paid periodically from the gold store, and an unpaid creature is a
liability. We keep the periodic payday against a finite treasury (KEEP #4). Characterised and set
to our numbers: **payday every three cycles** (DIRECTIONS fold 15). The treasury has a hard
ceiling — `treasuryCapacity(treasuryTiles) = base + tiles × 100` — so gold overflows and is lost if
the Treasury is too small, which is the reference's "your gold store is full" pressure expressed as
capacity rather than as a real-time overflow.

Payday is the loudest recurring administrative event and the spine of the wage economy. It is where
"more admin" actually lives, and it is reported in the register: *"Payday was observed. Twelve of
nineteen posts were paid in full."*

---

## 5. The conversion chain (characterised)

The reference lets the keeper **capture** invading heroes, **imprison** them, and eventually
**convert** them into working members of the dungeon. This is the mechanic that makes defence
produce capital rather than merely consume it (KEEP #9). We keep the full pipeline:

**capture → Holding (detention) → conversion → the captured raider becomes staff.**

The facility starts with minimal free detention capacity — **one cell** (DIRECTIONS fold 14) — so
the pipeline is reachable before the economy can afford to build more. A converted raider joins the
staff as a working member with the same needs, wages and grievance model as anyone hired; it is
recorded as an operational output, never narrated as a triumph (DESIGN-SEED §4.2).

---

## 6. The single loss object

The reference has **one central object** the heroes walk toward; lose it and the game ends. Not a
"leak N units" counter — a single thing at the centre (KEEP #8). Our name for it, set here in M0
in register: **the Cornerstone**. It bears the founding charter. When raiders reach and breach it,
the structure and the charter fail as one filed event — the material breach the game is named for.
Its `condition` runs 0..100; zero is the terminal loss state. (This naming is a register call and
is listed in PROGRESS for the operator to ratify.)

---

## 7. The CUT list — as load-bearing as the KEEP list

Cut verbatim from the ratified brief (DESIGN-SEED §2), restated so no increment reintroduces them:

- **Real-time pace of any kind.** No wave timers, no countdowns, nothing that resolves while the
  player is reading. Replaced by the pacing law (DESIGN-SEED §3), enforced structurally by Gate 1.
- **Worker micromanagement, the slap, possession mode, direct unit orders — the RTS layer
  entirely.** The player issues works orders and assignments; the worker caste executes them during
  COMMIT. There is no direct control of a unit.
- **Hand-picking creatures from a roster.** Staffing is downstream of facilities: build the amenity
  and the applicants arrive (KEEP #3). A roster pick would violate it.
- **Tower-defense furniture:** lanes, a path preview with a "leak" counter, DPS / tier upgrade
  trees, between-wave shops, difficulty sliders framed as wave count. None of it ships.

These cuts are why the game must match the reference's *specific* conventions and never "the
tower-defense genre's." The genre is not the reference; the reference is the reference.

---

## 8. What M0 built against this study

The data model in `src/model.js` implements the room set (§2), the needs model (§3), the payday and
treasury numbers (§4), the detention seed for the conversion chain (§5), and the single loss object
(§6), all as pure data. The pacing law that replaces the real-time layer (§7) is enforced in
`src/cycle.js` and asserted by Gate 1. The register the whole thing speaks in is fixed in
`docs/REGISTER-SEED.md`.

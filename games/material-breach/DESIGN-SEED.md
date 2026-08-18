# MATERIAL BREACH — DESIGN SEED

Founded 2026-08-14. Ratified scope brief:
`generalstaff-private/docs/gauntlet-seeds/reverse-dungeon-admin-SCOPE-2026-08-14.md`.

**Collection contract: v0, conforming.**

Name status: **MATERIAL BREACH**.
The slug does not change if the name does; rename at Ray's word only.

---

## 1. The game

You are the facility manager of a dungeon. You do not adventure. You excavate, staff, requisition,
pay wages and answer correspondence, and then you sign the cycle over and read what happened to
your building while you were doing paperwork.

Adventurers raid you. They are the incident, not the opponent. Their escalation is
**bureaucratic**: a Royal Surveyor, then a Guild Auditor, then a Licensing Inspector, each
carrying a non-combat instrument (a schedule of dilapidations, a tax lien, a condemnation order)
that must be answered administratively rather than fought. Killing the man who served the notice
does not withdraw the notice.

Session target: 20 to 40 minutes for a full tenure.

---

## 2. Reference — Dungeon Keeper (Bullfrog, 1997)

The named reference is Dungeon Keeper. Match **Dungeon Keeper's specific conventions**, never
"the tower-defense genre's." Per `match-reference-game-conventions`, the CUT list is as
load-bearing as the KEEP list, because Ray's framing was explicitly "without the genre's
trappings."

**Clean-room throughout.** Characterise, never copy. No Bullfrog names, room names, creature
names, text or trade dress. Every room and post in this game is named in its own register: they
are departments and posts, not "Torture Chamber." Dungeon Keeper is almost certainly not
installed on any of Ray's machines; M0's study is a **documentary** characterisation written
from what is actually available, not an empirical teardown of a running build. Say so in M0's
output rather than implying otherwise.

### KEEP (verbatim from the ratified brief)

1. **The dungeon is CARVED, not placed.** You excavate rooms out of solid rock; you do not drop
   turrets on open ground. Rock, gold seams and unclaimed floor are the raw material.
2. **Room size drives effectiveness.** A bigger library researches faster. Rooms are areas with a
   quality curve, not building slots with a level number.
3. **Rooms attract staff; you never buy a monster.** Build the amenity and the applicants arrive.
   Staffing is downstream of facilities, which is the single most admin-shaped mechanic in the
   reference.
4. **Staff have needs, wages, morale, and the option to quit.** They eat, sleep, get paid on
   payday out of a treasury with finite capacity, and go on strike, defect, or turn on you when
   neglected. This is where "more admin" actually lives.
5. **A worker caste that is not a combat caste.** The workforce digs, claims floor, fortifies,
   hauls gold and drags bodies. It is a logistics layer, not an army.
6. **Traps and doors are MANUFACTURED, with lead time.** A workshop and a production queue, not a
   purchase menu.
7. **Territory is claimed, and claiming spreads.** Floor must be claimed before it is useful.
8. **One loss object.** Not "leak N units." A single thing at the centre that the raiders are
   walking toward. (This game's name for it is set in M0, in register.)
9. **The capture-and-convert pipeline.** Detention, then conversion, then the captured raider
   becomes staff. Defence produces capital instead of merely consuming it.
10. **The sardonic institutional narrator.** The register bridge; it is already in the reference
    and is not an import.

### CUT (verbatim from the ratified brief)

- Real-time pace of any kind; wave timers; countdowns; anything that resolves while the player is
  reading.
- Worker micromanagement, the slap, possession mode, direct unit orders: the RTS layer entirely.
- Hand-picking creatures from a roster (violates KEEP #3).
- Tower-defense furniture: lanes, a path preview with a "leak" counter, DPS/tier upgrade trees,
  between-wave shops, difficulty sliders framed as wave count.

---

## 3. THE PACING LAW

> **The player advances the clock; the clock never advances on the player.** There is no wave
> timer, no build-phase countdown, no "next wave in 0:15." The administrative phase is untimed and
> unlimited. Nothing resolves until the operator signs the cycle over. **Any real-time pressure is
> a defect.**

This is enforced **structurally, not by discipline**. The engine has no wall-clock input to game
logic. Simulation advances only inside `commitCycle()`. There is no `setTimeout`/`setInterval`
that mutates game state, and no `requestAnimationFrame` callback that advances the sim; RAF draws
and animates presentation only. **A standing test asserts this** (see Gate 1).

### The cycle

**ADMINISTRATION** (untimed: works orders, staffing, wages, requisitions, correspondence)
→ **the operator signs the cycle over** → **RAID resolves automatically** (no input, watchable,
skippable, deterministic) → **AFTER-ACTION REPORT**: casualties both ways, gold lost, structural
damage, claims backlog, grievances filed.

**The report's contents ARE next cycle's paperwork.** Damage becomes repair orders; deaths become
requisitions; unpaid staff become grievances; a served notice becomes a deadline expressed in
cycles. The loop closes through paperwork. A report line that generates no administrative
consequence is a defect: it means the game printed flavour instead of state.

---

## 4. Register laws

These are laws. A milestone that violates one is not complete, whatever its tests say.

### 4.1 The VOICE law — institutional-defensive

All player-facing text is the voice of **an organisation documenting its own losses in order to
limit its liability.** Named references, specific rather than genre: *Brazil* (Gilliam, 1985), the
workplace incident report, the insurance loss adjuster's assessment. The comic engine is that a
party of paladins disembowelling the night shift is filed as an occupational incident with a
root-cause analysis and a corrective-action owner.

**Exemplar lines. This is the tone; write to this bar.**

> Night shift (4) did not report for the following cycle. Their absence is recorded as unplanned
> and is not attributable to any deficiency in the posted evacuation procedure.

> The east gallery is no longer load-bearing. Personnel are reminded that the gallery was never
> designated a route of travel and that its use was at all times discretionary.

> A Royal Surveyor entered the premises at Level 2 without presenting credentials at the counter.
> The facility's obligation to admit him is under review. He has been admitted.

> Payday was observed. Twelve of nineteen posts were paid in full. The remainder have been issued
> a written explanation, which they have acknowledged receipt of.

Note what each one does: it is exact about the number and evasive about the cause. That split is
the next law.

### 4.2 The INSTRUMENTS-NEVER-LIE law (inherited house discipline, adopt, do not re-derive)

**Prose deflects; instruments are exact.** Flavour text is deadpan and evasive about *why*. The
ledger, the manifests, the tooltips, the works orders and the damage report are numerically
complete and never ironic. **Every flavour string ships a plain numeric neighbour.**

**Anti-triumph:** no outcome is ever narrated as a victory. It is recorded as an operational
output. A wiped raiding party is "reduced to zero effective members," filed as a resolution of the
incident, not as something the facility sought.

### 4.3 Voice anti-patterns (each is a defect)

Epic-fantasy earnestness. Snark, memes, or winking at the player. Grimdark relish. Exposition
dumps. Any joke that knows it is a joke. **No em-dashes in player-facing text, ever.** The horror
and the comedy both come from the flatness of the filing.

### 4.4 The ART law

**The facility is CODE-DRAWN**, as an **architectural cutaway / section drawing** of a building:
room boundaries, load paths, claimed territory, damage annotations, works-order overlays. It is a
diagrammatic instrument and therefore inherits the instruments-never-lie law. It is also what
makes this game visually unmistakable from its sibling THE OFFICE OF THE ROAD, which matters.

**The cast is LICENSED PACK art** (`~/Desktop/Dev Work/pixel-art-library/extracted/`,
`~/Desktop/Dev Work/asset-library/`): the staff you employ and the raiders who come for you.

> ### ⛔ SUPERSEDED-AS-CAST 2026-08-14 (Ray) — the monster-pack line below is DEAD TEXT.
>
> Ray ratified an **all-human cast** at the M7a verdict ("keep the human cast"). The game's
> register is **drab-versus-armed**, not monster-versus-human. **`Dark-Fantasy-Enemies`,
> `Mythic-Monsters-I`/`II` and `Enemy_Galore_*` are NOT the cast source for this game** and must
> not be introduced into it in any role. They are separately disqualified on technique: 64x64
> native against a 14-26px cutaway cell means downscaling pixel art, which breaks §4.5 item 1.
> **The whole cast is one pack, one scale, one idiom, one licence:**
> `NPC Pack — Human Empires` (Willibab / Monsteretrope, CC BY 4.0).
> Reopening this needs Ray's word, not a builder's judgement.
> Tombstone: `docs/DIRECTIONS-2026-08-14-m7b-cast-and-art-ratified.md` §2.

Candidates named at founding, **the staff line struck per the notice above**:
~~`Dark-Fantasy-Enemies`, `Mythic-Monsters-I`/`II`, `Enemy_Galore_*` (staff)~~;
`NPC-Pack---Human-Empires` (the whole cast, as shipped), `Fallen-Knight`,
`My_Character_Creator_Pack`; `Willibab-s-Retro-Icons`, Kenney All-in-1 (UI);
`Not Jam Font Pack` (ledger type, picked and closed at M7a r2).

**LLM-image-generated art is BANNED OUTRIGHT.** It would close the paid door for no gain. Licensed
packs and code-drawn art are both paid-eligible per `art-provenance-gates-commercial-release`.
Willibab packs carry CC BY: **ATTRIBUTION.md is mandatory and ships inside every build.**

**Placeholder is a defect, not a stage.** Any placeholder that survives its milestone is a
BLOCKER at the next gate.

### 4.5 The VACUUM SEALED technique stack (binds; technique only, register never transfers)

Verbatim, from the teardown at
`generalstaff-private/docs/internal/vacuum-sealed-teardown-2026-08-09/`:

1. **Native-resolution software rendering.** Draw into a small fixed-size buffer at native pixel
   scale, then integer-scale it up. Never draw at display resolution.
2. **Lighting as compositing, not as an overlay.** Light is expressed by *which step of a colour
   ramp a pixel selects* (a light position, an ambient floor, a noise perturbation feeding the
   ramp index), not by painting a translucent gradient over finished art.
3. **Dither and fbm for material texture.** An 8x8 Bayer ordered-dither matrix chooses between
   adjacent ramp steps; fractal noise (fbm over value noise, ~4 octaves) perturbs the ramp so
   surfaces read as stone, plaster, rust and paper rather than as flat fills.
4. **A single curated palette in named ramps (dark to light).** Everything in the game draws from
   it, so the whole screen reads as one picture.
5. **Scenes are composed as single pictures**, not assembled as a scatter of tiles. A screen is
   staged, lit and framed before it is populated.

---

## 5. Stack and engineering law

- **Single-file HTML5 canvas.** `dist/index.html`, zero external fetches at runtime, boots from a
  `file://` double-click. Ray reviews that artifact, never a dev server.
- **Zero runtime dependencies.** No frameworks, no CDN, no bundler requirement beyond the
  single-file assembler script.
- **Fixed native buffer: 640 x 360**, integer/nearest scaling with letterboxing. Chosen over the
  teardown's 384x216 because this game is *made of documents*: at an 8px cell 640 gives an
  80-column ledger, which is the natural width of a form. Logic never reads viewport specifics.
- **Determinism is a contract.** Seeded named RNG streams only. `Math.random` is banned in game
  logic and a standing test greps for it. The raid resolver must be replayable from a seed, or the
  after-action report is not trustworthy, and the report is the game.
- **Battery: `node --test`**, green at every checkpoint commit. Tests are behavioural and speak
  the game's own vocabulary (cycles, works orders, grievances, notices), not the engine's.
- **Loud failures.** An in-game error surface (visible, in register) plus an exportable debug log.
  Silent catch blocks are a defect.

---

## 6. Collection contract v0 conformance

| # | Convention | Where it lands |
|---|---|---|
| 1 | Single-file self-contained `dist/index.html` | M1 |
| 2 | Namespaced persistence, all keys `material-breach:`; survives storage being unavailable | M1 |
| 3 | `window.__GAME = { id, name, version, pause(), resume(), mute(bool), quit() }` after boot; `quit()` is a clean teardown | M1 |
| 4 | Quit-to-shell slot on the pause surface, shown only when `window.__SHELL` exists | M1 |
| 5 | Input baseline: Arrows/WASD move, Z/Enter confirm, X cancel, Esc pause. Esc is never consumed away from pause. Deviations declared in §7 and shown in-game | M1 |
| 6 | One audio bus (single master gain), unlocked on first user gesture, no pre-gesture autoplay, honoured by `mute(bool)` | M7 |
| 7 | Completion hook `window.__SHELL?.report({ id, event })`, no-op standalone; three-tier rubric in §7 | M1 wiring, M8 rubric verify |
| 8 | Fixed internal resolution, integer/letterbox scaling | M1 |
| 9 | Provenance line current in CLAUDE.md and AGENTS.md | founding, maintained |

---

## 7. Controls and completion

**Pointer-primary.** This is a desk. The mouse is the instrument: click a cell to order
excavation, click a post to assign, click a notice to answer it. The keyboard baseline is present
and honoured (Arrows/WASD move the cutaway view, Z/Enter confirms, X cancels, Esc pauses), and the
declared deviation is that **the full game is playable with the mouse alone**. Every keyboard
binding is shown in-game on the pause surface.

Because it is pointer-primary, the **real-event input gate (Gate 2) is non-negotiable.**

**Three-tier completion rubric:**

- **finished** — complete a full tenure to its terminal condition and file the closing report.
- **mastered** — hold the facility past the first Licensing Inspector with the treasury solvent
  and zero unanswered administrative orders at close.
- **secret** — cause a condemnation order to be **withdrawn administratively**, without the
  officer who served it becoming a casualty.

---

## 8. Standing gates — MANDATORY, not optional audits

These are standing tests in the battery from the milestone named, and they are re-run at every
milestone thereafter. They are not an M8 checklist.

1. **Pacing-law structural test (from M1).** No wall-clock input reaches game logic; no timer
   mutates state; the sim advances only inside `commitCycle()`. Asserted, not asserted-by-comment.
2. **Real-event input smoke (from the first input milestone, M2).** Playwright driving **real
   mouse events** against the built `dist/index.html`. Synthetic dispatch of handlers is not the
   gate and never satisfies it. Pointer-primary game: this gate is non-negotiable.
3. **Degenerate-strategy probe (from M1, standing).** Zero input across N cycles **must LOSE**:
   an unadministered facility must fall. A game whose fantasy is administration is exactly the
   shape that can accidentally administer itself, and TAW shipped "complete" with 203 green tests
   while gravity alone cleared every course. Also: **the cheapest spam strategy must fail** (one
   order repeated forever is not a winning tenure).
4. **Action-legibility law (from M2, standing).** Every state change that alters an outcome is
   visible to the player at the moment it happens: raids, deaths, payday, morale moves, notices
   served, claims accruing. A change the player cannot see did not happen.
5. **Legibility floor, measured (from M6).** Minimum text size, contrast and dwell time measured
   on the built artifact at 1x scale, recorded as numbers in the milestone proof.
6. **Screen-fill >= 95%, as a test (from M2).** The composed picture fills the buffer. Empty
   letterbox inside the native frame is a defect.
7. **Failures loud (from M1).** In-game error surface plus exportable debug log; a test asserts a
   forced error is surfaced, not swallowed.
8. **Player-path soak + acceptance battery before ANY staging for Ray.** A scripted full-tenure
   soak on the shipped single-file artifact. Findings classified BLOCKER / DEFECT / FRICTION.
9. **Dated committed proof screenshots** for every milestone, in `docs/proofs/<YYYY-MM-DD>-M<n>/`.
   A milestone with no proof image is not closed.
10. **"For the operator to ratify" notes every run.** Every run appends a short block to
    `PROGRESS.md` listing what the builder decided that Ray may want to overturn. Silence is not
    consent; an unlisted decision is an unratified one.

---

## 9. Milestone ladder

Each milestone ends **battery-green + committed + pushed.** One increment is not a milestone.

| M | Deliverable | Lane |
|---|---|---|
| **M0** | **Architecture + reference study.** Documentary clean-room characterisation of the reference (room set, needs model, payday cadence, conversion chain). The **data model** (facility, cells, rooms, posts, staff, treasury, orders, notices, cycle) written down and implemented as pure data. **The pacing law enforced structurally** (Gate 1 test green on a stub). REGISTER-SEED authored from §4.1 with cited exemplars. Asset manifest. ATTRIBUTION scaffold. | opus |
| **M1** | **The cycle spine.** Seeded sim; ADMIN → COMMIT → RAID → REPORT end-to-end on placeholder content; loud-failure debug log with export; single-file build; boots from `file://`. Collection-contract items 1,2,3,4,5,7,8 wired. Gates 1, 3, 7 standing. **The loop must be playable-if-ugly at the end of M1.** | opus |
| **M2** | **The dungeon grid.** Excavation from rock, gold seams, territory claiming and spread, room types with size-driven quality curves, works orders with lead times. Pointer input lands here, so Gates 2, 4, 6 go standing. | kimi |
| **M3** | **Staff.** Rooms attract applicants (never a roster pick); needs (food / rest / pay); morale; payday against a capacity-bounded treasury; grievances, resignations, defection. The non-combat worker caste. | kimi |
| **M4** | **The raid resolver + the report.** Raider parties with objectives and credentials; approach to the loss object; auto-resolved engagement, no input, watchable and skippable; casualties both ways; and the **after-action report as a designed, readable artifact**, not a log dump. Every report line generates a consequence. | kimi |
| **M5** | **Capital, consequences, and the bureaucratic ladder.** Damage and repair orders; detention → conversion pipeline; claims backlog; insolvency and its failure states; the loss object's condition. **The escalation ladder as paperwork**: Surveyor → Auditor → Licensing Inspector, each with a served instrument (schedule of dilapidations, tax lien, condemnation order) answerable administratively, with a deadline in cycles and a consequence for ignoring it. Killing the officer never withdraws the notice. | kimi |
| **M6** | **Register + interface pass.** Every string checked against §4.1 to §4.3 and the REGISTER-SEED; the desk/ledger surface; Gate 4 satisfied for every outcome-altering state change; Gate 5 measured and recorded. | opus |
| **M7a** | **ART PoC — HARD STOP FOR RAY'S EYES.** One scene only: the architectural cutaway, fully rendered under the §4.5 stack, with cast figures placed. Dated proof screenshots committed. **The builder STOPS here and does not proceed to M7b until Ray gives a verdict.** Proceeding past this gate unratified is a hard rule violation. | opus |
| **M7b** | **Full art pass + the score.** The full art pass on Ray's ratified direction. **House Band score**, register stated below; Song-Structure Law at the sharpened bar. Collection-contract item 6 (one audio bus) lands here. SFX pass in the same register: stamps, drawer slides, distant structural failure. | opus |
| **M8** | **The gates.** Genre-completeness + QoL audit against the reference's table stakes; all standing gates re-run on the shipped artifact; Gate 8 soak; acceptance dossier classified BLOCKER / DEFECT / FRICTION; ship shell (title, options, provenance, ATTRIBUTION shipped in-build). | orchestrator + opus looker |

**Stop at M8. Everything further is operator-directed.**

---

## 10. The score — House Band

Kit source (do not port yet; M7b ports it):
`~/Desktop/Dev Work/chapel-perilous/src/engine/band.js` and
`~/Desktop/Dev Work/chapel-perilous/src/engine/prng.js`.

**The kit is register-neutral. This game's register is its own and inherits nothing from any
prior port.**

**Register: LOBBY MUSIC FOR A BUILDING UNDER SIEGE.** Institutional light music, the hold music of
a facility that is on fire. Electric-piano and vibraphone-ish voices, a patient walking bass,
brushed percussion, unhurried and faintly pleasant: the sound of a lobby that does not acknowledge
what is happening down the corridor. Under it, a low fluorescent-hum drone pedal. Over it, the
percussion of the desk itself, typewriter strikes and date stamps landing on the beat. The comedy
and the dread are both in the refusal to react. **The raid section curdles rather than changes
genre**: same ensemble, same tempo, the pleasantness souring.

**Song-Structure Law binds at the sharpened bar (Ray, 2026-08-13).** A/B is the floor, not the
target: **3+ distinct sections**, per-pass variation inside sections (voicing/density swaps so no
two consecutive passes are identical), section lengths long enough that a full cycle takes minutes
rather than seconds, and **tempo slower than instinct.** A single repeated cell is a defect, not a
style. A score milestone ships a listen set for Ray's ear; it is not closed by the builder.

---

## 11. Open for the operator

- **Q2, still open: is there a win, or only a tenure?** The brief's lean, unratified: **tenure with
  a solvency score.** You always eventually fall; the score is how long you lasted and how solvent
  you were when you did. It is the honest fit for the register and keeps the after-action report
  the permanent centre of the game. The risk, stated plainly: it is less satisfying to a player who
  wants to beat something, and it is the harder shape to make feel good in a first session. **The
  builder implements the lean and marks it RATIFY-PENDING in PROGRESS.md.** M8 must not close on
  an unratified answer.
- **The name.** MATERIAL BREACH.
- Everything else in this seed is a structural call already made. Operator directives arrive as
  `docs/DIRECTIONS-<date>-<topic>.md` and **outrank this file.**

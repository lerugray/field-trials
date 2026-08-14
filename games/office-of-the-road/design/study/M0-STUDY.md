# M0 — CLEAN-ROOM STUDY

Founded 2026-08-09. Builder study for THE OFFICE OF THE ROAD.

**Clean-room discipline (CLAUDE.md hard rule #2).** This document characterizes the
*structure, counts, and pacing* of the reference works named in DESIGN-SEED.md. It copies
nothing: no proper names, item names, ability names, numbers-as-shipped, text, sprites, or
trade dress from any reference. Where a concrete figure appears below it is either (a) a
publicly-documented structural fact used to reason about our own independent design, or (b)
a target WE choose for OUR game. Original in-register job names, item text, and content are
authored fresh in later milestones and are never derived by find-replace from a reference.

The purpose of the study is to convert the four references into a small set of **binding
design targets** that later milestones (M2 jobs, M3 deck, M4 economy, M5 run loop) consume,
so those milestones tune against a stated baseline rather than discovering one at M9.

---

## 1. FF3 (NES, 1990) — the JOB SYSTEM, characterized empirically

The load-bearing reference. What we take is the *shape* of a shared-party job system; what
we reject is anything that would read as its trade dress.

### 1.1 Structural facts (documented, used to reason — not copied)

- **A single shared party** of a fixed small size (four active members). Power does not come
  from *which heroes* you recruit; it comes from *which jobs those heroes are currently
  running*. The party is a set of interchangeable frames; the job is the content.
- **Jobs are unlocked in tiers**, gated behind story-progress milestones rather than bought
  individually. The roster grows across the game from a starter handful to ~20+ by endgame.
  Early tiers offer a few broad archetypes; later tiers offer specialists and hybrids.
- **A job is a FIXED KIT**, not a skill tree. Selecting a job grants that job's command set
  (its verbs) and reshapes the frame's stat weighting (a heavy-melee job raises the physical
  line; a caster job raises the magical line and lowers HP growth). Two frames running the
  same job are mechanically near-identical.
- **Changing jobs is cheap and expected** — it is the central build verb, done freely at the
  menu, not a rare event. It is the thing the player *does*, not a thing they save up for.
- **A soft transition cost** discourages thrashing: immediately after a change, the frame
  performs at reduced effectiveness for a short adjustment window (a handful of encounters),
  after which it settles into the new job's curve. The cost is a *tax on churn*, never a hard
  lock, and it scales with how far the new job's stat profile sits from the old one.
- **Proficiency accrues by use**, tracked per job on the frame: keep a frame in a job and its
  command effectiveness / capacity within that job improves. Proficiency is *per job*, so
  switching means switching which proficiency track is active — it does not delete the old.
- Equipment is job-conditioned: each job can wield a subset of the gear table; putting a
  frame in a job that cannot use its equipped gear is legible and penalized, not silently
  ignored.

### 1.2 FFT (progression-depth reference), characterized

FF3 gives us *fixed kits + cheap swapping*. Final Fantasy Tactics is the reference for
**progression depth layered on top**:

- Abilities are **learned per-job by spending an in-combat-earned currency** (job points),
  turning each job into a shallow purchase list rather than an all-or-nothing kit.
- Learned abilities can be **cross-equipped** onto other jobs in bounded slots (a secondary
  command, a passive reaction, a support trait, a movement trait). This is where builds get
  personal: the job is the primary identity, the cross-equips are the accent.
- **Job unlocks are gated by proficiency in prerequisite jobs**, forming a tech tree — you
  earn the specialist by mastering the generalists that feed it.

### 1.3 What OUR game takes vs. rejects

| We TAKE | We REJECT |
|---|---|
| Shared interchangeable party; job = content, frame = holder | Any reference's job names, class art, crystal/story trappings |
| Job as a **fixed kit** swappable at defined pause points (camps) | Mid-combat job swapping (our kit is fixed at swap time) |
| **Cheap swapping as the central build verb** | Grind-heavy job-level walls before a job is usable |
| A **soft transition tax** on churn (adjustment window) | A hard lock or long dead-time after swapping |
| **Per-job proficiency that persists** and compounds across runs | Any exact stat number, growth constant, or table value |
| FFT-style **bounded cross-equip slots** as the accent layer (M2/M5) | FFT's full JP economy verbatim; deep tech-tree sprawl |

### 1.4 Design targets derived (binding on M2)

- **Job count v1: 6–8** distinct jobs (DESIGN-SEED M2), each with an original in-register
  bureaucratic-trade name and a distinct *verb set* — no two jobs share a command list.
  Candidate frames exist in the licensed battler roster (see manifest §Battlers): the
  Sideview pack ships ~15 archetype silhouettes, ample for 6–8 v1 jobs plus growth room.
- **Jobs are deck-neutral fixed kits** (DESIGN-SEED M2): a job grants a command set and a
  stat reshaping; it is orthogonal to the tarot layer (§3). The deck is the *other* build
  axis, never folded into jobs.
- **Swap economics**: job change is free at camps/towns only, never mid-march or mid-combat.
  A stated soft transition tax (a small, temporary effectiveness reduction over the next K
  encounters, K a `tuning.js` constant) taxes churn without locking. Number chosen at M2,
  documented in `tuning.js` with its shape and intended feel.
- **Proficiency = the certification currency** (DESIGN-SEED M5): jobs level *across* runs
  (within a run the kit is fixed at swap time); configuration compounds run-over-run. M2
  builds the per-job proficiency counter; M5 turns it into the meta-progression wall.
- **Ability pacing**: a job's kit is usable *immediately* on swap (no unlock wall to first
  utility); depth arrives through per-job proficiency and, at M2/M5, a bounded cross-equip
  accent slot. Pacing law: **every job is competent at proficiency zero; mastery is an
  accent, not an admission ticket.**

---

## 2. Knights of Pen & Paper (2012) — the AUTOMATION FRAME, characterized

The reference for *mediating* the adventure — turning walking-and-grinding into a sit-down
activity where encounters arrive as generated work.

### 2.1 Structural facts

- The adventure is **framed diegetically as a mediated activity** (a tabletop session): the
  player does not pilot an avatar through a field; they configure a party and a session
  presents encounters to it. The fiction *is* the abstraction — it explains why there is no
  walking to do.
- **Encounters arrive as discrete generated work units.** Between them the player manages the
  party at a persistent hub (buy, equip, adjust). Pacing is partly player-controlled: the
  player influences *how much* work to summon before resting.
- **Combat is turn-based and menu-driven**, resolved through selected actions rather than
  reflexes; the player's leverage is *preparation and selection*, not execution.
- A **persistent hub economy** (spend earnings on party capability and on upgrading the hub
  itself) gives a compounding-configuration pleasure between encounters.

### 2.2 What OUR game takes vs. rejects

| We TAKE | We REJECT |
|---|---|
| Adventuring as a **mediated, generated** activity; no walking-the-field busywork | KOPAP's low-agency slots (long stretches where the only verb is "continue") |
| **Encounters as generated work units** arriving on a road | Its literal tabletop framing / any of its text or characters |
| A **persistent hub** (our camps/towns) for configuration between work | Idle/AFK pacing where watching is the whole activity |
| Player influence over pacing | Trivialized combat that never rewards preparation |

The seed is explicit: *take the automation, REJECT the low-agency slots — build choice must
matter far more.* Our answer is the two build axes (jobs §1, deck §3) plus routing and
economy: the march is automated, but the player is *always within a short interval of a
consequential decision*.

### 2.3 Design targets derived

- **The march auto-resolves; the player intervenes.** Combat runs on jobs + equipment +
  standing orders (M2 auto-resolver); the player's live agency is the tarot hand (M3). A
  well-built party wins routine fights with zero interventions — but the game continuously
  *offers* interventions so watching is never the whole loop.
- **Watch/act floor (binding at M9).** The soak probe reports the longest passive stretch and
  interventions-per-minute; exceeding the stated passive floor is a BLOCKER. The automation
  is the stage; if the player can go too long with nothing worth doing, that is a defect, not
  a pacing choice. M1's speed control (0.5×–4× + hold-to-pause) is the release valve that
  keeps a well-built party's routine legs from becoming dead air.
- **Session shape: 20–40 minutes per expedition** (DESIGN-SEED loop). Encounter density and
  march speed are tuned so interventions stay dense within that envelope.

---

## 3. Slay the Spire (deckbuilder reference) — the DECK-AGENCY MODEL

The reference for a **run-scoped build expressed as a deck**: card-choice-as-drafting, thin-
deck discipline, relic-style modifiers. We apply it to the **tarot** layer (we own the Pixel
Tarot art — 22 major arcana faces + a card back; see manifest §Tarot).

### 3.1 Structural facts

- The deck is the **run-scoped build agency**: the run starts small; every acquisition is a
  *choice* (typically pick-one-of-three at reward nodes), and the deck is the compounding
  expression of those choices.
- **Thin-deck discipline**: adding cards is a cost as well as a benefit (it dilutes draws);
  *removing* cards is a valued, limited resource. A focused deck beats a bloated one.
- **Persistent per-encounter modifiers** (relic-style) sit outside the deck and bend the
  whole run's math — passive, always-on, acquired as run rewards.
- **Cards are the player's live hand during combat**: drawn into a hand, played against an
  enemy whose next action is *telegraphed*, so play is a reaction to known information, not a
  gamble. Information legibility is the core of the agency.

### 3.2 What OUR game takes vs. rejects

| We TAKE | We REJECT |
|---|---|
| Deck as **run-scoped build**; acquisition-as-drafting (3-card offer at mandate nodes) | Any StS card names, art, keywords, or relic text |
| **Thin-deck discipline**: removal is camp-only and costs | Cards as the *only* combat agency (jobs win routine fights alone) |
| **Telegraphed enemy action** → cards played against known info | Mandatory card play (no card is compulsory) |
| A **persistent hand during automated combat**; omens between fights | Time-pressure-as-baseline (pause is first-class; see §3.3) |
| Certifications may **extend** the deck across runs | Prestige-wall / offline-idle math |

### 3.3 The INTERVENTION CONTRACT (stated here at M0; enforced at M3)

DESIGN-SEED requires this contract be *stated*, not discovered at M9. The deck's whole point
is legible, unhurried, optional agency layered over automation:

- **Visible combat tick.** The resolver advances in discrete, player-visible steps; nothing
  resolves invisibly (Action-Legibility Law, CLAUDE.md #5).
- **Persistent hand** with **per-card live window state**: each held card shows whether it is
  *playable / wasted / decisive* against the resolver's next 1–2 telegraphed actions.
- **Pause is first-class.** Space toggles pause; cards are fully resolvable while paused;
  "pause on hand draw" defaults ON. Time pressure exists only as a *chosen* expedition
  modifier, never as a baseline. (This is our deliberate departure from real-time deckbuild
  pressure — the register is a desk, not a reflex test.)
- **Acquisition**: a 3-card draft offered at mandate-node resolution (StS reward cadence).
  **Removal** only at camps, at a cost. Deck is run-persistent; certifications may extend it.
- **Road omens between fights**: the tarot also reads as omens on the road between encounters
  — the same art, a non-combat surface — keeping the deck present outside battle.
- **Testable law (M3)**: routine encounters are winnable with **zero cards**; the UI states
  explicitly when a fight has *left* routine (i.e., when intervention is actually wanted).

### 3.4 Design targets derived

- Starting deck small; growth by drafted choice; a thin, intentional deck outperforms a wide
  one. Exact starting size + draft cadence chosen at M3 against the M2 auto-win baseline.
- **The M2 baseline is the tuning anchor for M3.** Cards are tuned so that: routine tier is
  clearable card-free; elite/boss tiers are where the hand converts a likely loss into a win.
  Card power is measured *against the committed auto-win curve*, never in a vacuum.

---

## 4. Incremental sensibility (genre, not a title)

Bounded borrowing only: the pleasure of watching a system *process the world while your
configuration compounds*. **Strictly excluded** (DESIGN-SEED): no offline-idle timers, no
prestige-wall math. The party grinds *visibly*; the player's interventions bend the curve in
real, legible time. This sensibility is a flavour on the automation (§2), not a mechanic of
its own — it earns no milestone.

---

## 5. The synthesis — two build axes over one automated loop

The four references resolve into a single thesis the whole game serves:

> **Automate the busywork (KOPAP); reinvest every reclaimed second into agency across two
> orthogonal build axes — JOBS (FF3/FFT: fixed kits, cheap swaps, per-job proficiency) and a
> DECK (StS: run-scoped, drafted, thin) — plus routing and economy, over a visible,
> intervenable, pausable combat tick. The player is the desk, not the hero.**

Axis orthogonality is load-bearing and is a *stated law*, not an accident: **jobs are
deck-neutral fixed kits** (a job never reads a card; a card never reads a job's internals).
This keeps the two agency systems independently tunable and independently legible — a
degenerate job comp and a degenerate deck are separately detectable (M2 job-comp degeneracy
sweep; M3 zero-card routine law).

---

## 6. Baseline curves this study commits later milestones to

Restated compactly so M2–M5 have one place to tune against:

- **Auto-win rate by encounter tier** (M2 gate, committed as `tuning.js` constants + a probe
  measuring actual rates over N seeded fights): routine **90–95%**, elite **40–60%**, boss
  **<15%** on jobs + gear + standing orders alone. M3 cards are tuned to convert the elite/
  boss gap; they must not push routine above the band (routine stays card-optional).
- **Job-comp degeneracy margin** (M2 gate): sampled job combinations over one seeded encounter
  ladder; no comp may exceed the median win rate by more than a stated margin; below-floor
  comps are flagged trap-tier. The margin is chosen and recorded at M2.
- **Economy closed loop** (M4): intended gold balance per leg index; ≥1 always-open sink; shop
  availability curved against early power spikes; a minimum mandate-reward floor so a bad
  branch never makes forward progress worse than standing still. Health signal: a
  null-strategy (buy nothing) vs greedy (buy everything affordable) gold-curve divergence probe.
- **Run escalation** (M5): certifications (job proficiency the primary currency) deepen runs;
  the filed report is a *causal* incident ledger, not a stat dump; an abandon valve banks
  reduced credit; a no-progress detector surfaces the valve loudly.
- **Watch/act floor** (M9): longest passive stretch + interventions/minute reported by the
  soak; exceeding the stated passive floor is a BLOCKER.

---

## 7. For the operator to ratify

- **Two-axis thesis as the tuning spine** — jobs and deck kept strictly orthogonal
  (deck-neutral fixed-kit jobs). *Lean: keep.* It is the cleanest reading of the seed and
  makes degeneracy independently detectable per axis.
- **Soft transition tax on job swaps** (a churn tax, not a lock). The seed mandates cheap
  swapping as the central verb; the FF3 reference includes an adjustment window. *Lean:
  include a small tax, tuned at M2, defaulted gentle — swapping should feel free, thrashing
  should feel slightly wasteful.* Ray may prefer zero tax (pure free swapping) — flagged.
- **Pause-first, no baseline time pressure.** Deliberate departure from real-time
  deckbuilders; fits the desk register. *Lean: keep; time pressure only as a chosen
  expedition contract.*
- Battler roster note: the licensed Sideview pack ships ~15 archetype silhouettes
  (Arcanist, Battlemage, Hedge Knight, Magus, Mystic, Reaper, Shaman, Skald, Sorceror,
  Sultan, Templar, Vizier, Warden, Witch, Ghoul). These are *art* frames only; the 6–8 v1
  job *names and verb sets* are authored in-register at M2 and are not these pack labels.

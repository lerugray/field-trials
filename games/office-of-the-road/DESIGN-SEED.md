# THE OFFICE OF THE ROAD — design seed (founding contract)

Founded 2026-08-09. Operator: Ray Weiss. Name chosen per Ray's delegation (Weiss consult +
orchestrator pick; runner-ups: *Standard Issue Heroics*, *Ordinary Expeditions*, *The
Bureaucracy of Chance* — name CONFIRMED by Ray 2026-08-11 — veto row closed; see PROGRESS).

## The pitch

A fully streamlined JRPG roguelite. The party marches itself — the walking-around and
grinding of a classic JRPG is automated and generated, the way *Knights of Pen & Paper*
automated the table — but every ounce of removed busywork is reinvested in AGENCY: jobs,
builds, deck, routing, and economy decisions. The player is not the hero. The player is the
desk the heroes report to.

Register: **Candide, Don Quixote, Kafka.** An earnest party marching through an absurd,
indifferent world; institutions that explain endlessly and resolve nothing. The Office
issues mandates. The road processes the party. The ledger records what remains.

## References (specific works, never genre — match-reference discipline)

1. **Final Fantasy III (NES, 1990)** — the JOB SYSTEM is the load-bearing reference: a
   shared party whose power comes from swappable jobs, where changing jobs is cheap enough
   to be the central build verb, and job identity = verb set. FFT's job PROGRESSION
   (abilities learned per-job, cross-equipped) is the depth reference. Clean-room: we
   characterize structure (job counts, swap economics, ability-grant pacing), never copy
   names, assets, or text. No crystals, no Square trade dress.
2. **Knights of Pen & Paper (2012)** — the automation frame: adventuring as a mediated,
   sit-down activity; encounters arrive as generated work. We take the automation and
   REJECT its low-agency slots — build choice must matter far more.
3. **Slay the Spire (deckbuilder reference)** — the deck as run-scoped build agency:
   card-choice-as-drafting, thin-deck discipline, relic-style modifiers. Applied to the
   TAROT deck (we own the Pixel Tarot art): cards are the player's hand DURING automated
   combat and omens on the road between.
4. **Incremental games (genre sensibility, not one title)** — the pleasure of watching a
   system process the world while your configuration compounds. Strictly bounded: no
   offline-idle timers, no prestige-wall math. The party grinds visibly; the player's
   interventions bend the curve.

## The loop (design spine)

- **A run = an EXPEDITION**: the Office issues a mandate (generated quest-chain with a
  destination); the party marches the road automatically — terrain, encounters, towns,
  shrines generated ahead of them.
- **Combat auto-resolves** in FF-style sideview, driven by jobs + equipment + standing
  orders. The player MAY intervene by playing tarot cards from a drawn hand (the deck is
  the in-combat agency). No card compulsory; a well-built party wins routine fights alone.
- **At camps and towns** (the pause points): change jobs, edit the deck, buy/sell/equip
  (quartermaster shops), accept side-mandates, route the next leg (branch choice with
  legible tradeoffs).
- **Death files a report.** The expedition ends; the Office processes the outcome;
  CERTIFICATIONS persist (meta-unlocks: new jobs, deck slots, starting requisitions,
  route options). Roguelite: runs get deeper as the certification wall fills.
- **Session shape**: a run is 20-40 minutes; interventions are dense enough that watching
  is never the whole game. The automation is the stage, not the player.

## Register laws (binding on ALL game prose — Weiss-authored, operator-delegated)

1. **State mechanics as administrative procedure.** Quest objectives, stat changes, and
   combat resolutions are written as forms, decrees, or ledger entries. Violence is a
   compliance metric, not a dramatic event.
2. **Gear and abilities are standardized issue, never relics or blessings.** Item text
   reads like quartermaster tags, safety warnings, depreciating assets. No lore mysticism.
3. **NPCs operate in circular institutional logic.** No clean exposition, no moral
   validation, no direct answers — jurisdictional deflection, contradictory mandates,
   polite indifference.
4. **Never narrate player agency as triumph.** Level-ups, completions, and victories are
   routine operational outputs, recorded flatly.
5. **Passive voice for suffering, active voice for bureaucracy.** "The unit was reduced.
   Supplies were deducted." vs "The Office routes the party. The ledger assigns the job."
   This split is enforced at the sentence level.
6. **The instruments never lie.** (Studio UX pass.) PROSE (NPCs, mandates, flavour) is
   deflecting and deadpan per laws 1-5; INSTRUMENTS (the ledger, manifests, tooltips, stat
   readouts, the route table) are exact, numeric, complete, and never ironic. Every flavour
   string ships a plain numeric neighbour. The Office is opaque about WHY, never about WHAT.

ANTI-PATTERNS (breaking any is a defect): epic-fantasy earnestness; snark, memes, or
winking at the player; grimdark relish; exposition dumps. The register is DEADPAN — the
world is absurd and nobody in it thinks so.

A REGISTER-SEED.md (PD corpus distillation: Candide / Quixote-Ormsby / PD Kafka, with ~30
cited exemplar passages) accompanies this seed — builder prose is checked against it.

## Art law (hard rule — licensed packs, no generation)

- **World/UI/battlers**: the Willibab/Monsteretrope retro-FF collection from Ray's
  pixel-art-library (CC BY — ATTRIBUTION.md is mandatory and ships with every build) plus
  the Simple 8-bit Sideview Battlers pack (CC BY, proven in Ashen Liturgy — sideview
  battles are its literal purpose).
- **The tarot deck**: the Pixel Tarot set (itch purchase, commercial-cleared; confirm
  multi-title license scope before PAID release — fine for the free build).
- NO generated images. NO code-drawn placeholder art standing in for pack art
  (placeholder = defect). Provenance recorded per art-provenance-gates-commercial-release:
  licensed packs keep this title paid-eligible.
- M0 builds the ASSET MANIFEST: every sheet inventoried (dimensions, grid, licence,
  attribution line) BEFORE any rendering code exists. AL's manifest is the pattern.

## Score (hard rule on tools, freedom on register — Ray, 2026-08-09)

The Chapel Perilous **band kit** (`src/band.js` — portable, code-composed WebAudio, zero
assets) is ported at founding and is the ONLY audio path. The MUSICAL register is NOT
CHP's ambient dread — Ray's direction: a more creative take, **chiptune/medieval leaning**
(think a Famicom consort: square-ish leads, plucked courtly figures, processional marches
— earnest period music rendered on crude synthesis, which is itself the register joke).
Extend the kit with new voice types if the take needs them (pulse lead, arpeggio) — the
kit is the tool, not the aesthetic. Tracks per state (march/town/office/combat/report).
Weiss may author direction at the score milestone. No audio files, no CDNs.

## Stack (decided)

Single-file zero-dependency web build (`node scripts/build.js` → `dist/office-of-the-road.html`,
boots from file:// double-click), Canvas 2D, `node --test` suite, deterministic seeded RNG
(no Math.random in game logic), debuglog module with in-game surfacing (LoA pattern —
failures are LOUD; "nothing happens" is a banned failure mode).

## Milestones (each ends: suite green + battery-relevant proofs + committed + PUSHED)

EVERY milestone's proof battery includes a keyboard-only pass AND a mouse-only pass of the
surfaces that milestone adds (visible focus ring — outline not color-only, Tab/arrow
traversal, Enter/Space activate, Esc backs out; no mouse-only verbs). Input parity is a
floor built per-milestone, never retrofitted at audit time.

- **M0 — Study + manifest.** Clean-room STUDY doc: FF3 job structure characterized
  empirically (job count, swap cost model, ability pacing), KOPAP loop characterized,
  deck-agency model stated. Full asset manifest + ATTRIBUTION.md. No game code.
- **M1 — Spine.** Build harness, debuglog, march loop skeleton (generated road, party
  marches, encounter ticker), suite scaffold, first single-file build that boots. Baked-in
  from the spine, never retrofitted:
  - **Named RNG streams** (terrain / encounter / shuffle / loot) — an intervention
    consuming randomness in one stream must not shift another.
  - **March/combat speed control** (0.5x/1x/2x/4x + hold-to-pause), a seeded config value
    with a UI control from the first march loop, persisted in save.
  - **Continuous autosave + instant resume** — "the Office holds the file open": autosave
    at every camp, town, combat resolution, and route choice; quit-from-anywhere never
    loses progress; the resume screen is a returned docket. Saves are VISIBLE (loudness
    law — silent saves are banned).
  - **Save-round-trip determinism probe**: serialize mid-expedition (mid-combat, mid-hand,
    mid-generation-lookahead), reload, assert the next 200 ticks are byte-identical to the
    unsaved continuation.
  - **Onboarding beat**: the party is already marching before the player's first input.
  - **tuning.js**: every gameplay constant/curve lives in one module, each with a one-line
    comment naming its shape (linear/geometric/step) and intended feel. No scattered magic
    numbers — invisible tuning is the likeliest quiet failure.
- **M2 — Jobs + auto-combat.** 6-8 jobs v1 (distinct verb sets, original in-register names),
  stats, camp job-change, sideview auto-resolver with pack battlers, attrition core (HP/
  supplies persist across encounters; recovery only at towns/camps, at cost), action-
  legibility law from the first mechanic. **Jobs are deck-neutral fixed kits** — swappable
  at camp, orthogonal to the tarot layer. Gates at M2 exit:
  - **Auto-resolution baseline curve, committed as constants + measured**: target auto-win
    rates per encounter tier (routine 90-95%, elite 40-60%, boss <15%) with a probe
    measuring actual rates over N seeded fights. M3 tunes cards against THIS baseline.
  - **Job-comp degeneracy sweep**: sampled job combinations run over the same seeded
    encounter ladder; no comp exceeds the median win rate by more than a stated margin;
    below-floor comps flagged trap-tier.
  - **Measured legibility**: programmatic contrast (>=4.5:1 body text, >=3:1 UI edges at
    1280x800); every state distinction carries a non-color channel (glyph/position/outline);
    deuteranopia/protanopia/tritanopia simulation pass over proof frames.
- **M3 — The deck.** Tarot hand drawn into combat; road omens between fights; camp-only
  deck edits. Pixel Tarot art wired. The INTERVENTION CONTRACT is stated in this milestone,
  not discovered at M9:
  - Visible combat tick; persistent hand; per-card live window state (playable / wasted /
    decisive) against the resolver's next 1-2 actions.
  - **Pause is first-class**: Space toggles; cards fully resolvable while paused;
    "pause on hand draw" defaults ON. Time pressure only ever as a CHOSEN modifier
    (an expedition contract), never baseline.
  - Probes for stale-target (card resolving against a target that died mid-input) and
    double-play-on-one-tick.
  - **Card acquisition**: a 3-card draft offered at mandate-node resolution (StS cadence);
    removal only at camp, at a cost. Deck is run-persistent; certifications may extend it.
  - Testable law: routine encounters winnable with zero cards; the UI states when a fight
    has left routine.
- **M4 — Mandates + quartermaster.** Quest-chain generation (the Office's mandates + side
  mandates), towns with shops/inventory/equipment, route-branch choices with legible
  safety-vs-resource tradeoffs. Economy stated as a CLOSED LOOP: intended gold balance per
  leg index, at least one always-open sink (repair/resupply/consumables), shop availability
  curved so no early run-ending power spike, a minimum mandate reward floor (a bad branch
  can never make forward progress worse than standing still). Probe: a null-strategy run
  (buy nothing) vs a greedy run (buy everything affordable), reporting both gold curves —
  their divergence is the economy's health signal.
- **M5 — The run loop.** Expedition death/report flow, certifications (meta-unlocks),
  escalation curve. **Job mastery is the certification currency** — jobs level ACROSS runs
  (within a run the kit is fixed at swap time); configuration compounds run-over-run.
  - **The filed report is CAUSAL, not a stat dump**: an incident ledger — leg chosen →
    encounter → coverage gap → unplayed decisive windows → deductions, each line traced to
    the decision that produced it, plus one line crediting what the desk did that worked.
  - **Abandon valve**: "file for early return" at any camp/town — ends the run, banks
    reduced certification credit. A **no-progress detector** (two consecutive legs with net
    negative gold and no equipment/level gain) surfaces the valve loudly.
  - **Expedition 0 = the Orientation Mandate**: each intervention verb introduced as a
    required box on an intake form. Diegetic; no tutorial voice; no exposition dump.
- **M6 — Full art pass.** Willibab integration across map/UI/town/battle; idiom gates +
  pixel gates; opus looker with checklist on every surface; colorblind sim re-run on the
  final palette.
- **M7 — Score.** Band-kit tracks in the chiptune/medieval register (see Score section),
  wired to march/town/office/combat/report; density metrics + audio probe (CHP pattern).
- **M8 — Genre-completeness + QoL audit.** Enumerate JRPG + roguelite + deckbuilder
  table-stakes (inventory feedback, rest/recovery, death flow, save/load feedback, kill
  acknowledgement, run-history, deck-viewer); audit; land or defer-with-reason each.
  Includes the **mutation-during-automation class**: attempt every camp/town edit while the
  march ticker is live (or prove pause points hard-block) — no orphaned references, no
  double-applied stats.
- **M9 — Acceptance battery + soak + polish.** Automated acceptance dossier (BLOCKER/
  DEFECT/FRICTION) + player-path soak. The soak's PLAYER-PATH MINIMUM per expedition, all
  through real input events (never API calls into the engine): >=1 live card play, >=1 camp
  job change, >=1 shop transaction, >=1 route branch, >=1 save/quit/reload, >=1 death →
  report → certification cycle. The probe also reports **watch/act metrics** — longest
  passive stretch and interventions/minute; exceeding the stated floor is a BLOCKER, not a
  note. **STOP at M9. Everything further is operator-directed.**

## The one aesthetic law

The game must look like a lost NES-era Final Fantasy processed by a Weimar filing office —
warm 8-bit pack art under prose that reads like a customs form. If a screen would look at
home in a cheerful mobile idle game, it is WRONG. Failing test, asked at every proof:
"does this screen look like a game, or like an institution that happens to render one?"
(Both is the answer. Neither alone passes.)

## Fixed decisions (do not relitigate in-run)

Name (CONFIRMED by Ray 2026-08-11), register laws, art law, score law, stack, the automation-with-
agency thesis, jobs-as-central-verb, tarot-as-combat-agency, STOP line. Ratify-notes
convention: builder logs assumptions per run under "For the operator to ratify" with leans.

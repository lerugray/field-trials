# DIRECTIONS 2026-08-14 — pre-fire edge-sweep folds + Ray ratifications

Operator directives. These outrank DESIGN-SEED.md where they touch the same subject.
Source: the founding-day 4-critic edge-sweep (game-designer / systems-designer /
ux-designer / qa-lead vs the seed), triaged by the orchestrator; plus Ray's
founding-day ratifications.

## Ray ratifications (2026-08-14, binding)

- **Name: MATERIAL BREACH** — ratified (DILAPIDATIONS, CONDEMNED PREMISES struck).
- **Ending: TENURE + SOLVENCY SCORE** — no win screen. A run ends at condemnation or
  insolvency; the score is cycles survived × solvency record. Q2 is CLOSED; build
  M5's failure states and scoring to this.
- Corollary directive (from the game-designer critic, folded to preserve the DK
  power-fantasy payoff inside a tenure ending): **the escalation ladder must allow
  LOCAL DOMINANCE PLATEAUS** — the player can out-build the current rung and feel
  untouchable for a stretch before the next instrument re-opens pressure. "You
  always eventually lose" must never mean "you never get to win a phase."

## Design folds (bake into the named milestones)

1. **Excavation conceals until surveyed (M1/M2).** Unexcavated rock renders as
   uniform hatch; contents unknown until excavated/surveyed. The instruments-never-
   lie law applies to what has been excavated — the instrument reports nothing about
   rock it hasn't seen. This preserves DK's dig-reveal inside the honest-diagram law.
2. **Per-cycle intel memo (M4).** Before each COMMIT, the admin phase receives a
   vague-but-actionable sighting line ("an unidentified party was observed on the
   access road; party size estimated 3-5"). Planning is never fully blind; the memo
   is in-voice and imprecise, the raid stays auto-resolved.
3. **Staff archetype identity (M3).** Each staff archetype gets 2-3 named
   preferences/grievance triggers (room adjacency, wage sensitivity, hazard
   tolerance) so the systems differentiate the cast even where licensed art cannot.
4. **Raid watchability + loss-object tension (M4).** Specify WHAT is watched: the
   resolved raid replays as a step-through of movement/contacts on the cutaway, and
   the loss object emits a rising mechanical signal (visual pulse cadence) as raiders
   near it. The score's curdle is mood; this is the proximity read.
5. **Cycle-1 scripted survivable raid + in-voice orientation (M1).** The first raid
   is seeded and survivable regardless of choices; teaching happens via an in-voice
   orientation packet (a memo from the previous manager), never a popup tutorial.

## UX folds

6. **Pre-commit checklist (M1).** "Sign the cycle over" opens a non-interactive
   summary (open works orders, unanswered notices, payroll status, intel memo)
   behind a second confirm. Reuses existing data; kills blind commits.
7. **Cutaway visual grammar (M2/M6).** Room size = outline weight; quality = ramp-
   step density; occupancy = staff-icon count. Named here so the art milestones have
   a concrete target and the quality curve is visible, not hidden math.
8. **AAR shape: ledger-first, prose-expands (M4).** The after-action report renders
   as the numeric ledger with per-line expansion into the in-voice prose. Both §4.2
   halves exist already; this names the UI shape.
9. **Backward attribution in AAR lines (M4).** Every consequential AAR line cites
   its cause in-voice ("exploited the unfilled watch-post, vacant 2 cycles"). The
   cause must reference a real state the player could have changed.
10. **Notices carry cycles-remaining stamps (M5).** Every served instrument displays
    its own deadline counter on the notice itself.

## Systems folds (numeric skeleton — provisional numbers, builder may retune ±50%
with the reasoning logged in PROGRESS; shapes are LAW)

11. **Bootstrap:** starting treasury 400; one guaranteed income tap (the founding
    charter pays a small per-cycle stipend until first gold seam income); skeleton-
    crew floor: staff count never starves below 3 (they stay unpaid-and-grieving,
    they do not quit to zero).
12. **Quality curve shape: sub-linear past a stated size** (diminishing returns
    beyond 6 tiles/room). Degenerate probe explicitly includes "single room type
    maximized" as a strategy that must lose.
13. **Ladder trigger + comeback lever:** escalation advances on missed deadlines
    and unresolved incident findings, never on elapsed time alone; answering every
    notice on time for 3 consecutive cycles SOFTENS the current rung one step.
    One bad raid must be recoverable; two ignored notices need not be.
14. **Conversion bootstrap:** the facility starts with minimal free detention
    capacity (1 cell), so capture-and-convert is reachable before the economy can
    afford to build it.
15. **Coarse cadence numbers:** payday every 3 cycles; wage scale 10/25/60 by tier;
    morale breakpoints at 2 consecutive missed paydays (grievance) and 3 (quit
    roll); raid cadence roughly every 3-5 cycles, escalation-rung dependent.
    Treasury cap = Treasury room tiles × 100 (KEEP #2 made mechanical).

## Verification folds (add to §8 standing gates)

16. **Raid-variance gate:** sweep a seed family across defense-strength levels;
    assert casualties/duration are non-constant and monotone-ish with defense. A
    fixed-roll resolver must fail the battery.
17. **Prose laws wired to tests:** (a) enumerate report-line types; assert each
    drives a next-cycle state mutation ("a report line with no administrative
    consequence is a defect" — now a test); (b) script killing the serving officer
    mid-raid; assert the notice/deadline is unaffected ("killing the officer never
    withdraws the notice" — now a test).
18. **Null-strategy N pinned:** zero-input must reach treasury < 0 or loss-object
    condemnation within 12 cycles; the spam strategies (max-excavate-only,
    single-room-max) must lose within 20. Numbers are the gate; adjust only with
    logged reasoning.
19. **Cross-state property test:** {ladder rung} × {solvent/insolvent} × {reload at
    ADMIN/RAID/REPORT} — deadlines and rung state survive save/load unchanged.
    Insolvency's effect on the ladder must be DEFINED in M5 (lean: insolvency
    freezes construction, not the ladder) and covered by this test.
20. **Flavor-text pairing gate:** every flavor-string emission pairs with a numeric
    data emission in the same report line (greppable/AST-checkable), plus the
    em-dash/exclamation lint. "Darkly funny" itself stays human-judged.
21. **Per-milestone LOOK checklists:** each milestone's proof capture carries a 3-4
    item checklist tied to its own KEEP mechanic (M2: floors read as carved, not
    placed; M4: raid read as movement, not a tick; M5: annotations legible on the
    cutaway), scored by the looker. A proof image nobody assessed is not proof.

## Addendum (same day) — THE LEGIBILITY LAW (Ray, binding, from the OOR verdict)

Ray, on OOR the same afternoon: an administrative game's UI "NEEDS to be clear and
understandable, like pick up and play, having numbers... without any clear obvious
explanation as to what they are... is counterproductive." MATERIAL BREACH is the admin
sibling; the law binds here from founding, both directions:

- §4.2's existing law (every flavour string ships a plain numeric neighbour) gains its
  INVERSE: **every number ships a plain-language label at the point of reading.** No
  single-letter stat fusions, no bare X/Y tokens without an anchored context, no sigils
  a first-session player would have to ask about. The cutaway's visual grammar (outline
  weight/ramp density/icon count) carries meaning only WITH its legend surface.
- Mechanical lint for the violation shapes joins the flavor-pairing gate (work order
  item 20); the per-milestone LOOK checklists (item 21) add: "could a stranger say what
  every number on this frame means?"

## Addendum 2026-08-14 (harvest boundary) — TYPE REGISTER (design codex 2.101)

Typography follows THIS game's register, deliberately: MATERIAL BREACH is an institutional
document world (served instruments, ledgers, memos on paper). Its faces must be argued from
that register — a deliberate, distinctive pick (typewriter/jobbing/bureau class, or a
tasteful pixel face only if the register argument genuinely lands), never the fleet's
habitual default. The M7b art pass makes the pick and states the argument; Ray verdicts it
with the art. Two checks at every gate: right class for the register, and a distinctive
choice within the class.

# REGISTER SEED — the voice of MATERIAL BREACH

**M0 deliverable, authored from DESIGN-SEED §4.1 with cited exemplars.** This is the voice bible.
Every player-facing string is checked against it (the register pass is M6; the rules bind from the
first string written). The laws here are laws, not preferences: a milestone that violates one is
not complete, whatever its tests say (DESIGN-SEED §4).

---

## 1. The single idea

All player-facing text is the voice of **an organisation documenting its own losses in order to
limit its liability.** Not a narrator telling a story. A facility filing paperwork about the things
that keep happening to it, written by people whose job is to make sure none of it is anyone's
fault.

Named references, specific rather than genre: *Brazil* (Gilliam, 1985); the workplace incident
report; the insurance loss adjuster's assessment. The comic engine is that a party of paladins
disembowelling the night shift is filed as an occupational incident with a root-cause analysis and
a corrective-action owner. The horror and the comedy both come from **the flatness of the filing**,
never from a joke.

---

## 2. The exemplar lines (cited, DESIGN-SEED §4.1)

These are the tone. Write to this bar.

> Night shift (4) did not report for the following cycle. Their absence is recorded as unplanned
> and is not attributable to any deficiency in the posted evacuation procedure.

> The east gallery is no longer load-bearing. Personnel are reminded that the gallery was never
> designated a route of travel and that its use was at all times discretionary.

> A Royal Surveyor entered the premises at Level 2 without presenting credentials at the counter.
> The facility's obligation to admit him is under review. He has been admitted.

> Payday was observed. Twelve of nineteen posts were paid in full. The remainder have been issued a
> written explanation, which they have acknowledged receipt of.

Read what each one does: **it is exact about the number and evasive about the cause.** That split
is the operating principle.

---

## 3. The two laws every string obeys

### 3.1 Prose deflects; instruments are exact (INSTRUMENTS-NEVER-LIE)

Flavour text is deadpan and evasive about *why*. The ledger, the manifests, the tooltips, the works
orders and the damage report are numerically complete and never ironic. **Every flavour string
ships a plain numeric neighbour** — the count, the cycle, the gold figure — in the same report line.
This is greppable and it is a gate (DIRECTIONS fold 20): a flavour emission with no numeric
neighbour is a defect.

The cutaway diagram inherits this: it is an instrument, so it never lies. It draws only what has
been excavated and surveyed; it reports nothing about rock it has not seen (DIRECTIONS fold 1).

### 3.2 Anti-triumph

**No outcome is ever narrated as a victory.** It is recorded as an operational output. A wiped
raiding party is *"reduced to zero effective members,"* filed as a resolution of the incident, not
as something the facility sought. The facility never wants anything; it processes what occurs.

---

## 4. Anti-patterns (each is a defect)

- Epic-fantasy earnestness.
- Snark, memes, or winking at the player.
- Grimdark relish. The prose is not enjoying the violence; it is filing it.
- Exposition dumps. The facility explains procedure, not lore.
- Any joke that knows it is a joke.
- **Em-dashes in player-facing text. Ever.** Use a full stop or a comma. (A standing lint checks
  this, DIRECTIONS fold 20.)
- Exclamation marks in player-facing text. The facility does not raise its voice.

---

## 5. How to write a report line (the working pattern)

Every consequential line pairs an **instrument half** (exact, numeric) with a **prose half**
(deflecting, in-voice), and cites its cause in a state the player could have changed (DIRECTIONS
fold 9, backward attribution).

Pattern: `<instrument: the numbers> + <prose: the deflection> + <cause: the real state>`

Worked examples for events M1-M5 will emit (write future lines to this shape):

- **Payday, partial.**
  Instrument: `Payroll cycle 7: 12/19 posts paid, 240g disbursed, 7 posts deferred.`
  Prose: *"The remainder have been issued a written explanation, which they have acknowledged
  receipt of."*

- **A death on the night shift.**
  Instrument: `Cycle 9: 4 posts vacated (staff casualties), Excavation frontier.`
  Prose: *"Their absence is recorded as unplanned and is not attributable to any deficiency in the
  posted evacuation procedure."*
  Cause: *"The frontier watch-post had been vacant two cycles."*

- **A notice served.**
  Instrument: `Schedule of dilapidations served, cycle 5. Answer due within 4 cycles.`
  Prose: *"A Royal Surveyor entered the premises without presenting credentials at the counter. He
  has been admitted."*

- **A raid resolved in the facility's favour.**
  Instrument: `Incident 3 resolved: raiding party reduced to 0 effective members. 2 posts vacated,
  60g structural repair queued.`
  Prose: *"The incident is closed. No commendation attaches to the outcome."*

---

## 6. Naming register (departments, posts, instruments)

Everything is named as an institution names things, never as a fantasy game does. Fixed in M0:

- **Departments:** Excavation, Treasury, Records, Fabrication, Holding, Quarters, Commissary.
- **The worker caste and posts:** Drudge, Clerk, Artificer, Warden. A job is a **post**; filling
  one is an **assignment**.
- **The escalation officers:** Royal Surveyor, Guild Auditor, Licensing Inspector.
- **Their instruments:** the schedule of dilapidations, the tax lien, the condemnation order.
- **The loss object:** the Cornerstone.
- **The unit of time:** the **cycle**. Never "turn," never "day," never "wave."
- **Signing over:** the operator does not "end the turn"; the operator **signs the cycle over.**

---

## 7. The closing register (tenure, not victory)

The ending is a **tenure with a solvency score** (DIRECTIONS, Ray-ratified). There is no win
screen. A tenure ends at condemnation or insolvency, and the closing document is a final report in
this same voice: cycles served, solvency record, incidents processed. It records how long the
facility stood and how solvent it was when it fell. It does not congratulate. It files.

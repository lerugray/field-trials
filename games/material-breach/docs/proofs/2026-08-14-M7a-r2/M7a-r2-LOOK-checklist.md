# M7a r2 proof checklist — 2026-08-14 — REVISE ROUND, still a HARD STOP FOR RAY

Ray's verdict on r1: *"decent so far but a little crowded/small, log could be better formatted,
otherwise decent, better fonts could be used too, some in that font pack would be appropriate."*

This is a revise round on the PoC, not M7b clearance. **The builder stops again here.** No score, no
SFX, no audio bus, and the cast is untouched: the staff-species question is still Ray's open item.

Battery: **111 pass / 0 fail**, Gate 2 (real mouse against the shipped `file://` artifact) included.
Build: `dist/index.html`, 215 KB, zero external fetches, both type faces embedded.

## The three items

| # | Ray's note | What changed | Verdict |
|---|---|---|---|
| 1 | crowded / small | The section camera FRAMES the built facility (`layout.sectionFocus`) instead of drawing the whole 24x16 grid at a fixed 14px cell. The cell now floats between 14 and 26px; in the proof frames it sits at 22px, so the facility and its cast are more than half again their r1 size. The gutter between drawing and sheet went 4px to 6px, the sheet gained a 13px margin, and the action bar distributes width by weight so no control is cramped. | **DONE**, and a defect it exposed is fixed: during an incident the camera also frames the raiders' approach, because r2's first captures showed a raider sliced in half by the panel edge. |
| 2 | log could be better formatted | The ledger is typeset rather than printed out. A slab heading with a double rule; label/value rows with leader dots and right-aligned figures; a STANDING block for a served instrument; an AFTER-ACTION REPORT zone with its own heading whose space is RESERVED, so the statement yields to the report instead of pushing it off the sheet. Row leading, section leading and rule spacing are one scale in `type.js`. The pre-commit checklist and the closing report are set the same way. | **DONE.** |
| 3 | better fonts, some in that pack | Two faces from the Not Jam Font Pack, embedded as base64 `@font-face` so a `file://` double-click needs no network: **Not Jam Slab Serif 11** for display and **Not Jam Serif 11** for body. Gate 5's minimum text size RISES from 8px to 11px. Licence text ships inside the artifact. | **DONE.** Argument below. |

## Type-register law (DIRECTIONS addendum, design codex 2.101), both checks

The addendum landed at the harvest boundary while this round was in flight and binds the pick. Its
two checks:

- **Right class for the register.** Jobbing/bureau printed-document class: a letterpress slab and a
  book serif, which is what an institutional form is actually set in. Not a game-UI face, not a
  terminal mono.
- **Distinctive within the class.** The pick is a PAIR with a stated division of labour (printed
  versus entered) rather than one face used everywhere, and it is not the fleet's habitual default,
  which was the platform `Courier New` this round replaced. Four rejected candidates are recorded
  below with the reason each lost.

The addendum names M7b as the milestone that makes the pick; Ray's r2 instruction moved it into this
revise round, so the argument is stated here and in PROGRESS for his verdict with the art.

## The register argument for the pick, in one sentence

The sheet is a **pre-printed institutional form**, so the type is a pair rather than a face: a
letterpress slab for the headings that were printed at the stationer's before anything happened,
and a book serif for everything entered onto the form afterwards by whoever was on shift.

Rejected, on the record: the pack's four monospaces are all full-width (one em per glyph), which
gives 34 columns in the ledger and cannot carry the report's prose; `Mono Old Peculiar` also renders
R nearly identically to B at 11px, which the LEGIBILITY LAW does not allow in a document.
`Old Style 11` was the runner-up and lost on its old-style figures, which are handsome and wrong for
a game whose instruments must never be misread.

## Standing laws re-checked at r2

- **Palette law:** unchanged and still asserted. Every colour is a step of a named ramp.
- **VACUUM SEALED stack:** unchanged. Native-resolution composition, lighting as ramp-step
  selection, seeded fbm and Bayer dither, one palette, scenes staged as pictures.
- **Attribution:** cast rows unchanged; two font rows added; the CC0 licence text is appended to
  ATTRIBUTION inside the build, and a missing licence file now FAILS the build rather than shipping
  quietly.
- **Gate 5, re-measured:** minimum text 11px (up from 8px); worst drawn pairing 5.19:1 against the
  4.5:1 floor, unchanged because the palette did not change.
- **Gate 6:** panels still fill >= 95% of the buffer despite the wider gutter.
- **Gate 2:** the real-mouse gate now reads the live camera from the running game. Recomputing a
  fixed geometry would have clicked a different cell than the one under the player's cursor, so the
  gate would have been testing a fiction.
- **Pacing and determinism:** untouched. No simulation or engine behaviour changed this round.

## Shots

Same seven surfaces as r1, same drive, same seed.

- `01-section-departments-and-crew.png` — the administration phase, facility at 22px cells.
- `02-cornerstone-read-in-plain-language.png` — the loss object's hover read.
- `03-officer-in-the-building.png` — a Royal Surveyor in attendance, his instrument stamped on the
  sheet in red with its deadline, the Answer control in the bar.
- `04-pre-commit-checklist-on-paper.png` — the second confirm, set as a form.
- `05-incident-replay-raiders-on-the-section.png` — the party in frame with its approach.
- `06-incident-replay-nearer-the-cornerstone.png` — the party at the Cornerstone.
- `07-tenure-closed-report-on-paper.png` — the closing report, filed.

## Still open, deliberately

The staff cast is human rather than monstrous (r1 ratify item 1). Untouched this round on
instruction; it remains Ray's call.

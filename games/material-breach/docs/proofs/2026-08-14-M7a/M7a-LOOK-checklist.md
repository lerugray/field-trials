# M7a proof checklist — 2026-08-14 — ART PoC, HARD STOP FOR RAY

M7a is **one scene only**: the architectural cutaway, rendered under the §4.5 VACUUM SEALED
technique stack, with cast figures placed. The builder stops here. The next milestone does not
begin until Ray gives an art-direction verdict.

Battery at close: **110 pass / 0 fail** (98 at M6). Build: `dist/index.html`, 165 KB, zero external
fetches, boots from a `file://` double-click. Every frame in this folder was captured from that
artifact in a real browser with real mouse and real keys, and the facility in them was carved by
clicks and advanced by cycles, not staged.

## LOOK checklist (fold 21) — scored by looking at every frame, not by reading the tests

| # | The law | Expected | Where | Verdict |
|---|---|---|---|---|
| 1 | §4.5.1 native-resolution software rendering | The section is composed pixel by pixel into a buffer at native scale, then integer-scaled once at the edge. Nothing drawn at display resolution. | `src/scene.js`, all frames | **PASS.** `composeSection` writes RGBA bytes for the 354x264 section and `composePaper` for the ledger sheet; the canvas is 640x360 and CSS scales it by an integer. |
| 2 | §4.5.2 lighting as compositing, not an overlay | Light chooses WHICH RAMP STEP a pixel takes. No translucent gradient anywhere. | 01, 03 | **PASS.** Departments are lamps whose intensity is their quality; the Cornerstone is a lamp that dims as its condition falls. The only alpha on screen is the modal scrim behind an overlay sheet. |
| 3 | §4.5.3 dither and fbm give material | Surfaces read as rock, plaster, paper. 8x8 Bayer between adjacent steps, ~4 octaves of fbm. | 01 (rock + rooms), 04 (paper fibre) | **PASS.** Rock is hatched, stratified in beds and darkens with depth; the manila has visible fibre and unevenness. Both are seeded, so a facility's stone is the same every run. |
| 4 | §4.5.4 one curated palette in named ramps | Every colour on screen is a step of a named ramp. | `src/palette.js`, `art-stack.test.js` | **PASS.** Ten ramps, asserted monotonically dark-to-light; a test fails the build if any named colour is not a step of a ramp. |
| 5 | §4.5.5 the scene is one composed picture | A staged, lit, framed drawing, not a scatter of tiles. | 01, 05 | **PASS.** A drawing board with a section on the left and a document on the right, in one palette. The section has a header strip and a title block, as a section drawing does. |
| 6 | §4.4 the facility is code-drawn | No pack supplies the building. | 01-07 | **PASS.** Every pixel of the section, the paper and the ramps is original code. |
| 7 | §4.4 the cast is LICENSED PACK ART, no placeholders | Real licensed figures, attributed, shipping in-build. | 01, 03, 05 | **PASS.** Eight figures from NPC Pack — Human Empires (Willibab / Monsteretrope, CC BY 4.0). Originals in `assets/cast/source/`, a row each in `ATTRIBUTION.md`, which ships inside `dist/index.html`. **No placeholder art survives this milestone.** |
| 8 | §4.4 raiders read as human authority, not monsters | The incident is people, and they read as arriving from outside. | 05, 06 | **PASS.** Armoured, helmeted figures crossing uncut rock toward the Cornerstone, drawn from a ramp the building does not use for its own fabric. |
| 9 | The cast is lit by the scene, not pasted onto it | A figure in a bright room and the same figure in a dark corridor are the same figure at different steps. | 01, 05 | **PASS.** Figures are stored as ramp-step offsets and select their steps at the light of the tile they stand on. |
| 10 | LEGIBILITY LAW: could a stranger say what every number on this frame means? | No unexplained sigil; every number labelled at the point of reading. | 01, 02, 03 | **PASS, with one call-out.** Single-letter department tags were REMOVED this pass (they were exactly the "sigil you would have to ask about" the law forbids); departments now read from their outline, their ramp, and the named ledger row. The title block names the grammar and counts who is standing on the floors. Hovering any cell prints a plain-language read, including which caste works a department. |
| 11 | Gate 5, re-measured after the palette change | Text size and contrast measured as numbers on the shipped artifact. | `GATE5-legibility-measured.md` | **PASS.** 8px floor held; worst drawn pairing 5.19:1 against a 4.5:1 floor. |
| 12 | Gate 6: screen fill >= 95% | The composed picture fills the buffer. | 01 | **PASS.** Panels cover ~97%; asserted geometrically. |
| 13 | The instrument does not lie | Nothing in the drawing contradicts the ledger. | 03, 05 | **PASS.** The title block's count of staff, raiders and officers matches the figures visible; the standing officer in the ledger is the figure standing in the building; the Cornerstone's ring turns to rust exactly as its condition line does. |

## Defects found BY LOOKING, and fixed before this set was captured

The value of the LOOK checklist this milestone was that all five of these passed the battery:

1. **The cast rendered as featureless blobs.** Figures were lifted by the full light range, which
   pushed all four of their steps into the top of their ramp and flattened the modelling. Fixed by
   sizing the figure's light gain to the steps it actually has.
2. **The cast disappeared into pale rooms.** Fixed by rendering each figure's own darkest value
   (its drawn outline) in ink, which keeps the silhouette without growing it by a pixel.
3. **The pre-commit checklist's own confirm buttons were drawn UNDER the overlay sheet** and could
   not be seen at all. The overlay now goes down before the controls.
4. **Text ran off three different panels**: the ledger's report lines past the bottom of the paper,
   the section legend past the cutaway edge, and the tool button's label across its neighbour.
5. **The incident replay's skip button covered the title block**, hiding the legend it needs.

## Shots

- `01-section-departments-and-crew.png` — the administration phase. Five departments carved and
  designated, seven staff standing at posts, the ledger on paper beside the drawing, a plain
  language hover read at the foot of the screen.
- `02-cornerstone-read-in-plain-language.png` — the same drawing with the pointer on the loss
  object, so its read is on screen at the point of reading.
- `03-officer-in-the-building.png` — a Royal Surveyor has served a schedule of dilapidations. He is
  standing inside the facility in stamp red, the notice is stamped on the paper with four cycles
  left, and the Answer control has appeared in the action bar.
- `04-pre-commit-checklist-on-paper.png` — the second confirm, as a document laid on the desk.
- `05-incident-replay-raiders-on-the-section.png` — two raiders crossing uncut rock, their route
  dotted behind them, their remaining strength annotated on the drawing.
- `06-incident-replay-nearer-the-cornerstone.png` — the party at the Cornerstone, strength worn
  from 9 to 3 by the defence, the ring already in rust.
- `07-tenure-closed-report-on-paper.png` — the closing report, filed. No commendation attaches.

## Gates standing green at M7a

Gates 1, 2, 3, 4, 5 (re-measured), 6, 7, plus raid-variance, flavour-pairing, the legibility-law
lint, the register lint, the report-consequence law, the officer/notice law, the save/load property
test, and the new art-stack gates (ramp monotonicity, off-palette colour detection, Bayer
correctness, seeded-grain determinism, light clamping).

## What is NOT in this milestone

M7b, deliberately and per hard rule 5: the full art pass, the House Band score, the SFX, and the
one-audio-bus contract item. The UI icon pack and the ledger typeface (`Willibab-s-Retro-Icons`,
`Not Jam Font Pack`) are candidates for M7b and are **not copied in**, so nothing is standing in for
them. The renderer uses the platform monospace face and code-drawn marks.

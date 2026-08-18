# M7b LOOK checklist — the full art pass and the score

DIRECTIONS item 21: every milestone's proof capture carries a checklist tied to its own KEEP
mechanic, scored by the looker. A proof image nobody assessed is not proof.

**Scored by the builder, by opening each frame and looking at it.** Where a judgement could be
measured instead of eyeballed, it was measured, and the number is given.

Frames captured by `scripts/capture-proof-m7b.mjs` driving the shipped `dist/index.html` in a real
browser with real mouse and real keys, on the same seed and the same drive as the ratified M7a r3
set, so the two are directly comparable: what differs between them is the art pass and nothing else.

---

## 1. Is the whole screen ONE picture, or two composed panels on a painted rectangle? (§4.5 item 5)

**PASS.** `01-section-departments-and-crew.png`. The desk is now a material — pressed fibre board
with a coarse grain and a fine sideways fibre, lit by a single lamp in screen coordinates that is
the same lamp the sheet is lit by. Before M7b it was one `fillRect` of ink[0], which meant "the
scene is composed as a single picture" was true of the section and of the sheet individually and
false of the screen they shared. The margins, the header band and the action-bar band now read as
one continuous surface that the drawing and the paper are lying on.

Measured: the composed desk spans ink[0] to ink[2] across the frame, with the lamp falloff placing
the darkest material at the corner furthest from it.

## 2. Do the controls read as objects on a desk, or as rectangles? (§4.5 items 1-4)

**PASS.** `09-the-controls-close.png`. The action bar's buttons were the last widgets in the game
outside the stack: a flat fill plus a one-pixel stroke. They are now composed — a bevel catching
the desk's own lamp on the top and left, a shadow under the bottom and right, a slight dome across
the face, grain, and an ordered dither. At 1x they are small, which is why the proof includes a
crop; a reviewer cannot assess a 26-pixel-tall control from a full frame.

## 3. Is the overlay backdrop lit, or washed? (§4.5 item 2 — the violation this pass fixes)

**PASS.** `08-pause-document-on-a-dimmed-desk.png`. Until M7b the backdrop behind a document was
`fillStyle = 'rgba(6,6,8,0.82)'` painted across the finished frame, which is precisely and only
what item 2 forbids: light as a translucent sheet laid over finished art rather than as a choice of
ramp step. Every pixel is now resolved to the ramp and step it *is*, and a lower step of that same
ramp is selected.

Measured, at identical coordinates across two frames: the visible ledger strip goes `#a5987d`
(paper[3]) to `#5f5747` (paper[0]) — three steps down its own ramp, still manila. Red stamp text
steps down the stamp ramp to `#320a0a` rather than turning grey. The desk where it already sits at
ink[0] does not change, because a ramp has a floor.

> **Note against my own first reading.** Looking at the frame, I judged the dim to be missing. It
> was not; the sampling above is what corrected me. Recorded because an eyeball verdict that
> contradicts the artifact is exactly the class of claim that has to be measured before it is
> relayed.

## 4. Is anything Ray ratified at r3 changed? (the directive's cast and staging discipline)

**PASS — nothing.** Compare `01`, `05`, `07` against `docs/proofs/2026-08-14-M7a-r2/` and the r3
frame. The section drawing, its lighting, the manila sheet, the typeset ledger with its reserved
report zone, the Not Jam pairing, the legend and title block on manila, and the bottom status strip
are all exactly as ratified. **The bottom status strip was not touched**, which Ray specifically
declined a change to.

**The cast is untouched.** No figure was added, replaced or restyled. The six sketched escalation
officers stayed at the two that shipped, because the directive says not to add cast figures beyond
what the pass genuinely requires and Ray did not ask for the third silhouette.

## 5. Does the score have real harmonic movement, and does it curdle without changing genre? (§10)

**PASS, measured.** `scripts/verify-harmony.mjs` extracts a chroma profile from every bar of the
rendered audio and matches it against the written chord and all eleven transpositions of it:

| render | written chord is the sounding chord | root motion | distinct roots |
|---|---|---|---|
| lobby, sweet | 32/32 bars (100%) | 26 of 31 (84%) | 10 |
| lobby, fully curdled | 32/32 bars (100%) | 26 of 31 (84%) | 10 |
| tenure closed | 12/12 bars (100%) | 11 of 11 (100%) | 7 |

The curdled row is the §10 law measured: root motion identical to the sweet version, so the score
sours *without* abandoning its progression.

## 6. Does the game actually make a sound when a player clicks it? (behaviour, not decoration)

**PASS.** `scripts/probe-audio.mjs` taps the destination of the shipped `dist/index.html` in a real
browser. Before any gesture: no AudioContext is constructed at all. After one real click: the lobby
track is playing at rms 0.058. `mute(true)` takes it to rms 0.0000000 through the single bus;
`mute(false)` restores it. The cycle does not advance while the music plays. `quit()` closes the
context.

## 7. Could a stranger say what every number on this frame means? (THE LEGIBILITY LAW)

**PASS, and unchanged.** Every ledger row is a plain-language label with its own figure; the legend
names the drawing's grammar; the status strip prints a plain read of whatever the pointer is over.
Gate 5 was **re-measured**, not inherited, because the pass moved the ground under text — worst
pairing 5.16:1 against a 4.5:1 floor across 18 pairings, up from 14.

The re-measurement caught a real regression the art pass had introduced: the incident-replay label
on the composed desk fell to 4.41:1. Fixed at the ground (the header band is now held quiet) rather
than by relaxing the gate. Full detail in `GATE5-legibility-remeasured.md`.

---

## Frames

| file | what it shows |
|---|---|
| `01-section-departments-and-crew.png` | the desk as one composed picture; five departments, crew at posts |
| `02-cornerstone-read-in-plain-language.png` | the loss object read in plain language on hover |
| `03-officer-in-the-building.png` | a served instrument, the officer standing, stamp-red on the sheet |
| `04-pre-commit-checklist-on-paper.png` | a document laid on the dimmed desk |
| `05-incident-replay-raiders-on-the-section.png` | the party walking in; the Cornerstone's pulse |
| `06-incident-replay-nearer-the-cornerstone.png` | the same, nearer |
| `07-tenure-closed-report-on-paper.png` | the closing report |
| `08-pause-document-on-a-dimmed-desk.png` | **the new backdrop as the subject**, with the composed controls |
| `09-the-controls-close.png` | **the composed controls, cropped**, since 26px is not assessable in a full frame |

## Listen set

`docs/listen/2026-08-14-M7b/` — five files, about twelve minutes, two full form cycles per context,
normalised to -16 LUFS, with `WHAT-TO-LISTEN-FOR.md`. **The score is not closed by this checklist.**
It is closed by Ray's ear, and that is the one gate here a builder cannot score.

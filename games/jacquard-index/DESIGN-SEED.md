# THE JACQUARD INDEX — design seed (founding contract)

Nonogram deduction with the machine perfected, wrapped in a UFO-50-style catalog of
one-twist "pattern cards" from a defunct textile house. NAME LOCKED at launch (Weiss +
orchestrator, per the operator's delegation): THE JACQUARD INDEX — it states the
system and the fiction's object (the master index of punched pattern cards that IS
the game's catalog). Prior working name SELVEDGE retired.

## THE REFERENCE (specific, not genre)

**Picross (Nintendo's nonogram line — Mario's Picross through Picross S).** The
machine: a grid; each row/column carries clue numbers = the lengths of consecutive
filled runs in order, with at least one gap between runs; the player deduces every
cell as filled or empty; solving reveals a picture. Verbs: fill, mark-empty (X),
and pencil marks. CLEAN-ROOM LAW: mechanics only; "Picross" is Nintendo's mark —
never used in-game; no Nintendo puzzle content, characters, or trade dress.
UFO 50 contributes a SHAPE, not content: a catalog of small complete games, each
with one twist, unified by a fictional history. No UFO 50 expression either.

## THE STREAMLINE (why this one is better)

1. **No guessing, ever, provably.** Every puzzle ships with a machine-checked
   proof: unique solution AND solvable by pure logical deduction (the generator
   embeds a human-style solver; puzzles requiring bifurcation are rejected). This
   is the genre's chronic failure and our core quality claim.
2. QoL as law: drag-painting; auto-X on satisfied lines (toggle); clue dimming as
   runs are satisfied; unlimited undo; pencil marks; no lives, no forced timer —
   classic mistake-penalty exists only as an opt-in cartridge rule.
3. A real hint SYSTEM (progressive: point at a line with a deducible move -> name
   the technique -> show the deduction), never "reveal a cell" slop.

## THE HOOK — the pattern library (catalog of one-twist cartridges)

Frame: the rediscovered pattern library of a defunct 19th-century textile house.
Each CARD-SET (cartridge) = the core machine + ONE rule twist, introduced by a
short blurb in the house's voice and a teaching puzzle. Solved patterns are WOVEN:
reveals render as cloth, and completed sets assemble panels of the house's story
(light meta-narrative through images + blurbs — charm, not lore-dump).
v1 ships EIGHT card-sets. Twist candidates (builder latitude, bounded by the law
that every twist preserves provable no-guess deduction): two-thread weave (paired
color clues); counting-house (out-of-order clue sums, Mega-Picross-style paired
rows); negative cloth (clues describe the gaps); patchwork (small panels tile into
one large reveal); mirror-weave (declared symmetry as a clue); thread-economy
(shared thread budget across a set — bounded); one classic-penalty "house rules"
set; the eighth is the builder's own invention, flagged for operator ratification.

## REGISTER (working lock — Weiss consult may sharpen before launch)

The working pattern-room of an 1890s mill — FUNCTIONAL SHOP-FLOOR AUTHENTICITY,
never boutique romance (Weiss law, from the operator's own taste record). Drafting
tables, gridded pattern paper, brass indexing tabs, punched manila cards, sizing
oil, machined fittings; light is working light. The register gate on every surface:
would an 1890s mill pattern-cutter find this gratuitous? If yes, cut it. Grids read
as warp/weft on gridded pattern paper; filled cells are STITCHES with thread texture
(the dither/fbm bar serves this); reveals finish as woven cloth with visible weave.
Chrome is functional: index tabs, card labels, job tickets. Palette rotates per
card-set within the dye-house range, always subordinate to legibility.
The failing-test question on every surface: does it look cheap?
Graphics technique: the ratified code-gen bar (CLAUDE.md) — native-res software
rendering, light rigs as compositing, dither/fbm materials. SELVEDGE's register is
its own; no other title's look transfers.

## SCORE (House Band; register stated per the law)

The loom as the band, grounded in a specific harmonic vocabulary (Weiss): the
loom's mechanical rhythm is a metronomic pulse that leaves gaps; the melody weaves
THROUGH the gaps — zigzag lines mirroring the grid's alternating rows; harmony
favors root+fifth ambiguity voicings and open-string resonance (concertina/
whistle-class synth voices). It should feel like a working machine, not a
soundtrack. Intensity follows solving cadence (confident deductions build the
rhythm; an idle stall thins it). Reveals get a woven cadence, not a fanfare.
Code-composed WebAudio; no audio files.

## PUZZLE CONTENT

Pictures are authored CODE (pixel motif library in-register: textile motifs,
tools, flora, the house's story panels — nonogram-shaped by nature). The
generator builds clue-sets from motifs and PROVES each puzzle per the streamline
law. Sizes: 5x5 teaching through 15x15 standard; 20x15 only for finale panels.

## STACK

Plain JS + canvas, zero deps, node --test, single-file boot-anywhere build
rebuilt every milestone. Mouse + keyboard first-class; 60fps trivial and held.

## MILESTONES (each ends battery-green + committed + pushed)

- **M0** Scaffold: native-res frame pipeline, input, test harness, single-file
  build. Boots to a composed title frame (no placeholder art).
- **M1** The machine: STUDY doc (empirical characterization of the reference's
  rules + the named QoL set), then grid/clue/verb engine, the SOLVER (the heart —
  adversarial tests: uniqueness, no-guess certification, technique ladder), the
  generator pipeline, QoL set, hint system. Playable core with a starter motif set.
- **M2** The weave: reveal rendering as cloth, motif library (~60 pictures across
  sizes), set/panel assembly, the house frame (blurbs, library shelf UI).
- **M3** The catalog: eight card-sets with twists, teaching puzzles, progression
  and unlock flow (gentle — the library opens shelf by shelf), the invented
  eighth twist flagged for ratification.
- **M4** The pattern-room: full art pass at the bar — PoC scene FIRST for
  operator screenshot verdict, then the pass.
- **M5** The loom: House Band score per the stated register + sound hooks
  (stitch, line-satisfied, card complete, reveal cadence).
- **M6** Genre-completeness + QoL gate: enumerate the genre's table stakes
  (save/resume anywhere, per-puzzle timers as opt-in stats, completion tracking,
  settings incl. reduced-motion + colorblind handling for two-thread sets via
  thread SHAPE not hue alone, input rebinding, touch-friendly hit targets);
  audit; land or defer each with a named reason. Legibility floor measured:
  clues readable at all sizes, text never clips, mistakes (in penalty sets)
  communicated in-world.
- **M7** Ship gate: acceptance dossier (BLOCKER/DEFECT/FRICTION) + player-path
  soak (scripted probe solves full puzzles through the real UI, error traps
  armed; loud-failure law) + screen-fill gates (>=95% both dims at 1280x800,
  1440x900, 2560x1440) + final single-file build + proof captures.

**Stop at M7. Everything further is operator-directed.**

## STUDIO AMENDMENTS (binding — pre-fire edge-sweep, 2026-08-10)

Five studio roles attacked this seed before launch. Triaged results, all BINDING:

**The solver is verified against an ORACLE, not itself (M1):**
- Brute-force enumeration cross-check on every puzzle <=10x10 in the suite (uniqueness
  AND solution agreement). CONSTRUCTED ambiguous fixtures (checkerboard-class classics)
  as must-reject negative tests; known technique-demanding fixtures as positive tests.
- The TECHNIQUE LADDER is enumerated now and the solver reports each puzzle's deepest
  tier: T1 line-complete/trivial-fill; T2 overlap/forcing; T3 edge-anchoring +
  cross-line propagation; T4 bounded-split elimination (still guess-free). Difficulty
  rating, unlock pacing, and the hint ladder ALL derive from reported tier. The
  no-guess law caps the ceiling at T4 BY DESIGN — state it in-game as the house's
  guarantee, not a limitation.
- The generator and the hint system must not share a single solver implementation
  unchecked: the oracle cross-check covers the certifier; hints replay the certified
  deduction path.

**The machine's feel is specified, not discovered (M1):**
- Line-tracking spec: crosshair + active row/col highlight + satisfied-clue dimming.
- Drag semantics: a stroke applies only the action of its first cell to cells in the
  SAME prior state; crossing a conflicting cell ENDS the stroke; strokes undo
  atomically; revisiting within the stroke corrects it. Click-vs-drag threshold set so
  a shaky click never smears.
- Pencil marks: distinct visual weight; auto-X never overwrites a pencil mark.
- Zoom/cell-size range specified; clue digits carry a numeric native-px floor verified
  at 15x15 and 20x15.
- Full keyboard-only play for every verb; the M7 soak includes one keyboard-only run.

**Progression is DIEGETIC (Weiss):** every solved puzzle cuts a physical punch card
that slots into the master index on screen; completing a shelf's set audibly locks
its index drawer and adjusts one mechanical constraint of the house (presented as
shuttle tension / gear ratio), which is the in-fiction face of the next shelf's
technique-tier step. Difficulty scales through the tier system, never arbitrary
spikes; the index IS the progress screen.

**The catalog roster is FIXED (eight shelves) and the risky twists are resolved:**
0. THE LOOM — the primer shelf: pure base machine taught from zero (a clue is
   run-lengths in order with gaps; one manual-X teaching moment, THEN auto-X defaults
   ON). No twist. This is shelf one of eight.
1. TWO-THREAD — paired color clues; thread identity by stitch SHAPE from day one
   (its colorblind treatment ships WITH it, not at M6).
2. COUNTING-HOUSE — paired-row overlap clues (Mega-Picross class). The out-of-order
   sums variant is DROPPED (different solve mode; conflation removed).
3. NEGATIVE CLOTH — gap clues with the convention FIXED in the spec: clues list empty
   runs in order, grid-edge gaps included explicitly, zero allowed; the twist's prover
   extension proves uniqueness under that exact convention before content ships.
4. MIRROR-WEAVE — declared symmetry as a clue constraint.
5. HOUSE RULES — the classic mistake-penalty ruleset as an opt-in shelf.
6. THE INVENTED TWIST — builder-proposed DURING M1 (while solver architecture is
   live), prover extension prototyped then, operator ratification before its shelf
   ships. Never invented cold at M3.
7. THE GRAND PATCHWORK — the finale shelf: panels assembling the house's story
   (patchwork is an ASSEMBLY frame, not counted as a deduction twist).
- THREAD-ECONOMY IS CUT from v1 (a cross-puzzle resource meta-game is a different
  reasoning mode and threatens the no-guess law).
- Honesty note, owned: two-thread and counting-house exist commercially; the catalog's
  novelty is the frame + the solver guarantee + the invented twist, not per-twist
  world-firsts.

**Scope rebalance:**
- Each shelf ships 12 puzzles + its teaching puzzle (~104 total + finale panels);
  motif library target ~110, sized to that.
- M2 adds a BINDING ASSERTION: the woven reveal render is pixel-checked against the
  solution grid in the suite (never eyeball-only).
- M3 splits: M3a = shelves 0-3 with per-twist prover extensions + per-twist hint
  entries + adversarial suites; M3b = shelves 4-7 same standard. Each twist's prover
  extension is a mini-M1 and is scoped as such.
- Save/resume preserves pencil marks AND undo history; undo edge cases get named
  tests (undo across hint-reveal, auto-X interaction, mid-drag cancel, post-completion).
- Legibility floor measured by script (clip/bbox probe), not eyeball.

**Accessibility (laws named now):**
- DAYLIGHT mode: an in-register high-contrast alternate (morning light through the
  mill windows) hitting AA contrast for clue text; per-pair numeric contrast targets
  for filled/empty/pencil/ground land with M2.
- Hints: always-visible button, uncapped, zero penalty, never flagged in stats.
- Overview/minimap for 15x15+ boards; per-puzzle difficulty (tier) shown on the card.

## Builder conduct

Small verified increments; checkpoint-commit and push at every green state; one
increment is never completion; PROGRESS.md updated every run with "For the
operator to ratify" notes (assumptions + your lean). Operator DIRECTIONS-*.md
files outrank this seed. Placeholder art is a defect. Failures are LOUD: runtime
errors surface in-game and land in an exportable debug log.

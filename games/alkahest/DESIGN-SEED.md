# ALKAHEST — design seed (founding contract)

A run-based panel-dissolving puzzle battler: the machine of Tetris Attack, the soul of an
alchemist's bench, and a formula-drafting hook that makes it its own game.

## THE REFERENCE (specific, not genre)

**Tetris Attack / Panel de Pon (SNES, Intelligent Systems).** The machine being
reverse-engineered, precisely:
- 6-wide well; the stack RISES continuously (rate accelerates per level/act).
- Cursor spans 2 cells horizontally; the ONLY verb is swapping those two panels.
  No rotation, no dropping. Vertical movement of material happens via gravity alone.
- 3+ in a row/column of one reagent clears. Panels above fall. Falls that form new
  matches = CHAIN (x2, x3...). 4+ cleared simultaneously = COMBO.
- Chains/combos send DROSS (garbage slabs) to the opponent; slabs crush onto their
  stack; clearing panels adjacent to a slab transmutes the slab's bottom row into
  live panels.
- Chains FREEZE the rise timer (stop-time). Near-death: top-out warning state.
- The skill ceiling is ACTIVE CHAINING: re-arranging mid-cascade to extend chains.

CLEAN-ROOM LAW: characterize and rebuild the MECHANICS; zero Nintendo expression.
No fairies, no character names, no sound-alike title, no trade dress. The study doc
(M1's first increment) characterizes the machine from documented behavior — measure
and specify, never copy.

Streamlining mandate (the "updated" half): forgiving swap buffering, readable
cascade telegraphs, hitch-free 60fps, a first-session-legible surface. The machine's
depth stays; the 1996 opacity goes.

## THE HOOK — the folio of formulae (deckbuilding run)

- A RUN = the Magnum Opus: four acts — NIGREDO, ALBEDO, CITRINITAS, RUBEDO — each
  2-3 bouts vs rival alchemists' alembics (AI), each act ending in a rival with a
  signature dross pattern. Lose a bout, the work is ruined (run ends; no meta-unlock
  wall in v1 — a fresh run is always the full game).
- Chains/combos charge the ATHANOR gauge.
- Between bouts: draft ONE of three FORMULAE into your folio (deck):
  - Passives (reactions): e.g. "Calcination: chains of 4+ also burn one adjacent
    dross row." Always on once drafted.
  - Actives (brews): spend athanor charge, e.g. "Aqua Regia: dissolve one chosen
    column." Bound to a key, visible charge cost.
  - Bargains: stronger effects with a cost (thicker incoming dross, faster rise).
- Folio cap ~8; drafting past cap requires discarding — the deck stays readable.
- Rivals also visibly operate under 1-2 named formulae (telegraphed), so acts read
  as duels of philosophies, not difficulty ramps.
- Exact card list, costs, and counts are builder latitude WITHIN these constraints:
  every formula must alter play the player can SEE, none may automate chaining
  itself (the player's hands stay the skill), and every effect works through the
  panel machine (no ignore-the-board damage).

## REGISTER (locked — the aesthetic law)

The candlelit alchemist's bench at night. Glass, brass, slate; warm practical flame
(burner, lamp, coals) against cold stone dark. Panels are corked reagent phials and
mineral tesserae — six reagent types coded by SHAPE + GLYPH + COLOR (never color
alone). Clears are dissolutions (glass empties, vapor curl); chains bloom as brief
alchemical fires colored by reagent; dross is slag — dull, matte, heavy. The four
acts shift the palette with the opus: Nigredo's char-blacks and cold blues; Albedo's
bone and silver; Citrinitas' candle-golds; Rubedo's deep reds. UI chrome is engraved
brass + handwritten folio ink.
The one failing-test question, asked of every surface: **does it look cheap?** If a
frame could be mistaken for a programmer prototype, it is not done.
Graphics technique: the ratified code-gen bar (see CLAUDE.md) — native-res software
rendering, light rigs as compositing, dither/fbm materials, scenes composed as
pictures. ALKAHEST's register is its OWN; no other title's look transfers.

## SCORE (House Band; register stated here, per the law)

Glass and clockwork: armonica-like bell tones and struck-glass motifs over a quiet
clockwork pulse; intensity follows stack height and chain events via the params
timeline; stop-time moments let the bells hang. NOT ambient dread; NOT chiptune.
Warm room-tone under everything. Code-composed WebAudio (House Band kit pattern),
register-neutral kit + this game's own voice presets.

## STACK

Plain JS + canvas, zero deps, node --test suite, single-file boot-anywhere build
(file:// double-click) rebuilt every milestone. 60fps on a mid laptop.

## MILESTONES (each ends battery-green + committed + pushed)

- **M0** Scaffold: repo layout, native-res frame pipeline, input, test harness,
  single-file build script. Boots to a composed title frame (no placeholder art).
- **M1** The machine: STUDY doc first (empirical characterization of the reference
  machine, clean-room), then grid/swap/gravity/match/chain/combo engine with
  exhaustive tests (chain detection is the heart — test it adversarially), rising
  stack + acceleration, stop-time, top-out. Playable solo endless at native res
  with placeholder-free reagent art meeting the bar.
- **M2** The duel: dross exchange (send/receive/crush/transmute), AI alembic
  opponent with tunable skill (it must visibly swap and chain, same rules as the
  player), bout flow (win/loss states, near-death telegraphs).
- **M3** The run: four-act ladder, bout schedule, formula draft between bouts,
  folio UI, athanor gauge + active casting, rival signatures, run end states.
  Initial card set ~16 formulae across the three classes.
- **M4** The bench: full art pass to the register at the ratified bar — PoC scene
  FIRST for operator screenshot verdict, then the pass. Per-act palettes, lit
  bench framing the well, dissolution/chain/dross VFX, brass chrome + folio.
- **M5** The music: House Band score per the stated register, adaptive to stack
  height/chains/stop-time; sound hook points for swap/clear/chain/dross/draft.
- **M6** Genre-completeness + QoL gate: enumerate the reference genre's table
  stakes (pause, settings incl. reduced-motion and speed presets, save/resume a
  run, stats at run end, replay-a-seed, key rebinding, first-session tutorialette,
  kill/clear acknowledgement); audit; land or defer each with a named reason.
  Legibility floor measured: every reagent readable on every act palette,
  colorblind-safe by construction (shape+glyph), text never clips, blocked input
  answers in-world. Accessibility is a floor, not a tradeoff.
- **M7** Ship gate: acceptance dossier (BLOCKER/DEFECT/FRICTION) + player-path
  soak (scripted probe plays full bouts through the real UI, error traps armed;
  loud-failure law verified) + screen-fill gates (>=95% both dims at 1280x800,
  1440x900, 2560x1440) + final single-file build + proof captures.

**Stop at M7. Everything further is operator-directed.**

## WEISS AMENDMENT (binding — register is PHYSICS, not paint)

The four acts each change ONE rule of the machine, not just the palette — the opus
stages must be felt in the hands. Starting directions (builder tunes the values, keeps
the shape; each act's rule is taught by its first bout): Nigredo — heavier gravity,
slower falls (the dark, dense stage); Albedo — volatile clears (dissolutions can
sublimate one adjacent panel); Citrinitas — tighter dross exchange (sending and
receiving both amplified); Rubedo — all-or-nothing (chains below x2 yield nothing,
chains above burn brighter). Two corollaries, same authority: FORMULAE never read as
flat numeric buffs — every effect compounds THROUGH the machine (trades, delays,
transmutations), and the score's intensity tracks procedural state (chain density,
stack height), never decorative triggers. No genre escape valves: no undo, no
infinite-time mode outside the accessibility floor, no safe banking.

## STUDIO AMENDMENTS (binding — pre-fire edge-sweep, 2026-08-10)

Five studio roles attacked this seed before launch. Triaged results, all BINDING:

**Machine (fold into M1):**
- MANUAL RAISE is IN: the player can force the stack upward (the reference's skill verb
  for dross timing and stack cycling). Cursor CLAMPS at edges (no wraparound).
- Swap input buffering gets a NUMBER as an acceptance test (target: a swap pressed up to
  ~150ms early executes when legal), not an adjective.
- Test fixtures required, by name: two independent match groups clearing the same tick
  count chains separately; L/T overlapping matches; simultaneous row+column matches;
  clear-vs-rise ordering pinned by explicit rule and test; swap-during-fall resolved in
  SIM tests independent of rendering; determinism/seed-replay test from M1 onward; a
  worst-case full-board cascade perf fixture from M1 (60fps mandate is tested early,
  not at M7).
**Duel (fold into M2):**
- PAUSE-ANYWHERE is a locked M2 requirement (instant rise-freeze, resumable) — never
  deferrable.
- Dross lands only BETWEEN cascade steps, never mid-step (chain continuity is sacred).
  Transmutes triggered by chain-generated clears cascade normally.
- Stop-time: within one sustained freeze sequence, consecutive freezes have diminishing
  duration (no infinite stall). Swapping during freeze is legal and tested.
- AI parity is PROVEN, not claimed: the AI emits the same move primitives as the player;
  a replay-log legality diff test asserts it.
- Tutorialette lands HERE (after the machine exists, before the run layer): teach swap,
  chain vs combo (each gets a DISTINCT visual + audio vocabulary and an on-screen
  readout), manual raise, and the chains-freeze-the-rise rescue at near-death.
  Near-death is COMMUNICATED: escalating audio sting, dying-column flag, grace window.
**Run (fold into M3):**
- Pure ladder is DELIBERATE for v1 (no StS map) — but between acts there is a WORKSHOP
  stop: remove one formula OR upgrade one (the economy lever; keeps the folio alive).
- Drafts are SKIPPABLE and UNTIMED. Draft offers always show one card of each class.
  Owned formulae are never offered again (no duplicates); same-name effects never stack.
- Athanor gauge is CAPPED (overflow wasted — forces spend cadence). The bargain
  self-reinforcing loop (faster rise -> more chains -> more charge) is a named test
  target in tuning.
- Rival power and player power grow on the SAME axis (machine skill + formulae);
  a curve test plays each act boundary at parity settings.
- Loss is single-elimination, DECLARED (arcade stakes; revisit post-M7). Act 1 bout 1
  gets explicit mercy tuning (slower rise, gentler rival) — first-session failure is
  safe by design.
- SOFTLOCK LAW: no reachable board state may make a dross slab permanently
  untransmutable; the builder proves it with a dedicated test (crush patterns + stall
  states included).
- First-charge athanor pulse + first-active-draft callout (discoverability); card text
  uses only vocabulary the tutorialette taught; card iconography obeys the same
  shape+glyph colorblind law as panels.
**Art (before M4 authoring):**
- PHOTOSENSITIVITY SPEC precedes the art pass: no full-screen strobes, a cap on
  simultaneous chain-fire flashes, a flash-intensity setting. Cross-checked against
  stop-time pacing in M6.
**QoL floor (M6, laws named now):**
- Assist/slow floor: a no-acceleration rise preset exists (accessibility floor, not a
  difficulty insult). Minimum readable text size verified at all three M7 resolutions.
  Audio-cue redundancy for near-death, incoming dross, and rival casts. Default key
  cluster playable one-handed. Colorblind verification runs per-act x per-reagent
  (six reagents must survive all four act palettes; Rubedo's reds are the named risk).

## Builder conduct

Small verified increments; checkpoint-commit and push at every green state; one
increment is never completion; PROGRESS.md updated every run with "For the operator
to ratify" notes (assumptions + your lean). Operator DIRECTIONS-*.md files outrank
this seed. Placeholder art is a defect, not an increment. Failures are LOUD:
runtime errors surface in-game and land in an exportable debug log.

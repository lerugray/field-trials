# SHOELEATHER — design seed (founding contract)

A brutally difficult point-and-click detective game in the register of 1970s American
TV inverted mysteries. The player already KNOWS who did it — the game is PROVING it,
with the perception and reasoning of a great detective. Name locked (Weiss+Claude per
operator delegation): the method is the game.

## Reference (clean-room; characterize, never copy)

- **Structure + register: the classic 1971-78 era of the American "howcatchem" TV
  mystery.** The rumpled, chronically underestimated police lieutenant; the arrogant
  high-status murderer shown committing the crime up front; the case cracked by
  noticing small wrong details and asking one question too many. CLEAN-ROOM LAW: no
  real names, no actor likenesses, no episode titles, no beat-for-beat plot copies.
  The WINK is register: raincoat-class rumpled detective, cigar, a verbal tic of
  returning with an afterthought question (our own phrasing, never the canon
  catchphrase). Episode DEVICE CLASSES (recorded alibis, staged burglaries,
  time-of-death tricks, closed settings) are genre furniture — fair inspiration for
  ORIGINAL cases.
- **Deduction difficulty: Return of the Obra Dinn / The Case of the Golden Idol
  class** — assembled conclusions from observed facts; brutal but always fair.
- **Point-and-click mechanics + art bar: VACUUM SEALED** (the in-house exemplar).

## The shape of play (per CASE)

1. **PROLOGUE AS THE MURDERER** (interactive, short). The player performs the murder
   and cover-up. LAW (prologue-key): each case's winning chain requires at least one
   PROLOGUE-KEYED reading — a clue whose correct interpretation depends on something
   only witnessed here. The prologue is the knowledge asymmetry, not a mood cutscene.
   It is also the tutorial: forced-linear, exercises every core verb once, and
   includes one stakes-free challenge rep (challenge the cover-up's own witness).
2. **INVESTIGATION**: point-and-click scenes; hotspots; item pickup and close
   examination; readable documents (letters, ledgers, photos, receipts, TV listings)
   that are genuinely load-bearing; interviews and re-visits.
3. **THE NOTEBOOK** — the core instrument. Facts OBSERVED auto-log (never
   conclusions); suspect statements log verbatim; the player pins, groups,
   cross-references, and can search/filter by person, scene, and type (day-one IA —
   a case ends around 200+ facts and must stay navigable). A case-review view
   restates KNOWN FACTS only. Nothing marks what matters.
4. **INTERROGATION + CONTRADICTION**: suspect statements can be CHALLENGED with a
   statement x evidence pairing. Wrong challenges COST: the suspect visibly hardens
   (finite tolerance) and counter-moves (evidence gets cleaned up, a path closes).
   Interrogations are ATOMIC SCENES: no saving inside one; auto-checkpoint on scene
   entry/exit. Tolerance and statement logs persist across visits; suspects RELAX
   after time spent elsewhere (a visit-count timer) — the afterthought-question
   mechanic fires on re-entering with a relaxed suspect and hits harder. Suspect
   state is DIEGETIC: portrait posture/expression stages, never numbers.
5. **THE GOTCHA** — the accusation is a SLOTTED ASSERTION BOARD (Golden-Idol-shaped),
   filled from pinned notebook facts: [SUSPECT] killed [VICTIM] by [MEANS] at
   [TIME/PLACE]; the alibi fails because [FACT] contradicts [STATEMENT]; proven by
   [EVIDENCE]. Chains validate on fact identity AND suspect binding. A wrong
   submission gets ONE UNIFORM in-register deflection line (no closeness gradient,
   ever) and advances the case clock: the murderer counter-moves and remaining paths
   get harder. No attempt cap; brute force loses to the combinatorial space plus the
   worsening world. The case closes only on the exact chain.
6. **THE ENDING IS ALWAYS A SCENE.** Default: the accusation performed as a staged
   confrontation (the lieutenant walks the chain; the suspect's composure breaks).
   TRAP variant (superior ending, optional per case): requires the assembled chain
   PLUS staging an in-fiction demonstration that forces the confession. Never a
   menu-submit screen.

## Difficulty law (the point of the game)

- Brutal but FAIR: every required deduction step is evidenced in-world; no moon logic.
- NO pixel-hunting: every hotspot discoverable by systematic sweep; the M0 engine
  ships the sweep affordance (cursor state on hover + a scene "swept" sense); the
  hard part is what an observation MEANS, never finding it.
- No hints. No progress meters toward the solution. Uniform deflections.
- Red herrings are honest (true facts that do not bear on the lie) and TAGGED in the
  case data as red herrings (the orphan linter enforces every fact is chain-relevant
  or explicitly tagged).
- ALWAYS-SOLVABLE LAW: no unwinnable state exists. Every chain-required fact has at
  least two independent acquisition paths; suspect hardening and counter-moves route
  to HARDER substitutes, never to deletion of the last path. The case solver (below)
  proves this per case, per milestone.

## SOLVER LAW (the QA spine — non-negotiable)

From M1 onward the repo carries a headless CASE SOLVER run by `node --test`:
- Walks observe -> deduce -> accuse over the REAL case data (typed facts, below).
- Proves the winning chain REACHABLE, and — enumerating all valid chains — UNIQUE
  (exactly one; loud failure on more).
- Proves reachability under ADVERSARIAL challenge orderings (fuzz-walk every
  challenge order per suspect; the winning chain survives any order).
- Asserts a curated NEAR-MISS set (plausible wrong chains) all reject.
- Dialogue trees: full reachability walk from every real prior-state combo; no
  orphan nodes, no dead ends.
- Orphan linter: every document/fact ties to a chain or carries a red-herring tag.
- The whole battery is a PER-CASE gate, re-run for every case ever added, forever.
- Post-art hotspot re-verification: the sweep-discoverability check re-runs against
  final art bounds after every art pass.

## Facts are TYPED DATA (day one)

Facts/statements carry structured fields (subject, claim-type, value, time, place,
source, acquisition-paths, chain-role|red-herring tag) so contradiction is a real
predicate and the solver/board mechanically validate. Prose is presentation.

## Cases (original; structure-transposed)

- CASE 1 (compact, M3): a celebrated TV chef murders the business partner about to
  expose the restaurant's books; alibi = a pre-taped cooking segment (recorded-alibi
  device class). Original people, our city, our details.
- CASE 2 (mid, M6): CLOSED-SETTING themed case (operator direction): an isolated
  location with a confined suspect pool and the lieutenant off his turf — ocean-liner
  class, mountain resort, film set, or similar; builder picks and ratify-notes the
  premise before building it.
- CASE 3 (large; operator-directed AFTER M7): the lieutenant vs a MOB BOSS,
  transposed from the operator's detective-vs-mob-boss matrix game (the orchestrator
  supplies the matrix-game record as a DIRECTIONS file when located; no HBO names).

## Register laws (art, sound, prose) — THE EXHAUSTION FLOOR (Weiss, 2026-08-10)

Refuse competence porn. The 70s surface is tired, tape-hiss heavy, mechanically
repetitive — the wink only lands if the surface feels worn.
- **Prose**: strip hardboiled metaphor. Clipped procedural syntax — case notes,
  timestamps, dead ends. If a line sounds like a quote, cut it. The lieutenant is
  polite, meandering, deadly; suspects are articulate and condescending. No em
  dashes in player-facing text.
- **Score**: HOUSE BAND code-composed WebAudio; register stated here per the House
  Band law and it is NOT clean jazz pastiche: swung tempo with harmonic ambiguity,
  dropped 3rds, bass dragging behind the snare — the music shuffles, hesitates,
  resolves late. Worn tape surface over period instrumentation (upright bass,
  brushed kit, wah stabs, flute/vibes).
- **Look**: gorgeous and expressive; 1970s American color scripting (mustard,
  avocado, burnt orange, smog sunsets); smoky interiors; venetian-blind and
  table-lamp light rigs; the ratified VACUUM SEALED technique stack. Scenes are
  single pictures.

## Stack + architecture laws (decided)

- Single-page HTML/JS/canvas, zero dependencies; native-res software rasterizer for
  WORLD ART at a fixed logical resolution, integer/nearest upscale.
- **TEXT LAYER LAW (architectural, M0)**: all UI text — notebook, documents,
  dialogue — renders on a separate crisp layer above the world raster (period-styled
  but never baked into the low-res buffer), so text size/speed scale post-hoc and
  documents are READABLE. Document reader has zoom. Illegible evidence text is a
  blocked case, not a style.
- **INPUT LAW (architectural, M0)**: full keyboard path (hotspot cycling + select)
  beside the mouse; no real-time pressure anywhere — interrogations, the board, and
  reading are untimed, forever.
- No hue-only evidence distinctions (colorblind floor); audio cues get visual
  equivalents in an event log; no flashing above 3Hz in any period film effect.
- node --test suite; single-file boot-anywhere build rebuilt every milestone; LOUD
  failures (visible in-game error surface + exportable debug log).
- Save/load: auto-checkpoint at scene boundaries; no saving inside interrogations or
  the accusation board. Case restart is always offered. Named access points for
  save/review ship in M0/M1, not implied.

## Milestones (each ends battery-green + committed + pushed)

- M0 ENGINE: scene graph, hotspots + sweep affordance, walk/point/click + keyboard
  path, native-res rasterizer boot, text layer, checkpoint save/load, debug log,
  suite scaffold.
- M1 EVIDENCE SPINE: typed fact/statement/document model; notebook (log, pin, group,
  cross-ref, search/filter); document reader with zoom; case-review view; FIRST
  SOLVER (reachability + uniqueness on a toy case); orphan linter.
- M2 PEOPLE: dialogue engine with persistent visit state; interrogation challenges
  (statement x evidence); tolerance/hardening + relaxation timers + diegetic
  portrait tells; counter-move clock; afterthought-question mechanic; solver gains
  challenge-order fuzzing + dialogue reachability.
- M3 CASE 1 END-TO-END: prologue (tutorial + prologue-key), full investigation,
  board, staged confrontation + TRAP ending; full per-case battery green; soak
  (real-input Playwright walk of a win path AND a loss-ish path through the shipped
  single-file build) + acceptance battery.
- M4 ART + SOUND AT THE BAR: PoC scene first -> operator screenshot verdict -> full
  pass; House Band score per the register law; proof frames committed and looked at;
  post-art hotspot re-verification.
- M5 DIFFICULTY HARDENING: fairness audit (every step evidence-backed), red-herring
  pass, near-miss set expansion, no-progress-leak audit, counter-move tuning.
- M6 CASE 2 (closed-setting) complete, per-case battery green.
- M7 GENRE-COMPLETENESS + QoL GATE: point-and-click table stakes audit (verb
  feedback, text speed, options menu, pause, reduced motion, text size, dyslexia
  font alternate, photosensitivity toggle), single-file ship polish.

Stop at M7. Everything further (Case 3 included) is operator-directed.

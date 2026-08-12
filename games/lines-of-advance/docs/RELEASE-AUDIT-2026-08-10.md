# Release-readiness audit

Audited exact commit `ae51453` from an isolated archive under `tmp/`; the dirty working tree was not used as source.

## Findings

1. **BLOCKER — CONFIRMED: the shipped AI is not release-quality. It alternates between strategic passivity and blind attack ordering.**

   Exact shipped policy: 900 nodes, turn-aware search, unlimited actions per turn ([main.js:851](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/main.js:851>)).

   Corrected full-turn probes:

   | Game | Full turns | Shipped attacks | Destructive | Resisted | Result |
   |---|---:|---:|---:|---:|---|
   | shipped vs shipped | 42 | N 3 / S 5 | 2 | 6 | repetition draw |
   | shipped North vs advancing South | 22 | N 3 | 0 | 3 | repetition draw |
   | advancing North vs shipped South | 9 | S 2 | 0 | 2 | repetition draw |

   All 3 games drew; no arsenal was attempted and no side won. In self-play there were **zero attacks through 30 full turns**. The AI did advance—39.9% of fighter moves in self-play—but 21.2% of side-turns contained reversals, above the engine spec’s ≤15% final target ([ENGINE-PROGRAM-SPEC:331](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/docs/ENGINE-PROGRAM-SPEC-2026-08-09.md:331>)).

   Root cause is visible in search: when no iteration completes, the engine returns the first ordered action ([engine.js:666](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/engine.js:666>)); attacks rank ahead of every move regardless of combat result ([engine.js:535](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/engine.js:535>)). In self-play, **297/464 decisions (64%) were depth 0**. Once contact occurred, the engines repeatedly fired resisted attacks until repetition.

   Small tactical positions prove attack legality itself works: both colors immediately chose destroying attacks and declined resisted attacks when search completed. The defect is full-board search collapse, not total inability to attack. Evidence: [self-play](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/evidence/self-80.log>), [shipped North](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/evidence/spar-north-60.log>), [shipped South](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/evidence/spar-south-60.log>), [tactical probes](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/evidence/tactical.log>).

2. **HIGH — CONFIRMED: AI loops have no player-facing termination path.**

   Rules Ledger row 79 permits an agreed draw ([RULES-LEDGER:89](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/docs/RULES-LEDGER.md:89>)). The engine harness adds threefold/no-progress adjudication, but the shipped game does not. `findVictory` checks only elimination and two arsenals ([combat.js:309](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/combat.js:309>)).

   Absence check: searched all `src/`, shipped `dist/index.html`, and tests for draw, stalemate, resign, concede, or draw-offer paths. Only notation/harness draw support exists.

   Therefore all three measured games would continue indefinitely in the public UI instead of ending at their harness repetition draws.

3. **HIGH — CONFIRMED: the “80-turn control” used to justify shipping is invalid as evidence.**

   The harness loop labels `maxTurns` as full turns but increments its counter after every primitive action ([match.js:93](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/scripts/engine/match.js:93>), [match.js:214](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/scripts/engine/match.js:214>)). With five moves plus an attack/end-turn, an “80-turn” game can stop after a fraction of 80 actual turns.

   Worse, the cited 40 games per arm were deterministic duplicates: `discriminate-focused.js` uses the same engine on both sides and a 300-node—not shipped 900-node—control ([discriminate-focused.js:46](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/scripts/engine/discriminate-focused.js:46>)); the book repeats one unchanged `test` opening to reach the requested pair count ([book.js:44](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/scripts/engine/book.js:44>)). Its neutral prefix always selects End Turn, so it generates no position diversity.

   The logged “0 attacks” caveat was real for that trajectory, but neither the game count nor turn count supports a release-quality conclusion.

4. **HIGH — CONFIRMED release-process hazard: the current workspace artifact is not the audited HEAD artifact.**

   Exact HEAD rebuild is clean and byte-identical:

   - Size: 204,147 bytes
   - SHA-256: `2d1540cb91ee495ca68b8e6339b60a8b78c4a6d8b448f8bcee6b9b1515c034dc`
   - Rebuilt output: identical byte-for-byte to committed `dist/index.html`

   However, the current workspace `dist/index.html` is modified, SHA-256 `c1079e2b…`, with 37 added and 3 removed lines. `src/engine.js`, harnesses, and tests are also dirty. Releasing the file currently on disk would not release `ae51453`.

5. **MEDIUM — CONFIRMED: the default “full game” hides major setup departures.**

   Rules Ledger rows 34 and 82 require randomized first player and free, concealed deployment ([RULES-LEDGER:44](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/docs/RULES-LEDGER.md:44>), [RULES-LEDGER:92](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/docs/RULES-LEDGER.md:92>)). The program always starts North in a fixed convenience deployment explicitly described in code as non-canonical ([state.js:243](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/state.js:243>)).

   The player sees `Opening` and `Preset: test`; Help merely says “Opening starts a full game.” There is no deployment choice, first-player selection, or notice that the opening is a convenience preset. This conflicts with the design seed’s requirement that streamlining reduce handling rather than simplify rules.

6. **MEDIUM — CONFIRMED: several stranger-facing controls or explanations are misleading.**

   - `Sandbox free move` still routes moves through normal turn legality; it is not free movement ([input.js:138](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/input.js:138>)). The previous runtime certification found the same dead control.
   - After attacking, normal movement is correctly closed, but the Turn card still prints `5 - movedThisTurn.length`, potentially showing moves remaining ([main.js:486](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/main.js:486>)).
   - Help says depth counts atomic actions ([help.js:40](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/help.js:40>)); shipped turn-aware depth decreases only when the side changes ([engine.js:617](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/engine.js:617>)).
   - The automatic walkthrough teaches supply well but does not teach how to execute combat or explain the resist/retreat/destroy thresholds. Those details appear only after a player discovers the combat interaction.
   - Help cites `docs/RULES-LEDGER.md`, but that file is not included in the standalone artifact.

7. **MEDIUM — CONFIRMED fidelity/AI defect: an already-held arsenal can be “captured” again every turn.**

   Arsenal neutralization is represented only by continuing occupation. `legalActions` nevertheless emits another arsenal action each later turn ([engine.js:245](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/engine.js:245>)). Probe: capture `e2`, pass both sides, and `arsenal:e2` is legal again.

   This contradicts the distinction between entering/occupying an arsenal and merely continuing to hold it, and can make the AI repeatedly consume its attack on the same objective.

8. **LOW — CONFIRMED: Undo restores position but leaves a false move log.**

   `undo` intentionally copies the post-action log onto the restored state ([turn.js:347](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/src/turn.js:347>)). Probe: move `e20-d19`, Undo; the piece returns to `e20`, but the visible log still reports `e20-d19` without an “undone” marker. Loaded saves also intentionally start with no undo history.

## Artifact and endurance checks

- `npm test`: 140 tests, 139 pass, 1 skipped. The skipped test is the real `file://` same-file reload/click-attack browser test.
- M5 tactical self-play: 20/20 deeper-side wins, but it is a 21-node tiny conversion fixture, not evidence of full-game strength.
- Static single-file verifier and prose gate passed.
- Save round-trip preserved the exact rule position.
- Scratch endurance: 1,000 legal actions, 76 successful Undo checks, zero restoration failures, history capped at 100, maximum apply 0.845 ms, maximum Undo 0.318 ms. This strongly confirms the rc.1 exponential-history freeze is fixed. Evidence: [endurance log](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/evidence/endurance-undo.log>).
- History is bounded, but the move log still grows linearly: serialized state rose from 5,775 to 60,197 bytes over the 1,000-action probe.

Actual Chromium `file://` boot, console-error monitoring, file chooser, visual layout, and audio could not be checked: Chromium aborted at Mach-port registration with `Permission denied (1100)`. Evidence: [soak failure](</Users/rayweiss/Desktop/Dev Work/lines-of-advance/tmp/release-audit-ae51453/evidence/soak-30-north.log>). Static parsing is not a substitute for that runtime gate.

## Fidelity spot-pass

| Mechanic | Repo specification | Code verdict |
|---|---|---|
| Movement | Ledger rows 26–35 | Core movement and five-unit economy match; fixed setup/first-player departures are unsurfaced. |
| Combat | Rows 36–54 | Deterministic sums, terrain, charges, retreats, and click-attack path are test-covered and match. |
| Communications | Rows 55–72 | Arsenal rays, relays, adjacency, cuts, and isolated-unit effects match and are well surfaced. |
| Victory/draw | Rows 75–79 | Elimination and two-arsenal wins match; agreed draw and repetition handling are absent from the artifact. |
| Arsenal rules | Rows 56, 70, 76–78 | Fighter-only occupation and attack consumption match initially; repeated recapture is a defect. |

## IP/naming/attribution

Artifact-level no-copy checks pass under the repository’s stated policy:

- No Debord, Becker-Ho, Situationist, original-title, “inspired by,” or attribution strings in `dist/index.html`.
- No `<img>`, CSS URL, external font, fetch, asset path, or external script/style.
- No exact seven-word overlap between player-facing help/walkthrough text and the held source transcription.
- Product name and metadata use only `LINES OF ADVANCE`.
- Variant hooks are dormant.
- No historical imagery can be embedded through the artifact’s available image mechanisms.

Important policy contradiction: checklist item 5 explicitly requires attribution to be **absent** from the artifact and present only in `docs/ATTRIBUTION.md`; it does not require artifact credits. Thus the claimed 14/14 passes, but a stranger receiving only `dist/index.html` receives no attribution or credits at all. If artifact-level attribution is an operator requirement, the checklist currently encodes the opposite requirement.

## VERDICT — NOT-YET

The core opponent fails a public first-session standard: it spends most full-board decisions in depth-0 ordering, delays contact, then frequently loops on futile attacks. Every measured game was non-decisive, and the artifact has no way to terminate those repetitions. The control cited to waive this risk miscounts turns and duplicates a single deterministic trajectory.

Three highest-value pre-release actions:

1. Fix and rerun the AI gate using true full turns, varied legal openings/seeds, the exact 900-node shipped policy, both colors, and hard thresholds for completed depth, useful attacks, repetition, decisive results, and reversals.
2. Add player-visible draw/repetition handling and fix repeated arsenal capture; then remove the depth-0 “first ordered action” attack behavior.
3. From a clean checkout, rebuild and hash the artifact, then complete a real fresh-profile `file://` acceptance run covering both engine sides, attack, save/reload, Undo, 80+ true turns, console errors, and the misleading setup/Sandbox/turn indicators.

# Hammerstein prose pass

Date: 2026-08-08  
Milestone: M6 v1 release candidate  
Result: PASS for the current player surface

## Surface reviewed

- Header, buttons, labels, selectors, toggles, status messages, and metadata.
- Selected-unit, combat, supply, turn, engine, and move-log cards.
- First-launch walkthrough and the full Help dialog.
- Save/load errors and confirmations.
- Rule-core errors and audit reasons that can reach the interface.
- The rebuilt `dist/index.html` package.

## Gate

| Check | Result | Finding |
|---|---|---|
| Short and functional | PASS | Instructions state the next action or the current fact. The long settings hint was replaced by structured help. |
| Original prose | PASS | Help, walkthrough, audit, combat, and log text were compared with the held source transcription. No source sentence or distinctive phrasing is reproduced. |
| Narrow claims | PASS | Rules verification remains quantified at 92.7%. No completeness or authority claim appears. |
| Engine honesty | PASS | Help calls it a shallow game-specific alpha-beta engine. The UI shows actual depth, node count, elapsed time, score orientation, and principal line. No general strength claim appears. |
| No name-trading | PASS | Product surface and metadata use only LINES OF ADVANCE. Historical names remain in internal documentation only. |
| No theatrical register | PASS | No manifesto, curatorial voice, battle narration, or marketing copy appears. |
| No em dash | PASS | The em dash was removed from sandbox, turn, log, and walkthrough strings. The mechanical gate rejects it in source and dist. |
| Consistent terms | PASS | The surface consistently uses arsenal, relay, supply, isolated, attack, defense, retreat, North, and South. |
| Useful errors | PASS | Load and local-storage failures are reported in the Session section instead of a modal alert. |
| Help coverage | PASS | Objective, turn, movement, supply, combat, board marks, engine, sessions, saves, display, and controls are covered. Rule-bearing sections cite ledger row ranges. |

## Mechanical command

`npm run test:prose` scans source, package metadata, and `dist/index.html` for the em dash, historical branding, and the banned overclaim list. The final M6 run passed across 18 files.

The mechanical scan is a backstop. The result above also includes a sentence-by-sentence manual read and a comparison against `docs/source/debord-nicholson-smith-official-rules.md`.

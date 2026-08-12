# M3 Report — Legal Movement + Communications Audit

Date: 2026-08-07  
Branch: main  
Status: **M3 complete**; M4 (Combat, Victory, and Complete Hotseat) is now unblocked.

## What shipped

- `src/terrain.js` — original count-correct board terrain: 2 arsenals, 3 forts, 1 mountain pass, 9 mountains per side. Mountains block movement and lines of communication; forts/pass are passable and carry verified defense bonuses.
- `src/state.js` — verified unit roster and stats (Infantry, Cavalry, Foot Artillery, Mounted Artillery, Foot Relay, Mounted Relay). Arsenals are now terrain, not units. Added `comms-drill` and `comm-cut` presets plus settings fields (`sandbox`, `showAllComms`, `settings.sfx/music/reducedEffects`).
- `src/movement.js` — legal-move generator citing ledger rows 15–30, 55–66, 69, 72, 73. Enforces one-square and two-square (straight/diagonal/L-shaped) movement, mountain/occupancy blocking, and isolated-fighter immobility; relays may still move while isolated.
- `src/comms.js` — communications engine: direct arsenal rays, relay propagation, indirect fighting-unit adjacency, enemy-fighter line cuts, per-unit audit trail.
- `src/board.js` — terrain rendering, legal-destination dots, selected-unit supply-line visualization, global supply-line overlay, disabled-state marker.
- `src/main.js` — header rules pill ("rules: 92.7% verified"), panel toggles (sandbox, supply lines, SFX, music, reduced effects), selected-unit stats, and supply-audit card.
- `src/audio.js` — sound hook layer with optional WAV file loading and synthesized fallbacks; select/move/error/capture/reset sounds plus analysis-bed music loop; respects reduced-effects toggle.
- `docs/RULES-LEDGER.md` — rows 47, 48, 72, 73, 74 updated with "operator-ratified 2026-08-07" and Reading A.
- `dist/index.html` — single-file browser build rebuilt.
- Dated proof screenshots in `proofs/`.

## Test summary

```
npm test: 52 tests green
```

Breakdown:
- `test/coord.test.js` — 8 tests (board dimensions, coordinate math)
- `test/determinism.test.js` — 3 tests (seeded LCG)
- `test/state.test.js` — 15 tests (state, pieces, presets, serialize/parse)
- `test/movement.test.js` — 10 tests (movement rates, blocking, isolation, sandbox)
- `test/comms.test.js` — 8 tests (direct/relay/indirect supply, enemy cuts, relay non-block, offline enemy severs)
- `test/resolutions.test.js` — 3 tests (ledger ratification notes, rows 72/73 behavior)
- `test/audio.test.js` — 5 tests (hook exports, default toggles, reduced-motion safety)

## Operator-ratified ambiguity resolutions

All five M1 ambiguity recommendations were ratified to Reading A and recorded in `docs/RULES-LEDGER.md` as of 2026-08-07:

| Row | Topic | Ratified reading |
|---|------|------------------|
| 47 | Forced-retreat destination | Defender chooses any adjacent unoccupied square. |
| 48 | Units blocking fire | Only mountains block fire; units do not. |
| 72 | Offline enemy severs lines | Occupancy severs lines regardless of the enemy unit's supply status. |
| 73 | Offline unit forced retreat | Isolated units are immobile, so a forced retreat is impossible; the unit is destroyed. |
| 74 | Failed retreat consumes a move | No move is consumed; the unit is destroyed before the normal move phase. |

Rows 47, 48, 73, and 74 are not yet mechanically exercised (combat belongs to M4); their ratification is enforced in the ledger and row 73's mobility implication is already asserted by the movement tests.

## Proof captures

- `proofs/m3-1280x800-2026-08-07.png`
- `proofs/m3-1440x900-2026-08-07.png`
- `proofs/m3-2560x1440-2026-08-07.png`
- `proofs/m3-comm-cut-2026-08-07.png`
- `proofs/m3-audit-2026-08-07.png`

The comms-cut and audit proofs show North units marked **isolated** after a South infantry occupies the e18 line square, with the audit panel naming the source arsenal, the cutting square, and the enemy unit.

## Assumptions / reviewer notes

1. **Terrain coordinates are original.** The source set does not publish a square-by-square terrain map; the layout used here is original and preserves the verified counts and behavior from the ledger.
2. **Setup presets are teaching conveniences.** The rules state free deployment within each side's own territory; the presets are not claimed as canonical opening positions.
3. **Audio files are placeholders.** `assets/audio/` contains only manifests; the hook layer loads optional WAV files if present and otherwise uses short synthesized tones.
4. **No combat or victory detection yet.** M3 covers movement and communications only; combat, turn flow, and victory detection are M4 scope.
5. **"Faithful" does not appear on any player-facing surface.** The header shows the verified fraction (92.7%) instead, per `CLAUDE.md` rule 2.

## M3.1 — audit-fix round (2026-08-07)

The M3 gate audit (`docs/source/...` scratchpad) returned **NEEDS-A-ROUND** with seven findings. All items 1–7 are addressed before M4.

### What the audit caught

| Finding | Severity | Ledger / area |
|---:|---|---|
| 1 | Two-square movers could not move one square. | Row 26 |
| 2 | The `comms-drill` preset commentary described an illegal cut move. | Preset honesty |
| 3 | L-shaped move validator checked an incorrect diagonal-then-straight path. | Row 28 |
| 4 | Cut-line rendering was too thin and drawn under pieces/terrain. | Visual legibility |
| 5 | Disabled-unit marker was subtle at default scale. | Visual legibility |
| 6 | Sandbox mode had no persistent global indicator. | UI honesty |
| 7 | Tests did not cover one-square or L-shape path cases. | Test coverage |

### What changed

- `src/movement.js` — `getLegalMoves` now unions one-square destinations for any unit with `movement >= 2` (row 26). The L-shape `orderB` intermediate now correctly steps diagonal-then-straight (row 28).
- `test/movement.test.js` — added four tests: cavalry one-square move, mounted artillery one-square move, L-shape via the alternative path when straight-first is blocked, and L-shape blocked only when both orders are blocked.
- `src/state.js` / `src/main.js` — relabeled the preset button to "Comms Audit" and rewrote the commentary; the "Cut Demo" preset remains the canonical severed-line proof.
- `src/comms.js` — isolated units now propagate the nearest adjacent cut so indirectly disabled units can render the broken segment.
- `src/board.js` / `src/styles.css` — cut routes render in a front SVG layer above pieces and terrain, with a thicker dashed stroke and endpoint markers; isolated pieces get a larger offline marker and a diagonal strike.
- `src/main.js` / `src/styles.css` — restored a persistent header pill (`SANDBOX — RULES PENDING`) when sandbox is active.
- `scripts/screenshot_m31.py` — new capture script generating the complete M3.1 proof set.

### Test summary

```
npm test: 56 tests green
```

Breakdown:
- `test/coord.test.js` — 8 tests
- `test/determinism.test.js` — 3 tests
- `test/state.test.js` — 15 tests
- `test/movement.test.js` — 14 tests (+4)
- `test/comms.test.js` — 8 tests
- `test/resolutions.test.js` — 3 tests
- `test/audio.test.js` — 5 tests

### M3.1 proof captures

- `proofs/m3.1-1280x800-2026-08-07.png`
- `proofs/m3.1-1440x900-2026-08-07.png`
- `proofs/m3.1-2560x1440-2026-08-07.png`
- `proofs/m3.1-comm-cut-2026-08-07.png`
- `proofs/m3.1-audit-2026-08-07.png`
- `proofs/m3.1-acceptance-legal-2026-08-07.png`
- `proofs/m3.1-acceptance-cut-2026-08-07.png`
- `proofs/m3.1-acceptance-audit-2026-08-07.png`

## Next step

M4 — Combat, Victory, and Complete Hotseat — may now begin against the verified ledger.

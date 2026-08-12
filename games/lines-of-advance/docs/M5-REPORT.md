# M5 Report — Engine, Analysis Tools, and Piece-Style Variants

Date: 2026-08-08  
Branch: main  
Status: implementation complete; operator browser/visual certification remains external to this lane

## Delivered engine

`src/engine.js` wraps the existing rules core instead of restating it. `legalActions` asks
`movement.js`, `combat.js`, and `turn.js` for the actions they already consider legal, and
`applyAction` resolves those actions through the same turn functions used by the board UI.
The action set is:

- forced retreat destination, while a retreat is pending;
- ordinary move from `getLegalMoves`, subject to the shared turn guard;
- attack accepted by `canDeclareAttack`;
- arsenal occupation/capture accepted by the existing arsenal checks;
- end turn.

Search uses turn-relative negamax with alpha-beta. An action that retains the moving side keeps
the evaluation sign; an end-turn action changes side and negates the child score. Search depth is
therefore reported honestly as **atomic legal decisions**, not complete five-move turns. Iterative
deepening searches depths 1 through 3. Only exact transposition results are cached; beta-cutoff
bounds are not stored as exact scores.

Tie ordering hashes the seed, canonical position key, and action key. The position key excludes
render and UI settings. The time setting is converted to a fixed node quota at one node per
configured millisecond. This avoids wall-clock jitter changing the selected move. The elapsed
wall time remains measured and shown, but it does not decide between moves.

Constants:

- engine seed: `0x4c4f4135`;
- engine work budget: 900 ms → 900 nodes;
- hint work budget: 450 ms → 450 nodes;
- maximum iterative depth: 3 atomic actions.

The UI defers search until after the current render. Search is bounded and synchronous rather
than worker-hosted; input is locked only during the configured engine side's action. This keeps
the single-file `file://` build simple and deterministic. It is a shallow game-specific engine;
no stronger class of engine is claimed.

## Evaluation

Weights are provisional engine-tuning values, not printed rules values. The printed attack,
defense, movement, communication, and victory rules remain unchanged.

| Term | Weight |
|---|---:|
| Infantry material | 100 |
| Cavalry material | 105 |
| Foot artillery material | 135 |
| Mounted artillery material | 150 |
| Foot relay material | 72 |
| Mounted relay material | 86 |
| Isolated fighter material factor | 0.18 |
| Connected fighter | 18 |
| Connected relay | 64 |
| Distinct supplying arsenal/source | 34 |
| Relay link used by a supplied route | 10 |
| Active arsenal | 230 |
| Enemy proximity step near own arsenal | -18 |
| Legal destination | 2 |
| Approach step toward active enemy arsenal | 1.5 |
| Available destroying attack | 54 |
| Available retreat result | 22 |
| Available resisted attack | 4 |

Communication affects the score in three independent ways: isolated fighters retain only 18%
of material value; supplied fighters/relays receive connection value; and routes receive value
for distinct arsenal sources and working relay links. Arsenal count/safety and mobility add
separate signals. Attack pressure calls the real combat collector/resolver rather than duplicating
range or combat semantics.

### Communication-cut acceptance

Constructed position: North infantry on e17 and f17; the South infantry moves from d18 (line
intact) to e18 (line cut). Material is unchanged.

| Position | North-relative score |
|---|---:|
| Intact route | +248 |
| Cut at e18 | -64 |
| Change | **-312** |

The eval-bar normalization uses the real evaluator score, so this change moves the visible bar.

## Browser-budget measurement

Environment: Node 25.9.0 on the lane host; full 34-piece convenience opening; seed fixed; seven
sequential engine searches after the final legality/evaluator changes.

| Search | Completed depth | Nodes | Measured wall time |
|---|---:|---:|---:|
| Engine move, minimum | 1 | 900 | 780.28 ms |
| Engine move, median | 1 | 900 | 855.82 ms |
| Engine move, maximum | 1 | 900 | 1,228.98 ms |
| Hint | 1 | 450 | 408.63 ms |

All measured full-opening engine moves are below the stated two-second laptop target. The chosen
opening action was stable across all seven runs: `move:p-16:v18`, score +31. Smaller tactical
positions complete depth 2 inside their quota. On slower machines the deterministic quota may
take longer than its calibration; the UI reports actual time rather than presenting the setting
as a hard clock cutoff.

## Depth acceptance benchmark

`npm run test:selfplay` runs 20 seeded, mirrored communication-collapse conversion games, swapping
the deeper side between North and South. Result:

```
depth 2 wins: 20
depth 1 wins: 0
draws: 0
total nodes: 410
average nodes/game: 21
sample PV: attack f18
```

This deliberately narrow fixture tests whether a connected force converts an already-created
communication collapse through legal search. It satisfies the depth-result smoke gate, but it is
not evidence of general opening or match strength and is not presented that way in the UI.

## Session and analysis surface

- Session selector: Hotseat, Engine: North, Engine: South.
- Human board input is ignored while the selected engine side is acting.
- The eval bar is always visible and explicitly North-relative.
- Hint searches the current position without applying its action.
- The card displays completed depth, visited nodes, actual elapsed milliseconds, and principal
  variation.
- Seed and engine-side selection persist; saves retain the selected mode.

## Shared legality correction

Engine tracing exposed that M4's `canMovePiece` did not close the movement phase after an attack.
`turn.js` now rejects ordinary movement once `hasAttacked` is true, enforcing rules-ledger row 35
in the shared legality source. A regression test pins the correction. The engine contains no
separate copy of this rule.

## Render-only piece styles

The default piece renderer is unchanged. Two persisted alternatives are available:

- NATO counters: restrained rectangular counters with infantry cross, cavalry slash, artillery
  disc, relay signal, and mounted mobility marks; arsenals use a matching supply counter.
- Chess-like: compact silhouettes derived from pawn, knight, rook/artillery, and relay/royal
  forms; mounted classes carry a separate crest; arsenals use a rook-like installation mark.

The style value is absent from engine position keys and test-pinned not to change legal actions,
evaluation, or seeded choice. Communication routes remain in the layer below pieces; isolation
slashes and markers remain above every style.

Proof sheets:

- `docs/proofs/nato-counter-piece-sheet-2026-08-08.svg`
- `docs/proofs/chess-like-piece-sheet-2026-08-08.svg`

Each sheet shows all six unit classes, both sides, both arsenal marks, a supply route, and an
isolation overlay.

## Verification

```
npm test           100/100 green
npm run test:selfplay  depth 2: 20 wins; depth 1: 0 wins
npm run build      successful
git diff --check   clean
xmllint proof SVGs successful
```

The bundled inline module parses successfully. Automated browser launch is unavailable in this
managed lane: Chromium exits at the macOS Mach-port rendezvous with `Permission denied (1100)`,
and the installed Playwright has no Firefox browser bundle. No raster screenshot is claimed.
The dated SVG proof sheets are the repository visual artifacts awaiting operator inspection.

## Assumptions and boundaries

1. Engine depth counts atomic legal decisions. It is not labeled as a full-turn ply.
2. Evaluation weights are provisional and named; none are player rules.
3. The millisecond setting is a deterministic work calibration, not a wall-clock choice cutoff.
4. The tactical self-play set is intentionally narrow and is not a general strength estimate.
5. The existing local-save key remains `loa-m4` so prior saves remain recallable; new downloads
   use the `loa-m5-` filename prefix.
6. Checkpoint commits could not be written because this lane mounts `.git` read-only
   (`.git/index.lock: Operation not permitted`). No push was attempted.

# M4 Report — Combat, Victory, and Complete Hotseat

Date: 2026-08-07  
Branch: main  
Status: **M4 complete**; M5 (MVP Engine and Analysis Tools) is now unblocked.

## What shipped

- `src/combat.js` — deterministic summed combat citing ledger rows 36–54, 63–64, 67, 75–78.
  - Straight-line fire only (rows 38–39); only mountains block fire (row 48 ratified).
  - Attack summation from every attacker in range; defense summation from target plus every
    friendly fighter in range (rows 40–41).
  - Terrain modifiers: infantry +2 on a pass / +4 in a fort; artillery +2 / +4 (rows 10–11, 16, 22).
  - Isolated fighting units contribute zero attack or defense (row 63); supplied friendlies
    still contribute defense to the target square (row 64).
  - Cavalry charge: four aligned friendly cavalry with the lead adjacent to the target,
    no pass/fort target (row 50), no cavalry charging from a fort (row 53), rear cavalry
    reaching up to 4 squares via the lead (row 51); rearmost two supporting cavalry within
    defensive range when the lead is counter-attacked (row 52).
  - Resolution: margin ≤ 0 → resist; margin 1 → forced retreat, or destruction if no legal
    adjacent square (rows 42–45); margin ≥ 2 → destroyed (row 44).
  - Isolated targets cannot satisfy a forced retreat and are destroyed instead (row 73 ratified).
  - Surrounded-unit destruction: an isolated enemy fighter within range can be destroyed at will
    (row 67) — implemented through normal combat because isolated units have zero defense.
  - Victory detection: all enemy fighters eliminated, or both enemy arsenals captured by
    friendly fighters (rows 75–76).

- `src/turn.js` — turn state and action economy citing rows 31–35, 43–47, 74.
  - Up to five moves per turn, followed by one attack (row 31); no unit moved twice (row 33).
  - Forced retreats resolve as the first move of the owning side's next turn (row 43);
    retreated units are marked and cannot attack that turn (row 46).
  - A failed forced retreat destroys the unit and consumes no normal move (row 74 ratified).
  - Arsenal capture uses the turn's single attack (rows 76–77).
  - Undo, restart, move log, and per-action history snapshots.

- `src/state.js` — serialization bumped to version 3; save/load carries the full game state
  including turn, moves, attack flag, pending retreats, log, history, game-over result, and
  combat preview.

- `src/input.js`, `src/main.js`, `src/board.js` — complete hotseat UI.
  - Click/tap or drag to move; arrow keys to nudge; Escape clears selection.
  - Combat inspection surface: hover an enemy unit with a friendly selected to see every
    contributing attack/defense value and the deterministic result before committing.
  - Attack-target markers, retreat-destination dots, last-move dot, selection ring.
  - Turn panel with side, turn number, moves remaining, attack status, End Turn, Undo, Restart.
  - Save/Load to file and localStorage.

- `src/audio.js` — SFX hooks already existed for select/move/error/capture/reset; the capture-hit
  slot fires on combat resolutions and arsenal captures.

- `src/styles.css` — new UI classes for the turn pill, retreat dots, attack targets, combat
  preview highlights, and the move-log card.

## Test summary

```
npm test: 84 tests green
```

Breakdown:
- `test/coord.test.js` — 8 tests
- `test/determinism.test.js` — 3 tests
- `test/state.test.js` — 15 tests
- `test/movement.test.js` — 14 tests
- `test/comms.test.js` — 8 tests
- `test/resolutions.test.js` — 3 tests
- `test/audio.test.js` — 5 tests
- `test/combat.test.js` — 25 tests (+1 relay-target test)
- `test/turn.test.js` — 9 tests (+1 mid-combat save/load round-trip test)

New M4 tests cover every cited combat row, cavalry-charge edge cases, forced retreats,
arsenal capture, the five-move economy, unit-move uniqueness, and a full serialize/parse
round-trip with a pending retreat and history stack.

## Operator-ratified ambiguity enforcement

Rows 47, 48, 72, 73, and 74 were ratified to Reading A in `docs/RULES-LEDGER.md` on
2026-08-07. M4 mechanically exercises 47, 73, and 74:

| Row | Topic | Ratified reading | M4 implementation |
|---|------|------------------|-------------------|
| 47 | Forced-retreat destination | Defender chooses any adjacent unoccupied square. | Retreat UI offers all adjacent unoccupied non-mountain squares. |
| 48 | Units blocking fire | Only mountains block fire; units do not. | `hasClearFireLine` ignores units. |
| 73 | Offline unit forced retreat | Isolated units are immobile, so a forced retreat is impossible; the unit is destroyed. | `computeCombat` destroys isolated targets at margin 1. |
| 74 | Failed retreat consumes a move | No move is consumed; the unit is destroyed before the normal move phase. | `autoResolveRetreats` destroys the unit and does not add it to `movedThisTurn`. |

## Proof captures

- `proofs/m4-1280x800-2026-08-07.png`
- `proofs/m4-1440x900-2026-08-07.png`
- `proofs/m4-2560x1440-2026-08-07.png`
- `proofs/m4-combat-inspection-2026-08-07.png`

The combat-inspection proof shows a North Infantry at i5 and a North Foot Artillery at i6
previewing an attack on a South Foot Artillery at i3: Attack 9, Defense 8, Margin 1,
Result retreat, with every contributing unit listed.

## Assumptions / reviewer notes

1. **Relay targeting.** Row 37 says each turn's attack is directed at "one enemy unit within
   range." Communications units are enemy units with printed defense 1 (row 24), so they can
   be targeted; they contribute no defensive fire (row 70). This was corrected during M4.

2. **Retreat destination squares.** Row 47's ratified reading allows any adjacent unoccupied
   square. M4 permits retreat onto any empty non-mountain square, including an unoccupied
   arsenal square, because the rule's only stated condition is vacating the original square.

3. **Surrounded-force destruction.** Row 67 allows destroying one surrounded unit within range
   "at the end of the turn, with no resistance." Because isolated fighting units already have
   zero defense (row 63), the normal combat resolver produces this outcome automatically when
   an attacker is in range; no separate end-of-turn phase is required.

4. **Arsenal capture UI.** Occupying an enemy arsenal uses the turn's attack. The UI path is:
   move a friendly fighter onto the enemy arsenal, select it, then click it again to capture.

5. **"Faithful" wording.** Per `CLAUDE.md` rule 2, the word "faithful" does not appear on any
   player-facing surface; the header continues to show `rules: 92.7% verified`.

6. **Terrain coordinates remain original.** The exact board layout is an original drawing that
   preserves the verified counts and behavior from the ledger, consistent with M3.

## Next step

M5 — MVP Engine and Analysis Tools — may now begin against the verified rule core.

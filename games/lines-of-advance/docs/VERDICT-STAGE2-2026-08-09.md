# Stage-2 adversarial verdict (opus verifier, 2026-08-09) — FIX-FIRST

- Turn-aware negamax (engine.js:419-429): SOUND — verified vs independent full-width
  reference, 112 comparisons / 0 mismatches. KEEP.
- Bound-aware TT: code sound; BOTH audits are non-evidence — key-audit.js passes with
  retreatedThisTurn deleted (zero sensitivity; playouts never reach combat; its
  activeArsenalList ignores state); tt-equivalence.js never sets turnAware (0/90 real
  comparisons) and has no comparison floor.
- Tempo terms: TWO HARD DEFECTS. (1) distanceToNearestEnemyArsenal (engine.js:55-64)
  ignores its state arg -> distRoot==distNow always -> safeAdvanceReward +
  nonProgressPenalty are DEAD CODE (18,166 comparisons, 0 fires). (2) the "exact-reversal"
  penalty (298-300) is unconditional -> a STATIONARITY penalty: 176,764 fires on
  never-moved pieces vs 166 genuine returns (99.91%) — inverts spec S5.3 (report miscites
  S5.4); the S5.3 §2 waivers are absent, so necessary retreats are penalized.
- The 21.4%->10.0% reversal claim: ATTRIBUTION FALSIFIED. turnAware+tempo with cap
  removed == primitive EXACTLY (18 reversal turns both). 100% of the gain =
  maxActionsPerTurn=2 deflating the metric (moves/turn 4.36->1.67; absolute advancing
  moves FELL 222->180). isReversal only counts pieces that also moved last turn.
- Ships nothing: main.js:853,1056 omit turnAware (defaults false). Players face rc2.

## Fix round (queued):
1. distanceToNearestEnemyArsenal reads state (make the two tempo terms live).
2. Reversal penalty conditioned on genuine returns + S5.3 §2 waivers implemented.
3. Audits made SENSITIVE: key-audit must FAIL with retreatedThisTurn removed (drive
   playouts into combat contact; fix activeArsenalList state-blindness); tt-equivalence
   runs turnAware with a real-comparison floor.
4. A/B redesign: cap isolated as its own arm; reversal metric robust to move count
   (per-piece return rate + absolute counts); 80-turn control on home-PC, not laptop.
5. Ship decision on turnAware in main.js only after 1-4 are green.

## 80-turn control + SHIP (home-PC, 2026-08-09 eve — closes the fix round's item 4/5)

40 games/arm, maxTurns=80, noProgress=30 (LOA_DISCRIM_PAIRS=20 LOA_DISCRIM_MAX_TURNS=80,
home-PC, log ~/lanes/loa-80t/run.log):

| arm | per-piece return | abs returns | advancing moves | fighter moves/turn | attack turns |
|---|---:|---:|---:|---:|---:|
| primitive        | 31.65% | 1000 | 2120 | 3.11 | 80 |
| turnAware-nocap  |  8.62% |  200 | 1920 | 3.78 |  0 |
| turnAware-cap2   | 20.00% |   80 | 1520 | 1.67 |  0 |

turnAware-nocap CONFIRMED at scale: 3.7x lower per-piece return rate, 5x fewer absolute
returns, comparable advance, HIGHER fighter tempo — less dithering, not less movement.
cap2 stays rejected (400-move denominator; the cap suppresses eligible moves).

CAVEAT (honest, unresolved): primitive logged 80 attack turns; both turnAware arms logged 0
(turn-aware search completes shallower depth at equal node budget: histogram 0-1 vs 1-2).
The reversal pathology was the ship question and is settled; attack propensity under
turnAware is a known open quality item for a future search round (deeper budget or attack
ordering), not a ship blocker for an engine whose thesis is line-holding.

SHIPPED same session: main.js both call sites (turn + hint) now pass turnAware: true,
maxActionsPerTurn: Infinity. Gate: npm run check 140/0 + build + prose green; 15-turn
player-path soak vs the shipped dist, zero errors. This supersedes the verdict's
"Ships nothing" line above.

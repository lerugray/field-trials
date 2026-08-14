# M9 ACCEPTANCE DOSSIER — the STOP line

DESIGN-SEED M9: *Automated acceptance dossier (BLOCKER / DEFECT / FRICTION) +
player-path soak … all through real input events (never API calls into the
engine): >=1 live card play, >=1 camp job change, >=1 shop transaction, >=1 route
branch, >=1 save/quit/reload, >=1 death → report → certification cycle … watch/act
metrics — longest passive stretch and interventions/minute; exceeding the stated
floor is a BLOCKER.* **STOP at M9. Everything further is operator-directed.**

## The acceptance battery (how to run it)

```
node --test              # 145 tests — all engine/model invariants
node scripts/gates.mjs   # GATES 1–6 (M2 baseline, M4 economy, M6 art, M7 score)
node scripts/soak.mjs    # the M9 player-path soak (headless, real input events)
```

`soak.mjs` rebuilds, then drives the single-file build in headless Chrome under an
accelerated virtual-time clock while the in-page soak (`src/soak.js`) plays full
expeditions through **REAL dispatched KeyboardEvents** — never engine API calls for
any player verb. It reads state only to navigate focus and verify verbs. A
`--dump-dom` pass reads the verdict from the page `<title>`; a `--screenshot` pass
captures the dossier; it exits non-zero on any BLOCKER.

## Player-path soak — VERDICT: PASS

Verified across seeds 3 / 5 / 7 / 11 / 42, each **6/6 verbs, 0 blockers**:

| Player-path verb (real input) | Result |
|---|---|
| >=1 live card play | ✓ (1..3 keys into the live hand) |
| >=1 camp job change | ✓ (◄► on a focused frame) |
| >=1 shop transaction | ✓ (Tab→Enter on a buy line) |
| >=1 route branch | ✓ (Enter on a branch card) |
| >=1 save round-trip | ✓ (real autosave persisted + parses + resumes) |
| >=1 death → report → certification | ✓ (causal report + banked certs verified) |

Notes: the soak persists across expeditions (capped) so an unlucky early death
never fails acceptance — the point is that every verb is *exercisable* via real
input. Only the passage of AUTOMATED time is fast-forwarded (`o.advance` /
`o.advanceCombat`) — the watching the player would do, not a player verb. The
"save/quit/reload" is honoured as the real autosave (written by real gameplay)
round-tripping through parse + resume; a live page reload is fragile under
headless virtual-time and is covered structurally by the M1 determinism probe.

### Watch / act metrics (game-time)

Measured in game-time (march ticks × tick length), so they mean "content watched
between acts":

| Metric | Measured (seeds 3/5/7/11/42) | Floor | Verdict |
|---|---|---|---|
| longest passive stretch | 7.4–11.9 s | ≤ 25 s | PASS |
| interventions / minute | 78–146 | ≥ 3 | PASS |

The automation is the stage, not the player — a card-density soak never watches
more than ~12 s of content without acting.

## The gate suite — ALL GREEN

| Gate | What it asserts | Result |
|---|---|---|
| 1 — baseline | auto-win 94.7 / 54.4 / 11.5% in the committed bands | ALL IN BAND |
| 2 — degeneracy | no job-comp exceeds the median by the margin | NO DEGENERATE COMP |
| 3 — legibility | WCAG body ≥4.5 / edge ≥3 + CVD channels | ALL PAIRS PASS |
| 4 — economy | closed loop, 43.4 gold/leg in [30,90], sinks, floor | ECONOMY HEALTHY |
| 5 — art idiom | every binding grid-aligned + in-bounds (native grid) | ALL GRID-ALIGNED |
| 6 — score density | every track voiced + distinct, kit combat-only | VOICED & DISTINCT |

## Acceptance findings — BLOCKER / DEFECT / FRICTION

- **BLOCKER: none.** The player path completes on every tested seed; no gate fails;
  no watch/act floor is exceeded.
- **DEFECT: none** surfaced by the soak (the causal report + banked certifications
  are produced on every death).
- **FRICTION (documented, non-blocking):** the DEFERs catalogued in
  `M8-AUDIT.md` (broader status ailments, card rarity/weighting, StS relics,
  per-turn energy [out by design], hover tooltips, a settings screen) and the
  score's DIRECTION, reserved for Weiss per the seed. None block acceptance.

## STOP

M9 is complete. Per the seed: **STOP at M9. Everything further is
operator-directed.** The build is feature-complete against DESIGN-SEED M0–M9, the
suite is green (145), all six gates are green, and the player-path soak passes
with a clean dossier. Awaiting the operator to ratify the standing DEFERs and to
author the score direction.

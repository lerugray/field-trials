# ALKAHEST — skeptical pre-release audit (2026-08-11, opus examiner)

Verdict: **FIX-FIRST**. Suite 198 pass / 2 skip; perf gate 3/3; build reproducible; repo left
clean. Evidence (probe scripts, browser JSON logs, frames): orchestrator scratchpad
`audit-alkahest/` — the fix round re-runs those probes as its acceptance.

## Findings, most severe first

1. **CONFIRMED — finishing the tutorial NORMALLY crashes rendering for the rest of the
   session.** `src/well.js:388` reads `tut.step().id`, but `Tutorial._advance()`
   (src/tutorial.js) sets `i = STEPS.length` on natural completion, so `step()` returns
   `undefined`. Every subsequent frame throws; the loud-failure handler wipes to dark red
   and pins a "139 ERRORS - PRESS L TO EXPORT LOG" banner over the top ~20% of the screen
   for the remainder of the session — through every bout, draft, workshop, and run-end.
   The "THE WORK BEGINS / PRESS ENTER" prompt sits AFTER the throw in the same function
   and never draws; the player lands on an error screen with no instruction (Enter works,
   blind). Why the suite is green: the ESC-skip path leaves `i` unchanged and doesn't
   crash, and test/tutorial.test.js completes the tutorial headlessly without rendering.
2. **CONFIRMED — Lesson 4 (RAISE) completes itself with zero input in ~17s.**
   `Machine.effectiveRise()` = `risePerSec + riseAccel * time`; the tutorial zeroes only
   `risePerSec`, so "auto-rise off" boards still rise and `rowsRisen >= 2` self-satisfies.
   The lesson teaching the RAISE key passes without pressing it.
3. **CONFIRMED — Lessons 1/2/3 top out silently and stall the tutorial permanently.**
   Same root cause. SWAP/COMBO die at 44.8s, CHAIN 43.2s, RESCUE 18.1s; `warnRow: 99`
   suppresses danger indicators, `drawTutorial` uses `drawWellPanel` so no ruined overlay;
   instruction card keeps reading over a dead board, cursor vanishes, errorCount stays 0;
   only ESC escapes. The banned "nothing happens" state (hard rule 6).
4. **Minor — master-bout rival telegraph draws outside its banner** (`drawRunBanner`
   formula line y=11 in a 14px strip; crosses the brass rule on all four master bouts).
5. **Minor — no player-facing photosensitivity control.** setFlashIntensity + two-bloom
   cap verified correct internally, but no key binding/settings surface exists (M6 scope
   per RELEASE-READINESS) — name it on the Field Trials card until M6.
6. **Minor — `L` silently downloads a log file** (undocumented Blob download).

## What held up under attack

- **Loss is real:** null input loses every time (40/40 bouts, 6/6 runs); held raise loses
  in ~3s; nothing progresses at title under 45s idle.
- **Not brute-forceable:** random mash 4-20Hz → 0 run completions in 40 runs (median 1/12
  bouts); superhuman 60Hz → 0 in 16; swap-spam at fixed cursor → 0 wins in 40 bouts.
- **Progression genuine:** real-key greedy driver won bouts 0-3, crossed NIGREDO→ALBEDO
  via draft + workshop, lost at bout 4, ran run-end, restarted clean; top rival (0.98)
  beatable.
- **Abuse-robust:** 100x pause spam, empty-folio casts, six keys held 8s — no corruption.
- **Audio correct:** no AudioContext before a gesture. **0 non-file requests** everywhere.

## Release path

Fix 1-3 (2+3 share the effectiveRise root cause; add a fail/retry state for a dead lesson
board), fix 4 while in there, disclose 5 on the Field Trials card, document 6 or bind it
intentionally. Re-run the natural-completion path with eyes on it, then release per the
standard Field Trials mechanics.

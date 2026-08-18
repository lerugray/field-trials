# Lane brief — humanize backport FIX ROUND (2026-08-15; round 1 = MERGE-WITH-FIXES)

Round 1's Performance-Pass wiring is sound, but adversarial review measured an UNDECLARED
scope breach: syncing the vendored kit to house-band HEAD replaced popinjay-local tuning
with NEUTRAL_DEFAULTS. Fix on top of the existing work (it is committed on main here).

## Confirmed findings to fix (all reviewer-measured; verify each first)
1. **~7x reverb/decay tail collapse.** Old main:src/engine/band.js:104-108 carried
   popinjay-local FADE_OUT=1.1 and friends; the synced kit + src/app.js:93 (no overrides)
   now resolve to neutral defaults. Restore the popinjay-local values as EXPLICIT
   Performance-Pass overrides passed at the call site — the kit stays HEAD-synced, the
   game's sound stays its own. Declare every override in the report.
2. **Bell timbre changed:** ratios [1,2.01,3.03,4.78] (inharmonic bell) degraded to
   [1,2,3,4]. Restore via the same override path.
3. **Strum guarantee weakened** (deterministic hand-drag + 2-5ms ascending spread became
   something weaker while its test still reads as if it holds). Restore the guarantee or
   rewrite the test to state the true new behavior — no test may overclaim.
4. **Listen set is blind:** it renders both "before/after" postures with the NEW engine.
   Rebuild it so BEFORE = rendered from the pre-round-1 commit's engine (git worktree or
   checkout of the parent commit into a temp dir works), AFTER = current. The operator's
   ear gate must be able to hear the actual difference.
5. Add real tests: at least the override values landing (assert non-neutral resolved
   config), and the strum spread property.
6. Correct LANE-REPORT.md's false claim that no popinjay-local kit extensions existed.

Suite: baseline FIRST, delta-fail=0 plus new tests. Authored melodies/arrangements remain
untouched. NO pushes. Checkpoint commits or dirty tree.

# Oddseedz FIX-ROUND-20260808 report

**Fix lane:** re-verify the 2026-08-08 adversarial audit at M12 HEAD (`17839da`), then fix whatever reproduces.  
**Baseline:** `node --test` 245/245 green; `dist/index.html` rebuilt (288.6 kB, 22 modules).  
**Commit:** `ac6094d` (checkpoint, not pushed).

---

## Re-verification summary

All six findings reproduced against current HEAD. M12's recentering and early-retirement work did not resolve any of them by itself.

| # | Severity | Finding | M12 re-verdict | Fixed? |
|---|----------|---------|----------------|--------|
| 1 | HIGH | Mobile stage collapses, pet invisible | **STILL-PRESENT** — stage rect.height ≈ 6 px at 375×667 | Yes |
| 2 | HIGH | Retire / Meadow / inherit coach hints do not render | **CHANGED-SHAPE** — at twilight the *fight* hint rendered instead of the *retire* hint; inherit hint was never visible because the ordering suppressed it before Meadow | Yes |
| 3 | MEDIUM | Mobile battle forfeit button below viewport | **STILL-PRESENT** — foot bottom ≈ 694 px, viewport 667 px | Yes |
| 4 | MEDIUM | Restore-confirm description occluded by settings foot | **STILL-PRESENT** — message was under the red button and behind the foot | Yes |
| 5 | LOW | Career log uses default scrollbar | **STILL-PRESENT** — `.career-log` not in the scrollbar styling block | Yes |
| 6 | LOW | Coach emoji glyph dropped by bitmap font | **STILL-PRESENT** — `.coach-glyph` rendered as empty spacer | Yes |

---

## Per-finding details

### 1. HIGH — Mobile creature stage collapses
- **Repro:** Boot `dist/index.html` at 375×667, dismiss title, summon a phrase. `#stage` bounding rect was 6 px tall; creature not visible.
- **Fix:** In `index.html` mobile media query (`max-width: 900px`) changed the grid to a scrollable vertical stack with a real stage row: `grid-template-rows: auto auto minmax(180px, auto) auto auto; height: auto; min-height: 100vh; overflow-y: auto;` and `#stage { min-height: 180px; }`.
- **After:** Stage rect.height = 210 px; creature clearly visible.
- **Screenshots:**
  - Before: `docs/proofs/fix-round-20260808/20260808-before-mobile-summon.png`
  - After: `docs/proofs/fix-round-20260808/20260808-after-mobile-summon.png`

### 2. HIGH — Retire / Meadow / inherit coach hints
- **Repro:** Fast-forward to week 30; coach ribbon showed the `fight` hint instead of `retire`. In the Meadow, no `inherit` hint appeared.
- **Root cause:** `currentCoachStep()` checked `!fought` before `isRetirementDue(c)`, so the fight hint preempted the retire hint at twilight. Inheritance was also unreachable because the fight/raise hints always won.
- **Fix:** In `src/ui/app.js`, reordered `currentCoachStep()` so `isRetirementDue(c)` is evaluated first, then `age <= 1`, then `!fought`. Also switched all coach glyphs from emoji to the bitmap-supported `*`.
- **After:** Mobile twilight screenshot shows the retire hint; Meadow screenshot shows the inherit hint.
- **Screenshots:**
  - Before twilight: `docs/proofs/fix-round-20260808/20260808-before-mobile-twilight.png`
  - After twilight: `docs/proofs/fix-round-20260808/20260808-after-mobile-twilight.png`
  - Meadow inherit: `docs/proofs/fix-round-20260808/20260808-after-desktop-meadow-inherit.png`
  - After hatch: `docs/proofs/fix-round-20260808/20260808-after-desktop-inherit-hatched.png`

### 3. MEDIUM — Mobile battle forfeit clipping
- **Repro:** Open a bout at 375×667 after several moves; battle foot bottom ≈ 694 px, above the 667 px viewport.
- **Fix:** Added `max-width: 520px` media query in `index.html`: `.battle-panel { max-height: 96vh; overflow-y: auto; }`, `.battle-arena { height: 150px; }`, `.battle-log { max-height: 140px; min-height: 70px; }`.
- **After:** Foot bottom ≈ 650 px, fully in viewport; leave button reachable.
- **Screenshots:**
  - Before: `docs/proofs/fix-round-20260808/20260808-before-mobile-battle.png`
  - After: `docs/proofs/fix-round-20260808/20260808-after-mobile-battle.png`

### 4. MEDIUM — Restore-confirm description occluded
- **Repro:** Settings → paste save code → click Restore from code once. The overwrite description sat below the red Confirm button and was clipped by the settings foot.
- **Fix:** In `src/ui/app.js`, moved the `<span data-iomsg>` above the Restore button inside the Save data section so the warning is read before confirming.
- **After:** Full overwrite warning is visible above the button and clear of the foot.
- **Screenshots:**
  - Before: `docs/proofs/fix-round-20260808/20260808-before-desktop-restore-confirm.png`
  - After: `docs/proofs/fix-round-20260808/20260808-after-desktop-restore-confirm.png`

### 5. LOW — Career log default scrollbar
- **Repro:** Career log existed but was omitted from the register scrollbar styling block; computed `scrollbar-width` was `auto`.
- **Fix:** Added `.career-log` to the `scrollbar-width` / `::-webkit-scrollbar` blocks in `index.html` (~line 180).
- **After:** Computed `scrollbar-width: thin`.
- **Screenshots:**
  - Before: `docs/proofs/fix-round-20260808/20260808-before-desktop-career-log.png`
  - After: `docs/proofs/fix-round-20260808/20260808-after-desktop-career-log.png`

### 6. LOW — Coach glyph dropped
- **Repro:** Coach ribbon showed no leading glyph; `.coach-glyph` contained only an empty bitmap spacer.
- **Fix:** Replaced all coach `glyph` emoji with bitmap-supported `*` in `src/ui/app.js`.
- **After:** Coach ribbon renders a visible `*` glyph.
- **Screenshots:**
  - Before: `docs/proofs/fix-round-20260808/20260808-before-desktop-coach-glyph.png`
  - After: `docs/proofs/fix-round-20260808/20260808-after-desktop-coach-glyph.png`

---

## Verification

- `node --test`: **245/245 green** (M12 baseline maintained).
- `node scripts/build-singlefile.mjs`: built `dist/index.html` (288.6 kB, 22 modules), zero console errors during proof capture.
- Re-verification harness: `scripts/verify-audit-fixes.mjs` boots `dist/index.html`, exercises each repro, and writes before/after PNGs.

## Deliverables

- Code changes: `index.html`, `src/ui/app.js`, `dist/index.html`.
- Proof gallery: `docs/proofs/fix-round-20260808/`.
- This report: `docs/audits/FIX-ROUND-20260808-report.md`.
- Checkpoint commit: `ac6094d` (local only, not pushed).

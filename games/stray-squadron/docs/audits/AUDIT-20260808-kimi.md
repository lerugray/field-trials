# Stray Squadron — M15 finishedness audit

**Auditor:** Kimi Code CLI (adversarial, read-only)  
**Date:** 2026-08-08  
**Artifact audited:** `dist/stray-squadron.html` at commit `1765584`  
**Test suite:** `node --test` → 438/438 green  

---

## VERDICT

**NEEDS-A-ROUND**

The mouse-aim default change is functionally correct, migration works, keyboard fallback works, and the built game plays through title → briefing → flight → death → retry. The blocker is project hygiene: M15 shipped without a `PROGRESS.md` close-out section and ratify notes, which violates the builder's own hard rule 11. There are also stale comments in the source that still describe mouse aim as "off by default" / "opt-in", which will confuse the next person who touches the setting. Fix those two things and the milestone is certifiable.

---

## Method

- Read `PROGRESS.md`, `CLAUDE.md`, `package.json`, `scripts/build.js`, `scripts/proofs.sh`, and the M15 commit diff.
- Ran `node --test` to confirm the 438/438 claim.
- Drove the built single-file artifact headless with Playwright/Chromium (SwiftShader) at 1280×800, capturing screenshots at each major state.
- Verified settings behavior by seeding `localStorage` payloads and reading the options-menu DOM.
- Verified aim feel by reading the dev-overlay `frame off` readout while moving the pointer and while holding keys.
- Let a full session run to a death and observed the retry transition.

Screenshots are retained at `/tmp/stray-audit-shots/` and referenced below by filename.

---

## Findings

### 1. M15 is not closed out in `PROGRESS.md` (High)

**Defect:** The project requires every run to append a milestone section and a "For the operator to ratify" list to `PROGRESS.md` (`CLAUDE.md` hard rule 11). The M15 commit (`1765584`) changed `src/core/settings.js`, `test/settings.test.js`, and rebuilt `dist/stray-squadron.html`, but it did **not** update `PROGRESS.md`. The file still ends at the M14e section. The milestone claim is therefore not fully documented.

**Evidence:**
- `git log --oneline -1` shows `1765584 M15: mouse aim ON by default ... 438/438; rebuilt dist ...`
- `PROGRESS.md` has no `## M15` section; final heading is `## M14e — the kill flash was still a screen event ...` around line 1625.

**Repro:** Open `PROGRESS.md` and search for `## M15`; it is absent. Compare with the M14d/M14e sections that precede it.

**Fix direction:** Append a `## M15 — Mouse aim ON by default — COMPLETE (2026-08-07)` section summarizing the version-stamped settings payload, the migration rule, the 438/438 suite count, the rebuilt dist size, and a ratify list (e.g., "default ON is the intended rail-shooter feel; confirm keyboard players are not surprised").

---

### 2. Source comments still say mouse aim is "off by default" / "opt-in" (Medium)

**Defect:** Two comments/docstrings describe mouse aim as opt-in or off by default, but `DEFAULT_SETTINGS.mouseAim` has been `true` since M15. This is display-vs-truth drift in the documentation; it misrepresents the shipped default and undermines the audit trail.

**Evidence:**
- `src/ui/menu.js:34` — `// M11 mouse support — additive pointer aim, off by default ...`
- `src/audit/genre.js:165-168` — `// Operator-directed M11: additive pointer aim/steer, off by default ...` and label `'Mouse pointer aim/steer (additive, opt-in) + sensitivity option'`.
- `src/core/settings.js:21` — `mouseAim: true, // ... DEFAULT ON since M15 ...`

**Repro:** Grep the source for `off by default` and `opt-in`; the hits above contradict the actual default.

**Fix direction:** Update the comments to say "ON by default since M15; keyboard/pad remain fully capable fallbacks" and change the genre.js label to "Mouse pointer aim/steer (additive, default ON) + sensitivity option".

---

### 3. Accessibility flash caps are code/test-guaranteed, but the artifact-level luminance probe is not reproducible from the repo (Low / observation)

**Defect:** The repo documents that kill-flash and hurt-wash caps were verified by a headless per-frame luminance probe on the built page (M14e). No such probe script is present in the repository, so the M15 audit could not re-run the same measurement. The caps are still enforced by source and tests, but the artifact-level proof is not reproducible for a future auditor.

**Evidence:**
- `src/ui/legibility.js:17-18` states `FLASH_CAP = 0.34` and `HURT_FLASH_MAX = 0.30`.
- `src/combat/explosions.js:14` sets `EXPLOSION.flashCap = 0.34`.
- `src/ui/hud.js:45-50` defines `KILL_BLOOM_FRAC = 0.14` and sizes the bloom locally.
- `test/legibility.test.js` enforces all of the above.
- No script in `scripts/` measures per-frame mean luminance on the built page.

**Repro:** Search `scripts/` and `test/` for luminance / screenshot pixel measurement code; only `scripts/proofs.sh` (static screenshots) exists.

**Fix direction:** Either commit the M14e luminance probe as a reusable script under `scripts/`, or add a concise note in `PROGRESS.md` pointing to the exact command/run used so the claim can be re-audited.

---

## Verified claims (no findings)

The following M15 claims were exercised in the built artifact and hold:

- **Fresh profile → mouse aim ON.** Opening the options menu from a fresh localStorage profile shows `Mouse aim On` (`/tmp/stray-audit-shots/29-options-highlighted.png`).
- **Pre-M15 `mouseAim:false` migrates to ON.** Seeding `localStorage` with `{ mouseAim: false, muted: true }` (no version stamp) loaded as `Mouse aim On`.
- **Post-M15 `mouseAim:false` is preserved.** Seeding `{ mouseAim: false, v: 15 }` loaded as `Mouse aim Off`.
- **Toggle persists with version stamp.** Turning mouse aim off via the menu wrote `{"mouseAim":false,"v":15,...}` to `localStorage`; a reload kept it off.
- **Keyboard fallback works with mouse aim ON.** Holding `ArrowRight` drove `frame off x` to ~3.39; releasing held the position at ~3.39; a left tap snapped to ~-2.28 (`/tmp/stray-audit-shots/06-kb-hold.png`).
- **Mouse aim feel is sane.** Centered pointer → `x 0.00 y 0.00`; right edge → `x 2.94`; top-left → `x -2.92 y 1.66`; holding the pointer still produced stable readings with no drift.
- **Sensitivity slider is wired and log-scaled.** Default `1.00×` sits at ~40 % of the bar; ten right-nudges raised it to `4.66×` and the bar filled accordingly (`/tmp/stray-audit-shots/30-options-sens-high.png`).
- **Full session flows.** Title → how-to-fly card → briefing → flight → death after ~32 s → results → retry → new briefing (`/tmp/stray-audit-shots/20-title.png` through `28-after-h.png`).

---

## Notes

- One headless run using `?debug=1&menu=1` triggered the WebGL context-lost card; the game recovered, and the same sequence without `menu=1` did not reproduce it. Treated as SwiftShader headless flak, not a game defect.
- The `node --test` suite passed cleanly; no functional regressions were found in the migration or input logic.

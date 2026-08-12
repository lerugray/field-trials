# Oddseedz M11 COMPLETE — adversarial audit report

> **STALENESS CAVEAT (added at harvest, 2026-08-08):** this audit exercised the build at
> `ed80fab` (M11). While it ran, an M12 round landed on origin (`b072563`: creature-stage
> recentering + bounds probe, stronger inheritance + hatch deltas, early retirement). Findings
> touching the stage/creature-render area (esp. Finding 1) and retirement flow (Finding 2) must
> be RE-VERIFIED against M12 HEAD before fixing — M12 may have moved the ground under them.


**Auditor:** Kimi Code CLI (interactive, read-only)  
**Date:** 2026-08-08  
**Artifact audited:** `dist/index.html` at commit `ed80fab`  
**Method:** booted the built single-file game in headless Chromium, exercised the full lineage loop, captured state-by-state screenshots, and probed the 16 claimed certification items against actual on-screen behavior. `node --test` was 239/239 green and the build smoke passed; this audit treats green suites as necessary, not sufficient.

## VERDICT

**NEEDS-A-ROUND.**

The desktop build is largely coherent and the 16-item checklist is mostly implemented at the code level, but the built artifact has two high-severity player-facing misses: the mobile layout collapses the creature stage (the pet is invisible on a 375×667 phone), and the extended retire/Meadow/inherit coaching hints claimed by item 12 do not render. A medium mobile battle-layout clipping issue and a clipped restore-confirmation description also need fixing before a public landing page.

---

## Certification-item table

| Item | Claim | Status | Evidence |
|------|-------|--------|----------|
| 1 | Mobile SUMMON stays on-screen | **VERIFIED** | `/tmp/oddseedz-audit/m02-mobile-summoned.png`; SUMMON right edge = 352 px ≤ 375 px. |
| 2 | Obey badge in reserved strip, no Stamina overlay | **VERIFIED** | `/tmp/oddseedz-audit/12-battle-after-move.png`; Stamina reads `32/36` and REFUSED badge sits in `.obey-row`. |
| 3 | Coach ribbon has explicit grid row | **VERIFIED** | `/tmp/oddseedz-audit/06-coach-ribbon.png`; `index.html:99` gives `#coach` `grid-area: coach` in both desktop and mobile grids. |
| 4 | Save-import hardening repairs insane data | **VERIFIED** | Malicious token test: age 999999 clamped to 9999, stats clamped to [5,99], negative money floored to 0, control chars stripped, Meadow normalized (`scripts/_audit_hardening.mjs` output). |
| 5 | Restore is two-step with preview | **VERIFIED** | `/tmp/oddseedz-audit/08-restore-confirm.png`; first click arms red “Confirm overwrite” with a description. |
| 6 | Unbounded text capped | **VERIFIED** | `#phrase maxlength=200` (`index.html:596`), `truncate()` at 48 (`app.js:1521`), `MAX_WORD_CHARS=64` (`bmptext.js:197`). |
| 7 | Reduced-motion global | **VERIFIED** | Settings → Reduced sets `window.__oddseedzReduceMotion=true`; title/meadow/codex loops draw through `ambientTime()`. |
| 8 | Battle seeding + settle + real forfeit | **VERIFIED** | Forfeit moved record from `0L` to `1L`; `battleSeed()` derives from creature seed/age/rank/record (`app.js:649`). |
| 9 | Title splash creature art | **VERIFIED** | `/tmp/oddseedz-audit/01-title.png`; title canvas has non-transparent pixels. |
| 10 | “(empty)” leak fixed for heirs | **VERIFIED** | Heir card shows `a foundling of the seed` (`/tmp/oddseedz-audit/18-certificate-toast.png`; script log). |
| 11 | Blank summon toasts a nudge | **VERIFIED** | `/tmp/oddseedz-audit/03-blank-summon-toast.png`: “Type a word or phrase first, then Summon.” |
| 12 | Coaching to retire/Meadow/inherit + planner warning + reorder | **CONTRADICTED** | Planner reorder controls and meet-warning UI exist (`/tmp/oddseedz-audit/09-planner-reorder.png`), but the retire/inherit coach hints do not appear (see Finding 2). |
| 13 | Overlay lifecycle (resize listener, Escape, duplicate guards) | **VERIFIED** | Escape closes codex; `closeMeadow()` removes resize listener; `openBattle/openMeadow/openCodex` guard duplicates (`app.js:663,943,1043`). |
| 14 | Styled scrollbar + scroll re-anchor | **VERIFIED** | `index.html:180` styles `aside`/settings/codex/battle-log/meadow scrollbars; `renderCard()` preserves `scrollTop` for the same pet (`app.js:340-404`). |
| 15 | Twilight off-by-one aligned | **VERIFIED** | At age 30 the planner reads “Twilight” and the Retire button appears (`/tmp/oddseedz-audit/14-twilight.png`). |
| 16 | Copy honesty (“ranked bout”) | **VERIFIED** | Battle header “E-RANK BOUT”, card button “Enter E-rank bout” (`/tmp/oddseedz-audit/11-battle-open.png`). |

---

## Findings (ranked by severity)

### 1. HIGH — Mobile creature stage collapses; the pet is invisible on phones
- **Defect:** On a 375×667 viewport the `#stage` grid row has zero allocated height after the header, coach, card, and plan rows consume the viewport. The stage’s bounding rect is only ~6 px tall, so the summoned Buddy is not visible.
- **Evidence:** `/tmp/oddseedz-audit/m02-mobile-summoned.png`, `/tmp/oddseedz-audit/m03-mobile-card-scrolled.png`; metrics output: `stageHeight: 0`, `stageRect.height: 6`.
- **Repro:** Launch `dist/index.html` at 375×667, dismiss the title, summon any phrase. The stage canvas is effectively gone; only header, coach, card, and plan are visible.
- **Fix direction:** In the `max-width: 900px` grid, give `#stage` a `min-height` (e.g. `minmax(140px, 1fr)`) or switch the mobile layout to a vertical scrollable stack so the stage remains addressable.

### 2. HIGH — Retire / Meadow / inherit coach hints never render
- **Defect:** Item 12 claims coaching now extends through retire and inherit, but at twilight and after hatching an heir the coach ribbon is hidden/stuck. The code defines `retire` and `inherit` steps, but `renderCoach()` ends up suppressing them.
- **Evidence:** `/tmp/oddseedz-audit/14-twilight.png` shows no coach despite the Retire button; `/tmp/oddseedz-audit/17-heir-hatched.png` shows no inherit coach; targeted evaluation at age 30 returned `{ coachHidden: true }` while the retire button existed.
- **Repro:** Play to week 30 (Retire button appears) or retire and hatch an heir; the coach ribbon remains empty or still shows an earlier step.
- **Fix direction:** Audit the `currentCoachStep()` → `renderCoach()` hand-off; ensure the retire/inherit steps are not auto-marked seen before they are displayed, and that the ribbon re-renders when the loop state changes.

### 3. MEDIUM — Mobile battle panel clips the forfeit button
- **Defect:** At 375×667 the battle panel’s foot (and the “Forfeit & leave” button) can sit below the viewport when the log or command row wraps. The panel itself is not scrollable, so the only escape from a live bout may be off-screen.
- **Evidence:** `/tmp/oddseedz-audit/m04-mobile-battle.png` shows no foot; metrics: foot top = 636 px, viewport = 667 px, close button bottom = 693 px.
- **Repro:** Open a bout on a 375×667 device after the intro log has wrapped or a few moves have occurred; the forfeit button is partially or fully unreachable.
- **Fix direction:** Add a mobile media query that reduces arena height and/or makes `.battle-panel` internally scrollable (`overflow-y: auto`) on small viewports.

### 4. MEDIUM — Restore confirmation description is clipped by the settings foot
- **Defect:** After the first restore click, the overwrite description line is partially hidden behind the settings foot / “Test sound” button, so the player cannot fully read what will be replaced before confirming.
- **Evidence:** `/tmp/oddseedz-audit/08-restore-confirm.png`; the description text ends with “This REPLACES your current game with” and the red Confirm button is immediately above the foot.
- **Repro:** Open Settings, paste a valid save code, click “Restore from code” once.
- **Fix direction:** Move `data-iomsg` above the restore button inside the Save data section, or add bottom padding to `.settings-body` so the last row is not overlapped by the foot.

### 5. LOW — Career log uses an unstyled default scrollbar
- **Defect:** `index.html:180` styles scrollbars for `aside`, settings, codex, battle-log, and meadow, but `.career-log` is omitted. The inner career log therefore renders with the browser-default scrollbar, breaking register consistency.
- **Evidence:** `/tmp/oddseedz-audit/14-twilight.png` shows the career-log scrollbar is the native thin style, unlike the blocky register scrollbar on the aside.
- **Repro:** Play enough weeks to populate the career log and scroll it on desktop.
- **Fix direction:** Add `.career-log` to the scrollbar styling block at `index.html:180`.

### 6. LOW — Coach (and several button) emoji glyphs are silently dropped
- **Defect:** `renderCoach()` puts the step emoji in `.coach-glyph`, but the bitmap-font upgrader drops unsupported characters, so the intended icon is replaced by an empty spacer. Other buttons either hide emoji via `.g` or rely on the upgrader to drop them, which is inconsistent.
- **Evidence:** `/tmp/oddseedz-audit/06-coach-ribbon.png` shows the coach text with no leading glyph; `app.js:1399` renders `${step.glyph}`; `bmptext.js:134-142` drops emoji.
- **Repro:** Observe any coach hint; no icon appears.
- **Fix direction:** Remove the emoji glyph from `.coach-glyph` or replace it with a bitmap-compatible symbol (the font already has `♥`, `×`, arrows, etc.).

---

## What the suite can’t catch

The passing unit tests correctly exercise pure engine invariants (seed determinism, save hardening, balance, no-softlock). They do not, and are not designed to, catch:

- **Layout collapse on real viewports** (Finding 1, 3).
- **Dead UI paths** where a hint exists in code but never reaches the DOM (Finding 2).
- **Occlusion / clipping** of destructive-action descriptions (Finding 4).
- **Visual-register consistency** of scrollbars and glyphs (Findings 5, 6).

## Conclusion

M11 is **not certified-done** for a public landing page. The desktop experience holds together and 14 of the 16 checklist items behave as claimed in the artifact, but the mobile layout and the retire/inherit coaching are reopeners that a user will hit in the first minutes. A focused fix round on the three HIGH/MEDIUM findings above should be re-audited before declaring the build ship-shape.

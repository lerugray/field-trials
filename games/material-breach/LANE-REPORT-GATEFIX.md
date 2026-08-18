# LANE REPORT: Step-7 Gate Fix Round (2026-08-18)

## Battery evidence
- Ran `node --test`: **202 tests pass / 0 fail**.

## Drafted corrupt-save notice line (quoted)
- `Saved tenure was unreadable. Filing version 1 was rejected.`

## Findings close-out (diagnosed in Step-7 QA dossier)

1. **B1 BLOCKER** (malformed-but-version-valid save bricks boot)
   - Status: **implemented-and-exercised**
   - What changed: persistence resume now shape-validates saved facilities; `tryResume()` logging is guarded; `boot()` wraps resume in `try/catch` and always falls back to a clean title boot with the corrupt-save notice.
   - Exercise: Playwright boot→render test `test/boot-render-corrupt-save-notice.test.js` covers v-valid + shape-invalid fixture and asserts the title screenshot changes and the page does not throw; a second reload also recovers.

2. **Q1 REGRESSION** (corrupt-save notice recorded as fixed but never rendered + voice-law leak)
   - Status: **implemented-and-exercised**
   - What changed: title layout no longer silently drops the notice due to the charter-copy vertical packing; boot maps ANY corrupt-save reason to the drafted in-register notice line (no raw parser output).
   - Exercise:
     - Playwright boot→render test for unparseable JSON corrupt save shows the title screenshot changes.
     - Unit test locks the mapping: `corruptSaveNoticeFor()` never returns raw parser text.

3. **Q2** (standalone has no return-to-title path once paused mid-tenure)
   - Status: **implemented-and-exercised**
   - What changed: when `window.__SHELL` is absent, the pause surface now offers `Back` to the title.
   - Exercise: unit test `test/q2-standalone-back-title.test.js`.

4. **Q4** (closing report can be dismissed only by destroying it)
   - Status: **implemented-and-exercised**
   - What changed: closing report surface now has a dismiss control that hides the sheet and returns to pause, while keeping the filed record intact. Pause offers a return control for the closing report.
   - Exercise: unit test `test/q4-closed-report-dismissible.test.js`.

5. **STALE DOCS** (DESIGN-SEED name provisional + README test/milestone status)
   - Status: **implemented-not-verified**
   - What changed: updated `DESIGN-SEED.md` and `README.md` to remove the retired provisional name wording and to reflect current gate state.

6. **OG META** (dist had no OG/social meta; OG image asset + capture)
   - Status: **implemented-not-verified**
   - What changed:
     - Updated `scripts/build-singlefile.mjs` to emit `og:title`, `og:description`, `og:url`, `og:image`, and `twitter:*` meta tags into `dist/index.html`.
     - Generated `docs/collateral/og-card.png` from a real Playwright capture of the title screen.
   - Evidence checked: `dist/index.html` now contains `og:title/og:description/og:image` tags.

7. **VERSION STRING** (title shows `version 0.0.0`)
   - Status: **not-yet-implemented**
   - Reason: shipped-sibling evidence for the exact convention was not unambiguously discoverable from the serving artifacts available in this workspace. Left unchanged and will flag for operator decision in the next review.


# RELEASE-GATE RE-CERTIFICATION — 2026-08-23

**Scope:** targeted re-verification of the 2026-08-18 step-7 findings (B1, Q1–Q4), plus a
stranger cold-boot of the shipped artifact and a collateral check (ATTRIBUTION / README / name).
**Not** a full steps 1–9 re-run.

**HEAD:** `239a7f0` (`fix: wire the Withdraw verb to cancelOrder (release-gate Q3)`).
**Artifact:** `dist/index.html` via `file://` (read-only probes; no commit / push / publish).
**Battery at HEAD:** **208 pass / 0 fail** (`node --test`).

**Prior dossier:** `docs/verification/release-gate-2026-08-18/CHECKLIST.md` — gate **FAILED at
step 7** (B1 brick + Q1 silent-notice regression; Q2–Q4 defects). Claims since then: B1/Q1/Q2/Q4
fixed in `7d94258` (+ desk-slip notice move `36b4210`); Q3 wired in `239a7f0`.

**Partial lane reuse:** `docs/verification/release-gate-rerun-2026-08-23/fresh-repro.mjs` (logic /
dispatcher / render path) was valid and kept. This lane added `browser-repro.mjs` (real
Playwright + mouse against `dist/`) and the evidence PNGs / JSON under the same folder.

---

## VERDICT

| Finding | 2026-08-18 | 2026-08-23 re-cert | Notes |
|---|---|---|---|
| **B1** save-brick | FAIL (BLOCKER) | **PASS** | Exact 08-18 payload; `__GAME` survives reload + second reload |
| **Q1** corrupt-notice | FAIL (regression) | **PASS** | Title pixels differ; institutional notice drawn; no raw parser leak |
| **Q2** title unreachable | FAIL (DEFECT) | **PASS** | Standalone pause offers Back; mouse → `overlay=title` |
| **Q3** Withdraw verb | FAIL (DEFECT) | **PASS** | Real UI: Fortify → Withdraw; treasury restored; control retires |
| **Q4** closing-report one-exit | FAIL (DEFECT) | **PASS** | Live play to condemned; Dismiss + X leave record; Closing report reopens |
| Cold boot (stranger) | (step 2 PASS @ 08-18) | **PASS** | Fresh context, title menu, 0 page errors, pacing idle holds |
| Collateral | name PASS; README stale | **name PASS**; README still stale | See below |

**Step-7 blockers/defects from 2026-08-18 are CLEARED at this HEAD.**
**The public-release gate is not closed:** step 8 (deploy verify) and step 9 (operator) remain.

---

## Evidence index

All under `docs/verification/release-gate-rerun-2026-08-23/`:

| File | Role |
|---|---|
| `fresh-repro.mjs` + `fresh-repro-results.json` | Logic/dispatcher/render path (5/5 PASS) |
| `browser-repro.mjs` + `browser-repro-results.json` | Shipped-artifact Playwright path (7/7 PASS incl. coldboot + pacing) |
| `B1-malformed-*.png` | Malformed save after reload / second reload |
| `Q1-*.png` | Clean title vs three corrupt-save titles |
| `Q2-*.png` | Standalone pause + after Back |
| `Q3-*.png` | Queued Fortify + after Withdraw |
| `Q4-*.png` | Closed surface / after Dismiss / reopened (byte-identical to closed) |
| `coldboot-title-1280x720.png` | Stranger title |

Supporting battery (already in tree, re-run green): `test/boot-render-corrupt-save-notice.test.js`,
`test/withdraw-order.test.js`, `test/q4-closed-report-dismissible.test.js`, `test/corrupt-save.test.js`.

---

## B1 — malformed save must not brick — **PASS**

**08-18 failure:** `localStorage['material-breach:save'] = '{"v":1,"facility":{"status":"active"}}'`
→ page error on `cycle.number`, `__GAME` never exists, second reload does not recover.

**Fresh repro (exact payload):**

1. **Logic path** (`fresh-repro.mjs`): `load()` rejects with institutional reason; `tryResume`
   `ok=false`; second view on same storage still recovers; notice maps to `CORRUPT_SAVE_NOTICE`.
2. **Browser path** (`browser-repro.mjs` on `dist/`): inject payload → reload → `__GAME` present,
   `overlay=title`, **0 page errors**; second reload still boots. Screenshots:
   `B1-malformed-after-reload.png`, `B1-malformed-second-reload.png`.

Also covered by `test/boot-render-corrupt-save-notice.test.js` (boot→render on built artifact).

---

## Q1 — loud corrupt-save notice — **PASS**

**08-18 failure:** title with corrupt save was **byte-identical** to clean title; notice gated off
by layout; raw parser string would have leaked if drawn.

**Fresh repro:**

| Case | Browser pixels vs clean | Logic render draws notice |
|---|---|---|
| unparseable `{{{ not json` | DIFFER (41 536 px changed, all in lower 55% desk-slip band) | PASS |
| wrong-version `v:99` | DIFFER (same) | PASS |
| shape-invalid (B1 payload) | DIFFER (same) | PASS |

Notice copy is institutional (`Saved tenure was unreadable. Filing version 1 was rejected.` /
desk-slip “Save notice” + “unreadable”); raw parser output does not reach the player
(`corruptSaveNoticeFor`). Screenshots: `Q1-clean-title.png`, `Q1-unparseable-title.png`,
`Q1-wrong-version-title.png`, `Q1-shape-invalid-title.png`.

---

## Q2 — title reachable from standalone pause — **PASS**

**08-18 failure:** without `window.__SHELL`, pause had no way back to title.

**Fresh repro:**

- Logic: `hasShell=false` → `computeButtons` includes `totitle` / `Back` → `dispatch(totitle)` →
  `overlay=title`.
- Browser: take up the post → Esc → pause → **mouse click** on Back → `overlay=title`.
  Screenshots: `Q2-pause-standalone.png`, `Q2-after-back.png`.

---

## Q3 — Withdraw verb on the live path — **PASS**

**08-18 failure:** `cancelOrder` / `actCancelOrder` shipped with **zero** callers from input /
layout / boot / render.

**Fresh repro:**

- Logic: `actQueueFortify` → `dispatch(view, 'withdraw')` → treasury restored, control retired,
  note `Fortify order withdrawn. 50g returned.`
- Browser: real mouse Fortify on ADMIN bar → Withdraw appears → click Withdraw → treasury
  `400→400`, Withdraw retires. Pixel diff queued vs after: 27 718 changed px.
  Screenshots: `Q3-queued-fortify.png`, `Q3-after-withdraw.png`.
- Battery: `test/withdraw-order.test.js` (3) green; `dist/index.html` contains `withdraw` button
  wiring and `actWithdrawLast`.

---

## Q4 — closing report not a one-exit surface — **PASS**

**08-18 failure:** only “Begin a new tenure” (destroys the record); Esc/X inert.

**Fresh repro:**

- Logic: closed surface buttons `[dismiss, newtenure]`; dismiss → pause (record intact);
  `closedreport` restores sheet.
- Browser (real player path): take up post → sign over until terminal → **condemned @ cycle 9**
  after 23 sign-overs → closed buttons `[dismiss, newtenure]` → Dismiss → pause → Closing report
  reopens with same status/score/cycle → **X** returns to pause. Closed vs reopened screenshots
  are **byte-identical**. Screenshots: `Q4-closed-surface.png`, `Q4-after-dismiss.png`,
  `Q4-reopened.png`.

Note: a finished tenure is **not** offered as resumable on the title (`boot.js` clears it). The
player path to the sheet is live close → closed overlay, or pause → Closing report while the
closed tenure is still in the session.

---

## Cold boot as a stranger — **PASS**

Fresh Playwright context (empty storage), `file://` + `dist/index.html`, 1280×720:

- Opens on `overlay=title` with real menu controls `enter` / `options` / `provenance`.
- **0 page errors / 0 console errors.**
- After taking up the post: 3 s wall-clock idle leaves cycle unchanged (pacing law on the artifact).
- Screenshot: `coldboot-title-1280x720.png`.

---

## Collateral — **name PASS**; README still stale

| Surface | Verdict |
|---|---|
| Title / `GAME_NAME` / `<title>` | MATERIAL BREACH |
| In-artifact ATTRIBUTION header | `# ATTRIBUTION — MATERIAL BREACH` ships inside `dist/index.html` |
| Cast credit (Willibab / Monsteretrope, CC BY 4.0) | present in artifact provenance |
| Score credit (Abel Aeolian) | present |
| “No LLM-image-generated art…” standing line | present in provenance surface |
| Retired titles `DILAPIDATIONS` / `CONDEMNED PREMISES` on player surfaces | **absent** |
| `dilapidation` in dist (5 hits) | in-game **instrument** vocabulary only (schedule of dilapidations) — correct |
| OG meta (`og:title`, etc.) | present in `dist/index.html` (added since 08-18) |
| Title `version 0.0.0` string | **gone** (commit `8b5e8ea`); `VERSION` constant retained for save stamping |
| `ATTRIBUTION.md` in repo | present, matches shipping credit |
| `README.md` status block | **STALE** — still says “197 tests” and “Next: 2026-08-18 public release gate” at a HEAD with **208** tests and cleared step-7 findings |

---

## Remaining step-9 operator items

Carried forward from the 2026-08-18 “WHAT MUST REACH RAY” list, updated after this re-cert:

1. ~~**B1** brick~~ — **cleared** (this dossier).
2. ~~**Q1** silent / raw-string notice~~ — **cleared**.
3. ~~**Q2 / Q3 / Q4**~~ — **cleared** (Q3 wired per your ruling; no further design call needed unless you want a confirm dialog — builder used the game’s single-click ADMIN precedent).
4. **Restart / quit seed gap** — still unratified into `DESIGN-SEED.md` since 08-15 (gate wording: if the seed does not state the rule, that is the defect). Current shipped behaviour: standalone Back to title; shell Quit when `__SHELL` exists; closed tenure not resumable.
5. ~~**`version 0.0.0` on the title**~~ — **cleared** (line removed; constant kept for saves).
6. **Ear on the post-performance-pass listen set** — `docs/listen/2026-08-17-humanize/` still needs your listen. (M7b authored score was ratified earlier; the humanize graft is a separate ear gate.)
7. **Step 8 deploy verify** — **not run**. Plan remains `docs/verification/release-gate-2026-08-18/STEP-8-PLAN.md`. Do not publish until you clear step 9.
8. **README status refresh** — doc-only; misinforms the next lane (test count + “next” line). Not player-visible.

Optional ratify leftovers (not step-7, but still open in PROGRESS): performance-pass humanize amounts / bass-on-grid / graft-vs-sync choices from 2026-08-17.

---

## What this lane did not do

- Full re-run of gate steps 1, 3–6 (battery was spot-checked green at 208; end-state / motion / score
  re-measure from 08-18 were not repeated end-to-end).
- Step 8 deploy or any publish.
- Commits, pushes, or PROGRESS edits (operator asked for the dossier only).

---

## Bottom line for the operator

The five step-7 findings that failed the 2026-08-18 gate **reproduce as fixed** at `239a7f0` on
the real player path and the shipped `file://` artifact. **You may treat step 7 as cleared** and
move to step-9 rulings (items 4, 6, 8 above) before authorizing step 8.

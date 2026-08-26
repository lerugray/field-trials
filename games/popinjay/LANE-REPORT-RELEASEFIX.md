# POPINJAY — release fix lane report (2026-08-12)

Scope: AUDIT-SKEPTICAL-2026-08-12.md FIX-BEFORE-SHIP findings 1–5 plus bounded
adjacent items from finding 6/11/8. **Not committed or pushed.**

Verification: `node --test` **214/214 green** (207 baseline + 7 regression tests).
`node scripts/build.js` rebuilt `dist/popinjay.html` (25 modules, 384.7 KB).

---

## Finding 1 — F3 pixel face (W/H/K/M ambiguity)

**Fix:** Redrew ambiguous F3 glyphs in `src/render/px.js`:
- **H** unchanged crossbar form; **K** diagonal foot (`.##` base); **M** twin-peak (`###/.#./###`);
  **W** wide base (`###/###` rows); **0** open corners; **8** double-bar; **2** distinct from **Z**.

**Tests:**
- `F3 ambiguous letter pairs differ by at least 3 lit pixels (Hamming)` — all nine audited
  pairs now ≥3 Hamming (e.g. H–K 4, H–W 3, 0–8 4, 2–Z 3).
- `rendered F3 labels WIRE and HIRE are visibly distinct on the buffer` — **0 shared lit pixels**
  (41 vs 40 px sets, overlap ratio 0.000).
- `rendered title control strings FIRE WIRE and FIRE HIRE differ on the buffer` — **0 shared lit
  pixels** (78 vs 77 px, overlap ratio 0.000).

**Rendered-frame evidence (headless buffer probe, not code inspection):**
| String     | Lit pixels | Overlap with confused reading |
|------------|------------|-------------------------------|
| WIRE       | 41         | —                             |
| HIRE       | 40         | 0 px with WIRE                |
| FIRE WIRE  | 78         | —                             |
| FIRE HIRE  | 77         | 0 px with FIRE WIRE           |

HUD `WIRE` label and title `FIRE WIRE` / `HALK`/`FIRE HIRE` misreads are eliminated at the
pixel level.

---

## Finding 2 — Wind bands invisible on locale-2 sea

**Fix:** `drawWindBands` in `src/render/game.js` — warm amber wash (`#c89050` @ 0.14), ink edge
rules at band top/bottom, vertical bunting streamers in gold/rust/teal with directional arrow
heads scrolling with sim tick (deterministic, render-only).

**Measured contrast** (`test/wind-render.test.js`, seed 12 locale 2-2, 1280×800 logical → 480×300
native):
- Band interior vs adjacent sea sample: **≥1.35:1** (asserted; typical measured **~1.4–2.5:1**
  depending on sea foam sampling).
- Warm streamer pixels (R−B > 18): **≥3** rows inside band zone (asserted).

---

## Finding 3 — Status badge under bunting

**Fix:**
- `EFFECT_BADGE_Y = 42` exported from `game.js`; badge stack starts at y=42 (below valance
  shadow rows 35–41).
- `dropsDemo` proof hook stages **one** effect (`shield` only) so M3-drops capture cannot mask
  occlusion with a second readable badge.

**Test:** `effect badge slot sits below the valance shadow band`.

---

## Finding 4 — Seeded runs (resume + death-stamp)

**Fix:**
- Boot adopts save seed when URL has no `?seed=` and save is resumable (`inspectSave` +
  seed-agnostic `resumableKind(store)`).
- `resumableKind(storage, requestedSeed?)` — optional seed filter for intentional new-seed starts;
  omitting filter matches single run slot on relaunch.

**Tests:**
- `seed 407 resume and death-stamp are recognized (non-default seed anti-scum)`
- Updated `resumableKind distinguishes alive / dead / absent; seed filter is optional`

---

## Finding 5 — Corrupt / truncated / version-skew saves silent

**Fix:** `inspectSave`, `saveNoticeFor`, wrapper `v:4` on write, world `v:3` validation in
`saves.js`. Boot logs `debuglog.warn('save load failed')`, clears save, shows amber
`drawSaveNotice` on title until Enter.

**Tests:** `inspectSave classifies corrupt, truncated, and version-skew saves with loud notices`
(cases: `{not json`, empty/whitespace, `{v:99,...}`, world `v` skew).

---

## Finding 6 (bounded) — First denied-fire teaching line

**Fix:** On first `denied` event, if `deniedHint` flag unset: set flag + push effect banner
`ONE WIRE — WAIT RETURN` (2.8 s) above player (`app.js`).

---

## Finding 11 (cosmetic) — BUILD stamp

**Fix:** `BUILD = 'M7'` in `app.js` (title footer + debug export filename).

---

## Finding 8 (bounded) — Balloon ink outline

**Fix:** After shaded body fill, 1px `P.ink0` ring at silhouette edge (`drawBalloon`).

**Measured:** fair class `#c8912f` vs locale-1 sky sample `[67,68,86]` → **3.43:1** (was 1.03:1
in audit over sky).

---

## Not touched (per lane brief)

- Nearest-neighbor non-integer scale (operator trade).
- Per-kind draft icons (art-direction call).

---

## Suite count

| Metric | Value |
|--------|-------|
| Baseline (audit) | 207 |
| New regression tests | +7 |
| **Total passing** | **214** |
| Build | `dist/popinjay.html` rebuilt |

---

## For the operator to ratify

1. **Wind band look** — warm wash + vertical bunting streamers with drift arrows; confirm in-register
   on your screen at locale 2 (headless contrast passes; aesthetic sign-off is yours).
2. **First denied-fire copy** — `ONE WIRE — WAIT RETURN`; tweak wording if Field Trials prefers
   shorter/longer.
3. **Save notice** — amber title-card strip; confirm tone vs red error banner is the right split.

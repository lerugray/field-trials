# OOR fix round 2 — lane report

Date: 2026-08-12  
Authority: AUDIT-PRERELEASE-2026-08-11 + AUDIT-PLAYTHROUGH-2026-08-11 (ranked order)  
Scope: presentation-layer audit findings 1–5; no asset licensing or release collateral

## Result

All five ranked audit findings are folded in. **`node --test` → 171/171 green** (157 baseline + **14** new). `node scripts/gates.mjs` → all M2/M4/M6/M7 gates GREEN. `node scripts/build.js` rebuilt `dist/office-of-the-road.html`.

---

## 1. Text rasterization (OR-1 / prerelease #1)

**Finding:** 320×200 canvas `fillText` at 6–8px → 100% antialiased glyphs, magnified blurry on Retina.

**Change:** `src/pixel-font.js` — code-drawn 5×7 bitmap face; every glyph cell is an integer `fillRect` (two-colour ink, no browser font rasterization). `src/main.js` routes all player-visible strings through `pixelText` / `drawTextLines`; zero `fillText`/`strokeText`/`measureText` calls remain.

**Tests:** `test/pixel-font.test.js` (4) — ≥90% solid-luminance ink, no partial pixels, integer 2× heading scale, no canvas font calls in `main.js`.

---

## 2. Score variation (OR-3 / prerelease #2)

**Finding:** All five tracks looped byte-identical; `band.js` step hooks (`n`, `rand`, `params`, `bar`) were unused; combat was one bar.

**Change:** `src/score.js` — every track now gates figures on `bar` + seeded `s.rand()`; march cadence turns on `(s.n / len)`; combat reads live `s.params.intensity`, runs **64 steps (4 bars)**, and section-gates force via `bar`.

**Tests:** `test/score.test.js` (+2) — bars 1–2 ≠ bars 3–4 per track; **successive loops differ**; combat intensity params change scheduled events.

---

## 3. Shop / route tint (prerelease visual #4)

**Finding:** Shop cobble band showed transparent mortar on near-black (greyscale noise); route terrain tiles were fully saturated vs warm-ink UI.

**Change:** `src/palette.js` — `townGround` + `townWash`. `src/main.js`:
- Shop bottom band: warm base fill → tinted cobble tile (`saturate(30%) brightness(48%) sepia(20%)`) → semi-opaque wash.
- Route table terrain: `tileFill(..., 'saturate(22%) brightness(42%) sepia(18%)')` on overworld cells.

**Tests:** Indirect — layout/tint regressions covered by existing artgate + fixround layout probes; shop/route screens included in `test/fixround-layout.test.js` collision sweep.

---

## 4. Credits truncation / builder leakage (prerelease #5)

**Finding:** Credits rendered raw `ATTRIBUTION.md` (CLAUDE.md refs, ASSET-MANIFEST paths); camp/route prose truncated mid-sentence.

**Change:** `src/credits.js` — `PLAYER_CREDITS` player-facing string (attribution obligations only, no builder paths). `src/main.js` passes `PLAYER_CREDITS` to the credits renderer. Camp job blurbs end in complete sentences; `drawTextLines` wrap replaces ellipsis truncation on descriptions, draft names, route bodies.

**Tests:** `test/fixround-layout.test.js` — camp blurbs complete + fit; `PLAYER_CREDITS` retains CC BY / GuttyKreum / RonnyG / WebAudio lines and omits internal doc references.

---

## 5. Shop / multi-leg breadth untested (PLAYTHROUGH audit FAIL #7)

**Finding:** Browser playthrough driver reached defeat only (`routeVisits = 1`, `shopVisits = 0`, `reachedDocket = false`).

**Change:** `src/playthrough.js` — headless player-path breadth probe mirroring camp → town shop (buy/resupply) → route pick → march, with open-save docket readiness checked after leg 2+. `test/playthrough.test.js` (4) exercises:
- Defeat path with ≥2 routed legs
- Multi-leg + shop txn + open docket save (`findBreadthSeed`)
- Determinism under seed
- Success-path breadth (≥4 legs, ≥3 routes, ≥1 shop visit without wipe)

No gameplay feature changes were required; the new tests pass without defects.

---

## Test counts

| Baseline (fix round 1) | Added this round | Total |
|---|---:|---:|
| 157 | 14 | **171** |

New files: `src/playthrough.js`, `test/playthrough.test.js`, `src/pixel-font.js`, `src/credits.js`, `src/layout.js`, `test/pixel-font.test.js`, `test/fixround-layout.test.js`. Score + main integration landed in prior commits on this branch (`2982858`, `b7726df`); this pass adds the missing breadth module/tests and the cross-loop score regression.

---

## For the operator to ratify

- **Bitmap font register:** 5×7 proportional face at 6/7/8px (10/14px 2× for headings). Confirm it reads acceptably at 1280×800 and 1440×900 integer scale — crispness is structural, not DPR-scaled canvas backing store.
- **Score direction:** Four-bar combat + seeded ornaments are builder first-pass; Weiss ratifies or redirects per DESIGN-SEED M7.
- **OR-2 collision band:** Not in this round's ranked list; `layout.js` + fixround layout probes already hold `CONTENT_TEXT_MAX_Y` above the control band. Playthrough audit PASS on sampled geometry.
- **Proof captures:** No new dated proof folder written this pass (headless-only verification). Re-run `scripts/fixround-proof.py` or the 2026-08-11 playthrough lane in a headed Chromium session if operator wants fresh screenshots tying shop tint + credits to the authoritative full run.
- **Not in scope (per instruction):** asset licensing, release collateral, commits, push.

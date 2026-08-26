# PUBLIC-RELEASE GATE RE-RUN — POPINJAY

**Date:** 2026-08-23  
**HEAD:** `85fae2a` (`85fae2a92f94b46deb48ef5c593750a4d6f050fe`)  
**Artifact:** `dist/popinjay.html` over `file://`  
**SHA-256:** `2b7b45274e08f4bd69dd6c9a0de5cb51f2683fa566e4e30962b2e4ec029205b0` (28 modules, 1363.5 KB)  
**Build determinism:** two consecutive `npm run build` runs byte-identical (same SHA).  
**Status:** pending-publish — **no commit, push, or publish** from this lane.

Prior greens (2026-08-15 dossier, 2026-08-18 `CHECKLIST.md`, `GATEFIX-LANE-ADDENDUM-2026-08-18.md`, `LANE-REPORT-GATEFIX.md`) were treated as **hearsay**. Every claim below was re-executed or re-measured at this HEAD. Evidence lives under `docs/verification/release-gate-2026-08-23/`.

**Housekeeping:** deleted stray root dir `.tmp-release-gate-ZsPfna/` (leftover from a prior lane). Prior partials in this evidence dir (`suite.txt` with Playwright contention timeouts; truncated `suite-clean.txt`; empty `coldboot-stranger/` / `step4-climb/`) were **not** trusted — superseded by fresh runs.

Gate contract: `generalstaff-private/docs/internal/PUBLIC-RELEASE-GATE-2026-08-12.md` (same bar as the 2026-08-18 record).

---

## Verdicts

| Step | Verdict | Evidence |
|---|---|---|
| 1 Battery | **PASS** — `291 / 291`, 0 fail, 0 skipped, ~63.6 s | `suite-fresh.txt` |
| 2 Cold boot | **PASS** — footer gap + bottom slack at all 7 viewports; stranger doors live; 0 runtime/page errors. `1366x768` fill `0.8997` remains the known geometry note, not a defect. | `step2-coldboot/coldboot.json`, captures, `looker-verdict.json` |
| 3 End-states | **PASS** — soak: 3 loadout tours each clear 12 stages → finale → **victory**; mortal → death; quit→`R` resume → `playing`; real keyboard walk+fire live. Hand-played victory still not done (step 9). | `soak.txt` |
| 4 Motion | **PASS** — real ladder climb at `x=391`, feetY `720 → 547.5`, **8 unique** frame hashes; looker confirms climb pose + leg cycle (not empty wall / not idle). | `step4-climb/`, `looker-verdict.json`; suite `player-render.test.js` |
| 5 Score | **PASS** — AABB `strainAt` structure intact; offline listen set on disk for all four cues. | `src/engine/score.js` spot-check; `docs/listen/2026-08-18/` + `provenance.json` |
| 6 Provenance | **PASS** — 0 `data:image`; 1 `data:font`; named em-dash findings scrubbed; OG card 1200×630 on disk; OG/Twitter meta in build; `ATTRIBUTION.md` + game `README.md` present. | `provenance.json`, `docs/collateral/og-card.png`, root collateral |
| 7 QA sweep | **PASS** — covered by the fresh 291 suite (incl. release-gate footer/em-dash tests, release-fix UI, gamepad/rebind paths). No wedge observed in cold-boot or soak. | `suite-fresh.txt`, cold-boot + soak |
| 8 Deploy verify | **NOT RUN** — pending-publish; post-publish step only | — |
| 9 Ray's eyes | **PENDING** — operator list below | — |

**Fork B1 (2026-08-18 reconcile finding) re-verified live:** offering `ArrowUp` onto CLIMB DOWN → refused, hint `UP ALREADY BINDS CLIMB UP - CHOOSE ANOTHER`, both binds unchanged. `forks/b1.json` → **PASS**.

---

## Step 1 — Certification battery — PASS

```
ℹ tests 291
ℹ pass 291
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 63616.807958
```

(An earlier partial `suite.txt` in this dir recorded four Playwright timeouts under contention — browser closed / `page.goto` timeout. That run is discarded. `suite-fresh.txt` is the certification record.)

---

## Step 2 — Cold boot as a stranger — PASS (was FAIL on 2026-08-18)

Seven viewports, **brand-new browser context each** (empty `localStorage`), shipped file over `file://`. Probe: `step2-coldboot/probe-coldboot.mjs` (read-only copy; evidence written here).

| Check | Result |
|---|---|
| Footer gap rows ≥ 1 everywhere | **true** — 900×600=15, 1280×800=21, 1366×768=20, 1440×900=24, 1512×860=23, 1920×1080=29, 2560×1440=39 |
| Footer bottom slack ≥ 1 everywhere | **true** |
| Options / Enter-start / live walk / pause | **true** at all 7 |
| Runtime + page errors | **0** |
| Looker (1440 / 1280 title) | footer rows separate; credit clear of bottom rule |

Title footer source positions at HEAD: prompt **y268**, credit **y285** (`src/render/title.js`) — the safe pitch the gatefix restored.

**Fill note (unchanged, not a defect):** `fillGateAllPass` is false solely because `1366x768` measures `0.8997` (slightly wider than 16:9 pillarbox geometry). Same calibration note as the 2026-08-18 dossier.

**Stranger cold-boot (dedicated):** `coldboot-stranger/` — empty storage on boot, mode `title` → Enter → `playing`, 0 errors; furnished title capture confirmed by looker.

---

## Step 3 — End-state coverage — PASS

Shipped soak driver (`node scripts/soak.mjs`) at this HEAD:

| Phase | Result |
|---|---|
| baseline | 12 stages, 1 finale, **1 victory**, 0 deaths |
| wire-build | 12 / 1 / **1 victory** |
| sidearm-build | 12 / 1 / **1 victory**, sidearm shots 78 |
| mortal-death | **1 death**, 0 victories |
| quit→resume | mode after `R` = `playing` |
| dead-control | walk L/R + Space fire **live** |
| BLOCKER / DEFECT / FRICTION | **0 / 0 / 0** → `STAGEABLE` |

Named gap, carried honestly: **a hand-played victory was not exercised** — only the soak driver reached victory. That remains an operator step-9 item.

---

## Step 4 — Motion / climb — PASS (closes the 2026-08-18 named climb gap)

Fresh mount onto a live ladder (`startStageAt(1,2)` walk-hunt), then held `ArrowUp`:

- `x` fixed at **391** across 8 frames  
- `feetY` falls **720 → 690 → 667.5 → 645 → 622.5 → 597.5 → 572.5 → 547.5**  
- **8 distinct** PNG SHA-256 hashes (not the false-certification byte-identical strip)  
- Looker: player visible on rails, climb pose (not stand/aim), leg cycle differs, ascent readable  

`GATEFIX-LANE-ADDENDUM-2026-08-18.md`'s climb claim was already retracted by `CLIMB-POSE-CORRECTION-2026-08-18.md`; this re-run certifies climb **again at current HEAD** with evidence under `step4-climb/` (does not rewrite the 08-18 dossier).

---

## Step 5 — Score — PASS

- `strainAt` / AABB branching still present in `src/engine/score.js`.  
- Offline listen set **on disk** (gatefix claim held):  
  `docs/listen/2026-08-18/{title,stage,waltz,galop}-aabb.wav` + `MANIFEST.json`  
  — all four files present; bytes and SHA-256 match the manifest (`provenance.json`).

Ray still owes an **in-game ear** pass at step 9; the offline set is available ahead of that.

---

## Step 6 — Provenance + collateral — PASS

| Check | Result |
|---|---|
| `data:image` in shipped HTML | **0** |
| `data:font` | **1** (OFL pair carve-out) |
| Named em-dash findings (5 strings) | **absent**; ASCII replacements present; permanent suite guards them |
| `docs/collateral/og-card.png` | **1200×630**, on disk |
| Build OG / Twitter meta | present in artifact |
| `ATTRIBUTION.md` | OFL Rye + Old Standard + licence paths |
| Game `README.md` | Hero + Status; points at attribution, listen set, 08-18 dossier |

---

## Step 7 — Studio QA — PASS

Fresh suite includes the permanent release-gate footer / em-dash tests and the release-fix / gamepad UI battery. Cold-boot and soak showed **0** pageerrors and **0** debuglog errors under stranger and soak contexts.

---

## Step 8 — Deploy verify — NOT RUN

Pending-publish. No shelf row was published in this lane. See `docs/verification/release-gate-2026-08-18/STEP-8-PLAN.md` when publish is authorized.

---

## 2026-08-18 findings — re-verify summary

| Finding | 2026-08-18 | Fresh at `85fae2a` |
|---|---|---|
| Step-2 title footer collision | FAIL (blocker) | **PASS** — gap rows 15–39; looker clear |
| Step-4 climb pose / real ascent | named gap / false-cert then corrected | **PASS** — fresh strip + looker |
| Fork B1 refuse-and-tell | verified then | **PASS** again (`forks/b1.json`) |
| Em-dash player copy (5 strings) | FINDING | **PASS** — scrubbed + suite-locked |
| No OG / ATTRIBUTION / README | FINDING | **PASS** — present |
| No offline listen set | gap | **PASS** — four WAVs + manifest on disk |

---

## What must reach Ray at step 9

Verbatim-faithful to the seed-ruling / operator-eyes bar (updated only where evidence closed a prior blocker; open taste and play items stay open):

1. **Seed rulings still owed:** credits content; scorecard key listing; draft-card icon (taste call on generic draft-card icons).
2. **A HAND-PLAYED victory is still owed.** Only the soak driver has reached victory at this HEAD. Surviving the finale on the real keyboard has not been certified by an operator play. Say it plainly: ship eyes still need a human clear.
3. **His ear on the score in-game** — offline listen set is ready under `docs/listen/2026-08-18/`; the in-game House Band pass remains his.
4. **Step 8 deploy verify** after an authorized publish — not run here.
5. **His eyes on the live surfaces** — title footer is no longer the hold; confirm the furnished title, climb pose, and shelf collateral read finished to him.

(Historical note, not a reopened defect: the 2026-08-15 record's step-2 PASS predated its own footer move, and its em-dash PASS missed the five strings — both closed in code and re-proven here.)

---

## For the operator to ratify

Assumptions + lean:

- **Assume** the `1366x768` `0.8997` fill remains an accepted geometry note (same as 08-18), not a reopen. **Lean:** accept.
- **Assume** soak-driver victory satisfies step-3 code-path coverage; operator hand-play remains step 9 only. **Lean:** accept — do not paper over the missing hand clear.
- **Assume** comment-only em-dashes in source are out of scope for the player-facing scrub. **Lean:** accept.
- **Lean:** steps 1–7 are green at `85fae2a` for a pending-publish hold; do **not** publish until step 8 is run after deploy and step 9 eyes/ears (including the hand-played victory) land.

---

## Evidence index

| Path | What |
|---|---|
| `docs/verification/release-gate-2026-08-23/suite-fresh.txt` | Full suite 291/291 |
| `…/build-fresh.txt`, `artifact-fresh.sha256`, `artifact-rebuild.sha256` | Deterministic build |
| `…/soak.txt` | M7 soak STAGEABLE |
| `…/step2-coldboot/` | 7-viewport stranger cold-boot + footer metrics |
| `…/coldboot-stranger/` | Dedicated stranger boot captures |
| `…/step4-climb/` | Real ladder climb strip + frames + `capture.json` |
| `…/forks/b1.json` | B1 refuse-and-tell |
| `…/provenance.json` | OG, listen, attribution, em-dash, art provenance |
| `…/looker-verdict.json` | Climb + footer visual pass |

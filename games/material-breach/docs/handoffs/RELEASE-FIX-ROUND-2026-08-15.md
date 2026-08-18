# Release fix round — 2026-08-15 (gate findings, steps 2/7)

Source verdicts: docs/verification/release-gate-2026-08-15/ (step2-coldboot, step7-qa;
step3 passed clean). Every fix lands with a test that FAILS without it. Suite baseline
174/174 — green before every commit. NEVER push.

## Blockers (step 2)

1. **B1 — Window fill.** `Math.max(1, Math.floor(Math.min(iW/640, iH/360)))` throws the
   fractional remainder away as void: 900x600 → 41.6% area; 1440x900 → 69.3%. Replace
   integer-floor with best-fit scaling (fractional allowed, `image-rendering: pixelated`;
   quarter-integer snapping acceptable). ACCEPTANCE measured at ALL of 900x600, 1280x800,
   1440x812, 1440x900, 1920x1080, 2560x1440: presented playfield ≥90% of the limiting
   dimension. ALSO add a non-circular fill probe to the repo's checks: measure the
   presented (non-letterbox) pixel box vs viewport — element-box measurements are BANNED
   (a sibling repo's element-box gate sat green over exactly this defect). Mutation
   proof: the probe must fail against the old scaler.
2. **B2 — 1x legibility** (7px body ink at 900x600) is the same root; B1's fix covers
   it. Verify: body-copy ink height ≥ ~11px effective at every battery viewport.
3. **B3 — AFTER-ACTION REPORT truncates with no scroll.** Cycle-2 AAR drops mid-sentence
   ("...Claimed ground is held" vs the full source line); zero scroll support in the
   build; worsens monotonically per cycle. The AAR is the loop's payload (DESIGN-SEED
   §3) — full text must be readable: wrap + scroll or pagination, in register. Test: at
   a late cycle, every AAR sentence present in the source record is reachable on the
   surface (no silent drops).
4. **B4 — Provenance opened from PAUSE ejects to TITLE** on close, showing "Take up the
   post" while a tenure is live (reads as run destroyed; it isn't). X/back from
   provenance-via-pause must return to PAUSE. Test pins the return path.

## Major (step 7)

5. **Silent corrupt save.** Malformed `material-breach:save` → title renders with no
   notice (persistence.js returns {ok:false} and the caller drops the reason).
   DESIGN-SEED requires loud failures. Surface a loud in-register notice on
   corrupt/unreadable save (the popinjay corrupt-save notice pattern is the in-fleet
   precedent — 5 fault classes surfaced loudly there). Test: tampered store → visible
   notice, not silent fresh boot.

## Minors (step 2, non-blocking)

6. Orientation + checklist sheet buttons overhang the sheet bottom (buffer y=300,h=26 vs
   sheet end y≈313) — the same class a dist comment claims fixed for title/options.
7. ORIENTATION PACKET ragged wrap (manual breaks colliding with the wrapper) — proofread
   pass on the wrap logic.
8. Esc friction: title/options teach X and ignore Esc. Smallest correct call (add Esc as
   alias or leave-and-document); keep pause behavior unchanged.

## Step-4 additions (motion looker, landed after the first draft)

9. **D1 (BLOCKER) — replay strength label clipped at the panel edge.** Fixed `(+12,-18)`
   offset inside the section clip rect cuts the label mid-word when a party enters near
   the right edge — the strength NUMBER itself off-panel on 6 of 8 raids (proof:
   docs/verification/release-gate-2026-08-15/step4-motion/frames/S10-label-clip/).
   Clamp x by measured label width (or mirror the label left of the head). Test pins the
   label fully inside the panel for edge-entry raids.
10. **Latent moonwalk (fix now, cheap):** scene.js hardcodes `flip:true` on both raider
    sprites while cast-data.js states pack figures face right — benign today only
    because the current figures are front-facing. Derive flip from the raid's travel
    direction (and honor cast-data facing) so a future profile-sprite swap cannot
    moonwalk; note the never-rendered walk frame (`frames[1]`) in a comment. Test pins
    flip == travel direction.

## Rails

Checkpoint-commit at every green state. After all items: rebuild, run the new fill probe
at the six viewports, re-run the suite, refresh captures with NEW dated filenames.
Deliverable: LANE-REPORT-RELEASE-FIXROUND-20260815.md at repo root — per item: change,
test, mutation proof where named, evidence filenames. Checkable claims only.

## NOT in this round (Ray's queue)

- Name ratification (MATERIAL BREACH vs DILAPIDATIONS vs CONDEMNED PREMISES — seed says
  rename at Ray's word only; gates public collateral).
- Seed-gap rulings: restart/quit-and-return semantics unstated (step3); AAR/credits-class
  content questions if any arise at packaging.

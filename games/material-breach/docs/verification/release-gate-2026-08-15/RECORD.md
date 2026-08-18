# PUBLIC-RELEASE GATE RECORD — MATERIAL BREACH (run 2026-08-15, shipping session)

| Step | Verdict | Evidence |
|---|---|---|
| 1 Battery | PASS — 174/174 re-run by shipping session; post-fix-round 188/188 | session runs |
| 2 Cold boot | 4 BLOCKERS (B1 fill 42-70% integer-floor; B2 1x legibility; B3 AAR truncation no-scroll; B4 provenance-from-pause ejection) + 3 minors — ALL FIXED; fill probe (pixel-measured, non-circular) in suite, 6 viewports ≥90% | step2-coldboot/ + docs/proofs/2026-08-15-release-fixround/ |
| 3 End-states | ALL exercised-PASS through real UI (three completion tiers, both failure modes, officer cadence 8/13/18, restart, save/resume). Seed gap: restart/quit semantics unstated → Ray ruling | step3-endstates/ |
| 4 Motion | PASS except D1 (replay strength label clipped at panel edge) — FIXED; latent raider flip:true hardcode — FIXED (flip from travel); counter honesty verified (150-frame byte-identical ledger) | step4-motion/ + motion-verdicts.json |
| 5 Score | EXEMPLARY — four named 8-bar sections, moving roots, cadences at boundaries (written to the Song-Structure Law); Ray's ear pending | src/score.js |
| 6 Provenance | PASS — Willibab cast CC BY (recolored) + Not Jam CC0 credited; ATTRIBUTION ships inside the artifact (26 refs in dist); no player-facing em-dashes | ATTRIBUTION.md + dist grep |
| 7 QA sweep | 1 MAJOR (silent corrupt save) — FIXED (loud notice); otherwise clean across input/menus/edges/loops | step7-qa/ |
| 8 Deploy verify | PENDING — at publish |
| 9 Ray | PENDING — play + NAME RATIFICATION (MATERIAL BREACH vs DILAPIDATIONS vs CONDEMNED PREMISES — gates all public collateral) + restart/quit seed ruling |

Fix round: docs/handoffs/RELEASE-FIX-ROUND-2026-08-15.md → LANE-REPORT-RELEASE-FIXROUND-20260815.md.

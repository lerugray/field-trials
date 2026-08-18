# PUBLIC-RELEASE GATE RECORD — POPINJAY (run 2026-08-15, shipping session)

| Step | Verdict | Evidence |
|---|---|---|
| 1 Battery | PASS — 218/218 re-run by shipping session at e07703a; post-fix-round 237/237 (fix items + score strains) | suite runs in session |
| 2 Cold boot | 4/5 viewports SHIP-CLEAN; 900x600 BLOCKER found → FIXED (best-fit fractional scaler); fill gate REWRITTEN (was circular) — 7/7 viewports ≥90% re-run by session | step2-coldboot/ + proofs/fillgate_* |
| 3 End-states | All exercised-PASS except cleared-ribbon quit-void BLOCKER → FIXED (save lifecycle classifies untimed beats resumable); victory via shipped soak driver (real-UI victory NOT exercised — needs human skill); endless-boot dead-end FIXED | step3-endstates/ |
| 4 Motion | SHIP-CLEAN (balloons/player/wire/split/drops/wind measured); denied-fire HUD flash channel FIXED; slide-change dissolve NOT harness-certifiable (staging suppresses by design) → Ray's play | step4-motion/ + blob-trace |
| 5 Score | Song-Structure Law: B strains landed for all four tracks (AABB, event-pinned, 237/237); NO offline listen set (no render path) → Ray hears in-game | score branch merged |
| 6 Provenance | PASS — code-drawn only, OFL fonts vendored w/ licenses, no em-dashes, two-currency law held | inline checks |
| 7 QA sweep | 2 MAJOR (fill; ENTER-destroys-save) + 4 minor — ALL FIXED in the fix round | step7-qa/ |
| 8 Deploy verify | PENDING — at publish |
| 9 Ray | PENDING — play + ear; seed rulings owed: credits content, scorecard key listing; taste: draft-card generic icons |

Fix round: docs/handoffs/RELEASE-FIX-ROUND-2026-08-15.md → LANE-REPORT-RELEASE-FIXROUND-20260815.md (10/10 items, mutation-proven where named).

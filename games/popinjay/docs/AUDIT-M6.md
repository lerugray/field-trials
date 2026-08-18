# AUDIT — M6 (Genre-completeness + QoL)

Per DESIGN-SEED §Milestones M6: *"Enumerate arcade + roguelite table-stakes (options
incl. the full accessibility floor; run history + best-score table; daily seed as
land-or-defer-with-reason; pause/help/controls on one screen), audit the build, land or
defer-with-reason each."* This is that enumeration. Each item is **LANDED** (with where)
or **DEFERRED** (with a reason). Dated 2026-08-10.

The accessibility floor is *built per-milestone, audited M6* (DESIGN-SEED §Accessibility)
— so much of it landed across M0–M5; this audit confirms each and closes the cheap gaps.

## Arcade table-stakes
| Item | Status | Where / reason |
|---|---|---|
| Pause everywhere | ✅ LANDED | P/Esc anywhere in play; drafts/tour-map/scorecard are untimed screens |
| Help + controls on one screen | ✅ LANDED | Pause menu (M6 inc2): full controls listing + actions; title card also lists controls |
| Restart / quit-to-title | ✅ LANDED | Pause → Q quits to title (autosaves → R resumes); scorecard → Enter new run |
| Options screen | ✅ LANDED | M6 inc1: title O / pause O |
| Best-score table (top-10, seed shown) | ✅ LANDED | M4 inc9; title top-5 |
| Score / two-currency separation | ✅ LANDED | M3 (score) + M4 (tickets) |

## Roguelite table-stakes
| Item | Status | Where / reason |
|---|---|---|
| Run history (recent runs, causal) | ✅ LANDED | M6 inc3: title RECENT RUNS; **also fixed a real bug — death runs never recorded score/bank/history** |
| Seed entry + sharing | ✅ LANDED | M4 inc9: title seed entry; seed shown on card + scorecard |
| Curated meta progression (the Trunk) | ✅ LANDED | M4 inc15: owned pool + ticket bank + unlocks |
| Next-unlock hook | ✅ LANDED | M5 inc8: scorecard next-unlock progress bar |
| **Daily seed** | ⏸️ DEFERRED | The seed itself lists this as *land-or-defer-with-reason M6*. Deferred: a true daily needs a trusted date→seed source + a per-day leaderboard scope beyond v1; seed **entry + sharing already give full reproducibility** (any seed is re-enterable). Land at M6-follow-up or post-STOP if the operator wants a daily rotation. |

## Accessibility floor (DESIGN-SEED §Accessibility)
| Item | Status | Where / reason |
|---|---|---|
| Flash-reduce toggle | ✅ LANDED | M6 inc1; damps confetti + the gold chain-flash (effects.calm) |
| i-frame outline-pulse (not flicker) | ✅ LANDED | M3 inc1; **+ accelerating end-warning** added M6 inc5 |
| Reduce-motion umbrella + prefers-reduced-motion at boot | ✅ LANDED | M6 inc1 (honored on first boot) |
| Global game-speed scale (80/90/100%) | ✅ LANDED | M6 inc1 (accumulator scale; never a gate) |
| Composure count (3/4/5) | ✅ LANDED | M6 inc4 |
| Par off | ✅ LANDED | M6 inc4 |
| Master + SFX volume (the music/SFX split) | ✅ LANDED | M5 inc5 / M6 inc1 (SFX level relative to music) |
| Par escalation always visible (dial state) | ✅ LANDED | M1 HUD; state flip, never audio-only |
| Chain window always visible (meter) | ✅ LANDED | M1 HUD |
| Drip always telegraphed before entry | ✅ LANDED | M2 inc5 |
| Colorblind-safe (class/variant/drop by shape) | ✅ LANDED | verified by the M5 inc6 CVD sim (shapes distinct under all 3 CVD types) |
| Composite photosensitivity ≤3/sec | ✅ LANDED | M5 inc6 analysis: 0.00/s |
| Assists adjustable from pause mid-run | ✅ LANDED | options reachable from pause; live for audio/speed/flash/motion/par-off (composure applies next stage — noted) |
| Plain numbers / no raw IDs on screen | ✅ LANDED | M5 inc8 (scorecard display names); all readouts numeric-legible |
| **Full key remapping** | ⏸️ DEFERRED | A remap-capture UI + persisted keymap is a bounded but sizeable surface; the fixed scheme is one-handed-feasible and printed on the title + pause. Land as a focused follow-up. |
| **Balloon-speed scale** | ⏸️ DEFERRED | **Periodicity law (signature #1):** scaling a balloon's hspeed changes its exact integer bounce period — "parabolas are promises" would break unless every class's period is re-derived per scale. A real design change; game-speed already gives a global slow-down that preserves periodicity. Deferred with cause. |
| **Finale-target scaling** | ⏸️ DEFERRED | A finale-clock scalar; small but touches the finale win/baseline probe. Land as a follow-up alongside a re-run of the finale baseline gate. |
| One-handed preset | ⏸️ DEFERRED | Walk + fire are **already reachable one-handed** (arrows + Space, or the level-triggered fire). A named preset that also remaps climb is deferred with remapping. |
| Hold-vs-toggle fire | ⏸️ PARTIAL | Fire is **level-triggered today (hold-to-fire is the default)**; the world's single-slot commitment rate-limits it. A toggle (single-press) mode for players who dislike auto-repeat is deferred. |
| Ladder-latch option | ⏸️ DEFERRED | Minor comfort; deferred with remapping/preset work. |
| Text-size floor + plain-type toggle | ⏸️ PARTIAL | Type is legible system-serif at readable sizes and numbers are plain; a user text-SIZE slider is deferred. |
| Standard/Comfort first-boot preset | ⏸️ DEFERRED | prefers-reduced-motion is honored at boot; a one-tap Standard/Comfort picker is deferred (the individual toggles are all present in options). |
| Screen-shake bounded + toggleable | ➖ N/A | The build has **no screen shake** (pop effects are localized fading rings by design); nothing to bound or toggle. |

## Verdict
Every table-stakes item is accounted for: the high-value gaps are **landed** (options,
pause/help/controls, run history + the death-record fix, flash-reduce, reduce-motion,
game-speed, composure, par-off, the i-frame end-warning), the already-built floor is
**confirmed**, and the expensive or law-constrained items are **deferred with a reason**
(remapping, balloon-speed [periodicity], finale-scaling, daily seed, presets, text-size).
No silent gaps. The deferrals are the operator's to ratify or pull forward.

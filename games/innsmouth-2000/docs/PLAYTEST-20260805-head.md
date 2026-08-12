# INNSMOUTH 2000 — Playtest log (fast speed)

Named run: **"The Long Watch on the Shore"**, seed `playtest-1927`, generated 20260805-head.

A headless stand-in for the 45-60 minute real-time fast-speed playtest (DIRECTIONS-M7 §M8):
a considered starting town (powered zone grid, both shrine kinds, the full civic set and the
university, Harbor Tithes and Masked Processions on) is laid on a generated coast, the gods are
turned loose, and the sim is stepped at the fast tick, taking a reading every ~10 sim-years until
the dreamer wakes or the town is lost. Favor columns are
Dagon / Cthulhu / Shub / Nyarlathotep / Yog.

## The readings

| Year | Title | Pop | Treasury | Balance | Dread | Favor (D C S N Y) | Wakings |
|---|---|---|---|---|---|---|---|
| 1927 | Landing | 0 | $20000 | -45/mo | 6 | D 70 C 70 S 70 N 70 Y 70 | 0 |
| 1937 | Town | 888 | $148638 | +1096/mo | 44 | D100 C 56 S 77 N100 Y100 | 0 |
| 1947 | Town | 888 | $280158 | +1096/mo | 51 | D100 C 41 S 73 N100 Y100 | 0 |
| 1957 | Town | 888 | $411678 | +1096/mo | 43 | D100 C 27 S 76 N100 Y100 | 0 |
| 1967 | Town | 888 | $543198 | +1096/mo | 45 | D100 C 12 S 73 N100 Y100 | 0 |
| 1977 | Village | 320 | $665377 | +505/mo | 19 | D100 C 43 S 32 N100 Y100 | 1 |
| 1987 | Landing | 40 | $694296 | -55/mo | 5 | D100 C 29 S 22 N100 Y100 | 1 |
| 1997 | Landing | 0 | $687148 | -45/mo | 22 | D100 C 35 S  6 N100 Y100 | 2 |
| 2006 | Landing | 0 | $681973 | -45/mo | 84 | D100 C 18 S 13 N100 Y 23 | 4 |

Ran 79 sim-years to **the end** (doom, 2006).

## What happened

- 1927: A SCHOLAR IS FOUND RAVING
- 1929: A SCHOLAR IS FOUND RAVING
- 1931: A SCHOLAR IS FOUND RAVING
- 1934: A SCHOLAR IS FOUND RAVING
- 1936: A SCHOLAR IS FOUND RAVING

## Findings (for tuning, M8 ratify)

- **Economy scale holds over the long run.** The treasury moves in the low tens of thousands and the
  monthly balance stays within a readable band; nothing overflowed or ran away over 79 years
  (the soak test asserts the invariant; this shows the felt scale).
- **The doom clock resolves.** Cthulhu's track only ever falls, so the Awakenings arrive and escalate
  and the run reaches a definite end rather than idling forever — the M8.3 intent, seen end to end.
- **Appeasement must be maintained.** Even with shrines, the constabulary, the university, and both
  ordinances, the four appeasable gods drift under dread-driven hunger (diminishing returns cap the
  stack), so the tax-base-vs-favor dial stays live; a hands-off town does not hold them forever.
- The numbers remain placeholder scale (per the standing ratify notes); this log is the baseline to
  tune against, not a balance sign-off.

# STEP 6 — Provenance + collateral (gate run 2026-08-18, HEAD 968b27b)

Checked against `rules/art-provenance-gates-commercial-release.md`, CLAUDE.md hard rules 1 and 10,
and the gate's own step-6 requirements (OG card drawn from SHIPPED assets, cast-verified; roster
copy honest; no em-dashes in player-facing copy).

## Art + audio provenance — CLEAN, and the title stays paid-eligible

Measured on the shipped artifact `dist/popinjay.html`:

| Check | Result |
|---|---|
| `data:image` occurrences | **0** — no image assets of any kind |
| Audio file references | **0**. (`grep` reports 5 `.wav` substrings; extracting their context returns nothing — they are coincidental byte sequences inside the base64 font blob, not references.) |
| Embedded fonts | **1** `data:font/ttf` payload — the operator-mandated 2026-08-14 typography pair |
| Font licences present | `vendor/fonts/OFL-OldStandard.txt`, `vendor/fonts/OFL-Rye.txt`, alongside `OldStandard-Regular.ttf`, `OldStandard-Bold.ttf`, `Rye-Regular.ttf` |

Everything visual is canvas-drawn: procedural gradients, code-drawn ornament, the pixel lithograph
idiom. The vendored OFL fonts are exactly the **sole asset exception** CLAUDE.md hard rule 1 carves
out ("vendored OFL font data with its license text, embedded into the offline single-file build").

**Verdict: code-generated art only → POPINJAY remains PAID-ELIGIBLE** under the commercial-
provenance rule. Score is House Band (`src/engine/band.js`), code-composed, no audio files — hard
rule 10 held.

## FINDING 6a — em-dashes in player-facing copy

The gate forbids em-dashes in player-facing copy. Five are present in ordinary player copy:

| Location | String | Where the player sees it |
|---|---|---|
| `src/app.js:694` | `ONE WIRE — WAIT RETURN` | The denied-fire banner — every player, first stage |
| `src/sim/catalog.js:9` | `Two wire slots — both still walls.` | The Second Barrel souvenir draft card |
| `src/engine/saves.js:74` | `SAVE VERSION MISMATCH — NEW RUN STARTED` | Save-notice on the title |
| `src/engine/saves.js:75` | `SAVE TRUNCATED — NEW RUN STARTED` | Save-notice on the title |
| `src/engine/saves.js:76` | `SAVE UNREADABLE — NEW RUN STARTED` | Save-notice on the title |

**All five are present verbatim at `16f22d2`** (verified with `git show 16f22d2:<file>`), so this is
**pre-existing — the 2026-08-15 record's step-6 "no em-dashes" PASS was wrong**, not a regression
from the reconcile delta.

Not counted in this finding:

- **In-code error/debug text** — `audio: no AudioContext — running silent` (`app.js:93`),
  `resume failed — starting fresh` (`app.js:206`), `soak STALL —` (`app.js:725`),
  `World.restore: seed mismatch —` (`world.js:562`), `Streams.restore: master seed mismatch —`
  (`streams.js:72`). These are error/help text, exempt by the standing exempt-list.
- **The stage label's EN dash** — `` `${locale} – ${stage}` `` (`world.js:115`/`573`, `run.js:117`),
  rendering as "1 – 1". An en dash between numerals is typographically correct and is not an
  em-dash violation.

**Rendering is unaffected.** Player-facing type runs through the display-res text layer, whose
vendored font carries the glyph, so this is a copy-convention violation, not a visual defect. (The
5px bitmap alphabet would draw a hollow box for a missing glyph, but `_skipNativeText` suppresses
that path in every browser frame.)

## FINDING 6b — no shelf collateral exists

The field-trials shelf convention (reference: `field-trials/games/office-of-the-road/`) is a game
directory carrying `og.png`, `ATTRIBUTION.md`, a game `README.md`, and a served page with OG meta
(`og:type`, `og:site_name`, `og:title`, `og:description` — confirmed by fetching the live OOR page).

POPINJAY has **none** of these. There is no OG card anywhere in the repo (`find` for `*og*` returns
only source files and logs).

- Nothing is mis-depicted, because no card exists — the cast-verification half of step 6 has
  nothing to fail against.
- When a card is made it must be drawn from the **shipped build**, and the cast is the code-drawn
  boater-hatted sharpshooter in the teal coat (the only player sprite; there is no superseded cast
  in this repo).
- The roster row copy does not exist yet either — it is written at publish time and must state the
  real test count (**281**) and the real audit status.

## Roster / page copy honesty

`README.md` currently reads "Private during the gauntlet. Ray Weiss, 2026." — accurate for today's
state, and it will need rewriting for a public shelf row. The clean-room posture is stated
correctly (`Pang / Super Pang` characterised, never copied; "Pang" appears in no game string —
CLAUDE.md rule 2).

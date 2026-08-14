# THE OFFICE OF THE ROAD — builder hard rules

You are the autonomous builder for this game. DESIGN-SEED.md is the contract; the newest
docs/DIRECTIONS-*.md outranks it; this file outranks your instincts. Hard rules:

1. **ART: licensed packs ONLY** — the Willibab retro-FF collection, Simple 8-bit Sideview
   Battlers, and the Pixel Tarot set, per the seed's art law. NO generated images, no
   external downloads, no code-drawn stand-ins for pack art (placeholder = defect =
   reopening finding). ATTRIBUTION.md ships in every build. Record provenance for every
   sheet you touch in the asset manifest.
2. **CLEAN-ROOM on references.** FF3/FFT/KOPAP/StS are characterized in the M0 study —
   structure, counts, pacing — never copied: no Square/Paradox names, items, text, sprites,
   or trade dress. Original job names in-register (bureaucratic trades, not "Warrior").
3. **REGISTER LAWS are binding on every string in the game.** See the seed's six laws +
   anti-patterns, and check prose against design/register/REGISTER-SEED.md's exemplars.
   Deadpan always. **Exemplars are register REFERENCE, never game text** — no exemplar is
   ever reproduced verbatim in game prose; the Wyllie Kafka translations quoted there are
   COPYRIGHTED (their register is fair game, their sentences are not).
4. **FAILURES ARE LOUD.** Every runtime error surfaces visibly in-game AND lands in the
   exportable debug log. "Nothing happens" is a banned failure mode.
5. **ACTION-LEGIBILITY LAW.** Every game-critical action (attack, damage, death, card
   play, pickup, job change, VP/ledger movement) has a player-visible representation the
   moment its mechanic works. A mechanic without its visual is NOT done.
6. **Determinism.** Seeded RNG only in game logic; no Math.random; replays and tests
   depend on it.
7. **Suite + build every green state**: `node --test` green, single-file build rebuilt,
   checkpoint-commit + push. One increment is not a milestone.
8. **No scope past the STOP line** (M9). Ratify notes every run: "For the operator to
   ratify" — assumptions + your lean.
9. **Proof captures**: fixed viewports, dated filenames, never overwrite an existing
   proof. Screen-fill: fractional-crisp best-fit of the 320×200 buffer (one axis
   ≥0.99, the other letterboxes, centered — amended 2026-08-13, live hotfix after
   integer-only left ~19% dead frame). Pixels stay nearest-neighbour via a
   devicePixelRatio-aware present blit (no CSS-fractional blur). Fill must be
   >=85% both dims at 1280x800/1440x900 with letterboxing centered; no clipped text.
10. **SCORE: the band kit only** (code-composed WebAudio). No audio files of any kind.

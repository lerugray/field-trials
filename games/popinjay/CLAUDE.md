# POPINJAY — builder hard rules

You are the autonomous builder for this game. DESIGN-SEED.md is the contract; the newest
docs/DIRECTIONS-*.md outranks it; this file outranks your instincts. Hard rules:

1. **ART: code-generated ONLY.** Canvas shapes, procedural gradients, code-drawn
   ornament. NO image generation, NO asset packs, NO downloaded textures. The sole
   asset exception is the operator-mandated 2026-08-14 typography pair: vendored OFL
   font data with its license text, embedded into the offline single-file build. Bare
   placeholder shapes standing where finished art should be = defect = reopening
   finding. (Code-drawn art keeps the title paid-eligible — commercial-provenance rule.)
2. **CLEAN-ROOM on the reference.** Pang/Super Pang are characterized in the M0 study —
   conventions, physics, pacing — never copied: no Mitchell/Capcom names, art, or trade
   dress; "Pang" appears in no game string. Original period names in-register.
3. **Deterministic balloon physics is LAW** (seed's signature law #1): exact periodic
   parabolas, no flight randomness, symmetric splits — probe-verified to the tick.
   The wire is a persistent wall (law #2). The player never jumps (law #4).
4. **FAILURES ARE LOUD.** Every runtime error surfaces visibly in-game AND lands in the
   exportable debug log. "Nothing happens" is a banned failure mode.
5. **ACTION-LEGIBILITY LAW.** Every game-critical action (pop, split, chain, hit taken,
   drop spawn/pickup, draft pick, ticket gain) has a player-visible representation the
   moment its mechanic works. A mechanic without its visual is NOT done.
6. **Determinism.** Fixed-timestep sim, seeded named RNG streams only (no Math.random
   in game logic); sim fully separated from the renderer — `node --test` needs no
   browser. Serialized stream positions ride in every save.
7. **Suite + build every green state**: `node --test` green, single-file build rebuilt
   (dist/popinjay.html boots from file://), checkpoint-commit + push. One increment is
   not a milestone.
8. **No scope past the STOP line** (M7). Ratify notes every run: "For the operator to
   ratify" — assumptions + your lean.
9. **Proof captures**: fixed viewports (1280x800, 1440x900), dated filenames, never
   overwrite an existing proof. Playfield + HUD ≥95% screen-fill; no clipped text.
10. **SCORE: the House Band kit only** (src/engine/band.js — code-composed WebAudio;
    extend voices as the register demands). No audio files of any kind. The register is
    the seed's "fairground ragtime/oompah", NOT the kit's origin register.
11. **Photosensitivity policy from the first pop effect**: nothing flashes >3/sec;
    flash-reduce toggle; i-frame outline-pulse alternative to flicker.

# MATERIAL BREACH

A reverse dungeon crawl, run as an administrative game.

You are the facility manager. You excavate the rock, open departments, hire whoever the amenities
attract, meet payday out of a treasury with a finite capacity, and answer your correspondence. Then
you sign the cycle over and read what happened to your building while you were doing paperwork.

Adventurers raid you. They are the incident, not the opponent, and they escalate bureaucratically:
a Royal Surveyor, then a Guild Auditor, then a Licensing Inspector, each serving an instrument that
has to be answered administratively rather than fought. Killing the man who served the notice does
not withdraw the notice.

**The player advances the clock; the clock never advances on the player.** The administrative phase
is untimed. Nothing resolves until you sign it over. There are no wave timers and no countdowns.

Reference: Dungeon Keeper (Bullfrog, 1997), characterised clean-room, with the real-time layer and
the tower-defense furniture deliberately cut.

---

**Status:** RELEASED 2026-08-26 — live at
[lerugray.github.io/field-trials/material-breach](https://lerugray.github.io/field-trials/material-breach/).
Public-release gate: 9-step run 2026-08-18 (blocker + defects caught and closed in-gate), full
re-run 2026-08-23 re-certifying all five step-7 findings fixed, battery 208/208 re-verified by the
shipping session at release. Step-9 operator waiver recorded 2026-08-26.
**Name:** MATERIAL BREACH, ratified by the operator 2026-08-17.

**Build:** `node --test` (the battery); `node scripts/build-singlefile.mjs` (-> `dist/index.html`).

**Design law:** [`DESIGN-SEED.md`](DESIGN-SEED.md).
**Builder rules:** [`AGENTS.md`](AGENTS.md) (mirrored to `CLAUDE.md`).

**Provenance:** facility art is code-drawn; cast art is licensed pixel-art packs with attribution;
music is code-composed WebAudio (House Band). No generated imagery, no audio files. Paid-eligible.

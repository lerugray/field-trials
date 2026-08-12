# AUDIT-M9 — genre-completeness + QoL gate

DESIGN-SEED M9 is the audit gate, not a build-fresh milestone: *"Enumerate and audit
the rail-shooter table stakes against the build ... Land every gap found or defer each
with a named reason — no silent gaps."* This document is the prose reading of the
machine-checkable manifest in `src/audit/genre.js`, kept honest by `test/genre.test.js`
(every `built` stake must point at a module that exists on disk; every `deferred` stake
must carry a reason and a milestone/cut). If a shipped feature's module is ever deleted
or a deferral loses its reason, the suite goes red.

## Verdict

The rail-shooter table stakes are **all present**. Everything the genre expects either
shipped across M2–M8 or is a **named DESIGN-SEED cut**. M9 itself adds the three QoL
deliverables that were correctly deferred to this milestone (input remapping, the
legibility floor, and the music bed) plus this audit. No silent gaps.

## Built — the table stakes, and where they live

| Stake | Where | Milestone |
|-------|-------|-----------|
| On-rails flight, steering + banking | `flight/rail.js`, `flight/flight.js` | M2 |
| Brake/boost meter | `flight/flight.js`, `ui/hud.js` | M2 |
| Dodgeable obstacles | `flight/obstacles.js` | M2 |
| Twin-blaster fire + convergence | `combat/weapons.js`, `combat/projectiles.js` | M3 |
| Charge-shot lock-on | `combat/lockon.js` | M3 |
| Barrel-roll deflection | `combat/barrelroll.js` | M3 |
| Enemy waves that shoot back | `combat/enemies.js`, `combat/player.js` | M3 |
| Explosions / hit feedback | `combat/explosions.js` | M3 |
| Damage + cause-of-death attribution | `combat/player.js` | M3 |
| Sector themes | `world/sectors.js` | M4 |
| Procedural level from a grammar | `world/grammar.js`, `world/level.js` | M4 |
| Rescue/pickup breathers | `combat/pickups.js` | M4 |
| Branching route map + medal-pace gate | `run/route.js`, `run/medals.js` | M5 |
| Score + per-level medals | `run/medals.js` | M5 |
| One-currency hub economy + sink | `economy/ledger.js`, `economy/upgrades.js` | M6 |
| Permanent flight-log archive | `economy/ledger.js` | M6 |
| Memorial-cast portraits + barks | `gfx/portraits.js`, `run/hubvoice.js`, `run/briefing.js` | M6 |
| Wingmates: chatter, support, distress/rescue | `run/wingmates.js`, `run/wingvoice.js`, `run/distress.js` | M7 |
| Mid-run loadout / boon pick | `run/loadout.js` | M7 |
| Boss with telegraphs + phases + fair lane | `combat/boss.js` | M8 |
| Pause / mute / reduced-motion / FOV / invert-Y | `core/settings.js`, `ui/menu.js` | M2 |
| **Keyboard remapping + deadzone option** | `input/bindings.js`, `ui/menu.js` | **M9** |
| **HUD legibility floor (as tests)** | `ui/legibility.js` | **M9** |
| **Music bed: loop, mute, bed volume, per-phase** | `audio/music.js` | **M9** |
| Code-generated UI blips | `audio/bus.js` | M2 |

## Deferred — every gap with a named reason (no silent gaps)

- **Bark blips + portrait wiggle → M10.** Every bark already ships as an on-screen
  caption, which is exactly the *visual equivalent* the accessibility law requires, so
  nothing is inaccessible today. The scrambled-speech blip paired with portrait wiggle
  is ambient living-world flavor — M10 scope (hub idle animation, hangar chatter).
  Landing it here would pull M10 forward, not close an M9 gap.
- **All-range normal levels → named cut.** DESIGN-SEED streamline law: all-range flight
  never appears in regular levels. Rail-only is the whole game.
- **All-range boss → named cut (stretch).** Stretch-only, cut on the first sign of
  camera/control instability. The required rail boss shipped in M8; no free-flight
  camera was ever introduced, so the stretch stayed closed. Reopen only via DIRECTIONS.
- **Live AI wingmate combat → named cut.** A second combatant AI is a genuine scope
  cliff, deferred past the stop line. v1 wingmate involvement (distress/rescue + passive
  support) shipped in M7.
- **Alternate vehicle set-pieces → named cut.** Anti-scope boundary in the seed.
- **Somersault / U-turn → named cut.** Ships only if all-range survives naturally, and
  it is not otherwise required. All-range was not opened, so it stays cut.

## The QoL / accessibility floor, verified

Everything the accessibility law promised from M2 is present and now audited **as
tests**, not just by eye:

- **Options menu** covers reduced-motion, master mute, FOV (lock + value), invert-Y,
  **stick deadzone**, **music volume**, and **full keyboard remapping** with a
  reset-to-defaults — all plainly labeled, keyboard/mouse/pad navigable
  (`ui/menu.js`, `input/bindings.js`, `core/settings.js`).
- **Legibility floor** (`test/legibility.test.js`): every HUD ink clears WCAG AA
  contrast over its dark drop shadow; no HUD glyph is under the 11px min (two 10px combat
  labels were bumped to 11px — a gap found and landed); no stateful cue is color-only
  (a manifest of lock/deflect/hull/boss/wing/medal states, each pairing color with a
  shape/icon/text/count); the flash-intensity cap (0.34) is enforced across every flash
  source; and the key HUD elements fit the narrowest proof viewport (no clipped text).
- **Music** honours master mute (silences the bed) and sits under barks/SFX at a bed
  ceiling; the operator's three Abel Aeolian tracks play per run phase.

Standing QA harness unchanged and green: fairness harness, currency-integrity fuzz,
wingmate-death lifecycle test, boss winnability/fairness — all still pass alongside the
new genre/legibility/bindings/music suites.

# STUDY — Mechanical Inventory for ADVERSARY

Digest of `materials/reference/ZOMBIE-HUNTER-STUDY-2026-08-03.md` (the ZH study, hereafter
**the study**) into a build-facing mechanical inventory, plus the M1 combat-gap closure by
**labeled re-derivation** and the **numeric feel table** the sim is tested against from M1 on.

All `§` citations point at sections of the study. Where the study observed a value live, it is
tagged **[OBSERVED]**; where the value is inferred from the study's own tables or
StrategyWiki-class documentation, **[DOC]**; where ADVERSARY sets a number the source never
revealed, **[RE-DERIVED]** with the reasoning shown. ADVERSARY is original IP — these numbers are
*our* tuning targets informed by the reference's shape, not extracted constants.

---

## 1. Structural spine (what we keep)

| Element | Source finding | Cite | ADVERSARY transposition |
|---|---|---|---|
| Genre | Side-scrolling action-RPG, real-time combat weighted by RPG stats | §3.1, §3.4.1 | Kept — the signature |
| Stages | Six stages; middle four offer a left/right path choice | §2.6, §3.4.2 | Kept (M6/M7 branch structure) |
| Progression | XP → levels; max level single-digit (compact 1987 RPG) | §1.5, §2.5 | Kept, retuned curve (M2) |
| Action menu | Start → Items / Weapons / Equipment / Strength; pauses play | §2.6 | Kept; menu PAUSES, sub-weapon fires real-time (DESIGN-SEED) |
| Economy | Enemies drop gold + occasional items; gold buys gear/consumables in town | §3.2 | Kept; gold NEVER at risk on death (Souls split) |
| Gating | Gear gates areas as much as keys/light do | §1.5, §3.3, §3.4.2 | Kept as exploration verbs (M6) |
| No-continue death | No battery/password/continue; death = game over | §3.1, §3.3 | **DROPPED** → Souls checkpoint loop (§3.4.3, DESIGN-SEED) |
| Opaque gear | No in-game stat comparison | §3.3, §3.4.4 | **FIXED** → equip-delta UI (M2) |
| Stiff movement | Era-bound stiffness, low jump precision | §3.3, §3.4.5 | **FIXED** → responsive arc (feel table §4) |

## 2. Verified numeric anchors (the live RAM oracle)

The study's dynamic probes pinned a stat cluster at CPU WRAM `$00C0-$00CA` and read the Strength
screen as a live oracle (§2.3, §2.5). These are the *only* first-party numeric anchors we have;
ADVERSARY's economy is built to *feel* consistent with them, not to copy them.

| Stat | Level-0 value | Cite | Tag |
|---|---|---|---|
| Level | 0 | §2.3 | [OBSERVED] |
| Max Power (HP) | 37 | §2.3, §2.5 | [OBSERVED] |
| Strength (offense) | 14 | §2.3 | [OBSERVED] |
| Defence | 5 | §2.3 | [OBSERVED] |
| Magic | 14 | §2.3 | [OBSERVED] |
| Energy | 5 | §2.3 | [OBSERVED] |
| Gold (start) | 30 | §2.3 | [OBSERVED] |
| XP to reach L1 ("Next Lev") | 50 | §2.5 | [OBSERVED] |

Current-XP address was never found (§2.3, §4). Full per-level curve beyond L1 is StrategyWiki-class
**[DOC]**, not first-party — M2 sets ADVERSARY's own curve and cites this row as its anchor.

## 3. Combat gap closure — labeled RE-DERIVATION (M1 deliverable)

The study reached combat only from operator savestates and left the core loop **unobserved**
(§2.4, §5.5). What it *did* pin, and how ADVERSARY re-derives the rest:

**[OBSERVED] contact-damage facts (§5.3):**
- Single standing enemy dealt a **flat 2 HP** per hit, six independent events, input-independent
  (idle / moving / mashing all identical) — the enemy attacks autonomously on contact/proximity.
- A tougher two-enemy encounter dealt a **flat 5 HP** per hit.
- HP (`$00C2`) is an **unsigned, floor-clamped** counter (2→0, never negative) (§5.3).
- Death renders flavor text ("GET A HOLD OF YOURSELF" → "YOU HAVE DIED"), then unprobed (§5.4).

**[NOT OBSERVED], re-derived by ADVERSARY:**
- **Damage direction (player→enemy):** never confirmed the source's A/B inflict damage (§5.3, §5.5).
  RE-DERIVED: ADVERSARY damage = `max(1, attackPower + weaponBase − targetDefence)` with a small
  variance band, floor-clamped like the source's HP counter. Fixed-per-enemy contact damage (the
  source's -2 / -5 pattern) is modeled as an enemy's `contactDamage` field, kept flat per enemy type
  to honor the observed behavior.
- **i-frames / invulnerability:** the study explicitly could not separate player i-frames from enemy
  attack cadence (§5.3, §5.5). RE-DERIVED as an explicit design number (§4): hit-stun invuln and the
  dodge's short i-frame step are ADVERSARY inventions, not source recoveries.
- **Knockback:** unobserved (§2.4). RE-DERIVED as a short horizontal impulse on hit (§4).
- **Enemy HP / drop / XP payout:** no enemy-side HP byte found; +3 gold in one state hinted at a
  payout (§5.2 `_8`, §5.3). RE-DERIVED: enemies carry `hp`, `xp`, `gold` fields; the +3-gold hint is
  directional support only.

Every combat number ADVERSARY ships is therefore **our** number. The source constrains *shape*
(flat contact damage, floor-clamped HP, gold payout on kill); it does not supply the formula.

## 4. NUMERIC FEEL TABLE — [RE-DERIVED] (the tested contract)

The sim runs a **fixed 60 Hz timestep** (one tick = 1/60 s, matching NES NMI cadence). Logical
resolution is **256×240** (NES-native, "240p-ish"). One tile = **16 px**. All feel constants live in
`src/config/feel.js` and are asserted by `test/feel.test.js` — changing a number without changing
its test is a defect. These are ADVERSARY tuning targets that *fix* the source's era-bound stiffness
(§3.3, §3.4.5); the source revealed no movement constants, so all of §4 is RE-DERIVED.

### 4.1 Locomotion

| Constant | Value | Derivation |
|---|---|---|
| `TICK_HZ` | 60 | NES NMI cadence; fixed timestep |
| `TILE` | 16 px | NES tile |
| `WALK_SPEED` | 1.5 px/tick (90 px/s) | Readable chunky pace; ~5.6 tiles/s |
| `GRAVITY` | 0.375 px/tick² | Chosen so the jump apex and airtime below come out clean |
| `JUMP_VELOCITY` | 6.0 px/tick | Initial upward speed |
| `JUMP_APEX` | 48 px (3 tiles) | `v²/(2g) = 36/0.75 = 48` — derived, asserted |
| `JUMP_TIME_TO_APEX` | 16 ticks (0.27 s) | `v/g = 6.0/0.375 = 16` — derived, asserted |
| `JUMP_AIRTIME` | 32 ticks (0.53 s) | 2× time-to-apex on flat ground |
| `TERMINAL_FALL` | 8.0 px/tick | Fall-speed cap for control |
| `COYOTE_TICKS` | 6 | Grace to jump just after leaving a ledge |
| `JUMP_BUFFER_TICKS` | 6 | Grace to buffer a jump just before landing |

### 4.2 Combat & defense windows

| Constant | Value | Derivation |
|---|---|---|
| `HITSTUN_IFRAME_TICKS` | 30 (0.5 s) | Standard post-hit invuln flash; separates hits cleanly |
| `KNOCKBACK_IMPULSE` | 3.0 px/tick | Short horizontal shove on hit, decays with friction |
| `KNOCKBACK_DECAY` | 0.80 /tick | Multiplicative friction on knockback velocity |
| `DODGE_IFRAME_TICKS` | 8 (0.13 s) | SHORT i-frames — "a step, not roll spam" (DESIGN-SEED) |
| `DODGE_DISTANCE` | 24 px | A step (1.5 tiles) over the dodge duration |
| `DODGE_DURATION_TICKS` | 8 | Dodge lasts exactly its i-frame window |
| `DODGE_COOLDOWN_TICKS` | 20 | Prevents dodge-spam |

### 4.3 Input leniency windows

| Constant | Value | Derivation |
|---|---|---|
| `DOUBLE_TAP_TICKS` | 12 (0.2 s) | Max gap between two d-pad taps to trigger dodge |
| `CHARGE_FULL_TICKS` | 24 (0.4 s) | Hold time for a full charged strike |
| `CHARGE_MIN_TICKS` | 6 (0.1 s) | Below this a press is a normal strike, not a charge |
| `INPUT_REPEAT_DELAY_TICKS` | 16 | Menu auto-repeat initial delay |
| `INPUT_REPEAT_RATE_TICKS` | 6 | Menu auto-repeat interval after the delay |

These windows are the acceptance contract for M2+ (movement/combat) and are regression-tested from
M1 forward so later tuning can never silently drift them.

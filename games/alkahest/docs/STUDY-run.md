# STUDY — the run: the Magnum Opus, formulae, the athanor (clean-room characterization)

Third companion, after STUDY-machine.md and STUDY-duel.md. Characterizes the
MECHANICS of the run layer — a four-act ladder of bouts, a between-bout drafting
economy, a charge gauge feeding castable effects, and per-act physics — so
ALKAHEST can rebuild them independently. The reference contributes only the
puzzle-battler machine (STUDY-machine, STUDY-duel); the RUN structure here is
ALKAHEST's OWN invention within the DESIGN-SEED contract. Values marked TUNE are
ALKAHEST targets; the SHAPE (what must be true for the loop to work) is what is
being pinned. Nothing here names or reproduces any character, theme, title, art,
or sound of the reference.

The ALKAHEST run engine (`src/acts.js`, `src/formulae.js`, `src/run.js`, plus the
athanor + active hooks in `src/machine.js`) is written against THIS document and
its named fixtures.

---

## 1. The Magnum Opus — the act ladder

- A **RUN** is one attempt at the Great Work: four acts in fixed order —
  **NIGREDO, ALBEDO, CITRINITAS, RUBEDO** — each a short ladder of bouts against
  rival alembics (the AI of STUDY-duel §5). Clearing all four = the run is WON
  (the opus completes). Losing any bout = the work is RUINED, the run ends
  (single-elimination, DESIGN-SEED; no meta-unlock wall — a fresh run is the whole
  game).
- **Bout schedule** (TUNE; the SHAPE is "2-3 bouts per act, the last is the act's
  signature rival"): three bouts per act — two lesser alembics, then the act's
  **master** with a signature dross pattern and named formulae. Twelve bouts to
  complete the opus.
- **Rival skill rises across the ladder** (STUDY-duel skill knob): bout index
  `g` (0-based, 0..11) maps to skill on a curve from the mercy floor to near-1 at
  the Rubedo master. The exact curve is TUNE; the SHAPE is monotonic non-decreasing.
- **Mercy law** (studio amendment): act 1 bout 1 is explicitly gentled — slower
  rise and a lower-skill rival than the curve alone would give. First-session
  failure is safe by design. Fixture: `mercyFirstBout`.
- **Parity of power** (studio amendment): rival power and player power grow on the
  SAME axis — machine skill plus formulae. A curve test samples each act boundary
  and asserts the rival's configured skill sits within a sane band of the ladder
  curve (no difficulty cliff). Fixture: `ladderCurveMonotone`.

## 2. The Weiss amendment — per-act physics (register is PHYSICS, not paint)

Each act changes exactly ONE rule of the machine, felt in the hands, taught by the
act's first bout. Builder tunes values, keeps the shape. An **act profile** is a
plain config consumed by `Machine`; `src/acts.js` owns the four profiles and the
one behavioral hook each needs beyond config.

- **NIGREDO — the dark, dense stage: heavier gravity, slower falls.** Panels fall
  SLOWER (a longer `fallInterval`) — the dense, sluggish opening. Pure config.
  Fixture: `nigredoSlowFall`.
- **ALBEDO — volatile clears: dissolutions can sublimate one adjacent panel.**
  When a clear resolves, ONE idle live panel orthogonally adjacent to the cleared
  group is also removed (sublimated) — a small bonus dissolution that can open new
  matches. Deterministic pick (lowest, then leftmost adjacent idle panel). It does
  NOT itself carry the chain tag (it is collateral, not a transmute); the collapse
  that follows may still form a natural chained match. Behavioral hook:
  `sublimateAdjacent`. Fixture: `albedoSublimate`.
- **CITRINITAS — tighter dross exchange: sending AND receiving both amplified.**
  Outgoing slabs are one unit larger in their attack dimension; incoming slabs
  likewise land heavier. The amplification is symmetric (both alembics run the same
  profile), so it raises the tempo without handing either side an edge. Config:
  `drossSendBonus`, `drossRecvBonus`. Fixture: `citrinitasAmplified`.
- **RUBEDO — all-or-nothing: chains below x2 yield nothing; chains above burn
  brighter.** A cascade whose chain length is 1 (a single clear, no chain) sends
  NO dross and grants NO athanor charge. A cascade of chain >= 2 sends dross scaled
  UP (a multiplier on slab dimension) and charges more. Config: `allOrNothing`,
  `chainBrightMul`. Fixture: `rubedoAllOrNothing`.

Per-act physics NEVER breaks determinism or the softlock law (§6). A profile is a
frozen object; the machine reads it, never mutates it.

## 3. The athanor — the charge gauge

- The **athanor** is a per-machine charge gauge (0..`athanorCap`, TUNE cap 100).
  It fills from cascades: each cleared panel adds `chargePerPanel`, each chain link
  beyond the first adds a `chainBonus`, each combo adds a `comboBonus` (TUNE). The
  SHAPE: chains and combos charge FASTER than flat clears (rewards skill), and the
  gauge is CAPPED — overflow is wasted, forcing a spend cadence (studio amendment).
- Under Rubedo all-or-nothing, a chain-1 cascade charges nothing (§2).
- **First-charge pulse**: the first time the gauge crosses zero in a run, a
  one-shot flag fires for a discoverability callout (studio amendment). The engine
  exposes the flag; the scene renders it.
- Charge is spent ONLY by **active** formulae (§4). Passive/bargain formulae never
  touch the gauge. Fixture: `athanorCapAndSpend`.

## 4. The folio of formulae — classes, effects, the draft

The **folio** is the player's deck of drafted formulae. Every formula alters play
the player can SEE, none automates chaining itself (the hands stay the skill), and
every effect works THROUGH the panel machine (no ignore-the-board damage) — the
DESIGN-SEED constraints, restated as invariants the card data must satisfy.

### Classes (three, DESIGN-SEED)

- **PASSIVE (reaction)** — always on once drafted. e.g. a chain of 4+ also burns one
  adjacent dross row. No charge, no key.
- **ACTIVE (brew)** — spends athanor charge, bound to a key, visible cost. e.g.
  dissolve one chosen column. Cast only when charge >= cost.
- **BARGAIN** — a stronger effect with a standing COST that compounds through the
  machine (thicker incoming dross, faster rise). Always on, like a passive, but the
  cost is real and telegraphed.

### The initial set (~16, DESIGN-SEED "Initial card set ~16")

`src/formulae.js` defines the catalogue. Each entry: `{ id, name, cls, cost?,
text, glyph, effect-tags }`. Card text uses ONLY vocabulary the tutorialette
taught (swap, clear, chain, combo, raise, rescue, dross, transmute); card
iconography obeys the same shape+glyph colorblind law as panels (a class glyph +
shape, never color alone). Effects are declared as data tags the engine reads at
the pinned hook points — no card runs arbitrary code against the board.

### The draft (between every bout)

- After each won bout (except the run's final), the player is offered a draft of
  **three formulae, one of each class** (studio amendment). Drafts are SKIPPABLE
  and UNTIMED.
- **No duplicates**: a formula already in the folio is never offered again; two
  formulae of the same `id` never coexist, and same-name effects never stack
  (studio amendment). If a class has no un-owned formula left, that slot is filled
  from the remaining pool or dropped (the offer still shows what it can).
- **Folio cap ~8** (DESIGN-SEED): drafting a 9th requires discarding one first; the
  deck stays readable. The draft offer is deterministic from (run seed, bout index).
- Fixtures: `draftOneOfEachClass`, `draftNoDuplicates`, `folioCapDiscard`.

## 5. The workshop — the between-acts economy lever

Between acts (after the act master falls, before the next act's first bout) there
is a **WORKSHOP** stop (studio amendment): the player may **remove one formula**
OR **upgrade one formula**, then continues. This keeps the folio alive as the deck
grows — the economy lever. Upgrade improves a formula's magnitude one step (an
`upgraded` flag the effect reads); removal frees a folio slot and lets its effect
be re-drafted later. The workshop is skippable (do nothing). Fixture:
`workshopRemoveOrUpgrade`.

## 6. Softlock law (binding, dedicated proof)

No reachable board state may make a dross slab permanently untransmutable
(DESIGN-SEED). The proof obligations, as tests:

- `addSlab` never spawns dross beneath live panels (already true, STUDY-duel §4);
  re-asserted here against crush patterns produced by the Citrinitas amplification
  and the Rubedo multiplier (bigger slabs must still rest on the surface).
- Any slab has a transmutable bottom row reachable by a clear: for any slab, there
  exists at least one adjacent column position where a live panel could be brought
  next to its bottom row by legal swaps (the well is never fully dross-choked while
  the machine is not already lost). The test constructs worst-case crush stacks and
  asserts a transmute path exists (or the machine is already in grace/lost, which is
  a fair loss, not a softlock). Fixture: `softlockNoTrap`.

## 7. Run-end states (declared, arcade stakes)

- **RUINED** — a bout lost. The run ends immediately with the ruined state and the
  run stats (bouts won, acts cleared, best chain, panels dissolved). Single-
  elimination, DECLARED (studio amendment; revisit post-M7).
- **OPUS COMPLETE** — the Rubedo master falls. The run is won; the same stats roll
  up as a triumph. No meta-unlock; a new run is the whole game again.
- Fixture: `runEndRuined`, `runEndComplete`.

## 8. Determinism & the run seed

The whole run is reproducible from a single **run seed**: it derives every bout's
(player seed, rival seed, AI seed) and every draft offer. Given the run seed and
the player's per-tick input + draft/workshop choices, the run replays bit-for-bit.
The player's choices (which card, which column to dissolve, skip or not) are the
only free variables — exactly as the human supplies them. Fixture: `runDeterministic`.
</invoke>

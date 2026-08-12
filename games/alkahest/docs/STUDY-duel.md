# STUDY — the duel: dross, the alembic, the bout (clean-room characterization)

Companion to STUDY-machine.md. Characterizes the MECHANICS of two-well
competitive play in the reference machine (garbage exchange, an AI opponent, and
bout flow) from documented behavior, so ALKAHEST can rebuild them independently.
Measure-and-specify, never lift expression. Values marked TUNE are ALKAHEST's own
targets; the SHAPE of each rule is what the reference fixes. Nothing here names or
reproduces any character, theme, title, art, or sound of the reference.

The ALKAHEST duel engine is written against THIS document and its named fixtures.

---

## 1. Dross (garbage) — geometry

- **Dross** is inert slag delivered to the opponent's well by chains and combos.
  It occupies cells but is NOT a reagent: it never matches, cannot be swapped,
  and cannot be moved by a swap (STUDY-machine §2).
- A **slab** is one rigid rectangular block of dross spanning a contiguous run of
  columns `[x0..x1]` and rows `[y0..y1]` (y0 = bottom). A slab moves as a UNIT
  under gravity: it drops only if EVERY cell directly beneath its footprint is
  empty. Rigidity is the defining property (STUDY-machine §3 named dross rigid).
- **Attack -> slab mapping** (ALKAHEST TUNE; the shape — breadth becomes width,
  depth becomes height — is what the reference fixes):
  - a **COMBO** of N panels (N >= 4) sends ONE slab of width `min(N-1, W)`,
    height 1 (breadth attack: wide + shallow).
  - a **CHAIN** of length L (L >= 2) sends ONE full-width (W) slab of height
    `L-1` (depth attack: narrow-footprint-but-tall, i.e. full width, many rows).
  - a single non-combo, non-chain clear sends nothing.
- Slabs are queued, not applied mid-cascade (§3). A queued slab is previewed as
  an incoming telegraph so the receiver can plan (action-legibility law).

## 2. Transmute (clearing dross away)

- A slab is dissolved by clearing LIVE panels next to it. When a clear group
  resolves, every slab with a dross cell **orthogonally adjacent** to any cleared
  cell is **hit**.
- A hit slab **transmutes its bottom row**: each dross cell in row y0 becomes a
  live panel of a freshly generated reagent type (deterministic from the well's
  RNG). The slab's remaining body (rows y0+1..y1), if any, survives as a slab one
  row shorter and then falls/settles. A height-1 slab is fully consumed.
- The transmuted panels are **chain-eligible**: they carry the current cascade's
  chain id, so a match they form when they settle CONTINUES the chain
  (studio amendment: "transmutes triggered by chain-generated clears cascade
  normally"). This is the core reason dross is a resource, not just an obstacle.
- Only the BOTTOM row transmutes per hit — peeling a tall slab takes repeated
  adjacent clears, which is the tension the attacker is buying.

## 3. Crush — when dross lands (pinned ordering)

Extends STUDY-machine §7. Incoming dross is a QUEUE on the receiving machine.

- Dross is applied (a slab spawns above the stack and begins to fall/crush) ONLY
  **between cascade steps** — never mid-step. Concretely: a queued slab spawns
  only on a tick where nothing is clearing, nothing is floating, and no match is
  pending. **Chain continuity is sacred** (studio amendment).
- A spawned slab enters at the columns dictated by its width, resting above the
  current stack top, and settles by the rigid-gravity rule (§1). It crushes onto
  the stack: it comes to rest on the highest supporting surface.
- Applying dross does NOT itself freeze the rise; but a slab landing may raise the
  stack into near-death (STUDY-machine §9), which is the pressure the attack buys.

## 4. Softlock law (studio amendment — proven by test)

No reachable board state may make a slab **permanently untransmutable**. Because
a slab crushes onto EXISTING panels (it enters from the top and rests on the
stack), its bottom row is adjacent to live panels below it; clearing any of those
transmutes it. The dedicated test constructs crush + stall patterns (slab on a
mixed stack, stacked slabs, slab wedged between columns) and proves a legal play
sequence peels every slab. Slabs never spawn beneath live panels.

## 5. The alembic (AI opponent) — parity is PROVEN

- The AI opponent ("a rival alembic") plays the SAME machine through the SAME
  primitives as the human: it may only `requestSwap(x,y)` and `setRaise(held)`.
  It has no privileged board mutation. (Studio amendment: AI parity is PROVEN,
  not claimed.)
- **Parity test**: record the AI's emitted primitive stream against a machine;
  replay that exact stream on a fresh machine of the same seed and assert
  identical per-tick states — and assert every emitted primitive is one a human
  could legally issue (a swap of two in-bounds adjacent cells, or a raise
  toggle). A legality diff over the log is the acceptance surface.
- **Tunable skill** (TUNE): the AI's decision cadence (thinks every ~`thinkMs`),
  its match-finding depth (does it only spot immediate triples, or set up a
  1-chain?), and its raise discipline scale a single `skill` 0..1 knob. Skill
  changes CADENCE and SELECTION, never the rules. Determinism holds: given
  (seed, skill) the AI is reproducible.

## 6. The bout — flow and states

- A **bout** is two machines running in lockstep ticks. Offense from one routes
  as dross to the other (§1 -> §3). Both obey STUDY-machine tick ordering.
- **Win/loss**: a machine that tops out (STUDY-machine §9, reaches `lost`) loses
  the bout; the other wins. Single-elimination, declared (studio amendment). A
  bout has exactly one loser at the moment of top-out; the winner is the survivor.
- **Near-death telegraph** is COMMUNICATED on BOTH wells: the danger flag, the
  dying-column marker, and the grace window are already sim states
  (STUDY-machine §9); the duel surfaces the opponent's danger to the player too
  (rival-in-trouble read) and the player's own incoming-dross telegraph (§1).
- **PAUSE-ANYWHERE** (studio amendment, LOCKED, never deferrable): pause freezes
  BOTH machines' rise and all timers instantly and is resumable with identical
  state. It is a bout-level state, testable, not a render trick.

## 7. Determinism (carried from STUDY-machine §10)

- A whole bout is reproducible bit-for-bit from (seedA, seedB, skill, input log).
  This underwrites replay-a-seed (M6) and the AI-parity proof (§5).

---

## Named test fixtures (authored in M2)

1. **Slab rigidity** — a multi-column slab drops as a unit; it does not fall
   until its whole footprint is unsupported; live panels rest on top of it.
2. **Transmute bottom row** — a clear adjacent to a slab converts only the slab's
   bottom row to live panels; a taller slab survives one row shorter.
3. **Transmute continues the chain** — panels born from a chain-triggered
   transmute that then match increment the SAME chain counter.
4. **Crush between steps** — a queued slab spawns only when the well is fully at
   rest (nothing clearing/floating/matching), never mid-cascade.
5. **Attack mapping** — a combo of N and a chain of L produce slabs of the
   specified width/height.
6. **Softlock-free** — constructed crush/stall patterns are all fully
   transmutable by a legal sequence.
7. **AI parity / legality diff** — the AI's emitted primitive log replays
   identically and contains only human-legal primitives.
8. **Bout win/loss** — the topped-out machine loses; the survivor wins; exactly
   one loser at top-out.
9. **Pause-anywhere** — pause freezes both machines' state; resume is identical;
   no rise or timer advances while paused.
10. **Dross determinism** — identical (seeds, skill, inputs) => identical bout.
</content>
</invoke>

# M10 Part B — genre-completeness audit (early-CRPG / roguelike table stakes)

Ray: *"needs to have all the bells and whistles of games of the genre… not sure if
there's any loot if you kill something etc."* This enumerates the reference genre's
table-stakes (Ultima-line + roguelike conventions), audits the shipped build against
each, and states what was BUILT this milestone vs. DEFERRED with a named reason — no
silent gaps (features-ship-on-behavior).

| Feature | State before M10 | M10 verdict |
|---|---|---|
| **Loot (kills drop)** | ✗ kills silently removed the foe | **BUILT** — a felled foe may leave salvage (its own weapon band) or a trinket; seeded per (foe, seed), most kills mundane (ENCOUNTERS-LOCK spirit: no scaling, no pity). `loot.js` + `endCombat` wiring. |
| **Caches** | ~ flavor line only; the named artifact was never collected | **BUILT** — a cache now collects its named relic into the pack (`collectCache`). |
| **Inventory / equipment** | ✗ none; only the dealt oddment-as-weapon | **BUILT** — a mortal-layer pack on the session (`items/addItem/dropItem/equip`), an `[I]` overlay to view, `[E]` equips a weapon (power-from-items: the equipped weapon is the only thing combat reads; the swap is reversible), `[X]` drops. Persists through save/load, resets on death. |
| **Party status legibility** | ✓ HP in the side HUD + combat panel, all modes | **HELD** — verified present in first-person too (item 13, `hud-parity.test`). |
| **Death** | ✓ real death screen naming the fallen | **HELD** + now shows the fallen stranger's own portrait (A10). |
| **Save / load clarity** | ✓ `[K]`/`[L]` with in-voice confirmation lines | **HELD** — audited; the confirmation toast/line reads on save and load. |
| **Rest / recovery** | ~ heal only, no risk | **BUILT** — rest heals but costs a turn of exposure; the local tail rolls (ambush risk). |
| **Kill feedback** | ~ plain "X falls" that scrolled off | **BUILT** — explicit kill beat (A7): distinct `✖` log line + prominent acknowledgement note. |
| **Sound** | ✗ no audio code at all | **NEXT INCREMENT** — the audio pass (Monastery Protocol ambient loop + curated SFX) is Part B's own tracked item; see AUDIO-NOTE.md when it lands. |

## Deferred, with named reasons (not silent gaps)

- **XP / levels / stat growth.** DEFERRED BY DESIGN. The character model is
  "a statline is a playstyle, not a power level" (CHARACTER-DESIGN lock): ranks are
  drawn uniformly, combat reads no stat, and there is deliberately no scaling. The
  genre-appropriate *progression* here is lateral — recruiting followers, collecting
  relics/better weapons (now real via loot), lodge initiation rungs, and clearing
  sites (tracked on the immortal layer across deaths). A vertical XP ladder would
  contradict the ENCOUNTERS LOCK and the design seed; flagged for the operator rather
  than added unprompted.
- **Rest cost/risk (encounter tail on rest).** BUILT. `[R]` rest heals the party, but
  making camp now passes a turn of exposure and rolls the local tail — a fight means
  the camp is ambushed (`rest-tail.test` proves a quiet rest heals + advances the
  clock, and that the ambush actually fires across many camps).
- **Consumables / item USE beyond equip.** DEFERRED. Trinkets are currently flavor +
  relic finds; a use-verb (potions/keys that open specific doors) is content for the
  banked CONTENT-IDENTITY layer, not a genre floor.

## What shipped this increment

`data/register/loot.json`, `src/engine/loot.js`, session inventory + equip + persist,
the `[I]` pack overlay with equip/drop, cache→relic collection, kill→loot drops.
Tests: `loot.test` (roller + inventory model + save/load + death reset),
`inventory-flow.test` (the shell overlay opens/lists/equips, no [SEED] leak).

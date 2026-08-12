# M1 Report — Source, Rules Ledger, and IP Boundary

Date: 2026-08-07  
Branch: main  
Commit: 473b483  
Status: **M1 complete**; rules-bearing milestones (M3–M6) are now unblocked.

## What shipped

- `docs/RULES-LEDGER.md` — one-row-per-mechanic ledger of the complete game.
- `docs/IP-CHECKLIST.md` — the no-copy IP boundary checklist, with checkable items and verification methods for later milestones.
- `docs/RULES-LEDGER.md` §CONTESTED-CLASS — explicit operator-level record of the exact unit values, counts, and setup coordinates covered by the mechanics-only digitization decision.
- No code or game assets were modified; this milestone is docs-only.

## Source basis

- **Primary:** `docs/source/debord-nicholson-smith-official-rules.md` — Donald Nicholson-Smith's English translation of Debord's official rules text, with inline `[p.N]` page anchors.
- **Secondary cross-checks:** `docs/source/rsg-kriegspiel-official-rules.md` (RSG's published how-to-play), `docs/source/classwargames-page-and-secondary-sources.md` (Wikipedia + iamcxds README), and the coverage verdict in `docs/source/SOURCES.md`.

All numbers in the ledger were verified against the primary source and corroborated where a secondary source carried the same figure. Discrepancies (e.g., Wikipedia's flattened cavalry attack value, RSG's third "relay/offline" win condition) are noted in the source docs and were not carried into the ledger.

## Verified fraction

**76 verified / 82 total rows = 92.7%** (passes the M1 Boolean gate of ≥90% primary-source-cited rows).

- VERIFIED: 76
- AMBIGUOUS: 5
- UNVERIFIABLE: 1

## Ambiguities needing operator decisions

These rows are marked AMBIGUOUS in the ledger with competing readings and a recommended resolution. The operator may ratify the recommendation or choose an alternative; the choice must be recorded before the relevant rule is implemented.

| # | Mechanic | Competing readings | RECOMMENDED resolution |
|---|----------|--------------------|------------------------|
| 47 | Forced-retreat destination/direction | A: defender chooses any adjacent unoccupied square. B: retreat must be away from the attacker / toward friendly territory. | **A** — the rule only requires vacating the square; a directional constraint would have been stated. |
| 48 | Whether units block lines of fire | A: only mountains block fire; units do not. B: occupied squares also block fire. | **A** — the source singles out mountains as the obstruction; this is also one of the four known ambiguities flagged by iamcxds. |
| 72 | Whether offline enemy fighting units sever communication lines | A: occupancy severs lines regardless of supply status. B: offline units are defenseless and therefore do not block lines. | **A** — the cut rule is based on occupancy, not combat status. |
| 73 | Whether an offline unit can be forced to retreat | A: isolated units are immobile, so a forced retreat is impossible and the unit is destroyed. B: the retreat rule overrides isolation. | **A** — isolation explicitly removes mobility; this is one of the four known ambiguities flagged by iamcxds. |
| 74 | Whether a failed forced retreat consumes a move | A: destruction occurs before the normal move phase; no move consumed. B: the defender must spend the first move attempting retreat. | **A** — the rule says inability to vacate destroys the unit, with no move-expenditure clause; this is one of the four known ambiguities flagged by iamcxds. |

## Unverifiable item

- **Exact terrain coordinates** (which specific squares hold each side's arsenals, forts, pass, and mountains). No source publishes a coordinate table; only counts and qualitative asymmetry are given. Lines of Advance will draw an original board layout inspired by the counts and behavior, not copied from any source diagram.

## CONTESTED-CLASS summary

The faithfulness-critical data class is the set of exact mechanical values and counts recorded in `docs/RULES-LEDGER.md` §CONTESTED-CLASS:

- Infantry 9× (atk 4 / def 6 / move 1 / range 2; +2 pass / +4 fort)
- Cavalry 4× (atk 4 normal, 7 charging / def 5 / move 2 / range 2)
- Foot artillery 1× (atk 5 / def 8 / move 1 / range 3; +2 pass / +4 fort)
- Mounted artillery 1× (atk 5 / def 8 / move 2 / range 3; +2 pass / +4 fort)
- Foot communications 1× (no attack / def 1 / move 1 / relay range 2)
- Mounted communications 1× (no attack / def 1 / move 2 / relay range 2)
- Terrain counts per side: 2 arsenals, 3 forts, 1 pass, 9 mountains
- Unit starting coordinates are not canonical (free deployment within own territory).
- Terrain coordinates are unverifiable from the acquired source set.

This documents precisely what the operator's "mechanics-only digitization" decision covers.

## Next step

M3 — Legal Movement + Communications Audit — may now begin against the verified ledger.

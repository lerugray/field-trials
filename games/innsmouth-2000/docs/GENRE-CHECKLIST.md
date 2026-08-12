# INNSMOUTH 2000 — Genre-completeness audit (M8)

The city-builder table stakes named in DESIGN-SEED (M8) and DIRECTIONS-M7 §M8, audited against
the build. Every item is landed or deferred with a named reason. "Landed" means it ships in the
single-file build and is covered by `node --test`.

## Table stakes (DESIGN-SEED M8)

| Table stake | Status | Where |
|---|---|---|
| Query everything | **Landed** | The query tool answers identity + WHY (stalled for road, dark for power, why the residents are who they are, the Scholar draw). `explainLot` / `describeTile`, query window sized to content. |
| Notifications / advisor | **Landed** | Two message slots (herald band + status strip), the wrath forecast omens, the Innsmouth Courier (ticker + paper), and the Old Priest advisor (M8.7). |
| Save / load with feedback | **Landed** | `save.js` (mid-disaster round-trip tested); S saves, L loads to a browser slot with a plain-English status line (M8.6). |
| Population milestones | **Landed** | Courier headlines at 50/100/250/500/1000/2000 souls; survival milestones at 25/50/75/100 years (M8.3). |
| Town titles | **Landed** | `townTitle(pop)`: Landing -> Hamlet -> Village -> Town -> Port -> City, shown in the top bar (M8.11). |
| Help / legend | **Landed** | The Help and Legend window (getting started, the keys, the meters); H or ? (M8.11). |
| Keyboard shortcuts | **Landed** | Tools 1-9, arrows pan, +/- zoom, Space pause, B/G/K/N/P/H windows, S/L save-load, Tab/Enter within the Ledger, Escape closes. |
| Sound hook points | **Landed (hook only)** | `music.js` autoloads and loops a supplied `assets/music/` track at a bed volume with a mute toggle; the operator supplies audio (the game generates none). |

## Broken-by-inspection fixes (DIRECTIONS-M7 §M8)

| Item | Status | Where |
|---|---|---|
| Bankruptcy consequence | **Landed** | Insolvency forces ordinances off and, after a grace, cuts the funded services' dread relief (M8.1). |
| Appeasement diminishing returns | **Landed** | Geometric decay on stacked structures; carpeting the map is pointless (M8.2). |
| Cthulhu-clock ending | **Landed** | Escalating Awakenings, shrinking recovery, a true doom end + end screen, and survival milestones (M8.3). |
| Scholars: wire or cut | **Wired** | The university draws Scholars; Exposure events tie them to the Containment theme (M8.4). |
| Difficulty / scenario starts | **Landed** | Four starts (standard/easy/hard/recovery) with an in-game picker (M8.8). |
| Standing soak test | **Landed** | ~13k steps across seeds, invariants each tick (M8.9). |
| Multi-god collision test | **Landed** | A persistent wrath queue; two gods flooring the same month both fire (M8.5). |
| Save/load mid-disaster round-trip | **Landed** | A Greening mid-crawl round-trips and resumes identically (M8.6). |
| 45-60 min fast-speed playtest | **Landed** | `scripts/playtest.js` + docs/PLAYTEST (M8.12). |
| Legibility floor AS TESTS | **Landed** | Contrast deltas, blocked-vs-buildable, every block answered (M8.10); no clipped text (the standing text-overflow detector, M8.0). |

## Deferred, with reason

- **A real audio track.** The music hook is present and silent until the operator drops a file in
  `assets/music/`; shipping audio is the operator's call (and would bloat the single file). Deferred
  by design, not a miss.
- **An in-game load/save browser beyond one slot.** One local-store slot with keyboard save/load
  covers the genre stake; a named multi-slot manager is polish, not a table stake. Deferred to M9 if
  wanted.
- **Ambient life (carts, gulls, fog drift, processions).** This is the explicit M9 milestone (Living
  world), not M8. Correctly deferred.

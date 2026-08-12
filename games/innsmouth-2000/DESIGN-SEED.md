# INNSMOUTH 2000 — design seed (founding contract, 2026-08-03)

Ray's concept, verbatim intent: a reskinned/streamlined version of classic SimCity 2000,
Lovecraftian. Different disasters are different gods. Amenities and zoning serve different
types of residents. Same visual aesthetic as old SimCity 2000, Lovecraft subjects.

THE REFERENCE (never a genre): **SimCity 2000 (Maxis, 1993)** — its FORMAT, clean-room
transposed: dimetric-isometric city grid, paint-zones-and-watch-them-grow simulation,
toolbar-driven tools, query windows, a budget, summonable disasters, an in-game newspaper.
Characterize and transpose; never copy assets or palette bytes; the string "SimCity" never
appears anywhere in the repo or the game. Setting: Innsmouth, Massachusetts coast, 1920s.

## The one aesthetic law (operator-delegated lock)

Every screen must read as a lost Maxis-era 1994 disk at a glance: dimetric pixel tiles,
one fixed dithered palette (SC2K-adjacent but sea-rotted — brine greens, weathered
clapboard browns, fog greys, cold slate roofs, gold lamplit windows), chunky OS-style
window chrome with title bars and bevels, a serif broadsheet newspaper. The failing test,
asked at every art commit: "could this pass as a 1994 Maxis screenshot? does it look
cheap?" Banned: flat modern UI, vector minimalism, smooth gradients, modern fonts in
player surfaces. Player-facing text is plain English with no em-dashes.

## The streamline law

The reference's FEEL without its full plumbing. IN: roads, power lines, zones, budget,
ordinances, disasters, query, newspaper. OUT: subways, airports, seaports as networks
(wharves are buildings), arcologies, neighbor deals. The depth budget saved goes to the
cult layer below — that layer is the game.

> **SUPERSEDED IN PART (Ray, 2026-08-09):** water pipes were originally OUT under this law.
> That exclusion is overridden by the ratified underground/Deep-Ones system
> (docs/UNDERGROUND-DEEPONES-SPEC-DRAFT-20260809.md) — the pipe layer was re-admitted
> precisely BECAUSE it feeds the cult layer (contamination, transformation, the Order
> bargain), which is what the law protects. Everything else on the OUT list stands.

## The four resident classes (our R in the demand model)

- **The Unwary** — ordinary folk. The tax base. Dread drives them out.
- **Cultists** — settle near shrines, tolerate dread, feed the favor economy.
- **Deep Ones** — require waterfront adjacency; their presence unlocks sea-bounty income
  and unnerves the Unwary.
- **Scholars** — come for the university; reduce dread; too many invites Exposure events
  (outside investigators).

Zoning stays SC2K-simple: the player paints zones and builds civic structures. WHO moves
into a zone is condition-driven (city dread meter, waterfront adjacency, nearby shrines or
campus, services). The core dial of the whole game: dread pushes the Unwary out and pulls
Cultists and Deep Ones in; the player is always trading tax base against favor economy.

## Gods as disasters (the twist layer)

Each god has a FAVOR track, an appeasement path, and a WRATH disaster with unique art and
behavior. Favor decays if neglected; wrath fires at threshold. A classic disasters menu
also lets the player summon any wrath deliberately (the reference's homage, and the test
hook).

- **Dagon** — wrath: flood tide + deep-one uprising along the shore. Appease: wharf
  offerings (harbor tithe ordinance + wharf shrine).
- **Cthulhu** — wrath: the Awakening. Rare, catastrophic, earthquake plus city-wide
  madness; favor only DELAYS it. The end-game clock.
- **Shub-Niggurath** — wrath: the Greening. Vegetation devours blocks tile by tile.
  Appease: grove shrine on undeveloped land.
- **Nyarlathotep** — wrath: fires and riots of madness spreading through streets.
  Appease: the Masked Processions ordinance.
- **Yog-Sothoth** — wrath: the Rift. A spatial scramble that relocates a district's
  tiles. Appease: the university's Containment Wing.

## Our stack (decided)

Vanilla JS + canvas, zero dependencies, node --test battery, seeded RNG everywhere, and a
single-file build (file:// double-click) rebuilt every milestone — the family machinery
proven on Chapel Perilous. Playwright layout/legibility gates at fixed viewports
(1280x800, 1440x900, 2560x1440).

## Milestones (build order; each ends battery-green + committed + pushed)

- **M1 — Study + substrate.** A written clean-room STUDY doc characterizing the reference
  empirically before any art: dimetric tile geometry and ratios, palette size and dither
  conventions, UI chrome inventory (toolbar, query window, status strip, newspaper),
  disaster/menu conventions. Then: canvas dimetric renderer, tile grid, camera pan/zoom,
  seeded coastal map generation (shoreline, river mouth, hills — Innsmouth needs a coast).
- **M2 — Tools substrate.** Bulldoze, roads with auto-connecting art, power lines, zone
  painting, tile query. Toolbar in the study's chrome register from day one.
- **M3 — Growth sim.** Zones sprout buildings in visible development tiers; population by
  class; the dread meter; the class demand model; date tick and speed controls.
- **M4 — Economy.** Per-class taxes, treasury, building costs and maintenance, the budget
  window, ordinances (Curfew, Masked Processions, Harbor Tithes at minimum).
- **M5 — Power + services.** Gasworks/whale-oil works generation with line connectivity;
  constabulary (riot resistance), asylum (madness recovery), chapel-versus-shrine tension.
- **M6 — The gods layer.** Favor tracks, shrines and appeasement paths, wrath thresholds,
  all five wrath disasters with distinct behavior and placeholder-free art, the disasters
  menu.
- **M7 — Art + chrome pass.** Full building/tile art to the study's bar across every
  development tier; query tool, demand indicator, minimap; The Innsmouth Courier newspaper
  with headlines generated from real sim events.
- **M8 — Genre-completeness + QoL audit.** Enumerate the city-builder table stakes (query
  everything, notifications/advisor, save/load with feedback, population milestones and
  town titles, help/legend, keyboard shortcuts, sound hook points), audit the build, land
  the misses or defer each with a named reason. Legibility floor as TESTS: contrast deltas
  for every entity on every ground, blocked-vs-buildable readable at a glance, no clipped
  text, every blocked player action answered in-world.
- **M9 — Living world + defect sweep.** Ambient animation (carts, gulls, fog banks,
  processions, shadows under the water), newspaper flavor cycle, final single-file build.

**Stop at M9. Everything further is operator-directed.**

## Register hooks

The Innsmouth Courier's voice: a dry New England small-town broadsheet sliding by degrees
into cosmic dread. Building and place names from the Mythos gazetteer register: Marsh
Refinery, Gilman House, Esoteric Order Hall, Falcon Point Wharf. Advisor figure: the Old
Priest, who counsels appeasement in even tones. No modern vocabulary in player surfaces.

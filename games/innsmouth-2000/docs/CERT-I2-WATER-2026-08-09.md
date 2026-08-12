# Certification dossier — INNSMOUTH 2000, M-a water build

**Date:** 2026-08-09 · **Driver:** Playwright/Chromium headless, 1440×900, canvas driven by real mouse
and keyboard (the app has no DOM controls) · ~18 minutes of live play across four sessions.
**Repo read for reference only** — no file written,
no commit. Its `src/` was being edited by another lane throughout, so nothing was read from it as truth.

## Verdict

**DEFECTS FOUND — 1 BLOCKER, 3 DEFECT, 3 FRICTION.**

The M-a water system itself is in good shape: it places, it charges correctly, it runs under roads
exactly as the spec promised, and its query prose is the best-written text in the build. The blocker
is not in the feature — it is that **the feature is not on the URL you were asked to review.**

### The blocker, first, because it changes what this dossier can be

**B1 — `https://i2-preview.pages.dev` is not the water build. The deploy is stale.**

I was told this URL was a hash-verified deploy of the water build. It is not. Fetched and counted:

| marker | deployed preview | repo's committed `dist` |
|---|---|---|
| `Pump House` / `Well House` / `Reservoir` | **0 / 0 / 0** | 5 / 3 / 4 |
| `UNDERGROUND` | **0** | 42 |
| `underground` | **0** | 26 |
| `roadMask` (road/power crossings) | **0** | 2 |
| `crossing` | 2 | 16 |
| size | 306,202 B | 350,358 B |
| sha256 (first 24) | `2bbc9e9ea9d5cffdadfb68e8` | `067674df20547aad704b032e` |

Pressing **U** on the live site does nothing — it stays on the surface, and the toolbar keeps its 14
surface tools. The deploy is 44 KB smaller and predates not just the M-a water harvest (`40560b4`) but
the road/power crossings from the earlier field-fix harvest (`c0374aa`). `dist/innsmouth2000.html` is
committed and clean in git and *does* contain the water build — the Cloudflare deploy simply was not
re-run after the harvest.

So the M-a acceptance cannot be performed against that URL at all. **I tested the committed
`dist/innsmouth2000.html` instead**, copied to my scratchpad and pinned by hash (`067674df…`) so the
other lane's in-flight edits could not move it under me, and opened over `file://`. That is I2's own
stated review target — Hard Rule 6: *"The single-file build (dist/innsmouth2000.html, file:// double-click,
zero deps) … The operator reviews THAT, never a dev server."* Everything below is that artifact.

**Provenance of what was tested.** `water-build-pinned.html`, sha256 `067674df…`, is byte-identical to
`dist/innsmouth2000.html` at commit **`b4f4896`** (the all-CREEP ruling, which was HEAD when this battery
started). Pinning mattered: the M-b lane has rebuilt that file twice since — `a387c3f` gives
`cbcd90d7…` and the current uncommitted working copy is `4d3da281…`. So this dossier describes a
precisely identified artifact, not "whatever `dist` said at some point."

---

## What was exercised

Founded a town on the **Innsmouth** scenario four times (w1, w4, w5, w6). Confirmed the founding speed
is **CREEP** (the slowest play button is the active one at founding, per the all-CREEP ruling). Mapped
both tool palettes by clicking every slot and reading the status strip: 15 surface slots (Query,
Bulldoze, Road, Power line, Gasworks, Whale-Oil Works, Residential, Commercial, Industrial,
Constabulary, Asylum, Chapel, Shrine, University, + view toggle) and 7 underground slots (Query,
Bulldoze, pipe, pumphouse, wellhouse, reservoir, + view toggle).

Built roads, residential zones, a gasworks and power lines by drag; went underground with **U**; laid
water mains by drag; placed Well House, Pump House and Reservoir; queried mains, water structures,
served lots and unserved lots; bulldozed a main underground; ran the sim at MEDIUM speed for 5+ minute
stretches (reaching 1954 in one run); saved and loaded with **S**/**L**; opened Budget (**B**) and Help
(**H**). Verified the **U** toggle 8 times consecutively by sampling canvas brightness — 100 % reliable,
surface ≈ 86, underground ≈ 31.

---

## Findings

### DEFECT

**D1 — The water tools are labelled with raw internal identifiers on a player-facing surface.**
The status strip reads `pipe`, `pumphouse`, `wellhouse`, `reservoir`, while every surface tool reads
properly: `Road`, `Power line`, `Gasworks`, `Whale-Oil Works`, `Residential`, `Constabulary`.

The correct strings already exist in the build. `UNDERGROUND_TOOLS` defines them as **`'Water Main'`,
`'Pump House'`, `'Well House'`, `'Reservoir'`**. The strip just looks in the wrong array:

```js
const toolLabel = (TOOLBAR_TOOLS.find((t) => t.tool === tool) || {}).label || tool;
```

`TOOLBAR_TOOLS` is the *surface* palette, so every water tool misses and falls through to `|| tool`,
printing the id. The build even defines `ALL_TOOLBAR_TOOLS` with the comment *"Every tool that appears
on either palette, for tooltip lookups"* — the strip simply doesn't use it. Changing that one
identifier fixes all four. Note it also means the strip shows the wrong noun: the intended word is
"Water Main", not "pipe". Straight against Hard Rule 10 (player-facing text: plain English, period
register).

**D2 — While the clock is paused, an unwatered lot reports that it is served.**
The same lot, `52,48`, zoned residential and powered but with no main within reach:

- paused, immediately after building → `Zoned: Residential lot.` / **`Zoned and served. Awaiting settlement.`**
- after letting the clock run → **`Watered: no. No main runs within reach.`**

The water network is computed in `sim.step()`, so until time advances the lot's water state is
unevaluated and the query asserts service that does not exist. The natural way to lay out a district
is paused, and the natural way to check your work is the query tool — which is exactly when it lies.
Once running, the reporting is correct and clear.

**D3 — Water structures refused on road/power tiles, with a surface-vocabulary message shown underground.**
Placing a Pump House, Well House or Reservoir on a tile that carries a road or a power line is refused
with **"Clear the road or line before you build here."** Two problems. First, the player is in the
underground view, where the road and the power line are not drawn and cannot be bulldozed — they are
told to clear something they can neither see nor reach from where they are standing. Second, mains
*do* legally run under roads (verified below), so running your main along the street and dropping the
pump onto it is the obvious first move, and it fails on the first try with a message that does not
explain the actual obstruction. On clear ground everything places correctly, so this is purely the
refusal path.

### FRICTION

**F1 — The bare single-file build 404s on music.** Opening `dist/innsmouth2000.html` by itself
requests `assets/music/*.ogg` and fails, logging a console error and a failed request. Music ships in
the separate `dist/innsmouth2000-with-music.zip`, so the result is console noise plus silence rather
than a functional break — but Hard Rule 6 describes the single file as "zero deps", and a player who
double-clicks the bare html gets no music and no explanation.

**F2 — The loss ending offers no way to start again.** The `INNSMOUTH IS LOST` modal is well written
and correctly stops the clock, but it contains only text — no New Game, no Restart, no dismiss. The
dimmed toolbar stays live and still accepts building input into a dead town.

**F3 — Underground water structures render as small faint `⊕` glyphs** against the fully-drawn surface
buildings. Defensible as schematic symbols for a utility view, and consistent with the reference's
underground register — flagging it only because Hard Rule 4 makes the art bar a gate, and this is a
new surface.

### Behavioural observation — a design question, not a defect

**O1 — A town grows, then dies completely, twice out of two runs.** w4: Pop 0 → **104** (1932) → **0**
(1936), then the designed loss ending in 1954 (*"R'lyeh has risen… The town stood 27 years"*, with
`WRATH — The dreamer wakes in full: 0 lots fall to ruin`). w6: Pop 0 → **184** (1932) → **0** (1935).
After each collapse the treasury froze and the town never recovered. Both runs were fast-forwarded at
MEDIUM speed, so this is accelerated relative to the CREEP start the ruling gives players — I am
reporting the shape, not calling the pacing wrong.

### CLEAN — verified working

- **Founding speed is CREEP**, per the all-CREEP ruling.
- **The U toggle is completely reliable** — 8/8 clean switches; dark sub-street plane with the surface
  ghosted above it; palette correctly swaps to 6 water tools plus the view toggle.
- **Water structures place and are charged exactly to spec**, on clear ground, no refusals:
  Well House **$250**, Pump House **$600**, Reservoir **$450**, a main run **$108**.
- **Mains run beneath roads, power lines and zones with no surface conflict** — the spec's headline
  divergence from the power system, verified by a single lot query reading
  `A dirt road runs here.` / `A power line crosses here.` / `A water main runs beneath.`
- **Query explanations are correct, discriminating, and the best prose in the build:**
  - Pump House — *"The municipal pump. Drives water into the mains, so long as the grid keeps it turning. Supplies 120 of water."*
  - Well House — *"A covered well and a hand pump. Little water, and it asks nothing of the grid. Supplies 35 of water."* (correctly distinguishes the unpowered source, and the 35-vs-120 capacities)
  - Unserved tile — *"Watered: no. No main runs within reach."* (the coverage radius, stated plainly)
- **Zero console errors, zero page errors, zero failed requests** across ~18 minutes of play in four
  sessions, other than F1's music 404.
- Save (**S**) and Load (**L**) both acknowledge in the status strip and round-trip the town.
- Budget (**B**), Help (**H**) and the query panel open and close cleanly; Escape dismisses.
- Bulldoze works on the underground plane.
- The surface economy runs: zoning, power and growth all function (Pop reached 104 and 184).
- The loss ending fires correctly and stops the clock — it is a designed ending, not a softlock.

### Not verified — stated plainly rather than claimed

**The growth-gate tier behaviour was not proven end-to-end.** The spec's testables include "no water
caps growth at tier 1, low pressure caps at tier 2, good water plus power allows full density." I
verified the network, the costs, the coverage radius and the *reporting* of water state, but I could
not build two genuinely comparable districts — one watered, one starved — through blind canvas
dragging, so I have no measurement of the density caps themselves. I also never observed a
**low-pressure** state (my sources always exceeded demand), so the three-state dry / low-pressure /
pressurized ladder is unverified above "dry". Those two remain open.

---

## What still genuinely needs the operator's eyes

About ten minutes, and only these.

1. **Re-deploy the preview, then press U on the live URL.** (30 seconds.) Until then the link shows a
   build from before crossings, let alone water. Everything else here is about the committed dist.
2. **The underground art bar (F3).** Look at `i2/w5-01-ug-sources-virgin.png` and `i2/w4-03-ug-mains.png`
   and answer the failing question: could this pass as a 1994 Maxis underground view, or do the `⊕`
   markers read as placeholder? Only you can call that.
3. **The loss pacing and the dead-end ending (O1, F2).** `i2/w4-12-after-watering-B.png` is the ending
   screen. Is a total wipe at ~5 in-game years the intended pressure, and should the modal offer a way
   to start again?
4. **The noun for the pipe tool.** D1's fix needs a decision: "Water Main" (what the code already says)
   or "Main", or "Pipe".
5. **Audio.** Never listened to — and the bare dist has no music at all (F1).
6. **Whether the water structures should be placeable on streets at all** (D3). The refusal may well be
   right; the message is wrong either way, but if you want pumps on streets that is a design change.

## Evidence

All under `…/scratchpad/acceptance-battery/i2/`:
`live.html` the stale deployed build (for the B1 counts) · `water-build-pinned.html` the pinned artifact
tested · `speed-chrome.png` CREEP at founding · `w1-07-underground.png` the underground view ·
`w1-ugtoolbar-stack.png`, `w2-ugnames-stack.png`, `w5-place-stack.png` palette labels and the exact
money deltas per structure · `w4-place-strips.png` the "Clear the road or line" refusals ·
`w5-04-query-main.png` the Pump House query · `w5-queries-stack.png` and `w6-queries.png` the lot
queries including the paused-vs-running contradiction of D2 · `w4-arc-stack.png`, `w6-tops.png` the
growth-then-collapse arcs · `w4-12-after-watering-B.png` the loss ending · drivers `w1-found.mjs`,
`w4-water.mjs`, `w5-probe.mjs`, `w6-gate.mjs`, all re-runnable.

# Design Specification: Underground Water and Deep Ones System

**Status:** Spec only. No implementation until designer ratifies.  
**Ground truth respected:** There is no water or underground layer today. Power is the only utility network, using deterministic component flood-fill over conductive tiles: power lines, generators, structures, and built lots. Existing class model is Unwary, Cultists, Deep Ones, Scholars. The Greening is gated to damp substrate such as marsh and wet sand. Scenario variants already scale pressure, with Quiet Cove as a calm variant.

This spec introduces water pipes as an operator-directed exception to the original streamline law, which explicitly excluded water pipes. **Recommendation:** Treat this as a post-foundation expansion that earns its complexity by carrying the horror layer.

---

## 1. UNDERGROUND VIEW

### Player access

Borrowing the **SC2K convention inline:** the player gets a second, underground utility view that replaces the surface city view with a simplified subsurface layer while keeping the same map, camera, tile grid, toolbar chrome, query behavior, and date/status strip.

Player toggles:

- Toolbar button: **Underground**
- Keyboard shortcut: **U**
- Query tool works in both views.
- Build tools switch context:
  - Surface view: roads, zones, power, structures.
  - Underground view: pipes, valves, pump intakes, inspection shafts, sealing works.

### What renders underground

The underground view shows:

1. **Water pipes**
   - Pipe runs under surface tiles.
   - Pipes can pass beneath roads, zones, buildings, and power lines.
   - Pipe crossings and junctions use clear old-utility-map pixel art.

2. **Water sources**
   - Fresh aquifer veins.
   - Brackish aquifer near shore.
   - Sea-connected fissures and flooded cavities.
   - Pump intakes, wells, reservoirs, cisterns.

3. **Pressure and service**
   - Pressurized pipes glow cold blue.
   - Low-pressure pipes pulse dull grey-blue.
   - Dry pipes are dark.
   - Coverage radius appears as faint blue tile wash around live pipes.

4. **Contamination**
   - Suspect water: yellow-green mottling.
   - Tainted water: sick green.
   - Infested mains: black-green with bubbles or movement.
   - Unknown contamination is not fully shown until detected, but the overlay must show enough symptoms that the player never feels cheated.

5. **The things below**
   - Deep Ones are not managed as individual units.
   - They appear as signs:
     - Moving silhouettes in sea-connected caverns.
     - Webbed handprints on pipe walls.
     - Schools of pale eyes in flooded voids.
     - Glyphs around contaminated pumps.
   - **Recommendation:** Use glimpses and signs rather than literal monster sprites everywhere. The layer should feel like a municipal utility map that is becoming a blasphemous anatomy chart.

### Coexistence with surface view

- Surface structures remain faintly ghosted in underground view so the player can understand what each pipe serves.
- Roads and building footprints appear as brown/grey silhouettes.
- The selected surface tile remains queryable from underground.
- Surface disasters can reveal underground damage, and underground failures can surface as visible city symptoms:
  - Dry lots.
  - Brackish wells.
  - Abandoned houses.
  - Green seepage.
  - Night processions around hydrants and wells.

---

## 2. WATER SUPPLY SYSTEM

### Core objects

New utility objects:

1. **Pipe**
   - The basic underground conductor.
   - Built on the underground layer.
   - Can exist beneath most land tiles.
   - Cannot run through deep water unless using a special intake/outfall segment.

2. **Municipal Pump House**
   - Draws from fresh aquifer, river, or reservoir.
   - Requires power to operate at full output.
   - Has monthly upkeep.
   - Vulnerable to contamination if connected to brackish or sea-connected substrate.

3. **Well House**
   - Cheaper, lower capacity.
   - Does not need pipe adjacency to water terrain if placed over fresh aquifer.
   - Higher contamination risk in coastal or tainted aquifer.

4. **Hill Reservoir / Water Tower**
   - Stores pressure buffer.
   - Does not create water by itself.
   - Extends reliability and reduces low-pressure events.
   - Good tutorial object because it makes the system more forgiving.

5. **Filter House**
   - Reduces contamination on its connected network.
   - Has upkeep.
   - Can be shut down by bankruptcy like other funded services.

6. **Valve / Seal**
   - Lets the player isolate contaminated branches.
   - Must stay simple: one-click open/closed state, no pressure engineering puzzle.

### Network mechanics

Reuse the existing power-network pattern where sensible:

Maps directly:

- Deterministic flood-fill over connected utility conductors.
- Each connected component has:
  - Source capacity.
  - Demand.
  - Satisfaction state.
  - Trouble flags.
- Pure sim calculation, no canvas or DOM dependency.
- Query and overlay read the same computed state.

Must differ from power:

- **Buildings do not conduct water.**
  - Power currently passes through built lots and structures.
  - Water should not. Pipes are the network.
  - A building is served by nearby pipe coverage, not because the building itself carries water onward.

- **Pipes live on a second layer.**
  - Existing tile network model has road / powerline / crossing on the surface tile.
  - Water pipes should be stored as an underground network element that can coexist with road and powerline above.
  - Recommendation: surface road/power crossings should not create water crossings. Underground pipes are separate.

- **Water has quality, not only on/off service.**
  - Power is energized or not.
  - Water can be:
    - Dry
    - Low pressure
    - Potable
    - Suspect
    - Tainted
    - Infested

- **Coverage comes from pipes, not adjacent energized buildings.**
  - Power growth gate uses `energizedNear`.
  - Water should use a pipe coverage radius.

### Capacity and demand

Recommended first-pass demand:

- Residential building demand: level × 1
- Commercial building demand: level × 1
- Industrial building demand: level × 2
- Civic structures: fixed demand by kind
- Empty zoned land demands no water until built

Recommended source capacity:

- Well House: low capacity, cheap
- Pump House: medium/high capacity, needs power
- Reservoir: pressure buffer, no generation
- Filter House: quality improvement, no generation

### Coverage radius

Borrowing the SC2K pipe convention inline: pipes do not need to be under every single building. A live pipe waters nearby tiles.

**Recommendation:** Chebyshev radius 2 from a pressurized pipe.

Effects:

- Easy to understand.
- Compatible with existing service-radius thinking.
- Avoids forcing the player to draw a pipe under every lot.
- Lets road corridors carry utility trunks naturally.

### Water service states

For each water network component:

1. **Dry**
   - No active source or all pumps unpowered.
   - No water coverage.

2. **Low pressure**
   - Source capacity below demand, or pump partially disabled.
   - Lots count as watered for basic survival but not for full growth.
   - Contamination spreads more easily in low-pressure networks.

3. **Pressurized**
   - Capacity meets demand.
   - Clean networks provide full growth support.

4. **Contaminated**
   - Network has suspect, tainted, or infested quality state.
   - Still waters lots, but with horror consequences.

### What unwatered zones do

Mirror power enough to be learnable, but do not make water a second harsh growth wall.

Existing power behavior:

- Road access allows first-tier development.
- Power is required to grow beyond tier 1.

Recommended water behavior:

- Road access alone still allows level 1 shacks, shops, and sheds.
- Level 2 and level 3 growth require both:
  - Power nearby.
  - Potable or at least non-tainted water coverage.
- Low pressure caps growth at level 2.
- No water caps growth at level 1.
- Long-term unwatered lots may decay:
  - After several months dry, residential and commercial lots have a small abandonment chance.
  - Industrial lots remain but lose income and raise dread.

This keeps the system meaningful without making early play brittle.

---

## 3. THE DEEP ONES LAYER

### Where they dwell

Deep Ones dwell in:

- Sea-connected underground cavities.
- Brackish aquifer near the coast.
- Caverns beneath wet sand and marsh.
- Old wells.
- Pump intakes connected too near the sea.
- Pipes that have stayed tainted for too long.

They are strongest where underground water connects to the sea. They should feel like they were already there, and the town’s infrastructure merely gave them a road inward.

### Presence growth

Each underground region or water network can have a hidden or semi-hidden **Deep Presence** value.

Presence grows from:

- Sea-connected fissures.
- Pipes connected to brackish or tainted sources.
- Low Dagon favor.
- High dread.
- Existing Deep One population.
- Flood Tide events.
- Long periods of uninspected contamination.
- Harbor Tithes and Esoteric Order choices, if the player chooses the bargain path.

Presence falls from:

- Clean fresh-water sourcing.
- Filter Houses.
- Sealed fissures.
- Flushing mains.
- Constabulary inspections.
- Chapel/asylum resistance effects.
- High Dagon favor, if appeasement is framed as keeping the deep orderly rather than absent.

**Recommendation:** Dagon favor should not simply mean “no Deep Ones.” It should mean “the pact is orderly.” Low favor produces hostile sabotage. High favor produces quieter contamination and bargain opportunities.

### Contamination states

Pipes and sources may carry one of these quality states:

1. **Clean**
   - Safe water.
   - Blue overlay.

2. **Suspect**
   - Minor brackish taste, odd reports.
   - Low mechanical effect.
   - Advisor warning appears if detected.
   - Can clear naturally if source is clean and pressure is good.

3. **Tainted**
   - Transformation risk begins.
   - Dread rises in served lots.
   - Unwary demand falls in affected area.
   - Filter/flush action required.

4. **Infested**
   - Deep Ones actively inhabit the network.
   - Pressure loss events possible.
   - Transformation accelerates.
   - Pipe breaks, pump sabotage, and “voices in the mains” events can occur.

### How Deep Ones mess with water supply

Concrete effects:

1. **Contaminate a source**
   - A pump draws clean water one month, suspect water the next.
   - Query: “The intake tastes of salt and something older.”

2. **Contaminate a pipe segment**
   - Taint spreads along connected pipes, faster under low pressure.
   - Valves can isolate branches.

3. **Pressure loss**
   - Infested components suffer intermittent low pressure.
   - Watered lots may temporarily become low-pressure or dry.

4. **Pump sabotage**
   - A Pump House output is reduced for several months.
   - Higher chance near sea-connected aquifer or during Dagon omen/dire stage.

5. **Backflow event**
   - A contaminated branch pushes taint into an otherwise clean network.
   - Prevented by valves or maintained Filter Houses.

6. **Surface seepage**
   - Tainted leaks dampen surface substrate.
   - This matters for Greening interaction.

7. **Courier events**
   - “THE WELLS TASTE OF SALT AND SOMETHING ELSE”
   - “PUMP KEEPER MISSING AFTER NIGHT SHIFT”
   - “LOWER WARD ADVISED TO BOIL WATER”

### Detection

Player detects Deep One activity through:

- Underground overlay tint.
- Query text on pipes, pumps, and served lots.
- Advisor warnings.
- Courier headlines.
- Sound cues:
  - Pipe knocking.
  - Distant croaking through mains.
  - Low whale-song under the map.
- Inspection actions:
  - Water test at Filter House.
  - Constabulary inspection.
  - University survey.
  - Chapel reports from parishioners.

Detection should be partial at first. The player sees symptoms, then confirms with inspection.

### Fighting it

Player responses:

1. **Flush Mains**
   - Costs money.
   - Temporarily reduces taint in a connected component.
   - Works best if source is clean and pressure is good.

2. **Replace Pipe**
   - Removes local contamination.
   - Expensive but reliable.

3. **Close Valve**
   - Isolates branch.
   - May dry out some lots.
   - Useful emergency tool.

4. **Seal Fissure**
   - Permanent or long-term reduction of sea ingress.
   - High cost.
   - May anger Dagon slightly.

5. **Build Filter House**
   - Passive reduction of suspect/tainted water.
   - Requires upkeep.
   - Less effective against infested networks unless paired with flushing.

6. **Move Source Inland**
   - Build hill wells or reservoir away from shore.
   - Expensive but clean.

7. **Appease Dagon**
   - Harbor Tithes, water shrines, and offerings reduce hostile sabotage.
   - Does not remove the Deep Ones. It changes the relationship.

8. **Esoteric Order Bargain**
   - Lets the player deliberately tolerate controlled transformation for favor and sea-bounty.
   - See Section 4.

---

## 4. TRANSFORMATION MECHANIC

### Design recommendation

Respect the existing four-class model. Do not add a fifth permanent population class.

Use transformation as a **per-residential-lot taint state** that eventually maps affected residents into the existing **Deep One** population bucket.

This preserves the founding class model:

- Unwary
- Cultists
- Deep Ones
- Scholars

The visible transformation states can still be named and presented fictionally.

### Transformation states

Residential lots served by tainted or infested water gain a hidden or query-visible **change meter**.

States:

1. **Human**
   - Ordinary class logic applies:
     - Unwary
     - Cultist
     - Scholar
     - Existing Deep One waterfront logic

2. **Touched**
   - Early exposure.
   - Query signs:
     - “The household draws the curtains by day.”
     - “Children complain the water sings.”
   - Mechanical effects:
     - Slight Unwary tax loss.
     - Slight dread increase.
     - Chapel/asylum can slow or reverse this state.
     - Scholars may trigger Exposure risk sooner if they study it.

3. **Hybrid**
   - The household has visibly changed.
   - Counts mechanically as Deep One population.
   - Mechanical effects:
     - Conventional tax lower than Unwary.
     - Sea-bounty income increases.
     - Dread rises nearby.
     - Unwary demand falls nearby.
     - Cultists tolerate or welcome it.
     - Dagon favor pressure eases if the Order is active.

4. **Gone to the Sea**
   - Final departure.
   - Residents leave the surface population.
   - Lot becomes one of:
     - Vacant dark house.
     - Sealed family house.
     - Esoteric Order holding.
     - Ruin that may later repopulate as Deep One or Cultist housing.
   - Mechanical effects:
     - Surface population decreases.
     - Tax base decreases.
     - Hidden Deep Presence increases.
     - Dagon favor or sea-bounty may increase if the bargain path is active.
     - During Flood Tide or uprising events, these households may “return.”

### Visible signs in the city

Surface view signs:

- Greenish lamps in windows.
- Wet footprints from door to gutter.
- Houses with shuttered upper floors.
- Residents walking strangely near wells.
- Fewer daytime pedestrians.
- Night processions toward the shore.
- Residential art variant for Hybrid and Gone-to-the-Sea states.

Underground signs:

- Tainted service lines feeding affected houses.
- Thin green tendrils in pipe water.
- Pale shapes gathered below hybrid neighborhoods.
- Houses above infested mains marked with subtle damp halos.

### Mechanical effects

Workforce:

- Touched residents still work, but less efficiently.
- Hybrids count as Deep Ones:
  - Good for sea-bounty.
  - Good for Dagon-aligned economy.
  - Less useful for ordinary commercial tax base.
- Gone-to-the-Sea residents leave the ordinary workforce.

Favor:

- Touched state has little favor effect.
- Hybrid state can improve Dagon favor if the Esoteric Order is sanctioned.
- Gone-to-the-Sea can provide a larger Dagon offering but increases Deep Presence.

Population:

- Touched remains in original class count.
- Hybrid moves into Deep One population.
- Gone-to-the-Sea leaves surface population but may be tracked as hidden “below” presence for events.

Dread:

- Touched: small local dread.
- Hybrid: moderate local dread, stronger Unwary repulsion.
- Gone-to-the-Sea: strong local dread unless normalized by cult/Order structures.

### Pure loss or dark bargain

**Recommendation:** Make transformation a dark bargain, not pure loss.

Without the Order:

- Transformation is mostly bad:
  - Tax loss.
  - Dread.
  - Population loss.
  - Deep Presence.
  - Dagon-related events.

With the Esoteric Order path:

- The player can channel transformation:
  - Controlled hybrid wards.
  - Better sea-bounty.
  - Dagon favor stabilization.
  - Reduced sabotage.
  - Lower chance of violent Deep One events.

But the cost remains:

- Unwary flee.
- Scholars raise Exposure risk.
- Chapels lose influence.
- Cthulhu/Dagon horror becomes more visible.
- The town becomes less human.

The player should be asking: “Do I save the town, or teach it to breathe underwater?”

---

## 5. SCENARIO INTEGRATION

Add water/Deep One pressure scales per scenario. These should sit beside existing pressure controls such as `wrathPace`.

### Quiet Cove

Purpose: gentle introduction.

Recommended settings:

- No initial infested pipes.
- Deep Presence starts dormant.
- First 18 to 24 months have reduced contamination rolls.
- Suspect contamination can appear, but Tainted is rare.
- Gone-to-the-Sea state disabled until:
  - Population threshold, or
  - Player builds a sea-connected pump, or
  - Dagon reaches omen/dire stage.
- Advisor gives explicit tutorial warnings.
- Filter House and flushing are cheap enough to learn.

Quiet Cove should still have the system, but it should feel like strange municipal trouble before it becomes a horror engine.

### Standard

Purpose: intended experience.

Recommended settings:

- Some sea-connected underground regions.
- Coastal sources carry moderate risk.
- Tainted water appears if ignored.
- Transformation can reach Gone-to-the-Sea.
- Dagon favor and Harbor Tithes matter.

### Hard / Doomed Coast

Purpose: pressure variant.

Recommended settings:

- More brackish aquifer.
- More sea fissures.
- Higher Deep Presence growth.
- Faster taint spread in low-pressure networks.
- Flood Tide more likely to contaminate coastal pipes.
- Dagon neglect rapidly turns water infrastructure hostile.
- Quiet fixes are less effective without appeasement or major investment.

---

## 6. INTERACTION WITH EXISTING SYSTEMS

### Greening

Current fact: Greening spread is gated to damp substrate such as marsh and wet sand.

Touchpoint:

- Leaking water pipes can create temporary damp substrate.
- Contaminated leaks can create **tainted damp** substrate.
- Greening may use tainted damp as a bridge inland.

**Recommendation:** Clean pipes should not broadly enable Greening. Only leaks, breaks, or infested pipes create damp substrate. Otherwise the player would feel punished for building a normal water system.

Specific interactions:

- Infested pipe break: creates damp patch above.
- Tainted leak: creates damp patch with higher Greening susceptibility.
- Filtered, maintained network: no Greening bridge.
- Shub-Niggurath wrath can rupture water mains to create new damp paths.

### Gods and favor

Dagon:

- Central god for this system.
- Low favor increases hostile water events:
  - Sabotage.
  - Backflow.
  - Infestation.
  - Flood Tide pipe contamination.
- High favor reduces hostility but may increase bargain temptation.
- Harbor Tithes and water shrines can make Deep One presence orderly.

Shub-Niggurath:

- Tainted damp helps Greening.
- Greening roots can break pipes.
- Grove shrines near wet/tainted land become more potent but more dangerous.

Cthulhu:

- High citywide dread accelerates divine hunger in the existing favor system.
- Tainted water can produce dreams and madness headlines.
- Awakening can rupture water networks citywide.

Nyarlathotep:

- Riots and fires can damage Pump Houses and Filter Houses.
- Low water pressure worsens fire consequences.
- Masked Processions may reduce panic around hybrid districts but normalize the horror.

Yog-Sothoth:

- Rift can scramble pipe connections underground as well as surface districts.
- University survey can detect contamination but also risks Exposure.

### Disasters

Flood Tide:

- Saltwater intrusion into coastal pipes.
- Pumps near shore become suspect or tainted.
- Deep Presence spikes along flooded underground regions.

Greening:

- Roots block or break pipes.
- Damp pipe leaks become spread paths.

Burning / Riot:

- Low-pressure water makes fire harder to control.
- Rioters may sabotage Pump Houses.

Rift:

- Pipe network is severed, looped, or relocated.
- Underground view becomes essential for repair.

Awakening:

- Widespread main breaks.
- Sudden dread spike.
- Some Touched residents jump directly to Hybrid or Gone-to-the-Sea.

### Economy

New costs:

- Pipe construction.
- Pump House construction and upkeep.
- Reservoir upkeep.
- Filter House upkeep.
- Flushing cost.
- Pipe replacement cost.
- Inspection cost.

New income or savings:

- Watered high-density growth raises tax base.
- Deep One/Hybrid population increases sea-bounty.
- Esoteric Order bargain can stabilize Dagon favor and improve bounty.

Economic penalties:

- Dry commercial lots lose income.
- Low-pressure industry loses output.
- Unwatered lots may abandon.
- Contaminated districts lose Unwary tax base.
- Bankruptcy shuts down funded water quality services such as Filter Houses and inspections.

### Power

- Pump Houses require power for full output.
- Unpowered pumps produce no pressure or reduced pressure.
- This creates an intended utility dependency:
  - Power supports water.
  - Water supports growth.
- Avoid circular dependency:
  - Power plants should not require water in the first implementation.

### Population and growth

- Water becomes a second growth service, not a replacement for power.
- Residential class assignment remains driven by existing factors: dread, waterfront, shrine/chapel, university.
- Transformation overlays that system and can force a lot into the existing Deep One bucket.

---

## 7. UI / READABILITY

### Overlay language

Underground overlay colors:

- Clean pressurized pipe: cold blue.
- Low pressure: dim blue-grey pulse.
- Dry: dark grey.
- Suspect: yellow-green flecks.
- Tainted: sick green.
- Infested: black-green, animated bubbles.
- Fresh aquifer: pale cyan.
- Brackish aquifer: muddy teal.
- Sea-connected void: black blue with moving highlights.
- Sealed fissure: iron cap icon.

### Advisor and warnings

Use existing advisor/status-strip/newspaper patterns.

Advisor warning examples:

- “The lower mains have lost pressure.”
- “The pump draws brackish water.”
- “Several households report singing in the pipes.”
- “The Filter House cannot cleanse an infested main alone.”
- “Close a valve or the taint will reach the hill ward.”

Old Priest angle:

- The Old Priest can frame warnings as practical municipal counsel with sinister calm.
- Example: “Clean water is a mercy. A bargained water is a debt.”

### Query window

Pipe query should show:

- Network name or component number.
- Pressure:
  - Dry / Low / Good
- Quality:
  - Clean / Suspect / Tainted / Infested
- Source:
  - Pump House, Well, Reservoir feed, unknown backflow
- Demand and capacity summary.
- Recent event:
  - “Backflow last month.”
  - “Flushed two months ago.”
  - “Sea fissure nearby.”

Lot query should show:

- Watered: yes/no.
- Pressure state.
- Water quality.
- Transformation signs if present:
  - Human / Touched / Hybrid / Gone to the Sea
- Growth blocker:
  - “No water: cannot grow beyond a poor first tier.”
  - “Low pressure: cannot fully build up.”
  - “Tainted water: residents are changing.”

### Newspaper

Courier headlines should be generated from real events, matching existing pattern.

Examples:

- “LOWER WARD ADVISED TO BOIL WATER”
- “PUMP KEEPER MISSING AFTER NIGHT SHIFT”
- “THE WELLS TASTE OF SALT”
- “OLD FAMILIES LEAVE THEIR HOUSES DARK”
- “A HYMN HEARD IN THE MAINS”

### Sound

Subtle sound cues:

- Clean water: low pipe hum.
- Low pressure: knocking.
- Suspect: faint dripping.
- Tainted: wet croaking under ambience.
- Infested: distant whale-song, pipe groans, choral murmur.

Sound should support readability, not replace visual clarity.

---

## 8. SCOPE LADDER

### M-a: Pipes and water simulation

Independently shippable goal: the town has a useful water utility with no horror yet.

Includes:

- Underground view toggle.
- Pipe placement/removal.
- Pump House, Well House, Reservoir.
- Water network flood-fill.
- Capacity/demand.
- Coverage radius.
- Dry / low-pressure / pressurized states.
- Growth gate:
  - No water caps growth.
  - Low pressure caps growth.
  - Clean water enables full density alongside power.
- Query explanations.
- Budget costs and upkeep.

Testable:

- Deterministic network components.
- Coverage radius correctness.
- Pump capacity and demand satisfaction.
- Unpowered pump behavior.
- Growth cap behavior.

### M-b: Deep Ones and contamination

Independently shippable goal: water becomes dangerous.

Includes:

- Aquifer quality map.
- Sea-connected underground regions.
- Deep Presence values.
- Clean / suspect / tainted / infested water states.
- Contamination spread.
- Pressure-loss events.
- Pump sabotage.
- Flush, filter, valve, seal actions.
- Advisor warnings and overlay tinting.
- Dagon favor interaction.

Testable:

- Taint spread along connected pipes only.
- Valves isolate contamination.
- Filter House reduces taint.
- Low pressure increases contamination risk.
- Scenario pressure scaling.

### M-c: Transformation and Esoteric Order bargain

Independently shippable goal: contaminated water changes the population and creates the dark bargain.

Includes:

- Residential transformation states:
  - Human
  - Touched
  - Hybrid
  - Gone to the Sea
- Visible art/query signs.
- Hybrid counts as Deep One population.
- Gone-to-the-Sea removes surface population and increases hidden Deep Presence.
- Esoteric Order bargain:
  - Controlled transformation.
  - Dagon favor stabilization.
  - Sea-bounty bonus.
  - Unwary/Scholar downside.
- Courier headlines.
- Scenario tuning for Quiet Cove vs harder variants.

Testable:

- Tainted service increments change meter.
- Clean service slows or reverses early Touched state.
- Hybrid maps to Deep One pop.
- Gone-to-the-Sea reduces surface pop.
- Bargain changes favor/economy outcomes.

---

## 9. ANTI-GOALS

This must not become:

1. **Micromanagement hell**
   - No per-house pipe valves.
   - No manual monthly chlorination.
   - No pressure engineering puzzle.

2. **A second full network to babysit every minute**
   - Water should matter at planning, crisis, and expansion moments.
   - A well-built clean network should run quietly for long stretches.

3. **A difficulty spike that breaks Quiet Cove**
   - Quiet Cove must teach the system gently.
   - Early contamination should be readable and recoverable.

4. **A hidden-failure trap**
   - If water is tainted, the player needs symptoms before irreversible loss.
   - Transformation should have warning states.

5. **A replacement for the existing class model**
   - Do not add a fifth major resident class unless later explicitly directed.
   - Use transformation states that map into existing Deep One population.

6. **A modern water-management sim**
   - No sewage, rainfall models, chemical ppm, real hydraulic simulation, or modern dashboard UI.

7. **A literal dungeon layer**
   - The underground view is a utility layer with horror signs, not an explorable monster map.

8. **A clean good/evil meter**
   - The Order bargain should be useful and damning, not simply correct or incorrect.

9. **A break from the 1994 lost-disk aesthetic**
   - The underground view must still look like period city-builder utility art, not modern neon overlays.

---

## 10. OPEN QUESTIONS FOR THE DESIGNER

1. **Ratification of scope exception:** Is this officially allowed to override the original streamline law that excluded water pipes?

2. **Transformation reversibility:** Should Touched be reversible only, or should Hybrid also be partially reversible through chapel/asylum/filtering?

3. **Player agency in the bargain:** May the player deliberately contaminate or “consecrate” a district through the Esoteric Order, or only choose to tolerate and manage what happens?

4. **Deep Ones depiction:** Should underground Deep Ones be mostly implied through signs, or visibly shown as creatures moving below the town?

5. **Alternate ending:** If too much of the town goes to the sea, should that create a Dagon ending, or should Cthulhu remain the only true end clock?
---

## Orchestrator verdict gate (2026-08-09, fidelity critic vs DESIGN-SEED/MISSION/power/gods/sim/scenarios/tools)

- CORRECTION (real): §6's Cthulhu claim is wrong — dread-driven hunger (BASE_HUNGER +
  dread*DREAD_HUNGER) belongs to Dagon/Shub/Nyarlathotep/Yog ONLY; Cthulhu's creep is a
  fixed CTHULHU_CREEP minus asylum/shrine/university diminishing returns, scaled by
  wrathPace, dread-independent by design. Read §6's Cthulhu touchpoint accordingly.
- MINOR: the hard scenario is labeled 'The Blighted Shore' (not "Doomed Coast"); power
  components are {tiles,capacity,demand,satisfied} (no "trouble flags"); generators are
  not a separate conductor category (structures with capacity>0).
- CLEAN: power flood-fill/conductivity model, crossing tile shape, citizen class model
  (Unwary/Cultist/Deep One/Scholar) + classFor factors, Greening damp-substrate gate,
  Quiet Cove/wrathPace — all verified exact.
- SUPERSESSION FLAG: DESIGN-SEED's streamline law EXPLICITLY excluded water pipes at
  founding. This spec reverses that cut. Spec open question 1 puts the override to the
  designer — if ratified, the streamline-law line in DESIGN-SEED gets a superseded-by
  banner in the same commit that starts M-a (supersession-means-deletion).

STATUS: DRAFT awaiting designer ratification (10 sections + 5 open questions).

## RATIFIED (Ray, 2026-08-09) — all five open questions

1. Streamline-law override: RATIFIED — pipes re-admitted because they feed the cult layer
   (DESIGN-SEED carries the superseded-in-part banner as of this commit).
2. Reversibility: Touched-only reversible (clean water + chapel/asylum); Hybrid permanent.
3. Bargain: PLAYER-INITIATED — the Order can deliberately consecrate a chosen district for
   Dagon favor + sea-bounty at reputation/class cost.
4. Depiction: implied + rare glimpses (visible silhouettes only at high Deep Presence).
5. Dagon ending: YES — full gone-to-the-sea is a distinct end-state; Cthulhu remains the
   doom clock. Build order: M-a → M-b → M-c per the scope ladder.

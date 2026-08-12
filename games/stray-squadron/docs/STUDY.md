# STUDY — the SNES rail-shooter format, characterized clean-room

Founding reference study for STRAY SQUADRON. Written 2026-08-05 from general knowledge
only, per CLAUDE.md hard rule 1 and docs/DIRECTIONS-M1.md. No ROM, image, capture, or
install was inspected, emulated, dumped, or traced to write this. Nothing here names a
Nintendo character, ship, or place; this document characterizes *conventions of a format*,
not the fiction of any specific title.

THE REFERENCE (a format, never a costume): the 1993 SNES flat-shaded-polygon rail shooter
built on the console's polygon-accelerator cartridge chip, plus the 1997 N64 successor whose
quality-of-life additions (charge shots, deflection roll, brake/boost, per-level medals,
squadron chatter) this project folds forward. Every art and UI decision downstream cites
this file the way a sibling project's build cites its own `docs/STUDY.md`.

---

## 1. Shape language — "smooth/deluxe blocky"

### 1.1 The hardware constraint that became a style

The 1993 machine rendered filled, flat-shaded triangles in real time — no texture mapping
on the ships, no per-pixel lighting, no smooth (Gouraud) gradients across a face. Each
triangle was one flat color, chosen by a single dot-product of the face normal against one
directional light (plus a floor of ambient so back-faces were never pure black). The whole
aesthetic falls out of that: **a craft is a small cluster of flat-shaded triangles whose
silhouette does all the identifying work, and whose per-face brightness steps do all the
form-reading work.**

Triangle budgets were tiny by any modern measure. A hero craft read as itself at roughly
**50–120 triangles**; a common enemy fighter at **20–60**; a throwaway drone or debris
chunk at **8–20**; a boss at a few hundred at most, and even then built from repeated simple
volumes (a core, radial arms, a weak-point pod) rather than dense detail. Terrain was
coarse: extruded ridgelines, prisms, low-step height fields — big planar faces, few of them.

"Smooth/deluxe blocky" (Ray's brief) is therefore **not** "add polygons until it stops
looking blocky." It is: keep the blocky triangle-cluster vocabulary, but spend the modern
GPU's free depth-buffer and 60fps headroom on the things the 1993 chip could not afford —
clean edges, no z-fighting, no dropped frames, a slightly higher but still-legible triangle
count, and honest flat shading that never muddies. The charm is in the restraint, not in
hiding the facets. If a form stops reading as a cluster of flat triangles, it has left the
register.

### 1.2 Silhouette-first design

Because there is no texture and no fine geometry, **the silhouette is the character.** A
craft has to be recognizable as a black shape against the sky. The design discipline:

- One dominant read per craft. A hero interceptor reads as a swept dart with paired wings;
  a heavy reads as a blunt wedge; a drone reads as a spindly cross or ring. You should be
  able to name the craft type from its outline alone at reticle-distance.
- Asymmetry is expensive and rarely used on small craft — bilateral symmetry keeps the
  triangle count and the mental model cheap. Bosses break symmetry deliberately, to signal
  "this is not a normal enemy."
- Silhouette distinctness *between* craft matters more than realism *within* one craft. The
  enemy roster is a set of clearly-different outlines, not variations on one shape.

### 1.3 Component vocabulary of a hero craft

Break "blocky but charming" into its parts (this is the authoring checklist for our ships):

- **Fuselage** — a central spine volume, usually a stretched hexagonal or octagonal prism
  tapering to a nose. 12–30 triangles. It is the anchor everything else attaches to.
- **Wings** — flat swept planes, often with a slight dihedral (tips up) or anhedral (tips
  down) to catch a different shade band than the fuselage top. Wings are where the flat
  shading earns its keep: two faces at different angles to the light read as two crisp
  tones, and that step *is* the shape. 8–20 triangles the pair.
- **Canopy** — a small raised faceted bump near the nose, a distinct (usually cooler/darker
  accent) color. Sells "there is a pilot in there" in 4–8 triangles. On memorial-cast-
  adjacent readings this is where a portrait's gaze direction is implied, but that is M6.
- **Engine glow** — not geometry: an additive-blended billboard or emissive-colored face at
  the tail, brightening on boost. The one place the flat-shading rule bends, because a
  thruster is *supposed* to look like emitted light, not a lit surface.
- **Tailfins / stabilizers** — optional small vertical planes; cheap silhouette spice that
  distinguishes hero from enemy.

Enemies reuse this vocabulary with the parts dialed to read as *other*: no canopy (drone),
oversized engine (kamikaze rusher), no wings (turret/mine), radial symmetry (elite).

### 1.4 Motion and "feel" as part of the shape read

The format sells life through cheap, constant motion, not detail:

- **Banking roll** on steering — the ship visibly rolls into horizontal movement, pitches
  into vertical. The tilt re-lights the flat faces, so steering *changes the shading*, which
  is most of why the low-poly ship feels alive.
- **Idle bob / drift** — a tiny sinusoidal sway so nothing is ever perfectly still.
- **Scale-with-distance culling** — distant craft are small and fog-dimmed; they pop to full
  color as they close. The draw limit is a feature (see palette / fog below).

---

## 2. Palette-count conventions

### 2.1 How few colors

Flat shading means each craft is defined by a **small ramp of a base hue**: one base color,
plus 2–4 brightness steps of that same hue for the lit/shadowed faces, plus 1–2 accent
colors (canopy, insignia stripe, engine). Call it **4–8 distinct flat colors per craft**,
and most of those are shades of one or two hues. There is no "material" system; a color IS
the material.

A whole sector's on-screen palette — hero + a wave of enemies + terrain + sky + HUD — lived
comfortably inside a **couple dozen distinct colors**. Restraint was the hardware's demand
and became the look: a coherent, poster-like image where every color is doing a job.

### 2.2 Sectors differentiate by palette alone

Themes are **palette swaps of the same structural grammar**, not new art pipelines:

- An **asteroid/belt** sector: cool greys and slate blues, a near-black star field, dull
  rust accents on rock.
- An **ocean world**: saturated teal water plane, lighter cyan haze, warm sky band at the
  horizon.
- A **fleet battle**: steel greys and warning-orange running lights against deep space.
- A **fortress/surface approach**: desaturated tans and gunmetal, a hazy warm sky.
- A **core/finale**: high-contrast, hotter accents (magenta/amber) against dark, to read as
  "deepest and most dangerous."

The lesson for us: **one geometry grammar, N palette + fog + prop-tint configs.** A sector is
a color scheme plus which props spawn, not a bespoke asset set. This is exactly what lets a
seeded encounter grammar (M4) theme cheaply.

### 2.3 Period-honest dithering

At this shading/poly budget, gradients and "soft" transitions are faked with **ordered
dithering** — a fixed cross-hatch/Bayer pattern of two flat colors that the eye blends. It
shows up in:

- **Sky / horizon bands** — a dithered vertical ramp from a lighter horizon color to a
  darker zenith, because a true smooth gradient wasn't free.
- **Fog fade at the draw limit** — objects dissolve into the fog color through a dither
  rather than a smooth alpha, at the far plane.
- **Soft-edged UI fills and shadows** — a 50% dither reads as a translucent panel without
  needing real transparency.

For us, dithering is the *only* sanctioned texture-substitute (Streamline law: no texture
pipeline, flat colors and dithering only). A screen-space Bayer threshold in the fragment
shader gives us period-honest sky ramps and fog fades for free, and it is a deliberate
in-register choice, not a limitation to apologize for.

---

## 3. UI anatomy

The HUD must read at a glance during fast on-rails combat: the player is tracking a reticle
and dodging, and can only spend flick-glances on the instruments. Everything is placed at a
screen edge or corner, high-contrast, and shaped so it reads pre-attentively.

### 3.1 The standing elements

- **Radar / sector scope.** Usually a bottom-center element: a small top-down or forward-
  arc plot showing blips for nearby enemies and objectives relative to the player's heading.
  Its whole job is "where is the next threat, and is it left/right/ahead." It reads as
  *direction*, not detail. Blips are shape+color coded (threat vs objective vs ally), never
  color alone — which is exactly our accessibility law, and it happens to match the format.
- **Health / shield meter.** A prominent bar or segmented gauge, typically a top or bottom
  corner. Often two coupled readouts: an integrity/shield value that regenerates or is
  restored by pickups, over a harder hull/lives floor. Segmented (discrete chunks) reads
  faster under stress than a smooth bar, and pairs a shape change with the color change.
- **Score.** A running numeric readout, a top corner, unobtrusive — it's for the results
  screen and the medal chase, not for moment-to-moment steering.
- **Lives / continues.** Small iconic counter (little ship glyphs), a corner. Iconic, not
  numeric, so it reads instantly.
- **Lock-on reticle.** Center-screen, the single most important element. See below.
- **Contextual callouts.** Distress/threat/objective messages appear briefly near center-top
  or as screen-edge indicators (an off-screen threat gets an edge arrow). Under our
  accessibility law these are never audio-only — every callout has a visual equivalent.

### 3.2 The reticle and lock

The reticle is two coupled parts:

- A **convergence reticle** — where the twin shots will cross. Because guns are wing-mounted
  and converge at a set distance, the aim point is not a single ray; the reticle shows the
  convergence, and shots visibly angle inward to meet there. This is a real gameplay read,
  not decoration: it tells you the range at which your fire is tightest.
- A **lock indicator** — when the charge/lock system (SF64 layer, see §5) acquires a target,
  the reticle changes *shape* (brackets close, a ring completes, a marker snaps onto the
  enemy) and *color*, and the subsequent charged shot homes. The state change must be a
  shape change, not a color change alone (accessibility law + it reads faster).

### 3.3 Legibility discipline

- High contrast against any sector palette — HUD elements carry their own outline or drop-
  shadow (often a 1px dither shadow) so a bright element stays legible over a bright sky.
- Fixed screen positions — the HUD does not move with the camera; it is a stable frame.
- Minimum size floor — text and icons are sized to read at speed and at a distance from the
  screen; our M9 audit makes this a hard test (min-size/contrast floor), but the floor is a
  design input from M1.
- Icon-first — numbers are for the results screen; in-flight state is icons, bars, and the
  reticle.

---

## 4. Mission flow

The run is a short, legible loop. The 1993 structure and the 1997 refinement share the same
spine; the later game layered choice and QoL onto it.

### 4.1 The spine

1. **Briefing.** A commander/briefing figure frames the mission: who the enemy is, where the
   sector is, what the objective is. Short, characterful, sets stakes and tone. (In our
   build this is Commander Cuckoo, from M5 — not M1.)
2. **Sector map / route select.** A **branching route chart**: nodes are levels, edges are
   the paths between them, and the player's performance decides which branch opens. This
   chart is the whole reason the format maps cleanly onto a roguelite — it *is* a run map.
   Branches split into easier/harder paths to distinct later sectors and a distinct finale.
3. **Level (on rails).** The camera flies a fixed forward path; the player has screen-space
   freedom (steer within the frame, roll, brake/boost along the rail) but does not choose the
   route through the level. Waves of enemies, obstacle fields, terrain, and scripted
   set-pieces stream past. Radio chatter (allies, the comms officer, the enemy) plays over
   the top. Performance is tracked (hits, hit-rate, allies kept alive) toward a medal.
4. **Boss.** The level climaxes on a single large enemy with **readable telegraphs** —
   wind-up animations, a color/shape tell before an attack, exposed weak points that open on
   a cycle. The fight is a pattern-read, not a stat check.
5. **Results.** Score, hit-count, medal awarded or missed, allies' status, and — crucially —
   *which branch the performance unlocked.* Then back to the route chart for the next node,
   or to the run's end.

### 4.2 On-rails vs all-range

The default level is **on rails**: fixed forward camera, screen-space ship control. A small
number of encounters (notably some bosses, and a handful of arena set-pieces in the later
game) open into **all-range mode**: a bounded free-flight arena with a chase camera, u-turn
and somersault maneuvers, full 360° movement. All-range is powerful but expensive — it is a
different camera and control regime bolted onto the same ship. Per DESIGN-SEED it is
**rail-boss-required, all-range-boss stretch-only, cut on the first sign of camera/control
instability, and never in a normal level.** This study flags it as the single biggest
"feel" risk in the format precisely because it doubles the control problem.

### 4.3 The branch gate must be legible *during* the level

A subtle but load-bearing point: the criteria that open a harder/better branch (hit-rate,
allies kept alive, a hidden objective, a time/medal pace) have to be **readable while you
play**, not revealed only at the results screen — otherwise a branch choice is blind luck,
not an informed decision. DESIGN-SEED makes this explicit (visible in-level medal-pace
indicator, M5). The format's own results-screen-only version is the weaker version; we
improve on it deliberately.

---

## 5. Where the 1997 QoL layer attaches

The successor kept the spine above and layered mechanics onto it. Each maps to a milestone:

- **Charge shot + lock-on** (our M3). Holding fire charges a stronger shot; while charging,
  the reticle acquires a lock on a target in the crosshairs; releasing fires a homing
  charged shot. Adds a risk/reward beat (stop tapping, hold, expose yourself briefly) and a
  target-priority read. Attaches at the *reticle* (§3.2) and the *combat loop*.
- **Deflection roll** (our M3). A quick double-tap roll (the "barrel roll") spins the ship
  and, for its brief duration, deflects incoming fire. It is the format's parry: a timing
  move with a clear tell. It **must** have a readable cue — a shape/color flash on the ship
  during the deflect window — because a color-only or invisible parry window fails both the
  accessibility law and basic fairness. Attaches at *flight* (the roll) and *combat* (the
  deflect window + its cue).
- **Brake / boost** (our M2). A meter the player spends to surge forward (close distance,
  dodge through) or brake (drop back, let a threat pass). Adds a spacing/tempo layer to
  otherwise-fixed rail progression. Attaches at *flight/camera* (rail speed modulation) with
  a *meter* on the HUD.
- **Squadron chatter + rescue** (our M7). Allied wingmates fly alongside, call out threats
  and their own trouble, and can be saved (or lost) by responding to a distress beat. In our
  scope v1 wingmates are **narrative distress/rescue + a passive support bonus only** — live
  AI-controlled wingmate *combat* is the named cut (a second combatant AI is a real scope
  cliff). Attaches at *encounter scripting* and *audio barks*.
- **Per-level medals** (our M5). A performance award (hit-count / hit-rate / no-ally-lost
  threshold) that both rewards mastery and, here, **gates branches**. Attaches at *results*
  and the *branch gate*.

None of these change the spine; they thicken the moment-to-moment and the choice structure.
That is exactly why DESIGN-SEED builds the spine first (M2–M5) and audits the QoL layer as a
completeness gate at M9 rather than treating any single QoL feature as a milestone unto
itself.

---

## 6. What we deliberately do NOT take (clean-room + streamline boundaries)

- No character, ship, or place names from the reference — ours are our own (memorial cast +
  generated strays). Described here are conventions of a *format*, never a specific fiction.
- No copied sprites, traced silhouettes, or lifted palette bytes — every color and vertex in
  this project is authored/generated by our own code from the *principles* above, not from
  any asset.
- No texture-art pipeline — flat colors and ordered dithering only (§2.3).
- No all-range *normal* levels — rail is the default; all-range is boss-gated and stretch
  (§4.2).
- No alternate vehicle set-pieces (ground-tank / submarine analogs) — named cut.
- No live wingmate combat participation — named cut.
- No multiplayer, no open world, no story campaign past run-framing + hub barks.

---

## 7. Direct consequences for our substrate (M1) and beyond

The study earns its keep only if it constrains code. The load-bearing takeaways:

- **Flat shading is the whole renderer.** One directional light + ambient floor, one flat
  color per face computed from the face normal. No per-pixel lighting, no smooth normals, no
  texture sampling. This is *less* code than a modern pipeline, and it is the correct amount
  of code. (M1 substrate.)
- **Depth buffer, not painter's sort.** The 1993 chip's scarcest resource is exactly what
  `gl.DEPTH_TEST` gives us for free; leaning on it is the whole reason for WebGL over a JS
  rasterizer. (M1 pass/fail gate.)
- **Distance fog is period-honest AND a draw-limit tool.** A short view distance with a fog
  fade to the sky color is in-register (the reference never drew far either) and bounds the
  draw cost. Implement it as a fragment-shader fog blend to the sector's sky color. (M1
  onward.)
- **A craft is a small triangle cluster from the §1.3 vocabulary.** Ship meshes are code-
  generated from that parts list, not imported. Silhouette-first, bilateral symmetry, 4–8
  flat colors. (M1 test object is the first, deliberately minimal, instance of this.)
- **Sectors are palette + fog + prop configs over one grammar.** Build the theming as data
  (a small color/fog/prop struct per sector), never as bespoke per-sector art. (M4/M5.)
- **The HUD is a fixed, high-contrast, icon-first frame** with shape+color state coding from
  the start (never color-only), because the accessibility law and the format agree. (M2
  onward; audited M9.)
- **Motion sells the low-poly forms** — banking roll on steer, idle bob, boost-brightened
  engine. Cheap, constant, and most of the "alive" read. (M2 flight feel.)

This document is the reference gate. When a later milestone makes an art or UI call, it
cites a section here or explains why it departs.

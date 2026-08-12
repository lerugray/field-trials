# Ray playtest observations — M11 build, 2026-08-03 (BANKED for the next fix batch)

Ray's directive: do NOT start on these yet; batch them into the next group of fixes
(the M12 / Part B contract). Raw observations verbatim-close, with overlap notes
against already-staged items where they exist.

## Audio
- **There is a click in the ambient audio.** (Likely the 6-min placeholder cut's loop
  seam / Opus edge-padding — the cut was fade-in/fade-out, not a crossfade loop.
  Fix candidate: sample-exact seamless loop with tail→head crossfade.)

## Towns / cities
- Towns/cities don't seem fully built out — **all locations share the same screen.**
- Some text on those screens **needs formatting help**.
- **Talking with individuals or towns doesn't seem to work.**
- **Trading/bartering should probably be an option** if NPCs are willing to talk.
  (Overlaps cp-014 item-economy direction — "the whole game is items".)

## World map
- **Fewer NPCs on the world map at one time**, except maybe in dangerous or populated
  areas.
- **Terrain could use more color** to differentiate things. (Overlaps the staged
  dither-density trial + Part B visual items.)

## Encounters / combat feedback
- Talking to NPCs/enemies should produce **their own prose**, in addition to joining.
- **Still no screen/beat when you kill something** (and: do characters gain
  experience? — intersects the M10 ratify item "no-XP statline lock", still
  unratified) **or when an NPC joins you**.
- **Enemies not visible in first-person mode** (last played build) — except after
  fleeing from one, at which point they became visible. Verify against M11.

## Stats / onboarding
- **Somewhere needs to explain how the stats work** — "even I don't know frankly lol."

## Pacing (design-axis, Ray)
- The game needs different pacing than usual: little-to-no narrative means **the
  initial area must be more forgiving** than the rest of the game.
- Characters should be able to get **experience (or decent gear) before their first
  dungeon**.

## Second wave (same playtest, later)

### Diagnosability
- **A log of Ray's games / what is displaying** — "there is some weirdness i am
  struggling to describe." A player-visible session/event log (and/or a dumpable
  game log the orchestrator can read) so undescribable weirdness becomes
  reportable and diagnosable.
- **Talk outcomes are not obvious** — can't always tell what the result of talking
  with an NPC was.

### Bugs / gaps
- **First-person enemy icons are bugged** — sometimes visible, sometimes not
  (sharpens the earlier FP-visibility item: it's intermittent, not absent).
- **No way to recover HP** as of now — towns (or whatever else would heal) aren't
  functioning.

### Party system
- Possibly a **party-management screen**.
- **Followers should get targeted in combat sometimes** instead of the player —
  can't tell whether that's happening.
- **Follower HP / statuses missing from the HUD** where they probably belong.
- **Buff/debuff statuses**, along with the items that would apply them.
  (Overlaps cp-014's item-economy direction.)

## Wave 3 — Ray's OVERALL READ (the strategic frame for the next phase)

Verbatim-close: the game "basically needs all the QoL/Polish/Rigorous visual audit
that pro studios would put into a game. It needs to maintain its identity, but it
also needs to be enjoyable and not play too much like an art project/proof of
concept. There needs to be a meaningful loop/hook that keeps players coming back."
Ray's suggested vehicle: **the customized game-studio skill** — fan out its role
specialists (qa, ux, game-designer, systems-designer, art-director) to produce the
pro-studio audit, which becomes the next milestone contract.

Mechanic note from play: **non-traversable terrain (mud etc.) needs progression
around it** — items or gained abilities that unlock traversal into more areas.
(This slots directly into cp-014 "the whole game is items": traversal unlocks ARE
item-economy hooks, and they double as the return-loop structure — gear gates →
new areas → better gear.)

Constraint pair to hold in tension for every audit finding: **identity intact**
(DESIGN-SEED / CONTENT-IDENTITY / visual register) × **enjoyable as a GAME**
(loop, pacing, forgiving opening, reasons to return).

## Post-M12 report (Ray, 2026-08-03, playing the shipped M12 build)

- **The opening explainer window has truncated prose** (the panel that explains
  stuff at open — likely the M12 C4 "stranger's nature" chargen panel). Suspect
  the same wrap discipline A5 applied to town interiors was not applied to this
  panel, or the panel height clips the text. FIX NEXT LANE: apply wrapToWidth
  discipline + fit-or-scroll the panel; regression test on the longest string;
  visual proof capture.

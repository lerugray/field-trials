# assets/music

Operator-supplied tracks (Atmoscapia renders from prompts built on the town's own register;
credit pseudonym: Abel Aeolian). Rendered ~-16 LUFS, seamless loops, no vocals. These are EXEMPT
from CLAUDE.md hard rule 1 (clean-room / code-generated assets): that rule governs
builder-authored art; music arrives only through the operator pipeline and is never generated,
fetched, or synthesized by the game itself.

## The seven tracks

- **calm-zoning-day.ogg** — calm band, town A. Breezy 1990s city-sim jazz, cheerful and unhurried.
- **calm-b-falcon-point-morning.ogg** — calm band, town B (rotates with the above).
  Vibraphone and electric piano, sunlit but faded, one chord that never resolves.
- **uneasy-marsh-refinery-at-dusk.ogg** — uneasy band, town A. The same jazz idiom curdling into
  minor keys and longer silences, an ominous drone underneath.
- **uneasy-b-the-esoteric-order-hall.ogg** — uneasy band, town B (rotates with the above). A
  lounge trio playing an empty hall over an organ drone that isn't part of the band.
- **dread-shadows-under-the-water.ogg** — dread band. Lounge jazz dissolving into oceanic drones
  and sub-bass swells; cold, abyssal, patient.
- **recovery-the-scarred-shore.ogg** — the After the Tide scenario's calm-band track (replaces the
  standard calm rotation for that start). Somber rebuilding music for a flooded town the morning
  after.
- **doom-the-fourth-awakening.ogg** — the doom ending. A one-minute finale; plays once, not
  looped.

## How the game picks a track

`src/music.js` bands the game's state (title screen, the dread meter, the doom ending) into
`title` / `calm` / `uneasy` / `dread` / `doom`, and turns a band into a track list
(`tracksForBand`, the After the Tide scenario substituting its own calm track). Calm and uneasy
each rotate between two tracks; the other bands hold one track and loop it natively; doom plays
once and falls silent. Band changes and rotations both cross-fade (~2s). A speaker button in the
top bar mutes; the volume button beside it steps through four bed-volume levels; both persist
across sessions. The title/scenario-picker screen uses the recovery track
(`recovery-the-scarred-shore.ogg`) so the opening shares the After the Tide mood. If this folder is
absent (a bare single-file open with no `assets/music/`
alongside it), the game runs silent and the Help window's Sound line reads "tracks not found"
rather than erroring.

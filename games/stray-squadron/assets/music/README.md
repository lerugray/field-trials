# assets/music

Music tracks live here. The operator supplies them (Atmoscapia renders, credited to the
pseudonym **Abel Aeolian**); the game itself generates, fetches, and synthesizes no audio —
this is the one exemption to the code-generated-assets rule (CLAUDE.md hard rule 2).

## How the autoload hook finds a track

A small music module, wired at M9 per DESIGN-SEED's Audio section, runs at boot. If a track
is present it loops the first one at a low bed volume, with a mute toggle in the HUD. If
none is present the game stays silent.

A double-clicked `file://` build cannot list this directory, so the hook probes a short list
of candidate filenames in order and plays the first that loads successfully:
`track1.ogg`, `track01.ogg`, `theme.ogg`, `01.ogg`, `straysquadron.ogg`.

So the simplest path: drop the primary track in here named **`track1.ogg`**.

Format: `.ogg` (Vorbis), looped seamlessly. Keep it a bed appropriate to squadron-briefing/
flight tension per sector — quiet enough to sit under barks and SFX, never drowning them.

Credit the track to **Abel Aeolian** wherever the build surfaces a credits/about screen.

## Title theme socket (M12)

The title screen has a wired-but-empty music slot. Drop the piece in here named
**`ss-title-theme.ogg`** and it loops under the title as a quiet bed (same volume
ceiling and mute rules as every other track). Until that file exists the title stays
silent by design — the slot is wired (`MUSIC_TRACKS.title`, `trackForPhase('title')`),
nothing is generated. The title's menu move/confirm SFX are a separate socket in
`src/audio/titlesfx.js`, also silent until the operator supplies samples.

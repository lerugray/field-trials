// Music bed playback — the M9 audio deliverable. DESIGN-SEED: "The builder wires
// playback (loop, mute-capable, bed volume) at M9; it never generates or edits the
// tracks themselves." The three operator-supplied Atmoscapia tracks (credited to
// Abel Aeolian) live in assets/music/; this module loops the right one under each run
// phase, keeps it a quiet bed, and honours the master-mute + music-volume settings.
//
// Split in two: a PURE phase->track selector (headless-tested), and a thin driver
// over an injectable audio-element factory (real HTMLAudioElement in the browser, a
// fake in tests) so loop/volume/switch/mute behaviour is all covered by node --test.

// Logical tracks -> the shipped files + the required Abel Aeolian credit.
// `title` (M12) is a SOCKET: the slot + intended filename are wired, but the operator
// records the piece next session, so no file is shipped yet. Until the file lands the
// driver simply plays nothing because the build supplies no source for it.
export const MUSIC_TRACKS = {
  hangar: { file: 'ss-hangar-between-runs.ogg', title: 'Hangar, Between Runs' },
  corridor: { file: 'ss-main-corridor-run.ogg', title: 'Main Corridor Run' },
  fanfare: { file: 'ss-fanfare-mission-clear.ogg', title: 'Mission Clear Fanfare' },
  title: { file: 'ss-title-theme.ogg', title: 'Title Theme', pending: true },
};
export const MUSIC_CREDIT = 'Music by Abel Aeolian';
// scripts/build.js replaces this empty source-mode map with embedded data URIs.
// Tests can inject their own map through createMusicPlayer's `sources` dependency.
export const MUSIC_SOURCES = {};

// A bed sits UNDER barks and SFX. The music-volume setting [0..1] is scaled by this
// ceiling so even "full" music never drowns the mix.
export const BED_CEILING = 0.6;
// The fanfare is a one-shot flourish, not a loop; everything else loops.
const LOOPING = { hangar: true, corridor: true, fanfare: false, title: true };

// Which track belongs under a run-flow phase. Pure. `victory` distinguishes a
// mission-clear results screen (fanfare) from a ship-down one (back to the hangar bed).
export function trackForPhase(phase, opts = {}) {
  switch (phase) {
    case 'title':
      return 'title';    // M12 socket: silent until the operator supplies the file
    case 'hub':
    case 'briefing':
      return 'hangar';
    case 'level':
    case 'map':
    case 'debrief':
      return 'corridor';
    case 'results':
      return opts.victory ? 'fanfare' : 'hangar';
    default:
      return null; // unknown phase -> leave whatever is playing
  }
}

// Effective element volume for a track, given the music-volume setting and mute.
export function bedVolume(musicVolume, muted) {
  if (muted) return 0;
  const v = Number.isFinite(musicVolume) ? musicVolume : 0.5;
  return Math.max(0, Math.min(1, v)) * BED_CEILING;
}

// The driver. `deps`:
//   makeAudio()   -> a fresh audio element ({ play, pause, src, loop, volume, currentTime, load? })
//   getVolume()   -> current music-volume setting [0..1]
//   isMuted()     -> current master-mute state
//   sources       -> filename:data-URI map (defaults to the build-injected map)
// Browser call site: createMusicPlayer({ makeAudio: () => new Audio(), getVolume, isMuted }).
export function createMusicPlayer(deps) {
  const makeAudio = deps.makeAudio;
  const getVolume = deps.getVolume || (() => 0.5);
  const isMuted = deps.isMuted || (() => false);
  const sources = deps.sources || MUSIC_SOURCES;

  let el = null;        // the live audio element
  let current = null;   // logical track name currently loaded
  let started = false;  // has a real play() been attempted (browsers gate on a gesture)

  function applyVolume() {
    if (el) el.volume = bedVolume(getVolume(), isMuted());
  }

  // Load + play a logical track. No-op if it is already the current one (keeps it
  // playing seamlessly across phase changes that map to the same track).
  function switchTo(track) {
    if (!track || !MUSIC_TRACKS[track]) return;
    const source = sources[MUSIC_TRACKS[track].file];
    if (!source) return;
    if (track === current && el) { applyVolume(); return; }
    if (el && el.pause) el.pause();
    el = makeAudio ? makeAudio() : null;
    current = track;
    if (!el) return;
    el.src = source;
    el.loop = !!LOOPING[track];
    applyVolume();
    if (started) tryPlay();
  }

  function tryPlay() {
    if (!el || !el.play) return;
    try {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {}); // autoplay-blocked -> silent
    } catch (e) {
      /* no audio available -> silent */
    }
  }

  return {
    // Call once after a user gesture (or at boot) to allow playback to begin.
    start() {
      started = true;
      tryPlay();
    },
    // Drive from the run phase. Switches track only when the phase maps to a new one.
    setPhase(phase, opts) {
      const track = trackForPhase(phase, opts);
      if (track) switchTo(track);
    },
    // Re-read volume/mute (call when the setting or master-mute changes).
    refresh() { applyVolume(); },
    // Introspection for tests / a credits surface.
    currentTrack: () => current,
    isPlaying: () => started && !!el,
    _el: () => el, // test hook
  };
}

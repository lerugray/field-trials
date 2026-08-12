# LINES OF ADVANCE — placeholder SFX pack manifest

Staging dir: `loa-sfx-staging/` (this file's directory). Two sources, kept in separate
subfolders: `ms20/` (first-party, operator-owned) and `lichess/` (public reference, license-
gated — see verdict below).

All MS-20 candidates were selected sight-unseen (no audio playback available in this session) via
three proxies: **filename semantics** (kd=kick/thock, sd=snare, ch=closed-hat/click, oh=open-hat,
bell/marimba=pitched, noise/square=buzz), **ffprobe duration**, and **ffmpeg `silencedetect`**
(at -35dB threshold) to confirm each candidate has a fast attack + short decay rather than being a
sustained pad. Files whose loud content ran long (bell, boom, square, heavy-noise, droplet,
arcade-class) were trimmed to isolate the transient+short tail before normalizing.

## HALF 1 — MS-20 (operator-owned, `ms20/`)

Source library: `/Users/rayweiss/Desktop/Dev Work/ray-samples/Homebrew MS 20/` (132 files
total, browsed read-only — nothing in the source library was moved, renamed, or altered).
Processing: trim (where noted) with a short fade-out to avoid a click at the cut, then
`ffmpeg loudnorm` (target -16 LUFS integrated, -1.5 dBTP ceiling, LRA 11) → mono, 44.1kHz,
16-bit PCM WAV.

**Caveat on loudnorm accuracy:** single-pass `loudnorm`'s integrated-loudness measurement is
built for continuous program material (music, dialog) and is known to be imprecise on
sub-second percussive one-shots like these — most of each file is nearly silent decay, so the
measured "Output Integrated" figures below drift from the -16 LUFS target (range: -10.8 to
-24.6 LUFS measured). **True peak was NOT compromised** — every file's actual peak sits between
-1.5 and -3.5 dBTP (verified via `ffmpeg astats`), so nothing clips and levels are in a sane,
consistent-enough range for placeholder use. A proper pass (peak-normalize + manual gain-match
by ear) is recommended before ship, once these are actually auditioned.

| Staged file | Proposed role | Source file (original, untouched) | Duration | Processing | Measured loudness (in→out LUFS) |
|---|---|---|---|---|---|
| `select-click-a.wav` | Piece select (primary) | `ms20-ch2.wav` | 0.52s | fade-out 50ms, loudnorm | -26.9 → -23.2 |
| `select-click-b.wav` | Piece select (alt) | `ms20-ch4.wav` | 0.62s | fade-out 50ms, loudnorm | -28.4 → -24.6 |
| `move-thock-a.wav` | Piece move/place (primary) | `ms20-sd5.wav` | 0.95s | fade-out 80ms, loudnorm | -23.6 → -19.6 |
| `move-thock-b.wav` | Piece move/place (alt) | `ms20-kd5.wav` | 1.00s | fade-out 80ms, loudnorm | -18.8 → -16.0 |
| `capture-hit-a.wav` | Capture (primary) | `ms20-kd1.wav` | 1.26s | fade-out 100ms, loudnorm | -23.0 → -18.5 |
| `capture-hit-b.wav` | Capture (alt) | `ms20 perc2.wav` | 1.33s | fade-out 100ms, loudnorm | -20.4 → -16.0 |
| `capture-heavy-c.wav` | Capture (heavier variant) | `ms20 boom.wav` | 1.30s | **trimmed from 2.17s**, fade-out 150ms, loudnorm | -30.7 → -24.6 |
| `error-buzz-a.wav` | Error / illegal move (primary) | `ms20 heavy noise.wav` | 0.90s | **trimmed from 2.29s**, fade-out 150ms, loudnorm | -22.9 → -20.8 |
| `error-buzz-b.wav` | Error / illegal move (alt, buzzier) | `ms20 square.wav` | 0.60s | **trimmed from 3.92s**, fade-out 100ms, loudnorm | -19.0 → -10.8 (hot — gain-check before use) |
| `reset-swoosh-a.wav` | Board reset | `ms20-oh1.wav` | 1.22s | fade-out 100ms, loudnorm | -24.7 → -17.8 |
| `save-chime-a.wav` | Save / confirm | `ms20 marimba2.wav` | 1.38s | fade-out 150ms, loudnorm | -22.4 → -22.0 |
| `check-alert-a.wav` | Check-style alert (primary) | `ms20 bell3.wav` | 1.47s | **trimmed from 3.07s**, fade-out 300ms, loudnorm | -23.7 → -11.5 (hot — gain-check before use) |
| `check-alert-b.wav` | Check-style alert (alt) | `ms20-bell2.wav` | 1.45s | **trimmed from 3.55s**, fade-out 300ms, loudnorm | -24.2 → -12.4 (hot — gain-check before use) |
| `notify-droplet-a.wav` | Generic notify / soft confirm | `ms20-droplet3.wav` | 1.00s | **trimmed from 1.81s**, fade-out 150ms, loudnorm | -22.6 → -17.6 |

License status: **operator-owned first-party** (Ray's own MS-20 hardware-synth recordings,
`ray-samples` library — the standing preferred/license-clean source per project convention).
Clear to ship as-is.

## HALF 2 — lichess reference set (`lichess/`, provenance-gated)

Fetched from `github.com/lichess-org/lila`, `public/sound/standard/` (the default "standard"
sound set — the one covering the requested board-play events: move, capture, check, error,
plus select/confirmation/notify as the closest equivalents to "reset"/"save"/"notify").

| Staged file | Nearest board-event equivalent | Duration | Source URL |
|---|---|---|---|
| `Move.mp3` | Piece move | 0.20s | github.com/lichess-org/lila/blob/master/public/sound/standard/Move.mp3 |
| `Capture.mp3` | Capture | 0.37s | .../public/sound/standard/Capture.mp3 |
| `Check.mp3` | Check alert | 0.03s (near-silent by design) | .../public/sound/standard/Check.mp3 |
| `Error.mp3` | Error / illegal move | 0.14s | .../public/sound/standard/Error.mp3 |
| `Select.mp3` | Piece select | 0.25s | .../public/sound/standard/Select.mp3 |
| `Confirmation.mp3` | Save / confirm | 0.24s | .../public/sound/standard/Confirmation.mp3 |
| `GenericNotify.mp3` | Generic notify | 0.63s | .../public/sound/standard/GenericNotify.mp3 |

Also saved: `lila-COPYING-full.md` (the full asset-credits doc, verbatim) and
`LICENSE-FINDINGS.md` (the reasoning below, with quotes and links).

### License verdict: NOT freely licensed — reference only, never ship

lila's repo is AGPL-3.0 for **code**, but its own `COPYING.md` explicitly carves media assets
out into a credits table. Only five sound sub-folders get a stated free license
(`futuristic`, `nes`, `piano`, `sfx` → AGPLv3+ per author "Enigmahack"; `lisp` → CC BY-NC-SA 4.0
per "EdinburghCollective"). The **`standard/`** set we need (Move/Capture/Check/Error/etc.) is
**not** one of those five — it falls under `COPYING.md`'s catch-all line *"The other sounds in
public/sound"*, which is listed under the doc's own **"Exceptions (non-free)"** heading, with
**no author credited and no license granted**. That is lila's own project stating these specific
files are outside the AGPL and not permissively licensed — full detail and quoted lines in
`LICENSE-FINDINGS.md`.

**Verdict: internal reference only. Do not ship these files, or a close derivative/re-recording
of them, in LINES OF ADVANCE.** They're useful only to study lichess's UX conventions (which
events get sound, relative pitch/brightness, how short "Check" is).

## Recommendation — board-event → file mapping

Preferring MS-20 everywhere both exist, per the brief:

| Board event | Recommended file | Backup |
|---|---|---|
| Piece select | `ms20/select-click-a.wav` | `ms20/select-click-b.wav` |
| Piece move/place | `ms20/move-thock-b.wav` (fuller body, closer to -16 LUFS as measured) | `ms20/move-thock-a.wav` |
| Capture | `ms20/capture-hit-b.wav` (measured closest to -16 LUFS) | `ms20/capture-hit-a.wav`, or `ms20/capture-heavy-c.wav` for a weightier variant on major captures |
| Error / illegal | `ms20/error-buzz-a.wav` (buzz-b is louder/hotter — usable but gain-trim first) | `ms20/error-buzz-b.wav` |
| Reset | `ms20/reset-swoosh-a.wav` | — |
| Save / confirm | `ms20/save-chime-a.wav` | — |
| Check-style alert | `ms20/check-alert-a.wav` (gain-trim, currently hot) | `ms20/check-alert-b.wav` |
| Generic notify | `ms20/notify-droplet-a.wav` | — |

All slots are filled from MS-20; the lichess set is not used in the recommendation (reference
only, per the license verdict). Before final integration: audition every MS-20 file by ear
(this pass was duration/waveform-only, no listening) and manually gain-match the three files
flagged "hot" above.

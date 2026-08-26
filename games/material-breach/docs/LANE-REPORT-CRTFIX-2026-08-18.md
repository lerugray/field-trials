# Lane report — MATERIAL BREACH text/CRT layering fix

Date: 2026-08-18  
Lane: Kimi Code CLI (sole lane for this tree)  
Battery: **205 pass / 0 fail** (`node --test`)

## What Popinjay does

Popinjay keeps its pixel-art buffer at the native low resolution and then, after presenting it,
paints all body/UI text on a second, display-resolution layer. The CRT/pixel treatment stays on
the art; the words sit on top of it, crisp. The relevant hooks are in `popinjay/src/render/px.js`:
`beginTextLayer`, `takeTextLayer`, and `paintTextLayer` queue logical 640x360 text commands and
paint them at the final display scale.

## What MATERIAL BREACH did before

MB rendered everything — facility section, ledger, buttons, and overlays — into one 640x360
buffer, then scaled that single buffer to the viewport. The CRT register (ordered dither, pixel
scale, composed paper/desk surfaces) was therefore being applied to the text as well as the art,
because the text was part of the same low-res raster. The result is visible in the `before-*`
frames: the charter body and ledger rows are readable, but they sit *under* the CRT treatment
instead of on top of it.

## What changed

The same carve-out Popinjay uses was added to MB:

- `src/render.js` now has a text-layer queue (`beginTextLayer` / `takeTextLayer` /
  `paintTextLayer`). When a layer is active, `text()` enqueues logical-coordinate commands
  instead of drawing into the passed context. `pushTextClip` / `popTextClip` mirror every
  `ctx.save/clip/restore` site so text is still clipped to its panel at display scale.
- `src/boot.js` creates a second `#text` canvas, sizes it to `640*scale*dpr x 360*scale*dpr`,
  centers it over the `#screen` canvas, and each frame calls `beginTextLayer()`, `render(ctx,
  view)`, then `paintTextLayer(textCtx, takeTextLayer())`. The pixel-art buffer stays pixelated;
  the text layer rasterises at display resolution.
- `scripts/build-singlefile.mjs` emits the `#text` canvas and its absolute-centering CSS so the
  shipped `dist/index.html` has the same two-canvas setup as the dev build.

Overlay wrinkle: when a document overlay (title, options, provenance, etc.) is open, the desk
beneath it is dimmed. If the pre-overlay desk text were queued to the crisp layer, it would read
sharp on top of a darkened scene. `render()` therefore flushes the text queue before the desk is
drawn when an overlay is active, letting that text fall back to the pixel-art buffer and be hidden
by the dim. It then starts a fresh crisp layer for the overlay's own text and the buttons above
it. Direct `render(ctx, view)` callers (the unit tests) that did not call `beginTextLayer()` keep
drawing text into `ctx` exactly as before.

`test/opening-masthead.test.js` was updated because the corrupt-save notice now lives on the text
layer. The contrast measurement composites the `#screen` and `#text` canvases at display
resolution, samples ground from a clear point on the paper slip in the pixel-art buffer, and takes
ink as the most contrasting pixel in the composite.

## Verification

- `node --test`: 205 pass, 0 fail.
- Boot→render check: the built `dist/index.html` was loaded in Playwright, navigated from the
  title through the orientation packet to the admin desk, and captured without console/page
  errors.

## Frames for the independent look

All captured at 1280x720 from the built `dist/index.html`:

- `docs/look-crtfix-20260818/before-title-2026-08-18T16-32-58.png`
- `docs/look-crtfix-20260818/before-desk-2026-08-18T16-32-58.png`
- `docs/look-crtfix-20260818/after-title-2026-08-18T16-39-32.png`
- `docs/look-crtfix-20260818/after-desk-2026-08-18T16-39-32.png`

The `before` frames were captured from the pre-fix HEAD build; the `after` frames from the final
fixed build. No push was made.

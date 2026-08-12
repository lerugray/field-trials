# STUDY — the bench art and photosensitivity contract

M4 translates the locked register into rendering rules: a candlelit alchemist's
bench at night, built from glass, brass, slate, ink, flame, and slag. The four
acts change the room's light and working materials as well as the machine rule.
This is a code-generated rendering specification, not an asset list.

## 1. Photosensitivity precedes effects

- No effect may invert, bleach, or flash the full 384×216 frame. Transient light
  is spatially bounded to the well, gauge, card, or prop that caused it.
- Chain fire is capped at **two simultaneous blooms per composed scene**. A duel
  can show one bloom over each well; additional sparks become non-flashing motes.
- `AL.VISUALS.flashIntensity` is the single global intensity setting. It is
  clamped to 0..1, defaults to 0.65, and scales every clear, chain, dross,
  athanor, and cast flash. Setting it to zero removes flashes while preserving
  silhouettes, motion, engraved readouts, and action meaning.
- No critical message relies on a flash. CHAIN/COMBO text, dross geometry,
  cursor brackets, gauge fill, and danger-column flags remain visible at zero.
- Repeating pulses stay at or below 3 Hz. Ambient flame movement is a low-amplitude
  luminance drift, not an on/off pulse. Stop-time never introduces a new flash.
- The default chain bloom lifetime is at least 0.45 seconds with a smooth decay;
  dross crush and transmute use falling dust or a traveling seam, not a frame cut.

## 2. Bench composition

- A scene is one picture: masonry wall, slate worktop, recessed wells, shared
  practical lights, and side props establish depth before HUD chrome is applied.
- Materials are never flat fills. Stone and paper carry deterministic fbm grain;
  brass has a bright key edge, midtone body, dark bevel, and small fasteners;
  glass has a cool body, dark far rim, and a narrow specular catch.
- Lighting is composited after albedo. Warm practical flame keys the lower bench;
  each act supplies a cool or colored counter-light without replacing reagent
  identity colors.
- The playfield remains the highest-contrast working surface. Props live in the
  margins and may not cover a well, cursor, action readout, or incoming warning.

## 3. Act signatures

- **Nigredo:** soot, cold-blue fill, blackened iron, a dense low flame.
- **Albedo:** pale mortar, silvered glass, bone paper, a clean white counter-light.
- **Citrinitas:** wax, candle gold, honey glass, an open warm lamp.
- **Rubedo:** banked coals, deep red stone, copper-red glass, a hotter narrow flame.

## 4. Action vocabulary

- Dissolution empties the phial body into rising vapor curls; it does not become
  a white rectangle.
- A chain grows a warm alchemical fire with link-count sparks. A combo produces
  a cooler expanding ring. The engraved text vocabulary remains distinct.
- Incoming dross is forecast as suspended slag chips. Crush lands with a downward
  dust fall and a brief brass-frame shudder mark. Transmutation travels along the
  slab's bottom seam and reveals live reagent silhouettes.
- Formula casts use the brew's target geometry (column, row, type, or dross seam)
  plus the persistent active-bar/gauge response; never a generic screen flash.

## 5. Acceptance fixtures

- Render the bench PoC and every act's live bout to committed dated PNGs.
- Render clear/chain/combo, incoming/crush/transmute, and folio surfaces in proof.
- Tests pin flash-intensity clamping and zero-flash action redundancy, the two-bloom
  cap, deterministic bench output, material tonal range, and per-act distinction.

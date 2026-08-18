# POPINJAY typography proof — 2026-08-14

Final capture sweep for commit `94f5ce6`.

- Pairing: Rye (display/wordmark/headings) + Old Standard TT (body/HUD/panels).
- Provenance: vendored Google Fonts data under `vendor/fonts/`, with SIL OFL 1.1
  license text beside each family.
- Artifact: fonts are base64-embedded and registered from the offline single-file
  `dist/popinjay.html`; no runtime font request is made.
- Coverage: 27 staged surfaces at both fixed proof viewports, 1280×800 and 1440×900
  (54 PNGs total, DPR 1).
- Result: all capture gates passed—no page error, console error, debug-log error,
  missing present box, or canvas-fill failure.
- Commands: `npm test`, `npm run build`, and `npm run capture -- --dpr=1`.

The sweep includes the fresh and populated title states, gameplay HUD variants,
pause, options, draft, trunk, tour map, scorecard, in-play announcements, transition,
and the loud-failure banner.

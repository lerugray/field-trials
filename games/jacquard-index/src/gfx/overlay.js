// THE JACQUARD INDEX — in-game fault overlay (loud-failure law, hard-rule 7).
//
// When the debug log holds an error, this paints a visible fault tag over the frame so
// a runtime failure can never be silent. Register: a madder-red job-ticket flag pinned
// to the top of the drafting table, not a browser alert. Pure: draws into the fb.

import { PALETTE } from './palette.js';
import { drawText, textHeight, fitText } from './font.js';

export function drawFaultOverlay(fb, log, maxLines = 4) {
  if (!log || !log.hasErrors()) return;
  const madder = PALETTE.madder;
  const lineStep = textHeight(1) + 2;
  const h = 14 + maxLines * lineStep + 6;
  // Dark backing so text stays legible over any scene.
  fb.fillRect(0, 0, fb.width, h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 230);
  fb.fillRect(0, 0, fb.width, 2, madder[0], madder[1], madder[2]);
  fb.fillRect(0, h - 2, fb.width, 2, madder[0], madder[1], madder[2]);

  const header = `! FAULT (${log.errorCount}) - PRESS F2 TO EXPORT LOG`;
  drawText(fb, 6, 4, header, PALETTE.linen, 1, 1);

  const lines = log.recent(maxLines).filter((e) => e.level === 'ERROR');
  let y = 4 + textHeight(1) + 2;
  for (const e of lines) {
    // Fit to the frame, not to 90 characters: a wide-glyph message ran off-screen.
    drawText(fb, 6, y, fitText(e.message, fb.width - 12, 1, 1), [230, 170, 160], 1, 1);
    y += lineStep;
  }
}

// Storage exhaustion is recoverable: a later edit may fit or storage may become
// available again. Show it as a bounded brass notice instead of a permanent FAULT.
export function drawSaveFailureOverlay(fb, message) {
  if (!message) return;
  const brass = PALETTE.brass;
  const h = 20;
  fb.fillRect(0, 0, fb.width, h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 230);
  fb.fillRect(0, 0, fb.width, 2, brass[0], brass[1], brass[2]);
  fb.fillRect(0, h - 2, fb.width, 2, brass[0], brass[1], brass[2]);
  const text = `! SAVE NOT WRITTEN - ${message} - EDIT TO RETRY`;
  drawText(fb, 6, 5, fitText(text, fb.width - 12, 1, 1), PALETTE.linen, 1, 1);
}

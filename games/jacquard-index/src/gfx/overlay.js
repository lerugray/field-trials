// THE JACQUARD INDEX — in-game fault overlay (loud-failure law, hard-rule 7).
//
// When the debug log holds an error, this paints a visible fault tag over the frame so
// a runtime failure can never be silent. Register: a madder-red job-ticket flag pinned
// to the top of the drafting table, not a browser alert. Pure: draws into the fb.

import { PALETTE } from './palette.js';
import { drawText } from './font.js';

export function drawFaultOverlay(fb, log, maxLines = 4) {
  if (!log || !log.hasErrors()) return;
  const madder = PALETTE.madder;
  const h = 14 + maxLines * 8 + 6;
  // Dark backing so text stays legible over any scene.
  fb.fillRect(0, 0, fb.width, h, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 230);
  fb.fillRect(0, 0, fb.width, 2, madder[0], madder[1], madder[2]);
  fb.fillRect(0, h - 2, fb.width, 2, madder[0], madder[1], madder[2]);

  const header = `! FAULT (${log.errorCount}) - PRESS F2 TO EXPORT LOG`;
  drawText(fb, 6, 4, header, PALETTE.linen, 1, 1);

  const lines = log.recent(maxLines).filter((e) => e.level === 'ERROR');
  let y = 14;
  for (const e of lines) {
    const msg = e.message.length > 90 ? e.message.slice(0, 90) : e.message;
    drawText(fb, 6, y, msg, [230, 170, 160], 1, 1);
    y += 8;
  }
}

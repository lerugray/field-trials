// THE CHARTER'S OPENING, pinned against the artifact that actually ships.
//
// Two laws meet on this one surface and they pull against each other, which is why they are tested
// together rather than separately:
//
//   THE MASTHEAD LAW (2026-08-18). Ray's verdict on the opening was that the charter "does not read
//   at all as a title screen". The game's name is now a 33px letterpress masthead across the top of
//   the sheet and the form's name is demoted to a subtitle under it. A later change that quietly
//   returns the name to a body-sized line would restore exactly the defect this was raised for.
//
//   THE COPY LAW (M8, render.js). "Copy that does not fit is copy that does not ship." The charter
//   is three paragraphs that wrap to SIX lines above the controls, and wrap() silently DROPS any
//   line that would fall below its floor. That failure is invisible: the sheet still looks finished,
//   it has just stopped making its last and most important point. It has happened once already.
//
// The masthead is the thing most likely to break the copy law, because it is big and it sits above
// the copy — so the two are asserted in one place, against the built artifact, from the renderer's
// ACTUAL draw calls rather than from a pixel heuristic. fillText is instrumented before the bundle
// runs, so what is measured is what was drawn: the string, the position and the type size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // Playwright not installed; these tests skip cleanly.
}

// The geometry these assertions are written against, restated here on purpose. A test that imported
// the numbers from the module it is testing would pass for any value of them.
const SHEET_TOP = 34;
const SHEET_BOTTOM = 314; // r.y + r.h
const CONTROLS_TOP = 206; // computeButtons: the first title control
const COPY_FLOOR = 198;
const BODY_PX = 11;
// The sheet's left margin (r.x + 16), which is where wrap() sets every line of the charter. The
// LEDGER is still drawn underneath the overlay and still issues fillText from behind it, so the
// copy has to be identified by its column and not merely by a y range — the two overlap, and a
// filter that ignored x picked up twenty-three lines of ledger for six lines of charter.
const COPY_LEFT = 92;

// The charter, verbatim. If the copy is ever rewritten this test must be updated deliberately,
// which is the point: the six lines are a design constraint, not an accident of the current wording.
const CHARTER = [
  'You are appointed facility manager of the premises overleaf.',
  'You do not adventure: you excavate, staff, requisition, pay wages and answer correspondence, then sign the cycle over and read what happened to your building while you were doing paperwork.',
  'Adventurers will raid you. They are the incident, not the opponent. Nothing here happens until you sign.',
];

// Build once for the file rather than once per test: three tests rebuilding the same artifact is
// three times the wait for one answer.
let URL_CACHE = null;
function artifactUrl() {
  if (!URL_CACHE) {
    execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'ignore' });
    URL_CACHE = 'file://' + join(ROOT, 'dist', 'index.html');
  }
  return URL_CACHE;
}

// Record every fillText the renderer issues, with the type size it issued it at. Keyed by string
// and position so a sixty-frames-a-second redraw of a still document stays bounded.
const RECORDER = () => {
  window.__DRAWN = new Map();
  const proto = CanvasRenderingContext2D.prototype;
  const real = proto.fillText;
  proto.fillText = function (str, x, y, ...rest) {
    try {
      const s = String(str);
      window.__DRAWN.set(`${s}@${x},${y}`, { str: s, x, y, font: this.font, size: parseFloat(this.font) || 0 });
    } catch {
      // never let instrumentation break the frame under test
    }
    return real.call(this, str, x, y, ...rest);
  };
};

const readDrawn = (page) => page.evaluate(() => [...window.__DRAWN.values()]);

// Own the browser lifecycle here. A failed assertion inside a test must still close the browser, or
// the leaked process keeps node alive and the run hangs instead of reporting the failure.
async function withPage(fn) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.addInitScript(RECORDER);
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function openTitle(page) {
  await page.goto(artifactUrl());
  await page.waitForFunction(() => !!window.__GAME);
  await page.waitForTimeout(400);
  return readDrawn(page);
}

test(
  'the charter opens with a masthead: the game outranks the form, in type size',
  { skip: chromium ? false : 'playwright unavailable' },
  async () => {
    await withPage(async (page) => {
      const drawn = await openTitle(page);

      const masthead = drawn.find((d) => d.str === 'MATERIAL BREACH');
      const subtitle = drawn.find((d) => d.str === 'CHARTER OF APPOINTMENT');

      assert.ok(masthead, 'the game name is not drawn on the charter at all');
      assert.ok(subtitle, 'the document subtitle is not drawn on the charter at all');

      // The masthead is display type at an integer multiple of the 11px design size, and it is BIG.
      assert.ok(masthead.size >= 22, `the masthead is ${masthead.size}px; a masthead is at least 2x the 11px body`);
      assert.equal(
        masthead.size % BODY_PX,
        0,
        `the masthead is ${masthead.size}px, not a whole multiple of the ${BODY_PX}px design size`,
      );
      assert.match(masthead.font, /MB Slab/, 'the masthead is not set in the display face');

      // The demotion, stated as an order rather than as two magic numbers.
      assert.ok(
        masthead.size > subtitle.size,
        `the form's name (${subtitle.size}px) is not smaller than the game's (${masthead.size}px); the hierarchy Ray rejected is back`,
      );

      // The masthead is the largest thing on the screen, and it is at the TOP of the sheet.
      const biggest = Math.max(...drawn.map((d) => d.size));
      assert.equal(masthead.size, biggest, `something on screen is set larger (${biggest}px) than the masthead`);
      assert.ok(masthead.y >= SHEET_TOP, 'the masthead is drawn off the top of the sheet');
      assert.ok(masthead.y < subtitle.y, 'the subtitle is not beneath the masthead');
      assert.ok(subtitle.y < COPY_FLOOR, 'the letterhead has pushed the subtitle into the copy');
    });
  },
);

test(
  'every line of the charter still ships, above the controls (the copy law)',
  { skip: chromium ? false : 'playwright unavailable' },
  async () => {
    await withPage(async (page) => {
      const drawn = await openTitle(page);

      // The copy is everything set in the BODY face, in the sheet's own column, above the controls.
      const copy = drawn
        .filter((d) => /MB Serif/.test(d.font) && d.x === COPY_LEFT && d.y >= SHEET_TOP && d.y < CONTROLS_TOP)
        .sort((a, b) => a.y - b.y);

      assert.equal(copy.length, 6, `the charter drew ${copy.length} copy lines, not the six it is written to fit`);

      // Nothing was silently dropped: the six lines reassemble into the three paragraphs verbatim.
      assert.equal(
        copy
          .map((d) => d.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
        CHARTER.join(' ').replace(/\s+/g, ' ').trim(),
        'the charter as drawn does not match the charter as written; a line was dropped or re-wrapped',
      );

      // Every line clears the controls. wrap() enforces this by refusing to draw, so a line that
      // overran would vanish rather than collide — which is why the count above is the real guard
      // and this is the belt to its braces.
      for (const line of copy) {
        assert.ok(
          line.y + BODY_PX <= COPY_FLOOR,
          `a charter line is set at y=${line.y}, past the ${COPY_FLOOR} floor and into the controls: "${line.str}"`,
        );
      }
    });
  },
);

test(
  'the corrupt-save notice stays a slip on the desk BELOW the sheet, and is printed on paper',
  { skip: chromium ? false : 'playwright unavailable' },
  async () => {
    await withPage(async (page) => {
      await page.goto(artifactUrl());
      await page.waitForFunction(() => !!window.__GAME);
      await page.evaluate(() => localStorage.setItem('material-breach:save', '{{{ not json'));
      await page.reload();
      await page.waitForFunction(() => !!window.__GAME);
      await page.waitForTimeout(400);

      const drawn = await readDrawn(page);
      const notice = drawn.filter((d) => /^Save notice:/.test(d.str));
      assert.ok(notice.length > 0, 'the corrupt save produced no notice at all');

      // Below the sheet: the charter's six lines own everything above the controls, so a notice
      // forced back inside the document overdraws the copy (the B1/Q1 regression).
      for (const n of notice) {
        assert.ok(n.y > SHEET_BOTTOM - 12, `the save notice is set at y=${n.y}, back inside the charter sheet`);
      }

      // And it is legible where it landed. It used to be a paper ink set straight onto the dark
      // desk, which measured 1.27:1 against its own ground with this game's floor at 4.5:1. It is
      // now printed on a slip of manila, so the pairing is the ink-on-paper one Gate 5 measures.
      //
      // The text now lives on a separate DPR-aware layer above the 640x360 pixel-art buffer, so the
      // measurement composites the two canvases at display resolution and samples ground from the
      // paper strip (screen) and ink from the most contrasting pixel in the composite.
      const ratio = await page.evaluate(() => {
        const screen = document.getElementById('screen');
        const text = document.getElementById('text');
        const scale = text.width / 640;
        const out = document.createElement('canvas');
        out.width = text.width;
        out.height = text.height;
        const c = out.getContext('2d');
        c.drawImage(screen, 0, 0, out.width, out.height);
        c.drawImage(text, 0, 0);
        // Ground: a point inside the paper slip but clear of the text, read from the pixel-art layer.
        const sc = screen.getContext('2d');
        const groundPx = sc.getImageData(85, 321, 1, 1).data;
        const ground = [groundPx[0], groundPx[1], groundPx[2]];
        // Ink: the pixel in the composite that differs most from that ground.
        const sx = Math.round(92 * scale);
        const sy = Math.round(318 * scale);
        const sw = Math.round(456 * scale);
        const sh = Math.round(24 * scale);
        const d = c.getImageData(sx, sy, sw, sh).data;
        let ink = ground;
        let bestDiff = 0;
        for (let i = 0; i < d.length; i += 4) {
          const px = [d[i], d[i + 1], d[i + 2]];
          const diff = Math.abs(px[0] - ground[0]) + Math.abs(px[1] - ground[1]) + Math.abs(px[2] - ground[2]);
          if (diff > bestDiff) {
            bestDiff = diff;
            ink = px;
          }
        }
        const lum = ([r, g, b]) => {
          const f = (v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const la = lum(ink);
        const lb = lum(ground);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      });

      assert.ok(ratio >= 4.5, `the save notice measures ${ratio.toFixed(2)}:1 against its ground, below the 4.5:1 floor`);
    });
  },
);

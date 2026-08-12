// THE JACQUARD INDEX — the title scene (M0 boot target).
//
// Wraps the composed title picture with the frame pipeline: the expensive static
// composition (light rig, card, grid) is rendered once into a cache on enter; each
// frame blits the cache and stamps only the blinking prompt over it. Enter/Space is the
// call-to-action — for M0 it logs intent (M1 wires the transition into the index).

import { Framebuffer } from '../gfx/framebuffer.js';
import { composeTitle, drawPrompt, hitTestTitlePrompt } from './title.js';
import { makeIndexScene } from './indexScene.js';

const BLINK_PERIOD = 1200; // ms
const BLINK_ON = 760;      // ms visible within each period
const LMB = 0;

export function makeTitleScene() {
  let cache = null;

  function openIndex(app) {
    app.log.info('title: OPEN INDEX', Math.round(app.elapsed));
    app.setScene(makeIndexScene());
  }

  return {
    enter(app) {
      cache = new Framebuffer(app.fb.width, app.fb.height);
      composeTitle(cache);
      app.log.info('title: index card composed', Math.round(app.elapsed));
    },

    update(app, _dtMs, frame) {
      const input = app.input;
      for (const b of frame.pressedButtons) {
        if (b === LMB && input.pointer.inside && hitTestTitlePrompt(app.fb, input.pointer.x, input.pointer.y)) {
          openIndex(app);
          return;
        }
      }
      for (const code of frame.pressedKeys) {
        if (code === 'Enter' || code === 'Space') {
          openIndex(app);
          return;
        }
      }
    },

    render(app, fb) {
      if (cache) fb.blit(cache);
      else composeTitle(fb); // defensive fallback if enter was skipped
      const hot = app.input.pointer.inside
        && hitTestTitlePrompt(fb, app.input.pointer.x, app.input.pointer.y);
      const on = hot || (app.elapsed % BLINK_PERIOD) < BLINK_ON;
      drawPrompt(fb, on, hot);
    },
  };
}

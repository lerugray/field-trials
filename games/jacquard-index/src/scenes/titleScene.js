// THE JACQUARD INDEX — the title scene (M0 boot target).
//
// Wraps the composed title picture with the frame pipeline: the expensive static
// composition (light rig, card, grid) is rendered once into a cache on enter; each
// frame blits the cache and stamps only the blinking prompt over it. Enter/Space is the
// call-to-action — for M0 it logs intent (M1 wires the transition into the index).

import { Framebuffer } from '../gfx/framebuffer.js';
import {
  composeTitle, drawPrompt, hitTestTitlePrompt, drawSaveChoice, drawSaveNotice,
  hitTestTitleChoice,
} from './title.js';
import { makeIndexScene } from './indexScene.js';

const BLINK_PERIOD = 1200; // ms
const BLINK_ON = 760;      // ms visible within each period
const LMB = 0;

export function makeTitleScene(opts = {}) {
  let cache = null;
  const resumeAvailable = !!opts.resumeAvailable;
  const notice = opts.notice || null;
  let selected = 0;

  function openIndex(app) {
    app.log.info('title: OPEN INDEX', Math.round(app.elapsed));
    if (typeof opts.onNew === 'function') opts.onNew(app);
    else app.setScene(makeIndexScene());
  }

  function choose(app, choice) {
    if (choice === 0 && resumeAvailable) {
      app.log.info('title: CONTINUE SAVED WORK', Math.round(app.elapsed));
      opts.onContinue(app);
    } else {
      app.log.info('title: NEW INDEX', Math.round(app.elapsed));
      openIndex(app);
    }
  }

  return {
    _saveNotice: notice,
    _resumeAvailable: resumeAvailable,
    enter(app) {
      cache = new Framebuffer(app.fb.width, app.fb.height);
      composeTitle(cache);
      app.log.info('title: index card composed', Math.round(app.elapsed));
    },

    update(app, _dtMs, frame) {
      const input = app.input;
      for (const b of frame.pressedButtons) {
        if (b === LMB && input.pointer.inside) {
          if (resumeAvailable) {
            const hit = hitTestTitleChoice(app.fb, input.pointer.x, input.pointer.y);
            if (hit >= 0) { selected = hit; choose(app, hit); return; }
          } else if (hitTestTitlePrompt(app.fb, input.pointer.x, input.pointer.y)) {
            openIndex(app); return;
          }
        }
      }
      for (const code of frame.pressedKeys) {
        if (resumeAvailable && (code === 'ArrowLeft' || code === 'ArrowRight'
          || code === 'ArrowUp' || code === 'ArrowDown')) { selected = selected ? 0 : 1; continue; }
        if (resumeAvailable && code === 'KeyC') { choose(app, 0); return; }
        if (resumeAvailable && code === 'KeyN') { choose(app, 1); return; }
        if (code === 'Enter' || code === 'Space') {
          if (resumeAvailable) choose(app, selected);
          else openIndex(app);
          return;
        }
      }
    },

    render(app, fb) {
      if (cache) fb.blit(cache);
      else composeTitle(fb); // defensive fallback if enter was skipped
      drawSaveNotice(fb, notice);
      if (resumeAvailable) {
        const hot = app.input.pointer.inside
          ? hitTestTitleChoice(fb, app.input.pointer.x, app.input.pointer.y) : -1;
        drawSaveChoice(fb, selected, hot);
        return;
      }
      const hot = app.input.pointer.inside
        && hitTestTitlePrompt(fb, app.input.pointer.x, app.input.pointer.y);
      const on = hot || (app.elapsed % BLINK_PERIOD) < BLINK_ON;
      drawPrompt(fb, on, hot);
    },
  };
}

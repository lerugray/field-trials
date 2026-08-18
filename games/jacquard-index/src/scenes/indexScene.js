// THE JACQUARD INDEX — the index scene (the diegetic progress screen + catalogue).
//
// Studio amendment: the index IS the progress screen. M3 makes it the CATALOGUE too: the
// master index is a stack of brass-tabbed drawers, one per shelf (seed's eight card-sets),
// opened shelf by shelf. The top level browses the drawers (name, twist, woven count, lock
// state); opening an unlocked drawer shows its cards as manila slips. A woven card is a
// PUNCHED card (holes cut) slotted in. Sealed drawers (shelves not yet built, or locked
// behind an unfinished shelf, or ratification-gated) show as closed brass drawers — a
// legitimate diegetic state, never placeholder art.

import { Framebuffer } from '../gfx/framebuffer.js';
import {
  composePatternRoomIndex, composePatternRoomDrawer, PATTERN_ROOM_DRAWER_COLS,
  hitTestPatternRoomShelf, hitTestPatternRoomCard,
} from '../render/patternRoom.js';
import { cardBand, twistFor } from '../puzzle/twists.js';
import {
  SHELVES, shelfCards, shelfWovenCount, isShelfUnlocked, shelfComplete,
} from '../content/shelves.js';
import { makePlayScene } from './playScene.js';
import { makeTwoThreadScene } from './twoThreadScene.js';
import { makeCountingHouseScene } from './countingHouseScene.js';
import { makeTitleScene } from './titleScene.js';

const cardW = (c) => (c.puzzle ? c.puzzle.width : c.width);
const cardH = (c) => (c.puzzle ? c.puzzle.height : c.height);
const LMB = 0;

export function makeIndexScene(opts = {}) { return makeIndexSceneAt('shelves', 0, 0, opts); }

// view: 'shelves' (drawer list) | 'cards' (open drawer). shelfSel/cardSel restore position.
export function makeIndexSceneAt(view = 'shelves', shelfSel = 0, cardSel = 0, opts = {}) {
  let mode = view;
  let sSel = Math.max(0, Math.min(SHELVES.length - 1, shelfSel));
  let cSel = cardSel;
  let cards = [];          // cards of the open drawer
  let shelfFrame = null;   // M4 PoC is static between selection/progress changes.
  let shelfFrameKey = '';
  let drawerFrame = null;  // Open physical drawer is cached by shelf/card/progress state.
  let drawerFrameKey = '';
  const artStats = { shelfBuilds: 0, drawerBuilds: 0 };

  function progressKey(progress) { return [...progress].sort().join(','); }

  function openDrawer(app) {
    const shelf = SHELVES[sSel];
    if (!isShelfUnlocked(shelf, app.progress)) {
      app.log.info(`index: ${shelf.name} is sealed`, Math.round(app.elapsed));
      return;
    }
    cards = shelfCards(shelf);
    for (const c of cards) { c.tierName = cardBand(c).tierName; }
    cSel = 0; // every newly opened shelf begins on its teaching card
    mode = 'cards';
    app.log.info(`index: opened ${shelf.name} (${cards.length} cards)`, Math.round(app.elapsed));
  }

  function openCard(app) {
    const card = cards[cSel];
    app.log.info(`index: open ${card.name}`, Math.round(app.elapsed));
    const sReturn = sSel, cReturn = cSel;
    const back = (a) => a.setScene(makeIndexSceneAt('cards', sReturn, cReturn, opts));
    const t = twistFor(card.twist);
    if (t.coloredScene) app.setScene(makeTwoThreadScene(card, { onExit: back }));
    else if (t.ledgerScene) app.setScene(makeCountingHouseScene(card, { onExit: back }));
    else app.setScene(makePlayScene(card, { onExit: back }));
  }

  return {
    _artStats: artStats,
    saveState() { return { scene: 'index', view: mode, shelf: sSel, card: cSel }; },
    enter(app) {
      // Re-derive the open drawer's cards after returning from a card.
      if (mode === 'cards') {
        const shelf = SHELVES[sSel];
        cards = shelfCards(shelf);
        for (const c of cards) { c.tierName = cardBand(c).tierName; }
        cSel = Math.max(0, Math.min(cards.length - 1, cSel));
      }
      const woven = app.progress.size;
      app.log.info(`index: ${woven} cards woven`, Math.round(app.elapsed));
    },

    update(app, _dt, frame) {
      const input = app.input;
      const px = input.pointer.x;
      const py = input.pointer.y;

      // Hover selects; click activates. Keyboard paths below stay identical.
      if (input.pointer.inside) {
        if (mode === 'shelves') {
          const hit = hitTestPatternRoomShelf(app.fb, px, py, SHELVES.length);
          if (hit >= 0) sSel = hit;
        } else if (cards.length) {
          const hit = hitTestPatternRoomCard(app.fb, px, py, cards.length);
          if (hit >= 0) cSel = hit;
        }
      }

      for (const b of frame.pressedButtons) {
        if (b !== LMB || !input.pointer.inside) continue;
        if (mode === 'shelves') {
          const hit = hitTestPatternRoomShelf(app.fb, px, py, SHELVES.length);
          if (hit >= 0) {
            sSel = hit;
            openDrawer(app);
            return;
          }
        } else {
          const hit = hitTestPatternRoomCard(app.fb, px, py, cards.length);
          if (hit >= 0) {
            cSel = hit;
            openCard(app);
            return;
          }
        }
      }

      for (const code of frame.pressedKeys) {
        if (mode === 'shelves') {
          switch (code) {
            case 'ArrowUp': sSel = (sSel - 1 + SHELVES.length) % SHELVES.length; break;
            case 'ArrowDown': sSel = (sSel + 1) % SHELVES.length; break;
            case 'Enter': case 'Space': openDrawer(app); return;
            case 'Escape':
              if (typeof opts.onExitToTitle === 'function') opts.onExitToTitle(app);
              else app.setScene(makeTitleScene());
              return;
            default: break;
          }
        } else {
          switch (code) {
            case 'ArrowLeft': cSel = (cSel - 1 + cards.length) % cards.length; break;
            case 'ArrowRight': cSel = (cSel + 1) % cards.length; break;
            case 'ArrowUp': cSel = (cSel - PATTERN_ROOM_DRAWER_COLS + cards.length) % cards.length; break;
            case 'ArrowDown': cSel = (cSel + PATTERN_ROOM_DRAWER_COLS) % cards.length; break;
            case 'Enter': case 'Space': openCard(app); return;
            case 'Escape': mode = 'shelves'; break;
            default: break;
          }
        }
      }
    },

    render(app, fb) {
      if (mode === 'shelves') {
        const key = `${sSel}:${progressKey(app.progress)}`;
        if (!shelfFrame || shelfFrame.width !== fb.width || shelfFrame.height !== fb.height || shelfFrameKey !== key) {
          shelfFrame = new Framebuffer(fb.width, fb.height);
          const drawers = SHELVES.map((shelf) => drawerPresentation(shelf, app.progress));
          composePatternRoomIndex(shelfFrame, drawers, sSel, app.progress.size);
          shelfFrameKey = key;
          artStats.shelfBuilds++;
        }
        fb.data.set(shelfFrame.data);
        return;
      }
      const key = `${sSel}:${cSel}:${progressKey(app.progress)}`;
      if (!drawerFrame || drawerFrame.width !== fb.width || drawerFrame.height !== fb.height || drawerFrameKey !== key) {
        drawerFrame = new Framebuffer(fb.width, fb.height);
        const drawers = SHELVES.map((shelf) => drawerPresentation(shelf, app.progress));
        const shelf = SHELVES[sSel];
        const presentations = cards.map((card) => ({
          name: card.name,
          detail: `${cardW(card)}x${cardH(card)}  ${card.tierName}`,
          woven: app.progress.has(card.id),
        }));
        composePatternRoomDrawer(
          drawerFrame, drawers, sSel, app.progress.size,
          {
            order: shelf.order, name: shelf.name, blurb: shelf.blurb,
            woven: shelfWovenCount(shelf, app.progress),
          },
          presentations, cSel,
        );
        drawerFrameKey = key;
        artStats.drawerBuilds++;
      }
      fb.data.set(drawerFrame.data);
    },
  };
}

function drawerPresentation(shelf, progress) {
  const unlocked = isShelfUnlocked(shelf, progress);
  const complete = shelfComplete(shelf, progress);
  const woven = shelfWovenCount(shelf, progress);
  let status;
  if (!unlocked) {
    status = shelf.ratificationGated ? 'PENDING' : (shelf.built ? 'LOCKED' : 'SEALED');
  } else if (complete) {
    status = 'COMPLETE';
  } else {
    status = `${woven} / ${shelf.memberIds.length} WOVEN`;
  }
  return {
    order: shelf.order,
    name: shelf.name,
    tagline: shelf.tagline,
    blurb: shelf.blurb,
    status,
    unlocked,
  };
}

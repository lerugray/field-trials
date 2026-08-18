// input.js — real pointer and keyboard input, mapped to the view controller. Pointer-primary: a
// click hit-tests the same button rectangles the renderer draws; the keyboard mirrors each button's
// declared key. No timer, no clock; input is event-driven and player-driven. commitCycle is reached
// only through a confirm event, never from here on a tick.
import { SCREEN, LEDGER, computeButtons, hitTest, cutawayGeometry, cellAtPoint, sectionFocus } from './layout.js';
import {
  actQueueFortify,
  actRepair,
  actFabricate,
  actAnswerNotice,
  enterPremises,
  showOverlay,
  backToTitle,
  applyTool,
  cycleTool,
  openSignOver,
  confirmSignOver,
  dismissOverlay,
  togglePause,
  setMuted,
  abandonTenure,
  endReplay,
} from './view.js';

// Map an interactive-region id to its effect. View-level effects mutate the view and return null;
// shell-level effects ('export', 'quit', 'mute') are returned for the host (boot) to carry out.
export function dispatch(view, id) {
  switch (id) {
    case 'fortify':
      actQueueFortify(view);
      return null;
    case 'repair':
      actRepair(view);
      return null;
    case 'fabricate':
      actFabricate(view);
      return null;
    case 'answer':
      actAnswerNotice(view);
      return null;
    case 'tool':
      cycleTool(view);
      return null;
    case 'skip-replay':
      endReplay(view);
      return null;
    case 'sign':
      openSignOver(view);
      return null;
    case 'confirm':
      confirmSignOver(view);
      return null;
    case 'back':
    case 'begin':
      dismissOverlay(view);
      return null;
    case 'enter':
      enterPremises(view);
      return null;
    case 'options':
      showOverlay(view, 'options');
      return null;
    case 'provenance':
      showOverlay(view, 'provenance');
      return null;
    case 'totitle':
      backToTitle(view);
      return null;
    case 'resume':
      view.overlay = null;
      return null;
    case 'mute':
      setMuted(view, !view.muted);
      return 'mute';
    case 'exportlog':
      return 'export';
    case 'quit':
      return 'quit';
    case 'dismiss':
      // Q4: the closing report is a filed surface. Dismiss hides the sheet without destroying
      // the underlying record; the player returns from pause.
      if (view.overlay === 'closed') {
        view.overlay = 'pause';
      } else {
        view.overlay = null;
        view.errorMessage = null;
      }
      return null;
    case 'closedreport':
      view.overlay = 'closed';
      return null;
    case 'newtenure':
      abandonTenure(view);
      return null;
    default:
      return null;
  }
}

// Translate a raw pointer event into buffer coordinates, through the integer/letterbox scaling.
function toBuffer(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * SCREEN.w;
  const y = ((clientY - rect.top) / rect.height) * SCREEN.h;
  return { x, y };
}

// Normalise a keydown into a token: 'Esc', 'Enter', a 'pan-*' for the arrow keys, or the uppercase
// letter for a-z. WASD is resolved at dispatch time (a letter that names an active button fires the
// button; otherwise WASD pans), so a button key like A for Answer is never eaten by the pan binding.
function keyToken(ev) {
  const k = ev.key;
  if (k === 'Escape') return 'Esc';
  if (k === 'Enter') return 'Enter';
  if (k === 'z' || k === 'Z') return 'Enter'; // Z confirms (contract baseline)
  if (k === 'PageUp') return 'page-up';
  if (k === 'PageDown') return 'page-down';
  if (k === 'ArrowUp') return 'pan-up';
  if (k === 'ArrowDown') return 'pan-down';
  if (k === 'ArrowLeft') return 'pan-left';
  if (k === 'ArrowRight') return 'pan-right';
  if (k.length === 1 && /[a-z]/i.test(k)) return k.toUpperCase();
  return null;
}

// attachInput(canvas, view, host) -> a detach function (for a clean quit() teardown). `host`
// carries the shell-level effects: onExport(), onQuit(), onMute(muted), onGesture().
//
// onGesture() fires on EVERY real pointer and key event, before anything is dispatched. It is how
// the audio bus is unlocked (collection contract item 6: unlocked on the first user gesture, no
// pre-gesture autoplay). It sits here rather than on one chosen button because the browser's
// autoplay policy counts any genuine gesture, and the first thing a player does might be a keypress,
// a click on the orientation packet, or a click on a rock. It is idempotent by contract, so calling
// it on every event costs a function call and buys not having to guess which gesture comes first.
export function attachInput(canvas, view, host = {}) {
  function gesture() {
    if (host.onGesture) host.onGesture();
  }

  function onPointerDown(ev) {
    gesture();
    const { x, y } = toBuffer(canvas, ev.clientX, ev.clientY);
    const id = hitTest(computeButtons(view), x, y);
    if (id) {
      ev.preventDefault();
      handleIntent(dispatch(view, id));
      return;
    }
    // A click anywhere during the incident replay skips or continues it.
    if (view.overlay === 'raid') {
      ev.preventDefault();
      endReplay(view);
      return;
    }
    // No button hit: a click on the cutaway grid orders that cell carved (only in ADMIN).
    if (view.overlay === null && view.facility.status === 'active') {
      const geo = cutawayGeometry(view.facility.dims, view.pan, sectionFocus(view.facility, view));
      const cell = cellAtPoint(geo, x, y);
      if (cell) {
        ev.preventDefault();
        applyTool(view, cell.x, cell.y);
      }
    }
  }

  function onPointerMove(ev) {
    if (view.overlay !== null) {
      view.hoverCell = null;
      return;
    }
    const { x, y } = toBuffer(canvas, ev.clientX, ev.clientY);
    const geo = cutawayGeometry(view.facility.dims, view.pan, sectionFocus(view.facility, view));
    view.hoverCell = cellAtPoint(geo, x, y);
  }

  function scrollReport(view, delta) {
    if (!view.facility.lastReport || view.reportMaxScroll <= 0) return false;
    view.reportScroll = Math.max(0, Math.min(view.reportScroll + delta, view.reportMaxScroll));
    return true;
  }

  function onKeyDown(ev) {
    const token = keyToken(ev);
    if (!token) return;
    gesture();

    const step = 8;
    // Esc toggles pause where pause is legal. On other overlays it acts as the Back/X alias, so a
    // player is not trained to reach for X and then find Esc does nothing (Release fix round minor).
    if (token === 'Esc') {
      const before = view.overlay;
      togglePause(view);
      if (view.overlay !== before) {
        ev.preventDefault();
        return;
      }
      const closeBtn = computeButtons(view).find((b) => b.enabled && (b.key === 'X' || b.id === 'dismiss'));
      if (closeBtn) {
        ev.preventDefault();
        handleIntent(dispatch(view, closeBtn.id));
      }
      return;
    }
    // Page keys scroll the after-action report when one is present.
    if (token === 'page-up') {
      if (scrollReport(view, -26)) ev.preventDefault();
      return;
    }
    if (token === 'page-down') {
      if (scrollReport(view, 26)) ev.preventDefault();
      return;
    }
    // Arrow keys always pan the cutaway view.
    if (token.startsWith('pan-')) {
      if (token === 'pan-up') view.pan.y += step;
      else if (token === 'pan-down') view.pan.y -= step;
      else if (token === 'pan-left') view.pan.x += step;
      else if (token === 'pan-right') view.pan.x -= step;
      return;
    }
    // A letter that names an active button fires it (buttons take priority over the WASD pan).
    const btn = computeButtons(view).find((b) => b.enabled && b.key === token);
    if (btn) {
      ev.preventDefault();
      handleIntent(dispatch(view, btn.id));
      return;
    }
    // Otherwise WASD pans the cutaway (contract item 5: Arrows/WASD move).
    if (token === 'W') view.pan.y += step;
    else if (token === 'S') view.pan.y -= step;
    else if (token === 'A') view.pan.x += step;
    else if (token === 'D') view.pan.x -= step;
  }

  function onWheel(ev) {
    if (view.overlay !== null) return;
    const { x, y } = toBuffer(canvas, ev.clientX, ev.clientY);
    if (x < LEDGER.x || x > LEDGER.x + LEDGER.w || y < LEDGER.y || y > LEDGER.y + LEDGER.h) return;
    if (scrollReport(view, ev.deltaY > 0 ? 14 : -14)) {
      ev.preventDefault();
    }
  }

  function handleIntent(intent) {
    if (intent === 'export' && host.onExport) host.onExport();
    else if (intent === 'quit' && host.onQuit) host.onQuit();
    else if (intent === 'mute' && host.onMute) host.onMute(view.muted);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);

  return function detach() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
  };
}

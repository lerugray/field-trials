// The assist + options menu — the accessibility law's "plainly-labeled, easy-to-reach"
// surface (hard rule 8), grown at M9 into the full options menu DESIGN-SEED calls for:
// reduced-motion, mute, FOV, invert-Y, stick deadzone, music volume, and a full
// keyboard REMAPPING page (reachable from the main page, with reset-to-defaults).
// Opening it pauses the game. Plain English labels, no jargon. Reachable by Esc
// (keyboard) or Start (gamepad, wired in main). Keyboard + mouse + gamepad navigable.
// Browser-only; reads/writes through the settings + bindings objects.

import { REMAP_ACTIONS, inputLabel } from '../input/bindings.js';
import { MUSIC_CREDIT } from '../audio/music.js';
import { MENU_INKS, MENU_SURFACES } from './legibility.js';
import { FOV_MIN, FOV_MAX, DEADZONE_MIN, DEADZONE_MAX, MOUSE_SENS_MIN, MOUSE_SENS_MAX, MOUSE_SENS_STEP }
  from '../core/settings.js';

// --- the page catalogs, as PURE data -------------------------------------------
// id/label/kind/range only: no settings closure and no DOM, so which page an option
// lives on is testable headless (the titlemenu.js precedent — this file has no jsdom
// to lean on). createMenu binds the get/adjust/fmt behaviour onto these below, so the
// two can never describe different menus.
//
// Mouse aim + mouse sensitivity sit HERE, on the main page, next to the other
// "how you steer" options. They used to live behind the item labelled "Controls
// (remap keys)…", which gave nobody a reason to look for them there (operator, after
// a real session, 2026-08-07: "there needs to be a mouse sensitivity toggle"). The
// controls page is now honestly just key rebinding.
export const MAIN_ITEMS = [
  { id: 'resume', label: 'Resume', kind: 'action' },
  { id: 'muted', label: 'Master mute', kind: 'toggle' },
  { id: 'reducedMotion', label: 'Reduced motion', kind: 'toggle' },
  { id: 'fovLock', label: 'Lock field of view', kind: 'toggle' },
  { id: 'fov', label: 'Field of view', kind: 'range', min: FOV_MIN, max: FOV_MAX },
  { id: 'invertY', label: 'Invert aim (Y)', kind: 'toggle' },
  { id: 'deadzone', label: 'Stick deadzone', kind: 'range', min: DEADZONE_MIN, max: DEADZONE_MAX },
  // M11 mouse support — additive pointer aim, ON by default since M15 (accessibility law: the
  // keyboard/pad remain fully capable, so this only ever widens how you can play).
  { id: 'mouseAim', label: 'Mouse aim', kind: 'toggle' },
  // Sensitivity is a MULTIPLIER, so it gets a log scale and proportional steps. On a
  // linear bar the wide range puts low values in a thin sliver; log keeps doubling the
  // same visual step anywhere on the track (0.5→1 reads like 2→4). Default is 4.0×.
  { id: 'mouseSensitivity', label: 'Mouse sensitivity', kind: 'range', scale: 'log',
    min: MOUSE_SENS_MIN, max: MOUSE_SENS_MAX },
  { id: 'musicVolume', label: 'Music volume', kind: 'range', min: 0, max: 1 },
  { id: 'controls', label: 'Controls (remap inputs)…', kind: 'goto', page: 'controls' },
];
export const CONTROLS_ITEMS = [
  { id: 'keyboardControls', label: 'Keyboard bindings', kind: 'goto', page: 'keyboard' },
  { id: 'mouseControls', label: 'Mouse button bindings', kind: 'goto', page: 'mouse' },
  { id: 'controllerControls', label: 'Controller bindings', kind: 'goto', page: 'controller' },
  { id: 'resetControls', label: 'Reset controls to defaults', kind: 'reset' },
  { id: 'back', label: 'Back', kind: 'goto', page: 'main' },
];
function inputItems(inputClass) {
  return [
    ...REMAP_ACTIONS.map((a) => ({
      id: 'rebind:' + inputClass + ':' + a.id,
      label: a.label,
      kind: 'rebind',
      action: a.id,
      inputClass,
    })),
    { id: 'backToControls', label: 'Back', kind: 'goto', page: 'controls' },
  ];
}
export const KEYBOARD_ITEMS = inputItems('keyboard');
export const MOUSE_ITEMS = inputItems('mouse');
export const CONTROLLER_ITEMS = inputItems('controller');
export const MAIN_ITEM_IDS = MAIN_ITEMS.map((i) => i.id);
export const CONTROLS_ITEM_IDS = CONTROLS_ITEMS.map((i) => i.id);

// How full a range row's bar is drawn, 0..1. Linear by default; `scale: 'log'` for
// values that are multipliers, where equal ratios should look like equal distances.
// Pure, so the bar can be checked without a DOM.
export function rangeFraction(it, value) {
  const lo = it.min, hi = it.max;
  if (!(hi > lo)) return 0;
  const v = Math.max(lo, Math.min(hi, value));
  const f = it.scale === 'log' && lo > 0
    ? Math.log(v / lo) / Math.log(hi / lo)
    : (v - lo) / (hi - lo);
  return Math.max(0, Math.min(1, f));
}

export function createMenu(settings, bindings, onChange) {
  // Bind the live get/adjust/format behaviour onto the pure catalogs above.
  const ranges = {
    fov: { get: () => settings.get('fov'), adjust: (d) => settings.adjustFov(d * 5),
      fmt: (v) => v + '°' },
    deadzone: { get: () => settings.get('deadzone'), adjust: (d) => settings.adjustDeadzone(d * 0.01),
      fmt: (v) => Math.round(v * 100) + '%' },
    mouseSensitivity: { get: () => settings.get('mouseSensitivity'),
      // A step proportional to where you are: coarse at the top, fine at the bottom, so
      // the whole range is about 25 presses either way instead of 31 uneven ones.
      adjust: (d) => settings.adjustMouseSensitivity(
        d * Math.max(MOUSE_SENS_STEP, settings.get('mouseSensitivity') * 0.15)),
      fmt: (v) => v.toFixed(2) + '×' },
    musicVolume: { get: () => settings.get('musicVolume'), adjust: (d) => settings.adjustMusicVolume(d * 0.05),
      fmt: (v) => Math.round(v * 100) + '%' },
  };
  const bind = (it) => (it.kind === 'range' ? { ...it, ...ranges[it.id] } : it);
  const mainItems = MAIN_ITEMS.map(bind);
  const controlsItems = CONTROLS_ITEMS.map(bind);
  const pages = {
    main: mainItems,
    controls: controlsItems,
    keyboard: KEYBOARD_ITEMS,
    mouse: MOUSE_ITEMS,
    controller: CONTROLLER_ITEMS,
  };

  // --- DOM shell ---
  const scrim = document.createElement('div');
  scrim.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:20', 'display:none',
    'align-items:center', 'justify-content:center',
    'background:rgba(6,10,16,0.72)',
    'font:14px/1.5 ui-monospace,Menlo,Consolas,monospace',
  ].join(';');
  const panel = document.createElement('div');
  panel.style.cssText = [
    'min-width:360px', 'max-height:88vh', 'overflow:auto',
    'background:rgba(12,18,26,0.96)', 'border:1px solid #24405a',
    'border-radius:10px', 'padding:18px 20px',
    'box-shadow:0 8px 40px rgba(0,0,0,0.55)', 'pointer-events:auto',
  ].join(';');
  scrim.appendChild(panel);

  const title = document.createElement('div');
  title.style.cssText = 'color:#f0a24a;letter-spacing:2px;font-weight:bold;margin-bottom:2px';
  const sub = document.createElement('div');
  sub.style.cssText = 'color:#8399a8;margin-bottom:14px;font-size:12px';
  panel.appendChild(title);
  panel.appendChild(sub);

  const rowsWrap = document.createElement('div');
  panel.appendChild(rowsWrap);

  const hint = document.createElement('div');
  hint.style.cssText = 'color:#6f8a92;margin-top:12px;font-size:11px';
  panel.appendChild(hint);

  // Credit the operator-supplied music (Abel Aeolian), per the assets/music brief.
  const credit = document.createElement('div');
  credit.textContent = MUSIC_CREDIT;
  credit.style.cssText = 'color:#516572;margin-top:8px;font-size:11px;font-style:italic';
  panel.appendChild(credit);
  document.body.appendChild(scrim);

  // --- state ---
  let open = false;
  let page = 'main';
  let sel = 0;
  let capturing = null; // { action, inputClass } while awaiting a physical input
  let rowEls = [];
  // Context overrides (M12): opened from the title, this surface is "OPTIONS / Back",
  // not the in-level "PAUSED / Resume". Reset on close so the next pause reads right.
  let ctxHeading = null;
  let ctxResumeLabel = null;

  function items() { return pages[page]; }

  function valueText(it) {
    if (it.kind === 'toggle') return settings.get(it.id) ? 'On' : 'Off';
    if (it.kind === 'range') return it.fmt(it.get());
    if (it.kind === 'rebind') {
      if (capturing && capturing.action === it.action) {
        return it.inputClass === 'keyboard' ? 'press a key…'
          : it.inputClass === 'mouse' ? 'press a mouse button…'
          : 'press a controller button…';
      }
      const s = bindings.slots(it.action, it.inputClass);
      return inputLabel(it.inputClass, s[0]) +
        (s[1] !== null ? ' / ' + inputLabel(it.inputClass, s[1]) : '');
    }
    if (it.kind === 'goto' || it.kind === 'reset') return it.kind === 'reset' ? '' : '→';
    return '→';
  }

  function buildRows() {
    rowsWrap.textContent = '';
    rowEls = [];
    items().forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;justify-content:space-between;gap:24px;padding:7px 10px;border-radius:6px;cursor:pointer';
      const k = document.createElement('span');
      k.textContent = (it.id === 'resume' && ctxResumeLabel) ? ctxResumeLabel : it.label;
      k.style.color = MENU_INKS.label;
      // A range row shows where it sits on its own scale, not just a number: the
      // operator asked for "a bar or something" after hunting for the sensitivity
      // setting. Drawn, like everything else here — a track div with a filled portion.
      const right = document.createElement('span');
      right.style.cssText = 'display:flex;align-items:center;gap:10px';
      const v = document.createElement('span');
      v.style.color = MENU_INKS.value;
      let bar = null, fill = null;
      if (it.kind === 'range') {
        bar = document.createElement('span');
        bar.style.cssText =
          'display:inline-block;width:92px;height:6px;border-radius:3px;background:' +
          MENU_SURFACES.track + ';overflow:hidden';
        fill = document.createElement('span');
        fill.style.cssText =
          'display:block;height:100%;border-radius:3px;background:' + MENU_INKS.value;
        bar.appendChild(fill);
        right.appendChild(bar);
      }
      right.appendChild(v);
      row.appendChild(k);
      row.appendChild(right);
      row.addEventListener('mouseenter', () => { if (!capturing) { sel = i; render(); } });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (capturing) return;
        sel = i;
        if (it.kind === 'range') adjust(+1);
        else activate();
      });
      rowsWrap.appendChild(row);
      rowEls.push({ row, k, v, fill, it });
    });
  }

  function render() {
    const bindingPage = ['keyboard', 'mouse', 'controller'].includes(page);
    title.textContent = bindingPage ? page.toUpperCase() + ' BINDINGS'
      : page === 'controls' ? 'CONTROLS' : (ctxHeading || 'PAUSED');
    sub.textContent = bindingPage
      ? 'Pick a game action, then press the input to bind it. An occupied input moves here.'
      : page === 'controls'
        ? 'Set each input class separately, or restore every shipped default.'
        : 'Assist menu — these never change the game, only how you play it.';
    hint.textContent = bindingPage
      ? 'Up/Down select · Enter rebind · Esc back'
      : page === 'controls'
        ? 'Up/Down select · Enter choose · Esc back'
        : 'Up/Down select · Enter toggle · Left/Right adjust · Esc close';
    credit.style.display = page === 'main' ? 'block' : 'none';
    rowEls.forEach(({ row, k, v, fill, it }, i) => {
      v.textContent = valueText(it);
      if (fill) {
        fill.style.width = Math.round(rangeFraction(it, it.get()) * 100) + '%';
      }
      const active = i === sel;
      row.style.background = active ? 'rgba(79,208,192,0.16)' : 'transparent';
      row.style.outline = active ? '1px solid #4fd0c0' : '1px solid transparent';
      k.style.color = active ? MENU_INKS.labelActive : MENU_INKS.label;
    });
  }

  function gotoPage(p) { page = p; sel = 0; capturing = null; buildRows(); render(); }

  function move(d) {
    if (capturing) return;
    const n = items().length;
    sel = (sel + d + n) % n;
    render();
  }

  function activate() {
    if (capturing) return false;
    const it = items()[sel];
    if (it.kind === 'goto') { gotoPage(it.page); return true; }
    if (it.id === 'resume') { close(); return true; }
    if (it.kind === 'toggle') {
      settings.toggle(it.id);
      onChange && onChange(it.id);
      render();
      return true;
    }
    if (it.kind === 'rebind') {
      capturing = { action: it.action, inputClass: it.inputClass };
      render();
      return true;
    }
    if (it.kind === 'reset') {
      bindings.reset();
      onChange && onChange('bindings');
      render();
      return true;
    }
    return false;
  }

  function adjust(d) {
    if (capturing) return false;
    const it = items()[sel];
    if (it.kind === 'range') {
      it.adjust(d);
      onChange && onChange(it.id);
      render();
      return true;
    }
    return false;
  }

  // Route a raw key press into a pending rebind. Returns true if it consumed the key
  // (so main can preventDefault + skip its own handling). Esc cancels the capture.
  function captureKey(code) {
    if (!capturing || capturing.inputClass !== 'keyboard') return false;
    if (code === 'Escape') { capturing = null; render(); return true; }
    bindings.rebind(capturing.action, 0, code, 'keyboard');
    capturing = null;
    onChange && onChange('bindings');
    render();
    return true;
  }

  function captureButton(inputClass, button) {
    if (!capturing || capturing.inputClass !== inputClass) return false;
    bindings.rebind(capturing.action, 0, button, inputClass);
    capturing = null;
    onChange && onChange('bindings');
    render();
    return true;
  }

  // Esc behaviour: cancel a rebind, else step back a page, else close.
  function back() {
    if (capturing) { capturing = null; render(); return 'captured'; }
    if (['keyboard', 'mouse', 'controller'].includes(page)) {
      gotoPage('controls');
      return 'page';
    }
    if (page === 'controls') { gotoPage('main'); return 'page'; }
    close();
    return 'closed';
  }

  function openMenu(o = {}) {
    open = true; page = 'main'; sel = 0; capturing = null;
    ctxHeading = o && o.heading || null;
    ctxResumeLabel = o && o.resumeLabel || null;
    scrim.style.display = 'flex'; buildRows(); render();
  }
  function close() { open = false; capturing = null; ctxHeading = null; ctxResumeLabel = null; scrim.style.display = 'none'; }

  buildRows();
  render();

  return {
    isOpen: () => open,
    isCapturing: () => !!capturing,
    captureClass: () => capturing ? capturing.inputClass : null,
    open: openMenu,
    close,
    gotoControls: () => gotoPage('controls'), // proof/deep-link into the remapping page
    toggleOpen() { open ? close() : openMenu(); return open; },
    move,
    activate,
    adjust,
    captureKey,
    captureButton,
    back,
    render,
  };
}

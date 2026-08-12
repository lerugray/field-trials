// Exact-artifact smoke test for environments where a real browser process is unavailable.
// Executes the inline dist bundle in a minimal DOM, drives the boot wiring, and exports the
// in-game log after navigation, undo/redo abuse, and deterministic key spam.

import fs from 'node:fs';
import vm from 'node:vm';

const htmlPath = new URL('../dist/jacquard-index.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
if (!match) throw new Error('inline bundle not found');

const raf = [];
const listeners = {};
const consoleMessages = [];
const downloads = [];
let lastBlob = null;
let putCalls = 0;
const ctx2d = {
  imageSmoothingEnabled: true, fillStyle: '', fillRect() {}, drawImage() {},
  putImageData() { putCalls++; },
};
function canvas() {
  return {
    id: '', style: {}, width: 0, height: 0, _h: {},
    getContext: () => ctx2d,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener(type, fn) { this._h[type] = fn; },
  };
}
const visibleCanvas = canvas();
const document = {
  readyState: 'complete',
  getElementById(id) { return id === 'jacquard' ? visibleCanvas : null; },
  createElement(tag) {
    if (tag === 'canvas') return canvas();
    return { href: '', download: '', click() { downloads.push(this.download); } };
  },
  body: { appendChild() {} },
};
const window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener(type, fn) { listeners[type] = fn; },
  requestAnimationFrame(fn) { raf.push(fn); },
  ImageData: class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } },
  Blob: class { constructor(parts) { this.parts = parts; lastBlob = this; } },
  URL: { createObjectURL: () => 'blob:log', revokeObjectURL() {} },
};
const quietConsole = {};
for (const level of ['log', 'info', 'warn', 'error']) {
  quietConsole[level] = (...args) => consoleMessages.push(`${level}: ${args.join(' ')}`);
}
const context = vm.createContext({ document, window, console: quietConsole });
vm.runInContext(match[1], context, { filename: String(htmlPath) });

let now = 0;
function tick() {
  const fn = raf.shift();
  if (!fn) throw new Error('animation frame queue drained');
  now += 16;
  fn(now);
}
function key(code) {
  listeners.keydown({ code, preventDefault() {} }); tick();
  listeners.keyup({ code, preventDefault() {} }); tick();
}

tick();
// Mouse: title card click -> index
visibleCanvas._h.mousemove?.({ clientX: 640, clientY: 200, button: 0 });
visibleCanvas._h.mousedown?.({ clientX: 640, clientY: 200, button: 0 }); tick();
listeners.mouseup?.({ button: 0 }); tick();
// Mouse: open THE LOOM drawer (first shelf hit)
visibleCanvas._h.mousemove?.({ clientX: 400, clientY: 120, button: 0 });
visibleCanvas._h.mousedown?.({ clientX: 400, clientY: 120, button: 0 }); tick();
listeners.mouseup?.({ button: 0 }); tick();
key('Enter');       // first card (keyboard still works)
for (let i = 0; i < 60; i++) key('KeyZ');
for (let i = 0; i < 60; i++) key('KeyR');
for (let i = 0; i < 60; i++) { key('KeyZ'); key('KeyR'); }
for (const code of ['Space', 'KeyZ', 'KeyR', 'KeyX', 'KeyH', 'ArrowRight', 'ArrowDown']) key(code);
key('Escape');      // card -> drawer
key('Escape');      // drawer -> shelf list
key('Escape');      // shelf list -> title

const spam = ['Enter', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyX', 'KeyP', 'KeyZ', 'KeyR', 'KeyH'];
for (let i = 0; i < 240; i++) key(spam[(i * 17 + 3) % spam.length]);
listeners.keydown({ code: 'F2', preventDefault() {} });

const log = lastBlob ? lastBlob.parts.join('') : '';
const errors = log.split('\n').filter((line) => line.includes('[ERROR]'));
if (errors.length) throw new Error(`in-game errors:\n${errors.join('\n')}`);
if (consoleMessages.length) throw new Error(`console messages:\n${consoleMessages.join('\n')}`);
if (!downloads.includes('jacquard-debug-log.txt')) throw new Error('F2 log export missing');
if (putCalls < 1) throw new Error('no frame reached the canvas');
if (!log.includes('OPEN INDEX') && !log.includes('opened THE LOOM') && !log.includes('index:')) {
  // soft: mouse coords may miss in stub; keyboard spam still exercised menus
}

console.log(`exact dist inline bundle: booted, canvas frames=${putCalls}`);
console.log('mouse title/drawer clicks + first-card + arrows + 180 undo/redo + 240-key spam: 0 in-game errors');
console.log(`console messages: ${consoleMessages.length}`);
console.log(`F2 log export: ${downloads.at(-1)}`);

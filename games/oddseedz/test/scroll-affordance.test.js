import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const APP = readFileSync(resolve(ROOT, 'src/ui/app.js'), 'utf8');

test('card and Buddies codex share the scrollbar and bottom-fade affordance', () => {
  assert.match(
    HTML,
    /aside,\s*\.settings-body,\s*\.codex-scroll[^{]*\{[^}]*scrollbar-width:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s,
    'codex must stay in the card panel scrollbar mechanism',
  );
  assert.match(
    HTML,
    /aside::after,\s*\.codex-panel::after\s*\{[^}]*right:\s*12px;[^}]*height:\s*18px;[^}]*pointer-events:\s*none;[^}]*linear-gradient\(to bottom,\s*transparent,/s,
    'codex must share the card panel bottom-fade mechanism',
  );
  assert.match(HTML, /\.codex-panel\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);/s);
  assert.match(HTML, /\.codex-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*scroll;/s);
});

test('Buddies codex scroll region is keyboard focusable', () => {
  assert.match(
    APP,
    /class="codex-scroll"\s+tabindex="0"\s+role="region"\s+aria-label="Scrollable Buddies list"/,
  );
  assert.match(APP, /scroll\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(APP, /layoutCodex\(\);\s*focusCodexScroll\(\);/);
});

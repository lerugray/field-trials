// Shared helper: the list of game-logic source files the structural gates scan. Presentation
// files (RAF-driven drawing, added from M1 onward) are the only allowed home for a clock, so they
// are listed here and excluded. If a file is not in PRESENTATION, it is logic and the pacing and
// determinism laws bind it.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Files that own the animation frame / host surface and may legitimately touch requestAnimationFrame
// and cancelAnimationFrame. Only boot.js drives the RAF loop (draw-only); render/input/view/layout
// stay scanned so no timer can sneak into presentation control either.
export const PRESENTATION = new Set(['boot.js']);

// Strip comments so the structural gates scan real code, not prose. A comment may legitimately
// mention a banned token (e.g. "no Math.random here"); only executable code must be clean.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments, leaving :// in any url intact
}

export function logicFiles() {
  return readdirSync(SRC)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => !PRESENTATION.has(name))
    .map((name) => {
      const source = readFileSync(join(SRC, name), 'utf8');
      return { name, path: join(SRC, name), source, code: stripComments(source) };
    });
}

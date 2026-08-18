// facefix-score.mjs — two-term acceptance metrics for F3 alphanumerics.
import { F3 } from '../src/render/px.js';

const CANONICAL = {
  A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###', F: '###/#../##./#../#..', G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.', K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#', N: '#.#/##./###/.##/#.#', O: '.#./#.#/#.#/#.#/.#.', P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/##./.##', R: '##./#.#/##./#.#/#.#', S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/.#./.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.', Z: '###/..#/.#./#../###',
  0: '###/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.#./..#/##.',
  4: '#.#/#.#/###/..#/..#', 5: '###/#../##./..#/##.', 6: '.##/#../###/#.#/###', 7: '###/..#/.#./.#./.#.',
  8: '###/#.#/###/#.#/###', 9: '###/#.#/###/..#/##.',
};
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
function bm(g) { return g.split('/').join(''); }
function ham(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }

const scores = [];
for (const ch of ALPHA) {
  const shipped = bm(F3[ch]);
  const own = bm(CANONICAL[ch]);
  const dOwn = ham(shipped, own);
  let nearest = ch;
  let nearestD = dOwn;
  for (const other of ALPHA) {
    const d = ham(shipped, bm(CANONICAL[other]));
    if (d < nearestD) { nearestD = d; nearest = other; }
  }
  scores.push({ ch, form: F3[ch], dOwn, nearest, nearestD, pass: nearest === ch });
}
console.log(JSON.stringify({ scores, allPass: scores.every((s) => s.pass) }, null, 2));

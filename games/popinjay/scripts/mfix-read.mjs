// Headless F3 string render probe — confirms misread-prone words paint distinct M vs X pixels.
import { Painter, t3, F3 } from '../src/render/px.js';

const STRINGS = [
  'CLIMB', 'COMPOSURE', 'AMUSEMENTS', 'M7', 'FIRE WIRE',
  'EXPOSITION AMUSEMENTS CO.', 'POPINJAY',
];

function renderString(s, y) {
  const p = new Painter(s.length * 4 + 16, 8);
  p.clear('#000000');
  t3(p, s, 4, y, '#ffffff', 1);
  return p;
}

function glyphAt(p, s, y, charIdx) {
  const x0 = 4 + charIdx * 4;
  const rows = [];
  for (let j = y; j < y + 5; j++) {
    let row = '';
    for (let i = x0; i < x0 + 3; i++) {
      const px = p.get(i, j);
      row += (px[0] + px[1] + px[2] > 24) ? '#' : '.';
    }
    rows.push(row);
  }
  return rows.join('/');
}

function classifyM(rows) {
  const xRows = F3.X.split('/');
  const mRows = F3.M.split('/');
  const dX = rows === xRows ? 0 : rows.split('/').reduce((d, r, i) => {
    const a = r.split(''), b = xRows[i].split('');
    for (let k = 0; k < 3; k++) if (a[k] !== b[k]) d++;
    return d;
  }, 0);
  const dM = rows === mRows ? 0 : rows.split('/').reduce((d, r, i) => {
    const a = r.split(''), b = mRows[i].split('');
    for (let k = 0; k < 3; k++) if (a[k] !== b[k]) d++;
    return d;
  }, 0);
  if (rows === mRows) return 'M';
  if (rows === xRows) return 'X';
  return dM <= dX ? 'M?' : 'X?';
}

for (const s of STRINGS) {
  const p = renderString(s, 1);
  const hits = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'M' || ch === 'X') {
      const painted = glyphAt(p, s, 1, i);
      hits.push(`${ch}@${i}→${classifyM(painted)}(${painted})`);
    }
  }
  console.log(s, hits.length ? hits.join(' ') : '(no M/X)');
}

// Segmented discrete meter cells (M9 register, directive item 5). Pure so the DOM
// renderer and the tests share one source of truth. Returns an array of cell states:
//   'on'  — a filled cell
//   'up'  — a pending-gain preview cell (the week's plan would raise this stat)
//   'cap' — a pending-loss preview cell (the plan would lower it)
//   ''    — an empty cell
// `cells` cells span 0..`cap`; a pending `delta` previews the change against the
// current value, both clamped to [0, cap].
export function meterCells(cur, delta, cells, cap) {
  const clampV = (v) => Math.max(0, Math.min(cap, v));
  const filled = Math.round((clampV(cur) / cap) * cells);
  let lo = filled;
  let hi = filled;
  let klass = '';
  if (delta) {
    const nf = Math.round((clampV(cur + delta) / cap) * cells);
    if (delta > 0) { lo = filled; hi = nf; klass = 'up'; }
    else { lo = nf; hi = filled; klass = 'cap'; }
  }
  const out = [];
  for (let i = 0; i < cells; i++) {
    if (delta && i >= lo && i < hi) out.push(klass);
    else if (i < filled) out.push('on');
    else out.push('');
  }
  return out;
}

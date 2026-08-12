// M6 INTERFACE — the full-screen text modes (encounter, death, building) as
// headless, testable draw lists on the shared stacked-region planner. Same
// vocabulary as the title/creation screens: a hue title band, dim labels, faint
// body. The shell paints these through the palette and overlays busts/keybar.
//
// Every builder clamps variable-length content (foe/party rosters, logs,
// approaches) to a fixed line budget so the layout can never overflow the
// canvas — the regression suite asserts no-overlap/no-clip across the range.
import { createLayout, stripSeed, bustBoxFor, bustColW, wrapToWidth, textWidth, ellipsize } from './layout.js';

const clampList = (arr, n) => {
  const list = (arr || []).slice(0, n);
  const extra = (arr || []).length - list.length;
  return { list, extra };
};

/**
 * Build the ENCOUNTER (combat) draw list (M11 tactical combat).
 * `menu` is 'root' | 'talk' | 'item'.
 *   root : the tactical verb list (`verbs`: {key,label,enabled}) — the LIVE options,
 *          drawn bright with a `›` marker so they read distinct from the dim log
 *          history (UI-critique #3); a disabled verb (talk hardened / gambit spent)
 *          shows faint.
 *   talk : the stat-gated approaches (`approaches`: {verb,difficulty}).
 *   item : the usable combat items (`items`: {key,label}).
 * EVERY line is whole-word WRAPPED to the bust-side column (UI-critique #1: no combat
 * string is ever ellipsis-clipped); regions are sized to their wrapped content. Content
 * stays in the left column so the foe bust (shell, right) never overlaps text.
 */
export function buildCombatDrawList({
  foes = [],
  party = [],
  round = 1,
  menu = 'root',
  verbs = [],
  approaches = [],
  items = [],
  note = '',
  log = [],
  width = 416,
  height = 416,
} = {}) {
  const marginX = 16;
  const L = createLayout({ width, height, marginX, marginY: 14, gap: 6 });
  // Text column derived from the SHARED bust box so it can never disagree with
  // where the shell actually draws the foe bust (directive §4, no overprint).
  const colW = bustColW(bustBoxFor('combat', width), marginX);
  const F = clampList(foes, 3);
  const P = clampList(party, 3);
  const wrap = (s, size) => wrapToWidth(stripSeed(s), colW, size); // pre-wrap → never ellipsized
  // Wrap, then CAP to `max` lines: real (short) content wraps fully and never ellipsizes
  // (UI-critique #1); only adversarially long content is truncated (…) so the card can
  // never overflow the canvas (the overprint regression drives 500-char strings).
  const wrapCap = (list, size, max) => {
    const out = list.flatMap((s) => wrap(s, size));
    if (out.length <= max) return out;
    const kept = out.slice(0, max);
    kept[max - 1] = kept[max - 1].replace(/…?$/, '…');
    return kept;
  };

  // Pre-wrap each region's content so its line budget always fits (no clip).
  const themSrc = ['THEM', ...F.list.map((f) => `  ${stripSeed(f.name)}  [${f.hp}/${f.maxHp}]`), ...(F.extra ? [`  …and ${F.extra} more`] : [])];
  // D4: mark which row is the PC — the ‹you› tag distinguishes the stranger you
  // command from allied followers at a glance (QA finding 4). Combatants carry an id
  // ('pc' for the PC); rows built without ids (some tests) simply omit the tag.
  const youSrc = ['YOU', ...P.list.map((p) => `  ${stripSeed(p.name)}  [${p.hp}/${p.maxHp}]${p.id === 'pc' ? '  ‹you›' : ''}`), ...(P.extra ? [`  …and ${P.extra} more`] : [])];
  const themLines = wrapCap(themSrc, 12, 5);
  const youLines = wrapCap(youSrc, 12, 5);

  // The prompt block: the live choices for the current menu, each a pre-wrapped entry
  // carrying its own color (bright hue for an enabled option, faint for a disabled one).
  const prompt = []; // { text, color }
  if (menu === 'talk') {
    prompt.push({ text: 'PARLEY — choose an approach', color: 'hue' });
    const A = clampList(approaches, 5);
    A.list.forEach((a, i) => prompt.push({ text: `  › [${i + 1}] ${stripSeed(a.verb)}  (${a.difficulty})`, color: 'dim' }));
    if (A.extra) prompt.push({ text: `  …and ${A.extra} more`, color: 'faint' });
  } else if (menu === 'item') {
    prompt.push({ text: 'REACH — use what you carry', color: 'hue' });
    const I = clampList(items, 6);
    if (!I.list.length) prompt.push({ text: '  nothing here bites', color: 'faint' });
    I.list.forEach((it, i) => prompt.push({ text: `  › [${i + 1}] ${stripSeed(it.label)}`, color: it.enabled === false ? 'faint' : 'dim' }));
    if (I.extra) prompt.push({ text: `  …and ${I.extra} more`, color: 'faint' });
  } else {
    // root: the tactical verbs — the live options, bright, marked with `›`.
    for (const v of verbs) {
      prompt.push({ text: `  › [${v.key}] ${stripSeed(v.label)}`, color: v.enabled === false ? 'faint' : 'hue' });
    }
    if (!verbs.length) prompt.push({ text: 'choose your move — see the bar below', color: 'dim' });
  }
  // wrap each prompt entry, remembering its color; cap total so adversarial content
  // can't overflow (real verb/approach labels are short — they never hit the cap).
  let promptLines = prompt.flatMap((p) => wrap(p.text, 13).map((t) => ({ text: t, color: p.color })));
  if (promptLines.length > 8) { promptLines = promptLines.slice(0, 8); const last = promptLines[7]; promptLines[7] = { text: last.text.replace(/…?$/, '…'), color: last.color }; }

  L.define('header', { lines: 1, lineHeight: 24, size: 16 });
  L.define('them', { lines: themLines.length, lineHeight: 16, size: 12 });
  L.define('you', { lines: youLines.length, lineHeight: 16, size: 12 });
  L.define('prompt', { lines: promptLines.length || 1, lineHeight: 17, size: 13 });
  // Note (the in-voice beat) + log both fit the remaining height; the note takes at most
  // 2 lines and never more than what's left, so adversarial content can't overflow.
  // A note may be a single string or an array of strings (e.g. a two-line talk exchange).
  let noteLines = note ? wrapCap(Array.isArray(note) ? note : [note], 12, 2) : [];
  if (noteLines.length) {
    const budget = L.remainingLines(16);
    noteLines = noteLines.slice(0, Math.max(0, Math.min(noteLines.length, budget - 1)));
    if (noteLines.length) L.define('note', { lines: noteLines.length, lineHeight: 16, size: 12 });
  }

  // Combat log: pre-wrapped to the column and sized to the lines that fit the remaining
  // height (UI-critique #5: grow to up to 4 wrapped lines). If space is tight we drop
  // whole OLDEST entries and keep the most recent intact — no line is ever clipped.
  const LOG_LH = 15;
  const G = clampList(log, 4);
  let logLines = [];
  if (G.list.length) {
    const wrapped = G.list.flatMap((l) => wrap(l, 12));
    const budget = L.remainingLines(LOG_LH);
    logLines = wrapped.length > budget ? wrapped.slice(wrapped.length - budget) : wrapped;
    if (logLines.length) L.define('log', { lines: logLines.length, lineHeight: LOG_LH, size: 12 });
  }

  L.push('header', '— ENCOUNTER —', { color: 'hue', size: 16, maxWidth: colW });
  themLines.forEach((t, i) => L.push('them', t, { color: i === 0 ? 'dim' : 'faint', size: 12, maxWidth: colW }));
  youLines.forEach((t, i) => L.push('you', t, { color: i === 0 ? 'dim' : 'faint', size: 12, maxWidth: colW }));
  for (const p of promptLines) L.push('prompt', p.text, { color: p.color, size: 13, maxWidth: colW });
  for (const l of noteLines) L.push('note', l, { color: 'hue', size: 12, maxWidth: colW });
  for (const l of logLines) L.push('log', l, { color: 'dim', size: 12, maxWidth: colW });
  return L.rows();
}

/**
 * Build the DEATH screen draw list. The HERO bust is drawn on the right by the
 * shell, so body text stays in the left column.
 */
export function buildDeathDrawList({
  fallen = '—',
  pc = {},
  lineage = [],
  recap = [],
  killingBlow = '',
  width = 416,
  height = 416,
} = {}) {
  const marginX = 20;
  const colW2 = width - 2 * marginX;
  const L = createLayout({ width, height, marginX, marginY: 20, gap: 8 });
  const colW = bustColW(bustBoxFor('death', width), marginX);
  L.define('title', { lines: 1, lineHeight: 34, size: 24 });
  L.define('gone', { lines: 1, lineHeight: 22, size: 14 });
  L.define('lead', { lines: 2, lineHeight: 18, size: 13 });
  L.define('name', { lines: 1, lineHeight: 26, size: 16 });
  L.define('omen', { lines: 2, lineHeight: 17, size: 12 });
  L.define('carries', { lines: 2, lineHeight: 17, size: 12 });
  // cp-018: final-fight recap (only when deathInfo carries one). Shown below the
  // bust, so it uses the full card width and is capped to avoid clipping lineage.
  const hasRecap = recap.length > 0 && killingBlow;
  let recapBody = [];
  if (hasRecap) {
    recapBody = [...recap.slice(-2), `killing blow - ${killingBlow}`]
      .flatMap((s) => wrapToWidth(stripSeed(s), colW2, 12));
    if (recapBody.length > 3) recapBody = recapBody.slice(recapBody.length - 3);
    L.define('recap', { lines: 1 + recapBody.length, lineHeight: 14, size: 12 });
  }
  // C3: the lineage roll — the world remembers who came before (below the bust, so it
  // uses the full width). Newest first; each line names days survived, killer, deeds.
  L.define('rollhead', { lines: 1, lineHeight: 20, size: 12 });
  L.define('roll', { lines: 3, lineHeight: 16, size: 11 });

  const name = stripSeed(pc.name) || '—';
  const omen = pc.omen ? stripSeed(pc.omen) : '—';
  const odd = pc.oddment ? stripSeed(pc.oddment.name || pc.oddment) : '—';

  // title/gone/lead stack ABOVE the bust (which starts at y≈147) so they use the
  // full card width; name/omen/carries sit BESIDE the bust and clamp to colW —
  // clamping only the rows that share the bust's y-band avoids needless clipping.
  L.push('title', 'YOU DIED.', { color: 'hue', size: 24 });
  L.push('gone', `${stripSeed(fallen)} is gone for good.`, { color: 'dim', size: 14 });
  L.push('lead', 'The world remembers. A stranger takes up the thread:', { color: 'faint', size: 13 });
  L.push('name', name, { color: 'hue', size: 16, maxWidth: colW });
  L.push('omen', `omen — ${omen}`, { color: 'faint', size: 12, maxWidth: colW });
  L.push('carries', `carries — ${odd}`, { color: 'faint', size: 12, maxWidth: colW });
  if (hasRecap) {
    L.push('recap', '— the final pattern —', { color: 'dim', size: 12, maxWidth: colW2 });
    for (const line of recapBody) L.push('recap', line, { color: 'faint', size: 12, maxWidth: colW2 });
  }
  if (lineage && lineage.length) {
    L.push('rollhead', '— those the world remembers —', { color: 'dim', size: 12, maxWidth: colW2 });
    for (const e of lineage.slice(-3).reverse()) {
      const d = e.deeds || {};
      const deeds = `${d.gatesOpened || 0}g ${d.clears || 0}c ${d.followersLost || 0}†`;
      L.push('roll', `${stripSeed(e.name)} · ${e.days | 0}d · ${stripSeed(e.killer || '?')} · ${deeds}`, { color: 'faint', size: 11, maxWidth: colW2 });
    }
  }
  return L.rows();
}

/**
 * Build the BUILDING interior draw list (interiors stay TEXT — operator lock).
 * A framed greeting: hue name band, then the wrapped service lines.
 */
/**
 * Build the JOURNAL draw list (M7). Two states on the shared planner:
 *   • writing — the compose view: the place stamp, the live draft + a cursor,
 *     and the file/discard hint.
 *   • reading — the merged, corrupted + ghost view in chronological order. Each
 *     entry gets a glyph (· own · ~ corrupted · ✶ ghost), a [when] where meta
 *     line, and its (possibly corrupted / fabricated) body. Ghost meta reads in
 *     the accent hue; corrupted bodies read dim, pristine bodies read bright.
 * Content clamps to the body budget so it can never overflow (regression-tested).
 */
export function buildJournalDrawList({
  entries = [],
  writing = false,
  editing = false,
  draft = '',
  place = '',
  selectedId = null,
  width = 416,
  height = 416,
} = {}) {
  const L = createLayout({ width, height, marginX: 18, marginY: 16, gap: 8 });
  const colW = width - 36;
  L.define('header', { lines: 1, lineHeight: 26, size: 16 });
  L.define('body', { lines: 16, lineHeight: 17, size: 12 });
  if (writing) {
    L.push('header', `— JOURNAL · ${editing ? 'revising' : 'writing'} —`, { color: 'hue', size: 16 });
    L.push('body', `at ${stripSeed(place) || 'here'}:`, { color: 'faint', size: 12, maxWidth: colW });
    L.push('body', `${draft}▍`, { color: 'dim', size: 13, maxWidth: colW });
    L.skip('body');
    L.push('body', '[Enter] file it    [Esc] discard', { color: 'faint', size: 12, maxWidth: colW });
    return L.rows();
  }
  L.push('header', '— JOURNAL —', { color: 'hue', size: 16 });
  if (!entries.length) {
    L.push('body', 'the record is empty. [N] to write a note.', { color: 'faint', size: 12, maxWidth: colW });
    return L.rows();
  }
  for (const e of entries) {
    const sel = selectedId != null && e.id === selectedId;
    const glyph = e.origin === 'ghost' ? '✶' : (e.corruption > 0 ? '~' : '·');
    const mark = sel ? '▸ ' : '  ';
    const where = stripSeed(e.where) || (e.origin === 'ghost' ? 'the margin' : 'here');
    L.push('body', `${mark}${glyph} [${e.when}] ${where}`, { color: e.origin === 'ghost' ? 'accent' : (sel ? 'hue' : 'faint'), size: 11, maxWidth: colW });
    L.push('body', `${sel ? '  ' : '  '}${e.text}`, { color: e.corruption > 0 ? 'dim' : 'hue', size: 12, maxWidth: colW });
  }
  return L.rows();
}

/**
 * Build the DUNGEON-ENCOUNTER (confront / sneak) draw list (M8 §5). The enemy
 * bust is drawn top-right by the shell (same box as combat), so every row clamps
 * to the text column — no text over the character picture (directive §4).
 */
export function buildSneakDrawList({
  name = '—',
  note = '',
  chance = null,
  width = 416,
  height = 416,
} = {}) {
  const marginX = 16;
  const L = createLayout({ width, height, marginX, marginY: 22, gap: 10 });
  const colW = bustColW(bustBoxFor('combat', width), marginX);
  L.define('header', { lines: 1, lineHeight: 28, size: 16 });
  L.define('who', { lines: 2, lineHeight: 20, size: 13 });
  if (note) L.define('note', { lines: 2, lineHeight: 18, size: 12 });
  L.define('opts', { lines: 3, lineHeight: 24, size: 14 });

  L.push('header', '— IN YOUR PATH —', { color: 'hue', size: 16, maxWidth: colW });
  L.push('who', stripSeed(name), { color: 'dim', size: 13, maxWidth: colW });
  if (note) L.push('note', stripSeed(note), { color: 'faint', size: 12, maxWidth: colW });
  L.push('opts', '[F] confront it', { color: 'hue', size: 14, maxWidth: colW });
  const odds = chance != null ? `  (~${Math.round(chance * 100)}%)` : '';
  L.push('opts', `[S] slip past — NERVE${odds}`, { color: 'dim', size: 14, maxWidth: colW });
  L.push('opts', '[Esc] back away', { color: 'faint', size: 12, maxWidth: colW });
  return L.rows();
}

/**
 * Build the PARTY-management draw list (M12 D3). The PC then a row per follower —
 * name, ♥ hp, and what it wants (statuses join once Part H lands). The shell draws
 * each portrait beside its row (busts already exist) and dismisses the selected one.
 * `sel` indexes the followers (the PC is never dismissable). Text clamps to a column
 * that leaves room for the portrait tiles on the left.
 */
export function buildPartyDrawList({
  pc = {},
  followers = [],
  sel = 0,
  width = 416,
  height = 416,
} = {}) {
  const marginX = 22;
  const tile = 26; // portrait tile width the shell draws to the left of each row
  const L = createLayout({ width, height, marginX, marginY: 22, gap: 10 });
  const colW = width - marginX * 2 - (tile + 10);
  L.define('title', { lines: 1, lineHeight: 28, size: 18 });
  L.define('pc', { lines: 2, lineHeight: 22, size: 14 });
  L.define('roster', { lines: Math.max(1, followers.length * 2), lineHeight: 20, size: 13 });
  L.define('close', { lines: 1, lineHeight: 20, size: 12 });
  L.push('title', '— the party —', { color: 'hue', size: 18 });
  L.push('pc', `${stripSeed(pc.name) || 'you'}   ♥ ${pc.hp ?? '—'}/${pc.maxHp ?? '—'} — you`, { color: 'hue', size: 14, maxWidth: colW });
  if (!followers.length) {
    L.push('pc', 'no one walks with you yet.', { color: 'faint', size: 12, maxWidth: colW });
  } else {
    followers.forEach((f, i) => {
      const on = i === sel;
      L.push('roster', `${on ? '▸ ' : '  '}${stripSeed(f.name)}   ♥ ${f.hp}/${f.maxHp}`, { color: on ? 'hue' : 'dim', size: 13, maxWidth: colW });
      const want = f.want ? `wants ${stripSeed(String(f.want))}` : 'wants nothing you can name';
      L.push('roster', `    ${want}`, { color: 'faint', size: 12, maxWidth: colW });
    });
  }
  L.push('close', '[W]/[S] pick   [X] dismiss   [Y]/[Esc] close', { color: 'faint', size: 12, maxWidth: width - marginX * 2 });
  return L.rows();
}

/**
 * Build THE MANUAL draw list (Structure Arc slice 1, LOCK 1/2 — the questline
 * reader). Read-only: a header, the intro beats (if any — placeholder prose
 * either way), then one entry per operation — number/title, what it teaches,
 * and (once active/complete) which dungeon it points at. `operations` is the
 * shape src/engine/manual.js's list() returns, pre-flattened by the shell to
 * { number, title, teaches, status, siteLabel }.
 *
 * Every field is whole-word wrapped to the card width. The content is then
 * exposed through a line-window (`buildManualPage`) so the shell can scroll it
 * without either ellipsizing prose or letting a later operation fall off the
 * card. The fixed header stays put while W/S moves the body window.
 */
export function buildManualPage({
  operations = [],
  introBeats = [],
  width = 416,
  height = 416,
  scroll = 0,
} = {}) {
  const marginX = 18;
  const colW = width - marginX * 2;
  const headerTop = 14;
  const headerLineHeight = 24;
  const bodyTop = 50;
  const bodyBottom = height - 36; // reserve the shell's fixed scroll/close footer
  const bodyLineHeight = 15;
  const visibleLines = Math.max(1, Math.floor((bodyBottom - bodyTop) / bodyLineHeight));
  const glyphFor = (s) => (s === 'complete' ? '✓' : s === 'active' ? '▸' : '·');
  const colorFor = (s) => (s === 'complete' ? 'dim' : s === 'active' ? 'hue' : 'faint');

  // Blank entries are intentional paragraph/operation spacing. They occupy a
  // scroll line but do not emit an empty canvas row.
  const content = [];
  const addWrapped = (text, color = 'faint', size = 11) => {
    for (const line of wrapToWidth(stripSeed(text), colW, size)) content.push({ text: line, color, size });
  };
  const blank = () => content.push(null);

  for (const beat of introBeats) {
    addWrapped(beat, 'faint', 11);
    blank();
  }

  if (!operations.length) addWrapped('no operations recorded', 'faint', 12);
  for (const op of operations) {
    const c = colorFor(op.status);
    addWrapped(`${glyphFor(op.status)} Operation ${op.number} — ${op.title}`, c, 12);
    addWrapped(`    teaches: ${op.teaches}`, 'faint', 11);
    if (op.status !== 'locked' && op.siteLabel) {
      const verb = op.status === 'complete' ? 'was' : 'points to';
      addWrapped(`    ${verb}: ${op.siteLabel}`, op.status === 'active' ? 'accent' : 'faint', 11);
    }
    blank();
  }
  while (content.length && content[content.length - 1] == null) content.pop();

  const maxScroll = Math.max(0, content.length - visibleLines);
  const at = Math.max(0, Math.min(maxScroll, scroll | 0));
  const rows = [{
    text: '— THE MANUAL —', x: marginX,
    y: headerTop + headerLineHeight - Math.floor(headerLineHeight * 0.28),
    size: 16, color: 'hue', region: 'header', width: textWidth('— THE MANUAL —', 16),
    bandTop: headerTop, bandBottom: headerTop + headerLineHeight,
  }];
  content.slice(at, at + visibleLines).forEach((line, i) => {
    if (!line) return;
    rows.push({
      ...line,
      x: marginX,
      y: bodyTop + (i + 1) * bodyLineHeight - Math.floor(bodyLineHeight * 0.28),
      region: 'body',
      width: textWidth(line.text, line.size),
      bandTop: bodyTop + i * bodyLineHeight,
      bandBottom: bodyTop + (i + 1) * bodyLineHeight,
    });
  });
  return {
    rows,
    scroll: at,
    maxScroll,
    visibleLines,
    totalLines: content.length,
    canScrollUp: at > 0,
    canScrollDown: at < maxScroll,
  };
}

export function buildManualDrawList(opts = {}) {
  return buildManualPage(opts).rows;
}

export function buildBuildingDrawList({
  name = '—',
  lines = [],
  width = 416,
  height = 416,
  glyph = '',
  glyphColor = 'dim',
} = {}) {
  // A5: apply the same pre-wrap discipline the bust panels use — every line wraps to
  // the text column (colW) and no string is ever ellipsis-clipped. The name band was
  // a single line, so a long "kept by <proprietor>" title ellipsized; give it room to
  // WRAP instead, and pass an explicit maxWidth on every push so the column is honored.
  const marginX = 20;
  const colW = width - 2 * marginX;
  const L = createLayout({ width, height, marginX, marginY: 24, gap: 12 });
  // F3: the per-service glyph gets its own top band so it can never overprint the
  // wrapped name or body prose. When the shell passes a glyph it is centered; when
  // it is absent the layout falls back to the original text-only greeting.
  if (glyph) {
    L.define('glyph', { lines: 1, lineHeight: 44, size: 36 });
    const placed = L.push('glyph', glyph, { color: glyphColor, maxWidth: colW });
    if (placed[0]) {
      placed[0].x = Math.max(marginX, Math.round((width - textWidth(glyph, 36)) / 2));
    }
  }
  L.define('name', { lines: 3, lineHeight: 26, size: 18 }); // wraps a long proprietor name, never ellipsized
  // Reserve a generous body budget; wrapped service prose is short.
  L.define('body', { lines: 10, lineHeight: 22, size: 14 });
  L.push('name', `— ${stripSeed(name)} —`, { color: 'hue', size: 18, maxWidth: colW });
  for (const l of lines) L.push('body', stripSeed(l), { color: 'dim', size: 14, maxWidth: colW });
  return L.rows();
}

/**
 * Build the SHOP interior draw list (M12). A glyph + name band, the greeting,
 * and numbered stock rows with their chaotic tender price. A message line (buy
 * feedback / refusal) sits below the stock so the player sees the result.
 */
export function buildShopDrawList({
  name = '—',
  lines = [],
  stock = [],
  message = '',
  money = 0,
  currencyPlural = 'grey coins',
  glyph = '',
  glyphColor = 'dim',
  width = 416,
  height = 416,
} = {}) {
  const marginX = 18;
  const colW = width - 2 * marginX;
  const L = createLayout({ width, height, marginX, marginY: 20, gap: 8 });
  if (glyph) {
    L.define('glyph', { lines: 1, lineHeight: 38, size: 32 });
    const placed = L.push('glyph', glyph, { color: glyphColor, maxWidth: colW });
    if (placed[0]) {
      placed[0].x = Math.max(marginX, Math.round((width - textWidth(glyph, 32)) / 2));
    }
  }
  L.define('name', { lines: 2, lineHeight: 24, size: 16 });
  L.define('body', { lines: 2, lineHeight: 18, size: 12 });
  L.define('purse', { lines: 1, lineHeight: 16, size: 11 });
  L.define('stock', { lines: Math.max(1, stock.length), lineHeight: 19, size: 12 });
  L.define('message', { lines: 2, lineHeight: 18, size: 12 });
  L.define('hint', { lines: 1, lineHeight: 16, size: 11 });
  L.push('name', `— ${stripSeed(name)} —`, { color: 'hue', size: 16, maxWidth: colW });
  for (const l of lines) L.push('body', stripSeed(l), { color: 'dim', size: 12, maxWidth: colW });
  L.push('purse', `${money} ${stripSeed(currencyPlural)}`, { color: 'faint', size: 11, maxWidth: colW });
  for (let i = 0; i < stock.length; i++) {
    const s = stock[i];
    const row = `[${i + 1}] ${stripSeed(s.name)}  —  ${s.priceText}`;
    L.push('stock', row, { color: 'dim', size: 12, maxWidth: colW });
  }
  if (message) L.push('message', stripSeed(message), { color: 'accent', size: 12, maxWidth: colW });
  L.push('hint', stock.length ? '[1-6] buy  [S] sell offer  [Esc] leave' : '[Esc] leave', { color: 'faint', size: 11, maxWidth: colW });
  return L.rows();
}

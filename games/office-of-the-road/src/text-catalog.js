// Complete player-visible text catalog for the objective text-readability gate.
// Every string that can render is enumerated (no sampling). Widths are native
// 320×200 canvas pixels at the shipped bitmap face sizes (6/7/8px → scale 1;
// ≥9px → scale 2).

import { JOBS, deriveStats } from './jobs.js';
import { CARDS } from './deck.js';
import { ITEMS, modsLine } from './items.js';
import { ROUTE_ARCHETYPES } from './route.js';
import { MANDATE_SUBJECTS, MANDATE_OBJECTS } from './mandate.js';
import { CERTIFICATIONS } from './certifications.js';
import { PLAYER_CREDITS } from './credits.js';
import { ENEMY_NAMES, ENEMY_VERBS, WINDOW_LABEL } from './combat.js';
import { TUNING } from './tuning.js';
import { createLedger, recordRoute, recordMissedWindow, recordReduction, recordCredit, composeReport } from './report.js';
import { PIXEL_FONT } from './pixel-font.js';
import { TEXT_LEADING } from './layout.js';
import { wrapLines, truncateText } from './text-wrap.js';

export const VW = 320;
export const BODY_FONT_PX = 7;
export const SMALL_FONT_PX = 6;
export const HEADING_FONT_PX = 10;

const FULL = VW - 24; // 296
const DEFEAT = VW - 28; // 292
const MANDATE_TITLE_W = (VW - 12) - (12 + 110) - 4; // 182
const MANDATE_META_W = (VW - 12) - (12 + 16) - 4; // 276
const ROUTE_CARD_W = 92 - 10; // 82
const CAMP_JOB_STATS_W = 288 - 126; // 162
const SHOP_BUY_NAME_W = 100;
const SHOP_MODS_W = 140;
const DRAFT_NAME_W = 32; // one draft card column
const DRAFT_TEXT_W = VW - (16 + 3 * (32 + 10)) - 8; // 170
const HAND_STATE_W = 30 - 2; // the plate is 32px; the label is inset 3px and sits 1px clear
const COMBAT_NAME_W = 58; // Chirurgeon at 6px; combat roster never ellipsizes
const DECK_CARD_NAME_W = 50;
const INTAKE_DESC_W = VW - 128;
const DOCKET_HIST_W = VW - 200;
const DOCKET_FILE_W = 168 - 8 - 4; // the ON FILE panel's inner text column
const SCORE_LINE_W = 110; // the march score/mute line, right-aligned at VW-12
const COMBAT_LINE_W = 140; // owned left resolver column (roster begins x=156)
const COMBAT_LINE_LINES = 2;

const INTAKE_BOXES = [
  ['ADVANCE', 'Pace the march from 0.5× to 4×.'],
  ['SUSPENSION', 'Suspend proceedings at will.'],
  ['INTERVENTION', 'Play tarot into a live matter.'],
  ['REASSIGNMENT', "Reassign a frame's trade at camp."],
  ['REQUISITION', 'Issue quartermaster kit in towns.'],
  ['ROUTING', 'Choose each leg by exact tradeoff.'],
  ['EARLY RETURN', 'File an early return at camp or town.'],
];

const TERRAIN_LABEL = {
  'chalk-flat': 'Chalk Flat', fen: 'The Fen', 'toll-wood': 'Toll Wood',
  'the-cutting': 'The Cutting', 'marker-stones': 'Marker Stones',
};

const TIER_LABEL = { routine: 'ROUTINE', elite: 'ELITE', boss: 'JURISDICTION' };

/** Opening resolver line. Trailing card-play clause lives on the paused banner. */
export function matterLine(tier) {
  const label = TIER_LABEL[tier] || TIER_LABEL.routine;
  return `${label} matter, filed on the road.`;
}

/** @typedef {{ id: string, text: string, maxWidth: number, maxLines: number, fontPx: number }} TextCase */

/** @returns {{ viewW: number, viewH: number, bodyFontPx: number, cellHeight: number, cases: TextCase[] }} */
export function buildTextCatalog() {
  /** @type {TextCase[]} */
  const cases = [];
  const narrow6 = { font: `${SMALL_FONT_PX}px monospace`, textAlign: 'left', fillStyle: '#fff' };
  const add = (id, text, maxWidth, maxLines = 1, fontPx = BODY_FONT_PX) => {
    const t = String(text == null ? '' : text);
    if (!t.trim()) return;
    cases.push({ id, text: t, maxWidth, maxLines, fontPx });
  };

  // ---- Brand / chrome (masthead subtitle is 7px, not heading scale) ----------
  add('chrome:title', 'THE OFFICE OF THE ROAD', FULL, 1, HEADING_FONT_PX);
  add('chrome:title-tag', 'The desk the heroes report to.', FULL, 1, BODY_FONT_PX);
  add('chrome:title-sub', 'An expedition is issued. The road processes it.', FULL, 1, SMALL_FONT_PX);
  add('chrome:howto-charge', 'HOW TO PLAY: THE CHARGE', FULL, 1, BODY_FONT_PX);
  add('chrome:howto-verbs', 'HOW TO PLAY: THE VERBS ON FILE', FULL, 1, BODY_FONT_PX);
  add('howto:charge:0', 'You are the desk. The party marches itself.', FULL, 1, BODY_FONT_PX);
  add('howto:charge:1', 'The Office issues a mandate. The road does the work.', FULL, 1, BODY_FONT_PX);
  add('howto:charge:2', 'Combat resolves on standing orders and jobs.', FULL, 1, BODY_FONT_PX);
  add('howto:charge:3', 'Tarot from the hand is the desk\'s intervention.', FULL, 1, BODY_FONT_PX);
  add('howto:charge:4', 'At camp and town the file may be edited:', FULL, 1, BODY_FONT_PX);
  add('howto:charge:5', 'jobs, deck, stores, and the next road.', FULL, 1, BODY_FONT_PX);
  add('howto:charge:6', 'Death files a report. Certifications persist.', FULL, 1, BODY_FONT_PX);
  add('howto:verb:0', 'ADVANCE: pace the march from 0.5× to 4×.', FULL, 1, BODY_FONT_PX);
  add('howto:verb:1', 'SUSPENSION: suspend proceedings at will (Space).', FULL, 1, BODY_FONT_PX);
  add('howto:verb:2', 'INTERVENTION: play tarot into a live matter.', FULL, 1, BODY_FONT_PX);
  add('howto:verb:3', "REASSIGNMENT: reassign a frame's trade at camp.", FULL, 1, BODY_FONT_PX);
  add('howto:verb:4', 'REQUISITION: issue quartermaster kit in towns.', FULL, 1, BODY_FONT_PX);
  add('howto:verb:5', 'ROUTING: choose each leg by exact tradeoff.', FULL, 1, BODY_FONT_PX);
  add('howto:verb:6', 'EARLY RETURN: file an early return at camp.', FULL, 1, BODY_FONT_PX);
  add('chrome:menu-start', 'START', 112, 1, BODY_FONT_PX);
  add('chrome:menu-howto', 'HOW TO PLAY', 112, 1, BODY_FONT_PX);
  add('march:opening-1', 'Expedition on file. Party waits', 164, 1, SMALL_FONT_PX);
  add('march:opening-2', 'Space begins the march.', 164, 1, SMALL_FONT_PX);
  add('chrome:masthead-field', 'FIELD RESOLUTION', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-docket', 'RETURNED DOCKET', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-credits', 'CREDITS & LICENSING: SHIPPED WITH THE FILE', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-camp', 'CAMP: LEG 12', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-town', 'TOWN: LEG 12', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-route', 'ROUTE THE NEXT LEG: LEG 12', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-shop', 'QUARTERMASTER: LEG 12', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-deck', 'THE FILE: DECK REVIEW', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-intake', 'INTAKE FORM: THE ORIENTATION MANDATE', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-soak', 'ACCEPTANCE DOSSIER: PLAYER-PATH SOAK', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-defeat-return', 'THE FILED REPORT: EARLY RETURN', FULL, 1, BODY_FONT_PX);
  add('chrome:masthead-defeat-notice', 'THE FILED REPORT: NOTICE OF REDUCTION', FULL, 1, BODY_FONT_PX);
  add('chrome:party', 'THE PARTY', 100, 1, BODY_FONT_PX);
  add('chrome:daybook', 'DAY BOOK', 80, 1, BODY_FONT_PX);
  add('chrome:speed', 'SPEED', 40, 1, SMALL_FONT_PX);
  add('chrome:stores', 'STORES', 40, 1, SMALL_FONT_PX);
  add('chrome:issue', 'ISSUE (requisition)', 150, 1, SMALL_FONT_PX);
  add('chrome:party-slot', 'THE PARTY · ITEM THEN SLOT', 150, 1, SMALL_FONT_PX);
  add('chrome:route-table', 'ROUTE TABLE: LEG 12', FULL, 1, BODY_FONT_PX);
  add('chrome:no-mandate', 'NO MANDATE ON FILE', 200, 1, BODY_FONT_PX);
  add('chrome:take-road', '▸ TAKE ROAD', ROUTE_CARD_W, 2, SMALL_FONT_PX);

  // ---- March / combat chrome ------------------------------------------------
  add('march:status-paused', '[ PAUSED ]', 120, 1, BODY_FONT_PX);
  add('march:status-held', '[ HELD ]', 120, 1, BODY_FONT_PX);
  add('march:status-marching', '[ MARCHING ]', 120, 1, BODY_FONT_PX);
  add('combat:paused', '[ PAUSED: play a card; Space runs ]', VW - 130, 2, BODY_FONT_PX);
  add('combat:resolving', '[ RESOLVING ]', VW - 130, 2, BODY_FONT_PX);
  for (const tier of Object.keys(TIER_LABEL)) {
    add(`combat:matter:${tier}`, matterLine(tier), COMBAT_LINE_W, COMBAT_LINE_LINES, BODY_FONT_PX);
  }
  add('combat:line-reduced', 'Unit reduced. File forwarded.', COMBAT_LINE_W, COMBAT_LINE_LINES, BODY_FONT_PX);
  add('combat:line-closed', 'Closed. Disbursement: 999¤.', COMBAT_LINE_W, COMBAT_LINE_LINES, BODY_FONT_PX);
  add('combat:line-draft', 'Card offered. Take one, or decline.', COMBAT_LINE_W, COMBAT_LINE_LINES, BODY_FONT_PX);
  add('combat:stalemate', 'STALEMATE recorded.', COMBAT_LINE_W, COMBAT_LINE_LINES, BODY_FONT_PX);
  add('combat:phrase-card', 'Hanged Man played. Chirurgeon reduced.', COMBAT_LINE_W, COMBAT_LINE_LINES, BODY_FONT_PX);
  add('combat:phrase-hit', 'Sgt: Serve Writ → Warden (−12) · Bailiff reduced', COMBAT_LINE_W, COMBAT_LINE_LINES, BODY_FONT_PX);
  add('combat:reduced', '(reduced)', COMBAT_NAME_W, 1, SMALL_FONT_PX);
  add('combat:offer', 'OFFERED FOR THE FILE: take one, or decline', FULL, 2, BODY_FONT_PX);
  add('combat:pick-hint', 'press 1–3 or click a card', 180, 1, SMALL_FONT_PX);
  add('combat:decline', 'DECLINE', 48, 1, BODY_FONT_PX);
  add('combat:left', '[left routine · intervene]', 160, 1, SMALL_FONT_PX);
  add('combat:routine', '[routine · no cards required]', 160, 1, SMALL_FONT_PX);
  // The plate carries the input key AND the window word, which is the string
  // the gate has to clear — not the word on its own.
  for (const state of Object.values(WINDOW_LABEL)) {
    add(`combat:hand-state:${state}`, `9 ${state}`, HAND_STATE_W, 1, SMALL_FONT_PX);
  }
  for (const [tier, label] of Object.entries(TIER_LABEL)) {
    add(`combat:tier:${tier}`, label, 90, 1, SMALL_FONT_PX);
  }

  // ---- Docket / resume ------------------------------------------------------
  add('docket:open-a', 'An expedition remains open on file. It may be resumed', FULL, 1, BODY_FONT_PX);
  add('docket:open-b', 'exactly where it was left, or filed anew.', FULL, 1, BODY_FONT_PX);
  add('docket:on-file', 'ON FILE', 80, 1, SMALL_FONT_PX);
  add('docket:unreadable', '(the file could not be read)', 160, 1, BODY_FONT_PX);
  add('docket:filed', 'EXPEDITIONS FILED', 120, 1, SMALL_FONT_PX);
  add('docket:none', '(no expeditions on record)', DOCKET_HIST_W, 2, SMALL_FONT_PX);
  add('docket:nav', 'Tab / ← →  choose   ·   Enter  file', FULL, 1, BODY_FONT_PX);
  add('docket:history-worst', '#99 leg 99 return 9999¤', DOCKET_HIST_W, 1, BODY_FONT_PX);
  add('docket:roster-worst', 'Chirurgeon · Chirurgeon · Chirurgeon · Chirurgeon', DOCKET_FILE_W, 2, SMALL_FONT_PX);
  add('docket:stores', 'supplies 999  ·', DOCKET_FILE_W, 1, SMALL_FONT_PX);

  // ---- Credits (pages are pre-wrapped to FULL by attributionPages) ----------
  {
    const ctx = { font: `${SMALL_FONT_PX}px monospace` };
    let i = 0;
    for (const sourceLine of PLAYER_CREDITS.split('\n')) {
      const cleaned = sourceLine.replace(/^\s{0,3}#{1,6}\s*/, '');
      if (!cleaned.trim()) continue;
      for (const line of wrapLines(ctx, cleaned, FULL)) {
        add(`credits:wrapped:${i++}`, line, FULL, 1, SMALL_FONT_PX);
      }
    }
  }
  add('credits:pager', 'CREDITS · page 1/3', FULL, 1, SMALL_FONT_PX);

  // ---- Camp / town ----------------------------------------------------------
  add('camp:intro-town', 'A town is reached. A quartermaster is in attendance; reassignment is permitted.', FULL, 2, BODY_FONT_PX);
  add('camp:intro-camp', 'Camp is made. Reassignment is permitted; rest is billed to the file.', FULL, 2, BODY_FONT_PX);
  add('camp:no-progress', '⚠ NO PROGRESS ON FILE: two legs without gain. Early return is available (below).', FULL, 2, BODY_FONT_PX);
  add('camp:supplies', `supplies 999  ·  9999¤  ·  rest: −${TUNING.campRecoverSupplyCost} supplies restores half of missing HP`, FULL, 2, BODY_FONT_PX);
  add('camp:nav', 'Tab focus · ◄ ► change job · Enter act', FULL, 1, SMALL_FONT_PX);
  for (const id of Object.keys(JOBS)) {
    const s = deriveStats(id);
    const raw = `hp ${s.hp}/${s.hp}  atk ${s.atk} def ${s.def} mag ${s.mag} spd ${s.spd}`;
    add(`camp:stats:${id}`, truncateText(narrow6, raw, CAMP_JOB_STATS_W), CAMP_JOB_STATS_W, 1, SMALL_FONT_PX);
  }

  // ---- Route ----------------------------------------------------------------
  add('route:intro', 'The next stretch is routed. The tradeoff is on file; choose the road.', FULL, 2, BODY_FONT_PX);
  add('route:meta', 'supplies 999  ·  9999¤  ·  terminus leg 99', FULL, 1, SMALL_FONT_PX);
  add('route:nav', 'Tab / ← → compare · Enter take road · Esc back', FULL, 2, BODY_FONT_PX);
  for (const a of ROUTE_ARCHETYPES) {
    add(`route:label:${a.id}`, a.label, ROUTE_CARD_W, 2, BODY_FONT_PX);
    add(`route:note:${a.id}`, a.note, ROUTE_CARD_W, 2, SMALL_FONT_PX);
    add(`route:safety:${a.id}`, '[' + a.safety + ']', ROUTE_CARD_W, 1, SMALL_FONT_PX);
  }
  add('route:enc', 'encounters ×9.99', ROUTE_CARD_W, 1, SMALL_FONT_PX);
  add('route:pay', 'pay ×9.99', ROUTE_CARD_W, 1, SMALL_FONT_PX);
  add('route:toll', 'toll −99 supplies', ROUTE_CARD_W, 1, SMALL_FONT_PX);
  add('route:no-toll', 'no toll', ROUTE_CARD_W, 1, SMALL_FONT_PX);

  // ---- Shop -----------------------------------------------------------------
  add('shop:ledger', 'ledger 9999¤ · supplies 999 · sell 50%', FULL, 1, BODY_FONT_PX);
  add('shop:resupply', `RESUPPLY  +${TUNING.resupplyBlock} supplies`, 120, 1, SMALL_FONT_PX);
  add('shop:requisitioned', 'REQUISITIONED', 150, 1, SMALL_FONT_PX);
  add('shop:empty', '(stores empty; requisition above)', 200, 1, SMALL_FONT_PX);
  add('shop:nav', 'Tab · Enter act · a filled slot un-issues · Esc back', FULL, 1, SMALL_FONT_PX);
  add('shop:sell', 'SELL (+999¤)', 80 - 4, 1, BODY_FONT_PX);
  add('shop:slot-empty', 'none', 36 - 16, 1, SMALL_FONT_PX);
  for (const it of Object.values(ITEMS)) {
    add(`shop:name:${it.id}`, it.name.slice(0, 16), SHOP_BUY_NAME_W, 1, SMALL_FONT_PX);
    add(`shop:mods:${it.id}`, modsLine(it.id), SHOP_MODS_W, 1, SMALL_FONT_PX);
    add(`shop:inv:${it.id}`, it.name.split(' ').pop().slice(0, 6), 48 - 4, 1, SMALL_FONT_PX);
    add(`shop:slot:${it.id}`, it.name.split(' ').pop().slice(0, 5), 36 - 4, 1, SMALL_FONT_PX);
    add(`item:full-name:${it.id}`, it.name, FULL, 1, BODY_FONT_PX);
  }

  // ---- Deck review ----------------------------------------------------------
  add('deck:meta', `99 cards on file · supplies 999 · strike a card: −${TUNING.deckRemoveCost}`, FULL, 1, BODY_FONT_PX);
  add('deck:nav', 'Tab / ← →  select · Enter strike · Esc back', 190, 2, BODY_FONT_PX);
  for (const card of Object.values(CARDS)) {
    add(`deck:name:${card.id}`, truncateText(narrow6, card.name.replace(/^The /, ''), DECK_CARD_NAME_W), DECK_CARD_NAME_W, 1, SMALL_FONT_PX);
    add(`deck:strike-hint:${card.id}`, card.text + '  (Enter strikes it)', 190, 3, SMALL_FONT_PX);
  }

  // ---- Intake ---------------------------------------------------------------
  add('intake:line-a', 'Expedition 0. Every box below is required.', FULL, 1, BODY_FONT_PX);
  add('intake:line-b', 'The desk may make each intervention. File to proceed.', FULL, 1, BODY_FONT_PX);
  for (const [name, desc] of INTAKE_BOXES) {
    add(`intake:name:${name}`, name, 70, 1, BODY_FONT_PX);
    add(`intake:desc:${name}`, desc, INTAKE_DESC_W, 2, SMALL_FONT_PX);
  }

  // ---- Soak / score dossier -------------------------------------------------
  add('soak:pass', 'VERDICT: PASS', FULL, 1, 8);
  add('soak:fail', 'VERDICT: ATTENTION (blocker present)', FULL, 1, 8);
  add('soak:player-path', 'PLAYER-PATH MINIMUM:', 150, 1, SMALL_FONT_PX);
  add('soak:metrics', 'WATCH / ACT METRICS:', 140, 1, SMALL_FONT_PX);
  add('soak:findings', 'FINDINGS:', 80, 1, SMALL_FONT_PX);
  add('soak:clean', '(none; clean run)', FULL, 1, SMALL_FONT_PX);
  add('soak:finding-worst', '[BLOCKER] A player-path verb never fired under real input events during the soak.', DEFEAT, 3, SMALL_FONT_PX);

  // ---- Defeat / report ------------------------------------------------------
  add('defeat:ledger-head', 'INCIDENT LEDGER: the chain that closed the file:', FULL, 1, SMALL_FONT_PX);
  add('defeat:certs-head', 'CERTIFICATIONS BANKED TO THE PERMANENT RECORD:', FULL, 1, SMALL_FONT_PX);
  add('defeat:no-mastery', '(no mastery earned this expedition)', DEFEAT, 1, SMALL_FONT_PX);
  add('defeat:meta', 'expeditions filed: 99 · deepest leg: 99 · escalation 9', DEFEAT, 2, SMALL_FONT_PX);
  {
    const L = createLedger();
    recordRoute(L, 12, { id: 'verge', label: 'The Unassessed Verge', safety: 'exposed', encounterMult: 1.75 });
    recordMissedWindow(L, 12, 'boss', 'The Hanged Man', 'Chirurgeon');
    recordMissedWindow(L, 12, 'elite', 'The Magician', 'Surveyor');
    recordMissedWindow(L, 12, 'routine', 'Temperance', 'Bailiff');
    recordReduction(L, 12, 'boss', 'Chirurgeon');
    recordCredit(L, 'the desk filed The Sun against a jurisdiction and the line held', 9);
    for (const cause of ['wipe', 'abandoned']) {
      const filed = composeReport(L, { leg: 12, cause, tier: 'boss', supplies: 3, gold: 1240 });
      for (const [i, ln] of filed.lines.entries()) {
        add(`defeat:report:${cause}:${i}`, ln.text, DEFEAT, 4, BODY_FONT_PX);
      }
    }
  }
  for (const c of CERTIFICATIONS) {
    add(`defeat:clearance:${c.id}`, `NEW CLEARANCE. ${c.name}: ${c.desc}`, DEFEAT, 2, SMALL_FONT_PX);
  }

  // ---- Mandate strip + generated titles -------------------------------------
  for (const subject of MANDATE_SUBJECTS) {
    for (const object of MANDATE_OBJECTS) {
      add(`mandate:title:${subject}:${object}`, `${subject} ${object}`, MANDATE_TITLE_W, 2, BODY_FONT_PX);
    }
  }
  {
    const maxSpan = TUNING.mandateLegSpan[1];
    const frugal = Math.max(1, Math.round(maxSpan * TUNING.mandateFrugalPerLeg));
    const provision = Math.round(TUNING.startSupplies * TUNING.mandateProvisionFrac);
    add('mandate:clause:frugal', `Clause (frugality): the haul is to field no more than ${frugal} matters.`, FULL, 2, SMALL_FONT_PX);
    add('mandate:clause:provision', `Clause (provisioning): the terminus is to be reached with supplies at or above ${provision}.`, FULL, 2, SMALL_FONT_PX);
    add('mandate:meta-worst', `terminus leg 99 · 5 legs to go · discharge ≥ ${TUNING.mandateRewardFloor + maxSpan * TUNING.mandateRewardPerLeg + TUNING.mandateRewardBase}¤`, MANDATE_META_W, 1, SMALL_FONT_PX);
    add('mandate:ref', 'MANDATE 9999-F', 90, 1, BODY_FONT_PX);
  }

  // ---- Jobs / verbs ---------------------------------------------------------
  for (const job of Object.values(JOBS)) {
    add(`job:name:${job.id}`, job.name, 70, 1, BODY_FONT_PX);
    add(`combat:job:${job.id}`, job.name, COMBAT_NAME_W, 1, SMALL_FONT_PX);
    add(`job:blurb:${job.id}`, job.blurb, 250, 1, SMALL_FONT_PX);
    for (const v of job.verbs) {
      add(`job:verb:${job.id}:${v.id}`, v.name, 90, 1, BODY_FONT_PX);
      if (v.note) add(`job:note:${job.id}:${v.id}`, v.note, FULL, 2, SMALL_FONT_PX);
    }
  }

  // ---- Cards ----------------------------------------------------------------
  for (const card of Object.values(CARDS)) {
    add(`card:name:${card.id}`, card.name, FULL, 1, BODY_FONT_PX);
    add(`card:draft-name:${card.id}`, truncateText(narrow6, card.name.replace(/^The /, ''), DRAFT_NAME_W), DRAFT_NAME_W, 1, SMALL_FONT_PX);
    add(`card:text:${card.id}`, card.text, Math.max(DRAFT_TEXT_W, 120), 2, SMALL_FONT_PX);
  }

  // ---- Certifications -------------------------------------------------------
  for (const c of CERTIFICATIONS) {
    add(`cert:name:${c.id}`, c.name, FULL, 1, BODY_FONT_PX);
    add(`cert:desc:${c.id}`, c.desc, FULL, 2, SMALL_FONT_PX);
  }

  // ---- Enemies / terrain ----------------------------------------------------
  for (const name of ENEMY_NAMES) {
    add(`enemy:name:${name}`, name, COMBAT_NAME_W, 1, SMALL_FONT_PX);
  }
  for (const v of ENEMY_VERBS) {
    add(`enemy:verb:${v.id}`, v.name, 100, 1, BODY_FONT_PX);
  }
  add('enemy:stand', 'Stand', 60, 1, BODY_FONT_PX);
  for (const [id, label] of Object.entries(TERRAIN_LABEL)) {
    add(`terrain:${id}`, label, FULL, 1, SMALL_FONT_PX);
  }

  // ---- Control labels (owned rect width − padding) --------------------------
  const controls = [
    ['ctrl:resume', 'RESUME', 76 - 8],
    ['ctrl:file-anew', 'FILE ANEW', 76 - 8],
    ['ctrl:credits', 'CREDITS', 76 - 8],
    ['ctrl:again', 'FILE A NEW EXPEDITION', 140 - 8],
    ['ctrl:begin', 'FILE THE INTAKE: BEGIN THE EXPEDITION', 216 - 16],
    ['ctrl:credits-sm', 'CREDITS', 66 - 16],
    ['ctrl:prev', 'PREV', 48 - 8],
    ['ctrl:next', 'NEXT', 48 - 8],
    ['ctrl:license', 'OPEN CC BY', 88 - 8],
    ['ctrl:back', 'BACK', 94 - 8],
    ['ctrl:rest', 'REST', 58 - 12],
    ['ctrl:deck', 'REVIEW DECK', 86 - 12],
    ['ctrl:shop', 'QUARTERMASTER', 132 - 12],
    ['ctrl:march', 'MARCH ON: ROUTE THE NEXT LEG', 190 - 12],
    ['ctrl:return', 'EARLY RETURN', 92 - 12],
    ['ctrl:back-camp', 'BACK TO CAMP', 94 - 8],
    ['ctrl:pause', 'PAUSE', 48 - 8],
    ['ctrl:resume-btn', 'RESUME', 48 - 8],
    ['ctrl:hold', 'HOLD', 32 - 8],
    ['ctrl:credits-march', 'CREDITS', 52 - 8],
    ['ctrl:spd', '4x', 30 - 8],
  ];
  for (const [id, text, w] of controls) add(id, text, w, 2, BODY_FONT_PX);

  add('misc:nothing', '(nothing yet to record)', 140, 1, SMALL_FONT_PX);
  add('misc:score-muted', 'score muted · M restores', SCORE_LINE_W, 1, SMALL_FONT_PX);
  for (const track of ['office', 'march', 'town', 'combat', 'report']) {
    add(`misc:score-${track}`, `score: ${track} · M mutes`, SCORE_LINE_W, 1, SMALL_FONT_PX);
  }
  add('misc:omen', 'OMEN', 30, 1, SMALL_FONT_PX);

  return {
    viewW: VW,
    viewH: 200,
    bodyFontPx: BODY_FONT_PX,
    smallFontPx: SMALL_FONT_PX,
    headingFontPx: HEADING_FONT_PX,
    cellHeight: PIXEL_FONT.cellHeight,
    cases,
  };
}

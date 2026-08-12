import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bt, isAllowedTextColor, ALLOWED_TEXT_COLORS, btWidth, renderableText, clampTextColor } from '../src/ui/bmptext.js';
import { PALETTE } from '../src/render/palette.js';

test('bt emits a placeholder span carrying text, scale, and colour', () => {
  const html = bt('Hello', { scale: 3, color: PALETTE.navyText });
  assert.match(html, /class="bt"/);
  assert.match(html, /data-bt="Hello"/);
  assert.match(html, /data-s="3"/);
  assert.match(html, new RegExp(`data-c="${PALETTE.navyText}"`));
  assert.match(html, /aria-label="Hello"/, 'keeps text for screen readers');
});

test('bt escapes markup so text cannot break out of the attribute', () => {
  const html = bt('a "b" <c> & d', {});
  assert.ok(!html.includes('<c>'), 'raw angle brackets must be escaped');
  assert.match(html, /&quot;b&quot;/);
  assert.match(html, /&amp;/);
});

test('bt falls back to a legal text colour when given an off-register colour', () => {
  const html = bt('x', { color: '#ff00ff' });
  assert.match(html, new RegExp(`data-c="${PALETTE.navyText}"`));
});

test('the three accents are allowed as bt foreground colours', () => {
  assert.ok(isAllowedTextColor(PALETTE.accentOrange));
  assert.ok(isAllowedTextColor(PALETTE.accentGold));
  assert.ok(isAllowedTextColor(PALETTE.accentRed));
});

test('the three legal body text colours are allowed', () => {
  assert.ok(isAllowedTextColor(PALETTE.navyText));
  assert.ok(isAllowedTextColor(PALETTE.beigeText));
  assert.ok(isAllowedTextColor(PALETTE.headerText));
});

const lc = (s) => String(s).toLowerCase();

test('clampTextColor is a no-op for a sanctioned colour (rgb form)', () => {
  // getComputedStyle returns rgb(); a sanctioned colour round-trips to itself
  // (canonical lowercase hex).
  assert.equal(clampTextColor('rgb(244, 240, 226)'), lc(PALETTE.navyText)); // #F4F0E2
  assert.equal(clampTextColor('rgb(30, 42, 74)'), lc(PALETTE.beigeText)); // #1E2A4A
  assert.equal(clampTextColor('rgb(255, 255, 255)'), lc(PALETTE.headerText));
  assert.equal(clampTextColor(PALETTE.accentGold), lc(PALETTE.accentGold));
});

test('clampTextColor snaps an off-register colour to a sanctioned one', () => {
  // the banished green #1E6A2A -> a member of the allowlist
  const snapped = clampTextColor('rgb(30, 106, 42)');
  assert.ok(ALLOWED_TEXT_COLORS.includes(lc(snapped)), `${snapped} not sanctioned`);
  // a near-black off colour clamps to the darkest legal text (dark navy)
  assert.equal(clampTextColor('rgb(10, 10, 10)'), lc(PALETTE.beigeText));
});

test('clampTextColor falls back to warm-white on an unparseable colour', () => {
  assert.equal(clampTextColor('not-a-color'), PALETTE.navyText);
  assert.equal(clampTextColor(''), PALETTE.navyText);
});

test('an off-register colour is not an allowed bt colour', () => {
  assert.ok(!isAllowedTextColor('#221d33'));
  assert.equal(ALLOWED_TEXT_COLORS.length, 6);
});

test('block bt gets the bt-block class', () => {
  assert.match(bt('x', { block: true }), /class="bt bt-block"/);
});

test('btWidth grows with text length', () => {
  assert.ok(btWidth('AAAA', { scale: 2 }) > btWidth('A', { scale: 2 }));
});

test('renderableText keeps supported chars and drops emoji, collapsing gaps', () => {
  assert.equal(renderableText('Money 500'), 'Money 500');
  // an emoji between text is dropped and the surrounding spaces collapse
  assert.equal(renderableText('Enter ⚔️ bout'), 'Enter bout');
  assert.equal(renderableText('💰 240'), ' 240');
  assert.equal(renderableText('Power: 47 ▲+6'), 'Power: 47 ▲+6');
});

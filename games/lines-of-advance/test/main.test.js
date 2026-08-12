import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeElement(tag) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    attributes: {},
    children: [],
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    },
    getAttribute(key) {
      return this.attributes[key];
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    querySelector() { return null; }
  };
  return el;
}

globalThis.document = {
  createElement(tag) {
    return makeElement(tag);
  },
  body: makeElement('body')
};

const { renderSelectedCard, renderLog } = await import('../src/main.js');

function collectText(el) {
  if (el.textContent) return el.textContent;
  return el.children.map(collectText).join('');
}

test('renderSelectedCard shows "Draw" for draw results, not "null wins"', () => {
  const card = makeElement('div');
  const state = {
    gameOver: { winner: null, reason: 'threefold repetition' },
    pieces: [],
    selectedId: null
  };
  renderSelectedCard(card, state, { status: new Map() });
  const text = collectText(card);
  assert.match(text, /Draw/);
  assert.doesNotMatch(text, /null wins/);
});

test('renderSelectedCard still shows the winner for decisive results', () => {
  const card = makeElement('div');
  const state = {
    gameOver: { winner: 'North', reason: 'all enemy fighting units eliminated' },
    pieces: [],
    selectedId: null
  };
  renderSelectedCard(card, state, { status: new Map() });
  assert.match(collectText(card), /North wins/);
});

test('renderLog uses unambiguous notation class codes', () => {
  const card = makeElement('div');
  const state = {
    log: [{
      turn: 1,
      side: 'North',
      moves: [
        { cls: 'Foot Relay', from: 'e19', to: 'e18' },
        { cls: 'Foot Artillery', from: 'r19', to: 'r18' },
        { cls: 'Mounted Relay', from: 'u19', to: 'u18' },
        { cls: 'Mounted Artillery', from: 't19', to: 't18' },
        { cls: 'Infantry', from: 'a19', to: 'a18' },
        { cls: 'Cavalry', from: 'b19', to: 'b18' }
      ],
      events: []
    }]
  };
  renderLog(card, state);
  assert.equal(card.children.length, 1);
  const text = card.children[0].textContent;
  assert.match(text, /FR e19-e18/);
  assert.match(text, /FA r19-r18/);
  assert.match(text, /MR u19-u18/);
  assert.match(text, /MA t19-t18/);
  assert.match(text, /I a19-a18/);
  assert.match(text, /CV b19-b18/);
  assert.doesNotMatch(text, /\bF e19-e18\b/);
  assert.doesNotMatch(text, /\bM u19-u18\b/);
});

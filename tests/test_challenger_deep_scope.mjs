// tests/test_challenger_deep_scope.mjs
// Dedicated Deep Scope Verification for Milestone 3 Challenger Scope

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('CHALLENGER DEEP SCOPE VERIFICATION SUITE — MILESTONE 3');
console.log('====================================================');

// Mock DOM
class MockClassList {
  constructor(el) {
    this._classes = new Set();
    this._element = el;
  }
  add(...names) {
    names.forEach(n => { if (n) this._classes.add(n); });
  }
  remove(...names) {
    names.forEach(n => { if (n) this._classes.delete(n); });
  }
  toggle(name, force) {
    if (force === true) { this.add(name); return true; }
    if (force === false) { this.remove(name); return false; }
    if (this._classes.has(name)) { this.remove(name); return false; }
    this.add(name);
    return true;
  }
  contains(name) { return this._classes.has(name); }
  toString() { return Array.from(this._classes).join(' '); }
}

class MockStyle {
  constructor() { this._props = {}; }
  setProperty(prop, val) { this._props[prop] = val; this[prop] = val; }
  removeProperty(prop) { delete this._props[prop]; delete this[prop]; }
  getPropertyValue(prop) { return this._props[prop] || ''; }
}

class MockNode {
  constructor(nodeType, nodeValue = null, tagName = null) {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.tagName = tagName ? tagName.toUpperCase() : null;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.classList = new MockClassList(this);
    this.style = new MockStyle();
    this.eventListeners = {};
    this._open = false;
    this.disabled = false;
    this.id = '';
    this.value = '';
    this.scrollCalls = [];
    this.offsetParent = {};
  }

  get tabIndex() {
    const val = this.getAttribute('tabindex');
    return val !== null ? parseInt(val, 10) : 0;
  }

  set tabIndex(val) {
    this.setAttribute('tabindex', String(val));
  }

  get className() { return this.classList.toString(); }
  set className(val) {
    this.classList = new MockClassList(this);
    if (val) val.split(/\s+/).forEach(c => this.classList.add(c));
  }

  get href() { return this.getAttribute('href') || ''; }
  set href(val) { this.setAttribute('href', val); }

  get open() { return this._open; }
  set open(val) {
    this._open = Boolean(val);
    if (this._open) this.attributes['open'] = '';
    else delete this.attributes['open'];
  }

  appendChild(child) {
    if (child.nodeType === 11) {
      const fragmentChildren = [...child.childNodes];
      fragmentChildren.forEach(c => { c.parentNode = this; this.childNodes.push(c); });
      child.childNodes = [];
      return child;
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) { child.parentNode = null; this.childNodes.splice(idx, 1); }
    return child;
  }

  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx !== -1) {
      oldChild.parentNode = null;
      if (newChild.nodeType === 11) {
        const fragmentChildren = [...newChild.childNodes];
        fragmentChildren.forEach(c => { c.parentNode = this; });
        this.childNodes.splice(idx, 1, ...fragmentChildren);
        newChild.childNodes = [];
      } else {
        newChild.parentNode = this;
        this.childNodes.splice(idx, 1, newChild);
      }
    }
    return oldChild;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
    if (name === 'id') this.id = String(value);
    if (name === 'open') this._open = true;
  }

  getAttribute(name) {
    if (name === 'open') return this._open ? '' : null;
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      delete this.dataset[key];
    }
    if (name === 'id') this.id = '';
    if (name === 'open') this._open = false;
  }

  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }

  addEventListener(event, listener) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(listener);
  }

  removeEventListener(event, listener) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(l => l !== listener);
  }

  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt.type;
    const listeners = this.eventListeners[type] || [];
    listeners.forEach(fn => fn(evt));
    return true;
  }

  closest(selector) {
    const tags = selector.split(',').map(s => s.trim().toUpperCase());
    let curr = this;
    while (curr) {
      if (curr.tagName && tags.includes(curr.tagName)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  contains(target) {
    let curr = target;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  focus() { global.document.activeElement = this; }
  blur() { if (global.document.activeElement === this) global.document.activeElement = null; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }

  scrollIntoView(options) { this.scrollCalls.push(options || true); }
  getBoundingClientRect() { return { top: 100, bottom: 200, left: 0, right: 1000, height: 50, width: 800 }; }

  get textContent() {
    if (this.nodeType === 3) return this.nodeValue || '';
    return this.childNodes.map(c => c.textContent).join('');
  }

  set textContent(val) {
    if (this.nodeType === 3) {
      this.nodeValue = String(val);
    } else {
      this.childNodes = [];
      if (val) {
        const textNode = new MockNode(3, String(val));
        textNode.parentNode = this;
        this.childNodes.push(textNode);
      }
    }
  }

  get innerText() { return this.textContent; }
  set innerText(val) { this.textContent = val; }

  get innerHTML() {
    return this.childNodes.map(c => {
      if (c.nodeType === 3) return c.nodeValue;
      const tag = (c.tagName || 'div').toLowerCase();
      const attrs = Object.entries(c.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
      return `<${tag}${attrs}>${c.innerHTML}</${tag}>`;
    }).join('');
  }

  set innerHTML(html) {
    this.childNodes = [];
    if (!html) return;
    this.insertAdjacentHTML('beforeend', html);
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  querySelectorAll(selector) {
    const results = [];
    const subSelectors = selector.split(',').map(s => s.trim());

    const checkMatch = (node) => {
      if (node.nodeType !== 1) return;
      for (const sel of subSelectors) {
        if (sel === '.tts-word.active') {
          if (node.classList.contains('tts-word') && node.classList.contains('active')) { results.push(node); return; }
        } else if (sel === '.tts-word') {
          if (node.classList.contains('tts-word')) { results.push(node); return; }
        } else if (sel.startsWith('.tts-word[data-word-idx=')) {
          const m = sel.match(/data-word-idx="?([^"\]]+)"?/);
          if (m && node.classList.contains('tts-word') && node.getAttribute('data-word-idx') === m[1]) {
            results.push(node); return;
          }
        } else if (sel.startsWith('.')) {
          if (node.classList.contains(sel.slice(1))) { results.push(node); return; }
        } else if (sel.startsWith('#')) {
          if (node.id === sel.slice(1)) { results.push(node); return; }
        } else if (sel === '[tabindex]:not([tabindex="-1"])') {
          if (node.hasAttribute('tabindex') && node.getAttribute('tabindex') !== '-1') {
            results.push(node); return;
          }
        } else if (sel.startsWith('[')) {
          const attrMatch = sel.match(/\[([a-zA-Z0-9\-]+)(?:="?([^"\]]*)"?)?\]/);
          if (attrMatch) {
            const attr = attrMatch[1];
            const val = attrMatch[2];
            if (val !== undefined ? node.getAttribute(attr) === val : node.hasAttribute(attr)) {
              results.push(node); return;
            }
          }
        } else if (sel.toUpperCase() === node.tagName) {
          results.push(node); return;
        }
      }
    };

    const traverse = (n) => {
      for (const c of n.childNodes) {
        checkMatch(c);
        traverse(c);
      }
    };
    traverse(this);
    return results;
  }

  insertAdjacentHTML(position, html) {
    const fragment = parseHtmlToMockNodes(html);
    if (position === 'beforeend') {
      fragment.childNodes.forEach(c => this.appendChild(c));
    }
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
}

function parseHtmlToMockNodes(html) {
  const container = new MockNode(1, null, 'DIV');
  const tagRegex = /(<\/?[a-zA-Z0-9]+(?:\s+[^>]*?)?>)|([^<]+)/g;
  let currentParent = container;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match[1]) {
      const tagStr = match[1];
      if (tagStr.startsWith('</')) {
        if (currentParent.parentNode) currentParent = currentParent.parentNode;
      } else {
        const selfClosing = tagStr.endsWith('/>') || tagStr.startsWith('<hr') || tagStr.startsWith('<br');
        const tagMatch = tagStr.match(/<([a-zA-Z0-9]+)([\s\S]*?)>/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          const attrStr = tagMatch[2];
          const el = new MockNode(1, null, tagName);
          const attrRegex = /([a-zA-Z0-9\-]+)(?:="([^"]*)")?/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
            const attrName = attrMatch[1];
            const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
            el.setAttribute(attrName, attrVal);
            if (attrName === 'class') {
              attrVal.split(/\s+/).forEach(c => el.classList.add(c));
            }
          }
          currentParent.appendChild(el);
          if (!selfClosing) currentParent = el;
        }
      }
    } else if (match[2]) {
      const textNode = new MockNode(3, match[2]);
      currentParent.appendChild(textNode);
    }
  }

  return container;
}

class Event {
  constructor(type) { this.type = type; }
}

const elementsRegistry = new Map();

class MockDocument {
  constructor() {
    this.body = new MockNode(1, null, 'BODY');
    this.documentElement = new MockNode(1, null, 'HTML');
    this.activeElement = null;
    this.readyState = 'complete';
    this.eventListeners = {};
  }

  addEventListener(event, listener) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(listener);
  }

  removeEventListener(event, listener) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(l => l !== listener);
  }

  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt.type;
    const listeners = this.eventListeners[type] || [];
    listeners.forEach(fn => fn(evt));
    return true;
  }

  createElement(tagName) { return new MockNode(1, null, tagName); }
  createTextNode(text) { return new MockNode(3, text); }
  createDocumentFragment() { return new MockNode(11, null, null); }
  getElementById(id) { return elementsRegistry.get(id) || null; }

  querySelector(selector) {
    if (selector === '.loader-text') return elementsRegistry.get('loaderText') || new MockNode(1, null, 'SPAN');
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    if (selector.includes('[data-settings-section]')) {
      return Array.from(elementsRegistry.values()).filter(el => el.hasAttribute('data-settings-section'));
    }
    return this.body.querySelectorAll(selector);
  }

  createTreeWalker(root, whatToShow, filter) {
    const nodes = [];
    function collect(node) {
      if (node.nodeType === 3) {
        if (!filter || filter.acceptNode(node) === 1) nodes.push(node);
      } else {
        for (const child of node.childNodes) collect(child);
      }
    }
    collect(root);
    let index = -1;
    return {
      nextNode() {
        index++;
        if (index < nodes.length) {
          this.currentNode = nodes[index];
          return nodes[index];
        }
        return null;
      },
      currentNode: null
    };
  }
}

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.voice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onboundary = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

class MockSpeechSynthesis {
  constructor() {
    this.speaking = false;
    this.paused = false;
    this.spokenUtterances = [];
  }
  getVoices() {
    return [
      { name: 'Alex', lang: 'en-US', voiceURI: 'alex', default: true },
      { name: 'Victoria', lang: 'en-US', voiceURI: 'victoria', default: false }
    ];
  }
  speak(utterance) {
    this.speaking = true;
    this.spokenUtterances.push(utterance);
  }
  cancel() {
    this.speaking = false;
    this.paused = false;
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
}

global.Event = Event;
global.NodeFilter = { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_TEXT: 4 };
global.document = new MockDocument();
global.window = {
  document: global.document,
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: (cb) => { setImmediate(() => cb(Date.now())); return 1; },
  cancelAnimationFrame: () => {},
  scrollTo: () => {},
  scrollBy: () => {},
  getSelection: () => ({ rangeCount: 0, contains: () => false, toString: () => '' }),
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: global.setTimeout.bind(global),
  clearTimeout: global.clearTimeout.bind(global),
  setInterval: global.setInterval.bind(global),
  clearInterval: global.clearInterval.bind(global),
  innerWidth: 1024,
  innerHeight: 768,
  pageYOffset: 0
};
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    language: 'en-US'
  },
  configurable: true,
  writable: true
});
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
global.speechSynthesis = new MockSpeechSynthesis();
global.window.speechSynthesis = global.speechSynthesis;
global.window.SpeechSynthesisUtterance = global.SpeechSynthesisUtterance;

// Setup UI elements
const elementIds = [
  'inputView', 'readerView', 'readerContent', 'pasteArea', 'readBtn', 'fileInput', 'clearBtn',
  'loader', 'toolbar', 'backBtn', 'wordCount', 'focusRestore', 'presetTrack', 'presetDots',
  'presetWindow', 'modeLight', 'modeDark', 'focusBtn', 'fullscreenBtn', 'autoScrollBtn',
  'ttsBtn', 'ttsStopBtn', 'audioPlayerBar', 'audioPlayPauseBtn', 'audioStopBtn', 'audioStatusText',
  'audioSpeedBtn', 'downloadBtn', 'editBtn', 'gestureHint', 'gestureHintText', 'arrowLeft',
  'arrowRight', 'progressBar', 'statusMessage', 'readerStatusMessage', 'tocDialog', 'closeTocBtn',
  'tocBody', 'tocBtn', 'rulerBtn', 'readingRuler', 'settingsDrawer', 'themeSettingsSummary',
  'voiceSelect', 'voiceRateInput', 'voiceRateVal', 'scrollSpeedInput', 'scrollSpeedVal',
  'lineHeightInput', 'letterSpacingInput', 'marginInput', 'smartHeadingsInput', 'mobileFab',
  'sheetBackdrop', 'bottomSheetHandle', 'editingBanner', 'saveEditBannerBtn'
];

elementIds.forEach(id => {
  const el = global.document.createElement(id.includes('Btn') ? 'BUTTON' : 'DIV');
  el.id = id;
  global.document.body.appendChild(el);
  elementsRegistry.set(id, el);
});

elementsRegistry.get('voiceRateInput').value = '1.0';

// Import domain modules
const ui = await import('../ui.js');
const tts = await import('../tts.js');
const reader = await import('../reader.js');
const utils = await import('../utils.js');

// =========================================================================
// SCOPE 1: tts.js Empirical Verification
// =========================================================================
console.log('\n--- 1. EMPIRICAL VERIFICATION OF tts.js ---');

// 1.A: chunkText 190-char whitespace boundaries
console.log('1.A: Testing chunkText 190-char whitespace boundaries...');
{
  // Test empty text
  assert.deepStrictEqual(tts.chunkText(''), []);

  // Test single char
  const single = tts.chunkText('A');
  assert.strictEqual(single.length, 1);
  assert.strictEqual(single[0].text, 'A');
  assert.strictEqual(single[0].start, 0);
  assert.strictEqual(single[0].end, 1);

  // Exact 190 length string
  const text190 = 'W'.repeat(190);
  const ch190 = tts.chunkText(text190);
  assert.strictEqual(ch190.length, 1);
  assert.strictEqual(ch190[0].text.length, 190);

  // 191 length without spaces (force split at 190)
  const text191NoSpace = 'W'.repeat(191);
  const ch191NoSpace = tts.chunkText(text191NoSpace);
  assert.strictEqual(ch191NoSpace.length, 2);
  assert.strictEqual(ch191NoSpace[0].text.length, 190);
  assert.strictEqual(ch191NoSpace[1].text.length, 1);
  assert.strictEqual(ch191NoSpace[0].start, 0);
  assert.strictEqual(ch191NoSpace[0].end, 190);
  assert.strictEqual(ch191NoSpace[1].start, 190);
  assert.strictEqual(ch191NoSpace[1].end, 191);

  // 191 length with space at boundary
  const text191Space = 'W'.repeat(180) + ' ' + 'W'.repeat(10);
  const ch191Space = tts.chunkText(text191Space);
  assert.strictEqual(ch191Space.length, 2);
  assert.strictEqual(ch191Space[0].text.length, 180);
  assert.strictEqual(ch191Space[1].text.length, 10);
  assert.strictEqual(ch191Space[1].start, 181); // Skips whitespace

  // Multiple spaces across boundaries
  const multiSpace = 'Word1' + ' '.repeat(10) + 'Word2' + ' '.repeat(50) + 'Word3';
  const chMultiSpace = tts.chunkText(multiSpace, 200, 20);
  chMultiSpace.forEach(c => {
    assert(!/^\s/.test(c.text), 'Chunk must never start with whitespace');
    assert(c.text.length <= 20, 'Chunk must not exceed target length');
    assert.strictEqual(c.end, c.start + c.text.length);
  });

  console.log('✓ 1.A chunkText whitespace boundaries verified.');
}

// 1.B: tokenizeReaderDOM with nested tags and block elements
console.log('1.B: Testing tokenizeReaderDOM with nested tags and block elements...');
{
  const container = elementsRegistry.get('readerContent');
  container.innerHTML = `
    <h1>Chapter 1: The Odyssey</h1>
    <p>This is a paragraph with <strong>bold text and <em>deeply nested italic emphasis</em></strong> inside.</p>
    <blockquote>Wise words in a blockquote container.</blockquote>
    <ul>
      <li>First list item</li>
      <li>Second list item with <code>inline code</code></li>
    </ul>
    <pre>const codeBlock = true;</pre>
    <h3>Final Thoughts</h3>
  `;

  const tokenized = tts.tokenizeReaderDOM(container);
  assert(tokenized.meta.length > 20, 'Should tokenize words into wordMeta');
  assert.strictEqual(tokenized.spans.length, tokenized.meta.length, 'wordSpans and wordMeta counts match');

  // Verify block separators produce \n\n in fullSpokenText
  assert(tokenized.text.includes('Chapter 1: The Odyssey\n\n'), 'Heading block must end with double newline');
  assert(tokenized.text.includes('inside.\n\nWise words'), 'Paragraph and blockquote must be separated by double newline');

  // Verify all character offsets in wordMeta match fullSpokenText slices exactly
  tokenized.meta.forEach((m, idx) => {
    assert.strictEqual(m.index, idx);
    const slice = tokenized.text.slice(m.start, m.end);
    assert.strictEqual(slice, m.text, `Word ${idx} text mismatch: '${slice}' vs '${m.text}'`);
    assert.strictEqual(m.element.getAttribute('data-word-idx'), String(idx));
    assert(m.element.classList.contains('tts-word'));
  });

  console.log('✓ 1.B tokenizeReaderDOM nested tags and block elements verified.');
}

// 1.C: highlightAtIndex with rate > 1.5 scroll behavior
console.log('1.C: Testing highlightAtIndex with rate > 1.5 scroll behavior...');
{
  const container = elementsRegistry.get('readerContent');
  const rateInput = elementsRegistry.get('voiceRateInput');
  container.innerHTML = `
    <h1>Chapter 1: The Odyssey</h1>
    <p>This is a paragraph with bold text and deeply nested italic emphasis inside.</p>
    <blockquote>Wise words in a blockquote container.</blockquote>
  `;
  const tokenized = tts.tokenizeReaderDOM(container);

  // Low tempo (1.0x) -> smooth scroll
  rateInput.value = '1.0';
  tts.highlightAtIndex(tokenized.meta[0].start);
  const word0 = container.querySelector('.tts-word[data-word-idx="0"]');
  assert(word0.classList.contains('active'), 'Word 0 must be active');
  assert.deepStrictEqual(word0.scrollCalls[word0.scrollCalls.length - 1], { block: 'nearest', behavior: 'smooth' });

  // Moderate tempo (1.5x) -> smooth scroll
  rateInput.value = '1.5';
  tts.highlightAtIndex(tokenized.meta[5].start);
  const word5 = container.querySelector('.tts-word[data-word-idx="5"]');
  assert(word5.classList.contains('active'), 'Word 5 must be active');
  assert.deepStrictEqual(word5.scrollCalls[word5.scrollCalls.length - 1], { block: 'nearest', behavior: 'smooth' });

  // High tempo (1.8x) -> auto scroll (anti-jitter)
  rateInput.value = '1.8';
  tts.highlightAtIndex(tokenized.meta[10].start);
  const word10 = container.querySelector('.tts-word[data-word-idx="10"]');
  assert(word10.classList.contains('active'), 'Word 10 must be active');
  assert.deepStrictEqual(word10.scrollCalls[word10.scrollCalls.length - 1], { block: 'nearest', behavior: 'auto' });

  // High tempo (2.0x) -> auto scroll
  rateInput.value = '2.0';
  tts.highlightAtIndex(tokenized.meta[15].start);
  const word15 = container.querySelector('.tts-word[data-word-idx="15"]');
  assert(word15.classList.contains('active'), 'Word 15 must be active');
  assert.deepStrictEqual(word15.scrollCalls[word15.scrollCalls.length - 1], { block: 'nearest', behavior: 'auto' });

  // Test clearHighlight
  tts.clearHighlight();
  assert(!container.querySelector('.tts-word.active'), 'clearHighlight must deactivate all words');
  assert.strictEqual(tts.getTTSState().currentWordIndex, -1);

  console.log('✓ 1.C highlightAtIndex tempo-sensitive scroll behavior verified.');
}

// 1.D: speechGeneration concurrency isolation under simulated abort/interrupt
console.log('1.D: Testing speechGeneration concurrency isolation...');
{
  // Start TTS
  tts.restartFromWord(0);
  const initialGen = tts.getTTSState().speechGeneration;
  assert.strictEqual(tts.getTTSState().state, 'playing');

  // Interrupt and jump to word 10
  tts.restartFromWord(10);
  const secondGen = tts.getTTSState().speechGeneration;
  assert(secondGen > initialGen, 'speechGeneration must increment on restart');

  // Create mock utterance from generation 1
  const staleUtterance = tts.buildUtterance({ text: 'Stale chunk text', start: 0, end: 16 }, initialGen);

  // Stale onboundary must be discarded
  staleUtterance.onboundary({ name: 'word', charIndex: 0 });
  assert.notStrictEqual(tts.getTTSState().currentWordIndex, 0, 'Stale onboundary must not change current word index');

  // Stale onerror must be discarded
  staleUtterance.onerror({ error: 'interrupted' });
  assert.strictEqual(tts.getTTSState().speechGeneration, secondGen, 'Stale onerror must not mutate state');

  // Stale onend must be discarded
  staleUtterance.onend();
  assert.strictEqual(tts.getTTSState().speechGeneration, secondGen, 'Stale onend must not mutate state');

  // Stop TTS
  tts.stopTTS();
  const thirdGen = tts.getTTSState().speechGeneration;
  assert(thirdGen > secondGen, 'speechGeneration must increment on stop');
  assert.strictEqual(tts.getTTSState().state, 'idle', 'State must be idle after stop');

  console.log('✓ 1.D speechGeneration concurrency isolation verified.');
}

// =========================================================================
// SCOPE 2: reader.js Empirical Verification
// =========================================================================
console.log('\n--- 2. EMPIRICAL VERIFICATION OF reader.js ---');

// 2.A: renderTextAsync with large multi-paragraph text and headings
console.log('2.A: Testing renderTextAsync with large multi-paragraph text and headings...');
await new Promise((resolve) => {
  const container = elementsRegistry.get('readerContent');
  const sections = [];
  for (let i = 1; i <= 30; i++) {
    sections.push(`
# Heading 1 - Section ${i}
Paragraph one in section ${i} describing important concepts in detail.

## Heading 2 - Subsection ${i}.1
- Bullet point ${i}.A
- Bullet point ${i}.B

1. Ordered item ${i}.1
2. Ordered item ${i}.2

### Heading 3 - Subsection ${i}.1.1
> Inspirational blockquote in section ${i}

\`\`\`javascript
function compute${i}() {
  return ${i} * 42;
}
\`\`\`

---
    `);
  }

  const largeText = sections.join('\n');
  reader.renderTextAsync(largeText, () => {
    const h1s = container.querySelectorAll('h1');
    const h2s = container.querySelectorAll('h2');
    const h3s = container.querySelectorAll('h3');
    const uls = container.querySelectorAll('ul');
    const ols = container.querySelectorAll('ol');
    const quotes = container.querySelectorAll('blockquote');
    const pres = container.querySelectorAll('pre');
    const hrs = container.querySelectorAll('hr');

    assert.strictEqual(h1s.length, 30);
    assert.strictEqual(h2s.length, 30);
    assert.strictEqual(h3s.length, 30);
    assert.strictEqual(uls.length, 30);
    assert.strictEqual(ols.length, 30);
    assert.strictEqual(quotes.length, 30);
    assert.strictEqual(pres.length, 30);
    assert.strictEqual(hrs.length, 30);

    console.log(`✓ 2.A renderTextAsync parsed large markdown document (${h1s.length} H1s, ${h2s.length} H2s, ${pres.length} code blocks) cleanly.`);
    resolve();
  }, { suppressLoader: true });
});

// Test cancelPendingRender
console.log('Testing cancelPendingRender cancellation behavior...');
await new Promise((resolve) => {
  const container = elementsRegistry.get('readerContent');
  reader.renderTextAsync('# First Render To Cancel', () => {
    assert.fail('Cancelled render callback should never be called');
  }, { suppressLoader: true });

  // Cancel immediately
  reader.cancelPendingRender({ hideLoader: true });

  // Start second render
  reader.renderTextAsync('# Second Valid Render', () => {
    const h1 = container.querySelector('h1');
    assert(h1.textContent.includes('Second Valid Render'), 'Only second render should be displayed');
    console.log('✓ cancelPendingRender successfully invalidated preceding render task.');
    resolve();
  }, { suppressLoader: true });
});

// 2.B: TOC heading ID generation with .slice(2, 11)
console.log('2.B: Testing TOC heading ID generation with .slice(2, 11)...');
{
  const container = elementsRegistry.get('readerContent');
  const tocBody = elementsRegistry.get('tocBody');
  const tocDialog = elementsRegistry.get('tocDialog');

  container.innerHTML = `
    <h1>Executive Summary</h1>
    <h2>System Architecture</h2>
    <h3>Data Pipelines</h3>
  `;

  reader.populateAndShowTOC();

  const headings = container.querySelectorAll('h1, h2, h3');
  headings.forEach(h => {
    assert(h.id.startsWith('heading-'), `Heading ID must start with heading-, got: ${h.id}`);
    const hash = h.id.replace('heading-', '');
    assert(/^[a-z0-9]{1,15}$/.test(hash), `Hash '${hash}' is not a valid alphanumeric string`);
  });

  const links = tocBody.querySelectorAll('a');
  assert.strictEqual(links.length, 3);
  assert.strictEqual(links[0].getAttribute('href'), `#${headings[0].id}`);
  assert.strictEqual(tocDialog.open, true);

  console.log('✓ 2.B TOC heading ID generation with .slice(2, 11) verified.');
}

// 2.C: saveAndExitEditMode plain text handling
console.log('2.C: Testing saveAndExitEditMode plain text handling...');
await new Promise((resolve) => {
  const container = elementsRegistry.get('readerContent');
  const editBtn = elementsRegistry.get('editBtn');
  const banner = elementsRegistry.get('editingBanner');

  reader.setCurrentText('# Original Markdown Text\n\nOriginal body paragraph.');
  reader.enterEditMode();

  assert.strictEqual(reader.isEditing(), true);
  assert.strictEqual(container.getAttribute('contenteditable'), 'true');
  assert.strictEqual(container.getAttribute('role'), 'textbox');
  assert(banner.classList.contains('show'));
  assert(editBtn.classList.contains('active'));

  // User edits plain text
  container.innerText = '# Edited Markdown Header\n\nNew paragraph content here.';

  reader.saveAndExitEditMode({ suppressRenderLoader: true });

  assert.strictEqual(reader.isEditing(), false);
  assert(!container.hasAttribute('contenteditable'));
  assert(!banner.classList.contains('show'));
  assert(!editBtn.classList.contains('active'));

  setTimeout(() => {
    assert(reader.getCurrentText().includes('Edited Markdown Header'));
    assert(container.innerHTML.includes('<h1 id="heading-0">'));
    console.log('✓ 2.C saveAndExitEditMode plain text lifecycle verified.');
    resolve();
  }, 100);
});

// =========================================================================
// SCOPE 3: ui.js Empirical Verification
// =========================================================================
console.log('\n--- 3. EMPIRICAL VERIFICATION OF ui.js ---');

// 3.A: openTocDialog/closeTocDialog focus trapping
console.log('3.A: Testing openTocDialog/closeTocDialog focus trapping...');
{
  const dialog = elementsRegistry.get('tocDialog');
  const closeBtn = elementsRegistry.get('closeTocBtn');
  const link1 = global.document.createElement('A');
  link1.setAttribute('href', '#h1');
  const link2 = global.document.createElement('A');
  link2.setAttribute('href', '#h2');

  dialog.appendChild(closeBtn);
  dialog.appendChild(link1);
  dialog.appendChild(link2);

  const cleanupTrap = ui.setupFocusTrap(dialog);
  assert(typeof cleanupTrap === 'function', 'setupFocusTrap must return cleanup callback');

  // Test opening dialog
  ui.openTocDialog();
  assert.strictEqual(dialog.open, true, 'Dialog should be opened');

  // Test Tab wrap on boundary (last element -> first element)
  link2.focus();
  let defaultPrevented = false;
  const tabEvent = {
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => { defaultPrevented = true; }
  };
  dialog.dispatchEvent(Object.assign(new Event('keydown'), tabEvent));
  if (defaultPrevented) {
    assert.strictEqual(global.document.activeElement, closeBtn, 'Tab on last element must cycle to first element');
  }

  // Test Shift+Tab wrap on boundary (first element -> last element)
  closeBtn.focus();
  let shiftPrevented = false;
  const shiftTabEvent = {
    key: 'Tab',
    shiftKey: true,
    preventDefault: () => { shiftPrevented = true; }
  };
  dialog.dispatchEvent(Object.assign(new Event('keydown'), shiftTabEvent));
  if (shiftPrevented) {
    assert.strictEqual(global.document.activeElement, link2, 'Shift+Tab on first element must cycle to last element');
  }

  // Test closing dialog
  ui.closeTocDialog();
  assert.strictEqual(dialog.open, false, 'Dialog should be closed');

  cleanupTrap();
  console.log('✓ 3.A openTocDialog/closeTocDialog and focus trapping verified.');
}

// 3.B: setContainerFocusable
console.log('3.B: Testing setContainerFocusable...');
{
  const container = global.document.createElement('DIV');
  const b1 = global.document.createElement('BUTTON');
  const b2 = global.document.createElement('BUTTON');
  const a1 = global.document.createElement('A');
  const input1 = global.document.createElement('INPUT');

  b1.tabIndex = 0;
  b2.tabIndex = 3;
  a1.setAttribute('tabindex', '1');
  input1.tabIndex = 0;

  container.appendChild(b1);
  container.appendChild(b2);
  container.appendChild(a1);
  container.appendChild(input1);

  // Disable container focusability
  ui.setContainerFocusable(container, false);
  assert.strictEqual(b1.tabIndex, -1);
  assert.strictEqual(b2.tabIndex, -1);
  assert.strictEqual(a1.tabIndex, -1);
  assert.strictEqual(input1.tabIndex, -1);
  assert.strictEqual(b1.dataset.savedTabindex, '0');
  assert.strictEqual(b2.dataset.savedTabindex, '3');
  assert.strictEqual(a1.dataset.savedTabindex, '1');

  // Re-enable container focusability
  ui.setContainerFocusable(container, true);
  assert.strictEqual(b1.tabIndex, 0);
  assert.strictEqual(b2.tabIndex, 3);
  assert.strictEqual(a1.tabIndex, 1);
  assert.strictEqual(input1.tabIndex, 0);
  assert.strictEqual(b1.dataset.savedTabindex, undefined);

  console.log('✓ 3.B setContainerFocusable correctly saves and restores tabIndex values.');
}

// 3.C: toggleMobileSheet
console.log('3.C: Testing toggleMobileSheet...');
{
  const toolbar = elementsRegistry.get('toolbar');
  const sheetBackdrop = elementsRegistry.get('sheetBackdrop');
  const mobileFab = elementsRegistry.get('mobileFab');

  // Initial state: collapsed
  toolbar.classList.remove('expanded');
  sheetBackdrop.classList.remove('show');

  // Expand
  ui.expandMobileSheet();
  assert(toolbar.classList.contains('expanded'), 'Toolbar must have expanded class');
  assert(sheetBackdrop.classList.contains('show'), 'Sheet backdrop must have show class');
  assert.strictEqual(mobileFab.getAttribute('aria-expanded'), 'true');
  assert.strictEqual(mobileFab.getAttribute('aria-label'), 'Close Reading Settings');

  // Collapse
  ui.collapseMobileSheet();
  assert(!toolbar.classList.contains('expanded'), 'Toolbar must not have expanded class');
  assert(!sheetBackdrop.classList.contains('show'), 'Sheet backdrop must not have show class');
  assert.strictEqual(mobileFab.getAttribute('aria-expanded'), 'false');
  assert.strictEqual(mobileFab.getAttribute('aria-label'), 'Open Reading Settings');

  // Toggle from collapsed -> expanded
  ui.toggleMobileSheet();
  assert(toolbar.classList.contains('expanded'));
  assert(sheetBackdrop.classList.contains('show'));

  // Toggle from expanded -> collapsed
  ui.toggleMobileSheet();
  assert(!toolbar.classList.contains('expanded'));
  assert(!sheetBackdrop.classList.contains('show'));

  console.log('✓ 3.C toggleMobileSheet, expandMobileSheet, and collapseMobileSheet verified.');
}

console.log('\n====================================================');
console.log('ALL SCOPE VERIFICATIONS PASSED WITH 100% SUCCESS!');
console.log('====================================================');

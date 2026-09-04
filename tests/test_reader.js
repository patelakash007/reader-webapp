'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const parser = await import('../src/parser.mjs');
  const tts = await import('../src/tts.mjs');
  const constants = await import('../src/constants.mjs');
  const scriptSource = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');

  console.log('--- Reader core regression tests ---');
  assert(scriptSource.includes("import('./src/app.mjs')"));
  assert(!scriptSource.includes('.substr('));

  const short = 'This is a short sample sentence.';
  assert.deepStrictEqual(tts.chunkText(short), [{ text: short, start: 0, end: short.length }]);
  const long = tts.chunkText('The quick brown fox jumps over the lazy dog repeatedly to test long character chunking in our unified reading application.', 100, 40);
  assert(long.length > 2);
  long.forEach(chunk => assert.strictEqual(chunk.end, chunk.start + chunk.text.length));
  assert.deepStrictEqual(tts.chunkText('A'.repeat(250)).map(chunk => chunk.text.length), [190, 60]);

  const voices = tts.deduplicateAndSortVoices([
    { name: 'Google US English', lang: 'en-US', voiceURI: 'google-1', default: false },
    { name: 'Google US English', lang: 'en-US', voiceURI: 'google-2', default: false },
    { name: 'Alex', lang: 'en-US', voiceURI: 'alex', default: true },
    { name: 'Anna', lang: 'de-DE', voiceURI: 'anna', default: false }
  ]);
  assert.strictEqual(voices.length, 3);
  assert.strictEqual(voices[0].name, 'Alex');
  assert.strictEqual(tts.resolveVoiceIndex(voices, 'anna', 'en-US'), voices.findIndex(v => v.voiceURI === 'anna'));

  const pdfItems = [
    { str: 'Hello', transform: [1, 0, 0, 1, 50, 700], width: 30, height: 12 },
    { str: 'World', transform: [1, 0, 0, 1, 90, 700], width: 35, height: 12 },
    { str: 'Next', transform: [1, 0, 0, 1, 50, 670], width: 25, height: 12 }
  ];
  assert.strictEqual(parser.extractPdfPageText(pdfItems), 'Hello World\n\nNext');

  class NodeMock {
    constructor(type, value = '', tagName = '') { this.nodeType = type; this.nodeValue = value; this.tagName = tagName; this.childNodes = []; this.parentNode = null; this.attributes = {}; this.classList = { add() {}, remove() {} }; }
    get parentElement() { return this.nodeType === 1 ? this : this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    appendChild(node) { node.parentNode = this; this.childNodes.push(node); return node; }
    replaceChild(next, previous) { const i = this.childNodes.indexOf(previous); if (i >= 0) { next.parentNode = this; this.childNodes.splice(i, 1, next); } }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k] ?? null; }
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); }
    closest(selector) { const tags = selector.split(',').map(s => s.trim().toUpperCase()); let node = this; while (node) { if (node.tagName && tags.includes(node.tagName.toUpperCase())) return node; node = node.parentNode; } return null; }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(node => node.textContent).join(''); }
  }
  class DocumentMock {
    createTextNode(text) { return new NodeMock(3, text); }
    createElement(tag) { return new NodeMock(1, '', tag.toUpperCase()); }
    createDocumentFragment() { return new NodeMock(11); }
    createTreeWalker(root) {
      const nodes = [];
      const visit = node => { if (node.nodeType === 3) nodes.push(node); else node.childNodes.forEach(visit); };
      visit(root); let i = -1;
      return { nextNode() { i += 1; this.currentNode = nodes[i] || null; return Boolean(this.currentNode); }, currentNode: null };
    }
  }
  global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_SKIP: 3, FILTER_REJECT: 2 };
  const documentObject = new DocumentMock();
  const article = documentObject.createElement('article');
  const p = documentObject.createElement('p');
  p.appendChild(documentObject.createTextNode('This is '));
  const strong = documentObject.createElement('strong');
  strong.appendChild(documentObject.createTextNode('bold text'));
  p.appendChild(strong);
  p.appendChild(documentObject.createTextNode(' here.'));
  article.appendChild(p);
  const tokenized = tts.tokenizeReaderDOM(article, documentObject);
  assert.strictEqual(tokenized.spans.length, tokenized.meta.length);
  tokenized.meta.forEach(word => assert.strictEqual(tokenized.text.slice(word.start, word.end), word.text));

  const markdown = parser.parseMarkdownToHtml('# Heading\n\nParagraph with **bold *nested*** and 2 * 3 * 4.');
  assert(markdown.includes('<h1 id="heading">Heading</h1>'));
  assert(markdown.includes('<strong>bold <em>nested</em></strong>'));
  assert(markdown.includes('2 * 3 * 4'));

  assert.strictEqual(parser.getExtension('sample.MARKDOWN'), 'markdown');
  assert.strictEqual(parser.enforceExtractedTextLimit('valid'), 'valid');
  assert.throws(() => parser.enforceExtractedTextLimit('x'.repeat(1_000_001)), /too much extracted text/);
  assert.strictEqual(constants.lightPresets.length, 10);
  assert.strictEqual(constants.darkPresets.length, 10);
  assert.strictEqual(constants.VALID_THEMES.size, 20);

  console.log('ALL READER CORE REGRESSION TESTS PASSED.');
})().catch(error => { console.error(error); process.exitCode = 1; });

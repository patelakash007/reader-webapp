'use strict';

const assert = require('node:assert');

(async () => {
  const parser = await import('../src/parser.mjs');
  const tts = await import('../src/tts.mjs');
  const constants = await import('../src/constants.mjs');
  const { createAppContext } = await import('../src/context.mjs');

  console.log('====================================================');
  console.log('STARTING FORENSIC EMPIRICAL STRESS TEST SUITE');
  console.log('====================================================');

  console.log('\n--- 1. Production module contracts ---');
  const context = createAppContext({});
  assert.strictEqual(context.runtime.tts.speechGeneration, 0);
  assert.strictEqual(context.runtime.reader.activeRenderId, 0);
  assert.strictEqual(context.runtime.file.activeReadToken, 0);
  assert.strictEqual(typeof parser.parseMarkdownToHtml, 'function');
  assert.strictEqual(typeof tts.tokenizeReaderDOM, 'function');
  console.log('✓ Production module contracts loaded without browser globals.');

  console.log('\n--- 2. Chunking engine stress testing ---');
  assert.deepStrictEqual(tts.chunkText(''), []);
  assert.strictEqual(tts.chunkText('A'.repeat(190)).length, 1);
  assert.deepStrictEqual(tts.chunkText('B'.repeat(191)).map(chunk => chunk.text.length), [190, 1]);
  const sentence = 'Word1 Word2 Word3 Word4 Word5';
  const shortChunks = tts.chunkText(sentence, 50, 15);
  assert(shortChunks.length > 1);
  shortChunks.forEach(chunk => { assert(chunk.text.length <= 15); assert(chunk.start >= 50); });
  const complexWhitespace = 'Alpha\t\tBeta\n\nGamma   Delta\r\nEpsilon ' + 'Z'.repeat(200);
  tts.chunkText(complexWhitespace).forEach(chunk => assert(!/^\s/.test(chunk.text)));
  console.log('✓ Production chunking passed boundary conditions and edge cases.');

  console.log('\n--- 3. Production DOM tokenization and offset fidelity ---');
  class MockNode {
    constructor(nodeType, nodeValue = null, tagName = null) { this.nodeType = nodeType; this.nodeValue = nodeValue; this.tagName = tagName; this.childNodes = []; this.parentNode = null; this.attributes = {}; this.classList = { values: new Set(), add: value => this.classList.values.add(value), remove: value => this.classList.values.delete(value) }; }
    get parentElement() { return this.nodeType === 1 ? this : this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
    replaceChild(newChild, oldChild) { const index = this.childNodes.indexOf(oldChild); if (index === -1) return; if (newChild.nodeType === 11) { const children = [...newChild.childNodes]; children.forEach(child => { child.parentNode = this; }); this.childNodes.splice(index, 1, ...children); newChild.childNodes = []; } else { newChild.parentNode = this; this.childNodes.splice(index, 1, newChild); } }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] || null; }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
    closest(selector) { const tags = selector.split(',').map(value => value.trim().toUpperCase()); let current = this; while (current) { if (current.tagName && tags.includes(current.tagName.toUpperCase())) return current; current = current.parentNode; } return null; }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(child => child.textContent).join(''); }
  }
  class MockDocument {
    createTextNode(text) { return new MockNode(3, text); }
    createElement(tag) { return new MockNode(1, null, tag.toUpperCase()); }
    createDocumentFragment() { return new MockNode(11); }
    createTreeWalker(root, showWhat, filter) { const nodes = []; const visit = node => { if (node.nodeType === 3) { if (!filter || filter.acceptNode(node) !== NodeFilter.FILTER_SKIP) nodes.push(node); return; } node.childNodes.forEach(visit); }; visit(root); let index = -1; return { currentNode: null, nextNode() { index += 1; this.currentNode = nodes[index] || null; return Boolean(this.currentNode); } }; }
  }
  global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
  const mockDocument = new MockDocument();
  const root = mockDocument.createElement('div');
  const paragraph = mockDocument.createElement('p');
  const emphasis = mockDocument.createElement('em');
  emphasis.appendChild(mockDocument.createTextNode('Hello'));
  paragraph.appendChild(emphasis);
  paragraph.appendChild(mockDocument.createTextNode(' world from Reader.'));
  root.appendChild(paragraph);
  const heading = mockDocument.createElement('h2');
  heading.appendChild(mockDocument.createTextNode('Section Two'));
  root.appendChild(heading);
  const secondParagraph = mockDocument.createElement('p');
  secondParagraph.appendChild(mockDocument.createTextNode('A multi-line paragraph with punctuation: Dr. Smith, U.S.A., 3.14159, and more.'));
  root.appendChild(secondParagraph);
  const tokenized = tts.tokenizeReaderDOM(root, mockDocument);
  assert.strictEqual(tokenized.spans.length, tokenized.meta.length);
  tokenized.meta.forEach(word => assert.strictEqual(tokenized.text.slice(word.start, word.end), word.text));
  assert.strictEqual(tokenized.spans.find(span => span.textContent === 'Hello').parentNode.tagName, 'EM');
  console.log('✓ Production DOM tokenization preserved hierarchy and character offsets.');

  console.log('\n--- 4. Production PDF spacing engine ---');
  assert.strictEqual(parser.extractPdfPageText([{ str: 'First', transform: [1, 0, 0, 1, 10, 500], width: 30, height: 10 }, { str: 'Second', transform: [1, 0, 0, 1, 40.5, 500], width: 35, height: 10 }]), 'FirstSecond');
  assert.strictEqual(parser.extractPdfPageText([{ str: 'First', transform: [1, 0, 0, 1, 10, 500], width: 30, height: 10 }, { str: 'Second', transform: [1, 0, 0, 1, 45, 500], width: 35, height: 10 }]), 'First Second');
  assert.strictEqual(parser.extractPdfPageText([{ str: 'Header', transform: [1, 0, 0, 1, 10, 500], width: 40, height: 10 }, { str: 'Body', transform: [1, 0, 0, 1, 10, 470], width: 30, height: 10 }]), 'Header\n\nBody');
  console.log('✓ Production PDF spacing handles touching words, gaps, and paragraphs.');

  console.log('\n--- 5. Production voice selection and rate math ---');
  const voices = tts.deduplicateAndSortVoices([{ name: 'Google US', lang: 'en-US', voiceURI: 'g1', default: false }, { name: 'Google US', lang: 'en-US', voiceURI: 'g2', default: false }, { name: 'David', lang: 'en-US', voiceURI: 'd', default: true }, { name: 'French', lang: 'fr-FR', voiceURI: 'fr', default: false }, { name: 'British', lang: 'en-GB', voiceURI: 'gb', default: false }]);
  assert.strictEqual(voices.length, 4);
  assert.strictEqual(voices[0].name, 'David');
  assert.strictEqual(tts.resolveVoiceIndex(voices, 'fr', 'en-US'), voices.findIndex(voice => voice.voiceURI === 'fr'));
  assert.strictEqual(tts.resolveVoiceIndex(voices, null, 'ja-JP'), 0);
  console.log('✓ Production voice ordering and fallback passed.');

  console.log('\n--- 6. Production Markdown security and integration ---');
  for (const input of ['<script>alert("XSS")</script>', '<img src=x onerror=alert(1)>', '[Click](javascript:alert(1))', '[Data](data:text/html,<script>alert(1)</script>)', '[VB](vbscript:msgbox(1))', '<iframe src="https://evil.com"></iframe>', '`<script>literal</script>`']) {
    const result = parser.parseMarkdownToHtml(input);
    assert(!result.includes('<script>')); assert(!result.includes('<img')); assert(!result.includes('<iframe')); assert(!result.includes('href="javascript:')); assert(!result.includes('href="data:')); assert(!result.includes('href="vbscript:'));
  }
  const complexDocument = ['# Reader & TTS Masterpiece', '', 'This is a comprehensive test document.', '', '## Feature Highlights', '- Native Speech Synthesis', '- DOM word tokenization', '- Item Gamma with [Safe Link](https://example.com/docs)', '- Bullet point with **bold text** and *italic words*', '', '> A famous quotation on reader design.', '', '```', 'function helloWorld() {', '  console.log("Hello from code block!");', '}', '```'].join('\n');
  const parsedHtml = parser.parseMarkdownToHtml(complexDocument);
  assert(parsedHtml.includes('<h1 id="reader-tts-masterpiece">Reader &amp; TTS Masterpiece</h1>'));
  assert(parsedHtml.includes('<h2 id="feature-highlights">Feature Highlights</h2>'));
  assert(parsedHtml.includes('<strong>bold text</strong>'));
  assert(parsedHtml.includes('<em>italic words</em>'));
  assert(parsedHtml.includes('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">Safe Link</a>'));
  assert(parsedHtml.includes('<pre><code>function helloWorld() {'));
  console.log('✓ Production Markdown parser passed sanitization and document integration checks.');

  console.log('\n--- 7. Large-document stress and bounded TTS contract ---');
  const largeMarkdown = Array.from({ length: 2500 }, (_, index) => `### Paragraph ${index}\n\nLine ${index} with **bold** and [link](https://example.com/${index})`).join('\n\n');
  const startTime = Date.now();
  const largeHtml = parser.parseMarkdownToHtml(largeMarkdown);
  const elapsed = Date.now() - startTime;
  assert(largeHtml.length > 250000);
  assert(elapsed < 2000, `Large document parse took too long: ${elapsed}ms`);
  assert.strictEqual(tts.LAZY_TOKENIZE_WORD_LIMIT, 5000);
  assert.strictEqual(constants.lightPresets.length, 10);
  assert.strictEqual(constants.darkPresets.length, 10);
  assert.strictEqual(constants.VALID_THEMES.size, 20);
  console.log(`✓ 2,500 production Markdown blocks parsed in ${elapsed}ms; lazy TTS threshold is ${tts.LAZY_TOKENIZE_WORD_LIMIT.toLocaleString()} words.`);

  console.log('\n====================================================');
  console.log('ALL FORENSIC EMPIRICAL STRESS TESTS PASSED');
  console.log('====================================================\n');
})().catch(error => { console.error(error); process.exitCode = 1; });

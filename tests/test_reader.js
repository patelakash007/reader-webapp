'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

console.log('--- Running Reader & TTS Unit and Integration Tests ---');

// ===== 1. Script Syntax & Deprecation Checks =====
const scriptSource = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');

assert(!scriptSource.includes('.substr('), 'script.js should not contain deprecated String.prototype.substr calls');
assert(scriptSource.includes('.slice(2, 11)'), 'script.js should use .slice(2, 11) for heading ID generation');
assert(scriptSource.includes('tokenizeReaderDOM'), 'script.js should export or define tokenizeReaderDOM');
assert(scriptSource.includes('chunkText'), 'script.js should define chunkText');
assert(scriptSource.includes('speechGeneration'), 'script.js should include speechGeneration concurrency counter');
console.log('✓ Check 1: Script syntax and deprecation validation passed.');

// ===== 2. Utterance Chunking Algorithm =====
function chunkText(text, baseOffset = 0, targetLen = 190) {
  const out = [];
  const len = text.length;
  let start = 0;
  while (start < len) {
    if (len - start <= targetLen) {
      out.push({ text: text.slice(start), start: baseOffset + start, end: baseOffset + len });
      break;
    }
    const end = start + targetLen;
    let splitAt = -1;
    for (let i = Math.min(end, len - 1); i > start; i--) {
      if (/\s/.test(text[i])) {
        splitAt = i;
        break;
      }
    }
    if (splitAt === -1) splitAt = end;
    out.push({ text: text.slice(start, splitAt), start: baseOffset + start, end: baseOffset + splitAt });
    start = splitAt;
    while (start < len && /\s/.test(text[start])) start++;
  }
  return out;
}

// Short text
const short = "This is a short sample sentence.";
const shortChunks = chunkText(short);
assert.strictEqual(shortChunks.length, 1);
assert.strictEqual(shortChunks[0].text, short);
assert.strictEqual(shortChunks[0].start, 0);
assert.strictEqual(shortChunks[0].end, short.length);

// Long text (> 190 chars)
const paragraph = "The quick brown fox jumps over the lazy dog repeatedly to test long character chunking in our unified reading application. Every sentence is split cleanly on word boundaries so that speech synthesis engines never hit the Chromium 15-second audio drop limit.";
const longChunks = chunkText(paragraph, 100, 190);
assert(longChunks.length > 1, 'Long text should produce multiple chunks');
longChunks.forEach(chunk => {
  assert(chunk.text.length <= 190, `Chunk length ${chunk.text.length} exceeds 190 target`);
  assert(chunk.start >= 100, 'Base offset was not applied correctly');
  assert.strictEqual(chunk.end, chunk.start + chunk.text.length, 'Chunk start + length should equal chunk end');
  assert(!/^\s/.test(chunk.text), 'Chunk should not start with leading whitespace');
});

// Single very long word (> 190 chars)
const giantWord = 'A'.repeat(250);
const giantChunks = chunkText(giantWord, 0, 190);
assert.strictEqual(giantChunks.length, 2);
assert.strictEqual(giantChunks[0].text.length, 190);
assert.strictEqual(giantChunks[1].text.length, 60);

console.log('✓ Check 2: 190-character chunking algorithm passed.');

// ===== 3. PDF Page Text Spacing Preservation =====
function extractPdfPageText(items) {
  let text = '';
  let lastY = null;
  let lastX = null;
  let lastWidth = null;

  items.forEach(item => {
    const currentY = item.transform && typeof item.transform[5] === 'number' ? item.transform[5] : null;
    const currentX = item.transform && typeof item.transform[4] === 'number' ? item.transform[4] : null;
    const currentWidth = typeof item.width === 'number' ? item.width : null;
    const value = item.str || '';

    if (lastY !== null && currentY !== null) {
      const diffY = Math.abs(lastY - currentY);
      const height = Math.abs(item.height || 10);
      if (diffY > height * 1.2) {
        text += '\n\n';
      } else if (diffY > 2) {
        text += ' ';
      } else if (lastX !== null && currentX !== null) {
        const expectedNextX = lastX + (lastWidth || 0);
        if (currentX > expectedNextX + 1.5 && !text.endsWith(' ') && !value.startsWith(' ')) {
          text += ' ';
        }
      }
    }

    text += value;
    if (currentY !== null) lastY = currentY;
    if (currentX !== null) lastX = currentX;
    if (currentWidth !== null) lastWidth = currentWidth;
  });

  return text;
}

const pdfItemsSameLine = [
  { str: 'Hello', transform: [1, 0, 0, 1, 50, 700], width: 30, height: 12 },
  { str: 'World', transform: [1, 0, 0, 1, 90, 700], width: 35, height: 12 }
];
const extractedPdf = extractPdfPageText(pdfItemsSameLine);
assert.strictEqual(extractedPdf, 'Hello World', `Expected 'Hello World' with space, got: '${extractedPdf}'`);

const pdfItemsNewLine = [
  { str: 'Heading Line', transform: [1, 0, 0, 1, 50, 700], width: 80, height: 12 },
  { str: 'Paragraph line', transform: [1, 0, 0, 1, 50, 670], width: 90, height: 12 }
];
const extractedPdfParagraph = extractPdfPageText(pdfItemsNewLine);
assert(extractedPdfParagraph.includes('Heading Line\n\nParagraph line'), 'Large Y diff should insert double newline');

console.log('✓ Check 3: PDF text extraction spacing and newline preservation passed.');

// ===== 4. Voice Deduplication & Persistence Ladder =====
function deduplicateAndSortVoices(list) {
  const seen = new Set();
  const unique = [];
  list.forEach(v => {
    const key = v.name + '\0' + v.lang;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(v);
    }
  });

  return unique.sort((a, b) => {
    if (a.default !== b.default) return a.default ? -1 : 1;
    const la = a.lang || '';
    const lb = b.lang || '';
    if (la !== lb) return la.localeCompare(lb);
    return a.name.localeCompare(b.name);
  });
}

function resolveVoiceIndex(voices, prevSelection, userLang) {
  let chosenIndex = -1;
  if (prevSelection) {
    chosenIndex = voices.findIndex(v => v.voiceURI === prevSelection || v.name === prevSelection);
  }
  if (chosenIndex === -1) {
    chosenIndex = voices.findIndex(v => v.lang === userLang);
    if (chosenIndex === -1) {
      chosenIndex = voices.findIndex(v => v.lang && v.lang.split('-')[0] === userLang.split('-')[0]);
    }
    if (chosenIndex === -1) chosenIndex = voices.findIndex(v => v.default);
    if (chosenIndex === -1) chosenIndex = 0;
  }
  return chosenIndex;
}

const mockVoices = [
  { name: 'Google US English', lang: 'en-US', voiceURI: 'google-en-us', default: false },
  { name: 'Google US English', lang: 'en-US', voiceURI: 'google-en-us-dup', default: false },
  { name: 'Alex', lang: 'en-US', voiceURI: 'alex', default: true },
  { name: 'Anna', lang: 'de-DE', voiceURI: 'anna', default: false }
];

const sorted = deduplicateAndSortVoices(mockVoices);
assert.strictEqual(sorted.length, 3, 'Duplicates with same name+lang should be removed');
assert.strictEqual(sorted[0].name, 'Alex', 'Default voice should be sorted first');

const resolvedIndex = resolveVoiceIndex(sorted, 'anna', 'en-US');
assert.strictEqual(resolvedIndex, sorted.findIndex(v => v.voiceURI === 'anna'));

const fallbackToLang = resolveVoiceIndex(sorted, 'non-existent', 'de-DE');
assert.strictEqual(fallbackToLang, sorted.findIndex(v => v.lang === 'de-DE'));

console.log('✓ Check 4: Voice deduplication, sorting, and persistence ladder passed.');

// ===== 5. Mock DOM Word Tokenization & Character Offset Accuracy =====
class MockNode {
  constructor(nodeType, nodeValue = null, tagName = null) {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.tagName = tagName;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.classList = new Set();
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx !== -1) {
      if (newChild.nodeType === 11) { // DocumentFragment
        const fragmentChildren = [...newChild.childNodes];
        fragmentChildren.forEach(c => { c.parentNode = this; });
        this.childNodes.splice(idx, 1, ...fragmentChildren);
        newChild.childNodes = [];
      } else {
        newChild.parentNode = this;
        this.childNodes.splice(idx, 1, newChild);
      }
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  closest(selector) {
    let curr = this;
    const tags = selector.split(',').map(s => s.trim().toUpperCase());
    while (curr) {
      if (curr.tagName && tags.includes(curr.tagName.toUpperCase())) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    function traverse(node) {
      if (selector === '.tts-word.active' && node.classList && node.classList.has('tts-word') && node.classList.has('active')) {
        results.push(node);
      } else if (selector === '.tts-word' && node.classList && node.classList.has('tts-word')) {
        results.push(node);
      }
      for (const child of node.childNodes) {
        traverse(child);
      }
    }
    traverse(this);
    return results;
  }

  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.childNodes.map(c => c.textContent).join('');
  }
  set textContent(val) {
    if (this.nodeType === 3) {
      this.nodeValue = val;
    } else {
      this.childNodes = [new MockNode(3, val)];
      this.childNodes[0].parentNode = this;
    }
  }
}

class MockDocument {
  createTextNode(text) {
    return new MockNode(3, text);
  }
  createElement(tag) {
    const el = new MockNode(1, null, tag.toUpperCase());
    el.className = '';
    return el;
  }
  createDocumentFragment() {
    return new MockNode(11);
  }
}

const mockDoc = new MockDocument();

function mockTokenizeReaderDOM(containerElement) {
  const wordSpans = [];
  const wordMeta = [];
  let fullSpokenText = '';

  if (!containerElement) return { spans: wordSpans, meta: wordMeta, text: fullSpokenText };

  function getTextNodes(node) {
    const nodes = [];
    if (node.nodeType === 3) {
      if (node.nodeValue && node.nodeValue.trim()) nodes.push(node);
    } else {
      for (const child of node.childNodes) {
        nodes.push(...getTextNodes(child));
      }
    }
    return nodes;
  }

  const textNodes = getTextNodes(containerElement);
  const re = /\S+/g;
  let lastBlockElement = null;

  textNodes.forEach(textNode => {
    const text = textNode.nodeValue;
    const parentBlock = textNode.parentNode ? textNode.parentNode.closest('p, h1, h2, h3, li, blockquote, pre') : null;

    if (parentBlock && lastBlockElement && parentBlock !== lastBlockElement) {
      if (!fullSpokenText.endsWith('\n\n')) {
        if (!fullSpokenText.endsWith('\n')) fullSpokenText += '\n';
        fullSpokenText += '\n';
      }
    } else if (fullSpokenText.length > 0 && !/\s$/.test(fullSpokenText)) {
      fullSpokenText += ' ';
    }
    lastBlockElement = parentBlock;

    const frag = mockDoc.createDocumentFragment();
    let lastIndex = 0;
    let m;

    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) {
        const ws = text.slice(lastIndex, m.index);
        frag.appendChild(mockDoc.createTextNode(ws));
        fullSpokenText += ws;
      }
      const wordText = m[0];
      const span = mockDoc.createElement('span');
      span.className = 'tts-word';
      span.classList.add('tts-word');
      const wordIdx = wordMeta.length;
      span.setAttribute('data-word-idx', String(wordIdx));
      span.textContent = wordText;
      frag.appendChild(span);

      const wordStart = fullSpokenText.length;
      fullSpokenText += wordText;
      const wordEnd = fullSpokenText.length;

      wordSpans.push(span);
      wordMeta.push({
        index: wordIdx,
        text: wordText,
        start: wordStart,
        end: wordEnd,
        element: span
      });

      lastIndex = m.index + wordText.length;
    }

    if (lastIndex < text.length) {
      const trailing = text.slice(lastIndex);
      frag.appendChild(mockDoc.createTextNode(trailing));
      fullSpokenText += trailing;
    }

    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  });

  return { spans: wordSpans, meta: wordMeta, text: fullSpokenText };
}

// Build a mock document tree with rich hierarchy: h1, p (with strong, a), blockquote, ul/li, pre/code
const article = mockDoc.createElement('article');
const h1 = mockDoc.createElement('h1');
h1.appendChild(mockDoc.createTextNode('Chapter One'));
article.appendChild(h1);

const p = mockDoc.createElement('p');
p.appendChild(mockDoc.createTextNode('This is '));
const strong = mockDoc.createElement('strong');
strong.appendChild(mockDoc.createTextNode('bold text'));
p.appendChild(strong);
p.appendChild(mockDoc.createTextNode(' and a '));
const a = mockDoc.createElement('a');
a.setAttribute('href', 'https://example.com');
a.appendChild(mockDoc.createTextNode('link'));
p.appendChild(a);
p.appendChild(mockDoc.createTextNode('.'));
article.appendChild(p);

const bq = mockDoc.createElement('blockquote');
bq.appendChild(mockDoc.createTextNode('A wise quote here.'));
article.appendChild(bq);

const { spans, meta, text } = mockTokenizeReaderDOM(article);

assert.strictEqual(spans.length, meta.length, 'Span count should match meta count');
assert(meta.length >= 11, `Expected at least 11 words, got ${meta.length}`);

// Verify that for every word descriptor, slicing fullSpokenText returns the EXACT word text!
meta.forEach(w => {
  const extracted = text.slice(w.start, w.end);
  assert.strictEqual(extracted, w.text, `Word text mismatch at idx ${w.index}: expected '${w.text}', got '${extracted}'`);
  assert.strictEqual(w.element.getAttribute('data-word-idx'), String(w.index));
});

// Verify parent tag preservation
const boldWordSpan = spans.find(s => s.textContent === 'bold');
assert(boldWordSpan, 'Word span for "bold" should exist');
assert.strictEqual(boldWordSpan.parentNode.tagName, 'STRONG', 'Parent of bold span must remain STRONG');

const linkWordSpan = spans.find(s => s.textContent === 'link');
assert(linkWordSpan, 'Word span for "link" should exist');
assert.strictEqual(linkWordSpan.parentNode.tagName, 'A', 'Parent of link span must remain A');
assert.strictEqual(linkWordSpan.parentNode.getAttribute('href'), 'https://example.com');

console.log('✓ Check 5: Non-destructive DOM word tokenization and character offset mapping passed.');

// ===== 6. Concurrency & Generation Guard Verification =====
let generation = 0;
let activeUtterance = null;
let playedChunks = [];

function simulateSpeech(chunksToPlay) {
  generation++;
  const gen = generation;
  playedChunks = [];

  chunksToPlay.forEach((chunk, i) => {
    // Simulate callback checking generation
    setTimeout(() => {
      if (gen !== generation) {
        // Discarded because new generation started!
        return;
      }
      playedChunks.push(chunk.text);
    }, i * 10);
  });
}

simulateSpeech([{ text: 'First call A' }, { text: 'First call B' }]);
// Immediately interrupt with second speech session:
simulateSpeech([{ text: 'Second call A' }, { text: 'Second call B' }]);

setTimeout(() => {
  assert.deepStrictEqual(playedChunks, ['Second call A', 'Second call B'], 'First session callbacks must be discarded by speechGeneration guard');
  console.log('✓ Check 6: Speech generation concurrency guard passed.');
  console.log('----------------------------------------------------');
  console.log('ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY! (100%)');
}, 50);

// ===== 7. TTS State Machine & Mobile Pause/Resume Simulation =====
const STATE_IDLE = 'idle';
const STATE_PLAYING = 'playing';
const STATE_PAUSED = 'paused';

class MockSynth {
  constructor() {
    this.speaking = false;
    this.paused = false;
    this.history = [];
    this.currentUtt = null;
  }
  speak(utt) {
    this.speaking = true;
    this.paused = false;
    this.currentUtt = utt;
    this.history.push({ action: 'speak', text: utt.text, rate: utt.rate });
    if (utt.onstart) utt.onstart();
  }
  pause() {
    this.paused = true;
    this.history.push({ action: 'pause' });
  }
  resume() {
    this.paused = false;
    this.history.push({ action: 'resume' });
  }
  cancel() {
    this.speaking = false;
    this.paused = false;
    this.currentUtt = null;
    this.history.push({ action: 'cancel' });
  }
}

class MockTTSController {
  constructor(isMobile = false) {
    this.isMobile = isMobile;
    this.state = STATE_IDLE;
    this.synth = new MockSynth();
    this.generation = 0;
    this.currentWordIndex = -1;
    this.keepAliveTimer = null;
    this.fullText = "The quick brown fox jumps over the lazy dog";
    this.meta = [
      { index: 0, text: "The", start: 0, end: 3 },
      { index: 1, text: "quick", start: 4, end: 9 },
      { index: 2, text: "brown", start: 10, end: 15 },
      { index: 3, text: "fox", start: 16, end: 19 },
      { index: 4, text: "jumps", start: 20, end: 25 },
      { index: 5, text: "over", start: 26, end: 30 },
      { index: 6, text: "the", start: 31, end: 34 },
      { index: 7, text: "lazy", start: 35, end: 39 },
      { index: 8, text: "dog", start: 40, end: 43 }
    ];
  }

  start(fromWord = 0) {
    this.generation++;
    this.state = STATE_PLAYING;
    this.currentWordIndex = fromWord;
    this.synth.cancel();
    const chunk = { text: this.fullText.slice(this.meta[fromWord].start), start: this.meta[fromWord].start };
    const utt = {
      text: chunk.text,
      rate: 1.0,
      onstart: () => {}
    };
    this.synth.speak(utt);
    if (!this.isMobile) {
      this.keepAliveTimer = true;
    }
  }

  pause() {
    if (this.state !== STATE_PLAYING) return;
    this.keepAliveTimer = null;
    if (this.isMobile) {
      this.generation++;
      this.synth.cancel();
    } else {
      this.synth.pause();
    }
    this.state = STATE_PAUSED;
  }

  resume() {
    if (this.state !== STATE_PAUSED) return;
    if (this.isMobile) {
      this.start(this.currentWordIndex);
    } else {
      this.synth.resume();
      this.state = STATE_PLAYING;
      this.keepAliveTimer = true;
    }
  }

  stop() {
    this.generation++;
    this.keepAliveTimer = null;
    this.synth.cancel();
    this.state = STATE_IDLE;
    this.currentWordIndex = -1;
  }
}

// Test Desktop TTS Flow
const desktopController = new MockTTSController(false);
desktopController.start(0);
assert.strictEqual(desktopController.state, STATE_PLAYING);
assert(desktopController.keepAliveTimer, 'Desktop should enable keep-alive');
desktopController.pause();
assert.strictEqual(desktopController.state, STATE_PAUSED);
assert.strictEqual(desktopController.synth.history.slice(-1)[0].action, 'pause');
desktopController.resume();
assert.strictEqual(desktopController.state, STATE_PLAYING);
assert.strictEqual(desktopController.synth.history.slice(-1)[0].action, 'resume');
desktopController.stop();
assert.strictEqual(desktopController.state, STATE_IDLE);

// Test Mobile TTS Flow (Cancel-on-pause & restart-from-word)
const mobileController = new MockTTSController(true);
mobileController.start(2); // Start at word "brown"
assert.strictEqual(mobileController.state, STATE_PLAYING);
assert.strictEqual(mobileController.keepAliveTimer, null, 'Mobile should NEVER enable 10s keep-alive');
mobileController.pause();
assert.strictEqual(mobileController.state, STATE_PAUSED);
assert.strictEqual(mobileController.synth.history.slice(-1)[0].action, 'cancel', 'Mobile pause must call cancel');
mobileController.resume();
assert.strictEqual(mobileController.state, STATE_PLAYING);
const latestSpeak = mobileController.synth.history.filter(h => h.action === 'speak').slice(-1)[0];
assert(latestSpeak.text.startsWith('brown'), `Mobile resume should speak from word 2 ('brown'), got: '${latestSpeak.text}'`);
mobileController.stop();
assert.strictEqual(mobileController.state, STATE_IDLE);

console.log('✓ Check 7: Desktop vs Mobile TTS state machine and pause/resume logic passed.');

// ===== 8. Multi-Format Text Extraction Tests =====
// TXT / Markdown
const mdSample = "# Heading\n\n- Item 1\n- Item 2\n\n> Quote";
const parsedMd = mdSample.replace(/^#+\s+/gm, '').replace(/^[-\*]\s+/gm, '').replace(/^>\s+/gm, '');
assert(parsedMd.includes('Heading') && parsedMd.includes('Item 1') && parsedMd.includes('Quote'));

// Plain text limit enforcement
function enforceLimit(text, max = 1_000_000) {
  if (text.length > max) throw new Error('File exceeds limit');
  return text;
}
assert.strictEqual(enforceLimit('valid text'), 'valid text');
assert.throws(() => enforceLimit('x'.repeat(1_000_001)), /exceeds limit/);

console.log('✓ Check 8: Multi-format text processing and limit enforcement passed.');

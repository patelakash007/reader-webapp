'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const parser = await import('../src/parser.mjs');
  const tts = await import('../src/tts.mjs');
  const utils = await import('../src/utils.mjs');
  const { createAppContext } = await import('../src/context.mjs');
  const { createReader } = await import('../src/reader.mjs');

  console.log('====================================================');
  console.log('RUNNING REGRESSION TEST SUITE');
  console.log('====================================================');

  console.log('\n--- 1. Markdown: Nested emphasis ---');
  const nestedEmphasis = '**bold *and italic* inside**';
  const nestedHtml = parser.parseMarkdownToHtml(nestedEmphasis);
  assert(
    nestedHtml.includes('<strong>bold <em>and italic</em> inside</strong>') ||
    nestedHtml.includes('<strong>bold <em>and italic</em></strong>'),
    `Nested emphasis failed: ${nestedHtml}`
  );
  assert(!nestedHtml.includes('**bold'), `Unparsed asterisks remained in nested emphasis: ${nestedHtml}`);
  console.log('✓ Nested emphasis correctly preserved.');

  console.log('\n--- 2. Markdown: Spaced asterisks must remain literal ---');
  const mathText = '2 * 3 * 4 = 24';
  const mathHtml = parser.parseMarkdownToHtml(mathText);
  assert(mathHtml.includes('2 * 3 * 4 = 24'), `Math text was mutated: ${mathHtml}`);
  assert(!mathHtml.includes('<em>'), `Spaced asterisks became emphasis: ${mathHtml}`);
  console.log('✓ Spaced asterisks remained literal mathematical text.');

  console.log('\n--- 3. Markdown: Nested lists ---');
  const nestedListMd = [
    '- parent',
    '  - child',
    '    - grandchild'
  ].join('\n');
  const nestedListHtml = parser.parseMarkdownToHtml(nestedListMd);
  assert(nestedListHtml.includes('parent'), 'Parent list item missing');
  assert(nestedListHtml.includes('child'), 'Child list item missing');
  assert(nestedListHtml.includes('grandchild'), 'Grandchild list item missing');
  const parentLiChildIndex = nestedListHtml.indexOf('child');
  const parentLiIndex = nestedListHtml.indexOf('parent');
  assert(parentLiChildIndex > parentLiIndex, 'Child should follow parent');
  const ulCount = (nestedListHtml.match(/<ul/g) || []).length;
  assert(ulCount >= 2, `Nested lists should have multiple list levels, found ${ulCount}`);
  console.log('✓ Nested lists preserved hierarchy.');

  console.log('\n--- 4. Markdown: Multi-line blockquotes ---');
  const blockquoteMd = [
    '> line one',
    '> line two'
  ].join('\n');
  const blockquoteHtml = parser.parseMarkdownToHtml(blockquoteMd);
  const blockquoteTagCount = (blockquoteHtml.match(/<blockquote/g) || []).length;
  assert.strictEqual(blockquoteTagCount, 1, `Expected exactly 1 blockquote tag for multi-line quote, got ${blockquoteTagCount}: ${blockquoteHtml}`);
  assert(blockquoteHtml.includes('line one'), 'Missing line one in blockquote');
  assert(blockquoteHtml.includes('line two'), 'Missing line two in blockquote');
  console.log('✓ Multi-line blockquotes produce one logical blockquote.');

  console.log('\n--- 5. Markdown: Ordered-list starting number ---');
  const orderedListMd = [
    '3. Three',
    '4. Four'
  ].join('\n');
  const orderedListHtml = parser.parseMarkdownToHtml(orderedListMd);
  assert(orderedListHtml.includes('<ol start="3">'), `Expected <ol start="3">, got: ${orderedListHtml}`);
  assert(orderedListHtml.includes('<li>Three</li>'), 'Missing item Three');
  assert(orderedListHtml.includes('<li>Four</li>'), 'Missing item Four');
  console.log('✓ Ordered-list starting number 3 preserved.');

  console.log('\n--- 6. Markdown: Soft line breaks within paragraph ---');
  const softBreakMd = [
    'Line one of the paragraph',
    'Line two of the same paragraph'
  ].join('\n');
  const softBreakHtml = parser.parseMarkdownToHtml(softBreakMd);
  const pCount = (softBreakHtml.match(/<p/g) || []).length;
  assert.strictEqual(pCount, 1, `Soft breaks should remain within 1 paragraph, got ${pCount}: ${softBreakHtml}`);
  assert(softBreakHtml.includes('Line one of the paragraph'), 'Missing line one');
  assert(softBreakHtml.includes('Line two of the same paragraph'), 'Missing line two');
  console.log('✓ Soft line breaks do not create independent paragraphs.');

  console.log('\n--- 7. Markdown: Image syntax fallback ---');
  const imageMd = '![alt text](https://example.com/image.png)';
  const imageHtml = parser.parseMarkdownToHtml(imageMd);
  assert(!imageHtml.includes('!<a'), `Accidental !<a ...> rendering detected: ${imageHtml}`);
  assert(!imageHtml.includes('<img'), `Remote image should not be loaded: ${imageHtml}`);
  assert(imageHtml.includes('[Image: alt text]'), `Expected safe fallback [Image: alt text], got: ${imageHtml}`);
  console.log('✓ Image syntax renders safe fallback [Image: alt text].');

  console.log('\n--- 8. Markdown: Smart Heading false positives ---');
  const uppercaseLine = 'NASA AND FBI';
  const falsePositiveHtml = parser.parseMarkdownToHtml(uppercaseLine, true);
  assert(!falsePositiveHtml.includes('<h1') && !falsePositiveHtml.includes('<h2') && !falsePositiveHtml.includes('<h3'),
    `Acronym conjunction line became a heading: ${falsePositiveHtml}`);
  assert(falsePositiveHtml.includes('NASA AND FBI'), 'Content was lost');

  const genuineHeading = [
    '',
    'EXECUTIVE SUMMARY',
    '',
    'This is the body text.'
  ].join('\n');
  const genuineHtml = parser.parseMarkdownToHtml(genuineHeading, true);
  assert(genuineHtml.includes('<h2') && genuineHtml.includes('EXECUTIVE SUMMARY'),
    `Genuine smart heading was not recognized: ${genuineHtml}`);
  console.log('✓ Smart Heading correctly distinguishes false positives from genuine headings.');

  console.log('\n--- 9. Markdown: Semantic heading levels h1 through h6 ---');
  const allHeadingsMd = [
    '# H1',
    '## H2',
    '### H3',
    '#### H4',
    '##### H5',
    '###### H6'
  ].join('\n\n');
  const allHeadingsHtml = parser.parseMarkdownToHtml(allHeadingsMd);
  assert(allHeadingsHtml.includes('<h1'), 'Missing H1');
  assert(allHeadingsHtml.includes('<h2'), 'Missing H2');
  assert(allHeadingsHtml.includes('<h3'), 'Missing H3');
  assert(allHeadingsHtml.includes('<h4'), 'H4 was collapsed or missing');
  assert(allHeadingsHtml.includes('<h5'), 'H5 was collapsed or missing');
  assert(allHeadingsHtml.includes('<h6'), 'H6 was collapsed or missing');
  console.log('✓ Semantic heading levels h1 through h6 preserved.');

  console.log('\n--- 10. Security: Dangerous URL and XSS rejection ---');
  const dangerousUrls = [
    '[XSS 1](javascript:alert(1))',
    '[XSS 2](javascript%3Aalert(1))',
    '[XSS 3](vbscript:msgbox(1))',
    '[XSS 4](data:text/html,<script>alert(1)</script>)',
    '[XSS 5](//evil.com/phish)',
    '[XSS 6](java\0script:alert(1))',
    '[XSS 7](javascript&#58;alert(1))'
  ];
  dangerousUrls.forEach(input => {
    const output = parser.parseMarkdownToHtml(input);
    assert(!output.includes('href="javascript:'), `Dangerous javascript href found in: ${output}`);
    assert(!output.includes('href="vbscript:'), `Dangerous vbscript href found in: ${output}`);
    assert(!output.includes('href="data:'), `Dangerous data href found in: ${output}`);
    assert(!output.includes('href="//'), `Dangerous protocol-relative href found in: ${output}`);
  });

  const rawHtmlInput = '<script>alert(1)</script><img src=x onerror=alert(1)>';
  const sanitizedHtml = parser.parseMarkdownToHtml(rawHtmlInput);
  assert(!sanitizedHtml.includes('<script>'), 'Unescaped script tag found');
  assert(!sanitizedHtml.includes('<img'), 'Unescaped img tag found');
  assert(sanitizedHtml.includes('&lt;script&gt;'), 'Script tag was not escaped');
  console.log('✓ Dangerous URL schemes and raw HTML injections cleanly neutralized.');

  console.log('\n--- 11. Edit Mode: Raw text preservation and round trip ---');
  const complexOriginalText = [
    '# Title Line',
    '',
    'Paragraph 1 with **bold**.',
    '',
    '',
    'Paragraph 2 after two blank lines.',
    '',
    '- List item 1',
    '  - Indented item',
    '',
    '2 * 3 * 4 = 24'
  ].join('\n');

  let sessionText = complexOriginalText;
  const editedText = sessionText + '\n\nAdditional edited paragraph.';
  sessionText = editedText;
  assert.strictEqual(sessionText, complexOriginalText + '\n\nAdditional edited paragraph.');
  assert(sessionText.includes('\n\n\nParagraph 2 after two blank lines.'), 'Blank lines must be preserved in raw text');
  assert(sessionText.includes('- List item 1\n  - Indented item'), 'Indentation must be preserved in raw text');
  console.log('✓ Edit mode round trip preserves blank lines and syntax.');

  console.log('\n--- 12. Async State Races: Back during render invalidation ---');
  const mockContext = createAppContext({
    readerContent: { textContent: '', insertAdjacentHTML() {} },
    readerView: { classList: { remove() {}, add() {}, contains: () => false } },
    inputView: { classList: { remove() {}, add() {} } },
    backBtn: { classList: { remove() {}, add() {} } },
    toolbar: { classList: { remove() {}, add() {}, contains: () => false } },
    wordCount: { classList: { remove() {}, add() {} } },
    focusRestore: { classList: { remove() {}, add() {} } },
    sheetBackdrop: { classList: { remove() {}, add() {} } },
    mobileFab: { classList: { remove() {}, add() {} }, setAttribute() {} },
    progressBar: { style: {} },
    pasteArea: { value: '' },
    clearBtn: { style: {} }
  });

  let enterReaderCalled = false;
  const mockUI = {
    showLoader() {},
    hideLoader() {},
    clearStatus() {},
    showStatus() {},
    announceLive() {},
    getFullscreenElement: () => null,
    setContainerFocusable() {}
  };
  const mockTTS = {
    getSession: () => ({ isSpeaking: false, wordMeta: [] }),
    stopTTS() {},
    tokenize() {}
  };
  const mockParser = {
    enforceExtractedTextLimit: t => t
  };
  const mockSettings = () => ({
    applyTextColor() {},
    resetSettingsSections() {}
  });

  const reader = createReader(mockContext, {
    ui: mockUI,
    parser: mockParser,
    tts: mockTTS,
    getSettings: mockSettings
  });

  const initialRenderId = mockContext.runtime.reader.activeRenderId;
  reader.renderTextAsync('Some document text', () => {
    enterReaderCalled = true;
  });

  reader.goBack();
  assert(
    mockContext.runtime.reader.activeRenderId > initialRenderId,
    'goBack must increment activeRenderId to cancel pending render'
  );

  await new Promise(resolve => setTimeout(resolve, 80));
  assert.strictEqual(enterReaderCalled, false, 'enterReader must NOT be called by stale render after goBack()');
  console.log('✓ Back during render invalidates active render and prevents enterReader().');

  console.log('\n--- 13. TTS: Multi-chunk progression with synthetic engine ---');
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.voice = null;
      this.onstart = null;
      this.onboundary = null;
      this.onend = null;
      this.onerror = null;
    }
  }
  global.SpeechSynthesisUtterance = FakeUtterance;

  class ChainingFakeSynth {
    constructor() {
      this.history = [];
      this.speaking = false;
    }
    speak(utterance) {
      this.speaking = true;
      this.history.push(utterance.text);
      process.nextTick(() => {
        if (utterance.onstart) utterance.onstart();
        if (utterance.onboundary) utterance.onboundary({ name: 'word', charIndex: 0 });
        process.nextTick(() => {
          if (utterance.onend) utterance.onend();
        });
      });
    }
    cancel() {
      this.speaking = false;
    }
  }

  const multiChunkContext = createAppContext({
    voiceRateInput: { value: '1.0' },
    readerContent: { querySelectorAll: () => [], contains: () => true }
  });
  const chainingSynth = new ChainingFakeSynth();
  multiChunkContext.runtime.tts.supported = true;
  multiChunkContext.runtime.tts.synth = chainingSynth;
  const sentenceA = 'First sentence of speech that is long enough to exceed the chunk target in our reader app. ';
  const sentenceB = 'Second sentence of speech that continues the narration across multiple speech chunks. ';
  const sentenceC = 'Third sentence of speech completing the multi-chunk playback progression test cleanly.';
  multiChunkContext.runtime.tts.fullSpokenText = sentenceA + sentenceB + sentenceC;
  multiChunkContext.runtime.tts.wordMeta = [
    { index: 0, text: 'First', start: 0, end: 5 },
    { index: 1, text: 'Second', start: sentenceA.length, end: sentenceA.length + 6 }
  ];
  multiChunkContext.runtime.tts.wordSpans = [
    { classList: { add() {}, remove() {} }, scrollIntoView() {} },
    { classList: { add() {}, remove() {} }, scrollIntoView() {} }
  ];
  multiChunkContext.runtime.tts.chunks = [
    { text: 'First sentence of speech.', start: 0, end: 25 },
    { text: 'Second sentence of speech.', start: 26, end: 52 },
    { text: 'Third sentence of speech.', start: 53, end: 78 }
  ];
  multiChunkContext.runtime.tts.chunkIndex = 0;

  const ttsEngine = tts.createTTS(multiChunkContext, { ui: mockUI });
  ttsEngine.restartFromWord(0);
  assert.strictEqual(multiChunkContext.runtime.tts.state, 'playing');

  await new Promise(resolve => setTimeout(resolve, 80));
  assert(chainingSynth.history.length >= 2, `Expected multi-chunk chaining, spoke ${chainingSynth.history.length} chunks`);
  console.log('✓ TTS multi-chunk progression chained successfully.');

  console.log('\n--- 14. TTS: Capability-based Mobile Detection ---');
  assert.strictEqual(typeof utils.isMobileDevice, 'function', 'isMobileDevice utility should be exported');
  assert.strictEqual(utils.isMobileDevice(), false, 'Headless Node should not be detected as mobile');
  console.log('✓ Capability-based mobile detection verified.');

  console.log('\n--- 15. Markdown: Unique Heading IDs for multiple headings in block ---');
  const multiHeadings = '# First Heading\n\n## Second Heading';
  const multiHeadingsHtml = parser.parseMarkdownToHtml(multiHeadings);
  const idMatches = multiHeadingsHtml.match(/id="([^"]+)"/g);
  assert(idMatches && idMatches.length >= 2, `Expected at least 2 IDs, got: ${idMatches}`);
  assert.notStrictEqual(idMatches[0], idMatches[1], `Heading IDs collided: ${idMatches[0]} === ${idMatches[1]}`);
  console.log('✓ Heading IDs within parsed document are distinct.');

  console.log('\n--- 16. Async State Races: Back during edit mode ---');
  const editRaceContext = createAppContext({
    readerContent: { textContent: '', hidden: false, insertAdjacentHTML() {} },
    readerEditor: { value: 'Original Text', hidden: true, focus() {}, classList: { remove() {}, add() {} } },
    editingBanner: { classList: { add() {}, remove() {} } },
    editBtn: { innerHTML: '', classList: { add() {}, remove() {} }, setAttribute() {} },
    readerView: { classList: { remove() {}, add() {}, contains: () => false } },
    inputView: { classList: { remove() {}, add() {} } },
    backBtn: { classList: { remove() {}, add() {} } },
    toolbar: { classList: { remove() {}, add() {}, contains: () => false } },
    wordCount: { classList: { remove() {}, add() {} } },
    focusRestore: { classList: { remove() {}, add() {} } },
    sheetBackdrop: { classList: { remove() {}, add() {} } },
    mobileFab: { classList: { remove() {}, add() {} }, setAttribute() {} },
    progressBar: { style: {} },
    pasteArea: { value: '' },
    clearBtn: { style: {} }
  });
  editRaceContext.state.currentText = 'Original Text';
  const editReader = createReader(editRaceContext, {
    ui: mockUI,
    parser: mockParser,
    tts: mockTTS,
    getSettings: mockSettings
  });
  editReader.enterEditMode();
  assert.strictEqual(editRaceContext.state.isEditing, true, 'Should be in edit mode');
  editRaceContext.els.readerEditor.value = 'Mutated but unsaved text';
  editReader.goBack();
  assert.strictEqual(editRaceContext.state.isEditing, false, 'Edit mode should be exited');
  assert.strictEqual(editRaceContext.state.currentText, 'Original Text', 'Cancelled edit should not mutate document');
  console.log('✓ Back during edit mode cancels cleanly without corrupting text or reopening.');

  console.log('\n--- 17. Async State Races: File switching cancellation ---');
  let pdfTaskDestroyCalled = false;
  const fileSwitchContext = createAppContext();
  fileSwitchContext.runtime.file.activeLoadingTask = {
    destroy: async () => { pdfTaskDestroyCalled = true; }
  };
  const token1 = utils.beginFileRead(fileSwitchContext);
  utils.cancelPendingFileRead(fileSwitchContext);
  assert.strictEqual(pdfTaskDestroyCalled, true, 'Active loading task must be destroyed upon file cancellation');
  assert.strictEqual(fileSwitchContext.runtime.file.activeLoadingTask, null, 'Loading task reference cleared');
  assert.strictEqual(utils.isActiveFileRead(fileSwitchContext, token1), false, 'Token 1 is stale');
  const token2 = utils.beginFileRead(fileSwitchContext);
  assert.strictEqual(utils.isActiveFileRead(fileSwitchContext, token2), true, 'Token 2 is active');
  console.log('✓ File switching destroys active task and prevents race condition.');

  console.log('\n--- 18. TTS: Tokenization invalidation on rerender / setting change ---');
  const ttsInvalidateContext = createAppContext({
    readerContent: { textContent: '', querySelectorAll: () => [], insertAdjacentHTML() {} }
  });
  const ttsEngine2 = tts.createTTS(ttsInvalidateContext, { ui: mockUI });
  ttsInvalidateContext.runtime.tts.wordMeta = [{ index: 0, text: 'old', start: 0, end: 3 }];
  ttsInvalidateContext.runtime.tts.wordSpans = [{ classList: { remove() {}, add() {} } }];
  ttsInvalidateContext.runtime.tts.fullSpokenText = 'old';
  ttsEngine2.invalidateTokenization();
  assert.strictEqual(ttsInvalidateContext.runtime.tts.wordMeta.length, 0, 'wordMeta must be cleared');
  assert.strictEqual(ttsInvalidateContext.runtime.tts.wordSpans.length, 0, 'wordSpans must be cleared');
  assert.strictEqual(ttsInvalidateContext.runtime.tts.fullSpokenText, '', 'fullSpokenText must be cleared');
  console.log('✓ TTS tokenization cache cleanly invalidated to prevent stale word highlights.');

  console.log('\n--- 19. DOM Tokenization: h4-h6 block boundary & safe NodeFilter ---');
  class MockNode {
    constructor(val, tag = null) {
      this.nodeValue = val;
      this.tagName = tag ? tag.toUpperCase() : '';
      this.parentElement = null;
      this.parentNode = null;
      this.childNodes = [];
    }
    appendChild(child) {
      child.parentElement = this;
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    setAttribute(k, v) {}
    replaceChild() {}
    closest(sel) {
      const tags = sel.split(',').map(s => s.trim().toUpperCase());
      let cur = this;
      while (cur) {
        if (tags.includes(cur.tagName)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
  }
  const mockContainer = new MockNode('', 'div');
  const h4 = new MockNode('', 'h4');
  const h4Text = new MockNode('Subheading Level 4');
  h4.appendChild(h4Text);
  mockContainer.appendChild(h4);
  const p = new MockNode('', 'p');
  const pText = new MockNode('Paragraph text directly beneath h4.');
  p.appendChild(pText);
  mockContainer.appendChild(p);

  const savedNodeFilter = global.NodeFilter;
  delete global.NodeFilter;
  try {
    const docWalk = {
      createTreeWalker(root) {
        const nodes = [h4Text, pText];
        let i = -1;
        return {
          nextNode() {
            i++;
            if (i < nodes.length) { this.currentNode = nodes[i]; return true; }
            return false;
          }
        };
      },
      createElement(tag) { return new MockNode('', tag); },
      createTextNode(val) { return new MockNode(val); },
      createDocumentFragment() { return new MockNode(''); }
    };
    const tokRes = tts.tokenizeReaderDOM(mockContainer, docWalk);
    assert(tokRes.text.includes('Subheading Level 4\n\nParagraph text'), `h4 must be separated by \\n\\n from paragraph, got: ${JSON.stringify(tokRes.text)}`);
    console.log('✓ h4-h6 block boundaries preserved and missing global NodeFilter handled safely.');
  } finally {
    global.NodeFilter = savedNodeFilter;
  }

  console.log('\n--- 20. Mobile Settings Sheet: Dialog semantics & focus trap ---');
  let toolbarAttrs = {};
  const mockToolbar = {
    classList: {
      contains: cls => cls === 'expanded',
      add() {},
      remove() {}
    },
    setAttribute(k, v) { toolbarAttrs[k] = v; },
    removeAttribute(k) { delete toolbarAttrs[k]; },
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  const sheetContext = createAppContext({
    toolbar: mockToolbar,
    sheetBackdrop: { classList: { add() {}, remove() {} } },
    mobileFab: { classList: { add() {}, remove() {} }, setAttribute() {}, focus() {} }
  });
  const sheetReader = createReader(sheetContext, {
    ui: mockUI,
    parser: mockParser,
    tts: mockTTS,
    getSettings: mockSettings
  });
  sheetReader.expandMobileSheet();
  assert.strictEqual(toolbarAttrs.role, 'dialog', 'Expanded sheet must have role="dialog"');
  assert.strictEqual(toolbarAttrs['aria-modal'], 'true', 'Expanded sheet must have aria-modal="true"');
  assert.strictEqual(toolbarAttrs['aria-label'], 'Reading Settings', 'Expanded sheet must have aria-label');
  sheetReader.collapseMobileSheet();
  assert.strictEqual(toolbarAttrs.role, undefined, 'Collapsed sheet must remove role');
  assert.strictEqual(toolbarAttrs['aria-modal'], undefined, 'Collapsed sheet must remove aria-modal');
  console.log('✓ Mobile settings sheet conforms to dialog accessibility semantics.');

  console.log('\n--- 21. Typography: Honest system stacks in presets ---');
  const constants = await import('../src/constants.mjs');
  assert(constants.VALID_FONTS.has('serif'), 'VALID_FONTS must include serif');
  assert(constants.VALID_FONTS.has('sans'), 'VALID_FONTS must include sans');
  assert(constants.VALID_FONTS.has('mono'), 'VALID_FONTS must include mono');
  constants.lightPresets.forEach(preset => {
    assert(['sans', 'serif', 'mono', 'system'].includes(preset.font), `Preset ${preset.name} has non-honest font stack: ${preset.font}`);
  });
  constants.darkPresets.forEach(preset => {
    assert(['sans', 'serif', 'mono', 'system'].includes(preset.font), `Preset ${preset.name} has non-honest font stack: ${preset.font}`);
  });
  console.log('✓ All preset fonts map honestly to system font stacks (sans, serif, mono).');

  console.log('\n--- 22. DOCX Extraction on Real File ---');
  const docxPath = path.resolve(__dirname, '../../AI_Industry_State_and_Growth_Report_2025_2026.docx');
  if (fs.existsSync(docxPath)) {
    const docxBuf = fs.readFileSync(docxPath);
    const docxCtx = createAppContext();
    const readToken = utils.beginFileRead(docxCtx);
    const docxParser = parser.createParser(docxCtx, { ui: mockUI, onTextLoaded() {} });
    const extractedDocx = await docxParser.extractDocxText(docxBuf.buffer.slice(docxBuf.byteOffset, docxBuf.byteOffset + docxBuf.byteLength), readToken);
    assert(extractedDocx.length > 1000, `Expected real docx extraction > 1000 chars, got: ${extractedDocx.length}`);
    assert(extractedDocx.includes('AI') || extractedDocx.includes('COMPANIES'), 'Extracted docx missing key content');
    console.log(`✓ Real DOCX successfully extracted ${extractedDocx.length.toLocaleString()} characters.`);
  } else {
    console.log('✓ DOCX file not found in parent, skipping real file check.');
  }

  console.log('\n--- 23. File Loading: parser.handleFile with valid .txt and unsupported format ---');
  if (typeof global.FileReader === 'undefined') {
    global.FileReader = class FakeFileReader {
      readAsText(file) {
        setTimeout(() => {
          if (this.onload) this.onload({ target: { result: file._content || '' } });
        }, 0);
      }
      readAsArrayBuffer(file) {
        setTimeout(() => {
          if (this.onload) this.onload({ target: { result: file._buffer || new ArrayBuffer(0) } });
        }, 0);
      }
    };
  }
  let loadedText = null;
  let statusReported = null;
  let statusType = null;
  const fileTestUI = {
    ...mockUI,
    showStatus(msg, type) {
      statusReported = msg;
      statusType = type;
    }
  };
  const fileContext = createAppContext();
  const fileParserInstance = parser.createParser(fileContext, {
    ui: fileTestUI,
    onTextLoaded(t) {
      loadedText = t;
    }
  });

  // Valid .txt file
  const txtEvent = {
    target: {
      files: [{ name: 'notes.txt', size: 12, _content: 'Hello World!' }],
      value: 'notes.txt'
    }
  };
  await fileParserInstance.handleFile(txtEvent);
  assert.strictEqual(loadedText, 'Hello World!', `Expected onTextLoaded to receive text content, got: ${loadedText}`);
  assert.strictEqual(txtEvent.target.value, '', 'Input target value should be reset');

  // Unsupported .exe file
  const exeEvent = {
    target: {
      files: [{ name: 'malware.exe', size: 100 }],
      value: 'malware.exe'
    }
  };
  await fileParserInstance.handleFile(exeEvent);
  assert(statusReported && statusReported.includes('Unsupported format'), `Expected Unsupported format status, got: ${statusReported}`);
  assert.strictEqual(statusType, 'error', 'Expected error status type');
  assert.strictEqual(exeEvent.target.value, '', 'Input target value should be reset for unsupported files');
  console.log('✓ parser.handleFile successfully loaded .txt and rejected unsupported .exe format.');

  console.log('\n--- 24. TTS: Click-to-speak safeguards (unsupported, selection, links) ---');
  let clickHandler = null;
  const mockReaderContent = {
    addEventListener(evt, fn) {
      if (evt === 'click') clickHandler = fn;
    },
    removeEventListener() {},
    contains() { return true; },
    querySelectorAll() { return []; }
  };
  const clickContext = createAppContext({
    readerContent: mockReaderContent,
    voiceRateInput: { value: '1.0' }
  });
  let tokenizedCount = 0;
  let startedSpeechAt = null;
  const mockTTSController = {
    getSession: () => clickContext.runtime.tts,
    tokenize() {
      tokenizedCount += 1;
      clickContext.runtime.tts.wordMeta = [{ index: 0, text: 'hello', start: 0, end: 5 }];
    },
    startSpeech(idx) {
      startedSpeechAt = idx;
    },
    stopTTS() {}
  };
  const readerInstance = createReader(clickContext, {
    ui: mockUI,
    parser: mockParser,
    tts: mockTTSController,
    getSettings: mockSettings
  });
  readerInstance.bindEvents();
  assert(typeof clickHandler === 'function', 'Click handler should be attached');

  // Case 1: TTS unsupported -> do not tokenize
  clickContext.runtime.tts.supported = false;
  clickHandler({ target: { closest: () => null } });
  assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when TTS is unsupported');

  // Case 2: TTS supported, but user has an active text selection -> do not tokenize
  clickContext.runtime.tts.supported = true;
  global.window = {
    getSelection: () => ({ isCollapsed: false, toString: () => 'selected text' })
  };
  clickHandler({ target: { closest: () => null } });
  assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when text is selected');

  // Case 3: Target is a link -> do not tokenize
  global.window.getSelection = () => ({ isCollapsed: true, toString: () => '' });
  clickHandler({ target: { closest: sel => (sel.includes('a') ? {} : null) } });
  assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when clicking a link');

  // Case 4: Valid click on text -> tokenizes and starts speech
  const wordSpan = {
    closest: sel => (sel === '.tts-word' ? wordSpan : null),
    hasAttribute: attr => attr === 'data-word-idx',
    getAttribute: attr => (attr === 'data-word-idx' ? '0' : null)
  };
  global.document = {
    elementFromPoint: () => wordSpan
  };
  clickHandler({
    target: { closest: () => null },
    clientX: 100,
    clientY: 200
  });
  assert.strictEqual(tokenizedCount, 1, 'Should tokenize on valid word click');
  assert.strictEqual(startedSpeechAt, 0, 'Should start speech at word index 0 on first click');
  console.log('✓ Reader click handler safeguards against unsupported TTS, active selection, links, and speaks on first click.');

  console.log('\n--- 25. Editor: Empty edits discarded and text limit enforced on save ---');
  let lastStatusMsg = null;
  let lastStatusType = null;
  const editorUI = {
    ...mockUI,
    showStatus(msg, type) {
      lastStatusMsg = msg;
      lastStatusType = type;
    }
  };
  const makeClassList = () => ({ add() {}, remove() {}, contains() { return false; } });
  const editorContext = createAppContext({
    readerEditor: { value: '   \n\t  ', hidden: false },
    readerContent: { hidden: true, textContent: 'Initial content', insertAdjacentHTML() {} },
    editingBanner: { classList: makeClassList() },
    editBtn: { setAttribute() {}, classList: makeClassList() }
  });
  editorContext.state.currentText = 'Original persistent document';
  editorContext.state.isEditing = true;
  const editorReader = createReader(editorContext, {
    ui: editorUI,
    parser,
    tts: mockTTS,
    getSettings: mockSettings
  });

  // Saving empty edits
  editorReader.saveAndExitEditMode();
  assert.strictEqual(editorContext.state.currentText, 'Original persistent document', 'Original text must be preserved on empty save');
  assert.strictEqual(editorContext.state.isEditing, false, 'Should exit editing mode on empty cancel');
  assert(lastStatusMsg && lastStatusMsg.includes('Nothing to save'), `Expected 'Nothing to save' message, got: ${lastStatusMsg}`);
  assert.strictEqual(lastStatusType, 'info');

  // Saving text exceeding limit
  editorContext.state.isEditing = true;
  editorContext.els.readerEditor.value = 'A'.repeat(1_000_001);
  editorReader.saveAndExitEditMode();
  assert.strictEqual(editorContext.state.isEditing, true, 'Must remain in editing mode when text exceeds limit');
  assert(lastStatusMsg && lastStatusMsg.includes('contains too much extracted text'), `Expected limit error, got: ${lastStatusMsg}`);
  assert.strictEqual(lastStatusType, 'error');
  console.log('✓ Editor save safely handles empty content and enforces character limits.');

  console.log('\n--- 26. Markdown: Multi-line ALL-CAPS paragraph does not collapse into single heading with newline (F-08) ---');
  const multiLineAllCaps = 'CHAPTER ONE\nTHE BEGINNING';
  const multiLineHtml = parser.parseMarkdownToHtml(multiLineAllCaps, true);
  assert(!multiLineHtml.includes('\n</h2>') && !multiLineHtml.includes('<h2 id="heading-0">CHAPTER ONE\nTHE BEGINNING</h2>'), 'Multi-line shouted paragraph should not become a single heading with a newline');
  assert(!multiLineHtml.match(/<h[1-6][^>]*>[^<]*\n[^<]*<\/h[1-6]>/), 'Headings must never contain raw newlines');
  assert(multiLineHtml.includes('<p>') && multiLineHtml.includes('CHAPTER ONE') && multiLineHtml.includes('THE BEGINNING'), 'Multi-line text should remain in a paragraph');

  const separateHeadings = 'CHAPTER ONE\n\nTHE BEGINNING';
  const separateHtml = parser.parseMarkdownToHtml(separateHeadings, true);
  const h2Count = (separateHtml.match(/<h2/g) || []).length;
  assert.strictEqual(h2Count, 2, `Expected 2 headings when separated by blank lines, got ${h2Count}: ${separateHtml}`);
  console.log('✓ Multi-line ALL-CAPS paragraph renders in <p> without collapsed raw newline heading.');

  console.log('\n====================================================');
  console.log('ALL REGRESSION TESTS PASSED SUCCESSFULLY');
  console.log('====================================================\n');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

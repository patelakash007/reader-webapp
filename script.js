(function () {
  'use strict';

  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
  const MAX_PDF_PAGES = 500;
  const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'pdf', 'docx']);
  const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown']);

  const els = {
    inputView: document.getElementById('inputView'),
    readerView: document.getElementById('readerView'),
    readerContent: document.getElementById('readerContent'),
    pasteArea: document.getElementById('pasteArea'),
    readBtn: document.getElementById('readBtn'),
    fileInput: document.getElementById('fileInput'),
    clearBtn: document.getElementById('clearBtn'),
    loader: document.getElementById('loader'),
    loaderText: document.querySelector('.loader-text'),
    toolbar: document.getElementById('toolbar'),
    backBtn: document.getElementById('backBtn'),
    wordCount: document.getElementById('wordCount'),
    focusRestore: document.getElementById('focusRestore'),
    presetTrack: document.getElementById('presetTrack'),
    presetDots: document.getElementById('presetDots'),
    presetWindow: document.getElementById('presetWindow'),
    modeLight: document.getElementById('modeLight'),
    modeDark: document.getElementById('modeDark'),
    focusBtn: document.getElementById('focusBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    autoScrollBtn: document.getElementById('autoScrollBtn'),
    ttsBtn: document.getElementById('ttsBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    editBtn: document.getElementById('editBtn'),
    arrowLeft: document.getElementById('arrowLeft'),
    arrowRight: document.getElementById('arrowRight'),
    progressBar: document.getElementById('progressBar'),
    statusMessage: document.getElementById('statusMessage'),
    readerStatusMessage: document.getElementById('readerStatusMessage'),
    tocDialog: document.getElementById('tocDialog'),
    closeTocBtn: document.getElementById('closeTocBtn'),
    tocBody: document.getElementById('tocBody'),
    tocBtn: document.getElementById('tocBtn'),
    rulerBtn: document.getElementById('rulerBtn'),
    readingRuler: document.getElementById('readingRuler'),
    settingsDrawer: document.getElementById('settingsDrawer'),
    settingsSections: Array.from(document.querySelectorAll('[data-settings-section]')),
    settingsSectionToggles: Array.from(document.querySelectorAll('.settings-section-toggle')),
    themeSettingsSummary: document.getElementById('themeSettingsSummary'),
    voiceSelect: document.getElementById('voiceSelect'),
    voiceRateInput: document.getElementById('voiceRateInput'),
    voiceRateVal: document.getElementById('voiceRateVal'),
    scrollSpeedInput: document.getElementById('scrollSpeedInput'),
    scrollSpeedVal: document.getElementById('scrollSpeedVal'),
    lineHeightInput: document.getElementById('lineHeightInput'),
    letterSpacingInput: document.getElementById('letterSpacingInput'),
    marginInput: document.getElementById('marginInput'),
    smartHeadingsInput: document.getElementById('smartHeadingsInput'),
    mobileFab: document.getElementById('mobileFab'),
    sheetBackdrop: document.getElementById('sheetBackdrop'),
    bottomSheetHandle: document.getElementById('bottomSheetHandle'),
    editingBanner: document.getElementById('editingBanner'),
    saveEditBannerBtn: document.getElementById('saveEditBannerBtn'),
    gestureHint: document.getElementById('gestureHint'),
    gestureHintText: document.getElementById('gestureHintText')
  };

  const state = {
    session: {
      documents: new Map(),
      order: [],
      activeId: null,
      generation: 0
    },
    progressFrame: 0,
    progressDirty: false,
    speaking: false,
    speechGeneration: 0,
    utterance: null,
    speechQueue: [],
    autoScroll: false,
    autoScrollFrame: 0,
    autoScrollSpeed: 0.04,
    focusMode: false,
    fullscreen: false,
    ruler: false,
    editing: false,
    editWasSaved: false,
    tocLastFocus: null,
    currentPresetIndex: 0,
    currentMode: 'light',
    activeParserTask: null,
    drag: null
  };

  const PRESETS = [
    { name: 'Claude', font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', theme: 'claude', desc: 'Clean warm reading' },
    { name: 'Zen', font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', theme: 'zen', desc: 'Pure minimal white' },
    { name: 'Stark', font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', theme: 'stark', desc: 'Bold high contrast' },
    { name: 'Book', font: 'Georgia, "Times New Roman", serif', theme: 'paper', desc: 'Long-form book feel' },
    { name: 'Kindle', font: 'Georgia, "Times New Roman", serif', theme: 'kindle', desc: 'Warm e-ink style' },
    { name: 'Notion', font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', theme: 'notion', desc: 'Crisp workspace' },
    { name: 'GitHub', font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', theme: 'github', desc: 'Technical reading' },
    { name: 'Nord', font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', theme: 'nord', desc: 'Cool dark focus' }
  ];

  function safeText(value) {
    return typeof value === 'string' ? value : '';
  }

  function setStatus(message, type = 'info') {
    for (const target of [els.statusMessage, els.readerStatusMessage]) {
      if (!target) continue;
      target.textContent = message || '';
      target.className = target === els.readerStatusMessage
        ? `status-message reader-status-message${message ? ` show ${type}` : ''}`
        : `status-message${message ? ` show ${type}` : ''}`;
    }
  }

  function clearStatus() { setStatus(''); }

  function showLoader(message) {
    if (!els.loader) return;
    els.loader.classList.add('active');
    if (els.loaderText) els.loaderText.textContent = message || 'Loading text...';
  }

  function hideLoader() { els.loader?.classList.remove('active'); }

  function extensionOf(name) {
    const match = /\.([^.]+)$/.exec(String(name || '').toLowerCase());
    return match ? match[1] : '';
  }

  function sourceTypeForExtension(ext) {
    if (ext === 'pdf') return 'PDF';
    if (ext === 'docx') return 'DOCX';
    if (ext === 'md' || ext === 'markdown') return 'Markdown';
    return 'TXT';
  }

  function normalizeDisplayName(name) {
    const base = String(name || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim();
    return base || 'Untitled';
  }

  function uniqueDisplayName(name) {
    const clean = normalizeDisplayName(name);
    const existing = new Set(state.session.order.map(id => state.session.documents.get(id)?.displayName));
    if (!existing.has(clean)) return clean;
    const dot = clean.lastIndexOf('.');
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : '';
    let i = 2;
    let candidate = `${stem} (${i})${ext}`;
    while (existing.has(candidate)) {
      i += 1;
      candidate = `${stem} (${i})${ext}`;
    }
    return candidate;
  }

  function wordCount(text) {
    const matches = String(text || '').match(/\S+/g);
    return matches ? matches.length : 0;
  }

  function charCount(text) { return String(text || '').length; }

  function estimateMinutes(words) { return Math.max(1, Math.round((words || 0) / 220)); }

  function slugifyHeading(text, index) {
    const slug = String(text || '').toLowerCase().trim().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '-').slice(0, 60) || `section-${index + 1}`;
    return `${slug}-${index + 1}`;
  }

  function inlineTokens(text) {
    const out = [];
    const source = String(text || '');
    let i = 0;
    while (i < source.length) {
      if (source[i] === '`') {
        const end = source.indexOf('`', i + 1);
        if (end > i) {
          out.push({ type: 'code', text: source.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }
      if (source[i] === '[') {
        const close = source.indexOf(']', i + 1);
        const openParen = close >= 0 ? source.indexOf('(', close + 1) : -1;
        const closeParen = openParen >= 0 ? source.indexOf(')', openParen + 1) : -1;
        if (close > i && openParen === close + 1 && closeParen > openParen) {
          const label = source.slice(i + 1, close);
          const href = source.slice(openParen + 1, closeParen).trim();
          if (/^https:\/\//i.test(href)) out.push({ type: 'link', text: label, href });
          else out.push({ type: 'text', text: source.slice(i, closeParen + 1) });
          i = closeParen + 1;
          continue;
        }
      }
      const strong = source.startsWith('**', i) || source.startsWith('__', i);
      if (strong) {
        const marker = source.slice(i, i + 2);
        const end = source.indexOf(marker, i + 2);
        if (end > i + 2) {
          out.push({ type: 'strong', children: inlineTokens(source.slice(i + 2, end)) });
          i = end + 2;
          continue;
        }
      }
      if (source[i] === '*' || source[i] === '_') {
        const marker = source[i];
        const end = source.indexOf(marker, i + 1);
        if (end > i + 1) {
          out.push({ type: 'em', children: inlineTokens(source.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
      let j = i + 1;
      while (j < source.length && !['`', '[', '*', '_'].includes(source[j])) j += 1;
      out.push({ type: 'text', text: source.slice(i, j) });
      i = j;
    }
    return out;
  }

  function parseMarkdown(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    const headings = [];
    let paragraph = [];
    let list = null;
    let code = null;
    let quote = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      blocks.push({ type: 'paragraph', tokens: inlineTokens(paragraph.join('\n')), text: paragraph.join('\n') });
      paragraph = [];
    }
    function flushList() {
      if (!list) return;
      blocks.push(list);
      list = null;
    }
    function flushQuote() {
      if (!quote.length) return;
      blocks.push({ type: 'quote', text: quote.join('\n'), tokens: inlineTokens(quote.join('\n')) });
      quote = [];
    }

    for (let line of lines) {
      if (code) {
        if (/^\s*```\s*$/.test(line)) {
          blocks.push({ type: 'code', text: code.join('\n') });
          code = null;
        } else code.push(line);
        continue;
      }
      if (/^\s*```/.test(line)) {
        flushParagraph(); flushList(); flushQuote(); code = [];
        continue;
      }
      const heading = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
      if (heading) {
        flushParagraph(); flushList(); flushQuote();
        const level = heading[1].length;
        const textValue = heading[2].trim();
        const id = slugifyHeading(textValue, headings.length);
        const block = { type: 'heading', level, text: textValue, tokens: inlineTokens(textValue), id };
        blocks.push(block); headings.push({ id, level, text: textValue });
        continue;
      }
      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
        flushParagraph(); flushList(); flushQuote(); blocks.push({ type: 'hr' }); continue;
      }
      const quoteMatch = /^\s*>\s?(.*)$/.exec(line);
      if (quoteMatch) { flushParagraph(); flushList(); quote.push(quoteMatch[1]); continue; }
      if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue; }
      const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
      const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
      if (unordered || ordered) {
        flushParagraph(); flushQuote();
        const orderedType = Boolean(ordered);
        const itemText = ordered ? ordered[2] : unordered[1];
        if (!list || list.ordered !== orderedType) { flushList(); list = { type: 'list', ordered: orderedType, items: [] }; }
        list.items.push({ text: itemText, tokens: inlineTokens(itemText) });
        continue;
      }
      flushList(); flushQuote(); paragraph.push(line);
    }
    if (code) blocks.push({ type: 'code', text: code.join('\n') });
    flushParagraph(); flushList(); flushQuote();
    return { blocks, headings };
  }

  function parsePlainText(text, smartHeadings = true) {
    const normalized = String(text || '').replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const blocks = [];
    const headings = [];
    let paragraph = [];
    const flush = () => {
      if (!paragraph.length) return;
      blocks.push({ type: 'paragraph', tokens: inlineTokens(paragraph.join('\n')), text: paragraph.join('\n') });
      paragraph = [];
    };
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) { flush(); return; }
      if (smartHeadings && trimmed.length <= 100 && !/[.!?]$/.test(trimmed) && (trimmed === trimmed.toUpperCase() || /^[A-Z][A-Za-z0-9&'’:-]*(?:\s+[A-Z0-9][A-Za-z0-9&'’:-]*){0,7}$/.test(trimmed))) {
        flush();
        const id = slugifyHeading(trimmed, headings.length);
        blocks.push({ type: 'heading', level: 2, text: trimmed, tokens: inlineTokens(trimmed), id });
        headings.push({ id, level: 2, text: trimmed });
        return;
      }
      paragraph.push(line);
    });
    flush();
    return { blocks, headings };
  }

  function renderTokens(tokens, parent) {
    for (const token of tokens || []) {
      if (token.type === 'text') parent.appendChild(document.createTextNode(token.text));
      else if (token.type === 'code') { const el = document.createElement('code'); el.textContent = token.text; parent.appendChild(el); }
      else if (token.type === 'strong') { const el = document.createElement('strong'); renderTokens(token.children, el); parent.appendChild(el); }
      else if (token.type === 'em') { const el = document.createElement('em'); renderTokens(token.children, el); parent.appendChild(el); }
      else if (token.type === 'link') { const a = document.createElement('a'); a.textContent = token.text; a.href = token.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.appendChild(a); }
    }
  }

  function renderBlocks(doc) {
    els.readerContent.replaceChildren();
    for (const block of doc.safe.blocks) {
      let element;
      if (block.type === 'heading') {
        element = document.createElement(`h${Math.min(3, Math.max(1, block.level))}`);
        element.id = block.id;
        element.dataset.headingId = block.id;
      } else if (block.type === 'paragraph') element = document.createElement('p');
      else if (block.type === 'quote') element = document.createElement('blockquote');
      else if (block.type === 'hr') element = document.createElement('hr');
      else if (block.type === 'code') { element = document.createElement('pre'); const code = document.createElement('code'); code.textContent = block.text; element.appendChild(code); }
      else if (block.type === 'list') {
        element = document.createElement(block.ordered ? 'ol' : 'ul');
        for (const item of block.items) { const li = document.createElement('li'); renderTokens(item.tokens, li); element.appendChild(li); }
      }
      if (element && block.tokens) renderTokens(block.tokens, element);
      if (element) els.readerContent.appendChild(element);
    }
    els.readerContent.setAttribute('aria-busy', 'false');
    updateProgressDisplay();
  }

  function makeSafeRepresentation(text, format) {
    const sourceText = safeText(text);
    const parsed = format === 'markdown' ? parseMarkdown(sourceText) : parsePlainText(sourceText, els.smartHeadingsInput?.checked !== false);
    const words = wordCount(sourceText);
    return {
      kind: 'structured-text-v1',
      format,
      sourceText,
      blocks: parsed.blocks,
      headings: parsed.headings,
      wordCount: words,
      charCount: charCount(sourceText)
    };
  }

  function makeDocument({ id, displayName, sourceType, format, text, parseStatus = 'active', error = null }) {
    const safe = makeSafeRepresentation(text, format);
    return {
      id, displayName, sourceType, parseStatus, error,
      safe,
      createdAt: Date.now(),
      progress: { ratio: 0, headingId: safe.headings[0]?.id || null, updatedAt: Date.now() },
      lifecycle: 'active',
      lastVisibleHeading: safe.headings[0]?.id || null,
      cleanup: []
    };
  }

  function createId() {
    return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function activeDocument() { return state.session.activeId ? state.session.documents.get(state.session.activeId) : null; }

  function cancelParserTask() {
    const task = state.activeParserTask;
    state.activeParserTask = null;
    if (task?.cancel) { try { task.cancel(); } catch (_) {} }
    if (task?.abort) { try { task.abort(); } catch (_) {} }
  }

  function beginIngestionGeneration() {
    state.session.generation += 1;
    cancelParserTask();
    return state.session.generation;
  }

  function isCurrentGeneration(generation) { return generation === state.session.generation; }

  function enforceTextLimit(text, context) {
    if (String(text || '').length > MAX_EXTRACTED_TEXT_CHARS) throw new Error(`This ${context} contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
    return text;
  }

  function loadLocalLibrary(name) {
    return new Promise((resolve, reject) => {
      if (name === 'pdf' && window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; resolve(window.pdfjsLib); return; }
      if (name === 'mammoth' && window.mammoth) { resolve(window.mammoth); return; }
      const src = name === 'pdf' ? 'vendor/pdf.min.js' : 'vendor/mammoth.browser.min.js';
      const existing = document.querySelector(`script[data-reader-parser="${name}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(name === 'pdf' ? window.pdfjsLib : window.mammoth), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load local parser library ${name}.`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.readerParser = name;
      script.onload = () => {
        const lib = name === 'pdf' ? window.pdfjsLib : window.mammoth;
        if (!lib) reject(new Error(`Local parser library ${name} loaded but did not initialize.`));
        else { if (name === 'pdf') lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; resolve(lib); }
      };
      script.onerror = () => reject(new Error(`Failed to load local parser library ${name} from ${src}.`));
      document.head.appendChild(script);
    });
  }

  async function readFileText(file, extension, generation) {
    if (file.size === 0) throw new Error(`“${normalizeDisplayName(file.name)}” is empty. Choose a file with readable content.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`“${normalizeDisplayName(file.name)}” is too large. File limit is 15 MiB.`);
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error(`Unsupported format “.${extension || 'unknown'}”. Use TXT, Markdown, PDF, or DOCX.`);
    if (!isCurrentGeneration(generation)) throw new Error('Stale file read ignored.');

    if (TEXT_EXTENSIONS.has(extension)) {
      const text = await file.text();
      if (!isCurrentGeneration(generation)) throw new Error('Stale file read ignored.');
      return { text: enforceTextLimit(text, 'text file'), format: extension === 'txt' ? 'text' : 'markdown' };
    }

    const buffer = await file.arrayBuffer();
    if (!isCurrentGeneration(generation)) throw new Error('Stale file read ignored.');

    if (extension === 'pdf') {
      const pdfjs = await loadLocalLibrary('pdf');
      if (!isCurrentGeneration(generation)) throw new Error('Stale file read ignored.');
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      state.activeParserTask = loadingTask;
      try {
        const pdf = await loadingTask.promise;
        state.activeParserTask = pdf;
        if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages. The browser reader limit is ${MAX_PDF_PAGES} pages.`);
        const pages = [];
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
          if (!isCurrentGeneration(generation)) throw new Error('Stale file read ignored.');
          const page = await pdf.getPage(pageNo);
          const content = await page.getTextContent();
          pages.push(content.items.map(item => safeText(item.str)).join(' '));
          if (pages.join('\n').length > MAX_EXTRACTED_TEXT_CHARS) throw new Error(`This PDF contains too much extracted text. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
        }
        try { await pdf.destroy(); } catch (_) {}
        return { text: pages.join('\n\n'), format: 'text' };
      } catch (error) {
        try { loadingTask.destroy(); } catch (_) {}
        if (/InvalidPDFException|MissingPDFException|UnexpectedResponseException|FormatError/i.test(error?.name || error?.message || '')) throw new Error('The PDF could not be parsed. The file may be malformed or unsupported.');
        throw error;
      } finally {
        if (state.activeParserTask === loadingTask) state.activeParserTask = null;
      }
    }

    const mammoth = await loadLocalLibrary('mammoth');
    if (!isCurrentGeneration(generation)) throw new Error('Stale file read ignored.');
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      if (!result || !String(result.value || '').trim()) throw new Error('The DOCX contains no readable text.');
      return { text: enforceTextLimit(result.value, 'DOCX'), format: 'text' };
    } catch (error) {
      throw new Error(error?.message?.includes('DOCX') ? error.message : 'The DOCX could not be parsed. The file may be malformed or unsupported.');
    }
  }

  function showReader() {
    els.inputView?.classList.add('hidden');
    els.readerView?.classList.add('active');
    els.backBtn?.classList.add('show');
    els.mobileFab?.classList.add('reader-active');
    clearStatus();
  }

  function showInput() {
    closeMobileSheet();
    stopSpeaking('leave-reader');
    exitFocusMode();
    stopAutoScroll();
    els.readerView?.classList.remove('active');
    els.inputView?.classList.remove('hidden');
    els.backBtn?.classList.remove('show');
    els.focusRestore?.classList.remove('show');
    els.mobileFab?.classList.remove('reader-active', 'active');
    document.body.classList.remove('mobile-sheet-active');
    clearStatus();
  }

  function activateDocument(id, options = {}) {
    const doc = state.session.documents.get(id);
    if (!doc || doc.lifecycle === 'removed') return;
    const previous = activeDocument();
    if (previous && previous.id !== doc.id) saveProgress(previous);
    stopSpeaking('document-switch');
    stopAutoScroll();
    state.session.activeId = id;
    renderBlocks(doc);
    updateDocumentSummary();
    updateQueue();
    updateProgressDisplay();
    showReader();
    requestAnimationFrame(() => restoreProgress(doc, options.focusHeading));
  }

  function addDocument(doc) {
    state.session.documents.set(doc.id, doc);
    state.session.order.push(doc.id);
    updateQueue();
    updateDocumentSummary();
    if (!state.session.activeId) activateDocument(doc.id);
    else showStatus(`Added “${doc.displayName}” to the temporary session.`, 'success');
  }

  function removeDocument(id) {
    const doc = state.session.documents.get(id);
    if (!doc) return;
    stopSpeaking('document-remove');
    for (const cleanup of doc.cleanup || []) { try { cleanup(); } catch (_) {} }
    doc.lifecycle = 'removed';
    state.session.documents.delete(id);
    state.session.order = state.session.order.filter(item => item !== id);
    if (state.session.activeId === id) {
      state.session.activeId = state.session.order[0] || null;
      if (state.session.activeId) activateDocument(state.session.activeId);
      else showInput();
    }
    updateQueue();
    updateDocumentSummary();
  }

  function clearSession() {
    beginIngestionGeneration();
    stopSpeaking('clear-session');
    stopAutoScroll();
    for (const id of state.session.order) {
      const doc = state.session.documents.get(id);
      for (const cleanup of doc?.cleanup || []) { try { cleanup(); } catch (_) {} }
    }
    state.session.documents.clear();
    state.session.order = [];
    state.session.activeId = null;
    els.readerContent?.replaceChildren();
    els.pasteArea && (els.pasteArea.value = '');
    if (els.clearBtn) els.clearBtn.style.display = 'none';
    showInput();
    updateQueue();
    updateDocumentSummary();
    setStatus('Temporary session cleared. Nothing was saved by the app.', 'success');
  }

  function updateDocumentSummary() {
    if (els.clearBtn) els.clearBtn.style.display = state.session.order.length ? 'inline-flex' : 'none';
    const count = state.session.order.length;
    if (!els.wordCount) return;
    const doc = activeDocument();
    if (!doc) { els.wordCount.textContent = ''; return; }
    const totalWords = state.session.order.reduce((sum, id) => sum + (state.session.documents.get(id)?.safe.wordCount || 0), 0);
    const totalMinutes = estimateMinutes(totalWords);
    els.wordCount.textContent = `${doc.safe.wordCount.toLocaleString()} words · ${doc.safe.charCount.toLocaleString()} chars · ${count} document${count === 1 ? '' : 's'} in session · ~${totalMinutes} min total reading time`;
  }

  function updateProgressDisplay() {
    const doc = activeDocument();
    const pct = doc ? Math.max(0, Math.min(100, Math.round(doc.progress.ratio * 100))) : 0;
    if (els.progressBar) els.progressBar.style.width = `${pct}%`;
    for (const item of document.querySelectorAll('[data-session-progress]')) item.textContent = `~${pct}% read`;
  }

  function saveProgress(doc) {
    if (!doc || state.progressFrame) return;
    const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.max(0, Math.min(1, scrollTop / maxScroll));
    const heading = nearestVisibleHeading();
    doc.progress = { ratio: Math.round(ratio * 100) / 100, headingId: heading?.id || doc.lastVisibleHeading || null, updatedAt: Date.now() };
    doc.lastVisibleHeading = doc.progress.headingId;
  }

  function nearestVisibleHeading() {
    const doc = activeDocument();
    if (!doc || !doc.safe.headings.length) return null;
    const headings = Array.from(els.readerContent.querySelectorAll('h1,h2,h3[data-heading-id], h3')).filter(el => el.dataset.headingId);
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const el of headings) {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - 120);
      if (rect.bottom >= 0 && distance < bestDistance) { best = { id: el.dataset.headingId, text: el.textContent || '' }; bestDistance = distance; }
    }
    return best;
  }

  function restoreProgress(doc, focusHeading) {
    const ratio = Math.max(0, Math.min(1, doc.progress?.ratio || 0));
    const targetHeading = focusHeading || doc.progress?.headingId;
    if (targetHeading) {
      const heading = document.getElementById(targetHeading);
      if (heading) { heading.scrollIntoView({ block: 'start' }); updateProgressDisplay(); return; }
    }
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.round(maxScroll * ratio), behavior: 'auto' });
    updateProgressDisplay();
  }

  function queueProgressUpdate() {
    state.progressDirty = true;
    if (state.progressFrame) return;
    state.progressFrame = requestAnimationFrame(() => {
      state.progressFrame = 0;
      if (!state.progressDirty) return;
      state.progressDirty = false;
      const doc = activeDocument();
      if (doc) saveProgress(doc);
      updateProgressDisplay();
      updateQueue();
    });
  }

  function progressText(doc) {
    return `~${Math.round(Math.max(0, Math.min(1, doc.progress.ratio)) * 100)}% read`;
  }

  function queueButton(doc) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `session-doc${doc.id === state.session.activeId ? ' active' : ''}`;
    button.dataset.sessionDocId = doc.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', doc.id === state.session.activeId ? 'true' : 'false');
    button.tabIndex = doc.id === state.session.activeId ? 0 : -1;
    button.innerHTML = '';
    const name = document.createElement('span'); name.className = 'session-doc-name'; name.textContent = doc.displayName;
    const meta = document.createElement('span'); meta.className = 'session-doc-meta'; meta.textContent = `${doc.sourceType} · ${doc.safe.wordCount.toLocaleString()} words`;
    const status = document.createElement('span'); status.className = 'session-doc-progress'; status.textContent = doc.parseStatus === 'error' ? 'Error' : progressText(doc);
    button.append(name, meta, status);
    button.addEventListener('click', () => activateDocument(doc.id));
    button.addEventListener('keydown', event => handleQueueKeydown(event, doc.id));
    return button;
  }

  function handleQueueKeydown(event, id) {
    const ids = state.session.order;
    const index = ids.indexOf(id);
    let next = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = ids[Math.min(ids.length - 1, index + 1)];
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = ids[Math.max(0, index - 1)];
    else if (event.key === 'Home') next = ids[0];
    else if (event.key === 'End') next = ids[ids.length - 1];
    else return;
    event.preventDefault();
    const el = document.querySelector(`[data-session-doc-id="${CSS.escape(next)}"]`);
    el?.focus();
    if (next && next !== state.session.activeId) activateDocument(next);
  }

  function renderQueueInto(container) {
    if (!container) return;
    container.replaceChildren();
    const list = document.createElement('div');
    list.className = 'session-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Temporary reading session documents');
    if (!state.session.order.length) {
      const empty = document.createElement('p'); empty.className = 'session-empty'; empty.textContent = 'No documents yet. Add pasted text or local TXT, Markdown, PDF, or DOCX files.'; list.appendChild(empty);
    } else {
      for (const id of state.session.order) list.appendChild(queueButton(state.session.documents.get(id)));
    }
    container.appendChild(list);
  }

  function updateQueue() {
    const desktopList = document.getElementById('sessionDesktopList');
    const mobileList = document.getElementById('sessionMobileList');
    renderQueueInto(desktopList);
    renderQueueInto(mobileList);
    const count = state.session.order.length;
    for (const el of document.querySelectorAll('[data-session-count]')) el.textContent = `${count} document${count === 1 ? '' : 's'}`;
    const totalWords = state.session.order.reduce((sum, id) => sum + (state.session.documents.get(id)?.safe.wordCount || 0), 0);
    for (const el of document.querySelectorAll('[data-session-total-words]')) el.textContent = `${totalWords.toLocaleString()} words total · ~${estimateMinutes(totalWords)} min`;
    for (const el of document.querySelectorAll('[data-session-active]')) el.textContent = activeDocument()?.displayName || 'None';
    updateProgressDisplay();
  }

  function injectSessionUi() {
    const old = document.getElementById('localSessionUi');
    if (old) return;
    const style = document.createElement('style');
    style.id = 'localSessionUiStyle';
    style.textContent = `
      #localSessionUi { display: contents; }
      .session-rail { position: fixed; top: 96px; right: 18px; width: min(290px, 24vw); max-height: calc(100vh - 128px); overflow: auto; padding: 14px; border: 1px solid rgba(154,53,36,.12); border-radius: 18px; background: var(--toolbar-bg); backdrop-filter: blur(18px); box-shadow: 0 10px 34px rgba(0,0,0,.07); z-index: 998; }
      .session-rail-title, .session-mobile-title { font-size: 14px; font-weight: 750; color: var(--text); margin: 0; }
      .session-privacy, .session-summary { margin-top: 6px; font-size: 11px; line-height: 1.45; color: var(--text2); }
      .session-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
      .session-doc { width: 100%; text-align: left; border: 1px solid rgba(154,53,36,.12); border-radius: 12px; background: color-mix(in srgb, var(--card) 75%, transparent); color: var(--text); padding: 10px 11px; cursor: pointer; display: grid; gap: 3px; }
      .session-doc.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
      .session-doc-name { font-size: 12.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .session-doc-meta, .session-doc-progress { font-size: 10.5px; color: var(--text2); }
      .session-action-row { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 10px; }
      .session-clear { min-height: 40px; border-radius: 10px; border: 1px solid rgba(185,28,28,.3); background: transparent; color: #b91c1c; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
      .session-mobile { display: none; }
      .session-empty { margin: 0; color: var(--text2); font-size: 11.5px; line-height: 1.5; }
      @media (max-width: 640px) {
        .session-rail { display: none; }
        .session-mobile { display: block; }
        .session-mobile-title { margin-bottom: 2px; }
      }
      @media (min-width: 641px) { #readerContent, .wordcount { margin-right: min(320px, 26vw); } }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement('div'); wrapper.id = 'localSessionUi';
    const rail = document.createElement('aside'); rail.className = 'session-rail'; rail.setAttribute('aria-label', 'Temporary reading session');
    rail.innerHTML = `<h2 class="session-rail-title">Reading desk</h2><div class="session-summary"><span data-session-count>0 documents</span> · <span data-session-total-words>0 words total · ~1 min</span></div><div class="session-privacy">Temporary session. Documents and reading state stay in memory only. Reloading, closing the browser, or clearing the session discards them.</div><div id="sessionDesktopList"></div><div class="session-action-row"><button class="session-clear" id="sessionClearDesktop" type="button">Clear session</button></div>`;
    wrapper.appendChild(rail);

    const mobile = document.createElement('section'); mobile.className = 'settings-section session-mobile'; mobile.dataset.settingsSection = 'session';
    mobile.innerHTML = `<button class="settings-section-toggle" type="button" aria-expanded="true" aria-controls="sessionSettingsPanel"><span><span class="settings-section-title">Reading desk</span><span class="settings-section-summary"><span data-session-count>0 documents</span> · temporary</span></span><span class="settings-section-chevron" aria-hidden="true"></span></button><div class="settings-section-panel" id="sessionSettingsPanel"><div class="settings-panel-inner"><div class="session-privacy">Documents, reading progress, and parser results stay in memory only. Nothing is put into localStorage, IndexedDB, the service-worker cache, URLs, analytics, or remote APIs.</div><div class="session-summary">Active: <strong data-session-active>None</strong><br><span data-session-total-words>0 words total · ~1 min</span></div><div id="sessionMobileList"></div><button class="session-clear" id="sessionClearMobile" type="button">Clear session</button></div></div>`;
    els.settingsDrawer?.insertBefore(mobile, els.settingsDrawer.firstElementChild);

    document.body.appendChild(wrapper);
    document.getElementById('sessionClearDesktop')?.addEventListener('click', clearSession);
    document.getElementById('sessionClearMobile')?.addEventListener('click', clearSession);
    updateQueue();
  }

  async function ingestText(text, displayName = 'Pasted text', sourceType = 'Pasted text', format = 'markdown') {
    const value = String(text || '');
    if (!value.trim()) { setStatus('There is no text to add. Paste some text first.', 'error'); return; }
    enforceTextLimit(value, 'pasted text');
    const doc = makeDocument({ id: createId(), displayName: uniqueDisplayName(displayName), sourceType, format, text: value });
    addDocument(doc);
    if (state.session.activeId !== doc.id) activateDocument(doc.id);
  }

  async function ingestFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const generation = beginIngestionGeneration();
    clearStatus();
    showLoader(files.length > 1 ? `Adding ${files.length} documents...` : `Reading ${files[0].name}...`);
    let added = 0;
    try {
      for (const file of files) {
        if (!isCurrentGeneration(generation)) return;
        const ext = extensionOf(file.name);
        try {
          const parsed = await readFileText(file, ext, generation);
          if (!isCurrentGeneration(generation)) return;
          const doc = makeDocument({ id: createId(), displayName: uniqueDisplayName(file.name), sourceType: sourceTypeForExtension(ext), format: parsed.format, text: parsed.text });
          addDocument(doc);
          added += 1;
        } catch (error) {
          if (!isCurrentGeneration(generation)) return;
          if (/Stale file read ignored/i.test(error?.message || '')) return;
          const status = `Could not open “${normalizeDisplayName(file.name)}”: ${error?.message || 'parser failure'}`;
          setStatus(status, 'error');
        }
      }
      if (added) setStatus(`Added ${added} document${added === 1 ? '' : 's'} to the temporary session.`, 'success');
      if (added && state.session.activeId) showReader();
    } finally {
      if (isCurrentGeneration(generation)) hideLoader();
      if (els.fileInput) els.fileInput.value = '';
    }
  }

  function setupInput() {
    if (els.fileInput) {
      els.fileInput.multiple = true;
      document.addEventListener('change', event => {
        if (event.target !== els.fileInput) return;
        event.preventDefault(); event.stopImmediatePropagation();
        ingestFiles(els.fileInput.files);
      }, true);
    }
    document.addEventListener('click', event => {
      if (event.target !== els.readBtn) return;
      event.preventDefault(); event.stopImmediatePropagation();
      ingestText(els.pasteArea?.value || '', 'Pasted text', 'Pasted text', 'markdown').catch(error => setStatus(error.message, 'error'));
    }, true);
    els.clearBtn?.addEventListener('click', clearSession);

    for (const type of ['dragenter', 'dragover']) document.addEventListener(type, event => { if (els.inputView && event.dataTransfer?.types?.includes('Files')) els.inputView.classList.add('drag-active'); });
    for (const type of ['dragleave', 'drop']) document.addEventListener(type, event => { if (els.inputView) els.inputView.classList.remove('drag-active'); });
    document.addEventListener('drop', event => {
      if (!els.inputView || !event.dataTransfer?.files?.length) return;
      if (els.inputView.classList.contains('hidden')) return;
      event.preventDefault(); event.stopPropagation(); ingestFiles(event.dataTransfer.files);
    }, true);
  }

  function setupSettings() {
    function resetMobileSections() {
      for (const section of els.settingsSections) {
        if (section.dataset.settingsSection === 'theme') setSectionOpen(section, true);
        else setSectionOpen(section, false);
      }
      const session = document.querySelector('[data-settings-section="session"]');
      if (session) setSectionOpen(session, true);
    }
    function setSectionOpen(section, open) {
      if (!section) return;
      section.classList.toggle('is-open', open);
      const toggle = section.querySelector('.settings-section-toggle');
      const panel = section.querySelector('.settings-section-panel');
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (panel) panel.hidden = !open;
    }
    for (const toggle of document.querySelectorAll('.settings-section-toggle')) {
      toggle.addEventListener('click', () => {
        const section = toggle.closest('.settings-section');
        setSectionOpen(section, !section.classList.contains('is-open'));
      });
    }
    resetMobileSections();

    els.lineHeightInput?.addEventListener('input', () => { els.readerContent.style.lineHeight = String(Number.parseFloat(els.lineHeightInput.value).toFixed(1)); });
    els.letterSpacingInput?.addEventListener('input', () => { els.readerContent.style.letterSpacing = `${Number.parseFloat(els.letterSpacingInput.value).toFixed(2)}em`; });
    els.marginInput?.addEventListener('input', () => { els.readerContent.style.paddingLeft = `${els.marginInput.value}px`; els.readerContent.style.paddingRight = `${els.marginInput.value}px`; });
    els.voiceRateInput?.addEventListener('input', () => { if (els.voiceRateVal) els.voiceRateVal.textContent = `${Number.parseFloat(els.voiceRateInput.value).toFixed(1)}x`; });
    els.scrollSpeedInput?.addEventListener('input', () => { state.autoScrollSpeed = Number.parseFloat(els.scrollSpeedInput.value) || 0.04; if (els.scrollSpeedVal) els.scrollSpeedVal.textContent = `${(state.autoScrollSpeed / 0.04).toFixed(1)}x`; });
    els.smartHeadingsInput?.addEventListener('change', () => {
      const doc = activeDocument(); if (!doc || doc.safe.format === 'markdown') return;
      doc.safe = makeSafeRepresentation(doc.safe.sourceText, doc.safe.format);
      renderBlocks(doc); updateQueue();
    });
  }

  function renderPresets() {
    if (!els.presetTrack || !els.presetDots) return;
    els.presetTrack.replaceChildren(); els.presetDots.replaceChildren();
    PRESETS.forEach((preset, index) => {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'preset-card'; card.dataset.index = String(index); card.innerHTML = '';
      const name = document.createElement('span'); name.className = 'preset-name'; name.textContent = preset.name;
      const desc = document.createElement('span'); desc.className = 'preset-desc'; desc.textContent = preset.desc;
      card.append(name, desc);
      card.addEventListener('click', () => applyPreset(index));
      els.presetTrack.appendChild(card);
      const dot = document.createElement('span'); dot.className = `preset-dot${index === 0 ? ' active' : ''}`; els.presetDots.appendChild(dot);
    });
    applyPreset(0);
  }

  function applyPreset(index) {
    const safeIndex = Math.max(0, Math.min(PRESETS.length - 1, index));
    state.currentPresetIndex = safeIndex;
    const preset = PRESETS[safeIndex];
    for (const className of Array.from(document.body.classList)) if (className.startsWith('theme-')) document.body.classList.remove(className);
    document.body.classList.add(`theme-${preset.theme}`);
    els.readerContent.style.fontFamily = preset.font;
    if (els.presetTrack) els.presetTrack.style.transform = `translate3d(-${safeIndex * 100}%,0,0)`;
    for (const dot of document.querySelectorAll('.preset-dot')) dot.classList.toggle('active', Number(dot.dataset.index) === safeIndex);
    if (els.presetWindow) els.presetWindow.setAttribute('aria-label', `Reading preset carousel, ${preset.name}`);
    if (els.themeSettingsSummary) els.themeSettingsSummary.textContent = `${preset.name}, ${state.currentMode === 'dark' ? 'Dark' : 'Light'}`;
  }

  function setupPresetGestures() {
    const windowEl = els.presetWindow;
    if (!windowEl) return;
    const track = els.presetTrack;
    windowEl.addEventListener('mousedown', event => { state.drag = { startX: event.clientX, index: state.currentPresetIndex, moved: false }; track?.classList.add('dragging'); });
    window.addEventListener('mousemove', event => { if (!state.drag) return; const dx = event.clientX - state.drag.startX; if (Math.abs(dx) > 8) state.drag.moved = true; if (track) track.style.transform = `translate3d(calc(-${state.drag.index * 100}% + ${dx}px),0,0)`; });
    window.addEventListener('mouseup', event => { if (!state.drag) return; const dx = event.clientX - state.drag.startX; const moved = state.drag.moved; const startIndex = state.drag.index; state.drag = null; track?.classList.remove('dragging'); if (moved) { let next = startIndex; if (dx < -60) next += 1; if (dx > 60) next -= 1; applyPreset(next); } else applyPreset(startIndex); });
    els.arrowLeft?.addEventListener('click', () => applyPreset(state.currentPresetIndex - 1));
    els.arrowRight?.addEventListener('click', () => applyPreset(state.currentPresetIndex + 1));
  }

  function setupModeAndTypography() {
    function setMode(mode) {
      state.currentMode = mode;
      els.modeLight?.classList.toggle('active', mode === 'light'); els.modeLight?.setAttribute('aria-pressed', mode === 'light' ? 'true' : 'false');
      els.modeDark?.classList.toggle('active', mode === 'dark'); els.modeDark?.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
      document.body.classList.toggle('reader-force-dark', mode === 'dark');
      if (mode === 'dark' && !document.body.classList.contains('theme-dark')) document.body.classList.add('theme-dark');
      if (els.themeSettingsSummary) els.themeSettingsSummary.textContent = `${PRESETS[state.currentPresetIndex].name}, ${mode === 'dark' ? 'Dark' : 'Light'}`;
    }
    els.modeLight?.addEventListener('click', () => setMode('light'));
    els.modeDark?.addEventListener('click', () => setMode('dark'));
    for (const button of document.querySelectorAll('.tb-btn[data-size]')) button.addEventListener('click', () => {
      const size = button.dataset.size;
      els.readerContent.classList.remove('fs-small', 'fs-medium', 'fs-large', 'fs-xl');
      els.readerContent.classList.add(`fs-${size}`);
      for (const item of document.querySelectorAll('.tb-btn[data-size]')) item.classList.toggle('active', item === button);
      for (const item of document.querySelectorAll('.tb-btn[data-size]')) item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
    });
  }

  function stopSpeaking(reason = 'stop') {
    state.speechGeneration += 1;
    state.speaking = false;
    state.utterance = null;
    state.speechQueue = [];
    try { window.speechSynthesis?.cancel(); } catch (_) {}
    if (els.ttsBtn) { els.ttsBtn.classList.remove('active'); els.ttsBtn.setAttribute('aria-pressed', 'false'); els.ttsBtn.title = 'Start Read Aloud'; els.ttsBtn.setAttribute('aria-label', 'Start Read Aloud'); }
    if (reason) updateProgressDisplay();
  }

  function speechTextForDocument(doc) {
    const temp = document.createElement('div');
    for (const block of doc.safe.blocks) {
      if (block.type === 'code') temp.appendChild(document.createTextNode(`${block.text}\n`));
      else if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') temp.appendChild(document.createTextNode(`${block.text}\n`));
      else if (block.type === 'list') block.items.forEach(item => temp.appendChild(document.createTextNode(`${item.text}\n`)));
    }
    return temp.textContent || '';
  }

  function speakCurrentDocument() {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') { setStatus('Read Aloud is not available in this browser.', 'error'); return; }
    const doc = activeDocument(); if (!doc) return;
    stopSpeaking('restart');
    const generation = state.speechGeneration;
    const chunks = speechTextForDocument(doc).match(/.{1,1800}(?:\s|$)/g) || [];
    if (!chunks.length) { setStatus('There is no readable text in the active document.', 'error'); return; }
    state.speaking = true;
    els.ttsBtn?.classList.add('active'); els.ttsBtn?.setAttribute('aria-pressed', 'true'); els.ttsBtn?.setAttribute('aria-label', 'Stop Read Aloud'); els.ttsBtn && (els.ttsBtn.title = 'Stop Read Aloud');
    let index = 0;
    const speakNext = () => {
      if (!state.speaking || generation !== state.speechGeneration || doc.id !== state.session.activeId) return;
      if (index >= chunks.length) { stopSpeaking('complete'); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      state.utterance = utterance;
      utterance.rate = Number.parseFloat(els.voiceRateInput?.value || '1') || 1;
      const voice = els.voiceSelect?.selectedOptions?.[0];
      if (voice?.dataset?.voiceUri && 'speechSynthesis' in window) {
        const found = speechSynthesis.getVoices().find(item => item.voiceURI === voice.dataset.voiceUri); if (found) utterance.voice = found;
      }
      utterance.onend = () => { if (generation !== state.speechGeneration) return; index += 1; speakNext(); };
      utterance.onerror = () => { if (generation !== state.speechGeneration) return; stopSpeaking('error'); setStatus('Read Aloud stopped because the browser speech engine reported an error.', 'error'); };
      window.speechSynthesis.speak(utterance);
    };
    speakNext();
  }

  function setupSpeech() {
    function populateVoices() {
      if (!els.voiceSelect || !('speechSynthesis' in window)) return;
      const voices = speechSynthesis.getVoices();
      els.voiceSelect.replaceChildren();
      voices.forEach(voice => { const option = document.createElement('option'); option.textContent = `${voice.name}${voice.lang ? ` (${voice.lang})` : ''}`; option.dataset.voiceUri = voice.voiceURI; els.voiceSelect.appendChild(option); });
      if (!voices.length) { const option = document.createElement('option'); option.textContent = 'Browser default'; els.voiceSelect.appendChild(option); }
    }
    populateVoices(); window.speechSynthesis?.addEventListener?.('voiceschanged', populateVoices);
    els.ttsBtn?.addEventListener('click', () => { if (state.speaking) stopSpeaking('user-stop'); else speakCurrentDocument(); });
  }

  function startAutoScroll() {
    if (state.autoScroll) return;
    state.autoScroll = true;
    els.autoScrollBtn?.classList.add('active'); els.autoScrollBtn?.setAttribute('aria-pressed', 'true');
    let last = performance.now();
    const tick = now => {
      if (!state.autoScroll) return;
      const delta = now - last; last = now;
      window.scrollBy(0, delta * state.autoScrollSpeed);
      state.autoScrollFrame = requestAnimationFrame(tick);
    };
    state.autoScrollFrame = requestAnimationFrame(tick);
  }

  function stopAutoScroll() {
    if (!state.autoScroll) return;
    state.autoScroll = false;
    cancelAnimationFrame(state.autoScrollFrame); state.autoScrollFrame = 0;
    els.autoScrollBtn?.classList.remove('active'); els.autoScrollBtn?.setAttribute('aria-pressed', 'false');
  }

  function setupReaderTools() {
    els.autoScrollBtn?.addEventListener('click', () => state.autoScroll ? stopAutoScroll() : startAutoScroll());
    els.rulerBtn?.addEventListener('click', () => { state.ruler = !state.ruler; els.rulerBtn.classList.toggle('active', state.ruler); els.rulerBtn.setAttribute('aria-pressed', state.ruler ? 'true' : 'false'); if (els.readingRuler) els.readingRuler.style.display = state.ruler ? 'block' : 'none'; });
    els.fullscreenBtn?.addEventListener('click', async () => { try { if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); } else await document.exitFullscreen(); } catch (_) { setStatus('Fullscreen is not available in this browser.', 'error'); } });
    document.addEventListener('fullscreenchange', () => { state.fullscreen = Boolean(document.fullscreenElement); els.fullscreenBtn?.classList.toggle('active', state.fullscreen); els.fullscreenBtn?.setAttribute('aria-pressed', state.fullscreen ? 'true' : 'false'); });
    els.downloadBtn?.addEventListener('click', () => {
      const doc = activeDocument(); if (!doc) return;
      const blob = new Blob([doc.safe.sourceText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Reader_Export.txt'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
    });
    document.addEventListener('click', event => {
      if (event.target !== els.backBtn) return;
      stopSpeaking('back'); showInput();
    }, true);
    els.focusBtn?.addEventListener('click', () => { if (state.focusMode) exitFocusMode(); else enterFocusMode(); });
    els.focusRestore?.addEventListener('click', exitFocusMode);
  }

  function enterFocusMode() {
    stopSpeaking('focus-mode'); closeMobileSheet(); state.focusMode = true; document.body.classList.add('focus-mode-active'); els.toolbar?.classList.add('force-hidden'); els.backBtn?.classList.add('force-hidden'); els.wordCount?.classList.add('force-hidden'); els.focusRestore?.classList.add('show'); els.mobileFab?.classList.remove('active');
  }
  function exitFocusMode() { state.focusMode = false; document.body.classList.remove('focus-mode-active'); els.toolbar?.classList.remove('force-hidden'); els.backBtn?.classList.remove('force-hidden'); els.wordCount?.classList.remove('force-hidden'); els.focusRestore?.classList.remove('show'); }

  function setupFocusModeTeardown() {
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && state.focusMode) exitFocusMode(); });
  }

  function setupToc() {
    function close() {
      try { els.tocDialog?.close(); } catch (_) {}
      const focusTarget = state.tocLastFocus; state.tocLastFocus = null; focusTarget?.focus?.();
    }
    els.closeTocBtn?.addEventListener('click', close);
    els.tocDialog?.addEventListener('cancel', event => { event.preventDefault(); close(); });
    els.tocBtn?.addEventListener('click', () => {
      const doc = activeDocument(); if (!doc) return;
      els.tocBody.replaceChildren();
      if (!doc.safe.headings.length) { const empty = document.createElement('p'); empty.textContent = 'This document has no headings yet.'; els.tocBody.appendChild(empty); }
      else doc.safe.headings.forEach((heading, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'toc-item'; button.textContent = `${index + 1}. ${heading.text}`; button.dataset.targetId = heading.id; button.addEventListener('click', () => { close(); requestAnimationFrame(() => { const target = document.getElementById(heading.id); target?.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (doc) { doc.progress.headingId = heading.id; doc.progress.ratio = Math.round(Math.max(0, Math.min(1, (window.scrollY || 0) / Math.max(1, document.documentElement.scrollHeight - window.innerHeight))) * 100) / 100; updateProgressDisplay(); updateQueue(); } }); }); els.tocBody.appendChild(button);
      });
      state.tocLastFocus = document.activeElement; try { els.tocDialog?.showModal(); els.closeTocBtn?.focus(); } catch (_) {}
    });
  }

  function setupEditing() {
    function sanitizeEditorSurface() {
      if (!els.readerContent?.isContentEditable) return;
      for (const node of els.readerContent.querySelectorAll('script,style,iframe,object,embed,form')) node.remove();
      for (const element of els.readerContent.querySelectorAll('*')) for (const attr of Array.from(element.attributes)) if (/^on/i.test(attr.name)) element.removeAttribute(attr.name);
      for (const link of els.readerContent.querySelectorAll('a')) if (!/^https:\/\//i.test(link.getAttribute('href') || '')) { const text = document.createTextNode(link.textContent || ''); link.replaceWith(text); }
    }
    document.addEventListener('click', event => {
      if (event.target !== els.editBtn) return;
      const doc = activeDocument(); if (!doc) return;
      state.editing = !state.editing; state.editWasSaved = false;
      els.readerContent.contentEditable = state.editing ? 'true' : 'false';
      els.editBtn.classList.toggle('active', state.editing); els.editBtn.setAttribute('aria-pressed', state.editing ? 'true' : 'false');
      document.body.classList.toggle('editing-mode-active', state.editing); els.editingBanner?.classList.toggle('show', state.editing);
      if (state.editing) { els.readerContent.focus(); }
    }, true);
    els.readerContent?.addEventListener('paste', event => { if (!els.readerContent.isContentEditable) return; event.preventDefault(); document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || ''); });
    els.readerContent?.addEventListener('drop', event => { if (els.readerContent.isContentEditable) event.preventDefault(); });
    els.saveEditBannerBtn?.addEventListener('click', () => {
      const doc = activeDocument(); if (!doc || !state.editing) return;
      sanitizeEditorSurface();
      const text = els.readerContent.textContent || '';
      doc.safe = makeSafeRepresentation(text, 'markdown');
      doc.displayName = doc.displayName || 'Edited document';
      state.editing = false; state.editWasSaved = true;
      els.readerContent.contentEditable = 'false'; els.editBtn.classList.remove('active'); els.editBtn.setAttribute('aria-pressed', 'false'); document.body.classList.remove('editing-mode-active'); els.editingBanner?.classList.remove('show');
      renderBlocks(doc); updateDocumentSummary(); updateQueue(); setStatus('Edits saved in the temporary session only.', 'success');
    });
  }

  function setupMobileSheet() {
    function open() { if (state.focusMode) return; els.toolbar?.classList.add('expanded'); els.mobileFab?.classList.add('active'); els.mobileFab?.setAttribute('aria-expanded', 'true'); els.sheetBackdrop?.classList.add('show'); document.body.classList.add('mobile-sheet-active'); }
    window.closeMobileSheet = close;
    function close() {
      els.toolbar?.classList.remove('expanded'); els.mobileFab?.classList.remove('active'); els.mobileFab?.setAttribute('aria-expanded', 'false'); els.sheetBackdrop?.classList.remove('show'); document.body.classList.remove('mobile-sheet-active');
      for (const section of document.querySelectorAll('[data-settings-section]')) if (section.dataset.settingsSection !== 'theme' && section.dataset.settingsSection !== 'session') { section.classList.remove('is-open'); const toggle = section.querySelector('.settings-section-toggle'); const panel = section.querySelector('.settings-section-panel'); toggle?.setAttribute('aria-expanded', 'false'); if (panel) panel.hidden = true; }
    }
    els.mobileFab?.addEventListener('click', () => { if (els.toolbar?.classList.contains('expanded')) close(); else open(); });
    els.sheetBackdrop?.addEventListener('click', close);
    els.bottomSheetHandle?.addEventListener('click', close);
    window.addEventListener('resize', () => { if (window.innerWidth > 640) close(); });
  }

  function setupScroll() {
    window.addEventListener('scroll', () => {
      if (state.ruler && els.readingRuler) els.readingRuler.style.transform = `translate3d(0, ${Math.round(window.innerHeight * 0.42)}px, 0)`;
      queueProgressUpdate();
    }, { passive: true });
  }

  function setupLegacyCleanup() {
    const keys = ['reader_text','reader_scroll','reader_size','reader_mode','reader_preset_index','reader_font','reader_theme','reader_textcolor','reader_smart_headings','reader_remember_document','reader_lineheight','reader_letterspacing','reader_margin','reader_voice_rate','reader_voice_uri','reader_scroll_speed'];
    try { for (const key of keys) localStorage.removeItem(key); } catch (_) {}
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed.', error)));
  }

  function init() {
    setupLegacyCleanup();
    injectSessionUi();
    setupInput();
    setupSettings();
    renderPresets();
    setupPresetGestures();
    setupModeAndTypography();
    setupSpeech();
    setupReaderTools();
    setupFocusModeTeardown();
    setupToc();
    setupEditing();
    setupMobileSheet();
    setupScroll();
    registerServiceWorker();
    document.body.classList.add('theme-claude');
    if (els.readerContent) { els.readerContent.classList.add('fs-medium'); els.readerContent.setAttribute('aria-busy', 'false'); }
    updateQueue();
  }

  init();
})();
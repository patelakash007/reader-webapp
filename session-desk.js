(function () {
  'use strict';

  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
  const MAX_PDF_PAGES = 500;
  const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown']);
  const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'pdf', 'docx']);

  const dom = {
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
    progressBar: document.getElementById('progressBar'),
    ttsBtn: document.getElementById('ttsBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    tocBody: document.getElementById('tocBody'),
    tocDialog: document.getElementById('tocDialog'),
    editBtn: document.getElementById('editBtn'),
    editingBanner: document.getElementById('editingBanner'),
    saveEditBannerBtn: document.getElementById('saveEditBannerBtn'),
    focusBtn: document.getElementById('focusBtn'),
    mobileFab: document.getElementById('mobileFab'),
    sheetBackdrop: document.getElementById('sheetBackdrop'),
    settingsDrawer: document.getElementById('settingsDrawer')
  };

  const state = {
    documents: new Map(),
    order: [],
    activeId: null,
    generation: 0,
    readerFrame: 0,
    parserAbort: null,
    parserTask: null,
    speaking: false,
    speakingGeneration: 0,
    utterance: null,
    speechQueue: [],
    editing: false,
    activeEditDocumentId: null,
    inputPanel: null,
    rail: null,
    mobileSection: null,
    progressDirty: false,
    headingObserver: null
  };

  function normalizeName(name) {
    const cleaned = String(name || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim();
    return cleaned || 'Untitled';
  }

  function extensionOf(name) {
    const match = /\.([^.]+)$/.exec(String(name || '').toLowerCase());
    return match ? match[1] : '';
  }

  function sourceTypeFor(ext) {
    if (ext === 'pdf') return 'PDF';
    if (ext === 'docx') return 'DOCX';
    if (ext === 'md' || ext === 'markdown') return 'Markdown';
    return 'TXT';
  }

  function uniqueDisplayName(name) {
    const clean = normalizeName(name);
    const existing = new Set(state.order.map(id => state.documents.get(id)?.displayName));
    if (!existing.has(clean)) return clean;
    const dot = clean.lastIndexOf('.');
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : '';
    let index = 2;
    let candidate = `${stem} (${index})${ext}`;
    while (existing.has(candidate)) {
      index += 1;
      candidate = `${stem} (${index})${ext}`;
    }
    return candidate;
  }

  function createId() {
    if (window.crypto?.randomUUID) return `desk-${window.crypto.randomUUID()}`;
    return `desk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function wordCount(text) {
    const values = String(text || '').trim().match(/\S+/g);
    return values ? values.length : 0;
  }

  function readingMinutes(words) {
    return Math.max(1, Math.round(Number(words || 0) / 220));
  }

  function setStatus(message, type = 'info') {
    for (const target of [document.getElementById('statusMessage'), document.getElementById('readerStatusMessage')]) {
      if (!target) continue;
      target.textContent = message || '';
      const base = target.id === 'readerStatusMessage' ? 'status-message reader-status-message' : 'status-message';
      target.className = message ? `${base} show ${type}` : base;
    }
  }

  function showLoader(message) {
    dom.loader?.classList.add('active');
    if (dom.loaderText) dom.loaderText.textContent = message || 'Loading text...';
  }

  function hideLoader() {
    dom.loader?.classList.remove('active');
  }

  function safeText(value) {
    return typeof value === 'string' ? value : '';
  }

  function slugify(text, index) {
    const slug = String(text || '').toLowerCase().trim().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '-').slice(0, 60) || `section-${index + 1}`;
    return `desk-${slug}-${index + 1}`;
  }

  function inlineTokens(text) {
    const source = safeText(text);
    const tokens = [];
    let index = 0;

    const pushText = value => { if (value) tokens.push({ type: 'text', text: value }); };
    while (index < source.length) {
      if (source[index] === '`') {
        const end = source.indexOf('`', index + 1);
        if (end > index) {
          tokens.push({ type: 'code', text: source.slice(index + 1, end) });
          index = end + 1;
          continue;
        }
      }
      if (source[index] === '[') {
        const closeLabel = source.indexOf(']', index + 1);
        const open = closeLabel >= 0 ? source.indexOf('(', closeLabel + 1) : -1;
        const close = open >= 0 ? source.indexOf(')', open + 1) : -1;
        if (closeLabel > index && open === closeLabel + 1 && close > open) {
          const label = source.slice(index + 1, closeLabel);
          const href = source.slice(open + 1, close).trim();
          if (/^(?:https?:|ftp:|mailto:)/i.test(href) || href.startsWith('/') && !href.startsWith('//') || href.startsWith('#')) {
            tokens.push({ type: 'link', text: label, href });
          } else {
            pushText(source.slice(index, close + 1));
          }
          index = close + 1;
          continue;
        }
      }
      if (source.startsWith('**', index) || source.startsWith('__', index)) {
        const marker = source.slice(index, index + 2);
        const end = source.indexOf(marker, index + 2);
        if (end > index + 2) {
          tokens.push({ type: 'strong', children: inlineTokens(source.slice(index + 2, end)) });
          index = end + 2;
          continue;
        }
      }
      if (source[index] === '*' || source[index] === '_') {
        const marker = source[index];
        const end = source.indexOf(marker, index + 1);
        if (end > index + 1) {
          tokens.push({ type: 'em', children: inlineTokens(source.slice(index + 1, end)) });
          index = end + 1;
          continue;
        }
      }
      let end = index + 1;
      while (end < source.length && !['`', '[', '*', '_'].includes(source[end])) end += 1;
      pushText(source.slice(index, end));
      index = end;
    }
    return tokens;
  }

  function parseMarkdown(text) {
    const lines = safeText(text).replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    const headings = [];
    let paragraph = [];
    let list = null;
    let quote = [];
    let code = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push({ type: 'paragraph', tokens: inlineTokens(paragraph.join('\n')), text: paragraph.join('\n') });
      paragraph = [];
    };
    const flushList = () => {
      if (!list) return;
      blocks.push(list);
      list = null;
    };
    const flushQuote = () => {
      if (!quote.length) return;
      blocks.push({ type: 'quote', tokens: inlineTokens(quote.join('\n')), text: quote.join('\n') });
      quote = [];
    };

    lines.forEach(line => {
      if (code) {
        if (/^\s*```\s*$/.test(line)) {
          blocks.push({ type: 'code', text: code.join('\n') });
          code = null;
        } else code.push(line);
        return;
      }
      if (/^\s*```/.test(line)) {
        flushParagraph(); flushList(); flushQuote(); code = [];
        return;
      }
      const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (heading) {
        flushParagraph(); flushList(); flushQuote();
        const level = Math.min(3, heading[1].length);
        const textValue = heading[2].trim();
        const id = slugify(textValue, headings.length);
        blocks.push({ type: 'heading', level, text: textValue, tokens: inlineTokens(textValue), id });
        headings.push({ id, level, text: textValue });
        return;
      }
      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
        flushParagraph(); flushList(); flushQuote(); blocks.push({ type: 'hr' });
        return;
      }
      const quoteLine = /^\s*>\s?(.*)$/.exec(line);
      if (quoteLine) { flushParagraph(); flushList(); quote.push(quoteLine[1]); return; }
      const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
      const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (unordered || ordered) {
        flushParagraph(); flushQuote();
        const orderedType = Boolean(ordered);
        if (!list || list.ordered !== orderedType) { flushList(); list = { type: 'list', ordered: orderedType, items: [] }; }
        const value = ordered ? ordered[1] : unordered[1];
        list.items.push({ text: value, tokens: inlineTokens(value) });
        return;
      }
      if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); return; }
      flushList(); flushQuote(); paragraph.push(line);
    });
    if (code) blocks.push({ type: 'code', text: code.join('\n') });
    flushParagraph(); flushList(); flushQuote();
    return { blocks, headings };
  }

  function parsePlainText(text) {
    const lines = safeText(text).replace(/\r\n?/g, '\n').split('\n');
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
      if (trimmed.length <= 80 && !/[.!?]$/.test(trimmed) && /^[A-Z][A-Za-z0-9&'’:-]*(?:\s+[A-Z0-9][A-Za-z0-9&'’:-]*){0,7}$/.test(trimmed)) {
        flush();
        const id = slugify(trimmed, headings.length);
        blocks.push({ type: 'heading', level: 2, text: trimmed, tokens: inlineTokens(trimmed), id });
        headings.push({ id, level: 2, text: trimmed });
        return;
      }
      paragraph.push(line);
    });
    flush();
    return { blocks, headings };
  }

  function flattenTokens(tokens) {
    return (tokens || []).map(token => {
      if (token.type === 'text' || token.type === 'code' || token.type === 'link') return token.text || '';
      return flattenTokens(token.children);
    }).join('');
  }

  function renderTokens(tokens, parent) {
    for (const token of tokens || []) {
      if (token.type === 'text') parent.appendChild(document.createTextNode(token.text));
      else if (token.type === 'code') { const el = document.createElement('code'); el.textContent = token.text; parent.appendChild(el); }
      else if (token.type === 'strong') { const el = document.createElement('strong'); renderTokens(token.children, el); parent.appendChild(el); }
      else if (token.type === 'em') { const el = document.createElement('em'); renderTokens(token.children, el); parent.appendChild(el); }
      else if (token.type === 'link') { const anchor = document.createElement('a'); anchor.textContent = token.text; anchor.href = token.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; parent.appendChild(anchor); }
    }
  }

  function renderBlocks(safe) {
    dom.readerContent.replaceChildren();
    safe.blocks.forEach(block => {
      let element = null;
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
        block.items.forEach(item => { const li = document.createElement('li'); renderTokens(item.tokens, li); element.appendChild(li); });
      }
      if (element && block.tokens && block.type !== 'list') renderTokens(block.tokens, element);
      if (element) dom.readerContent.appendChild(element);
    });
  }

  function makeSafe(text, format) {
    const sourceText = safeText(text);
    const parsed = format === 'markdown' ? parseMarkdown(sourceText) : parsePlainText(sourceText);
    const blocks = parsed.blocks;
    const speechText = blocks.map(block => {
      if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote' || block.type === 'code') return `${block.text || ''}\n`;
      if (block.type === 'list') return `${block.items.map(item => item.text).join('\n')}\n`;
      return '';
    }).join('');
    return {
      kind: 'reading-desk-safe-v1',
      format,
      sourceText,
      blocks,
      headings: parsed.headings,
      wordCount: wordCount(sourceText),
      charCount: sourceText.length,
      speechText
    };
  }

  function activeDocument() {
    return state.activeId ? state.documents.get(state.activeId) : null;
  }

  function updateInputSummary() {
    const count = state.order.length;
    const totalWords = state.order.reduce((sum, id) => sum + (state.documents.get(id)?.safe.wordCount || 0), 0);
    const totalMinutes = readingMinutes(totalWords);
    document.querySelectorAll('[data-session-count]').forEach(el => { el.textContent = `${count} document${count === 1 ? '' : 's'}`; });
    document.querySelectorAll('[data-session-total-words]').forEach(el => { el.textContent = `${totalWords.toLocaleString()} words total · ~${totalMinutes} min`; });
    document.querySelectorAll('[data-session-active]').forEach(el => { el.textContent = activeDocument()?.displayName || 'None'; });
    if (dom.wordCount && activeDocument()) {
      const doc = activeDocument();
      dom.wordCount.textContent = `${doc.safe.wordCount.toLocaleString()} words · ~${readingMinutes(doc.safe.wordCount)} min read · ${state.order.length} in session`;
    }
  }

  function documentProgressText(doc) {
    return `~${Math.round((doc.progress.ratio || 0) * 100)}% read`;
  }

  function renderQueue(container) {
    if (!container) return;
    container.replaceChildren();
    const list = document.createElement('div');
    list.className = 'session-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Temporary reading session documents');

    if (!state.order.length) {
      const empty = document.createElement('p');
      empty.className = 'session-empty';
      empty.textContent = 'No documents yet. Add pasted text or a local TXT, Markdown, PDF, or DOCX file.';
      list.appendChild(empty);
      container.appendChild(list);
      return;
    }

    state.order.forEach((id, index) => {
      const doc = state.documents.get(id);
      if (!doc) return;
      const row = document.createElement('div');
      row.className = 'session-doc-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `session-doc${doc.id === state.activeId ? ' active' : ''}`;
      button.dataset.sessionDocId = doc.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', doc.id === state.activeId ? 'true' : 'false');
      button.tabIndex = doc.id === state.activeId || index === 0 ? 0 : -1;
      const name = document.createElement('span'); name.className = 'session-doc-name'; name.textContent = doc.displayName;
      const meta = document.createElement('span'); meta.className = 'session-doc-meta'; meta.textContent = `${doc.sourceType} · ${doc.safe.wordCount.toLocaleString()} words · ${doc.parseStatus}`;
      const progress = document.createElement('span'); progress.className = 'session-doc-progress'; progress.textContent = doc.parseStatus === 'error' ? 'Parse error' : documentProgressText(doc);
      button.append(name, meta, progress);
      button.addEventListener('click', () => activateDocument(doc.id));
      button.addEventListener('keydown', event => {
        if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
          let targetIndex = delta ? Math.min(Math.max(0, index + delta), state.order.length - 1) : event.key === 'Home' ? 0 : state.order.length - 1;
          const targetId = state.order[targetIndex];
          const target = container.querySelector(`[data-session-doc-id="${CSS.escape(targetId)}"]`);
          target?.focus();
          activateDocument(targetId);
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'session-doc-remove';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${doc.displayName}`);
      remove.addEventListener('click', event => { event.stopPropagation(); removeDocument(doc.id); });
      row.append(button, remove);
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  function updateQueue() {
    renderQueue(document.getElementById('sessionDesktopList'));
    renderQueue(document.getElementById('sessionMobileList'));
    renderQueue(document.getElementById('sessionInputList'));
    updateInputSummary();
    updateProgressUI();
  }

  function injectUi() {
    if (document.getElementById('localReadingDeskStyle')) return;
    const style = document.createElement('style');
    style.id = 'localReadingDeskStyle';
    style.textContent = `
      .session-rail { position: fixed; top: 96px; right: 18px; width: min(310px, 25vw); max-height: calc(100vh - 128px); overflow: auto; padding: 14px; border: 1px solid rgba(154,53,36,.12); border-radius: 18px; background: var(--toolbar-bg); backdrop-filter: blur(18px); box-shadow: 0 10px 34px rgba(0,0,0,.07); z-index: 998; }
      .session-rail-title, .session-mobile-title, .session-input-title { margin: 0; color: var(--text); font-size: 14px; font-weight: 750; }
      .session-privacy, .session-summary { margin-top: 6px; color: var(--text2); font-size: 11px; line-height: 1.45; }
      .session-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
      .session-doc-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 6px; align-items: stretch; }
      .session-doc { min-width: 0; width: 100%; text-align: left; border: 1px solid rgba(154,53,36,.12); border-radius: 12px; background: color-mix(in srgb, var(--card) 76%, transparent); color: var(--text); padding: 10px 11px; cursor: pointer; display: grid; gap: 3px; }
      .session-doc.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
      .session-doc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; font-weight: 700; }
      .session-doc-meta, .session-doc-progress { color: var(--text2); font-size: 10.5px; }
      .session-doc-remove { min-width: 58px; border: 0; border-radius: 10px; background: transparent; color: var(--text2); font: inherit; font-size: 10px; cursor: pointer; }
      .session-doc-remove:hover, .session-doc-remove:focus-visible { color: #b91c1c; }
      .session-action-row { display: grid; gap: 8px; margin-top: 10px; }
      .session-clear { min-height: 40px; border: 1px solid rgba(185,28,28,.28); border-radius: 10px; background: transparent; color: #b91c1c; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
      .session-empty { margin: 0; color: var(--text2); font-size: 11.5px; line-height: 1.5; }
      .session-input { margin: 22px auto 0; max-width: 980px; padding: 14px; border: 1px solid rgba(154,53,36,.12); border-radius: 16px; background: var(--card); }
      .session-mobile { display: none; }
      @media (min-width: 641px) { #readerContent, #wordCount { margin-right: min(330px, 27vw); } }
      @media (max-width: 640px) { .session-rail { display:none; } .session-mobile { display:block; } .session-input { margin-left: 12px; margin-right: 12px; } }
    `;
    document.head.appendChild(style);

    const rail = document.createElement('aside');
    rail.id = 'sessionDesktopRail'; rail.className = 'session-rail'; rail.setAttribute('aria-label', 'Temporary reading session');
    rail.innerHTML = '<h2 class="session-rail-title">Reading desk</h2><div class="session-summary"><span data-session-count>0 documents</span> · <span data-session-total-words>0 words total · ~1 min</span></div><div class="session-privacy">Temporary session. Documents and reading state stay in memory only. Reloading, restarting the browser, or clearing the session discards them.</div><div id="sessionDesktopList"></div><div class="session-action-row"><button type="button" class="session-clear" id="sessionClearDesktop">Clear session</button></div>';
    dom.readerView?.appendChild(rail);
    state.rail = rail;

    const input = document.createElement('section');
    input.id = 'sessionInputPanel'; input.className = 'session-input'; input.setAttribute('aria-label', 'Temporary reading session');
    input.innerHTML = '<h2 class="session-input-title">Temporary reading desk</h2><div class="session-summary"><span data-session-count>0 documents</span> · <span data-session-total-words>0 words total · ~1 min</span></div><div class="session-privacy">Nothing here is saved by the app. Documents and reading progress stay in memory only for this page session.</div><div id="sessionInputList"></div><div class="session-action-row"><button type="button" class="session-clear" id="sessionClearInput">Clear session</button></div>';
    dom.inputView?.appendChild(input);
    state.inputPanel = input;

    const mobile = document.createElement('section');
    mobile.id = 'sessionMobileSection'; mobile.className = 'settings-section session-mobile';
    mobile.innerHTML = '<button class="settings-section-toggle" type="button" aria-expanded="false" aria-controls="sessionSettingsPanel"><span><span class="settings-section-title">Reading desk</span><span class="settings-section-summary"><span data-session-count>0 documents</span> · temporary</span></span><span class="settings-section-chevron" aria-hidden="true"></span></button><div class="settings-section-panel" id="sessionSettingsPanel" hidden><div class="settings-panel-inner"><div class="session-privacy">Documents, parsed results, progress, and queue state stay in memory only. Nothing is put into browser storage, URLs, service-worker cache, analytics, or remote APIs.</div><div class="session-summary">Active: <strong data-session-active>None</strong><br><span data-session-total-words>0 words total · ~1 min</span></div><div id="sessionMobileList"></div><button type="button" class="session-clear" id="sessionClearMobile">Clear session</button></div></div>';
    dom.settingsDrawer?.insertBefore(mobile, dom.settingsDrawer.firstElementChild);
    state.mobileSection = mobile;

    mobile.querySelector('.settings-section-toggle')?.addEventListener('click', () => {
      const toggle = mobile.querySelector('.settings-section-toggle');
      const panel = document.getElementById('sessionSettingsPanel');
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      mobile.classList.toggle('is-open', open);
      if (panel) panel.hidden = !open;
    });

    document.getElementById('sessionClearDesktop')?.addEventListener('click', clearSession);
    document.getElementById('sessionClearInput')?.addEventListener('click', clearSession);
    document.getElementById('sessionClearMobile')?.addEventListener('click', clearSession);
    updateQueue();
  }

  function showReaderShell() {
    dom.inputView?.classList.add('hidden');
    dom.readerView?.classList.add('active');
    dom.backBtn?.classList.add('show');
    dom.toolbar?.classList.remove('hidden-bar', 'force-hidden');
    dom.mobileFab?.classList.add('reader-active');
    dom.mobileFab?.classList.remove('active');
    dom.mobileFab?.setAttribute('aria-expanded', 'false');
    dom.sheetBackdrop?.classList.remove('show');
    document.body.classList.remove('mobile-sheet-active');
  }

  function showInputShell() {
    dom.readerView?.classList.remove('active');
    dom.inputView?.classList.remove('hidden');
    dom.backBtn?.classList.remove('show', 'force-hidden');
    dom.toolbar?.classList.remove('expanded', 'force-hidden');
    dom.sheetBackdrop?.classList.remove('show');
    document.body.classList.remove('mobile-sheet-active');
    dom.mobileFab?.classList.remove('active', 'reader-active');
    dom.mobileFab?.setAttribute('aria-expanded', 'false');
  }

  function stopSpeech(reason = '') {
    state.speakingGeneration += 1;
    state.speaking = false;
    state.utterance = null;
    state.speechQueue = [];
    try { window.speechSynthesis?.cancel(); } catch (_) {}
    if (dom.ttsBtn) {
      dom.ttsBtn.classList.remove('active');
      dom.ttsBtn.setAttribute('aria-pressed', 'false');
      dom.ttsBtn.setAttribute('aria-label', 'Start Read Aloud');
      dom.ttsBtn.setAttribute('title', 'Start Read Aloud');
      dom.ttsBtn.innerHTML = '<span aria-hidden="true">&#x1F50A;</span>';
    }
    if (reason) updateProgressUI();
  }

  function cancelParserWork() {
    try { state.parserAbort?.abort(); } catch (_) {}
    state.parserAbort = null;
    try { state.parserTask?.destroy?.(); } catch (_) {}
    state.parserTask = null;
  }

  function beginGeneration() {
    state.generation += 1;
    cancelParserWork();
    stopSpeech('new-read');
    return state.generation;
  }

  function generationIsCurrent(generation) {
    return generation === state.generation;
  }

  function createParserAbort() {
    const controller = new AbortController();
    state.parserAbort = controller;
    return controller;
  }

  function readTextFile(file, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error('Stale file read ignored.')); return; }
      const reader = new FileReader();
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        reader.onload = reader.onerror = reader.onabort = null;
      };
      const abort = () => { try { reader.abort(); } catch (_) {} reject(new Error('Stale file read ignored.')); };
      signal.addEventListener('abort', abort, { once: true });
      reader.onload = () => { cleanup(); resolve(safeText(reader.result)); };
      reader.onerror = () => { cleanup(); reject(reader.error || new Error('The file could not be read.')); };
      reader.onabort = () => { cleanup(); reject(new Error('Stale file read ignored.')); };
      reader.readAsText(file);
    });
  }

  function readBufferFile(file, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error('Stale file read ignored.')); return; }
      const reader = new FileReader();
      const cleanup = () => { signal.removeEventListener('abort', abort); reader.onload = reader.onerror = reader.onabort = null; };
      const abort = () => { try { reader.abort(); } catch (_) {} reject(new Error('Stale file read ignored.')); };
      signal.addEventListener('abort', abort, { once: true });
      reader.onload = () => { cleanup(); resolve(reader.result); };
      reader.onerror = () => { cleanup(); reject(reader.error || new Error('The file could not be read.')); };
      reader.onabort = () => { cleanup(); reject(new Error('Stale file read ignored.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function loadLibrary(name) {
    const existing = name === 'pdf' ? window.pdfjsLib : window.mammoth;
    if (existing) return Promise.resolve(existing);
    const src = name === 'pdf' ? 'vendor/pdf.min.js' : 'vendor/mammoth.browser.min.js';
    return new Promise((resolve, reject) => {
      const tag = document.querySelector(`script[data-session-parser="${name}"]`);
      const finish = () => {
        const lib = name === 'pdf' ? window.pdfjsLib : window.mammoth;
        if (name === 'pdf' && lib) lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        if (lib) resolve(lib); else reject(new Error(`Local parser ${name} did not initialize.`));
      };
      if (tag) { tag.addEventListener('load', finish, { once: true }); tag.addEventListener('error', () => reject(new Error(`Failed to load local parser ${name}.`)), { once: true }); return; }
      const script = document.createElement('script');
      script.src = src; script.dataset.sessionParser = name;
      script.onload = finish;
      script.onerror = () => reject(new Error(`Failed to load local parser ${name}.`));
      document.head.appendChild(script);
    });
  }

  async function parseFile(file, generation, signal) {
    const ext = extensionOf(file.name);
    if (file.size === 0) throw new Error(`“${normalizeName(file.name)}” is empty.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`“${normalizeName(file.name)}” is too large. File limit is 15 MiB.`);
    if (!SUPPORTED_EXTENSIONS.has(ext)) throw new Error(`Unsupported format “.${ext || 'unknown'}”. Use TXT, Markdown, PDF, or DOCX.`);
    if (!generationIsCurrent(generation)) throw new Error('Stale file read ignored.');

    if (TEXT_EXTENSIONS.has(ext)) {
      const text = await readTextFile(file, signal);
      if (text.length > MAX_EXTRACTED_TEXT_CHARS) throw new Error(`This text file contains too much text. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
      return { text, format: ext === 'txt' ? 'text' : 'markdown' };
    }

    const buffer = await readBufferFile(file, signal);
    if (!generationIsCurrent(generation)) throw new Error('Stale file read ignored.');

    if (ext === 'pdf') {
      const pdfjs = await loadLibrary('pdf');
      if (!generationIsCurrent(generation)) throw new Error('Stale file read ignored.');
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      state.parserTask = loadingTask;
      try {
        const pdf = await loadingTask.promise;
        if (state.parserTask !== loadingTask || !generationIsCurrent(generation)) throw new Error('Stale file read ignored.');
        if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages. Limit is ${MAX_PDF_PAGES} pages.`);
        const pages = [];
        let chars = 0;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (!generationIsCurrent(generation)) throw new Error('Stale file read ignored.');
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items.map(item => safeText(item.str)).join(' ');
          chars += text.length;
          if (chars > MAX_EXTRACTED_TEXT_CHARS) throw new Error(`This PDF contains too much extracted text. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
          pages.push(text);
          try { page.cleanup?.(); } catch (_) {}
        }
        try { await pdf.cleanup?.(); } catch (_) {}
        return { text: pages.join('\n\n'), format: 'text' };
      } finally {
        try { await loadingTask.destroy?.(); } catch (_) {}
        if (state.parserTask === loadingTask) state.parserTask = null;
      }
    }

    const mammoth = await loadLibrary('mammoth');
    if (!generationIsCurrent(generation)) throw new Error('Stale file read ignored.');
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      const text = safeText(result?.value).trim();
      if (!text) throw new Error('The DOCX contains no readable text.');
      if (text.length > MAX_EXTRACTED_TEXT_CHARS) throw new Error(`This DOCX contains too much extracted text. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
      return { text, format: 'text' };
    } catch (error) {
      if (/no readable text/i.test(error.message || '')) throw error;
      throw new Error('The DOCX could not be parsed. The file may be malformed or unsupported.');
    }
  }

  function addDocument({ displayName, sourceType, format, text, parseStatus = 'ready', error = null }) {
    const safe = makeSafe(text, format);
    const id = createId();
    const now = Date.now();
    const doc = {
      id,
      displayName: uniqueDisplayName(displayName),
      sourceType,
      parseStatus,
      error,
      safe,
      progress: { ratio: 0, headingId: safe.headings[0]?.id || null, updatedAt: now },
      lastVisibleHeading: safe.headings[0]?.id || null,
      lifecycle: parseStatus === 'error' ? 'error' : 'ready',
      cleanup: []
    };
    state.documents.set(id, doc);
    state.order.push(id);
    return doc;
  }

  function showDocument(doc, focusHeading = null) {
    if (!doc) return;
    renderBlocks(doc.safe);
    showReaderShell();
    updateQueue();
    requestAnimationFrame(() => {
      const targetId = focusHeading || doc.progress.headingId;
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
      else {
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo(0, maxScroll * (doc.progress.ratio || 0));
      }
      updateProgressUI();
      observeTocCurrent();
    });
  }

  function activateDocument(id, focusHeading = null) {
    const doc = state.documents.get(id);
    if (!doc || doc.lifecycle === 'removed') return;
    const previous = activeDocument();
    if (previous && previous.id !== doc.id) saveProgress(previous);
    stopSpeech('document-switch');
    state.activeId = id;
    closeSessionTocIfOpen();
    showDocument(doc, focusHeading);
  }

  function saveProgress(doc) {
    if (!doc || !dom.readerView?.classList.contains('active')) return;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.max(0, Math.min(1, scrollTop / maxScroll));
    const headings = Array.from(dom.readerContent.querySelectorAll('[data-heading-id]'));
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    headings.forEach(heading => {
      const rect = heading.getBoundingClientRect();
      if (rect.bottom < 0) return;
      const distance = Math.abs(rect.top - 96);
      if (distance < bestDistance) { best = heading.dataset.headingId; bestDistance = distance; }
    });
    doc.progress = { ratio: Math.round(ratio * 100) / 100, headingId: best || doc.lastVisibleHeading || doc.progress.headingId || null, updatedAt: Date.now() };
    doc.lastVisibleHeading = doc.progress.headingId;
  }

  function updateProgressUI() {
    const doc = activeDocument();
    const pct = doc ? Math.round((doc.progress.ratio || 0) * 100) : 0;
    if (dom.progressBar) dom.progressBar.style.width = `${pct}%`;
    document.querySelectorAll('[data-session-progress]').forEach(el => { el.textContent = doc ? documentProgressText(doc) : '~0% read'; });
    updateQueueProgressOnly();
  }

  function updateQueueProgressOnly() {
    document.querySelectorAll('[data-session-doc-id]').forEach(button => {
      const doc = state.documents.get(button.dataset.sessionDocId);
      const progress = button.querySelector('.session-doc-progress');
      if (doc && progress) progress.textContent = doc.parseStatus === 'error' ? 'Parse error' : documentProgressText(doc);
    });
  }

  function queueProgressFrame() {
    state.progressDirty = true;
    if (state.readerFrame) return;
    state.readerFrame = requestAnimationFrame(() => {
      state.readerFrame = 0;
      if (!state.progressDirty) return;
      state.progressDirty = false;
      const doc = activeDocument();
      if (doc) saveProgress(doc);
      updateProgressUI();
    });
  }

  function removeDocument(id) {
    const doc = state.documents.get(id);
    if (!doc) return;
    stopSpeech('remove-document');
    doc.lifecycle = 'removed';
    doc.cleanup.forEach(cleanup => { try { cleanup(); } catch (_) {} });
    state.documents.delete(id);
    state.order = state.order.filter(value => value !== id);
    if (state.activeId === id) {
      const nextId = state.order[0] || null;
      state.activeId = nextId;
      if (nextId) showDocument(state.documents.get(nextId));
      else { dom.readerContent.replaceChildren(); showInputShell(); }
    }
    updateQueue();
  }

  function clearSession() {
    beginGeneration();
    state.documents.forEach(doc => { doc.cleanup.forEach(cleanup => { try { cleanup(); } catch (_) {} }); doc.lifecycle = 'removed'; });
    state.documents.clear();
    state.order = [];
    state.activeId = null;
    state.editing = false;
    state.activeEditDocumentId = null;
    dom.readerContent?.replaceChildren();
    if (dom.editingBanner) dom.editingBanner.classList.remove('show');
    if (dom.readerContent) dom.readerContent.contentEditable = 'false';
    showInputShell();
    updateQueue();
    setStatus('Temporary session cleared. Nothing was saved by the app.', 'success');
  }

  async function ingestFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const generation = beginGeneration();
    const signal = createParserAbort().signal;
    showLoader(list.length > 1 ? `Adding ${list.length} documents...` : `Reading ${normalizeName(list[0].name)}...`);
    let added = 0;
    try {
      for (const file of list) {
        if (!generationIsCurrent(generation)) return;
        try {
          const ext = extensionOf(file.name);
          const parsed = await parseFile(file, generation, signal);
          if (!generationIsCurrent(generation)) return;
          const doc = addDocument({ displayName: file.name, sourceType: sourceTypeFor(ext), format: parsed.format, text: parsed.text });
          added += 1;
          if (!state.activeId) state.activeId = doc.id;
          if (doc.id === state.activeId) showDocument(doc);
        } catch (error) {
          if (!generationIsCurrent(generation) || /Stale file read ignored/i.test(error.message || '')) return;
          setStatus(`Could not open “${normalizeName(file.name)}”: ${error.message || 'parser failure'}`, 'error');
        }
      }
      if (added) setStatus(`Added ${added} document${added === 1 ? '' : 's'} to the temporary session.`, 'success');
    } finally {
      if (generationIsCurrent(generation)) hideLoader();
      if (dom.fileInput) dom.fileInput.value = '';
      updateQueue();
    }
  }

  async function ingestPaste() {
    const text = safeText(dom.pasteArea?.value);
    if (!text.trim()) { setStatus('Paste some text before starting a reading session.', 'error'); return; }
    if (text.length > MAX_EXTRACTED_TEXT_CHARS) { setStatus(`Pasted text is too large. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`, 'error'); return; }
    const generation = beginGeneration();
    const doc = addDocument({ displayName: `Pasted text${state.order.length ? ' (new)' : ''}`, sourceType: 'Pasted text', format: 'markdown', text });
    if (!state.activeId) state.activeId = doc.id;
    if (generationIsCurrent(generation)) showDocument(doc);
    dom.pasteArea.value = '';
    if (dom.clearBtn) dom.clearBtn.style.display = 'none';
    setStatus('Added pasted text to the temporary session.', 'success');
  }

  function closeSessionTocIfOpen() {
    if (dom.tocDialog?.open) {
      try { dom.tocDialog.close(); } catch (_) { dom.tocDialog.removeAttribute('open'); }
    }
  }

  function observeTocCurrent() {
    const update = () => {
      const doc = activeDocument();
      if (!doc || !dom.tocBody) return;
      dom.tocBody.querySelectorAll('.toc-item').forEach(item => {
        const targetId = (item.getAttribute('href') || '').slice(1);
        item.setAttribute('aria-current', targetId && targetId === doc.progress.headingId ? 'true' : 'false');
      });
    };
    if (!dom.tocBody) return;
    state.headingObserver?.disconnect?.();
    state.headingObserver = new MutationObserver(update);
    state.headingObserver.observe(dom.tocBody, { childList: true, subtree: true });
    update();
  }

  function interceptTocLinks() {
    if (!dom.tocBody) return;
    dom.tocBody.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('.toc-item') : null;
      if (!target) return;
      const doc = activeDocument();
      if (!doc) return;
      const id = (target.getAttribute('href') || '').slice(1);
      if (!id) return;
      event.preventDefault();
      const heading = document.getElementById(id);
      if (heading) {
        doc.progress.headingId = id;
        doc.lastVisibleHeading = id;
        heading.scrollIntoView({ block: 'start', behavior: 'smooth' });
        updateProgressUI();
      }
      closeSessionTocIfOpen();
    });
  }

  function speechText(doc) {
    return doc?.safe?.speechText || '';
  }

  function speakNext(generation) {
    if (!state.speaking || generation !== state.speakingGeneration) return;
    if (!state.speechQueue.length) { stopSpeech('complete'); return; }
    const utterance = new SpeechSynthesisUtterance(state.speechQueue.shift());
    state.utterance = utterance;
    const rate = Number.parseFloat(document.getElementById('voiceRateInput')?.value || '1') || 1;
    utterance.rate = rate;
    const voiceSelect = document.getElementById('voiceSelect');
    const voice = voiceSelect?.selectedOptions?.[0];
    if (voice?.value) {
      const found = window.speechSynthesis.getVoices().find(item => item.voiceURI === voice.value);
      if (found) utterance.voice = found;
    }
    utterance.onend = () => { if (state.speaking) speakNext(generation); };
    utterance.onerror = () => { if (state.speaking) stopSpeech('tts-error'); };
    window.speechSynthesis.speak(utterance);
  }

  function startSpeech() {
    const doc = activeDocument();
    if (!doc || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setStatus('Read Aloud is not available in this browser.', 'error');
      return;
    }
    stopSpeech('restart');
    state.speaking = true;
    state.speakingGeneration += 1;
    const generation = state.speakingGeneration;
    state.speechQueue = speechText(doc).match(/.{1,1800}(?:\s|$)/g) || [];
    if (!state.speechQueue.length) { stopSpeech('no-text'); setStatus('There is no readable text in the active document.', 'error'); return; }
    dom.ttsBtn?.classList.add('active');
    dom.ttsBtn?.setAttribute('aria-pressed', 'true');
    dom.ttsBtn?.setAttribute('aria-label', 'Stop Read Aloud');
    dom.ttsBtn?.setAttribute('title', 'Stop Read Aloud');
    speakNext(generation);
  }

  function toggleDeskSpeech() { if (state.speaking) stopSpeech('user'); else startSpeech(); }

  function startDeskEdit() {
    const doc = activeDocument();
    if (!doc || !dom.readerContent || !dom.editBtn) return;
    stopSpeech('edit');
    state.editing = true;
    state.activeEditDocumentId = doc.id;
    dom.readerContent.contentEditable = 'true';
    dom.readerContent.setAttribute('role', 'textbox');
    dom.readerContent.setAttribute('aria-label', 'Editable reader text');
    dom.readerContent.setAttribute('aria-multiline', 'true');
    dom.readerContent.textContent = doc.safe.sourceText;
    dom.readerContent.focus();
    dom.editingBanner?.classList.add('show');
    document.body.classList.add('editing-mode-active');
    dom.editBtn.classList.add('active');
    dom.editBtn.setAttribute('aria-pressed', 'true');
    dom.editBtn.setAttribute('aria-label', 'Save and Exit');
    dom.editBtn.setAttribute('title', 'Save and Exit');
    dom.editBtn.innerHTML = '<span aria-hidden="true">&#x1F4BE;</span> Save';
  }

  function saveDeskEdit() {
    const doc = state.activeEditDocumentId ? state.documents.get(state.activeEditDocumentId) : activeDocument();
    if (!doc || !dom.readerContent) return;
    const text = dom.readerContent.textContent || '';
    doc.safe = makeSafe(text, 'markdown');
    doc.safe.wordCount = wordCount(text);
    doc.safe.charCount = text.length;
    state.editing = false;
    state.activeEditDocumentId = null;
    dom.readerContent.contentEditable = 'false';
    dom.readerContent.removeAttribute('role');
    dom.readerContent.removeAttribute('aria-label');
    dom.readerContent.removeAttribute('aria-multiline');
    dom.editingBanner?.classList.remove('show');
    document.body.classList.remove('editing-mode-active');
    dom.editBtn?.classList.remove('active');
    dom.editBtn?.setAttribute('aria-pressed', 'false');
    dom.editBtn?.setAttribute('aria-label', 'Edit Text');
    dom.editBtn?.setAttribute('title', 'Edit Text');
    dom.editBtn.innerHTML = '<span aria-hidden="true">&#x270F;&#xFE0F;</span> Edit';
    renderBlocks(doc.safe);
    updateQueue();
    setStatus('Edits kept for this temporary session.', 'success');
  }

  function downloadActiveDocument() {
    const doc = activeDocument();
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc.safe.sourceText], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'Reader_Export.txt'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function setupInputInterception() {
    window.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (target === dom.readBtn) {
        event.preventDefault(); event.stopImmediatePropagation(); ingestPaste();
      }
      if (target === dom.fileInput) stopSpeech('file-dialog');
    }, true);
    window.addEventListener('change', event => {
      if (event.target !== dom.fileInput) return;
      event.preventDefault(); event.stopImmediatePropagation();
      ingestFiles(dom.fileInput.files);
    }, true);
    window.addEventListener('drop', event => {
      if (!dom.inputView?.contains(event.target) || !event.dataTransfer?.files?.length || dom.inputView.classList.contains('hidden')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      ingestFiles(event.dataTransfer.files);
    }, true);
  }

  function setupReaderInterception() {
    window.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!target) return;
      if (target === dom.backBtn && activeDocument()) {
        event.preventDefault(); event.stopImmediatePropagation();
        stopSpeech('leave-reader');
        state.editing = false; state.activeEditDocumentId = null;
        showInputShell(); updateQueue();
      } else if (target === dom.ttsBtn && activeDocument()) {
        event.preventDefault(); event.stopImmediatePropagation(); toggleDeskSpeech();
      } else if (target === dom.downloadBtn && activeDocument()) {
        event.preventDefault(); event.stopImmediatePropagation(); downloadActiveDocument();
      } else if (target === dom.editBtn && activeDocument()) {
        event.preventDefault(); event.stopImmediatePropagation(); state.editing ? saveDeskEdit() : startDeskEdit();
      } else if (target === dom.saveEditBannerBtn && state.editing) {
        event.preventDefault(); event.stopImmediatePropagation(); saveDeskEdit();
      } else if (target === dom.focusBtn && state.speaking) {
        stopSpeech('focus-mode');
      }
    }, true);
  }

  function setupProgress() {
    window.addEventListener('scroll', queueProgressFrame, { passive: true });
  }

  function init() {
    injectUi();
    setupInputInterception();
    setupReaderInterception();
    setupProgress();
    interceptTocLinks();
    updateQueue();
  }

  init();
})();

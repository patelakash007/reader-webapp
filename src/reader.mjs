import { createMarkdownRenderer } from './parser.mjs';
import { clampNumber, cancelPendingFileRead, cancelPendingRender, getElementTarget, getScrollTop } from './utils.mjs';

export function createReader(context, { ui, parser, tts, getSettings }) {
  const { els, state, runtime } = context;
  let initialized = false;

  function applyTextColor() {
    const settings = getSettings();
    if (settings) settings.applyTextColor(state.currentTextColor);
  }

  function renderTextAsync(text, onComplete, options = {}) {
    if (!els.readerContent) return;
    const renderId = ++runtime.reader.activeRenderId;
    const shouldShowLoader = !options.suppressLoader;
    if (shouldShowLoader) ui.showLoader('Preparing reader...');
    els.readerContent.textContent = '';

    setTimeout(() => {
      if (renderId !== runtime.reader.activeRenderId) return;
      const lines = text.split('\n');
      const renderer = createMarkdownRenderer(state.smartHeadings);
      let index = 0;

      const flushParts = () => {
        if (renderId !== runtime.reader.activeRenderId || !els.readerContent) return;
        const html = renderer.flushParts();
        if (html) els.readerContent.insertAdjacentHTML('beforeend', html);
      };

      const processChunk = () => {
        if (renderId !== runtime.reader.activeRenderId) return;
        try {
          const chunkEnd = Math.min(index + 500, lines.length);
          for (; index < chunkEnd; index += 1) {
            if (renderId !== runtime.reader.activeRenderId) return;
            renderer.processLine(lines[index], index);
          }
          flushParts();
          if (renderId !== runtime.reader.activeRenderId) return;
          if (index < lines.length) {
            window.requestAnimationFrame(processChunk);
            return;
          }

          const finalHtml = renderer.finish();
          if (finalHtml && renderId === runtime.reader.activeRenderId && els.readerContent) {
            els.readerContent.insertAdjacentHTML('beforeend', finalHtml);
          }
          if (renderId !== runtime.reader.activeRenderId) return;
          applyTextColor();
          tts.tokenize();
          if (shouldShowLoader) ui.hideLoader();
          if (onComplete) onComplete();
        } catch (err) {
          if (renderId !== runtime.reader.activeRenderId) return;
          if (shouldShowLoader) ui.hideLoader();
          ui.showStatus(`Could not render this text safely: ${err && err.message ? err.message : 'Unknown error'}`, 'error');
        }
      };
      processChunk();
    }, 50);
  }

  function getReaderTextForCounting() {
    if (!els.readerContent) return '';
    if (state.isEditing) return els.readerContent.textContent || '';
    const blocks = els.readerContent.querySelectorAll('h1, h2, h3, p, li, blockquote, pre');
    if (!blocks.length) return els.readerContent.innerText || els.readerContent.textContent || '';
    return Array.from(blocks)
      .map(block => (block.textContent || '').trim())
      .filter(Boolean)
      .join(' ');
  }

  function updateWordCount() {
    if (!els.readerContent || !els.wordCount) return;
    const text = getReaderTextForCounting();
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
    const minutes = Math.ceil(words / 238);
    const timeString = words < 238 ? '< 1 min read' : `~${minutes} min read`;
    els.wordCount.textContent = `${words.toLocaleString()} words · ${timeString}`;
  }

  function scheduleWordCountUpdate() {
    window.clearTimeout(state.wordCountTimer);
    state.wordCountTimer = window.setTimeout(updateWordCount, 0);
  }

  function setRulerActive(active, options = {}) {
    runtime.reader.isRulerActive = Boolean(active);
    if (els.readingRuler) els.readingRuler.style.display = runtime.reader.isRulerActive ? 'block' : 'none';
    if (!els.rulerBtn) return;
    els.rulerBtn.classList.toggle('active', runtime.reader.isRulerActive);
    els.rulerBtn.setAttribute('aria-pressed', runtime.reader.isRulerActive ? 'true' : 'false');
    if (runtime.reader.isRulerActive) {
      els.rulerBtn.setAttribute('aria-label', 'Disable Reading Ruler');
      els.rulerBtn.setAttribute('title', 'Disable Reading Ruler');
      if (options.announce !== false) ui.showStatus('Reading ruler guide activated.', 'success');
    } else {
      els.rulerBtn.setAttribute('aria-label', 'Enable Reading Ruler');
      els.rulerBtn.setAttribute('title', 'Enable Reading Ruler');
      if (options.announce !== false) ui.showStatus('Reading ruler guide deactivated.', 'info');
    }
  }

  function updateRulerPosition(event) {
    if (!runtime.reader.isRulerActive || !els.readingRuler || !els.readerContent) return;
    const target = getElementTarget(event.target);
    const scrollTop = getScrollTop();
    if (target && els.readerContent.contains(target) &&
      (target.tagName === 'P' || target.tagName === 'LI' || target.tagName === 'H1' || target.tagName === 'H2' || target.tagName === 'H3' || target.tagName === 'BLOCKQUOTE' || target.closest('p, li, h1, h2, h3, blockquote'))) {
      const textContainer = target.closest('p, li, h1, h2, h3, blockquote') || target;
      const rect = textContainer.getBoundingClientRect();
      const top = rect.top + scrollTop;
      els.readingRuler.style.height = `${rect.height + 4}px`;
      els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
    } else if (event.pageY) {
      const y = event.pageY - 14;
      els.readingRuler.style.height = '28px';
      els.readingRuler.style.transform = `translate3d(0, ${y}px, 0)`;
    }
  }

  function autoScrollLoop(timestamp) {
    const autoScroll = runtime.autoScroll;
    if (!autoScroll.active) return;
    if (!autoScroll.lastScrollTime) autoScroll.lastScrollTime = timestamp;
    const deltaTime = timestamp - autoScroll.lastScrollTime;
    autoScroll.lastScrollTime = timestamp;
    autoScroll.accumulator += deltaTime * autoScroll.speed;
    if (autoScroll.accumulator >= 1) {
      const pixelsToScroll = Math.floor(autoScroll.accumulator);
      window.scrollBy(0, pixelsToScroll);
      autoScroll.accumulator -= pixelsToScroll;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const distanceToBottom = document.documentElement.scrollHeight - getScrollTop() - viewportHeight;
    if (distanceToBottom < 1) toggleAutoScroll();
    else requestAnimationFrame(autoScrollLoop);
  }

  function toggleAutoScroll() {
    if (!els.autoScrollBtn) return;
    const autoScroll = runtime.autoScroll;
    autoScroll.active = !autoScroll.active;
    if (autoScroll.active) {
      els.autoScrollBtn.classList.add('active');
      els.autoScrollBtn.innerHTML = '<span aria-hidden="true">&#x23F8;</span>';
      els.autoScrollBtn.setAttribute('aria-pressed', 'true');
      els.autoScrollBtn.setAttribute('aria-label', 'Stop Auto Scroll');
      els.autoScrollBtn.setAttribute('title', 'Stop Auto Scroll');
      autoScroll.lastScrollTime = 0;
      autoScroll.accumulator = 0;
      requestAnimationFrame(autoScrollLoop);
      ui.announceLive('Auto-scroll started.');
    } else {
      els.autoScrollBtn.classList.remove('active');
      els.autoScrollBtn.innerHTML = '<span aria-hidden="true">&#x25B6;</span>';
      els.autoScrollBtn.setAttribute('aria-pressed', 'false');
      els.autoScrollBtn.setAttribute('aria-label', 'Start Auto Scroll');
      els.autoScrollBtn.setAttribute('title', 'Start Auto Scroll');
      ui.announceLive('Auto-scroll stopped.');
    }
  }

  function getHeadingScrollOffset() {
    if (!els.toolbar || isMobileSheetLayout() || state.focusMode || els.toolbar.classList.contains('hidden-bar')) return 0;
    const rect = els.toolbar.getBoundingClientRect();
    if (rect.height <= 0 || rect.bottom <= 0) return 0;
    return Math.ceil(rect.bottom + 16);
  }

  function scrollHeadingIntoView(heading) {
    if (!heading) return;
    const offset = getHeadingScrollOffset();
    if (!offset) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const headingTop = heading.getBoundingClientRect().top + getScrollTop();
    window.scrollTo({ top: Math.max(0, headingTop - offset), behavior: 'smooth' });
  }

  function populateAndShowTOC() {
    if (!els.readerContent || !els.tocDialog || !els.tocBody) return;
    const headings = els.readerContent.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) {
      ui.showStatus('No headings found in this document.', 'info');
      return;
    }
    runtime.reader.lastActiveElement = document.activeElement;
    els.tocBody.innerHTML = '';
    headings.forEach(heading => {
      if (!heading.id) heading.id = `heading-${Math.random().toString(36).slice(2, 11)}`;
      const link = document.createElement('a');
      link.className = 'toc-item';
      link.textContent = heading.textContent;
      link.href = `#${heading.id}`;
      link.addEventListener('click', event => {
        event.preventDefault();
        scrollHeadingIntoView(heading);
        ui.closeTocDialog();
      });
      els.tocBody.appendChild(link);
    });
    if (!ui.openTocDialog()) {
      ui.showStatus('Table of contents is unavailable in this browser.', 'error');
      return;
    }
    setTimeout(() => {
      if (els.closeTocBtn) els.closeTocBtn.focus();
    }, 50);
  }

  function isMobileSheetLayout() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function toggleMobileSheet() {
    if (!els.toolbar) return;
    if (els.toolbar.classList.contains('expanded')) collapseMobileSheet();
    else expandMobileSheet();
  }

  function expandMobileSheet() {
    if (els.toolbar) els.toolbar.classList.add('expanded');
    if (els.sheetBackdrop) els.sheetBackdrop.classList.add('show');
    ui.setContainerFocusable(els.toolbar, true);
    if (isMobileSheetLayout()) {
      document.body.classList.add('mobile-sheet-active');
      if (els.toolbar) els.toolbar.scrollTop = 0;
    }
    if (els.mobileFab) {
      els.mobileFab.classList.add('active');
      els.mobileFab.setAttribute('aria-label', 'Close Reading Settings');
      els.mobileFab.setAttribute('aria-expanded', 'true');
    }
  }

  function collapseMobileSheet() {
    if (els.toolbar) els.toolbar.classList.remove('expanded');
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    ui.setContainerFocusable(els.toolbar, false);
    document.body.classList.remove('mobile-sheet-active');
    if (els.toolbar) els.toolbar.scrollTop = 0;
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
      els.mobileFab.setAttribute('aria-expanded', 'false');
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
  }

  function setEditingLayoutActive(active) {
    document.body.classList.toggle('editing-mode-active', Boolean(active));
    if (active) {
      window.requestAnimationFrame(updateEditingLayoutOffset);
      return;
    }
    document.documentElement.style.removeProperty('--editing-banner-height');
  }

  function updateEditingLayoutOffset() {
    if (!els.editingBanner || !document.body.classList.contains('editing-mode-active')) return;
    const height = Math.ceil(els.editingBanner.getBoundingClientRect().height || 0);
    if (height > 0) document.documentElement.style.setProperty('--editing-banner-height', `${height}px`);
  }

  function enterEditMode() {
    if (!els.readerContent || !els.editingBanner || !els.editBtn) return;
    runtime.reader.activeRenderId += 1;
    ui.hideLoader();
    if (tts.getSession().isSpeaking) tts.stopTTS();
    if (runtime.autoScroll.active) toggleAutoScroll();
    state.isEditing = true;
    window.clearTimeout(state.toolbarTimer);
    state.toolbarTimer = null;
    if (els.toolbar) {
      els.toolbar.classList.remove('hidden-bar');
      ui.setContainerFocusable(els.toolbar, true);
    }
    els.readerContent.textContent = state.currentText;
    els.readerContent.setAttribute('contenteditable', 'true');
    els.readerContent.setAttribute('role', 'textbox');
    els.readerContent.setAttribute('aria-label', 'Editable reader text');
    els.readerContent.setAttribute('aria-multiline', 'true');
    els.editingBanner.classList.add('show');
    setEditingLayoutActive(true);
    els.editBtn.innerHTML = '<span aria-hidden="true">&#x1F4BE;</span> Save';
    els.editBtn.classList.add('active');
    els.editBtn.setAttribute('title', 'Save and Exit');
    els.editBtn.setAttribute('aria-label', 'Save and Exit');
    els.editBtn.setAttribute('aria-pressed', 'true');
    els.readerContent.focus();
    ui.announceLive('Editing mode activated. Focus moved to raw reader text.');
  }

  function saveAndExitEditMode(options = {}) {
    if (!els.readerContent || !els.editingBanner || !els.editBtn) return;
    window.clearTimeout(runtime.reader.editDebounceTimer);
    runtime.reader.editDebounceTimer = null;
    state.isEditing = false;
    els.readerContent.removeAttribute('contenteditable');
    els.readerContent.removeAttribute('role');
    els.readerContent.removeAttribute('aria-label');
    els.readerContent.removeAttribute('aria-multiline');
    els.editingBanner.classList.remove('show');
    setEditingLayoutActive(false);
    els.editBtn.innerHTML = '<span aria-hidden="true">&#x270E;&#xFE0F;</span> Edit';
    els.editBtn.classList.remove('active');
    els.editBtn.setAttribute('title', 'Edit Text');
    els.editBtn.setAttribute('aria-label', 'Edit Text');
    els.editBtn.setAttribute('aria-pressed', 'false');
    state.currentText = els.readerContent.innerText || '';
    renderTextAsync(state.currentText, () => {
      scheduleWordCountUpdate();
      ui.announceLive('Changes kept for this session. Reading mode restored.');
      ui.showStatus('Edits kept for this session.', 'success');
    }, { suppressLoader: Boolean(options.suppressRenderLoader) });
  }

  function toggleEditing() {
    if (state.isEditing) saveAndExitEditMode();
    else enterEditMode();
  }

  function insertPlainTextAtSelection(text) {
    if (!text || !els.readerContent) return;
    const selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0 || !els.readerContent.contains(selection.anchorNode)) {
      els.readerContent.appendChild(document.createTextNode(text));
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function handlePlainTextEditPaste(event) {
    if (!state.isEditing || !els.readerContent || event.currentTarget !== els.readerContent) return;
    event.preventDefault();
    const clipboard = event.clipboardData || window.clipboardData;
    insertPlainTextAtSelection(clipboard ? clipboard.getData('text/plain') : '');
  }

  function toggleFocus() {
    if (!els.toolbar || !els.backBtn || !els.wordCount || !els.focusRestore || !els.focusBtn) return;
    state.focusMode = !state.focusMode;
    document.body.classList.toggle('focus-mode-active', state.focusMode);
    if (state.focusMode) {
      if (isMobileSheetLayout()) collapseMobileSheet();
      els.toolbar.classList.add('force-hidden');
      els.backBtn.classList.add('force-hidden');
      els.wordCount.classList.add('force-hidden');
      els.focusRestore.classList.add('show');
      els.focusBtn.setAttribute('aria-pressed', 'true');
      els.focusBtn.setAttribute('aria-label', 'Show UI');
      els.focusBtn.setAttribute('title', 'Show UI');
      ui.setContainerFocusable(els.toolbar, false);
      window.clearTimeout(state.toolbarTimer);
      ui.announceLive('Focus mode activated. UI controls hidden.');
      return;
    }
    els.toolbar.classList.remove('force-hidden');
    els.backBtn.classList.remove('force-hidden');
    els.wordCount.classList.remove('force-hidden');
    els.focusRestore.classList.remove('show');
    els.focusBtn.setAttribute('aria-pressed', 'false');
    els.focusBtn.setAttribute('aria-label', 'Hide UI');
    els.focusBtn.setAttribute('title', 'Hide UI');
    ui.setContainerFocusable(els.toolbar, true);
    resetToolbarTimer();
    ui.announceLive('Focus mode deactivated. UI controls visible.');
  }

  function resetToolbarTimer() {
    if (state.focusMode || state.isEditing || !els.toolbar) return;
    if (isMobileSheetLayout()) {
      window.clearTimeout(state.toolbarTimer);
      ui.setContainerFocusable(els.toolbar, els.toolbar.classList.contains('expanded'));
      return;
    }
    els.toolbar.classList.remove('hidden-bar');
    ui.setContainerFocusable(els.toolbar, true);
    window.clearTimeout(state.toolbarTimer);
    state.toolbarTimer = window.setTimeout(() => {
      if (state.isEditing) return;
      if (els.toolbar.contains(document.activeElement)) return;
      els.toolbar.classList.add('hidden-bar');
      ui.setContainerFocusable(els.toolbar, false);
    }, 3500);
  }

  function updateMarginOnResize() {
    const settings = getSettings();
    if (settings && els.marginInput) settings.updateMarginStyle(parseFloat(els.marginInput.value));
    if (state.isEditing) updateEditingLayoutOffset();
  }

  function enterReader() {
    if (els.inputView) els.inputView.classList.add('hidden');
    if (els.readerView) els.readerView.classList.add('active');
    if (els.backBtn) els.backBtn.classList.add('show');
    if (els.toolbar) els.toolbar.classList.remove('hidden-bar', 'force-hidden', 'expanded');
    if (els.backBtn) els.backBtn.classList.remove('force-hidden');
    if (els.wordCount) els.wordCount.classList.remove('force-hidden');
    if (els.focusRestore) els.focusRestore.classList.remove('show');
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    document.body.classList.remove('mobile-sheet-active');
    if (els.mobileFab) {
      els.mobileFab.classList.add('reader-active');
      els.mobileFab.classList.remove('active');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
    state.focusMode = false;
    document.body.classList.remove('focus-mode-active');
    if (els.toolbar) ui.setContainerFocusable(els.toolbar, true);
    scheduleWordCountUpdate();
    resetToolbarTimer();
    window.setTimeout(() => window.scrollTo(0, 0), 50);
  }

  function goBack() {
    cancelPendingFileRead(context);
    if (state.isEditing) {
      saveAndExitEditMode({ suppressRenderLoader: true });
      ui.hideLoader();
    }
    if (tts.getSession().isSpeaking) tts.stopTTS();
    if (runtime.autoScroll.active) toggleAutoScroll();
    if (runtime.reader.isRulerActive) setRulerActive(false, { announce: false });
    if (ui.getFullscreenElement()) ui.toggleFullscreen();
    if (els.readerView) els.readerView.classList.remove('active');
    if (els.inputView) els.inputView.classList.remove('hidden');
    if (els.backBtn) els.backBtn.classList.remove('show', 'force-hidden');
    if (els.toolbar) {
      els.toolbar.classList.add('hidden-bar');
      els.toolbar.classList.remove('force-hidden', 'expanded');
    }
    if (els.wordCount) els.wordCount.classList.remove('force-hidden');
    if (els.focusRestore) els.focusRestore.classList.remove('show');
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    document.body.classList.remove('mobile-sheet-active');
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active', 'reader-active');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
    state.focusMode = false;
    document.body.classList.remove('focus-mode-active');
    if (els.toolbar) ui.setContainerFocusable(els.toolbar, false);
    if (els.pasteArea) els.pasteArea.value = state.currentText;
    if (els.clearBtn && els.pasteArea) els.clearBtn.style.display = els.pasteArea.value.trim() ? 'block' : 'none';
    if (els.progressBar) els.progressBar.style.width = '0%';
  }

  function loadTextFlow(text) {
    if (!text || !text.trim()) {
      ui.showStatus('Provide text input or upload a file first.', 'error');
      return;
    }
    let safeText;
    try {
      safeText = parser.enforceExtractedTextLimit(text, 'document');
    } catch (err) {
      ui.showStatus(err && err.message ? err.message : 'Unknown error', 'error');
      return;
    }
    ui.clearStatus();
    state.currentText = safeText;
    renderTextAsync(state.currentText, enterReader);
  }

  function loadFromPaste() {
    if (!els.pasteArea) return;
    cancelPendingFileRead(context);
    cancelPendingRender(context);
    ui.hideLoader();
    loadTextFlow(els.pasteArea.value);
  }

  function toggleClearBtn() {
    if (!els.clearBtn || !els.pasteArea) return;
    els.clearBtn.style.display = els.pasteArea.value.trim() ? 'block' : 'none';
  }

  function clearText() {
    cancelPendingFileRead(context);
    cancelPendingRender(context, { clearContent: true });
    ui.hideLoader();
    state.currentText = '';
    if (els.pasteArea) els.pasteArea.value = '';
    toggleClearBtn();
    ui.showStatus('Text cleared from this session.', 'success');
  }

  function setInputProgress() {
    if (!els.readerView || !els.readerView.classList.contains('active') || !els.progressBar) return;
    const winScroll = getScrollTop();
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
    els.progressBar.style.width = `${scrolled}%`;
  }

  function handleDrop(event) {
    event.preventDefault();
    if (els.inputView) els.inputView.classList.remove('drag-active');
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      parser.handleFile({ target: { files: [event.dataTransfer.files[0]], value: '' } });
    }
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    if (els.readBtn) els.readBtn.addEventListener('click', loadFromPaste);
    if (els.fileInput) els.fileInput.addEventListener('change', parser.handleFile);
    if (els.clearBtn) els.clearBtn.addEventListener('click', clearText);
    if (els.backBtn) els.backBtn.addEventListener('click', goBack);
    if (els.focusBtn) els.focusBtn.addEventListener('click', toggleFocus);
    if (els.editBtn) els.editBtn.addEventListener('click', toggleEditing);
    if (els.focusRestore) els.focusRestore.addEventListener('click', toggleFocus);
    if (els.readerContent) els.readerContent.addEventListener('paste', handlePlainTextEditPaste);
    if (els.readerContent) els.readerContent.addEventListener('mousemove', updateRulerPosition);
    if (els.readerContent) {
      els.readerContent.addEventListener('touchmove', event => {
        if (!runtime.reader.isRulerActive || event.touches.length !== 1 || !els.readingRuler) return;
        const touch = event.touches[0];
        const target = getElementTarget(document.elementFromPoint(touch.clientX, touch.clientY));
        if (!target || !els.readerContent.contains(target)) return;
        const textContainer = target.closest('p, li, h1, h2, h3, blockquote') || target;
        const rect = textContainer.getBoundingClientRect();
        const top = rect.top + getScrollTop();
        els.readingRuler.style.height = `${rect.height + 4}px`;
        els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
      }, { passive: true });
      els.readerContent.addEventListener('click', event => {
        if (state.isEditing) return;
        const target = getElementTarget(event.target);
        const wordElement = target ? target.closest('.tts-word') : null;
        if (!wordElement || !wordElement.hasAttribute('data-word-idx')) return;
        const index = parseInt(wordElement.getAttribute('data-word-idx'), 10);
        const session = tts.getSession();
        if (!Number.isNaN(index) && index >= 0 && index < session.wordMeta.length) tts.startSpeech(index);
      });
      els.readerContent.addEventListener('input', () => {
        if (!state.isEditing) return;
        window.clearTimeout(runtime.reader.editDebounceTimer);
        runtime.reader.editDebounceTimer = window.setTimeout(() => {
          runtime.reader.editDebounceTimer = null;
          if (!state.isEditing) return;
          state.currentText = els.readerContent.innerText || '';
          scheduleWordCountUpdate();
          ui.showStatus('Edits kept for this session.', 'success');
        }, 1000);
      });
    }
    if (els.inputView) {
      els.inputView.addEventListener('dragover', event => {
        event.preventDefault();
        els.inputView.classList.add('drag-active');
      });
      els.inputView.addEventListener('dragleave', event => {
        event.preventDefault();
        els.inputView.classList.remove('drag-active');
      });
      els.inputView.addEventListener('drop', handleDrop);
    }
    if (els.pasteArea) {
      els.pasteArea.addEventListener('input', () => {
        toggleClearBtn();
        ui.clearStatus();
      });
    }
    if (els.toolbar) {
      els.toolbar.addEventListener('click', resetToolbarTimer);
      els.toolbar.addEventListener('touchstart', resetToolbarTimer, { passive: true });
      els.toolbar.addEventListener('touchmove', resetToolbarTimer, { passive: true });
      els.toolbar.addEventListener('mouseenter', () => window.clearTimeout(state.toolbarTimer));
      els.toolbar.addEventListener('mouseleave', resetToolbarTimer);
      els.toolbar.addEventListener('focusin', () => window.clearTimeout(state.toolbarTimer));
      els.toolbar.addEventListener('focusout', resetToolbarTimer);
    }
    document.addEventListener('click', event => {
      if (els.readerView && els.readerView.classList.contains('active') && els.toolbar && !els.toolbar.contains(event.target) && els.backBtn && !els.backBtn.contains(event.target) && els.focusRestore && !els.focusRestore.contains(event.target) && els.tocDialog && !els.tocDialog.contains(event.target) && els.mobileFab && !els.mobileFab.contains(event.target) && els.sheetBackdrop && !els.sheetBackdrop.contains(event.target)) resetToolbarTimer();
    });
    document.addEventListener('touchstart', event => {
      if (els.readerView && els.readerView.classList.contains('active') && els.toolbar && !els.toolbar.contains(event.target) && els.backBtn && !els.backBtn.contains(event.target) && els.focusRestore && !els.focusRestore.contains(event.target) && els.tocDialog && !els.tocDialog.contains(event.target) && els.mobileFab && !els.mobileFab.contains(event.target) && els.sheetBackdrop && !els.sheetBackdrop.contains(event.target)) resetToolbarTimer();
    }, { passive: true });
    document.addEventListener('scroll', () => {
      if (els.readerView && els.readerView.classList.contains('active') && els.toolbar && els.toolbar.contains(document.activeElement)) resetToolbarTimer();
    }, { passive: true });
    document.addEventListener('keydown', event => {
      if (!els.readerView || !els.readerView.classList.contains('active')) return;
      if (event.key === 'Escape') {
        if (els.tocDialog && els.tocDialog.open) ui.closeTocDialog();
        else if (state.focusMode) toggleFocus();
        else goBack();
      }
      const settings = getSettings();
      if (event.key === 'ArrowRight' && settings && settings.canUseGlobalPresetShortcut(event)) {
        event.preventDefault();
        settings.nextPreset();
      }
      if (event.key === 'ArrowLeft' && settings && settings.canUseGlobalPresetShortcut(event)) {
        event.preventDefault();
        settings.prevPreset();
      }
    });
    if (els.fullscreenBtn) els.fullscreenBtn.addEventListener('click', ui.toggleFullscreen);
    if (els.autoScrollBtn) els.autoScrollBtn.addEventListener('click', toggleAutoScroll);
    if (els.downloadBtn) els.downloadBtn.addEventListener('click', ui.downloadText);
    document.addEventListener('fullscreenchange', ui.updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', ui.updateFullscreenButton);
    document.addEventListener('msfullscreenchange', ui.updateFullscreenButton);
    if (els.tocBtn) els.tocBtn.addEventListener('click', populateAndShowTOC);
    if (els.closeTocBtn) els.closeTocBtn.addEventListener('click', ui.closeTocDialog);
    if (els.tocDialog) {
      ui.setupFocusTrap(els.tocDialog);
      els.tocDialog.addEventListener('click', event => {
        const rect = els.tocDialog.getBoundingClientRect();
        if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) ui.closeTocDialog();
      });
      els.tocDialog.addEventListener('close', () => {
        const previous = runtime.reader.lastActiveElement;
        if (previous && document.contains(previous) && typeof previous.focus === 'function') {
          try { previous.focus({ preventScroll: true }); } catch (err) { previous.focus(); }
        }
      });
    }
    if (els.rulerBtn) els.rulerBtn.addEventListener('click', () => setRulerActive(!runtime.reader.isRulerActive));
    if (els.mobileFab) els.mobileFab.addEventListener('click', toggleMobileSheet);
    if (els.sheetBackdrop) els.sheetBackdrop.addEventListener('click', collapseMobileSheet);
    if (els.bottomSheetHandle) els.bottomSheetHandle.addEventListener('click', collapseMobileSheet);
    if (els.saveEditBannerBtn) els.saveEditBannerBtn.addEventListener('click', saveAndExitEditMode);
    window.addEventListener('scroll', setInputProgress, { passive: true });
    window.addEventListener('resize', updateMarginOnResize);
  }

  return {
    bindEvents,
    cancelPendingRender: options => cancelPendingRender(context, options),
    collapseMobileSheet,
    enterReader,
    expandMobileSheet,
    goBack,
    isMobileSheetLayout,
    loadFromPaste,
    loadTextFlow,
    renderTextAsync,
    resetToolbarTimer,
    saveAndExitEditMode,
    scheduleWordCountUpdate,
    setEditingLayoutActive,
    setRulerActive,
    toggleAutoScroll,
    toggleClearBtn,
    toggleEditing,
    toggleFocus,
    toggleMobileSheet,
    updateEditingLayoutOffset,
    updateMarginOnResize,
    updateWordCount
  };
}

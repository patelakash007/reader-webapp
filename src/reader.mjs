import { createMarkdownRenderer } from './parser.mjs';
import { clampNumber, cancelPendingFileRead, cancelPendingRender, getElementTarget, getScrollTop } from './utils.mjs';

export function createReader(context, { ui, parser, tts, getSettings }) {
  const { els, state, runtime } = context;
  let initialized = false;
  let rulerFramePending = false;
  let scrollProgressPending = false;

  function applyTextColor() {
    const settings = getSettings();
    if (settings) settings.applyTextColor(state.currentTextColor);
  }

  function renderTextAsync(text, onComplete, options = {}) {
    if (!els.readerContent) return;
    const renderId = ++runtime.reader.activeRenderId;
    if (tts && typeof tts.invalidateTokenization === 'function') {
      tts.invalidateTokenization();
    }
    const shouldShowLoader = !options.suppressLoader;
    if (shouldShowLoader) ui.showLoader('Preparing reader...');
    els.readerContent.textContent = '';

    const renderer = createMarkdownRenderer(state.smartHeadings);
    let tokens = [];
    try {
      tokens = renderer.tokenize(text);
    } catch (err) {
      if (renderId !== runtime.reader.activeRenderId) return;
      if (shouldShowLoader) ui.hideLoader();
      ui.showStatus(`Could not render this text safely: ${err && err.message ? err.message : 'Unknown error'}`, 'error');
      return;
    }
    let index = 0;

    const processChunk = () => {
      if (renderId !== runtime.reader.activeRenderId) return;
      try {
        const deadline = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) + 12;
        let charsCount = 0;
        const startIndex = index;
        while (index < tokens.length && (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) < deadline && charsCount < 30000) {
          if (renderId !== runtime.reader.activeRenderId) return;
          const token = tokens[index];
          charsCount += (token.raw ? token.raw.length : (token.text ? token.text.length : 0));
          index += 1;
        }

        if (index > startIndex) {
          const chunkTokens = tokens.slice(startIndex, index);
          chunkTokens.links = tokens.links;
          const html = renderer.renderTokens(chunkTokens, tokens.links);
          if (html && renderId === runtime.reader.activeRenderId && els.readerContent) {
            els.readerContent.insertAdjacentHTML('beforeend', html);
          }
        }
        if (renderId !== runtime.reader.activeRenderId) return;

        if (index < tokens.length) {
          if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(processChunk);
          } else {
            setTimeout(processChunk, 0);
          }
          return;
        }
        if (renderId !== runtime.reader.activeRenderId) return;
        applyTextColor();
        if (tts && typeof tts.invalidateTokenization === 'function') {
          tts.invalidateTokenization();
        }
        // Lazy tokenization: TTS tokenization runs on-demand when TTS starts, not synchronously on initial render
        if (shouldShowLoader) ui.hideLoader();
        if (onComplete && renderId === runtime.reader.activeRenderId) onComplete();
      } catch (err) {
        if (renderId !== runtime.reader.activeRenderId) return;
        if (shouldShowLoader) ui.hideLoader();
        ui.showStatus(`Could not render this text safely: ${err && err.message ? err.message : 'Unknown error'}`, 'error');
      }
    };

    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        if (renderId !== runtime.reader.activeRenderId) return;
        processChunk();
      }, 10);
    } else {
      processChunk();
    }
  }

  function updateWordCount() {
    if (!els.wordCount) return;
    const text = state.isEditing && els.readerEditor
      ? els.readerEditor.value
      : (state.currentText || (els.readerContent ? els.readerContent.textContent : ''));
    let words = 0;
    const re = /\S+/g;
    while (re.exec(text) !== null) words += 1;
    const minutes = Math.ceil(words / 238);
    const timeString = words < 238 ? '< 1 min read' : `~${minutes} min read`;
    els.wordCount.textContent = `${words.toLocaleString()} words · ${timeString}`;
  }

  function scheduleWordCountUpdate() {
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.wordCountTimer);
      state.wordCountTimer = window.setTimeout(updateWordCount, 0);
    } else {
      updateWordCount();
    }
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

  let lastRulerTarget = null;
  let lastRulerRect = null;
  let lastRulerScrollTop = 0;

  function updateRulerPosition(event) {
    if (!runtime.reader.isRulerActive || !els.readingRuler || !els.readerContent || rulerFramePending) return;
    const target = getElementTarget(event.target);
    const pageY = typeof event.pageY === 'number'
      ? event.pageY
      : (event.touches && event.touches[0] && typeof event.touches[0].pageY === 'number' ? event.touches[0].pageY : null);
    rulerFramePending = true;

    const executeUpdate = () => {
      rulerFramePending = false;
      if (!runtime.reader.isRulerActive || !els.readingRuler || !els.readerContent) return;
      const scrollTop = getScrollTop();
      if (target && els.readerContent.contains(target) &&
        (target.tagName === 'P' || target.tagName === 'LI' || target.tagName === 'H1' || target.tagName === 'H2' || target.tagName === 'H3' || target.tagName === 'H4' || target.tagName === 'H5' || target.tagName === 'H6' || target.tagName === 'BLOCKQUOTE' || target.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote'))) {
        const textContainer = target.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote') || target;
        if (textContainer !== lastRulerTarget || scrollTop !== lastRulerScrollTop || !lastRulerRect) {
          lastRulerTarget = textContainer;
          lastRulerScrollTop = scrollTop;
          lastRulerRect = textContainer.getBoundingClientRect();
        }
        const top = lastRulerRect.top + scrollTop;
        els.readingRuler.style.height = `${lastRulerRect.height + 4}px`;
        els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
      } else if (typeof pageY === 'number') {
        lastRulerTarget = null;
        lastRulerRect = null;
        const y = pageY - 14;
        els.readingRuler.style.height = '28px';
        els.readingRuler.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    };

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(executeUpdate);
    } else {
      executeUpdate();
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
      if (typeof window !== 'undefined' && window.scrollBy) window.scrollBy(0, pixelsToScroll);
      autoScroll.accumulator -= pixelsToScroll;
    }
    const viewportHeight = typeof window !== 'undefined' ? (window.innerHeight || document.documentElement.clientHeight || 0) : 0;
    const scrollHeight = typeof document !== 'undefined' && document.documentElement ? document.documentElement.scrollHeight : 0;
    const distanceToBottom = scrollHeight - getScrollTop() - viewportHeight;
    if (distanceToBottom < 1) toggleAutoScroll();
    else if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(autoScrollLoop);
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
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(autoScrollLoop);
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
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo({ top: Math.max(0, headingTop - offset), behavior: 'smooth' });
    }
  }

  function populateAndShowTOC() {
    if (!els.readerContent || !els.tocDialog || !els.tocBody) return;
    const headings = els.readerContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length === 0) {
      ui.showStatus('No headings found in this document.', 'info');
      return;
    }
    runtime.reader.lastActiveElement = typeof document !== 'undefined' ? document.activeElement : null;
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
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function toggleMobileSheet() {
    if (!els.toolbar) return;
    if (els.toolbar.classList.contains('expanded')) collapseMobileSheet();
    else expandMobileSheet();
  }

  let sheetFocusTrapListener = null;

  function expandMobileSheet() {
    runtime.reader.lastActiveElement = typeof document !== 'undefined' ? document.activeElement : null;
    if (els.toolbar) {
      els.toolbar.classList.add('expanded');
      els.toolbar.setAttribute('role', 'dialog');
      els.toolbar.setAttribute('aria-modal', 'true');
      els.toolbar.setAttribute('aria-label', 'Reading Settings');
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.add('show');
    ui.setContainerFocusable(els.toolbar, true);
    if (isMobileSheetLayout() && typeof document !== 'undefined' && document.body) {
      document.body.classList.add('mobile-sheet-active');
      if (els.toolbar) els.toolbar.scrollTop = 0;
    }
    if (els.mobileFab) {
      els.mobileFab.classList.add('active');
      els.mobileFab.setAttribute('aria-label', 'Close Reading Settings');
      els.mobileFab.setAttribute('aria-expanded', 'true');
    }

    if (els.toolbar) {
      const focusableElements = Array.from(els.toolbar.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusableElements.length > 0) {
        try { focusableElements[0].focus(); } catch (err) {}
      }

      if (!sheetFocusTrapListener) {
        sheetFocusTrapListener = event => {
          if (!els.toolbar || !els.toolbar.classList.contains('expanded')) return;
          if (event.key === 'Tab') {
            const focusables = Array.from(els.toolbar.querySelectorAll(
              'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
            )).filter(el => el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey) {
              if (document.activeElement === first || !els.toolbar.contains(document.activeElement)) {
                event.preventDefault();
                last.focus();
              }
            } else {
              if (document.activeElement === last || !els.toolbar.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
              }
            }
          }
        };
        els.toolbar.addEventListener('keydown', sheetFocusTrapListener);
      }
    }
  }

  function collapseMobileSheet() {
    if (els.toolbar) {
      els.toolbar.classList.remove('expanded');
      els.toolbar.removeAttribute('aria-modal');
      els.toolbar.removeAttribute('role');
      els.toolbar.removeAttribute('aria-label');
      if (sheetFocusTrapListener) {
        els.toolbar.removeEventListener('keydown', sheetFocusTrapListener);
        sheetFocusTrapListener = null;
      }
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    ui.setContainerFocusable(els.toolbar, false);
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mobile-sheet-active');
    }
    if (els.toolbar) els.toolbar.scrollTop = 0;
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      const targetFocus = (runtime.reader.lastActiveElement && typeof document !== 'undefined' && document.contains(runtime.reader.lastActiveElement))
        ? runtime.reader.lastActiveElement
        : els.mobileFab;
      try { targetFocus.focus(); } catch (err) {}
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
  }

  function setEditingLayoutActive(active) {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('editing-mode-active', Boolean(active));
    }
    if (active) {
      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(updateEditingLayoutOffset);
      } else {
        updateEditingLayoutOffset();
      }
      return;
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.removeProperty('--editing-banner-height');
    }
  }

  function updateEditingLayoutOffset() {
    if (!els.editingBanner || typeof document === 'undefined' || !document.body || !document.body.classList.contains('editing-mode-active')) return;
    const height = Math.ceil(els.editingBanner.getBoundingClientRect().height || 0);
    if (height > 0 && document.documentElement) {
      document.documentElement.style.setProperty('--editing-banner-height', `${height}px`);
    }
  }

  function enterEditMode() {
    if (!els.editingBanner || !els.editBtn) return;
    runtime.reader.activeRenderId += 1;
    ui.hideLoader();
    if (tts && typeof tts.stopTTS === 'function') tts.stopTTS();
    if (runtime.autoScroll.active) toggleAutoScroll();
    state.isEditing = true;
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.toolbarTimer);
      state.toolbarTimer = null;
    }
    if (els.toolbar) {
      els.toolbar.classList.remove('hidden-bar');
      ui.setContainerFocusable(els.toolbar, true);
    }
    // Dedicated editing textarea preserves raw text exactly without DOM normalization
    if (els.readerContent) els.readerContent.hidden = true;
    if (els.readerEditor) {
      els.readerEditor.hidden = false;
      els.readerEditor.value = state.currentText;
      const currentSize = ['small', 'medium', 'large', 'xl'].find(s => els.readerContent && els.readerContent.classList && els.readerContent.classList.contains(`fs-${s}`)) || 'medium';
      if (els.readerEditor.classList) {
        els.readerEditor.classList.remove('fs-small', 'fs-medium', 'fs-large', 'fs-xl');
        els.readerEditor.classList.add(`fs-${currentSize}`);
      }
      if (els.readerContent && els.readerContent.style && els.readerEditor.style) {
        if (els.readerContent.style.paddingLeft) els.readerEditor.style.paddingLeft = els.readerContent.style.paddingLeft;
        if (els.readerContent.style.paddingRight) els.readerEditor.style.paddingRight = els.readerContent.style.paddingRight;
        if (els.readerContent.style.lineHeight) els.readerEditor.style.lineHeight = els.readerContent.style.lineHeight;
        if (els.readerContent.style.letterSpacing) els.readerEditor.style.letterSpacing = els.readerContent.style.letterSpacing;
      }
      els.readerEditor.focus();
    }
    els.editingBanner.classList.add('show');
    setEditingLayoutActive(true);
    els.editBtn.innerHTML = '<span aria-hidden="true">&#x1F4BE;</span> Save';
    els.editBtn.classList.add('active');
    els.editBtn.setAttribute('title', 'Save and Exit');
    els.editBtn.setAttribute('aria-label', 'Save and Exit');
    els.editBtn.setAttribute('aria-pressed', 'true');
    ui.announceLive('Editing mode activated. Focus moved to raw reader text.');
  }

  function saveAndExitEditMode(options = {}) {
    if (!state.isEditing) return;
    const rawValue = els.readerEditor ? (els.readerEditor.value || '') : '';
    const trimmed = rawValue.trim();
    if (!trimmed) {
      cancelEditMode();
      ui.showStatus('Nothing to save — edits discarded', 'info');
      return;
    }
    try {
      parser.enforceExtractedTextLimit(rawValue, 'edited text');
    } catch (err) {
      ui.showStatus(err && err.message ? err.message : 'Text limit exceeded.', 'error');
      return;
    }

    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(runtime.reader.editDebounceTimer);
      runtime.reader.editDebounceTimer = null;
    }
    state.isEditing = false;
    state.currentText = rawValue;
    if (els.readerEditor) {
      els.readerEditor.hidden = true;
    }
    if (els.readerContent) els.readerContent.hidden = false;
    if (els.editingBanner) els.editingBanner.classList.remove('show');
    setEditingLayoutActive(false);
    if (els.editBtn) {
      els.editBtn.innerHTML = '<span aria-hidden="true">&#x270E;&#xFE0F;</span> Edit';
      els.editBtn.classList.remove('active');
      els.editBtn.setAttribute('title', 'Edit Text');
      els.editBtn.setAttribute('aria-label', 'Edit Text');
      els.editBtn.setAttribute('aria-pressed', 'false');
    }
    renderTextAsync(state.currentText, () => {
      scheduleWordCountUpdate();
      ui.announceLive('Changes kept for this session. Reading mode restored.');
      ui.showStatus('Edits kept for this session.', 'success');
    }, { suppressLoader: Boolean(options.suppressRenderLoader) });
  }

  function cancelEditMode() {
    if (!state.isEditing) return;
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(runtime.reader.editDebounceTimer);
      runtime.reader.editDebounceTimer = null;
    }
    state.isEditing = false;
    if (els.readerEditor) {
      els.readerEditor.value = '';
      els.readerEditor.hidden = true;
    }
    if (els.readerContent) els.readerContent.hidden = false;
    if (els.editingBanner) els.editingBanner.classList.remove('show');
    setEditingLayoutActive(false);
    if (els.editBtn) {
      els.editBtn.innerHTML = '<span aria-hidden="true">&#x270E;&#xFE0F;</span> Edit';
      els.editBtn.classList.remove('active');
      els.editBtn.setAttribute('title', 'Edit Text');
      els.editBtn.setAttribute('aria-label', 'Edit Text');
      els.editBtn.setAttribute('aria-pressed', 'false');
    }
    scheduleWordCountUpdate();
    ui.announceLive('Editing cancelled. Document unchanged.');
    ui.showStatus('Edits cancelled.', 'info');
  }

  function toggleEditing() {
    if (state.isEditing) saveAndExitEditMode();
    else enterEditMode();
  }

  function toggleFocus() {
    if (!els.toolbar || !els.backBtn || !els.wordCount || !els.focusRestore || !els.focusBtn) return;
    state.focusMode = !state.focusMode;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('focus-mode-active', state.focusMode);
    }
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
      if (typeof window !== 'undefined' && window.clearTimeout) {
        window.clearTimeout(state.toolbarTimer);
      }
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
      if (typeof window !== 'undefined' && window.clearTimeout) window.clearTimeout(state.toolbarTimer);
      ui.setContainerFocusable(els.toolbar, els.toolbar.classList.contains('expanded'));
      return;
    }
    els.toolbar.classList.remove('hidden-bar');
    ui.setContainerFocusable(els.toolbar, true);
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.toolbarTimer);
      state.toolbarTimer = window.setTimeout(() => {
        if (state.isEditing) return;
        if (typeof document !== 'undefined' && els.toolbar.contains(document.activeElement)) return;
        els.toolbar.classList.add('hidden-bar');
        ui.setContainerFocusable(els.toolbar, false);
      }, 3500);
    }
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
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mobile-sheet-active');
      document.body.classList.remove('focus-mode-active');
    }
    if (els.mobileFab) {
      els.mobileFab.classList.add('reader-active');
      els.mobileFab.classList.remove('active');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
    state.focusMode = false;
    if (els.toolbar) ui.setContainerFocusable(els.toolbar, true);
    scheduleWordCountUpdate();
    resetToolbarTimer();
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.setTimeout(() => window.scrollTo(0, 0), 50);
    }
  }

  function goBack() {
    cancelPendingFileRead(context);
    cancelPendingRender(context, { clearContent: true });
    if (els.wordCount) els.wordCount.textContent = '';
    if (state.isEditing) {
      cancelEditMode();
    }
    if (tts && typeof tts.invalidateTokenization === 'function') {
      tts.invalidateTokenization();
    }
    if (runtime.autoScroll.active) toggleAutoScroll();
    if (runtime.reader.isRulerActive) setRulerActive(false, { announce: false });
    if (ui.getFullscreenElement()) ui.toggleFullscreen();
    ui.hideLoader();
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
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mobile-sheet-active');
      document.body.classList.remove('focus-mode-active');
    }
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active', 'reader-active');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
    state.focusMode = false;
    if (els.toolbar) ui.setContainerFocusable(els.toolbar, false);
    if (state.textSource === 'paste' && els.pasteArea && state.currentText) {
      if (els.pasteArea.value !== state.currentText && state.currentText.length < 200000) {
        els.pasteArea.value = state.currentText;
      }
    }
    if (els.clearBtn && els.pasteArea) els.clearBtn.style.display = els.pasteArea.value.trim() ? 'block' : 'none';
    if (els.progressBar) els.progressBar.style.width = '0%';
  }

  function loadTextFlow(text, source = 'file') {
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
    state.textSource = source;
    state.currentText = safeText;
    renderTextAsync(state.currentText, enterReader);
  }

  function loadFromPaste() {
    if (!els.pasteArea) return;
    cancelPendingFileRead(context);
    cancelPendingRender(context);
    ui.hideLoader();
    loadTextFlow(els.pasteArea.value, 'paste');
  }

  function toggleClearBtn() {
    if (!els.clearBtn || !els.pasteArea) return;
    els.clearBtn.style.display = els.pasteArea.value.trim() ? 'block' : 'none';
  }

  function clearText() {
    cancelPendingFileRead(context);
    cancelPendingRender(context, { clearContent: true });
    if (tts && typeof tts.invalidateTokenization === 'function') {
      tts.invalidateTokenization();
    }
    ui.hideLoader();
    state.currentText = '';
    state.textSource = 'paste';
    if (els.pasteArea) els.pasteArea.value = '';
    toggleClearBtn();
    ui.showStatus('Text cleared from this session.', 'success');
  }

  function setInputProgress() {
    if (!els.readerView || !els.readerView.classList.contains('active') || !els.progressBar || scrollProgressPending) return;
    scrollProgressPending = true;

    const executeProgress = () => {
      scrollProgressPending = false;
      if (!els.readerView || !els.readerView.classList.contains('active') || !els.progressBar) return;
      const winScroll = getScrollTop();
      const docHeight = typeof document !== 'undefined' && document.documentElement ? document.documentElement.scrollHeight : 0;
      const clientHeight = typeof document !== 'undefined' && document.documentElement ? document.documentElement.clientHeight : 0;
      const height = docHeight - clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      els.progressBar.style.width = `${scrolled}%`;
    };

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(executeProgress);
    } else {
      executeProgress();
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    if (els.inputView) els.inputView.classList.remove('drag-active');
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
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
    if (els.readerContent) els.readerContent.addEventListener('mousemove', updateRulerPosition);
    if (els.readerContent) {
      els.readerContent.addEventListener('touchmove', event => {
        if (!runtime.reader.isRulerActive || event.touches.length !== 1 || !els.readingRuler) return;
        updateRulerPosition(event);
      }, { passive: true });
      els.readerContent.addEventListener('click', event => {
        if (state.isEditing) return;
        const session = tts && typeof tts.getSession === 'function' ? tts.getSession() : null;
        if (!session || !session.supported) return;

        if (typeof window !== 'undefined' && window.getSelection) {
          const selection = window.getSelection();
          if (selection && (!selection.isCollapsed || (selection.toString && selection.toString().length > 0))) {
            return;
          }
        }

        const target = getElementTarget(event.target);
        if (!target || target.closest('a, button')) return;

        let currentTarget = target;
        // Lazy tokenization: tokenize if not tokenized yet
        if (!session.wordMeta.length) {
          tts.tokenize();
          if (typeof document !== 'undefined' && typeof document.elementFromPoint === 'function' && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            const el = document.elementFromPoint(event.clientX, event.clientY);
            if (el) currentTarget = el;
          }
        }

        const wordElement = currentTarget.closest('.tts-word');
        if (!wordElement || !wordElement.hasAttribute('data-word-idx')) return;
        const index = parseInt(wordElement.getAttribute('data-word-idx'), 10);
        if (!Number.isNaN(index) && index >= 0 && index < session.wordMeta.length) tts.startSpeech(index);
      });
    }
    if (els.readerEditor) {
      els.readerEditor.addEventListener('input', scheduleWordCountUpdate);
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
    if (typeof document !== 'undefined') {
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
          if (els.tocDialog && els.tocDialog.open) {
            ui.closeTocDialog();
          } else if (els.toolbar && els.toolbar.classList.contains('expanded')) {
            collapseMobileSheet();
          } else if (state.isEditing) {
            cancelEditMode();
          } else if (state.focusMode) {
            toggleFocus();
          } else {
            goBack();
          }
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
      document.addEventListener('fullscreenchange', ui.updateFullscreenButton);
      document.addEventListener('webkitfullscreenchange', ui.updateFullscreenButton);
      document.addEventListener('msfullscreenchange', ui.updateFullscreenButton);
    }
    if (els.fullscreenBtn) els.fullscreenBtn.addEventListener('click', ui.toggleFullscreen);
    if (els.autoScrollBtn) els.autoScrollBtn.addEventListener('click', toggleAutoScroll);
    if (els.downloadBtn) els.downloadBtn.addEventListener('click', ui.downloadText);
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
        if (previous && typeof document !== 'undefined' && document.contains(previous) && typeof previous.focus === 'function') {
          try { previous.focus({ preventScroll: true }); } catch (err) { previous.focus(); }
        }
      });
    }
    if (els.rulerBtn) els.rulerBtn.addEventListener('click', () => setRulerActive(!runtime.reader.isRulerActive));
    if (els.mobileFab) els.mobileFab.addEventListener('click', toggleMobileSheet);
    if (els.sheetBackdrop) els.sheetBackdrop.addEventListener('click', collapseMobileSheet);
    if (els.bottomSheetHandle) els.bottomSheetHandle.addEventListener('click', collapseMobileSheet);
    if (els.saveEditBannerBtn) els.saveEditBannerBtn.addEventListener('click', () => saveAndExitEditMode());
    if (els.cancelEditBannerBtn) els.cancelEditBannerBtn.addEventListener('click', cancelEditMode);
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', setInputProgress, { passive: true });
      window.addEventListener('resize', updateMarginOnResize);
    }
  }

  return {
    bindEvents,
    cancelEditMode,
    cancelPendingRender: options => cancelPendingRender(context, options),
    collapseMobileSheet,
    enterEditMode,
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
    updateRulerPosition,
    updateWordCount
  };
}

import { clampNumber, cancelPendingFileRead, cancelPendingRender, getElementTarget, getScrollTop } from './utils.mjs';
import { createReaderRenderer } from './reader-renderer.mjs';
import { createReaderNavigation } from './reader-navigation.mjs';
import { createReaderEditor } from './reader-editor.mjs';

export function createReader(context, { ui, parser, tts, getSettings }) {
  const { els, state, runtime } = context;
  let initialized = false;
  let scrollProgressPending = false;

  function applyTextColor() {
    const settings = getSettings();
    if (settings) settings.applyTextColor(state.currentTextColor);
  }

  const renderer = createReaderRenderer(context, { ui, tts, applyTextColor });
  const { renderTextAsync, scheduleWordCountUpdate, updateWordCount } = renderer;
  const navigation = createReaderNavigation(context, {
    ui,
    getSettings,
    resetToolbarTimer: (...args) => resetToolbarTimer(...args)
  });
  const {
    collapseMobileSheet,
    expandMobileSheet,
    isMobileSheetLayout,
    setRulerActive,
    toggleAutoScroll,
    toggleFocus,
    toggleMobileSheet,
    updateRulerPosition,
    populateAndShowTOC
  } = navigation;
  const editor = createReaderEditor(context, {
    ui,
    tts,
    parser,
    renderTextAsync,
    scheduleWordCountUpdate,
    toggleAutoScroll
  });
  const { cancelEditMode, enterEditMode, saveAndExitEditMode, setEditingLayoutActive, toggleEditing, updateEditingLayoutOffset } = editor;

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
    state.activeFileName = '';
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

  function loadTextFlow(text, source = 'file', fileName = '') {
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
    state.activeFileName = source === 'file' ? (fileName || '') : '';
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

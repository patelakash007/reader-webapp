export function createReaderEditor(context, { ui, tts, parser, renderTextAsync, scheduleWordCountUpdate, toggleAutoScroll }) {
  const { els, state, runtime } = context;
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

  return { cancelEditMode, enterEditMode, saveAndExitEditMode, setEditingLayoutActive, toggleEditing, updateEditingLayoutOffset };
}

import { createAppContext } from './context.mjs';
import { collectElements } from './dom.mjs';
import { createParser } from './parser.mjs';
import { createReader } from './reader.mjs';
import { createSettings } from './settings.mjs';
import { cleanupLegacyBrowserStorage } from './storage.mjs';
import { createTTS } from './tts.mjs';
import { createUI } from './ui.mjs';
import { clampNumber } from './utils.mjs';

let initialized = false;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(err => console.warn('Service worker registration failed.', err));
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
}

function installInteractionGuards(context, reader, els) {
  const getRawEditor = () => els.readerContent && els.readerContent.querySelector('.reader-raw-editor');
  const preserveEditorBuffer = () => {
    const editor = getRawEditor();
    if (context.state.isEditing && editor && typeof editor.value === 'string') context.state.currentText = editor.value;
  };

  const completeRawEdit = (options = {}) => {
    const editor = getRawEditor();
    if (!context.state.isEditing || !editor) return false;
    context.state.currentText = editor.value;
    context.state.isEditing = false;
    els.readerContent.removeAttribute('contenteditable');
    els.readerContent.removeAttribute('role');
    els.readerContent.removeAttribute('aria-label');
    els.readerContent.removeAttribute('aria-multiline');
    if (els.editingBanner) els.editingBanner.classList.remove('show');
    reader.setEditingLayoutActive(false);
    if (els.editBtn) {
      els.editBtn.innerHTML = '<span aria-hidden="true">&#x270E;&#xFE0F;</span> Edit';
      els.editBtn.classList.remove('active');
      els.editBtn.setAttribute('title', 'Edit Text');
      els.editBtn.setAttribute('aria-label', 'Edit Text');
      els.editBtn.setAttribute('aria-pressed', 'false');
    }
    reader.renderTextAsync(context.state.currentText, () => {
      reader.scheduleWordCountUpdate();
      ui.announceLive('Changes kept for this session. Reading mode restored.');
      ui.showStatus('Edits kept for this session.', 'success');
    }, { suppressLoader: Boolean(options.suppressRenderLoader) });
    return true;
  };

  let ui = null;
  // ui is filled by the caller after construction; this closure is replaced below.
  const setUI = value => { ui = value; };

  if (els.backBtn) {
    els.backBtn.addEventListener('click', event => {
      if (!context.state.isEditing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      completeRawEdit({ suppressRenderLoader: true });
      reader.cancelPendingRender();
      reader.goBack();
    }, true);
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !els.readerView || !els.readerView.classList.contains('active')) return;
    if (els.toolbar && els.toolbar.classList.contains('expanded') && reader.isMobileSheetLayout() && !context.state.isEditing) {
      event.preventDefault();
      event.stopPropagation();
      reader.collapseMobileSheet();
      if (els.mobileFab) els.mobileFab.focus();
      return;
    }
    if (!context.state.isEditing) {
      queueMicrotask(() => reader.cancelPendingRender());
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    completeRawEdit({ suppressRenderLoader: true });
    reader.cancelPendingRender();
    reader.goBack();
  }, true);

  const handleEditButtonCapture = event => {
    if (!context.state.isEditing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    completeRawEdit();
  };
  if (els.editBtn) els.editBtn.addEventListener('click', handleEditButtonCapture, true);
  if (els.saveEditBannerBtn) els.saveEditBannerBtn.addEventListener('click', event => {
    if (!context.state.isEditing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    completeRawEdit();
  }, true);

  if (els.editBtn) {
    els.editBtn.addEventListener('click', () => {
      if (context.state.isEditing) return;
      queueMicrotask(() => {
        if (!context.state.isEditing || !els.readerContent || getRawEditor()) return;
        const editor = document.createElement('textarea');
        editor.className = 'reader-raw-editor';
        editor.value = context.state.currentText;
        editor.setAttribute('aria-label', 'Editable reader text');
        editor.setAttribute('aria-multiline', 'true');
        editor.spellcheck = false;
        editor.wrap = 'off';
        Object.assign(editor.style, { width: '100%', minHeight: '60vh', boxSizing: 'border-box', resize: 'vertical', font: 'inherit', lineHeight: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid var(--border, currentColor)', borderRadius: '8px', padding: '1rem', whiteSpace: 'pre' });
        els.readerContent.textContent = '';
        els.readerContent.appendChild(editor);
        editor.addEventListener('input', () => { context.state.currentText = editor.value; });
        editor.focus();
      });
    });
  }

  if (els.mobileFab && els.toolbar) {
    const focusable = () => Array.from(els.toolbar.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.offsetParent !== null);
    els.mobileFab.addEventListener('click', () => queueMicrotask(() => {
      const expanded = els.toolbar.classList.contains('expanded') && reader.isMobileSheetLayout();
      els.toolbar.setAttribute('role', expanded ? 'dialog' : 'region');
      els.toolbar.setAttribute('aria-modal', expanded ? 'true' : 'false');
      els.toolbar.setAttribute('aria-label', 'Reading settings');
      if (expanded) { const first = focusable()[0]; if (first) first.focus(); }
      else els.mobileFab.focus();
    }));
    document.addEventListener('keydown', event => {
      if (!reader.isMobileSheetLayout() || !els.toolbar.classList.contains('expanded') || event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, true);
  }

  return setUI;
}

export function init(documentObject = document) {
  if (initialized) return;
  initialized = true;
  const els = collectElements(documentObject);
  const context = createAppContext(els);
  const ui = createUI(context);
  const tts = createTTS(context, { ui });
  let reader;
  const parser = createParser(context, { ui, onTextLoaded: text => reader.loadTextFlow(text) });
  const settings = createSettings(context, { ui, getSettings: () => settings, isMobileSheetLayout: () => reader && reader.isMobileSheetLayout(), onResetToolbarTimer: () => reader && reader.resetToolbarTimer() });
  reader = createReader(context, { getSettings: () => settings, parser, tts, ui });
  context.onSmartHeadingsChanged = () => {
    if (!context.state.currentText || !els.readerView || !els.readerView.classList.contains('active') || context.state.isEditing) return;
    if (tts.getSession().isSpeaking) tts.stopTTS();
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    reader.renderTextAsync(context.state.currentText, () => { reader.scheduleWordCountUpdate(); window.scrollTo(0, currentScroll); });
  };
  cleanupLegacyBrowserStorage();
  registerServiceWorker();
  settings.bindEvents();
  reader.bindEvents();
  tts.bindEvents();
  const setUI = installInteractionGuards(context, reader, els);
  setUI(ui);

  settings.resetSettingsSections();
  context.state.smartHeadings = true;
  if (els.smartHeadingsInput) els.smartHeadingsInput.checked = context.state.smartHeadings;
  settings.setMode('light', { presetIndex: 0, resetTimer: false });
  settings.setSize('medium');
  reader.toggleClearBtn();
  if (els.toolbar) ui.setContainerFocusable(els.toolbar, false);
  const defaultLineHeight = 1.85;
  if (els.lineHeightInput) els.lineHeightInput.value = defaultLineHeight;
  if (els.readerContent) els.readerContent.style.lineHeight = defaultLineHeight;
  const defaultLetterSpacing = -0.015;
  if (els.letterSpacingInput) els.letterSpacingInput.value = defaultLetterSpacing;
  if (els.readerContent) els.readerContent.style.letterSpacing = `${defaultLetterSpacing}em`;
  const defaultMargin = 24;
  if (els.marginInput) els.marginInput.value = defaultMargin;
  settings.updateMarginStyle(defaultMargin);
  const defaultVoiceRate = 1.0;
  if (els.voiceRateInput) els.voiceRateInput.value = defaultVoiceRate;
  if (els.voiceRateVal) els.voiceRateVal.textContent = `${defaultVoiceRate.toFixed(1)}x`;
  if (els.audioSpeedBtn) els.audioSpeedBtn.textContent = `${defaultVoiceRate.toFixed(1)}x`;
  const defaultScrollSpeed = 0.04;
  if (els.scrollSpeedInput) els.scrollSpeedInput.value = defaultScrollSpeed;
  context.runtime.autoScroll.speed = defaultScrollSpeed;
  if (els.scrollSpeedVal) els.scrollSpeedVal.textContent = `${(defaultScrollSpeed / 0.04).toFixed(1)}x`;
  if (els.scrollSpeedInput && els.scrollSpeedVal) {
    els.scrollSpeedInput.addEventListener('input', () => {
      const next = clampNumber(els.scrollSpeedInput.value, 0.04, 0.01, 0.2);
      els.scrollSpeedInput.value = next; context.runtime.autoScroll.speed = next; els.scrollSpeedVal.textContent = `${(next / 0.04).toFixed(1)}x`;
    });
    els.scrollSpeedInput.addEventListener('change', () => { const next = clampNumber(els.scrollSpeedInput.value, 0.04, 0.01, 0.2); ui.announceLive(`Auto-scroll speed changed to ${(next / 0.04).toFixed(1)}x.`); });
  }
  tts.initializeVoices();
  return { context, parser, reader, settings, tts, ui };
}

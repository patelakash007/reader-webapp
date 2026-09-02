// app.js - Single entry point, app lifecycle, event orchestration, and module wiring

import * as utils from './utils.js';
import * as storage from './storage.js';
import * as settings from './settings.js';
import * as parser from './parser.js';
import * as ui from './ui.js';
import * as tts from './tts.js';
import * as reader from './reader.js';

// Carousel drag & state variables
let isDraggingCarousel = false;
let dragStartX = 0;
let dragCurrentX = 0;
let dragStartIndex = 0;
let carouselWidth = 1;
let lastCarouselDragDistance = 0;
let editDebounceTimer = null;
let lastActiveElement = null;

function getCarouselWidth() {
  return ui.els.presetWindow ? (ui.els.presetWindow.getBoundingClientRect().width || 1) : 1;
}

function updateCarouselDrag() {
  if (!isDraggingCarousel || !ui.els.presetTrack) return;

  let dx = dragCurrentX - dragStartX;
  const list = settings.getPresets();
  if ((dragStartIndex === 0 && dx > 0) || 
      (dragStartIndex === list.length - 1 && dx < 0)) {
    dx = dx * 0.35; // Rubber band bounds constraint
  }

  const pct = (dx / carouselWidth) * 100;
  ui.els.presetTrack.style.transform = `translate3d(${(-dragStartIndex * 100) + pct}%, 0, 0)`;
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(updateCarouselDrag);
  }
}

function startCarouselDrag(x) {
  if (!ui.els.presetTrack) return;
  carouselWidth = getCarouselWidth();
  dragStartX = x;
  dragCurrentX = x;
  dragStartIndex = settings.getCurrentPresetIndex();
  isDraggingCarousel = true;
  lastCarouselDragDistance = 0;
  ui.els.presetTrack.classList.remove('snapping');
  ui.els.presetTrack.classList.add('dragging');
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(updateCarouselDrag);
  }
}

function endCarouselDrag() {
  if (!isDraggingCarousel) return;

  isDraggingCarousel = false;
  const dx = dragCurrentX - dragStartX;
  lastCarouselDragDistance = Math.abs(dx);
  const threshold = carouselWidth * 0.18;
  const list = settings.getPresets();
  let nextIndex = settings.getCurrentPresetIndex();

  if (dx < -threshold && nextIndex < list.length - 1) nextIndex++;
  else if (dx > threshold && nextIndex > 0) nextIndex--;

  settings.applyPreset(nextIndex);
}

// ===== Flow Controls & Workflows =====

export function toggleClearBtn() {
  if (!ui.els.clearBtn || !ui.els.pasteArea) return;
  const hasInputText = Boolean(ui.els.pasteArea.value.trim());
  ui.els.clearBtn.style.display = hasInputText ? 'block' : 'none';
  ui.toggleClearBtn();
}

export function clearText() {
  parser.cancelPendingFileRead();
  reader.cancelPendingRender({ clearContent: true });
  ui.hideLoader();
  reader.setCurrentText('');
  if (ui.els.pasteArea) ui.els.pasteArea.value = '';
  toggleClearBtn();
  ui.showStatus('Text cleared from this session.', 'success');
}

export function enterReader() {
  if (ui.els.inputView) ui.els.inputView.classList.add('hidden');
  if (ui.els.readerView) ui.els.readerView.classList.add('active');
  if (ui.els.backBtn) ui.els.backBtn.classList.add('show');
  if (ui.els.toolbar) ui.els.toolbar.classList.remove('hidden-bar', 'force-hidden', 'expanded');
  if (ui.els.backBtn) ui.els.backBtn.classList.remove('force-hidden');
  if (ui.els.wordCount) ui.els.wordCount.classList.remove('force-hidden');
  if (ui.els.focusRestore) ui.els.focusRestore.classList.remove('show');
  if (ui.els.sheetBackdrop) ui.els.sheetBackdrop.classList.remove('show');
  if (typeof document !== 'undefined') {
    document.body.classList.remove('mobile-sheet-active');
    document.body.classList.remove('focus-mode-active');
  }
  if (ui.els.mobileFab) {
    ui.els.mobileFab.classList.add('reader-active');
    ui.els.mobileFab.classList.remove('active');
    ui.els.mobileFab.setAttribute('aria-expanded', 'false');
    ui.els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
  }
  settings.resetSettingsSections();
  
  if (ui.els.toolbar) ui.setContainerFocusable(ui.els.toolbar, true);
  reader.scheduleWordCountUpdate();
  ui.resetToolbarTimer();

  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
  }
}

export function loadText(text) {
  if (!text || !text.trim()) {
    ui.showStatus('Provide text input or upload a file first.', 'error');
    return;
  }

  let safeText;
  try {
    safeText = parser.enforceExtractedTextLimit(text, 'document');
  } catch (err) {
    ui.showStatus(utils.formatError(err), 'error');
    return;
  }

  ui.clearStatus();
  reader.setCurrentText(safeText);
  reader.renderTextAsync(safeText, enterReader);
}

export const loadTextFlow = loadText;

export function loadFromPaste() {
  if (ui.els.pasteArea) {
    parser.cancelPendingFileRead();
    reader.cancelPendingRender();
    ui.hideLoader();
    loadText(ui.els.pasteArea.value);
  }
}

export async function handleFile(event) {
  const target = event && event.target ? event.target : null;
  const file = target && target.files && target.files[0];
  if (!file) return;

  const extension = parser.getExtension(file.name);
  const readToken = parser.beginFileRead();
  reader.cancelPendingRender();
  ui.clearStatus();

  // Production guard: prevent out-of-bounds file size crashes before parsing.
  if (file.size > parser.MAX_FILE_SIZE) {
    ui.hideLoader();
    ui.showStatus(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`, 'error');
    if (target && 'value' in target) target.value = '';
    return;
  }

  if (file.size === 0) {
    ui.hideLoader();
    ui.showStatus(`File "${file.name}" is empty.`, 'error');
    if (target && 'value' in target) target.value = '';
    return;
  }

  try {
    if (!parser.SUPPORTED_EXTENSIONS.has(extension)) {
      throw new Error('Unsupported format. Please upload TXT, Markdown (.md or .markdown), PDF, or DOCX documents.');
    }

    const text = await parser.readSelectedFile(file, extension, readToken);
    parser.assertActiveFileRead(readToken);
    ui.hideLoader();
    loadText(text);
  } catch (err) {
    if (parser.isStaleReadError(err) || !parser.isActiveFileRead(readToken)) return;
    ui.hideLoader();
    ui.showStatus(`Failed to read "${file.name}": ${utils.formatError(err)}`, 'error');
  } finally {
    if (target && 'value' in target) target.value = '';
  }
}

export function goBack() {
  parser.cancelPendingFileRead();
  if (reader.isEditing()) {
    reader.saveAndExitEditMode({ suppressRenderLoader: true });
    ui.hideLoader();
  }
  if (tts.isPlayingOrPaused()) tts.stopTTS();
  if (reader.isAutoScrolling()) reader.toggleAutoScroll();
  if (reader.isRulerActive()) reader.setRulerActive(false, { announce: false });
  if (ui.getFullscreenElement()) ui.toggleFullscreen();

  if (ui.els.readerView) ui.els.readerView.classList.remove('active');
  if (ui.els.inputView) ui.els.inputView.classList.remove('hidden');
  if (ui.els.backBtn) ui.els.backBtn.classList.remove('show');
  if (ui.els.toolbar) {
    ui.els.toolbar.classList.add('hidden-bar');
    ui.els.toolbar.classList.remove('force-hidden', 'expanded');
  }
  if (ui.els.backBtn) ui.els.backBtn.classList.remove('force-hidden');
  if (ui.els.wordCount) ui.els.wordCount.classList.remove('force-hidden');
  if (ui.els.focusRestore) ui.els.focusRestore.classList.remove('show');
  if (ui.els.sheetBackdrop) ui.els.sheetBackdrop.classList.remove('show');
  if (typeof document !== 'undefined') {
    document.body.classList.remove('mobile-sheet-active');
    document.body.classList.remove('focus-mode-active');
  }
  if (ui.els.mobileFab) {
    ui.els.mobileFab.classList.remove('active', 'reader-active');
    ui.els.mobileFab.setAttribute('aria-expanded', 'false');
    ui.els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
  }
  settings.resetSettingsSections();
  
  if (reader.isFocusMode()) {
    reader.toggleFocus();
  }
  if (ui.els.toolbar) ui.setContainerFocusable(ui.els.toolbar, false);
  if (ui.els.pasteArea) ui.els.pasteArea.value = reader.getCurrentText();
  toggleClearBtn();
  if (ui.els.progressBar) ui.els.progressBar.style.width = '0%';
}

// ===== Event Binding Orchestration =====

export function bindEvents() {
  if (ui.els.readBtn) ui.els.readBtn.addEventListener('click', loadFromPaste);
  if (ui.els.fileInput) ui.els.fileInput.addEventListener('change', handleFile);
  if (ui.els.clearBtn) ui.els.clearBtn.addEventListener('click', clearText);
  if (ui.els.backBtn) ui.els.backBtn.addEventListener('click', goBack);
  if (ui.els.focusBtn) ui.els.focusBtn.addEventListener('click', reader.toggleFocus);
  if (ui.els.editBtn) ui.els.editBtn.addEventListener('click', reader.toggleEditing);
  if (ui.els.focusRestore) ui.els.focusRestore.addEventListener('click', reader.toggleFocus);
  if (ui.els.modeLight) ui.els.modeLight.addEventListener('click', () => settings.setMode('light'));
  if (ui.els.modeDark) ui.els.modeDark.addEventListener('click', () => settings.setMode('dark'));
  
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-size]').forEach(button => {
      button.addEventListener('click', () => settings.setSize(button.getAttribute('data-size')));
    });
  }

  if (ui.els.presetWindow) {
    ui.els.presetWindow.addEventListener('touchstart', event => {
      if (event.touches.length === 1 && settings.canStartPresetGesture(event.target)) {
        startCarouselDrag(event.touches[0].clientX);
      }
    }, { passive: true });
    ui.els.presetWindow.addEventListener('touchmove', event => {
      if (isDraggingCarousel && event.touches && event.touches[0]) {
        dragCurrentX = event.touches[0].clientX;
      }
    }, { passive: true });
    ui.els.presetWindow.addEventListener('touchend', endCarouselDrag, { passive: true });
    ui.els.presetWindow.addEventListener('mousedown', event => {
      if (settings.canStartPresetGesture(event.target)) {
        startCarouselDrag(event.clientX);
      }
    });
    ui.els.presetWindow.addEventListener('click', event => {
      if (utils.isBlockedGestureTarget(event.target) || utils.hasSelectedText()) return;
      if (isDraggingCarousel) return;
      if (lastCarouselDragDistance > 5) {
        lastCarouselDragDistance = 0;
        return;
      }
      const target = utils.getElementTarget(event.target);
      const card = target ? target.closest('.preset-card') : null;
      if (!card) return;
      settings.applyPreset(card.getAttribute('data-index'));
    });
    ui.els.presetWindow.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        settings.nextPreset();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        settings.prevPreset();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        settings.applyPreset(settings.getCurrentPresetIndex());
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', event => {
      if (isDraggingCarousel) dragCurrentX = event.clientX;
    });
    window.addEventListener('mouseup', endCarouselDrag);
  }

  if (ui.els.arrowLeft) ui.els.arrowLeft.addEventListener('click', settings.prevPreset);
  if (ui.els.arrowRight) ui.els.arrowRight.addEventListener('click', settings.nextPreset);

  if (ui.els.readerContent) {
    settings.attachGestureArea(ui.els.readerContent);
    ui.els.readerContent.addEventListener('paste', reader.handlePlainTextEditPaste);
    
    // Real-time input debouncing for inline editor
    ui.els.readerContent.addEventListener('input', () => {
      if (!reader.isEditing()) return;

      if (typeof window !== 'undefined') {
        window.clearTimeout(editDebounceTimer);
        editDebounceTimer = window.setTimeout(() => {
          editDebounceTimer = null;
          if (!reader.isEditing()) return;
          const text = ui.els.readerContent.innerText || '';
          reader.setCurrentText(text);
          reader.scheduleWordCountUpdate();
          ui.showStatus('Edits kept for this session.', 'success');
        }, 1000);
      }
    });

    // Reading ruler movement
    ui.els.readerContent.addEventListener('mousemove', reader.updateRulerPosition);
    ui.els.readerContent.addEventListener('touchmove', (e) => {
      if (!reader.isRulerActive() || e.touches.length !== 1 || !ui.els.readingRuler) return;
      const touch = e.touches[0];
      const target = utils.getElementTarget(document.elementFromPoint(touch.clientX, touch.clientY));
      if (target && ui.els.readerContent.contains(target)) {
        const textContainer = target.closest('p, li, h1, h2, h3, blockquote') || target;
        const rect = textContainer.getBoundingClientRect();
        const scrollTop = utils.getScrollTop();
        const top = rect.top + scrollTop;
        ui.els.readingRuler.style.height = `${rect.height + 4}px`;
        ui.els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
      }
    }, { passive: true });

    // Click-to-speak on document words
    ui.els.readerContent.addEventListener('click', (event) => {
      if (reader.isEditing()) return;
      const target = utils.getElementTarget(event.target);
      const wordEl = target ? target.closest('.tts-word') : null;
      if (wordEl && wordEl.hasAttribute('data-word-idx')) {
        const idx = parseInt(wordEl.getAttribute('data-word-idx'), 10);
        if (!isNaN(idx) && idx >= 0) {
          tts.startSpeech(idx);
        }
      }
    });
  }

  if (ui.els.wordCount) {
    settings.attachGestureArea(ui.els.wordCount);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', () => {
      if (!ui.els.readerView || !ui.els.readerView.classList.contains('active') || !ui.els.progressBar) return;

      const winScroll = utils.getScrollTop();
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      ui.els.progressBar.style.width = `${scrolled}%`;
    }, { passive: true });
  }

  if (ui.els.inputView) {
    ui.els.inputView.addEventListener('dragover', event => {
      event.preventDefault();
      ui.els.inputView.classList.add('drag-active');
    });
    ui.els.inputView.addEventListener('dragleave', event => {
      event.preventDefault();
      ui.els.inputView.classList.remove('drag-active');
    });
    ui.els.inputView.addEventListener('drop', event => {
      event.preventDefault();
      ui.els.inputView.classList.remove('drag-active');
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        handleFile({ target: { files: [event.dataTransfer.files[0]], value: '' } });
      }
    });
  }

  if (ui.els.pasteArea) {
    ui.els.pasteArea.addEventListener('input', () => {
      toggleClearBtn();
      ui.clearStatus();
    });
  }

  if (ui.els.toolbar) {
    ui.els.toolbar.addEventListener('click', ui.resetToolbarTimer);
    ui.els.toolbar.addEventListener('touchstart', ui.resetToolbarTimer, { passive: true });
    ui.els.toolbar.addEventListener('touchmove', ui.resetToolbarTimer, { passive: true });
    ui.els.toolbar.addEventListener('mouseenter', ui.clearToolbarTimer);
    ui.els.toolbar.addEventListener('mouseleave', ui.resetToolbarTimer);
    ui.els.toolbar.addEventListener('focusin', ui.clearToolbarTimer);
    ui.els.toolbar.addEventListener('focusout', ui.resetToolbarTimer);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      if (ui.els.readerView && ui.els.readerView.classList.contains('active')
        && ui.els.toolbar && !ui.els.toolbar.contains(event.target)
        && ui.els.backBtn && !ui.els.backBtn.contains(event.target)
        && ui.els.focusRestore && !ui.els.focusRestore.contains(event.target)
        && ui.els.tocDialog && !ui.els.tocDialog.contains(event.target)
        && ui.els.mobileFab && !ui.els.mobileFab.contains(event.target)
        && ui.els.sheetBackdrop && !ui.els.sheetBackdrop.contains(event.target)) {
        ui.resetToolbarTimer();
      }
    });

    document.addEventListener('touchstart', event => {
      if (ui.els.readerView && ui.els.readerView.classList.contains('active')
        && ui.els.toolbar && !ui.els.toolbar.contains(event.target)
        && ui.els.backBtn && !ui.els.backBtn.contains(event.target)
        && ui.els.focusRestore && !ui.els.focusRestore.contains(event.target)
        && ui.els.tocDialog && !ui.els.tocDialog.contains(event.target)
        && ui.els.mobileFab && !ui.els.mobileFab.contains(event.target)
        && ui.els.sheetBackdrop && !ui.els.sheetBackdrop.contains(event.target)) {
        ui.resetToolbarTimer();
      }
    }, { passive: true });

    document.addEventListener('scroll', () => {
      if (!ui.els.readerView || !ui.els.readerView.classList.contains('active')) return;
      if (ui.els.toolbar && ui.els.toolbar.contains(document.activeElement)) ui.resetToolbarTimer();
    }, { passive: true });

    document.addEventListener('keydown', event => {
      if (!ui.els.readerView || !ui.els.readerView.classList.contains('active')) return;
      if (event.key === 'Escape') {
        if (ui.els.tocDialog && ui.els.tocDialog.open) ui.closeTocDialog();
        else if (reader.isFocusMode()) reader.toggleFocus();
        else goBack();
      }
      if (event.key === 'ArrowRight' && settings.canUseGlobalPresetShortcut(event)) {
        event.preventDefault();
        settings.nextPreset();
      }
      if (event.key === 'ArrowLeft' && settings.canUseGlobalPresetShortcut(event)) {
        event.preventDefault();
        settings.prevPreset();
      }
    });
  }

  if (ui.els.fullscreenBtn) ui.els.fullscreenBtn.addEventListener('click', ui.toggleFullscreen);
  if (ui.els.autoScrollBtn) ui.els.autoScrollBtn.addEventListener('click', reader.toggleAutoScroll);
  if (ui.els.ttsBtn) ui.els.ttsBtn.addEventListener('click', tts.toggleTTS);
  if (ui.els.ttsStopBtn) ui.els.ttsStopBtn.addEventListener('click', tts.stopTTS);
  if (ui.els.audioPlayPauseBtn) ui.els.audioPlayPauseBtn.addEventListener('click', tts.toggleTTS);
  if (ui.els.audioStopBtn) ui.els.audioStopBtn.addEventListener('click', tts.stopTTS);
  if (ui.els.audioSpeedBtn) ui.els.audioSpeedBtn.addEventListener('click', tts.cycleVoiceSpeed);
  if (ui.els.downloadBtn) ui.els.downloadBtn.addEventListener('click', () => reader.downloadText(reader.getCurrentText()));

  if (ui.els.voiceSelect) {
    ui.els.voiceSelect.addEventListener('change', () => {
      const state = tts.getTTSState();
      if (state.state === tts.STATE_PLAYING) {
        tts.restartFromWord(state.currentWordIndex >= 0 ? state.currentWordIndex : 0);
      }
    });
  }
  
  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', () => {
      ui.updateFullscreenButton();
    });
    document.addEventListener('webkitfullscreenchange', () => {
      ui.updateFullscreenButton();
    });
    document.addEventListener('msfullscreenchange', () => {
      ui.updateFullscreenButton();
    });
  }

  // TOC Dialog and focus restoration
  if (ui.els.tocBtn) {
    ui.els.tocBtn.addEventListener('click', () => {
      if (typeof document !== 'undefined') {
        lastActiveElement = document.activeElement;
      }
      reader.populateAndShowTOC();
    });
  }
  if (ui.els.closeTocBtn) ui.els.closeTocBtn.addEventListener('click', ui.closeTocDialog);
  if (ui.els.tocDialog) {
    ui.setupFocusTrap(ui.els.tocDialog);
    ui.els.tocDialog.addEventListener('click', (e) => {
      const rect = ui.els.tocDialog.getBoundingClientRect();
      if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
        ui.closeTocDialog();
      }
    });
    ui.els.tocDialog.addEventListener('close', () => {
      if (lastActiveElement && document.contains(lastActiveElement) && typeof lastActiveElement.focus === 'function') {
        try {
          lastActiveElement.focus({ preventScroll: true });
        } catch (err) {
          lastActiveElement.focus();
        }
      }
    });
  }

  // Reading Ruler button
  if (ui.els.rulerBtn) ui.els.rulerBtn.addEventListener('click', reader.toggleRuler);

  // Settings Section accordions
  if (ui.els.settingsSectionToggles) {
    ui.els.settingsSectionToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        settings.toggleSettingsSection(toggle.closest('[data-settings-section]'));
      });
    });
  }

  // Sliders Typography Range Hooks
  if (ui.els.lineHeightInput) {
    ui.els.lineHeightInput.addEventListener('input', () => {
      const val = utils.clampNumber(ui.els.lineHeightInput.value, 1.85, 1.4, 2.6);
      ui.els.lineHeightInput.value = val;
      if (ui.els.readerContent) ui.els.readerContent.style.lineHeight = val;
    });
  }

  if (ui.els.letterSpacingInput) {
    ui.els.letterSpacingInput.addEventListener('input', () => {
      const val = utils.clampNumber(ui.els.letterSpacingInput.value, -0.015, -0.03, 0.15);
      ui.els.letterSpacingInput.value = val;
      if (ui.els.readerContent) ui.els.readerContent.style.letterSpacing = `${val}em`;
    });
  }

  if (ui.els.marginInput) {
    ui.els.marginInput.addEventListener('input', () => {
      const val = utils.clampNumber(ui.els.marginInput.value, 24, 12, 80);
      ui.els.marginInput.value = val;
      reader.updateMarginStyle(val);
    });
  }

  if (ui.els.smartHeadingsInput) {
    ui.els.smartHeadingsInput.addEventListener('change', () => {
      const enabled = ui.els.smartHeadingsInput.checked;
      reader.setSmartHeadings(enabled);
      ui.announceLive(`Smart headings ${enabled ? 'enabled' : 'disabled'}.`);

      const currentText = reader.getCurrentText();
      if (currentText && ui.els.readerView && ui.els.readerView.classList.contains('active') && !reader.isEditing()) {
        const currentScroll = utils.getScrollTop();
        reader.renderTextAsync(currentText, () => {
          reader.scheduleWordCountUpdate();
          if (typeof window !== 'undefined') {
            window.scrollTo(0, currentScroll);
          }
        });
      }
    });
  }
  
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (ui.els.marginInput) {
        reader.updateMarginStyle(parseFloat(ui.els.marginInput.value));
      }
      if (reader.isEditing()) {
        ui.updateEditingLayoutOffset();
      }
    });
  }

  if (ui.els.voiceRateInput && ui.els.voiceRateVal) {
    ui.els.voiceRateInput.addEventListener('input', () => {
      const val = utils.clampNumber(ui.els.voiceRateInput.value, 1.0, 0.5, 2.5);
      ui.els.voiceRateInput.value = val;
      ui.els.voiceRateVal.textContent = `${val.toFixed(1)}x`;
      if (ui.els.audioSpeedBtn) ui.els.audioSpeedBtn.textContent = `${val.toFixed(1)}x`;
      ui.announceLive(`Speech speed changed to ${val.toFixed(1)}x.`);
    });
    ui.els.voiceRateInput.addEventListener('change', () => {
      const state = tts.getTTSState();
      if (state.state === tts.STATE_PLAYING) {
        tts.restartFromWord(state.currentWordIndex >= 0 ? state.currentWordIndex : 0);
      }
    });
  }

  if (ui.els.scrollSpeedInput && ui.els.scrollSpeedVal) {
    ui.els.scrollSpeedInput.addEventListener('input', () => {
      const val = utils.clampNumber(ui.els.scrollSpeedInput.value, 0.04, 0.01, 0.2);
      ui.els.scrollSpeedInput.value = val;
      reader.setAutoScrollSpeed(val);
      ui.els.scrollSpeedVal.textContent = `${(val / 0.04).toFixed(1)}x`;
      ui.announceLive(`Auto-scroll speed changed to ${(val / 0.04).toFixed(1)}x.`);
    });
  }

  // Mobile Bottom Sheet Event listeners
  if (ui.els.mobileFab) ui.els.mobileFab.addEventListener('click', settings.toggleMobileSheet);
  if (ui.els.sheetBackdrop) ui.els.sheetBackdrop.addEventListener('click', settings.collapseMobileSheet);
  if (ui.els.bottomSheetHandle) ui.els.bottomSheetHandle.addEventListener('click', settings.collapseMobileSheet);

  // Save Banner triggers
  if (ui.els.saveEditBannerBtn) ui.els.saveEditBannerBtn.addEventListener('click', () => reader.saveAndExitEditMode());
}

// ===== Application Bootstrap =====

export function init() {
  storage.cleanupLegacyBrowserStorage();
  ui.registerServiceWorker();
  ui.initUIElements();
  bindEvents();
  settings.resetSettingsSections();

  reader.setSmartHeadings(true);
  if (ui.els.smartHeadingsInput) ui.els.smartHeadingsInput.checked = true;

  settings.setMode('light', { presetIndex: 0, resetTimer: false });
  settings.setSize('medium');
  toggleClearBtn();
  if (ui.els.toolbar) ui.setContainerFocusable(ui.els.toolbar, false);

  const defaultLineHeight = 1.85;
  if (ui.els.lineHeightInput) ui.els.lineHeightInput.value = defaultLineHeight;
  if (ui.els.readerContent) ui.els.readerContent.style.lineHeight = defaultLineHeight;

  const defaultLetterSpacing = -0.015;
  if (ui.els.letterSpacingInput) ui.els.letterSpacingInput.value = defaultLetterSpacing;
  if (ui.els.readerContent) ui.els.readerContent.style.letterSpacing = `${defaultLetterSpacing}em`;

  const defaultMargin = 24;
  if (ui.els.marginInput) ui.els.marginInput.value = defaultMargin;
  reader.updateMarginStyle(defaultMargin);

  const defaultVoiceRate = 1.0;
  if (ui.els.voiceRateInput) ui.els.voiceRateInput.value = defaultVoiceRate;
  if (ui.els.voiceRateVal) ui.els.voiceRateVal.textContent = `${defaultVoiceRate.toFixed(1)}x`;
  if (ui.els.audioSpeedBtn) ui.els.audioSpeedBtn.textContent = `${defaultVoiceRate.toFixed(1)}x`;

  const defaultScrollSpeed = 0.04;
  if (ui.els.scrollSpeedInput) ui.els.scrollSpeedInput.value = defaultScrollSpeed;
  reader.setAutoScrollSpeed(defaultScrollSpeed);
  if (ui.els.scrollSpeedVal) ui.els.scrollSpeedVal.textContent = `${(defaultScrollSpeed / 0.04).toFixed(1)}x`;

  tts.initTTS();
}

export async function initApp() {
  init();
}

export function bindGlobalEventListeners() {
  bindEvents();
}

export function registerServiceWorker() {
  return ui.registerServiceWorker();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

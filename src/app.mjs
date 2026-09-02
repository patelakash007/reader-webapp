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

  const register = () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .catch(err => {
        console.warn('Service worker registration failed.', err);
      });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export function init(documentObject = document) {
  if (initialized) return;
  initialized = true;

  const els = collectElements(documentObject);
  const context = createAppContext(els);
  const ui = createUI(context);
  const tts = createTTS(context, { ui });
  let reader;
  const parser = createParser(context, {
    ui,
    onTextLoaded: text => reader.loadTextFlow(text)
  });
  const settings = createSettings(context, {
    ui,
    getSettings: () => settings,
    isMobileSheetLayout: () => reader && reader.isMobileSheetLayout(),
    onResetToolbarTimer: () => reader && reader.resetToolbarTimer()
  });
  reader = createReader(context, {
    getSettings: () => settings,
    parser,
    tts,
    ui
  });
  context.onSmartHeadingsChanged = () => {
    if (!context.state.currentText || !els.readerView || !els.readerView.classList.contains('active') || context.state.isEditing) return;
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    reader.renderTextAsync(context.state.currentText, () => {
      reader.scheduleWordCountUpdate();
      window.scrollTo(0, currentScroll);
    });
  };

  cleanupLegacyBrowserStorage();
  registerServiceWorker();
  settings.bindEvents();
  reader.bindEvents();
  tts.bindEvents();

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
      els.scrollSpeedInput.value = next;
      context.runtime.autoScroll.speed = next;
      if (els.scrollSpeedVal) els.scrollSpeedVal.textContent = `${(next / 0.04).toFixed(1)}x`;
      ui.announceLive(`Auto-scroll speed changed to ${(next / 0.04).toFixed(1)}x.`);
    });
  }

  tts.initializeVoices();
  return { context, parser, reader, settings, tts, ui };
}

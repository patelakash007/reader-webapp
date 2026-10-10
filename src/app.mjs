import { createAppContext } from './context.mjs';
import { collectElements } from './dom.mjs';
import { createParser } from './parser.mjs';
import { createReader } from './reader.mjs';
import { createSettings } from './settings.mjs';
import { cleanupLegacyBrowserStorage } from './storage.mjs';
import { createTTS } from './tts.mjs';
import { createUI } from './ui.mjs';

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
  const parser = createParser(context, { ui });
  let reader;
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

  cleanupLegacyBrowserStorage();
  registerServiceWorker();
  settings.bindEvents();
  reader.bindEvents();
  tts.bindEvents();

  settings.resetSettingsSections();
  context.state.smartHeadings = true;
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

  tts.initializeVoices();
  return { context, parser, reader, settings, tts, ui };
}

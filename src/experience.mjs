const PREFS_KEY = 'reader.webapp.preferences.v2';
const SESSION_KEY = 'reader.webapp.last-session.v1';
const MAX_SAVED_SESSION = 250000;

const PRESET_PROFILES = {
  light: [
    { key: 'claude', size: 18.2, weight: 460, leading: 1.82, measure: 720, paragraph: 1.12, letter: -0.008, heading: 1.08 },
    { key: 'zen', size: 18.6, weight: 420, leading: 1.94, measure: 690, paragraph: 1.18, letter: -0.004, heading: 1.06 },
    { key: 'stark', size: 18.0, weight: 560, leading: 1.72, measure: 700, paragraph: 1.02, letter: 0.002, heading: 1.0 },
    { key: 'book', size: 20.0, weight: 450, leading: 1.83, measure: 730, paragraph: 1.24, letter: 0, heading: 1.04 },
    { key: 'classic', size: 19.0, weight: 455, leading: 1.80, measure: 740, paragraph: 1.22, letter: -0.004, heading: 1.03 },
    { key: 'kindle', size: 19.4, weight: 430, leading: 1.87, measure: 720, paragraph: 1.20, letter: -0.002, heading: 1.05 },
    { key: 'github', size: 16.9, weight: 450, leading: 1.78, measure: 780, paragraph: 1.05, letter: -0.01, heading: 1.01 },
    { key: 'amber', size: 18.5, weight: 520, leading: 1.82, measure: 700, paragraph: 1.10, letter: 0, heading: 1.02 },
    { key: 'newspaper', size: 18.4, weight: 460, leading: 1.77, measure: 750, paragraph: 1.16, letter: -0.006, heading: 1.02 },
    { key: 'lavender', size: 18.9, weight: 430, leading: 1.92, measure: 720, paragraph: 1.20, letter: 0.002, heading: 1.05 }
  ],
  dark: [
    { key: 'night', size: 18.2, weight: 420, leading: 1.88, measure: 710, paragraph: 1.14, letter: 0, heading: 1.06 },
    { key: 'void', size: 18.0, weight: 450, leading: 1.82, measure: 690, paragraph: 1.08, letter: -0.004, heading: 1.04 },
    { key: 'carbon', size: 18.2, weight: 450, leading: 1.84, measure: 720, paragraph: 1.12, letter: -0.004, heading: 1.04 },
    { key: 'midnight', size: 19.2, weight: 430, leading: 1.90, measure: 720, paragraph: 1.20, letter: -0.002, heading: 1.06 },
    { key: 'obsidian', size: 18.0, weight: 440, leading: 1.86, measure: 700, paragraph: 1.14, letter: 0, heading: 1.05 },
    { key: 'dracula', size: 17.0, weight: 450, leading: 1.80, measure: 780, paragraph: 1.02, letter: -0.012, heading: 1.02 },
    { key: 'nord', size: 18.4, weight: 420, leading: 1.91, measure: 720, paragraph: 1.16, letter: 0, heading: 1.06 },
    { key: 'catppuccin', size: 18.7, weight: 430, leading: 1.93, measure: 700, paragraph: 1.18, letter: 0.002, heading: 1.06 },
    { key: 'forest', size: 18.3, weight: 430, leading: 1.90, measure: 710, paragraph: 1.16, letter: -0.002, heading: 1.06 },
    { key: 'ink', size: 19.2, weight: 425, leading: 1.91, measure: 730, paragraph: 1.20, letter: -0.004, heading: 1.05 }
  ]
};

const FONT_BY_KEY = {
  book: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  classic: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  kindle: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  newspaper: 'Iowan Old Style, "Palatino Linotype", Palatino, Georgia, serif',
  github: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  dracula: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
};

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getSelectedPreset(documentObject) {
  const card = documentObject.querySelector('#presetTrack .preset-card[aria-hidden="false"]');
  return card ? slugify(card.querySelector('.preset-name')?.textContent || '') : null;
}

function getMode(context) {
  return context.state.currentMode === 'dark' ? 'dark' : 'light';
}

function applyPresetProfile(context, presetKey, mode) {
  const root = document.documentElement;
  const profile = PRESET_PROFILES[mode]?.find(item => item.key === presetKey) || PRESET_PROFILES[mode]?.[0];
  if (!profile) return;

  root.style.setProperty('--reading-size', `${profile.size}px`);
  root.style.setProperty('--reading-weight', String(profile.weight));
  root.style.setProperty('--reading-leading', String(profile.leading));
  root.style.setProperty('--reading-measure', `${profile.measure}px`);
  root.style.setProperty('--reading-paragraph', `${profile.paragraph}em`);
  root.style.setProperty('--reading-letter', `${profile.letter}em`);
  root.style.setProperty('--reading-heading-scale', String(profile.heading));
  root.style.setProperty('--reader-side-padding', `clamp(18px, 4vw, ${Math.max(34, Math.min(profile.measure * 0.075, 72))}px)`);
  root.style.setProperty('--reading-font', FONT_BY_KEY[presetKey] || 'var(--body-font)');
  document.body.dataset.readingPreset = presetKey;
  document.body.dataset.readingMode = mode;
}

function restorePreferences(context, api) {
  const saved = readJSON(PREFS_KEY);
  if (!saved) return;
  try {
    const mode = saved.mode === 'dark' ? 'dark' : 'light';
    const index = Number.isInteger(saved.presetIndex) ? saved.presetIndex : 0;
    api.settings.setMode(mode, { presetIndex: index, resetTimer: false });
    if (saved.size) api.settings.setSize(saved.size);
    if (Number.isFinite(saved.lineHeight)) api.settings.setLineHeight(saved.lineHeight);
    if (Number.isFinite(saved.letterSpacing)) api.settings.setLetterSpacing(saved.letterSpacing);
    if (Number.isFinite(saved.margin)) api.settings.updateMarginStyle(saved.margin);
    if (api.els?.voiceRateInput && Number.isFinite(saved.voiceRate)) {
      api.els.voiceRateInput.value = String(saved.voiceRate);
      api.els.voiceRateInput.dispatchEvent(new Event('input'));
    }
  } catch (_) {
    // Preferences are deliberately best-effort.
  }
}

function persistPreferences(context, api) {
  const mode = getMode(context);
  const cards = Array.from(api.els.presetTrack?.querySelectorAll('.preset-card') || []);
  const selectedIndex = cards.findIndex(card => card.getAttribute('aria-hidden') === 'false');
  writeJSON(PREFS_KEY, {
    mode,
    presetIndex: selectedIndex >= 0 ? selectedIndex : context.state.currentPresetIndex,
    size: ['small', 'medium', 'large', 'xl'].find(size => api.els.readerContent?.classList.contains(`fs-${size}`)) || 'medium',
    lineHeight: Number(api.els.lineHeightInput?.value) || 1.85,
    letterSpacing: Number(api.els.letterSpacingInput?.value) || -0.015,
    margin: Number(api.els.marginInput?.value) || 24,
    voiceRate: Number(api.els.voiceRateInput?.value) || 1.0,
    savedAt: Date.now()
  });
}

function persistCurrentSession(context) {
  const text = String(context.state.currentText || '').slice(0, MAX_SAVED_SESSION);
  if (!text.trim()) return;
  writeJSON(SESSION_KEY, {
    text,
    source: context.state.textSource || 'session',
    savedAt: Date.now()
  });
}

function restoreSession(api) {
  const saved = readJSON(SESSION_KEY);
  if (!saved?.text) return;
  const age = Date.now() - Number(saved.savedAt || 0);
  if (age > 30 * 24 * 60 * 60 * 1000) return;
  if (api.els.pasteArea && !api.els.pasteArea.value.trim()) {
    api.els.pasteArea.value = saved.text;
    api.reader.toggleClearBtn();
    api.ui.showStatus('Last reading session restored locally. Press Read Text to continue.', 'info');
  }
}

function wirePrimaryControls(api) {
  const button = api.els.mobileFab;
  const toolbar = api.els.toolbar;
  if (!button || !toolbar) return;

  const isCompact = () => window.matchMedia?.('(max-width: 760px)').matches;
  const isToolbarVisible = () => isCompact()
    ? toolbar.classList.contains('expanded')
    : (!toolbar.classList.contains('hidden-bar') && !toolbar.classList.contains('force-hidden'));
  const updateLabel = expanded => {
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', expanded ? 'Hide Reading Controls' : 'Show Reading Controls');
    button.title = expanded ? 'Hide Reading Controls' : 'Show Reading Controls';
    button.innerHTML = expanded ? '<span class="control-toggle-icon" aria-hidden="true">&#10005;</span><span class="control-toggle-label">Close</span>' : '<span class="control-toggle-icon" aria-hidden="true">&#9881;</span><span class="control-toggle-label">Controls</span>';
  };

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const expanded = isToolbarVisible();
    if (isCompact()) {
      if (expanded) api.reader.collapseMobileSheet();
      else api.reader.expandMobileSheet();
      updateLabel(!expanded);
    } else if (toolbar.classList.contains('force-hidden')) {
      api.reader.toggleFocus();
      updateLabel(true);
    } else {
      if (expanded) {
        toolbar.classList.add('hidden-bar');
        api.ui.setContainerFocusable(toolbar, false);
      } else {
        api.reader.resetToolbarTimer();
      }
      updateLabel(!expanded);
    }
  }, true);

  updateLabel(isToolbarVisible());

  const syncVisibility = () => {
    updateLabel(isToolbarVisible());
  };
  const observer = new MutationObserver(syncVisibility);
  observer.observe(toolbar, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', syncVisibility, { passive: true });
}

function wirePresetSystem(context, api) {
  const track = api.els.presetTrack;
  if (!track) return;
  let raf = 0;
  const sync = () => {
    raf = 0;
    const mode = getMode(context);
    const key = getSelectedPreset(document) || PRESET_PROFILES[mode][context.state.currentPresetIndex]?.key || PRESET_PROFILES[mode][0].key;
    applyPresetProfile(context, key, mode);
    persistPreferences(context, api);
  };
  const observer = new MutationObserver(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sync);
  });
  observer.observe(track, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
  sync();

  api.els.settingsDrawer?.addEventListener('click', event => {
    if (event.target.closest('.preset-arrow, .mode-btn, .preset-card, .preset-dot')) requestAnimationFrame(sync);
  });
}

function wireLocalPersistence(context, api) {
  const target = api.els.settingsDrawer || document;
  target.addEventListener('input', () => {
    window.clearTimeout(context.runtime.experiencePrefsTimer);
    context.runtime.experiencePrefsTimer = window.setTimeout(() => persistPreferences(context, api), 80);
  });
  target.addEventListener('change', () => persistPreferences(context, api));

  const wrapLoad = api.reader.loadTextFlow.bind(api.reader);
  api.reader.loadTextFlow = (...args) => {
    const result = wrapLoad(...args);
    window.setTimeout(() => persistCurrentSession(context), 100);
    return result;
  };
  const wrapSave = api.reader.saveAndExitEditMode.bind(api.reader);
  api.reader.saveAndExitEditMode = (...args) => {
    const result = wrapSave(...args);
    window.setTimeout(() => persistCurrentSession(context), 150);
    return result;
  };
  window.addEventListener('beforeunload', () => {
    persistPreferences(context, api);
    persistCurrentSession(context);
  });
}

function wireNetworkStatus(api) {
  const update = () => {
    const offline = navigator.onLine === false;
    document.body.classList.toggle('is-offline', offline);
    if (offline) api.ui.showStatus('Offline mode · files and preferences remain on this device.', 'info');
  };
  window.addEventListener('online', update, { passive: true });
  window.addEventListener('offline', update, { passive: true });
  update();
}

export function installReaderExperience(context, api) {
  if (!context || !api?.reader || context.runtime.experienceInstalled) return;
  context.runtime.experienceInstalled = true;
  api.els = context.els;
  restorePreferences(context, api);
  restoreSession(api);
  wirePrimaryControls(api);
  wirePresetSystem(context, api);
  wireLocalPersistence(context, api);
  wireNetworkStatus(api);
}

// storage.js - LocalStorage access & legacy cleanup

export const LEGACY_STORAGE_KEYS = [
  'reader_text',
  'reader_scroll',
  'reader_size',
  'reader_mode',
  'reader_preset_index',
  'reader_font',
  'reader_theme',
  'reader_textcolor',
  'reader_smart_headings',
  'reader_remember_document',
  'reader_lineheight',
  'reader_letterspacing',
  'reader_margin',
  'reader_voice_rate',
  'reader_voice_uri',
  'reader_scroll_speed'
];

export function isStorageAvailable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch (err) {
    return false;
  }
}

export function cleanupLegacyBrowserStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const store = window.localStorage;
    LEGACY_STORAGE_KEYS.forEach(key => {
      try {
        store.removeItem(key);
      } catch (err) {}
    });
  } catch (err) {
    console.warn('Unable to clean up legacy reader storage.', err);
  }
}

export function getItem(key, fallback = null) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const val = window.localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch (err) {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    return false;
  }
}

export function removeItem(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.removeItem(key);
    return true;
  } catch (err) {
    return false;
  }
}

export function getStorageItem(key, fallback = null) {
  return getItem(key, fallback);
}

export function setStorageItem(key, value) {
  return setItem(key, value);
}

export function removeStorageItem(key) {
  return removeItem(key);
}

export function purgeLegacyStorageKeys() {
  return cleanupLegacyBrowserStorage();
}

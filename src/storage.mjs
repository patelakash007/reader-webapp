const LEGACY_KEYS = [
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

export function cleanupLegacyBrowserStorage() {
  try {
    const legacyStore = window.localStorage;
    if (!legacyStore) return;
    LEGACY_KEYS.forEach(key => legacyStore.removeItem(key));
  } catch (err) {
    console.warn('Unable to clean up legacy reader storage.', err);
  }
}

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
  if (typeof window === 'undefined') return;

  const stores = new Set();
  for (const storeName of ['localStorage', 'sessionStorage']) {
    try {
      const store = window[storeName];
      if (store) stores.add(store);
    } catch (error) {
      // Storage can be unavailable in restricted browser contexts. Continue with
      // the other storage area rather than abandoning all cleanup.
    }
  }

  stores.forEach(store => {
    LEGACY_KEYS.forEach(key => {
      try {
        store.removeItem(key);
      } catch (error) {
        // Storage can become unavailable or reject writes between access and use.
      }
    });
  });
}

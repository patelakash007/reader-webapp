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
    const stores = [];
    if (typeof window !== 'undefined') {
      if (window.localStorage) stores.push(window.localStorage);
      if (window.sessionStorage) stores.push(window.sessionStorage);
    }
    stores.forEach(store => {
      LEGACY_KEYS.forEach(key => {
        try { store.removeItem(key); } catch (e) {}
      });
      try {
        const keysToRemove = [];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key && (key.startsWith('reader_') || key.startsWith('reader-') || key.startsWith('reader:'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => {
          try { store.removeItem(k); } catch (e) {}
        });
      } catch (e) {}
    });
  } catch (err) {
    console.warn('Unable to clean up legacy reader storage.', err);
  }
}

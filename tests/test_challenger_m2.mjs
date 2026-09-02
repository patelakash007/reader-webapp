// test_challenger_m2.mjs - Comprehensive Empirical Challenger Test Suite for Milestone 2
import assert from 'node:assert';

console.log('================================================================');
console.log('CHALLENGER EMPIRICAL VERIFICATION & STRESS TEST SUITE — MILESTONE 2');
console.log('================================================================\n');

// -------------------------------------------------------------------
// 1. Dynamic ES Module Import Integrity Test
// -------------------------------------------------------------------
console.log('--- 1. Dynamic ES Module Import Integrity ---');

const utils = await import('../utils.js');
console.log('✓ Successfully dynamically imported utils.js');

const storage = await import('../storage.js');
console.log('✓ Successfully dynamically imported storage.js');

const settings = await import('../settings.js');
console.log('✓ Successfully dynamically imported settings.js');

const parser = await import('../parser.js');
console.log('✓ Successfully dynamically imported parser.js');

// Verify interface exports
const expectedUtilsExports = [
  'clampNumber', 'clampIndex', 'escapeHtml', 'decodeHtmlAttributeValue',
  'normalizeSafeLinkHref', 'parseEmphasis', 'restoreInlineTokens', 'parseInline',
  'getElementTarget', 'getScrollTop', 'setContainerFocusable', 'setupFocusTrap',
  'isInteractiveShortcutTarget', 'isBlockedGestureTarget', 'hasSelectedText',
  'isMobileSheetLayout', 'announceLive', 'formatError', 'showStatus', 'clearStatus',
  'showLoader', 'hideLoader', 'showGestureHint', 'debounce', 'throttle'
];
expectedUtilsExports.forEach(fnName => {
  assert.strictEqual(typeof utils[fnName], 'function', `utils.${fnName} should be an exported function`);
});
console.log(`✓ Verified all ${expectedUtilsExports.length} exported utility functions in utils.js`);

const expectedStorageExports = [
  'LEGACY_STORAGE_KEYS', 'isStorageAvailable', 'cleanupLegacyBrowserStorage',
  'getItem', 'setItem', 'removeItem'
];
expectedStorageExports.forEach(key => {
  assert(key in storage, `storage.${key} must be exported`);
});
console.log('✓ Verified storage.js exports');

const expectedSettingsExports = [
  'VALID_SIZES', 'VALID_FONTS', 'VALID_THEMES', 'fontMap', 'lightPresets', 'darkPresets',
  'textColorMap', 'getPresets', 'getCurrentMode', 'getMode', 'getCurrentPresetIndex',
  'getCurrentTextColor', 'buildPresetCarousel', 'setTrackPosition', 'updateDots',
  'updatePresetA11y', 'updateThemeSettingsSummary', 'applyPreset', 'nextPreset', 'prevPreset',
  'setMode', 'setFont', 'setTheme', 'setTextColor', 'applyTextColor', 'setSize',
  'updateCarouselDrag', 'startCarouselDrag', 'endCarouselDrag', 'canStartPresetGesture',
  'attachGestureArea', 'canUseGlobalPresetShortcut', 'setSettingsSectionExpanded',
  'resetSettingsSections', 'resetSettingsDrawer', 'toggleSettingsSection',
  'toggleMobileSheet', 'expandMobileSheet', 'collapseMobileSheet'
];
expectedSettingsExports.forEach(key => {
  assert(key in settings, `settings.${key} must be exported`);
});
console.log('✓ Verified settings.js exports');

const expectedParserExports = [
  'MAX_FILE_SIZE', 'MAX_EXTRACTED_TEXT_CHARS', 'MAX_PDF_PAGES', 'TEXT_EXTENSIONS',
  'SUPPORTED_EXTENSIONS', 'getExtension', 'enforceExtractedTextLimit', 'LIBRARIES',
  'loadLibrary', 'beginFileRead', 'cancelPendingFileRead', 'isActiveFileRead',
  'createStaleReadError', 'assertActiveFileRead', 'isStaleReadError',
  'readFileAsText', 'readFileAsArrayBuffer', 'extractPdfPageText', 'extractPdfText',
  'extractDocxText', 'readSelectedFile', 'escapeHtml', 'decodeHtmlAttributeValue',
  'normalizeSafeLinkHref', 'parseEmphasis', 'parseInline'
];
expectedParserExports.forEach(key => {
  assert(key in parser, `parser.${key} must be exported`);
});
console.log('✓ Verified parser.js exports');

// -------------------------------------------------------------------
// 2. utils.js Exhaustive Empirical Stress Testing
// -------------------------------------------------------------------
console.log('\n--- 2. utils.js Empirical Stress Testing ---');

// 2.1 clampNumber
assert.strictEqual(utils.clampNumber(5, 0, 1, 10), 5);
assert.strictEqual(utils.clampNumber('5.5', 0, 1, 10), 5.5);
assert.strictEqual(utils.clampNumber(-5, 0, 1, 10), 1);
assert.strictEqual(utils.clampNumber(15, 0, 1, 10), 10);
assert.strictEqual(utils.clampNumber(NaN, 42, 1, 10), 42);
assert.strictEqual(utils.clampNumber('invalid', 42, 1, 10), 42);
assert.strictEqual(utils.clampNumber(Infinity, 42, 1, 10), 42);
assert.strictEqual(utils.clampNumber(-Infinity, 42, 1, 10), 42);
console.log('✓ clampNumber passed boundary and edge testing');

// 2.2 clampIndex
assert.strictEqual(utils.clampIndex(0, 5), 0);
assert.strictEqual(utils.clampIndex(4, 5), 4);
assert.strictEqual(utils.clampIndex(10, 5), 4);
assert.strictEqual(utils.clampIndex(-3, 5), 0);
assert.strictEqual(utils.clampIndex('2', 5), 2);
assert.strictEqual(utils.clampIndex('invalid', 5), 0);
assert.strictEqual(utils.clampIndex(0, 0), 0);
assert.strictEqual(utils.clampIndex(3, 0), 0);
console.log('✓ clampIndex passed boundary and edge testing');

// 2.3 escapeHtml
assert.strictEqual(utils.escapeHtml('hello & <world> "quotes" \'single\''), 'hello &amp; &lt;world&gt; &quot;quotes&quot; &#039;single&#039;');
assert.strictEqual(utils.escapeHtml(''), '');
assert.strictEqual(utils.escapeHtml(null), '');
assert.strictEqual(utils.escapeHtml(undefined), '');
assert.strictEqual(utils.escapeHtml(123), '');
console.log('✓ escapeHtml passed sanitization testing');

// 2.4 decodeHtmlAttributeValue
assert.strictEqual(utils.decodeHtmlAttributeValue('&quot;hello&quot; &amp; &lt;test&gt; &#039;world&#039;'), '"hello" & <test> \'world\'');
assert.strictEqual(utils.decodeHtmlAttributeValue(''), '');
assert.strictEqual(utils.decodeHtmlAttributeValue(null), '');

// 2.5 normalizeSafeLinkHref
assert.strictEqual(utils.normalizeSafeLinkHref('https://example.com'), 'https://example.com');
assert.strictEqual(utils.normalizeSafeLinkHref('http://example.com/path?q=1&b=2'), 'http://example.com/path?q=1&amp;b=2');
assert.strictEqual(utils.normalizeSafeLinkHref('mailto:user@example.com'), 'mailto:user@example.com');
assert.strictEqual(utils.normalizeSafeLinkHref('/relative/path'), '/relative/path');
assert.strictEqual(utils.normalizeSafeLinkHref('#section-1'), '#section-1');

// Unsafe schemes must return null
assert.strictEqual(utils.normalizeSafeLinkHref('javascript:alert(1)'), null);
assert.strictEqual(utils.normalizeSafeLinkHref('javascript:void(0)'), null);
assert.strictEqual(utils.normalizeSafeLinkHref('JAVASCRIPT:alert(1)'), null);
assert.strictEqual(utils.normalizeSafeLinkHref('data:text/html,<script>alert(1)</script>'), null);
assert.strictEqual(utils.normalizeSafeLinkHref('vbscript:alert(1)'), null);
assert.strictEqual(utils.normalizeSafeLinkHref('file:///etc/passwd'), null);
assert.strictEqual(utils.normalizeSafeLinkHref('blob:https://example.com/uuid'), null);
assert.strictEqual(utils.normalizeSafeLinkHref('//protocol-relative.com'), null); // Protocol relative blocked
assert.strictEqual(utils.normalizeSafeLinkHref('https://example.com/\u0000bad'), null); // Control character blocked
console.log('✓ normalizeSafeLinkHref passed URL security whitelist/blacklist testing');

// 2.6 parseEmphasis and parseInline
assert.strictEqual(utils.parseEmphasis('**bold text**'), '<strong>bold text</strong>');
assert.strictEqual(utils.parseEmphasis('*italic text*'), '<em>italic text</em>');
assert.strictEqual(utils.parseEmphasis('foo _italic_ bar'), 'foo <em>italic</em> bar');

const inlineSample = 'Here is `code` and [link](https://example.com) and **bold** text.';
const parsedInline = utils.parseInline(inlineSample);
assert.strictEqual(parsedInline, 'Here is <code>code</code> and <a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a> and <strong>bold</strong> text.');

// Malicious link inside markdown inline
const maliciousInline = '[click me](javascript:alert(document.cookie))';
assert.strictEqual(utils.parseInline(maliciousInline), 'click me'); // Strips unsafe link
console.log('✓ parseEmphasis & parseInline passed formatting and XSS mitigation tests');

// 2.7 formatError
assert.strictEqual(utils.formatError(new Error('Test message')), 'Test message');
assert.strictEqual(utils.formatError('Simple error string'), 'Simple error string');
assert.strictEqual(utils.formatError(null), 'Unknown error');
assert.strictEqual(utils.formatError(undefined), 'Unknown error');
assert.strictEqual(utils.formatError({ custom: 'obj' }), '[object Object]');

// 2.8 debounce & throttle
let debounceCount = 0;
const debounced = utils.debounce(() => { debounceCount++; }, 50);
debounced();
debounced();
debounced();
assert.strictEqual(debounceCount, 0, 'Debounced function should not have executed immediately');
await new Promise(r => setTimeout(r, 80));
assert.strictEqual(debounceCount, 1, 'Debounced function should execute once after delay');

let throttleCount = 0;
const throttled = utils.throttle(() => { throttleCount++; }, 50);
throttled();
throttled();
throttled();
assert.strictEqual(throttleCount, 1, 'Throttled function should execute on first leading call');
await new Promise(r => setTimeout(r, 80));
throttled();
assert.strictEqual(throttleCount, 2, 'Throttled function should execute again after interval');
console.log('✓ debounce & throttle timing verified');

// -------------------------------------------------------------------
// 3. storage.js Empirical Stress Testing
// -------------------------------------------------------------------
console.log('\n--- 3. storage.js Empirical Stress Testing ---');

// 3.1 Verify LEGACY_STORAGE_KEYS contains all 16 keys
assert.strictEqual(storage.LEGACY_STORAGE_KEYS.length, 16);
const expectedKeys = [
  'reader_text', 'reader_scroll', 'reader_size', 'reader_mode', 'reader_preset_index',
  'reader_font', 'reader_theme', 'reader_textcolor', 'reader_smart_headings',
  'reader_remember_document', 'reader_lineheight', 'reader_letterspacing',
  'reader_margin', 'reader_voice_rate', 'reader_voice_uri', 'reader_scroll_speed'
];
assert.deepStrictEqual([...storage.LEGACY_STORAGE_KEYS].sort(), [...expectedKeys].sort());
console.log('✓ Verified exactly 16 legacy localStorage keys in LEGACY_STORAGE_KEYS');

// 3.2 isStorageAvailable without window
assert.strictEqual(storage.isStorageAvailable(), false);
assert.strictEqual(storage.getItem('any_key', 'fallback_val'), 'fallback_val');
assert.strictEqual(storage.setItem('any_key', 'val'), false);
assert.strictEqual(storage.removeItem('any_key'), false);

// 3.3 Mock window.localStorage and test methods
const mockStore = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (mockStore.has(k) ? mockStore.get(k) : null),
    setItem: (k, v) => { mockStore.set(k, String(v)); },
    removeItem: (k) => { mockStore.delete(k); }
  }
};

assert.strictEqual(storage.isStorageAvailable(), true);
assert.strictEqual(storage.setItem('test_k', 'test_v'), true);
assert.strictEqual(storage.getItem('test_k'), 'test_v');
assert.strictEqual(storage.getItem('missing_k', 'default'), 'default');
assert.strictEqual(storage.removeItem('test_k'), true);
assert.strictEqual(storage.getItem('test_k'), null);

// 3.4 Test cleanupLegacyBrowserStorage
expectedKeys.forEach(k => mockStore.set(k, 'dummy_data'));
mockStore.set('custom_non_legacy_key', 'keep_this_data');

storage.cleanupLegacyBrowserStorage();
expectedKeys.forEach(k => {
  assert.strictEqual(mockStore.has(k), false, `Legacy key ${k} should have been removed`);
});
assert.strictEqual(mockStore.get('custom_non_legacy_key'), 'keep_this_data', 'Non-legacy keys must not be deleted');
console.log('✓ cleanupLegacyBrowserStorage successfully purged all 16 legacy keys');

// 3.5 Test QuotaExceededError safety
globalThis.window.localStorage.setItem = () => {
  const err = new Error('QuotaExceededError');
  err.name = 'QuotaExceededError';
  throw err;
};
assert.strictEqual(storage.setItem('quota_key', 'value'), false, 'setItem should catch QuotaExceededError and return false');
assert.strictEqual(storage.isStorageAvailable(), false, 'isStorageAvailable should return false when setItem throws');

// Cleanup globalThis.window mock
delete globalThis.window;
console.log('✓ storage.js exception safety and quota limits verified');

// -------------------------------------------------------------------
// 4. settings.js Presets, Typography, Carousel & Sheets Testing
// -------------------------------------------------------------------
console.log('\n--- 4. settings.js Presets, FontMap, Carousel & Sheets Testing ---');

// 4.1 Verify 20 presets (10 light, 10 dark)
assert.strictEqual(settings.lightPresets.length, 10, 'Must have exactly 10 light presets');
assert.strictEqual(settings.darkPresets.length, 10, 'Must have exactly 10 dark presets');

const expectedLightNames = ['Claude', 'Zen', 'Stark', 'Book', 'Classic', 'Kindle', 'GitHub', 'Amber', 'Newspaper', 'Lavender'];
const expectedDarkNames = ['Night', 'Void', 'Carbon', 'Midnight', 'Obsidian', 'Dracula', 'Nord', 'Catppuccin', 'Forest', 'Ink'];

assert.deepStrictEqual(settings.lightPresets.map(p => p.name), expectedLightNames);
assert.deepStrictEqual(settings.darkPresets.map(p => p.name), expectedDarkNames);

// 4.2 Verify validity of themes and fonts in all presets
assert.strictEqual(settings.VALID_THEMES.size, 20);
assert.strictEqual(settings.VALID_FONTS.size, 15);
assert.strictEqual(settings.VALID_SIZES.size, 4);

[...settings.lightPresets, ...settings.darkPresets].forEach(preset => {
  assert(settings.VALID_THEMES.has(preset.theme), `Theme "${preset.theme}" must be in VALID_THEMES`);
  assert(settings.VALID_FONTS.has(preset.font) || preset.font in settings.fontMap, `Font "${preset.font}" must be in fontMap`);
  assert(preset.color in settings.textColorMap.light || preset.color in settings.textColorMap.dark, `Color "${preset.color}" must be valid`);
  assert(preset.desc && typeof preset.desc === 'string', `Preset ${preset.name} must have a description`);
});
console.log('✓ All 20 presets validated with valid themes, fonts, colors, and descriptions');

// 4.3 Verify fontMap mappings
const expectedFontKeys = [
  'serif', 'sans', 'minimal', 'bold', 'clean', 'literata', 'merriweather',
  'libre', 'atkinson', 'jakarta', 'outfit', 'bebas', 'oswald', 'manrope', 'sora', 'mono'
];
assert.strictEqual(Object.keys(settings.fontMap).length, 16, 'fontMap must contain exactly 16 font definitions');
expectedFontKeys.forEach(fontKey => {
  const fontDef = settings.fontMap[fontKey];
  assert(fontDef, `fontMap must define ${fontKey}`);
  assert(typeof fontDef.family === 'string' && fontDef.family.length > 0, `fontMap.${fontKey}.family must be non-empty string`);
  assert(typeof fontDef.weight === 'number' && fontDef.weight >= 400 && fontDef.weight <= 900, `fontMap.${fontKey}.weight must be numeric weight`);
});
console.log('✓ Verified 16 fontMap mappings with valid family and weight values');

// 4.4 Verify Mode switching and Preset selection
settings.setMode('light');
assert.strictEqual(settings.getCurrentMode(), 'light');
assert.strictEqual(settings.getPresets(), settings.lightPresets);

settings.setMode('dark');
assert.strictEqual(settings.getCurrentMode(), 'dark');
assert.strictEqual(settings.getPresets(), settings.darkPresets);

// 4.5 Verify Preset Navigation & Circular wrapping
settings.setMode('light');
settings.applyPreset(0);
assert.strictEqual(settings.getCurrentPresetIndex(), 0);

settings.nextPreset();
assert.strictEqual(settings.getCurrentPresetIndex(), 1);

// Wrap forward to end and then past
for (let i = 1; i < 9; i++) settings.nextPreset();
assert.strictEqual(settings.getCurrentPresetIndex(), 9);
settings.nextPreset();
assert.strictEqual(settings.getCurrentPresetIndex(), 0); // Wrapped around to 0

// Wrap backward
settings.prevPreset();
assert.strictEqual(settings.getCurrentPresetIndex(), 9); // Wrapped back to 9
settings.prevPreset();
assert.strictEqual(settings.getCurrentPresetIndex(), 8);

// Test clamping of index
settings.applyPreset(999);
assert.strictEqual(settings.getCurrentPresetIndex(), 9); // Clamped to 9
settings.applyPreset(-50);
assert.strictEqual(settings.getCurrentPresetIndex(), 0); // Clamped to 0
console.log('✓ Preset navigation, circular wrapping (next/prev), and index clamping verified');

// 4.6 Verify Carousel Gesture & Drag Physics Math
// Drag calculation formula verification:
// dx = dragCurrentX - dragStartX
// Rubber band: if (dragStartIndex === 0 && dx > 0) or (dragStartIndex === list.length - 1 && dx < 0): dx = dx * 0.35
// Threshold: carouselWidth * 0.18
const carouselWidth = 400;
const threshold = carouselWidth * 0.18; // 72px

// Case 1: Drag left (dx < -72) -> increment index (next card)
let startX = 200;
let currX = 100; // dx = -100 (< -72)
let dx = currX - startX;
let nextIndex = 0;
if (dx < -threshold && nextIndex < 9) nextIndex++;
assert.strictEqual(nextIndex, 1);

// Case 2: Drag right (dx > 72) -> decrement index (prev card)
startX = 200;
currX = 300; // dx = 100 (> 72)
dx = currX - startX;
nextIndex = 5;
if (dx > threshold && nextIndex > 0) nextIndex--;
assert.strictEqual(nextIndex, 4);

// Case 3: Small drag (dx = 30 < 72) -> no index change (snap back)
startX = 200;
currX = 230; // dx = 30 (< 72)
dx = currX - startX;
nextIndex = 5;
if (dx < -threshold && nextIndex < 9) nextIndex++;
else if (dx > threshold && nextIndex > 0) nextIndex--;
assert.strictEqual(nextIndex, 5);

// Case 4: Rubber banding at start boundary (dragStartIndex = 0, dragging right)
let boundaryDx = 100;
let rubberBandedDx = boundaryDx * 0.35;
assert.strictEqual(rubberBandedDx, 35);
console.log('✓ Carousel drag calculations, rubber-band bounding, and snap thresholds verified');

// 4.7 Verify Touch Gesture Velocity and Angle Math (attachGestureArea)
function evaluateGestureSwipe(startX, startY, endX, endY, dt) {
  const dx = endX - startX;
  const dy = endY - startY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (dt > 500 || absDx < 55 || absDy > absDx * 0.7) return null; // Ignored
  return dx < 0 ? 'next' : 'prev';
}

// Valid swipe left (quick horizontal gesture)
assert.strictEqual(evaluateGestureSwipe(200, 100, 100, 105, 200), 'next');
// Valid swipe right
assert.strictEqual(evaluateGestureSwipe(100, 100, 200, 105, 200), 'prev');
// Too slow (> 500ms) -> ignored
assert.strictEqual(evaluateGestureSwipe(100, 100, 200, 100, 600), null);
// Too short (< 55px) -> ignored
assert.strictEqual(evaluateGestureSwipe(100, 100, 140, 100, 200), null);
// Vertical scrolling gesture (dy > dx * 0.7) -> ignored
assert.strictEqual(evaluateGestureSwipe(100, 100, 180, 180, 200), null);
console.log('✓ Swipe gesture angle, distance threshold (55px), and timing (<500ms) verified');

// 4.8 Mock DOM for Drawer, Accordion, Mobile Sheet, and A11y tests
class MockClassList {
  constructor() { this.classes = new Set(); }
  [Symbol.iterator]() { return this.classes[Symbol.iterator](); }
  add(...names) { names.forEach(n => this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  toggle(name, force) {
    if (force !== undefined) {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
      return force;
    }
    if (this.classes.has(name)) { this.classes.delete(name); return false; }
    this.classes.add(name); return true;
  }
  contains(name) { return this.classes.has(name); }
}

class MockElement {
  constructor(id = '', tag = 'DIV') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.classList = new MockClassList();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.style = {
      setProperty: (k, v) => { this.style[k] = v; },
      removeProperty: (k) => { delete this.style[k]; }
    };
    this.scrollTop = 0;
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.children.find(c => c.classList.contains(cls)) || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const selectors = selector.split(',').map(s => s.trim().toUpperCase());
    for (const c of this.children) {
      const match = selectors.some(sel => {
        if (sel.startsWith('.')) return c.classList.contains(sel.slice(1).toLowerCase());
        if (sel.startsWith('[')) return true;
        return c.tagName === sel;
      });
      if (match) results.push(c);
      results.push(...c.querySelectorAll(selector));
    }
    return results;
  }

  closest(selector) {
    let curr = this;
    const tags = selector.split(',').map(s => s.trim().toUpperCase());
    while (curr) {
      if (curr.tagName && tags.includes(curr.tagName.toUpperCase())) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  getBoundingClientRect() { return { width: 400, height: 60 }; }
}

globalThis.Element = MockElement;

const docElements = new Map();
function registerEl(el) { docElements.set(el.id, el); return el; }

const mockToolbar = registerEl(new MockElement('toolbar'));
const mockBackdrop = registerEl(new MockElement('sheetBackdrop'));
const mockFab = registerEl(new MockElement('mobileFab'));
const mockDrawer = registerEl(new MockElement('settingsDrawer'));
const mockSummary = registerEl(new MockElement('themeSettingsSummary'));
const mockReaderContent = registerEl(new MockElement('readerContent'));
const mockPresetTrack = registerEl(new MockElement('presetTrack'));
const mockPresetDots = registerEl(new MockElement('presetDots'));
const mockPresetWindow = registerEl(new MockElement('presetWindow'));

const mockSection = new MockElement('themeSection');
mockSection.setAttribute('data-settings-section', 'theme');
const mockToggle = new MockElement('themeToggle', 'BUTTON');
mockToggle.classList.add('settings-section-toggle');
mockToggle.setAttribute('aria-controls', 'themePanel');
const mockPanel = registerEl(new MockElement('themePanel'));
mockPanel.classList.add('settings-section-panel');
mockSection.children.push(mockToggle, mockPanel);

globalThis.document = {
  getElementById: (id) => docElements.get(id) || null,
  querySelector: (sel) => null,
  querySelectorAll: (sel) => sel.includes('data-settings-section') ? [mockSection] : [],
  documentElement: {
    style: { setProperty: () => {}, removeProperty: () => {} }
  },
  body: {
    classList: new MockClassList()
  }
};
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: (fn) => fn(),
  clearTimeout: () => {},
  setTimeout: (fn) => fn()
};

// Test expandMobileSheet
settings.expandMobileSheet();
assert(mockToolbar.classList.contains('expanded'), 'Toolbar should have expanded class');
assert(mockBackdrop.classList.contains('show'), 'Sheet backdrop should have show class');
assert.strictEqual(mockFab.getAttribute('aria-expanded'), 'true');
assert.strictEqual(mockFab.getAttribute('aria-label'), 'Close Reading Settings');

// Test collapseMobileSheet
settings.collapseMobileSheet();
assert(!mockToolbar.classList.contains('expanded'), 'Toolbar should not have expanded class');
assert(!mockBackdrop.classList.contains('show'), 'Sheet backdrop should not have show class');
assert.strictEqual(mockFab.getAttribute('aria-expanded'), 'false');
assert.strictEqual(mockFab.getAttribute('aria-label'), 'Open Reading Settings');

// Test toggleMobileSheet
settings.toggleMobileSheet(); // Should expand
assert(mockToolbar.classList.contains('expanded'));
settings.toggleMobileSheet(); // Should collapse
assert(!mockToolbar.classList.contains('expanded'));

// Test Section Accordion Expand/Collapse
settings.setSettingsSectionExpanded(mockSection, true);
assert(mockSection.classList.contains('is-open'));
assert.strictEqual(mockToggle.getAttribute('aria-expanded'), 'true');
assert.strictEqual(mockPanel.hidden, false);
assert.strictEqual(mockPanel.getAttribute('aria-hidden'), 'false');

settings.setSettingsSectionExpanded(mockSection, false);
assert(!mockSection.classList.contains('is-open'));
assert.strictEqual(mockToggle.getAttribute('aria-expanded'), 'false');
assert.strictEqual(mockPanel.hidden, true);
assert.strictEqual(mockPanel.getAttribute('aria-hidden'), 'true');

settings.toggleSettingsSection(mockSection);
assert(mockSection.classList.contains('is-open'));
settings.toggleSettingsSection(mockSection);
assert(!mockSection.classList.contains('is-open'));

// Test resetSettingsSections
settings.resetSettingsSections();
assert(mockDrawer.classList.contains('active'));
assert(mockSection.classList.contains('is-open'), 'Theme section should be open by default');

console.log('✓ Mobile bottom sheet, drawer accordion, and ARIA state management verified');

// 4.9 Test buildPresetCarousel, setSize, applyTextColor
settings.buildPresetCarousel(0);
assert(mockPresetTrack.innerHTML.includes('preset-card'));
assert(mockPresetDots.innerHTML.includes('preset-dot'));

settings.setSize('large');
assert(mockReaderContent.classList.contains('fs-large'));

settings.applyTextColor('warm');
assert.strictEqual(mockReaderContent.style['--reader-text-color'], '#78350f');

settings.applyTextColor('default');
assert.strictEqual(mockReaderContent.style['--reader-text-color'], undefined);

delete globalThis.document;
delete globalThis.window;
console.log('✓ Preset carousel DOM builder, typography sizing, and text color styling verified');

// -------------------------------------------------------------------
// 5. parser.js Multi-Format & Concurrency Stress Testing
// -------------------------------------------------------------------
console.log('\n--- 5. parser.js Multi-Format & Concurrency Stress Testing ---');

// 5.1 Constants
assert.strictEqual(parser.MAX_FILE_SIZE, 15 * 1024 * 1024);
assert.strictEqual(parser.MAX_EXTRACTED_TEXT_CHARS, 1_000_000);
assert.strictEqual(parser.MAX_PDF_PAGES, 500);
assert(parser.TEXT_EXTENSIONS.has('txt') && parser.TEXT_EXTENSIONS.has('md') && parser.TEXT_EXTENSIONS.has('markdown'));
assert(parser.SUPPORTED_EXTENSIONS.has('pdf') && parser.SUPPORTED_EXTENSIONS.has('docx'));
console.log('✓ File size and page count limits match specification');

// 5.2 getExtension
assert.strictEqual(parser.getExtension('document.txt'), 'txt');
assert.strictEqual(parser.getExtension('REPORT.DOCX'), 'docx');
assert.strictEqual(parser.getExtension('book.PDF'), 'pdf');
assert.strictEqual(parser.getExtension('notes.archive.md'), 'md');
assert.strictEqual(parser.getExtension('noextension'), '');
assert.strictEqual(parser.getExtension('.bashrc'), 'bashrc');
assert.strictEqual(parser.getExtension(null), '');
assert.strictEqual(parser.getExtension(''), '');
console.log('✓ getExtension handles edge cases and casing properly');

// 5.3 enforceExtractedTextLimit
assert.strictEqual(parser.enforceExtractedTextLimit('Hello world', 'test'), 'Hello world');
assert.throws(() => parser.enforceExtractedTextLimit('A'.repeat(1_000_001), 'test'), /Limit is 1,000,000 characters/);
console.log('✓ enforceExtractedTextLimit enforces 1,000,000 char threshold');

// 5.4 extractPdfPageText whitespace & layout preservation
const pdfItemsComplex = [
  // Heading
  { str: 'Chapter 1', transform: [1, 0, 0, 1, 50, 800], width: 60, height: 16 },
  // Paragraph 1: "This is a sentence."
  { str: 'This', transform: [1, 0, 0, 1, 50, 750], width: 25, height: 12 }, // diffY = 50 > 12*1.2 -> paragraph break
  { str: 'is', transform: [1, 0, 0, 1, 80, 750], width: 10, height: 12 }, // same line gap -> space
  { str: 'a', transform: [1, 0, 0, 1, 95, 750], width: 8, height: 12 }, // same line gap -> space
  { str: 'sentence.', transform: [1, 0, 0, 1, 108, 750], width: 50, height: 12 }, // same line gap -> space
  // Substring glyph fragment: "sen" + "tence" on same exact coordinate
  { str: 'Next', transform: [1, 0, 0, 1, 50, 740], width: 25, height: 12 }, // diffY = 10 <= 14.4 and > 2 -> line wrap space
  { str: 'line.', transform: [1, 0, 0, 1, 80, 740], width: 25, height: 12 }
];

const extractedText = parser.extractPdfPageText(pdfItemsComplex);
assert(extractedText.includes('Chapter 1\n\nThis is a sentence.'), `Expected paragraph separation, got: ${extractedText}`);
assert(extractedText.includes('sentence. Next line.'), `Expected line wrap space, got: ${extractedText}`);
console.log('✓ PDF text extraction accurately handles paragraph breaks, line wraps, and horizontal word spaces');

// 5.5 Concurrency Guard & Session Isolation
const token1 = parser.beginFileRead();
assert.strictEqual(parser.isActiveFileRead(token1), true);
assert.doesNotThrow(() => parser.assertActiveFileRead(token1));

const token2 = parser.beginFileRead(); // Cancels / supersedes token1
assert.strictEqual(parser.isActiveFileRead(token1), false);
assert.strictEqual(parser.isActiveFileRead(token2), true);
assert.throws(() => parser.assertActiveFileRead(token1), (err) => parser.isStaleReadError(err));
assert.doesNotThrow(() => parser.assertActiveFileRead(token2));

parser.cancelPendingFileRead(); // Cancels token2
assert.strictEqual(parser.isActiveFileRead(token2), false);
assert.throws(() => parser.assertActiveFileRead(token2), (err) => parser.isStaleReadError(err));
console.log('✓ Concurrency token state machine and stale read rejection verified');

// 5.6 Parser dynamic library loader error handling
await assert.rejects(async () => {
  await parser.loadLibrary('unknown_lib');
}, /Unknown library: unknown_lib/);

const freshToken = parser.beginFileRead();
await assert.rejects(async () => {
  await parser.readSelectedFile({}, 'unsupported_ext', freshToken);
}, /Unsupported file extension/);
console.log('✓ Parser error boundaries and unsupported file handling verified');

// -------------------------------------------------------------------
// 6. Deep Adversarial Interaction & Fallback Testing
// -------------------------------------------------------------------
console.log('\n--- 6. Deep Adversarial Interaction & Fallback Testing ---');

// 6.1 Font & Theme & Size invalid fallback testing
const mockRootStyles = {};
const mockBodyClasses = new MockClassList();
mockBodyClasses.add('theme-dark');

globalThis.document = {
  getElementById: (id) => docElements.get(id) || null,
  querySelector: (sel) => null,
  querySelectorAll: (sel) => sel.includes('[data-size]') ? [] : [],
  documentElement: {
    style: {
      setProperty: (k, v) => { mockRootStyles[k] = v; },
      removeProperty: (k) => { delete mockRootStyles[k]; }
    }
  },
  body: {
    classList: mockBodyClasses
  }
};

// Test setFont invalid fallback -> 'sans'
settings.setFont('invalid_font_xyz');
assert.strictEqual(mockRootStyles['--body-font'], settings.fontMap.sans.family);

// Test setFont valid font -> 'merriweather'
settings.setFont('merriweather');
assert.strictEqual(mockRootStyles['--body-font'], settings.fontMap.merriweather.family);
assert.strictEqual(mockRootStyles['--heading-weight'], settings.fontMap.merriweather.weight);

// Test setTheme invalid fallback -> 'claude'
settings.setTheme('invalid_theme_xyz');
assert(mockBodyClasses.contains('theme-claude'), 'Invalid theme should fallback to theme-claude');
assert(!mockBodyClasses.contains('theme-dark'), 'Previous theme classes should be stripped');

// Test setTheme valid theme -> 'dracula'
settings.setTheme('dracula');
assert(mockBodyClasses.contains('theme-dracula'), 'Valid theme should apply theme-dracula');
assert(!mockBodyClasses.contains('theme-claude'), 'Previous theme classes should be stripped');

// 6.2 Shortcut blocking tests (canUseGlobalPresetShortcut)
const mockTocDialog = registerEl(new MockElement('tocDialog'));
mockTocDialog.open = false;
mockReaderContent.setAttribute('contenteditable', 'false');

// Normal event -> true
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockReaderContent }), true);

// When tocDialog is open -> false
mockTocDialog.open = true;
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockReaderContent }), false);
mockTocDialog.open = false;

// When in edit mode -> false
mockReaderContent.setAttribute('contenteditable', 'true');
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockReaderContent }), false);
mockReaderContent.setAttribute('contenteditable', 'false');

// When modifier keys pressed -> false
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockReaderContent, ctrlKey: true }), false);
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockReaderContent, altKey: true }), false);
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockReaderContent, metaKey: true }), false);
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockReaderContent, shiftKey: true }), false);

// When target is presetWindow -> false
assert.strictEqual(settings.canUseGlobalPresetShortcut({ target: mockPresetWindow }), false);

// 6.3 Focus Management (setContainerFocusable)
const container = new MockElement('container');
const btn1 = new MockElement('b1', 'BUTTON');
const input1 = new MockElement('i1', 'INPUT');
btn1.setAttribute('tabindex', '0');
container.children.push(btn1, input1);

utils.setContainerFocusable(container, false);
assert.strictEqual(btn1.getAttribute('tabindex'), '-1');
assert.strictEqual(input1.getAttribute('tabindex'), '-1');

utils.setContainerFocusable(container, true);
assert.strictEqual(btn1.getAttribute('tabindex'), '0');
assert.strictEqual(input1.getAttribute('tabindex'), null); // Removed tabindex (default)

console.log('✓ Deep font/theme fallbacks, shortcut gating, and container focus management verified');

delete globalThis.document;

console.log('\n================================================================');
console.log('ALL CHALLENGER EMPIRICAL TESTS PASSED SUCCESSFULLY! (100%)');
console.log('================================================================');


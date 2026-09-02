// test_challenger_m1_deep_stress.mjs - Comprehensive Empirical Stress Harness for Milestone 1
import assert from 'node:assert';
import * as utils from '../utils.js';
import * as storage from '../storage.js';

console.log('================================================================');
console.log('CHALLENGER 1 (MILESTONE 1): DEEP EMPIRICAL STRESS & ADVERSARIAL HARNESS');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(suite, name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [${suite}] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [${suite}] ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function runAsyncTest(suite, name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [${suite}] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [${suite}] ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// 1. Math Clamping & Index Boundaries (clamp, clampNumber, clampIndex)
// -----------------------------------------------------------------------------
console.log('--- 1. Math Clamping & Boundaries ---');

runTest('Clamp', 'clamp standard 3-arg valid numbers', () => {
  assert.strictEqual(utils.clamp(5, 0, 10), 5);
  assert.strictEqual(utils.clamp(-5, 0, 10), 0);
  assert.strictEqual(utils.clamp(15, 0, 10), 10);
  assert.strictEqual(utils.clamp(0, 0, 10), 0);
  assert.strictEqual(utils.clamp(10, 0, 10), 10);
});

runTest('Clamp', 'clamp with floating point values', () => {
  assert.strictEqual(utils.clamp(3.14159, 1.5, 4.5), 3.14159);
  assert.strictEqual(utils.clamp(0.1 + 0.2, 0, 1), 0.1 + 0.2);
  assert.strictEqual(utils.clamp('3.5', 1, 5), 3.5);
});

runTest('Clamp', 'clamp with 4-arg delegation (val, fallback, min, max)', () => {
  assert.strictEqual(utils.clamp(5, 100, 0, 10), 5);
  assert.strictEqual(utils.clamp('invalid', 42, 0, 10), 42);
  assert.strictEqual(utils.clamp(NaN, 99, 0, 10), 99);
  assert.strictEqual(utils.clamp(Infinity, 77, 0, 10), 77);
  assert.strictEqual(utils.clamp(-Infinity, 88, 0, 10), 88);
});

runTest('Clamp', 'clamp with non-numeric types (null, undefined, strings, objects)', () => {
  assert.strictEqual(utils.clamp(null, 0, 10), 0);
  assert.strictEqual(utils.clamp(undefined, 0, 10), 0);
  assert.strictEqual(utils.clamp('', 0, 10), 0);
  assert.strictEqual(utils.clamp('foo', 5, 10), 5);
  assert.strictEqual(utils.clamp({}, 0, 10), 0);
  assert.strictEqual(utils.clamp([], 0, 10), 0);
  assert.strictEqual(utils.clamp([5], 0, 10), 5);
  assert.strictEqual(utils.clamp([42], 0, 10), 10); // 42 clamped to max 10 is 10
  assert.strictEqual(utils.clamp(true, 0, 10), 0);
});

runTest('Clamp', 'clamp with extreme numbers and boundaries', () => {
  assert.strictEqual(utils.clamp(Number.MAX_SAFE_INTEGER + 10, 0, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(utils.clamp(Number.MIN_SAFE_INTEGER - 10, Number.MIN_SAFE_INTEGER, 0), Number.MIN_SAFE_INTEGER);
  assert.strictEqual(utils.clamp(1e300, 0, 1e200), 1e200);
});

runTest('Clamp', 'clampNumber boundary and fallback behaviors', () => {
  assert.strictEqual(utils.clampNumber(5, 0, 1, 10), 5);
  assert.strictEqual(utils.clampNumber('5.5', 0, 1, 10), 5.5);
  assert.strictEqual(utils.clampNumber(-5, 0, 1, 10), 1);
  assert.strictEqual(utils.clampNumber(15, 0, 1, 10), 10);
  assert.strictEqual(utils.clampNumber(NaN, 42, 1, 10), 42);
  assert.strictEqual(utils.clampNumber('invalid', 42, 1, 10), 42);
  assert.strictEqual(utils.clampNumber(Infinity, 42, 1, 10), 42);
  assert.strictEqual(utils.clampNumber(-Infinity, 42, 1, 10), 42);
  assert.strictEqual(utils.clampNumber(null, 42, 1, 10), 42);
  assert.strictEqual(utils.clampNumber(undefined, 42, 1, 10), 42);
});

runTest('Clamp', 'clampIndex boundary conditions and edge cases', () => {
  assert.strictEqual(utils.clampIndex(0, 5), 0);
  assert.strictEqual(utils.clampIndex(4, 5), 4);
  assert.strictEqual(utils.clampIndex(10, 5), 4);
  assert.strictEqual(utils.clampIndex(-3, 5), 0);
  assert.strictEqual(utils.clampIndex('2', 5), 2);
  assert.strictEqual(utils.clampIndex('invalid', 5), 0);
  assert.strictEqual(utils.clampIndex(0, 0), 0);
  assert.strictEqual(utils.clampIndex(3, 0), 0);
  assert.strictEqual(utils.clampIndex(-1, 0), 0);
  assert.strictEqual(utils.clampIndex(100, 1), 0);
  assert.strictEqual(utils.clampIndex(NaN, 10), 0);
  assert.strictEqual(utils.clampIndex(Infinity, 10), 0);
  assert.strictEqual(utils.clampIndex(3, -5), 0);
});

// -----------------------------------------------------------------------------
// 2. HTML Escaping & Sanitization (escapeHtml, escapeHtmlAttr, escapeHtmlText)
// -----------------------------------------------------------------------------
console.log('\n--- 2. HTML Escaping & Sanitization ---');

runTest('HTML Escape', 'Standard special characters escaping', () => {
  const raw = `& < > " '`;
  const expected = `&amp; &lt; &gt; &quot; &#039;`;
  assert.strictEqual(utils.escapeHtml(raw), expected);
  assert.strictEqual(utils.escapeHtmlAttr(raw), expected);
  assert.strictEqual(utils.escapeHtmlText(raw), expected);
});

runTest('HTML Escape', 'XSS vector strings', () => {
  const scriptTag = `<script>alert("XSS & attack")</script>`;
  assert.strictEqual(utils.escapeHtml(scriptTag), `&lt;script&gt;alert(&quot;XSS &amp; attack&quot;)&lt;/script&gt;`);

  const imgOnError = `<img src="x" onerror='alert(1)'>`;
  assert.strictEqual(utils.escapeHtml(imgOnError), `&lt;img src=&quot;x&quot; onerror=&#039;alert(1)&#039;&gt;`);

  const svgOnLoad = `<svg/onload=alert(1)>`;
  assert.strictEqual(utils.escapeHtml(svgOnLoad), `&lt;svg/onload=alert(1)&gt;`);
});

runTest('HTML Escape', 'Non-string inputs return empty string', () => {
  assert.strictEqual(utils.escapeHtml(null), '');
  assert.strictEqual(utils.escapeHtml(undefined), '');
  assert.strictEqual(utils.escapeHtml(123), '');
  assert.strictEqual(utils.escapeHtml({}), '');
  assert.strictEqual(utils.escapeHtml([]), '');
  assert.strictEqual(utils.escapeHtml(true), '');
});

// -----------------------------------------------------------------------------
// 3. Safe URL Normalization & Link Security (normalizeSafeLinkHref)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Safe URL Normalization & Link Security ---');

runTest('URL Sanitizer', 'Valid safe URLs', () => {
  assert.strictEqual(utils.normalizeSafeLinkHref('https://example.com'), 'https://example.com');
  assert.strictEqual(utils.normalizeSafeLinkHref('http://example.com/path?q=1&b=2'), 'http://example.com/path?q=1&amp;b=2');
  assert.strictEqual(utils.normalizeSafeLinkHref('mailto:user@example.com'), 'mailto:user@example.com');
  assert.strictEqual(utils.normalizeSafeLinkHref('ftp://files.example.com/file.txt'), 'ftp://files.example.com/file.txt');
  assert.strictEqual(utils.normalizeSafeLinkHref('/relative/path/to/resource'), '/relative/path/to/resource');
  assert.strictEqual(utils.normalizeSafeLinkHref('#heading-anchor'), '#heading-anchor');
});

runTest('URL Sanitizer', 'Explicit dangerous protocols rejected (javascript, data, vbscript, file, blob)', () => {
  assert.strictEqual(utils.normalizeSafeLinkHref('javascript:alert(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('JAVASCRIPT:alert(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('javascript:void(0)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('data:text/html,<script>alert(1)</script>'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('vbscript:msgbox(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('file:///etc/passwd'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('blob:https://example.com/uuid'), null);
});

runTest('URL Sanitizer', 'Protocol-relative and network-path references rejected', () => {
  assert.strictEqual(utils.normalizeSafeLinkHref('//attacker.com/evil.js'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('///attacker.com'), null);
});

runTest('URL Sanitizer', 'Control characters and null bytes rejected', () => {
  assert.strictEqual(utils.normalizeSafeLinkHref('javascript\u0000:alert(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('https://example.com/\u0001evil'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('https://example.com/\u001Fevil'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('https://example.com/\u007Fevil'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('java\tscript:alert(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('java\nscript:alert(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('java\rscript:alert(1)'), null);
});

runTest('URL Sanitizer', 'Encoded and entity-obfuscated attack vectors', () => {
  assert.strictEqual(utils.normalizeSafeLinkHref('&quot; onfocus=&quot;alert(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('javascript&colon;alert(1)'), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('   javascript:alert(1)   '), null);
});

runTest('URL Sanitizer', 'Empty or non-string inputs', () => {
  assert.strictEqual(utils.normalizeSafeLinkHref(''), null);
  assert.strictEqual(utils.normalizeSafeLinkHref('   '), null);
  assert.strictEqual(utils.normalizeSafeLinkHref(null), null);
  assert.strictEqual(utils.normalizeSafeLinkHref(undefined), null);
  assert.strictEqual(utils.normalizeSafeLinkHref(123), null);
});

// -----------------------------------------------------------------------------
// 4. Inline Markdown Rendering (renderInlineMarkdown, parseInline)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Inline Markdown Rendering & Protection ---');

runTest('Markdown', 'Bold, italic, and inline code formatting', () => {
  assert.strictEqual(utils.renderInlineMarkdown('**bold text**'), '<strong>bold text</strong>');
  assert.strictEqual(utils.renderInlineMarkdown('*italic text*'), '<em>italic text</em>');
  assert.strictEqual(utils.renderInlineMarkdown('`code snippet`'), '<code>code snippet</code>');
  assert.strictEqual(utils.renderInlineMarkdown('**`bold code`**'), '<strong><code>bold code</code></strong>');
});

runTest('Markdown', 'Safe links rendered with rel="noopener noreferrer" and target="_blank"', () => {
  const rendered = utils.renderInlineMarkdown('[OpenAI](https://openai.com)');
  assert.strictEqual(rendered, '<a href="https://openai.com" target="_blank" rel="noopener noreferrer">OpenAI</a>');
});

runTest('Markdown', 'XSS links stripped of <a> wrapper', () => {
  const rendered = utils.renderInlineMarkdown('[Malicious](javascript:alert(1))');
  assert.strictEqual(rendered, 'Malicious');
  assert.ok(!rendered.includes('<a'));
  assert.ok(!rendered.includes('javascript'));
});

runTest('Markdown', 'Code tokens protected from emphasis parsing inside backticks', () => {
  const rendered = utils.renderInlineMarkdown('`**not bold** and *not italic*`');
  assert.strictEqual(rendered, '<code>**not bold** and *not italic*</code>');
});

runTest('Markdown', 'PUA delimiter injection resistance', () => {
  const attack = `\uE000LINK0\uE001 \uE000CODE0\uE001`;
  const rendered = utils.renderInlineMarkdown(attack);
  // Without matching tokens, tokens remain literal or fallback safely
  assert.ok(typeof rendered === 'string');
});

// -----------------------------------------------------------------------------
// 5. Timer Utilities (debounce, throttle)
// -----------------------------------------------------------------------------
console.log('\n--- 5. Timer Utilities (debounce & throttle) ---');

await runAsyncTest('Debounce', 'Debounce collapses rapid calls into single invocation with latest args', async () => {
  let callCount = 0;
  let lastArg = null;
  const debounced = utils.debounce((val) => {
    callCount++;
    lastArg = val;
  }, 30);

  debounced('a');
  debounced('b');
  debounced('c');
  debounced('d');

  assert.strictEqual(callCount, 0, 'Should not fire synchronously');
  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(callCount, 1, 'Should fire exactly once');
  assert.strictEqual(lastArg, 'd', 'Should receive final invocation args');
});

await runAsyncTest('Debounce', 'Preserves `this` context', async () => {
  const obj = {
    value: 42,
    test() {
      return this.value;
    }
  };
  let captured = null;
  const debounced = utils.debounce(function() {
    captured = this.value;
  }, 20);

  debounced.call(obj);
  await new Promise(r => setTimeout(r, 40));
  assert.strictEqual(captured, 42, 'Debounce should preserve `this` context');
});

await runAsyncTest('Throttle', 'Throttle fires leading edge immediately and gates subsequent calls within window', async () => {
  let callCount = 0;
  const throttled = utils.throttle(() => {
    callCount++;
  }, 50);

  throttled();
  assert.strictEqual(callCount, 1, 'Leading edge fires immediately');

  throttled();
  throttled();
  throttled();
  assert.strictEqual(callCount, 1, 'Gated calls do not increment during throttle window');

  await new Promise(r => setTimeout(r, 70));
  throttled();
  assert.strictEqual(callCount, 2, 'Fires again after window expires');
});

await runAsyncTest('Throttle', 'Preserves `this` context and arguments', async () => {
  let capturedArg = null;
  let capturedThis = null;
  const obj = { id: 'throttle-context' };
  const throttled = utils.throttle(function(x) {
    capturedThis = this;
    capturedArg = x;
  }, 30);

  throttled.call(obj, 'test-val');
  assert.strictEqual(capturedThis, obj);
  assert.strictEqual(capturedArg, 'test-val');
});

// -----------------------------------------------------------------------------
// 6. Formatters & Helpers (formatTime, formatNumber, formatError)
// -----------------------------------------------------------------------------
console.log('\n--- 6. Formatters & General Helpers ---');

runTest('Formatters', 'formatTime with standard durations', () => {
  assert.strictEqual(utils.formatTime(0), '0:00');
  assert.strictEqual(utils.formatTime(5), '0:05');
  assert.strictEqual(utils.formatTime(59), '0:59');
  assert.strictEqual(utils.formatTime(60), '1:00');
  assert.strictEqual(utils.formatTime(65), '1:05');
  assert.strictEqual(utils.formatTime(599), '9:59');
  assert.strictEqual(utils.formatTime(3599), '59:59');
  assert.strictEqual(utils.formatTime(3600), '1:00:00');
  assert.strictEqual(utils.formatTime(3665), '1:01:05');
  assert.strictEqual(utils.formatTime(7322), '2:02:02');
});

runTest('Formatters', 'formatTime edge cases (negative, decimal, non-numeric)', () => {
  assert.strictEqual(utils.formatTime(-10), '0:00');
  assert.strictEqual(utils.formatTime('125.7'), '2:05');
  assert.strictEqual(utils.formatTime(NaN), '0:00');
  assert.strictEqual(utils.formatTime('invalid'), '0:00');
  assert.strictEqual(utils.formatTime(null), '0:00');
  assert.strictEqual(utils.formatTime(undefined), '0:00');
});

runTest('Formatters', 'formatNumber handles standard, large, and invalid values', () => {
  assert.strictEqual(utils.formatNumber(0), '0');
  assert.strictEqual(utils.formatNumber(1000), (1000).toLocaleString());
  assert.strictEqual(utils.formatNumber('1234567'), (1234567).toLocaleString());
  assert.strictEqual(utils.formatNumber(NaN), '0');
  assert.strictEqual(utils.formatNumber('invalid'), '0');
  assert.strictEqual(utils.formatNumber(null), '0');
});

runTest('Formatters', 'formatError handles strings, Errors, objects, null', () => {
  assert.strictEqual(utils.formatError('Simple error message'), 'Simple error message');
  assert.strictEqual(utils.formatError(new Error('Test error')), 'Test error');
  assert.strictEqual(utils.formatError(null), 'Unknown error');
  assert.strictEqual(utils.formatError(undefined), 'Unknown error');
  assert.strictEqual(utils.formatError({ message: 'Custom obj message' }), 'Custom obj message');
});

// -----------------------------------------------------------------------------
// 7. Storage Layer & LocalStorage Robustness (storage.js)
// -----------------------------------------------------------------------------
console.log('\n--- 7. Storage Layer & LocalStorage Robustness ---');

// Mock localStorage environment
class MockLocalStorage {
  constructor() {
    this.store = new Map();
    this.quotaExceeded = false;
    this.throwOnAccess = false;
  }
  getItem(key) {
    if (this.throwOnAccess) throw new Error('SecurityError: access denied');
    return this.store.has(String(key)) ? this.store.get(String(key)) : null;
  }
  setItem(key, value) {
    if (this.throwOnAccess) throw new Error('SecurityError: access denied');
    if (this.quotaExceeded) {
      const err = new Error('QuotaExceededError: storage quota full');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    if (this.throwOnAccess) throw new Error('SecurityError: access denied');
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
}

globalThis.window = globalThis.window || {};
const mockStore = new MockLocalStorage();
globalThis.window.localStorage = mockStore;

runTest('Storage', 'LEGACY_STORAGE_KEYS has exactly 16 verified legacy keys', () => {
  assert.strictEqual(storage.LEGACY_STORAGE_KEYS.length, 16);
  const expectedKeys = [
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
  expectedKeys.forEach(k => {
    assert.ok(storage.LEGACY_STORAGE_KEYS.includes(k), `Missing legacy key: ${k}`);
  });
});

runTest('Storage', 'Basic getItem, setItem, removeItem, getStorageItem, setStorageItem, removeStorageItem', () => {
  mockStore.clear();
  assert.strictEqual(storage.setStorageItem('pref_key', 'val_123'), true);
  assert.strictEqual(storage.getStorageItem('pref_key'), 'val_123');
  assert.strictEqual(storage.getStorageItem('non_existent', 'my_fallback'), 'my_fallback');
  assert.strictEqual(storage.removeStorageItem('pref_key'), true);
  assert.strictEqual(storage.getStorageItem('pref_key'), null);
});

runTest('Storage', 'isStorageAvailable detection with normal store', () => {
  assert.strictEqual(storage.isStorageAvailable(), true);
});

runTest('Storage', 'QuotaExceededError handling: returns false without throwing', () => {
  mockStore.quotaExceeded = true;
  assert.strictEqual(storage.isStorageAvailable(), false);
  const result = storage.setStorageItem('big_key', 'large_data');
  assert.strictEqual(result, false, 'setStorageItem must return false when quota exceeded');
  mockStore.quotaExceeded = false;
});

runTest('Storage', 'SecurityError / Throwing localStorage access: safe fallbacks', () => {
  mockStore.throwOnAccess = true;
  assert.strictEqual(storage.isStorageAvailable(), false);
  assert.strictEqual(storage.getStorageItem('some_key', 'safe_fallback'), 'safe_fallback');
  assert.strictEqual(storage.setStorageItem('some_key', 'val'), false);
  assert.strictEqual(storage.removeStorageItem('some_key'), false);
  // cleanupLegacyBrowserStorage should not throw
  assert.doesNotThrow(() => storage.cleanupLegacyBrowserStorage());
  assert.doesNotThrow(() => storage.purgeLegacyStorageKeys());
  mockStore.throwOnAccess = false;
});

runTest('Storage', 'Legacy purge completeness: purges all 16 legacy keys, preserves non-legacy keys', () => {
  mockStore.clear();

  // Populate all 16 legacy keys
  storage.LEGACY_STORAGE_KEYS.forEach((k, idx) => {
    mockStore.setItem(k, `legacy_val_${idx}`);
  });

  // Populate active / modern keys
  const modernKeys = [
    'reader_custom_preset_1',
    'reader_active_document_id',
    'reader_cached_metadata',
    'user_settings_v2',
    'app_version'
  ];
  modernKeys.forEach(k => {
    mockStore.setItem(k, `modern_val_${k}`);
  });

  assert.strictEqual(mockStore.length, 16 + modernKeys.length);

  // Run legacy purge
  storage.purgeLegacyStorageKeys();

  // Verify all 16 legacy keys are deleted
  storage.LEGACY_STORAGE_KEYS.forEach(k => {
    assert.strictEqual(mockStore.getItem(k), null, `Legacy key ${k} should have been purged`);
  });

  // Verify modern keys remain intact
  modernKeys.forEach(k => {
    assert.strictEqual(mockStore.getItem(k), `modern_val_${k}`, `Modern key ${k} should be preserved`);
  });

  assert.strictEqual(mockStore.length, modernKeys.length);
});

// -----------------------------------------------------------------------------
// 8. DOM Helpers & Focus Management (setContainerFocusable, setupFocusTrap, gestures)
// -----------------------------------------------------------------------------
console.log('\n--- 8. DOM Helpers & Interaction Filters ---');

// Mock DOM elements for UI helpers
class MockElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this.classList = new Set();
    this.listeners = {};
    this.offsetParent = {}; // not null
  }
  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }
  closest(selector) {
    const selectors = selector.split(',').map(s => s.trim().toLowerCase());
    let curr = this;
    while (curr) {
      const tag = curr.tagName.toLowerCase();
      const role = curr.getAttribute('role');
      const contentEditable = curr.getAttribute('contenteditable');
      for (const sel of selectors) {
        if (sel === tag) return curr;
        if (sel.startsWith('[role="') && role && `[role="${role}"]` === sel) return curr;
        if (sel === '[contenteditable]' && contentEditable !== null) return curr;
        if (sel === '[contenteditable="true"]' && contentEditable === 'true') return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }
  querySelectorAll(sel) {
    const results = [];
    function traverse(node) {
      for (const child of node.children) {
        const tag = child.tagName.toLowerCase();
        if (['button', 'input', 'select', 'textarea', 'a'].includes(tag) || child.hasAttribute('tabindex') || child.hasAttribute('href')) {
          results.push(child);
        }
        traverse(child);
      }
    }
    traverse(this);
    return results;
  }
  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== fn);
    }
  }
  dispatchEvent(evt) {
    if (this.listeners[evt.type]) {
      this.listeners[evt.type].forEach(fn => fn(evt));
    }
  }
  focus() {
    globalThis.document.activeElement = this;
  }
}

globalThis.Element = MockElement;
globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  activeElement: null
};

runTest('DOM Helpers', 'isInteractiveShortcutTarget & isBlockedGestureTarget filters', () => {
  const btn = new MockElement('button');
  assert.strictEqual(utils.isInteractiveShortcutTarget(btn), true);
  assert.strictEqual(utils.isBlockedGestureTarget(btn), true);

  const input = new MockElement('input');
  assert.strictEqual(utils.isInteractiveShortcutTarget(input), true);
  assert.strictEqual(utils.isBlockedGestureTarget(input), true);

  const div = new MockElement('div');
  assert.strictEqual(utils.isInteractiveShortcutTarget(div), false);
  assert.strictEqual(utils.isBlockedGestureTarget(div), false);

  const editableDiv = new MockElement('div', { contenteditable: 'true' });
  assert.strictEqual(utils.isInteractiveShortcutTarget(editableDiv), true);
  assert.strictEqual(utils.isBlockedGestureTarget(editableDiv), true);

  const spanInBtn = new MockElement('span');
  spanInBtn.parentElement = btn;
  assert.strictEqual(utils.isInteractiveShortcutTarget(spanInBtn), true);
  assert.strictEqual(utils.isBlockedGestureTarget(spanInBtn), true);

  assert.strictEqual(utils.isInteractiveShortcutTarget(null), false);
  assert.strictEqual(utils.isBlockedGestureTarget(null), false);
});

runTest('DOM Helpers', 'setContainerFocusable correctly saves and restores tabindex values', () => {
  const container = new MockElement('div');
  const b1 = new MockElement('button', { tabindex: '2' });
  const b2 = new MockElement('button'); // no tabindex
  b1.parentElement = container;
  b2.parentElement = container;
  container.children = [b1, b2];

  // Disable focusables
  utils.setContainerFocusable(container, false);
  assert.strictEqual(b1.getAttribute('tabindex'), '-1');
  assert.strictEqual(b2.getAttribute('tabindex'), '-1');
  assert.strictEqual(b1.dataset.savedTabindex, '2');
  assert.strictEqual(b2.dataset.savedTabindex, '');

  // Enable focusables
  utils.setContainerFocusable(container, true);
  assert.strictEqual(b1.getAttribute('tabindex'), '2');
  assert.strictEqual(b2.hasAttribute('tabindex'), false);
  assert.strictEqual(b1.dataset.savedTabindex, undefined);
  assert.strictEqual(b2.dataset.savedTabindex, undefined);
});

runTest('DOM Helpers', 'setupFocusTrap traps keyboard Tab cycling', () => {
  const container = new MockElement('div');
  const b1 = new MockElement('button');
  const b2 = new MockElement('button');
  b1.parentElement = container;
  b2.parentElement = container;
  container.children = [b1, b2];

  const release = utils.setupFocusTrap(container);

  // Focus b2 and press Tab -> should wrap to b1
  globalThis.document.activeElement = b2;
  let prevented = false;
  container.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => { prevented = true; }
  });
  assert.strictEqual(prevented, true);
  assert.strictEqual(globalThis.document.activeElement, b1);

  // Focus b1 and press Shift+Tab -> should wrap to b2
  prevented = false;
  container.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: true,
    preventDefault: () => { prevented = true; }
  });
  assert.strictEqual(prevented, true);
  assert.strictEqual(globalThis.document.activeElement, b2);

  // Release trap
  release();
  assert.strictEqual(container.listeners['keydown'].length, 0);
});

// -----------------------------------------------------------------------------
// Summary & Verdict
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error(`\nCHALLENGE FAILED: ${failedTests} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nALL EMPIRICAL CHALLENGER TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

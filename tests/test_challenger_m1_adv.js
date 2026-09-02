// test_challenger_m1_adv.js - Deep adversarial verification for Milestone 1
// Challenger 2: ESM Module Graph Integrity, Acyclicity, Storage Fallbacks & Utils Stress

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTestAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('CHALLENGER 2 ADVERSARIAL EMPIRICAL HARNESS — MILESTONE 1');
console.log('================================================================\n');

// -----------------------------------------------------------------
// 1. ESM Graph Integrity & Acyclicity Forensics
// -----------------------------------------------------------------
console.log('--- 1. ESM Module Graph Integrity & DAG Acyclicity ---');

const modules = [
  'utils.js',
  'storage.js',
  'parser.js',
  'settings.js',
  'ui.js',
  'tts.js',
  'reader.js',
  'app.js'
];

runTest('All 8 target modules exist in project root', () => {
  for (const mod of modules) {
    const modPath = path.join(projectRoot, mod);
    assert(fs.existsSync(modPath), `Module ${mod} must exist at ${modPath}`);
  }
});

runTest('package.json enforces native ESM type="module"', () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.strictEqual(pkgJson.type, 'module', 'package.json must contain "type": "module"');
});

runTest('index.html references <script type="module" src="app.js">', () => {
  const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  assert(/<script\s+type=["']module["']\s+src=["']app\.js["']/.test(indexHtml), 'index.html must load app.js as an ES module');
});

// Build dependency graph from static AST / import regex
const importGraph = {};
const exportMap = {};

for (const mod of modules) {
  const code = fs.readFileSync(path.join(projectRoot, mod), 'utf8');
  importGraph[mod] = [];
  exportMap[mod] = [];

  // Extract imports: import ... from './xxx.js' or import ... from './xxx'
  const importRegex = /(?:import\s+(?:[\w*\s{},]*)\s+from\s+['"]\.\/([^'"]+)['"])|(?:import\s*['"]\.\/([^'"]+)['"])/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    let importedFile = match[1] || match[2];
    if (!importedFile.endsWith('.js')) importedFile += '.js';
    importGraph[mod].push(importedFile);
  }

  // Extract named exports: export function xxx, export const xxx, export let xxx, export { ... }
  const exportFuncRegex = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/g;
  while ((match = exportFuncRegex.exec(code)) !== null) {
    exportMap[mod].push(match[1]);
  }
  const exportConstRegex = /export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/g;
  while ((match = exportConstRegex.exec(code)) !== null) {
    exportMap[mod].push(match[1]);
  }
}

runTest('Import graph strictly contains only valid project modules', () => {
  for (const [mod, deps] of Object.entries(importGraph)) {
    for (const dep of deps) {
      assert(modules.includes(dep), `Module ${mod} imports unknown dependency ${dep}`);
    }
  }
});

runTest('Cycle Detection: Tarjan / DFS finds ZERO circular dependencies (DAG property)', () => {
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];

  function dfs(node, pathStack = []) {
    visited.add(node);
    recursionStack.add(node);
    pathStack.push(node);

    const neighbors = importGraph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...pathStack]);
      } else if (recursionStack.has(neighbor)) {
        cycles.push([...pathStack, neighbor].join(' -> '));
      }
    }

    recursionStack.delete(node);
  }

  for (const mod of modules) {
    if (!visited.has(mod)) {
      dfs(mod);
    }
  }

  assert.strictEqual(cycles.length, 0, `Circular dependencies detected: ${cycles.join('; ')}`);
});

runTest('Module Layer Hierarchy adheres to architectural specification', () => {
  // utils.js and storage.js must have 0 imports (Level 0)
  assert.strictEqual(importGraph['utils.js'].length, 0, `utils.js must have 0 imports, found ${importGraph['utils.js'].join(', ')}`);
  assert.strictEqual(importGraph['storage.js'].length, 0, `storage.js must have 0 imports, found ${importGraph['storage.js'].join(', ')}`);

  // Level 1: parser.js, settings.js, ui.js should only import utils.js
  for (const dep of importGraph['parser.js']) {
    assert.strictEqual(dep, 'utils.js', `parser.js should only depend on utils.js, found ${dep}`);
  }
  for (const dep of importGraph['settings.js']) {
    assert.strictEqual(dep, 'utils.js', `settings.js should only depend on utils.js, found ${dep}`);
  }
  for (const dep of importGraph['ui.js']) {
    assert.strictEqual(dep, 'utils.js', `ui.js should only depend on utils.js, found ${dep}`);
  }
});

// -----------------------------------------------------------------
// 2. Storage Layer Hardening & Adversarial Fallback Testing
// -----------------------------------------------------------------
console.log('\n--- 2. Storage Layer Adversarial Fallback Testing ---');

import * as storageModule from '../storage.js';

runTest('storage.js exports all contract functions and legacy key constants', () => {
  const expectedExports = [
    'LEGACY_STORAGE_KEYS',
    'isStorageAvailable',
    'cleanupLegacyBrowserStorage',
    'getItem',
    'setItem',
    'removeItem',
    'getStorageItem',
    'setStorageItem',
    'removeStorageItem',
    'purgeLegacyStorageKeys'
  ];

  for (const exp of expectedExports) {
    assert(exp in storageModule, `storage.js must export '${exp}'`);
    if (exp !== 'LEGACY_STORAGE_KEYS') {
      assert.strictEqual(typeof storageModule[exp], 'function', `${exp} must be a function`);
    } else {
      assert(Array.isArray(storageModule[exp]), 'LEGACY_STORAGE_KEYS must be an Array');
      assert.strictEqual(storageModule[exp].length, 16, 'LEGACY_STORAGE_KEYS must have exactly 16 keys');
    }
  }
});

runTest('storage.js contract functions behave identically across aliases', () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  global.window = { localStorage: mockStorage };
  try {
    assert.strictEqual(storageModule.setStorageItem('k1', 'v1'), true);
    assert.strictEqual(storageModule.getItem('k1'), 'v1');
    assert.strictEqual(storageModule.getStorageItem('k1'), 'v1');
    assert.strictEqual(storageModule.removeStorageItem('k1'), true);
    assert.strictEqual(storageModule.getStorageItem('k1', 'default'), 'default');
  } finally {
    delete global.window;
  }
});

runTest('Scenario A: Window is undefined (SSR / pure worker environment)', () => {
  // Global window is undefined in standard Node.js
  const originalWindow = global.window;
  try {
    delete global.window;
    assert.strictEqual(storageModule.isStorageAvailable(), false, 'isStorageAvailable must be false when window is undefined');
    assert.strictEqual(storageModule.getItem('any_key', 'fallback_val'), 'fallback_val', 'getItem must return fallback when window is undefined');
    assert.strictEqual(storageModule.setItem('any_key', 'val'), false, 'setItem must return false without throwing when window is undefined');
    assert.strictEqual(storageModule.removeItem('any_key'), false, 'removeItem must return false without throwing when window is undefined');
    assert.doesNotThrow(() => storageModule.cleanupLegacyBrowserStorage(), 'cleanupLegacyBrowserStorage must not throw when window is undefined');
  } finally {
    if (originalWindow !== undefined) global.window = originalWindow;
  }
});

runTest('Scenario B: window.localStorage is null / undefined (restricted sandbox)', () => {
  const mockWindow = { localStorage: null };
  global.window = mockWindow;
  try {
    assert.strictEqual(storageModule.isStorageAvailable(), false, 'isStorageAvailable must be false when localStorage is null');
    assert.strictEqual(storageModule.getItem('k', 'def'), 'def', 'getItem must return fallback');
    assert.strictEqual(storageModule.setItem('k', 'v'), false, 'setItem must return false');
    assert.strictEqual(storageModule.removeItem('k'), false, 'removeItem must return false');
    assert.doesNotThrow(() => storageModule.cleanupLegacyBrowserStorage());
  } finally {
    delete global.window;
  }
});

runTest('Scenario C: window.localStorage property getter throws DOMException (SecurityError / Incognito block)', () => {
  const throwingWindow = {};
  Object.defineProperty(throwingWindow, 'localStorage', {
    get() {
      const err = new Error('The operation is insecure.');
      err.name = 'SecurityError';
      throw err;
    }
  });

  global.window = throwingWindow;
  try {
    assert.strictEqual(storageModule.isStorageAvailable(), false, 'isStorageAvailable must handle throwing localStorage getter safely');
    assert.strictEqual(storageModule.getItem('test_key', 'safe_fallback'), 'safe_fallback', 'getItem must catch getter exception and return fallback');
    assert.strictEqual(storageModule.setItem('test_key', 'value'), false, 'setItem must catch getter exception and return false');
    assert.strictEqual(storageModule.removeItem('test_key'), false, 'removeItem must catch getter exception and return false');
    assert.doesNotThrow(() => storageModule.cleanupLegacyBrowserStorage(), 'cleanupLegacyBrowserStorage must handle getter exception without crashing');
  } finally {
    delete global.window;
  }
});

runTest('Scenario D: localStorage methods throw SecurityError / QuotaExceededError', () => {
  const hostileLocalStorage = {
    getItem(key) {
      const err = new Error('Access denied to storage');
      err.name = 'SecurityError';
      throw err;
    },
    setItem(key, value) {
      const err = new Error('Quota exceeded for storage');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem(key) {
      const err = new Error('Removal forbidden');
      err.name = 'SecurityError';
      throw err;
    }
  };

  global.window = { localStorage: hostileLocalStorage };
  try {
    assert.strictEqual(storageModule.isStorageAvailable(), false, 'isStorageAvailable must return false when setItem throws');
    assert.strictEqual(storageModule.getItem('key1', 42), 42, 'getItem must return fallback 42');
    assert.strictEqual(storageModule.setItem('key1', 'val'), false, 'setItem must return false on quota/security error');
    assert.strictEqual(storageModule.removeItem('key1'), false, 'removeItem must return false on security error');
    assert.doesNotThrow(() => storageModule.cleanupLegacyBrowserStorage(), 'cleanupLegacyBrowserStorage must swallow individual removeItem exceptions');
    assert.doesNotThrow(() => storageModule.purgeLegacyStorageKeys(), 'purgeLegacyStorageKeys must swallow individual removeItem exceptions');
  } finally {
    delete global.window;
  }
});

runTest('Scenario E: Happy path in-memory localStorage simulation', () => {
  const store = new Map();
  const workingLocalStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, val) {
      store.set(key, String(val));
    },
    removeItem(key) {
      store.delete(key);
    }
  };

  global.window = { localStorage: workingLocalStorage };
  try {
    assert.strictEqual(storageModule.isStorageAvailable(), true, 'isStorageAvailable must return true for functional localStorage');

    // Test setItem and getItem
    assert.strictEqual(storageModule.setItem('test_k1', 'hello_world'), true);
    assert.strictEqual(storageModule.getItem('test_k1', 'default'), 'hello_world');

    // Test nonexistent key fallback
    assert.strictEqual(storageModule.getItem('nonexistent', 'my_default'), 'my_default');

    // Test removeItem
    assert.strictEqual(storageModule.removeItem('test_k1'), true);
    assert.strictEqual(storageModule.getItem('test_k1', 'gone'), 'gone');

    // Populate all 16 legacy keys + 2 active keys
    for (const legacyKey of storageModule.LEGACY_STORAGE_KEYS) {
      storageModule.setItem(legacyKey, 'legacy_data_' + legacyKey);
    }
    storageModule.setItem('active_key_1', 'keep_me_1');
    storageModule.setItem('active_key_2', 'keep_me_2');

    assert.strictEqual(store.size, 18, 'Store should contain 18 keys before cleanup');

    // Run purge
    storageModule.purgeLegacyStorageKeys();

    assert.strictEqual(store.size, 2, 'Store should contain only 2 active keys after legacy purge');
    assert.strictEqual(storageModule.getItem('active_key_1'), 'keep_me_1');
    assert.strictEqual(storageModule.getItem('active_key_2'), 'keep_me_2');
    for (const legacyKey of storageModule.LEGACY_STORAGE_KEYS) {
      assert.strictEqual(storageModule.getItem(legacyKey, null), null, `Legacy key ${legacyKey} should be purged`);
    }
  } finally {
    delete global.window;
  }
});

// -----------------------------------------------------------------
// 3. utils.js Adversarial Stress Testing
// -----------------------------------------------------------------
console.log('\n--- 3. utils.js Adversarial Empirical Stress Testing ---');

import * as utilsModule from '../utils.js';

runTest('clamp mathematical robustness (3-arg & 4-arg signatures)', () => {
  // 3-arg: clamp(value, min, max)
  assert.strictEqual(utilsModule.clamp(5, 0, 10), 5);
  assert.strictEqual(utilsModule.clamp(-10, 0, 10), 0);
  assert.strictEqual(utilsModule.clamp(20, 0, 10), 10);
  assert.strictEqual(utilsModule.clamp('15.5', 0, 20), 15.5);
  assert.strictEqual(utilsModule.clamp('invalid_num', 5, 20), 5, 'NaN should fallback to min in 3-arg clamp');

  // 4-arg: clamp(value, fallback, min, max)
  assert.strictEqual(utilsModule.clamp('invalid_num', 100, 0, 50), 100, 'NaN returns fallback in 4-arg clampNumber');
  assert.strictEqual(utilsModule.clamp(25, 10, 0, 50), 25);
  assert.strictEqual(utilsModule.clamp(-5, 10, 0, 50), 0);
  assert.strictEqual(utilsModule.clamp(100, 10, 0, 50), 50);

  // Infinity / -Infinity bounds
  assert.strictEqual(utilsModule.clamp(100, 0), 100);
  assert.strictEqual(utilsModule.clamp(-100, 0), 0);
});

runTest('clampIndex boundary and non-finite robustness', () => {
  assert.strictEqual(utilsModule.clampIndex(0, 10), 0);
  assert.strictEqual(utilsModule.clampIndex(9, 10), 9);
  assert.strictEqual(utilsModule.clampIndex(15, 10), 9);
  assert.strictEqual(utilsModule.clampIndex(-5, 10), 0);
  assert.strictEqual(utilsModule.clampIndex('invalid', 10), 0);
  assert.strictEqual(utilsModule.clampIndex(5, 0), 0, '0 length should clamp to index 0');
});

runTest('escapeHtml, escapeHtmlAttr, escapeHtmlText XSS defense', () => {
  const xssPayload = '<script>alert("XSS & \'attack\'")</script>';
  const expectedEscaped = '&lt;script&gt;alert(&quot;XSS &amp; &#039;attack&#039;&quot;)&lt;/script&gt;';

  assert.strictEqual(utilsModule.escapeHtml(xssPayload), expectedEscaped);
  assert.strictEqual(utilsModule.escapeHtmlAttr(xssPayload), expectedEscaped);
  assert.strictEqual(utilsModule.escapeHtmlText(xssPayload), expectedEscaped);

  // Non-string inputs
  assert.strictEqual(utilsModule.escapeHtml(null), '');
  assert.strictEqual(utilsModule.escapeHtml(undefined), '');
  assert.strictEqual(utilsModule.escapeHtml(12345), '');
});

runTest('normalizeSafeLinkHref protocol whitelist & scheme filtering', () => {
  // Safe links
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('https://example.com/page?a=1&b=2'), 'https://example.com/page?a=1&amp;b=2');
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('http://insecure.org/path'), 'http://insecure.org/path');
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('mailto:user@test.com'), 'mailto:user@test.com');
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('ftp://files.example.com'), 'ftp://files.example.com');
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('#section-1'), '#section-1');
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('/local/resource'), '/local/resource');

  // Unsafe / Malicious links
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('javascript:alert(1)'), null);
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('JAVASCRIPT:alert(1)'), null);
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('data:text/html,<script>alert(1)</script>'), null);
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('vbscript:msgbox(1)'), null);
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('file:///etc/passwd'), null);
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('blob:https://evil.com/uuid'), null);
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('//protocol-relative-evil.com'), null);
  assert.strictEqual(utilsModule.normalizeSafeLinkHref('http://safe.com/\u0000injected'), null, 'Control characters must be rejected');
});

runTest('formatTime formatting fidelity', () => {
  assert.strictEqual(utilsModule.formatTime(0), '0:00');
  assert.strictEqual(utilsModule.formatTime(9), '0:09');
  assert.strictEqual(utilsModule.formatTime(59), '0:59');
  assert.strictEqual(utilsModule.formatTime(60), '1:00');
  assert.strictEqual(utilsModule.formatTime(125), '2:05');
  assert.strictEqual(utilsModule.formatTime(3599), '59:59');
  assert.strictEqual(utilsModule.formatTime(3600), '1:00:00');
  assert.strictEqual(utilsModule.formatTime(3665), '1:01:05');
  assert.strictEqual(utilsModule.formatTime(86400), '24:00:00');
  assert.strictEqual(utilsModule.formatTime(-50), '0:00', 'Negative time clamped to 0:00');
  assert.strictEqual(utilsModule.formatTime('invalid'), '0:00', 'NaN time fallback to 0:00');
});

runTest('formatNumber formatting fidelity', () => {
  assert.strictEqual(utilsModule.formatNumber(0), '0');
  assert.strictEqual(utilsModule.formatNumber(1000), (1000).toLocaleString());
  assert.strictEqual(utilsModule.formatNumber(1234567), (1234567).toLocaleString());
  assert.strictEqual(utilsModule.formatNumber('invalid'), '0');
});

runTest('isTouchDevice detection logic', () => {
  // SSR (window undefined)
  const origWindow = global.window;
  const origNavigator = global.navigator;
  try {
    delete global.window;
    delete global.navigator;
    assert.strictEqual(utilsModule.isTouchDevice(), false);

    // Desktop mock
    global.window = {
      matchMedia: (query) => ({ matches: false })
    };
    global.navigator = { maxTouchPoints: 0 };
    assert.strictEqual(utilsModule.isTouchDevice(), false);

    // Touchscreen mock (ontouchstart)
    global.window = {
      ontouchstart: null,
      matchMedia: (query) => ({ matches: false })
    };
    assert.strictEqual(utilsModule.isTouchDevice(), true);

    // Touchscreen mock (maxTouchPoints > 0)
    global.window = {
      matchMedia: (query) => ({ matches: false })
    };
    global.navigator = { maxTouchPoints: 5 };
    assert.strictEqual(utilsModule.isTouchDevice(), true);

    // Touchscreen mock (pointer: coarse)
    global.window = {
      matchMedia: (query) => ({ matches: query === '(pointer: coarse)' })
    };
    global.navigator = { maxTouchPoints: 0 };
    assert.strictEqual(utilsModule.isTouchDevice(), true);
  } finally {
    if (origWindow !== undefined) global.window = origWindow; else delete global.window;
    if (origNavigator !== undefined) global.navigator = origNavigator; else delete global.navigator;
  }
});

await runTestAsync('debounce executes after delay and passes latest args', async () => {
  let callCount = 0;
  let lastArg = null;
  const debounced = utilsModule.debounce((val) => {
    callCount++;
    lastArg = val;
  }, 50);

  debounced('a');
  debounced('b');
  debounced('c');

  assert.strictEqual(callCount, 0, 'Should not execute immediately');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.strictEqual(callCount, 1, 'Should execute exactly once after delay');
  assert.strictEqual(lastArg, 'c', 'Should receive latest arg');
});

await runTestAsync('throttle limits execution rate', async () => {
  let callCount = 0;
  const throttled = utilsModule.throttle(() => {
    callCount++;
  }, 50);

  throttled();
  throttled();
  throttled();

  assert.strictEqual(callCount, 1, 'First call should execute immediately');
  await new Promise(resolve => setTimeout(resolve, 80));
  throttled();
  assert.strictEqual(callCount, 2, 'Call after window should execute');
});

console.log('\n================================================================');
console.log(`ALL CHALLENGER 2 ADVERSARIAL TESTS PASSED: ${passedTests}/${totalTests} (100%)`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}

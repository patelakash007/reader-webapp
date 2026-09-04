'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const parser = await import('../src/parser.mjs');
  const { createAppContext } = await import('../src/context.mjs');
  const { cancelPendingRender } = await import('../src/utils.mjs');
  const tts = await import('../src/tts.mjs');

  console.log('--- Running hardening regression tests ---');

  const nested = parser.parseInline('**bold *and italic* inside**');
  assert.strictEqual(nested, '<strong>bold <em>and italic</em> inside</strong>');
  assert.strictEqual(parser.parseInline('2 * 3 * 4'), '2 * 3 * 4');
  assert(parser.parseInline('`2 * 3`').includes('<code>2 * 3</code>'));
  assert(parser.parseInline('![cover](https://example.com/cover.png)').includes('[Image: cover]'));
  assert(!parser.parseInline('[bad](javascript:alert(1))').includes('javascript:'));
  assert(parser.parseInline('[ok](https://example.com/a_(b))').includes('href="https://example.com/a_(b)"'));
  assert.strictEqual(parser.parseInline('\\*literal\\*'), '*literal*');

  const markdown = [
    '# H1',
    '## H2',
    '### H3',
    '#### H4',
    '##### H5',
    '###### H6',
    '',
    'TITLE WITHOUT MARKUP',
    '',
    'First soft',
    'line stays in one paragraph.',
    '',
    '1. first',
    '2. second',
    '3. third',
    '   - nested a',
    '   - nested b',
    '',
    '> quote line one',
    '> quote line two',
    '',
    '```text',
    '  indented code  ',
    '```'
  ].join('\n');
  const html = parser.parseMarkdownToHtml(markdown);
  for (let level = 1; level <= 6; level += 1) assert(html.includes(`<h${level} id="h${level}">H${level}</h${level}>`));
  assert(html.includes('<h2 id="title-without-markup">TITLE WITHOUT MARKUP</h2>'));
  assert(html.includes('<p>First soft<br>\nline stays in one paragraph.</p>'));
  assert(html.includes('<ol>') && html.includes('<li>first'));
  assert(html.includes('<li>third<ul><li>nested a</li><li>nested b</li></ul></li>'));
  assert(html.includes('<blockquote><p>quote line one<br>\nquote line two</p></blockquote>'));
  assert(html.includes('<pre><code>  indented code  </code></pre>'));

  const sentinelText = 'User text \uE000CODE0\uE001 and \uE000LINK0\uE001 remains visible.';
  const sentinelHtml = parser.parseMarkdownToHtml(sentinelText, false);
  assert(sentinelHtml.includes('\uE000CODE0\uE001'));
  assert(sentinelHtml.includes('\uE000LINK0\uE001'));

  const ids = parser.parseMarkdownToHtml('# Same\n\n# Same\n\n# Same');
  assert(ids.includes('id="same"'));
  assert(ids.includes('id="same-2"'));
  assert(ids.includes('id="same-3"'));
  assert(!ids.includes('heading-0'));

  const context = createAppContext({});
  const before = context.runtime.reader.activeRenderId;
  cancelPendingRender(context);
  assert.strictEqual(context.runtime.reader.activeRenderId, before + 1);
  cancelPendingRender(context, { clearContent: true });
  assert.strictEqual(context.runtime.reader.activeRenderId, before + 2);

  assert.strictEqual(tts.LAZY_TOKENIZE_WORD_LIMIT, 5000);
  const appSource = fs.readFileSync(path.join(__dirname, '../src/app.mjs'), 'utf8');
  assert(appSource.includes('reader.cancelPendingRender()'), 'navigation must invalidate pending renders');
  assert(appSource.includes('.reader-raw-editor'), 'editor must preserve raw text in a textarea buffer');
  const swSource = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert(swSource.includes('isCanonicalNavigation(request)'), 'service worker must restrict navigation interception');
  assert(!swSource.includes('if (request.mode === \'navigate\') {'), 'service worker must not intercept all navigations');
  const contextSource = fs.readFileSync(path.join(__dirname, '../src/context.mjs'), 'utf8');
  assert(!contextSource.includes("'(pointer: coarse)'"), 'coarse pointer must not be the mobile classifier');
  const parserSource = fs.readFileSync(path.join(__dirname, '../src/parser.mjs'), 'utf8');
  assert(parserSource.includes('enableScripting: false'), 'PDF parsing must disable PDF scripting');

  console.log('ALL HARDENING REGRESSION TESTS PASSED.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

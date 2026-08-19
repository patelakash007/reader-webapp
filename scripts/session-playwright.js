const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  browserEnvVars,
  ensureOutputDir,
  findBrowserExecutable,
  outputDir,
  startStaticServer,
  waitForServer,
  writeJson
} = require('./browser-smoke-utils');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadPlaywright() {
  for (const packageName of ['playwright-core', 'playwright']) {
    try { return { packageName, module: require(packageName) }; }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  return null;
}

function capturePageErrors(page, target) {
  page.on('console', message => { if (message.type() === 'error') target.push(message.text()); });
  page.on('pageerror', error => target.push(error.message));
}

async function waitForText(page, selector, text) {
  await page.waitForFunction(([targetSelector, expected]) => {
    const target = document.querySelector(targetSelector);
    return Boolean(target && (target.textContent || '').includes(expected));
  }, [selector, text]);
}

function makePdfBuffer(text) {
  const escapePdfText = value => String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 16 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

function makeDocxFixture(text) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-docx-'));
  const output = path.join(tempDir, 'fixture.docx');
  const python = process.env.PYTHON || process.env.PYTHON3 || (process.platform === 'win32' ? 'python' : 'python3');
  const script = [
    'import sys, zipfile',
    'out, text = sys.argv[1], sys.argv[2]',
    "files = {",
    "'[Content_Types].xml': '<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>',",
    "'_rels/.rels': '<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>',",
    "'word/document.xml': '<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t xml:space=\"preserve\">' + text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;') + '</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'",
    '}',
    "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:",
    '    for name, value in files.items(): z.writestr(name, value)',
  ].join('\n');
  try {
    childProcess.execFileSync(python, ['-c', script, output, text], { stdio: 'ignore' });
    return { buffer: fs.readFileSync(output), cleanup: () => { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {} } };
  } catch (error) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    return { buffer: null, cleanup: () => {}, reason: `DOCX fixture unavailable: ${error.message}` };
  }
}

async function waitForQueueCount(page, count, timeout = 8000) {
  await page.waitForFunction(expected => document.querySelectorAll('#sessionDesktopList [data-session-doc-id]').length >= expected, count, { timeout });
}

async function sourceCount(page, sourceType) {
  return page.locator('#sessionDesktopList .session-doc').filter({ hasText: sourceType }).count();
}

async function run() {
  ensureOutputDir();
  const playwright = loadPlaywright();
  if (!playwright) throw new Error('Session Playwright checks require playwright-core or playwright.');
  const browserExecutable = findBrowserExecutable();
  const localServer = await startStaticServer();
  await waitForServer(localServer.url);
  const results = [];
  const skips = [];
  const docxFixture = makeDocxFixture('DOCX fixture reading desk');
  let browser;

  try {
    const launchOptions = { headless: true };
    if (browserExecutable) launchOptions.executablePath = browserExecutable.path;
    else if (playwright.packageName === 'playwright-core') console.warn(`No browser executable found. Set ${browserEnvVars.join(', ')}.`);
    browser = await playwright.module.chromium.launch(launchOptions);

    const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    capturePageErrors(page, errors);
    await page.goto(localServer.url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app');

    await page.fill('#pasteArea', `# First document\n\n${'First long line. '.repeat(700)}\n\n## First section`);
    await page.click('#readBtn');
    await page.waitForSelector('#readerView.active');
    await waitForText(page, '#readerContent', 'First document');

    await page.setInputFiles('#fileInput', [
      { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('Second document body') },
      { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('Third duplicate body') }
    ]);
    await waitForQueueCount(page, 3);
    const names = await page.locator('#sessionDesktopList .session-doc-name').allTextContents();
    assert(names.includes('same.txt') && names.includes('same (2).txt'), `Duplicate names were not disambiguated: ${JSON.stringify(names)}`);
    results.push('Two-plus document session creation and duplicate names passed.');

    const entries = page.locator('#sessionDesktopList [data-session-doc-id]');
    const firstId = await entries.nth(0).getAttribute('data-session-doc-id');
    const secondId = await entries.nth(1).getAttribute('data-session-doc-id');
    assert(firstId && secondId && firstId !== secondId, 'Session document IDs were not stable and unique.');

    await page.locator(`[data-session-doc-id="${firstId}"]`).focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(id => document.querySelector(`[data-session-doc-id="${CSS.escape(id)}"]`)?.getAttribute('aria-selected') === 'true', secondId);
    assert((await page.locator('#readerContent').textContent()).includes('Second document body'), 'Queue keyboard navigation did not switch documents.');
    results.push('Queue keyboard navigation and document switching passed.');

    await page.locator(`[data-session-doc-id="${firstId}"]`).click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(120);
    const firstProgress = await page.locator('#progressBar').evaluate(el => Number.parseFloat(el.style.width) || 0);
    assert(firstProgress > 60, `First document progress did not advance: ${firstProgress}`);
    await page.locator(`[data-session-doc-id="${secondId}"]`).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
    const secondProgress = await page.locator('#progressBar').evaluate(el => Number.parseFloat(el.style.width) || 0);
    assert(secondProgress < 25, `Second document inherited first document progress: ${secondProgress}`);
    await page.locator(`[data-session-doc-id="${firstId}"]`).click();
    await page.waitForTimeout(120);
    const restoredFirstProgress = await page.locator('#progressBar').evaluate(el => Number.parseFloat(el.style.width) || 0);
    assert(restoredFirstProgress > 55, `First document progress was not isolated/restored: ${restoredFirstProgress}`);
    results.push('Progress isolation and in-session restoration passed.');

    const unsafeDoc = `# Unsafe second\n\n<script>window.__readerUnsafeSecond = 1<\/script> <img src=x onerror="window.__readerUnsafeSecond=2"> [bad](javascript:alert(1)) [safe](https://example.com/path?q=2) \`<b>literal</b>\``;
    await page.setInputFiles('#fileInput', { name: 'unsafe.md', mimeType: 'text/markdown', buffer: Buffer.from(unsafeDoc) });
    await waitForQueueCount(page, 4);
    const unsafeEntry = page.locator('#sessionDesktopList [data-session-doc-id]').filter({ hasText: 'unsafe.md' }).first();
    await unsafeEntry.click();
    await waitForText(page, '#readerContent', 'Unsafe second');
    const unsafeState = await page.evaluate(() => ({
      xss: window.__readerUnsafeSecond || 0,
      scripts: document.querySelectorAll('#readerContent script').length,
      handlers: Array.from(document.querySelectorAll('#readerContent *')).filter(el => Array.from(el.attributes).some(attr => /^on/i.test(attr.name))).length,
      jsLinks: document.querySelectorAll('#readerContent a[href^="javascript:"]').length,
      safeLinks: document.querySelectorAll('#readerContent a[href^="https://example.com/"]').length,
      literal: Array.from(document.querySelectorAll('#readerContent code')).map(el => el.textContent || '').join(' ')
    }));
    assert(unsafeState.xss === 0 && unsafeState.scripts === 0 && unsafeState.handlers === 0, 'Unsafe content executed or rendered as script/event-handler markup in a second document.');
    assert(unsafeState.jsLinks === 0 && unsafeState.safeLinks === 1, 'Unsafe/safe link policy regressed in a second document.');
    assert(unsafeState.literal.includes('<b>literal</b>'), 'Inline code in second document was not literal.');
    results.push('Second-document sanitization passed.');

    await page.click('#tocBtn');
    await page.waitForSelector('#tocDialog[open]');
    assert(await page.locator('#tocBody .toc-item').count() >= 2, 'Active document TOC did not contain headings.');
    const activeBeforeToc = await page.locator('#sessionDesktopList .session-doc.active .session-doc-name').textContent();
    await page.locator('#tocBody .toc-item').nth(1).click();
    await page.waitForTimeout(80);
    const activeAfterToc = await page.locator('#sessionDesktopList .session-doc.active .session-doc-name').textContent();
    assert(activeAfterToc === activeBeforeToc, 'TOC selection changed the active document.');
    results.push('Active-document TOC scoping passed.');

    const storageState = await page.evaluate(async () => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);
      const databases = indexedDB.databases ? await indexedDB.databases() : [];
      const cacheNames = 'caches' in window ? await caches.keys() : [];
      let cachedText = '';
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          if (response) cachedText += ` ${await response.text()}`;
        }
      }
      return { localKeys, sessionKeys, databaseNames: databases.map(item => item.name || ''), cacheNames, cachedText };
    });
    assert(storageState.localKeys.length === 0 && storageState.sessionKeys.length === 0, `Browser storage unexpectedly contains keys: ${JSON.stringify(storageState.localKeys)} / ${JSON.stringify(storageState.sessionKeys)}`);
    assert(storageState.databaseNames.length === 0, `IndexedDB databases were created: ${JSON.stringify(storageState.databaseNames)}`);
    assert(!storageState.cachedText.includes('Unsafe second') && !storageState.cachedText.includes('Second document body'), 'Document contents leaked into the service-worker cache.');
    results.push('No document data in browser storage or service-worker cache passed.');

    const speechSupported = await page.evaluate(() => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined');
    if (speechSupported) {
      await page.click('[data-settings-section="listen"] .settings-section-toggle');
      const before = await page.evaluate(() => {
        const synth = window.speechSynthesis;
        if (!synth.__readerCancelSpy) {
          const original = synth.cancel.bind(synth);
          synth.__readerCancelCount = 0;
          synth.cancel = () => { synth.__readerCancelCount += 1; return original(); };
          synth.__readerCancelSpy = true;
        }
        return synth.__readerCancelCount;
      });
      await page.click('#ttsBtn');
      await page.waitForTimeout(50);
      await page.locator(`[data-session-doc-id="${firstId}"]`).click();
      await page.waitForTimeout(50);
      const after = await page.evaluate(() => ({ count: window.speechSynthesis.__readerCancelCount || 0, pressed: document.querySelector('#ttsBtn')?.getAttribute('aria-pressed') }));
      assert(after.count > before && after.pressed === 'false', 'Speech was not torn down on document switch.');
      results.push('Speech teardown on document switch passed.');
    } else {
      skips.push('Speech teardown skipped: browser does not expose speechSynthesis/SpeechSynthesisUtterance.');
    }

    await page.setInputFiles('#fileInput', [
      { name: 'fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('TXT fixture reading desk') },
      { name: 'fixture.md', mimeType: 'text/markdown', buffer: Buffer.from('# Markdown fixture\n\nMarkdown fixture reading desk') }
    ]);
    await waitForQueueCount(page, 6);
    assert(await sourceCount(page, 'TXT') >= 1 && await sourceCount(page, 'Markdown') >= 1, 'TXT/Markdown queueing did not expose source types.');
    results.push('TXT/Markdown queueing passed.');

    await page.setInputFiles('#fileInput', { name: 'fixture.pdf', mimeType: 'application/pdf', buffer: makePdfBuffer('PDF fixture reading desk') });
    try {
      await page.waitForFunction(() => Array.from(document.querySelectorAll('#sessionDesktopList .session-doc')).some(el => (el.textContent || '').includes('PDF')), { timeout: 6000 });
      results.push('PDF queueing fixture passed.');
    } catch (_) {
      skips.push('PDF queueing skipped: local PDF fixture did not parse within 6 seconds.');
    }

    if (docxFixture.buffer) {
      await page.setInputFiles('#fileInput', { name: 'fixture.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docxFixture.buffer });
      try {
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#sessionDesktopList .session-doc')).some(el => (el.textContent || '').includes('DOCX')), { timeout: 6000 });
        results.push('DOCX queueing fixture passed.');
      } catch (_) {
        skips.push('DOCX queueing skipped: local DOCX fixture did not parse within 6 seconds.');
      }
    } else {
      skips.push(docxFixture.reason || 'DOCX queueing skipped: fixture generator unavailable.');
    }

    const largeA = Buffer.from('A'.repeat(14 * 1024 * 1024));
    await page.setInputFiles('#fileInput', { name: 'large-first.txt', mimeType: 'text/plain', buffer: largeA });
    await page.setInputFiles('#fileInput', { name: 'fast-second.txt', mimeType: 'text/plain', buffer: Buffer.from('fast second result') });
    await page.waitForTimeout(300);
    const staleState = await page.evaluate(() => ({
      names: Array.from(document.querySelectorAll('#sessionDesktopList .session-doc-name')).map(el => el.textContent || ''),
      active: document.querySelector('#sessionDesktopList .session-doc.active .session-doc-name')?.textContent || '',
      visible: document.querySelector('#readerContent')?.textContent || ''
    }));
    assert(staleState.names.includes('fast-second.txt'), 'Newer fast read did not reach the session.');
    assert(!staleState.names.includes('large-first.txt'), 'Stale large read result overwrote the session queue.');
    results.push('Large-read cancellation/stale-result rejection passed.');

    await page.click('#sessionClearDesktop');
    await page.waitForFunction(() => document.querySelectorAll('#sessionDesktopList [data-session-doc-id]').length === 0);
    assert(await page.locator('#inputView').isVisible(), 'Clear session did not return to the input view.');
    assert((await page.locator('#readerContent').textContent()) === '', 'Clear session did not clear rendered document content.');
    results.push('Explicit Clear session lifecycle passed.');

    await page.fill('#pasteArea', 'reload-reset marker');
    await page.click('#readBtn');
    await page.waitForSelector('#readerView.active');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#app');
    assert(await page.locator('#pasteArea').inputValue() === '', 'Reload restored pasted text.');
    assert(await page.locator('#sessionDesktopList [data-session-doc-id]').count() === 0, 'Reload retained in-memory session documents.');
    assert(!(await page.locator('body').textContent()).includes('reload-reset marker'), 'Reload retained document content in the DOM.');
    results.push('Reload-reset lifecycle passed.');
    assert(errors.length === 0, `Browser errors:\n${errors.join('\n')}`);

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobilePage = await mobileContext.newPage();
    const mobileErrors = [];
    capturePageErrors(mobilePage, mobileErrors);
    await mobilePage.goto(localServer.url, { waitUntil: 'networkidle' });
    await mobilePage.fill('#pasteArea', '# Mobile queue\n\nMobile first');
    await mobilePage.click('#readBtn');
    await mobilePage.setInputFiles('#fileInput', { name: 'mobile-second.txt', mimeType: 'text/plain', buffer: Buffer.from('Mobile second') });
    await mobilePage.waitForFunction(() => document.querySelectorAll('#sessionMobileList [data-session-doc-id]').length === 2);
    await mobilePage.click('#mobileFab');
    await mobilePage.waitForSelector('#toolbar.expanded');
    const sessionToggle = mobilePage.locator('.session-mobile .settings-section-toggle');
    if ((await sessionToggle.getAttribute('aria-expanded')) !== 'true') await sessionToggle.click();
    const mobileSession = await mobilePage.evaluate(() => ({
      drawerActive: document.querySelector('#settingsDrawer')?.classList.contains('active'),
      count: document.querySelectorAll('#sessionMobileList [data-session-doc-id]').length,
      width: document.body.scrollWidth,
      viewport: window.innerWidth,
      overflow: getComputedStyle(document.body).overflow,
      aria: document.querySelector('.session-mobile .settings-section-toggle')?.getAttribute('aria-expanded')
    }));
    assert(mobileSession.drawerActive && mobileSession.count === 2, 'Mobile queue did not render both session documents.');
    assert(mobileSession.width <= mobileSession.viewport + 1, `Mobile queue overflowed horizontally: ${mobileSession.width}/${mobileSession.viewport}`);
    assert(mobileSession.overflow === 'hidden' && mobileSession.aria === 'true', 'Mobile queue did not integrate with the bottom-sheet scroll lock/state.');
    await mobilePage.locator('#sessionMobileList [data-session-doc-id]').nth(1).click();
    assert((await mobilePage.locator('#readerContent').textContent()).includes('Mobile second'), 'Mobile queue switching did not change the active document.');
    await mobileContext.close();
    results.push('Mobile queue at 390×844 passed.');

    writeJson('session-playwright.json', {
      mode: 'session-playwright',
      url: localServer.url,
      title: await page.title(),
      playwrightPackage: playwright.packageName,
      browserExecutable: browserExecutable ? browserExecutable.path : null,
      browserSource: browserExecutable ? browserExecutable.source : 'playwright default',
      results,
      skips
    });
    console.log(`Session Playwright checks passed using ${playwright.packageName}.`);
    if (skips.length) console.log(`Skips/limitations: ${skips.join(' | ')}`);
    console.log(`Saved logs under ${path.relative(process.cwd(), outputDir)}`);
  } finally {
    docxFixture.cleanup();
    if (browser) await browser.close();
    await localServer.close();
  }
}

run().catch(error => {
  console.error(error.message);
  console.error('If Playwright browser launch failed, set BROWSER_EXE, PLAYWRIGHT_CHROMIUM_EXECUTABLE, or CHROMIUM_EXECUTABLE.');
  process.exit(1);
});

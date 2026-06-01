const fs = require('node:fs');
const path = require('node:path');
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
    try {
      return { packageName, module: require(packageName) };
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  return null;
}

function capturePageErrors(page, target) {
  page.on('console', message => {
    if (message.type() === 'error') target.push(message.text());
  });
  page.on('pageerror', error => {
    target.push(error.message);
  });
}

async function getStatusText(page) {
  try {
    return await page.locator('#statusMessage').textContent({ timeout: 1500 }) || '';
  } catch (err) {
    return '';
  }
}

async function waitForText(page, selector, text) {
  await page.waitForFunction(
    ([targetSelector, expectedText]) => {
      const target = document.querySelector(targetSelector);
      return Boolean(target && target.textContent && target.textContent.includes(expectedText));
    },
    [selector, text]
  );
}

async function revealToolbar(page) {
  const isHidden = await page.locator('#toolbar.hidden-bar').count();
  if (!isHidden) return;

  await page.locator('#readerContent').click({ position: { x: 20, y: 20 } });
  await page.waitForFunction(() => !document.querySelector('#toolbar')?.classList.contains('hidden-bar'));
}

async function runDeepPlaywrightChecks() {
  ensureOutputDir();
  const playwright = loadPlaywright();

  if (!playwright) {
    throw new Error('Deep Playwright checks require playwright-core or playwright.');
  }

  const browserExecutable = findBrowserExecutable();
  const localServer = await startStaticServer();
  const url = localServer.url;
  const screenshots = [];
  const results = [];
  let browser;

  try {
    await waitForServer(url);

    const launchOptions = { headless: true };
    if (browserExecutable) {
      launchOptions.executablePath = browserExecutable.path;
    } else if (playwright.packageName === 'playwright-core') {
      console.warn('No browser executable was detected for deep checks.');
      console.warn(`Set one of these env vars to force a Chromium-compatible executable: ${browserEnvVars.join(', ')}`);
    }

    browser = await playwright.module.chromium.launch(launchOptions);
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      acceptDownloads: true
    });
    const page = await context.newPage();
    const browserErrors = [];
    capturePageErrors(page, browserErrors);

    await page.goto(url, { waitUntil: 'networkidle' });
    const title = await page.title();
    await page.waitForSelector('#app');
    assert(/Reader Webapp/i.test(title), `Unexpected page title: ${title}`);
    screenshots.push(path.join(outputDir, 'deep-initial.png'));
    await page.screenshot({ path: screenshots[screenshots.length - 1], fullPage: false });
    results.push('Initial app shell loaded.');

    await page.fill('#pasteArea', 'temporary text');
    await page.reload({ waitUntil: 'networkidle' });
    const restoredValue = await page.locator('#pasteArea').inputValue();
    assert(restoredValue === '', 'Paste textarea restored previous text after reload.');
    results.push('Input state resets after reload.');

    const maliciousMarkdown = [
      '# Alpha Heading',
      '',
      'HELLO SECTION',
      '',
      'Paragraph with **bold**, *emphasis*, `code`, [safe](https://example.com/path?q=1), and [bad](javascript:alert(1)).',
      '',
      '<script>window.__readerXss = 1;</script><img src=x onerror="window.__readerXss=2">',
      '',
      '```',
      '<b>raw code stays escaped</b>',
      '```',
      '',
      '- first item',
      '1. ordered item',
      '',
      '> quoted text'
    ].join('\n');

    await page.fill('#pasteArea', maliciousMarkdown);
    await page.click('#readBtn');
    await page.waitForSelector('#readerView.active');
    await waitForText(page, '#readerContent', 'Alpha Heading');
    screenshots.push(path.join(outputDir, 'deep-reader.png'));
    await page.screenshot({ path: screenshots[screenshots.length - 1], fullPage: false });

    const sanitize = await page.evaluate(() => ({
      xss: window.__readerXss || 0,
      scriptCount: document.querySelectorAll('#readerContent script').length,
      handlerCount: Array.from(document.querySelectorAll('#readerContent *'))
        .filter(element => Array.from(element.attributes).some(attribute => /^on/i.test(attribute.name))).length,
      javascriptLinks: document.querySelectorAll('#readerContent a[href^="javascript:"]').length,
      safeLinks: document.querySelectorAll('#readerContent a[href^="https://example.com/"]').length,
      h1Count: document.querySelectorAll('#readerContent h1').length,
      h2Count: document.querySelectorAll('#readerContent h2').length,
      preText: document.querySelector('#readerContent pre code')?.textContent || ''
    }));
    assert(sanitize.xss === 0, 'Injected script or event handler executed.');
    assert(sanitize.scriptCount === 0, 'Script nodes rendered into reader content.');
    assert(sanitize.handlerCount === 0, 'Event handler attributes rendered into reader content.');
    assert(sanitize.javascriptLinks === 0, 'Unsafe javascript: markdown link rendered.');
    assert(sanitize.safeLinks === 1, 'Safe HTTPS markdown link did not render.');
    assert(sanitize.h1Count >= 1 && sanitize.h2Count >= 1, 'Markdown headings did not render.');
    assert(sanitize.preText.includes('<b>raw code stays escaped</b>'), 'Code block text did not stay literal.');
    results.push('Markdown rendering and sanitization passed.');

    await revealToolbar(page);
    await page.click('#tocBtn');
    await page.waitForSelector('#tocDialog[open]');
    const tocItems = await page.locator('#tocBody .toc-item').count();
    assert(tocItems >= 2, 'TOC did not include rendered headings.');
    await page.click('#closeTocBtn');
    await page.waitForFunction(() => !document.querySelector('#tocDialog')?.open);
    results.push('TOC open and close flow passed.');

    await revealToolbar(page);
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsDrawer.active');
    await page.locator('#lineHeightInput').fill('2.2');
    await page.locator('#lineHeightInput').dispatchEvent('input');
    await page.locator('#letterSpacingInput').fill('0.05');
    await page.locator('#letterSpacingInput').dispatchEvent('input');
    const typography = await page.evaluate(() => ({
      lineHeight: document.querySelector('#readerContent').style.lineHeight,
      letterSpacing: document.querySelector('#readerContent').style.letterSpacing,
      expanded: document.querySelector('#settingsBtn').getAttribute('aria-expanded')
    }));
    assert(typography.lineHeight === '2.2', 'Line-height slider did not update reader style.');
    assert(typography.letterSpacing === '0.05em', 'Letter-spacing slider did not update reader style.');
    assert(typography.expanded === 'true', 'Settings button ARIA state did not expand.');
    results.push('Settings drawer controls passed.');

    await revealToolbar(page);
    await page.click('#editBtn');
    await page.waitForFunction(() => document.querySelector('#readerContent')?.getAttribute('contenteditable') === 'true');
    await page.locator('#readerContent').fill('## Edited Heading\n\nEdited body with **bold** text.');
    await page.click('#saveEditBannerBtn');
    await page.waitForFunction(() => document.querySelector('#readerContent h2')?.textContent.includes('Edited Heading'));
    const editState = await page.evaluate(() => ({
      editable: document.querySelector('#readerContent').hasAttribute('contenteditable'),
      currentText: document.querySelector('#readerContent')?.textContent || '',
      bannerVisible: document.querySelector('#editingBanner')?.classList.contains('show')
    }));
    assert(editState.editable === false, 'Reader content stayed editable after save.');
    assert(editState.currentText.includes('Edited body with bold text.'), 'Edited markdown was not re-rendered.');
    assert(editState.bannerVisible === false, 'Editing banner stayed visible after save.');
    results.push('Edit and save flow passed.');

    const downloadPromise = page.waitForEvent('download');
    await revealToolbar(page);
    await page.click('#downloadBtn');
    const download = await downloadPromise;
    assert(download.suggestedFilename() === 'Reader_Export.txt', `Unexpected download file name: ${download.suggestedFilename()}`);
    await download.delete();
    results.push('Download flow passed.');

    await page.click('#backBtn');
    await page.waitForSelector('#inputView:not(.hidden)');
    await page.setInputFiles('#fileInput', {
      name: 'sample.markdown',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Uploaded\n\nUploaded body')
    });
    await page.waitForSelector('#readerView.active');
    await waitForText(page, '#readerContent', 'Uploaded body');
    results.push('Markdown file upload passed.');

    await page.click('#backBtn');
    await page.waitForSelector('#inputView:not(.hidden)');
    await page.setInputFiles('#fileInput', {
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('x')
    });
    await page.waitForFunction(() => document.querySelector('#statusMessage')?.classList.contains('show'));
    const unsupportedStatus = await getStatusText(page);
    assert(/Unsupported format/i.test(unsupportedStatus), `Unsupported file status was wrong: ${unsupportedStatus}`);
    results.push('Unsupported file status passed.');

    await page.setInputFiles('#fileInput', {
      name: 'empty.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(0)
    });
    await page.waitForFunction(() => /empty/i.test(document.querySelector('#statusMessage')?.textContent || ''));
    results.push('Empty file status passed.');

    const serviceWorkerReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.ready;
      return Boolean(registration && registration.active);
    });
    assert(serviceWorkerReady, 'Service worker did not become ready.');
    await page.reload({ waitUntil: 'networkidle' });
    await context.setOffline(true);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app');
    assert(await page.locator('#pasteArea').isVisible(), 'Offline reload did not restore the app shell.');
    await context.setOffline(false);
    results.push('Service worker offline app shell passed.');

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    const mobileErrors = [];
    capturePageErrors(mobilePage, mobileErrors);
    await mobilePage.goto(url, { waitUntil: 'networkidle' });
    await mobilePage.fill('#pasteArea', '# Mobile\n\nMobile controls test.');
    await mobilePage.click('#readBtn');
    await mobilePage.waitForSelector('#readerView.active');
    await mobilePage.click('#mobileFab');
    await mobilePage.waitForSelector('#toolbar.expanded');
    await mobilePage.click('#settingsBtn');
    await mobilePage.waitForSelector('#settingsDrawer.active');
    const mobileState = await mobilePage.evaluate(() => ({
      fabExpanded: document.querySelector('#mobileFab')?.getAttribute('aria-expanded'),
      toolbarExpanded: document.querySelector('#toolbar')?.classList.contains('expanded'),
      drawerExpanded: document.querySelector('#settingsDrawer')?.classList.contains('active'),
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    assert(mobileState.fabExpanded === 'true' && mobileState.toolbarExpanded && mobileState.drawerExpanded, 'Mobile sheet or settings state did not expand.');
    assert(mobileState.bodyWidth <= mobileState.viewportWidth + 1, `Mobile layout overflowed horizontally: body=${mobileState.bodyWidth}, viewport=${mobileState.viewportWidth}`);
    screenshots.push(path.join(outputDir, 'deep-mobile-settings.png'));
    await mobilePage.screenshot({ path: screenshots[screenshots.length - 1], fullPage: false });
    assert(mobileErrors.length === 0, `Mobile browser errors:\n${mobileErrors.join('\n')}`);
    await mobileContext.close();
    results.push('Mobile settings flow passed.');

    assert(browserErrors.length === 0, `Browser errors:\n${browserErrors.join('\n')}`);

    writeJson('deep-playwright.json', {
      mode: 'deep-playwright',
      url,
      title,
      playwrightPackage: playwright.packageName,
      browserExecutable: browserExecutable ? browserExecutable.path : null,
      browserSource: browserExecutable ? browserExecutable.source : 'playwright default',
      screenshots: screenshots.map(filePath => path.relative(process.cwd(), filePath)),
      results
    });

    console.log(`Deep Playwright checks passed using ${playwright.packageName}.`);
    console.log(browserExecutable
      ? `Browser executable: ${browserExecutable.path}`
      : 'Browser executable: Playwright default browser resolution');
    console.log(`Saved screenshots and logs under ${path.relative(process.cwd(), outputDir)}`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await localServer.close();
  }
}

runDeepPlaywrightChecks().catch(error => {
  console.error(error.message);
  console.error('If Playwright browser launch failed, set BROWSER_EXE, PLAYWRIGHT_CHROMIUM_EXECUTABLE, or CHROMIUM_EXECUTABLE to a Chromium-compatible executable.');
  process.exit(1);
});

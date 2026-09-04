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

async function runPlaywrightSmoke() {
  ensureOutputDir();
  const playwright = loadPlaywright();

  if (!playwright) {
    console.warn('Playwright smoke skipped: neither playwright-core nor playwright is available to Node.');
    console.warn('Falling back to Chromium-only smoke. Install npm dependencies to enable Playwright interaction checks.');
    require('./smoke-chromium');
    return;
  }

  const browserExecutable = findBrowserExecutable();
  const localServer = await startStaticServer();
  const url = localServer.url;
  const consoleErrors = [];
  const pageErrors = [];
  let browser;

  try {
    await waitForServer(url);
    if (localServer.reusedExistingServer) {
      console.log(`Reusing existing local server at ${url}`);
    }
    const launchOptions = { headless: true };

    if (browserExecutable) {
      launchOptions.executablePath = browserExecutable.path;
    } else if (playwright.packageName === 'playwright-core') {
      console.warn('Playwright is available, but no browser executable was detected.');
      console.warn(`Set one of these env vars to force a Chromium-compatible executable: ${browserEnvVars.join(', ')}`);
    }

    browser = await playwright.module.chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(url, { waitUntil: 'networkidle' });
    const title = await page.title();
    await page.waitForSelector('#app');

    if (!/Reader Webapp/i.test(title)) throw new Error(`Unexpected page title: ${title}`);

    const moduleFiles = [
      './src/app.mjs', './src/constants.mjs', './src/context.mjs', './src/dom.mjs',
      './src/parser.mjs', './src/reader.mjs', './src/settings.mjs', './src/storage.mjs',
      './src/tts.mjs', './src/ui.mjs', './src/utils.mjs', './src/experience.mjs', './src/typography.mjs'
    ];
    const moduleRequests = await page.evaluate(async files => {
      const responses = await Promise.all(files.map(async file => {
        const response = await fetch(file, { cache: 'no-store' });
        return { file, status: response.status };
      }));
      const resourceNames = new Set(performance.getEntriesByType('resource').map(entry => entry.name));
      return responses.map(result => ({ ...result, requested: resourceNames.has(new URL(result.file, location.href).href) }));
    }, moduleFiles);
    const failedModules = moduleRequests.filter(module => module.status !== 200 || !module.requested);
    if (failedModules.length > 0) throw new Error(`ES module requests failed: ${JSON.stringify(failedModules)}`);

    await page.screenshot({ path: path.join(outputDir, 'playwright-desktop.png'), fullPage: true });

    await page.fill('#pasteArea', '# Smoke Test\n\nReader Webapp renders **Markdown** text in browser smoke checks.');
    await page.click('#readBtn');
    await page.waitForSelector('#readerView.active');
    await page.waitForFunction(() => document.querySelector('#readerContent')?.textContent.includes('Smoke Test'));
    await page.screenshot({ path: path.join(outputDir, 'playwright-reader.png'), fullPage: true });

    // Desktop: the primary Controls button must be a true show/hide affordance.
    await page.click('#mobileFab');
    await page.waitForTimeout(150);
    const desktopHidden = await page.locator('#toolbar.hidden-bar').count();
    if (!desktopHidden) throw new Error('Desktop Controls button did not hide the settings interface.');
    await page.click('#mobileFab');
    await page.waitForTimeout(150);
    if (await page.locator('#toolbar.hidden-bar').count()) throw new Error('Desktop Controls button did not restore the settings interface.');

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobilePage = await mobileContext.newPage();
    const mobileErrors = [];
    mobilePage.on('console', message => { if (message.type() === 'error') mobileErrors.push(message.text()); });
    mobilePage.on('pageerror', error => mobileErrors.push(error.message));
    await mobilePage.goto(url, { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('#app');
    await mobilePage.fill('#pasteArea', '# Mobile Smoke\n\nMobile reader controls render without overlap.');
    await mobilePage.click('#readBtn');
    await mobilePage.waitForSelector('#readerView.active');

    await mobilePage.click('#mobileFab');
    await mobilePage.waitForSelector('#toolbar.expanded');
    await mobilePage.waitForTimeout(450);

    const blockedControls = await mobilePage.evaluate(() => {
      const fab = document.querySelector('#mobileFab');
      const toolbar = document.querySelector('#toolbar');
      if (!fab || !toolbar) return [];
      const controls = Array.from(toolbar.querySelectorAll('button, input, select, [tabindex]')).filter(control => control !== fab);
      const isFabHitAt = (x, y) => {
        const target = document.elementFromPoint(x, y);
        return target === fab || (target && fab.contains(target));
      };
      return controls.filter(control => {
        const rect = control.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const points = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.right - 4, rect.top + rect.height / 2],
          [rect.left + 4, rect.top + rect.height / 2]
        ];
        return points.some(([x, y]) => x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight && isFabHitAt(x, y));
      }).map(control => control.id || control.getAttribute('aria-label') || control.textContent.trim() || control.tagName);
    });
    if (blockedControls.length > 0) throw new Error(`Mobile settings FAB blocks toolbar controls: ${blockedControls.join(', ')}`);

    // Preset inventory and mode switch should stay available in the mobile sheet.
    const presetCount = await mobilePage.locator('#presetTrack .preset-card').count();
    if (presetCount !== 10) throw new Error(`Expected 10 mobile light presets, found ${presetCount}.`);
    await mobilePage.click('#modeDark');
    await mobilePage.waitForTimeout(120);
    const darkPresetCount = await mobilePage.locator('#presetTrack .preset-card').count();
    if (darkPresetCount !== 10) throw new Error(`Expected 10 mobile dark presets, found ${darkPresetCount}.`);

    await mobilePage.click('#mobileFab');
    await mobilePage.waitForTimeout(120);
    if (await mobilePage.locator('#toolbar.expanded').count()) throw new Error('Mobile Controls button did not close the settings sheet.');

    await mobilePage.screenshot({ path: path.join(outputDir, 'playwright-mobile.png'), fullPage: true });
    await mobileContext.close();

    const allErrors = [...consoleErrors, ...pageErrors, ...mobileErrors];
    writeJson('playwright-smoke.json', {
      mode: 'playwright', url, title,
      playwrightPackage: playwright.packageName,
      browserExecutable: browserExecutable ? browserExecutable.path : null,
      browserSource: browserExecutable ? browserExecutable.source : 'playwright default',
      screenshots: [
        path.relative(process.cwd(), path.join(outputDir, 'playwright-desktop.png')),
        path.relative(process.cwd(), path.join(outputDir, 'playwright-reader.png')),
        path.relative(process.cwd(), path.join(outputDir, 'playwright-mobile.png'))
      ],
      consoleErrors, pageErrors, mobileErrors
    });
    if (allErrors.length > 0) throw new Error(`Playwright smoke found browser errors:\n${allErrors.join('\n')}`);
    console.log(`Playwright smoke passed using ${playwright.packageName}.`);
    console.log(browserExecutable ? `Browser executable: ${browserExecutable.path}` : 'Browser executable: Playwright default browser resolution');
    console.log(`Saved screenshots and logs under ${path.relative(process.cwd(), outputDir)}`);
  } finally {
    if (browser) await browser.close();
    await localServer.close();
  }
}

runPlaywrightSmoke().catch(error => {
  console.error(error.message);
  console.error('If Playwright browser launch failed, set BROWSER_EXE, PLAYWRIGHT_CHROMIUM_EXECUTABLE, or CHROMIUM_EXECUTABLE to a Chromium-compatible executable.');
  process.exit(1);
});

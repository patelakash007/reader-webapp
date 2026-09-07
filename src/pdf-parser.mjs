import { MAX_EXTRACTED_TEXT_CHARS, MAX_PDF_PAGES } from './constants.mjs';
import { assertActiveFileRead, isActiveFileRead } from './utils.mjs';

export function extractPdfPageText(items) {
  let text = '';
  let lastY = null;
  let lastX = null;
  let lastWidth = null;

  items.forEach(item => {
    const currentY = item.transform && typeof item.transform[5] === 'number' ? item.transform[5] : null;
    const currentX = item.transform && typeof item.transform[4] === 'number' ? item.transform[4] : null;
    const currentWidth = typeof item.width === 'number' ? item.width : null;
    const value = item.str || '';

    if (lastY !== null && currentY !== null) {
      const diffY = Math.abs(lastY - currentY);
      const height = Math.abs(item.height || 10);
      if (diffY > height * 1.2) {
        text += '\n\n';
      } else if (diffY > 2) {
        text += ' ';
      } else if (lastX !== null && currentX !== null) {
        const expectedNextX = lastX + (lastWidth || 0);
        if (currentX > expectedNextX + 1.5 && !text.endsWith(' ') && !value.startsWith(' ')) text += ' ';
      }
    }

    text += value;
    if (currentY !== null) lastY = currentY;
    if (currentX !== null) lastX = currentX;
    if (currentWidth !== null) lastWidth = currentWidth;
  });

  return text;
}

export function createPdfParser(context, { ui }) {
  const { runtime } = context;
  const libraries = {
    pdf: {
      esm: '../vendor/pdf.min.mjs',
      worker: '../vendor/pdf.worker.min.mjs',
      src: 'vendor/pdf.min.js',
      workerLegacy: 'vendor/pdf.worker.min.js',
      check: () => (typeof window !== 'undefined' ? window.pdfjsLib : null),
      onLoad: () => {
        if (typeof window !== 'undefined' && window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        }
      }
    }
  };

  async function loadLibrary() {
    const name = 'pdf';
    if (runtime.file.loadedLibraries.has(name)) return runtime.file.loadedLibraries.get(name);
    const promise = (async () => {
      const lib = libraries[name];
      if (!lib) throw new Error(`Unknown library: ${name}`);

      if (lib.check && lib.check()) {
        if (lib.onLoad) lib.onLoad();
        return lib.check();
      }

      if (name === 'pdf' && lib.esm) {
        try {
          const mod = await import(lib.esm);
          const pdfLib = mod && (mod.default || mod);
          if (pdfLib && pdfLib.getDocument) {
            if (pdfLib.GlobalWorkerOptions) {
              pdfLib.GlobalWorkerOptions.workerSrc = new URL(lib.worker, import.meta.url).href;
            }
            return pdfLib;
          }
        } catch (err) {
          console.warn('PDF.js ESM build failed to load, falling back to legacy bundle.', err);
        }
      }

      if (name === 'mammoth' && typeof window === 'undefined') {
        try {
          const mod = await import('../vendor/mammoth.browser.min.js');
          const mammothLib = mod && (mod.default || mod);
          if (mammothLib && mammothLib.extractRawText) return mammothLib;
        } catch (err) {}
      }

      return new Promise((resolve, reject) => {
        if (lib.check && lib.check()) {
          if (lib.onLoad) lib.onLoad();
          resolve(lib.check());
          return;
        }
        if (typeof document === 'undefined') {
          reject(new Error(`Cannot load script ${lib.src} in headless environment.`));
          return;
        }
        const script = document.createElement('script');
        script.src = lib.src;
        script.onload = () => {
          try {
            if (lib.onLoad) lib.onLoad();
            if (lib.check && lib.check()) resolve(lib.check());
            else reject(new Error(`Library ${name} loaded but could not be initialized.`));
          } catch (err) {
            reject(err);
          }
        };
        script.onerror = () => reject(new Error(`Failed to load local parser library ${name} from ${lib.src}. Check that the vendor file is available.`));
        document.head.appendChild(script);
      });
    })();

    runtime.file.loadedLibraries.set(name, promise);
    promise.catch(() => runtime.file.loadedLibraries.delete(name));
    return promise;
  }
  function showReadLoader(readToken, message) {
    if (isActiveFileRead(context, readToken)) ui.showLoader(message);
  }

  async function extractPdfText(arrayBuffer, readToken) {
    assertActiveFileRead(context, readToken);
    showReadLoader(readToken, 'Loading PDF worker module...');
    const pdfLib = await loadLibrary('pdf');
    assertActiveFileRead(context, readToken);
    if (!pdfLib) throw new Error('PDF processing library could not be loaded. Try Markdown or TXT documents instead.');

    const typedArray = new Uint8Array(arrayBuffer);
    const loadingTask = pdfLib.getDocument({ data: typedArray });
    runtime.file.activeLoadingTask = loadingTask;
    let pdf = null;
    try {
      pdf = await loadingTask.promise;
      assertActiveFileRead(context, readToken);
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new Error(`This PDF has ${pdf.numPages} pages. Limit is ${MAX_PDF_PAGES} pages for browser processing.`);
      }

      const pages = [];
      let totalTextLength = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        assertActiveFileRead(context, readToken);
        showReadLoader(readToken, `Reading page ${pageNumber} of ${pdf.numPages}...`);
        let page = null;
        try {
          page = await pdf.getPage(pageNumber);
          assertActiveFileRead(context, readToken);
          const content = await page.getTextContent();
          assertActiveFileRead(context, readToken);
          const pageText = extractPdfPageText(content.items);
          totalTextLength += pageText.length;
          if (totalTextLength > MAX_EXTRACTED_TEXT_CHARS) {
            throw new Error(`This PDF contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
          }
          pages.push(pageText);
        } finally {
          if (page && typeof page.cleanup === 'function') {
            try { page.cleanup(); } catch (err) { console.warn('PDF page cleanup failed.', err); }
          }
        }
      }
      return pages.join('\n\n').trim();
    } finally {
      runtime.file.activeLoadingTask = null;
      if (pdf && typeof pdf.cleanup === 'function') {
        try { pdf.cleanup(); } catch (err) { console.warn('PDF cleanup failed.', err); }
      }
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try { await loadingTask.destroy(); } catch (err) { console.warn('PDF loading task cleanup failed.', err); }
      } else if (pdf && typeof pdf.destroy === 'function') {
        try { await pdf.destroy(); } catch (err) { console.warn('PDF document cleanup failed.', err); }
      }
    }
  }

  return { loadLibrary, extractPdfText, extractPdfPageText };
}

// parser.js - TXT, Markdown, PDF, and DOCX document parsing & extraction

import {
  escapeHtml,
  decodeHtmlAttributeValue,
  normalizeSafeLinkHref,
  parseEmphasis,
  parseInline,
  showLoader,
  hideLoader,
  formatError
} from './utils.js';

export {
  escapeHtml,
  decodeHtmlAttributeValue,
  normalizeSafeLinkHref,
  parseEmphasis,
  parseInline
};

export const MAX_FILE_SIZE = 15 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
export const MAX_PDF_PAGES = 500;

export const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown']);
export const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, 'pdf', 'docx']);

export function getExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') return '';
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function enforceExtractedTextLimit(text, context = 'document') {
  const value = typeof text === 'string' ? text : '';
  if (value.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new Error(`This ${context} contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
  }
  return value;
}

export const LIBRARIES = {
  pdf: {
    src: 'vendor/pdf.min.js',
    check: () => (typeof window !== 'undefined' ? window.pdfjsLib : null),
    onLoad: () => {
      if (typeof window !== 'undefined' && window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      }
    }
  },
  mammoth: {
    src: 'vendor/mammoth.browser.min.js',
    check: () => (typeof window !== 'undefined' ? window.mammoth : null)
  }
};

const loadedLibraries = new Map();

export function loadLibrary(name) {
  if (loadedLibraries.has(name)) {
    return loadedLibraries.get(name);
  }

  const promise = new Promise((resolve, reject) => {
    const lib = LIBRARIES[name];
    if (!lib) return reject(new Error('Unknown library: ' + name));

    if (lib.check()) {
      if (lib.onLoad) lib.onLoad();
      resolve(lib.check());
      return;
    }

    if (typeof document === 'undefined') {
      return reject(new Error('Document is undefined. Cannot load library dynamically.'));
    }

    function createScript() {
      const script = document.createElement('script');
      script.src = lib.src;
      script.onload = () => {
        try {
          if (lib.onLoad) lib.onLoad();
          if (lib.check()) {
            resolve(lib.check());
          } else {
            reject(new Error(`Library ${name} loaded but could not be initialized.`));
          }
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = () => {
        reject(new Error(`Failed to load local parser library ${name} from ${lib.src}. Check that the vendor file is available.`));
      };
      document.head.appendChild(script);
    }

    createScript();
  });

  loadedLibraries.set(name, promise);
  promise.catch(() => loadedLibraries.delete(name));
  return promise;
}

let activeReadToken = 0;

export function beginFileRead() {
  activeReadToken += 1;
  return activeReadToken;
}

export function cancelPendingFileRead() {
  activeReadToken += 1;
}

export function isActiveFileRead(readToken) {
  return readToken === activeReadToken;
}

export function createStaleReadError() {
  const err = new Error('Stale file read ignored.');
  err.name = 'StaleFileReadError';
  return err;
}

export function assertActiveFileRead(readToken) {
  if (!isActiveFileRead(readToken)) throw createStaleReadError();
}

export function isStaleReadError(err) {
  return Boolean(err && err.name === 'StaleFileReadError');
}

function showReadLoader(readToken, message) {
  if (isActiveFileRead(readToken)) showLoader(message);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve((event.target && event.target.result) || '');
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    reader.onabort = () => reject(new Error('The file read was cancelled.'));
    reader.readAsText(file);
  });
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target && event.target.result);
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    reader.onabort = () => reject(new Error('The file read was cancelled.'));
    reader.readAsArrayBuffer(file);
  });
}

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
        if (currentX > expectedNextX + 1.5 && !text.endsWith(' ') && !value.startsWith(' ')) {
          text += ' ';
        }
      }
    }

    text += value;
    if (currentY !== null) lastY = currentY;
    if (currentX !== null) lastX = currentX;
    if (currentWidth !== null) lastWidth = currentWidth;
  });

  return text;
}

export async function extractPdfText(arrayBuffer, readToken, onProgress) {
  assertActiveFileRead(readToken);
  if (onProgress) onProgress('Loading PDF worker module...');
  else showReadLoader(readToken, 'Loading PDF worker module...');

  const pdfLib = await loadLibrary('pdf');
  assertActiveFileRead(readToken);
  if (!pdfLib) {
    throw new Error('PDF processing library could not be loaded. Try Markdown or TXT documents instead.');
  }

  const typedArray = new Uint8Array(arrayBuffer);
  const loadingTask = pdfLib.getDocument({ data: typedArray });
  let pdf = null;

  try {
    pdf = await loadingTask.promise;
    assertActiveFileRead(readToken);

    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`This PDF has ${pdf.numPages} pages. Limit is ${MAX_PDF_PAGES} pages for browser processing.`);
    }
    const pages = [];
    let totalTextLength = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      assertActiveFileRead(readToken);
      const pageMsg = `Reading page ${pageNumber} of ${pdf.numPages}...`;
      if (onProgress) onProgress(pageMsg);
      else showReadLoader(readToken, pageMsg);

      let page = null;

      try {
        page = await pdf.getPage(pageNumber);
        assertActiveFileRead(readToken);
        const content = await page.getTextContent();
        assertActiveFileRead(readToken);
        const pageText = extractPdfPageText(content.items);
        totalTextLength += pageText.length;
        if (totalTextLength > MAX_EXTRACTED_TEXT_CHARS) {
          throw new Error(`This PDF contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
        }
        pages.push(pageText);
      } finally {
        if (page && typeof page.cleanup === 'function') {
          try {
            page.cleanup();
          } catch (err) {
            console.warn('PDF page cleanup failed.', err);
          }
        }
      }
    }

    return pages.join('\n\n').trim();
  } finally {
    if (pdf && typeof pdf.cleanup === 'function') {
      try {
        pdf.cleanup();
      } catch (err) {
        console.warn('PDF cleanup failed.', err);
      }
    }

    if (loadingTask && typeof loadingTask.destroy === 'function') {
      try {
        await loadingTask.destroy();
      } catch (err) {
        console.warn('PDF loading task cleanup failed.', err);
      }
    } else if (pdf && typeof pdf.destroy === 'function') {
      try {
        await pdf.destroy();
      } catch (err) {
        console.warn('PDF document cleanup failed.', err);
      }
    }
  }
}

export async function extractDocxText(arrayBuffer, readToken, onProgress) {
  assertActiveFileRead(readToken);
  if (onProgress) onProgress('Loading DOCX parser module...');
  else showReadLoader(readToken, 'Loading DOCX parser module...');

  let mammothLib;
  try {
    mammothLib = await loadLibrary('mammoth');
  } catch (err) {
    throw new Error(`DOCX parser library failed to load: ${formatError(err)} Try reloading the app or exporting this file as TXT/Markdown.`);
  }
  if (!mammothLib) {
    throw new Error('DOCX parser library is unavailable. Try reloading the app or exporting this file as TXT/Markdown.');
  }

  assertActiveFileRead(readToken);
  const result = await mammothLib.extractRawText({ arrayBuffer });
  assertActiveFileRead(readToken);
  return enforceExtractedTextLimit((result.value || '').trim(), 'DOCX');
}

export async function readSelectedFile(file, extension, readToken, onProgress) {
  assertActiveFileRead(readToken);

  if (TEXT_EXTENSIONS.has(extension)) {
    if (onProgress) onProgress('Reading text file...');
    else showReadLoader(readToken, 'Reading text file...');
    const text = await readFileAsText(file);
    assertActiveFileRead(readToken);
    return enforceExtractedTextLimit(text, 'text file');
  }

  if (extension === 'pdf') {
    if (onProgress) onProgress('Parsing PDF document...');
    else showReadLoader(readToken, 'Parsing PDF document...');
    const arrayBuffer = await readFileAsArrayBuffer(file);
    assertActiveFileRead(readToken);
    return extractPdfText(arrayBuffer, readToken, onProgress);
  }

  if (extension === 'docx') {
    if (onProgress) onProgress('Parsing DOCX document...');
    else showReadLoader(readToken, 'Parsing DOCX document...');
    const arrayBuffer = await readFileAsArrayBuffer(file);
    assertActiveFileRead(readToken);
    return extractDocxText(arrayBuffer, readToken, onProgress);
  }

  throw new Error('Unsupported file extension.');
}

export const loadVendorScript = loadLibrary;
export const cancelActiveRead = cancelPendingFileRead;

export async function extractPdfTextWithSpacing(pdfDocument, options = {}) {
  if (!pdfDocument) throw new Error('Invalid PDF document.');
  const numPages = pdfDocument.numPages || 0;
  if (numPages > MAX_PDF_PAGES) {
    throw new Error(`This PDF has ${numPages} pages. Limit is ${MAX_PDF_PAGES} pages for browser processing.`);
  }

  const pages = [];
  let totalTextLength = 0;

  for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
    if (options.readToken !== undefined) assertActiveFileRead(options.readToken);
    const page = await pdfDocument.getPage(pageNumber);
    try {
      if (options.readToken !== undefined) assertActiveFileRead(options.readToken);
      const content = await page.getTextContent();
      if (options.readToken !== undefined) assertActiveFileRead(options.readToken);
      const pageText = extractPdfPageText(content.items);
      totalTextLength += pageText.length;
      if (totalTextLength > MAX_EXTRACTED_TEXT_CHARS) {
        throw new Error(`This PDF contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
      }
      pages.push(pageText);
    } finally {
      if (page && typeof page.cleanup === 'function') {
        try {
          page.cleanup();
        } catch (err) {
          console.warn('PDF page cleanup failed.', err);
        }
      }
    }
  }

  return pages.join('\n\n').trim();
}

export async function parseTxtFile(file, options = {}) {
  if (!file) throw new Error('No file provided.');
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name || 'document'}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`);
  }
  if (file.size === 0) {
    throw new Error(`File "${file.name || 'document'}" is empty.`);
  }
  const readToken = options.readToken !== undefined ? options.readToken : beginFileRead();
  assertActiveFileRead(readToken);
  const text = await readFileAsText(file);
  assertActiveFileRead(readToken);
  return enforceExtractedTextLimit(text, 'text file');
}

export async function parseMarkdownFile(file, options = {}) {
  if (!file) throw new Error('No file provided.');
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name || 'document'}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`);
  }
  if (file.size === 0) {
    throw new Error(`File "${file.name || 'document'}" is empty.`);
  }
  const readToken = options.readToken !== undefined ? options.readToken : beginFileRead();
  assertActiveFileRead(readToken);
  const text = await readFileAsText(file);
  assertActiveFileRead(readToken);
  return enforceExtractedTextLimit(text, 'Markdown file');
}

export async function parseDocxFile(file, options = {}) {
  if (!file) throw new Error('No file provided.');
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name || 'document'}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`);
  }
  if (file.size === 0) {
    throw new Error(`File "${file.name || 'document'}" is empty.`);
  }
  const readToken = options.readToken !== undefined ? options.readToken : beginFileRead();
  assertActiveFileRead(readToken);
  const arrayBuffer = await readFileAsArrayBuffer(file);
  assertActiveFileRead(readToken);
  return extractDocxText(arrayBuffer, readToken, options.onProgress);
}

export async function parsePdfFile(file, options = {}) {
  if (!file) throw new Error('No file provided.');
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name || 'document'}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`);
  }
  if (file.size === 0) {
    throw new Error(`File "${file.name || 'document'}" is empty.`);
  }
  const readToken = options.readToken !== undefined ? options.readToken : beginFileRead();
  assertActiveFileRead(readToken);
  const arrayBuffer = await readFileAsArrayBuffer(file);
  assertActiveFileRead(readToken);
  return extractPdfText(arrayBuffer, readToken, options.onProgress);
}

export async function parseFile(file, options = {}) {
  if (!file) throw new Error('No file provided.');
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name || 'document'}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`);
  }
  if (file.size === 0) {
    throw new Error(`File "${file.name || 'document'}" is empty.`);
  }

  const extension = getExtension(file.name || '');
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported format. Please upload TXT, Markdown (.md or .markdown), PDF, or DOCX documents.');
  }

  const readToken = options.readToken !== undefined ? options.readToken : beginFileRead();
  return readSelectedFile(file, extension, readToken, options.onProgress);
}


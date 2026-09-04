import {
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_FILE_SIZE,
  MAX_PDF_PAGES,
  SUPPORTED_EXTENSIONS,
  TEXT_EXTENSIONS
} from './constants.mjs';
import {
  assertActiveFileRead,
  beginFileRead,
  cancelPendingFileRead,
  cancelPendingRender,
  formatError,
  escapeHtml,
  isActiveFileRead,
  isStaleReadError
} from './utils.mjs';
import { Marked } from '../vendor/marked.esm.mjs';

export { escapeHtml } from './utils.mjs';

function decodeHtmlAttributeValue(value) {
  if (typeof document === 'undefined') {
    return String(value).replace(/&(?:amp|lt|gt|quot|#039|#x27);/gi, entity => ({
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#039;': "'",
      '&#x27;': "'"
    }[entity.toLowerCase()] || entity));
  }
  const decoder = document.createElement('textarea');
  decoder.innerHTML = value;
  return decoder.value;
}

export function normalizeSafeLinkHref(escapedUrl) {
  if (!escapedUrl || typeof escapedUrl !== 'string') return null;
  const cleanUrl = decodeHtmlAttributeValue(escapedUrl).trim();
  if (!cleanUrl || /[\u0000-\u001F\u007F]/.test(cleanUrl)) return null;

  const unsafeSchemeRegex = /^(javascript|data|vbscript|file|blob):/i;
  const safeSchemeRegex = /^(https?|ftp|mailto):/i;
  if (cleanUrl.startsWith('//')) return null;
  const isRootRelative = cleanUrl.startsWith('/') && !cleanUrl.startsWith('//');
  const isSafe = (safeSchemeRegex.test(cleanUrl) || isRootRelative || cleanUrl.startsWith('#')) && !unsafeSchemeRegex.test(cleanUrl);
  if (!isSafe) return null;

  try {
    return escapeHtml(encodeURI(cleanUrl));
  } catch (err) {
    return null;
  }
}

export function isSmartHeading(trimmed) {
  if (typeof trimmed !== 'string' || trimmed.length < 3 || trimmed.length > 55) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  if (!/^[A-Z][A-Z0-9 \t:—–-]{2,55}[A-Z0-9]$/.test(trimmed)) return false;
  if (/^[A-Z0-9]{2,6}(?:[ \t]+(?:AND|OR|&|\/)[ \t]+[A-Z0-9]{2,6})+$/i.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  if (/^(?:PLEASE|NOTE|WARNING|CAUTION|DO NOT|NOTICE)\b/i.test(trimmed)) return false;
  const words = trimmed.split(/[ \t]+/);
  return words.some(w => w.length >= 4) || words.length >= 2;
}

export function createMarkedInstance() {
  const instance = new Marked();
  instance.use({
    gfm: true,
    breaks: false,
    renderer: {
      heading(token) {
        const id = token.headingId !== undefined ? token.headingId : `heading-${Math.random().toString(36).slice(2, 11)}`;
        const content = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}">${content}</h${token.depth}>\n`;
      },
      link(token) {
        const safeHref = normalizeSafeLinkHref(token.href);
        const text = this.parser.parseInline(token.tokens);
        if (!safeHref) return text;
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      image(token) {
        return `[Image: ${escapeHtml(token.text || 'image')}]`;
      },
      html(token) {
        return escapeHtml(token.text);
      },
      list(token) {
        const tag = token.ordered ? 'ol' : 'ul';
        const startAttr = token.ordered && token.start !== 1 && token.start !== '' && token.start !== undefined
          ? ` start="${token.start}"`
          : '';
        let body = '';
        for (const item of token.items) {
          body += this.listitem(item);
        }
        return `<${tag}${startAttr}>${body}</${tag}>\n`;
      },
      listitem(item) {
        return `<li>${this.parser.parse(item.tokens, !!item.loose)}</li>`;
      }
    }
  });
  return instance;
}

const defaultMarkedInstance = createMarkedInstance();

function countNewlines(str) {
  if (!str) return 0;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function parseInline(text) {
  if (!text) return '';
  return defaultMarkedInstance.parseInline(String(text));
}

export function createMarkdownRenderer(smartHeadings = true) {
  const marked = defaultMarkedInstance;

  function tokenize(text) {
    const tokens = marked.lexer(String(text || ''));
    let currentLine = 0;
    const usedHeadingIds = new Set();

    function assignHeadingId(token, lineIndex) {
      if (token.type === 'heading' && !token.headingId) {
        let id = `heading-${lineIndex}`;
        if (usedHeadingIds.has(id)) {
          let counter = 1;
          while (usedHeadingIds.has(`${id}-${counter}`)) {
            counter += 1;
          }
          id = `${id}-${counter}`;
        }
        usedHeadingIds.add(id);
        token.headingId = id;
      }
    }

    function processTokenList(list, baseLine) {
      for (const token of list) {
        const line = baseLine !== undefined ? baseLine : currentLine;
        if (baseLine === undefined && token.raw) {
          currentLine += countNewlines(token.raw);
        }

        if (smartHeadings && token.type === 'paragraph' && baseLine === undefined) {
          if (token.text && !token.text.includes('\n') && !token.text.includes('\r') && isSmartHeading(token.text.trim())) {
            token.type = 'heading';
            token.depth = 2;
          }
        }

        assignHeadingId(token, line);

        if (token.tokens && token.type !== 'paragraph' && token.type !== 'heading') {
          processTokenList(token.tokens, line);
        }
        if (token.items) {
          for (const item of token.items) {
            if (item.tokens) processTokenList(item.tokens, line);
          }
        }
      }
    }

    processTokenList(tokens);
    return tokens;
  }

  function renderTokens(tokensSlice, links) {
    if (!tokensSlice || !tokensSlice.length) return '';
    if (links && !tokensSlice.links) {
      tokensSlice.links = links;
    }
    return marked.parser(tokensSlice);
  }

  function render(text) {
    const tokens = tokenize(text);
    return renderTokens(tokens, tokens.links);
  }

  return {
    marked,
    tokenize,
    renderTokens,
    render
  };
}

export function parseMarkdownToHtml(text, smartHeadings = true) {
  const renderer = createMarkdownRenderer(smartHeadings);
  return renderer.render(text);
}

export function getExtension(fileName) {
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

export function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!bytes.length) return '';

  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function readFileAsText(file) {
  return readFileAsArrayBuffer(file).then(buffer => decodeTextBuffer(buffer));
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
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

export function createParser(context, { ui, onTextLoaded }) {
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
    },
    mammoth: {
      src: 'vendor/mammoth.browser.min.js',
      check: () => (typeof window !== 'undefined' ? window.mammoth : null)
    }
  };

  async function loadLibrary(name) {
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

  async function extractDocxText(arrayBuffer, readToken) {
    assertActiveFileRead(context, readToken);
    showReadLoader(readToken, 'Loading DOCX parser module...');
    let mammothLib;
    try {
      mammothLib = await loadLibrary('mammoth');
    } catch (err) {
      throw new Error(`DOCX parser library failed to load: ${formatError(err)} Try reloading the app or exporting this file as TXT/Markdown.`);
    }
    if (!mammothLib) throw new Error('DOCX parser library is unavailable. Try reloading the app or exporting this file as TXT/Markdown.');
    assertActiveFileRead(context, readToken);
    const result = await mammothLib.extractRawText({ arrayBuffer });
    assertActiveFileRead(context, readToken);
    return enforceExtractedTextLimit((result.value || '').trim(), 'DOCX');
  }

  async function readSelectedFile(file, extension, readToken) {
    assertActiveFileRead(context, readToken);
    if (TEXT_EXTENSIONS.has(extension)) {
      showReadLoader(readToken, 'Reading text file...');
      const text = await readFileAsText(file);
      assertActiveFileRead(context, readToken);
      return enforceExtractedTextLimit(text, 'text file');
    }
    if (extension === 'pdf') {
      showReadLoader(readToken, 'Parsing PDF document...');
      const arrayBuffer = await readFileAsArrayBuffer(file);
      assertActiveFileRead(context, readToken);
      return extractPdfText(arrayBuffer, readToken);
    }
    if (extension === 'docx') {
      showReadLoader(readToken, 'Parsing DOCX document...');
      const arrayBuffer = await readFileAsArrayBuffer(file);
      assertActiveFileRead(context, readToken);
      return extractDocxText(arrayBuffer, readToken);
    }
    throw new Error('Unsupported file extension.');
  }

  async function handleFile(event) {
    const target = event && event.target ? event.target : null;
    const file = target && target.files && target.files[0];
    if (!file) return;

    const extension = getExtension(file.name);
    cancelPendingFileRead(context);
    const readToken = beginFileRead(context);
    cancelPendingRender(context);
    ui.clearStatus();

    if (file.size > MAX_FILE_SIZE) {
      ui.hideLoader();
      ui.showStatus(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`, 'error');
      if (target && 'value' in target) target.value = '';
      return;
    }
    if (file.size === 0) {
      ui.hideLoader();
      ui.showStatus(`File "${file.name}" is empty.`, 'error');
      if (target && 'value' in target) target.value = '';
      return;
    }

    try {
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw new Error('Unsupported format. Please upload TXT, Markdown (.md or .markdown), PDF, or DOCX documents.');
      }
      const text = await readSelectedFile(file, extension, readToken);
      assertActiveFileRead(context, readToken);
      ui.hideLoader();
      onTextLoaded(text, file.name);
    } catch (err) {
      if (isStaleReadError(err) || !isActiveFileRead(context, readToken)) return;
      ui.hideLoader();
      ui.showStatus(`Failed to read "${file.name}": ${formatError(err)}`, 'error');
    } finally {
      if (target && 'value' in target) target.value = '';
    }
  }

  return { enforceExtractedTextLimit, extractDocxText, extractPdfText, getExtension, handleFile, loadLibrary, readSelectedFile };
}

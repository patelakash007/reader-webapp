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
  cancelPendingRender,
  formatError,
  escapeHtml,
  isActiveFileRead,
  isStaleReadError
} from './utils.mjs';

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
  const cleanUrl = decodeHtmlAttributeValue(escapedUrl).trim();
  if (!cleanUrl || /[\u0000-\u001F\u007F]/.test(cleanUrl)) return null;

  const unsafeSchemeRegex = /^(javascript|data|vbscript|file|blob):/i;
  const safeSchemeRegex = /^(https?|ftp|mailto):/i;
  const isRootRelative = cleanUrl.startsWith('/') && !cleanUrl.startsWith('//');
  const isSafe = (safeSchemeRegex.test(cleanUrl) || isRootRelative || cleanUrl.startsWith('#')) && !unsafeSchemeRegex.test(cleanUrl);
  if (!isSafe) return null;

  try {
    return escapeHtml(encodeURI(cleanUrl));
  } catch (err) {
    return null;
  }
}

function parseEmphasis(escapedText) {
  return escapedText
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
}

function restoreInlineTokens(text, tokens, prefix) {
  return text.replace(new RegExp(`\\uE000${prefix}(\\d+)\\uE001`, 'g'), (match, index) => tokens[Number(index)] || match);
}

export function parseInline(escapedText) {
  if (!escapedText) return '';

  const codeTokens = [];
  const codeProtected = escapedText.replace(/`([^`]+)`/g, (match, codeText) => {
    const token = `\uE000CODE${codeTokens.length}\uE001`;
    codeTokens.push(`<code>${codeText}</code>`);
    return token;
  });

  const linkTokens = [];
  const linksProtected = codeProtected.replace(/\[([^\]]+)\]\(((?:[^()\\]|\\.|\([^()]*\))+)\)/g, (match, text, url) => {
    const parsedText = parseEmphasis(text);
    const href = normalizeSafeLinkHref(url);
    if (!href) return parsedText;

    const token = `\uE000LINK${linkTokens.length}\uE001`;
    linkTokens.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${parsedText}</a>`);
    return token;
  });

  const emphasized = parseEmphasis(linksProtected);
  return restoreInlineTokens(restoreInlineTokens(emphasized, linkTokens, 'LINK'), codeTokens, 'CODE');
}

export function createMarkdownRenderer(smartHeadings = true) {
  const htmlParts = [];
  let inList = false;
  let listType = null;
  let listBuffer = '';
  let wasPreviousLineEmpty = true;
  let inCodeBlock = false;
  let codeBuffer = '';

  const pushHtml = html => htmlParts.push(html);
  const flushParts = () => {
    const html = htmlParts.join('');
    htmlParts.length = 0;
    return html;
  };
  const flushList = () => {
    if (!inList) return;
    pushHtml(listType === 'ul' ? `<ul>${listBuffer}</ul>` : `<ol>${listBuffer}</ol>`);
    inList = false;
    listType = null;
    listBuffer = '';
  };

  function processLine(rawLine, index) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushList();
        pushHtml(`<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`);
        inCodeBlock = false;
        codeBuffer = '';
      } else {
        flushList();
        inCodeBlock = true;
      }
      wasPreviousLineEmpty = false;
      return;
    }

    if (inCodeBlock) {
      codeBuffer += `${rawLine}\n`;
      return;
    }

    if (trimmed === '') {
      flushList();
      wasPreviousLineEmpty = true;
      return;
    }

    if (trimmed === '---' || trimmed === '***') {
      flushList();
      pushHtml('<hr>');
      wasPreviousLineEmpty = false;
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(headingMatch[1].length, 3);
      pushHtml(`<h${level} id="heading-${index}">${parseInline(escapeHtml(headingMatch[2]))}</h${level}>`);
      wasPreviousLineEmpty = false;
      return;
    }

    if (smartHeadings && wasPreviousLineEmpty && /^[A-Z][A-Z0-9\s]{2,40}[A-Z0-9]$/.test(trimmed) && trimmed.length < 50) {
      flushList();
      pushHtml(`<h2 id="heading-${index}">${escapeHtml(trimmed)}</h2>`);
      wasPreviousLineEmpty = false;
      return;
    }

    if (/^[-\u2022\*]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') flushList();
      inList = true;
      listType = 'ul';
      listBuffer += `<li>${parseInline(escapeHtml(trimmed.replace(/^[-\u2022\*]\s+/, '')))}</li>`;
      wasPreviousLineEmpty = false;
      return;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') flushList();
      inList = true;
      listType = 'ol';
      listBuffer += `<li>${parseInline(escapeHtml(trimmed.replace(/^\d+[.)]\s+/, '')))}</li>`;
      wasPreviousLineEmpty = false;
      return;
    }

    if (trimmed.startsWith('> ')) {
      flushList();
      pushHtml(`<blockquote>${parseInline(escapeHtml(trimmed.substring(2)))}</blockquote>`);
      wasPreviousLineEmpty = false;
      return;
    }

    flushList();
    pushHtml(`<p>${parseInline(escapeHtml(line))}</p>`);
    wasPreviousLineEmpty = false;
  }

  return {
    finish() {
      flushList();
      if (inCodeBlock) pushHtml(`<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`);
      return flushParts();
    },
    flushParts,
    processLine
  };
}

export function parseMarkdownToHtml(text, smartHeadings = true) {
  const renderer = createMarkdownRenderer(smartHeadings);
  String(text || '').split('\n').forEach((line, index) => renderer.processLine(line, index));
  return renderer.finish();
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

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result || '');
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    reader.onabort = () => reject(new Error('The file read was cancelled.'));
    reader.readAsText(file);
  });
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
      src: 'vendor/pdf.min.js',
      check: () => window.pdfjsLib,
      onLoad: () => {
        if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      }
    },
    mammoth: {
      src: 'vendor/mammoth.browser.min.js',
      check: () => window.mammoth
    }
  };

  function loadLibrary(name) {
    if (runtime.file.loadedLibraries.has(name)) return runtime.file.loadedLibraries.get(name);
    const promise = new Promise((resolve, reject) => {
      const lib = libraries[name];
      if (!lib) {
        reject(new Error(`Unknown library: ${name}`));
        return;
      }
      if (lib.check()) {
        if (lib.onLoad) lib.onLoad();
        resolve(lib.check());
        return;
      }

      const script = document.createElement('script');
      script.src = lib.src;
      script.onload = () => {
        try {
          if (lib.onLoad) lib.onLoad();
          if (lib.check()) resolve(lib.check());
          else reject(new Error(`Library ${name} loaded but could not be initialized.`));
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = () => reject(new Error(`Failed to load local parser library ${name} from ${lib.src}. Check that the vendor file is available.`));
      document.head.appendChild(script);
    });

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
      onTextLoaded(text);
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

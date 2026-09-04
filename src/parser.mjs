import {
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_FILE_SIZE,
  MAX_PDF_PAGES,
  SUPPORTED_EXTENSIONS,
  TEXT_EXTENSIONS
} from './constants.mjs';
import { assertActiveFileRead, beginFileRead, cancelPendingRender, formatError, escapeHtml, isActiveFileRead, isStaleReadError } from './utils.mjs';
export { escapeHtml } from './utils.mjs';

function decodeHtmlAttributeValue(value) {
  if (typeof document === 'undefined') return String(value).replace(/&(?:amp|lt|gt|quot|#039|#x27);/gi, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#x27;': "'" }[entity.toLowerCase()] || entity));
  const decoder = document.createElement('textarea');
  decoder.innerHTML = value;
  return decoder.value;
}

export function normalizeSafeLinkHref(value) {
  const cleanUrl = decodeHtmlAttributeValue(value).trim();
  if (!cleanUrl || /[\u0000-\u001F\u007F]/.test(cleanUrl)) return null;
  if (/^(javascript|data|vbscript|file|blob):/i.test(cleanUrl)) return null;
  const rootRelative = cleanUrl.startsWith('/') && !cleanUrl.startsWith('//');
  const fragment = cleanUrl.startsWith('#');
  if (!(rootRelative || fragment || /^(https?|mailto):/i.test(cleanUrl))) return null;
  try { return escapeHtml(encodeURI(cleanUrl)); } catch (err) { return null; }
}

function isEmphasisBoundary(text, index, opening) {
  const previous = index > 0 ? text[index - 1] : '';
  const next = index + 1 < text.length ? text[index + 1] : '';
  return opening ? next !== '' && !/\s/.test(next) : previous !== '' && !/\s/.test(previous);
}

function findClosingMarker(text, marker, from) {
  let index = from;
  while ((index = text.indexOf(marker, index)) !== -1) {
    if (marker.length === 2 || isEmphasisBoundary(text, index, false)) return index;
    index += marker.length;
  }
  return -1;
}

function findBalancedLinkEnd(text, openIndex) {
  let depth = 0;
  let escaped = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '(') depth += 1;
    if (char === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

function parseInlineInternal(text) {
  let html = '';
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      if (/^[\\`*_[\]{}()#+.!\-|>~]$/.test(next)) { html += escapeHtml(next); i += 2; continue; }
    }
    if (char === '`') {
      const close = text.indexOf('`', i + 1);
      if (close !== -1) { html += `<code>${escapeHtml(text.slice(i + 1, close))}</code>`; i = close + 1; continue; }
    }
    if (char === '!' && text[i + 1] === '[') {
      const labelEnd = text.indexOf(']', i + 2);
      if (labelEnd !== -1 && text[labelEnd + 1] === '(') {
        const urlEnd = findBalancedLinkEnd(text, labelEnd + 1);
        if (urlEnd !== -1) {
          const alt = parseInlineInternal(text.slice(i + 2, labelEnd)).replace(/<[^>]+>/g, '');
          html += `<span class="md-image-placeholder" aria-label="Image: ${escapeHtml(alt)}">[Image: ${escapeHtml(alt)}]</span>`;
          i = urlEnd + 1;
          continue;
        }
      }
    }
    if (char === '[') {
      const labelEnd = text.indexOf(']', i + 1);
      if (labelEnd !== -1 && text[labelEnd + 1] === '(') {
        const urlEnd = findBalancedLinkEnd(text, labelEnd + 1);
        if (urlEnd !== -1) {
          const label = parseInlineInternal(text.slice(i + 1, labelEnd));
          const href = normalizeSafeLinkHref(text.slice(labelEnd + 2, urlEnd));
          html += href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
          i = urlEnd + 1;
          continue;
        }
      }
    }
    if (char === '<' && (text.startsWith('http://', i + 1) || text.startsWith('https://', i + 1))) {
      const close = text.indexOf('>', i + 1);
      if (close !== -1) {
        const url = text.slice(i + 1, close);
        const href = normalizeSafeLinkHref(url);
        if (href) { html += `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`; i = close + 1; continue; }
      }
    }
    if ((text.startsWith('**', i) || text.startsWith('__', i)) && isEmphasisBoundary(text, i, true)) {
      const marker = text.slice(i, i + 2);
      const close = findClosingMarker(text, marker, i + 2);
      if (close > i + 2) { html += `<strong>${parseInlineInternal(text.slice(i + 2, close))}</strong>`; i = close + 2; continue; }
    }
    if ((char === '*' || char === '_') && isEmphasisBoundary(text, i, true)) {
      const close = findClosingMarker(text, char, i + 1);
      if (close > i + 1) { html += `<em>${parseInlineInternal(text.slice(i + 1, close))}</em>`; i = close + 1; continue; }
    }
    if (char === '\n') { html += '<br>\n'; i += 1; continue; }
    html += escapeHtml(char);
    i += 1;
  }
  return html;
}

export function parseInline(text) {
  return text ? parseInlineInternal(String(text).replace(/\r\n?/g, '\n')) : '';
}

function plainHeadingText(text) { return String(text || '').replace(/[`*_~]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); }
function createHeadingId(text, usedIds) {
  const normalized = plainHeadingText(text).normalize('NFKC').toLowerCase().trim();
  const base = normalized.replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '') || 'heading';
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}
function isSmartHeading(text) {
  const value = text.trim();
  if (value.length < 4 || value.length > 48) return false;
  if (!/^[A-Z][A-Z0-9]*(?:[ \t]+[A-Z0-9][A-Z0-9]*)+$/.test(value)) return false;
  const words = value.split(/\s+/);
  return words.length >= 2 && words.length <= 7;
}
function getIndentInfo(line) {
  const match = String(line).match(/^( *)(.*)$/);
  return { spaces: match ? match[1].length : 0, content: match ? match[2] : String(line) };
}
function parseList(lines, startIndex, indent) {
  const first = getIndentInfo(lines[startIndex]);
  const firstOrdered = first.content.match(/^(\d+)[.)]\s+(.*)$/);
  const firstUnordered = first.content.match(/^[-+*•]\s+(.*)$/);
  const ordered = Boolean(firstOrdered);
  if (!firstOrdered && !firstUnordered) return { html: '', nextIndex: startIndex };
  const items = [];
  let index = startIndex;
  const startNumber = ordered ? Number(firstOrdered[1]) : 1;
  while (index < lines.length) {
    const info = getIndentInfo(lines[index]);
    if (info.spaces !== indent) break;
    const match = ordered ? info.content.match(/^(\d+)[.)]\s+(.*)$/) : info.content.match(/^[-+*•]\s+(.*)$/);
    if (!match) break;
    let itemHtml = parseInline(match[ordered ? 2 : 1]);
    index += 1;
    while (index < lines.length) {
      const next = getIndentInfo(lines[index]);
      if (next.spaces <= indent) break;
      if (/^(?:\d+[.)]|[-+*•])\s+/.test(next.content)) {
        const nested = parseList(lines, index, next.spaces);
        itemHtml += nested.html;
        index = nested.nextIndex;
      } else if (next.content) {
        itemHtml += `<br>\n${parseInline(next.content.trimEnd())}`;
        index += 1;
      } else {
        index += 1;
      }
    }
    items.push(`<li>${itemHtml}</li>`);
  }
  return { html: ordered ? `<ol${startNumber !== 1 ? ` start="${startNumber}"` : ''}>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`, nextIndex: index };
}

export function createMarkdownRenderer(smartHeadings = true) {
  const htmlParts = [];
  const usedHeadingIds = new Set();
  let inCodeBlock = false;
  let codeFenceChar = '';
  let codeFenceLength = 0;
  let codeBuffer = [];
  let paragraphBuffer = [];
  let listBuffer = [];
  let quoteBuffer = [];

  const flushParts = () => { const html = htmlParts.join(''); htmlParts.length = 0; return html; };
  const flushParagraph = () => { if (paragraphBuffer.length) { htmlParts.push(`<p>${parseInline(paragraphBuffer.join('\n'))}</p>`); paragraphBuffer = []; } };
  const flushList = () => { if (!listBuffer.length) return; const list = parseList(listBuffer, 0, getIndentInfo(listBuffer[0]).spaces); if (list.html) htmlParts.push(list.html); listBuffer = []; };
  const flushQuote = () => { if (!quoteBuffer.length) return; const nested = createMarkdownRenderer(false); quoteBuffer.forEach((line, i) => nested.processLine(line, i)); htmlParts.push(`<blockquote>${nested.finish()}</blockquote>`); quoteBuffer = []; };
  const flushBlocks = () => { flushParagraph(); flushList(); flushQuote(); };

  return {
    processLine(rawLine) {
      const line = String(rawLine ?? '').replace(/\r$/, '');
      const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (inCodeBlock) {
        if (fence && fence[1][0] === codeFenceChar && fence[1].length >= codeFenceLength && !fence[2].trim()) {
          htmlParts.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
          inCodeBlock = false; codeBuffer = []; codeFenceChar = ''; codeFenceLength = 0;
        } else codeBuffer.push(line);
        return;
      }
      if (fence && !fence[2].trim()) {
        flushBlocks(); inCodeBlock = true; codeFenceChar = fence[1][0]; codeFenceLength = fence[1].length; codeBuffer = []; return;
      }
      const trimmed = line.trim();
      if (!trimmed) { flushBlocks(); return; }
      if (/^ {0,3}(#{1,6})(?:[ \t]+|$)/.test(line)) {
        flushBlocks();
        const match = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
        if (match) { const content = match[2]; const id = createHeadingId(content, usedHeadingIds); htmlParts.push(`<h${match[1].length} id="${id}">${parseInline(content)}</h${match[1].length}>`); return; }
      }
      if (smartHeadings && paragraphBuffer.length === 0 && listBuffer.length === 0 && quoteBuffer.length === 0 && isSmartHeading(trimmed)) {
        flushBlocks(); const id = createHeadingId(trimmed, usedHeadingIds); htmlParts.push(`<h2 id="${id}">${escapeHtml(trimmed)}</h2>`); return;
      }
      if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushBlocks(); htmlParts.push('<hr>'); return; }
      if (/^ {0,3}>/.test(line)) { flushParagraph(); flushList(); quoteBuffer.push(line.replace(/^ {0,3}> ?/, '')); return; }
      const indent = getIndentInfo(line);
      if (/^(?:\d+[.)]|[-+*•])\s+/.test(indent.content)) { flushParagraph(); flushQuote(); listBuffer.push(line); return; }
      if (listBuffer.length || quoteBuffer.length) flushBlocks();
      paragraphBuffer.push(line.trimEnd());
    },
    flushParts,
    finish() { flushBlocks(); if (inCodeBlock) htmlParts.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`); return flushParts(); }
  };
}

export function parseMarkdownToHtml(text, smartHeadings = true) {
  const renderer = createMarkdownRenderer(smartHeadings);
  String(text ?? '').replace(/\r\n?/g, '\n').split('\n').forEach(line => renderer.processLine(line));
  return renderer.finish();
}

export function getExtension(fileName) { const name = String(fileName || ''); const dot = name.lastIndexOf('.'); return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''; }
export function enforceExtractedTextLimit(text, context = 'document') {
  const value = typeof text === 'string' ? text : '';
  if (value.length > MAX_EXTRACTED_TEXT_CHARS) throw new Error(`This ${context} contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
  return value;
}
function readFileAsText(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = event => resolve(event.target.result || ''); reader.onerror = () => reject(reader.error || new Error('The file could not be read.')); reader.onabort = () => reject(new Error('The file read was cancelled.')); reader.readAsText(file); }); }
function readFileAsArrayBuffer(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = event => resolve(event.target.result); reader.onerror = () => reject(reader.error || new Error('The file could not be read.')); reader.onabort = () => reject(new Error('The file read was cancelled.')); reader.readAsArrayBuffer(file); }); }

export function extractPdfPageText(items) {
  let text = ''; let lastY = null; let lastX = null; let lastWidth = null;
  (items || []).forEach(item => {
    const currentY = item.transform && typeof item.transform[5] === 'number' ? item.transform[5] : null;
    const currentX = item.transform && typeof item.transform[4] === 'number' ? item.transform[4] : null;
    const currentWidth = typeof item.width === 'number' ? item.width : null;
    const value = item.str || '';
    if (lastY !== null && currentY !== null) {
      const diffY = Math.abs(lastY - currentY); const height = Math.abs(item.height || 10);
      if (diffY > height * 1.2) text += '\n\n'; else if (diffY > 2) text += ' '; else if (lastX !== null && currentX !== null) {
        const expectedNextX = lastX + (lastWidth || 0);
        if (currentX > expectedNextX + 1.5 && !text.endsWith(' ') && !value.startsWith(' ')) text += ' ';
      }
    }
    text += value; if (currentY !== null) lastY = currentY; if (currentX !== null) lastX = currentX; if (currentWidth !== null) lastWidth = currentWidth;
  });
  return text;
}

export function createParser(context, { ui, onTextLoaded }) {
  const { runtime } = context;
  const libraries = {
    pdf: { src: 'vendor/pdf.min.js', check: () => window.pdfjsLib, onLoad: () => { if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; } },
    mammoth: { src: 'vendor/mammoth.browser.min.js', check: () => window.mammoth }
  };
  function loadLibrary(name) {
    if (runtime.file.loadedLibraries.has(name)) return runtime.file.loadedLibraries.get(name);
    const promise = new Promise((resolve, reject) => {
      const lib = libraries[name]; if (!lib) return reject(new Error(`Unknown library: ${name}`));
      if (lib.check()) { if (lib.onLoad) lib.onLoad(); resolve(lib.check()); return; }
      const script = document.createElement('script'); script.src = lib.src;
      script.onload = () => { try { if (lib.onLoad) lib.onLoad(); if (lib.check()) resolve(lib.check()); else reject(new Error(`Library ${name} loaded but could not be initialized.`)); } catch (err) { reject(err); } };
      script.onerror = () => reject(new Error(`Failed to load local parser library ${name} from ${lib.src}. Check that the vendor file is available.`));
      document.head.appendChild(script);
    });
    runtime.file.loadedLibraries.set(name, promise); promise.catch(() => runtime.file.loadedLibraries.delete(name)); return promise;
  }
  const showReadLoader = (token, message) => { if (isActiveFileRead(context, token)) ui.showLoader(message); };
  async function extractPdfText(arrayBuffer, readToken) {
    assertActiveFileRead(context, readToken); showReadLoader(readToken, 'Loading PDF worker module...');
    const pdfLib = await loadLibrary('pdf'); assertActiveFileRead(context, readToken);
    if (!pdfLib) throw new Error('PDF processing library could not be loaded.');
    const loadingTask = pdfLib.getDocument({ data: new Uint8Array(arrayBuffer), enableScripting: false, isEvalSupported: false });
    let pdf = null;
    try {
      pdf = await loadingTask.promise; assertActiveFileRead(context, readToken);
      if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages. Limit is ${MAX_PDF_PAGES} pages for browser processing.`);
      const pages = []; let total = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        assertActiveFileRead(context, readToken); showReadLoader(readToken, `Reading page ${pageNumber} of ${pdf.numPages}...`);
        let page = null;
        try { page = await pdf.getPage(pageNumber); assertActiveFileRead(context, readToken); const content = await page.getTextContent(); assertActiveFileRead(context, readToken); const pageText = extractPdfPageText(content.items); total += pageText.length; if (total > MAX_EXTRACTED_TEXT_CHARS) throw new Error(`This PDF contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`); pages.push(pageText); }
        finally { if (page && typeof page.cleanup === 'function') { try { page.cleanup(); } catch (err) { console.warn('PDF page cleanup failed.', err); } } }
      }
      return pages.join('\n\n').trim();
    } finally {
      if (pdf && typeof pdf.cleanup === 'function') { try { pdf.cleanup(); } catch (err) { console.warn('PDF cleanup failed.', err); } }
      if (loadingTask && typeof loadingTask.destroy === 'function') { try { await loadingTask.destroy(); } catch (err) { console.warn('PDF loading task cleanup failed.', err); } }
      else if (pdf && typeof pdf.destroy === 'function') { try { await pdf.destroy(); } catch (err) { console.warn('PDF document cleanup failed.', err); } }
    }
  }
  async function extractDocxText(arrayBuffer, readToken) {
    assertActiveFileRead(context, readToken); showReadLoader(readToken, 'Loading DOCX parser module...');
    let mammothLib; try { mammothLib = await loadLibrary('mammoth'); } catch (err) { throw new Error(`DOCX parser library failed to load: ${formatError(err)} Try reloading the app or exporting this file as TXT/Markdown.`); }
    if (!mammothLib) throw new Error('DOCX parser library is unavailable.');
    assertActiveFileRead(context, readToken); const result = await mammothLib.extractRawText({ arrayBuffer }); assertActiveFileRead(context, readToken); return enforceExtractedTextLimit(result.value || '', 'DOCX');
  }
  async function readSelectedFile(file, extension, readToken) {
    assertActiveFileRead(context, readToken);
    if (TEXT_EXTENSIONS.has(extension)) return enforceExtractedTextLimit(await readFileAsText(file), 'text file');
    if (extension === 'pdf') { const buffer = await readFileAsArrayBuffer(file); assertActiveFileRead(context, readToken); return extractPdfText(buffer, readToken); }
    if (extension === 'docx') { const buffer = await readFileAsArrayBuffer(file); assertActiveFileRead(context, readToken); return extractDocxText(buffer, readToken); }
    throw new Error('Unsupported file extension.');
  }
  async function handleFile(event) {
    const target = event && event.target ? event.target : null; const file = target && target.files && target.files[0]; if (!file) return;
    const extension = getExtension(file.name); const readToken = beginFileRead(context); cancelPendingRender(context); ui.clearStatus();
    if (file.size > MAX_FILE_SIZE) { ui.hideLoader(); ui.showStatus(`File \"${file.name}\" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 15MB.`, 'error'); if (target && 'value' in target) target.value = ''; return; }
    if (file.size === 0) { ui.hideLoader(); ui.showStatus(`File \"${file.name}\" is empty.`, 'error'); if (target && 'value' in target) target.value = ''; return; }
    try { if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('Unsupported format. Please upload TXT, Markdown (.md or .markdown), PDF, or DOCX documents.'); const text = await readSelectedFile(file, extension, readToken); assertActiveFileRead(context, readToken); ui.hideLoader(); onTextLoaded(text); }
    catch (err) { if (isStaleReadError(err) || !isActiveFileRead(context, readToken)) return; ui.hideLoader(); ui.showStatus(`Failed to read \"${file.name}\": ${formatError(err)}`, 'error'); }
    finally { if (target && 'value' in target) target.value = ''; }
  }
  return { enforceExtractedTextLimit, extractDocxText, extractPdfText, getExtension, handleFile, loadLibrary, readSelectedFile };
}

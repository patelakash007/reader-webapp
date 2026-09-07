import {
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_FILE_SIZE,
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
import { createMarkdownRenderer, createMarkedInstance, isSmartHeading, normalizeSafeLinkHref, parseInline, parseMarkdownToHtml } from './markdown-parser.mjs';
import { decodeTextBuffer, readFileAsArrayBuffer, readFileAsText } from './text-decoder.mjs';
import { createPdfParser, extractPdfPageText } from './pdf-parser.mjs';
import { createDocxParser } from './docx-parser.mjs';

export { escapeHtml };
export { createMarkdownRenderer, createMarkedInstance, isSmartHeading, normalizeSafeLinkHref, parseInline, parseMarkdownToHtml } from './markdown-parser.mjs';
export { decodeTextBuffer };
export { extractPdfPageText };

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

export function createParser(context, { ui, onTextLoaded }) {
  const pdfParser = createPdfParser(context, { ui });
  const docxParser = createDocxParser(context, { ui, enforceTextLimit: enforceExtractedTextLimit });

  function loadLibrary(name) {
    if (name === 'pdf') return pdfParser.loadLibrary();
    if (name === 'mammoth') return docxParser.loadLibrary();
    throw new Error(`Unknown library: ${name}`);
  }

  function showReadLoader(readToken, message) {
    if (isActiveFileRead(context, readToken)) ui.showLoader(message);
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
      return pdfParser.extractPdfText(arrayBuffer, readToken);
    }
    if (extension === 'docx') {
      showReadLoader(readToken, 'Parsing DOCX document...');
      const arrayBuffer = await readFileAsArrayBuffer(file);
      assertActiveFileRead(context, readToken);
      return docxParser.extractDocxText(arrayBuffer, readToken);
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

  return { enforceExtractedTextLimit, extractDocxText: docxParser.extractDocxText, extractPdfText: pdfParser.extractPdfText, getExtension, handleFile, loadLibrary, readSelectedFile };
}

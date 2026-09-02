// reader.js - Chunked rendering pipeline, Table of Contents, reading ruler, auto-scroll, focus mode, and inline editor

import {
  escapeHtml,
  parseInline,
  formatError,
  clampNumber,
  getScrollTop,
  getElementTarget,
  announceLive,
  showStatus,
  showLoader,
  hideLoader,
  setContainerFocusable,
  isMobileSheetLayout
} from "./utils.js";

import {
  els,
  resetToolbarTimer,
  clearToolbarTimer,
  setToolbarSuppressed,
  openTocDialog,
  closeTocDialog,
  setEditingBannerVisible,
  collapseMobileSheet
} from "./ui.js";

import { applyTextColor } from "./settings.js";
import { tokenizeReaderDOM, stopTTS, isPlayingOrPaused } from "./tts.js";

let activeRenderId = 0;
let isRulerActive = false;
let isAutoScrolling = false;
let autoScrollSpeed = 0.04;
let lastScrollTime = 0;
let scrollAccumulator = 0;
let focusMode = false;
let isEditing = false;
let editDebounceTimer = null;
let wordCountTimer = null;
let currentText = "";
let preEditText = "";
let smartHeadings = false;
let currentTextColor = "default";
let lastActiveElement = null;

// ===== Text Accessors & Rendering =====

export function getCurrentText() {
  return currentText;
}

export function setCurrentText(text) {
  currentText = text || "";
}

export function getSmartHeadings() {
  return smartHeadings;
}

export function setSmartHeadings(enabled) {
  smartHeadings = Boolean(enabled);
}

export function getTextColor() {
  return currentTextColor;
}

export function setTextColorState(color) {
  currentTextColor = color || "default";
}

export function cancelPendingRender(options = {}) {
  activeRenderId += 1;
  if (options.hideLoader !== false) {
    hideLoader();
  }
}

// High performance asynchronous chunked parser. Prevents layout thrashing on huge documents.
export function renderTextAsync(text, onComplete, options = {}) {
  if (!els.readerContent) return;
  const renderId = ++activeRenderId;
  const shouldShowLoader = !options.suppressLoader;
  if (shouldShowLoader) showLoader("Preparing reader...");
  els.readerContent.textContent = "";

  if (typeof text === "string") {
    currentText = text;
  }

  setTimeout(() => {
    if (renderId !== activeRenderId) return;
    const lines = (text || "").split("\n");
    const htmlParts = [];
    let index = 0;
    let inList = false;
    let listType = null;
    let listBuffer = "";
    let wasPreviousLineEmpty = true;
    let inCodeBlock = false;
    let codeBuffer = "";

    function pushHtml(html) {
      htmlParts.push(html);
    }

    function flushParts() {
      if (renderId !== activeRenderId || !htmlParts.length || !els.readerContent) return;
      els.readerContent.insertAdjacentHTML("beforeend", htmlParts.join(""));
      htmlParts.length = 0;
    }

    function flushList() {
      if (!inList) return;
      pushHtml(listType === "ul" ? `<ul>${listBuffer}</ul>` : `<ol>${listBuffer}</ol>`);
      inList = false;
      listType = null;
      listBuffer = "";
    }

    // Standard parser block layout processor
    function processLine(rawLine) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        if (inCodeBlock) {
          flushList();
          // Code content is completely HTML-escaped safely
          pushHtml(`<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`);
          inCodeBlock = false;
          codeBuffer = "";
        } else {
          flushList();
          inCodeBlock = true;
        }
        wasPreviousLineEmpty = false;
        return;
      }

      if (inCodeBlock) {
        codeBuffer += rawLine + "\n";
        return;
      }

      if (trimmed === "") {
        flushList();
        wasPreviousLineEmpty = true;
        return;
      }

      if (trimmed === "---" || trimmed === "***") {
        flushList();
        pushHtml("<hr>");
        wasPreviousLineEmpty = false;
        return;
      }

      // Structured Markdown Heading levels h1/h2/h3
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushList();
        const level = Math.min(headingMatch[1].length, 3); // Support h1, h2, or h3 levels
        const headingText = headingMatch[2];
        pushHtml(`<h${level} id="heading-${index}">${parseInline(escapeHtml(headingText))}</h${level}>`);
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
        if (!inList || listType !== "ul") flushList();
        inList = true;
        listType = "ul";
        listBuffer += `<li>${parseInline(escapeHtml(trimmed.replace(/^[-\u2022\*]\s+/, "")))}</li>`;
        wasPreviousLineEmpty = false;
        return;
      }

      if (/^\d+[.)]\s+/.test(trimmed)) {
        if (!inList || listType !== "ol") flushList();
        inList = true;
        listType = "ol";
        listBuffer += `<li>${parseInline(escapeHtml(trimmed.replace(/^\d+[.)]\s+/, "")))}</li>`;
        wasPreviousLineEmpty = false;
        return;
      }

      if (trimmed.startsWith("> ")) {
        flushList();
        pushHtml(`<blockquote>${parseInline(escapeHtml(trimmed.substring(2)))}</blockquote>`);
        wasPreviousLineEmpty = false;
        return;
      }

      flushList();
      pushHtml(`<p>${parseInline(escapeHtml(line))}</p>`);
      wasPreviousLineEmpty = false;
    }

    // Dynamic yielding block iterator using requestAnimationFrame
    function processChunk() {
      if (renderId !== activeRenderId) return;
      try {
        const chunkEnd = Math.min(index + 500, lines.length);
        for (; index < chunkEnd; index++) {
          if (renderId !== activeRenderId) return;
          processLine(lines[index]);
        }

        flushParts();
        if (renderId !== activeRenderId) return;

        if (index < lines.length) {
          if (typeof window !== "undefined") {
            window.requestAnimationFrame(processChunk);
          } else {
            processChunk();
          }
          return;
        }

        flushList();
        if (inCodeBlock) {
          pushHtml(`<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`);
        }
        flushParts();
        if (renderId !== activeRenderId) return;
        applyTextColor(currentTextColor);
        tokenizeReaderDOM(els.readerContent);
        if (shouldShowLoader) hideLoader();
        if (onComplete) onComplete();
      } catch (err) {
        if (renderId !== activeRenderId) return;
        if (shouldShowLoader) hideLoader();
        showStatus(`Could not render this text safely: ${formatError(err)}`, "error");
      }
    }

    processChunk();
  }, 50);
}

export function renderDocument(text, format = "markdown") {
  return new Promise((resolve) => {
    renderTextAsync(text, () => {
      resolve();
    });
  });
}

export function renderMarkdownChunked(mdText, targetEl = els.readerContent) {
  return new Promise((resolve) => {
    const prev = els.readerContent;
    if (targetEl && targetEl !== els.readerContent) {
      els.readerContent = targetEl;
    }
    renderTextAsync(mdText, () => {
      if (targetEl && targetEl !== prev && prev) {
        els.readerContent = prev;
      }
      resolve();
    });
  });
}

// ===== Word Count & Reading Time =====

export function getReaderTextForCounting() {
  if (!els.readerContent) return "";
  if (isEditing) {
    return els.readerContent.textContent || "";
  }

  const blocks = els.readerContent.querySelectorAll("h1, h2, h3, p, li, blockquote, pre");
  if (!blocks.length) {
    return els.readerContent.innerText || els.readerContent.textContent || "";
  }

  return Array.from(blocks)
    .map(block => (block.textContent || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function updateWordCountAndEstTime(text) {
  const content = typeof text === "string" ? text : getReaderTextForCounting();
  const words = content.trim().split(/\s+/).filter(word => word.length > 0).length;
  const estMinutes = Math.ceil(words / 238);
  const timeString = words < 238 ? "< 1 min read" : `~${estMinutes} min read`;
  if (els.wordCount) {
    els.wordCount.textContent = `${words.toLocaleString()} words \u00b7 ${timeString}`;
  }
  return { words, estMinutes };
}

export function updateWordCount() {
  if (!els.readerContent || !els.wordCount) return;
  updateWordCountAndEstTime();
}

export function scheduleWordCountUpdate() {
  if (typeof window !== "undefined") {
    window.clearTimeout(wordCountTimer);
    wordCountTimer = window.setTimeout(updateWordCount, 0);
  } else {
    updateWordCount();
  }
}

// ===== Table of Contents =====

export function getHeadingScrollOffset() {
  if (!els.toolbar || isMobileSheetLayout() || focusMode || els.toolbar.classList.contains("hidden-bar")) {
    return 0;
  }

  const rect = els.toolbar.getBoundingClientRect();
  if (rect.height <= 0 || rect.bottom <= 0) return 0;
  return Math.ceil(rect.bottom + 16);
}

export function scrollHeadingIntoView(heading) {
  if (!heading) return;
  const offset = getHeadingScrollOffset();
  if (!offset) {
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const headingTop = heading.getBoundingClientRect().top + getScrollTop();
  if (typeof window !== "undefined") {
    window.scrollTo({
      top: Math.max(0, headingTop - offset),
      behavior: "smooth"
    });
  }
}

export function generateTableOfContents(articleEl = els.readerContent, dialogEl = els.tocDialog) {
  const article = articleEl || els.readerContent;
  const dialog = dialogEl || els.tocDialog;
  const body = (dialog && dialog.querySelector("#tocBody")) || els.tocBody;
  if (!article || !dialog || !body) return;

  const headings = article.querySelectorAll("h1, h2, h3");
  if (headings.length === 0) {
    showStatus("No headings found in this document.", "info");
    return;
  }

  if (typeof document !== "undefined") {
    lastActiveElement = document.activeElement;
  }
  body.innerHTML = "";

  headings.forEach((h) => {
    if (!h.id) h.id = `heading-${Math.random().toString(36).slice(2, 11)}`;
    const a = document.createElement("a");
    a.className = "toc-item";
    a.textContent = h.textContent;
    a.href = `#${h.id}`;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      scrollHeadingIntoView(h);
      closeTocDialog();
    });
    body.appendChild(a);
  });

  if (!openTocDialog()) {
    showStatus("Table of contents is unavailable in this browser.", "error");
    return;
  }

  setTimeout(() => {
    const closeBtn = (dialog && dialog.querySelector("#closeTocBtn")) || els.closeTocBtn;
    if (closeBtn) closeBtn.focus();
  }, 50);
}

export function populateAndShowTOC() {
  generateTableOfContents(els.readerContent, els.tocDialog);
}

// ===== Reading Ruler =====

export function initReadingRuler(rulerEl = els.readingRuler, containerEl = els.readerContent) {
  if (rulerEl) els.readingRuler = rulerEl;
  if (containerEl) els.readerContent = containerEl;
  setRulerActive(true);
}

export function setRulerActive(active, options = {}) {
  isRulerActive = Boolean(active);
  if (els.readingRuler) {
    els.readingRuler.style.display = isRulerActive ? "block" : "none";
  }
  if (!els.rulerBtn) return;

  els.rulerBtn.classList.toggle("active", isRulerActive);
  els.rulerBtn.setAttribute("aria-pressed", isRulerActive ? "true" : "false");

  if (isRulerActive) {
    els.rulerBtn.setAttribute("aria-label", "Disable Reading Ruler");
    els.rulerBtn.setAttribute("title", "Disable Reading Ruler");
    if (options.announce !== false) showStatus("Reading ruler guide activated.", "success");
  } else {
    els.rulerBtn.setAttribute("aria-label", "Enable Reading Ruler");
    els.rulerBtn.setAttribute("title", "Enable Reading Ruler");
    if (options.announce !== false) showStatus("Reading ruler guide deactivated.", "info");
  }
}

export function toggleRuler() {
  if (!els.rulerBtn || !els.readingRuler) return isRulerActive;
  setRulerActive(!isRulerActive);
  return isRulerActive;
}

export function updateRulerPosition(e) {
  if (!isRulerActive || !els.readingRuler || !els.readerContent) return;
  const target = getElementTarget(e.target);
  const scrollTop = getScrollTop();

  if (target && els.readerContent.contains(target) &&
      (target.tagName === "P" || target.tagName === "LI" ||
       target.tagName === "H1" || target.tagName === "H2" || target.tagName === "H3" || target.tagName === "BLOCKQUOTE" ||
       target.closest("p, li, h1, h2, h3, blockquote"))) {
    const textContainer = target.closest("p, li, h1, h2, h3, blockquote") || target;
    const rect = textContainer.getBoundingClientRect();
    const top = rect.top + scrollTop;
    els.readingRuler.style.height = `${rect.height + 4}px`;
    els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
  } else if (e.pageY) {
    const y = e.pageY - 14;
    els.readingRuler.style.height = "28px";
    els.readingRuler.style.transform = `translate3d(0, ${y}px, 0)`;
  }
}

export function isRulerActiveState() {
  return isRulerActive;
}

export { isRulerActiveState as isRulerActive };

// ===== Auto-Scroll Loop =====

export function autoScrollLoop(timestamp) {
  if (!isAutoScrolling) return;
  if (!lastScrollTime) lastScrollTime = timestamp;
  const deltaTime = timestamp - lastScrollTime;
  lastScrollTime = timestamp;

  scrollAccumulator += deltaTime * autoScrollSpeed;
  if (scrollAccumulator >= 1) {
    const pixelsToScroll = Math.floor(scrollAccumulator);
    if (typeof window !== "undefined") {
      window.scrollBy(0, pixelsToScroll);
    }
    scrollAccumulator -= pixelsToScroll;
  }

  if (typeof document !== "undefined") {
    const viewportHeight = (typeof window !== "undefined" && window.innerHeight) || document.documentElement.clientHeight || 0;
    const distanceToBottom = document.documentElement.scrollHeight - getScrollTop() - viewportHeight;
    if (distanceToBottom < 1) {
      toggleAutoScroll();
    } else if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(autoScrollLoop);
    }
  }
}

export function toggleAutoScroll() {
  if (!els.autoScrollBtn) return isAutoScrolling;
  isAutoScrolling = !isAutoScrolling;
  if (isAutoScrolling) {
    els.autoScrollBtn.classList.add("active");
    els.autoScrollBtn.innerHTML = "<span aria-hidden=\"true\">&#x23F8;</span>"; // Pause icon
    els.autoScrollBtn.setAttribute("aria-pressed", "true");
    els.autoScrollBtn.setAttribute("aria-label", "Stop Auto Scroll");
    els.autoScrollBtn.setAttribute("title", "Stop Auto Scroll");
    lastScrollTime = 0;
    scrollAccumulator = 0;
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(autoScrollLoop);
    }
    announceLive("Auto-scroll started.");
  } else {
    els.autoScrollBtn.classList.remove("active");
    els.autoScrollBtn.innerHTML = "<span aria-hidden=\"true\">&#x25B6;</span>"; // Play icon
    els.autoScrollBtn.setAttribute("aria-pressed", "false");
    els.autoScrollBtn.setAttribute("aria-label", "Start Auto Scroll");
    els.autoScrollBtn.setAttribute("title", "Start Auto Scroll");
    announceLive("Auto-scroll stopped.");
  }
  return isAutoScrolling;
}

export function isAutoScrollingState() {
  return isAutoScrolling;
}

export { isAutoScrollingState as isAutoScrolling };

export function startAutoScroll(speedMultiplier) {
  if (typeof speedMultiplier === "number") {
    setAutoScrollSpeed(speedMultiplier * 0.04);
  }
  if (!isAutoScrolling) {
    toggleAutoScroll();
  }
}

export function stopAutoScroll() {
  if (isAutoScrolling) {
    toggleAutoScroll();
  }
}

export function setAutoScrollSpeed(speed) {
  autoScrollSpeed = clampNumber(speed, 0.04, 0.01, 0.2);
}

// ===== Focus Mode Handling =====

export function toggleFocus() {
  if (!els.toolbar || !els.backBtn || !els.wordCount || !els.focusRestore || !els.focusBtn) return focusMode;
  focusMode = !focusMode;
  if (typeof document !== "undefined") {
    document.body.classList.toggle("focus-mode-active", focusMode);
  }

  if (focusMode) {
    if (isMobileSheetLayout()) {
      collapseMobileSheet();
    }
    els.toolbar.classList.add("force-hidden");
    els.backBtn.classList.add("force-hidden");
    els.wordCount.classList.add("force-hidden");
    els.focusRestore.classList.add("show");
    els.focusBtn.setAttribute("aria-pressed", "true");
    els.focusBtn.setAttribute("aria-label", "Show UI");
    els.focusBtn.setAttribute("title", "Show UI");
    setContainerFocusable(els.toolbar, false);
    setToolbarSuppressed(true);
    announceLive("Focus mode activated. UI controls hidden.");
    return focusMode;
  }

  els.toolbar.classList.remove("force-hidden");
  els.backBtn.classList.remove("force-hidden");
  els.wordCount.classList.remove("force-hidden");
  els.focusRestore.classList.remove("show");
  els.focusBtn.setAttribute("aria-pressed", "false");
  els.focusBtn.setAttribute("aria-label", "Hide UI");
  els.focusBtn.setAttribute("title", "Hide UI");
  setContainerFocusable(els.toolbar, true);
  setToolbarSuppressed(false);
  resetToolbarTimer();
  announceLive("Focus mode deactivated. UI controls visible.");
  return focusMode;
}

export function isFocusMode() {
  return focusMode;
}

// ===== In-Context Inline Content Editor =====

export function toggleEditing() {
  if (isEditing) {
    saveAndExitEditMode();
  } else {
    enterEditMode();
  }
  return isEditing;
}

export function enterEditMode() {
  if (!els.readerContent || !els.editingBanner || !els.editBtn) return;
  preEditText = currentText;
  activeRenderId += 1;
  hideLoader();
  if (isPlayingOrPaused()) stopTTS();
  if (isAutoScrolling) toggleAutoScroll();

  isEditing = true;
  setToolbarSuppressed(true);
  if (els.toolbar) {
    els.toolbar.classList.remove("hidden-bar");
    setContainerFocusable(els.toolbar, true);
  }

  // Swap content to raw source text block for easy inline edits
  els.readerContent.textContent = currentText;

  els.readerContent.setAttribute("contenteditable", "true");
  els.readerContent.setAttribute("role", "textbox");
  els.readerContent.setAttribute("aria-label", "Editable reader text");
  els.readerContent.setAttribute("aria-multiline", "true");
  setEditingBannerVisible(true);
  els.editBtn.innerHTML = "<span aria-hidden=\"true\">&#x1F4BE;</span> Save";
  els.editBtn.classList.add("active");
  els.editBtn.setAttribute("title", "Save and Exit");
  els.editBtn.setAttribute("aria-label", "Save and Exit");
  els.editBtn.setAttribute("aria-pressed", "true");
  els.readerContent.focus();

  announceLive("Editing mode activated. Focus moved to raw reader text.");
}

export function saveAndExitEditMode(options = {}) {
  if (!els.readerContent || !els.editingBanner || !els.editBtn) return currentText;
  if (typeof window !== "undefined") {
    window.clearTimeout(editDebounceTimer);
    editDebounceTimer = null;
  }
  isEditing = false;
  setToolbarSuppressed(false);
  els.readerContent.removeAttribute("contenteditable");
  els.readerContent.removeAttribute("role");
  els.readerContent.removeAttribute("aria-label");
  els.readerContent.removeAttribute("aria-multiline");
  setEditingBannerVisible(false);
  els.editBtn.innerHTML = "<span aria-hidden=\"true\">&#x270F;&#xFE0F;</span> Edit";
  els.editBtn.classList.remove("active");
  els.editBtn.setAttribute("title", "Edit Text");
  els.editBtn.setAttribute("aria-label", "Edit Text");
  els.editBtn.setAttribute("aria-pressed", "false");

  const editedText = els.readerContent.innerText || "";
  currentText = editedText;

  // Re-compile raw markdown back into safe HTML blocks
  renderTextAsync(currentText, () => {
    scheduleWordCountUpdate();
    announceLive("Changes kept for this session. Reading mode restored.");
    showStatus("Edits kept for this session.", "success");
  }, { suppressLoader: Boolean(options.suppressRenderLoader) });

  return currentText;
}

export function cancelEditMode() {
  if (!isEditing || !els.readerContent || !els.editingBanner || !els.editBtn) return;
  if (typeof window !== "undefined") {
    window.clearTimeout(editDebounceTimer);
    editDebounceTimer = null;
  }
  isEditing = false;
  setToolbarSuppressed(false);
  els.readerContent.removeAttribute("contenteditable");
  els.readerContent.removeAttribute("role");
  els.readerContent.removeAttribute("aria-label");
  els.readerContent.removeAttribute("aria-multiline");
  setEditingBannerVisible(false);
  els.editBtn.innerHTML = "<span aria-hidden=\"true\">&#x270F;&#xFE0F;</span> Edit";
  els.editBtn.classList.remove("active");
  els.editBtn.setAttribute("title", "Edit Text");
  els.editBtn.setAttribute("aria-label", "Edit Text");
  els.editBtn.setAttribute("aria-pressed", "false");

  currentText = preEditText;

  renderTextAsync(currentText, () => {
    scheduleWordCountUpdate();
    announceLive("Edit cancelled. Original text restored.");
    showStatus("Edits discarded.", "info");
  });
}

export function isEditingState() {
  return isEditing;
}

export { isEditingState as isEditing };

export function insertPlainTextAtSelection(text) {
  if (!text || !els.readerContent || typeof window === "undefined") return;
  const selection = window.getSelection ? window.getSelection() : null;
  if (!selection || selection.rangeCount === 0 || !els.readerContent.contains(selection.anchorNode)) {
    els.readerContent.appendChild(document.createTextNode(text));
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function handlePlainTextEditPaste(event) {
  if (!isEditing || !els.readerContent || event.currentTarget !== els.readerContent) return;
  event.preventDefault();
  const clipboard = event.clipboardData || (typeof window !== "undefined" ? window.clipboardData : null);
  const text = clipboard ? clipboard.getData("text/plain") : "";
  insertPlainTextAtSelection(text);
}

// ===== Margin & Export =====

export function updateMarginStyle(value) {
  if (!els.readerContent) return;
  let padding = clampNumber(value, 24, 12, 80);
  if (typeof window !== "undefined" && window.innerWidth <= 640) {
    padding = Math.min(padding, 24); // Safe mobile margins clamp
  }
  els.readerContent.style.paddingLeft = `${padding}px`;
  els.readerContent.style.paddingRight = `${padding}px`;
}

export function downloadText(textToDownload = currentText, filename = "Reader_Export.txt") {
  if (!textToDownload) {
    showStatus("No text content to download.", "error");
    return;
  }
  let url = null;
  let anchor = null;
  try {
    const blob = new Blob([textToDownload], { type: "text/plain;charset=utf-8" });
    url = URL.createObjectURL(blob);
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "Reader_Export.txt";
    document.body.appendChild(anchor);
    anchor.click();
    showStatus("File downloaded successfully.", "success");
  } catch (err) {
    showStatus("Download failed on this device.", "error");
  } finally {
    if (anchor && anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    if (url && typeof window !== "undefined") {
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

export function exportCurrentText(filename = "Reader_Export.txt") {
  downloadText(currentText, filename);
}

export function onReaderEntered(text) {
  if (typeof text === "string") {
    currentText = text;
  }
  scheduleWordCountUpdate();
}

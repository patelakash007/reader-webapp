// utils.js - Shared utilities, math helpers, sanitization, and DOM helpers

export function clamp(value, minOrFallback, maxOrMin, maybeMax) {
  if (maybeMax !== undefined) {
    return clampNumber(value, minOrFallback, maxOrMin, maybeMax);
  }
  const min = minOrFallback !== undefined ? minOrFallback : -Infinity;
  const max = maxOrMin !== undefined ? maxOrMin : Infinity;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

export function clampNumber(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function clampIndex(index, length) {
  const parsed = Number.parseInt(index, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), Math.max(length - 1, 0));
}

export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

export function escapeHtmlAttr(text) {
  return escapeHtml(text);
}

export function escapeHtmlText(text) {
  return escapeHtml(text);
}

export function decodeHtmlAttributeValue(value) {
  if (typeof value !== 'string') return '';
  if (typeof document !== 'undefined') {
    const decoder = document.createElement('textarea');
    decoder.innerHTML = value;
    return decoder.value;
  }
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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

export function parseEmphasis(escapedText) {
  if (!escapedText) return '';
  return escapedText
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
}

export function restoreInlineTokens(text, tokens, prefix) {
  return text.replace(new RegExp(`\\uE000${prefix}(\\d+)\\uE001`, 'g'), (match, index) => {
    return tokens[Number(index)] || match;
  });
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

export function renderInlineMarkdown(md) {
  if (typeof md !== 'string') return '';
  return parseInline(md);
}

export function getElementTarget(target) {
  if (!target) return null;
  return target instanceof Element ? target : (target.parentElement || null);
}

export function getScrollTop() {
  if (typeof window === 'undefined') return 0;
  return window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
}

export function setContainerFocusable(container, enabled) {
  if (!container) return;
  const elements = container.querySelectorAll('button, input, [tabindex], select, a, textarea');
  elements.forEach(element => {
    if (enabled) {
      if (element.dataset && element.dataset.savedTabindex !== undefined) {
        const previous = element.dataset.savedTabindex;
        if (previous) element.setAttribute('tabindex', previous);
        else element.removeAttribute('tabindex');
        delete element.dataset.savedTabindex;
      } else if (element.hasAttribute('data-prev-tabindex')) {
        const previous = element.getAttribute('data-prev-tabindex');
        if (previous && previous !== '-1') element.setAttribute('tabindex', previous);
        else element.removeAttribute('tabindex');
        element.removeAttribute('data-prev-tabindex');
      }
      return;
    }

    if (element.dataset) {
      if (element.dataset.savedTabindex === undefined) {
        element.dataset.savedTabindex = element.hasAttribute('tabindex') ? element.getAttribute('tabindex') : '';
      }
    } else if (!element.hasAttribute('data-prev-tabindex')) {
      element.setAttribute('data-prev-tabindex', element.getAttribute('tabindex') || '');
    }
    element.setAttribute('tabindex', '-1');
  });
}

export function setupFocusTrap(container) {
  if (!container) return () => {};
  const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const handleKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(container.querySelectorAll(focusableSelectors)).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  container.addEventListener('keydown', handleKeyDown);
  return () => container.removeEventListener('keydown', handleKeyDown);
}

export function isInteractiveShortcutTarget(target) {
  const element = getElementTarget(target);
  if (!element) return false;
  return Boolean(element.closest('input, select, textarea, button, a, [contenteditable="true"], [role="button"], [role="slider"], [role="textbox"], [role="combobox"]'));
}

export function isBlockedGestureTarget(target) {
  const element = getElementTarget(target);
  if (!element) return false;

  return Boolean(element.closest([
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'label',
    'pre',
    'code',
    '[contenteditable]',
    '[role="button"]',
    '[role="link"]',
    '[role="slider"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]'
  ].join(',')));
}

export function hasSelectedText() {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection ? window.getSelection() : null;
  return Boolean(selection && selection.toString().trim().length > 0);
}

export function isMobileSheetLayout() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
}

export function announceLive(message) {
  if (typeof document === 'undefined') return;
  let live = document.getElementById('liveAnnouncer') || document.getElementById('a11y-live-region');
  if (!live) {
    live = document.createElement('div');
    live.id = 'liveAnnouncer';
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    live.style.position = 'absolute';
    live.style.width = '1px';
    live.style.height = '1px';
    live.style.padding = '0';
    live.style.margin = '-1px';
    live.style.overflow = 'hidden';
    live.style.clip = 'rect(0, 0, 0, 0)';
    live.style.whiteSpace = 'nowrap';
    live.style.border = '0';
    document.body.appendChild(live);
  }
  live.textContent = '';
  setTimeout(() => {
    live.textContent = message;
  }, 50);
}

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  );
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatNumber(num) {
  const parsed = Number(num);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString();
}

export function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

let statusTimer = null;

function updateStatusTarget(target, message, type) {
  if (!target) return;
  const baseClass = (target.classList && target.classList.contains('reader-status-message')) || target.id === 'readerStatusMessage'
    ? 'status-message reader-status-message'
    : 'status-message';
  target.textContent = message || '';
  target.className = message ? `${baseClass} show ${type}` : baseClass;
}

export function showStatus(message, type = 'info') {
  if (typeof document === 'undefined') return;
  const statusMessage = document.getElementById('statusMessage');
  const readerStatusMessage = document.getElementById('readerStatusMessage');
  if (!statusMessage && !readerStatusMessage) return;
  if (!message) {
    clearStatus();
    return;
  }
  updateStatusTarget(statusMessage, message, type);
  updateStatusTarget(readerStatusMessage, message, type);
  if (typeof window !== 'undefined') {
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(clearStatus, 4500);
  }
}

export function clearStatus() {
  if (typeof document === 'undefined') return;
  const statusMessage = document.getElementById('statusMessage');
  const readerStatusMessage = document.getElementById('readerStatusMessage');
  updateStatusTarget(statusMessage, '', 'info');
  updateStatusTarget(readerStatusMessage, '', 'info');
}

export function showLoader(message = 'Loading text...') {
  if (typeof document === 'undefined') return;
  const loader = document.getElementById('loader');
  const loaderText = document.querySelector('.loader-text');
  if (loader && loaderText) {
    loaderText.textContent = message;
    loader.classList.add('active');
  }
}

export function hideLoader() {
  if (typeof document === 'undefined') return;
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.remove('active');
  }
}

let gestureHintTimer = null;

export function showGestureHint(text) {
  if (typeof document === 'undefined') return;
  const gestureHint = document.getElementById('gestureHint');
  const gestureHintText = document.getElementById('gestureHintText');
  if (!gestureHintText || !gestureHint) return;
  gestureHintText.textContent = text;
  gestureHint.classList.add('show');
  if (typeof window !== 'undefined') {
    window.clearTimeout(gestureHintTimer);
    gestureHintTimer = window.setTimeout(() => {
      gestureHint.classList.remove('show');
    }, 700);
  }
}

export function debounce(fn, delay = 200) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, limit = 200) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

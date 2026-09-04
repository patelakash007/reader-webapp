export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, match => map[match]);
}

export function formatError(err) {
  return err && err.message ? err.message : 'Unknown error';
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

export function getElementTarget(target) {
  if (!target) return null;
  if (typeof Element !== 'undefined' && target instanceof Element) return target;
  if (typeof Node !== 'undefined' && target instanceof Node) {
    return target.nodeType === 1 ? target : target.parentElement;
  }
  return (target.nodeType === 1 || typeof target.closest === 'function') ? target : null;
}

export function getScrollTop() {
  if (typeof window === 'undefined') return 0;
  return window.pageYOffset || (typeof document !== 'undefined' && (document.documentElement?.scrollTop || document.body?.scrollTop)) || 0;
}

export function isMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  if (!hasTouch) return false;
  const hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  const hasFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (hasHover && hasFinePointer) return false;
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (isCoarse && !hasFinePointer) return true;
  return !hasHover;
}

export function beginFileRead(context) {
  context.runtime.file.activeReadToken += 1;
  return context.runtime.file.activeReadToken;
}

export function cancelPendingFileRead(context) {
  context.runtime.file.activeReadToken += 1;
  if (context.runtime.file.activeLoadingTask && typeof context.runtime.file.activeLoadingTask.destroy === 'function') {
    try {
      context.runtime.file.activeLoadingTask.destroy();
    } catch (err) {}
    context.runtime.file.activeLoadingTask = null;
  }
}

export function isActiveFileRead(context, readToken) {
  return readToken === context.runtime.file.activeReadToken;
}

export function createStaleReadError() {
  const err = new Error('Stale file read ignored.');
  err.name = 'StaleFileReadError';
  return err;
}

export function assertActiveFileRead(context, readToken) {
  if (!isActiveFileRead(context, readToken)) throw createStaleReadError();
}

export function isStaleReadError(err) {
  return err && err.name === 'StaleFileReadError';
}

export function cancelPendingRender(context, options = {}) {
  context.runtime.reader.activeRenderId += 1;
  if (options.clearContent && context.els.readerContent) {
    context.els.readerContent.textContent = '';
  }
}

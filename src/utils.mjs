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
  return typeof Element !== 'undefined' && target instanceof Element ? target : null;
}

export function getScrollTop() {
  return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

export function beginFileRead(context) {
  context.runtime.file.activeReadToken += 1;
  return context.runtime.file.activeReadToken;
}

export function cancelPendingFileRead(context) {
  context.runtime.file.activeReadToken += 1;
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

export function deriveDownloadFilename(currentText, activeFileName) {
  let base = '';
  if (activeFileName && typeof activeFileName === 'string') {
    base = activeFileName.replace(/\.[^/.]+$/, '').trim();
  }
  if (!base && currentText && typeof currentText === 'string') {
    const headingMatch = currentText.match(/^#+\s+([^\r\n]+)/m);
    if (headingMatch && headingMatch[1].trim()) {
      base = headingMatch[1].trim();
    }
  }
  if (!base) {
    return 'Reader_Export.txt';
  }
  const slug = base
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
  if (!slug) {
    return 'Reader_Export.txt';
  }
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${slug}_${dateStr}.txt`;
}

export function createUI(context) {
  const { els, state } = context;

  function updateStatusTarget(target, message, type) {
    if (!target) return;
    const baseClass = target === els.readerStatusMessage ? 'status-message reader-status-message' : 'status-message';
    target.textContent = message || '';
    target.className = message ? `${baseClass} show ${type}` : baseClass;
  }

  function clearStatus() {
    updateStatusTarget(els.statusMessage, '', 'info');
    updateStatusTarget(els.readerStatusMessage, '', 'info');
  }

  function showStatus(message, type = 'info') {
    if (!els.statusMessage && !els.readerStatusMessage) return;
    if (!message) {
      clearStatus();
      return;
    }
    updateStatusTarget(els.statusMessage, message, type);
    updateStatusTarget(els.readerStatusMessage, message, type);
    window.clearTimeout(state.statusTimer);
    state.statusTimer = window.setTimeout(clearStatus, 4500);
  }

  function showLoader(message = 'Loading text...') {
    if (els.loader && els.loaderText) {
      els.loaderText.textContent = message;
      els.loader.classList.add('active');
    }
  }

  function hideLoader() {
    if (els.loader) els.loader.classList.remove('active');
  }

  function announceLive(msg) {
    let live = document.getElementById('liveAnnouncer');
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
      live.textContent = msg;
    }, 50);
  }

  function setContainerFocusable(container, enabled) {
    if (!container) return;
    container.querySelectorAll('button, input, [tabindex], select').forEach(element => {
      if (enabled) {
        if (element.dataset.savedTabindex !== undefined) {
          const previous = element.dataset.savedTabindex;
          if (previous) element.setAttribute('tabindex', previous);
          else element.removeAttribute('tabindex');
          delete element.dataset.savedTabindex;
        }
        return;
      }

      if (element.dataset.savedTabindex === undefined) {
        element.dataset.savedTabindex = element.hasAttribute('tabindex') ? element.getAttribute('tabindex') : '';
      }
      element.setAttribute('tabindex', '-1');
    });
  }

  function getFullscreenElement() {
    return document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null;
  }

  function handleFullscreenPromise(result) {
    if (result && typeof result.catch === 'function') {
      result.catch(() => showStatus('Fullscreen mode not permitted on this device.', 'error'));
    }
  }

  function toggleFullscreen() {
    try {
      if (!getFullscreenElement()) {
        const requestFullscreen = document.documentElement.requestFullscreen ||
          document.documentElement.webkitRequestFullscreen ||
          document.documentElement.msRequestFullscreen;
        if (!requestFullscreen) {
          showStatus('Fullscreen mode is not supported on this device.', 'error');
          return;
        }
        handleFullscreenPromise(requestFullscreen.call(document.documentElement));
      } else {
        const exitFullscreen = document.exitFullscreen ||
          document.webkitExitFullscreen ||
          document.msExitFullscreen;
        if (!exitFullscreen) {
          showStatus('Fullscreen exit is not supported on this device.', 'error');
          return;
        }
        handleFullscreenPromise(exitFullscreen.call(document));
      }
    } catch (err) {
      showStatus('Fullscreen mode not permitted on this device.', 'error');
    }
  }

  function updateFullscreenButton() {
    if (els.fullscreenBtn) {
      const isFullscreen = Boolean(getFullscreenElement());
      els.fullscreenBtn.classList.toggle('active', isFullscreen);
      els.fullscreenBtn.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
      els.fullscreenBtn.setAttribute('aria-label', isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen');
      els.fullscreenBtn.setAttribute('title', isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen');
    }
  }

  function getDownloadFilename() {
    return deriveDownloadFilename(state.currentText, state.activeFileName);
  }

  function downloadText() {
    if (!state.currentText) {
      showStatus('No text content to download.', 'error');
      return;
    }
    let url = null;
    let anchor = null;
    try {
      const blob = new Blob([state.currentText], { type: 'text/plain;charset=utf-8' });
      url = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getDownloadFilename();
      document.body.appendChild(anchor);
      anchor.click();
      showStatus('File downloaded successfully.', 'success');
    } catch (err) {
      showStatus('Download failed on this device.', 'error');
    } finally {
      if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
      if (url) {
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          try { URL.revokeObjectURL(url); } catch (e) {}
          if (typeof window !== 'undefined') {
            window.removeEventListener('focus', cleanup);
          }
        };
        if (typeof window !== 'undefined') {
          window.addEventListener('focus', cleanup, { once: true });
          window.setTimeout(cleanup, 60000);
        } else {
          try { URL.revokeObjectURL(url); } catch (e) {}
        }
      }
    }
  }

  function setupFocusTrap(dialog) {
    if (!dialog) return;
    dialog.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusableElements = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusableElements.length === 0) return;

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    });
  }

  function openTocDialog() {
    if (!els.tocDialog) return false;
    if (els.tocDialog.open) return true;
    if (typeof els.tocDialog.showModal === 'function') {
      try {
        els.tocDialog.showModal();
        return true;
      } catch (err) {}
    }
    els.tocDialog.setAttribute('open', '');
    return true;
  }

  function closeTocDialog() {
    if (!els.tocDialog || !els.tocDialog.open) return;
    if (typeof els.tocDialog.close === 'function') {
      try {
        els.tocDialog.close();
        return;
      } catch (err) {}
    }
    els.tocDialog.removeAttribute('open');
    els.tocDialog.dispatchEvent(new Event('close'));
  }

  return {
    announceLive,
    clearStatus,
    closeTocDialog,
    downloadText,
    getDownloadFilename,
    getFullscreenElement,
    handleFullscreenPromise,
    hideLoader,
    openTocDialog,
    setContainerFocusable,
    setupFocusTrap,
    showLoader,
    showStatus,
    toggleFullscreen,
    updateFullscreenButton,
    updateStatusTarget
  };
}

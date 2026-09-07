import { getElementTarget, getScrollTop } from './utils.mjs';

export function createReaderNavigation(context, { ui, getSettings, resetToolbarTimer }) {
  const { els, state, runtime } = context;
  let rulerFramePending = false;
  let lastRulerTarget = null;
  let lastRulerRect = null;
  let lastRulerScrollTop = 0;
  function setRulerActive(active, options = {}) {
    runtime.reader.isRulerActive = Boolean(active);
    if (els.readingRuler) els.readingRuler.style.display = runtime.reader.isRulerActive ? 'block' : 'none';
    if (!els.rulerBtn) return;
    els.rulerBtn.classList.toggle('active', runtime.reader.isRulerActive);
    els.rulerBtn.setAttribute('aria-pressed', runtime.reader.isRulerActive ? 'true' : 'false');
    if (runtime.reader.isRulerActive) {
      els.rulerBtn.setAttribute('aria-label', 'Disable Reading Ruler');
      els.rulerBtn.setAttribute('title', 'Disable Reading Ruler');
      if (options.announce !== false) ui.showStatus('Reading ruler guide activated.', 'success');
    } else {
      els.rulerBtn.setAttribute('aria-label', 'Enable Reading Ruler');
      els.rulerBtn.setAttribute('title', 'Enable Reading Ruler');
      if (options.announce !== false) ui.showStatus('Reading ruler guide deactivated.', 'info');
    }
  }

  function updateRulerPosition(event) {
    if (!runtime.reader.isRulerActive || !els.readingRuler || !els.readerContent || rulerFramePending) return;
    const target = getElementTarget(event.target);
    const pageY = typeof event.pageY === 'number'
      ? event.pageY
      : (event.touches && event.touches[0] && typeof event.touches[0].pageY === 'number' ? event.touches[0].pageY : null);
    rulerFramePending = true;

    const executeUpdate = () => {
      rulerFramePending = false;
      if (!runtime.reader.isRulerActive || !els.readingRuler || !els.readerContent) return;
      const scrollTop = getScrollTop();
      if (target && els.readerContent.contains(target) &&
        (target.tagName === 'P' || target.tagName === 'LI' || target.tagName === 'H1' || target.tagName === 'H2' || target.tagName === 'H3' || target.tagName === 'H4' || target.tagName === 'H5' || target.tagName === 'H6' || target.tagName === 'BLOCKQUOTE' || target.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote'))) {
        const textContainer = target.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote') || target;
        if (textContainer !== lastRulerTarget || scrollTop !== lastRulerScrollTop || !lastRulerRect) {
          lastRulerTarget = textContainer;
          lastRulerScrollTop = scrollTop;
          lastRulerRect = textContainer.getBoundingClientRect();
        }
        const top = lastRulerRect.top + scrollTop;
        els.readingRuler.style.height = `${lastRulerRect.height + 4}px`;
        els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
      } else if (typeof pageY === 'number') {
        lastRulerTarget = null;
        lastRulerRect = null;
        const y = pageY - 14;
        els.readingRuler.style.height = '28px';
        els.readingRuler.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    };

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(executeUpdate);
    } else {
      executeUpdate();
    }
  }

  function autoScrollLoop(timestamp) {
    const autoScroll = runtime.autoScroll;
    if (!autoScroll.active) return;
    if (!autoScroll.lastScrollTime) autoScroll.lastScrollTime = timestamp;
    const deltaTime = timestamp - autoScroll.lastScrollTime;
    autoScroll.lastScrollTime = timestamp;
    autoScroll.accumulator += deltaTime * autoScroll.speed;
    if (autoScroll.accumulator >= 1) {
      const pixelsToScroll = Math.floor(autoScroll.accumulator);
      if (typeof window !== 'undefined' && window.scrollBy) window.scrollBy(0, pixelsToScroll);
      autoScroll.accumulator -= pixelsToScroll;
    }
    const viewportHeight = typeof window !== 'undefined' ? (window.innerHeight || document.documentElement.clientHeight || 0) : 0;
    const scrollHeight = typeof document !== 'undefined' && document.documentElement ? document.documentElement.scrollHeight : 0;
    const distanceToBottom = scrollHeight - getScrollTop() - viewportHeight;
    if (distanceToBottom < 1) toggleAutoScroll();
    else if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(autoScrollLoop);
  }

  function toggleAutoScroll() {
    if (!els.autoScrollBtn) return;
    const autoScroll = runtime.autoScroll;
    autoScroll.active = !autoScroll.active;
    if (autoScroll.active) {
      els.autoScrollBtn.classList.add('active');
      els.autoScrollBtn.innerHTML = '<span aria-hidden="true">&#x23F8;</span>';
      els.autoScrollBtn.setAttribute('aria-pressed', 'true');
      els.autoScrollBtn.setAttribute('aria-label', 'Stop Auto Scroll');
      els.autoScrollBtn.setAttribute('title', 'Stop Auto Scroll');
      autoScroll.lastScrollTime = 0;
      autoScroll.accumulator = 0;
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(autoScrollLoop);
      ui.announceLive('Auto-scroll started.');
    } else {
      els.autoScrollBtn.classList.remove('active');
      els.autoScrollBtn.innerHTML = '<span aria-hidden="true">&#x25B6;</span>';
      els.autoScrollBtn.setAttribute('aria-pressed', 'false');
      els.autoScrollBtn.setAttribute('aria-label', 'Start Auto Scroll');
      els.autoScrollBtn.setAttribute('title', 'Start Auto Scroll');
      ui.announceLive('Auto-scroll stopped.');
    }
  }

  function getHeadingScrollOffset() {
    if (!els.toolbar || isMobileSheetLayout() || state.focusMode || els.toolbar.classList.contains('hidden-bar')) return 0;
    const rect = els.toolbar.getBoundingClientRect();
    if (rect.height <= 0 || rect.bottom <= 0) return 0;
    return Math.ceil(rect.bottom + 16);
  }

  function scrollHeadingIntoView(heading) {
    if (!heading) return;
    const offset = getHeadingScrollOffset();
    if (!offset) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const headingTop = heading.getBoundingClientRect().top + getScrollTop();
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo({ top: Math.max(0, headingTop - offset), behavior: 'smooth' });
    }
  }

  function populateAndShowTOC() {
    if (!els.readerContent || !els.tocDialog || !els.tocBody) return;
    const headings = els.readerContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length === 0) {
      ui.showStatus('No headings found in this document.', 'info');
      return;
    }
    runtime.reader.lastActiveElement = typeof document !== 'undefined' ? document.activeElement : null;
    els.tocBody.innerHTML = '';
    headings.forEach(heading => {
      if (!heading.id) heading.id = `heading-${Math.random().toString(36).slice(2, 11)}`;
      const link = document.createElement('a');
      link.className = 'toc-item';
      link.textContent = heading.textContent;
      link.href = `#${heading.id}`;
      link.addEventListener('click', event => {
        event.preventDefault();
        scrollHeadingIntoView(heading);
        ui.closeTocDialog();
      });
      els.tocBody.appendChild(link);
    });
    if (!ui.openTocDialog()) {
      ui.showStatus('Table of contents is unavailable in this browser.', 'error');
      return;
    }
    setTimeout(() => {
      if (els.closeTocBtn) els.closeTocBtn.focus();
    }, 50);
  }

  function isMobileSheetLayout() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function toggleMobileSheet() {
    if (!els.toolbar) return;
    if (els.toolbar.classList.contains('expanded')) collapseMobileSheet();
    else expandMobileSheet();
  }

  let sheetFocusTrapListener = null;

  function expandMobileSheet() {
    runtime.reader.lastActiveElement = typeof document !== 'undefined' ? document.activeElement : null;
    if (els.toolbar) {
      els.toolbar.classList.add('expanded');
      els.toolbar.setAttribute('role', 'dialog');
      els.toolbar.setAttribute('aria-modal', 'true');
      els.toolbar.setAttribute('aria-label', 'Reading Settings');
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.add('show');
    ui.setContainerFocusable(els.toolbar, true);
    if (isMobileSheetLayout() && typeof document !== 'undefined' && document.body) {
      document.body.classList.add('mobile-sheet-active');
      if (els.toolbar) els.toolbar.scrollTop = 0;
    }
    if (els.mobileFab) {
      els.mobileFab.classList.add('active');
      els.mobileFab.setAttribute('aria-label', 'Close Reading Settings');
      els.mobileFab.setAttribute('aria-expanded', 'true');
    }

    if (els.toolbar) {
      const focusableElements = Array.from(els.toolbar.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusableElements.length > 0) {
        try { focusableElements[0].focus(); } catch (err) {}
      }

      if (!sheetFocusTrapListener) {
        sheetFocusTrapListener = event => {
          if (!els.toolbar || !els.toolbar.classList.contains('expanded')) return;
          if (event.key === 'Tab') {
            const focusables = Array.from(els.toolbar.querySelectorAll(
              'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
            )).filter(el => el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey) {
              if (document.activeElement === first || !els.toolbar.contains(document.activeElement)) {
                event.preventDefault();
                last.focus();
              }
            } else {
              if (document.activeElement === last || !els.toolbar.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
              }
            }
          }
        };
        els.toolbar.addEventListener('keydown', sheetFocusTrapListener);
      }
    }
  }

  function collapseMobileSheet() {
    if (els.toolbar) {
      els.toolbar.classList.remove('expanded');
      els.toolbar.removeAttribute('aria-modal');
      els.toolbar.removeAttribute('role');
      els.toolbar.removeAttribute('aria-label');
      if (sheetFocusTrapListener) {
        els.toolbar.removeEventListener('keydown', sheetFocusTrapListener);
        sheetFocusTrapListener = null;
      }
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    ui.setContainerFocusable(els.toolbar, false);
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mobile-sheet-active');
    }
    if (els.toolbar) els.toolbar.scrollTop = 0;
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      const targetFocus = (runtime.reader.lastActiveElement && typeof document !== 'undefined' && document.contains(runtime.reader.lastActiveElement))
        ? runtime.reader.lastActiveElement
        : els.mobileFab;
      try { targetFocus.focus(); } catch (err) {}
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
  }


  function toggleFocus() {
    if (!els.toolbar || !els.backBtn || !els.wordCount || !els.focusRestore || !els.focusBtn) return;
    state.focusMode = !state.focusMode;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('focus-mode-active', state.focusMode);
    }
    if (state.focusMode) {
      if (isMobileSheetLayout()) collapseMobileSheet();
      els.toolbar.classList.add('force-hidden');
      els.backBtn.classList.add('force-hidden');
      els.wordCount.classList.add('force-hidden');
      els.focusRestore.classList.add('show');
      els.focusBtn.setAttribute('aria-pressed', 'true');
      els.focusBtn.setAttribute('aria-label', 'Show UI');
      els.focusBtn.setAttribute('title', 'Show UI');
      ui.setContainerFocusable(els.toolbar, false);
      if (typeof window !== 'undefined' && window.clearTimeout) {
        window.clearTimeout(state.toolbarTimer);
      }
      ui.announceLive('Focus mode activated. UI controls hidden.');
      return;
    }
    els.toolbar.classList.remove('force-hidden');
    els.backBtn.classList.remove('force-hidden');
    els.wordCount.classList.remove('force-hidden');
    els.focusRestore.classList.remove('show');
    els.focusBtn.setAttribute('aria-pressed', 'false');
    els.focusBtn.setAttribute('aria-label', 'Hide UI');
    els.focusBtn.setAttribute('title', 'Hide UI');
    ui.setContainerFocusable(els.toolbar, true);
    resetToolbarTimer();
    ui.announceLive('Focus mode deactivated. UI controls visible.');
  }

  return { autoScrollLoop, collapseMobileSheet, expandMobileSheet, getHeadingScrollOffset, isMobileSheetLayout, populateAndShowTOC, resetToolbarTimer, scrollHeadingIntoView, setRulerActive, toggleAutoScroll, toggleFocus, toggleMobileSheet, updateRulerPosition };
}

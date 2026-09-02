import {
  VALID_FONTS,
  VALID_SIZES,
  VALID_THEMES,
  darkPresets,
  fontMap,
  lightPresets,
  textColorMap
} from './constants.mjs';
import { clampIndex, clampNumber, escapeHtml, getElementTarget } from './utils.mjs';

export function createSettings(context, { ui, onResetToolbarTimer, isMobileSheetLayout }) {
  const { els, state, runtime } = context;
  const loadedFonts = runtime.fonts.loaded;
  let initialized = false;

  function getPresets() {
    return state.currentMode === 'dark' ? darkPresets : lightPresets;
  }

  function ensureFontLoaded(fontKey) {
    if (loadedFonts.has(fontKey)) return;
    if (!fontMap[fontKey]) return;
    loadedFonts.add(fontKey);
  }

  function setTrackPosition(index, animate) {
    if (!els.presetTrack) return;
    els.presetTrack.classList.toggle('snapping', Boolean(animate));
    els.presetTrack.classList.toggle('dragging', false);
    els.presetTrack.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
  }

  function updateDots() {
    if (!els.presetDots) return;
    els.presetDots.querySelectorAll('.preset-dot').forEach((dot, index) => {
      dot.classList.toggle('active', index === state.currentPresetIndex);
    });
  }

  function updateThemeSettingsSummary() {
    if (!els.themeSettingsSummary) return;
    const preset = getPresets()[state.currentPresetIndex];
    const modeLabel = state.currentMode === 'dark' ? 'Dark' : 'Light';
    els.themeSettingsSummary.textContent = `${preset ? preset.name : 'Preset'}, ${modeLabel}`;
  }

  function updatePresetA11y() {
    if (!els.presetWindow || !els.presetTrack) return;
    const preset = getPresets()[state.currentPresetIndex];
    if (!preset) return;
    els.presetWindow.setAttribute(
      'aria-label',
      `Reading preset carousel. Current preset: ${preset.name}. Use left and right arrow keys to change presets.`
    );
    els.presetTrack.querySelectorAll('.preset-card').forEach((card, index) => {
      card.setAttribute('aria-hidden', index === state.currentPresetIndex ? 'false' : 'true');
    });
    updateThemeSettingsSummary();
  }

  function buildPresetCarousel(selectedIndex = state.currentPresetIndex) {
    const list = getPresets();
    state.currentPresetIndex = clampIndex(selectedIndex, list.length);
    if (els.presetTrack) {
      els.presetTrack.innerHTML = list.map((preset, index) =>
        `<div class="preset-card" data-index="${index}" aria-hidden="${index === state.currentPresetIndex ? 'false' : 'true'}">
          <div class="preset-name">${escapeHtml(preset.name)}</div>
          <div class="preset-desc">${escapeHtml(preset.desc)}</div>
        </div>`
      ).join('');
    }
    if (els.presetDots) {
      els.presetDots.innerHTML = list.map((preset, index) =>
        `<div class="preset-dot ${index === state.currentPresetIndex ? 'active' : ''}"></div>`
      ).join('');
    }
    setTrackPosition(state.currentPresetIndex, false);
    updatePresetA11y();
  }

  function setFont(font) {
    const nextFont = VALID_FONTS.has(font) ? font : 'sans';
    const config = fontMap[nextFont];
    if (!config) return;
    ensureFontLoaded(nextFont);
    document.documentElement.style.setProperty('--body-font', config.family);
    document.documentElement.style.setProperty('--heading-weight', config.weight);
  }

  function setTheme(theme) {
    const nextTheme = VALID_THEMES.has(theme) ? theme : 'claude';
    Array.from(document.body.classList)
      .filter(className => className.startsWith('theme-'))
      .forEach(className => document.body.classList.remove(className));
    document.body.classList.add(`theme-${nextTheme}`);
  }

  function applyTextColor(color) {
    if (!els.readerContent) return;
    const modeColors = textColorMap[state.currentMode] || textColorMap.light;
    const value = modeColors[color] || '';
    if (value) els.readerContent.style.setProperty('--reader-text-color', value);
    else els.readerContent.style.removeProperty('--reader-text-color');
  }

  function setTextColor(color) {
    state.currentTextColor = color || 'default';
    applyTextColor(state.currentTextColor);
  }

  function applyPreset(index, options = {}) {
    const list = getPresets();
    const safeIndex = clampIndex(index, list.length);
    const preset = list[safeIndex];
    if (!preset) return;
    state.currentPresetIndex = safeIndex;
    setFont(preset.font);
    setTheme(preset.theme);
    setTextColor(preset.color);
    setTrackPosition(safeIndex, options.animate !== false);
    updateDots();
    updatePresetA11y();
    if (options.resetTimer !== false) onResetToolbarTimer();
  }

  function nextPreset() {
    const list = getPresets();
    state.currentPresetIndex = (state.currentPresetIndex + 1) % list.length;
    applyPreset(state.currentPresetIndex);
    showGestureHint(list[state.currentPresetIndex].name);
  }

  function prevPreset() {
    const list = getPresets();
    state.currentPresetIndex = (state.currentPresetIndex - 1 + list.length) % list.length;
    applyPreset(state.currentPresetIndex);
    showGestureHint(list[state.currentPresetIndex].name);
  }

  function setMode(mode, options = {}) {
    state.currentMode = mode === 'dark' ? 'dark' : 'light';
    if (els.modeLight) {
      els.modeLight.classList.toggle('active', state.currentMode === 'light');
      els.modeLight.setAttribute('aria-pressed', state.currentMode === 'light' ? 'true' : 'false');
    }
    if (els.modeDark) {
      els.modeDark.classList.toggle('active', state.currentMode === 'dark');
      els.modeDark.setAttribute('aria-pressed', state.currentMode === 'dark' ? 'true' : 'false');
    }
    const selectedIndex = options.presetIndex === undefined ? 0 : options.presetIndex;
    buildPresetCarousel(selectedIndex);
    applyPreset(state.currentPresetIndex, { animate: false, resetTimer: options.resetTimer });
  }

  function setSize(size) {
    if (!els.readerContent) return;
    const nextSize = VALID_SIZES.has(size) ? size : 'medium';
    els.readerContent.classList.remove('fs-small', 'fs-medium', 'fs-large', 'fs-xl');
    els.readerContent.classList.add(`fs-${nextSize}`);
    document.querySelectorAll('[data-size]').forEach(button => {
      const active = button.getAttribute('data-size') === nextSize;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setSettingsSectionExpanded(section, expanded) {
    if (!section) return;
    const isExpanded = Boolean(expanded);
    const toggle = section.querySelector('.settings-section-toggle');
    const panelId = toggle ? toggle.getAttribute('aria-controls') : '';
    const panel = panelId ? document.getElementById(panelId) : section.querySelector('.settings-section-panel');
    section.classList.toggle('is-open', isExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    if (panel) {
      panel.hidden = !isExpanded;
      panel.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');
    }
  }

  function resetSettingsSections() {
    if (els.settingsDrawer) els.settingsDrawer.classList.add('active');
    els.settingsSections.forEach(section => {
      setSettingsSectionExpanded(section, section.getAttribute('data-settings-section') === 'theme');
    });
    updateThemeSettingsSummary();
  }

  function toggleSettingsSection(section) {
    if (!section) return;
    const expanded = !section.classList.contains('is-open');
    setSettingsSectionExpanded(section, expanded);
    onResetToolbarTimer();
    if (expanded && isMobileSheetLayout() && els.toolbar) {
      window.requestAnimationFrame(() => section.scrollIntoView({ block: 'nearest' }));
    }
  }

  function showGestureHint(text) {
    if (!els.gestureHintText || !els.gestureHint) return;
    els.gestureHintText.textContent = text;
    els.gestureHint.classList.add('show');
    window.clearTimeout(state.gestureHintTimer);
    state.gestureHintTimer = window.setTimeout(() => els.gestureHint.classList.remove('show'), 700);
  }

  function getCarouselWidth() {
    return els.presetWindow ? (els.presetWindow.getBoundingClientRect().width || 1) : 1;
  }

  function updateCarouselDrag() {
    if (!state.isDraggingCarousel || !els.presetTrack) return;
    let distance = state.dragCurrentX - state.dragStartX;
    const list = getPresets();
    if ((state.dragStartIndex === 0 && distance > 0) || (state.dragStartIndex === list.length - 1 && distance < 0)) distance *= 0.35;
    const percentage = (distance / state.carouselWidth) * 100;
    els.presetTrack.style.transform = `translate3d(${(-state.dragStartIndex * 100) + percentage}%, 0, 0)`;
    window.requestAnimationFrame(updateCarouselDrag);
  }

  function startCarouselDrag(x) {
    if (!els.presetTrack) return;
    state.carouselWidth = getCarouselWidth();
    state.dragStartX = x;
    state.dragCurrentX = x;
    state.dragStartIndex = state.currentPresetIndex;
    state.isDraggingCarousel = true;
    state.lastCarouselDragDistance = 0;
    els.presetTrack.classList.remove('snapping');
    els.presetTrack.classList.add('dragging');
    window.requestAnimationFrame(updateCarouselDrag);
  }

  function endCarouselDrag() {
    if (!state.isDraggingCarousel) return;
    state.isDraggingCarousel = false;
    const distance = state.dragCurrentX - state.dragStartX;
    state.lastCarouselDragDistance = Math.abs(distance);
    const threshold = state.carouselWidth * 0.18;
    const list = getPresets();
    if (distance < -threshold && state.currentPresetIndex < list.length - 1) state.currentPresetIndex += 1;
    else if (distance > threshold && state.currentPresetIndex > 0) state.currentPresetIndex -= 1;
    applyPreset(state.currentPresetIndex);
  }

  function hasSelectedText() {
    const selection = window.getSelection ? window.getSelection() : null;
    return Boolean(selection && selection.toString().trim().length > 0);
  }

  function isBlockedGestureTarget(target) {
    const element = getElementTarget(target);
    if (!element) return false;
    return Boolean(element.closest([
      'a', 'button', 'input', 'select', 'textarea', 'label', 'pre', 'code', '[contenteditable]',
      '[role="button"]', '[role="link"]', '[role="slider"]', '[role="textbox"]', '[role="combobox"]',
      '[role="checkbox"]', '[role="radio"]'
    ].join(',')));
  }

  function canStartPresetGesture(target) {
    return !state.isEditing && !hasSelectedText() && !isBlockedGestureTarget(target);
  }

  function attachGestureArea(element) {
    if (!element) return;
    element.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;
      if (!canStartPresetGesture(event.target)) {
        state.isGesture = false;
        return;
      }
      state.gestureStartX = event.touches[0].screenX;
      state.gestureStartY = event.touches[0].screenY;
      state.gestureStartTime = Date.now();
      state.isGesture = true;
    }, { passive: true });
    element.addEventListener('touchmove', event => {
      if (!state.isGesture) return;
      const distanceX = Math.abs(event.touches[0].screenX - state.gestureStartX);
      const distanceY = Math.abs(event.touches[0].screenY - state.gestureStartY);
      if (distanceY > distanceX && distanceY > 20) state.isGesture = false;
    }, { passive: true });
    element.addEventListener('touchend', event => {
      if (!state.isGesture) return;
      state.isGesture = false;
      if (hasSelectedText() || isBlockedGestureTarget(event.target)) return;
      const elapsed = Date.now() - state.gestureStartTime;
      const distanceX = event.changedTouches[0].screenX - state.gestureStartX;
      const distanceY = event.changedTouches[0].screenY - state.gestureStartY;
      if (elapsed > 500 || Math.abs(distanceX) < 55 || Math.abs(distanceY) > Math.abs(distanceX) * 0.7) return;
      if (distanceX < 0) nextPreset();
      else prevPreset();
    }, { passive: true });
    element.addEventListener('mousedown', event => {
      if (!canStartPresetGesture(event.target)) {
        state.isGesture = false;
        return;
      }
      state.gestureStartX = event.clientX;
      state.gestureStartY = event.clientY;
      state.gestureStartTime = Date.now();
      state.isGesture = true;
    });
    element.addEventListener('mouseup', event => {
      if (!state.isGesture) return;
      state.isGesture = false;
      if (hasSelectedText() || isBlockedGestureTarget(event.target)) return;
      const elapsed = Date.now() - state.gestureStartTime;
      const distanceX = event.clientX - state.gestureStartX;
      const distanceY = event.clientY - state.gestureStartY;
      if (elapsed > 500 || Math.abs(distanceX) < 55 || Math.abs(distanceY) > Math.abs(distanceX) * 0.7) return;
      if (distanceX < 0) nextPreset();
      else prevPreset();
    });
    element.addEventListener('mouseleave', () => { state.isGesture = false; });
  }

  function isInteractiveShortcutTarget(target) {
    const element = getElementTarget(target);
    if (!element) return false;
    return Boolean(element.closest('input, select, textarea, button, a, [contenteditable="true"], [role="button"], [role="slider"], [role="textbox"], [role="combobox"]'));
  }

  function canUseGlobalPresetShortcut(event) {
    if (state.isEditing || !els.tocDialog || els.tocDialog.open) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.target === els.presetWindow) return false;
    return !isInteractiveShortcutTarget(event.target);
  }

  function setLineHeight(value) {
    if (!els.lineHeightInput) return;
    const next = clampNumber(value, 1.85, 1.4, 2.6);
    els.lineHeightInput.value = next;
    if (els.readerContent) els.readerContent.style.lineHeight = next;
  }

  function setLetterSpacing(value) {
    if (!els.letterSpacingInput) return;
    const next = clampNumber(value, -0.015, -0.03, 0.15);
    els.letterSpacingInput.value = next;
    if (els.readerContent) els.readerContent.style.letterSpacing = `${next}em`;
  }

  function updateMarginStyle(value) {
    if (!els.readerContent) return;
    let padding = clampNumber(value, 24, 12, 80);
    if (window.innerWidth <= 640) padding = Math.min(padding, 24);
    els.readerContent.style.paddingLeft = `${padding}px`;
    els.readerContent.style.paddingRight = `${padding}px`;
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    if (els.modeLight) els.modeLight.addEventListener('click', () => setMode('light'));
    if (els.modeDark) els.modeDark.addEventListener('click', () => setMode('dark'));
    document.querySelectorAll('[data-size]').forEach(button => {
      button.addEventListener('click', () => setSize(button.getAttribute('data-size')));
    });
    if (els.arrowLeft) els.arrowLeft.addEventListener('click', prevPreset);
    if (els.arrowRight) els.arrowRight.addEventListener('click', nextPreset);
    els.settingsSectionToggles.forEach(toggle => {
      toggle.addEventListener('click', () => toggleSettingsSection(toggle.closest('[data-settings-section]')));
    });
    if (els.presetWindow) {
      els.presetWindow.addEventListener('touchstart', event => {
        if (event.touches.length === 1 && canStartPresetGesture(event.target)) startCarouselDrag(event.touches[0].clientX);
      }, { passive: true });
      els.presetWindow.addEventListener('touchmove', event => {
        if (state.isDraggingCarousel) state.dragCurrentX = event.touches[0].clientX;
      }, { passive: true });
      els.presetWindow.addEventListener('touchend', endCarouselDrag, { passive: true });
      els.presetWindow.addEventListener('mousedown', event => {
        if (canStartPresetGesture(event.target)) startCarouselDrag(event.clientX);
      });
      els.presetWindow.addEventListener('click', event => {
        if (isBlockedGestureTarget(event.target) || hasSelectedText() || state.isDraggingCarousel) return;
        if (state.lastCarouselDragDistance > 5) {
          state.lastCarouselDragDistance = 0;
          return;
        }
        const target = getElementTarget(event.target);
        const card = target ? target.closest('.preset-card') : null;
        if (card) applyPreset(card.getAttribute('data-index'));
      });
      els.presetWindow.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          nextPreset();
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          prevPreset();
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          applyPreset(state.currentPresetIndex);
        }
      });
    }
    window.addEventListener('mousemove', event => {
      if (state.isDraggingCarousel) state.dragCurrentX = event.clientX;
    });
    window.addEventListener('mouseup', endCarouselDrag);
    if (els.readerContent) attachGestureArea(els.readerContent);
    if (els.wordCount) attachGestureArea(els.wordCount);
    if (els.lineHeightInput) els.lineHeightInput.addEventListener('input', () => setLineHeight(els.lineHeightInput.value));
    if (els.letterSpacingInput) els.letterSpacingInput.addEventListener('input', () => setLetterSpacing(els.letterSpacingInput.value));
    if (els.marginInput) els.marginInput.addEventListener('input', () => updateMarginStyle(els.marginInput.value));
    if (els.smartHeadingsInput) {
      els.smartHeadingsInput.addEventListener('change', () => {
        state.smartHeadings = els.smartHeadingsInput.checked;
        ui.announceLive(`Smart headings ${state.smartHeadings ? 'enabled' : 'disabled'}.`);
        if (context.onSmartHeadingsChanged) context.onSmartHeadingsChanged();
      });
    }
  }

  return {
    applyPreset,
    applyTextColor,
    bindEvents,
    buildPresetCarousel,
    canUseGlobalPresetShortcut,
    getPresets,
    nextPreset,
    prevPreset,
    resetSettingsSections,
    setLetterSpacing,
    setLineHeight,
    setMode,
    setSize,
    updateMarginStyle,
    updateThemeSettingsSummary
  };
}

import { clampIndex, escapeHtml, getElementTarget, isMobileDevice } from './utils.mjs';

export function createPresetCarousel(context, { getPresets, applyPreset }) {
  const { els, state } = context;

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
    if (isMobileDevice()) {
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

  return {
    attachGestureArea,
    buildPresetCarousel,
    canUseGlobalPresetShortcut,
    endCarouselDrag,
    getCarouselWidth,
    isBlockedGestureTarget,
    nextPreset,
    prevPreset,
    setTrackPosition,
    showGestureHint,
    startCarouselDrag,
    updateCarouselDrag,
    updateDots,
    updatePresetA11y,
    updateThemeSettingsSummary
  };
}

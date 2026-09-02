// settings.js - Themes, typography, presets, carousel physics, mobile sheet & drawer accordion

import {
  clampIndex,
  clampNumber,
  escapeHtml,
  getElementTarget,
  hasSelectedText,
  isBlockedGestureTarget,
  isInteractiveShortcutTarget,
  isMobileSheetLayout,
  showGestureHint,
  setContainerFocusable
} from './utils.js';

export const VALID_SIZES = new Set(['small', 'medium', 'large', 'xl']);

export const VALID_FONTS = new Set([
  'sans', 'serif', 'minimal', 'bold', 'clean', 'literata', 'merriweather', 'libre', 'atkinson', 'jakarta', 'outfit', 'bebas', 'oswald', 'manrope', 'sora'
]);

export const VALID_THEMES = new Set([
  'claude', 'zen', 'stark', 'paper', 'cream', 'kindle', 'github', 'amber', 'newspaper', 'lavender',
  'dark', 'void', 'carbon', 'midnight', 'obsidian', 'dracula', 'nord', 'catppuccin', 'forest', 'ink'
]);

const systemSans = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const systemSerif = 'Georgia, "Times New Roman", serif';
const systemMono = 'ui-monospace, SFMono-Regular, Consolas, monospace';

export const fontMap = {
  serif: { family: systemSerif, weight: 500, url: null },
  sans: { family: systemSans, weight: 600, url: null },
  minimal: { family: systemSans, weight: 700, url: null },
  bold: { family: systemSans, weight: 800, url: null },
  clean: { family: systemSans, weight: 700, url: null },
  literata: { family: systemSerif, weight: 700, url: null },
  merriweather: { family: systemSerif, weight: 700, url: null },
  libre: { family: systemSerif, weight: 700, url: null },
  atkinson: { family: systemSans, weight: 700, url: null },
  jakarta: { family: systemSans, weight: 700, url: null },
  outfit: { family: systemSans, weight: 700, url: null },
  bebas: { family: systemSans, weight: 700, url: null },
  oswald: { family: systemSans, weight: 700, url: null },
  manrope: { family: systemSans, weight: 700, url: null },
  sora: { family: systemSans, weight: 700, url: null },
  mono: { family: systemMono, weight: 600, url: null }
};

export const lightPresets = [
  { name: 'Claude', font: 'sans', theme: 'claude', color: 'default', desc: 'Clean warm like Claude.ai' },
  { name: 'Zen', font: 'outfit', theme: 'zen', color: 'default', desc: 'Pure minimal white' },
  { name: 'Stark', font: 'sora', theme: 'stark', color: 'high', desc: 'Bold high contrast' },
  { name: 'Book', font: 'literata', theme: 'paper', color: 'warm', desc: 'Long-form book reading' },
  { name: 'Classic', font: 'merriweather', theme: 'cream', color: 'default', desc: 'Traditional print feel' },
  { name: 'Kindle', font: 'merriweather', theme: 'kindle', color: 'warm', desc: 'E-ink sepia warmth' },
  { name: 'GitHub', font: 'sans', theme: 'github', color: 'default', desc: 'Developer favourite' },
  { name: 'Amber', font: 'atkinson', theme: 'amber', color: 'high', desc: 'High contrast warm' },
  { name: 'Newspaper', font: 'merriweather', theme: 'newspaper', color: 'default', desc: 'Old school print' },
  { name: 'Lavender', font: 'clean', theme: 'lavender', color: 'default', desc: 'Soft purple calm' }
];

export const darkPresets = [
  { name: 'Night', font: 'sans', theme: 'dark', color: 'soft', desc: 'Deep black OLED' },
  { name: 'Void', font: 'sora', theme: 'void', color: 'soft', desc: 'Pure black void' },
  { name: 'Carbon', font: 'minimal', theme: 'carbon', color: 'soft', desc: 'Material dark grey' },
  { name: 'Midnight', font: 'libre', theme: 'midnight', color: 'soft', desc: 'Purple dark elegance' },
  { name: 'Obsidian', font: 'sans', theme: 'obsidian', color: 'soft', desc: 'Note app dark' },
  { name: 'Dracula', font: 'minimal', theme: 'dracula', color: 'soft', desc: 'Famous code dark' },
  { name: 'Nord', font: 'jakarta', theme: 'nord', color: 'soft', desc: 'Arctic blue dark' },
  { name: 'Catppuccin', font: 'clean', theme: 'catppuccin', color: 'soft', desc: 'Pastel dark cozy' },
  { name: 'Forest', font: 'jakarta', theme: 'forest', color: 'soft', desc: 'Green night easy' },
  { name: 'Ink', font: 'literata', theme: 'ink', color: 'soft', desc: 'Navy scholarly' }
];

export const textColorMap = {
  light: { default: null, soft: '#6e6a62', warm: '#78350f', cool: '#1e3a5f', high: '#000000' },
  dark: { default: null, soft: '#b0a898', warm: '#fde68a', cool: '#bfdbfe', high: '#ffffff' }
};

const loadedFonts = new Set(['sans', 'serif']);

let currentMode = 'light';
let currentPresetIndex = 0;
let currentTextColor = 'default';

let dragStartX = 0;
let dragCurrentX = 0;
let dragStartIndex = 0;
let isDraggingCarousel = false;
let carouselWidth = 0;
let lastCarouselDragDistance = 0;

let gestureStartX = 0;
let gestureStartY = 0;
let gestureStartTime = 0;
let isGesture = false;

export function getPresets() {
  return currentMode === 'dark' ? darkPresets : lightPresets;
}

export function getCurrentMode() {
  return currentMode;
}

export function getMode() {
  return currentMode;
}

export function getCurrentPresetIndex() {
  return currentPresetIndex;
}

export function getCurrentTextColor() {
  return currentTextColor;
}

function ensureFontLoaded(fontKey) {
  if (loadedFonts.has(fontKey)) return;
  const cfg = fontMap[fontKey];
  if (!cfg) return;
  loadedFonts.add(fontKey);
}

export function buildPresetCarousel(selectedIndex = currentPresetIndex) {
  const list = getPresets();
  const safeIndex = clampIndex(selectedIndex, list.length);
  currentPresetIndex = safeIndex;

  if (typeof document === 'undefined') return;

  const presetTrack = document.getElementById('presetTrack');
  if (presetTrack) {
    presetTrack.innerHTML = list.map((preset, index) =>
      `<div class="preset-card" data-index="${index}" aria-hidden="${index === safeIndex ? 'false' : 'true'}">
        <div class="preset-name">${escapeHtml(preset.name)}</div>
        <div class="preset-desc">${escapeHtml(preset.desc)}</div>
      </div>`
    ).join('');
  }

  const presetDots = document.getElementById('presetDots');
  if (presetDots) {
    presetDots.innerHTML = list.map((_, index) =>
      `<div class="preset-dot ${index === safeIndex ? 'active' : ''}"></div>`
    ).join('');
  }

  setTrackPosition(safeIndex, false);
  updatePresetA11y();
}

export function setTrackPosition(index, animate) {
  if (typeof document === 'undefined') return;
  const presetTrack = document.getElementById('presetTrack');
  if (!presetTrack) return;
  presetTrack.classList.toggle('snapping', Boolean(animate));
  presetTrack.classList.toggle('dragging', false);
  presetTrack.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
}

export function updateDots() {
  if (typeof document === 'undefined') return;
  const presetDots = document.getElementById('presetDots');
  if (!presetDots) return;
  presetDots.querySelectorAll('.preset-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === currentPresetIndex);
  });
}

export function updatePresetA11y() {
  if (typeof document === 'undefined') return;
  const presetWindow = document.getElementById('presetWindow');
  const presetTrack = document.getElementById('presetTrack');
  if (!presetWindow || !presetTrack) return;
  const list = getPresets();
  const preset = list[currentPresetIndex];
  if (!preset) return;

  presetWindow.setAttribute(
    'aria-label',
    `Reading preset carousel. Current preset: ${preset.name}. Use left and right arrow keys to change presets.`
  );
  presetTrack.querySelectorAll('.preset-card').forEach((card, index) => {
    card.setAttribute('aria-hidden', index === currentPresetIndex ? 'false' : 'true');
  });
  updateThemeSettingsSummary();
}

export function updateThemeSettingsSummary() {
  if (typeof document === 'undefined') return;
  const themeSettingsSummary = document.getElementById('themeSettingsSummary');
  if (!themeSettingsSummary) return;
  const preset = getPresets()[currentPresetIndex];
  const modeLabel = currentMode === 'dark' ? 'Dark' : 'Light';
  themeSettingsSummary.textContent = `${preset ? preset.name : 'Preset'}, ${modeLabel}`;
}

export function applyPreset(index, options = {}) {
  let opts = options;
  if (typeof options === 'boolean') {
    opts = { isDark: options };
  } else if (typeof options !== 'object' || options === null) {
    opts = {};
  }

  if (typeof opts.isDark === 'boolean') {
    const targetMode = opts.isDark ? 'dark' : 'light';
    if (currentMode !== targetMode) {
      setMode(targetMode, { presetIndex: index, resetTimer: opts.resetTimer });
      return;
    }
  }

  const list = getPresets();
  const safeIndex = clampIndex(index, list.length);
  const preset = list[safeIndex];
  if (!preset) return;

  currentPresetIndex = safeIndex;
  setFont(preset.font);
  setTheme(preset.theme);
  setTextColor(preset.color);
  setTrackPosition(safeIndex, opts.animate !== false);
  updateDots();
  updatePresetA11y();

  if (opts.resetTimer !== false && typeof opts.onResetToolbarTimer === 'function') {
    opts.onResetToolbarTimer();
  }
}

export function nextPreset() {
  const list = getPresets();
  currentPresetIndex = (currentPresetIndex + 1) % list.length;
  applyPreset(currentPresetIndex);
  showGestureHint(list[currentPresetIndex].name);
}

export function prevPreset() {
  const list = getPresets();
  currentPresetIndex = (currentPresetIndex - 1 + list.length) % list.length;
  applyPreset(currentPresetIndex);
  showGestureHint(list[currentPresetIndex].name);
}

export function setMode(mode, options = {}) {
  currentMode = mode === 'dark' ? 'dark' : 'light';

  if (typeof document !== 'undefined') {
    const modeLight = document.getElementById('modeLight');
    const modeDark = document.getElementById('modeDark');
    if (modeLight) modeLight.classList.toggle('active', currentMode === 'light');
    if (modeDark) modeDark.classList.toggle('active', currentMode === 'dark');
    if (modeLight) modeLight.setAttribute('aria-pressed', currentMode === 'light' ? 'true' : 'false');
    if (modeDark) modeDark.setAttribute('aria-pressed', currentMode === 'dark' ? 'true' : 'false');
  }

  const selectedIndex = options.presetIndex === undefined ? 0 : options.presetIndex;
  buildPresetCarousel(selectedIndex);
  applyPreset(currentPresetIndex, {
    animate: false,
    resetTimer: options.resetTimer
  });
}

export function setFont(font) {
  if (!VALID_FONTS.has(font)) font = 'sans';
  const cfg = fontMap[font];
  if (!cfg) return;

  ensureFontLoaded(font);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--body-font', cfg.family);
    document.documentElement.style.setProperty('--heading-weight', cfg.weight);
  }
}

export function setTheme(theme) {
  if (!VALID_THEMES.has(theme)) theme = 'claude';
  if (typeof document !== 'undefined' && document.body) {
    Array.from(document.body.classList)
      .filter(className => className.startsWith('theme-'))
      .forEach(className => document.body.classList.remove(className));
    document.body.classList.add(`theme-${theme}`);
  }
}

export function setTextColor(color) {
  currentTextColor = color || 'default';
  applyTextColor(currentTextColor);
}

export function applyTextColor(color) {
  if (typeof document === 'undefined') return;
  const readerContent = document.getElementById('readerContent');
  if (!readerContent) return;
  const modeColors = textColorMap[currentMode] || textColorMap.light;
  const val = modeColors[color] || '';
  if (val) {
    readerContent.style.setProperty('--reader-text-color', val);
  } else {
    readerContent.style.removeProperty('--reader-text-color');
  }
}

export function setSize(size) {
  if (typeof document === 'undefined') return;
  const readerContent = document.getElementById('readerContent');
  if (!readerContent) return;
  const nextSize = VALID_SIZES.has(size) ? size : 'medium';
  readerContent.classList.remove('fs-small', 'fs-medium', 'fs-large', 'fs-xl');
  readerContent.classList.add(`fs-${nextSize}`);

  document.querySelectorAll('[data-size]').forEach(button => {
    const active = button.getAttribute('data-size') === nextSize;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function getCarouselWidth() {
  if (typeof document === 'undefined') return 1;
  const presetWindow = document.getElementById('presetWindow');
  return presetWindow ? (presetWindow.getBoundingClientRect().width || 1) : 1;
}

export function updateCarouselDrag() {
  if (typeof document === 'undefined') return;
  const presetTrack = document.getElementById('presetTrack');
  if (!isDraggingCarousel || !presetTrack) return;

  let dx = dragCurrentX - dragStartX;
  const list = getPresets();
  if ((dragStartIndex === 0 && dx > 0) || 
      (dragStartIndex === list.length - 1 && dx < 0)) {
    dx = dx * 0.35; // Rubber band bounds constraint
  }

  const pct = (dx / carouselWidth) * 100;
  presetTrack.style.transform = `translate3d(${(-dragStartIndex * 100) + pct}%, 0, 0)`;
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(updateCarouselDrag);
  }
}

export function startCarouselDrag(x) {
  if (typeof document === 'undefined') return;
  const presetTrack = document.getElementById('presetTrack');
  if (!presetTrack) return;
  carouselWidth = getCarouselWidth();
  dragStartX = x;
  dragCurrentX = x;
  dragStartIndex = currentPresetIndex;
  isDraggingCarousel = true;
  lastCarouselDragDistance = 0;
  presetTrack.classList.remove('snapping');
  presetTrack.classList.add('dragging');
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(updateCarouselDrag);
  }
}

export function endCarouselDrag() {
  if (!isDraggingCarousel) return;

  isDraggingCarousel = false;
  const dx = dragCurrentX - dragStartX;
  lastCarouselDragDistance = Math.abs(dx);
  const threshold = carouselWidth * 0.18;
  const list = getPresets();

  if (dx < -threshold && currentPresetIndex < list.length - 1) currentPresetIndex++;
  else if (dx > threshold && currentPresetIndex > 0) currentPresetIndex--;

  applyPreset(currentPresetIndex);
}

export function canStartPresetGesture(target) {
  if (typeof document !== 'undefined') {
    const readerContent = document.getElementById('readerContent');
    const isEditing = readerContent && readerContent.getAttribute('contenteditable') === 'true';
    if (isEditing) return false;
  }
  return !hasSelectedText() && !isBlockedGestureTarget(target);
}

export function attachGestureArea(element) {
  if (!element) return;
  element.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    if (!canStartPresetGesture(event.target)) {
      isGesture = false;
      return;
    }
    
    gestureStartX = event.touches[0].screenX;
    gestureStartY = event.touches[0].screenY;
    gestureStartTime = Date.now();
    isGesture = true;
  }, { passive: true });

  element.addEventListener('touchmove', event => {
    if (!isGesture) return;
    const dx = Math.abs(event.touches[0].screenX - gestureStartX);
    const dy = Math.abs(event.touches[0].screenY - gestureStartY);
    if (dy > dx && dy > 20) isGesture = false;
  }, { passive: true });

  element.addEventListener('touchend', event => {
    if (!isGesture) return;
    isGesture = false;
    if (hasSelectedText() || isBlockedGestureTarget(event.target)) return;

    const dt = Date.now() - gestureStartTime;
    const dx = event.changedTouches[0].screenX - gestureStartX;
    const dy = event.changedTouches[0].screenY - gestureStartY;
    if (dt > 500 || Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

    if (dx < 0) nextPreset();
    else prevPreset();
  }, { passive: true });

  element.addEventListener('mousedown', event => {
    if (!canStartPresetGesture(event.target)) {
      isGesture = false;
      return;
    }

    gestureStartX = event.clientX;
    gestureStartY = event.clientY;
    gestureStartTime = Date.now();
    isGesture = true;
  });

  element.addEventListener('mouseup', event => {
    if (!isGesture) return;
    isGesture = false;
    if (hasSelectedText() || isBlockedGestureTarget(event.target)) return;

    const dt = Date.now() - gestureStartTime;
    const dx = event.clientX - gestureStartX;
    const dy = event.clientY - gestureStartY;
    if (dt > 500 || Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

    if (dx < 0) nextPreset();
    else prevPreset();
  });

  element.addEventListener('mouseleave', () => {
    isGesture = false;
  });
}

export function canUseGlobalPresetShortcut(event) {
  if (typeof document === 'undefined') return false;
  const tocDialog = document.getElementById('tocDialog');
  const presetWindow = document.getElementById('presetWindow');
  const readerContent = document.getElementById('readerContent');
  const isEditing = readerContent && readerContent.getAttribute('contenteditable') === 'true';
  if (isEditing || !tocDialog || tocDialog.open) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.target === presetWindow) return false;
  return !isInteractiveShortcutTarget(event.target);
}

export function setSettingsSectionExpanded(section, expanded) {
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

export function resetSettingsSections() {
  if (typeof document === 'undefined') return;
  const settingsDrawer = document.getElementById('settingsDrawer');
  const settingsSections = Array.from(document.querySelectorAll('[data-settings-section]'));
  if (settingsDrawer) settingsDrawer.classList.add('active');
  settingsSections.forEach(section => {
    setSettingsSectionExpanded(section, section.getAttribute('data-settings-section') === 'theme');
  });
  updateThemeSettingsSummary();
}

export function resetSettingsDrawer() {
  resetSettingsSections();
}

export function toggleSettingsSection(section) {
  if (!section) return;
  const expanded = !section.classList.contains('is-open');
  setSettingsSectionExpanded(section, expanded);
  if (expanded && isMobileSheetLayout()) {
    const toolbar = document.getElementById('toolbar');
    if (toolbar && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        section.scrollIntoView({ block: 'nearest' });
      });
    }
  }
}

export function toggleMobileSheet() {
  if (typeof document === 'undefined') return;
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;
  const isExpanded = toolbar.classList.contains('expanded');
  if (isExpanded) {
    collapseMobileSheet();
  } else {
    expandMobileSheet();
  }
}

export function expandMobileSheet() {
  if (typeof document === 'undefined') return;
  const toolbar = document.getElementById('toolbar');
  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const mobileFab = document.getElementById('mobileFab');
  if (toolbar) toolbar.classList.add('expanded');
  if (sheetBackdrop) sheetBackdrop.classList.add('show');
  if (toolbar) setContainerFocusable(toolbar, true);
  if (isMobileSheetLayout()) {
    document.body.classList.add('mobile-sheet-active');
    if (toolbar) {
      toolbar.scrollTop = 0;
    }
  }
  if (mobileFab) {
    mobileFab.classList.add('active');
    mobileFab.setAttribute('aria-label', 'Close Reading Settings');
    mobileFab.setAttribute('aria-expanded', 'true');
  }
}

export function collapseMobileSheet() {
  if (typeof document === 'undefined') return;
  const toolbar = document.getElementById('toolbar');
  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const mobileFab = document.getElementById('mobileFab');
  if (toolbar) toolbar.classList.remove('expanded');
  if (sheetBackdrop) sheetBackdrop.classList.remove('show');
  if (toolbar) setContainerFocusable(toolbar, false);
  document.body.classList.remove('mobile-sheet-active');
  if (toolbar) {
    toolbar.scrollTop = 0;
  }
  if (mobileFab) {
    mobileFab.classList.remove('active');
    mobileFab.setAttribute('aria-label', 'Open Reading Settings');
    mobileFab.setAttribute('aria-expanded', 'false');
  }
  resetSettingsSections();
}

export function setFontFamily(fontId) {
  setFont(fontId);
}

export function setFontSize(size) {
  if (typeof size === 'number') {
    if (typeof document !== 'undefined') {
      const readerContent = document.getElementById('readerContent');
      if (readerContent) {
        readerContent.style.fontSize = `${size}px`;
      }
    }
  } else if (typeof size === 'string') {
    setSize(size);
  }
}

export function setLineSpacing(val) {
  const clamped = clampNumber(val, 1.85, 1.4, 2.6);
  if (typeof document !== 'undefined') {
    const readerContent = document.getElementById('readerContent');
    if (readerContent) readerContent.style.lineHeight = clamped;
    const input = document.getElementById('lineHeightInput');
    if (input) input.value = clamped;
  }
  return clamped;
}

export function setWordSpacing(val) {
  const clamped = clampNumber(val, 0, -0.1, 0.5);
  if (typeof document !== 'undefined') {
    const readerContent = document.getElementById('readerContent');
    if (readerContent) readerContent.style.wordSpacing = `${clamped}em`;
  }
  return clamped;
}

export function setLetterSpacing(val) {
  const clamped = clampNumber(val, -0.015, -0.03, 0.15);
  if (typeof document !== 'undefined') {
    const readerContent = document.getElementById('readerContent');
    if (readerContent) readerContent.style.letterSpacing = `${clamped}em`;
    const input = document.getElementById('letterSpacingInput');
    if (input) input.value = clamped;
  }
  return clamped;
}

export function setMargin(valPx) {
  const clamped = clampNumber(valPx, 24, 12, 80);
  if (typeof document !== 'undefined') {
    const readerContent = document.getElementById('readerContent');
    if (readerContent) {
      readerContent.style.paddingLeft = `${clamped}px`;
      readerContent.style.paddingRight = `${clamped}px`;
    }
    const input = document.getElementById('marginInput');
    if (input) input.value = clamped;
  }
  return clamped;
}

export function getPresetInventory() {
  return {
    lightPresets: [...lightPresets],
    darkPresets: [...darkPresets]
  };
}

export function getCurrentSettings() {
  const list = getPresets();
  const currentPreset = list[currentPresetIndex] || list[0];
  return {
    mode: currentMode,
    presetIndex: currentPresetIndex,
    preset: currentPreset,
    font: currentPreset ? currentPreset.font : 'sans',
    theme: currentPreset ? currentPreset.theme : 'claude',
    textColor: currentTextColor
  };
}

export function initSettings(options = {}) {
  const mode = options.mode || currentMode;
  const presetIndex = options.presetIndex !== undefined ? options.presetIndex : currentPresetIndex;
  setMode(mode, { presetIndex, resetTimer: options.resetTimer !== false });
  resetSettingsSections();
}


// ui.js - Cached DOM elements, modals, toasts, drawer accordion, mobile bottom sheet, and UI transitions

import {
  clampNumber,
  setContainerFocusable,
  setupFocusTrap,
  isMobileSheetLayout,
  announceLive,
  showStatus as showStatusUtil,
  clearStatus as clearStatusUtil,
  showLoader as showLoaderUtil,
  hideLoader as hideLoaderUtil,
  showGestureHint as showGestureHintUtil,
  hasSelectedText,
  isBlockedGestureTarget,
  isInteractiveShortcutTarget
} from "./utils.js";

// Cached DOM element reference map
export const els = {};

export function initUIElements() {
  if (typeof document === "undefined") return;

  const elementMap = {
    inputView: "inputView",
    readerView: "readerView",
    readerContent: "readerContent",
    pasteArea: "pasteArea",
    readBtn: "readBtn",
    fileInput: "fileInput",
    clearBtn: "clearBtn",
    loader: "loader",
    toolbar: "toolbar",
    backBtn: "backBtn",
    wordCount: "wordCount",
    focusRestore: "focusRestore",
    presetTrack: "presetTrack",
    presetDots: "presetDots",
    presetWindow: "presetWindow",
    modeLight: "modeLight",
    modeDark: "modeDark",
    focusBtn: "focusBtn",
    fullscreenBtn: "fullscreenBtn",
    autoScrollBtn: "autoScrollBtn",
    ttsBtn: "ttsBtn",
    ttsStopBtn: "ttsStopBtn",
    audioPlayerBar: "audioPlayerBar",
    audioPlayPauseBtn: "audioPlayPauseBtn",
    audioStopBtn: "audioStopBtn",
    audioStatusText: "audioStatusText",
    audioSpeedBtn: "audioSpeedBtn",
    downloadBtn: "downloadBtn",
    editBtn: "editBtn",
    gestureHint: "gestureHint",
    gestureHintText: "gestureHintText",
    arrowLeft: "arrowLeft",
    arrowRight: "arrowRight",
    progressBar: "progressBar",
    statusMessage: "statusMessage",
    readerStatusMessage: "readerStatusMessage",
    tocDialog: "tocDialog",
    closeTocBtn: "closeTocBtn",
    tocBody: "tocBody",
    tocBtn: "tocBtn",
    rulerBtn: "rulerBtn",
    readingRuler: "readingRuler",
    settingsDrawer: "settingsDrawer",
    themeSettingsSummary: "themeSettingsSummary",
    voiceSelect: "voiceSelect",
    voiceRateInput: "voiceRateInput",
    voiceRateVal: "voiceRateVal",
    scrollSpeedInput: "scrollSpeedInput",
    scrollSpeedVal: "scrollSpeedVal",
    lineHeightInput: "lineHeightInput",
    letterSpacingInput: "letterSpacingInput",
    marginInput: "marginInput",
    smartHeadingsInput: "smartHeadingsInput",
    mobileFab: "mobileFab",
    sheetBackdrop: "sheetBackdrop",
    bottomSheetHandle: "bottomSheetHandle",
    editingBanner: "editingBanner",
    saveEditBannerBtn: "saveEditBannerBtn"
  };

  Object.entries(elementMap).forEach(([key, id]) => {
    els[key] = document.getElementById(id);
  });

  els.loaderText = document.querySelector(".loader-text");
  els.settingsSections = Array.from(document.querySelectorAll("[data-settings-section]"));
  els.settingsSectionToggles = Array.from(document.querySelectorAll(".settings-section-toggle"));
  els.pasteText = els.pasteArea; // Compatibility alias
  return els;
}

// Automatically populate els if document is ready
if (typeof document !== "undefined") {
  initUIElements();
}

// ===== Status & Loader UI Functions =====

export function showStatus(message, type = "info") {
  showStatusUtil(message, type);
}

export function showToast(message, type = "info", duration = 3000) {
  showStatusUtil(message, type);
  if (duration > 0 && typeof window !== "undefined") {
    window.setTimeout(() => {
      clearStatusUtil();
    }, duration);
  }
}

export function clearStatus() {
  clearStatusUtil();
}

export function showLoader(message = "Loading text...") {
  showLoaderUtil(message);
}

export function hideLoader() {
  hideLoaderUtil();
}

export { announceLive };

export function showGestureHint(text) {
  showGestureHintUtil(text);
}

// ===== View Transitions & Paste Area =====

export function showReaderView() {
  if (els.inputView) els.inputView.classList.add("hidden");
  if (els.readerView) els.readerView.classList.remove("hidden");
}

export function showInputView() {
  if (els.readerView) els.readerView.classList.add("hidden");
  if (els.inputView) els.inputView.classList.remove("hidden");
}

export function updateProgressBar(percent) {
  if (els.progressBar) {
    els.progressBar.style.width = `${percent}%`;
  }
}

export function getPasteText() {
  return els.pasteArea ? els.pasteArea.value : (els.pasteText ? els.pasteText.value : "");
}

export function setPasteText(text) {
  if (els.pasteArea) els.pasteArea.value = text;
  if (els.pasteText && els.pasteText !== els.pasteArea) els.pasteText.value = text;
}

export function toggleClearBtn() {
  if (!els.clearBtn) return;
  const hasText = Boolean((els.pasteArea && els.pasteArea.value) || (els.pasteText && els.pasteText.value));
  els.clearBtn.classList.toggle("hidden", !hasText);
}

// ===== Mobile Sheet & Drawer Accordion =====

export function setSettingsSectionExpanded(section, expanded) {
  if (!section) return;
  const isExpanded = Boolean(expanded);
  const toggle = section.querySelector(".settings-section-toggle");
  const panelId = toggle ? toggle.getAttribute("aria-controls") : "";
  const panel = panelId ? document.getElementById(panelId) : section.querySelector(".settings-section-panel");

  section.classList.toggle("is-open", isExpanded);
  if (toggle) toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  if (panel) {
    panel.hidden = !isExpanded;
    panel.setAttribute("aria-hidden", isExpanded ? "false" : "true");
  }
}

export function resetSettingsSections() {
  if (els.settingsDrawer) els.settingsDrawer.classList.add("active");
  const sections = (els.settingsSections && els.settingsSections.length)
    ? els.settingsSections
    : (typeof document !== "undefined" ? Array.from(document.querySelectorAll("[data-settings-section]")) : []);

  sections.forEach(section => {
    setSettingsSectionExpanded(section, section.getAttribute("data-settings-section") === "theme");
  });
}

export function resetSettingsDrawer() {
  resetSettingsSections();
}

export function toggleSettingsSection(section) {
  if (!section) return;
  const expanded = !section.classList.contains("is-open");
  setSettingsSectionExpanded(section, expanded);
  resetToolbarTimer();
  if (expanded && isMobileSheetLayout() && els.toolbar) {
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        section.scrollIntoView({ block: "nearest" });
      });
    }
  }
}

export function updateThemeSettingsSummary(text) {
  if (els.themeSettingsSummary && text !== undefined) {
    els.themeSettingsSummary.textContent = text;
  }
}

export function toggleMobileSheet() {
  if (!els.toolbar) return;
  const isExpanded = els.toolbar.classList.contains("expanded");
  if (isExpanded) {
    collapseMobileSheet();
  } else {
    expandMobileSheet();
  }
}

export function toggleBottomSheet(sheetEl = els.toolbar, open) {
  if (open === true) {
    expandMobileSheet();
  } else if (open === false) {
    collapseMobileSheet();
  } else {
    toggleMobileSheet();
  }
}

export function expandMobileSheet() {
  if (els.toolbar) els.toolbar.classList.add("expanded");
  if (els.sheetBackdrop) els.sheetBackdrop.classList.add("show");
  if (els.toolbar) setContainerFocusable(els.toolbar, true);
  if (isMobileSheetLayout()) {
    if (typeof document !== "undefined") document.body.classList.add("mobile-sheet-active");
    if (els.toolbar) els.toolbar.scrollTop = 0;
  }
  if (els.mobileFab) {
    els.mobileFab.classList.add("active");
    els.mobileFab.setAttribute("aria-label", "Close Reading Settings");
    els.mobileFab.setAttribute("aria-expanded", "true");
  }
}

export function collapseMobileSheet() {
  if (els.toolbar) els.toolbar.classList.remove("expanded");
  if (els.sheetBackdrop) els.sheetBackdrop.classList.remove("show");
  if (els.toolbar) setContainerFocusable(els.toolbar, false);
  if (typeof document !== "undefined") document.body.classList.remove("mobile-sheet-active");
  if (els.toolbar) els.toolbar.scrollTop = 0;
  if (els.mobileFab) {
    els.mobileFab.classList.remove("active");
    els.mobileFab.setAttribute("aria-label", "Open Reading Settings");
    els.mobileFab.setAttribute("aria-expanded", "false");
  }
  resetSettingsSections();
}

export { isMobileSheetLayout };

// ===== Toolbar Auto-Hide Inactivity Timer & Focus Trap =====

let toolbarTimer = null;
let isToolbarSuppressed = false;

export function setToolbarSuppressed(suppressed) {
  isToolbarSuppressed = Boolean(suppressed);
  if (isToolbarSuppressed) clearToolbarTimer();
}

export function clearToolbarTimer() {
  if (typeof window !== "undefined" && toolbarTimer) {
    window.clearTimeout(toolbarTimer);
    toolbarTimer = null;
  }
}

export function startToolbarAutoHideTimer(toolbarEl = els.toolbar, duration = 3500) {
  if (isToolbarSuppressed) return;
  const targetToolbar = toolbarEl || els.toolbar;
  if (!targetToolbar) return;

  if (isMobileSheetLayout()) {
    clearToolbarTimer();
    setContainerFocusable(targetToolbar, targetToolbar.classList.contains("expanded"));
    return;
  }

  targetToolbar.classList.remove("hidden-bar");
  setContainerFocusable(targetToolbar, true);
  clearToolbarTimer();

  if (typeof window !== "undefined") {
    toolbarTimer = window.setTimeout(() => {
      if (isToolbarSuppressed) return;
      if (typeof document !== "undefined" && targetToolbar && typeof targetToolbar.contains === "function" && document.activeElement && targetToolbar.contains(document.activeElement)) return;
      if (targetToolbar && typeof targetToolbar.matches === "function" && (targetToolbar.matches(":hover") || targetToolbar.matches(":focus-within"))) return;
      targetToolbar.classList.add("hidden-bar");
      setContainerFocusable(targetToolbar, false);
    }, duration);
  }
}

export function resetToolbarAutoHideTimer() {
  startToolbarAutoHideTimer(els.toolbar, 3500);
}

export function resetToolbarTimer(options = {}) {
  startToolbarAutoHideTimer(els.toolbar, 3500);
}

export { setContainerFocusable };

// ===== Modal Dialog & Table of Contents =====

export function openDialog(dialogEl = els.tocDialog) {
  const targetDialog = dialogEl || els.tocDialog;
  if (!targetDialog) return false;
  if (targetDialog.open) return true;

  if (typeof targetDialog.showModal === "function") {
    try {
      targetDialog.showModal();
      return true;
    } catch (err) {
      // Fall through to non-modal fallback for double-click races or partial dialog support.
    }
  }

  targetDialog.setAttribute("open", "");
  return true;
}

export function openTocDialog() {
  return openDialog(els.tocDialog);
}

export function closeDialog(dialogEl = els.tocDialog) {
  const targetDialog = dialogEl || els.tocDialog;
  if (!targetDialog || !targetDialog.open) return;

  if (typeof targetDialog.close === "function") {
    try {
      targetDialog.close();
      return;
    } catch (err) {
      // Fall back to attribute removal below.
    }
  }

  targetDialog.removeAttribute("open");
  targetDialog.dispatchEvent(new Event("close"));
}

export function closeTocDialog() {
  closeDialog(els.tocDialog);
}

export { setupFocusTrap };

// ===== Fullscreen API Management =====

export function getFullscreenElement() {
  if (typeof document === "undefined") return null;
  return document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null;
}

export function handleFullscreenPromise(result) {
  if (result && typeof result.catch === "function") {
    result.catch(err => {
      console.warn("Fullscreen request was rejected:", err);
      showStatus("Fullscreen request was denied.", "info");
    });
  }
}

export function updateFullscreenButton() {
  if (els.fullscreenBtn) {
    const isFullscreen = Boolean(getFullscreenElement());
    els.fullscreenBtn.classList.toggle("active", isFullscreen);
    els.fullscreenBtn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
    els.fullscreenBtn.setAttribute("aria-label", isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen");
    els.fullscreenBtn.setAttribute("title", isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen");
  }
}

export function toggleFullscreen() {
  if (typeof document === "undefined") return;
  try {
    if (!getFullscreenElement()) {
      const requestFullscreen = document.documentElement.requestFullscreen ||
        document.documentElement.webkitRequestFullscreen ||
        document.documentElement.msRequestFullscreen;
      if (!requestFullscreen) {
        showStatus("Fullscreen mode is not supported on this device.", "error");
        return;
      }
      handleFullscreenPromise(requestFullscreen.call(document.documentElement));
    } else {
      const exitFullscreen = document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.msExitFullscreen;
      if (!exitFullscreen) {
        showStatus("Fullscreen exit is not supported on this device.", "error");
        return;
      }
      handleFullscreenPromise(exitFullscreen.call(document));
    }
  } catch (err) {
    showStatus("Fullscreen mode not permitted on this device.", "error");
  }
}

// ===== In-Context Inline Content Editor Banner =====

export function updateEditingLayoutOffset() {
  if (!els.editingBanner || typeof document === "undefined" || !document.body.classList.contains("editing-mode-active")) return;
  const height = Math.ceil(els.editingBanner.getBoundingClientRect().height || 0);
  if (height > 0) {
    document.documentElement.style.setProperty("--editing-banner-height", `${height}px`);
  }
}

export function setEditingLayoutActive(active) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("editing-mode-active", Boolean(active));
  if (active) {
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(updateEditingLayoutOffset);
    }
    return;
  }
  document.documentElement.style.removeProperty("--editing-banner-height");
}

export function setEditingBannerVisible(visible) {
  if (els.editingBanner) {
    els.editingBanner.classList.toggle("show", Boolean(visible));
  }
  setEditingLayoutActive(visible);
}

// ===== Gesture Predicates =====

export function canStartPresetGesture(target, isEditing = false) {
  return !isEditing && !hasSelectedText() && !isBlockedGestureTarget(target);
}

export function canUseGlobalPresetShortcut(event, isEditing = false) {
  if (isEditing || !els.tocDialog || els.tocDialog.open) return false;
  if (!event || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (els.presetWindow && event.target === els.presetWindow) return false;
  return !isInteractiveShortcutTarget(event.target);
}

// ===== Service Worker Registration =====

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .catch(err => {
        console.warn("Service worker registration failed.", err);
      });
  };

  if (typeof document !== "undefined" && document.readyState === "complete") {
    register();
  } else if (typeof window !== "undefined") {
    window.addEventListener("load", register, { once: true });
  }
}

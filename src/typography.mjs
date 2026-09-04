const SIZE_SCALE = { small: 0.86, medium: 1, large: 1.12, xl: 1.26 };

function activeSize(els) {
  return ['small', 'medium', 'large', 'xl'].find(size => els.readerContent?.classList.contains(`fs-${size}`)) || 'medium';
}

function profileNumber(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function importantStyle(element, name, value) {
  if (!element?.style) return;
  element.style.setProperty(name, value, 'important');
}

function getElements(api) {
  return [api.els?.readerContent, api.els?.readerEditor].filter(Boolean);
}

function syncManualTypography(api) {
  const size = activeSize(api.els);
  const baseSize = profileNumber('--reading-size', 18.4);
  const lineHeightInput = Number(api.els.lineHeightInput?.value);
  const letterSpacingInput = Number(api.els.letterSpacingInput?.value);
  const fontWeight = profileNumber('--reading-weight', 460);
  const lineHeight = Number.isFinite(lineHeightInput) ? lineHeightInput : profileNumber('--reading-leading', 1.82);
  const letterSpacing = Number.isFinite(letterSpacingInput) ? letterSpacingInput : profileNumber('--reading-letter', -0.004);
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--reading-font').trim() || 'var(--body-font, system-ui)';

  getElements(api).forEach(element => {
    importantStyle(element, 'font-size', `${(baseSize * (SIZE_SCALE[size] || 1)).toFixed(2)}px`);
    importantStyle(element, 'font-weight', String(fontWeight));
    importantStyle(element, 'line-height', String(lineHeight));
    importantStyle(element, 'letter-spacing', `${letterSpacing}em`);
    importantStyle(element, 'font-family', fontFamily);
  });
}

function syncPresetControls(api) {
  const lead = profileNumber('--reading-leading', 1.82);
  const letter = profileNumber('--reading-letter', -0.004);
  const line = api.els.lineHeightInput;
  const spacing = api.els.letterSpacingInput;
  if (line && document.activeElement !== line) line.value = Math.max(1.4, Math.min(2.6, lead));
  if (spacing && document.activeElement !== spacing) spacing.value = Math.max(-0.03, Math.min(0.15, letter));
  syncManualTypography(api);
}

export function installTypographyComposition(api) {
  if (!api?.els?.readerContent || api.context?.runtime?.typographyCompositionInstalled) return;
  api.context.runtime.typographyCompositionInstalled = true;

  const settings = api.els.settingsDrawer || document;
  const onControl = event => {
    if (event.target?.matches?.('[data-size], #lineHeightInput, #letterSpacingInput, #marginInput')) {
      requestAnimationFrame(() => syncManualTypography(api));
    }
  };
  settings.addEventListener('click', onControl);
  settings.addEventListener('input', onControl);
  settings.addEventListener('change', onControl);

  const track = api.els.presetTrack;
  if (track) {
    const observer = new MutationObserver(() => requestAnimationFrame(() => syncPresetControls(api)));
    observer.observe(track, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
  }

  syncPresetControls(api);
}

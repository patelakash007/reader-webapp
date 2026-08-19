(function () {
  'use strict';

  let multiDocumentState = false;

  function syncSessionSettingsMarker() {
    const section = document.querySelector('.session-mobile');
    if (!section) return;
    const count = section.querySelectorAll('[data-session-doc-id]').length;
    const isMulti = count >= 2;
    if (isMulti) {
      section.setAttribute('data-settings-section', 'session');
      if (!multiDocumentState) {
        const toggle = section.querySelector('.settings-section-toggle');
        const panel = section.querySelector('.settings-section-panel');
        section.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
        if (panel) panel.hidden = true;
      }
    } else {
      section.removeAttribute('data-settings-section');
    }
    multiDocumentState = isMulti;
  }

  function cancelSpeechForNewDocument() {
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (_) {}
  }

  syncSessionSettingsMarker();
  const observer = new MutationObserver(syncSessionSettingsMarker);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-session-doc-id', 'data-settings-section']
  });

  window.addEventListener('change', event => {
    if (event.target?.id === 'fileInput') cancelSpeechForNewDocument();
  }, true);
  window.addEventListener('click', event => {
    if (event.target?.id === 'readBtn') cancelSpeechForNewDocument();
  }, true);
})();

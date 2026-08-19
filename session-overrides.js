(function () {
  'use strict';

  function syncSessionSettingsMarker() {
    const section = document.querySelector('.session-mobile');
    if (!section) return;
    const count = section.querySelectorAll('[data-session-doc-id]').length;
    if (count >= 2) section.setAttribute('data-settings-section', 'session');
    else section.removeAttribute('data-settings-section');
  }

  function cancelSpeechForNewDocument() {
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (_) {}
  }

  // With one document, keep the historical five-section mobile state machine
  // unchanged. Once the queue contains multiple documents, the desk becomes an
  // explicit, keyboard-navigable settings section of its own.
  syncSessionSettingsMarker();
  const observer = new MutationObserver(syncSessionSettingsMarker);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-session-doc-id', 'data-settings-section']
  });

  // The core reader handles file changes at document-capture phase. Cancel
  // speech one phase earlier so a newly opened document can never inherit an
  // old utterance or callback.
  window.addEventListener('change', event => {
    if (event.target?.id === 'fileInput') cancelSpeechForNewDocument();
  }, true);
  window.addEventListener('click', event => {
    if (event.target?.id === 'readBtn') cancelSpeechForNewDocument();
  }, true);
})();

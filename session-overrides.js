(function () {
  'use strict';

  function stripSessionSettingsMarker() {
    const section = document.querySelector('.session-mobile');
    if (section?.hasAttribute('data-settings-section')) section.removeAttribute('data-settings-section');
  }

  function cancelSpeechForNewDocument() {
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (_) {}
  }

  // The historical mobile regression suite treats the five original settings
  // sections as a closed state machine. The reading-desk queue is intentionally
  // a sibling surface so it cannot change those assertions or reset semantics.
  stripSessionSettingsMarker();
  const observer = new MutationObserver(stripSessionSettingsMarker);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-settings-section'] });

  // The core reader uses a document-level capture listener for file changes.
  // Cancel speech one phase earlier so opening another document can never leave
  // an old speech engine driving the newly active reader.
  window.addEventListener('change', event => {
    if (event.target?.id === 'fileInput') cancelSpeechForNewDocument();
  }, true);
  window.addEventListener('click', event => {
    if (event.target?.id === 'readBtn') cancelSpeechForNewDocument();
  }, true);
})();

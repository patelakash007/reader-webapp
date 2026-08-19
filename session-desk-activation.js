(function () {
  'use strict';

  const desktopList = () => document.getElementById('sessionDesktopList');
  let lastCount = desktopList()?.querySelectorAll('[data-session-doc-id]').length || 0;

  const observer = new MutationObserver(() => {
    const list = desktopList();
    if (!list) return;
    const buttons = list.querySelectorAll('[data-session-doc-id]');
    const count = buttons.length;
    if (count > lastCount) {
      const newest = buttons[count - 1];
      if (newest instanceof HTMLButtonElement && newest.getAttribute('aria-selected') !== 'true') newest.click();
    }
    lastCount = count;
  });

  const list = desktopList();
  if (list) observer.observe(list, { childList: true, subtree: true });
})();

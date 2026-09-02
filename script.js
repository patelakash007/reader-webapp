(function () {
  'use strict';

  import('./src/app.mjs')
    .then(({ init }) => init())
    .catch(error => {
      console.error('Reader application failed to initialize.', error);
      const status = document.getElementById('statusMessage');
      if (status) {
        status.textContent = 'Reader could not load. Please reload the page.';
        status.className = 'status-message show error';
      }
    });
})();

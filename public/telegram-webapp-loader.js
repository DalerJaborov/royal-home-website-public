/* Load the Telegram SDK only inside a Mini App. Regular visitors do not
 * need the external request, and the loader itself is served by our CSP. */
(function () {
  function initialize() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;
    tg.ready();
    tg.expand();
    try {
      if (tg.setHeaderColor) tg.setHeaderColor('#1a4d3a');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#1a4d3a');
    } catch (_) {
      // Older Telegram clients do not implement the color methods.
    }
  }

  if (window.Telegram && window.Telegram.WebApp) {
    initialize();
    return;
  }
  var params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has('tgWebAppData') && !params.has('tgWebAppVersion')) return;
  var sdk = document.createElement('script');
  sdk.src = 'https://telegram.org/js/telegram-web-app.js';
  sdk.async = true;
  sdk.onload = initialize;
  document.head.appendChild(sdk);
})();

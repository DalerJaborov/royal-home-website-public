// PWA-сплэш установленного приложения. Вынесен из инлайна в index.html:
// CSP сайта — script-src 'self' без хэшей/nonce, и инлайновый скрипт молча
// блокировался браузером (сплэш не показывался и viewport не блокировал зум).
// Отдельный файл покрывается 'self' — тот же паттерн, что metrika-loader.js.
(function () {
  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (!isStandalone) return;

  // Installed app should not pinch-zoom like a web page (that "it's just a
  // website" giveaway). The regular browser keeps zoom for accessibility;
  // only the standalone app locks it.
  var vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');

  var splash = document.getElementById('pwa-splash');
  // Only fetched when actually launched as an installed app — regular
  // browser visits never trigger this request.
  // Логотип с прозрачным фоном — на светлом сплэше без белого квадрата.
  splash.querySelector('img').src = '/images/logo-royal-2026.webp';
  splash.style.display = 'flex';
  var shownAt = Date.now();

  function hideSplash() {
    var elapsed = Date.now() - shownAt;
    var remaining = Math.max(0, 500 - elapsed);
    setTimeout(function () {
      splash.classList.add('pwa-splash-hide');
      setTimeout(function () { splash.remove(); }, 320);
    }, remaining);
  }

  if (document.readyState === 'complete') hideSplash();
  else window.addEventListener('load', hideSplash);
})();

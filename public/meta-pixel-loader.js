/* Meta Pixel (Facebook) loader — docs/meta-pixel.md.
 * Отдельный файл, а не inline: CSP (script-src 'self') блокирует инлайны — тот же
 * паттерн, что у metrika-loader.js. Сервер добавляет этот <script> и
 * <meta name="meta-pixel-id"> в HTML ТОЛЬКО когда задан META_PIXEL_ID
 * (api/lib/meta-pixel-html.ts); без переменной файл не запрашивается вовсе.
 *
 * Сам fbevents.js НЕ грузится при загрузке страницы: приложение зовёт
 * window.rhMetaPixel.start() после того, как узнало, что посетитель не админ
 * (src/lib/metaPixel.ts). Админ и /admin не отправляют в Meta ни одного запроса.
 * До start() fbq — очередь-заглушка, так что вызовы fbq('track', …) не теряются.
 * PageView здесь НЕ шлётся: его отправляет роутер SPA на каждой смене маршрута,
 * включая первый (иначе первая страница считалась бы дважды). */
(function (w, d) {
  var meta = d.querySelector('meta[name="meta-pixel-id"]');
  var pixelId = meta && meta.getAttribute('content');
  if (!pixelId || !/^\d{8,20}$/.test(pixelId) || w.rhMetaPixel) return;

  // Стандартная заглушка fbq из документации Meta: складывает вызовы в очередь.
  if (!w.fbq) {
    var n = (w.fbq = function () {
      if (n.callMethod) n.callMethod.apply(n, arguments);
      else n.queue.push(arguments);
    });
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
  }

  var COOKIE_TTL_SECONDS = 90 * 24 * 60 * 60;

  function readCookie(name) {
    var parts = d.cookie ? d.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(name + '=') === 0) return parts[i].slice(name.length + 1);
    }
    return '';
  }

  /* Пиксель сам пишет куку _fbc из fbclid, но асинхронно, после загрузки
   * fbevents.js. Серверное событие, ушедшее раньше, осталось бы без fbc, поэтому
   * ставим её сразу в том же формате fb.1.<мс>.<fbclid>, если её ещё нет. */
  function captureFbc() {
    try {
      if (readCookie('_fbc')) return;
      var fbclid = new URLSearchParams(w.location.search).get('fbclid');
      if (!fbclid || !/^[A-Za-z0-9_-]{1,512}$/.test(fbclid)) return;
      d.cookie = '_fbc=fb.1.' + Date.now() + '.' + fbclid +
        '; max-age=' + COOKIE_TTL_SECONDS + '; path=/; SameSite=Lax' + (w.location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) { /* Куки заблокированы — измерение необязательно. */ }
  }

  var started = false;
  w.rhMetaPixel = {
    start: function () {
      if (started) return;
      started = true;
      captureFbc();
      // Автособытия (microdata/JSON-LD, клики по кнопкам) отключены: на карточке
      // объекта уже есть JSON-LD Product, и Meta добавила бы ViewContent с чужим
      // content_id рядом с нашим. События шлём только мы, с id из каталога.
      w.fbq('set', 'autoConfig', false, pixelId);
      w.fbq('init', pixelId);
      var script = d.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      d.head.appendChild(script);
    },
  };
})(window, document);

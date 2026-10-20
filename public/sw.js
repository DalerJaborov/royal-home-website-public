/* Public app shell and viewed photos; mutable translations always revalidate. */
const CACHE = 'royalhome-v4-i18n';
const PRECACHE = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/pwa-icon-192.png', '/pwa-icon-512.png', '/images/logo-royal-2026.webp'];

function forbidsStorage(response) {
  return /(?:^|,)\s*(?:no-store|private)\b/i.test(response.headers.get('cache-control') || '');
}
function cacheable(response) {
  return response.ok && (response.type === 'basic' || response.type === 'default') && !forbidsStorage(response);
}
function htmlResponse(response) {
  return /\btext\/html\b/i.test(response.headers.get('content-type') || '');
}
function remember(event, key, response) {
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE).then(cache => cache.put(key, copy)).catch(() => {}));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(PRECACHE.map(async url => {
    const response = await fetch(url, { cache: 'no-cache' });
    if (cacheable(response) && (!['/', '/index.html', '/offline.html'].includes(url) || htmlResponse(response))) await cache.put(url, response);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('royalhome-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const publicApiPhoto = /^\/api\/uploads\/.+\.(?:webp|jpe?g|png|avif|gif)$/i.test(url.pathname);
  // Protected interfaces and every API except public photo files bypass SW caches.
  if (((url.pathname === '/api' || url.pathname.startsWith('/api/')) && !publicApiPhoto) || /^\/(?:tg\/|en\/)?(?:admin|login|listing\/preview)(?:\/|$)/.test(url.pathname)) return;

  if (url.pathname.startsWith('/locales/')) {
    event.respondWith((async () => {
      let response;
      try { response = await fetch(request, { cache: 'no-cache' }); }
      catch (error) {
        const cached = await (await caches.open(CACHE)).match(request);
        if (cached) return cached;
        throw error;
      }
      if (forbidsStorage(response)) event.waitUntil(caches.open(CACHE).then(cache => cache.delete(request)).catch(() => {}));
      // Online errors are authoritative: never hide a removed/denied translation.
      if (response.status === 200 && cacheable(response) && /\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) {
        try {
          const value = await response.clone().json();
          if (value && typeof value === 'object') remember(event, request, response);
        } catch { /* Invalid JSON cannot replace a verified cached resource. */ }
      }
      return response;
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (cacheable(response) && htmlResponse(response)) {
          remember(event, request, response);
          remember(event, '/index.html', response);
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request) || await cache.match('/index.html') || await cache.match('/offline.html');
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (cacheable(response) && (!publicApiPhoto || /^image\//i.test(response.headers.get('content-type') || ''))) remember(event, request, response);
    return response;
  })());
});

import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import SiteApplication from './SiteApplication';
import { preloadLocaleDictionary } from './lib/localeDictionaries';
import { resolvePublicPath } from '@contracts/public-i18n';
import { prepareInitialCatalog } from './lib/initialCatalogPage';
import { prepareInitialVideo } from './lib/initialVideoPage';

// Раньше был HashRouter (ссылки вида /#/listing/37). Перешли на BrowserRouter
// ради серверного SEO и превью-ссылок (мессенджеры/краулеры видят только путь,
// НЕ фрагмент после #). Уже разосланные старые #/-ссылки мягко переводим на
// нормальный путь, чтобы они по-прежнему открывали нужную страницу.
if (window.location.hash.startsWith('#/')) {
  const target = window.location.hash.slice(1) + window.location.search;
  window.history.replaceState(null, '', target || '/');
}

// The production HTML adds versioned register-sw.js; development skips workers.

function renderApp() {
const root = document.getElementById('root')!;
const application = (
  <React.StrictMode>
    <BrowserRouter>
      <SiteApplication />
    </BrowserRouter>
  </React.StrictMode>
);
if (root.dataset.publicSsr === 'true') hydrateRoot(root, application, {
  onRecoverableError(error, info) {
    console.error('[public-hydration] recovery', error instanceof Error ? error.message : 'render_error', info.componentStack);
  },
});
else createRoot(root).render(application);
}

// Preserve the visible server HTML while a non-Russian dictionary arrives.
// Russian makes no dictionary request, and translations never call AI on visits.
void Promise.all([
  preloadLocaleDictionary(resolvePublicPath(window.location.pathname).locale),
  document.getElementById('root')?.dataset.publicSsr === 'true'
    ? prepareInitialCatalog(window.location.pathname) : Promise.resolve(),
  document.getElementById('root')?.dataset.publicSsr === 'true'
    ? prepareInitialVideo(window.location.pathname) : Promise.resolve(),
]).then(renderApp, renderApp);

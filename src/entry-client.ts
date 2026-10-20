import './index.css';
import { PUBLIC_CATALOG_INTERACTIVE_EVENT, PUBLIC_INTERACTIVE_EVENT, readHomeSearch } from './lib/homeSearch';
import { recordAcquisitionVisit } from './lib/acquisitionAttribution';

const root = document.getElementById('root');
let started = false;
let observer: PerformanceObserver | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;
function initialize() {
  if (started) return;
  started = true;
  observer?.disconnect();
  clearTimeout(deadline);
  document.removeEventListener('pointerdown', initialize, true);
  document.removeEventListener('keydown', initialize, true);
  void import('./main');
}
function initializeAfterPaint() {
  // On a complete server page, first paint can still use fallback fonts. Starting
  // the large framework imports then competes with the visible font downloads.
  // Keep the existing interaction/deadline escape paths. SPA fallbacks
  // still initialize immediately outside this SSR path.
  // Keep the existing home guard. Catalogue font competition was measured on
  // Russian pages; waiting here on the Tajik route delayed its lazy commit and
  // caused a later image LCP. Other catalogue locales retain first-paint startup.
  const waitForFonts = document.documentElement.lang === 'ru' || Boolean(root?.querySelector('#hero'));
  if (waitForFonts && document.fonts) {
    // FontFaceSet.ready resolves before the browser has necessarily painted
    // the final face. Yield a paint between frames before framework work;
    // pointer/key input and the existing deadline still start immediately.
    const afterFontPaint = () => requestAnimationFrame(() => requestAnimationFrame(initialize));
    void document.fonts.ready.then(afterFontPaint, afterFontPaint);
  } else initialize();
}
if (root?.dataset.publicSsr === 'true') {
  // Native links already work. Preserve JS-only first-screen actions if a
  // visitor acts while the framework is still downloading.
  let pendingMenu = false;
  let pendingCatalogButton: HTMLButtonElement | undefined;
  let pendingCatalogAction: string | undefined;
  const hasCatalog = Boolean(root.querySelector('[data-public-catalog]'));
  let shellReady = false;
  let catalogReady = !hasCatalog;
  const releaseEarlyActions = () => {
    if (shellReady && catalogReady) root.removeEventListener('click', earlyAction, true);
  };
  function earlyAction(event: MouseEvent) {
    const control = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
    if (!control) {
      if (catalogReady || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const category = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-public-catalog-category]');
      const destination = category?.getAttribute('href');
      if (!category?.closest('[data-public-catalog]') || !destination || !/^\/(?:listings|en\/listings|tg\/khonaho-dushanbe)(?:\?|$)/.test(destination)) return;
      // React can receive a link click while its lazy boundary is still being
      // replaced. Preserve the native filtered destination until that settles.
      event.preventDefault();
      event.stopImmediatePropagation();
      recordAcquisitionVisit(window.location.pathname, window.location.search, document.referrer);
      window.location.assign(destination);
      return;
    }
    if (!shellReady && control.dataset.publicAction === 'search') {
      const destination = control.dataset.publicSearchPath;
      if (!destination || !/^\/(?:listings|en\/listings|tg\/khonaho-dushanbe)$/.test(destination)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const query = readHomeSearch(control.closest('[data-public-search]'));
      recordAcquisitionVisit(window.location.pathname, window.location.search, document.referrer);
      window.location.assign(destination + (query ? `?${query}` : ''));
    } else if (!shellReady && control.dataset.publicAction === 'menu') {
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingMenu = true;
      initialize();
    } else if (!catalogReady && control.closest('[data-public-catalog]') && !control.closest('form')
      && /^[a-zA-Z:-]+$/.test(control.dataset.publicCatalogAction ?? '')) {
      // Only explicit local filter/sort actions, never property or lead controls.
      // A lazy hydration boundary may replace its server nodes without an error.
      // The stable action key preserves intent without selecting by label/index.
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingCatalogButton = control;
      pendingCatalogAction = control.dataset.publicCatalogAction;
      initialize();
    }
  }
  root.addEventListener('click', earlyAction, true);
  document.addEventListener(PUBLIC_INTERACTIVE_EVENT, () => {
    shellReady = true;
    if (pendingMenu) {
      pendingMenu = false;
      root.querySelector<HTMLButtonElement>('button[data-public-action="menu"]')?.click();
    }
    releaseEarlyActions();
  }, { once: true });
  if (hasCatalog) document.addEventListener(PUBLIC_CATALOG_INTERACTIVE_EVENT, () => {
    // The lazy route can commit after the surrounding shell's effect.
    // Replay only after the catalogue's own handlers are attached.
    catalogReady = true;
    const pending = pendingCatalogButton;
    const action = pendingCatalogAction;
    // A passive route effect can run while React is still completing the
    // surrounding hydration commit. Let that commit finish before dispatching.
    if (pending && action) requestAnimationFrame(() => {
      const target = pending.isConnected && root.contains(pending) ? pending
        : root.querySelector<HTMLButtonElement>(`[data-public-catalog] button[data-public-catalog-action="${action}"]`);
      target?.click();
    });
    pendingCatalogButton = undefined;
    pendingCatalogAction = undefined;
    releaseEarlyActions();
  }, { once: true });
  // SPA forms must never send personal data through a native GET while their
  // event handlers are loading. React's own submit handlers still receive it.
  root.addEventListener('submit', event => event.preventDefault(), true);
  // Start immediately on interaction, otherwise let the complete server UI
  // paint before downloading/evaluating React. Frames alone can precede paint
  // while fonts/styles are pending, so observe the actual first content paint.
  document.addEventListener('pointerdown', initialize, { capture: true, once: true });
  document.addEventListener('keydown', initialize, { capture: true, once: true });
  deadline = setTimeout(initialize, 4000);
  try {
    if (!PerformanceObserver.supportedEntryTypes.includes('paint')) throw Error('Paint observer unavailable');
    observer = new PerformanceObserver(list => {
      if (list.getEntries().some(entry => entry.name === 'first-contentful-paint')) initializeAfterPaint();
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch { requestAnimationFrame(() => requestAnimationFrame(initializeAfterPaint)); }
} else initialize();

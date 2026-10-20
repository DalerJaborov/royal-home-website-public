import { lazy } from 'react';
import type { Translations } from '@/data/translations';
import { resolvePublicPath } from '@contracts/public-i18n';

const load = () => import('@/pages/ListingsPage');
const DeferredCatalog = lazy(load);
let prepared: Awaited<ReturnType<typeof load>> | undefined;

/** Resolve the initial SSR boundary before provider effects can update it.
 * Other pages and subsequent SPA navigation retain ordinary route splitting. */
// eslint-disable-next-line react-refresh/only-export-components -- Bootstrap must prepare the same module used by this boundary before hydrateRoot.
export async function prepareInitialCatalog(path: string): Promise<void> {
  if (resolvePublicPath(path).basePath === '/listings') prepared = await load();
}

export function InitialCatalogPage(props: { t: Translations }) {
  const Page = prepared?.default ?? DeferredCatalog;
  return <Page {...props} />;
}

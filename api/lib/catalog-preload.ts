import { compareCatalogOrder } from '@contracts/catalog-order';
import { toCatalogImageUrl } from '@contracts/image-urls';
import { resolvePublicPath } from '@contracts/public-i18n';

/** Use rows already queried for the HTML, never issue a second query for a preload. */
export function catalogCoverPreload(requestPath: string, rows: readonly { id: number; sold?: boolean; imageUrls?: readonly string[] | null }[]): string | undefined {
  const request = new URL(requestPath, 'https://royalhome.tj');
  if (resolvePublicPath(request.pathname).basePath !== '/listings' || request.search) return;
  const first = rows.reduce<(typeof rows)[number] | undefined>((current, row) => !current || compareCatalogOrder(row, current) < 0 ? row : current, undefined);
  const image = first?.imageUrls?.[0];
  const preload = image ? toCatalogImageUrl(image) : undefined;
  // A placeholder/fully sold inventory has no active cover to prioritize.
  // Known absolute CRM originals become same-origin card variants too.
  if (!first || first.sold || !preload || !preload.startsWith('/') || preload.startsWith('//')) return;
  return preload;
}

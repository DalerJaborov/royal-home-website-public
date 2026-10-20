import { CATALOG_BOOTSTRAP_ID, LISTING_BOOTSTRAP_ID, parseCatalogBootstrap, parseListingBootstrap, type CatalogBootstrap, type ListingBootstrap } from '@contracts/catalog-bootstrap';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** Consumed once before React replaces #root; cached/error HTML falls back to API. */
export function consumeCatalogBootstrap(document: Pick<Document, 'getElementById'>, pathname: string, now = Date.now()): CatalogBootstrap | undefined {
  const element = document.getElementById(CATALOG_BOOTSTRAP_ID);
  if (!element) return;
  const source = element.tagName === 'SCRIPT' && element.getAttribute('type') === 'application/json' ? element.textContent ?? '' : '';
  element.remove();
  return parseCatalogBootstrap(source, pathname, now);
}

export function seedCatalogQuery(client: QueryClient, publicQueryKey: QueryKey, bootstrap: CatalogBootstrap): boolean {
  if (client.getQueryData(publicQueryKey) !== undefined) return false;
  client.setQueryData(publicQueryKey, bootstrap.listings, { updatedAt: bootstrap.generatedAt });
  return true;
}

export function consumeListingBootstrap(document: Pick<Document, 'getElementById'>, pathname: string, now = Date.now()): ListingBootstrap | undefined {
  const element = document.getElementById(LISTING_BOOTSTRAP_ID);
  if (!element) return;
  const source = element.tagName === 'SCRIPT' && element.getAttribute('type') === 'application/json' ? element.textContent ?? '' : '';
  element.remove();
  return parseListingBootstrap(source, pathname, now);
}
export function seedListingQuery(client: QueryClient, publicQueryKey: QueryKey, bootstrap: ListingBootstrap): boolean {
  if (client.getQueryData(publicQueryKey) !== undefined) return false;
  client.setQueryData(publicQueryKey, bootstrap.listing, { updatedAt: bootstrap.generatedAt });
  return true;
}

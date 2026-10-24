import { resolvePublicPath } from './public-i18n';
import { PUBLIC_DETAIL_KEYS, type PublicListing } from './public-listing';
import { isInventoryPage } from './district-catalog';

export const CATALOG_BOOTSTRAP_ID = 'royalhome-public-catalog';
export const LISTING_BOOTSTRAP_ID = 'royalhome-public-listing';
export const CATALOG_BOOTSTRAP_MAX_BYTES = 512 * 1024;
const MAX_ROWS = 1000;
const MAX_AGE_MS = 30_000;
const CLOCK_SKEW_MS = 5_000;
const NULLABLE_TEXT_KEYS = [
  'floor', 'stage', 'repair', 'description', 'seoDesc', 'instagramUrl', 'videoUrl',
  'metaTitle', 'metaDescription', 'h1', 'descriptionTj', 'metaTitleTj',
  'metaDescriptionTj', 'h1Tj', 'date',
] as const;
const ROW_KEYS = [
  'id', 'title', 'location', 'price', 'rooms', 'area', 'totalFloors', 'type',
  'urgent', 'sold', 'published', 'category', 'images', 'imageUrls', 'details',
  'externalId', 'crmShortId', 'mapAddress', 'lat', 'lng', 'createdAt', 'updatedAt',
  ...NULLABLE_TEXT_KEYS,
];
type WireListing = Omit<PublicListing, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string };
export interface CatalogBootstrap {
  generatedAt: number;
  listings: PublicListing[];
}
export interface ListingBootstrap { generatedAt: number; listing: PublicListing }
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value: unknown, limit = 65536): value is string => typeof value === 'string' && value.length <= limit;
const integer = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isoDate = (value: unknown): value is string => {
  if (!text(value, 32)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};

function isWireListing(value: unknown): value is WireListing {
  if (!isObject(value) || !exactKeys(value, ROW_KEYS)) return false;
  if (!integer(value.id, 1) || !text(value.title) || !text(value.location) || !nonnegative(value.price) || !nonnegative(value.area) ||
    !integer(value.rooms) || !integer(value.images) || !(value.totalFloors === null || integer(value.totalFloors))) return false;
  if (!(value.type === null || ['Новостройки', 'Вторичка'].includes(String(value.type))) || !['APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND'].includes(String(value.category)) ||
    typeof value.urgent !== 'boolean' || typeof value.sold !== 'boolean' || value.published !== true) return false;
  if (NULLABLE_TEXT_KEYS.some(key => value[key] !== null && !text(value[key]))) return false;
  if (['externalId', 'mapAddress', 'lat', 'lng'].some(key => value[key] !== null)) return false;
  if (!(value.crmShortId === null || integer(value.crmShortId, 1))) return false;
  if (!isoDate(value.createdAt) || !isoDate(value.updatedAt)) return false;
  if (value.imageUrls !== null && (!Array.isArray(value.imageUrls) || value.imageUrls.length > 100 ||
    value.imageUrls.some(url => !text(url, 2048) || !(/^(?:\/(?!\/)|https?:\/\/)/i.test(url))))) return false;
  if (value.details !== null && (!isObject(value.details) || Object.entries(value.details).some(([key, val]) =>
    !PUBLIC_DETAIL_KEYS.some(allowed => allowed === key) || !text(val, 8192)))) return false;
  return true;
}

/** Validate the entire snapshot, never quietly drop bad rows or seed partial data. */
export function parseCatalogBootstrap(source: string, requestPath: string, now = Date.now()): CatalogBootstrap | undefined {
  const basePath = resolvePublicPath(requestPath).basePath;
  if (!(basePath === '/' || isInventoryPage(basePath)) || !source || source.length > CATALOG_BOOTSTRAP_MAX_BYTES ||
    new TextEncoder().encode(source).byteLength > CATALOG_BOOTSTRAP_MAX_BYTES) return;
  try {
    const value: unknown = JSON.parse(source);
    if (!isObject(value) || !exactKeys(value, ['version', 'basePath', 'complete', 'generatedAt', 'total', 'listings']) ||
      value.version !== 1 || value.basePath !== '/listings' || value.complete !== true || !integer(value.generatedAt) ||
      value.generatedAt > now + CLOCK_SKEW_MS || now - value.generatedAt > MAX_AGE_MS || !Array.isArray(value.listings) ||
      value.listings.length > MAX_ROWS || value.total !== value.listings.length || !value.listings.every(isWireListing)) return;
    if (new Set(value.listings.map(row => row.id)).size !== value.listings.length) return;
    return { generatedAt: Math.min(value.generatedAt, now), listings: value.listings.map(row => ({
      ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
    })) };
  } catch {
    // Invalid HTML data must never block the ordinary API query.
    return;
  }
}

export function serializeCatalogBootstrap(rows: readonly PublicListing[], now = Date.now()): string | undefined {
  if (rows.length > MAX_ROWS) return;
  try {
    const source = JSON.stringify({ version: 1, basePath: '/listings', complete: true,
      generatedAt: now, total: rows.length, listings: rows })
      .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return parseCatalogBootstrap(source, '/listings', now) ? source : undefined;
  } catch {
    return;
  }
}

/** A detail snapshot never seeds the complete catalogue key. Bind the exact
 * public route and reject private fields, stale data or another listing ID. */
export function parseListingBootstrap(source: string, requestPath: string, now = Date.now()): ListingBootstrap | undefined {
  const basePath = resolvePublicPath(requestPath).basePath.replace(/^(\/listing\/[1-9]\d*)\/video$/, '$1');
  const match = /^\/listing\/([1-9]\d*)$/.exec(basePath);
  if (!match || !source || source.length > CATALOG_BOOTSTRAP_MAX_BYTES || new TextEncoder().encode(source).byteLength > CATALOG_BOOTSTRAP_MAX_BYTES) return;
  try {
    const value: unknown = JSON.parse(source);
    if (!isObject(value) || !exactKeys(value, ['version', 'basePath', 'generatedAt', 'listing']) || value.version !== 1 ||
      value.basePath !== basePath || !integer(value.generatedAt) || value.generatedAt > now + CLOCK_SKEW_MS ||
      now - value.generatedAt > MAX_AGE_MS || !isWireListing(value.listing) || value.listing.id !== Number(match[1])) return;
    return { generatedAt: Math.min(value.generatedAt, now), listing: { ...value.listing, createdAt: new Date(value.listing.createdAt), updatedAt: new Date(value.listing.updatedAt) } };
  } catch { return; }
}
export function serializeListingBootstrap(listing: PublicListing, now = Date.now()): string | undefined {
  try {
    const basePath = `/listing/${listing.id}`;
    const source = JSON.stringify({ version: 1, basePath, generatedAt: now, listing })
      .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return parseListingBootstrap(source, basePath, now) ? source : undefined;
  } catch { return; }
}

// Lightweight offline fallback for the public listings catalog: the last
// successful server response is mirrored into localStorage so the catalog
// and listing detail pages still render something when the device is
// offline (photos come from the service worker's image cache — see sw.js).
const LIST_KEY = "royalhome_offline_listings_v1";
const DETAIL_KEY_PREFIX = "royalhome_offline_listing_";

/** Minimal render-safe shape, not a new publication or storage schema. */
function usableListing(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0) return false;
  if (typeof row.title !== 'string' || !row.title.trim() || typeof row.location !== 'string' || typeof row.type !== 'string') return false;
  if (['price', 'rooms', 'area', 'images'].some(key => typeof row[key] !== 'number' || !Number.isFinite(row[key]) || Number(row[key]) < 0)) return false;
  if (row.imageUrls != null && (!Array.isArray(row.imageUrls) || row.imageUrls.some(url => typeof url !== 'string'))) return false;
  if (['urgent', 'sold'].some(key => row[key] !== undefined && typeof row[key] !== 'boolean')) return false;
  if (['floor', 'stage', 'repair', 'date', 'description', 'seoDesc', 'mapAddress', 'instagramUrl', 'videoUrl', 'metaTitle', 'metaDescription', 'h1', 'descriptionTj', 'metaTitleTj', 'metaDescriptionTj', 'h1Tj']
    .some(key => row[key] != null && typeof row[key] !== 'string')) return false;
  if (row.details != null && (typeof row.details !== 'object' || Array.isArray(row.details) || Object.values(row.details).some(detail => typeof detail !== 'string'))) return false;
  return true;
}

export function saveListingsSnapshot(data: unknown[]) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(data));
  } catch {
    // storage full/unavailable — offline fallback simply won't have data
  }
}

export function loadListingsSnapshot<T = unknown>(): T[] | null {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(value) && value.every(usableListing) ? value as T[] : null;
  } catch {
    return null;
  }
}

export function saveListingSnapshot(id: number, data: unknown) {
  try {
    localStorage.setItem(DETAIL_KEY_PREFIX + id, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function loadListingSnapshot<T = unknown>(id: number): T | null {
  try {
    const raw = localStorage.getItem(DETAIL_KEY_PREFIX + id);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return usableListing(value) && value.id === id ? value as T : null;
  } catch {
    return null;
  }
}

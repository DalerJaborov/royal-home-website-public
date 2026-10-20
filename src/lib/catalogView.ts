export interface CatalogView {
  category: 'all' | 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'LAND';
  tab: 'all' | 'new' | 'secondary' | 'urgent';
  district: string; rooms: string; minPrice: string; maxPrice: string;
  minArea: string; maxArea: string; query: string; sort: string;
  filterKey: string; count: number; scrollY: number;
}

// History entries are isolated: two visits with different filter drafts do not
// overwrite one another. Bounded memory also avoids retaining an endless session.
const views = new Map<string, CatalogView>();
export function readCatalogView(key: string) { return views.get(key); }
export function saveCatalogView(key: string, view: CatalogView) {
  views.delete(key);
  views.set(key, { ...view });
  while (views.size > 24) views.delete(views.keys().next().value!);
}
export function nextCatalogCount(count: number, total: number, step = 8) {
  return Math.min(total, Math.max(8, count) + step);
}

import { compareCatalogOrder } from './catalog-order';

export const DISTRICT_PAGES = [
  { slug: 'rayon-sino', names: { ru: 'Сино', tg: 'Сино', en: 'Sino' }, pattern: /(?:^|[,\s])сино(?:[,\s]|$)/iu },
  { slug: 'rayon-ismoili-somoni', names: { ru: 'Исмоили Сомони', tg: 'Исмоили Сомонӣ', en: 'Ismoili Somoni' }, pattern: /сомон[иӣ]/iu },
  { slug: 'rayon-shohmansur', names: { ru: 'Шохмансур', tg: 'Шоҳмансур', en: 'Shohmansur' }, pattern: /(?:^|[,\s])шо[хҳ]мансур(?:[,\s]|$)/iu },
  { slug: 'rayon-firdavsi', names: { ru: 'Фирдавси', tg: 'Фирдавсӣ', en: 'Firdavsi' }, pattern: /(?:^|[,\s])фирд(?:авс[иӣ]|оуси)(?:[,\s]|$)/iu },
] as const;
export type DistrictPage = (typeof DISTRICT_PAGES)[number];
export function districtFromPath(path: string) { return DISTRICT_PAGES.find(d => path === `/kvartiry/${d.slug}`); }
export function isInventoryPage(path: string) { return path === '/listings' || Boolean(districtFromPath(path)); }

export function districtMatchesLocation(location: string, district: DistrictPage) {
  const parts = location.split(',').map(part => part.trim());
  const city = /^(?:г\.?\s*)?(?:душанбе|dushanbe)$/iu;
  if (!parts.some(part => city.test(part))) return false;
  const name = parts.find(part => part && !city.test(part) && !/^(?:ул\.?|улица|проспект|кӯча)\s/iu.test(part));
  return Boolean(name && district.pattern.test(name));
}

interface DistrictListing {
  id: number; location: string; category?: string; sold?: boolean; published?: boolean;
  price: number; area: number; rooms: number; updatedAt?: Date | string;
}
export function districtListings<T extends DistrictListing>(rows: readonly T[], district: DistrictPage): T[] {
  return rows.filter(row => !row.sold && row.published !== false && (row.category ?? 'APARTMENT') === 'APARTMENT' && districtMatchesLocation(row.location, district)).sort(compareCatalogOrder);
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length ? Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null;
};
export function districtStats(rows: readonly DistrictListing[]) {
  const prices = rows.map(row => row.price).filter(value => Number.isFinite(value) && value > 0);
  const dates = rows.flatMap(row => row.updatedAt && Number.isFinite(new Date(row.updatedAt).getTime()) ? [new Date(row.updatedAt).getTime()] : []);
  return { count: rows.length, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null,
    median: median(prices), medianPerMeter: median(rows.filter(row => row.area > 0 && row.price > 0).map(row => row.price / row.area)),
    rooms: [...new Set(rows.map(row => row.rooms))].sort((a, b) => a - b), updatedAt: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null };
}


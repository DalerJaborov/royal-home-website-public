import { describe, expect, it } from 'vitest';
import { nextCatalogCount, readCatalogView, saveCatalogView, type CatalogView } from './catalogView';

const initial: CatalogView = { category: 'all', tab: 'all', district: '', rooms: '', minPrice: '', maxPrice: '', minArea: '', maxArea: '', query: '', sort: 'Без сортировки', filterKey: 'all', count: 24, scrollY: 1370 };
describe('catalog history and incremental rendering', () => {
  it('returns to the previous filter draft, batch and scroll without leaking another visit', () => {
    saveCatalogView('history-a', initial);
    saveCatalogView('history-b', { ...initial, district: 'Сино', count: 8, scrollY: 0 });
    expect(readCatalogView('history-a')).toMatchObject({ district: '', count: 24, scrollY: 1370 });
    expect(readCatalogView('history-b')).toMatchObject({ district: 'Сино', count: 8, scrollY: 0 });
  });
  it('appends a bounded batch without rendering beyond the number of matches', () => {
    expect(nextCatalogCount(8, 51)).toBe(16);
    expect(nextCatalogCount(48, 51)).toBe(51);
    expect(nextCatalogCount(51, 51)).toBe(51);
    expect(nextCatalogCount(8, 3)).toBe(3);
  });
  it('bounds retained history snapshots in a long browsing session', () => {
    for (let i = 0; i < 30; i++) saveCatalogView(`bounded-${i}`, { ...initial, scrollY: i });
    expect(readCatalogView('bounded-0')).toBeUndefined();
    expect(readCatalogView('bounded-29')?.scrollY).toBe(29);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query';
import { selectOfflineData } from './offlineSelection';
import { loadListingsSnapshot, loadListingSnapshot, saveListingsSnapshot, saveListingSnapshot } from './offlineCatalog';

type Row = { id: number; title: string; location: string; type: string; price: number; rooms: number; area: number; images: number; imageUrls?: string[]; date?: string };
const saved: Row = { id: 101, title: 'Previously published server response', location: 'Душанбе', type: 'Новостройки', price: 700000, rooms: 2, area: 65, images: 1, imageUrls: ['/uploads/existing.webp'], date: '2026-09-01' };
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const callback of cleanup.splice(0)) await callback();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  saveListingsSnapshot([saved]); saveListingSnapshot(saved.id, saved);
}
function observe<T>(client: QueryClient, key: string, fetch: () => Promise<T>) {
  const observer = new QueryObserver<T>(client, { queryKey: [key], queryFn: fetch, staleTime: 0, retry: false });
  const stop = observer.subscribe(() => undefined);
  cleanup.push(async () => { stop(); await client.cancelQueries(); client.clear(); });
  return observer;
}
describe('last successful public data during offline startup', () => {
  it('shows real saved catalog/detail snapshots for fresh paused observers that have never errored', () => {
    storage(); onlineManager.setOnline(false);
    const client = new QueryClient();
    const fetchList = vi.fn(async () => [saved]);
    const catalog = observe(client, 'catalog', fetchList).getCurrentResult();
    const detail = observe(client, 'detail', async () => saved).getCurrentResult();
    expect(catalog.fetchStatus).toBe('paused'); expect(catalog.isError).toBe(false);
    expect(selectOfflineData(catalog, true, () => loadListingsSnapshot<Row>())).toMatchObject({ data: [saved], isOffline: true, isLoading: false, isError: false });
    expect(selectOfflineData(detail, true, () => loadListingSnapshot<Row>(101), { rejectOnlineError: true })).toMatchObject({ data: saved, isOffline: true, isLoading: false, isError: false });
    expect(fetchList).not.toHaveBeenCalled();
  });
  it('keeps a successful empty/current query response authoritative and does not consult an older snapshot', () => {
    storage(); onlineManager.setOnline(false);
    const client = new QueryClient(); client.setQueryData(['catalog'], [] as Row[]);
    const result = observe(client, 'catalog', async () => [saved]).getCurrentResult();
    const load = vi.fn(() => loadListingsSnapshot<Row>());
    expect(selectOfflineData(result, true, load)).toMatchObject({ data: [], isOffline: true, isError: false });
    expect(load).not.toHaveBeenCalled();
    client.setQueryData(['detail'], saved);
    const detail = observe(client, 'detail', async () => saved).getCurrentResult();
    expect(selectOfflineData(detail, true, () => ({ ...saved, id: 999, title: 'Old snapshot' }), { rejectOnlineError: true }).data).toEqual(saved);
  });
  it('rejects a stale cached detail after an online404/error but preserves that known row when offline', async () => {
    storage(); onlineManager.setOnline(true);
    const client = new QueryClient(); client.setQueryData(['detail'], saved);
    const observer = observe(client, 'detail', async () => { throw new Error('404: unpublished object'); });
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    const result = observer.getCurrentResult(); expect(result.data).toEqual(saved);
    const load = vi.fn(() => loadListingSnapshot<Row>(101));
    expect(selectOfflineData(result, false, load, { rejectOnlineError: true })).toMatchObject({ data: null, isError: true, isOffline: false });
    expect(load).not.toHaveBeenCalled();
    expect(selectOfflineData(result, true, load, { rejectOnlineError: true })).toMatchObject({ data: saved, isError: false, isOffline: true });
    expect(load).not.toHaveBeenCalled();
  });
  it('does not throw or create fake data when offline storage access is blocked', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    onlineManager.setOnline(false);
    const client = new QueryClient();
    const query = observe(client, 'detail', async () => saved).getCurrentResult();
    expect(selectOfflineData(query, true, () => loadListingSnapshot<Row>(101), { rejectOnlineError: true })).toMatchObject({ data: null, isOffline: false, isError: true });
    expect(loadListingsSnapshot()).toBeNull();
    const catalogQuery = observe(client, 'catalog', async () => [saved]).getCurrentResult();
    expect(selectOfflineData(catalogQuery, true, () => loadListingsSnapshot<Row>())).toMatchObject({ data: null, isOffline: false, isError: true });
  });
  it('rejects malformed stored shapes and mismatched detail IDs while retaining old date strings and valid empty catalogs', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null });
    for (const bad of ['{}', 'null', '"bad"', JSON.stringify([null]), JSON.stringify([{ ...saved, id: '101' }]), JSON.stringify([{ ...saved, title: {} }]), JSON.stringify([{ ...saved, price: '700000' }]), JSON.stringify([{ ...saved, imageUrls: [42] }]), JSON.stringify([{ ...saved, details: ['bad'] }])]) {
      values.set('royalhome_offline_listings_v1', bad);
      expect(loadListingsSnapshot()).toBeNull();
    }
    values.set('royalhome_offline_listings_v1', JSON.stringify([saved]));
    expect(loadListingsSnapshot()).toEqual([saved]);
    values.set('royalhome_offline_listings_v1', '[]');
    expect(loadListingsSnapshot()).toEqual([]);
    values.set('royalhome_offline_listing_101', JSON.stringify({ ...saved, id: 102 }));
    expect(loadListingSnapshot(101)).toBeNull();
    values.set('royalhome_offline_listing_101', JSON.stringify(saved));
    expect(loadListingSnapshot(101)).toEqual(saved);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { trpc } from '@/providers/trpc';
import { serializeCatalogBootstrap } from '@contracts/catalog-bootstrap';
import { consumeCatalogBootstrap, seedCatalogQuery } from './catalogBootstrap';

describe('catalog query initialization', () => {
  it('consumes inert JSON once and ignores malformed or wrong-type data', () => {
    const source = serializeCatalogBootstrap([], Date.now())!;
    for (const [type, content, valid] of [['application/json', source, true], ['text/javascript', source, false], ['application/json', '{}', false]] as const) {
      const remove = vi.fn();
      const document = { getElementById: () => ({ tagName: 'SCRIPT', getAttribute: () => type, textContent: content, remove }) as unknown as HTMLElement };
      expect(Boolean(consumeCatalogBootstrap(document, '/listings'))).toBe(valid);
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });

  it('provides complete data immediately to only the public key and still refetches in the background', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = getQueryKey(trpc.listing.list, {}, 'query');
    const adminKey = getQueryKey(trpc.listing.list, { includeUnpublished: true }, 'query');
    const detailKey = getQueryKey(trpc.listing.getById, { id: 101 }, 'query');
    const now = Date.now() - 100;
    expect(seedCatalogQuery(client, key, { generatedAt: now, listings: [] })).toBe(true);
    expect(client.getQueryData(key)).toEqual([]);
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(now);
    expect(client.getQueryData(adminKey)).toBeUndefined();
    expect(client.getQueryData(detailKey)).toBeUndefined();
    let resolve!: (data: string[]) => void;
    const fetch = vi.fn(() => new Promise<string[]>(res => { resolve = res; }));
    const observer = new QueryObserver(client, { queryKey: key, queryFn: fetch, staleTime: 0 });
    const unsubscribe = observer.subscribe(() => undefined);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data).toEqual([]);
    expect(observer.getCurrentResult().isLoading).toBe(false);
    expect(observer.getCurrentResult().isFetching).toBe(true);
    resolve(['fresh API result']);
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual(['fresh API result']));
    expect(seedCatalogQuery(client, key, { generatedAt: now, listings: [] })).toBe(false);
    expect(client.getQueryData(key)).toEqual(['fresh API result']);
    unsubscribe();
    client.clear();
  });

  it('keeps a valid seed visible while offline and leaves online refresh failures observable', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = getQueryKey(trpc.listing.list, {}, 'query');
    seedCatalogQuery(client, key, { generatedAt: Date.now() - 1, listings: [] });
    const fetch = vi.fn(async () => { throw new Error('network unavailable'); });
    onlineManager.setOnline(false);
    const observer = new QueryObserver(client, { queryKey: key, queryFn: fetch, staleTime: 0 });
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      expect(observer.getCurrentResult().data).toEqual([]);
      expect(observer.getCurrentResult().isLoading).toBe(false);
      expect(observer.getCurrentResult().fetchStatus).toBe('paused');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      await client.cancelQueries();
      onlineManager.setOnline(true);
    }
    const resumed = new QueryObserver(client, { queryKey: key, queryFn: fetch, staleTime: 0 });
    const stop = resumed.subscribe(() => undefined);
    await vi.waitFor(() => expect(resumed.getCurrentResult().isError).toBe(true));
    expect(resumed.getCurrentResult().data).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    stop();
    client.clear();
  });
});

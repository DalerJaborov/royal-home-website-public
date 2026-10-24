import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://royalhome.tj';
const ACTIVE = 'royalhome-v4-i18n';
type WorkerRequest = { url: string; method: string; mode: string };
type WorkerEvent = { request?: WorkerRequest; waitUntil(promise: Promise<unknown>): void; respondWith(promise: Promise<Response>): void };
function harness() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: string | WorkerRequest) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  const caches = {
    async open(name: string) {
      const store = stores.get(name) ?? new Map<string, Response>(); stores.set(name, store);
      return { async put(request: string | WorkerRequest, response: Response) { store.set(key(request), response.clone()); }, async match(request: string | WorkerRequest) { return store.get(key(request))?.clone(); }, async delete(request: string | WorkerRequest) { return store.delete(key(request)); } };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const fetch = vi.fn<(request: WorkerRequest | string, options?: RequestInit) => Promise<Response>>();
  const skipWaiting = vi.fn(), claim = vi.fn();
  runInContext(source, createContext({ URL, caches, fetch, self: { location: { origin: ORIGIN }, addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler), skipWaiting, clients: { claim } } }));
  async function dispatch(path: string, mode = 'cors', method = 'GET') {
    const pending: Promise<unknown>[] = []; let response: Promise<Response> | undefined;
    handlers.get('fetch')!({ request: { url: new URL(path, ORIGIN).href, mode, method }, waitUntil: promise => { pending.push(promise); }, respondWith: promise => { response = promise; } });
    const result = response ? await response : undefined; await Promise.all(pending); return result;
  }
  async function lifecycle(name: string) { const pending: Promise<unknown>[] = []; handlers.get(name)!({ waitUntil: promise => { pending.push(promise); }, respondWith: () => {} }); await Promise.all(pending); }
  return { caches, stores, fetch, dispatch, lifecycle, skipWaiting, claim };
}
const html = (body: string, status = 200, cacheControl = 'no-cache') => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cacheControl } });
const json = (body: string, status = 200, cacheControl = 'public, max-age=60') => new Response(body, { status, headers: { 'content-type': 'application/json', 'cache-control': cacheControl } });

describe('actual service worker cache policy', () => {
  it('keeps the working offline shell after failed, private or non-HTML navigations', async () => {
    const worker = harness(); worker.fetch.mockResolvedValueOnce(html('good shell'));
    await worker.dispatch('/listings', 'navigate');
    for (const response of [html('missing', 404), html('unavailable', 503), html('private', 200, 'private'), html('uncacheable', 200, 'no-store'), json('{"error":"not html"}')]) {
      worker.fetch.mockResolvedValueOnce(response); await worker.dispatch('/problem', 'navigate');
      expect(await (await (await worker.caches.open(ACTIVE)).match('/index.html'))!.text()).toBe('good shell');
    }
    worker.fetch.mockRejectedValueOnce(new TypeError('offline'));
    expect(await (await worker.dispatch('/new-page', 'navigate'))!.text()).toBe('good shell');
  });
  it('never handles private interfaces, any nonphoto API, mutations or foreign origins', async () => {
    const worker = harness();
    for (const path of ['/api', '/api/trpc/listing.list', '/api/admin/report', '/api/uploads/private.json', '/admin/settings', '/tg/admin/settings', '/login', '/listing/preview/8', 'https://foreign.test/photo.webp']) expect(await worker.dispatch(path, 'navigate')).toBeUndefined();
    expect(await worker.dispatch('/api/leads', 'cors', 'POST')).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled(); expect(worker.stores.size).toBe(0);
  });
  it('leaves public video streaming to the network without buffering or offline caching', async () => {
    const worker = harness();
    expect(await worker.dispatch('/media/listing-video/120.mp4')).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.stores.size).toBe(0);
  });
  it('revalidates same-version translations and uses only exact viewed URL on network failure', async () => {
    const worker = harness(), path = '/locales/tg.json?v=same';
    worker.fetch.mockResolvedValueOnce(json('{"strings":{"key":"old"}}')); await worker.dispatch(path);
    worker.fetch.mockResolvedValueOnce(json('{"strings":{"key":"new"}}')); expect(await (await worker.dispatch(path))!.json()).toEqual({ strings: { key: 'new' } });
    expect(worker.fetch.mock.calls[1][1]?.cache).toBe('no-cache');
    worker.fetch.mockRejectedValueOnce(new TypeError('offline')); expect(await (await worker.dispatch(path))!.json()).toEqual({ strings: { key: 'new' } });
    worker.fetch.mockRejectedValueOnce(new TypeError('offline')); await expect(worker.dispatch('/locales/tg.json?v=unseen')).rejects.toThrow('offline');
  });
  it('never masks online403/404/503 with cached translations and never caches invalid JSON', async () => {
    const worker = harness(), path = '/locales/en/articles/16.json?v=same';
    worker.fetch.mockResolvedValueOnce(json('{"sourceHash":"current"}')); await worker.dispatch(path);
    for (const status of [403, 404, 503]) { worker.fetch.mockResolvedValueOnce(json('{"error":"unavailable"}', status)); expect((await worker.dispatch(path))!.status).toBe(status); }
    worker.fetch.mockResolvedValueOnce(json('invalid JSON')); await worker.dispatch(path);
    worker.fetch.mockRejectedValueOnce(new TypeError('offline')); expect(await (await worker.dispatch(path))!.json()).toEqual({ sourceHash: 'current' });
  });
  it('honors translation no-store/private and removes older cached copies of that same URL', async () => {
    for (const directive of ['no-store', 'private, max-age=0']) {
      const worker = harness(), path = '/locales/en.json?v=same';
      worker.fetch.mockResolvedValueOnce(json('{"strings":{}}')); await worker.dispatch(path);
      worker.fetch.mockResolvedValueOnce(json('{"strings":{"key":"private"}}', 200, directive)); await worker.dispatch(path);
      expect(await (await worker.caches.open(ACTIVE)).match(path)).toBeUndefined();
      worker.fetch.mockRejectedValueOnce(new TypeError('offline')); await expect(worker.dispatch(path)).rejects.toThrow('offline');
    }
  });
  it('retains viewed public photos offline but rejects disguised API JSON and uncacheable assets', async () => {
    const worker = harness(); worker.fetch.mockResolvedValueOnce(new Response('photo', { headers: { 'content-type': 'image/webp' } })); await worker.dispatch('/api/uploads/photo.webp');
    expect(await (await worker.dispatch('/api/uploads/photo.webp'))!.text()).toBe('photo'); expect(worker.fetch).toHaveBeenCalledTimes(1);
    worker.fetch.mockResolvedValueOnce(json('{"secret":1}')); await worker.dispatch('/api/uploads/disguised.webp');
    expect(await (await worker.caches.open(ACTIVE)).match('/api/uploads/disguised.webp')).toBeUndefined();
    worker.fetch.mockResolvedValueOnce(new Response('private', { headers: { 'cache-control': 'no-store' } })); await worker.dispatch('/asset.js');
    expect(await (await worker.caches.open(ACTIVE)).match('/asset.js')).toBeUndefined();
  });
  it('removes only old ROYAL HOME caches and safely installs despite404/private precache responses', async () => {
    const worker = harness(); await worker.caches.open('royalhome-v3'); await worker.caches.open('other-product'); await worker.caches.open(ACTIVE); await worker.lifecycle('activate');
    expect(await worker.caches.keys()).toEqual(['other-product', ACTIVE]); expect(worker.claim).toHaveBeenCalledOnce();
    worker.fetch.mockImplementation(async request => String(request) === '/' ? html('private', 200, 'no-store') : String(request) === '/index.html' ? html('missing', 404) : html('available'));
    await worker.lifecycle('install'); expect(worker.skipWaiting).toHaveBeenCalledOnce(); expect(await (await worker.caches.open(ACTIVE)).match('/index.html')).toBeUndefined();
  });
});

describe('production worker registration', () => {
  it('registers the content-versioned worker after load and bypasses HTTP worker cache', () => {
    const register = vi.fn().mockResolvedValue({});
    const listeners = new Map<string, () => void>();
    runInContext(readFileSync(new URL('../../public/register-sw.js', import.meta.url), 'utf8'), createContext({
      navigator: { serviceWorker: { register } },
      document: { readyState: 'loading', currentScript: { dataset: { workerVersion: 'abcdef123456' } } },
      window: { addEventListener: (event: string, callback: () => void) => listeners.set(event, callback) },
    }));
    expect(register).not.toHaveBeenCalled();
    listeners.get('load')!();
    expect(register).toHaveBeenCalledWith('/sw.js?v=abcdef123456', { updateViaCache: 'none' });
  });
});

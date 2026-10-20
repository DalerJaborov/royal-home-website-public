import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('lazy language dictionary loading', () => {
  it('ships no Russian request and deduplicates overlapping localized bootstrap/provider loads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ strings: { Купить: 'Харидан' }, completedPages: ['/listings'], pages: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cache = await import('./localeDictionaries');
    await cache.preloadLocaleDictionary('ru');
    expect(fetchMock).not.toHaveBeenCalled();
    await Promise.all([cache.preloadLocaleDictionary('tg'), cache.preloadLocaleDictionary('tg')]);
    await cache.preloadLocaleDictionary('tg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^\/locales\/tg\.json\?v=/);
    expect(cache.dictionarySnapshot('tg').dictionary.strings.Купить).toBe('Харидан');
    expect(cache.dictionarySnapshot('tg').dictionary.completedPages).toEqual(['/listings']);
  });
  it('shows a failure state and allows a fresh request after a temporary CDN error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ strings: { Купить: 'Харидан' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cache = await import('./localeDictionaries');
    await cache.preloadLocaleDictionary('tg');
    expect(cache.dictionarySnapshot('tg').status).toBe('error');
    await cache.retryDictionary('tg');
    expect(cache.dictionarySnapshot('tg').status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../queries/articles', () => ({ findPublishedArticleById: vi.fn() }));
vi.mock('./public-translations', () => ({ getPublicArticleTranslation: vi.fn() }));
import { findPublishedArticleById } from '../queries/articles';
import { getPublicArticleTranslation } from './public-translations';
import { localesApp } from './locales-route';

const payload = { sourceHash: 'hash', title: 'Мақола', excerpt: 'Матн', contentHtml: '<p>Матн</p>', metaTitle: 'Мақола', metaDescription: 'Матн', faq: [] };
beforeEach(() => {
  vi.mocked(findPublishedArticleById).mockReset().mockResolvedValue({ id: 8, status: 'published', title: 'Статья', contentHtml: '<p>Текст</p>' } as never);
  vi.mocked(getPublicArticleTranslation).mockReset().mockResolvedValue(payload);
});
describe('published article locale resource HTTP contract', () => {
  it('rejects unsupported language and malformed resource names before any DB read', async () => {
    for (const path of ['/locales/ru/articles/8.json', '/locales/tg/articles/-1.json', '/locales/tg/articles/8.5.json', '/locales/tg/articles/settings.json', '/locales/tg/articles/9007199254740999.json']) {
      const response = await localesApp.request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(findPublishedArticleById).not.toHaveBeenCalled();
  });
  it('returns stale or unpublished resources as404 even when a static file exists', async () => {
    vi.mocked(findPublishedArticleById).mockResolvedValue(null);
    expect((await localesApp.request('/locales/tg/articles/8.json')).status).toBe(404);
    expect(getPublicArticleTranslation).not.toHaveBeenCalled();
    vi.mocked(findPublishedArticleById).mockResolvedValue({ id: 8 } as never);
    vi.mocked(getPublicArticleTranslation).mockResolvedValue(undefined);
    expect((await localesApp.request('/locales/tg/articles/8.json')).status).toBe(404);
  });
  it('serves only verified public content with a content-version ETag and revalidation', async () => {
    const response = await localesApp.request('/locales/tg/articles/8.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, must-revalidate');
    const etag = response.headers.get('ETag')!;
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect((await localesApp.request('/locales/tg/articles/8.json', { headers: { 'If-None-Match': etag } })).status).toBe(304);
    vi.mocked(getPublicArticleTranslation).mockResolvedValue({ ...payload, contentHtml: '<p>Матни нав</p>' });
    expect((await localesApp.request('/locales/tg/articles/8.json')).headers.get('ETag')).not.toBe(etag);
  });
  it('does not disguise a DB outage as a missing article', async () => {
    vi.mocked(findPublishedArticleById).mockRejectedValue(new Error('database unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await localesApp.request('/locales/tg/articles/8.json');
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    log.mockRestore();
  });
});

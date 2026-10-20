import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../queries/listings', () => ({ findPublishedListingIds: vi.fn() }));
import { findPublishedListingIds } from '../queries/listings';
import { unavailableArticleListingIds } from './article-link-availability';
beforeEach(() => { vi.mocked(findPublishedListingIds).mockReset(); });
describe('article listing availability', () => {
  it('checks unique same-origin references in one batch and preserves available sold/public rows', async () => {
    vi.mocked(findPublishedListingIds).mockResolvedValue(new Set([8]));
    expect(await unavailableArticleListingIds('<a href="/listing/8">sold</a><a href="/tg/khona/9">old</a><a href="https://royalhome.tj/listing/9">old</a><a href="https://other.test/listing/10">external</a>')).toEqual([9]);
    expect(findPublishedListingIds).toHaveBeenCalledExactlyOnceWith([8, 9]);
  });
  it('does not query for absent references and never returns a missing result on database failure', async () => {
    expect(await unavailableArticleListingIds('<a href="/contacts">Contact</a>')).toEqual([]);
    expect(findPublishedListingIds).not.toHaveBeenCalled();
    vi.mocked(findPublishedListingIds).mockRejectedValue(new Error('Database unavailable'));
    await expect(unavailableArticleListingIds('<a href="/listing/8">Home</a>')).rejects.toThrow('Database unavailable');
  });
  it('rejects over100 references before any database query', async () => {
    await expect(unavailableArticleListingIds(Array.from({ length: 101 }, (_, index) => `<a href="/listing/${index + 1}">Home</a>`).join(''))).rejects.toThrow('Too many property references');
    expect(findPublishedListingIds).not.toHaveBeenCalled();
  });
});

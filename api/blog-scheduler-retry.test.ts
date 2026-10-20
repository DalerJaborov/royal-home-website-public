import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: new Map<string, unknown>() }));
vi.mock('./queries/connection', () => ({ isDbAvailable: () => false, getDb: () => null }));
vi.mock('./queries/cms', () => ({
  getCmsEntry: vi.fn(async (key: string) => state.values.get(key)),
  setCmsEntry: vi.fn(async (key: string, value: unknown) => { state.values.set(key, value); }),
}));
vi.mock('./queries/articles', () => ({
  findLatestAiArticleDate: vi.fn(), findAllArticles: vi.fn(async () => []),
  createArticle: vi.fn(), findArticleById: vi.fn(), findRecentArticleTitles: vi.fn(),
  findRecentCoverImageUrls: vi.fn(), slugExists: vi.fn(), updateArticle: vi.fn(),
}));
vi.mock('./lib/article-translation-generator', () => ({ processMissingArticleTranslations: vi.fn() }));
import { findLatestAiArticleDate } from './queries/articles';
import { getCmsEntry, setCmsEntry } from './queries/cms';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.values.clear();
  state.values.set('blogAutogenEnabled', 'true');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T11:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('No external calls in scheduler tests'); }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('automatic article retry survives an application restart', () => {
  it('persists a failure deadline, skips after restart, and resumes when the deadline expires', async () => {
    vi.mocked(findLatestAiArticleDate).mockRejectedValueOnce(Error('Synthetic database read failure'));
    const firstProcess = await import('./blog-generator');
    await firstProcess.scheduledCheck();
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    expect(setCmsEntry).toHaveBeenCalledWith('blogAutogenRetryAt', deadline);
    expect(findLatestAiArticleDate).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const restartedProcess = await import('./blog-generator');
    await restartedProcess.scheduledCheck();
    expect(findLatestAiArticleDate).toHaveBeenCalledTimes(1);
    vi.setSystemTime(deadline);
    vi.mocked(findLatestAiArticleDate).mockResolvedValue(new Date(deadline));
    await restartedProcess.scheduledCheck();
    expect(findLatestAiArticleDate).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the in-process pause if saving a deadline fails', async () => {
    vi.mocked(findLatestAiArticleDate).mockRejectedValueOnce(Error('Synthetic failure'));
    vi.mocked(setCmsEntry).mockRejectedValueOnce(Error('Synthetic storage failure'));
    const process = await import('./blog-generator');
    await expect(process.scheduledCheck()).resolves.toBeUndefined();
    await process.scheduledCheck();
    expect(findLatestAiArticleDate).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not read or change a retry deadline when automatic generation is disabled', async () => {
    state.values.set('blogAutogenEnabled', 'false');
    const process = await import('./blog-generator');
    await process.scheduledCheck();
    expect(getCmsEntry).not.toHaveBeenCalledWith('blogAutogenRetryAt');
    expect(setCmsEntry).not.toHaveBeenCalled();
    expect(findLatestAiArticleDate).not.toHaveBeenCalled();
  });
});

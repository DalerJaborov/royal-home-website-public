import { describe, expect, it, vi } from 'vitest';
vi.mock('./connection', () => ({ isDbAvailable: () => false, getDb: vi.fn() }));
import { getAllCmsEntries, getCmsEntry, setCmsEntry } from './cms';

describe('public CMS excludes translation service state', () => {
  it('does not expose pipeline attempts, service dictionaries or provider credentials', async () => {
    const attempts = { 'tg:8': { sourceHash: 'synthetic-hash', nextAttemptAt: 12345, status: 'failed' } };
    await setCmsEntry('i18n.articleAttempts', attempts);
    await setCmsEntry('i18n.tg.internalDraft', { unpublished: 'draft' });
    await setCmsEntry('geminiApiKey', 'synthetic-secret');
    await setCmsEntry('blogAutogenRetryAt', 12345);
    await setCmsEntry('hero', { title: 'Публичный заголовок' });
    const publicCms = await getAllCmsEntries();
    expect(publicCms.hero).toEqual({ title: 'Публичный заголовок' });
    expect(publicCms).not.toHaveProperty('geminiApiKey');
    expect(publicCms).not.toHaveProperty('blogAutogenRetryAt');
    expect(Object.keys(publicCms).some(key => key.startsWith('i18n.'))).toBe(false);
    expect(await getCmsEntry('i18n.articleAttempts')).toEqual(attempts);
    expect(await getCmsEntry('geminiApiKey')).toBe('synthetic-secret');
  });
});

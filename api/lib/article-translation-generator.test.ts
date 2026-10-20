import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn(), unlink: vi.fn() }));
vi.mock('../queries/articles', () => ({ findPublishedArticles: vi.fn(), findPublishedArticleById: vi.fn() }));
vi.mock('../queries/cms', () => ({ getCmsEntry: vi.fn(), setCmsEntry: vi.fn() }));
vi.mock('./public-translations', async () => {
  const original = await vi.importActual<typeof import('./public-translations')>('./public-translations');
  return { ...original, getPublicArticleTranslation: vi.fn() };
});
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { findPublishedArticles, findPublishedArticleById } from '../queries/articles';
import { getCmsEntry, setCmsEntry } from '../queries/cms';
import { getPublicArticleTranslation, translationSourceHash } from './public-translations';
import { generateArticleTranslation, validateArticleTranslation, restoreArticleNumericFormatting, parseArticleTranslationResponse, persistArticleTranslation, processMissingArticleTranslations } from './article-translation-generator';

const source = { id: 8, slug: 'guide', title: 'Душанбе 2026', excerpt: 'Советы', contentHtml: '<p>ROYAL HOME: 2026, {price}. <a href="/contacts">Контакты</a></p>', metaTitle: 'ROYAL HOME 2026', metaDescription: '', faq: [{ q: 'Цена 10%?', a: '1000 сомони' }] };
const translation = { title: 'Хонаҳои Душанбе 2026', excerpt: 'Маслиҳатҳо', contentHtml: '<p>ROYAL HOME: 2026, {price}. <a href="/contacts">Тамос</a></p>', metaTitle: 'ROYAL HOME 2026', metaDescription: '', faq: [{ q: 'Нарх 10%?', a: '1000 сомонӣ' }] };
const english = { ...translation, title: 'Dushanbe homes 2026', excerpt: 'Advice', contentHtml: '<p>ROYAL HOME: 2026, {price}. <a href="/contacts">Contact</a></p>', faq: [{ q: 'Price 10%?', a: '1000 TJS' }] };
const geminiResponse = (value = translation, finishReason = 'STOP') => new Response(JSON.stringify({ modelVersion: 'verified-test-model', candidates: [{ finishReason, content: { parts: [{ thought: true, text: 'private reasoning' }, { text: JSON.stringify(value) }] } }] }), { status: 200 });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn().mockImplementation(async (_url, options) => geminiResponse(String(options.body).includes('clear natural English') ? english : translation));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(mkdir).mockResolvedValue(undefined);
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(rename).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
  vi.mocked(getCmsEntry).mockResolvedValue(undefined);
  vi.mocked(setCmsEntry).mockResolvedValue(undefined);
  vi.mocked(getPublicArticleTranslation).mockResolvedValue(undefined);
  vi.mocked(findPublishedArticles).mockResolvedValue({ items: [source], total: 1 } as never);
  vi.mocked(findPublishedArticleById).mockResolvedValue({ ...source, status: 'published' } as never);
});

describe('article translation structure and factual preservation', () => {
  it('preserves tags, attributes, phone/numeric facts, placeholders and branding', () => {
    expect(validateArticleTranslation(source, translation, 'tg')).toEqual(translation);
    expect(() => validateArticleTranslation(source, { ...translation, contentHtml: translation.contentHtml.replace('/contacts', '/other') }, 'tg')).toThrow(/structure/);
    expect(() => validateArticleTranslation(source, { ...translation, title: 'Хонаҳои Душанбе 2027' }, 'tg')).toThrow(/numeric/);
    expect(() => validateArticleTranslation(source, { ...translation, contentHtml: translation.contentHtml.replace('{price}', '{other}') }, 'tg')).toThrow(/placeholders/);
    expect(() => validateArticleTranslation(source, { ...translation, metaTitle: 'Royal Home 2026' }, 'tg')).toThrow(/branding/);
    expect(() => validateArticleTranslation(source, { ...translation, excerpt: 'متن' }, 'tg')).toThrow(/Persian/);
    expect(() => validateArticleTranslation(source, { ...translation, excerpt: 'ўзбек' }, 'tg')).toThrow(/Uzbek/);
    expect(() => validateArticleTranslation(source, translation, 'en')).toThrow(/English body/);
  });
  it('preserves quoted original foreign proper names without imposing a false script failure', () => {
    const original = { ...source, excerpt: 'نام' };
    expect(validateArticleTranslation(original, { ...translation, excerpt: 'نام' }, 'tg').excerpt).toBe('نام');
  });
  it('allows localized alt/title copy while preserving image sources, attribute presence and numeric facts', () => {
    const original = { ...source, contentHtml: '<img src="/photo-2026.webp" alt="Дом 2026" title="Просмотр"><p>Контакты</p>' };
    const localized = { ...translation, contentHtml: '<img src="/photo-2026.webp" alt="Хона 2026" title="Тамошои хона"><p>Тамос</p>' };
    expect(validateArticleTranslation(original, localized, 'tg').contentHtml).toContain('alt="Хона 2026"');
    expect(() => validateArticleTranslation(original, { ...localized, contentHtml: localized.contentHtml.replace('/photo-2026.webp', '/other.webp') }, 'tg')).toThrow(/structure/);
    expect(() => validateArticleTranslation(original, { ...localized, contentHtml: localized.contentHtml.replace('Хона 2026', 'Хона 2027') }, 'tg')).toThrow(/numeric/);
  });
  it('restores equivalent number formatting without accepting different factual values or technical URL changes', () => {
    const original = { ...source, contentHtml: '<p>1,5 миллиона; 1 140 000 сомони</p>' };
    const output = { ...english, contentHtml: '<p>1.5 million; 1,140,000 TJS</p>' };
    const restored = restoreArticleNumericFormatting(original, output);
    expect(restored.repairs).toBe(2);
    expect(restored.fields.contentHtml).toBe('<p>1,5 million; 1 140 000 TJS</p>');
    expect(validateArticleTranslation(original, restored.fields, 'en')).toBeTruthy();
    const changed = restoreArticleNumericFormatting(original, { ...output, contentHtml: '<p>1.6 million; 1,140,000 TJS</p>' });
    expect(() => validateArticleTranslation(original, changed.fields, 'en')).toThrow(/numeric/);
  });
  it('rejects swapped amounts in a sentence or table even when their multiset is unchanged', () => {
    const original = { ...source, contentHtml: '<p>Цена 10, комиссия 20.</p><table><tr><td>10</td><td>20</td></tr></table>' };
    const swapped = { ...english, contentHtml: '<p>Price 20, fee 10.</p><table><tr><td>20</td><td>10</td></tr></table>' };
    const restored = restoreArticleNumericFormatting(original, swapped);
    expect(restored.repairs).toBe(0);
    expect(() => validateArticleTranslation(original, restored.fields, 'en')).toThrow(/sequence/);
  });
  it('checks numeric order per text fragment while harmless technical attribute order stays equivalent', () => {
    const original = { ...source, contentHtml: '<img width="1200" height="800" src="/photo.webp"><p>Цена 10, комиссия 20.</p>' };
    const translated = { ...english, contentHtml: '<img height="800" src="/photo.webp" width="1200"><p>Price 10, fee 20.</p>' };
    expect(validateArticleTranslation(original, translated, 'en')).toBeTruthy();
    expect(() => validateArticleTranslation(original, { ...translated, contentHtml: translated.contentHtml.replace('Price 10, fee 20.', 'Price 20, fee 10.') }, 'en')).toThrow(/sequence/);
  });
  it('treats HTML character references as visible glyphs, while encoded changed amounts are rejected', () => {
    const original = { ...source, contentHtml: '<p>Цена продавца 10.</p>' };
    expect(validateArticleTranslation(original, { ...english, contentHtml: '<p>The seller&#39;s price is 10.</p>' }, 'en')).toBeTruthy();
    expect(() => validateArticleTranslation(original, { ...english, contentHtml: '<p>The seller&#39;s price is &#50;&#48;.</p>' }, 'en')).toThrow(/numeric/);
  });
});
describe('bounded provider work', () => {
  it('unwraps only a singleton serialization envelope and still rejects multiple articles', () => {
    expect(validateArticleTranslation(source, parseArticleTranslationResponse(JSON.stringify([translation])), 'tg')).toEqual(translation);
    expect(() => validateArticleTranslation(source, parseArticleTranslationResponse(JSON.stringify([translation, translation])), 'tg')).toThrow();
  });
  it('uses existing transport and actual model version, ignores thought parts, hashes the true source', async () => {
    const result = await generateArticleTranslation(source, 'tg', 'synthetic-test-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-pro-latest:generateContent');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(32768);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(result.translation.sourceHash).toBe(translationSourceHash(source));
    expect(result.modelVersion).toBe('verified-test-model');
    expect(result.translation.contentHtml).not.toContain('private reasoning');
  });
  it('retries once only for a transient provider error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await generateArticleTranslation(source, 'tg', 'synthetic-test-key');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(generateArticleTranslation(source, 'tg', 'synthetic-test-key')).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not repeat a paid request for malformed, incomplete or altered translation output', async () => {
    fetchMock.mockResolvedValueOnce(geminiResponse({ ...translation, title: 'Душанбе 2027' }));
    await expect(generateArticleTranslation(source, 'tg', 'synthetic-test-key')).rejects.toThrow(/numeric/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear().mockResolvedValueOnce(geminiResponse(translation, 'MAX_TOKENS'));
    await expect(generateArticleTranslation(source, 'tg', 'synthetic-test-key')).rejects.toThrow(/incomplete/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
describe('persistent publication and background queue', () => {
  it('writes through an atomic temporary file and refuses a mismatched source revision', async () => {
    await persistArticleTranslation(source, 'tg', { ...translation, sourceHash: translationSourceHash(source) });
    expect(String(vi.mocked(writeFile).mock.calls[0][0])).toMatch(/uploads[/\\]locales[/\\]tg[/\\]articles[/\\]8\.json\..+\.tmp$/);
    expect(String(vi.mocked(rename).mock.calls[0][1])).toMatch(/uploads[/\\]locales[/\\]tg[/\\]articles[/\\]8\.json$/);
    expect(unlink).toHaveBeenCalledTimes(1);
    await expect(persistArticleTranslation(source, 'tg', { ...translation, sourceHash: 'stale' })).rejects.toThrow(/revision/);
  });
  it('processes no more than one article per language, with Tajik first and persisted attempt state', async () => {
    const attempts: unknown[] = [];
    vi.mocked(setCmsEntry).mockImplementation(async (_key, value) => { attempts.push(structuredClone(value)); });
    vi.mocked(findPublishedArticles).mockResolvedValue({ items: [source, { ...source, id: 9 }], total: 2 } as never);
    expect(await processMissingArticleTranslations({ getApiKey: async () => 'synthetic-test-key', now: 1000 })).toMatchObject({ processed: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-pro-latest');
    expect(String(fetchMock.mock.calls[1][0])).toContain('gemini-flash-latest');
    expect(attempts[0]).toMatchObject({ 'tg:8': { status: 'pending' } });
    expect(attempts.at(-1)).toMatchObject({ 'tg:8': { status: 'ready' }, 'en:8': { status: 'ready' } });
    expect(findPublishedArticles).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });
  it('skips cooldown and already published resources without reading a key or making provider calls', async () => {
    vi.mocked(getCmsEntry).mockResolvedValue({ 'tg:8': { sourceHash: translationSourceHash(source), updatedAt: 1000, nextAttemptAt: 9999999, status: 'failed' } });
    vi.mocked(getPublicArticleTranslation).mockImplementation(async locale => locale === 'en' ? { ...translation, sourceHash: translationSourceHash(source) } : undefined);
    const getKey = vi.fn();
    expect(await processMissingArticleTranslations({ getApiKey: getKey, now: 2000 })).toMatchObject({ processed: 0, failed: 0 });
    expect(getKey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a missing configured key never invokes a provider or writes an attempt', async () => {
    expect(await processMissingArticleTranslations({ getApiKey: async () => null, now: 1000 })).toMatchObject({ processed: 0, failed: 0, configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setCmsEntry).not.toHaveBeenCalled();
  });
  it('does not publish old translated content if the source changes during generation', async () => {
    vi.mocked(findPublishedArticleById).mockResolvedValue({ ...source, title: 'Новая версия 2026', status: 'published' } as never);
    expect(await processMissingArticleTranslations({ getApiKey: async () => 'synthetic-test-key', now: 1000 })).toMatchObject({ processed: 0, failed: 0 });
    expect(rename).not.toHaveBeenCalled();
  });
  it('records persistent failure cooldown and keeps the Russian publication unchanged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(async () => new Response('{}', { status: 403 }));
    const result = await processMissingArticleTranslations({ getApiKey: async () => 'synthetic-test-key', now: 1000 });
    expect(result.failed).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rename).not.toHaveBeenCalled();
    expect(setCmsEntry).toHaveBeenLastCalledWith('i18n.articleAttempts', expect.objectContaining({ 'tg:8': expect.objectContaining({ status: 'failed', nextAttemptAt: 86401000 }) }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-test-key');
    log.mockRestore();
  });
});

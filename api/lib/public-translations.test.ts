import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', () => ({ stat: vi.fn(), readFile: vi.fn() }));
import { stat, readFile } from 'node:fs/promises';
import { getPublicArticleTranslation, getPublicDictionary, translationSourceHash } from './public-translations';
const source = { id: 319, slug: 'test-guide', title: 'Исходная статья', contentHtml: '<p>Исходное содержание</p>' };
let revision = 0;
beforeEach(() => {
  revision += 1;
  vi.mocked(stat).mockResolvedValue({ mtimeMs: revision, size: 300 } as never);
});
describe('translation snapshot publication validation', () => {
  it('serves the exact archived source revision while static copy is prepared for a new editorial release', async () => {
    const current = JSON.stringify({ sourceHash: translationSourceHash(source), title: 'Current revision', contentHtml: '<p>Current text</p>' });
    const next = JSON.stringify({ sourceHash: 'another-revision', title: 'Not yet published', contentHtml: '<p>New text</p>' });
    vi.mocked(readFile).mockImplementation(async file => String(file).includes(`${source.id}-${translationSourceHash(source)}.json`) && String(file).includes('uploads') ? current : next);
    expect((await getPublicArticleTranslation('en', source))?.title).toBe('Current revision');
    expect(await getPublicArticleTranslation('en', { ...source, title: 'Unreviewed revision' })).toBeUndefined();
  });
  it('keeps confirmed WhatsApp separate from translated CMS call contacts', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ strings: {}, cms: { site: { phone: '+992777776001', whatsapp: '+992777776001' } } }));
    const result = await getPublicDictionary('en');
    expect(result?.cms?.site).toMatchObject({ phone: '+992 44 650 14 14', whatsapp: '+992777776001', socialVisibility: { whatsapp: true } });
  });
  it('accepts matching source revision and sanitizes translated markup', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ sourceHash: translationSourceHash(source), title: 'Мақола', excerpt: 'Маслиҳат', contentHtml: '<p onclick="alert(1)">Маслиҳатҳо</p><script>alert(1)</script>', metaTitle: 'Мақола', metaDescription: 'Маслиҳат', faq: [] }));
    const result = await getPublicArticleTranslation('tg', source);
    expect(result?.contentHtml).toBe('<p>Маслиҳатҳо</p>');
  });
  it('does not publish an outdated article translation after source changes', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ sourceHash: translationSourceHash(source), title: 'Мақола', contentHtml: '<p>Маслиҳатҳо</p>' }));
    expect(await getPublicArticleTranslation('tg', { ...source, contentHtml: '<p>Новые данные</p>' })).toBeUndefined();
  });
  it('does not read files for Russian or invalid resource identifiers', async () => {
    vi.mocked(readFile).mockClear();
    expect(await getPublicArticleTranslation('ru', source)).toBeUndefined();
    expect(await getPublicArticleTranslation('tg', { ...source, id: -1 })).toBeUndefined();
    expect(await getPublicArticleTranslation('tg', { ...source, id: 1.5 })).toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
  });
  it('a corrupt persistent draft cannot hide a valid built published snapshot', async () => {
    const valid = JSON.stringify({ sourceHash: translationSourceHash(source), title: 'Мақола', contentHtml: '<p>Матн</p>' });
    vi.mocked(readFile).mockImplementation(async file => String(file).includes('uploads') ? '{unfinished' : valid);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getPublicArticleTranslation('tg', source);
    expect(result?.title).toBe('Мақола');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

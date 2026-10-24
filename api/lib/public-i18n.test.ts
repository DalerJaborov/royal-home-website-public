import { describe, expect, it } from 'vitest';
import { localizedPath, resolvePublicPath, publishedAlternates, articleTranslationSource, localizedStructuredData, isPublicPageComplete } from '@contracts/public-i18n';
import { tajikDistrict, tajikPropertyTitle, tajikPropertyDescription } from '@contracts/tajik-catalog';
import { translationSourceHash } from './public-translations';

describe('public language URL identity', () => {
  it('preserves existing Russian URLs and filter protocol values', () => {
    expect(localizedPath('/listings?district=Сино&tab=secondary#filters', 'tg')).toBe('/tg/khonaho-dushanbe?district=Сино&tab=secondary#filters');
    expect(localizedPath('/tg/khonaho-dushanbe?rooms=4+', 'ru')).toBe('/listings?rooms=4+');
    expect(localizedPath('/tg/khona/19', 'tg')).toBe('/tg/khona/19');
    expect(localizedPath('/tg/tamos', 'en')).toBe('/en/contacts');
    expect(localizedPath('/blog/sino-guide', 'tg')).toBe('/tg/blog/sino-guide');
  });
  it('does not localize protected interfaces or external resources', () => {
    for (const value of ['/admin/settings', '/login', '/api/trpc', '/listing/preview/1', 'tel:+992446501414', '//example.com/x', 'https://example.com']) expect(localizedPath(value, 'tg')).toBe(value);
    expect(resolvePublicPath('/tg/admin/settings').canonicalPath).toBe('/admin/settings');
    expect(resolvePublicPath('/tg').basePath).toBe('/');
  });
  it('declares only published, equivalent languages and excludes filtered/noindex pages', () => {
    expect(publishedAlternates('/listings', { tg: ['/listings'] })).toEqual([{ language: 'ru', path: '/listings' }, { language: 'tg', path: '/tg/khonaho-dushanbe' }]);
    expect(publishedAlternates('/contacts', { tg: ['/listings'], en: [] })).toEqual([]);
    expect(publishedAlternates('/listings', { tg: ['/listings'] }, true)).toEqual([]);
  });
  it('allows only an explicitly approved positive-ID listing template to publish future listings', () => {
    expect(isPublicPageComplete('/listing/1000', ['/listing/:id'])).toBe(true);
    expect(publishedAlternates('/listing/1000', { tg: ['/listing/:id'] })).toEqual([{ language: 'ru', path: '/listing/1000' }, { language: 'tg', path: '/tg/khona/1000' }]);
    for (const path of ['/listing/0', '/listing/-2', '/listing/preview/1000', '/services/new', '/blog/new']) expect(isPublicPageComplete(path, ['/listing/:id'])).toBe(false);
  });
});
describe('published translation revision', () => {
  const source = { id: 7, slug: 'district-guide', title: 'Районы Душанбе', contentHtml: '<p>Сино</p>', faq: [{ q: 'Вопрос', a: 'Ответ' }] };
  it('has a reproducible SHA256 source and invalidates changed content/FAQ', () => {
    expect(articleTranslationSource(source)).toBe('{"id":7,"slug":"district-guide","title":"Районы Душанбе","excerpt":"","contentHtml":"<p>Сино</p>","metaTitle":"","metaDescription":"","faq":[{"q":"Вопрос","a":"Ответ"}]}');
    const hash = translationSourceHash(source);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(translationSourceHash({ ...source, excerpt: null, metaTitle: null })).toBe(hash);
    expect(translationSourceHash({ ...source, contentHtml: '<p>Фирдавси</p>' })).not.toBe(hash);
    expect(translationSourceHash({ ...source, faq: [{ q: 'Вопрос', a: 'Новое' }] })).not.toBe(hash);
  });
});
describe('localized structured data', () => {
  it('does not change the soundtrack language when only the watch page is translated', () => {
    const result = localizedStructuredData({ '@type': 'WebPage', mainEntity: { '@type': 'VideoObject', inLanguage: 'ru' } }, 'tg', {});
    expect(result).toEqual({ '@type': 'WebPage', inLanguage: 'tg', mainEntity: { '@type': 'VideoObject', inLanguage: 'ru' } });
  });
  it('localizes human copy and page URLs while preserving schema types and organization identity', () => {
    const schema = { '@type': 'Article', headline: 'Советы', url: 'https://royalhome.tj/blog/guide', publisher: { '@type': 'Organization', name: 'ROYAL HOME', '@id': 'https://royalhome.tj/#organization' } };
    expect(localizedStructuredData(schema, 'tg', { Советы: 'Маслиҳатҳо' })).toEqual({ ...schema, headline: 'Маслиҳатҳо', url: 'https://royalhome.tj/tg/blog/guide', inLanguage: 'tg' });
  });
});
describe('Tajik factual property fallback', () => {
  it('uses official district spelling and correct category rather than Russian apartment copy', () => {
    expect(tajikDistrict('Шоҳмансур')).toBe('Шоҳмансур');
    expect(tajikDistrict('Душанбе, Шохмансур')).toBe('Шоҳмансур');
    const listing = { id: 1, rooms: 3, area: 80, price: 900000, location: 'Фирдавси', category: 'COMMERCIAL' as const, h1Tj: 'Квартираи 3 ҳуҷрагӣ', descriptionTj: 'Продается квартира' };
    expect(tajikPropertyTitle(listing)).toContain('Амволи тиҷоратӣ');
    expect(tajikPropertyTitle(listing)).not.toContain('Квартира');
    expect(tajikPropertyDescription(listing)).not.toContain('Продается');
    expect(tajikPropertyDescription({ ...listing, sold: true })).toContain('фурӯхта шуд');
  });
});

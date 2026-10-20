import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_BOOTSTRAP_MAX_BYTES, parseCatalogBootstrap, serializeCatalogBootstrap, parseListingBootstrap, serializeListingBootstrap } from '@contracts/catalog-bootstrap';
import { PUBLIC_DETAIL_KEYS, projectPublicListing, type PublicListingSource } from '@contracts/public-listing';
import { headForPath, injectSeo, type Head } from './prerenderSeo';
import { findAllListings, findListingById } from '../queries/listings';
import { getCmsEntry } from '../queries/cms';
import { completedLocalePages, getPublicDictionary } from './public-translations';

vi.mock('../queries/listings', () => ({ findAllListings: vi.fn(), findListingById: vi.fn(), findPublishedListingIds: vi.fn() }));
vi.mock('../queries/cms', () => ({ getCmsEntry: vi.fn() }));
vi.mock('./public-translations', () => ({ completedLocalePages: vi.fn(), getPublicDictionary: vi.fn(), getPublicArticleTranslation: vi.fn(), translationSourceHash: vi.fn() }));

const now = 1_800_000_000_000;
const source: PublicListingSource = {
  id: 101, title: 'Реальный объект', location: 'Душанбе, Сино', price: 750000,
  rooms: 2, area: 61, floor: '3/9', totalFloors: 9, type: 'Вторичка',
  stage: 'Построен', repair: 'Хороший', urgent: true, sold: false, published: true,
  category: 'APARTMENT', images: 7, imageUrls: ['/uploads/property.webp'],
  description: 'Описание', seoDesc: null, details: Object.fromEntries(PUBLIC_DETAIL_KEYS.map(key => [key, `Факт ${key}`])),
  date: '2026-10-15', createdAt: new Date('2026-10-01T07:15:16.123Z'), updatedAt: new Date('2026-10-15T00:00:00Z'),
};
const template = '<html><head><title>ROYAL HOME</title></head><body><div id="root"></div></body></html>';
const readScript = (html: string) => /id="royalhome-public-catalog">([^]*?)<\/script>/.exec(html)?.[1];
beforeEach(() => {
  vi.mocked(findAllListings).mockReset().mockResolvedValue([source] as never);
  vi.mocked(getCmsEntry).mockResolvedValue(undefined);
  vi.mocked(completedLocalePages).mockResolvedValue({ tg: ['/listings'], en: ['/listings'] });
  vi.mocked(getPublicDictionary).mockResolvedValue({ strings: { Каталог: 'Феҳрист', Контакты: 'Тамос' }, completedPages: ['/listings'],
    pages: { '/listings': { title: 'Catalogue', description: 'Published homes', h1: 'Homes' } } });
});

describe('complete public catalog bootstrap', () => {
  it('embeds only a published property projection and never carries an unpublished row into detail HTML', async () => {
    vi.mocked(findListingById).mockResolvedValue({ ...source, externalId: 'private-crm', privateNotes: 'private-note', lat: 38.123, lng: 68.456 } as never);
    const html = injectSeo(template, await headForPath('/listing/101'));
    const encoded = /id="royalhome-public-listing">([^]*?)<\/script>/.exec(html)?.[1];
    expect(parseListingBootstrap(encoded!, '/listing/101')?.listing.id).toBe(101);
    expect(encoded).not.toContain('private-crm'); expect(encoded).not.toContain('private-note'); expect(encoded).not.toContain('38.123');
    vi.mocked(findListingById).mockResolvedValue({ ...source, published: false } as never);
    const missing = await headForPath('/listing/101');
    expect(missing.status).toBe(404);expect(missing.noindex).toBe(true);
    expect(injectSeo(template, missing)).not.toContain('royalhome-public-listing');
  });
  it('keeps a complete catalogue with genuinely unknown facts and binds a private-field-free detail snapshot to its ID', () => {
    const row = projectPublicListing({ ...source, type: null, stage: null, repair: null, externalId: 'private' } as PublicListingSource);
    expect(parseCatalogBootstrap(serializeCatalogBootstrap([row], now)!, '/listings', now)?.listings).toEqual([row]);
    const encoded = serializeListingBootstrap(row, now)!;
    expect(parseListingBootstrap(encoded, '/tg/khona/101', now)?.listing).toEqual(row);
    for (const path of ['/listing/102', '/listings', '/admin', '/en/listing/102']) expect(parseListingBootstrap(encoded, path, now)).toBeUndefined();
    expect(parseListingBootstrap(encoded, '/listing/101', now + 30001)).toBeUndefined();
    const value = JSON.parse(encoded); value.listing.externalId = 'private';
    expect(parseListingBootstrap(JSON.stringify(value), '/listing/101', now)).toBeUndefined();
  });
  it('preserves all public facts, dates, sold rows and empty inventory while projecting private fields away', () => {
    const privateSource = { ...source, externalId: 'private-crm', mapAddress: 'Exact private address', lat: 38.123, lng: 68.456,
      agentId: 8, privateNotes: 'secret', details: { ...source.details, ownerPhone: '+992111111111', notes: 'secret details' } };
    const row = projectPublicListing(privateSource);
    expect(row.externalId).toBeNull();
    expect([row.lat, row.lng, row.mapAddress]).toEqual([null, null, null]);
    expect(row).not.toHaveProperty('agentId');
    expect(row).not.toHaveProperty('privateNotes');
    expect(row.details).toEqual(source.details);
    expect(row.createdAt).toBe(source.createdAt);
    const encoded = serializeCatalogBootstrap([row, { ...row, id: 102, sold: true }], now)!;
    const decoded = parseCatalogBootstrap(encoded, '/tg/khonaho-dushanbe?rooms=2', now)!;
    expect(decoded.listings).toEqual([row, { ...row, id: 102, sold: true }]);
    expect(decoded.listings[0].createdAt).toBeInstanceOf(Date);
    expect(decoded.listings[0].date).toBe('2026-10-15');
    expect(parseCatalogBootstrap(serializeCatalogBootstrap([], now)!, '/en/listings', now)?.listings).toEqual([]);
  });

  it('escapes script termination and JS line separators without modifying visible source text', () => {
    const hostile = projectPublicListing({ ...source, title: '</script><script>alert(1)</script>\u2028\u2029', description: '<!-- & "quote"' });
    const encoded = serializeCatalogBootstrap([hostile], now)!;
    expect(encoded).not.toContain('<');
    expect(encoded).not.toContain('\u2028');
    expect(encoded).not.toContain('\u2029');
    expect(encoded).toContain('\\u003c/script>');
    expect(parseCatalogBootstrap(encoded, '/listings', now)?.listings[0].title).toBe(hostile.title);
  });

  it('rejects stale, future, partial, duplicate, malformed, private, oversized and non-catalog seeds atomically', () => {
    const encoded = serializeCatalogBootstrap([projectPublicListing(source)], now)!;
    const value = JSON.parse(encoded);
    const invalid = [
      { ...value, generatedAt: now - 30001 }, { ...value, generatedAt: now + 5001 },
      { ...value, version: 2 }, { ...value, complete: false }, { ...value, total: 8 },
      { ...value, basePath: '/' }, { ...value, error: 'database failed' },
      { ...value, total: 2, listings: [value.listings[0], value.listings[0]] },
      ...[{ lat: 38 }, { externalId: 'private' }, { privateNote: 'secret' }, { published: false },
        { price: '750000' }, { details: { ownerPhone: 'secret' } }, { createdAt: 'not-a-date' }]
        .map(change => ({ ...value, listings: [{ ...value.listings[0], ...change }] })),
    ];
    for (const seed of invalid) expect(parseCatalogBootstrap(JSON.stringify(seed), '/listings', now)).toBeUndefined();
    expect(parseCatalogBootstrap(encoded, '/listings', now + 30000)).toBeDefined();
    expect(parseCatalogBootstrap(JSON.stringify({ ...value, generatedAt: now + 5000 }), '/listings', now)?.generatedAt).toBe(now);
    expect(parseCatalogBootstrap('{invalid', '/listings', now)).toBeUndefined();
    expect(parseCatalogBootstrap(' '.repeat(CATALOG_BOOTSTRAP_MAX_BYTES + 1), '/listings', now)).toBeUndefined();
    for (const route of ['/admin/listings', '/listing/101', '/en/contacts']) expect(parseCatalogBootstrap(encoded, route, now)).toBeUndefined();
    for (const route of ['/', '/tg', '/en']) expect(parseCatalogBootstrap(encoded, route, now)?.listings).toHaveLength(1);
    expect(serializeCatalogBootstrap([{ ...projectPublicListing(source), title: 'x'.repeat(CATALOG_BOOTSTRAP_MAX_BYTES) }], now)).toBeUndefined();
    expect(serializeCatalogBootstrap([{ ...projectPublicListing(source), createdAt: new Date('invalid') }], now)).toBeUndefined();
  });

  it('reuses the successful read once in RU/TG/EN, including filtered routes, without exposing admin/source fields', async () => {
    for (const route of ['/listings', '/listings?rooms=2', '/tg/khonaho-dushanbe', '/en/listings']) {
      vi.mocked(findAllListings).mockClear();
      const head = await headForPath(route);
      expect(head.status ?? 200).toBe(200);
      expect(findAllListings).toHaveBeenCalledTimes(1);
      const html = injectSeo(template, head);
      expect(readScript(html)).toBeDefined();
      expect(html.match(/id="royalhome-public-catalog"/g)).toHaveLength(1);
      expect(parseCatalogBootstrap(readScript(html)!, route)?.listings).toEqual([projectPublicListing(source)]);
    }
  });

  it('never seeds failed/unavailable pages, private paths or an error masquerading as an empty inventory', async () => {
    const head: Head = { title: 'Homes', description: 'Catalogue', image: '/og.jpg', url: 'https://royalhome.tj/listings', type: 'website', catalogInventory: [projectPublicListing(source)] };
    for (const status of [404, 503] as const) expect(readScript(injectSeo(template, { ...head, status }))).toBeUndefined();
    expect(readScript(injectSeo(template, { ...head, url: 'https://royalhome.tj/admin/listings' }))).toBeUndefined();
    vi.mocked(findAllListings).mockRejectedValueOnce(new Error('database unavailable'));
    const failed = await headForPath('/listings');
    expect(failed.status).toBe(503);
    expect(readScript(injectSeo(template, failed))).toBeUndefined();
    vi.mocked(getPublicDictionary).mockResolvedValue(undefined);
    expect(readScript(injectSeo(template, await headForPath('/tg/khonaho-dushanbe')))).toBeUndefined();
  });
});

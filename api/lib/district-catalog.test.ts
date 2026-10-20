import { beforeEach, describe, expect, it, vi } from 'vitest';
import { districtFromPath, districtListings, districtStats, districtMatchesLocation, DISTRICT_PAGES } from '@contracts/district-catalog';
import { projectPublicListing } from '@contracts/public-listing';
import { parseCatalogBootstrap, CATALOG_BOOTSTRAP_ID } from '@contracts/catalog-bootstrap';
vi.mock('../queries/listings', () => ({ findAllListings: vi.fn(), findListingById: vi.fn() }));
vi.mock('../queries/cms', () => ({ getCmsEntry: vi.fn() }));
vi.mock('../queries/articles', () => ({ findPublishedArticles: vi.fn(), findPublishedArticleBySlug: vi.fn() }));
import { findAllListings } from '../queries/listings';
import { getCmsEntry } from '../queries/cms';
import { findPublishedArticles } from '../queries/articles';
import { headForPath, injectSeo } from './prerenderSeo';
import { buildSitemapXml } from './sitemap';
import { districtCopy } from '@contracts/district-copy';

const base = { id: 1, title: '2-комнатная квартира', location: 'Сино, Душанбе', rooms: 2, price: 600000, area: 60,
  category: 'APARTMENT' as const, type: 'Вторичка' as const, floor: '6/12', totalFloors: 12, repair: 'Хорошее состояние', stage: null,
  images: 0, imageUrls: [], seoDesc: null, details: null, date: null, urgent: false, sold: false, published: true,
  createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-15'), externalId: 'private-source-id' };
const rows = [base, { ...base, id: 2, price: 1000000, area: 100 }, { ...base, id: 3, sold: true, price: 1 },
  { ...base, id: 4, category: 'HOUSE' as const, price: 2 }, { ...base, id: 5, location: 'Исмоили Сомони, Душанбе', price: 800000 },
  { ...base, id: 6, location: 'Шохмансур, Душанбе', price: 700000 },
  { ...base, id: 7, location: 'Душанбе, р-н Фирдавси, ул. Сомони', price: 900000 },
  { ...base, id: 8, location: 'Шохмансур, Душанбе', sold: true },
  { ...base, id: 9, location: 'Фирдавси, Душанбе', category: 'HOUSE' as const }];
const template = '<html><head><title>ROYAL HOME</title><meta name="description" content="old" /></head><body><div id="root"></div></body></html>';
beforeEach(() => {
  vi.mocked(findAllListings).mockResolvedValue(rows as unknown as Awaited<ReturnType<typeof findAllListings>>);
  vi.mocked(getCmsEntry).mockResolvedValue(undefined);
  vi.mocked(findPublishedArticles).mockResolvedValue({ items: [], total: 0 });
});

describe('district catalog publication', () => {
  it('uses active apartments from the correct district and computes only that asking-price sample', () => {
    const selected = districtListings(rows, DISTRICT_PAGES[0]);
    expect(selected.map(row => row.id).sort()).toEqual([1, 2]);
    expect(districtStats(selected)).toMatchObject({ count: 2, min: 600000, max: 1000000, median: 800000, medianPerMeter: 10000 });
    expect(districtFromPath('/kvartiry/rayon-unknown')).toBeUndefined();
    expect(districtMatchesLocation('Душанбе, р-н Сино, ул. Сомони', DISTRICT_PAGES[1])).toBe(false);
    expect(districtMatchesLocation('Исмоили Сомони, Худжанд', DISTRICT_PAGES[1])).toBe(false);
    expect(districtMatchesLocation('Душанбе, р-н И. Сомони', DISTRICT_PAGES[1])).toBe(true);
  });
  it('recognizes all four districts without mistaking a street or another city for a district', () => {
    expect(DISTRICT_PAGES).toHaveLength(4);
    const shohmansur = districtFromPath('/kvartiry/rayon-shohmansur')!;
    const firdavsi = districtFromPath('/kvartiry/rayon-firdavsi')!;
    expect(districtListings(rows, shohmansur).map(row => row.id)).toEqual([6]);
    expect(districtListings([...rows, { ...base, id: 10, location: 'Фирдавси, Душанбе', published: false }], firdavsi).map(row => row.id)).toEqual([7]);
    expect(districtMatchesLocation('Шоҳмансур, Душанбе', shohmansur)).toBe(true);
    expect(districtMatchesLocation('Фирдавсӣ, Душанбе', firdavsi)).toBe(true);
    expect(districtMatchesLocation('Фирдоуси, Душанбе', firdavsi)).toBe(true);
    expect(districtMatchesLocation('Шохмансур, Вахдат', shohmansur)).toBe(false);
    expect(districtMatchesLocation('Сино, Душанбе, ул. Фирдавси', firdavsi)).toBe(false);
    for (const locale of ['ru', 'tg', 'en'] as const) {
      const intros = DISTRICT_PAGES.map(d => districtCopy(d, locale).intro);
      expect(new Set(intros).size).toBe(4);
      expect(districtCopy(shohmansur, locale).intro).toContain(shohmansur.names[locale]);
      expect(districtCopy(firdavsi, locale).intro).toContain(firdavsi.names[locale]);
    }
  });
  it.each(DISTRICT_PAGES.flatMap(district => ['', '/tg', '/en'].map(prefix => ({ district, prefix }))))('publishes the right district and locale at $prefix/kvartiry/$district.slug', async ({ district, prefix }) => {
    const path = `${prefix}/kvartiry/${district.slug}`, head = await headForPath(path);
    const selected = districtListings(rows, district);
    expect(head.status ?? 200).toBe(200); expect(head.noindex).toBe(false);
    expect(head.url).toBe(`https://royalhome.tj${path}`);
    expect(head.alternates?.map(item => item.language)).toEqual(['ru', 'tg', 'en']);
    expect(head.jsonLd).toMatchObject({ '@type': 'CollectionPage', mainEntity: { numberOfItems: selected.length } });
    expect(head.body).toContain(prefix === '/tg' ? `/tg/khona/${selected[0].id}` : `${prefix}/listing/${selected[0].id}`);
    expect(head.body).not.toContain(prefix === '/tg' ? '/tg/khona/3' : `${prefix}/listing/3`);
    const html = injectSeo(template, head);
    const bootstrap = new RegExp(`<script type="application/json" id="${CATALOG_BOOTSTRAP_ID}">([^<]+)</script>`).exec(html)?.[1];
    const parsed = parseCatalogBootstrap(bootstrap ?? '', path);
    expect(parsed?.listings.length).toBe(rows.length);
    expect(JSON.stringify(parsed)).not.toContain('private-source-id');
    expect(parsed?.listings[0]).toEqual(projectPublicListing(base));
  });
  it('handles missing, empty and filtered district routes without indexable duplicates', async () => {
    expect((await headForPath('/kvartiry/rayon-unknown')).status).toBe(404);
    expect((await headForPath('/kvartiry/rayon-sino?rooms=2')).noindex).toBe(true);
    expect((await headForPath('/kvartiry/rayon-sino?utm_source=test')).url).toBe('https://royalhome.tj/kvartiry/rayon-sino');
    vi.mocked(findAllListings).mockResolvedValue([]);
    expect((await headForPath('/kvartiry/rayon-sino')).noindex).toBe(true);
    expect(await buildSitemapXml()).not.toContain('/kvartiry/rayon-sino');
  });
  it('includes all populated district pages and their published translations in sitemap', async () => {
    const sitemap = await buildSitemapXml();
    for (const district of DISTRICT_PAGES) for (const prefix of ['', '/tg', '/en']) expect(sitemap).toContain(`https://royalhome.tj${prefix}/kvartiry/${district.slug}`);
    expect((await headForPath('/')).body).toContain('/kvartiry/rayon-sino');
    expect((await headForPath('/listings')).body).toContain('/kvartiry/rayon-ismoili-somoni');
  });
});

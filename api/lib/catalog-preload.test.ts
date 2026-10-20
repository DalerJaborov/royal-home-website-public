import { describe, expect, it } from 'vitest';
import { catalogCoverPreload } from './catalog-preload';
import { compareCatalogOrder } from '@contracts/catalog-order';
import { toCatalogImageUrl } from '@contracts/image-urls';
import { injectSeo, type Head } from './prerenderSeo';

describe('initial catalog resource discovery', () => {
  it('keeps hydrated public email markup stable through Cloudflare without changing legacy pages', () => {
    const template = '<html><head><title>ROYAL HOME</title></head><body><div id="root"></div></body></html>';
    const body = '<footer><a href="mailto:info@royalhome.tj">info@royalhome.tj</a></footer>';
    const head: Head = { title: 'Каталог', description: 'Описание', image: '/og-image.jpg', url: 'https://royalhome.tj/listings', type: 'website', body, hydrate: true };
    const html = injectSeo(template, head);
    expect(html).toContain(`<!--email_off--><div id="root" data-public-ssr="true">${body}</div><!--/email_off-->`);
    expect(injectSeo(template, { ...head, hydrate: false })).not.toContain('email_off');
  });
  const rows = [
    { id: 90, sold: false, imageUrls: ['/uploads/older.webp'] },
    { id: 120, sold: true, imageUrls: ['/uploads/sold.webp'] },
    { id: 104, sold: false, imageUrls: ['/uploads/f87386ef-2a61-4de8-bb53-3345dc912c07.webp'] },
  ];
  it('preloads the actual first UI cover regardless of database/createdAt order, without mutating rows', () => {
    const firstRendered = [...rows].sort(compareCatalogOrder)[0];
    expect(firstRendered.id).toBe(104);
    expect(catalogCoverPreload('/listings', rows)).toBe('/media/card-v2/f87386ef-2a61-4de8-bb53-3345dc912c07.webp');
    for (const route of ['/listings', '/tg/khonaho-dushanbe', '/en/listings']) expect(catalogCoverPreload(route, rows)).toBe(toCatalogImageUrl(firstRendered.imageUrls[0]));
    expect(rows.map(row => row.id)).toEqual([90, 120, 104]);
  });
  it('does not preload a wrong filtered image, a hidden photo, a foreign URL or an archived-only catalog', () => {
    for (const route of ['/listings?rooms=2', '/tg/khonaho-dushanbe?q=Сино', '/en/listings?category=HOUSE', '/']) expect(catalogCoverPreload(route, rows)).toBeUndefined();
    expect(catalogCoverPreload('/listings', [])).toBeUndefined();
    expect(catalogCoverPreload('/listings', [{ ...rows[2], imageUrls: [] }, rows[0]])).toBeUndefined();
    expect(catalogCoverPreload('/listings', [{ ...rows[2], imageUrls: ['//foreign.test/x.webp'] }])).toBeUndefined();
    expect(catalogCoverPreload('/listings', [{ ...rows[2], sold: true }])).toBeUndefined();
  });
  it('discovers known absolute CRM covers as local variants while refusing foreign hosts', () => {
    const filename = 'f87386ef-2a61-4de8-bb53-3345dc912c07.webp';
    for (const host of ['crm.royalhome.tj', 'royalhome.tj']) {
      for (const route of ['/listings', '/tg/khonaho-dushanbe', '/en/listings']) {
        expect(catalogCoverPreload(route, [{ id: 1, imageUrls: [`https://${host}/uploads/${filename}`] }])).toBe(`/media/card-v2/${filename}`);
      }
    }
    expect(catalogCoverPreload('/listings', [{ id: 1, imageUrls: [`https://foreign.test/uploads/${filename}`] }])).toBeUndefined();
  });
  it('puts a single escaped priority image in initial HTML, with no download on failed pages', () => {
    const head: Head = { title: 'Каталог', description: 'Описание', image: '/og-image.jpg', url: 'https://royalhome.tj/listings', type: 'website', preloadImage: '/uploads/thumbs/a.webp?x=1&y=2' };
    const template = '<html><head><title>ROYAL HOME</title></head><body><div id="root"></div></body></html>';
    const html = injectSeo(template, head);
    expect(html.match(/as="image"/g)).toHaveLength(1);
    expect(html).toContain('href="/uploads/thumbs/a.webp?x=1&amp;y=2" fetchpriority="high"');
    expect(injectSeo(template, { ...head, status: 503 })).not.toContain('as="image"');
    expect(injectSeo(template, { ...head, status: 404 })).not.toContain('as="image"');
  });
});

import { describe, expect, it, vi } from 'vitest';
vi.mock('./env', () => ({ env: { databaseUrl: '', isProduction: false } }));
vi.mock('../queries/cms', () => ({ getCmsEntry: vi.fn() }));
vi.mock('../queries/articles', () => ({ findPublishedArticleBySlug: vi.fn(), findPublishedArticles: vi.fn(async () => ({ items: [], total: 0 })) }));
import { createListing, updateListing, findListingById } from '../queries/listings';
import { memoryDeleteListing, memoryUpdateListing } from '../queries/memory-store';
import { headForPath } from './prerenderSeo';
import { buildSitemapXml } from './sitemap';
import { localizedPath } from '@contracts/public-i18n';

describe('future listing lifecycle, without production records or provider calls', () => {
  it('creates metadata, follows fact changes and removes all published routes after unpublish', async () => {
    const id = await createListing({ title: 'LOCAL SEO FIXTURE', location: 'Сино, Душанбе',
      price: 700000, rooms: 1, area: 41, floor: '2/9', published: false,
      imageUrls: ['/uploads/local-seo-fixture.webp'] });
    try {
      const first = await findListingById(id);
      expect(first?.metaTitle).toContain('41');
      expect(first?.metaTitleTj).toContain('41');
      expect(await buildSitemapXml()).not.toContain(`/listing/${id}</loc>`);
      // Public fixture state only: no real CRM writes or external publication.
      memoryUpdateListing(id, { published: true, crmShortId: 990123,
        videoUrl: 'https://crm.royalhome.tj/api/v1/public/property-video/990123.mp4' });
      await updateListing(id, { rooms: 3, area: 97, price: 1250000, location: 'Фирдавси, Душанбе', floor: '7/12' });
      const updated = await findListingById(id);
      expect(updated?.metaTitle).toContain('97');
      expect(updated?.metaTitleTj).toContain('97');
      expect(updated?.descriptionTj).toContain('7/12');
      const xml = await buildSitemapXml();
      for (const locale of ['ru', 'tg', 'en'] as const) {
        for (const suffix of ['', '/video']) {
          const path = localizedPath(`/listing/${id}${suffix}`, locale);
          expect(xml).toContain(`${path}</loc>`);
          const head = await headForPath(path);
          expect(head.status ?? 200).toBe(200);
          expect(head.noindex ?? false).toBe(false);
          expect(head.title).toContain('97');
          expect(head.title).not.toContain('41');
          expect(head.url).toBe(`https://royalhome.tj${path}`);
          expect(head.alternates).toHaveLength(3);
          expect(JSON.stringify(head.jsonLd).replace(/[\s,]/g, '')).toContain('1250000');
        }
      }
      await updateListing(id, { h1: 'Авторский заголовок', metaDescription: 'Ручное описание для покупателя' });
      await updateListing(id, { area: 98, price: 1300000 });
      expect(await findListingById(id)).toMatchObject({ h1: 'Авторский заголовок', metaDescription: 'Ручное описание для покупателя' });
      memoryUpdateListing(id, { sold: true });
      for (const locale of ['ru', 'tg', 'en'] as const) {
        const sold = await headForPath(localizedPath(`/listing/${id}`, locale));
        expect(JSON.stringify(sold.jsonLd)).toContain('SoldOut');
      }
      memoryUpdateListing(id, { published: false });
      const hiddenXml = await buildSitemapXml();
      for (const locale of ['ru', 'tg', 'en'] as const) for (const suffix of ['', '/video']) {
        const path = localizedPath(`/listing/${id}${suffix}`, locale);
        expect(hiddenXml).not.toContain(`${path}</loc>`);
        const head = await headForPath(path);
        expect(head.status).toBe(404);
        expect(head.noindex).toBe(true);
        expect(head.body).not.toContain('LOCAL SEO FIXTURE');
      }
    } finally { memoryDeleteListing(id); }
  });
});

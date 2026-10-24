import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../queries/listings', () => ({ findListingById: vi.fn(), findAllListings: vi.fn() }));
import { findListingById } from '../queries/listings';
import { videoWatchHead } from './video-watch-head';
import { headForPath, injectSeo } from './prerenderSeo';
import { localizedPath, resolvePublicPath } from '@contracts/public-i18n';
import { parseListingBootstrap, serializeListingBootstrap } from '@contracts/catalog-bootstrap';
import { projectPublicListing } from '@contracts/public-listing';

const source = { id: 120, title: 'Квартира <дом>', rooms: 2, area: 80, price: 800000, location: 'Сино, Душанбе',
  category: 'APARTMENT' as const, published: true, sold: false, images: 1, floor: null, stage: null, repair: null, type: null,
  urgent: false, seoDesc: null, date: null, crmShortId: 183, imageUrls: ['/uploads/cover.webp'],
  videoUrl: 'https://crm.royalhome.tj/api/v1/public/property-video/183.mp4',
  createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-02') };
beforeEach(() => { vi.mocked(findListingById).mockReset().mockResolvedValue(source as never); });

describe('individual video watch pages', () => {
  it.each(['ru', 'tg', 'en'] as const)('provides visible video, self canonical and reciprocal language links in %s without JS', async locale => {
    const path = localizedPath('/listing/120/video', locale);
    const head = await headForPath(path);
    expect(head.status).toBe(200);
    expect(head.language).toBe(locale);
    expect(head.url).toBe(`https://royalhome.tj${path}`);
    expect(head.alternates).toHaveLength(3);
    const html = injectSeo('<html><head><title>old</title></head><body><div id="root"></div></body></html>', head);
    expect(html).toContain('hreflang="x-default" href="https://royalhome.tj/listing/120/video"');
    expect(html).toContain('max-image-preview:large');
    expect(head.body).toContain('<video controls playsinline preload="none"');
    expect(head.body).toContain('src="/media/listing-video/120.mp4"');
    expect(head.body).not.toContain('<дом>');
    expect(head.body).toContain(localizedPath('/listing/120', locale));
    const graph = head.jsonLd as { mainEntity: { contentUrl: string; inLanguage: string } };
    expect(graph.mainEntity.inLanguage).toBe('ru');
    expect(graph.mainEntity.contentUrl).toBe('https://royalhome.tj/media/listing-video/120.mp4');
    expect(resolvePublicPath(path).basePath).toBe('/listing/120/video');
  });
  it('reuses only the matching public detail snapshot on the watch route', () => {
    const wire = serializeListingBootstrap(projectPublicListing(source))!;
    expect(parseListingBootstrap(wire, '/tg/khona/120/video')?.listing.id).toBe(120);
    expect(parseListingBootstrap(wire, '/listing/121/video')).toBeUndefined();
    expect(parseListingBootstrap(wire, '/admin/120/video')).toBeUndefined();
  });
  it.each([{ published: false }, { videoUrl: null }, { imageUrls: [] }, { createdAt: undefined }])('omits unavailable or incomplete video %j from indexable pages', async extra => {
    vi.mocked(findListingById).mockResolvedValue({ ...source, ...extra } as never);
    expect(await videoWatchHead(120, 'ru')).toBeNull();
    const head = await headForPath('/listing/120/video');
    expect(head.status).toBe(404);
    expect(head.noindex).toBe(true);
    const html = injectSeo('<html><head><link rel="canonical" href="old" /></head><body><div id="root"></div></body></html>', head);
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('<video');
  });
  it('uses 503 for a database outage, preserving the page for a retry', async () => {
    vi.mocked(findListingById).mockRejectedValue(new Error('db'));
    expect((await headForPath('/listing/120/video')).status).toBe(503);
  });
});

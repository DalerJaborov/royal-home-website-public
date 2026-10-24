import { afterEach, describe, expect, it, vi } from 'vitest';
const metaView = vi.hoisted(() => vi.fn());
vi.mock('./hooks/useMetaPixel', async importOriginal => ({
  ...await importOriginal<typeof import('./hooks/useMetaPixel')>(), useMetaListingView: metaView,
}));
import { renderPublicApplication } from './entry-server';
import './pages/ListingVideoPage';
import { projectPublicListing, type PublicListingSource } from '@contracts/public-listing';
import { readFileSync } from 'node:fs';
const listing: PublicListingSource = { id: 990123, title: 'LOCAL VIDEO FIXTURE', location: 'Сино, Душанбе',
  price: 800000, rooms: 2, area: 60, floor: '4/9', totalFloors: 9, type: null, stage: null, repair: null,
  urgent: false, sold: false, published: true, category: 'APARTMENT', images: 1,
  imageUrls: ['/uploads/local-video-fixture.webp'], seoDesc: null, date: null, crmShortId: 990124,
  videoUrl: 'https://crm.royalhome.tj/api/v1/public/property-video/990124.mp4',
  createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-02') };
afterEach(() => { metaView.mockClear(); vi.unstubAllGlobals(); });
describe('video pages use the existing listing analytics contract', () => {
  it.each(['ru', 'tg', 'en'] as const)('associates a valid %s watch page with the native listing id, without provider requests during SSR', async locale => {
    const fetch = vi.fn(() => { throw Error('No external tracking in SSR'); }); vi.stubGlobal('fetch', fetch);
    const dictionary = locale === 'ru' ? undefined : JSON.parse(readFileSync(new URL(`../public/locales/${locale}.json`, import.meta.url), 'utf8'));
    const path = locale === 'tg' ? `/tg/khona/${listing.id}/video` : `${locale === 'en' ? '/en' : ''}/listing/${listing.id}/video`;
    await renderPublicApplication({ path, cms: {}, inventory: [], listing: projectPublicListing(listing), dictionary });
    expect(metaView).toHaveBeenCalledWith(listing.id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not record a listing view for a page without a playable video', async () => {
    await renderPublicApplication({ path: `/listing/${listing.id}/video`, cms: {}, inventory: [],
      listing: projectPublicListing({ ...listing, videoUrl: null }) });
    expect(metaView).toHaveBeenCalledWith(undefined);
    expect(metaView).not.toHaveBeenCalledWith(listing.id);
  });
});

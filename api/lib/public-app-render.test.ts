import { afterEach, expect, it, vi } from 'vitest';
import { publicAppHtml } from './public-app-render';
import { projectPublicListing } from '@contracts/public-listing';

afterEach(() => vi.restoreAllMocks());

it('keeps the existing fallback when a complete browser snapshot cannot be included', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const listing = projectPublicListing({ id: 886661, title: 'Snapshot bound fixture', location: 'Душанбе', price: 800000, rooms: 2, area: 60,
    floor: null, totalFloors: null, type: null, stage: null, repair: null, urgent: false, sold: false, published: true, category: 'APARTMENT',
    images: 0, imageUrls: [], seoDesc: null, date: null, description: 'x'.repeat(600000), createdAt: new Date(), updatedAt: new Date() });
  expect(await publicAppHtml({ path: '/listings', cms: {}, inventory: [listing] })).toBeUndefined();
  // Refusal is handled before attempting the optional compiled renderer.
  expect(log).not.toHaveBeenCalled();
});

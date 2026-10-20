import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPublicApplication } from './entry-server';
// Vitest transforms lazy TSX on first import; production serves precompiled JS.
// Keep that test-runner compilation outside the real 1.5 second render budget.
import './pages/ListingsPage';
import { projectPublicListing, type PublicListingSource } from '@contracts/public-listing';
const source: PublicListingSource = { id: 885551, title: 'PUBLIC_RENDER_FIXTURE', location: 'Сино, Душанбе', price: 800000, rooms: 2, area: 60,
  floor: '4/9', totalFloors: 9, type: 'Вторичка', stage: null, repair: null, urgent: false, sold: false, published: true, category: 'APARTMENT',
  images: 2, imageUrls: ['/uploads/public-render-fixture.webp', '/uploads/public-render-fixture-two.webp'], seoDesc: null, date: null,
  createdAt: new Date('2026-10-15T00:00:00Z'), updatedAt: new Date('2026-10-15T00:00:00Z') };
afterEach(() => vi.unstubAllGlobals());
describe('the same public React tree renders before JavaScript', () => {
  it('renders real controls and inventory without server-side API calls or browser-only state', async () => {
    const fetch = vi.fn(() => { throw Error('SSR must use supplied public data'); }); vi.stubGlobal('fetch', fetch);
    const html = await renderPublicApplication({ path: '/listings', cms: {}, inventory: [projectPublicListing(source)] });
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.includes('site-header')).toBe(true); expect(html.includes('PUBLIC_RENDER_FIXTURE')).toBe(true);
    expect(html.includes('aria-label="Следующее фото"')).toBe(true);
    expect(html.includes('aria-label="Поиск по каталогу объектов"')).toBe(true);
    expect(html.includes('<script>')).toBe(false);
    expect(html.includes('hidden id=')).toBe(false);
    expect(html.startsWith('<div')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('isolates concurrent request caches and does not retain the previous property', async () => {
    const [a, b] = await Promise.all(['ISOLATED_A', 'ISOLATED_B'].map(title => renderPublicApplication({ path: '/listings', cms: {}, inventory: [projectPublicListing({ ...source, title })] })));
    expect(a).toContain('ISOLATED_A'); expect(a).not.toContain('ISOLATED_B');
    expect(b).toContain('ISOLATED_B'); expect(b).not.toContain('ISOLATED_A');
  });
  it('does not change initial markup based on IntersectionObserver availability', async () => {
    const input = { path: '/listings', cms: {}, inventory: Array.from({length: 10}, (_,index) => projectPublicListing({...source,id:885551+index})) };
    const server = await renderPublicApplication(input);
    vi.stubGlobal('IntersectionObserver', class {});
    const browserCapableServer = await renderPublicApplication(input);
    expect(server === browserCapableServer).toBe(true);
  });
  it('does not change initial install labels based on a mobile user agent', async () => {
    const input = { path: '/listings', cms: {}, inventory: [projectPublicListing(source)] };
    const server = await renderPublicApplication(input);
    vi.stubGlobal('navigator', { userAgent: 'iPhone' });
    const mobile = await renderPublicApplication(input);
    expect(server === mobile).toBe(true);
  });
});

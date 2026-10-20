import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
vi.mock('../queries/cms', () => ({ getCmsEntry: vi.fn() }));
vi.mock('../queries/listings', () => ({ findListingById: vi.fn(), findAllListings: vi.fn().mockResolvedValue([]) }));
vi.mock('../queries/articles', () => ({ findPublishedArticleBySlug: vi.fn(), findPublishedArticles: vi.fn().mockResolvedValue({ items: [], total: 0 }) }));
import { getCmsEntry } from '../queries/cms';
import { headForPath, injectSeo } from './prerenderSeo';
const template = '<html><head><title>ROYAL HOME</title><meta name="description" content="old" /><script type="application/ld+json">{"@type":"RealEstateAgent","telephone":"+992918641718"}</script></head><body><div id="root"></div></body></html>';
beforeEach(() => vi.mocked(getCmsEntry).mockReset());
describe('contact roles in initial HTML and structured data', () => {
  it('stale CMS telephone and contact metadata cannot restore old public contacts', async () => {
    vi.mocked(getCmsEntry).mockResolvedValue({ phone: '+992918641718', pageSeo: { contacts: { title: 'Контакты', description: 'Телефон +992 777 77 60 01' } } });
    const head = await headForPath('/contacts');
    const html = injectSeo(template, head);
    expect(head.description).toContain(COMPANY_CONTACTS.callDisplay);
    expect(html).toContain(`href="${COMPANY_CONTACTS.callHref}"`);
    expect(html).not.toContain('href=""');
    expect(html).not.toContain('WhatsApp:');
    expect(html).toContain(`href="${COMPANY_CONTACTS.whatsappHref}"`);
    expect(html).not.toContain('wa.me/992446501414');
    expect(html).not.toMatch(/918[\s().-]*641[\s().-]*718/);
    expect(html).not.toContain('tel:+992777776001');
    const schema = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html);
    expect(JSON.parse(schema![1]).telephone.replace(/\D/g, '')).toBe(COMPANY_CONTACTS.callNumber.slice(1));
  });
  it('fallback contacts expose separate confirmed call and messenger lines', async () => {
    const html = injectSeo(template, await headForPath('/contacts'));
    expect(html).toContain(COMPANY_CONTACTS.callDisplay);
    expect(html).not.toContain('href=""');
    expect(html).toContain(`href="${COMPANY_CONTACTS.whatsappHref}"`);
    expect(html).not.toMatch(/918[\s().-]*641[\s().-]*718/);
  });
});

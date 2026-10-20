import { describe, expect, it } from 'vitest';
import { COMPANY_CONTACTS, COMPANY_HOURS, normalizeCompanyContactText, normalizeCompanySiteSettings, normalizePublicCmsEntry } from '@contracts/company-contacts';
import { normalizeCompanyPublicValue } from '@contracts/company-contacts';
describe('agency call and WhatsApp roles', () => {
  it('keeps separate owner-confirmed call and WhatsApp lines', () => {
    expect(COMPANY_CONTACTS.callHref).toBe('tel:+992446501414');
    expect(COMPANY_CONTACTS.whatsappHref).toBe('https://wa.me/992777776001');
    expect(COMPANY_CONTACTS.callNumber).not.toBe(COMPANY_CONTACTS.whatsappNumber);
  });
  it('normalizes stale CMS site values and metadata without mutating input', () => {
    const stale = { phone: '+992 918 641 718', whatsapp: '+992446501414', workHours: 'Пн–Сб: 09:00–18:00', pageSeo: { contacts: { description: 'Телефон +992 777 77 60 01' } } };
    const result = normalizeCompanySiteSettings(stale);
    expect(result.phone).toBe(COMPANY_CONTACTS.callDisplay);
    expect(result.whatsapp).toBe(COMPANY_CONTACTS.whatsappNumber);
    expect(result.workHours).toBe(COMPANY_HOURS.display);
    expect(result.pageSeo.contacts.description).toBe(`Телефон ${COMPANY_CONTACTS.callDisplay}`);
    expect(stale.phone).toBe('+992 918 641 718');
    expect(stale.workHours).toBe('Пн–Сб: 09:00–18:00');
    expect(normalizeCompanySiteSettings({ workHours: 'Дш–Шб: 09:00–18:00' }).workHours).toBe('Дш–Шб: 09:30–18:00');
    expect(normalizeCompanySiteSettings({ workHours: 'Mon–Sat: 09:00–18:00' }).workHours).toBe('Mon–Sat: 09:30–18:00');
  });
  it('routes legacy messenger links to WhatsApp and telephone links to the call line', () => {
    const result = normalizeCompanyContactText('<a href="tel:+992777776001">+992 777 77 60 01</a><a href="https://wa.me/992918641718?text=Hello">+992 918 641 718</a>');
    expect(result).toContain(`href="${COMPANY_CONTACTS.callHref}"`);
    expect(result.match(/href="tel:\+992446501414"/g)).toHaveLength(1);
    expect(result).toContain(`>${COMPANY_CONTACTS.callDisplay}</a>`);
    expect(result).toContain(`href="${COMPANY_CONTACTS.whatsappHref}?text=Hello"`);
    expect(result).toContain(`>${COMPANY_CONTACTS.whatsappDisplay}</a>`);
    expect(normalizeCompanyContactText('WhatsApp: <a href="https://wa.me/992777776001">Написать</a>')).toBe(`WhatsApp: <a href="${COMPANY_CONTACTS.whatsappHref}">Написать</a>`);
    expect(result).not.toMatch(/918[\s().-]*641[\s().-]*718/);
  });
  it('corrects labelled messenger numbers while preserving unrelated destinations and share links', () => {
    expect(normalizeCompanyContactText('WhatsApp: +992446501414')).toBe(`WhatsApp: ${COMPANY_CONTACTS.whatsappDisplay}`);
    expect(normalizeCompanyContactText('https://api.whatsapp.com/send?phone=992446501414&text=Hello%20world')).toBe(`${COMPANY_CONTACTS.whatsappHref}?text=Hello%20world`);
    expect(normalizeCompanyContactText('Риелтор +992901234567')).toBe('Риелтор +992901234567');
    expect(normalizeCompanyContactText('<a href="https://wa.me/992901234567?text=Hi">Агент</a>')).toBe('<a href="https://wa.me/992901234567?text=Hi">Агент</a>');
    expect(normalizeCompanyContactText('https://wa.me/?text=Share')).toBe('https://wa.me/?text=Share');
  });
  it('keeps normalization idempotent and restores owner-confirmed messenger visibility', () => {
    const input = `Звонки: +992777776001. WhatsApp: +992446501414. <a href="https://wa.me/992777776001?text=Hello">+992 777 77 60 01</a>`;
    const normalized = normalizeCompanyContactText(input);
    expect(normalizeCompanyContactText(normalized)).toBe(normalized);
    expect(normalizeCompanySiteSettings({ socialVisibility: { whatsapp: false } })).toMatchObject({ whatsapp: COMPANY_CONTACTS.whatsappNumber, socialVisibility: { whatsapp: true } });
  });
  it('preserves a labelled WhatsApp number inside a legacy HTML anchor', () => {
    const result = normalizeCompanyContactText('<a href="https://wa.me/992446501414">WhatsApp: +992 44 650 14 14</a>');
    expect(result).toBe(`<a href="${COMPANY_CONTACTS.whatsappHref}">WhatsApp: ${COMPANY_CONTACTS.whatsappDisplay}</a>`);
    expect(result).not.toContain('__ROYAL_CONTACT_');
  });
  it('cleans public CMS blog content and never rewrites API-key settings', () => {
    expect(normalizePublicCmsEntry('blogPosts', [{ content: 'Звоните +992-918-641-718' }])).toEqual([{ content: `Звоните ${COMPANY_CONTACTS.callDisplay}` }]);
    expect(normalizePublicCmsEntry('geminiApiKey', 'secret-992918641718')).toBe('secret-992918641718'); // gitleaks:allow -- reviewed synthetic test value or non-secret identifier
  });
  it('public record normalization preserves dates and numeric fields', () => {
    const date = new Date('2026-10-15T00:00:00Z');
    const record = normalizeCompanyPublicValue({ createdAt: date, price: 100, description: '+992777776001' });
    expect(record.createdAt).toBe(date); expect(record.price).toBe(100);
    expect(record.description).toBe(COMPANY_CONTACTS.callDisplay);
  });
  it('uses the owner-corrected TikTok in live CMS and translated site settings', () => {
    for (const tiktok of ['', 'https://tiktok.com/@royal.home.tj', 'https://www.tiktok.com/@royal.home.tj8']) {
      const original = { tiktok, instagram: 'https://instagram.com/royal.home.tj', socialVisibility: { tiktok: false } };
      const normalized = normalizePublicCmsEntry('site', original);
      expect(normalized).toMatchObject({ tiktok: 'https://www.tiktok.com/@royal.home.tjk', instagram: original.instagram, socialVisibility: { tiktok: false } });
      expect(original.tiktok).toBe(tiktok);
    }
  });
});

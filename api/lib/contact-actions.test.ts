import { describe, expect, it } from 'vitest';
import { contactActionsHtml } from './contact-actions';
describe('initial HTML contact routing', () => {
  it('makes the confirmed call and messenger roles available without JavaScript', () => {
    const html = contactActionsHtml();
    expect(html).toContain('href="https://wa.me/992777776001"');
    expect(html).toContain('href="tel:+992446501414"');
    expect(html).not.toContain('wa.me/992446501414');
  });
  it('uses only the public property reference and canonical localized URL', () => {
    for (const [locale, path] of [['ru', '/listing/106'], ['tg', '/tg/khona/106'], ['en', '/en/listing/106']] as const) {
      const html = contactActionsHtml(locale, { id: 106, sold: false, crmShortId: 5106 });
      const href = html.match(/href="([^"]+)"/)?.[1];
      const url = new URL(href!);
      expect(url.pathname).toBe('/992777776001');
      expect(url.searchParams.get('text')).toContain(`№5106`);
      expect(url.searchParams.get('text')).not.toContain('№106');
      expect(url.searchParams.get('text')).toContain(`https://royalhome.tj${path}`);
    }
  });
  it('sends only the link, without any number, when the CRM card number is unknown', () => {
    for (const listing of [{ id: 106, sold: false }, { id: 106, sold: false, crmShortId: null }]) {
      const html = contactActionsHtml('ru', listing);
      const text = new URL(html.match(/href="([^"]+)"/)![1]).searchParams.get('text');
      expect(text).toBe('https://royalhome.tj/listing/106');
      expect(html).not.toContain('№');
    }
  });
  it('does not offer property enquiry actions on sold archive pages', () => {
    expect(contactActionsHtml('ru', { id: 106, sold: true })).toBe('');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeLeadAttribution } from '@contracts/lead-attribution';
import { buildCrmLeadPayload } from '../../api/lib/crm';
const now = 1_800_000_000_000;
let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); values = new Map();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
describe('first-touch acquisition carried with a lead', () => {
  it('keeps the first public landing across navigation and language changes; expires after 30 minutes', async () => {
    const { recordAcquisitionVisit, getLeadSubmissionSource } = await import('./acquisitionAttribution');
    recordAcquisitionVisit('/tg/khonaho-dushanbe', '?utm_source=google&utm_medium=cpc&utm_campaign=flats_2026&email=private@example.com', 'https://www.google.com/search?q=private', now);
    recordAcquisitionVisit('/contacts', '?utm_source=internal', 'https://royalhome.tj/listings', now + 1000);
    expect(getLeadSubmissionSource('Контакты', now + 2000)).toEqual({ source: 'Контакты', attribution: { landingPath: '/listings', referrerHost: 'www.google.com', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'flats_2026' } });
    expect([...values.values()].join('')).not.toMatch(/private|search\?q|email/);
    expect(getLeadSubmissionSource('Контакты', now + 30 * 60_000).attribution).toBeUndefined();
    recordAcquisitionVisit('/sell', '?utm_source=instagram', '', now + 30 * 60_000);
    expect(getLeadSubmissionSource('Продать квартиру', now + 30 * 60_000).attribution?.utmSource).toBe('instagram');
  });
  it('ignores private/unknown routes and uses memory if session storage is blocked', async () => {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw Error('blocked'); } });
    const { recordAcquisitionVisit, getLeadSubmissionSource } = await import('./acquisitionAttribution');
    recordAcquisitionVisit('/admin', '?utm_source=admin', '', now);
    recordAcquisitionVisit('//evil.test', '', '', now);
    expect(getLeadSubmissionSource('Контакты', now).attribution).toBeUndefined();
    recordAcquisitionVisit('/sell', '?utm_source=direct', '', now);
    expect(getLeadSubmissionSource('Продать квартиру', now).attribution).toEqual({ landingPath: '/sell', utmSource: 'direct' });
  });
  it('keeps article assist together with acquisition and bounds the CRM comment', async () => {
    const { recordPublicBlogVisit } = await import('./leadAttribution');
    const { recordAcquisitionVisit, getLeadSubmissionSource } = await import('./acquisitionAttribution');
    recordPublicBlogVisit('/blog/guide', now);
    recordAcquisitionVisit('/blog/guide', '?utm_source=search&utm_medium=organic', 'https://bing.com/query?phone=private', now);
    const fields = getLeadSubmissionSource('Контакты', now);
    const payload = buildCrmLeadPayload({ phone: '+992000000000', message: 'x'.repeat(3000), ...fields });
    expect(payload.comment).toContain('Источник: contacts:blog:guide');
    expect(payload.comment).toContain('Первая страница: /blog/guide\nПереход с: bing.com\nutm_source: search\nutm_medium: organic');
    expect(payload.comment).toHaveLength(2000);
    expect(payload.comment).not.toContain('private');
  });
  it('drops malformed optional fields, credentials, email-like and phone-like campaigns', () => {
    expect(normalizeLeadAttribution({ landingPath: '/admin', utmSource: 'ads' })).toBeUndefined();
    expect(normalizeLeadAttribution({ landingPath: '/contacts?token=secret#private', referrerHost: 'user:password@example.com', utmSource: 'mail@example.com', utmMedium: '+992901234567', utmCampaign: '992901234567', arbitrary: 'secret' })).toEqual({ landingPath: '/contacts' });
    expect(normalizeLeadAttribution('broken')).toBeUndefined();
  });
  it('rejects corrupted or future session records without preventing form submission', async () => {
    const { getLeadSubmissionSource } = await import('./acquisitionAttribution');
    for (const saved of ['broken', JSON.stringify({ at: now + 1, attribution: { landingPath: '/' } }), JSON.stringify({ at: now, attribution: { landingPath: '/admin' } })]) {
      values.set('rh_acquisition_v1', saved);
      expect(getLeadSubmissionSource('Контакты', now)).toEqual({ source: 'Контакты', attribution: undefined });
    }
  });
});

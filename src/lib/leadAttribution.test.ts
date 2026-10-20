import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLeadSource, recordPublicBlogVisit, recordRenderedBlogVisit } from './leadAttribution';
const now = 1_800_000_000_000;
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } });
});
afterEach(() => { vi.unstubAllGlobals(); });
describe('short-lived article assist attribution', () => {
  it('records only an exact published article after a successful render, never a404 route, failed translation or stale cached slug', () => {
    expect(recordRenderedBlogVisit('/blog/nonexistent', undefined, false, now)).toBe(false);
    expect(recordRenderedBlogVisit('/blog/guide', { identity: 'guide', published: false }, true, now)).toBe(false);
    expect(recordRenderedBlogVisit('/tg/blog/guide', { identity: 'guide', published: true }, false, now)).toBe(false);
    expect(recordRenderedBlogVisit('/blog/new-slug', { identity: 'old-slug', published: true }, true, now)).toBe(false);
    expect(values.size).toBe(0);
    expect(recordRenderedBlogVisit('/tg/blog/guide', { identity: 'guide', published: true }, true, now)).toBe(true);
    expect(getLeadSource('Контакты', now)).toBe('contacts:blog:guide');
    expect(recordRenderedBlogVisit('/en/blog/3', { identity: '3', published: true }, true, now)).toBe(true);
    expect(getLeadSource('Контакты', now)).toBe('contacts:blog:3');
  });
  it('normalizes TG/EN numeric/slug article routes without storing locale, query, PII or fragments', () => {
    expect(recordPublicBlogVisit('/tg/blog/guide?phone=private#details', now)).toBe(true);
    expect([...values.values()]).toEqual([JSON.stringify({ article: 'guide', at: now })]);
    expect(getLeadSource('Контакты', now + 1000)).toBe('contacts:blog:guide');
    expect(recordPublicBlogVisit('/en/blog/3', now)).toBe(true);
    expect(getLeadSource('Продать квартиру', now)).toBe('sell:blog:3');
    expect(getLeadSource('Дом, который вы искали', now)).toBe('home:blog:3');
    expect(getLeadSource('Кнопка «Перезвоните мне»', now)).toBe('callback:blog:3');
  });
  it('expires at30minutes and rejects future, malformed or tampered entries', () => {
    recordPublicBlogVisit('/blog/guide', now);
    expect(getLeadSource('Контакты', now + 30 * 60_000 - 1)).toBe('contacts:blog:guide');
    expect(getLeadSource('Контакты', now + 30 * 60_000)).toBe('Контакты');
    for (const value of ['broken', JSON.stringify({ article: '/admin', at: now }), JSON.stringify({ article: 'guide', at: now + 1 }), JSON.stringify({ article: 'guide', at: 'today' }), JSON.stringify({ article: 'guide', at: now, phone: 'private' })]) {
      values.set('rh_last_public_blog', value);
      expect(getLeadSource('Контакты', now)).toBe('Контакты');
    }
  });
  it('ignores admin, external, malformed, non-article and unsafe numeric routes', () => {
    for (const path of ['/admin/blog/guide', '/tg/admin/blog/guide', '//other.test/blog/guide', 'https://royalhome.tj/blog/guide', '/blog', '/blog/0', '/blog/01', '/blog/9007199254740999', '/blog/bad%20slug', '/blog/guide/extra', '/contacts']) expect(recordPublicBlogVisit(path, now)).toBe(false);
    expect(values.size).toBe(0);
  });
  it('keeps the database100-character source limit without truncating an article identity', () => {
    recordPublicBlogVisit('/blog/' + 'a'.repeat(86), now);
    expect(getLeadSource('Контакты', now)).toHaveLength(100);
    recordPublicBlogVisit('/blog/' + 'a'.repeat(87), now);
    expect(getLeadSource('Контакты', now)).toBe('Контакты');
    expect(getLeadSource('a'.repeat(120), now)).toHaveLength(100);
  });
  it('never blocks forms when sessionStorage access is denied', () => {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    expect(recordPublicBlogVisit('/blog/guide', now)).toBe(false);
    expect(getLeadSource('Контакты', now)).toBe('Контакты');
  });
});

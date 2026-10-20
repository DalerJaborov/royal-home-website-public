import { describe, expect, it } from 'vitest';
import { localizeArticleLinks, referencedArticleListingIds } from '@contracts/article-links';

describe('published article navigation', () => {
  const completed = ['/', '/listings', '/contacts', '/services/repair', '/listing/:id', '/blog/approved'];
  it('keeps current language on approved public routes and preserves filters/fragments', () => {
    const html = '<a class="cta" href="/listings?rooms=2&amp;type=Квартира#offers" data-id="98">Каталог</a><a href=\'/listing/98\' title="Цена 420000">Объект</a><a href="/contacts">Контакты</a>';
    expect(localizeArticleLinks(html, 'tg', completed)).toBe('<a class="cta" href="/tg/khonaho-dushanbe?rooms=2&amp;type=Квартира#offers" data-id="98">Каталог</a><a href=\'/tg/khona/98\' title="Цена 420000">Объект</a><a href="/tg/tamos">Контакты</a>');
    expect(localizeArticleLinks('<a href="/tg/khona/98">98</a>', 'en', completed)).toBe('<a href="/en/listing/98">98</a>');
  });
  it('leaves external, asset, private, unsafe, unknown and unpublished links intact', () => {
    const html = ['/uploads/photo.webp', '/admin', '/api/leads', '/blog/not-translated', '/services/unknown', '/listing/0', '//external.test/listings', 'https://royalhome.tj/listings', 'javascript:alert(1)'].map(href => `<a href="${href}">link</a>`).join('');
    expect(localizeArticleLinks(html, 'en', completed)).toBe(html);
    expect(localizeArticleLinks('<img src="/listings"><a data-href="/listings" href="/blog/approved">Approved</a>', 'en', completed)).toBe('<img src="/listings"><a data-href="/listings" href="/en/blog/approved">Approved</a>');
    expect(localizeArticleLinks('<a title="A href=\'/listings\'" href="/contacts">Contact</a>', 'en', completed)).toBe('<a title="A href=\'/listings\'" href="/en/contacts">Contact</a>');
    expect(localizeArticleLinks('<a href="/contacts">Contact</a>', 'ru', completed)).toBe('<a href="/contacts">Contact</a>');
  });

  it('discovers unique current-language/same-origin references without accepting foreign or unsafe IDs', () => {
    expect(referencedArticleListingIds('<a title="href=\'/listing/99\'" href="/tg/khona/68">68</a><a href="https://royalhome.tj/en/listing/68?x=1">same</a><a href="/listing/98">98</a><a href="https://other.test/listing/9">foreign</a><a href="/listing/9007199254740999">huge</a><a href="/listing/0">zero</a>')).toEqual([68, 98]);
    expect(() => referencedArticleListingIds(Array.from({ length: 101 }, (_, index) => `<a href="/listing/${index + 1}">${index}</a>`).join(''))).toThrow('Too many property references');
  });

  it('replaces only proven unavailable references while retaining historical text, sold/valid links and escaped copy', () => {
    const html = '<p><a href="/listing/68"><strong>61 м² — 850000 с.</strong></a> / <a href="/listing/98">Sold property</a> / <a href="https://other.test/listing/68">external</a></p>';
    const availability = { unavailableListingIds: [68], unavailable: 'Unavailable <today>', catalog: 'Catalog & offers' };
    expect(localizeArticleLinks(html, 'en', completed, availability)).toBe('<p><span><strong>61 м² — 850000 с.</strong><span class="article-link-unavailable"> — Unavailable &lt;today&gt;</span> <a href="/en/listings">Catalog &amp; offers</a></span> / <a href="/en/listing/98">Sold property</a> / <a href="https://other.test/listing/68">external</a></p>');
    expect(localizeArticleLinks('<a href="https://royalhome.tj/listing/68">Old</a>', 'ru', completed, availability)).toContain('<a href="/listings">');
    expect(localizeArticleLinks(html, 'tg', completed)).toContain('href="/tg/khona/68"');
  });
});

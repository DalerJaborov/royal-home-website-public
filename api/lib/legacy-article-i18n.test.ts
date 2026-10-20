import { describe, expect, it } from 'vitest';
import { legacyArticleTranslated, legacyArticleRevision } from '@contracts/legacy-article-i18n';
describe('legacy article translation source identity', () => {
  const source = { title: 'Заголовок', excerpt: 'Введение', content: 'Текст статьи' };
  const strings = { Заголовок: 'Сарлавҳа', Введение: 'Муқаддима', 'Текст статьи': 'Матни мақола' };
  it('requires exact current title, excerpt and body, excluding old snapshot values', () => {
    expect(legacyArticleTranslated(source, strings)).toBe(true);
    for (const field of ['title', 'excerpt', 'content'] as const) {
      const updated = { ...source, [field]: 'Новый исходный текст' };
      expect(legacyArticleTranslated(updated, strings)).toBe(false);
      expect(legacyArticleRevision(updated)).not.toBe(legacyArticleRevision(source));
    }
  });
  it('permits absent optional content and rejects empty or inherited dictionary values', () => {
    expect(legacyArticleTranslated({ title: source.title }, strings)).toBe(true);
    expect(legacyArticleTranslated(source, { ...strings, Заголовок: '' })).toBe(false);
    expect(legacyArticleTranslated({ title: 'toString' }, {})).toBe(false);
  });
});

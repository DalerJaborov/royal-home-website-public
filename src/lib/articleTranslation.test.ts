import { describe, expect, it } from 'vitest';
import { validArticleTranslation } from './articleTranslation';

const translation = { sourceHash: 'current-source', title: 'Тарҷума', excerpt: 'Матн', contentHtml: '<p>Матн</p>', metaTitle: 'Тарҷума', metaDescription: 'Матн', faq: [{ q: 'Савол?', a: 'Ҷавоб.' }] };
describe('article revision publication', () => {
  it('accepts the current snapshot and refuses a translation of the previous facts', () => {
    expect(validArticleTranslation(translation, 'current-source')).toBe(true);
    expect(validArticleTranslation(translation, 'new-source')).toBe(false);
  });
  it('rejects incomplete content and malformed FAQ instead of rendering a fake translated article', () => {
    expect(validArticleTranslation({ ...translation, contentHtml: '' }, 'current-source')).toBe(false);
    expect(validArticleTranslation({ ...translation, faq: [{ q: 'Савол?', a: null }] }, 'current-source')).toBe(false);
    expect(validArticleTranslation({ sourceHash: 'current-source', title: 'Тарҷума' }, 'current-source')).toBe(false);
  });
});

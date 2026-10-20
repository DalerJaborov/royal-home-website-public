import type { PublishedArticleTranslation } from '@contracts/public-i18n';

export function validArticleTranslation(value: unknown, sourceHash: string): value is PublishedArticleTranslation {
  if (!value || typeof value !== 'object') return false;
  const item = value as PublishedArticleTranslation;
  return item.sourceHash === sourceHash && ['title', 'excerpt', 'contentHtml', 'metaTitle', 'metaDescription'].every(key => typeof item[key as keyof PublishedArticleTranslation] === 'string')
    && !!item.title.trim() && !!item.contentHtml.trim()
    && Array.isArray(item.faq) && item.faq.every(entry => entry && typeof entry.q === 'string' && typeof entry.a === 'string');
}

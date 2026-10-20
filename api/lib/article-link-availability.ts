import { referencedArticleListingIds } from '@contracts/article-links';
import { findPublishedListingIds } from '../queries/listings';

/** One bounded read, never a source rewrite. Failure must not label live rows unavailable. */
export async function unavailableArticleListingIds(contentHtml: string): Promise<number[]> {
  const ids = referencedArticleListingIds(contentHtml);
  if (!ids.length) return [];
  const available = await findPublishedListingIds(ids);
  return ids.filter(id => !available.has(id));
}

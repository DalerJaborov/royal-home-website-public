/** Existing anonymous read procedures needed to render public pages. Separate
 * batching keeps auth/admin queries out of crawler-visible resource batches. */
export const PUBLIC_RENDER_QUERIES = new Set([
  'listing.list', 'listing.getById', 'blog.list', 'blog.getBySlug',
  'cms.getAll', 'cms.legacyArticleLocales', 'instagram.getReels',
]);

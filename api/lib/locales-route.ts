import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { findPublishedArticleById } from '../queries/articles';
import { getPublicArticleTranslation } from './public-translations';

/** Mount before static files: stale/unpublished resources must not fall through to disk. */
export const localesApp = new Hono();
localesApp.get('/locales/:locale/articles/:filename', async c => {
  const locale = c.req.param('locale');
  const idMatch = /^([1-9]\d*)\.json$/.exec(c.req.param('filename'));
  const id = idMatch ? Number(idMatch[1]) : NaN;
  c.header('Cache-Control', 'no-store');
  if ((locale !== 'tg' && locale !== 'en') || !Number.isSafeInteger(id)) return c.json({ error: 'Not Found' }, 404);
  try {
    const source = await findPublishedArticleById(id);
    const translation = source ? await getPublicArticleTranslation(locale, source) : undefined;
    if (!translation) return c.json({ error: 'Not Found' }, 404);
    const etag = `"${createHash('sha256').update(JSON.stringify(translation)).digest('hex')}"`;
    c.header('Cache-Control', 'public, max-age=60, must-revalidate');
    c.header('ETag', etag);
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    return c.json(translation);
  } catch (error) {
    console.error('[locales] Published article resource unavailable:', error);
    c.header('Retry-After', '60');
    return c.json({ error: 'Resource temporarily unavailable' }, 503);
  }
});

/** Isolated preview populated exclusively through public GET endpoints.
 * No database or CRM writes are permitted. Run a normal build first, then
 * bundle with the same esbuild aliases as build:server and run from the repo. */
import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { compress } from 'hono/compress';
import superjson from 'superjson';
import { readFile } from 'node:fs/promises';

if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL || process.env.CRM_LEAD_API_KEY) {
  throw new Error('QA preview requires development mode with no database or CRM credentials');
}
process.env.APP_SECRET = 'local-qa-only-not-a-production-secret';
// dotenv loads later through the API. Explicit empty values prevent a local
// .env file from turning this fixture server into a real database client.
process.env.DATABASE_URL = '';
process.env.CRM_LEAD_API_KEY = '';
process.env.CRM_LEAD_URL = '';
process.env.CRM_NOTIFY_URL = '';
process.env.ADMIN_PASSWORD = '';
process.env.CRM_INSTAGRAM_URL = 'http://127.0.0.1:4187/qa/instagram';

async function publicQuery(name: string, input?: object) {
  const url = new URL(`/api/trpc/${name}`, 'https://royalhome.tj');
  if (input) url.searchParams.set('input', JSON.stringify(superjson.serialize(input)));
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Public fixture unavailable: ${name} HTTP ${response.status}`);
  const body = await response.json();
  if (!body.result?.data) throw new Error(`Invalid public fixture: ${name}`);
  return superjson.deserialize(body.result.data);
}

const [inventory, cms, reels, blog] = await Promise.all([
  publicQuery('listing.list', {}), publicQuery('cms.getAll'), publicQuery('instagram.getReels'), publicQuery('blog.list'),
]);
const { memoryListings } = await import('../api/queries/memory-store');
const { setCmsEntry } = await import('../api/queries/cms');
const { memoryArticles } = await import('../api/queries/articles');
memoryListings.splice(0, memoryListings.length, ...inventory as typeof memoryListings);
const articles = [];
for (const card of (blog as { items: Array<{ slug: string }> }).items) articles.push(await publicQuery('blog.getBySlug', { slug: card.slug }));
if (process.env.QA_PUBLIC_ARTICLE_COVERS) {
  const overrides = JSON.parse(await readFile(process.env.QA_PUBLIC_ARTICLE_COVERS, 'utf8')) as Record<string, string>;
  for (const article of articles as Array<{ id: number; coverImageUrl: string | null }>) {
    const cover = overrides[String(article.id)];
    if (cover !== undefined) {
      if (!/^\/uploads\/[a-z0-9-]+\.webp$/i.test(cover)) throw new Error('QA cover must reference an existing public upload');
      article.coverImageUrl = cover;
    }
  }
}
memoryArticles.splice(0, memoryArticles.length, ...articles as typeof memoryArticles);
for (const [key, value] of Object.entries(cms as Record<string, unknown>)) await setCmsEntry(key, value);
if (process.env.QA_PUBLIC_CMS_OVERRIDES) {
  const overrides = JSON.parse(await readFile(process.env.QA_PUBLIC_CMS_OVERRIDES, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!['site', 'hero', 'banners', 'services'].includes(key)) throw new Error('QA override must contain only public display settings');
    await setCmsEntry(key, value);
  }
}
const { default: site } = await import('../api/boot');
const { serveStaticFiles } = await import('../api/lib/vite');
serveStaticFiles(site);

const preview = new Hono();
preview.use('*', compress());
preview.use('*', async (c, next) => {
  if (c.req.method === 'POST' && c.req.path === '/api/trpc/analytics.track') {
    return c.json([{ result: { data: superjson.serialize({ ok: true }) } }]);
  }
  if (!['GET', 'HEAD'].includes(c.req.method)) return c.json({ error: 'QA preview blocks every mutation' }, 405);
  await next();
});
preview.get('/qa/instagram', (c) => c.json({ items: (reels as Array<Record<string, string>> ?? []).map((reel) => ({
  id: reel.id, permalink: reel.url, caption: reel.fullCaption || reel.caption,
  thumbnailUrl: reel.originalCover || reel.cover, mediaUrl: reel.videoUrl,
  mediaType: 'VIDEO', mediaProductType: 'REELS',
})) }));
async function publicUpload(c: Context) {
  const response = await fetch(`https://royalhome.tj${c.req.path}`, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  const headers = new Headers(response.headers);
  // Fetch decodes upstream transport compression; copied length/encoding would
  // make browsers decode the fixture a second time and report broken images.
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(response.body, { status: response.status, headers });
}
preview.get('/uploads/*', publicUpload);
preview.get('/api/uploads/*', publicUpload);
preview.route('/', site);
preview.notFound((c) => site.fetch(c.req.raw));
serve({ fetch: preview.fetch, port: 4187, hostname: '127.0.0.1' }, () => {
  console.log(`Read-only QA preview http://127.0.0.1:4187 (${memoryListings.length} public listings)`);
});

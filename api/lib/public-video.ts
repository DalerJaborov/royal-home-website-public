import { Hono } from 'hono';
import { findListingById } from '../queries/listings';
import { normalizeCrmVideoUrl } from './crm-video-url';

/** A fixed public listing ID, never an arbitrary URL. CRM itself stays excluded
 * from search. Stream bytes with backpressure; never buffer whole property videos. */
export const publicVideoApp = new Hono();
publicVideoApp.on(['GET', 'HEAD'], '/media/listing-video/:file', async c => {
  const match = /^([1-9]\d*)\.mp4$/.exec(c.req.param('file'));
  const id = match ? Number(match[1]) : NaN;
  c.header('Cache-Control', 'no-store');
  const fail = (status: 404 | 502 | 503) => {
    c.header('X-Robots-Tag', 'noindex');
    return c.body(null, status);
  };
  if (!Number.isSafeInteger(id)) return fail(404);
  try {
    const listing = await findListingById(id);
    if (!listing || listing.published === false) return fail(404);
    const source = normalizeCrmVideoUrl(listing.videoUrl);
    if (!source || !/^\/api\/v1\/public\/property-video\/[1-9]\d*\.mp4$/.test(new URL(source).pathname)) return fail(404);
    const headers = new Headers();
    for (const key of ['Range', 'If-Range', 'If-None-Match', 'If-Modified-Since']) {
      const value = c.req.header(key);
      if (value) headers.set(key, value);
    }
    const upstream = await fetch(source, { method: c.req.method, headers, redirect: 'manual',
      signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(180_000)]) });
    // A replaced/removed video is not an indexable HTML error or a redirect to login.
    if (upstream.status === 404) { await upstream.body?.cancel(); return fail(404); }
    const allowed = [200, 206, 304, 416].includes(upstream.status);
    const media = /^video\/mp4(?:;|$)/i.test(upstream.headers.get('content-type') ?? '');
    if (!allowed || ([200, 206].includes(upstream.status) && !media)) {
      await upstream.body?.cancel(); return fail(502);
    }
    for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      const value = upstream.headers.get(key);
      if (value) c.header(key, value);
    }
    // Recheck publication on every request. Do not inherit CRM's private robots header.
    c.header('Cache-Control', 'public, max-age=0, must-revalidate');
    c.header('X-Content-Type-Options', 'nosniff');
    return new Response(c.req.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: c.res.headers });
  } catch {
    c.header('Retry-After', '60');
    return fail(503);
  }
});

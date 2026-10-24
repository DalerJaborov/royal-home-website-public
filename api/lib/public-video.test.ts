import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../queries/listings', () => ({ findListingById: vi.fn() }));
import { findListingById } from '../queries/listings';
import { publicVideoApp } from './public-video';

const source = 'https://crm.royalhome.tj/api/v1/public/property-video/183.mp4?v=abc123';
const upstream = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', upstream);
  upstream.mockReset().mockResolvedValue(new Response('bytes', { status: 200, headers: {
    'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'etag': '"video1"',
    'x-robots-tag': 'noindex', 'set-cookie': 'private=value',
  } }));
  vi.mocked(findListingById).mockReset().mockResolvedValue({ id: 120, published: true, videoUrl: source } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe('crawlable public listing video stream', () => {
  it('streams the published file without leaking CRM cookies or private robots policy', async () => {
    const result = await publicVideoApp.request('/media/listing-video/120.mp4');
    expect(result.status).toBe(200);
    expect(await result.text()).toBe('bytes');
    expect(result.headers.get('content-type')).toBe('video/mp4');
    expect(result.headers.get('x-robots-tag')).toBeNull();
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(result.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(upstream.mock.calls[0][0]).toBe(source);
    expect(upstream.mock.calls[0][1].redirect).toBe('manual');
  });
  it('preserves byte ranges and only forwards media conditional headers', async () => {
    upstream.mockResolvedValue(new Response('by', { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-1/5', 'content-length': '2' } }));
    const result = await publicVideoApp.request('/media/listing-video/120.mp4', { headers: { range: 'bytes=0-1', authorization: 'Bearer private', cookie: 'private=value' } });
    expect(result.status).toBe(206);
    expect(result.headers.get('content-range')).toBe('bytes 0-1/5');
    expect(await result.text()).toBe('by');
    const sent = upstream.mock.calls[0][1].headers as Headers;
    expect([...sent.entries()]).toEqual([['range', 'bytes=0-1']]);
  });
  it('uses HEAD without downloading the video', async () => {
    const result = await publicVideoApp.request('/media/listing-video/120.mp4', { method: 'HEAD' });
    expect(result.status).toBe(200);
    expect(await result.text()).toBe('');
    expect(upstream.mock.calls[0][1].method).toBe('HEAD');
  });
  it('checks publication before fetching and after a listing is unpublished', async () => {
    vi.mocked(findListingById).mockResolvedValue({ id: 120, published: false, videoUrl: source } as never);
    const result = await publicVideoApp.request('/media/listing-video/120.mp4');
    expect(result.status).toBe(404);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['https://example.com/file.mp4', 'https://crm.royalhome.tj/admin/secret.mp4', 'https://user:pass@crm.royalhome.tj/api/v1/public/property-video/1.mp4'])('rejects non-public upstream %s', async videoUrl => {
    vi.mocked(findListingById).mockResolvedValue({ id: 120, published: true, videoUrl } as never);
    expect((await publicVideoApp.request('/media/listing-video/120.mp4')).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([new Response(null, { status: 302, headers: { location: 'https://example.com/private' } }), new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })])('does not expose a redirect or HTML instead of video', async response => {
    upstream.mockResolvedValue(response);
    expect((await publicVideoApp.request('/media/listing-video/120.mp4')).status).toBe(502);
  });
  it('makes a source outage retryable without caching a false missing video', async () => {
    upstream.mockRejectedValue(new Error('network'));
    const result = await publicVideoApp.request('/media/listing-video/120.mp4');
    expect(result.status).toBe(503);
    expect(result.headers.get('retry-after')).toBe('60');
  });
});

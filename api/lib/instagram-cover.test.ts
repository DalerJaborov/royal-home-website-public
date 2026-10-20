import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('../instagram-router', () => ({ getLiveReels: vi.fn() }));
import { getLiveReels } from '../instagram-router';
import { allowedCoverSource, getInstagramCover } from './instagram-cover';

beforeEach(() => { vi.restoreAllMocks(); vi.mocked(getLiveReels).mockReset(); });

describe('Instagram thumbnail proxy', () => {
  it('only accepts HTTPS sources from Meta CDN subdomains', () => {
    expect(allowedCoverSource('https://scontent.cdninstagram.com/a.jpg')).toBe(true);
    expect(allowedCoverSource('https://scontent.fbcdn.net/a.jpg')).toBe(true);
    for (const source of ['http://scontent.fbcdn.net/a', 'https://localhost/a', 'https://127.0.0.1/a',
      'https://scontent.fbcdn.net.evil.invalid/a', 'https://user:pass@scontent.fbcdn.net/a',
      'https://scontent.fbcdn.net:8443/a', 'file:///etc/passwd']) {
      expect(allowedCoverSource(source), source).toBe(false);
    }
  });

  it('never fetches request URLs or unknown IDs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    vi.mocked(getLiveReels).mockResolvedValue([]);
    for (const id of ['https://localhost/a', '../1', 'abc', '999']) expect(await getInstagramCover(id)).toBeNull();
    vi.mocked(getLiveReels).mockResolvedValue([{ id: '100', url: '', cover: 'https://localhost/a', caption: '', fullCaption: '' }]);
    expect(await getInstagramCover('100')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resizes to WebP, coalesces concurrent requests and caches the result', async () => {
    const jpeg = await sharp({ create: { width: 1200, height: 2200, channels: 3, background: '#537857' } }).jpeg().toBuffer();
    vi.mocked(getLiveReels).mockResolvedValue([{ id: '101', url: '', cover: 'https://scontent.fbcdn.net/a.jpg', caption: '', fullCaption: '' }]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } }));
    const [first, second] = await Promise.all([getInstagramCover('101'), getInstagramCover('101')]);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect((await sharp(first!).metadata())).toMatchObject({ format: 'webp', height: 720 });
    expect((await sharp(first!).metadata()).width).toBeLessThanOrEqual(400);
    expect(await getInstagramCover('101')).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('rejects oversized or non-image responses without retaining them', async () => {
    vi.mocked(getLiveReels).mockResolvedValue([{ id: '102', url: '', cover: 'https://scontent.fbcdn.net/b.jpg', caption: '', fullCaption: '' }]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '6000000' } }));
    expect(await getInstagramCover('102')).toBeNull();
    fetchMock.mockResolvedValue(new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }));
    expect(await getInstagramCover('102')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

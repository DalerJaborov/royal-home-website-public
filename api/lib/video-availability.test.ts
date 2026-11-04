import { afterEach, expect, it, vi } from 'vitest';
import { createVideoAvailability } from './video-availability';

const url = 'https://crm.royalhome.tj/api/v1/public/property-video/123.mp4?v=original';
const row = { id: 99, published: true, videoUrl: url, imageUrls: ['/photo.webp'] };
afterEach(() => vi.unstubAllEnvs());

it.each([404, 410])('projects confirmed %i out without changing the persisted row', async status => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
  const project = createVideoAvailability(fetcher);
  expect(await project(row)).toEqual({ ...row, videoUrl: null });
  expect(row.videoUrl).toBe(url);
  expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'HEAD', redirect: 'manual', signal: expect.any(AbortSignal) }));
});

it.each([200, 302, 401, 403, 429, 500, 503])('does not infer deletion from HTTP%i or unexpected content', async status => {
  const project = createVideoAvailability(vi.fn().mockResolvedValue(new Response(null, { status })));
  expect(await project(row)).toBe(row);
});

it('keeps an unknown video on transport timeout and deduplicates its short retry cache', async () => {
  let time = 0;
  const fetcher = vi.fn().mockRejectedValue(new Error('timeout'));
  const project = createVideoAvailability(fetcher, () => time);
  expect(await project(row)).toBe(row);
  expect(await project(row)).toBe(row);
  expect(fetcher).toHaveBeenCalledTimes(1);
  time = 15_001;
  await project(row);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('rechecks missing files after one minute and immediately checks a replacement version', async () => {
  let time = 0;
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  const project = createVideoAvailability(fetcher, () => time);
  expect((await project(row)).videoUrl).toBeNull();
  time = 59_999;
  await project(row);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue(new Response(null, { headers: { 'content-type': 'video/mp4' } }));
  const replacement = { ...row, videoUrl: url.replace('original', 'replacement') };
  expect(await project(replacement)).toBe(replacement);
  time = 60_001;
  expect(await project(row)).toBe(row);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('bounds a 40-video cold batch to eight concurrent HEADs with no queued rounds', async () => {
  const releases: Array<(response: Response) => void> = [];
  const fetcher = vi.fn(() => new Promise<Response>(resolve => releases.push(resolve)));
  const project = createVideoAvailability(fetcher);
  const rows = Array.from({ length: 40 }, (_, n) => ({ ...row, videoUrl: url.replace('/123.', `/${n + 1}.`) }));
  const all = Promise.all(rows.map(project));
  const duplicate = project(rows[0]);
  expect(fetcher).toHaveBeenCalledTimes(8);
  releases.forEach(resolve => resolve(new Response(null, { status: 404 })));
  const result = await all;
  await duplicate;
  expect(fetcher).toHaveBeenCalledTimes(8);
  expect(result.filter(item => item.videoUrl === null)).toHaveLength(8);
  expect(result.slice(8)).toEqual(rows.slice(8));
});

it('never probes untrusted paths, foreign hosts, credentials or unpublished rows', async () => {
  const fetcher = vi.fn();
  const project = createVideoAvailability(fetcher);
  for (const videoUrl of ['https://evil.example/file.mp4', 'http://crm.royalhome.tj/api/v1/public/property-video/1.mp4',
    'https://crm.royalhome.tj/api/v1/users', 'https://user:pass@crm.royalhome.tj/api/v1/public/property-video/1.mp4']) {
    const candidate = { ...row, videoUrl }; expect(await project(candidate)).toBe(candidate);
  }
  await project({ ...row, published: false });
  expect(fetcher).not.toHaveBeenCalled();
});

it('uses the existing internal fixed public route when local transport is enabled', async () => {
  vi.stubEnv('PUBLIC_VIDEO_LOCAL_SOURCE', '1');
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  await createVideoAvailability(fetcher)(row);
  expect(fetcher.mock.calls[0][0]).toBe('http://royalhome-crm-api-1:4000/api/v1/public/property-video/123.mp4?v=original');
  expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
});

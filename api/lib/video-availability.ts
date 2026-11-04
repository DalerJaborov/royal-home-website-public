import { normalizeCrmVideoUrl } from './crm-video-url';

type State = 'available' | 'missing' | 'unknown';
type Entry = { state: State; expires: number };
type VideoRow = { videoUrl?: string | null; published?: boolean };

/** Same narrow allowlist as the public media stream; never probe arbitrary URLs. */
export function crmVideoSource(value: unknown): string | null {
  const source = normalizeCrmVideoUrl(value);
  if (!source) return null;
  const url = new URL(source);
  if (!/^\/api\/v1\/public\/property-video\/[1-9]\d*\.mp4$/.test(url.pathname)) return null;
  return process.env.PUBLIC_VIDEO_LOCAL_SOURCE === '1'
    ? new URL(url.pathname + url.search, 'http://royalhome-crm-api-1:4000').href : source;
}

/** Read projection only: never erase the durable CRM URL. Cold requests are
 * bounded to eight concurrent HEADs, 1.5s each; cached/singleflight thereafter.
 * A timeout/5xx is not evidence of a deleted video. Recovery is rechecked after
 * one minute, and a versioned replacement URL gets its own cache entry. */
export function createVideoAvailability(fetcher: typeof fetch = (...args) => fetch(...args), now = Date.now) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<State>>();
  const put = (url: string, state: State) => {
    cache.delete(url);
    cache.set(url, { state, expires: now() + (state === 'unknown' ? 15_000 : state === 'missing' ? 60_000 : 300_000) });
    while (cache.size > 512) cache.delete(cache.keys().next().value!);
  };
  async function state(value: string): Promise<State> {
    const url = crmVideoSource(value);
    if (!url) return 'unknown';
    const old = cache.get(url);
    if (old && old.expires > now()) return old.state;
    const running = pending.get(url);
    if (running) return running;
    // Do not build an unbounded queue when rendering a large catalog.
    if (pending.size >= 8) return old?.state ?? 'unknown';
    const work = (async () => {
      let next: State = 'unknown';
      try {
        const response = await fetcher(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(1500) });
        if (response.status === 404 || response.status === 410) next = 'missing';
        else if (response.ok && /^video\/mp4(?:;|$)/i.test(response.headers.get('content-type') ?? '')) next = 'available';
        await response.body?.cancel();
      } catch { /* A transport failure must not erase valid catalog videos. */ }
      put(url, next);
      return next;
    })();
    pending.set(url, work);
    try { return await work; } finally { pending.delete(url); }
  }
  return async <T extends VideoRow>(row: T): Promise<T> => {
    if (!row.videoUrl || row.published === false) return row;
    return await state(row.videoUrl) === 'missing' ? { ...row, videoUrl: null } : row;
  };
}

export const projectVideoAvailability = createVideoAvailability();

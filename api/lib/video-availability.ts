import { normalizeCrmVideoUrl } from './crm-video-url';
import { createHash } from 'node:crypto';

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
 * A timeout/5xx is not evidence of a deleted video. Missing results are eligible
 * for recheck after one minute; busy slots keep the last known state until a
 * later pass. A versioned replacement URL gets its own cache entry. */
export function createVideoAvailability(fetcher: typeof fetch = (...args) => fetch(...args), now = Date.now) {
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<State>>();
  // Independent cursors for recent filtered inventories; no URL-sized keys or
  // unbounded per-filter history. Evict only old cursor bookkeeping, not data.
  const batchCursors = new Map<string, number>();
  const put = (url: string, state: State) => {
    cache.delete(url);
    cache.set(url, { state, expires: now() + (state === 'unknown' ? 15_000 : state === 'missing' ? 60_000 : 300_000) });
    while (cache.size > 512) cache.delete(cache.keys().next().value!);
  };
  async function state(value: string, onProbe?: () => void): Promise<State> {
    const url = crmVideoSource(value);
    if (!url) return 'unknown';
    const old = cache.get(url);
    if (old && old.expires > now()) return old.state;
    const running = pending.get(url);
    if (running) return running;
    // Do not build an unbounded queue when rendering a large catalog.
    if (pending.size >= 8) return old?.state ?? 'unknown';
    onProbe?.();
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
  const project = async <T extends VideoRow>(row: T, onProbe?: () => void): Promise<T> => {
    if (!row.videoUrl || row.published === false) return row;
    return await state(row.videoUrl, onProbe) === 'missing' ? { ...row, videoUrl: null } : row;
  };
  // Rotate the START of each inventory pass, not its output. Otherwise low
  // traffic (TTL expires between requests) continually reprobes the first eight
  // rows. The cursor advances only for a real HEAD, not cached/unknown/skipped
  // rows; it is independent of cache eviction and needs no background timer.
  const many = <T extends VideoRow>(rows: readonly T[]): Promise<T[]> => {
    if (!rows.length) return Promise.resolve([]);
    const key = createHash('sha256').update(JSON.stringify(rows.map(row =>
      row.published === false ? null : crmVideoSource(row.videoUrl)))).digest('hex');
    const start = (batchCursors.get(key) ?? 0) % rows.length;
    batchCursors.delete(key);
    batchCursors.set(key, start);
    while (batchCursors.size > 64) batchCursors.delete(batchCursors.keys().next().value!);
    const result: Array<Promise<T>> = new Array(rows.length);
    for (let offset = 0; offset < rows.length; offset++) {
      const index = (start + offset) % rows.length;
      result[index] = project(rows[index], () => { batchCursors.set(key, index + 1); });
    }
    return Promise.all(result);
  };
  return Object.assign(<T extends VideoRow>(row: T) => project(row), { many });
}

export const projectVideoAvailability = createVideoAvailability();

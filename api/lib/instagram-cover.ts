import sharp from 'sharp';
import { getLiveReels } from '../instagram-router';

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const CACHE_MS = 20 * 60 * 1000;
const cache = new Map<string, { source: string; bytes: Buffer; expires: number }>();
const pending = new Map<string, Promise<Buffer | null>>();

export function allowedCoverSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /\.(cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

async function transform(source: string): Promise<Buffer> {
  const response = await fetch(source, { signal: AbortSignal.timeout(8_000), redirect: 'error' });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Cover unavailable');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_INPUT_BYTES) throw new Error('Cover too large');
  if (!response.body) throw new Error('Cover has no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_INPUT_BYTES) throw new Error('Cover too large');
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return sharp(Buffer.concat(chunks), { limitInputPixels: 25_000_000 })
    .rotate().resize({ width: 400, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 }).toBuffer();
}

/** Sources are resolved from our own current CRM feed, never from a request URL. */
export async function getInstagramCover(id: string): Promise<Buffer | null> {
  if (!/^\d{1,40}$/.test(id)) return null;
  const reel = (await getLiveReels())?.find((item) => item.id === id);
  if (!reel || !allowedCoverSource(reel.cover)) return null;
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  const cached = cache.get(id);
  if (cached?.source === reel.cover) return cached.bytes;
  if (pending.has(id)) return pending.get(id)!;
  const request = transform(reel.cover).then((bytes) => {
    // The feed has at most nine entries. Bound cache even across feed rotations.
    if (cache.size >= 18) cache.delete(cache.keys().next().value!);
    cache.set(id, { source: reel.cover, bytes, expires: Date.now() + CACHE_MS });
    return bytes;
  }).catch(() => null).finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { CARD_IMAGE_FILENAME } from '@contracts/image-urls';

export type CardImageResult = { status: 200; bytes: Buffer; etag: string } | { status: 404 | 503 };
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export type CardImageLayout = 'full' | 'catalog';
type Options = { fetch?: typeof fetch; convert?: (input: Buffer, layout: CardImageLayout) => Promise<Buffer>; cacheBytes?: number; localSource?: boolean };

/** Fixed-origin, bounded image conversion; originals and CRM data are never written. */
export function createCardImageService(options: Options = {}) {
  const get = options.fetch ?? fetch;
  const convert = options.convert ?? ((input: Buffer, layout: CardImageLayout) => sharp(input, { limitInputPixels: 16_000_000 })
    .rotate().resize(layout === 'catalog'
      ? { width: 640, height: 400, fit: 'cover', position: 'centre', withoutEnlargement: true }
      : { width: 640, withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toBuffer());
  const cache = new Map<string, Extract<CardImageResult, { status: 200 }>>();
  const pending = new Map<string, Promise<CardImageResult>>();
  const cacheLimit = options.cacheBytes ?? 16 * 1024 * 1024;
  let cachedBytes = 0;

  async function source(uploadPath: string): Promise<Response> {
    if (options.localSource) {
      try {
        // Same public Caddy route and Host as the external request. Do not
        // contact CRM's private network or bypass its public-upload checks.
        const local = await get(`http://host.docker.internal${uploadPath}`, {
          headers: { Host: 'royalhome.tj' }, signal: AbortSignal.timeout(1000), redirect: 'error',
        });
        // Authorization failures and missing files remain authoritative.
        if (local.status < 500) return local;
        await local.body?.cancel();
      } catch { /* Local origin unavailable: retain the existing public path. */ }
    }
    return get(`https://royalhome.tj${uploadPath}`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  }

  async function produce(filename: string, layout: CardImageLayout): Promise<CardImageResult> {
    try {
      let response = await source(`/uploads/thumbs/${filename}`);
      if (response.status === 404) {
        await response.body?.cancel();
        response = await source(`/uploads/${filename}`);
      }
      if (!response.ok || !/^image\/(?:webp|jpeg|png)(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
        await response.body?.cancel();
        return { status: response.status === 404 ? 404 : 503 };
      }
      if (Number(response.headers.get('content-length')) > MAX_INPUT_BYTES) {
        await response.body.cancel();
        return { status: 503 };
      }
      const chunks: Buffer[] = [];
      const reader = response.body.getReader();
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_INPUT_BYTES) { await reader.cancel(); return { status: 503 }; }
        chunks.push(Buffer.from(value));
      }
      const bytes = await convert(Buffer.concat(chunks, size), layout);
      if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) return { status: 503 };
      const result = { status: 200 as const, bytes, etag: `"${createHash('sha256').update(bytes).digest('hex')}"` };
      if (bytes.length <= cacheLimit) {
        while (cache.size && (cachedBytes + bytes.length > cacheLimit || cache.size >= 128)) {
          const first = cache.keys().next().value!;
          cachedBytes -= cache.get(first)!.bytes.length;
          cache.delete(first);
        }
        cache.set(`${layout}:${filename}`, result);
        cachedBytes += bytes.length;
      }
      return result;
    } catch { return { status: 503 }; }
  }

  return async (filename: string, layout: CardImageLayout = 'full'): Promise<CardImageResult> => {
    if (!CARD_IMAGE_FILENAME.test(filename)) return { status: 404 };
    const key = `${layout}:${filename}`;
    const cached = cache.get(key);
    if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
    const active = pending.get(key);
    if (active) return active;
    // Limit conversion and network work under concurrent or abusive requests.
    if (pending.size >= 8) return { status: 503 };
    const task = produce(filename, layout);
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}

export const getCardImage = createCardImageService({ localSource: process.env.CARD_IMAGE_LOCAL_SOURCE === '1' });

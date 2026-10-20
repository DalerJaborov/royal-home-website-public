/**
 * Превью-скрейперы мессенджеров (WhatsApp прежде всего, у Telegram/Facebook
 * поддержка лучше, но не гарантирована) массово не показывают og:image, если
 * файл — WebP: все фото объектов CRM хранит и раздаёт именно в этом формате
 * (см. apps/api/src/routes/properties.ts). Ссылка «Написать в WhatsApp об этом
 * объекте» (ListingDetailPage.tsx) до этого фикса открывала превью без фото.
 *
 * Решение — не менять формат хранения (WebP отлично подходит для обычного
 * показа на сайте), а конвертировать в JPEG на лету именно для og:image/
 * twitter:image через этот прокси-роут (см. boot.ts). Конвертированный файл
 * кешируется в памяти по имени исходника — скрейпер тянет одну и ту же ссылку
 * многократно (WhatsApp, Telegram, Facebook независимо), пересжимать каждый раз
 * незачем.
 */
import sharp from "sharp";

const SITE_ORIGIN = "https://royalhome.tj";
// /uploads/<uuid>.webp — как их формирует CRM (randomUUID() + ".webp").
const FILENAME_RE = /^[a-f0-9-]{10,80}\.webp$/i;

const cache = new Map<string, Buffer>();
const MAX_CACHE_ENTRIES = 500;

async function convert(filename: string): Promise<Buffer | null> {
  const res = await fetch(`${SITE_ORIGIN}/uploads/${filename}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const input = Buffer.from(await res.arrayBuffer());
  // 1200px по широкой стороне — с запасом выше рекомендаций Open Graph
  // (1200×630), но не оригинал в несколько мегапикселей: скрейперы читают
  // превью-картинку лишь один раз, гнать полный размер незачем.
  return sharp(input).rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/** Отдаёt JPEG-версию фото объекта по имени файла (без /uploads/ и расширения
 * источника) либо null, если имя не похоже на фото CRM или конвертация не удалась.
 * Никогда не бросает исключение — вызывающий код (boot.ts) сам решает, что
 * ответить клиенту при null. */
export async function getOgImageJpeg(filename: string): Promise<Buffer | null> {
  if (!FILENAME_RE.test(filename)) return null;
  const cached = cache.get(filename);
  if (cached) return cached;
  try {
    const buf = await convert(filename);
    if (!buf) return null;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(filename, buf);
    return buf;
  } catch (err) {
    console.error(`[ogImage] Не удалось сконвертировать ${filename}:`, err);
    return null;
  }
}

/** Превращает абсолютную или относительную ссылку на /uploads/<uuid>.webp в
 * ссылку на JPEG-прокси для og:image/twitter:image (/api/og-image/<uuid>.jpg —
 * см. boot.ts). Не-WebP и посторонние URL (например DEFAULT_IMAGE) возвращает
 * как есть. */
export function ogImageUrl(url: string): string {
  const m = /\/uploads\/([a-f0-9-]{10,80})\.webp$/i.exec(url);
  return m ? `${SITE_ORIGIN}/api/og-image/${m[1]}.jpg` : url;
}

/** Обратное преобразование: ":id.jpg" из URL прокси → исходное имя файла
 * ("<uuid>.webp") на диске CRM. Возвращает null, если параметр не похож на id. */
export function ogImageParamToFilename(param: string): string | null {
  const m = /^([a-f0-9-]{10,80})\.jpg$/i.exec(param);
  return m ? `${m[1]}.webp` : null;
}

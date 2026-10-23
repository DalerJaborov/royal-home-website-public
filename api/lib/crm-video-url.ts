/**
 * Ролик объекта приходит из CRM абсолютной https-ссылкой на её публичный mp4
 * (`https://crm.royalhome.tj/api/v1/public/property-video/119.mp4?v=ab12cd34`).
 * Фото CRM мы переписываем на same-origin /uploads (api/lib/uploads-url.ts), но
 * mp4 через наш Caddy не проходит — браузер тянет его с хоста CRM напрямую, поэтому
 * тот же хост разрешён в CSP (media-src, api/boot.ts). Чужой хост в синке отбрасываем:
 * иначе CRM-ключ с чужим payload мог бы подсунуть посетителю произвольное видео.
 */
export const CRM_MEDIA_HOST = "crm.royalhome.tj";

/** Длина колонки video_url (db/schema.ts). */
const MAX_VIDEO_URL_LENGTH = 500;

/** Возвращает ссылку как есть, если это https-адрес хоста CRM, иначе null. */
export function normalizeCrmVideoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_VIDEO_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== CRM_MEDIA_HOST || parsed.port) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

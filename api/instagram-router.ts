import { createRouter, publicQuery } from "./middleware";

export interface LiveReel {
  id: string;
  url: string;
  cover: string;
  originalCover?: string;
  /** Короткая подпись для карточки в ленте — одна строка, до 140 символов. */
  caption: string;
  /** Полный текст поста (без хэштегов) — для открытого ролика (лайтбокса),
   *  где короткой карточной подписи недостаточно. */
  fullCaption: string;
  /** Прямая ссылка на видеофайл (Meta CDN) — есть только у своих VIDEO/REELS
   *  постов (Graph API отдаёт media_url для видео только владельцу аккаунта).
   *  Позволяет проигрывать ролик прямо на сайте, не уводя на Instagram. */
  videoUrl?: string;
}

/** Что отдаёт CRM: почти сырые поля Graph API — как показать, решает сайт. */
interface CrmMediaItem {
  id: string;
  permalink: string;
  caption?: string;
  mediaType: string;
  mediaProductType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
}

// Посты берём из CRM (GET /api/v1/public/instagram/media), а не из Graph API
// напрямую. Раньше сайт держал СВОЙ маркер того же аккаунта Instagram в файле на
// сервере — и маркеры гасили друг друга: стоило сгенерировать маркер для CRM, как
// лента на главной пропадала. Теперь маркер один, живёт в Настройках CRM, там же
// продлевается по расписанию, а сайту незачем знать ни про Graph API, ни про
// прокси до graph.instagram.com, ни про сроки жизни маркеров.
//
// Адрес берём из CRM_LEAD_URL (он уже настроен ради заявок), поэтому на сервере
// ничего дописывать не нужно; CRM_INSTAGRAM_URL — только если CRM переедет.
function crmMediaUrl(): string | null {
  const explicit = process.env.CRM_INSTAGRAM_URL;
  if (explicit) return explicit;
  const lead = process.env.CRM_LEAD_URL;
  if (!lead) return null;
  try {
    const url = new URL(lead);
    url.pathname = "/api/v1/public/instagram/media";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Короткая подпись для карточки: весь текст поста одной строкой, без
 *  хэштегов. Первая строка у постов агентства — всегда шапка («🏛 Продаётся
 *  квартира:»), суть (район/комнаты/цена) идёт дальше, поэтому резать по \n
 *  нельзя. */
function cleanCaption(raw: string): string {
  // Убираем хэштеги, но СОХРАНЯЕМ переносы строк — полный текст поста
  // показывается в лайтбоксе с white-space: pre-line, абзацы важны.
  return raw
    .replace(/#[^\s#]+/g, "")
    .replace(/[^\S\n]+/g, " ") // схлопываем пробелы/табы, \n не трогаем
    .replace(/ ?\n ?/g, "\n") // пробелы вокруг переносов
    .replace(/\n{3,}/g, "\n\n") // максимум одна пустая строка между абзацами
    .trim();
}

function shortCaption(cleaned: string): string {
  // Карточка в ленте — одна строка: переносы превращаем в пробелы.
  const oneLine = cleaned.replace(/\s+/g, " ").trim();
  return oneLine.length > 140 ? `${oneLine.slice(0, 139).trimEnd()}…` : oneLine;
}

/** Что показать на главной: сначала настоящие Reels, потом любые видео, потом
 *  что есть — лишь бы полоса была живой, а не из заглушек. */
export function pickReels(items: CrmMediaItem[]): LiveReel[] {
  const reels = items.filter((m) => m.mediaProductType === "REELS");
  const videos = items.filter((m) => m.mediaType === "VIDEO");
  const pool = (reels.length ? reels : videos.length ? videos : items).slice(0, 9);

  return pool
    .filter((m) => m.thumbnailUrl || m.mediaUrl)
    .map((m) => {
      const cleaned = cleanCaption(m.caption ?? "");
      return {
        id: m.id,
        url: m.permalink,
        cover: m.thumbnailUrl ?? m.mediaUrl ?? "",
        caption: shortCaption(cleaned),
        fullCaption: cleaned,
        videoUrl: m.mediaType === "VIDEO" ? m.mediaUrl : undefined,
      };
    });
}

let cache: { data: LiveReel[] | null; fetchedAt: number } | null = null;
let pending: Promise<LiveReel[] | null> | null = null;
const CACHE_MS = 20 * 60 * 1000;
/**
 * Отказ тоже кэшируется — но НЕНАДОЛГО.
 *
 * Кэш заведён против «пачки визитов, бьющей по CRM», однако запись в него шла
 * только при успехе: если CRM недоступна, не продлила маркер Instagram или отдала пустой
 * список, каждый визит на главную шёл в CRM заново с 10-секундным таймаутом.
 * То есть ровно в момент, когда CRM и так плохо, нагрузка на неё не падала,
 * а росла вместе с числом посетителей.
 *
 * Две минуты, а не двадцать: лента не должна «залипать» после короткого сбоя —
 * подхватит посты, как только CRM снова их отдаст.
 */
const NEGATIVE_CACHE_MS = 2 * 60 * 1000;

async function fetchFromCrm(): Promise<LiveReel[] | null> {
  const url = crmMediaUrl();
  if (!url) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      // Отказ обязан быть виден в журнале: обе ветки молча возвращали null, и
      // пропавшая лента на главной была ЕДИНСТВЕННЫМ признаком, что CRM не
      // отвечает. Та же дыра уже закрывалась в /lead-status и tRPC-роутере.
      console.error(`[instagram] CRM ответила ${res.status} ${res.statusText} на ${url}`);
      return null;
    }
    const body = (await res.json()) as { items?: CrmMediaItem[] | null };
    // items: null — «CRM не смогла получить посты». Это не пустая лента: главная
    // должна показать плашки из админки, а не пустое место.
    if (!body.items || body.items.length === 0) return null;
    return pickReels(body.items);
  } catch (err) {
    // CRM недоступна — сайт продолжает работать на плашках из админки.
    console.error("[instagram] лента не получена из CRM:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getLiveReels(): Promise<LiveReel[] | null> {
  const ttl = cache?.data ? CACHE_MS : NEGATIVE_CACHE_MS;
  if (cache && Date.now() - cache.fetchedAt < ttl) return cache.data;
  if (pending) return pending;
  pending = fetchFromCrm().then((live) => {
    cache = { data: live && live.length > 0 ? live : null, fetchedAt: Date.now() };
    return cache.data;
  }).finally(() => { pending = null; });
  return pending;
}

export const instagramRouter = createRouter({
  // Public — powers the home page Reels strip. Cached in memory so a burst
  // of visitors doesn't hammer the CRM.
  getReels: publicQuery.query(async () => {
    // У удачи и у отказа разный срок жизни: посты держим 20 минут, отказ — 2.
    const live = await getLiveReels();
    return live?.map((reel) => ({
      ...reel,
      originalCover: reel.cover,
      cover: `/api/instagram-cover/${encodeURIComponent(reel.id)}`,
    })) ?? null;
  }),
});

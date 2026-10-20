import type { LiveReel } from "../instagram-router";
import { escapeHtml } from "./article-layout";
import { excludesAutomaticTopic } from "./blog-editorial-policy";

/** Only the owner's verified CRM feed is input. A caption can establish what a
 * post shows, but cannot establish a completed sale or a client's life story.
 */
export function chooseRelevantOwnedReel(title: string, reels: LiveReel[]): LiveReel | null {
  const tokens = title.toLowerCase().match(/[а-яё]+/g)?.filter((word) => word.length >= 5 && !/^(душанб|квартир|таджик|перед|после)/.test(word)).map((word) => word.slice(0, 6)) ?? [];
  const candidates = reels.filter((reel) => {
    if (!/^\d+$/.test(reel.id) || excludesAutomaticTopic(reel.fullCaption || reel.caption)) return false;
    try { const url = new URL(reel.url); return url.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(url.hostname) && /^\/(?:reel|p)\/[a-z0-9_-]+\/?$/i.test(url.pathname); }
    catch { return false; }
  });
  return candidates.find((reel) => tokens.filter((token) => (reel.fullCaption || reel.caption).toLowerCase().includes(token)).length >= 2) ?? null;
}
export function ownedReelHtml(reel: LiveReel | null): string {
  if (!reel) return "";
  // Local cached poster is durable; expiring Meta CDN images and media_url are
  // not persisted into articles. The original post's permalink remains the source.
  const poster = /^\/api\/uploads\/[a-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(reel.cover)
    ? `<img src="${escapeHtml(reel.cover)}" alt="${escapeHtml(reel.caption)}" loading="lazy" width="960" height="540" />` : "";
  return `<h2>Видео ROYAL HOME по теме</h2>${poster}<p>${escapeHtml(reel.caption)} <a href="${escapeHtml(reel.url)}">Смотреть исходную публикацию ROYAL HOME в Instagram</a>.</p>`;
}

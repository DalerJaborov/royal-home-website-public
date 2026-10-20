import { resolvePublicPath } from '@contracts/public-i18n';
import { safeStorage } from './safeStorage';

const SESSION_KEY = 'rh_last_public_blog';
const TTL_MS = 30 * 60_000;
const MAX_SOURCE = 100;
const formNames: Record<string, string> = {
  'Контакты': 'contacts', 'Продать квартиру': 'sell', 'Дом, который вы искали': 'home', 'Кнопка «Перезвоните мне»': 'callback',
};
function validArticle(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,254}$/.test(value)
    && (!/^\d+$/.test(value) || (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))));
}

/** Only a public article route, without language, query strings or visitor details. */
export function recordPublicBlogVisit(path: string, now = Date.now()): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || !Number.isSafeInteger(now) || now <= 0) return false;
  const { basePath } = resolvePublicPath(path);
  const article = /^\/blog\/([^/]+)$/.exec(basePath)?.[1];
  if (!validArticle(article)) return false;
  return safeStorage.setItem('session', SESSION_KEY, JSON.stringify({ article, at: now }));
}

/** Call only after the published article has rendered successfully in the selected language. */
export function recordRenderedBlogVisit(path: string, article: { identity: string; published: boolean } | undefined, ready: boolean, now = Date.now()): boolean {
  if (!ready || !article?.published || !validArticle(article.identity)) return false;
  const route = /^\/blog\/([^/]+)$/.exec(resolvePublicPath(path).basePath)?.[1];
  return route === article.identity && recordPublicBlogVisit(path, now);
}

/** Recent article assist, not proof of lead causality; unavailable storage keeps the original form source. */
export function getLeadSource(base: string, now = Date.now()): string {
  const fallback = base.slice(0, MAX_SOURCE);
  if (!Number.isSafeInteger(now) || now <= 0) return fallback;
  const saved = safeStorage.getItem('session', SESSION_KEY);
  if (!saved) return fallback;
  try {
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    const visit = value as { article?: unknown; at?: unknown };
    if (Object.keys(value).length !== 2 || !validArticle(visit.article) || typeof visit.at !== 'number'
      || !Number.isSafeInteger(visit.at) || visit.at <= 0 || now < visit.at || now - visit.at >= TTL_MS) {
      safeStorage.removeItem('session', SESSION_KEY); return fallback;
    }
    const source = `${formNames[base] ?? base}:blog:${visit.article}`;
    // Do not truncate an article slug into a misleading attribution identifier.
    return source.length <= MAX_SOURCE ? source : fallback;
  } catch { safeStorage.removeItem('session', SESSION_KEY); return fallback; }
}

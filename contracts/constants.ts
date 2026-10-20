export const Session = {
  cookieName: "kimi_sid",
  // С2/security-audit-11-09.md: токен жил год без возможности отзыва —
  // украденная cookie работала год, погасить можно было только сменой
  // APP_SECRET (разлогинивает вообще всех). Теперь 12 часов с продлением
  // при активности (api/kimi/auth.ts переиздаёт cookie, когда до истечения
  // токена осталось меньше половины срока) — активный админ не видит
  // разницы, а забытая на чужом устройстве сессия гаснет сама за день.
  maxAgeMs: 12 * 60 * 60 * 1000,
  refreshThresholdMs: 6 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

// Виды кликов по объекту, которые считаем для CRM-воронки покупателя (см.
// db/schema.ts listingEvents, api/analytics-router.ts analytics.event,
// api/crm-sync-router.ts GET /stats). Один список на фронт и бэк — иначе
// фронт мог бы прислать вид клика, который сервер молча не узнаёт.
export const LISTING_EVENT_KINDS = ["phone", "whatsapp", "telegram", "share", "favorite"] as const;
export type ListingEventKind = (typeof LISTING_EVENT_KINDS)[number];

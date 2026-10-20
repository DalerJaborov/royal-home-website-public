// Forwards a freshly created lead to the Royal Home CRM (separate project,
// see D:\CRM — POST /api/v1/webhooks/website-lead). Configured via
// CRM_LEAD_URL / CRM_LEAD_API_KEY (see .env.example); when either is unset
// the integration is simply off and this is a no-op, so the site works
// standalone until the CRM is deployed and wired up.
import { normalizeLeadAttribution, type LeadAttribution } from '@contracts/lead-attribution';
const CRM_LEAD_URL = process.env.CRM_LEAD_URL;
const CRM_LEAD_API_KEY = process.env.CRM_LEAD_API_KEY;
// Status changes use a sibling endpoint on the CRM, same host + same key.
const CRM_LEAD_STATUS_URL = process.env.CRM_LEAD_STATUS_URL;

/**
 * Нормализация под контракт вебхука CRM (D:\CRM, webhooks.ts) — он строже наших
 * форм и при провале ЛЮБОГО поля отвергает всю заявку 400: телефон обязан пройти
 * ^\+?[\d\s()-]{7,20}$, comment ≤ 2000, pageUrl — валидный URL ≤ 500. Сайт же
 * пропускает телефон до 30 символов с любым мусором, комментарий склеивает из
 * источника и сообщения до 3000+, а pageUrl берёт из Referer с рекламными
 * хвостами любой длины — без чистки заявка молча не доезжала до CRM.
 */
function normalizePhoneForCrm(phone: string): string {
  // Только цифры и ведущий «+» — самая строгая форма, которую регэксп CRM
  // принимает всегда; скобки/пробелы/дефисы посетителя ничего не добавляют.
  const digits = phone.replace(/\D/g, "");
  const normalized = (phone.trim().startsWith("+") ? `+${digits}` : digits).slice(0, 20);
  // Меньше 7 цифр CRM всё равно отвергнет; формы сайта также требуют минимум 7.
  return normalized;
}

function normalizePageUrlForCrm(pageUrl: string | undefined): string | undefined {
  if (!pageUrl) return undefined;
  try {
    // origin + pathname: рекламные query-хвосты (utm, gclid…) раздувают URL за
    // предел 500 и для CRM бесполезны — важна страница, с которой пришёл лид.
    const u = new URL(pageUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return undefined;
    return (u.origin + u.pathname).slice(0, 500);
  } catch {
    // Не URL вовсе (битый Referer) — лучше без поля, чем 400 на всю заявку.
    return undefined;
  }
}

/** Returns the CRM's Client.id on success (stored on the lead row so status
 * changes can sync both ways later), or null if the integration is off,
 * unreachable, or rejected the payload. */
export function buildCrmLeadPayload(input: {
  name?: string;
  phone: string;
  message?: string;
  source: string;
  pageUrl?: string;
  attribution?: LeadAttribution;
}) {
  const attribution = normalizeLeadAttribution(input.attribution);
  const acquisition = attribution ? [
    `Первая страница: ${attribution.landingPath}`,
    attribution.referrerHost && `Переход с: ${attribution.referrerHost}`,
    ...(['utmSource', 'utmMedium', 'utmCampaign'] as const).map((key, index) => attribution[key] && `${['utm_source', 'utm_medium', 'utm_campaign'][index]}: ${attribution[key]}`),
  ].filter(Boolean) : [];
  return {
    fullName: input.name?.trim() || "Клиент с сайта",
    phone: normalizePhoneForCrm(input.phone),
    comment: [`Источник: ${input.source}`, ...acquisition, input.message].filter(Boolean).join("\n").slice(0, 2000),
    pageUrl: normalizePageUrlForCrm(input.pageUrl),
  };
}

export type CrmLeadPayload = { fullName: string; phone: string; comment: string; pageUrl?: string };
export type CrmDeliveryResult = { clientId: string } | { error: string; retryable: boolean };

export async function deliverCrmLead(payload: CrmLeadPayload): Promise<CrmDeliveryResult> {
  if (!CRM_LEAD_URL || !CRM_LEAD_API_KEY) return { error: 'not_configured', retryable: true };

  try {
    const res = await fetch(CRM_LEAD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": CRM_LEAD_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // A rejected webhook can echo personal details or credentials. Log its
      // status only; undelivered records remain discoverable by crmClientId=NULL.
      await res.body?.cancel().catch(() => undefined);
      console.error(`[crm] HTTP ${res.status} на forwardLeadToCrm`);
      return { error: `HTTP_${res.status}`, retryable: res.status === 408 || res.status === 429 || res.status >= 500 };
    }
    const body = (await res.json().catch(() => null)) as { clientId?: string } | null;
    return typeof body?.clientId === 'string' && body.clientId.length > 0 && body.clientId.length <= 36
      ? { clientId: body.clientId } : { error: 'invalid_response', retryable: true };
  } catch (err) {
    // CRM down/unreachable/rejected the payload — the lead is already saved
    // locally (see createLead), so a site visitor is never blocked by a CRM
    // outage. Not re-thrown by design, but logged so a CRM-side outage is
    // visible instead of leads silently failing to sync for days.
    console.error("[crm] lead не доставлен в CRM:", safeFailureKind(err));
    return { error: safeFailureKind(err), retryable: true };
  }
}

// Compatibility for development and existing isolated callers.
export async function forwardLeadToCrm(input: Parameters<typeof buildCrmLeadPayload>[0]): Promise<string | null> {
  const result = await deliverCrmLead(buildCrmLeadPayload(input));
  return 'clientId' in result ? result.clientId : null;
}

/** Best-effort — mirrors a status change made by the site admin (see
 * AdminLeadsPage.tsx) onto the matching Client in the CRM. */
export async function forwardStatusToCrm(
  crmClientId: string,
  status: "new" | "contacted" | "closed"
): Promise<void> {
  if (!CRM_LEAD_STATUS_URL || !CRM_LEAD_API_KEY) return;

  try {
    const res = await fetch(CRM_LEAD_STATUS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": CRM_LEAD_API_KEY,
      },
      body: JSON.stringify({ clientId: crmClientId, status }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      console.error(`[crm] HTTP ${res.status} на forwardStatusToCrm`);
    }
  } catch (err) {
    // Same best-effort contract as forwardLeadToCrm — the site's own status
    // already saved; a CRM outage here doesn't block the admin, but is now
    // logged so a stuck sync is discoverable instead of silent.
    console.error("[crm] статус не доставлен в CRM:", safeFailureKind(err));
  }
}

function safeFailureKind(error: unknown): string {
  const kind = error instanceof Error ? error.name : '';
  return ['AbortError', 'TimeoutError', 'TypeError', 'Error'].includes(kind) ? kind : 'UnknownError';
}

// Notifies the Royal Home CRM when an admin edits or deletes a listing that
// originated there (externalId set — see db/schema.ts + crm-sync-router.ts).
// Mirrors forwardLeadToCrm's fetch-with-timeout-and-swallow-errors style:
// this is a best-effort courtesy call, never something the admin's edit/
// delete action should wait on or fail because of. Configured via
// CRM_NOTIFY_URL / CRM_LEAD_API_KEY (see .env.example); the API key is
// shared with the lead webhook — the CRM accepts one key for all site-facing
// webhooks. When CRM_NOTIFY_URL is unset the integration is simply off.
const CRM_NOTIFY_URL = process.env.CRM_NOTIFY_URL;
const CRM_LEAD_API_KEY = process.env.CRM_LEAD_API_KEY;
// Обратный синк объектов, СОЗДАННЫХ в админке сайта: тот же хост CRM, соседний
// путь /site-listing-upserted. Выводим из CRM_NOTIFY_URL, чтобы не плодить env.
const CRM_LISTING_UPSERT_URL = CRM_NOTIFY_URL?.replace(/site-listing-changed\/?$/, "site-listing-upserted");

type ListingChangeInput = {
  externalId: string;
  action: "updated" | "deleted";
  changes?: Record<string, unknown>;
  editedBy?: string;
};

export function notifyCrmOfListingChange(input: ListingChangeInput): void {
  if (!CRM_NOTIFY_URL || !CRM_LEAD_API_KEY) return;

  // Fire-and-forget — callers must not await this on the response path.
  void fetch(CRM_NOTIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": CRM_LEAD_API_KEY,
    },
    body: JSON.stringify({
      externalId: input.externalId,
      action: input.action,
      ...(input.changes && Object.keys(input.changes).length > 0 ? { changes: input.changes } : {}),
      ...(input.editedBy ? { editedBy: input.editedBy } : {}),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  }).then((res) => {
    if (!res.ok) console.error(`[notifyCrm] listing change отклонён CRM: HTTP ${res.status}`);
  }).catch((err) => {
    // CRM down/unreachable/rejected the payload — the site's own write
    // already succeeded, so the admin is never blocked by a CRM outage.
    // Not re-thrown by design, but logged so a stuck sync is discoverable.
    console.error(
      "[notifyCrm] listing change не доставлен в CRM:",
      err instanceof Error ? err.message : err
    );
  });
}

type ListingUpsertInput = {
  /** id листинга на сайте — по нему CRM идемпотентно upsert-ит объект. */
  siteListingId: number;
  action: "upserted" | "deleted";
  title?: string;
  location?: string;
  price?: number;
  rooms?: number;
  area?: number;
  floor?: string;
  totalFloors?: number;
  category?: string;
  type?: string;
  repair?: string;
  description?: string;
  mapAddress?: string;
  lat?: number;
  lng?: number;
  imageUrls?: string[];
  editedBy?: string;
};

/**
 * Обратный синк: объект, созданный/изменённый/удалённый в админке САЙТА (без
 * externalId из CRM), уходит в CRM, где заводится/обновляется/удаляется. Тот же
 * best-effort стиль — не блокирует и не роняет действие админа. Зовём только для
 * листингов сайт-происхождения (у CRM-объектов это делает notifyCrmOfListingChange).
 */
export function notifyCrmOfListingUpsert(input: ListingUpsertInput): void {
  if (!CRM_LISTING_UPSERT_URL || !CRM_LEAD_API_KEY) return;

  void fetch(CRM_LISTING_UPSERT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": CRM_LEAD_API_KEY },
    body: JSON.stringify(input),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  }).then((res) => {
    if (!res.ok) console.error(`[notifyCrm] listing upsert отклонён CRM: HTTP ${res.status}`);
  }).catch((err) => {
    // CRM недоступна/отклонила — запись на сайте уже прошла, админа не блокируем,
    // но логируем, чтобы застрявший синк было видно.
    console.error(
      "[notifyCrm] listing upsert не доставлен в CRM:",
      err instanceof Error ? err.message : err
    );
  });
}

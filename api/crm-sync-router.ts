import { Hono } from "hono";
import { z } from "zod";
import { clientIp } from "./lib/rate-limit";
import { secureCompare } from "./lib/secure-compare";
import { normalizeImageUrls } from "./lib/uploads-url";
import {
  upsertListingByExternalId,
  setListingPublishedByExternalId,
  setListingSoldByExternalId,
  setListingPublishedById,
  setListingSoldById,
  setListingCrmShortId,
  updateListingFactsFromCrm,
} from "./queries/listings";
import { findLeadByCrmClientId, applyStatusFromCrm } from "./queries/leads";
import { createPasswordResetToken } from "./queries/users";
import { getCrmStats } from "./queries/crm-stats";
import { completeCrmRepairFacts } from '@contracts/crm-listing-facts';

// Тот же хардкод, что в api/lib/ogImage.ts / sitemap.ts / prerenderSeo.ts —
// единственный домен сайта, менять вместе с ними.
const SITE_ORIGIN = "https://royalhome.tj";

// Receives property publish/unpublish/sold updates pushed from the CRM
// (D:\CRM — apps/api/src/lib/siteSync.ts). Plain Hono + a shared API key,
// not tRPC: this is a server-to-server call, the CRM has no site session.
// See ops/CRM_SYNC_PLAN.md for the full design.

const factsSchema = z.object({
  floor: z.string().max(100).nullable().optional(),
  totalFloors: z.number().int().positive().max(1000).nullable().optional(),
  repair: z.string().max(255).nullable().optional(),
  stage: z.string().max(255).nullable().optional(),
  type: z.enum(['Новостройки', 'Вторичка']).nullable().optional(),
  urgent: z.boolean().optional(),
});

const itemSchema = z.object({
  externalId: z.string().min(1).max(100),
  // Для объектов, СОЗДАННЫХ на сайте (у них нет строки с этим externalId — CRM
  // ссылается на них через siteListingId). Если задан — действуем по native-id
  // листинга, иначе по externalId. Чинит «снять с публикации»/«продано» для них.
  siteListingId: z.number().int().positive().optional(),
  // Номер карточки в CRM (Property.shortId) — тот самый «№N», который сайт показывает
  // посетителю и который бот CRM читает в WhatsApp-сообщении. Он же content_id
  // каталога Meta. .catch(undefined): старый payload без поля (или с мусором) не
  // должен ронять всю партию — просто номер не обновится.
  shortId: z.number().int().positive().optional().catch(undefined),
  action: z.enum(["publish", "unpublish", "sold", "unsold", "facts"]),
  facts: factsSchema.refine(value => Object.keys(value).length > 0, 'Нет характеристик').optional(),
  // Required for "publish" (may need to create the listing). Ignored for
  // unpublish/sold/unsold, which only ever touch an existing row.
  data: z
    .object({
      title: z.string().min(1).max(500),
      location: z.string().min(1).max(500),
      price: z.number().int().positive(),
      rooms: z.number().int().positive(),
      area: z.number().positive(),
      category: z.enum(["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"]),
      description: z.string().max(5000).optional(),
      // A CRM property can already be SOLD when first published — the badge
      // state must arrive with the payload, not only via the "sold" action.
      sold: z.boolean().optional(),
      imageUrls: z.array(z.string()).max(30).optional(),
      // Real geocoded coordinates + optional Instagram video-tour link — see
      // db/schema.ts. Patchy geocoder coverage means both are optional; the
      // site falls back to district-approximate coords when lat/lng are absent.
      lat: z.number().optional(),
      lng: z.number().optional(),
      // .catch(undefined): в CRM у десятков старых карточек instagramUrl хранится
      // битым (не-URL) — одна такая карточка в партии роняла 400 ВСЮ публикацию
      // из CRM. Ссылка на видео-тур — украшение, не данные объекта: невалидное
      // значение молча превращаем в undefined и публикуем остальное.
      instagramUrl: z.string().url().optional().catch(undefined),
    })
    .extend(factsSchema.shape)
    .optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
});

// Modest per-IP limit — this is key-authed server-to-server traffic, not a
// public form, so the goal is only to blunt abuse of a leaked key.
const hits = new Map<string, number[]>();
let lastSweep = Date.now();
function rateLimited(req: Request): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  // Periodic sweep so entries for one-off IPs don't accumulate forever.
  if (now - lastSweep > 10 * 60 * 1000) {
    lastSweep = now;
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  const key = clientIp(req);
  const times = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= 20) return true;
  times.push(now);
  hits.set(key, times);
  return false;
}

// Свой скромный лимит для /stats — CRM тянет его раз в час по расписанию, это
// НЕ массовая синхронизация из /listings (20/мин) и не аварийный сброс пароля
// (adminResetRateLimited): достаточно, чтобы утёкший ключ не давал молотить
// эндпоинт бесконечно, не более того.
const statsHits = new Map<string, number[]>();
let statsLastSweep = Date.now();
function statsRateLimited(req: Request): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  if (now - statsLastSweep > 10 * 60 * 1000) {
    statsLastSweep = now;
    for (const [k, v] of statsHits) {
      if (v.every((t) => now - t >= windowMs)) statsHits.delete(k);
    }
  }
  const key = clientIp(req);
  const times = (statsHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= 30) return true;
  times.push(now);
  statsHits.set(key, times);
  return false;
}

// admin-reset hands back a full admin password (and can strip 2FA) — much
// higher stakes than the listing/lead-status sync above, so it gets its own
// much tighter per-IP cap instead of sharing the 20/min bucket meant for bulk
// listing sync traffic.
const adminResetHits = new Map<string, number[]>();
let adminResetLastSweep = Date.now();
function adminResetRateLimited(req: Request): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  if (now - adminResetLastSweep > 10 * 60 * 1000) {
    adminResetLastSweep = now;
    for (const [k, v] of adminResetHits) {
      if (v.every((t) => now - t >= windowMs)) adminResetHits.delete(k);
    }
  }
  const key = clientIp(req);
  const times = (adminResetHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= 3) return true;
  times.push(now);
  adminResetHits.set(key, times);
  return false;
}

export const crmSyncApp = new Hono();

crmSyncApp.post("/listings", async (c) => {
  const apiKey = process.env.CRM_SYNC_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Приём объектов из CRM не настроен" }, 503);
  }
  if (!secureCompare(c.req.header("X-Api-Key"), apiKey)) {
    return c.json({ error: "Неверный API-ключ" }, 401);
  }
  if (rateLimited(c.req.raw)) {
    return c.json({ error: "Слишком много запросов" }, 429);
  }

  const json = await c.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: "Неверные данные", details: parsed.error.flatten() }, 400);
  }

  const results = [];
  for (const item of parsed.data.items) {
    try {
      const siteId = item.siteListingId;
      // Любое действие несёт номер карточки: полный пересинк из CRM дозаполняет crm_short_id
      // у уже существующих строк. publish сам пишет номер (при создании/обновлении ниже).
      if (item.shortId !== undefined && item.action !== "publish") {
        await setListingCrmShortId(siteId != null ? { id: siteId } : { externalId: item.externalId }, item.shortId);
      }
      if (item.action === 'facts') {
        if (!item.facts) {
          results.push({ externalId: item.externalId, ok: false, error: 'Нет характеристик объекта' });
          continue;
        }
        const id = await updateListingFactsFromCrm(siteId != null ? { id: siteId } : { externalId: item.externalId }, completeCrmRepairFacts(item.facts));
        results.push(id == null ? { externalId: item.externalId, ok: false, error: 'Объект не найден или база данных недоступна' } : { externalId: item.externalId, ok: true, id });
      } else if (item.action === "publish") {
        if (siteId != null) {
          // Объект живёт на сайте (создан здесь) — просто снова показываем его,
          // не перезаписывая его собственные (более богатые) поля данными из CRM.
          await setListingPublishedById(siteId, true);
          if (item.shortId !== undefined) await setListingCrmShortId({ id: siteId }, item.shortId);
          if (item.data) await updateListingFactsFromCrm({ id: siteId }, item.data);
          results.push({ externalId: item.externalId, ok: true, id: siteId });
        } else {
          if (!item.data) {
            results.push({ externalId: item.externalId, ok: false, error: "Нет данных объекта для публикации" });
            continue;
          }
          const id = await upsertListingByExternalId(item.externalId, {
            ...item.data,
            imageUrls: normalizeImageUrls(item.data.imageUrls) ?? undefined,
            crmShortId: item.shortId,
          });
          // null = БД недоступна (memory-режим): объект НЕ сохранён — честная ошибка
          // вместо ok:true, иначе CRM пометит объект опубликованным, а на сайте его нет.
          if (id == null) {
            results.push({ externalId: item.externalId, ok: false, error: "База данных сайта недоступна — объект не сохранён" });
          } else {
            results.push({ externalId: item.externalId, ok: true, id });
          }
        }
      } else if (item.action === "unpublish") {
        if (siteId != null) await setListingPublishedById(siteId, false);
        else await setListingPublishedByExternalId(item.externalId, false);
        results.push({ externalId: item.externalId, ok: true });
      } else if (item.action === "sold") {
        if (siteId != null) await setListingSoldById(siteId, true);
        else await setListingSoldByExternalId(item.externalId, true);
        results.push({ externalId: item.externalId, ok: true });
      } else {
        if (siteId != null) await setListingSoldById(siteId, false);
        else await setListingSoldByExternalId(item.externalId, false);
        results.push({ externalId: item.externalId, ok: true });
      }
    } catch (err) {
      results.push({ externalId: item.externalId, ok: false, error: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  return c.json({ results });
});

/**
 * CRM changed a WEBSITE-sourced client's status (D:\CRM —
 * apps/api/src/lib/notifySite.ts) — mirrors it onto the matching row in the
 * site's own leads table (see AdminLeadsPage.tsx). Same key as /listings.
 * Writes directly via applyStatusFromCrm, which does NOT call forwardStatusToCrm
 * — otherwise this would immediately echo back to the CRM and loop forever.
 */
const leadStatusSchema = z.object({
  crmClientId: z.string().min(1).max(100),
  status: z.enum(["new", "contacted", "closed"]),
});

crmSyncApp.post("/lead-status", async (c) => {
  const apiKey = process.env.CRM_SYNC_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Приём статусов из CRM не настроен" }, 503);
  }
  if (!secureCompare(c.req.header("X-Api-Key"), apiKey)) {
    return c.json({ error: "Неверный API-ключ" }, 401);
  }
  if (rateLimited(c.req.raw)) {
    return c.json({ error: "Слишком много запросов" }, 429);
  }

  const json = await c.req.json().catch(() => null);
  const parsed = leadStatusSchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: "Неверные данные", details: parsed.error.flatten() }, 400);
  }

  try {
    const lead = await findLeadByCrmClientId(parsed.data.crmClientId);
    if (!lead) return c.json({ ok: true, matched: false });

    await applyStatusFromCrm(lead.id, parsed.data.status);
    return c.json({ ok: true, matched: true });
  } catch (err) {
    console.error("[lead-status] Сбой применения статуса из CRM:", err);
    return c.json({ error: "Не удалось применить статус" }, 500);
  }
});

/**
 * Тепловая карта посещаемости + «воронка покупателя» по объекту — CRM тянет
 * раз в час (см. db/schema.ts listingEvents, api/queries/crm-stats.ts).
 * Тот же ключ, что /listings и /lead-status: это тоже рутинная server-to-server
 * синхронизация, не что-то более чувствительное вроде admin-reset.
 */
const statsQuerySchema = z
  .object({
    // offset: true — принимаем и суффикс Z, и +05:00: CRM может слать оба варианта.
    since: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.until).getTime() > new Date(v.since).getTime(), {
    message: "until должен быть позже since",
    path: ["until"],
  })
  .refine((v) => new Date(v.until).getTime() - new Date(v.since).getTime() <= 32 * 24 * 60 * 60 * 1000, {
    // 32, не 31 — чтобы месяц с 31 днём плюс небольшой запас на границе не отваливался.
    message: "Диапазон не может быть больше 32 дней",
    path: ["until"],
  })
  .refine((v) => new Date(v.since).getTime() >= Date.now() - 400 * 24 * 60 * 60 * 1000, {
    // 400, не 365 — небольшой запас, чтобы «ровно год назад» не падало из-за
    // разницы в несколько часов между временем запроса и временем валидации.
    message: "since не может быть старше 400 дней",
    path: ["since"],
  });

crmSyncApp.get("/stats", async (c) => {
  const apiKey = process.env.CRM_SYNC_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Отдача статистики в CRM не настроена" }, 503);
  }
  if (!secureCompare(c.req.header("X-Api-Key"), apiKey)) {
    return c.json({ error: "Неверный API-ключ" }, 401);
  }
  if (statsRateLimited(c.req.raw)) {
    return c.json({ error: "Слишком много запросов" }, 429);
  }

  const parsed = statsQuerySchema.safeParse({
    since: c.req.query("since"),
    until: c.req.query("until"),
  });
  if (!parsed.success) {
    return c.json({ error: "Неверные параметры", details: parsed.error.flatten() }, 400);
  }

  try {
    const stats = await getCrmStats(new Date(parsed.data.since), new Date(parsed.data.until));
    return c.json(stats);
  } catch (err) {
    console.error("[stats] Сбой сбора статистики для CRM:", err);
    return c.json({ error: "Не удалось собрать статистику" }, 500);
  }
});

/**
 * Аварийный сброс пароля админки сайта из CRM. Инициируется директором в
 * Настройках CRM (за step-up с 2FA) — публичной формы «забыли пароль» на самом
 * сайте нет намеренно.
 *
 * Свой отдельный ключ (CRM_SYNC_ADMIN_RESET_KEY), НЕ общий CRM_SYNC_API_KEY:
 * этот эндпоинт отдаёт пароль администратора целиком и может снять 2FA — при
 * утечке общего ключа (используется ещё и для рутинной синхронизации
 * объектов/статусов лидов, площадь утечки шире) захват аккаунта не должен
 * идти в комплекте. Плюс отдельный жёсткий лимит (adminResetRateLimited),
 * а не общий 20/мин для массовой синхронизации.
 */
const adminResetSchema = z.object({
  resetTotp: z.boolean().optional(),
});

crmSyncApp.post("/admin-reset", async (c) => {
  const apiKey = process.env.CRM_SYNC_ADMIN_RESET_KEY;
  if (!apiKey) {
    return c.json({ error: "Канал аварийного сброса не настроен" }, 503);
  }
  if (!secureCompare(c.req.header("X-Api-Key"), apiKey)) {
    return c.json({ error: "Неверный API-ключ" }, 401);
  }
  if (adminResetRateLimited(c.req.raw)) {
    return c.json({ error: "Слишком много запросов" }, 429);
  }

  const json = await c.req.json().catch(() => ({}));
  const parsed = adminResetSchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: "Неверные данные" }, 400);
  }

  try {
    // С3/security-audit-11-09.md: пароль здесь больше не генерируется и не
    // возвращается — только одноразовая ссылка (TTL 15 минут) на смену
    // пароля самим директором. 2FA не снимается этим запросом: resetTotp
    // лишь запоминается и применяется в момент, когда ссылкой
    // действительно воспользовались (queries/users.ts consumePasswordResetToken).
    const { email, token } = await createPasswordResetToken({ resetTotp: parsed.data.resetTotp });
    console.log(`[admin-reset] Ссылка на смену пароля админки выдана по запросу CRM (resetTotp=${Boolean(parsed.data.resetTotp)})`);
    const resetLink = `${SITE_ORIGIN}/admin/reset-password?token=${token}`;
    return c.json({ ok: true, email, resetLink, expiresInMinutes: 15 });
  } catch (err) {
    console.error("[admin-reset] Сбой выдачи ссылки на сброс пароля:", err);
    return c.json({ error: "Не удалось выдать ссылку на сброс пароля" }, 500);
  }
});

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { crmSyncApp } from "./crm-sync-router";

/**
 * GET /stats — тот же приёмный эндпоинт для CRM, что /listings и /lead-status
 * (X-Api-Key), плюс собственная валидация диапазона дат (см. statsQuerySchema
 * в crm-sync-router.ts). Без DATABASE_URL успешные запросы обслуживает память
 * (api/queries/memory-store.ts) — отдельно проверено в crm-stats.test.ts.
 */
describe("GET /api/v1/crm/stats", () => {
  const API_KEY = "test-crm-sync-key";
  const originalKey = process.env.CRM_SYNC_API_KEY;

  beforeEach(() => {
    process.env.CRM_SYNC_API_KEY = API_KEY;
  });
  afterEach(() => {
    process.env.CRM_SYNC_API_KEY = originalKey;
  });

  function request(query: string, apiKey: string | undefined = API_KEY) {
    const headers: Record<string, string> = {};
    if (apiKey !== undefined) headers["X-Api-Key"] = apiKey;
    return crmSyncApp.request(`/stats?${query}`, { headers });
  }

  it("ключ не настроен на сервере — 503", async () => {
    process.env.CRM_SYNC_API_KEY = "";
    const res = await request("since=2026-09-01T00:00:00Z&until=2026-09-02T00:00:00Z");
    expect(res.status).toBe(503);
  });

  it("неверный ключ — 401", async () => {
    const res = await request("since=2026-09-01T00:00:00Z&until=2026-09-02T00:00:00Z", "wrong-key");
    expect(res.status).toBe(401);
  });

  it("since/until не ISO datetime — 400", async () => {
    const res = await request("since=2026-09-01&until=2026-09-02");
    expect(res.status).toBe(400);
  });

  it("until не позже since — 400", async () => {
    const res = await request("since=2026-09-02T00:00:00Z&until=2026-09-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("until равен since — тоже 400 (диапазон должен быть непустым)", async () => {
    const res = await request("since=2026-09-01T00:00:00Z&until=2026-09-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("диапазон больше 32 дней — 400", async () => {
    const res = await request("since=2026-01-01T00:00:00Z&until=2026-03-10T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("диапазон ровно 32 дня — проходит валидацию (200)", async () => {
    const res = await request("since=2026-08-01T00:00:00Z&until=2026-09-02T00:00:00Z");
    expect(res.status).toBe(200);
  });

  it("since старше 400 дней — 400", async () => {
    const res = await request("since=2015-01-01T00:00:00Z&until=2015-01-02T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("корректный небольшой диапазон — 200 с ожидаемой формой ответа", async () => {
    const res = await request("since=2026-09-01T00:00:00Z&until=2026-09-02T00:00:00Z");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hours: unknown[]; listings: unknown[] };
    expect(Array.isArray(body.hours)).toBe(true);
    expect(Array.isArray(body.listings)).toBe(true);
  });
});

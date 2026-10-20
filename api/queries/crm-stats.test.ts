import { describe, expect, it, beforeEach } from "vitest";
import { getCrmStats, hourBucketSeconds, dushanbeDaySeconds, dushanbeDayString } from "./crm-stats";
import { memoryPageViews, memoryListingEvents } from "./memory-store";

/**
 * Без DATABASE_URL (см. api/listing-router.test.ts) getCrmStats обслуживается
 * памятью — те же формулы бакетов (hourBucketSeconds/dushanbeDaySeconds), что
 * и боевой SQL-путь, поэтому границы, проверенные здесь, верны и для него.
 */

beforeEach(() => {
  memoryPageViews.length = 0;
  memoryListingEvents.length = 0;
});

describe("сутки по Душанбе (UTC+5) — граница ровно в 19:00 UTC", () => {
  it("18:59 UTC и 19:00 UTC одного календарного дня относятся к РАЗНЫМ душанбинским суткам", () => {
    const before = new Date("2026-09-10T18:59:00Z"); // 23:59 в Душанбе, ещё 10 сентября
    const after = new Date("2026-09-10T19:00:00Z"); // 00:00 в Душанбе, уже 11 сентября
    const dayBefore = dushanbeDaySeconds(before);
    const dayAfter = dushanbeDaySeconds(after);
    expect(dayAfter).toBe(dayBefore + 1);
    expect(dushanbeDayString(dayBefore)).toBe("2026-09-10");
    expect(dushanbeDayString(dayAfter)).toBe("2026-09-11");
  });

  it("hourBucketSeconds округляет момент вниз до начала UTC-часа", () => {
    const at = new Date("2026-09-10T10:45:30Z");
    expect(hourBucketSeconds(at)).toBe(Date.UTC(2026, 8, 10, 10, 0, 0) / 1000);
  });

  it("просмотр объекта до и после границы 19:00 UTC попадает в разные дни воронки", async () => {
    memoryPageViews.push(
      { path: "/listing/42", visitorId: "v1", createdAt: new Date("2026-09-10T18:59:00Z") },
      { path: "/listing/42", visitorId: "v2", createdAt: new Date("2026-09-10T19:00:00Z") },
    );
    const stats = await getCrmStats(new Date("2026-09-10T00:00:00Z"), new Date("2026-09-12T00:00:00Z"));
    const days = stats.listings
      .filter((l) => l.listingId === 42)
      .map((l) => l.day)
      .sort();
    expect(days).toEqual(["2026-09-10", "2026-09-11"]);
  });
});

describe("админские пути не попадают в статистику для CRM", () => {
  it("страница /admin/* не считается в почасовом трафике", async () => {
    memoryPageViews.push(
      { path: "/admin/dashboard", visitorId: "v1", createdAt: new Date("2026-09-10T10:00:00Z") },
      { path: "/", visitorId: "v2", createdAt: new Date("2026-09-10T10:30:00Z") },
    );
    const stats = await getCrmStats(new Date("2026-09-10T00:00:00Z"), new Date("2026-09-11T00:00:00Z"));
    const totalViews = stats.hours.reduce((sum, h) => sum + h.views, 0);
    expect(totalViews).toBe(1);
  });
});

describe("клики по объекту объединяются с просмотрами по объекту и дню", () => {
  it("views/visitors — из page_views, клики по видам — из listing_events, за тот же день", async () => {
    memoryPageViews.push(
      { path: "/listing/7", visitorId: "v1", createdAt: new Date("2026-09-10T10:00:00Z") },
      { path: "/listing/7", visitorId: "v2", createdAt: new Date("2026-09-10T11:00:00Z") },
    );
    memoryListingEvents.push(
      { listingId: 7, kind: "whatsapp", visitorId: "v1", createdAt: new Date("2026-09-10T10:05:00Z") },
      { listingId: 7, kind: "favorite", visitorId: "v2", createdAt: new Date("2026-09-10T10:06:00Z") },
    );
    const stats = await getCrmStats(new Date("2026-09-10T00:00:00Z"), new Date("2026-09-11T00:00:00Z"));
    const bucket = stats.listings.find((l) => l.listingId === 7);
    expect(bucket).toBeDefined();
    expect(bucket?.views).toBe(2);
    expect(bucket?.visitors).toBe(2);
    expect(bucket?.whatsapp).toBe(1);
    expect(bucket?.favorite).toBe(1);
    expect(bucket?.phone).toBe(0);
    expect(bucket?.telegram).toBe(0);
    expect(bucket?.share).toBe(0);
  });

  it("клик без единого просмотра объекта в диапазоне всё равно создаёт свою строку", async () => {
    memoryListingEvents.push({ listingId: 99, kind: "phone", visitorId: "v1", createdAt: new Date("2026-09-10T10:00:00Z") });
    const stats = await getCrmStats(new Date("2026-09-10T00:00:00Z"), new Date("2026-09-11T00:00:00Z"));
    const bucket = stats.listings.find((l) => l.listingId === 99);
    expect(bucket?.views).toBe(0);
    expect(bucket?.phone).toBe(1);
  });
});

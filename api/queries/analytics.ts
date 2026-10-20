import { and, desc, gte, lt, sql } from "drizzle-orm";
import { getDb, isDbAvailable } from "./connection";
import { pageViews, listingEvents } from "@db/schema";
import type { ListingEventKind } from "@contracts/constants";
import { memoryPageViews, memoryTrackPageView, memoryTrackListingEvent } from "./memory-store";

export async function trackPageView(path: string, visitorId?: string) {
  if (!isDbAvailable()) {
    memoryTrackPageView(path, visitorId);
    return;
  }
  const db = getDb()!;
  await db.insert(pageViews).values({ path, visitorId: visitorId ?? null });
}

/** Клик по звонку/WhatsApp/Telegram/«поделиться»/«в избранное» на карточке
 * объекта — см. db/schema.ts listingEvents. Как и trackPageView, никогда не
 * бросает наружу связанную с БД ошибку выше уровня api/analytics-router.ts —
 * клик посетителя не должен падать из-за аналитики. */
export async function trackListingEvent(listingId: number, kind: ListingEventKind, visitorId?: string) {
  if (!isDbAvailable()) {
    memoryTrackListingEvent(listingId, kind, visitorId);
    return;
  }
  const db = getDb()!;
  await db.insert(listingEvents).values({ listingId, kind, visitorId: visitorId ?? null });
}

// Админские страницы не считаются трафиком сайта.
const notAdminPath = sql`${pageViews.path} not like '/admin%'`;

/** Раньше вся статистика жила в localStorage браузера — каждый посетитель
 * видел только свою собственную историю, а не реальный трафик сайта.
 *
 * Считаем агрегаты в SQL (условные SUM/COUNT DISTINCT + GROUP BY), а не грузим
 * всю таблицу page_views в JS — на живом сайте она растёт бесконечно. */
/**
 * Границы суток, месяца и года — по Душанбе (UTC+5), а не по часовому поясу
 * процесса.
 *
 * Контейнер живёт в UTC, а `new Date(год, месяц, день)` берёт полночь ИМЕННО
 * его пояса. То есть «сегодня» в отчётах начиналось в 05:00 по Душанбе, и все
 * визиты с полуночи до пяти утра попадали во «вчера»: цифра за сегодня утром
 * занижена, за вчера — завышена, а «месяц» и «год» сдвинуты на пять часов на
 * своих границах. В CRM для этого есть lib/dushanbeTime.ts; на сайте такого
 * модуля не было, поэтому смещение считаем здесь.
 *
 * Фиксированные +5 часов — у Таджикистана нет перехода на летнее время.
 */
const DUSHANBE_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Начало календарной единицы по Душанбе, выраженное в UTC-моменте.
 *  Экспортируется ради теста: границы времени ломаются молча и заметны не сразу. */
export function dushanbeStartOf(unit: "day" | "month" | "year", at: Date = new Date()): Date {
  const local = new Date(at.getTime() + DUSHANBE_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = unit === "year" ? 0 : local.getUTCMonth();
  const d = unit === "day" ? local.getUTCDate() : 1;
  return new Date(Date.UTC(y, m, d) - DUSHANBE_OFFSET_MS);
}

export async function getAnalyticsSummary() {
  const todayStart = dushanbeStartOf("day");
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = dushanbeStartOf("month");
  const yearStart = dushanbeStartOf("year");

  if (!isDbAvailable()) {
    const views = memoryPageViews.filter((v) => v.createdAt >= yearStart && !v.path.startsWith("/admin"));
    const pageCounts = new Map<string, number>();
    for (const v of views) pageCounts.set(v.path, (pageCounts.get(v.path) ?? 0) + 1);
    const uniqueVisitors = (list: typeof views) => new Set(list.map((v) => v.visitorId).filter(Boolean)).size;
    return {
      total: views.length,
      today: views.filter((v) => v.createdAt >= todayStart).length,
      yesterday: views.filter((v) => v.createdAt >= yesterdayStart && v.createdAt < todayStart).length,
      month: views.filter((v) => v.createdAt >= monthStart).length,
      year: views.length,
      uniqueToday: uniqueVisitors(views.filter((v) => v.createdAt >= todayStart)),
      uniqueMonth: uniqueVisitors(views.filter((v) => v.createdAt >= monthStart)),
      topPages: [...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) as [string, number][],
    };
  }

  const db = getDb()!;
  const yearScope = and(gte(pageViews.createdAt, yearStart), notAdminPath);

  const [totals] = await db
    .select({
      total: sql<number>`count(*)`,
      today: sql<number>`coalesce(sum(${pageViews.createdAt} >= ${todayStart}), 0)`,
      yesterday: sql<number>`coalesce(sum(${pageViews.createdAt} >= ${yesterdayStart} and ${pageViews.createdAt} < ${todayStart}), 0)`,
      month: sql<number>`coalesce(sum(${pageViews.createdAt} >= ${monthStart}), 0)`,
      // Просмотры страниц ≠ люди — один гость обычно листает несколько страниц
      // за визит, поэтому отдельно считаем уникальных посетителей по visitorId.
      // COUNT(DISTINCT CASE …) игнорирует NULL — строки вне периода и без
      // visitorId (до появления колонки) не считаются.
      uniqueToday: sql<number>`count(distinct case when ${pageViews.createdAt} >= ${todayStart} then ${pageViews.visitorId} end)`,
      uniqueMonth: sql<number>`count(distinct case when ${pageViews.createdAt} >= ${monthStart} then ${pageViews.visitorId} end)`,
    })
    .from(pageViews)
    .where(yearScope);

  const topRows = await db
    .select({ path: pageViews.path, count: sql<number>`count(*)` })
    .from(pageViews)
    .where(yearScope)
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const total = Number(totals?.total ?? 0);
  return {
    total,
    today: Number(totals?.today ?? 0),
    yesterday: Number(totals?.yesterday ?? 0),
    month: Number(totals?.month ?? 0),
    year: total,
    uniqueToday: Number(totals?.uniqueToday ?? 0),
    uniqueMonth: Number(totals?.uniqueMonth ?? 0),
    topPages: topRows.map((r) => [r.path, Number(r.count)] as [string, number]),
  };
}

export async function getWeeklyChart() {
  // Сутки — по Душанбе (см. dushanbeStartOf выше): столбик «сегодня» иначе
  // начинался в 05:00 по местному времени, и утренние визиты уезжали во вчера.
  const todayStart = dushanbeStartOf("day");
  const days: { label: string; full: string; count: number; start: Date; end: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    days.push({
      // Подписи тоже по Душанбе — иначе столбик «пн» мог называться воскресеньем.
      label: start.toLocaleDateString("ru-RU", { weekday: "short", timeZone: "Asia/Dushanbe" }),
      full: start.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Dushanbe" }),
      count: 0,
      start,
      end,
    });
  }

  if (isDbAvailable()) {
    // Один проход по неделе с условными суммами вместо 7 отдельных COUNT-запросов.
    // Границы дней считаются в JS (как и раньше) — не зависим от часового пояса БД.
    const db = getDb()!;
    const buckets = Object.fromEntries(
      days.map((d, i) => [
        `d${i}`,
        sql<number>`coalesce(sum(${pageViews.createdAt} >= ${d.start} and ${pageViews.createdAt} < ${d.end}), 0)`,
      ]),
    );
    const [row] = await db
      .select(buckets)
      .from(pageViews)
      .where(and(gte(pageViews.createdAt, days[0].start), lt(pageViews.createdAt, days[6].end), notAdminPath));
    days.forEach((d, i) => {
      d.count = Number(row?.[`d${i}`] ?? 0);
    });
  } else {
    for (const d of days) {
      d.count = memoryPageViews.filter(
        (v) => !v.path.startsWith("/admin") && v.createdAt >= d.start && v.createdAt < d.end,
      ).length;
    }
  }

  return days.map(({ label, full, count }) => ({ label, full, count }));
}

export async function getPopularListings(): Promise<{ id: number; count: number }[]> {
  if (!isDbAvailable()) {
    const counts = new Map<number, number>();
    for (const v of memoryPageViews) {
      const match = v.path.match(/\/listing\/(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // GROUP BY по id, извлечённому прямо в SQL, вместо полной выгрузки таблицы.
  // REGEXP_SUBSTR → "/listing/123", SUBSTRING(…, 10) отрезает "/listing/" (9 симв.).
  const db = getDb()!;
  const listingId = sql<number>`cast(substring(regexp_substr(${pageViews.path}, '/listing/[0-9]+'), 10) as unsigned)`;
  const rows = await db
    .select({ id: listingId, count: sql<number>`count(*)` })
    .from(pageViews)
    .where(sql`${pageViews.path} regexp '/listing/[0-9]+'`)
    .groupBy(listingId)
    .orderBy(desc(sql`count(*)`))
    .limit(5);
  return rows.map((r) => ({ id: Number(r.id), count: Number(r.count) }));
}

import { and, gte, lt, sql } from "drizzle-orm";
import { getDb, isDbAvailable } from "./connection";
import { pageViews, listingEvents } from "@db/schema";
import { findListingExternalIds } from "./listings";
import { memoryPageViews, memoryListingEvents } from "./memory-store";
import type { ListingEventKind } from "@contracts/constants";
import { LISTING_EVENT_KINDS } from "@contracts/constants";

// Отдаётся CRM раз в час (D:\CRM тянет GET /api/v1/crm/stats) для тепловой
// карты посещаемости и «воронки покупателя» по объекту — см.
// api/crm-sync-router.ts.
//
// Часовой пояс Душанбе — UTC+5, без перехода на летнее время. Границы часов и
// суток считаются в SQL через UNIX_TIMESTAMP, а не через DATE()/HOUR() MySQL —
// это не зависит от часового пояса сессии/сервера MySQL (`time_zone` может быть
// не настроен, и DATE() тогда считает по системному поясу контейнера, не по
// Душанбе). +18000 = 5 часов в секундах.
const DUSHANBE_OFFSET_SECONDS = 5 * 60 * 60;
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;

export interface HourBucket {
  hourStart: string;
  views: number;
  visitors: number;
}

export interface ListingBucket {
  listingId: number;
  externalId: string | null;
  day: string;
  views: number;
  visitors: number;
  phone: number;
  whatsapp: number;
  telegram: number;
  share: number;
  favorite: number;
}

export interface CrmStats {
  hours: HourBucket[];
  listings: ListingBucket[];
}

/** Начало UTC-часа, содержащего `date`, в unix-секундах. Экспортируется ради
 * теста — тот же расчёт делает и SQL-запрос ниже, тест только на JS-путь
 * (память), но формула должна остаться одной и той же на обоих путях. */
export function hourBucketSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000 / HOUR_SECONDS) * HOUR_SECONDS;
}

/** Номер суток по Душанбе (UTC+5), в которые попадает `date` — не строка,
 * чтобы группировать без форматирования. 19:00 UTC — граница между сутками:
 * `dushanbeDaySeconds` для 18:59 UTC и для следующих суток 19:00 UTC различаются. */
export function dushanbeDaySeconds(date: Date): number {
  return Math.floor((date.getTime() / 1000 + DUSHANBE_OFFSET_SECONDS) / DAY_SECONDS);
}

/** Номер дня (см. dushanbeDaySeconds) → "YYYY-MM-DD" по Душанбе. dayNumber*86400
 * секунд эпохи — это ровно полночь того дня ПО ДУШАНБЕ, но выраженная как
 * UTC-момент — поэтому обычный toISOString().slice(0, 10) даёт нужную дату. */
export function dushanbeDayString(dayNumber: number): string {
  return new Date(dayNumber * DAY_SECONDS * 1000).toISOString().slice(0, 10);
}

function emptyListingBucket(listingId: number, day: string): ListingBucket {
  return { listingId, externalId: null, day, views: 0, visitors: 0, phone: 0, whatsapp: 0, telegram: 0, share: 0, favorite: 0 };
}

export async function getCrmStats(since: Date, until: Date): Promise<CrmStats> {
  if (!isDbAvailable()) {
    return getCrmStatsFromMemory(since, until);
  }
  const db = getDb()!;

  // Админские пути — не трафик сайта (тот же фильтр, что в getAnalyticsSummary).
  const notAdminPath = sql`${pageViews.path} not like '/admin%'`;
  const inRange = (col: typeof pageViews.createdAt | typeof listingEvents.createdAt) =>
    and(gte(col, since), lt(col, until));

  // ─── hours ───
  const hourBucketExpr = sql<number>`floor(unix_timestamp(${pageViews.createdAt}) / ${HOUR_SECONDS}) * ${HOUR_SECONDS}`;
  const hourRows = await db
    .select({
      hourStart: hourBucketExpr,
      views: sql<number>`count(*)`,
      visitors: sql<number>`count(distinct ${pageViews.visitorId})`,
    })
    .from(pageViews)
    .where(and(inRange(pageViews.createdAt), notAdminPath))
    .groupBy(hourBucketExpr)
    .orderBy(hourBucketExpr);

  const hours: HourBucket[] = hourRows.map((r) => ({
    hourStart: new Date(Number(r.hourStart) * 1000).toISOString(),
    views: Number(r.views),
    visitors: Number(r.visitors),
  }));

  // ─── listings: просмотры /listing/<id>, сгруппированные по объекту и дню ───
  // Тот же REGEXP_SUBSTR-приём, что в getPopularListings (api/queries/analytics.ts).
  const listingIdExpr = sql<number>`cast(substring(regexp_substr(${pageViews.path}, '/listing/[0-9]+'), 10) as unsigned)`;
  const viewDayExpr = sql<number>`floor((unix_timestamp(${pageViews.createdAt}) + ${DUSHANBE_OFFSET_SECONDS}) / ${DAY_SECONDS})`;
  const viewRows = await db
    .select({
      listingId: listingIdExpr,
      day: viewDayExpr,
      views: sql<number>`count(*)`,
      visitors: sql<number>`count(distinct ${pageViews.visitorId})`,
    })
    .from(pageViews)
    .where(and(inRange(pageViews.createdAt), sql`${pageViews.path} regexp '/listing/[0-9]+'`))
    .groupBy(listingIdExpr, viewDayExpr);

  // ─── listing_events: клики по видам, та же группировка по объекту и дню ───
  const eventDayExpr = sql<number>`floor((unix_timestamp(${listingEvents.createdAt}) + ${DUSHANBE_OFFSET_SECONDS}) / ${DAY_SECONDS})`;
  const eventRows = await db
    .select({
      listingId: listingEvents.listingId,
      day: eventDayExpr,
      kind: listingEvents.kind,
      count: sql<number>`count(*)`,
    })
    .from(listingEvents)
    .where(inRange(listingEvents.createdAt))
    .groupBy(listingEvents.listingId, eventDayExpr, listingEvents.kind);

  const byKey = new Map<string, ListingBucket>();
  const keyOf = (listingId: number, day: number) => `${listingId}:${day}`;

  for (const r of viewRows) {
    const listingId = Number(r.listingId);
    const day = Number(r.day);
    const bucket = emptyListingBucket(listingId, dushanbeDayString(day));
    bucket.views = Number(r.views);
    bucket.visitors = Number(r.visitors);
    byKey.set(keyOf(listingId, day), bucket);
  }
  for (const r of eventRows) {
    const listingId = Number(r.listingId);
    const day = Number(r.day);
    const key = keyOf(listingId, day);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = emptyListingBucket(listingId, dushanbeDayString(day));
      byKey.set(key, bucket);
    }
    const kind = r.kind as ListingEventKind;
    if ((LISTING_EVENT_KINDS as readonly string[]).includes(kind)) {
      bucket[kind] = Number(r.count);
    }
  }

  const buckets = [...byKey.values()];
  const externalIds = await findListingExternalIds(buckets.map((b) => b.listingId));
  for (const b of buckets) {
    b.externalId = externalIds.get(b.listingId) ?? null;
  }

  return { hours, listings: buckets };
}

/** Тот же расчёт, что getCrmStats, но по памяти — на случай недоступной БД
 * (см. api/queries/connection.ts). Формулы бакетов те же (hourBucketSeconds,
 * dushanbeDaySeconds), только группировка идёт в JS, а не в SQL — таблицы
 * памяти малы (сбрасываются на рестарте), поэтому это не то самое «грузить
 * всю таблицу в JS», от которого предостерегает боевой путь. */
async function getCrmStatsFromMemory(since: Date, until: Date): Promise<CrmStats> {
  const inRange = (d: Date) => d >= since && d < until;

  const hourMap = new Map<number, { views: number; visitors: Set<string> }>();
  for (const v of memoryPageViews) {
    if (!inRange(v.createdAt) || v.path.startsWith("/admin")) continue;
    const hour = hourBucketSeconds(v.createdAt);
    const entry = hourMap.get(hour) ?? { views: 0, visitors: new Set<string>() };
    entry.views += 1;
    if (v.visitorId) entry.visitors.add(v.visitorId);
    hourMap.set(hour, entry);
  }
  const hours: HourBucket[] = [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, v]) => ({ hourStart: new Date(hour * 1000).toISOString(), views: v.views, visitors: v.visitors.size }));

  const listingMap = new Map<string, ListingBucket & { visitorSet: Set<string> }>();
  const getBucket = (listingId: number, day: number) => {
    const key = `${listingId}:${day}`;
    let bucket = listingMap.get(key);
    if (!bucket) {
      bucket = { ...emptyListingBucket(listingId, dushanbeDayString(day)), visitorSet: new Set<string>() };
      listingMap.set(key, bucket);
    }
    return bucket;
  };

  for (const v of memoryPageViews) {
    if (!inRange(v.createdAt)) continue;
    const match = v.path.match(/\/listing\/(\d+)/);
    if (!match) continue;
    const listingId = parseInt(match[1], 10);
    const day = dushanbeDaySeconds(v.createdAt);
    const bucket = getBucket(listingId, day);
    bucket.views += 1;
    if (v.visitorId) bucket.visitorSet.add(v.visitorId);
  }
  for (const e of memoryListingEvents) {
    if (!inRange(e.createdAt)) continue;
    const day = dushanbeDaySeconds(e.createdAt);
    const bucket = getBucket(e.listingId, day);
    const kind = e.kind as ListingEventKind;
    if ((LISTING_EVENT_KINDS as readonly string[]).includes(kind)) {
      bucket[kind] += 1;
    }
  }

  const buckets = [...listingMap.values()].map(({ visitorSet, ...rest }) => ({ ...rest, visitors: visitorSet.size }));
  // findListingExternalIds сама проверяет isDbAvailable() и читает из памяти —
  // тот же вызов, что в боевом пути, никакой отдельной копии логики.
  const externalIds = await findListingExternalIds(buckets.map((b) => b.listingId));
  for (const b of buckets) {
    b.externalId = externalIds.get(b.listingId) ?? null;
  }
  return { hours, listings: buckets };
}

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, isDbAvailable } from "./connection";
import { articles, type Article, type InsertArticle } from "@db/schema";
import { normalizeCompanyPublicValue } from '@contracts/company-contacts';

// ─── Dev fallback без DATABASE_URL (как memoryCms в queries/cms.ts) ───
// Exported for the isolated read-only QA preview; production never uses this store.
export const memoryArticles: Article[] = [];
let memoryNextId = 1;

function memoryClone(a: Article): Article {
  return { ...a, faq: a.faq ? [...a.faq] : a.faq };
}

// ─── Публичные выборки ───

export async function findPublishedArticles(opts: { limit: number; offset: number }) {
  if (!isDbAvailable()) {
    const list = memoryArticles
      .filter((a) => a.status === "published")
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
    return { items: list.slice(opts.offset, opts.offset + opts.limit).map((item) => normalizeCompanyPublicValue(memoryClone(item))), total: list.length };
  }
  const db = getDb()!;
  const where = eq(articles.status, "published");
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(articles)
      .where(where)
      .orderBy(desc(articles.publishedAt), desc(articles.id))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ total: sql<number>`count(*)` }).from(articles).where(where),
  ]);
  return { items: items.map((item) => normalizeCompanyPublicValue(item)), total: Number(total) };
}

export async function findPublishedArticleBySlug(slug: string) {
  if (!isDbAvailable()) {
    const a = memoryArticles.find((x) => x.slug === slug && x.status === "published");
    return a ? normalizeCompanyPublicValue(memoryClone(a)) : null;
  }
  const db = getDb()!;
  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")));
  return row ? normalizeCompanyPublicValue(row) : null;
}

export async function findPublishedArticleById(id: number) {
  const article = await findArticleById(id);
  return article?.status === 'published' ? normalizeCompanyPublicValue(article) : null;
}

// ─── Админ / генератор ───

/** Статьи пишет генератор по расписанию — список растёт сам собой, без участия
 *  человека. Предел выборки обязателен: свежие сверху, режется только хвост. */
const ADMIN_LIST_LIMIT = 500;

export async function findAllArticles() {
  if (!isDbAvailable()) {
    return [...memoryArticles]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, ADMIN_LIST_LIMIT)
      .map(memoryClone);
  }
  const db = getDb()!;
  return db.select().from(articles).orderBy(desc(articles.createdAt)).limit(ADMIN_LIST_LIMIT);
}

export async function findArticleById(id: number) {
  if (!isDbAvailable()) {
    const a = memoryArticles.find((x) => x.id === id);
    return a ? memoryClone(a) : null;
  }
  const db = getDb()!;
  const [row] = await db.select().from(articles).where(eq(articles.id, id));
  return row ?? null;
}

export async function slugExists(slug: string): Promise<boolean> {
  if (!isDbAvailable()) {
    return memoryArticles.some((x) => x.slug === slug);
  }
  const db = getDb()!;
  const [row] = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, slug));
  return Boolean(row);
}

export async function createArticle(data: InsertArticle): Promise<number> {
  if (!isDbAvailable()) {
    const now = new Date();
    const row: Article = {
      id: memoryNextId++,
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt ?? null,
      contentHtml: data.contentHtml,
      category: data.category ?? null,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      coverImageUrl: data.coverImageUrl ?? null,
      faq: data.faq ?? null,
      status: data.status ?? "draft",
      source: data.source ?? "manual",
      createdAt: now,
      updatedAt: now,
      publishedAt: data.publishedAt ?? null,
    };
    memoryArticles.push(row);
    return row.id;
  }
  const db = getDb()!;
  const [result] = await db.insert(articles).values(data);
  return result.insertId;
}

export async function updateArticle(
  id: number,
  data: Partial<
    Pick<
      InsertArticle,
      | "title"
      | "excerpt"
      | "contentHtml"
      | "metaTitle"
      | "metaDescription"
      | "coverImageUrl"
      | "faq"
      | "status"
      | "publishedAt"
    >
  >
) {
  if (!isDbAvailable()) {
    const a = memoryArticles.find((x) => x.id === id);
    if (a) Object.assign(a, data, { updatedAt: new Date() });
    return;
  }
  const db = getDb()!;
  await db.update(articles).set(data).where(eq(articles.id, id));
}

export async function deleteArticle(id: number) {
  if (!isDbAvailable()) {
    const i = memoryArticles.findIndex((x) => x.id === id);
    if (i !== -1) memoryArticles.splice(i, 1);
    return;
  }
  const db = getDb()!;
  await db.delete(articles).where(eq(articles.id, id));
}

/** Дата последней ИИ-статьи (по createdAt) — для еженедельного планировщика. */
export async function findLatestAiArticleDate(): Promise<Date | null> {
  if (!isDbAvailable()) {
    const list = memoryArticles.filter((x) => x.source === "ai");
    if (!list.length) return null;
    return list.reduce((max, a) => (a.createdAt > max ? a.createdAt : max), list[0].createdAt);
  }
  const db = getDb()!;
  const [row] = await db
    .select({ createdAt: articles.createdAt })
    .from(articles)
    .where(eq(articles.source, "ai"))
    .orderBy(desc(articles.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

/** Обложки последних N статей — чтобы генератор не ставил одну и ту же картинку подряд. */
export async function findRecentCoverImageUrls(limit: number): Promise<string[]> {
  if (!isDbAvailable()) {
    return [...memoryArticles]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((a) => a.coverImageUrl)
      .filter((u): u is string => Boolean(u));
  }
  const db = getDb()!;
  const rows = await db
    .select({ coverImageUrl: articles.coverImageUrl })
    .from(articles)
    .orderBy(desc(articles.createdAt))
    .limit(limit);
  return rows.map((r) => r.coverImageUrl).filter((u): u is string => Boolean(u));
}

/** Последние N заголовков статей — чтобы генератор не повторял темы. */
export async function findRecentArticleTitles(limit: number): Promise<string[]> {
  if (!isDbAvailable()) {
    return [...memoryArticles]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((a) => a.title);
  }
  const db = getDb()!;
  const rows = await db
    .select({ title: articles.title })
    .from(articles)
    .orderBy(desc(articles.createdAt))
    .limit(limit);
  return rows.map((r) => r.title);
}

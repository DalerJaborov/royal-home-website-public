import { getDb, isDbAvailable } from "./connection";
import { listings } from "@db/schema";
import { eq, desc, asc, and, inArray } from "drizzle-orm";
import { getCmsEntry } from "./cms";
import { normalizeImageUrls } from "../lib/uploads-url";
import { withListingSeoDefaults, buildListingSeoMeta, buildListingSeoMetaTj, withListingSeoDefaultsTj, refreshGeneratedListingSeo, generatedListingSeoPatch } from "../lib/seo";
import { matchesSearch } from "../lib/searchTokens";
import { pickCrmListingFacts, type CrmListingFacts } from '@contracts/crm-listing-facts';
import { metaContentId } from '@contracts/meta-content-id';
import {
  memoryFindAllListings,
  memoryFindListingById,
  memoryCreateListing,
  memoryUpdateListing,
  memoryDeleteListing,
} from "./memory-store";

type Category = "APARTMENT" | "HOUSE" | "COMMERCIAL" | "LAND";
const ALL_CATEGORIES: Category[] = ["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"];

/** Categories visible on the public site — ALL visible by default, admin can
 * hide any via the `categoryVisibility` CMS entry (see api/cms-router.ts).
 * Раньше HOUSE/COMMERCIAL/LAND были скрыты по умолчанию (opt-in) — из-за этого
 * опубликованный из CRM дом «пропадал»: строка в БД есть, каталог её фильтрует.
 * Теперь opt-out: публикация из CRM работает из коробки. */
async function visibleCategories(): Promise<Category[]> {
  const raw = (await getCmsEntry("categoryVisibility")) as Partial<Record<Category, boolean>> | undefined;
  if (!raw) return ALL_CATEGORIES;
  return ALL_CATEGORIES.filter((c) => raw[c] !== false);
}

export async function findAllListings(opts?: {
  type?: string;
  district?: string;
  rooms?: number;
  sold?: boolean;
  /** Свободный текстовый поиск по заголовку/адресу/описанию — устойчивый к
   * раскладке, транслиту и опечаткам в отдельных словах (см. lib/searchTokens.ts). */
  q?: string;
  /** Admin views only — bypasses the published filter. */
  includeUnpublished?: boolean;
  /** Admin views only — bypasses the category-visibility filter. */
  includeAllCategories?: boolean;
}) {
  const cats = opts?.includeAllCategories ? ALL_CATEGORIES : await visibleCategories();
  // All categories may be deliberately disabled. Falling back to APARTMENT
  // would publish precisely the category the admin asked to hide.
  if (cats.length === 0) return [];
  if (!isDbAvailable()) {
    return memoryFindAllListings(opts).filter((row) => cats.includes(row.category ?? "APARTMENT")).map(row => refreshGeneratedListingSeo(row));
  }

  const db = getDb()!;
  const conditions = [];

  if (opts?.type) {
    conditions.push(eq(listings.type, opts.type as "Новостройки" | "Вторичка"));
  }
  // No implicit sold=false: sold listings stay in the public catalog wearing
  // a «Продано» badge (CRM sync decision, see ops/CRM_SYNC_PLAN.md) — they
  // just sort after active ones (see orderBy below).
  if (opts?.sold !== undefined) {
    conditions.push(eq(listings.sold, opts.sold));
  }
  if (!opts?.includeUnpublished) {
    conditions.push(eq(listings.published, true));
  }
  if (!opts?.includeAllCategories) {
    conditions.push(inArray(listings.category, cats));
  }

  const query = db
    .select({
      id: listings.id,
      title: listings.title,
      location: listings.location,
      price: listings.price,
      rooms: listings.rooms,
      area: listings.area,
      floor: listings.floor,
      totalFloors: listings.totalFloors,
      type: listings.type,
      stage: listings.stage,
      repair: listings.repair,
      urgent: listings.urgent,
      sold: listings.sold,
      published: listings.published,
      category: listings.category,
      externalId: listings.externalId,
      crmShortId: listings.crmShortId,
      images: listings.images,
      imageUrls: listings.imageUrls,
      description: listings.description,
      seoDesc: listings.seoDesc,
      details: listings.details,
      mapAddress: listings.mapAddress,
      lat: listings.lat,
      lng: listings.lng,
      instagramUrl: listings.instagramUrl,
      videoUrl: listings.videoUrl,
      metaTitle: listings.metaTitle,
      metaDescription: listings.metaDescription,
      h1: listings.h1,
      descriptionTj: listings.descriptionTj,
      metaTitleTj: listings.metaTitleTj,
      metaDescriptionTj: listings.metaDescriptionTj,
      h1Tj: listings.h1Tj,
      date: listings.date,
      createdAt: listings.createdAt,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .where(and(...conditions))
    // Active listings first, sold ones trail at the end of the catalog.
    .orderBy(asc(listings.sold), desc(listings.createdAt));

  const result = await query;

  let filtered = result;
  if (opts?.district) {
    filtered = result.filter(r =>
      r.location.toLowerCase().includes(opts.district!.toLowerCase())
    );
  }
  if (opts?.rooms) {
    filtered = filtered.filter(r => r.rooms === opts.rooms);
  }
  if (opts?.q) {
    filtered = filtered.filter(r =>
      matchesSearch(
        `${r.title} ${r.location} ${r.description ?? ""}`.toLowerCase(),
        opts.q!
      )
    );
  }

  // Read-time normalization heals rows that were synced while CRM_PUBLIC_URL
  // still pointed at the bare IP — see api/lib/uploads-url.ts.
  return filtered.map((r) => refreshGeneratedListingSeo({ ...r, imageUrls: normalizeImageUrls(r.imageUrls) }));
}

export async function findListingById(id: number) {
  if (!isDbAvailable()) {
    const row = memoryFindListingById(id);
    return row ? refreshGeneratedListingSeo(row) : null;
  }

  const db = getDb()!;
  const [row] = await db
    .select({
      id: listings.id,
      title: listings.title,
      location: listings.location,
      price: listings.price,
      rooms: listings.rooms,
      area: listings.area,
      floor: listings.floor,
      totalFloors: listings.totalFloors,
      type: listings.type,
      stage: listings.stage,
      repair: listings.repair,
      urgent: listings.urgent,
      sold: listings.sold,
      published: listings.published,
      category: listings.category,
      externalId: listings.externalId,
      crmShortId: listings.crmShortId,
      images: listings.images,
      imageUrls: listings.imageUrls,
      description: listings.description,
      seoDesc: listings.seoDesc,
      details: listings.details,
      mapAddress: listings.mapAddress,
      lat: listings.lat,
      lng: listings.lng,
      instagramUrl: listings.instagramUrl,
      videoUrl: listings.videoUrl,
      metaTitle: listings.metaTitle,
      metaDescription: listings.metaDescription,
      h1: listings.h1,
      descriptionTj: listings.descriptionTj,
      metaTitleTj: listings.metaTitleTj,
      metaDescriptionTj: listings.metaDescriptionTj,
      h1Tj: listings.h1Tj,
      date: listings.date,
      createdAt: listings.createdAt,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .where(eq(listings.id, id));
  return row ? refreshGeneratedListingSeo({ ...row, imageUrls: normalizeImageUrls(row.imageUrls) }) : null;
}

/** Which of the given ids already exist as listings — a single batched query
 * instead of one findListingById per row, for callers that only need an
 * existence check across many rows (see importFromSheet/previewImport in
 * listing-router.ts, which used to await findListingById in a for loop). */
export async function findExistingListingIds(ids: number[]): Promise<Set<number>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();

  if (!isDbAvailable()) {
    return new Set(unique.filter((id) => memoryFindListingById(id) != null));
  }

  const db = getDb()!;
  const rows = await db.select({ id: listings.id }).from(listings).where(inArray(listings.id, unique));
  return new Set(rows.map((r) => r.id));
}

/** Bounded article-link availability read; sold published rows remain accessible. */
export async function findPublishedListingIds(ids: readonly number[]): Promise<Set<number>> {
  const unique = [...new Set(ids)];
  if (unique.length > 100 || unique.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid article listing references');
  if (!unique.length) return new Set();
  if (!isDbAvailable()) return new Set(unique.filter(id => memoryFindListingById(id)?.published === true));
  const rows = await getDb()!.select({ id: listings.id }).from(listings).where(and(inArray(listings.id, unique), eq(listings.published, true)));
  return new Set(rows.map(row => row.id));
}

/** id → externalId для существующих строк из списка — один батч-запрос вместо
 * findListingById на каждую строку. Нужен importFromSheet: обратный синк в CRM
 * различает объекты CRM-происхождения (externalId есть → diff-уведомление) и
 * сайт-происхождения (нет → upsert), и без externalId ветку не выбрать. */
export async function findListingExternalIds(ids: number[]): Promise<Map<number, string | null>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  if (!isDbAvailable()) {
    return new Map(
      unique.flatMap((id) => {
        const row = memoryFindListingById(id);
        return row ? [[id, row.externalId ?? null] as const] : [];
      })
    );
  }

  const db = getDb()!;
  const rows = await db
    .select({ id: listings.id, externalId: listings.externalId })
    .from(listings)
    .where(inArray(listings.id, unique));
  return new Map(rows.map((r) => [r.id, r.externalId ?? null]));
}

/** id → Meta catalog id (contracts/meta-content-id.ts) for PUBLISHED rows that have a CRM
 * card number. Unknown / unpublished / number-less ids are simply absent from the map. */
export async function findPublishedMetaContentIds(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (unique.length === 0 || unique.length > 50) return new Map();
  const toMap = (rows: { id: number; crmShortId: number | null; published: boolean }[]) =>
    new Map(rows.flatMap((row) => {
      const contentId = row.published ? metaContentId(row) : undefined;
      return contentId ? [[row.id, contentId] as const] : [];
    }));
  if (!isDbAvailable()) {
    return toMap(unique.flatMap((id) => {
      const row = memoryFindListingById(id);
      return row ? [{ id, crmShortId: row.crmShortId ?? null, published: row.published !== false }] : [];
    }));
  }
  const rows = await getDb()!
    .select({ id: listings.id, crmShortId: listings.crmShortId, published: listings.published })
    .from(listings)
    .where(and(inArray(listings.id, unique), eq(listings.published, true)));
  return toMap(rows);
}

export async function createListing(data: {
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  floor?: string;
  totalFloors?: number;
  type?: "Новостройки" | "Вторичка" | null;
  stage?: string | null;
  repair?: string | null;
  urgent?: boolean;
  images?: number;
  imageUrls?: string[];
  description?: string;
  seoDesc?: string;
  details?: Record<string, string>;
  mapAddress?: string;
  instagramUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
  date?: string;
  /** По умолчанию объявление публикуется сразу. Для объектов из админки сайта
   *  ставим false — они ждут модерации в CRM и до одобрения не видны публично. */
  published?: boolean;
}) {
  // Страховка: любое новое объявление получает заполненные SEO-поля, даже если
  // админ не трогал SEO-карточку — пустые добираются детерминированно.
  const seo = withListingSeoDefaults(
    { metaTitle: data.metaTitle, metaDescription: data.metaDescription, h1: data.h1, seoDesc: data.seoDesc },
    {
      title: data.title,
      location: data.location,
      price: data.price,
      rooms: data.rooms,
      area: data.area,
      type: data.type ?? undefined,
      district: data.details?.district,
      floor: data.floor,
    }
  );

  // Та же страховка на таджикском — каждое новое объявление сразу получает
  // двуязычный (RU+TJ) SEO-контент, без участия админа.
  const seoTj = withListingSeoDefaultsTj(
    { metaTitleTj: "", metaDescriptionTj: "", h1Tj: "", descriptionTj: "" },
    {
      title: data.title,
      location: data.location,
      price: data.price,
      rooms: data.rooms,
      area: data.area,
      type: data.type ?? undefined,
      district: data.details?.district,
      floor: data.floor,
    }
  );

  if (!isDbAvailable()) return memoryCreateListing({ ...data, ...seo, ...seoTj });

  const db = getDb()!;
  const [result] = await db.insert(listings).values({
    title: data.title,
    location: data.location,
    price: data.price,
    rooms: data.rooms,
    area: data.area,
    floor: data.floor,
    totalFloors: data.totalFloors,
    type: data.type ?? null,
    stage: data.stage ?? null,
    repair: data.repair ?? null,
    urgent: data.urgent ?? false,
    images: data.images ?? 5,
    imageUrls: data.imageUrls,
    description: data.description,
    seoDesc: seo.seoDesc,
    details: data.details,
    mapAddress: data.mapAddress,
    instagramUrl: data.instagramUrl,
    metaTitle: seo.metaTitle,
    metaDescription: seo.metaDescription,
    h1: seo.h1,
    descriptionTj: seoTj.descriptionTj,
    metaTitleTj: seoTj.metaTitleTj,
    metaDescriptionTj: seoTj.metaDescriptionTj,
    h1Tj: seoTj.h1Tj,
    date: data.date ?? new Date().toLocaleDateString("ru-RU"),
    published: data.published ?? true,
  });
  return result.insertId;
}

export async function updateListing(
  id: number,
  data: Partial<{
    title: string;
    location: string;
    price: number;
    rooms: number;
    area: number;
    floor: string;
    totalFloors: number;
    type: "Новостройки" | "Вторичка" | null;
    stage: string | null;
    repair: string | null;
    urgent: boolean;
    sold: boolean;
    images: number;
    imageUrls: string[];
    description: string;
    seoDesc: string;
    details: Record<string, string>;
    mapAddress: string;
    instagramUrl: string;
    metaTitle: string;
    metaDescription: string;
    h1: string;
  }>
) {
  if (!isDbAvailable()) {
    const previous = memoryFindListingById(id);
    return memoryUpdateListing(id, previous ? { ...data, ...generatedListingSeoPatch({ ...previous, ...data }, previous) } : data);
  }

  const db = getDb()!;
  await db.transaction(async tx => {
    const [previous] = await tx.select().from(listings).where(eq(listings.id, id)).for('update');
    if (!previous) return;
    await tx.update(listings).set({ ...data, ...generatedListingSeoPatch({ ...previous, ...data }, previous) }).where(eq(listings.id, id));
  });
}

export async function deleteListing(id: number) {
  if (!isDbAvailable()) {
    return memoryDeleteListing(id);
  }

  const db = getDb()!;
  await db.delete(listings).where(eq(listings.id, id));
}

// ─── CRM sync (see ops/CRM_SYNC_PLAN.md + api/crm-sync-router.ts) ───

export async function findListingByExternalId(externalId: string) {
  if (!isDbAvailable()) return null;
  const db = getDb()!;
  const [row] = await db.select().from(listings).where(eq(listings.externalId, externalId));
  return row ?? null;
}

/** Creates or updates a listing by its CRM externalId. Used by the
 * publish/sold actions of the CRM sync endpoint — never called for
 * plain unpublish (that only needs to flip a flag on an existing row). */
export async function upsertListingByExternalId(
  externalId: string,
  data: CrmListingFacts & {
    title: string;
    location: string;
    price: number;
    rooms: number;
    area: number;
    category: Category;
    description?: string;
    sold?: boolean;
    imageUrls?: string[];
    lat?: number;
    lng?: number;
    instagramUrl?: string;
    /** Ролик объекта с хоста CRM; null = у объекта нет публичного ролика (очистить). */
    videoUrl?: string | null;
    /** Номер карточки CRM (Property.shortId); undefined = не менять. */
    crmShortId?: number;
  }
) {
  if (!isDbAvailable()) return null;
  const db = getDb()!;
  // location приходит из CRM как "Район, Город" (см. siteSync.ts toSitePayload) —
  // достаём район для title/h1. category — раньше нигде не учитывалась, из-за
  // чего дом/участок/коммерция в SEO-текстах назывались «квартирой».
  const seo = buildListingSeoMeta({
    title: data.title,
    location: data.location,
    price: data.price,
    rooms: data.rooms,
    area: data.area,
    category: data.category,
    type: data.type ?? undefined,
    district: data.location.split(",")[0]?.trim(),
  });
  // Read-modify-write в одной транзакции с блокировкой строки (FOR UPDATE) —
  // два одновременных синка одного externalId иначе гоняются между SELECT и
  // INSERT/UPDATE (падение на unique-индексе или потерянное обновление).
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(listings)
      .where(eq(listings.externalId, externalId))
      .for("update");
    if (existing) {
      const refreshed = refreshGeneratedListingSeo({ ...existing, ...data }, existing);
      // Keep editorial text; refresh exact auto templates from the previous facts.
      await tx
        .update(listings)
        .set({
          ...data,
          ...generatedListingSeoPatch({ ...existing, ...data }, existing),
          sold: data.sold ?? existing.sold,
          externalId,
          published: true,
          metaTitle: refreshed.metaTitle?.trim() || seo.metaTitle,
          metaDescription: refreshed.metaDescription?.trim() || seo.metaDescription,
          h1: refreshed.h1?.trim() || seo.h1,
          seoDesc: refreshed.seoDesc?.trim() || seo.metaDescription,
        })
        .where(eq(listings.externalId, externalId));
      return existing.id;
    }
    const [result] = await tx.insert(listings).values({
      floor: null, totalFloors: null, stage: null, repair: null, type: null,
      ...data,
      sold: data.sold ?? false,
      externalId,
      published: true,
      images: data.imageUrls?.length ?? 0,
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      h1: seo.h1,
      seoDesc: seo.metaDescription,
      ...buildListingSeoMetaTj({ ...data, type: data.type ?? undefined,
        district: data.location.split(',')[0]?.trim(), floor: data.floor ?? undefined }),
      date: new Date().toLocaleDateString("ru-RU"),
    });
    return result.insertId;
  });
}

/** Stores the CRM card number on an existing row (by native id or CRM externalId). */
export async function setListingCrmShortId(identity: { id: number } | { externalId: string }, crmShortId: number) {
  if (!isDbAvailable()) return;
  const db = getDb()!;
  const where = "id" in identity ? eq(listings.id, identity.id) : eq(listings.externalId, identity.externalId);
  await db.update(listings).set({ crmShortId }).where(where);
}

/** Stores (or clears, with null) the CRM-hosted video of an existing row. */
export async function setListingVideoUrl(identity: { id: number } | { externalId: string }, videoUrl: string | null) {
  if (!isDbAvailable()) return;
  const db = getDb()!;
  const where = "id" in identity ? eq(listings.id, identity.id) : eq(listings.externalId, identity.externalId);
  await db.update(listings).set({ videoUrl }).where(where);
}

/** Updates supplied facts and their exact generated templates, preserving publication, photos and editorial copy. */
export async function updateListingFactsFromCrm(identity: { id: number } | { externalId: string }, data: CrmListingFacts) {
  if (!isDbAvailable()) return null;
  const db = getDb()!;
  const where = 'id' in identity ? eq(listings.id, identity.id) : eq(listings.externalId, identity.externalId);
  const facts = pickCrmListingFacts(data);
  return db.transaction(async tx => {
    const [row] = await tx.select().from(listings).where(where).for('update');
    if (!row) return null;
    if (Object.keys(facts).length) await tx.update(listings)
      .set({ ...facts, ...generatedListingSeoPatch({ ...row, ...facts }, row) }).where(where);
    return row.id;
  });
}

export async function setListingPublishedByExternalId(externalId: string, published: boolean) {
  if (!isDbAvailable()) return;
  const db = getDb()!;
  await db.update(listings).set({ published }).where(eq(listings.externalId, externalId));
}

export async function setListingSoldByExternalId(externalId: string, sold: boolean) {
  if (!isDbAvailable()) return;
  const db = getDb()!;
  await db.update(listings).set({ sold }).where(eq(listings.externalId, externalId));
}

/** By native listing id — used when the CRM acts on a SITE-CREATED object (it has no
 *  externalId row here; the CRM links to it via siteListingId). Fixes «снять с
 *  публикации» / «продано», не срабатывавшие для объектов, заведённых на сайте. */
export async function setListingPublishedById(id: number, published: boolean) {
  if (!isDbAvailable()) return;
  const db = getDb()!;
  await db.update(listings).set({ published }).where(eq(listings.id, id));
}

export async function setListingSoldById(id: number, sold: boolean) {
  if (!isDbAvailable()) return;
  const db = getDb()!;
  await db.update(listings).set({ sold }).where(eq(listings.id, id));
}

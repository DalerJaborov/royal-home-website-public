import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import {
  findAllListings,
  findListingById,
  findExistingListingIds,
  findListingExternalIds,
  createListing,
  updateListing,
  deleteListing,
} from "./queries/listings";
import { exportListingsToSheet, importListingsFromSheet } from "./lib/google-sheets";
import { notifyCrmOfListingChange, notifyCrmOfListingUpsert } from "./lib/notifyCrm";
import { projectPublicListing } from '@contracts/public-listing';

/** Собирает полезную нагрузку обратного синка сайт→CRM из полей листинга.
 * Приводит null→undefined: у CRM-схемы поля optional (undefined), а не nullable. */
function toCrmUpsertPayload(siteListingId: number, l: {
  title?: string | null; location?: string | null; price?: number | null; rooms?: number | null; area?: number | null;
  floor?: string | null; totalFloors?: number | null; type?: string | null; repair?: string | null;
  description?: string | null; mapAddress?: string | null; category?: string | null;
  lat?: number | null; lng?: number | null; imageUrls?: string[] | null;
}) {
  const u = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);
  return {
    siteListingId,
    action: "upserted" as const,
    title: u(l.title), location: u(l.location), price: u(l.price), rooms: u(l.rooms), area: u(l.area),
    floor: u(l.floor), totalFloors: u(l.totalFloors), type: u(l.type), repair: u(l.repair),
    description: u(l.description), mapAddress: u(l.mapAddress), category: u(l.category),
    lat: u(l.lat), lng: u(l.lng), imageUrls: u(l.imageUrls),
  };
}

export const listingRouter = createRouter({
  // Public endpoints
  list: publicQuery
    .input(
      z.object({
        type: z.string().optional(),
        district: z.string().optional(),
        rooms: z.number().optional(),
        sold: z.boolean().optional(),
        // Свободный текстовый поиск по заголовку/адресу/описанию — см. api/lib/searchTokens.ts.
        q: z.string().optional(),
        // Admin dashboard/listings pages pass these to see everything,
        // including CRM-synced items not yet published or in a category
        // the public catalog doesn't show yet. Only honored for admins —
        // see the role check below — so an anonymous caller can't request
        // unpublished/hidden listings by just sending the flag.
        includeUnpublished: z.boolean().optional(),
        includeAllCategories: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user?.role === "admin";
      const listings = await findAllListings({
        ...(input ?? { sold: false }),
        includeUnpublished: isAdmin ? input?.includeUnpublished : false,
        includeAllCategories: isAdmin ? input?.includeAllCategories : false,
      });
      return isAdmin ? listings : listings.map(projectPublicListing);
    }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user?.role === "admin";
      const listing = await findListingById(input.id);
      // Unpublished listings must be unreachable publicly even by direct URL
      // (bookmarks, search-engine index) — only the admin may preview them.
      if (!listing || (listing.published === false && !isAdmin)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Объявление не найдено" });
      }
      return isAdmin ? listing : projectPublicListing(listing);
    }),

  // Admin endpoints
  create: adminQuery
    .input(
      z.object({
        title: z.string().min(3, "Минимум 3 символа"),
        location: z.string().min(3),
        price: z.number().positive(),
        rooms: z.number().int().positive(),
        area: z.number().positive(),
        floor: z.string().optional(),
        totalFloors: z.number().optional(),
        type: z.enum(["Новостройки", "Вторичка"]).nullable().optional(),
        stage: z.string().nullable().optional(),
        repair: z.string().nullable().optional(),
        urgent: z.boolean().optional(),
        images: z.number().optional(),
        imageUrls: z.array(z.string()).optional(),
        description: z.string().optional(),
        seoDesc: z.string().optional(),
        details: z.record(z.string(), z.string()).optional(),
        mapAddress: z.string().optional(),
        instagramUrl: z.string().url().optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        h1: z.string().optional(),
        date: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Объект из админки сайта заводится СКРЫТЫМ (published: false) — он ждёт
      // модерации в CRM («Изменения на сайте») и публикуется только после одобрения.
      const id = await createListing({ ...input, published: false });
      // Обратный синк: объект родился в админке сайта (externalId у него нет) —
      // заводим такой же в CRM на модерацию, чтобы директор решил, публиковать ли.
      notifyCrmOfListingUpsert({ ...toCrmUpsertPayload(Number(id), input), editedBy: ctx.user?.name || ctx.user?.email || undefined });
      return { id, success: true };
    }),

  update: adminQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(3).optional(),
        location: z.string().min(3).optional(),
        price: z.number().positive().optional(),
        rooms: z.number().int().positive().optional(),
        area: z.number().positive().optional(),
        floor: z.string().optional(),
        totalFloors: z.number().optional(),
        type: z.enum(["Новостройки", "Вторичка"]).nullable().optional(),
        stage: z.string().nullable().optional(),
        repair: z.string().nullable().optional(),
        urgent: z.boolean().optional(),
        sold: z.boolean().optional(),
        images: z.number().optional(),
        imageUrls: z.array(z.string()).optional(),
        description: z.string().optional(),
        seoDesc: z.string().optional(),
        details: z.record(z.string(), z.string()).optional(),
        mapAddress: z.string().optional(),
        instagramUrl: z.string().url().optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        h1: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      // Grab the externalId before writing — it's immutable via this
      // endpoint, so before/after makes no difference, but this avoids a
      // second row fetch after the write on the common (non-CRM) listing.
      const existing = await findListingById(id);
      await updateListing(id, data);
      if (existing?.externalId && Object.keys(data).length > 0) {
        // Объект пришёл из CRM — уведомляем об изменении (страница «Изменения на сайте»).
        notifyCrmOfListingChange({
          externalId: existing.externalId,
          action: "updated",
          changes: data,
          editedBy: ctx.user?.name || ctx.user?.email || undefined,
        });
      } else if (existing && !existing.externalId) {
        // Объект сайт-происхождения — досылаем в CRM его ПОЛНОЕ текущее состояние
        // (upsert по siteListingId), а не частичный diff.
        const full = await findListingById(id);
        if (full) {
          notifyCrmOfListingUpsert({ ...toCrmUpsertPayload(id, full), editedBy: ctx.user?.name || ctx.user?.email || undefined });
        }
      }
      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await findListingById(input.id);
      await deleteListing(input.id);
      if (existing?.externalId) {
        notifyCrmOfListingChange({
          externalId: existing.externalId,
          action: "deleted",
          editedBy: ctx.user?.name || ctx.user?.email || undefined,
        });
      } else if (existing) {
        // Сайт-объект удалён — убираем его синкнутую копию в CRM.
        notifyCrmOfListingUpsert({ siteListingId: input.id, action: "deleted" });
      }
      return { success: true };
    }),

  // Google Sheets bulk import/export — see api/lib/google-sheets.ts
  exportToSheet: adminQuery.mutation(async () => {
    // Admin export covers the FULL catalog — including unpublished and
    // hidden-category (CRM-synced) rows the public filters would drop.
    const [active, sold] = await Promise.all([
      findAllListings({ sold: false, includeUnpublished: true, includeAllCategories: true }),
      findAllListings({ sold: true, includeUnpublished: true, includeAllCategories: true }),
    ]);
    return exportListingsToSheet([...active, ...sold]);
  }),

  // Сухой прогон импорта: читает таблицу и считает, что произойдёт (сколько
  // создастся/обновится), НИЧЕГО не записывая. Фронтенд показывает это в окне
  // подтверждения перед реальным импортом — чтобы человек видел последствия.
  previewImport: adminQuery.mutation(async () => {
    const rows = await importListingsFromSheet();
    // Один запрос на всю партию вместо findListingById на каждую строку —
    // при импорте таблицы из полусотни объектов это было полсотни запросов подряд.
    const existingIds = await findExistingListingIds(
      rows.flatMap((row) => (row.id ? [row.id] : []))
    );
    let toCreate = 0;
    let toUpdate = 0;
    const createTitles: string[] = [];
    const updateTitles: string[] = [];
    for (const row of rows) {
      if (row.id && existingIds.has(row.id)) {
        toUpdate++;
        if (updateTitles.length < 6) updateTitles.push(`#${row.id} ${row.title}`);
        continue;
      }
      toCreate++;
      if (createTitles.length < 6) createTitles.push(row.title);
    }
    return { total: rows.length, toCreate, toUpdate, createTitles, updateTitles };
  }),

  importFromSheet: adminQuery.mutation(async ({ ctx }) => {
    const rows = await importListingsFromSheet();
    // id → externalId одним батчем: он и говорит «строка существует», и решает,
    // какой обратный синк слать в CRM (см. ниже) — вместо findListingById в цикле.
    const existingExternalIds = await findListingExternalIds(
      rows.flatMap((row) => (row.id ? [row.id] : []))
    );
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const editedBy = ctx.user?.name || ctx.user?.email || undefined;

    for (const row of rows) {
      try {
        if (row.id && existingExternalIds.has(row.id)) {
          const changes = {
            title: row.title,
            location: row.location,
            price: row.price,
            rooms: row.rooms,
            area: row.area,
            floor: row.floor,
            totalFloors: row.totalFloors,
            type: row.type as "Новостройки" | "Вторичка" | undefined,
            stage: row.stage,
            repair: row.repair,
            urgent: row.urgent,
            sold: row.sold,
            imageUrls: row.imageUrls,
            description: row.description,
            mapAddress: row.mapAddress,
          };
          await updateListing(row.id, changes);
          // Тот же обратный синк, что и в listing.update выше: импорт из таблицы —
          // такая же правка админа, и раньше он единственный обходил CRM молча.
          const externalId = existingExternalIds.get(row.id);
          if (externalId) {
            // Объект пришёл из CRM — уведомляем об изменении (страница «Изменения на сайте»).
            notifyCrmOfListingChange({ externalId, action: "updated", changes, editedBy });
          } else {
            // Объект сайт-происхождения — досылаем ПОЛНОЕ текущее состояние (upsert).
            const full = await findListingById(row.id);
            if (full) {
              notifyCrmOfListingUpsert({ ...toCrmUpsertPayload(row.id, full), editedBy });
            }
          }
          updated++;
          continue;
        }
        const rowData = {
          title: row.title,
          location: row.location,
          price: row.price,
          rooms: row.rooms,
          area: row.area,
          floor: row.floor,
          totalFloors: row.totalFloors,
          type: row.type as "Новостройки" | "Вторичка" | undefined,
          stage: row.stage,
          repair: row.repair,
          urgent: row.urgent,
          imageUrls: row.imageUrls,
          description: row.description,
          mapAddress: row.mapAddress,
        };
        // Как в listing.create выше: новый объект заводится СКРЫТЫМ и ждёт
        // модерации в CRM — раньше импорт публиковал его сразу, в обход
        // модерации, и CRM о нём вообще не узнавала.
        const id = await createListing({ ...rowData, published: false });
        notifyCrmOfListingUpsert({ ...toCrmUpsertPayload(Number(id), rowData), editedBy });
        created++;
      } catch (e) {
        errors.push(`"${row.title || "без названия"}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { created, updated, errors, total: rows.length };
  }),
});

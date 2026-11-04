import { describe, expect, it, vi } from "vitest";
import type { User } from "@db/schema";
import { listingRouter } from "./listing-router";
import type { TrpcContext } from "./context";
import { findAllListings, createListing } from './queries/listings';
import { memoryUpdateListing, memoryDeleteListing } from './queries/memory-store';
import { headForPath } from './lib/prerenderSeo';
import { localizedPath } from '@contracts/public-i18n';
import { PUBLIC_DETAIL_KEYS } from '@contracts/public-listing';

/** Без DATABASE_URL запросы обслуживает встроенный набор объектов
 *  (api/queries/memory-store.ts) — БД для этих проверок не нужна. */
function caller(user?: Partial<User>) {
  const ctx: TrpcContext = {
    req: new Request("http://localhost/"),
    resHeaders: new Headers(),
    user: user as User | undefined,
  };
  return listingRouter.createCaller(ctx);
}

const admin = { id: 1, email: "admin@royalhome.tj", role: "admin" as const };
const visitor = { id: 2, email: "user@example.com", role: "user" as const };

it('public API and every locale hide a missing video while admin and stored URL stay intact', async () => {
  const id = await createListing({ title: 'LOCAL MISSING VIDEO FIXTURE', location: 'Сино', rooms: 1, area: 40, price: 1,
    published: true, imageUrls: ['/uploads/missing-fixture.webp'] });
  const videoUrl = 'https://crm.royalhome.tj/api/v1/public/property-video/990126.mp4?v=missing';
  memoryUpdateListing(id, { videoUrl });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  try {
    expect((await caller().getById({ id })).videoUrl).toBeNull();
    expect((await caller().list({})).find(row => row.id === id)?.videoUrl).toBeNull();
    expect((await caller(admin).getById({ id })).videoUrl).toBe(videoUrl);
    for (const locale of ['ru', 'tg', 'en'] as const) {
      const head = await headForPath(localizedPath(`/listing/${id}`, locale));
      expect(head.status ?? 200).toBe(200);
      expect(JSON.stringify(head.jsonLd)).not.toContain('VideoObject');
      expect(head.publicListing?.videoUrl).toBeNull();
      const watch = await headForPath(localizedPath(`/listing/${id}/video`, locale));
      expect(watch.status).toBe(404);
      expect(watch.noindex).toBe(true);
      expect(watch.body).toContain('/uploads/missing-fixture.webp');
      expect(watch.body).not.toContain('<video');
    }
    expect((await caller(admin).getById({ id })).videoUrl).toBe(videoUrl);
  } finally { memoryDeleteListing(id); vi.unstubAllGlobals(); }
});

describe("точное расположение объекта в публичном ответе", () => {
  it('публичный DTO сохраняет даты и характеристики, но не CRM ID и приватные поля; админский ответ не меняется', async () => {
    const rows = await caller().list({});
    for (const row of rows) {
      expect(row.externalId).toBeNull();
      expect(row).not.toHaveProperty('agentId');
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
      for (const key of Object.keys(row.details ?? {})) expect(PUBLIC_DETAIL_KEYS).toContain(key);
    }
    expect(await caller(admin).list({})).toEqual(await findAllListings({ includeUnpublished: undefined, includeAllCategories: undefined }));
  });
  it("гостю не отдаётся ни адрес карты, ни координаты", async () => {
    const listings = await caller().list();
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) {
      expect(l.mapAddress).toBeNull();
      expect(l.lat).toBeNull();
      expect(l.lng).toBeNull();
    }
  });

  it("залогиненному не-админу тоже не отдаётся", async () => {
    const [listing] = await caller(visitor).list();
    expect(listing.mapAddress).toBeNull();
  });

  it("в карточке объекта по id — так же", async () => {
    const [first] = await caller().list();
    const listing = await caller().getById({ id: first.id });
    expect(listing.mapAddress).toBeNull();
    expect(listing.lat).toBeNull();
    expect(listing.lng).toBeNull();
  });

  it("админу расположение приходит — форма редактирования на нём держится", async () => {
    const [first] = await caller(admin).list();
    expect(first.mapAddress).toBeTruthy();
    const listing = await caller(admin).getById({ id: first.id });
    expect(listing.mapAddress).toBeTruthy();
  });
});

describe("текстовый поиск по каталогу (параметр q)", () => {
  it("находит по слову из адреса", async () => {
    const all = await caller().list();
    const results = await caller().list({ q: "Рудаки" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(all.length);
    for (const r of results) {
      expect(`${r.title} ${r.location}`.toLowerCase()).toContain("рудаки");
    }
  });

  it("требует совпадения ВСЕХ слов запроса, не любого", async () => {
    // «Рудаки» встречается в нескольких объектах, «115» — только в одном.
    const results = await caller().list({ q: "Рудаки 115" });
    for (const r of results) {
      const text = `${r.title} ${r.location}`.toLowerCase();
      expect(text).toContain("рудаки");
      expect(text).toContain("115");
    }
  });

  it("устойчив к забытой раскладке клавиатуры (латиница вместо кириллицы)", async () => {
    // "Рудаки" вслепую на латинской раскладке — "Herfrb"/"Rudaki" читается по-разному,
    // но простое слово "cbyj" на латинице соответствует кириллическому "сино".
    const cyrillic = await caller().list({ q: "сино" });
    const layoutTyped = await caller().list({ q: "cbyj" });
    expect(cyrillic.length).toBeGreaterThan(0);
    expect(layoutTyped.map((r) => r.id).sort()).toEqual(cyrillic.map((r) => r.id).sort());
  });

  it("устойчив к транслитерации латиницей", async () => {
    const cyrillic = await caller().list({ q: "рудаки" });
    const translit = await caller().list({ q: "rudaki" });
    expect(cyrillic.length).toBeGreaterThan(0);
    expect(translit.map((r) => r.id).sort()).toEqual(cyrillic.map((r) => r.id).sort());
  });

  it("пустой/отсутствующий запрос не фильтрует ничего", async () => {
    const all = await caller().list();
    const withEmptyQ = await caller().list({ q: "" });
    expect(withEmptyQ.length).toBe(all.length);
  });

  it("запрос без совпадений возвращает пустой список, а не ошибку", async () => {
    const results = await caller().list({ q: "несуществующийжкнигде" });
    expect(results).toEqual([]);
  });
});

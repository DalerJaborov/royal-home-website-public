import { describe, expect, it } from "vitest";
import { headForPath } from "./prerenderSeo";
import { SERVICE_SEO } from "@contracts/services-seo";

/**
 * SEO-голова страниц услуг.
 *
 * Разбор 09.08.2026 нашёл здесь две ошибки сразу. Ветка `/services/:slug` не
 * сверяла слаг ни с чем: любой мусор отдавался со статусом 200 и `index, follow`
 * (классический soft-404 — сервер обещает страницу, а человек видит «Услуга не
 * найдена»), и при этом ВСЕ страницы услуг получали один и тот же заголовок и
 * описание, то есть выглядели для поисковика дублями друг друга.
 *
 * Мета лежит в contracts/services-seo.ts — общем модуле сервера и клиента,
 * иначе заголовок в исходном HTML и заголовок после загрузки SPA разъезжаются.
 */

describe("Страницы услуг в пререндере", () => {
  it("реальная персональная страница избранного открывается с 200 и noindex", async () => {
    const head = await headForPath('/favorites');
    expect(head.status ?? 200).toBe(200);
    expect(head.noindex).toBe(true);
    expect(head.body).toContain('Избранное');
    expect(head.alternates).toEqual([]);
  });
  it("у каждой услуги свой заголовок и описание из общего справочника", async () => {
    const heads = await Promise.all(SERVICE_SEO.map((s) => headForPath(`/services/${s.slug}`)));

    for (const [i, head] of heads.entries()) {
      expect(head.title).toBe(SERVICE_SEO[i].metaTitle);
      expect(head.description).toBe(SERVICE_SEO[i].metaDesc);
      expect(head.noindex).toBeFalsy();
      expect(head.status ?? 200).toBe(200);
      expect(head.url).toBe(`https://royalhome.tj/services/${SERVICE_SEO[i].slug}`);
    }

    // Заголовки действительно РАЗНЫЕ — именно это и было сломано.
    expect(new Set(heads.map((h) => h.title)).size).toBe(SERVICE_SEO.length);
  });

  it("несуществующая услуга — 404 и noindex, а не «страница услуг»", async () => {
    for (const slug of ["nesushchestvuyushchaya", "buyout-x", "repair2"]) {
      const head = await headForPath(`/services/${slug}`);
      expect(head.status, `слаг ${slug}`).toBe(404);
      expect(head.noindex, `слаг ${slug}`).toBe(true);
    }
  });

  it("сам раздел /services остаётся обычной индексируемой страницей", async () => {
    const head = await headForPath("/services");
    expect(head.status ?? 200).toBe(200);
    expect(head.noindex).toBeFalsy();
    // И не совпадает ни с одной страницей конкретной услуги.
    expect(SERVICE_SEO.some((s) => s.metaTitle === head.title)).toBe(false);
  });
});

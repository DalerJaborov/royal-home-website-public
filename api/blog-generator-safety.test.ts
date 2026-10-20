import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./queries/connection", () => ({ isDbAvailable: () => false, getDb: () => null }));
vi.mock("./queries/listings", () => ({ findAllListings: vi.fn() }));
vi.mock("./queries/cms", () => ({ getCmsEntry: vi.fn() }));
vi.mock("./queries/articles", () => ({ createArticle: vi.fn(), findAllArticles: vi.fn(), findArticleById: vi.fn(), findLatestAiArticleDate: vi.fn(), findRecentArticleTitles: vi.fn(), findRecentCoverImageUrls: vi.fn(), slugExists: vi.fn(), updateArticle: vi.fn() }));
vi.mock("./lib/blog-cover", () => ({ inspectCatalogPhoto: vi.fn(), tryGenerateCoverImage: vi.fn() }));
vi.mock("./lib/market-news", () => ({ collectMarketNews: vi.fn() }));
vi.mock("./instagram-router", () => ({ getLiveReels: vi.fn() }));
import { findAllListings } from "./queries/listings";
import { getCmsEntry } from "./queries/cms";
import { createArticle, findRecentArticleTitles, findRecentCoverImageUrls, updateArticle } from "./queries/articles";
import { inspectCatalogPhoto, tryGenerateCoverImage } from "./lib/blog-cover";
import { collectMarketNews } from "./lib/market-news";
import { previewGeneratedArticle, validateGenerated } from "./blog-generator";
import { selectEditorialBrief } from "./lib/blog-editorial-policy";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCmsEntry).mockImplementation(async (key) => key === "geminiApiKey" ? "dummy-test-key" : key === "blogPosts" ? [] : undefined);
  vi.mocked(findAllListings).mockResolvedValue([{ id: 1, title: "Квартира", location: "Сино", category: "APARTMENT", price: 800000, area: 60, rooms: 2, type: "Новостройки", imageUrls: ["/uploads/photo.webp"] }] as unknown as Awaited<ReturnType<typeof findAllListings>>);
  vi.mocked(findRecentArticleTitles).mockResolvedValue([]);
  vi.mocked(findRecentCoverImageUrls).mockResolvedValue([]);
  vi.mocked(inspectCatalogPhoto).mockResolvedValue({ width: 1200, height: 800, entropy: 5 });
});

describe("Generator never publishes a rejected or preview article", () => {
  it("rejects banned content in an illustration prompt, not just the headline", () => {
    expect(() => validateGenerated({ title: "Полезная статья", imagePrompt: "mortgage loan office" }, "mock")).toThrow("Ипотечная");
    expect(createArticle).not.toHaveBeenCalled();
  });
  it("explicit preview uses one bounded model request and never writes or generates an image", async () => {
    const brief = selectEditorialBrief([]);
    const generated = { title: brief.title, slug: "osmotr-kvartiry", excerpt: "Проверка квартиры на просмотре", category: brief.category, metaTitle: "Проверка квартиры на просмотре", metaDescription: "Вопросы покупателя на просмотре", faq: [], keyFacts: [], takeaways: [], inlineImages: [],
      contentHtml: "<h2>Осмотр</h2><p>" + "Осмотрите окна и отметьте состояние отделки для обсуждения с продавцом. ".repeat(45) + "</p><h2>Проверка</h2><p>Осмотрите подъезд.</p><h2>Вопросы</h2><p>Уточните условия.</p>" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(generated) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await previewGeneratedArticle();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.generationConfig.maxOutputTokens).toBe(8000);
      expect(result.previewOnly).toBe(true);
      expect(createArticle).not.toHaveBeenCalled();
      expect(updateArticle).not.toHaveBeenCalled();
      expect(tryGenerateCoverImage).not.toHaveBeenCalled();
      expect(collectMarketNews).not.toHaveBeenCalled();
      expect(result.contentHtml).toContain("+992 44 650 14 14");
      expect(result.contentHtml).not.toContain('wa.me/');
      expect(result.contentHtml).toContain('tel:+992446501414');
    } finally { vi.unstubAllGlobals(); }
  });
});
